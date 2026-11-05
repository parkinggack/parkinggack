/** v1.2 주차왕 — 순수 계산(점수·판정·순위·힌트·배지·닉네임·주 경계)과 시연 참여자 시드 */
import { describe, expect, it } from 'vitest'
import {
  KING_ADJECTIVES,
  KING_ANIMALS,
  badgesFor,
  compareStandings,
  dongWords,
  generateNickname,
  gradeOf,
  isCleanWeek,
  isGeneratedNickname,
  isValidNickname,
  leagueOf,
  lotsVisitedPoints,
  maneuverFactor,
  nextHintFor,
  normalizeNickname,
  parseLeagueId,
  percentileOf,
  rankAmong,
  rankStandings,
  scoreWeek,
  weekRange,
  weekStartOf,
  type KingParkingIn,
  type Standing,
} from '../src/king.js'
import { KING_DEMO_LEAGUE_SIZES, KING_DEMO_OTTER, buildKingDemo, ensureKingDemo } from '../src/seed/king.js'
import { seedDatabase } from '../src/seed/index.js'
import { NOW, makeApp } from './helpers.js'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const W = weekStartOf(NOW) // 2026-11-02 (월) 00:00 KST

let n = 0
const P = (lotId: string | null, reverseCount: number, steeringTurns: number, maxSpeedKmh: number | null = null, parkedMs = W + HOUR): KingParkingIn => ({
  id: `p${++n}`,
  lotId,
  lotName: lotId ?? '이름만 있는 주차장',
  parkedMs,
  reverseCount,
  steeringTurns,
  maxSpeedKmh,
})
const st = (id: string, total: number, maneuver: number, joinedMs: number): Standing => ({
  id,
  nickname: id,
  demo: false,
  joinedMs,
  score: { total, maneuver, lotsVisited: 0, improvement: 0 },
})

/** 시안 M-51 의 이번 주 (시연 차 도우미가 넣는 것과 같음) + 지난달 평균 후진 3.6 */
const DESIGN_WEEK = () => [P('avenue-france-pangyo', 0, 2, 8), P('h-square', 2, 1, 9), P('baekhyun-5', 1, 1, 14), P('hyundai-pangyo', 1, 1, 7)]
const DESIGN_BASELINE = () => [4, 3, 4, 4, 3].map((r, i) => P(`lot-${i}`, r, 3, 7, W - (i + 1) * 4 * DAY))

describe('주 경계 — 월요일 00:00 Asia/Seoul', () => {
  it('화요일 17시 KST → 그 주 월요일 00:00 KST, 끝은 다음 월요일 (배타)', () => {
    expect(new Date(W).toISOString()).toBe('2026-11-01T15:00:00.000Z')
    expect(weekRange(W)).toEqual({ start: '2026-11-01T15:00:00.000Z', end: '2026-11-08T15:00:00.000Z' })
  })

  it('월요일 00:00 정각은 새 주, 일요일 23:59:59 는 지난주 (UTC 로는 일요일 15시가 경계)', () => {
    expect(weekStartOf(W)).toBe(W)
    expect(weekStartOf(W - 1)).toBe(W - 7 * DAY)
    expect(weekStartOf(W + 7 * DAY - 1)).toBe(W)
    expect(weekStartOf(Date.parse('2026-11-08T14:59:59Z'))).toBe(W) // 일요일 23:59:59 KST
    expect(weekStartOf(Date.parse('2026-11-08T15:00:00Z'))).toBe(W + 7 * DAY) // 월요일 00:00 KST
    expect(weekStartOf(Date.parse('2026-01-01T00:00:00Z'))).toBe(Date.parse('2025-12-28T15:00:00Z'))
  })
})

describe('판정 (깔끔 · 보통 · 빠짐)', () => {
  it.each([
    [0, 0, null, 'CLEAN', null],
    [1, 2, 10, 'CLEAN', null], // 시속 10km 까지는 괜찮음
    [2, 1, null, 'OK', null],
    [1, 3, 5, 'OK', null],
    [0, 0, 10.1, 'EXCLUDED', 'SPEED'],
    [5, 9, 14, 'EXCLUDED', 'SPEED'],
  ] as const)('후진 %i · 핸들 %i · 최고 %s km/h → %s', (r, s, v, grade, reason) => {
    expect(gradeOf({ reverseCount: r, steeringTurns: s, maxSpeedKmh: v })).toEqual({ grade, excludedReason: reason })
  })
})

describe('점수 (후진·핸들 70 + 가 본 주차장 15 + 지난달보다 15)', () => {
  it('시안 M-51 주: 58 + 13 + 11 = 82 (빠진 백현마을은 어디에도 안 셈)', () => {
    expect(scoreWeek(DESIGN_WEEK(), DESIGN_BASELINE())).toEqual({ total: 82, maneuver: 58, lotsVisited: 13, improvement: 11 })
  })

  it('후진·핸들 식: 1 − 0.16·후진 − 0.04·max(0, 핸들 − 1), 0~1 로 자름', () => {
    expect(maneuverFactor(0, 0)).toBe(1)
    expect(maneuverFactor(0, 1)).toBe(1)
    expect(maneuverFactor(1, 1)).toBeCloseTo(0.84)
    expect(maneuverFactor(0, 2)).toBeCloseTo(0.96)
    expect(maneuverFactor(2, 1)).toBeCloseTo(0.68)
    expect(maneuverFactor(0, 6)).toBeCloseTo(0.8)
    expect(maneuverFactor(7, 0)).toBe(0)
    expect(scoreWeek([P('a', 0, 6), P('a', 7, 0)], [])!.maneuver).toBe(28) // 70 × (0.8 + 0) / 2
  })

  it('한 건뿐이면 0.8배 (한 번 잘 댄 것으로 1등 되지 않게)', () => {
    expect(scoreWeek([P('a', 0, 1)], [])).toEqual({ total: 69, maneuver: 56, lotsVisited: 6, improvement: 7 })
    expect(scoreWeek([P('a', 0, 1), P('a', 0, 1)], [])).toEqual({ total: 83, maneuver: 70, lotsVisited: 6, improvement: 7 })
  })

  it('가 본 주차장 1→6, 2→10, 3→13, 4곳 이상→15 · 빠진 주차는 안 셈 · id 없으면 이름으로', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(lotsVisitedPoints)).toEqual([0, 6, 10, 13, 15, 15, 15])
    const lots = (k: number) => scoreWeek(Array.from({ length: k }, (_, i) => P(`l${i}`, 0, 1)), [])!.lotsVisited
    expect([1, 2, 3, 4, 5].map(lots)).toEqual([6, 10, 13, 15, 15])
    expect(scoreWeek([P('x', 0, 1), P('y', 0, 1), P('z', 0, 1, 11)], [])).toMatchObject({ lotsVisited: 10, maneuver: 70 })
    expect(scoreWeek([P(null, 0, 1), { ...P(null, 0, 1), lotName: '다른 곳' }], [])!.lotsVisited).toBe(10)
  })

  it('지난달보다: 이번 주 시작 전 30일 평균 후진 대비 준 비율 × 15, 기록이 없으면 7', () => {
    const two = (r: number) => [P('a', r, 1), P('b', r, 1)]
    expect(scoreWeek(two(1), [])!.improvement).toBe(7)
    expect(scoreWeek(two(1), [P('c', 2, 1)])!.improvement).toBe(8) // 2 → 1: 7.5 → 8
    expect(scoreWeek(two(0), [P('c', 3, 1)])!.improvement).toBe(15)
    expect(scoreWeek(two(2), [P('c', 1, 1)])!.improvement).toBe(0) // 늘었으면 0 (음수 없음)
    expect(scoreWeek(two(0), [P('c', 0, 1)])!.improvement).toBe(15) // 지난달도 0회 → 이번 주도 0회면 만점
    expect(scoreWeek(two(1), [P('c', 0, 1)])!.improvement).toBe(0)
    expect(scoreWeek(two(1), [P('c', 3, 1, 12)])!.improvement).toBe(7) // 지난달 것도 빠진 주차는 안 셈
  })

  it('빠지지 않은 주차가 없으면 점수 없음 (순위에 없음)', () => {
    expect(scoreWeek([], [])).toBeNull()
    expect(scoreWeek([P('a', 0, 0, 30)], [P('b', 1, 1)])).toBeNull()
  })
})

describe('순위 · 상위 %', () => {
  it('점수 → 후진·핸들 → 먼저 참여한 순', () => {
    const list = [st('a', 80, 50, 3), st('b', 80, 52, 5), st('c', 80, 52, 1), st('d', 90, 40, 9)]
    expect(rankStandings(list).map((r) => `${r.rank}${r.id}`)).toEqual(['1d', '2c', '3b', '4a'])
    expect(rankAmong(st('x', 80, 51, 0), list)).toBe(4)
    expect(rankAmong(st('x', 80, 52, 0), list)).toBe(2) // 같은 점수·같은 후진·핸들이면 먼저 참여한 쪽
    expect(compareStandings(st('a', 1, 1, 1), st('b', 1, 1, 1))).toBeLessThan(0) // 끝까지 같으면 id
  })

  it('상위 % = ceil(등수 / 인원 × 100)', () => {
    expect(percentileOf(1, 148)).toBe(1)
    expect(percentileOf(9, 148)).toBe(7)
    expect(percentileOf(12, 148)).toBe(9)
    expect(percentileOf(148, 148)).toBe(100)
    expect(percentileOf(10, 100)).toBe(10)
    expect(percentileOf(1, 1)).toBe(100)
  })
})

describe('다음 등수 힌트 (깔끔한 주차 한 번 더: 후진 0 · 핸들 1)', () => {
  const demoOthers = () =>
    rankStandings(
      buildKingDemo()
        .filter((p) => p.leagueId === 'pangyo:UNDER_1Y' && p.nickname !== KING_DEMO_OTTER)
        .map((p) => ({ id: p.id, nickname: p.nickname, demo: true, joinedMs: p.joinedMs, score: p.score })),
    )
  const me = { id: 'car', joinedMs: NOW }

  it('시안: 82점 12등 → "한 번만 더 깔끔하게 대면 10등이에요"', () => {
    const others = demoOthers()
    const score = scoreWeek(DESIGN_WEEK(), DESIGN_BASELINE())!
    const rank = rankAmong({ ...me, score }, others)
    expect(rank).toBe(12)
    expect(nextHintFor({ rank, me, thisWeek: DESIGN_WEEK(), baseline: DESIGN_BASELINE(), others, weekStart: W })).toBe('한 번만 더 깔끔하게 대면 10등이에요')
  })

  it('1등이면 "1등을 지키고 있어요", 아직 점수가 없으면 첫 주차로 몇 등인지', () => {
    expect(nextHintFor({ rank: 1, me, thisWeek: [], baseline: [], others: [], weekStart: W })).toBe('1등을 지키고 있어요')
    const others = demoOthers()
    const first = rankAmong({ ...me, score: scoreWeek([P('a', 0, 1)], [])! }, others)
    expect(nextHintFor({ rank: null, me, thisWeek: [], baseline: [], others, weekStart: W })).toBe(`깔끔하게 한 번 대면 ${first}등이에요`)
  })

  it('이미 간 곳으로는 안 오르면 새 주차장으로, 그래도 안 되면 null', () => {
    const twoSame = [P('a', 0, 1), P('a', 0, 1)] // 70 + 6 + 7 = 83
    expect(nextHintFor({ rank: 2, me, thisWeek: twoSame, baseline: [], others: [st('o', 85, 60, 0)], weekStart: W })).toBe('새 주차장에서 한 번 더 깔끔하게 대면 1등이에요')
    const four = ['a', 'b', 'c', 'd'].map((l) => P(l, 0, 1)) // 70 + 15 + 7 = 92 (더 올릴 칸 없음)
    expect(nextHintFor({ rank: 2, me, thisWeek: four, baseline: [], others: [st('o', 100, 70, 0)], weekStart: W })).toBeNull()
  })
})

describe('배지 (지난주 결과 M-53)', () => {
  it('조건과 순서 (상위 10% · 3등 안 · 1등 · 개척자 · 많이 올랐어요 · 깔끔한 한 주)', () => {
    expect(badgesFor({ rank: 1, percentile: 1, rankDelta: 5, pioneer: true, cleanWeek: true })).toEqual(['TOP10', 'TOP3', 'FIRST', 'PIONEER', 'CLIMBER', 'CLEAN_WEEK'])
    expect(badgesFor({ rank: 9, percentile: 7, rankDelta: 3, pioneer: true, cleanWeek: false })).toEqual(['TOP10', 'PIONEER', 'CLIMBER'])
    expect(badgesFor({ rank: 3, percentile: 30, rankDelta: 2, pioneer: false, cleanWeek: false })).toEqual(['TOP3'])
    expect(badgesFor({ rank: 20, percentile: 11, rankDelta: null, pioneer: false, cleanWeek: false })).toEqual([])
  })

  it('깔끔한 한 주: 판정 받은 주차가 모두 깔끔이고 3건 이상 (빠짐도 깨뜨림)', () => {
    const clean = () => [P('a', 0, 1), P('b', 1, 2), P('c', 0, 0)]
    expect(isCleanWeek(clean())).toBe(true)
    expect(isCleanWeek(clean().slice(0, 2))).toBe(false)
    expect(isCleanWeek([...clean(), P('d', 0, 0, 20)])).toBe(false)
    expect(isCleanWeek([...clean(), P('d', 2, 1)])).toBe(false)
  })
})

describe('리그 이름', () => {
  it('판교 초보 / 판교 · 1년 미만, 경력 모름은 "모두", 모르는 지역은 id 그대로', () => {
    expect(leagueOf('pangyo', 'UNDER_1Y')).toEqual({ id: 'pangyo:UNDER_1Y', region: 'pangyo', regionName: '판교', experience: 'UNDER_1Y', label: '판교 초보', longLabel: '판교 · 1년 미만' })
    expect(leagueOf('pangyo', 'UNKNOWN')).toMatchObject({ label: '판교 모두', longLabel: '판교 · 모든 경력' })
    expect(leagueOf('bundang', 'OVER_10Y')).toMatchObject({ label: '분당 베테랑', longLabel: '분당 · 10년 이상' })
    expect(leagueOf('jeju', 'Y1_3')).toMatchObject({ regionName: 'jeju', label: 'jeju 새내기' })
    expect(parseLeagueId('pangyo:Y3_10')).toEqual(leagueOf('pangyo', 'Y3_10'))
  })
})

describe('닉네임 "동네 형용사 동물"', () => {
  it('단어 목록: 판교 동네 4개, 형용사·동물 30개씩 (겹침 없음), 시안 닉네임은 모두 이 문법', () => {
    expect(dongWords('pangyo')).toEqual(['판교', '백현', '삼평', '운중'])
    expect(dongWords('jeju')).toEqual(['이웃'])
    expect(new Set(KING_ADJECTIVES).size).toBe(30)
    expect(new Set(KING_ANIMALS).size).toBe(30)
    for (const name of ['백현 조용한 고래', '삼평 단단한 펭귄', '운중 느린 거북', '판교 맑은 여우', '백현 둥근 너구리', '판교 차분한 두루미', '판교 느긋한 수달', '운중 다정한 곰']) {
      expect(isGeneratedNickname(name), name).toBe(true)
    }
    // 운전자를 평가하는 말은 없다
    expect([...KING_ADJECTIVES].join(' ')).not.toMatch(/서툰|못하는|위험|실패|난폭/)
  })

  it('생성: 이미 쓰는 이름은 피하고, 다 찼으면 숫자를 붙인다', () => {
    let i = 0
    const seq = (k: number) => i++ % k
    const a = generateNickname('pangyo', new Set(), seq)
    expect(isGeneratedNickname(a)).toBe(true)
    expect(dongWords('pangyo')).toContain(a.split(' ')[0])
    const zero = () => 0
    expect(generateNickname('pangyo', new Set(), zero)).toBe('판교 조용한 고래')
    expect(generateNickname('pangyo', new Set(['판교 조용한 고래']), zero)).toBe('판교 조용한 고래 2')
    expect(generateNickname('bundang', new Set(), zero)).toBe('정자 조용한 고래')
  })

  it('검증: 생성기 문법이거나 한글·영문·숫자·띄어쓰기 2~20자 (공백은 정리)', () => {
    for (const ok of ['판교 느긋한 수달', '주차왕 Kim 7', '수달', '  여러   칸 띄움 ', 'A1', '판교\t수달\n']) expect(isValidNickname(ok), JSON.stringify(ok)).toBe(true)
    for (const bad of ['', 'a', '  가  ', 'x'.repeat(21), '수달!', '수달🦦', 'ㅋㅋ', '판교_수달']) expect(isValidNickname(bad), JSON.stringify(bad)).toBe(false)
    expect(normalizeNickname('  판교   느긋한 \t수달 ')).toBe('판교 느긋한 수달')
  })
})

describe('시연 참여자 시드 (판교 × 경력 5개 리그)', () => {
  const demo = buildKingDemo()

  it('결정적 · 리그별 인원 · 지역 안에서 닉네임이 겹치지 않음 · 모두 생성기 문법', () => {
    expect(JSON.stringify(buildKingDemo())).toBe(JSON.stringify(demo))
    for (const [exp, size] of Object.entries(KING_DEMO_LEAGUE_SIZES)) expect(demo.filter((p) => p.leagueId === `pangyo:${exp}`), exp).toHaveLength(size)
    expect(demo).toHaveLength(712)
    expect(new Set(demo.map((p) => p.nickname)).size).toBe(demo.length)
    expect(demo.every((p) => isGeneratedNickname(p.nickname))).toBe(true)
    for (const p of demo) {
      const s = p.score
      expect(s.total).toBe(s.maneuver + s.lotsVisited + s.improvement)
      expect(s.maneuver).toBeGreaterThanOrEqual(0)
      expect(s.maneuver).toBeLessThanOrEqual(70)
      expect([6, 10, 13, 15]).toContain(s.lotsVisited)
      expect(s.improvement).toBeGreaterThanOrEqual(0)
      expect(s.improvement).toBeLessThanOrEqual(15)
    }
  })

  it('판교 초보 148명: 시안 C-13 · M-50 의 1~5등 · 11~13등 (순위 규칙으로 정렬해도 그 자리)', () => {
    const ranked = rankStandings(
      demo.filter((p) => p.leagueId === 'pangyo:UNDER_1Y').map((p) => ({ id: p.id, nickname: p.nickname, demo: true, joinedMs: p.joinedMs, score: p.score })),
    )
    const at = (r: number) => `${ranked[r - 1].nickname} ${ranked[r - 1].score.total}`
    expect([1, 2, 3, 4, 5, 11, 12, 13].map(at)).toEqual([
      '백현 조용한 고래 96',
      '삼평 단단한 펭귄 94',
      '운중 느린 거북 93',
      '판교 맑은 여우 91',
      '백현 둥근 너구리 90',
      '판교 차분한 두루미 84',
      '판교 느긋한 수달 82',
      '운중 다정한 곰 81',
    ])
    expect(ranked.slice(5, 10).map((r) => r.score.total)).toEqual([89, 88, 87, 86, 85])
    expect(ranked.map((r) => r.id)).toEqual([...ranked.map((r) => r.id)].sort()) // id 번호 = 순위
    expect(ranked.at(-1)!.score.total).toBeGreaterThan(10)
  })

  it('DB: 시드에 들어 있고, v1.2 전에 시드한 DB 에는 주차왕 시연 참여자만 더한다 (reset 해도 실제 차 참여는 그대로)', async () => {
    const t = await makeApp()
    expect(await t.store.count('SELECT COUNT(*) AS c FROM king_participants WHERE demo = 1')).toBe(712)
    expect(await ensureKingDemo(t.store)).toBe(0)
    await t.store.run('DELETE FROM king_participants')
    const s = await seedDatabase(t.store)
    expect(s).toMatchObject({ skipped: true, king: 712 })
    await t.store.run("INSERT INTO king_participants (id, car_id, nickname, region, experience, league_id, joined_ms) VALUES ('car-x', 'car-x', '주차 연습생', 'pangyo', 'Y1_3', 'pangyo:Y1_3', 1)")
    expect((await seedDatabase(t.store, { reset: true })).king).toBe(712)
    expect(await t.store.count("SELECT COUNT(*) AS c FROM king_participants WHERE id = 'car-x'")).toBe(1)
    const empty = await makeApp({ seed: false })
    expect(await ensureKingDemo(empty.store)).toBe(0) // 시드 안 한 DB 에는 넣지 않음
  })
})
