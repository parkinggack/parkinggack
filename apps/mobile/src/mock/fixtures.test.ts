/**
 * 시연 데이터가 계약(packages/api-types)과 같은 모양인지 — 타입은 tsc가(아래 satisfies), 값은 여기서 검사.
 * 서버가 바뀌어 화면이 깨지는 것을 막으려고, 화면이 기대는 규칙(현재 주차 1건, 후진 수 = 동선의 후진 등)도 같이 본다.
 */
import type {
  ClaimPairingResponse,
  CurrentParkingResponse,
  EasierLotsResponse,
  GetShareResponse,
  KingBoardResponse,
  KingMeResponse,
  KingResultResponse,
  ListLotsResponse,
  LotDetailResponse,
  MeResponse,
  MyParking,
  MyParkingsResponse,
  MyStatsResponse,
  ParkingLotDetail,
  ParkingShape,
  ReasonTag,
} from '@api-types'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { validate } from '../payload'
import { isValidPath } from '../replay'
import { DEMO_PAIR_CODE, lastMonths, lotFixtures, parkingFixtures, shareFixture, statsFixture } from './fixtures'
import { createMockApi } from './mockApi'
import { countReverses } from './pathgen'

const NOW = new Date('2026-11-03T17:02:00+09:00').getTime()
const TAGS: ReasonTag[] = ['SPIRAL_RAMP', 'NARROW_AISLE', 'MANY_PILLARS', 'MECHANICAL', 'STEEP_SLOPE', 'FREQUENT_REVERSE', 'SPACIOUS', 'FLAT', 'MANY_FLOORS']
const SHAPES: ParkingShape[] = ['PERPENDICULAR', 'PARALLEL', 'ANGLED', 'UNKNOWN']
const isIso = (s: unknown) => typeof s === 'string' && !Number.isNaN(Date.parse(s)) && /T.*Z$/.test(s)
const isStr = (s: unknown) => typeof s === 'string'
const isStrOrNull = (s: unknown) => s === null || typeof s === 'string'

function checkLot(l: ParkingLotDetail) {
  expect(isStr(l.id) && /^[a-z0-9-]+$/.test(l.id)).toBe(true)
  expect(isStr(l.name)).toBe(true)
  expect(typeof l.location.lat).toBe('number')
  expect(typeof l.location.lng).toBe('number')
  expect(l.difficulty === null || (l.difficulty >= 0 && l.difficulty <= 5)).toBe(true)
  expect(l.tags.every((t) => TAGS.includes(t))).toBe(true)
  expect(Array.isArray(l.statChips) && Array.isArray(l.floors) && Array.isArray(l.publicInfo)).toBe(true)
  expect(Number.isInteger(l.sampleCount) && Number.isInteger(l.ratingCount)).toBe(true)
  expect(Array.isArray(l.zoneScheme.zones) && Array.isArray(l.zoneScheme.numbers)).toBe(true)
  expect(isStrOrNull(l.feeText)).toBe(true)
  expect(isIso(l.updatedAt)).toBe(true)
  if (l.difficulty === null) expect(l.sampleCount).toBeLessThan(10) // MIN_SAMPLES
  if (l.stats) {
    for (const k of ['avgReverse', 'overallAvgReverse', 'avgRampTurns', 'overallAvgRampTurns', 'avgDurationSec', 'overallAvgDurationSec'] as const) expect(typeof l.stats[k]).toBe('number')
    expect(l.stats.floorCongestion.every((f) => isStr(f.floor) && f.occupancy >= 0 && f.occupancy <= 1)).toBe(true)
    expect(l.stats.hourlyHeat).toHaveLength(7)
    expect(l.stats.hourlyHeat.every((row) => row.length === l.stats!.hourLabels.length)).toBe(true)
  }
}

function checkParking(p: MyParking) {
  expect(isStr(p.id)).toBe(true)
  expect(isStrOrNull(p.lotId) && isStr(p.lotName)).toBe(true)
  for (const k of ['floor', 'zone', 'number', 'note'] as const) expect(isStrOrNull(p[k])).toBe(true)
  expect(isIso(p.parkedAt) && isIso(p.updatedAt)).toBe(true)
  expect(p.foundAt === null || isIso(p.foundAt)).toBe(true)
  expect(Array.isArray(p.hints) && p.hints.length <= 4 && p.hints.every(isStr)).toBe(true)
  expect(p.route === null || (Array.isArray(p.route) && p.route.every(Number.isInteger))).toBe(true)
  expect(isValidPath(p.path)).toBe(true)
  expect(p.path.length).toBeLessThanOrEqual(300)
  if (p.summary) {
    expect(SHAPES).toContain(p.summary.shape)
    expect(p.summary.reverseCount).toBe(countReverses(p.path))
    expect(p.summary.durationSec).toBeGreaterThan(0)
  }
}

describe('시연 데이터 = 계약 모양', () => {
  it('주차장 (ParkingLotDetail)', () => {
    const lots = lotFixtures(NOW)
    expect(lots.length).toBeGreaterThanOrEqual(9)
    lots.forEach(checkLot)
    expect(new Set(lots.map((l) => l.id)).size).toBe(lots.length)
    // 시안 값
    const byId = Object.fromEntries(lots.map((l) => [l.id, l]))
    expect(byId['hyundai-pangyo'].difficulty).toBe(4.3)
    expect(byId['h-square'].difficulty).toBe(3.1)
    expect(byId['baekhyun-5'].difficulty).toBe(1.6)
    expect(byId['avenue-france-pangyo'].difficulty).toBe(1.8)
  })

  it('내 주차 (MyParking) — 지금 주차 중은 하나, 시안의 B2 · D-07 아브뉴프랑', () => {
    const ps = parkingFixtures(NOW)
    ps.forEach(checkParking)
    const current = ps.filter((p) => !p.foundAt)
    expect(current).toHaveLength(1)
    expect(current[0]).toMatchObject({ lotName: '아브뉴프랑 판교 주차장', floor: 'B2', zone: 'D', number: '07', note: '엘리베이터 2번 쪽' })
    expect(current[0].summary).toMatchObject({ reverseCount: 2, durationSec: 100 })
    // 최신순
    const times = ps.map((p) => Date.parse(p.parkedAt))
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })

  it('통계 (MyStatsResponse) — 6개월, 이번 달이 마지막, 자주 간 곳은 있는 주차장', () => {
    const s = statsFixture(NOW)
    expect(s.monthly.map((m) => m.month)).toEqual(lastMonths(NOW))
    expect(s.monthly[s.monthly.length - 1].month).toBe('2026-11')
    expect(s.monthly.every((m) => /^\d{4}-\d{2}$/.test(m.month) && typeof m.avgReverse === 'number')).toBe(true)
    const ids = new Set(lotFixtures(NOW).map((l) => l.id))
    expect(s.favorites.every((f) => ids.has(f.lotId) && Number.isInteger(f.count))).toBe(true)
    expect(s.favorites.length).toBeLessThanOrEqual(3)
  })

  it('짧은 링크 payload = 폰 링크(payload.ts)와 같은 형식', () => {
    const p = shareFixture(NOW)
    expect(validate(p)).toEqual(p)
  })
})

describe('시연 Api (서버와 같은 동작)', () => {
  const api = () => createMockApi({ now: () => NOW, latencyMs: 0, persist: false })

  it('응답이 계약 타입과 맞음 (tsc) + 값', async () => {
    const a = api()
    const claim = (await a.claimPairing(DEMO_PAIR_CODE)) satisfies ClaimPairingResponse
    expect(claim.token).toBeTruthy()
    const me = (await a.me()) satisfies MeResponse
    expect(me.kind).toBe('phone')
    const cur: CurrentParkingResponse['parking'] = await a.currentParking()
    checkParking(cur!)
    const list = (await a.parkings({ limit: 2 })) satisfies MyParkingsResponse
    expect(list.parkings).toHaveLength(2)
    expect(list.nextBefore).toBe(list.parkings[1].parkedAt)
    const next = await a.parkings({ limit: 50, before: list.nextBefore })
    expect(next.parkings.every((p) => p.parkedAt < list.nextBefore!)).toBe(true)
    expect(next.nextBefore).toBeNull()
    const stats = (await a.stats()) satisfies MyStatsResponse
    expect(stats.thisMonthAvgReverse).toBe(1.6)
    const lots: ListLotsResponse['lots'] = await a.lots({ lat: 37.3947, lng: 127.1112, radius: 1000 })
    expect(lots.length).toBeGreaterThan(3)
    expect(lots.every((l) => (l.distanceM ?? 0) <= 1000)).toBe(true)
    const d = lots.map((l) => l.distanceM!)
    expect([...d].sort((x, y) => x - y)).toEqual(d)
    const lot: LotDetailResponse['lot'] = await a.lot('hyundai-pangyo')
    checkLot(lot)
    const easier: EasierLotsResponse['suggestions'] = await a.easier('hyundai-pangyo', { radius: 800 })
    expect(easier.length).toBeGreaterThan(0)
    expect(easier.every((s) => s.lot.difficulty! < 4.3 && s.walkMinutes > 0 && s.pitch.startsWith('걸어서'))).toBe(true)
    const sorted = easier.map((s) => s.lot.difficulty!)
    expect([...sorted].sort((x, y) => x - y)).toEqual(sorted)
    const share = (await a.share('k7m2qp')) satisfies GetShareResponse
    expect(validate(share.payload)).not.toBeNull()
  })

  it('차 찾았어요 → 지금 주차 중 없음', async () => {
    const a = api()
    const cur = await a.currentParking()
    const after = await a.found(cur!.id)
    expect(after.foundAt).not.toBeNull()
    expect(await a.currentParking()).toBeNull()
  })

  it('오류도 서버처럼', async () => {
    const a = api()
    expect(((await a.lot('nope').catch((e) => e)) as ApiError).code).toBe('not_found')
    expect(((await a.claimPairing('12').catch((e) => e)) as ApiError).code).toBe('bad_request')
    expect(((await a.share('gone').catch((e) => e)) as ApiError).status).toBe(410)
    expect(await a.pushKey()).toBeNull() // 시연에는 웹 푸시 키 없음 → 폴링
  })
})

describe('주차왕 시연 데이터 (v1.2, 시안 M-50~M-53)', () => {
  const THU = new Date('2026-11-05T17:02:00+09:00').getTime()
  const MON = new Date('2026-11-09T09:12:00+09:00').getTime()
  const kapi = (now = THU) => createMockApi({ now: () => now, latencyMs: 0, persist: false })

  it('참여 전: joined=false, 리그 미리 보기(판교 · 1년 미만), 순위판은 409, 지난주 결과 없음', async () => {
    const a = kapi()
    const me = (await a.kingMe()) satisfies KingMeResponse
    expect(me.joined).toBe(false)
    expect(me.league?.longLabel).toBe('판교 · 1년 미만')
    expect(me.total).toBe(148)
    expect(((await a.kingBoard().catch((e) => e)) as ApiError).code).toBe('conflict')
    expect(await a.kingResultLast()).toBeNull()
  })

  it('M-52 닉네임: 처음은 "판교 느긋한 수달", 다시 뽑으면 다른 이름', async () => {
    const a = kapi()
    const n1 = await a.kingNickname('pangyo')
    const n2 = await a.kingNickname('pangyo')
    expect(n1).toBe('판교 느긋한 수달')
    expect(n2).not.toBe(n1)
    expect(n2.startsWith('판교 ')).toBe(true)
  })

  it('참여하면 M-50·M-51 값: 12등 · 82점 (58/70 · 11/15 · 13/15), 지난주 17등, 이번 주 4곳', async () => {
    const a = kapi()
    const me = (await a.kingJoin({ nickname: '판교 느긋한 수달' })) satisfies KingMeResponse
    expect(me).toMatchObject({ joined: true, nickname: '판교 느긋한 수달', rank: 12, total: 148, prevWeekRank: 17, nextHint: '한 번만 더 깔끔하게 대면 10등이에요' })
    expect(me.score).toEqual({ total: 82, maneuver: 58, lotsVisited: 11, improvement: 13 })
    expect(me.score!.maneuver + me.score!.lotsVisited + me.score!.improvement).toBe(me.score!.total)
    expect(me.parkings.map((p) => p.grade)).toEqual(['CLEAN', 'CLEAN', 'OK', 'EXCLUDED'])
    expect(me.parkings[3].excludedReason).toBe('SPEED')
    expect(me.parkings.every((p) => isIso(p.parkedAt) && Date.parse(p.parkedAt) <= THU && Date.parse(p.parkedAt) >= Date.parse(me.week.start))).toBe(true)
    expect(Date.parse(me.week.end) - Date.parse(me.week.start)).toBe(7 * 86_400_000)
  })

  it('월·화요일에 열어도 이번 주에 댄 곳은 미래가 아님', async () => {
    const tue = new Date('2026-11-03T08:00:00+09:00').getTime()
    const me = await kapi(tue).kingJoin({ nickname: 'x' })
    expect(me.parkings.every((p) => Date.parse(p.parkedAt) < tue)).toBe(true)
  })

  it('M-50 순위판: 1~5등 (1등 96점) + 11·12(나)·13, 시연 표시', async () => {
    const a = kapi()
    await a.kingJoin({ nickname: '판교 느긋한 수달' })
    const b = (await a.kingBoard()) satisfies KingBoardResponse
    expect(b.top.map((r) => [r.rank, r.nickname, r.score])).toEqual([
      [1, '백현 조용한 고래', 96],
      [2, '삼평 단단한 펭귄', 94],
      [3, '운중 느린 거북', 93],
      [4, '판교 맑은 여우', 91],
      [5, '백현 둥근 너구리', 90],
    ])
    expect(b.around.map((r) => [r.rank, r.nickname, r.score, r.isMe])).toEqual([
      [11, '판교 차분한 두루미', 84, false],
      [12, '판교 느긋한 수달', 82, true],
      [13, '운중 다정한 곰', 81, false],
    ])
    expect(b.demo).toBe(true)
    expect(b.league.label).toBe('판교 초보')
  })

  it('M-53 지난주 결과: 9등 · 148명 · 상위 6% · 3계단 · 상위 10%·개척자, 지난주(월~일)', async () => {
    const a = kapi(MON)
    await a.kingJoin({ nickname: 'x' })
    const r = (await a.kingResultLast()) satisfies KingResultResponse | null
    expect(r).toMatchObject({ rank: 9, total: 148, percentile: 6, rankDelta: 3, badges: ['TOP10', 'PIONEER'] })
    expect(r!.week).toEqual({ start: '2026-11-01T15:00:00.000Z', end: '2026-11-08T15:00:00.000Z' })
  })

  it('그만두기 → 다시 참여 전, 이상한 닉네임은 400', async () => {
    const a = kapi()
    await a.kingJoin({ nickname: '판교 느긋한 수달' })
    await a.kingLeave()
    expect((await a.kingMe()).joined).toBe(false)
    expect(((await a.kingJoin({ nickname: '  ' }).catch((e) => e)) as ApiError).code).toBe('bad_request')
  })
})
