import { describe, expect, it, vi } from 'vitest'
import { ApiError, createHttpApi, errorText } from './client'

type Call = { url: string; init: RequestInit }

function fakeFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    return respond(url, init)
  })
  return { fn, calls }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const header = (c: Call, name: string) => (c.init.headers as Record<string, string>)[name]

describe('인증 헤더', () => {
  it('내 데이터(/v1/me/*)는 Authorization: Device <token>', async () => {
    const f = fakeFetch(() => json({ parking: null }))
    const api = createHttpApi({ base: 'https://api.example.com/', token: () => 'tok123', fetch: f.fn, online: () => true })
    await api.currentParking()
    await api.stats().catch(() => undefined)
    expect(f.calls[0].url).toBe('https://api.example.com/v1/me/parkings/current')
    expect(header(f.calls[0], 'Authorization')).toBe('Device tok123')
    expect(f.calls[0].init.method).toBe('GET')
    expect(f.calls[0].init.credentials).toBe('omit')
  })

  it('토큰이 없으면 헤더도 없음', async () => {
    const f = fakeFetch(() => json({ parking: null }))
    const api = createHttpApi({ base: 'http://x', token: () => null, fetch: f.fn, online: () => true })
    await api.currentParking()
    expect(header(f.calls[0], 'Authorization')).toBeUndefined()
  })

  it('페어링 claim·공개 API는 토큰을 보내지 않음 (claim이 토큰을 준다)', async () => {
    const f = fakeFetch((url) =>
      url.includes('/claim') ? json({ token: 'new', car: { deviceId: 'c1', name: null, pairedAt: '2026-11-03T00:00:00Z' } }) : json({ lots: [] }),
    )
    const api = createHttpApi({ base: 'http://x', token: () => 'old', fetch: f.fn, online: () => true })
    const res = await api.claimPairing('483920', 'iPhone')
    expect(res.token).toBe('new')
    expect(f.calls[0].url).toBe('http://x/v1/pairings/483920/claim')
    expect(f.calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(f.calls[0].init.body))).toEqual({ phoneName: 'iPhone' })
    expect(header(f.calls[0], 'Authorization')).toBeUndefined()
    expect(header(f.calls[0], 'Content-Type')).toBe('application/json')
    await api.lots({ lat: 37.3947, lng: 127.1112, radius: 1000 })
    expect(f.calls[1].url).toBe('http://x/v1/lots?lat=37.3947&lng=127.1112&radius=1000')
    expect(header(f.calls[1], 'Authorization')).toBeUndefined()
  })
})

describe('경로·쿼리', () => {
  it('목록 페이지·찾음·연결 끊기·짧은 링크', async () => {
    const f = fakeFetch((url, init) => {
      if (init.method === 'DELETE') return new Response(null, { status: 204 })
      if (url.includes('/found')) return json({ parking: { id: 'a b' } })
      if (url.includes('/shares/')) return json({ payload: { v: 1 }, expiresAt: 'x' })
      return json({ parkings: [], nextBefore: null })
    })
    const api = createHttpApi({ base: 'http://x', token: () => 't', fetch: f.fn, online: () => true })
    await api.parkings({ limit: 50, before: '2026-11-01T00:00:00.000Z' })
    expect(f.calls[0].url).toBe('http://x/v1/me/parkings?limit=50&before=2026-11-01T00%3A00%3A00.000Z')
    expect((await api.found('a b')).id).toBe('a b')
    expect(f.calls[1].url).toBe('http://x/v1/me/parkings/a%20b/found')
    await expect(api.unpair()).resolves.toBeUndefined()
    expect(f.calls[2].init.method).toBe('DELETE')
    expect(f.calls[2].url).toBe('http://x/v1/me')
    await api.share('k7m2qp')
    expect(f.calls[3].url).toBe('http://x/v1/shares/k7m2qp')
    await api.easier('hyundai-pangyo', { radius: 800 })
    expect(f.calls[4].url).toBe('http://x/v1/lots/hyundai-pangyo/easier?max=3&radius=800')
  })
})

describe('v1.2 주차왕', () => {
  const me = { joined: true, nickname: '판교 느긋한 수달', league: null, week: { start: 'a', end: 'b' }, rank: 12, total: 148, percentile: 9, score: null, prevWeekRank: 17, nextHint: null, parkings: [] }

  it('경로·메서드·인증: 닉네임(인증 없음) · 참여 · 그만두기 · 내 점수 · 순위판 · 지난주 결과', async () => {
    const f = fakeFetch((url, init) => {
      if (url.includes('/v1/king/nickname')) return json({ nickname: '판교 느긋한 수달' })
      if (url.endsWith('/v1/me/king/join')) return json({ me })
      if (init.method === 'DELETE') return new Response(null, { status: 204 })
      if (url.endsWith('/v1/me/king/board')) return json({ league: {}, week: {}, total: 148, top: [], around: [], demo: true })
      if (url.endsWith('/v1/me/king/results/last')) return json({ rank: 9 })
      return json(me)
    })
    const api = createHttpApi({ base: 'http://x', token: () => 'tok', fetch: f.fn, online: () => true })
    expect(await api.kingNickname('pangyo')).toBe('판교 느긋한 수달')
    expect(f.calls[0].url).toBe('http://x/v1/king/nickname?region=pangyo')
    expect(header(f.calls[0], 'Authorization')).toBeUndefined()
    expect((await api.kingJoin({ nickname: '판교 느긋한 수달', region: 'pangyo' })).rank).toBe(12)
    expect(f.calls[1].url).toBe('http://x/v1/me/king/join')
    expect(f.calls[1].init.method).toBe('POST')
    expect(JSON.parse(String(f.calls[1].init.body))).toEqual({ nickname: '판교 느긋한 수달', region: 'pangyo' })
    expect(header(f.calls[1], 'Authorization')).toBe('Device tok')
    await expect(api.kingLeave()).resolves.toBeUndefined()
    expect(f.calls[2].init.method).toBe('DELETE')
    expect(f.calls[2].url).toBe('http://x/v1/me/king')
    expect((await api.kingMe()).nickname).toBe('판교 느긋한 수달')
    expect(f.calls[3].url).toBe('http://x/v1/me/king')
    expect((await api.kingBoard()).total).toBe(148)
    expect(f.calls[4].url).toBe('http://x/v1/me/king/board')
    expect((await api.kingResultLast())?.rank).toBe(9)
    expect(f.calls[5].url).toBe('http://x/v1/me/king/results/last')
    expect(header(f.calls[5], 'Authorization')).toBe('Device tok')
    await api.kingNickname()
    expect(f.calls[6].url).toBe('http://x/v1/king/nickname')
  })

  it('지난주 결과가 없으면(404) null, 다른 오류는 그대로', async () => {
    const api = createHttpApi({ base: 'http://x', token: () => 't', fetch: fakeFetch(() => json({ error: { code: 'not_found', message: '' } }, 404)).fn, online: () => true })
    expect(await api.kingResultLast()).toBeNull()
    const api2 = createHttpApi({ base: 'http://x', token: () => 't', fetch: fakeFetch(() => json({ error: { code: 'unauthorized', message: '' } }, 401)).fn, online: () => true })
    expect((await api2.kingResultLast().catch((e) => e)).code).toBe('unauthorized')
  })

  it('참여 응답: 계약의 { me } 와 예전 모양(그대로) 둘 다, 이상하면 bad_response', async () => {
    const api = createHttpApi({ base: 'http://x', token: () => 't', fetch: fakeFetch(() => json(me)).fn, online: () => true })
    expect((await api.kingJoin({ nickname: 'a' })).joined).toBe(true)
    const api2 = createHttpApi({ base: 'http://x', token: () => 't', fetch: fakeFetch(() => json({ ok: 1 })).fn, online: () => true })
    expect((await api2.kingJoin({ nickname: 'a' }).catch((e) => e)).code).toBe('bad_response')
    const api3 = createHttpApi({ base: 'http://x', token: () => null, fetch: fakeFetch(() => json({})).fn, online: () => true })
    expect((await api3.kingNickname().catch((e) => e)).code).toBe('bad_response')
  })
})

describe('오류', () => {
  it('서버 오류 {error:{code,message}} → ApiError(status, code)', async () => {
    const f = fakeFetch(() => json({ error: { code: 'gone', message: '만료' } }, 410))
    const api = createHttpApi({ base: 'http://x', token: () => null, fetch: f.fn, online: () => true })
    const err = await api.claimPairing('483920').catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(410)
    expect(err.code).toBe('gone')
    expect(err.offline).toBe(false)
  })

  it('본문이 없거나 JSON이 아닌 오류는 상태 코드로', async () => {
    const f = fakeFetch(() => new Response('<html>nope</html>', { status: 404 }))
    const api = createHttpApi({ base: 'http://x', token: () => null, fetch: f.fn, online: () => true })
    const err = await api.lot('none').catch((e) => e)
    expect(err.code).toBe('not_found')
    const f2 = fakeFetch(() => new Response('', { status: 401 }))
    const api2 = createHttpApi({ base: 'http://x', token: () => 't', fetch: f2.fn, online: () => true })
    expect((await api2.me().catch((e) => e)).code).toBe('unauthorized')
  })

  it('200인데 JSON이 아니면 bad_response', async () => {
    const f = fakeFetch(() => new Response('not json', { status: 200 }))
    const api = createHttpApi({ base: 'http://x', token: () => null, fetch: f.fn, online: () => true })
    expect((await api.lots().catch((e) => e)).code).toBe('bad_response')
  })
})

describe('오프라인', () => {
  it('네트워크가 끊기면(fetch가 던지면) offline', async () => {
    const f = fakeFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    const api = createHttpApi({ base: 'http://x', token: () => 't', fetch: f.fn, online: () => true })
    const err = await api.currentParking().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.offline).toBe(true)
    expect(errorText(err)).toBe('인터넷에 연결되면 다시 불러올게요')
  })

  it('navigator.onLine=false 면 요청하지 않고 바로 offline', async () => {
    const f = fakeFetch(() => json({}))
    const api = createHttpApi({ base: 'http://x', token: () => 't', fetch: f.fn, online: () => false })
    expect((await api.stats().catch((e) => e)).offline).toBe(true)
    expect(f.fn).not.toHaveBeenCalled()
  })

  it('시간 초과는 offline (AbortController)', async () => {
    vi.useFakeTimers()
    try {
      const f = fakeFetch(
        (_url, init) =>
          new Promise<Response>((_res, rej) => {
            init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
          }),
      )
      const api = createHttpApi({ base: 'http://x', token: () => 't', fetch: f.fn, online: () => true, timeoutMs: 1000 })
      const p = api.currentParking().catch((e) => e)
      await vi.advanceTimersByTimeAsync(1001)
      expect((await p).offline).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('웹 푸시 키', () => {
  it('키가 있으면 문자열, 404(서버에 키 없음)면 null — 알림은 폴링으로', async () => {
    const ok = createHttpApi({ base: 'http://x', token: () => 't', fetch: fakeFetch(() => json({ publicKey: 'BKey' })).fn, online: () => true })
    expect(await ok.pushKey()).toBe('BKey')
    const none = createHttpApi({ base: 'http://x', token: () => 't', fetch: fakeFetch(() => json({ error: { code: 'not_found', message: '' } }, 404)).fn, online: () => true })
    expect(await none.pushKey()).toBeNull()
  })

  it('오프라인이면 던져서 알 수 있게', async () => {
    const off = createHttpApi({ base: 'http://x', token: () => 't', fetch: fakeFetch(() => Promise.reject(new TypeError('x'))).fn, online: () => true })
    expect((await off.pushKey().catch((e) => e)).offline).toBe(true)
  })

  it('구독은 POST /v1/me/push, 끊기는 DELETE', async () => {
    const f = fakeFetch(() => new Response(null, { status: 204 }))
    const api = createHttpApi({ base: 'http://x', token: () => 't', fetch: f.fn, online: () => true })
    await api.pushSubscribe({ endpoint: 'https://push.example/1', keys: { p256dh: 'a', auth: 'b' } })
    await api.pushUnsubscribe()
    expect(f.calls.map((c) => [c.init.method, c.url])).toEqual([
      ['POST', 'http://x/v1/me/push'],
      ['DELETE', 'http://x/v1/me/push'],
    ])
    expect(header(f.calls[0], 'Authorization')).toBe('Device t')
  })
})
