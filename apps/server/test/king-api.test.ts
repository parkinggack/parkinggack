/** v1.2 주차왕 엔드포인트 — 참여·순위판·PUT 등수·지난주 결과·시연 차 도우미·개인정보 */
import { describe, expect, it } from 'vitest'
import { isGeneratedNickname, weekStartOf } from '../src/king.js'
import { MIGRATIONS } from '../src/db.js'
import { openDatabase } from '../src/db-node.js'
import { migrate } from '../src/db.js'
import { ADMIN, NOW, makeApp, type TestApp } from './helpers.js'

const dev = (token: string) => ({ Authorization: `Device ${token}` })
const MIN = 60_000
const DAY = 86_400_000
const W = weekStartOf(NOW)
const WEEK = { start: '2026-11-01T15:00:00.000Z', end: '2026-11-08T15:00:00.000Z' }
const LEAGUE = { id: 'pangyo:UNDER_1Y', region: 'pangyo', regionName: '판교', experience: 'UNDER_1Y', label: '판교 초보', longLabel: '판교 · 1년 미만' }
const TOP5 = [
  { rank: 1, nickname: '백현 조용한 고래', score: 96, isMe: false },
  { rank: 2, nickname: '삼평 단단한 펭귄', score: 94, isMe: false },
  { rank: 3, nickname: '운중 느린 거북', score: 93, isMe: false },
  { rank: 4, nickname: '판교 맑은 여우', score: 91, isMe: false },
  { rank: 5, nickname: '백현 둥근 너구리', score: 90, isMe: false },
]

async function register(t: TestApp, kind: 'car' | 'phone') {
  const r = await t.send('POST', '/v1/devices', { kind })
  expect(r.status).toBe(201)
  return r.body as { deviceId: string; token: string }
}

async function pairedCar(t: TestApp, experience?: string) {
  const car = await register(t, 'car')
  const p = await t.send('POST', '/v1/pairings', {}, dev(car.token))
  const claim = await t.send('POST', `/v1/pairings/${p.body.code}/claim`, {})
  const phoneToken = claim.body.token as string
  if (experience) expect((await t.send('PATCH', '/v1/me/settings', { experience }, dev(phoneToken))).status).toBe(200)
  return { car, phoneToken }
}

/** 차량 앱 MyParkingSync 모양 + v1.2 summary.maxSpeedKmh */
function parking(o: { lotId?: string | null; reverse?: number; steering?: number; speed?: number | null; at?: number } = {}) {
  const summary: Record<string, unknown> = { reverseCount: o.reverse ?? 0, steeringTurns: o.steering ?? 1, durationSec: 60, rampTurns: 0, shape: 'PERPENDICULAR', approximate: false }
  if (o.speed !== undefined) summary.maxSpeedKmh = o.speed
  return {
    lotId: o.lotId === undefined ? 'h-square' : o.lotId,
    lotName: 'H스퀘어 지하주차장',
    floor: 'B2',
    zone: 'D',
    number: '07',
    note: null,
    parkedAt: new Date(o.at ?? NOW - 30 * MIN).toISOString(),
    summary,
    hints: [],
    route: null,
    path: [],
  }
}
const put = (t: TestApp, token: string, id: string, o: Parameters<typeof parking>[0] = {}) => t.send('PUT', `/v1/me/parkings/${id}`, parking(o), dev(token))
const join = (t: TestApp, token: string, body: Record<string, unknown>) => t.send('POST', '/v1/me/king/join', body, dev(token))

describe('GET /v1/king/nickname (M-52 다시 뽑기)', () => {
  it('"동네 형용사 동물" — 지역 동네 단어, 저장 안 함, no-store', async () => {
    const t = await makeApp()
    for (let i = 0; i < 5; i++) {
      const r = await t.get('/v1/king/nickname?region=pangyo')
      expect(r.status).toBe(200)
      expect(Object.keys(r.body)).toEqual(['nickname'])
      expect(isGeneratedNickname(r.body.nickname)).toBe(true)
      expect(['판교', '백현', '삼평', '운중']).toContain(r.body.nickname.split(' ')[0])
      expect(r.res.headers.get('cache-control')).toBe('no-store')
    }
    expect((await t.get('/v1/king/nickname')).body.nickname.split(' ')[0]).toMatch(/^(판교|백현|삼평|운중)$/)
    expect((await t.get('/v1/king/nickname?region=bundang')).body.nickname.split(' ')[0]).toMatch(/^(정자|수내|서현|야탑|이매|미금)$/)
    expect((await t.get('/v1/king/nickname?region=jeju')).body.nickname).toMatch(/^이웃 /)
    expect((await t.get('/v1/king/nickname?region=Bad%20Region')).status).toBe(400)
    expect(await t.store.count('SELECT COUNT(*) AS c FROM king_participants WHERE demo = 0')).toBe(0)
  })
})

describe('참여 → 주차 → 순위 (차·폰이 같은 것을 본다)', () => {
  it('참여 전(들어갈 리그 미리 보기) → 참여 → 첫 주차로 순위에 들어감 → PUT 응답 king 전후 등수', async () => {
    const t = await makeApp()
    const { car, phoneToken } = await pairedCar(t, 'UNDER_1Y')

    const before = await t.get('/v1/me/king', dev(phoneToken))
    expect(before.status).toBe(200)
    expect(before.body).toEqual({
      joined: false, nickname: null, league: LEAGUE, week: WEEK, rank: null, total: 148, percentile: null, score: null, prevWeekRank: null, nextHint: null, parkings: [],
    })
    const preview = (await t.get('/v1/me/king/board', dev(phoneToken))).body
    expect(preview).toEqual({ league: LEAGUE, week: WEEK, total: 148, top: TOP5, around: [], demo: true })

    const nickname = (await t.get('/v1/king/nickname?region=pangyo')).body.nickname
    const j = await join(t, phoneToken, { nickname })
    expect(j.status).toBe(200)
    expect(j.body.me).toMatchObject({ joined: true, nickname, league: LEAGUE, rank: null, total: 148, score: null, parkings: [] })
    const hint = /^깔끔하게 한 번 대면 (\d+)등이에요$/.exec(j.body.me.nextHint)
    expect(hint).not.toBeNull()

    // 첫 주차 (깔끔, 1건이라 0.8배): 56 + 6 + 7 = 69
    const p1 = await put(t, car.token, 'rec-1', { reverse: 0, steering: 1, speed: 6 })
    expect(p1.status).toBe(200)
    expect(p1.body.king).toEqual({ rankBefore: null, rankAfter: Number(hint![1]) })
    expect(p1.body.parking.summary.maxSpeedKmh).toBe(6)

    const fromCar = (await t.get('/v1/me/king', dev(car.token))).body
    expect(fromCar).toMatchObject({ joined: true, rank: Number(hint![1]), total: 149, score: { total: 69, maneuver: 56, lotsVisited: 6, improvement: 7 } })
    expect(fromCar.percentile).toBe(Math.ceil((fromCar.rank / 149) * 100))
    expect(fromCar.parkings).toEqual([{ parkingId: 'rec-1', lotName: 'H스퀘어 지하주차장', parkedAt: new Date(NOW - 30 * MIN).toISOString(), reverseCount: 0, grade: 'CLEAN', excludedReason: null }])
    expect((await t.get('/v1/me/king', dev(phoneToken))).body).toEqual(fromCar)

    const board = (await t.get('/v1/me/king/board', dev(phoneToken))).body
    expect(board.total).toBe(149)
    expect(board.around.find((r: any) => r.isMe)).toEqual({ rank: fromCar.rank, nickname, score: 69, isMe: true })
    expect(board.around.map((r: any) => r.rank)).toEqual([fromCar.rank - 1, fromCar.rank, fromCar.rank + 1])
  })

  it('시속 10km 넘은 주차는 빠짐 (순위 그대로, M-51 에 "빠짐"), 깔끔한 두 번째 주차로 올라감', async () => {
    const t = await makeApp()
    const { car } = await pairedCar(t, 'UNDER_1Y')
    await join(t, car.token, { nickname: '주차 연습생' })
    const first = await put(t, car.token, 'a', { lotId: 'hyundai-pangyo', reverse: 0, steering: 1, at: NOW - 3 * 3_600_000 })
    const r1 = first.body.king.rankAfter as number

    const fast = await put(t, car.token, 'b', { lotId: 'avenue-france-pangyo', reverse: 0, steering: 1, speed: 14, at: NOW - 2 * 3_600_000 })
    expect(fast.body.king).toEqual({ rankBefore: r1, rankAfter: r1 })
    expect(fast.body.parking.summary.maxSpeedKmh).toBe(14)
    let me = (await t.get('/v1/me/king', dev(car.token))).body
    expect(me.score.total).toBe(69)
    expect(me.parkings[0]).toMatchObject({ parkingId: 'b', grade: 'EXCLUDED', excludedReason: 'SPEED' })

    // 후진 1·핸들 1 (깔끔, 시속 10km 까지는 괜찮음) → 70 × (1 + 0.84) / 2 = 64.4 → 64, 2곳 10, 지난달 없음 7 = 81 → 같은 81점 "운중 다정한 곰"(56) 보다 앞 → 13등
    const ok = await put(t, car.token, 'c', { lotId: 'avenue-france-pangyo', reverse: 1, steering: 1, speed: 10, at: NOW - 3_600_000 })
    expect(ok.body.king).toEqual({ rankBefore: r1, rankAfter: 13 })
    me = (await t.get('/v1/me/king', dev(car.token))).body
    expect(me).toMatchObject({ rank: 13, total: 149, score: { total: 81, maneuver: 64, lotsVisited: 10, improvement: 7 } })
    expect(me.parkings.map((p: any) => `${p.parkingId}:${p.grade}`)).toEqual(['c:CLEAN', 'b:EXCLUDED', 'a:CLEAN'])
    const board = (await t.get('/v1/me/king/board', dev(car.token))).body
    expect(board.around).toEqual([
      { rank: 12, nickname: '판교 느긋한 수달', score: 82, isMe: false },
      { rank: 13, nickname: '주차 연습생', score: 81, isMe: true },
      { rank: 14, nickname: '운중 다정한 곰', score: 81, isMe: false },
    ])
    // 같은 id 를 고쳐 보내도(층 수정) 그 차례로 계산
    expect((await put(t, car.token, 'c', { lotId: 'avenue-france-pangyo', reverse: 1, steering: 1, at: NOW - 3_600_000 })).body.king).toEqual({ rankBefore: 13, rankAfter: 13 })
    // 이번 주 시작 전 30일보다 오래된 주차는 이번 주 점수와 상관없음
    expect((await put(t, car.token, 'old', { reverse: 3, steering: 1, at: W - 31 * DAY })).body.king).toEqual({ rankBefore: 13, rankAfter: 13 })
    // 지난달(이번 주 시작 전 30일) 기록이 생기면 "지난달보다" 칸이 생김: 평균 후진 3 → 이번 주 0.5 = 15 × 2.5/3 = 12.5 → 13 → 87점 8등
    expect((await put(t, car.token, 'base', { reverse: 3, steering: 1, at: W - DAY })).body.king).toEqual({ rankBefore: 13, rankAfter: 8 })
    expect((await t.get('/v1/me/king', dev(car.token))).body.score).toEqual({ total: 87, maneuver: 64, lotsVisited: 10, improvement: 13 })
  })

  it('참여 안 한 차: PUT 응답 king null, parking 은 예전 그대로 · maxSpeedKmh 검증', async () => {
    const t = await makeApp()
    const car = await register(t, 'car')
    const r = await put(t, car.token, 'rec-1')
    expect(r.status).toBe(200)
    expect(Object.keys(r.body).sort()).toEqual(['king', 'parking'])
    expect(r.body.king).toBeNull()
    expect(r.body.parking.summary).toEqual({ reverseCount: 0, steeringTurns: 1, durationSec: 60, rampTurns: 0, shape: 'PERPENDICULAR', approximate: false })
    expect((await put(t, car.token, 'rec-2', { speed: null })).body.parking.summary.maxSpeedKmh).toBeNull()
    expect((await put(t, car.token, 'rec-3', { speed: 12.5 })).body.parking.summary.maxSpeedKmh).toBe(12.5)
    expect((await put(t, car.token, 'rec-4', { speed: -1 })).status).toBe(400)
    expect((await put(t, car.token, 'rec-5', { speed: 401 })).status).toBe(400)
    const bad = parking()
    ;(bad.summary as any).maxSpeedKmh = 'fast'
    expect((await t.send('PUT', '/v1/me/parkings/rec-6', bad, dev(car.token))).status).toBe(400)
  })
})

describe('인증 · 연결 · 닉네임', () => {
  it('연결 전 폰은 409, 토큰 없으면 401', async () => {
    const t = await makeApp()
    const lone = await register(t, 'phone')
    for (const [m, p] of [['GET', '/v1/me/king'], ['GET', '/v1/me/king/board'], ['GET', '/v1/me/king/results/last'], ['DELETE', '/v1/me/king']] as const) {
      const r = await t.send(m, p, undefined, dev(lone.token))
      expect(r.status, `${m} ${p}`).toBe(409)
      expect(r.body.error.code).toBe('conflict')
      expect((await t.send(m, p)).status).toBe(401)
    }
    expect((await join(t, lone.token, { nickname: '판교 느긋한 수달' })).status).toBe(409)
    expect((await t.send('POST', '/v1/me/king/join', { nickname: '판교 느긋한 수달' })).status).toBe(401)
  })

  it('닉네임 400 · 같은 리그의 다른 차와 겹치면 409 (다른 리그는 됨) · 시연 참여자와 겹치면 시연 쪽 닉네임을 바꿈', async () => {
    const t = await makeApp()
    const a = await pairedCar(t, 'UNDER_1Y')
    for (const body of [{ nickname: 'a' }, { nickname: '수달!' }, { nickname: 'x'.repeat(21) }, {}, { nickname: '판교 수달', region: 'Bad' }, { nickname: '판교 수달', experience: 'Y1_3' }]) {
      expect((await join(t, a.phoneToken, body)).status, JSON.stringify(body)).toBe(400)
    }
    expect((await join(t, a.phoneToken, { nickname: '  주차   연습생 ' })).body.me.nickname).toBe('주차 연습생')
    const b = await pairedCar(t, 'UNDER_1Y')
    const clash = await join(t, b.car.token, { nickname: '주차 연습생' })
    expect(clash.status).toBe(409)
    expect(clash.body.error.code).toBe('conflict')
    const c = await pairedCar(t, 'Y1_3')
    expect((await join(t, c.car.token, { nickname: '주차 연습생' })).status).toBe(200)

    // 시연 1등의 닉네임을 쓰면 → 시연 참여자가 새 닉네임을 받고, 점수·자리는 그대로
    const d = await pairedCar(t, 'UNDER_1Y')
    expect((await join(t, d.car.token, { nickname: '백현 조용한 고래' })).status).toBe(200)
    const top = (await t.get('/v1/me/king/board', dev(d.car.token))).body.top[0]
    expect(top).toMatchObject({ rank: 1, score: 96, isMe: false })
    expect(top.nickname).not.toBe('백현 조용한 고래')
    expect(isGeneratedNickname(top.nickname)).toBe(true)
  })

  it('리그: 지역은 보낸 값 → 가장 최근 주차장 지역 → pangyo, 경력은 설정 (모름 = "모두"), 다시 참여하면 리그·닉네임을 바꿈', async () => {
    const t = await makeApp()
    const seoul = await pairedCar(t)
    await put(t, seoul.car.token, 'old', { lotId: 'hyundai-pangyo', at: NOW - 2 * DAY })
    await put(t, seoul.car.token, 'new', { lotId: 'coex-samseong', at: NOW - DAY })
    const s = (await join(t, seoul.phoneToken, { nickname: '성수 맑은 여우' })).body.me
    expect(s.league).toEqual({ id: 'seoul:UNKNOWN', region: 'seoul', regionName: '서울', experience: 'UNKNOWN', label: '서울 모두', longLabel: '서울 · 모든 경력' })
    expect(s).toMatchObject({ rank: 1, total: 1, percentile: 100, nextHint: '1등을 지키고 있어요' })
    expect((await t.get('/v1/me/king/board', dev(seoul.car.token))).body).toMatchObject({ total: 1, demo: false, around: [], top: [{ rank: 1, nickname: '성수 맑은 여우', isMe: true }] })

    const fresh = await pairedCar(t)
    expect((await join(t, fresh.car.token, { nickname: '판교 수달' })).body.me).toMatchObject({ league: { id: 'pangyo:UNKNOWN', label: '판교 모두' }, total: 64 })
    const bundang = await pairedCar(t, 'OVER_10Y')
    expect((await join(t, bundang.car.token, { nickname: '정자 곰', region: 'bundang' })).body.me.league).toMatchObject({ id: 'bundang:OVER_10Y', label: '분당 베테랑' })

    // 설정 경력을 바꾸고 다시 참여 → 새 리그
    await t.send('PATCH', '/v1/me/settings', { experience: 'Y3_10' }, dev(fresh.phoneToken))
    expect((await t.get('/v1/me/king', dev(fresh.car.token))).body.league.id).toBe('pangyo:UNKNOWN') // 참여할 때의 경력 그대로
    expect((await join(t, fresh.car.token, { nickname: '판교 새 수달' })).body.me).toMatchObject({ nickname: '판교 새 수달', league: { id: 'pangyo:Y3_10', label: '판교 중수' }, total: 203 })
  })

  it('그만두기: 순위판에서 빠짐 (주차 기록은 그대로), 다시 참여할 수 있음', async () => {
    const t = await makeApp()
    const { car, phoneToken } = await pairedCar(t, 'UNDER_1Y')
    await join(t, car.token, { nickname: '주차 연습생' })
    await put(t, car.token, 'p1')
    expect((await t.get('/v1/me/king/board', dev(car.token))).body.total).toBe(149)
    expect((await t.send('DELETE', '/v1/me/king', undefined, dev(phoneToken))).status).toBe(204)
    expect((await t.send('DELETE', '/v1/me/king', undefined, dev(phoneToken))).status).toBe(204)
    expect((await t.get('/v1/me/king', dev(car.token))).body).toMatchObject({ joined: false, nickname: null, rank: null, total: 148 })
    const board = (await t.get('/v1/me/king/board', dev(car.token))).body
    expect(board.total).toBe(148)
    expect(JSON.stringify(board)).not.toContain('"isMe":true')
    expect((await put(t, car.token, 'p2')).body.king).toBeNull()
    expect((await t.get('/v1/me/parkings', dev(phoneToken))).body.parkings).toHaveLength(2)
    expect((await join(t, phoneToken, { nickname: '주차 연습생' })).body.me).toMatchObject({ joined: true, total: 149 })
  })
})

describe('순위판 개인정보: 닉네임·점수·등수·나인지만', () => {
  it('다른 사람의 주차장·시각·기기 id 는 어떤 응답에도 없다', async () => {
    const t = await makeApp()
    const demoCar = await register(t, 'car')
    expect((await t.send('POST', '/v1/admin/king/demo-car', { deviceId: demoCar.deviceId }, ADMIN)).status).toBe(200)
    const other = await pairedCar(t, 'UNDER_1Y')
    await join(t, other.car.token, { nickname: '주차 연습생' })
    // 81점 → 13등: 바로 앞이 시연 차(12등)
    await put(t, other.car.token, 'o1', { lotId: 'botdeul-mall', reverse: 1, steering: 1, at: NOW - 2 * 3_600_000 })
    await put(t, other.car.token, 'o2', { lotId: 'u-space-pangyo', reverse: 0, steering: 1, at: NOW - 3_600_000 })
    const board = (await t.get('/v1/me/king/board', dev(other.phoneToken))).body
    expect(board.around.map((x: any) => x.nickname)).toEqual(['판교 느긋한 수달', '주차 연습생', '운중 다정한 곰'])
    for (const row of [...board.top, ...board.around]) expect(Object.keys(row).sort()).toEqual(['isMe', 'nickname', 'rank', 'score'])
    const all = JSON.stringify([board, (await t.get('/v1/me/king', dev(other.phoneToken))).body])
    expect(all).toContain('판교 느긋한 수달')
    for (const leak of ['현대백화점', '아브뉴프랑', '백현마을', 'king-demo', demoCar.deviceId]) expect(all).not.toContain(leak)
  })
})

describe('지난주 결과 (M-53) — 주가 바뀐 뒤 처음 요청 때 고정, 그 뒤로 그대로', () => {
  it('404 → 다음 주: 지난주 등수·인원·상위 %·배지, prevWeekRank → 두 주째: 몇 계단 올랐는지', async () => {
    const t = await makeApp()
    const { car, phoneToken } = await pairedCar(t, 'UNDER_1Y')
    await join(t, car.token, { nickname: '주차 연습생' })
    // 이번 주 깔끔 2번, 2곳: 70 + 10 + 7 = 87 → 같은 87점(61) 시연 참여자보다 앞 → 8등
    await put(t, car.token, 'w1-a', { lotId: 'h-square', at: W + 2 * 3_600_000 })
    expect((await put(t, car.token, 'w1-b', { lotId: 'alphadom-tower', at: NOW - MIN })).body.king.rankAfter).toBe(8)
    const miss = await t.get('/v1/me/king/results/last', dev(phoneToken))
    expect(miss.status).toBe(404)
    expect(miss.body.error.code).toBe('not_found')

    t.clock.t = NOW + 7 * DAY // 다음 주 화요일
    const last = await t.get('/v1/me/king/results/last', dev(phoneToken))
    expect(last.status).toBe(200)
    expect(last.body).toEqual({ week: WEEK, league: LEAGUE, rank: 8, total: 149, percentile: 6, score: 87, rankDelta: null, badges: ['TOP10'] })
    expect((await t.get('/v1/me/king', dev(car.token))).body).toMatchObject({ prevWeekRank: 8, rank: null, total: 148, week: { start: '2026-11-08T15:00:00.000Z' } })
    // 끝난 주에 늦게 올라온 주차는 고정된 결과를 바꾸지 않음
    await put(t, car.token, 'w1-late', { lotId: 'pangyo-new', reverse: 5, steering: 6, at: W + DAY })
    expect((await t.get('/v1/me/king/results/last', dev(car.token))).body).toEqual(last.body)
    // 시연 순위는 다음 주에도 시안 숫자 그대로
    expect((await t.get('/v1/me/king/board', dev(car.token))).body).toMatchObject({ total: 148, top: TOP5, demo: true })

    // 두 주째: 깔끔 3번, 3곳 → 70 + 13 + 15(지난달 평균 1.7 → 0) = 98 → 1등
    for (const [i, lot] of ['h-square', 'hyundai-pangyo', 'u-space-pangyo'].entries()) {
      await put(t, car.token, `w2-${i}`, { lotId: lot, reverse: 0, steering: 1, at: NOW + 7 * DAY - (i + 1) * 3_600_000 })
    }
    expect((await t.get('/v1/me/king', dev(car.token))).body).toMatchObject({ rank: 1, nextHint: '1등을 지키고 있어요', score: { total: 98, maneuver: 70, lotsVisited: 13, improvement: 15 } })
    t.clock.t = NOW + 14 * DAY
    expect((await t.get('/v1/me/king/results/last', dev(car.token))).body).toMatchObject({
      week: { start: '2026-11-08T15:00:00.000Z', end: '2026-11-15T15:00:00.000Z' },
      rank: 1,
      total: 149,
      percentile: 1,
      score: 98,
      rankDelta: 7,
      badges: ['TOP10', 'TOP3', 'FIRST', 'CLIMBER', 'CLEAN_WEEK'],
    })
  })

  it('그 주가 끝나기 전에 그만둔 차는 그 주 결과에 없음 · 하루 정리(cron)도 지난주를 고정', async () => {
    const t = await makeApp()
    const { car } = await pairedCar(t, 'UNDER_1Y')
    await join(t, car.token, { nickname: '주차 연습생' })
    await put(t, car.token, 'p1')
    await t.send('DELETE', '/v1/me/king', undefined, dev(car.token))
    t.clock.t = NOW + 7 * DAY
    const cron = await t.get('/v1/cron/maintain', ADMIN)
    expect(cron.status).toBe(200)
    expect(await t.store.count('SELECT COUNT(*) AS c FROM king_weeks WHERE week_ms IN (?, ?)', [W, W - 7 * DAY])).toBe(2)
    expect(await t.store.count('SELECT COUNT(*) AS c FROM king_week_scores WHERE week_ms = ? AND league_id = ?', [W, 'pangyo:UNDER_1Y'])).toBe(148)
    expect((await t.get('/v1/me/king/results/last', dev(car.token))).status).toBe(404)
  })

  it('인스턴스 둘이 동시에 고정해도 한 벌만', async () => {
    const t = await makeApp()
    t.clock.t = NOW + 7 * DAY
    const king = (t.app as any).maintenance.king
    await Promise.all([king.ensureSnapshots(), king.ensureSnapshots(), king.snapshotWeek(W)])
    expect(await t.store.count('SELECT COUNT(*) AS c FROM king_week_scores WHERE week_ms = ?', [W])).toBe(712)
  })
})

describe('POST /v1/admin/king/demo-car (촬영용 시연 차)', () => {
  it('board(기본): "판교 느긋한 수달" 82점(58·13·11) 12등 / 148명, 지난주 17등, 다음 깔끔 한 번이면 10등 → PUT 12등 → 10등', async () => {
    const t = await makeApp()
    const { car, phoneToken } = await pairedCar(t)
    await put(t, car.token, 'mine', { at: NOW - 5 * DAY }) // 지워질 이 차의 최근 주차
    const r = await t.send('POST', '/v1/admin/king/demo-car', { deviceId: car.deviceId }, ADMIN)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ scenario: 'board', replacedParkings: 1 })
    expect(r.body.me).toMatchObject({
      joined: true,
      nickname: '판교 느긋한 수달',
      league: LEAGUE,
      week: WEEK,
      rank: 12,
      total: 148,
      percentile: 9,
      score: { total: 82, maneuver: 58, lotsVisited: 13, improvement: 11 },
      prevWeekRank: 17,
      nextHint: '한 번만 더 깔끔하게 대면 10등이에요',
    })
    // M-51: 이번 주에 댄 곳 (최신순)
    expect(r.body.me.parkings.map((p: any) => [p.lotName, p.reverseCount, p.grade, p.excludedReason])).toEqual([
      ['현대백화점 판교점 지하주차장', 1, 'CLEAN', null],
      ['백현마을 5단지 지하주차장', 1, 'EXCLUDED', 'SPEED'],
      ['H스퀘어 지하주차장', 2, 'OK', null],
      ['아브뉴프랑 판교 주차장', 0, 'CLEAN', null],
    ])
    expect(r.body.me.parkings.every((p: any) => Date.parse(p.parkedAt) >= W && Date.parse(p.parkedAt) <= NOW)).toBe(true)
    // C-13 · M-50
    expect(r.body.board).toEqual({
      league: LEAGUE,
      week: WEEK,
      total: 148,
      top: TOP5,
      around: [
        { rank: 11, nickname: '판교 차분한 두루미', score: 84, isMe: false },
        { rank: 12, nickname: '판교 느긋한 수달', score: 82, isMe: true },
        { rank: 13, nickname: '운중 다정한 곰', score: 81, isMe: false },
      ],
      demo: true,
    })
    expect(r.body.lastWeek).toMatchObject({ rank: 17, total: 148, percentile: 12, score: 77, rankDelta: null })
    expect((await t.get('/v1/me/king', dev(phoneToken))).body).toEqual(r.body.me)
    expect((await t.get('/v1/me', dev(car.token))).body.settings.experience).toBe('UNDER_1Y')
    expect((await t.get('/v1/me/parkings/current', dev(phoneToken))).body.parking).toBeNull() // 시연 주차는 모두 "찾음"

    // C-05: 이미 간 곳(현대백화점)에 후진 없이 → 12등 → 10등
    const p = await put(t, car.token, 'filming-1', { lotId: 'hyundai-pangyo', reverse: 0, steering: 1, speed: 6, at: NOW - MIN })
    expect(p.body.king).toEqual({ rankBefore: 12, rankAfter: 10 })
    const after = (await t.get('/v1/me/king/board', dev(car.token))).body.around
    expect(after.map((x: any) => [x.rank, x.score, x.isMe])).toEqual([
      [9, 86, false], // 같은 86점이지만 후진·핸들 62 > 61
      [10, 86, true],
      [11, 85, false],
    ])

    // 며칠 뒤(같은 주)에도 그대로, 시연 참여자 점수도 그대로
    t.clock.t = NOW + 2 * DAY
    expect((await t.get('/v1/me/king/board', dev(car.token))).body).toMatchObject({ total: 148, top: TOP5 })
    expect((await t.get('/v1/me/king', dev(car.token))).body).toMatchObject({ rank: 10, score: { total: 86 } })
  })

  it('results: 지난주 9등 / 148명 (상위 7%), 지지난주 12등 → "3계단" · 상위 10% · 개척자 · 많이 올랐어요', async () => {
    const t = await makeApp()
    const car = await register(t, 'car')
    const r = await t.send('POST', '/v1/admin/king/demo-car', { deviceId: car.deviceId, scenario: 'results' }, ADMIN)
    expect(r.status).toBe(200)
    expect(r.body.lastWeek).toEqual({
      week: { start: '2026-10-25T15:00:00.000Z', end: '2026-11-01T15:00:00.000Z' },
      league: LEAGUE,
      rank: 9,
      total: 148,
      percentile: 7,
      score: 86,
      rankDelta: 3,
      badges: ['TOP10', 'PIONEER', 'CLIMBER'],
    })
    expect(r.body.me).toMatchObject({ rank: 12, total: 148, prevWeekRank: 9 })
    // 다시 해도 같은 결과 (시연 주차·순위를 바꿔 넣음)
    const again = await t.send('POST', '/v1/admin/king/demo-car', { deviceId: car.deviceId, scenario: 'results' }, ADMIN)
    expect(again.body).toMatchObject({ replacedParkings: 9, lastWeek: r.body.lastWeek, me: { rank: 12, score: r.body.me.score } })
    // board 로 되돌리기
    expect((await t.send('POST', '/v1/admin/king/demo-car', { deviceId: car.deviceId }, ADMIN)).body).toMatchObject({ me: { prevWeekRank: 17 }, lastWeek: { rank: 17, rankDelta: null } })
  })

  it('같은 닉네임을 쓰던 다른 차는 그만두기 처리 · 401 · 404 · 400', async () => {
    const t = await makeApp()
    const a = await register(t, 'car')
    const b = await register(t, 'car')
    await t.send('POST', '/v1/admin/king/demo-car', { deviceId: a.deviceId }, ADMIN)
    await t.send('POST', '/v1/admin/king/demo-car', { deviceId: b.deviceId }, ADMIN)
    expect((await t.get('/v1/me/king', dev(a.token))).body.joined).toBe(false)
    expect((await t.get('/v1/me/king', dev(b.token))).body).toMatchObject({ joined: true, rank: 12, total: 148 })

    const phone = await register(t, 'phone')
    expect((await t.send('POST', '/v1/admin/king/demo-car', { deviceId: a.deviceId })).status).toBe(401)
    expect((await t.send('POST', '/v1/admin/king/demo-car', { deviceId: 'no-such-device' }, ADMIN)).status).toBe(404)
    expect((await t.send('POST', '/v1/admin/king/demo-car', { deviceId: phone.deviceId }, ADMIN)).status).toBe(404)
    expect((await t.send('POST', '/v1/admin/king/demo-car', { deviceId: a.deviceId, scenario: 'nope' }, ADMIN)).status).toBe(400)
    expect((await t.send('POST', '/v1/admin/king/demo-car', {}, ADMIN)).status).toBe(400)
  })
})

describe('마이그레이션 v4', () => {
  it('주차왕 표 3개', async () => {
    const db = openDatabase(':memory:')
    await migrate(db)
    expect(MIGRATIONS.at(-1)!.version).toBe(4)
    const names = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'king_%' ORDER BY name")).rows.map((r) => r.name)
    expect(names).toEqual(['king_participants', 'king_week_scores', 'king_weeks'])
  })
})
