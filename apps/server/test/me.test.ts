import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import webpush from 'web-push'
import { monthBefore, monthKey } from '../src/me-store.js'
import { createPushSender, noPush } from '../src/push.js'
import { NOW, fakePush, makeApp, type TestApp } from './helpers.js'

const dev = (token: string) => ({ Authorization: `Device ${token}` })
const MIN = 60_000
const DAY = 86_400_000

async function register(t: TestApp, kind: 'car' | 'phone', name: string | null = null) {
  const r = await t.send('POST', '/v1/devices', { kind, name })
  expect(r.status).toBe(201)
  return r.body as { deviceId: string; token: string }
}

/** 차 등록 → 페어링 → 폰 연결까지 */
async function pairedCar(t: TestApp, carName = '그랜저', phoneName = '갤럭시 S25') {
  const car = await register(t, 'car', carName)
  const p = await t.send('POST', '/v1/pairings', {}, dev(car.token))
  const claim = await t.send('POST', `/v1/pairings/${p.body.code}/claim`, { phoneName })
  expect(claim.status).toBe(200)
  return { car, phoneToken: claim.body.token as string, code: p.body.code as string }
}

/** 차량 앱 MyParkingSync.input 과 같은 모양 */
function input(over: Record<string, unknown> = {}) {
  return {
    lotId: 'avenue-france-pangyo',
    lotName: '아브뉴프랑 판교 주차장',
    floor: 'B2',
    zone: 'D',
    number: '07',
    note: null,
    parkedAt: new Date(NOW - 30 * MIN).toISOString(),
    summary: { reverseCount: 2, steeringTurns: 3, durationSec: 100, rampTurns: 2.1, shape: 'PERPENDICULAR', approximate: false },
    hints: ['램프를 다 내려와서 곧장', '오른쪽 칸 줄, 약 15m 지점'],
    route: [1, 17, -1],
    path: [
      [0, 0, 0, 0, 0],
      [1000, 1.5, 2, 0.1, 0],
      [2000, 3, 4, 0.2, 1],
    ],
    ...over,
  }
}

describe('POST /v1/devices', () => {
  it('201 { deviceId, token }, 서버에는 토큰의 SHA-256 만', async () => {
    const t = await makeApp({ seed: false })
    const car = await register(t, 'car', '그랜저')
    expect(car.deviceId).toMatch(/^[0-9a-f-]{36}$/)
    expect(car.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const row = await t.store.one('SELECT * FROM devices WHERE id = ?', [car.deviceId])
    expect(row).toMatchObject({ kind: 'car', name: '그랜저', token_hash: createHash('sha256').update(car.token).digest('hex') })
    expect(JSON.stringify(row)).not.toContain(car.token)
    expect((await register(t, 'phone')).token).not.toBe(car.token)
  })

  it.each([
    ['kind 없음', {}],
    ['kind 잘못', { kind: 'tablet' }],
    ['이름 41자', { kind: 'car', name: 'x'.repeat(41) }],
    ['제어 문자', { kind: 'car', name: 'a\u0007b' }],
  ])('400: %s', async (_n, body) => {
    const t = await makeApp({ seed: false })
    expect((await t.send('POST', '/v1/devices', body)).status).toBe(400)
  })
})

describe('페어링 (차 C-10 ↔ 폰 M-13)', () => {
  it('차가 코드를 만들고 → 폰이 연결 → 차가 claimed 를 본다 (차량 앱 PairingSyncTest 와 같은 요청)', async () => {
    const t = await makeApp({ seed: false, env: { PUBLIC_WEB_BASE: 'https://parkinggack.vercel.app' } })
    const car = await register(t, 'car', '그랜저')
    const p = await t.send('POST', '/v1/pairings', {}, dev(car.token))
    expect(p.status).toBe(201)
    expect(p.body.code).toMatch(/^\d{6}$/)
    expect(p.body.url).toBe(`https://parkinggack.vercel.app/pair/${p.body.code}`)
    expect(p.body.expiresAt).toBe(new Date(NOW + 10 * MIN).toISOString())
    expect((await t.get(`/v1/pairings/${p.body.code}`, dev(car.token))).body).toEqual({ status: 'pending', phoneName: null })

    const claim = await t.send('POST', `/v1/pairings/${p.body.code}/claim`, { phoneName: '갤럭시 S25' })
    expect(claim.status).toBe(200)
    expect(claim.body).toEqual({ token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), car: { deviceId: car.deviceId, name: '그랜저', pairedAt: new Date(NOW).toISOString() } })
    expect((await t.get(`/v1/pairings/${p.body.code}`, dev(car.token))).body).toEqual({ status: 'claimed', phoneName: '갤럭시 S25' })

    expect((await t.get('/v1/me', dev(claim.body.token))).body).toEqual({ kind: 'phone', car: claim.body.car, phones: 1, settings: { shareAnonymous: true, experience: 'UNKNOWN' } })
    expect((await t.get('/v1/me', dev(car.token))).body).toEqual({ kind: 'car', car: null, phones: 1, settings: { shareAnonymous: true, experience: 'UNKNOWN' } })
    // 같은 코드로 또 → 410
    const again = await t.send('POST', `/v1/pairings/${p.body.code}/claim`, {})
    expect(again.status).toBe(410)
    expect(again.body.error.code).toBe('gone')
  })

  it('본문 없이도 (POST /v1/pairings, claim)', async () => {
    const t = await makeApp({ seed: false })
    const car = await register(t, 'car')
    const p = await t.app.request('/v1/pairings', { method: 'POST', headers: dev(car.token) })
    expect(p.status).toBe(201)
    const code = ((await p.json()) as { code: string }).code
    const claim = await t.app.request(`/v1/pairings/${code}/claim`, { method: 'POST' })
    expect(claim.status).toBe(200)
    expect(((await claim.json()) as { car: { name: string | null } }).car.name).toBeNull()
  })

  it('10분이 지나면 expired / 410', async () => {
    const t = await makeApp({ seed: false })
    const car = await register(t, 'car')
    const { code } = (await t.send('POST', '/v1/pairings', {}, dev(car.token))).body
    t.clock.t += 10 * MIN
    expect((await t.get(`/v1/pairings/${code}`, dev(car.token))).body).toEqual({ status: 'expired', phoneName: null })
    const c = await t.send('POST', `/v1/pairings/${code}/claim`, {})
    expect(c.status).toBe(410)
    expect(c.body.error.message).toContain('만료')
  })

  it('다른 차의 코드는 404, 인증 없음·모르는 토큰·폰 토큰은 401', async () => {
    const t = await makeApp({ seed: false })
    const a = await register(t, 'car')
    const b = await register(t, 'car')
    const phone = await register(t, 'phone')
    const { code } = (await t.send('POST', '/v1/pairings', {}, dev(a.token))).body
    expect((await t.get(`/v1/pairings/${code}`, dev(b.token))).status).toBe(404)
    expect((await t.get('/v1/pairings/abc', dev(a.token))).status).toBe(404)
    const none = await t.send('POST', '/v1/pairings', {})
    expect(none.status).toBe(401)
    expect(none.res.headers.get('www-authenticate')).toBe('Device')
    expect((await t.send('POST', '/v1/pairings', {}, dev('not-a-real-token'))).status).toBe(401)
    expect((await t.send('POST', '/v1/pairings', {}, { Authorization: `Bearer ${a.token}` })).status).toBe(401)
    expect((await t.send('POST', '/v1/pairings', {}, dev(phone.token))).status).toBe(401)
  })

  it('없는 코드·형식이 틀린 코드 → 404', async () => {
    const t = await makeApp({ seed: false })
    expect((await t.send('POST', '/v1/pairings/123456/claim', {})).status).toBe(404)
    expect((await t.send('POST', '/v1/pairings/12ab56/claim', {})).status).toBe(404)
    expect((await t.send('POST', '/v1/pairings/123456/claim', { phoneName: 'x'.repeat(41) })).status).toBe(400)
  })

  it('6자리 무차별 대입 막기: IP당 틀린 시도 분당 10번 → 429 (맞는 코드도), 다른 IP 는 따로, 1분 뒤 풀림', async () => {
    const t = await makeApp({ seed: false, env: { CLAIM_FAILURES_PER_MIN: '10', TRUST_PROXY: '1' } })
    const car = await register(t, 'car')
    const { code } = (await t.send('POST', '/v1/pairings', {}, dev(car.token))).body
    const ip = (a: string) => ({ 'X-Forwarded-For': a })
    let wrong = 0
    for (let i = 0; i < 10; i++) {
      const guess = String((Number(code) + 1 + i) % 1_000_000).padStart(6, '0')
      expect((await t.send('POST', `/v1/pairings/${guess}/claim`, {}, ip('203.0.113.5'))).status).toBe(404)
      wrong++
    }
    expect(wrong).toBe(10)
    const blocked = await t.send('POST', `/v1/pairings/${code}/claim`, {}, ip('203.0.113.5'))
    expect(blocked.status).toBe(429)
    expect(Number(blocked.res.headers.get('retry-after'))).toBeGreaterThan(0)
    // 성공한 시도는 세지 않음 · 다른 IP 는 그대로
    expect((await t.send('POST', `/v1/pairings/${code}/claim`, {}, ip('198.51.100.9'))).status).toBe(200)
    t.clock.t += MIN
    expect((await t.send('POST', '/v1/pairings/000000/claim', {}, ip('203.0.113.5'))).status).toBe(404)
  })

  it('DELETE /v1/me: 폰은 연결 끊기(토큰 폐기), 차는 연결된 폰 모두 끊기', async () => {
    const t = await makeApp({ seed: false })
    const { car, phoneToken } = await pairedCar(t)
    expect((await t.send('DELETE', '/v1/me', undefined, dev(phoneToken))).status).toBe(204)
    expect((await t.get('/v1/me', dev(phoneToken))).status).toBe(401)
    expect((await t.get('/v1/me', dev(car.token))).body.phones).toBe(0)
    // 폰 두 대 → 차가 모두 끊기
    const p1 = await t.send('POST', `/v1/pairings/${(await t.send('POST', '/v1/pairings', {}, dev(car.token))).body.code}/claim`, {})
    const p2 = await t.send('POST', `/v1/pairings/${(await t.send('POST', '/v1/pairings', {}, dev(car.token))).body.code}/claim`, {})
    expect((await t.get('/v1/me', dev(car.token))).body.phones).toBe(2)
    expect((await t.send('DELETE', '/v1/me', undefined, dev(car.token))).status).toBe(204)
    expect((await t.get('/v1/me', dev(p1.body.token))).status).toBe(401)
    expect((await t.get('/v1/me', dev(p2.body.token))).status).toBe(401)
    expect((await t.get('/v1/me', dev(car.token))).body).toEqual({ kind: 'car', car: null, phones: 0, settings: { shareAnonymous: true, experience: 'UNKNOWN' } })
  })
})

describe('내 주차 (차 → 서버 → 연결된 폰)', () => {
  it('PUT 저장 → 차·폰이 같은 것을 본다, 같은 id 는 덮어씀(층·구역 수정)', async () => {
    const t = await makeApp({ seed: false })
    const { car, phoneToken } = await pairedCar(t)
    const put = await t.send('PUT', '/v1/me/parkings/rec-1', input(), dev(car.token))
    expect(put.status).toBe(200)
    expect(put.body.parking).toEqual({
      id: 'rec-1',
      ...input(),
      foundAt: null,
      updatedAt: new Date(NOW).toISOString(),
    })
    const fromPhone = await t.get('/v1/me/parkings', dev(phoneToken))
    expect(fromPhone.body).toEqual({ parkings: [put.body.parking], nextBefore: null })
    expect((await t.get('/v1/me/parkings', dev(car.token))).body.parkings).toHaveLength(1)

    t.clock.t += MIN
    const fix = await t.send('PUT', '/v1/me/parkings/rec-1', input({ zone: 'E', number: '03' }), dev(car.token))
    expect(fix.body.parking).toMatchObject({ zone: 'E', number: '03', updatedAt: new Date(NOW + MIN).toISOString() })
    expect((await t.get('/v1/me/parkings', dev(phoneToken))).body.parkings).toHaveLength(1)
  })

  it('차량 앱(kotlinx)이 보내는 JSON 그대로: null 명시, 1.0 같은 실수, 지수 표기', async () => {
    const t = await makeApp({ seed: false })
    const { car } = await pairedCar(t)
    const body =
      '{"lotId":"avenue-france-pangyo","lotName":"아브뉴프랑 판교 주차장","floor":"B2","zone":"D","number":"07","note":null,' +
      '"parkedAt":"2026-11-03T05:52:00Z","summary":{"reverseCount":2,"steeringTurns":3,"durationSec":100,"rampTurns":2.0,"shape":"PERPENDICULAR","approximate":false},' +
      '"hints":["램프를 다 내려와서 곧장"],"route":null,"path":[[1.79368512E12,0.0,0.0,1.571,0.0],[1.793685121E12,1.25,-3.5,-0.002,1.0]]}'
    const r = await t.send('PUT', '/v1/me/parkings/6f1c2a8e-0b1d-4c2e-9a7f-3d5e8b9c1a20', body, dev(car.token))
    expect(r.status).toBe(200)
    expect(r.body.parking.path).toEqual([
      [1793685120000, 0, 0, 1.571, 0],
      [1793685121000, 1.25, -3.5, -0.002, 1],
    ])
    expect(r.body.parking.parkedAt).toBe('2026-11-03T05:52:00.000Z')
  })

  it.each([
    ['동선 301점', { path: Array.from({ length: 301 }, (_, i) => [i, 0, 0, 0, 0]) }],
    ['힌트 5줄', { hints: ['a', 'b', 'c', 'd', 'e'] }],
    ['후진 표시 2', { path: [[0, 0, 0, 0, 2]] }],
    ['점 4개 숫자', { path: [[0, 0, 0, 0]] }],
    ['시각 아님', { parkedAt: 'yesterday' }],
    ['층 13자', { floor: 'B'.repeat(13) }],
    ['요약 모양 잘못', { summary: { reverseCount: 1, steeringTurns: 0, durationSec: 10, rampTurns: 0, shape: 'ROUND', approximate: false } }],
    ['lotName 없음', { lotName: undefined }],
  ])('400: %s', async (_n, over) => {
    const t = await makeApp({ seed: false })
    const car = await register(t, 'car')
    expect((await t.send('PUT', '/v1/me/parkings/rec-1', input(over), dev(car.token))).status).toBe(400)
  })

  it('한도 끝값은 받는다 (동선 300점, 힌트 4줄), id 형식', async () => {
    const t = await makeApp({ seed: false })
    const car = await register(t, 'car')
    const big = input({ path: Array.from({ length: 300 }, (_, i) => [1793685120000 + i * 100, i * 0.12, -i * 0.05, 1.234, i % 2]), hints: ['a', 'b', 'c', 'd'] })
    expect((await t.send('PUT', '/v1/me/parkings/rec-big', big, dev(car.token))).status).toBe(200)
    expect((await t.send('PUT', '/v1/me/parkings/bad%20id', input(), dev(car.token))).status).toBe(400)
  })

  it('폰 토큰으로 PUT 은 401, 연결 안 된 폰은 빈 목록', async () => {
    const t = await makeApp({ seed: false })
    const { phoneToken } = await pairedCar(t)
    expect((await t.send('PUT', '/v1/me/parkings/rec-1', input(), dev(phoneToken))).status).toBe(401)
    const lone = await register(t, 'phone')
    expect((await t.get('/v1/me/parkings', dev(lone.token))).body).toEqual({ parkings: [], nextBefore: null })
    expect((await t.get('/v1/me/parkings/current', dev(lone.token))).body).toEqual({ parking: null })
    expect((await t.send('POST', '/v1/me/parkings/rec-1/found', undefined, dev(lone.token))).status).toBe(404)
    expect((await t.get('/v1/me', dev(lone.token))).body).toEqual({ kind: 'phone', car: null, phones: 0, settings: { shareAnonymous: true, experience: 'UNKNOWN' } })
  })

  it('지금 주차 중 (M-20): 가장 최근 주차가 "차 찾았어요" 전이면 그것, 찾으면 null', async () => {
    const t = await makeApp({ seed: false })
    const { car, phoneToken } = await pairedCar(t)
    expect((await t.get('/v1/me/parkings/current', dev(phoneToken))).body).toEqual({ parking: null })
    await t.send('PUT', '/v1/me/parkings/old', input({ parkedAt: new Date(NOW - 2 * DAY).toISOString() }), dev(car.token))
    await t.send('PUT', '/v1/me/parkings/new', input({ parkedAt: new Date(NOW - 10 * MIN).toISOString(), floor: 'B3' }), dev(car.token))
    expect((await t.get('/v1/me/parkings/current', dev(phoneToken))).body.parking).toMatchObject({ id: 'new', floor: 'B3', foundAt: null })

    t.clock.t += 5 * MIN
    const found = await t.send('POST', '/v1/me/parkings/new/found', undefined, dev(phoneToken))
    expect(found.status).toBe(200)
    expect(found.body.parking.foundAt).toBe(new Date(NOW + 5 * MIN).toISOString())
    // 한 번 더 눌러도 처음 시각
    t.clock.t += MIN
    expect((await t.send('POST', '/v1/me/parkings/new/found', undefined, dev(phoneToken))).body.parking.foundAt).toBe(new Date(NOW + 5 * MIN).toISOString())
    // 예전 주차(old)가 "지금 주차 중"으로 돌아오지 않음
    expect((await t.get('/v1/me/parkings/current', dev(phoneToken))).body).toEqual({ parking: null })
    // 차가 고쳐 보내도 찾은 표시는 그대로
    await t.send('PUT', '/v1/me/parkings/new', input({ parkedAt: new Date(NOW - 10 * MIN).toISOString(), zone: 'A' }), dev(car.token))
    expect((await t.get('/v1/me/parkings/current', dev(phoneToken))).body).toEqual({ parking: null })
    expect((await t.send('POST', '/v1/me/parkings/nope/found', undefined, dev(phoneToken))).status).toBe(404)
  })

  it('두 차는 서로 못 본다 (폰은 연결된 차 것만)', async () => {
    const t = await makeApp({ seed: false })
    const a = await pairedCar(t, 'A차', 'A폰')
    const b = await pairedCar(t, 'B차', 'B폰')
    await t.send('PUT', '/v1/me/parkings/same-id', input({ floor: 'B1' }), dev(a.car.token))
    await t.send('PUT', '/v1/me/parkings/same-id', input({ floor: 'B5' }), dev(b.car.token))
    await t.send('PUT', '/v1/me/parkings/only-a', input({ floor: 'B2' }), dev(a.car.token))

    const seenA = (await t.get('/v1/me/parkings', dev(a.phoneToken))).body.parkings.map((p: any) => `${p.id}:${p.floor}`)
    const seenB = (await t.get('/v1/me/parkings', dev(b.phoneToken))).body.parkings.map((p: any) => `${p.id}:${p.floor}`)
    expect(seenA.sort()).toEqual(['only-a:B2', 'same-id:B1'])
    expect(seenB).toEqual(['same-id:B5'])
    expect((await t.send('POST', '/v1/me/parkings/only-a/found', undefined, dev(b.phoneToken))).status).toBe(404)
    await t.send('POST', '/v1/me/parkings/same-id/found', undefined, dev(b.phoneToken))
    const aSame = (await t.get('/v1/me/parkings', dev(a.phoneToken))).body.parkings.find((p: any) => p.id === 'same-id')
    expect(aSame.foundAt).toBeNull()
    expect((await t.get('/v1/me/stats', dev(b.phoneToken))).body.favorites).toEqual([{ lotId: 'avenue-france-pangyo', count: 1 }])
  })

  it('최신순 · before 커서', async () => {
    const t = await makeApp({ seed: false })
    const { car, phoneToken } = await pairedCar(t)
    for (let i = 1; i <= 5; i++) await t.send('PUT', `/v1/me/parkings/p${i}`, input({ parkedAt: new Date(NOW - (6 - i) * DAY).toISOString() }), dev(car.token))
    const a = (await t.get('/v1/me/parkings?limit=2', dev(phoneToken))).body
    expect(a.parkings.map((p: any) => p.id)).toEqual(['p5', 'p4'])
    expect(a.nextBefore).toBe(a.parkings[1].parkedAt)
    const b = (await t.get(`/v1/me/parkings?limit=2&before=${encodeURIComponent(a.nextBefore)}`, dev(phoneToken))).body
    expect(b.parkings.map((p: any) => p.id)).toEqual(['p3', 'p2'])
    const c = (await t.get(`/v1/me/parkings?limit=2&before=${encodeURIComponent(b.nextBefore)}`, dev(phoneToken))).body
    expect(c).toMatchObject({ nextBefore: null })
    expect(c.parkings.map((p: any) => p.id)).toEqual(['p1'])
    expect((await t.get('/v1/me/parkings?limit=101', dev(phoneToken))).status).toBe(400)
    expect((await t.get('/v1/me/parkings?before=nope', dev(phoneToken))).status).toBe(400)
  })

  it('통계 (M-32): 한국 시간 달력 — 이번 달·지난달 평균 후진, 6개월, 자주 간 곳 Top3', async () => {
    const t = await makeApp({ seed: false })
    const { car, phoneToken } = await pairedCar(t)
    const kst = (y: number, m: number, d: number, h = 12) => new Date(Date.UTC(y, m - 1, d, h - 9)).toISOString()
    const add = (id: string, at: string, rev: number | null, lotId: string | null = 'avenue-france-pangyo') =>
      t.send(
        'PUT',
        `/v1/me/parkings/${id}`,
        input({ parkedAt: at, lotId, summary: rev == null ? null : { reverseCount: rev, steeringTurns: 1, durationSec: 60, rampTurns: 0, shape: 'PERPENDICULAR', approximate: false } }),
        dev(car.token),
      )
    await add('n1', kst(2026, 11, 1), 1, 'h-square')
    await add('n2', kst(2026, 11, 3, 8), 3, 'h-square')
    await add('o1', kst(2026, 10, 31, 23), 2) // 한국 시간 10월 31일 밤 (UTC 로는 같은 날)
    await add('o2', kst(2026, 11, 1, 0) /* 11월 1일 0시 KST = UTC 10월 31일 */, 4, 'baekhyun-5')
    await add('j1', kst(2026, 6, 15), 1)
    await add('old', kst(2026, 4, 15), 5) // 6개월 밖
    await add('noSummary', kst(2026, 11, 2), null, null)
    const s = (await t.get('/v1/me/stats', dev(phoneToken))).body
    expect(s).toEqual({
      thisMonthAvgReverse: 2.7, // (1 + 3 + 4) / 3
      lastMonthAvgReverse: 2,
      monthly: [
        { month: '2026-06', avgReverse: 1 },
        { month: '2026-10', avgReverse: 2 },
        { month: '2026-11', avgReverse: 2.7 },
      ],
      favorites: [
        { lotId: 'avenue-france-pangyo', count: 3 },
        { lotId: 'h-square', count: 2 },
        { lotId: 'baekhyun-5', count: 1 },
      ],
    })
    expect((await t.get('/v1/me/stats', dev(car.token))).body).toEqual(s)
  })

  it('달 계산', () => {
    expect(monthKey(Date.UTC(2026, 9, 31, 15))).toBe('2026-11') // UTC 10/31 15시 = KST 11/1 0시
    expect(monthBefore('2026-11', 5)).toBe('2026-06')
    expect(monthBefore('2026-02', 3)).toBe('2025-11')
  })
})

describe('GET /v1/me/parkings/:id (M-33 한 건)', () => {
  it('차·연결된 폰은 같은 것, 다른 차·연결 안 된 폰·없는 id 는 404', async () => {
    const t = await makeApp({ seed: false })
    const a = await pairedCar(t)
    const b = await pairedCar(t, '다른 차', '다른 폰')
    const put = await t.send('PUT', '/v1/me/parkings/rec-1', input(), dev(a.car.token))
    for (const token of [a.car.token, a.phoneToken]) {
      const r = await t.get('/v1/me/parkings/rec-1', dev(token))
      expect(r.status).toBe(200)
      expect(r.body).toEqual({ parking: put.body.parking })
      expect(r.res.headers.get('cache-control')).toBe('no-store')
    }
    expect((await t.get('/v1/me/parkings/rec-1', dev(b.car.token))).status).toBe(404)
    expect((await t.get('/v1/me/parkings/rec-1', dev(b.phoneToken))).status).toBe(404)
    const lone = await register(t, 'phone')
    expect((await t.get('/v1/me/parkings/rec-1', dev(lone.token))).status).toBe(404)
    expect((await t.get('/v1/me/parkings/nope', dev(a.phoneToken))).body.error.code).toBe('not_found')
    expect((await t.get('/v1/me/parkings/rec-1')).status).toBe(401)
    // current 는 그대로 "지금 주차 중"
    expect((await t.get('/v1/me/parkings/current', dev(a.phoneToken))).body.parking.id).toBe('rec-1')
  })
})

describe('같이 쓰는 설정 (M-12 보낼게요/나만 볼게요 · M-40 운전 경력)', () => {
  it('기본값, 폰이 바꾸면 차가 읽고 차가 바꾸면 폰이 읽는다 (차마다)', async () => {
    const t = await makeApp({ seed: false })
    const a = await pairedCar(t)
    const b = await pairedCar(t, '다른 차', '다른 폰')
    expect((await t.get('/v1/me', dev(a.car.token))).body.settings).toEqual({ shareAnonymous: true, experience: 'UNKNOWN' })
    const r = await t.send('PATCH', '/v1/me/settings', { shareAnonymous: false }, dev(a.phoneToken))
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ settings: { shareAnonymous: false, experience: 'UNKNOWN' } })
    expect((await t.get('/v1/me', dev(a.car.token))).body.settings).toEqual({ shareAnonymous: false, experience: 'UNKNOWN' })
    const r2 = await t.send('PATCH', '/v1/me/settings', { experience: 'Y1_3' }, dev(a.car.token))
    expect(r2.body.settings).toEqual({ shareAnonymous: false, experience: 'Y1_3' })
    expect((await t.get('/v1/me', dev(a.phoneToken))).body.settings).toEqual({ shareAnonymous: false, experience: 'Y1_3' })
    // 빈 본문 = 지금 값
    expect((await t.send('PATCH', '/v1/me/settings', {}, dev(a.phoneToken))).body.settings).toEqual({ shareAnonymous: false, experience: 'Y1_3' })
    // 다른 차는 영향 없음
    expect((await t.get('/v1/me', dev(b.phoneToken))).body.settings).toEqual({ shareAnonymous: true, experience: 'UNKNOWN' })
    // 폰을 끊었다 다시 이어도 차의 설정은 남는다
    await t.send('DELETE', '/v1/me', undefined, dev(a.phoneToken))
    const p = await t.send('POST', '/v1/pairings', {}, dev(a.car.token))
    const again = await t.send('POST', `/v1/pairings/${p.body.code}/claim`, {})
    expect((await t.get('/v1/me', dev(again.body.token))).body.settings).toEqual({ shareAnonymous: false, experience: 'Y1_3' })
  })

  it('400 (모르는 값·필드) · 401 · 409 (연결 전 폰)', async () => {
    const t = await makeApp({ seed: false })
    const a = await pairedCar(t)
    expect((await t.send('PATCH', '/v1/me/settings', { experience: 'PRO' }, dev(a.phoneToken))).status).toBe(400)
    expect((await t.send('PATCH', '/v1/me/settings', { shareAnonymous: 'yes' }, dev(a.phoneToken))).status).toBe(400)
    expect((await t.send('PATCH', '/v1/me/settings', { theme: 'dark' }, dev(a.phoneToken))).status).toBe(400)
    expect((await t.send('PATCH', '/v1/me/settings', { shareAnonymous: false })).status).toBe(401)
    const lone = await register(t, 'phone')
    const c = await t.send('PATCH', '/v1/me/settings', { shareAnonymous: false }, dev(lone.token))
    expect(c.status).toBe(409)
    expect(c.body.error.code).toBe('conflict')
  })

  it('CORS: 폰 웹에서 PATCH 미리 묻기(preflight) 허용', async () => {
    const r = await (await makeApp({ seed: false })).app.request('/v1/me/settings', {
      method: 'OPTIONS',
      headers: { Origin: 'https://parkinggack.vercel.app', 'Access-Control-Request-Method': 'PATCH', 'Access-Control-Request-Headers': 'authorization,content-type' },
    })
    expect(r.status).toBe(204)
    expect(r.headers.get('access-control-allow-methods')).toContain('PATCH')
  })
})

describe('웹 푸시 (M-14 "알림 받을게요")', () => {
  const sub = (n: number) => ({ endpoint: `https://push.example.com/send/${n}`, expirationTime: null, keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` } })

  it('VAPID 키가 없으면 /v1/push/key → 404, 저장해도 보내지 않음', async () => {
    const t = await makeApp({ seed: false })
    expect((await t.get('/v1/push/key')).status).toBe(404)
    expect(createPushSender({ vapid: null })).toBe(noPush)
  })

  it('키가 있으면 공개 키, 새 주차를 올리면 연결된 폰에 "B2 · D-07에 주차했어요" (고칠 때는 안 보냄)', async () => {
    const push = fakePush()
    const t = await makeApp({ seed: false, push })
    expect((await t.get('/v1/push/key')).body).toEqual({ publicKey: 'BTestPublicKey' })
    const a = await pairedCar(t)
    const other = await pairedCar(t, '다른 차', '다른 폰')
    expect((await t.send('POST', '/v1/me/push', sub(1), dev(a.phoneToken))).status).toBe(204)
    expect((await t.send('POST', '/v1/me/push', sub(2), dev(other.phoneToken))).status).toBe(204)

    await t.send('PUT', '/v1/me/parkings/rec-1', input(), dev(a.car.token))
    expect(push.sent).toHaveLength(1)
    expect(push.sent[0].target).toEqual({ endpoint: sub(1).endpoint, p256dh: 'p256dh-1', auth: 'auth-1', deviceId: expect.any(String) })
    // 계약 PushMessage 그대로 (필드 4개)
    expect(push.sent[0].msg).toEqual({ title: '주차각', body: 'B2 · D-07에 주차했어요', url: '/', parkingId: 'rec-1' })
    await t.send('PUT', '/v1/me/parkings/rec-1', input({ zone: 'E' }), dev(a.car.token)) // 고침 → 안 보냄
    expect(push.sent).toHaveLength(1)
    await t.send('PUT', '/v1/me/parkings/rec-2', input({ floor: null, zone: null, number: null }), dev(a.car.token))
    expect(push.sent[1].msg.body).toBe('아브뉴프랑 판교 주차장에 주차했어요')
  })

  it('구독이 없어졌다는 응답(410)이면 지우고, DELETE 로 끄기', async () => {
    const push = fakePush()
    const t = await makeApp({ seed: false, push })
    const a = await pairedCar(t)
    await t.send('POST', '/v1/me/push', sub(1), dev(a.phoneToken))
    await t.send('POST', '/v1/me/push', sub(3), dev(a.phoneToken))
    push.goneEndpoints.add(sub(3).endpoint)
    await t.send('PUT', '/v1/me/parkings/r1', input(), dev(a.car.token))
    expect(push.sent).toHaveLength(2)
    expect(await t.store.count('SELECT COUNT(*) AS c FROM push_subscriptions')).toBe(1)
    expect((await t.send('DELETE', '/v1/me/push', undefined, dev(a.phoneToken))).status).toBe(204)
    await t.send('PUT', '/v1/me/parkings/r2', input(), dev(a.car.token))
    expect(push.sent).toHaveLength(2)
  })

  it('400 · 401: https 아닌 주소, 키 없음, 차 토큰', async () => {
    const t = await makeApp({ seed: false, push: fakePush() })
    const a = await pairedCar(t)
    expect((await t.send('POST', '/v1/me/push', { ...sub(1), endpoint: 'http://insecure.example/x' }, dev(a.phoneToken))).status).toBe(400)
    expect((await t.send('POST', '/v1/me/push', { endpoint: 'https://x.example/1' }, dev(a.phoneToken))).status).toBe(400)
    expect((await t.send('POST', '/v1/me/push', sub(1), dev(a.car.token))).status).toBe(401)
  })

  it('실제 web-push 보내기 (VAPID 키로 서명) — 구독 주소가 410 이면 gone', async () => {
    const keys = webpush.generateVAPIDKeys()
    const sender = createPushSender({ vapid: { publicKey: keys.publicKey, privateKey: keys.privateKey, subject: 'mailto:test@example.com' } })
    expect(sender.publicKey).toBe(keys.publicKey)
    // 네트워크 없이: web-push 가 부르는 요청을 가로채서 410 을 돌려준다
    const original = webpush.sendNotification
    const calls: unknown[] = []
    ;(webpush as any).sendNotification = async (...args: unknown[]) => {
      calls.push(args)
      throw Object.assign(new Error('gone'), { statusCode: 410 })
    }
    try {
      expect(await sender.send({ endpoint: 'https://push.example.com/x', p256dh: 'k', auth: 'a' }, { title: 't', body: 'b', url: '/', parkingId: 'x' })).toBe('gone')
      expect(calls).toHaveLength(1)
    } finally {
      ;(webpush as any).sendNotification = original
    }
  })
})
