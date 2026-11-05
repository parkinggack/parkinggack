import { describe, expect, it } from 'vitest'
import {
  autoTags,
  bayesianScore,
  congestionSummary,
  emptyHeat,
  experienceFactor,
  floorCongestion,
  heatBucket,
  isWeekdayAfternoon,
  mergeTags,
  normalizeHeat,
  overallFrom,
  publicDifficulty,
  rawDifficulty,
  recordDifficulty,
  scoreLot,
  dashBucket,
  shortLotName,
  statChips,
  vehicleFactor,
  type DifficultyInput,
  type LotAggregate,
} from '../src/scoring.js'
import { distanceMeters, walkMinutes } from '../src/geo.js'

const rec = (o: Partial<DifficultyInput> = {}): DifficultyInput => ({
  reverseCount: 0,
  steeringTurns: 0,
  durationSec: 40,
  rampTurns: 0,
  vehicleClass: 'MIDSIZE',
  experience: 'Y3_10',
  ...o,
})

describe('기록 한 건의 난이도 d', () => {
  it('식: 1 + 0.55·후진 + 0.7·램프 + 0.35·max(0,(초−40)/30) + 0.12·핸들', () => {
    expect(rawDifficulty(rec())).toBe(1)
    expect(rawDifficulty(rec({ reverseCount: 2, rampTurns: 1, durationSec: 100, steeringTurns: 3 }))).toBeCloseTo(1 + 1.1 + 0.7 + 0.7 + 0.36, 10)
    // 40초 이하는 시간 벌점 없음
    expect(rawDifficulty(rec({ durationSec: 10 }))).toBe(1)
  })

  it('1~5로 자른다', () => {
    expect(recordDifficulty(rec())).toBe(1)
    expect(recordDifficulty(rec({ reverseCount: 20, rampTurns: 5, durationSec: 900 }))).toBe(5)
  })

  it('차 크기 보정: LARGE·SUV ×0.92, COMPACT ×1.05', () => {
    expect(vehicleFactor('LARGE')).toBe(0.92)
    expect(vehicleFactor('SUV')).toBe(0.92)
    expect(vehicleFactor('COMPACT')).toBe(1.05)
    expect(vehicleFactor('MIDSIZE')).toBe(1)
    expect(vehicleFactor('UNKNOWN')).toBe(1)
    const base = rec({ reverseCount: 2, rampTurns: 1 }) // raw 2.8
    expect(recordDifficulty({ ...base, vehicleClass: 'SUV' })).toBeCloseTo(2.8 * 0.92, 10)
    expect(recordDifficulty({ ...base, vehicleClass: 'COMPACT' })).toBeCloseTo(2.8 * 1.05, 10)
  })

  it('경력 보정: UNDER_1Y ×0.92, 차 크기와 곱해진다', () => {
    expect(experienceFactor('UNDER_1Y')).toBe(0.92)
    expect(experienceFactor('OVER_10Y')).toBe(1)
    const base = rec({ reverseCount: 2, rampTurns: 1, vehicleClass: 'LARGE', experience: 'UNDER_1Y' })
    expect(recordDifficulty(base)).toBeCloseTo(2.8 * 0.92 * 0.92, 10)
  })

  it('보정 뒤에도 1 아래·5 위로는 안 나간다', () => {
    expect(recordDifficulty(rec({ vehicleClass: 'SUV', experience: 'UNDER_1Y' }))).toBe(1)
    expect(recordDifficulty(rec({ reverseCount: 6, rampTurns: 2, vehicleClass: 'COMPACT' }))).toBe(5)
  })
})

describe('주차장 점수 (베이지안, k=5, 사전값 3.0, 별점 가중 0.5)', () => {
  it('표본이 없으면 3.0', () => {
    expect(bayesianScore({ dSum: 0, n: 0, starSum: 0, ratingCount: 0 })).toBe(3)
  })

  it('표본이 적으면 3.0 쪽으로 당긴다', () => {
    // d=5 다섯 건 → (25 + 15) / (5 + 5) = 4
    expect(bayesianScore({ dSum: 25, n: 5, starSum: 0, ratingCount: 0 })).toBe(4)
    // 많으면 평균에 가까움
    expect(bayesianScore({ dSum: 500, n: 100, starSum: 0, ratingCount: 0 })).toBeCloseTo(515 / 105, 10)
  })

  it('별점은 0.5 가중으로 합쳐진다', () => {
    // (20 + 15 + 0.5·(1+1)) / (10 + 5 + 0.5·2) = 36/16
    expect(bayesianScore({ dSum: 20, n: 10, starSum: 2, ratingCount: 2 })).toBe(36 / 16)
  })

  it('30일 표본 < 10 이면 null, 아니면 소수 한 자리', () => {
    expect(publicDifficulty(4.26, 9)).toBeNull()
    expect(publicDifficulty(4.26, 10)).toBe(4.3)
    expect(publicDifficulty(4.249, 142)).toBe(4.2)
  })
})

describe('태그·수치 칩', () => {
  const base = { n: 50, avgReverse: 1.5, avgRampTurns: 0.5, avgDurationSec: 70, floorCount: 3 }

  it('자동 태그 규칙', () => {
    expect(autoTags(base)).toEqual([])
    expect(autoTags({ ...base, avgReverse: 2.5 })).toEqual(['FREQUENT_REVERSE'])
    expect(autoTags({ ...base, avgRampTurns: 1.5 })).toEqual(['SPIRAL_RAMP'])
    expect(autoTags({ ...base, avgReverse: 1, avgDurationSec: 60 })).toEqual(['SPACIOUS'])
    expect(autoTags({ ...base, avgReverse: 1, avgDurationSec: 61 })).toEqual([])
    expect(autoTags({ ...base, floorCount: 5 })).toEqual(['MANY_FLOORS'])
    // 기록이 없으면 층 수만
    expect(autoTags({ n: 0, avgReverse: 0, avgRampTurns: 0, avgDurationSec: 0, floorCount: 7 })).toEqual(['MANY_FLOORS'])
  })

  it('수동 먼저, 자동 이어서, 중복 없이 최대 3개', () => {
    expect(mergeTags(['SPIRAL_RAMP', 'MANY_PILLARS'], ['FREQUENT_REVERSE', 'SPIRAL_RAMP', 'MANY_FLOORS'])).toEqual([
      'SPIRAL_RAMP',
      'MANY_PILLARS',
      'FREQUENT_REVERSE',
    ])
    expect(mergeTags([], ['SPACIOUS', 'MANY_FLOORS'])).toEqual(['SPACIOUS', 'MANY_FLOORS'])
    expect(mergeTags(['MECHANICAL', 'NARROW_AISLE', 'MANY_PILLARS', 'STEEP_SLOPE'], [])).toHaveLength(3)
  })

  it('운영자 태그와 맞지 않는 자동 태그는 뺀다', () => {
    expect(mergeTags(['NARROW_AISLE'], ['SPACIOUS'])).toEqual(['NARROW_AISLE'])
    expect(mergeTags(['FLAT'], ['SPIRAL_RAMP', 'MANY_FLOORS'])).toEqual(['FLAT', 'MANY_FLOORS'])
  })

  it('평균 후진 ≥ 2 → "평균 후진 3.2회"', () => {
    expect(statChips({ n: 10, avgReverse: 3.2 })).toEqual(['평균 후진 3.2회'])
    expect(statChips({ n: 10, avgReverse: 2 })).toEqual(['평균 후진 2.0회'])
    expect(statChips({ n: 10, avgReverse: 1.99 })).toEqual([])
    expect(statChips({ n: 0, avgReverse: 3 })).toEqual([])
  })
})

describe('층별 혼잡', () => {
  it('평일 오후 = 월~금 13시 ≤ 시 < 18시', () => {
    expect(isWeekdayAfternoon(1, 13)).toBe(true)
    expect(isWeekdayAfternoon(5, 17)).toBe(true)
    expect(isWeekdayAfternoon(5, 18)).toBe(false)
    expect(isWeekdayAfternoon(3, 12)).toBe(false)
    expect(isWeekdayAfternoon(6, 14)).toBe(false)
  })

  it('최댓값 1로 정규화, 층 순서는 주차장 floors, 기록 없는 층은 뺀다', () => {
    const floors = ['1F', 'B1', 'B2', 'B3']
    const fc = floorCongestion(floors, { B1: 40, B2: 20, B3: 10 }, new Set(['B1', 'B2', 'B3']))
    expect(fc).toEqual([
      { floor: 'B1', occupancy: 1 },
      { floor: 'B2', occupancy: 0.5 },
      { floor: 'B3', occupancy: 0.25 },
    ])
    // 90일 기록은 있는데 평일 오후에는 없는 층 → 0
    expect(floorCongestion(floors, { B1: 4 }, new Set(['1F', 'B1']))).toEqual([
      { floor: '1F', occupancy: 0 },
      { floor: 'B1', occupancy: 1 },
    ])
    expect(floorCongestion(floors, {}, new Set(['B1']))).toEqual([])
  })

  it('요약: 시안 값 그대로', () => {
    const fc = (occ: number[]) => occ.map((o, i) => ({ floor: `B${i + 1}`, occupancy: o }))
    expect(congestionSummary(fc([1, 0.9, 0.6, 0.4, 0.3, 0.2]))).toBe('B1 만차 · B3부터 여유')
    expect(congestionSummary(fc([1, 0.71, 0.43]))).toBe('B2부터 여유')
    expect(congestionSummary(fc([1, 0.96, 0.85]))).toBe('B1·B2 만차')
    expect(congestionSummary(fc([0.9, 1]))).toBe('층마다 비슷해요')
    expect(congestionSummary([{ floor: '1F', occupancy: 1 }])).toBe('한 층 주차장')
    expect(congestionSummary([])).toBe('')
  })
})

describe('시간대 히트맵', () => {
  it('10시부터 2시간씩 6칸', () => {
    expect(heatBucket(9)).toBe(-1)
    expect(heatBucket(10)).toBe(0)
    expect(heatBucket(11)).toBe(0)
    expect(heatBucket(13)).toBe(1)
    expect(heatBucket(21)).toBe(5)
    expect(heatBucket(22)).toBe(-1)
  })

  it('최댓값 1로 정규화', () => {
    const h = emptyHeat()
    h[5][3] = 8
    h[0][0] = 2
    const n = normalizeHeat(h)
    expect(n).toHaveLength(7)
    expect(n[0]).toHaveLength(6)
    expect(n[5][3]).toBe(1)
    expect(n[0][0]).toBe(0.25)
    expect(normalizeHeat(emptyHeat()).flat().every((v) => v === 0)).toBe(true)
  })
})

describe('scoreLot', () => {
  const agg = (o: Partial<LotAggregate> = {}): LotAggregate => ({
    n90: 0,
    n30: 0,
    dSum: 0,
    reverseSum: 0,
    rampSum: 0,
    durationSum: 0,
    ratingCount: 0,
    starSum: 0,
    floorsSeen: new Set(),
    afternoonFloors: {},
    heatCounts: emptyHeat(),
    ...o,
  })

  it('기록이 없으면 stats null, difficulty null, 점수 3.0', () => {
    const s = scoreLot(agg(), { floors: ['1F'], manualTags: ['FLAT'] })
    expect(s).toMatchObject({ score: 3, difficulty: null, stats: null, sampleCount: 0, tags: ['FLAT'], statChips: [] })
  })

  it('평균은 90일 기록, 표본 수는 30일', () => {
    const s = scoreLot(
      agg({ n90: 20, n30: 12, dSum: 80, reverseSum: 64, rampSum: 50, durationSum: 2600, floorsSeen: new Set(['B1']), afternoonFloors: { B1: 3 } }),
      { floors: ['1F', 'B1'], manualTags: [] },
    )
    expect(s.sampleCount).toBe(12)
    expect(s.scoreSampleCount).toBe(20)
    expect(s.score).toBeCloseTo(95 / 25, 10)
    expect(s.difficulty).toBe(3.8)
    expect(s.stats).toMatchObject({ avgReverse: 3.2, avgRampTurns: 2.5, avgDurationSec: 130, congestionLabel: '평일 오후', hourLabels: ['10시', '12시', '14시', '16시', '18시', '20시'] })
    expect(s.tags).toEqual(['FREQUENT_REVERSE', 'SPIRAL_RAMP'])
    expect(s.statChips).toEqual(['평균 후진 3.2회'])
  })

  it('전체 평균: 주차장마다 같은 무게 (기록 많은 곳이 끌고 가지 않음)', () => {
    // 평균 후진 2.0 (기록 100) 과 1.0 (기록 2) → 1.5
    expect(
      overallFrom([
        { n: 100, reverseSum: 200, rampSum: 100, durationSum: 9000 },
        { n: 2, reverseSum: 2, rampSum: 1, durationSum: 80 },
        { n: 0, reverseSum: 0, rampSum: 0, durationSum: 0 },
      ]),
    ).toEqual({ overallAvgReverse: 1.5, overallAvgRampTurns: 0.8, overallAvgDurationSec: 65 })
    expect(overallFrom([])).toEqual({ overallAvgReverse: 0, overallAvgRampTurns: 0, overallAvgDurationSec: 0 })
  })

  it('대시보드 칸·짧은 이름', () => {
    expect(dashBucket(7)).toBe(-1)
    expect(dashBucket(8)).toBe(0)
    expect(dashBucket(23)).toBe(7)
    expect(dashBucket(24)).toBe(-1)
    expect(shortLotName('현대백화점 판교점 지하주차장')).toBe('현대백화점 판교점 지하')
    expect(shortLotName('아브뉴프랑 판교 주차장')).toBe('아브뉴프랑 판교')
    expect(shortLotName('H스퀘어')).toBe('H스퀘어')
    expect(shortLotName('주차장')).toBe('주차장')
  })
})

describe('거리·도보 (차량 앱과 같은 식)', () => {
  it('현대백화점 ↔ 아브뉴프랑 약 205m, 걸어서 4분', () => {
    const m = distanceMeters({ lat: 37.3926, lng: 127.1121 }, { lat: 37.3943, lng: 127.1112 })
    expect(m).toBeGreaterThan(200)
    expect(m).toBeLessThan(210)
    expect(walkMinutes(m)).toBe(4)
  })

  it('ceil(m × 1.3 / 75), 최소 1분', () => {
    expect(walkMinutes(0)).toBe(1)
    expect(walkMinutes(57)).toBe(1) // 57 × 1.3 = 74.1m
    expect(walkMinutes(58)).toBe(2) // 75.4m
    expect(walkMinutes(1000)).toBe(18)
  })
})
