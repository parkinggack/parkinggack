import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { MIN_SAMPLES as CONTRACT_MIN_SAMPLES } from '@parkinggack/api-types'
import { TokenBucketLimiter } from '../src/ratelimit.js'
import { MIN_SAMPLES } from '../src/scoring.js'
import { VERSION } from '../src/version.js'
import { ADMIN, VECTOR_PAYLOAD, makeApp, record, type TestApp } from './helpers.js'

describe('GET /health', () => {
  it('{ ok, version } — version 은 package.json 과 같다', async () => {
    const t = await makeApp({ seed: false })
    const { status, body } = await t.get('/health')
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, version: VERSION })
    expect(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version).toBe(VERSION)
  })
})

describe('계약', () => {
  it('MIN_SAMPLES 는 packages/api-types 와 같다', () => {
    expect(MIN_SAMPLES).toBe(CONTRACT_MIN_SAMPLES)
  })
})

describe('에러 모양', () => {
  let t: TestApp
  beforeAll(async () => {
    t = await makeApp({ seed: false })
  })
  it('없는 주소 → 404 not_found JSON', async () => {
    const { status, body, res } = await t.get('/v2/nothing')
    expect(status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(body).toEqual({ error: { code: 'not_found', message: expect.stringContaining('/v2/nothing') } })
  })

  it('본문이 16KB 넘으면 413 (code bad_request)', async () => {
    const big = { payload: { ...VECTOR_PAYLOAD, m: 'x'.repeat(20_000) } }
    const { status, body } = await t.send('POST', '/v1/shares', big)
    expect(status).toBe(413)
    expect(body.error.code).toBe('bad_request')
  })

  it('처리 중 예외 → 500 internal (내부 메시지는 숨김)', async () => {
    const t2 = await makeApp({ seed: false })
    t2.store.allLots = async () => {
      throw new Error('secret detail')
    }
    const err = console.error
    console.error = () => {}
    try {
      const { status, body } = await t2.get('/v1/lots')
      expect(status).toBe(500)
      expect(body.error.code).toBe('internal')
      expect(body.error.message).not.toContain('secret')
    } finally {
      console.error = err
    }
  })
})

describe('CORS', () => {
  let t: TestApp
  beforeAll(async () => {
    t = await makeApp()
  })
  const WEB = { Origin: 'https://parkinggack.vercel.app' }

  it('공개 GET·POST·에러 응답: *', async () => {
    expect((await t.get('/v1/lots?limit=1', WEB)).res.headers.get('access-control-allow-origin')).toBe('*')
    expect((await t.get('/health', WEB)).res.headers.get('access-control-allow-origin')).toBe('*')
    expect((await t.get('/v1/lots/nope', WEB)).res.headers.get('access-control-allow-origin')).toBe('*')
    expect((await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD }, WEB)).res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('공개 POST 사전 요청(preflight)', async () => {
    const res = await t.app.request('/v1/shares', {
      method: 'OPTIONS',
      headers: { ...WEB, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('content-type')
  })

  it('어드민: ADMIN_ORIGINS 에 있는 곳만 (기본 localhost:5174, 5173)', async () => {
    for (const origin of ['http://localhost:5174', 'http://localhost:5173']) {
      const { res } = await t.get('/v1/admin/overview', { ...ADMIN, Origin: origin })
      expect(res.headers.get('access-control-allow-origin')).toBe(origin)
      expect(res.headers.get('vary')).toContain('Origin')
    }
    const evil = await t.get('/v1/admin/overview', { ...ADMIN, Origin: 'https://evil.example' })
    expect(evil.res.headers.get('access-control-allow-origin')).toBeNull()
    // 어드민 401 에러도 허용 출처에는 CORS 헤더가 붙는다 (브라우저가 401을 읽을 수 있게)
    const unauth = await t.get('/v1/admin/overview', { Origin: 'http://localhost:5174' })
    expect(unauth.status).toBe(401)
    expect(unauth.res.headers.get('access-control-allow-origin')).toBe('http://localhost:5174')
  })

  it('어드민 사전 요청은 토큰 없이 204, Authorization 허용', async () => {
    const res = await t.app.request('/v1/admin/lots/x', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5174', 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5174')
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT')
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization')
    const bad = await t.app.request('/v1/admin/lots', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
    })
    expect(bad.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('ADMIN_ORIGINS 환경변수', async () => {
    const t2 = await makeApp({ seed: false, env: { ADMIN_ORIGINS: 'https://admin.parkinggack.app' } })
    expect((await t2.get('/v1/admin/overview', { ...ADMIN, Origin: 'https://admin.parkinggack.app' })).res.headers.get('access-control-allow-origin')).toBe(
      'https://admin.parkinggack.app',
    )
    expect((await t2.get('/v1/admin/overview', { ...ADMIN, Origin: 'http://localhost:5174' })).res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('레이트 리밋 (공개 POST, IP당 분당 60)', () => {
  const limited = () => makeApp({ env: { RATE_LIMIT_PER_MIN: '60', TRUST_PROXY: '1' } })
  const ip = (a: string) => ({ 'X-Forwarded-For': a })

  it('61번째는 429 + Retry-After, 다른 IP는 따로, 1초 지나면 하나 더', async () => {
    const t = await limited()
    for (let i = 0; i < 60; i++) {
      const r = await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD }, ip('203.0.113.7'))
      expect(r.status, `#${i + 1}`).toBe(201)
    }
    const over = await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD }, ip('203.0.113.7'))
    expect(over.status).toBe(429)
    expect(over.body).toEqual({ error: { code: 'rate_limited', message: expect.any(String) } })
    expect(over.res.headers.get('retry-after')).toBe('1')
    expect(over.res.headers.get('access-control-allow-origin')).toBe('*')
    // 기록·별점도 같은 버킷
    expect((await t.send('POST', '/v1/records', record(), ip('203.0.113.7'))).status).toBe(429)
    expect((await t.send('POST', '/v1/lots/pangyo-new/ratings', { clientRatingId: 'rl-rate-0001', stars: 3 }, ip('203.0.113.7'))).status).toBe(429)
    // 다른 IP
    expect((await t.send('POST', '/v1/records', record(), ip('198.51.100.1'))).status).toBe(202)
    // 프록시가 붙인 마지막 주소를 본다 (앞쪽은 클라이언트가 꾸밀 수 있음)
    expect((await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD }, ip('1.2.3.4, 203.0.113.7'))).status).toBe(429)
    // GET 은 제한 없음
    expect((await t.get('/v1/lots?limit=1', ip('203.0.113.7'))).status).toBe(200)
    // 1초 = 토큰 1개
    t.clock.t += 1000
    expect((await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD }, ip('203.0.113.7'))).status).toBe(201)
    expect((await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD }, ip('203.0.113.7'))).status).toBe(429)
    // 1분이면 다시 가득
    t.clock.t += 60_000
    for (let i = 0; i < 60; i++) expect((await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD }, ip('203.0.113.7'))).status).toBe(201)
  })

  it('어드민 POST 는 제한 없음', async () => {
    const t = await limited()
    for (let i = 0; i < 65; i++) expect((await t.send('POST', '/v1/admin/recompute', undefined, { ...ADMIN, ...ip('203.0.113.9') })).status).toBe(200)
  })

  it('TokenBucketLimiter: 다 찬 버킷은 정리', () => {
    let now = 0
    const l = new TokenBucketLimiter(2, () => now)
    expect(l.take('a').ok).toBe(true)
    expect(l.take('a').ok).toBe(true)
    const r = l.take('a')
    expect(r).toEqual({ ok: false, retryAfterSec: 30, remaining: 0 })
    expect(l.size).toBe(1)
    now += 59_000
    expect(l.sweep()).toBe(0)
    now += 1_000
    expect(l.sweep()).toBe(1)
    expect(l.size).toBe(0)
  })
})
