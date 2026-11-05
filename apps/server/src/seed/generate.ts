/**
 * 합성 주차 기록 만들기 (결정적: 주차장 id로 난수 seed).
 *
 * 한 주차장의 30일 칸(bucket)마다
 *  1. 요일·시각: 장소 유형(백화점·회사·집…) 분포에서
 *  2. 층: 평일 오후(13~17시)와 그 밖을 따로 비율대로 정확히 나눔 → C-08 층별 혼잡이 그 비율.
 *     층별 평균 후진(D-02)이 있으면 층 비율(floorBase 에서 시작)을 풀어서 주차장 평균이 목표가 되게 한다
 *  3. 후진: "순조로운 주차"와 "힘들게 댄 주차"를 섞고, 주말·오후일수록 조금 더 (히트맵 모양).
 *     합을 (칸 · 층) 마다 목표 평균 × 건수에 정확히 맞춤
 *  4. 시간·램프 바퀴(층 깊이에 비례): 칸마다 합을 정확히 맞춤
 *  5. 핸들 꺾은 횟수: 90일 점수 목표(★)에 맞게 이분 탐색으로 한 값(δ)을 정함 — 화면 통계에는 안 나오는 값이라 손잡이로 씀
 *  6. 받은 시각: 칸 안에서 무작위 (칸 경계에서 반나절 이상 떨어뜨림 → 30·90일 창 대수가 정확)
 */
import type { DrivingExperience, ParkingShape, VehicleClass } from '@parkinggack/api-types'
import { DAY_MS, MIN_SAMPLES, SCORE_WINDOW_DAYS, bayesianScore, clamp, isWeekdayAfternoon, recordDifficulty } from '../scoring.js'
import type { RatingInsert, RecordInsert } from '../store.js'
import type { Bucket, Pattern, SeedLot } from './lots.js'
import { Rng, hashSeed } from './prng.js'

export const SEED_BASE = 20261103
export const BUCKET_DAYS = 30

/** 월..일 */
const WEEKDAY_WEIGHTS: Record<Pattern, number[]> = {
  mall: [0.8, 0.8, 0.85, 0.9, 1.1, 1.7, 1.5],
  office: [1.2, 1.2, 1.2, 1.2, 1.1, 0.15, 0.1],
  home: [0.9, 0.9, 0.9, 0.9, 1.0, 1.1, 1.0],
  park: [0.5, 0.5, 0.5, 0.6, 0.8, 1.8, 1.9],
  hospital: [1.3, 1.2, 1.2, 1.2, 1.2, 0.5, 0.15],
  transit: [1, 1, 1, 1, 1.2, 1.2, 1.1],
}

const hours = (m: Record<number, number>) => Array.from({ length: 24 }, (_, h) => m[h] ?? 0)
/** 0..23시 */
const HOUR_WEIGHTS: Record<Pattern, number[]> = {
  mall: hours({ 9: 0.3, 10: 0.5, 11: 0.7, 12: 0.9, 13: 1.0, 14: 1.1, 15: 1.2, 16: 1.2, 17: 1.1, 18: 1.0, 19: 0.8, 20: 0.6, 21: 0.35, 22: 0.15 }),
  office: hours({ 7: 0.5, 8: 1.5, 9: 1.3, 10: 0.6, 11: 0.4, 12: 0.35, 13: 0.5, 14: 0.5, 15: 0.4, 16: 0.3, 17: 0.25, 18: 0.25, 19: 0.15, 20: 0.1, 21: 0.06, 22: 0.04 }),
  home: hours({ 8: 0.1, 9: 0.1, 10: 0.15, 11: 0.15, 12: 0.2, 13: 0.2, 14: 0.3, 15: 0.3, 16: 0.4, 17: 0.5, 18: 1.0, 19: 1.4, 20: 1.3, 21: 1.0, 22: 0.7, 23: 0.3 }),
  park: hours({ 8: 0.2, 9: 0.4, 10: 0.8, 11: 1.0, 12: 1.0, 13: 1.1, 14: 1.2, 15: 1.1, 16: 0.9, 17: 0.6, 18: 0.4, 19: 0.3, 20: 0.15, 21: 0.1 }),
  hospital: hours({ 8: 0.8, 9: 1.4, 10: 1.5, 11: 1.2, 12: 0.6, 13: 1.0, 14: 1.1, 15: 0.9, 16: 0.6, 17: 0.3 }),
  transit: hours({ 6: 0.4, 7: 0.9, 8: 1.1, 9: 0.9, 10: 0.7, 11: 0.6, 12: 0.6, 13: 0.6, 14: 0.6, 15: 0.7, 16: 0.8, 17: 1.0, 18: 1.0, 19: 0.8, 20: 0.6, 21: 0.4, 22: 0.3 }),
}

export const VEHICLES: Array<[VehicleClass, number]> = [['COMPACT', 0.14], ['MIDSIZE', 0.44], ['LARGE', 0.1], ['SUV', 0.27], ['UNKNOWN', 0.05]]
const EXPERIENCE: Array<[DrivingExperience, number]> = [['UNDER_1Y', 0.12], ['Y1_3', 0.2], ['Y3_10', 0.34], ['OVER_10Y', 0.29], ['UNKNOWN', 0.05]]
const DEFAULT_SHAPE: Partial<Record<ParkingShape, number>> = { PERPENDICULAR: 0.86, ANGLED: 0.05, PARALLEL: 0.04, UNKNOWN: 0.05 }

/** 핸들 손잡이 범위 (꺾은 횟수에 더하는 값) */
const DELTA_MIN = -10
const DELTA_MAX = 25

/** 붐비는 때일수록 후진이 조금 더 (주말 ×1.35, 13~18시 ×1.25, 밤·이른 아침 ×0.85) — 평균은 칸마다 다시 맞춤 */
export function busyness(weekday: number, hour: number): number {
  return (weekday >= 6 ? 1.35 : 1) * (hour >= 13 && hour < 19 ? 1.25 : 1) * (hour >= 22 || hour < 8 ? 0.85 : 1)
}

/** "B3" → 3, "1F" → 0, "2F" → 1 (램프로 오르내린 층 수) */
export function floorDepth(f: string): number {
  const b = /^B(\d+)$/i.exec(f)
  if (b) return Number(b[1])
  const u = /^(\d+)F$/i.exec(f)
  if (u) return Math.max(0, Number(u[1]) - 1)
  return 0
}

/** 1층은 (다른 층이 있으면) 적게, 나머지는 위층부터 0.8배씩 */
export function defaultFloorWeights(floors: readonly string[]): number[] {
  let rank = 0
  return floors.map((f) => (floors.length > 1 && /^1F$/i.test(f) ? 0.25 : 0.8 ** rank++))
}

/** total 을 weights 비율로 정수로 나눔 (최대 나머지 방식) */
export function quota(total: number, weights: readonly number[]): number[] {
  const w = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map((x) => (w > 0 ? (total * x) / w : 0))
  const out = raw.map(Math.floor)
  let left = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++
  return out
}

/** 정수 배열(의 일부 idx)의 합을 target 에 맞춤 (무작위 칸을 ±1) */
function fixSum(values: number[], idx: readonly number[], target: number, lo: number, hi: number, rng: Rng) {
  if (!idx.length) return
  let diff = target - idx.reduce((a, i) => a + values[i], 0)
  for (let guard = 0; diff !== 0; guard++) {
    if (guard > 2_000_000) throw new Error(`시드: 합을 맞추지 못했어요 (남은 차이 ${diff})`)
    const i = idx[rng.int(0, idx.length - 1)]
    if (diff > 0 && values[i] < hi) {
      values[i]++
      diff--
    } else if (diff < 0 && values[i] > lo) {
      values[i]--
      diff++
    }
  }
}

export interface MeanScale {
  reverse: number
  ramp: number
  duration: number
}

export interface GeneratedLot {
  records: RecordInsert[]
  ratings: RatingInsert[]
  /** 맞춘 90일 점수 (반올림 전) */
  score: number
  delta: number
  /** 90일 평균 (C-08 "전체 평균" 맞추기용) */
  mean90: { reverse: number; ramp: number; duration: number }
}

interface Slot {
  w: number
  h: number
  floor: string
  ageIdx: number
  reverse: number
  duration: number
  ramp10: number
  hard: boolean
}

export function generateLot(spec: SeedLot, now: number, scale: MeanScale = { reverse: 1, ramp: 1, duration: 1 }): GeneratedLot {
  const rng = new Rng((hashSeed(spec.lot.id) ^ SEED_BASE) >>> 0)
  const floors = spec.lot.floors
  const K = spec.buckets.length
  const baseW = spec.floorBase ?? defaultFloorWeights(floors)
  // 평일 오후 층 비율: floorWeights 가 있으면 그대로, 없으면 나머지와 같이 푼 비율
  const fixedAfternoon = spec.floorWeights
  let solvedW = spec.floorWeights ?? baseW
  const { p, smooth } = spec.struggle
  const smoothDur = spec.struggle.smoothDur ?? (1 + smooth) / 2
  const hardMul = p > 0 ? Math.max(smooth, (1 - (1 - p) * smooth) / p) : smooth
  const all: Slot[] = []

  // 최근 칸부터 (층 비율을 최근 칸에서 풀기 때문)
  for (let ageIdx = 0; ageIdx < K; ageIdx++) {
    const bucket: Bucket = spec.buckets[K - 1 - ageIdx]
    const n = bucket.n
    const slots: Slot[] = Array.from({ length: n }, () => ({
      w: rng.weightedIndex(WEEKDAY_WEIGHTS[spec.pattern]) + 1,
      h: rng.weightedIndex(HOUR_WEIGHTS[spec.pattern]),
      floor: floors[0],
      ageIdx,
      reverse: 0,
      duration: 0,
      ramp10: 0,
      hard: rng.next() < p,
    }))
    const afternoon = slots.filter((s) => isWeekdayAfternoon(s.w, s.h))
    const rest = slots.filter((s) => !isWeekdayAfternoon(s.w, s.h))

    // 층별 평균 후진(D-02)이 있으면: 최근 칸에서 층 비율 base·exp(β(m−T)) 의 β 를 풀어 주차장 평균 = bucket.reverse
    // (floorWeights 가 있으면 평일 오후는 그 비율 그대로 두고 나머지만 푼다)
    const fr = spec.floorReverse
    if (fr && ageIdx === 0) {
      const target = bucket.reverse * scale.reverse
      const meanAt = (beta: number) => {
        const w = fr.map((m, f) => (m > 0 ? baseW[f] * Math.exp(beta * (m - target)) : 0))
        const qa = quota(afternoon.length, fixedAfternoon ?? w)
        const qr = quota(rest.length, w)
        return { w, mean: fr.reduce((a, m, f) => a + (qa[f] + qr[f]) * m, 0) / n }
      }
      let lo = -30
      let hi = 30
      for (let it = 0; it < 60; it++) {
        const mid = (lo + hi) / 2
        if (meanAt(mid).mean < target) lo = mid
        else hi = mid
      }
      const a = meanAt(lo)
      const b = meanAt(hi)
      solvedW = Math.abs(a.mean - target) <= Math.abs(b.mean - target) ? a.w : b.w
    }
    for (const [group, w] of [
      [afternoon, fixedAfternoon ?? solvedW],
      [rest, solvedW],
    ] as const) {
      const names = quota(group.length, w).flatMap((c, k) => new Array<string>(c).fill(floors[k]))
      rng.shuffle(names)
      group.forEach((s, k) => (s.floor = names[k]))
    }

    // 후진: (층별 목표가 있으면 층마다) 합을 정확히, 그다음 칸 전체 합도 정확히 (층마다 반올림한 차이 몇 회를 무작위로)
    const bucketTarget = bucket.reverse * scale.reverse
    const groups: Array<{ idx: number[]; target: number }> = []
    if (fr) {
      // 이전 칸은 층별 평균을 (칸 평균 / 이 칸 층 구성에서의 층별 평균의 평균) 만큼 늘이거나 줄임
      const counts = floors.map((f) => slots.filter((s) => s.floor === f).length)
      const frMean = fr.reduce((a, m, f) => a + m * counts[f], 0) / n
      const ratio = ageIdx === 0 || frMean <= 0 ? 1 : bucketTarget / frMean
      floors.forEach((f, k) => {
        const idx = slots.map((s, i) => (s.floor === f ? i : -1)).filter((i) => i >= 0)
        if (idx.length) groups.push({ idx, target: fr[k] * ratio })
      })
    } else {
      groups.push({ idx: slots.map((_, i) => i), target: bucketTarget })
    }
    const rev = new Array<number>(n).fill(0)
    for (const g of groups) {
      const weight = g.idx.map((i) => (slots[i].hard ? hardMul : smooth) * busyness(slots[i].w, slots[i].h))
      const mw = weight.reduce((a, b) => a + b, 0) / weight.length || 1
      g.idx.forEach((i, k) => (rev[i] = Math.min(50, rng.poisson((g.target * weight[k]) / mw))))
      fixSum(rev, g.idx, Math.round(g.target * g.idx.length), 0, 50, rng)
    }
    if (groups.length > 1) fixSum(rev, slots.map((_, i) => i), Math.round(bucketTarget * n), 0, 50, rng)
    slots.forEach((s, i) => (s.reverse = rev[i]))

    // 시간
    const D = spec.duration * scale.duration
    const muS = D * smoothDur
    const muH = p > 0 ? Math.max(muS, (D - (1 - p) * muS) / p) : muS
    const rawDur = slots.map((s) => Math.max(12, (s.hard ? muH : muS) * (1 + (s.hard ? 0.3 : 0.22) * rng.normal())))
    const kd = (D * n) / (rawDur.reduce((a, b) => a + b, 0) || 1)
    const dur = rawDur.map((d) => clamp(Math.round(d * kd), 8, 3600))
    const allIdx = slots.map((_, i) => i)
    fixSum(dur, allIdx, Math.round(D * n), 8, 3600, rng)
    slots.forEach((s, i) => (s.duration = dur[i]))

    // 램프 (0.1바퀴 단위로 합 맞춤)
    const R = spec.ramp * scale.ramp
    const depth = slots.map((s) => floorDepth(s.floor))
    const depthSum = depth.reduce((a, b) => a + b, 0)
    const ramp10 = (depthSum > 0 ? depth.map((d) => d * ((R * n) / depthSum) * (1 + 0.12 * rng.normal())) : depth.map(() => R * rng.range(0.3, 1.7))).map((r) =>
      clamp(Math.round(r * 10), 0, 200),
    )
    fixSum(ramp10, allIdx, Math.round(R * n * 10), 0, 200, rng)
    slots.forEach((s, i) => (s.ramp10 = ramp10[i]))
    all.push(...slots)
  }

  // 나머지 값 + 받은 시각 (칸 안에서 무작위, 경계에서 반나절 이상)
  const shapes = Object.entries(spec.shape ?? DEFAULT_SHAPE) as Array<[ParkingShape, number]>
  const steerBase = all.map((s) => 0.8 + 0.6 * s.reverse + rng.next() * 1.5)
  const steerJitter = all.map(() => rng.next())
  const base = all.map((s) => ({
    clientRecordId: rng.uuid(),
    lotId: spec.lot.id,
    floor: s.floor,
    reverseCount: s.reverse,
    steeringTurns: 0,
    brakeCount: rng.next() < 0.1 ? null : Math.round(3 + 2.2 * s.reverse + 0.03 * s.duration + rng.next() * 3),
    durationSec: s.duration,
    rampTurns: s.ramp10 / 10,
    shape: rng.weighted(shapes),
    approximate: rng.next() < 0.06,
    vehicleClass: rng.weighted(spec.vehicles ?? VEHICLES),
    experience: rng.weighted(EXPERIENCE),
    parkedHour: s.h,
    parkedWeekday: s.w,
    demo: true,
    receivedMs: Math.round(now - (s.ageIdx * BUCKET_DAYS + rng.range(0.5, BUCKET_DAYS - 0.5)) * DAY_MS),
  }))

  // 별점
  const ratings: RatingInsert[] = []
  if (spec.ratings && spec.ratings.count > 0) {
    const { count, mean: m } = spec.ratings
    const stars = Array.from({ length: count }, () => clamp(Math.round(m + 0.8 * rng.normal()), 1, 5))
    fixSum(stars, stars.map((_, i) => i), Math.round(m * count), 1, 5, rng)
    stars.forEach((st) =>
      ratings.push({ clientRatingId: rng.uuid(), lotId: spec.lot.id, stars: st, demo: true, createdMs: Math.round(now - rng.range(0.5, 85) * DAY_MS) }),
    )
  }
  const starSum = ratings.reduce((a, r) => a + r.stars, 0)

  // 90일 점수 목표에 맞게 핸들 꺾은 횟수 정하기
  const in90 = base.map((r, i) => (now - r.receivedMs < SCORE_WINDOW_DAYS * DAY_MS ? i : -1)).filter((i) => i >= 0)
  const n30 = spec.buckets[K - 1].n
  const steer = (i: number, delta: number) => clamp(Math.floor(steerBase[i] + delta + steerJitter[i]), 0, 100)
  const scoreAt = (delta: number) => {
    let dSum = 0
    for (const i of in90) dSum += recordDifficulty({ ...base[i], steeringTurns: steer(i, delta) })
    return bayesianScore({ dSum, n: in90.length, starSum, ratingCount: ratings.length })
  }
  let delta = 0
  if (spec.score != null && n30 >= MIN_SAMPLES) {
    const target = spec.score
    let lo = DELTA_MIN
    let hi = DELTA_MAX
    if (scoreAt(lo) >= target) delta = lo
    else if (scoreAt(hi) <= target) delta = hi
    else {
      for (let it = 0; it < 48; it++) {
        const mid = (lo + hi) / 2
        if (scoreAt(mid) < target) lo = mid
        else hi = mid
      }
      delta = Math.abs(scoreAt(lo) - target) <= Math.abs(scoreAt(hi) - target) ? lo : hi
    }
    if (spec.strict && Math.round(scoreAt(delta) * 10) !== Math.round(target * 10)) {
      throw new Error(`시드: ${spec.lot.id} 목표 ★${target} 를 못 맞췄어요 (가능한 범위 ${scoreAt(DELTA_MIN).toFixed(2)}~${scoreAt(DELTA_MAX).toFixed(2)})`)
    }
  }
  const records = base.map((r, i) => ({ ...r, steeringTurns: steer(i, delta) }))
  const sum90 = (f: (r: (typeof records)[number]) => number) => in90.reduce((a, i) => a + f(records[i]), 0)
  const n90 = in90.length || 1
  return {
    records,
    ratings,
    score: scoreAt(delta),
    delta,
    mean90: { reverse: sum90((r) => r.reverseCount) / n90, ramp: sum90((r) => r.rampTurns) / n90, duration: sum90((r) => r.durationSec) / n90 },
  }
}
