import { describe, expect, it, vi } from 'vitest'
import { ApiError, buildQuery, createApiClient, type FetchLike } from './api'
import { normalizeBase } from './config'

type Call = { url: string; init: RequestInit }

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn: FetchLike = async (url, init = {}) => {
    const call = { url, init }
    calls.push(call)
    return respond(call)
  }
  return { fn, calls }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const headersOf = (c: Call) => new Headers(c.init.headers)

describe('api client', () => {
  it('어드민 호출에 Bearer 토큰과 Accept 헤더를 붙이고, 기본 주소 끝의 / 를 정리한다', async () => {
    const f = fakeFetch(() => json(200, { lots: [] }))
    const api = createApiClient({ baseUrl: 'http://localhost:8787///', getToken: () => 'secret-1', fetchImpl: f.fn })
    await api.listLots()
    expect(f.calls[0].url).toBe('http://localhost:8787/v1/admin/lots')
    expect(headersOf(f.calls[0]).get('Authorization')).toBe('Bearer secret-1')
    expect(headersOf(f.calls[0]).get('Accept')).toBe('application/json')
    expect(headersOf(f.calls[0]).get('Content-Type')).toBeNull()
  })

  it('토큰이 없으면 Authorization 헤더를 보내지 않는다', async () => {
    const f = fakeFetch(() => json(200, { ok: true, version: '1' }))
    const api = createApiClient({ baseUrl: 'http://x', getToken: () => null, fetchImpl: f.fn })
    await api.health()
    expect(headersOf(f.calls[0]).has('Authorization')).toBe(false)
  })

  it('쿼리·경로를 인코딩하고 본문은 JSON으로 보낸다', async () => {
    const f = fakeFetch((c) => (c.init.method === 'PUT' ? json(200, { lot: { id: 'a b' } }) : json(200, { lots: [], records: [] })))
    const api = createApiClient({ baseUrl: 'http://x', getToken: () => 't', fetchImpl: f.fn })
    await api.listLots('현대 백화점')
    await api.lotRecords('a/b', 300)
    await api.updateLot('a b', { name: '새 이름', floors: ['1F', 'B1'] })
    expect(f.calls[0].url).toBe('http://x/v1/admin/lots?q=%ED%98%84%EB%8C%80+%EB%B0%B1%ED%99%94%EC%A0%90')
    expect(f.calls[1].url).toBe('http://x/v1/admin/lots/a%2Fb/records?limit=300')
    expect(f.calls[2].url).toBe('http://x/v1/admin/lots/a%20b')
    expect(f.calls[2].init.method).toBe('PUT')
    expect(headersOf(f.calls[2]).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(f.calls[2].init.body as string)).toEqual({ name: '새 이름', floors: ['1F', 'B1'] })
  })

  it('빈 q 는 쿼리에서 뺀다', () => {
    expect(buildQuery({ q: '', limit: undefined })).toBe('')
    expect(buildQuery({ q: 'a', limit: 3 })).toBe('?q=a&limit=3')
  })

  it('204 응답(삭제)은 undefined', async () => {
    const f = fakeFetch(() => new Response(null, { status: 204 }))
    const api = createApiClient({ baseUrl: 'http://x', getToken: () => 't', fetchImpl: f.fn })
    await expect(api.deleteLot('x')).resolves.toBeUndefined()
    expect(f.calls[0].init.method).toBe('DELETE')
  })

  it('POST /v1/admin/recompute 는 본문 없이 보낸다', async () => {
    const f = fakeFetch(() => json(200, { lots: 49 }))
    const api = createApiClient({ baseUrl: 'http://x', getToken: () => 't', fetchImpl: f.fn })
    await expect(api.recompute()).resolves.toEqual({ lots: 49 })
    expect(f.calls[0].init.method).toBe('POST')
    expect(f.calls[0].init.body).toBeUndefined()
  })

  it('401이면 onUnauthorized(로그아웃)를 부르고 ApiError(unauthorized)를 던진다', async () => {
    const onUnauthorized = vi.fn()
    const f = fakeFetch(() => json(401, { error: { code: 'unauthorized', message: '토큰이 틀렸어요' } }))
    const api = createApiClient({ baseUrl: 'http://x', getToken: () => 'old', onUnauthorized, fetchImpl: f.fn })
    const err = await api.overview().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 401, code: 'unauthorized', message: '토큰이 틀렸어요' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('401 본문이 JSON이 아니어도 로그아웃하고 기본 문구를 쓴다', async () => {
    const onUnauthorized = vi.fn()
    const f = fakeFetch(() => new Response('nope', { status: 401 }))
    const api = createApiClient({ baseUrl: 'http://x', getToken: () => 'old', onUnauthorized, fetchImpl: f.fn })
    await expect(api.listLots()).rejects.toMatchObject({ code: 'unauthorized' })
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('서버 에러 본문의 code·message 를 그대로 쓴다 (409 conflict, 400 bad_request)', async () => {
    const f = fakeFetch((c) =>
      c.init.method === 'POST'
        ? json(409, { error: { code: 'conflict', message: 'id "a" 가 이미 있어요' } })
        : json(400, { error: { code: 'bad_request', message: 'floors가 비었어요' } }),
    )
    const onUnauthorized = vi.fn()
    const api = createApiClient({ baseUrl: 'http://x', getToken: () => 't', onUnauthorized, fetchImpl: f.fn })
    await expect(api.createLot({ id: 'a', name: 'A', location: { lat: 37, lng: 127 }, floors: ['1F'] }))
      .rejects.toMatchObject({ status: 409, code: 'conflict', message: 'id "a" 가 이미 있어요' })
    await expect(api.updateLot('a', { floors: [] })).rejects.toMatchObject({ status: 400, code: 'bad_request' })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('모르는 code·HTML 본문이면 상태 코드로 정한다', async () => {
    const f = fakeFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }))
    const api = createApiClient({ baseUrl: 'http://x', getToken: () => 't', fetchImpl: f.fn })
    await expect(api.overview()).rejects.toMatchObject({ status: 502, code: 'internal' })
  })

  it('네트워크 오류(서버 꺼짐·CORS 거부)는 code=network 와 서버 주소', async () => {
    const api = createApiClient({
      baseUrl: 'http://localhost:8787',
      getToken: () => 't',
      fetchImpl: async () => { throw new TypeError('Failed to fetch') },
    })
    await expect(api.overview()).rejects.toMatchObject({ status: 0, code: 'network' })
    await expect(api.overview()).rejects.toThrow(/localhost:8787/)
  })

  it('JSON이 아닌 200 응답은 ApiError(unknown)', async () => {
    const f = fakeFetch(() => new Response('not json', { status: 200 }))
    const api = createApiClient({ baseUrl: 'http://x', getToken: () => 't', fetchImpl: f.fn })
    await expect(api.overview()).rejects.toMatchObject({ code: 'unknown' })
  })

  it('getToken 은 호출할 때마다 읽는다 (로그인 뒤 바뀐 토큰 반영)', async () => {
    let token = 'a'
    const f = fakeFetch(() => json(200, { lots: [] }))
    const api = createApiClient({ baseUrl: 'http://x', getToken: () => token, fetchImpl: f.fn })
    await api.listLots()
    token = 'b'
    await api.listLots()
    expect(f.calls.map((c) => headersOf(c).get('Authorization'))).toEqual(['Bearer a', 'Bearer b'])
  })
})

describe('config', () => {
  it('VITE_API_BASE 정리: 비면 기본값, 끝 / 제거', () => {
    expect(normalizeBase(undefined)).toBe('http://localhost:8787')
    expect(normalizeBase('  ')).toBe('http://localhost:8787')
    expect(normalizeBase('https://api.example.com/')).toBe('https://api.example.com')
  })
})
