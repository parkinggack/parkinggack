import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHARE_ALPHABET } from '../src/store.js'
import { NOW, VECTOR_PAYLOAD, makeApp } from './helpers.js'

const HOUR = 3_600_000

describe('짧은 링크 (POST /v1/shares · GET /v1/shares/:code)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  // 서버 시계 = Date.now (가짜 타이머로 옮김)
  const app = (env: Record<string, string> = {}) => makeApp({ seed: false, now: () => Date.now(), env })

  it('201 → 코드·주소·만료(48시간), 읽으면 같은 payload', async () => {
    const t = await app({ PUBLIC_WEB_BASE: 'https://parkinggack.vercel.app/' })
    const { status, body, res } = await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD })
    expect(status).toBe(201)
    expect(body.code).toMatch(/^[a-z2-9]{6}$/)
    expect(body.code).not.toMatch(/[01oli]/)
    expect(body.url).toBe(`https://parkinggack.vercel.app/s/${body.code}`)
    expect(body.expiresAt).toBe(new Date(NOW + 48 * HOUR).toISOString())
    expect(res.headers.get('location')).toBe(`/v1/shares/${body.code}`)

    const got = await t.get(`/v1/shares/${body.code}`)
    expect(got.status).toBe(200)
    expect(got.body).toEqual({ payload: VECTOR_PAYLOAD, expiresAt: body.expiresAt })
    expect(JSON.stringify(got.body.payload)).toBe(JSON.stringify(VECTOR_PAYLOAD)) // 키 순서도 차량 앱과 같게
    expect(got.res.headers.get('cache-control')).toBe('no-store')
    // 대문자로 쳐도 열림
    expect((await t.get(`/v1/shares/${body.code.toUpperCase()}`)).status).toBe(200)
  })

  it('필수 키만 있어도 되고, 모르는 키는 버린다', async () => {
    const t = await app()
    const p = { v: 1, lot: '', f: '', z: '', n: '', t: 1 }
    const { body } = await t.send('POST', '/v1/shares', { payload: { ...p, extra: 'x' } })
    expect((await t.get(`/v1/shares/${body.code}`)).body.payload).toEqual(p)
  })

  it('48시간이 지나면 410, 내용은 지워짐', async () => {
    const t = await app()
    const { body } = await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD })
    vi.setSystemTime(NOW + 48 * HOUR - 1)
    expect((await t.get(`/v1/shares/${body.code}`)).status).toBe(200)
    vi.setSystemTime(NOW + 48 * HOUR)
    const gone = await t.get(`/v1/shares/${body.code}`)
    expect(gone.status).toBe(410)
    expect(gone.body).toEqual({ error: { code: 'gone', message: '링크가 만료됐어요 (48시간)' } })
    const row = (await t.store.one('SELECT payload FROM shares WHERE code = ?', [body.code]))!
    expect(row.payload).toBeNull()
  })

  it('주기 정리: 만료된 내용 지우기 → 410 유지, 30일 지나면 코드도 지움 → 404', async () => {
    const t = await app()
    const a = (await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD })).body.code
    vi.setSystemTime(NOW + 24 * HOUR)
    const b = (await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD })).body.code
    vi.setSystemTime(NOW + 49 * HOUR)
    expect(await t.store.cleanupShares()).toEqual({ expired: 1, purged: 0 })
    expect((await t.get(`/v1/shares/${a}`)).status).toBe(410)
    expect((await t.get(`/v1/shares/${b}`)).status).toBe(200)
    vi.setSystemTime(NOW + 48 * HOUR + 30 * 24 * HOUR + HOUR) // a 만료 + 30일 1시간, b 는 아직
    expect((await t.store.cleanupShares()).purged).toBe(1)
    expect((await t.get(`/v1/shares/${a}`)).status).toBe(404)
    expect((await t.get(`/v1/shares/${b}`)).status).toBe(410)
  })

  it('SHARE_TTL_HOURS 로 만료 시간 바꾸기', async () => {
    const t = await app({ SHARE_TTL_HOURS: '1' })
    const { body } = await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD })
    expect(body.expiresAt).toBe(new Date(NOW + HOUR).toISOString())
  })

  it('404: 없는 코드 · 형식이 틀린 코드', async () => {
    const t = await app()
    for (const code of ['abcdef', 'ab', 'abc0ef', 'abcdefghij', '%20']) {
      const { status, body } = await t.get(`/v1/shares/${code}`)
      expect(status, code).toBe(404)
      expect(body.error.code).toBe('not_found')
    }
  })

  it('코드는 헷갈리는 글자 없이 서로 다르게', async () => {
    const t = await app()
    expect(SHARE_ALPHABET).not.toMatch(/[01oli]/)
    expect(SHARE_ALPHABET).toHaveLength(31)
    const codes = new Set<string>()
    for (let i = 0; i < 200; i++) codes.add((await t.send('POST', '/v1/shares', { payload: VECTOR_PAYLOAD })).body.code)
    expect(codes.size).toBe(200)
  })

  const long = (n: number) => '가'.repeat(n)
  it.each([
    ['payload 없음', {}],
    ['v 0', { payload: { ...VECTOR_PAYLOAD, v: 0 } }],
    ['t 없음', { payload: { ...VECTOR_PAYLOAD, t: undefined } }],
    ['t 음수', { payload: { ...VECTOR_PAYLOAD, t: -5 } }],
    ['lot 61자', { payload: { ...VECTOR_PAYLOAD, lot: long(61) } }],
    ['층 13자', { payload: { ...VECTOR_PAYLOAD, f: long(13) } }],
    ['메모 81자', { payload: { ...VECTOR_PAYLOAD, m: long(81) } }],
    ['힌트 5줄', { payload: { ...VECTOR_PAYLOAD, h: ['a', 'b', 'c', 'd', 'e'] } }],
    ['힌트 한 줄 81자', { payload: { ...VECTOR_PAYLOAD, h: [long(81)] } }],
    ['경로 16개', { payload: { ...VECTOR_PAYLOAD, r: new Array(16).fill(1) } }],
    ['경로 소수', { payload: { ...VECTOR_PAYLOAD, r: [1, 1.5, -1] } }],
    ['z 숫자', { payload: { ...VECTOR_PAYLOAD, z: 4 } }],
  ])('400: %s', async (_n, body) => {
    const t = await app()
    const r = await t.send('POST', '/v1/shares', body)
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('bad_request')
  })

  it('한도 끝값은 받는다 (이름 60자 · 메모 80자 · 힌트 4줄 · 경로 15개)', async () => {
    const t = await app()
    const r = await t.send('POST', '/v1/shares', {
      payload: { ...VECTOR_PAYLOAD, lot: long(60), m: long(80), h: [long(80), 'b', 'c', 'd'], r: new Array(15).fill(1) },
    })
    expect(r.status).toBe(201)
  })
})
