/**
 * 난이도 점수 — docs/api.md "난이도 점수" 그대로. 순수 함수만 (DB 없음, 단위 테스트 대상).
 *
 *   d = clamp((1 + 0.55·후진 + 0.7·램프바퀴 + 0.35·max(0, (걸린초 − 40) / 30) + 0.12·핸들꺾음) × 차 크기 × 경력, 1, 5)
 *   score = (Σd + 3.0·k + Σ별점·0.5) / (n + k + 별점수·0.5),  k = 5      (기록·별점 모두 최근 90일)
 *   최근 30일 기록 < 10 이면 difficulty = null
 */
import type { DrivingExperience, FloorCongestion, LotStats, RampKind, ReasonTag, VehicleClass } from '@parkinggack/api-types'

export const K = 5
export const PRIOR = 3.0
export const RATING_WEIGHT = 0.5
export const SCORE_WINDOW_DAYS = 90
export const SAMPLE_WINDOW_DAYS = 30
/** = packages/api-types MIN_SAMPLES (test/contract.test.ts 가 확인) */
export const MIN_SAMPLES = 10
export const MAX_TAGS = 3
export const DAY_MS = 86_400_000
export const HOUR_MS = 3_600_000

export const CONGESTION_LABEL = '평일 오후'
/** 층별 혼잡을 보는 시간: 평일(월~금) 13시 ≤ 주차 시각 < 18시 */
export const AFTERNOON_FROM_HOUR = 13
export const AFTERNOON_TO_HOUR = 18
/** 시간대 히트맵: 10시부터 2시간씩 6칸 (10–11, 12–13, …, 20–21시) */
export const HEAT_FIRST_HOUR = 10
export const HEAT_BUCKET_HOURS = 2
export const HOUR_LABELS = ['10시', '12시', '14시', '16시', '18시', '20시']

export interface DifficultyInput {
  reverseCount: number
  steeringTurns: number
  durationSec: number
  rampTurns: number
  vehicleClass: VehicleClass
  experience: DrivingExperience
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}
export const round1 = (x: number) => Math.round(x * 10) / 10
export const round2 = (x: number) => Math.round(x * 100) / 100

/** 보정 전 값 (1 이상) */
export function rawDifficulty(r: Pick<DifficultyInput, 'reverseCount' | 'steeringTurns' | 'durationSec' | 'rampTurns'>): number {
  return 1 + 0.55 * r.reverseCount + 0.7 * r.rampTurns + 0.35 * Math.max(0, (r.durationSec - 40) / 30) + 0.12 * r.steeringTurns
}

/** 큰 차는 원래 어려우니 덜 반영, 작은 차는 조금 더 */
export function vehicleFactor(v: VehicleClass): number {
  return v === 'LARGE' || v === 'SUV' ? 0.92 : v === 'COMPACT' ? 1.05 : 1
}

/** 초보는 원래 오래 걸리니 덜 반영 */
export function experienceFactor(e: DrivingExperience): number {
  return e === 'UNDER_1Y' ? 0.92 : 1
}

/** 기록 한 건의 난이도 d (1~5). 보정을 곱한 뒤 1~5로 자른다 */
export function recordDifficulty(r: DifficultyInput): number {
  return clamp(rawDifficulty(r) * vehicleFactor(r.vehicleClass) * experienceFactor(r.experience), 1, 5)
}

/** 베이지안 평균 — 표본이 적으면 3.0 쪽으로 당긴다 */
export function bayesianScore(a: { dSum: number; n: number; starSum: number; ratingCount: number }): number {
  return (a.dSum + PRIOR * K + a.starSum * RATING_WEIGHT) / (a.n + K + a.ratingCount * RATING_WEIGHT)
}

/** 공개 값: 소수 한 자리, 30일 표본이 MIN_SAMPLES 미만이면 null (데이터 부족 카드) */
export function publicDifficulty(score: number, sampleCount30: number): number | null {
  return sampleCount30 < MIN_SAMPLES ? null : round1(score)
}

export interface TagInput {
  /** 90일 기록 수. 0이면 기록으로 정하는 태그는 없음 */
  n: number
  avgReverse: number
  avgRampTurns: number
  avgDurationSec: number
  floorCount: number
}

/** 자동 태그 (문서 순서) */
export function autoTags(i: TagInput): ReasonTag[] {
  const out: ReasonTag[] = []
  if (i.n > 0 && i.avgReverse >= 2.5) out.push('FREQUENT_REVERSE')
  if (i.n > 0 && i.avgRampTurns >= 1.5) out.push('SPIRAL_RAMP')
  if (i.n > 0 && i.avgReverse <= 1 && i.avgDurationSec <= 60) out.push('SPACIOUS')
  if (i.floorCount >= 5) out.push('MANY_FLOORS')
  return out
}

/** 운영자 태그와 서로 맞지 않는 자동 태그는 빼고 붙인다 (운영자가 이김) */
const CONFLICTS: Partial<Record<ReasonTag, ReasonTag[]>> = {
  SPACIOUS: ['NARROW_AISLE'],
  NARROW_AISLE: ['SPACIOUS'],
  FLAT: ['SPIRAL_RAMP', 'STEEP_SLOPE'],
  SPIRAL_RAMP: ['FLAT'],
  STEEP_SLOPE: ['FLAT'],
}

/** 수동 태그 먼저(운영자 순서), 그다음 자동 태그. 중복·충돌 제거, 최대 3개 */
export function mergeTags(manual: readonly ReasonTag[], auto: readonly ReasonTag[], max = MAX_TAGS): ReasonTag[] {
  const out: ReasonTag[] = []
  for (const t of manual) if (!out.includes(t)) out.push(t)
  for (const t of auto) {
    if (out.includes(t)) continue
    if (out.some((m) => CONFLICTS[t]?.includes(m))) continue
    out.push(t)
  }
  return out.slice(0, max)
}

/** 태그 대신 보여 줄 수치 칩: 평균 후진 ≥ 2 → "평균 후진 3.2회" */
export function statChips(i: { n: number; avgReverse: number }): string[] {
  return i.n > 0 && i.avgReverse >= 2 ? [`평균 후진 ${round1(i.avgReverse).toFixed(1)}회`] : []
}

export function isWeekdayAfternoon(weekday: number, hour: number): boolean {
  return weekday >= 1 && weekday <= 5 && hour >= AFTERNOON_FROM_HOUR && hour < AFTERNOON_TO_HOUR
}

/** 주차 시각(시) → 히트맵 칸 0..5, 범위 밖이면 -1 */
export function heatBucket(hour: number): number {
  if (hour < HEAT_FIRST_HOUR || hour >= HEAT_FIRST_HOUR + HEAT_BUCKET_HOURS * HOUR_LABELS.length) return -1
  return Math.floor((hour - HEAT_FIRST_HOUR) / HEAT_BUCKET_HOURS)
}

/** 요일×시간대 기록 수 → 최댓값 1로 정규화 (소수 둘째 자리) */
export function normalizeHeat(counts: number[][]): number[][] {
  const max = Math.max(0, ...counts.flat())
  return counts.map((row) => row.map((v) => (max > 0 ? round2(v / max) : 0)))
}

/**
 * 층별 혼잡: 평일 오후 기록의 층 분포를 최댓값 1로 정규화.
 * 층 순서는 주차장 floors(위→아래), 90일 동안 한 번도 기록이 없는 층은 뺀다.
 */
export function floorCongestion(floors: readonly string[], afternoon: Readonly<Record<string, number>>, seen: ReadonlySet<string>): FloorCongestion[] {
  const list = floors.filter((f) => seen.has(f))
  const max = Math.max(0, ...list.map((f) => afternoon[f] ?? 0))
  if (max === 0) return []
  return list.map((f) => ({ floor: f, occupancy: round2((afternoon[f] ?? 0) / max) }))
}

export const FULL_AT = 0.95
export const SPILL_AT = 0.8
export const ROOMY_AT = 0.75

/**
 * "B1 만차 · B3부터 여유".
 * - 만차: 그 층이 0.95 이상이고 바로 아래층도 0.8 이상 (사람들이 다음 층으로 넘어감)
 * - 여유: 그 층부터 맨 아래층까지 모두 0.75 이하인 가장 위층 (만차 층보다 아래)
 */
export function congestionSummary(fc: readonly FloorCongestion[]): string {
  if (fc.length === 0) return ''
  if (fc.length === 1) return '한 층 주차장'
  const full: number[] = []
  for (let i = 0; i + 1 < fc.length; i++) if (fc[i].occupancy >= FULL_AT && fc[i + 1].occupancy >= SPILL_AT) full.push(i)
  const lastFull = full.length ? full[full.length - 1] : -1
  let roomyFrom = -1
  for (let j = fc.length - 1; j >= Math.max(1, lastFull + 1); j--) {
    if (fc[j].occupancy <= ROOMY_AT) roomyFrom = j
    else break
  }
  const parts: string[] = []
  if (full.length) parts.push(`${full.map((i) => fc[i].floor).join('·')} 만차`)
  if (roomyFrom >= 1) parts.push(`${fc[roomyFrom].floor}부터 여유`)
  return parts.join(' · ') || '층마다 비슷해요'
}

/** 한 주차장의 90일(일부 30일) 집계 — store 가 SQL로 만든다 */
export interface LotAggregate {
  n90: number
  n30: number
  dSum: number
  reverseSum: number
  rampSum: number
  durationSum: number
  ratingCount: number
  starSum: number
  /** 90일 동안 기록이 있는 층 */
  floorsSeen: Set<string>
  /** 평일 오후 층별 기록 수 */
  afternoonFloors: Record<string, number>
  /** [7 요일(월..일)][6 칸] 기록 수 */
  heatCounts: number[][]
}

/** 저장해 두는 통계 (overall* 는 읽을 때 전체 평균을 붙인다) */
export type CachedStats = Omit<LotStats, 'overallAvgReverse' | 'overallAvgRampTurns' | 'overallAvgDurationSec'>

export interface LotScore {
  /** 반올림 전 베이지안 점수 (표본이 없으면 3.0) */
  score: number
  difficulty: number | null
  tags: ReasonTag[]
  statChips: string[]
  sampleCount: number
  scoreSampleCount: number
  ratingCount: number
  stats: CachedStats | null
}

export function emptyHeat(): number[][] {
  return Array.from({ length: 7 }, () => new Array<number>(HOUR_LABELS.length).fill(0))
}

export function scoreLot(agg: LotAggregate, lot: { floors: readonly string[]; manualTags: readonly ReasonTag[] }): LotScore {
  const n = agg.n90
  const avgReverse = n ? agg.reverseSum / n : 0
  const avgRampTurns = n ? agg.rampSum / n : 0
  const avgDurationSec = n ? agg.durationSum / n : 0
  const score = bayesianScore({ dSum: agg.dSum, n, starSum: agg.starSum, ratingCount: agg.ratingCount })
  const tagIn: TagInput = { n, avgReverse, avgRampTurns, avgDurationSec, floorCount: lot.floors.length }
  const fc = floorCongestion(lot.floors, agg.afternoonFloors, agg.floorsSeen)
  return {
    score,
    difficulty: publicDifficulty(score, agg.n30),
    tags: mergeTags(lot.manualTags, autoTags(tagIn)),
    statChips: statChips(tagIn),
    sampleCount: agg.n30,
    scoreSampleCount: n,
    ratingCount: agg.ratingCount,
    stats:
      n === 0
        ? null
        : {
            avgReverse: round1(avgReverse),
            avgRampTurns: round1(avgRampTurns),
            avgDurationSec: Math.round(avgDurationSec),
            congestionLabel: CONGESTION_LABEL,
            floorCongestion: fc,
            congestionSummary: congestionSummary(fc),
            hourlyHeat: normalizeHeat(agg.heatCounts),
            hourLabels: [...HOUR_LABELS],
          },
  }
}

/** 전체 주차장 90일 평균 (C-08 "전체 평균" 막대) */
export interface OverallAverages {
  overallAvgReverse: number
  overallAvgRampTurns: number
  overallAvgDurationSec: number
}

/**
 * 주차장마다 같은 무게로 평균 (90일 기록이 있는 주차장의 평균들의 평균).
 * 기록이 아주 많은 주차장 하나가 "전체"를 끌고 가지 않게 — 대시보드 지역 평균(insights)과 같은 방식.
 */
export function overallFrom(lots: ReadonlyArray<{ n: number; reverseSum: number; rampSum: number; durationSum: number }>): OverallAverages {
  const xs = lots.filter((l) => l.n > 0)
  const mean = (f: (l: (typeof xs)[number]) => number) => (xs.length ? xs.reduce((a, l) => a + f(l) / l.n, 0) / xs.length : 0)
  return {
    overallAvgReverse: round1(mean((l) => l.reverseSum)),
    overallAvgRampTurns: round1(mean((l) => l.rampSum)),
    overallAvgDurationSec: Math.round(mean((l) => l.durationSum)),
  }
}

/** 대시보드 히트맵: 8시부터 2시간씩 8칸 (8–9, 10–11, …, 22–23시) */
export const DASH_FIRST_HOUR = 8
export const DASH_HOUR_LABELS = ['8시', '10시', '12시', '14시', '16시', '18시', '20시', '22시']
export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

export function dashBucket(hour: number): number {
  if (hour < DASH_FIRST_HOUR || hour >= DASH_FIRST_HOUR + 2 * DASH_HOUR_LABELS.length) return -1
  return Math.floor((hour - DASH_FIRST_HOUR) / 2)
}

/** 이름 끝 "주차장" 떼기 — 대시보드 짧은 이름 ("현대백화점 판교점 지하주차장" → "현대백화점 판교점 지하") */
export function shortLotName(name: string): string {
  const s = name.replace(/\s*주차장$/, '').trim()
  return s || name
}

/** 램프 종류를 정하지 않았을 때: 평균 1바퀴 이상이면 나선, 층이 여럿이면 곧은 경사로, 아니면 없음 */
export function deriveRampKind(avgRampTurns: number | null | undefined, floorCount: number): RampKind {
  if ((avgRampTurns ?? 0) >= 1) return 'SPIRAL'
  return floorCount > 1 ? 'STRAIGHT' : 'NONE'
}
