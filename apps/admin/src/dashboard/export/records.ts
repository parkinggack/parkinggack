/**
 * D-12 내보내기 파일의 시연 기록 생성기 — 순수 함수, 같은 입력이면 늘 같은 결과.
 *
 * 서버는 개별 주차 기록을 공개 API 로 주지 않는다 (집계값만). 그래서 시연 화면은 API 가 주는 값에 맞춘
 * **시연용 예시 기록**을 브라우저에서 만든다:
 *   - 주차 수 = 그 기간 그 주차장의 API 기록 수
 *   - 층별 평균 후진 = API floorAvgReverse (층마다 합이 정확히 맞게 나눔)
 *   - 한 번에 들어간 비율 = D-11 이 보여 주는 층 값 (v2demo.oneShotPct, 층마다 정확히)
 *   - 걸린 시간 분포 = D-11 '들어와서 대기까지' (평균 = API 평균 시간)
 *   - 시간대별 후진 = API 히트맵 모양 · 칸 = API 도면(통로)에서 나온 주차 칸 · 좌표 = 입구 기준 상대 좌표(m)
 * 개인을 알아볼 값(위경도·차량번호·VIN·주차장 밖 경로)은 처음부터 만들지 않는다.
 */
import type { InsightLotRow, InsightsLotResponse, WeekdayHourHeat } from '@api-types'
import { deriveStalls, type FloorLayout } from '@insights-layout'
import { entranceOf } from '../plan'
import {
  CAR_CLASS_SHARE, CAR_CLASSES, classReverse, durationQuantile, FLOOR_SHARE, HARD_BRAKE, HOUR_VOLUME, oneShotPct,
  STAY_MIN, type CarClass,
} from '../v2demo'

// ───────────── 난수 ─────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashSeed(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

type Rnd = () => number
const gauss = (r: Rnd) => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r())
const round1 = (v: number) => Math.round(v * 10) / 10
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** 합이 total 이 되게 비율대로 나눈다 (큰 나머지 순) */
export function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1
  const raw = weights.map((w) => (total * w) / sum)
  const out = raw.map(Math.floor)
  let left = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k][1]] += 1
  return out
}

function shuffle<T>(xs: T[], r: Rnd): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

function pickWeighted(weights: readonly number[], total: number, r: Rnd): number {
  let x = r() * total
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i]
    if (x <= 0) return i
  }
  return weights.length - 1
}

// ───────────── 날짜 (한국 시간) ─────────────

/** epoch ms → 한국 시간 { date: "2026-11-04", hour } */
export function kstParts(ms: number): { date: string; hour: number } {
  const d = new Date(ms + 9 * 3_600_000)
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() }
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** 0 = 월 … 6 = 일 */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

export const WEEKDAY_KO = ['월', '화', '수', '목', '금', '토', '일'] as const

// ───────────── 도면 → 칸 · 입구 ─────────────

export interface Bay {
  /** 구역 + 번호 "C14" */
  id: string
  zone: string
  /** 칸 가운데 (도면 좌표, m) */
  x: number
  /** 통로 중심선 y, 칸 안쪽 끝 y (차가 멈추는 곳) */
  aisleY: number
  endY: number
  /** 칸이 통로 위(-1)·아래(+1) */
  dir: -1 | 1
  /** 1번 통로(입구와 같은 통로)면 0 */
  aisleRank: number
}

export interface FloorPlanInfo {
  floor: string
  /** 입구 = 1번 통로가 램프·입구와 만나는 곳. 모든 좌표의 (0, 0) */
  origin: { x: number; y: number }
  /** 램프에서 다른 통로로 내려가는 세로 통로 x */
  spineX: number
  bays: Bay[]
}

export function floorPlanInfo(layout: FloorLayout): FloorPlanInfo {
  const origin = entranceOf(layout)
  const vert = layout.aisles.filter((a) => Math.abs(a[3] - a[1]) > Math.abs(a[2] - a[0]) && Math.abs(a[3] - a[1]) > 4)
  const spineX = vert.length ? vert.reduce((best, a) => (Math.abs(a[0] - origin.x) < Math.abs(best - origin.x) ? a[0] : best), vert[0][0]) : origin.x
  const { rows } = deriveStalls(layout)
  const aisleYs = [...new Set(rows.map((row) => (layout.aisles[row.aisle][1] + layout.aisles[row.aisle][3]) / 2))].sort((a, b) => a - b)
  const top = layout.zones.filter((z) => z.y < layout.height / 2)
  const bottom = layout.zones.filter((z) => z.y >= layout.height / 2)
  const counters = new Map<string, number>()
  const bays: Bay[] = []
  const ordered = [...rows].sort((a, b) => a.y0 - b.y0)
  for (const row of ordered) {
    const aisleY = (layout.aisles[row.aisle][1] + layout.aisles[row.aisle][3]) / 2
    const dir: -1 | 1 = row.side === 'north' ? -1 : 1
    const depth = Math.min(Math.abs(row.y1 - row.y0) * 0.75, 3.0)
    const cy = (row.y0 + row.y1) / 2
    const zones = cy < layout.height / 2 ? top : bottom
    for (let j = 0; j < row.lines.length - 1; j++) {
      const x = (row.lines[j] + row.lines[j + 1]) / 2
      const zone = zones.length
        ? zones.reduce((best, z) => (Math.abs(z.x - x) < Math.abs(best.x - x) ? z : best), zones[0]).label
        : 'A'
      const n = (counters.get(zone) ?? 0) + 1
      counters.set(zone, n)
      bays.push({
        id: `${zone}${String(n).padStart(2, '0')}`, zone, x: Math.round(x * 100) / 100, aisleY,
        endY: row.y0 + dir * depth, dir, aisleRank: aisleYs.indexOf(aisleY),
      })
    }
  }
  return { floor: layout.floor, origin, spineX, bays }
}

// ───────────── 기록 ─────────────

export interface LotSource {
  lot: Pick<InsightLotRow, 'id' | 'shortName' | 'category' | 'difficulty' | 'avgReverse' | 'avgDurationSec'> & { floors: string[] }
  floorAvgReverse: InsightsLotResponse['floorAvgReverse']
  layout: InsightsLotResponse['layout']
  heat: WeekdayHourHeat
}

export interface SessionRec {
  lotId: string
  sessionId: string
  floor: string
  bay: Bay
  date: string
  weekday: number
  hour: number
  minute: 0 | 30
  /** "2026-11-03 14:30" (30분 단위) */
  enteredAt: string
  reverseN: number
  steerTurns: number
  durationS: number
  carClass: CarClass
  hardBrake: boolean
  stayMin: number
  /** 동선을 다시 그릴 때 쓰는 시드 */
  seed: number
}

export interface GenerateOptions {
  /** 주차 수 (그 기간 API 기록 수) */
  count: number
  /** 기간 마지막 날 (한국 시간 "2026-11-04") */
  endDate: string
  days: number
  /** 마지막 날은 이 시각(시) 전까지만 */
  endHour?: number
}

/** 히트맵 칸(2시간 구간) → 그 시각의 후진 배율 (평균 1, 0.6~1.6) */
function heatFactor(heat: WeekdayHourHeat): (weekday: number, hour: number) => number {
  const hours = heat.hours.map((h) => parseInt(h, 10))
  const vals = heat.values.flat().filter((v): v is number => v != null)
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 1
  return (weekday, hour) => {
    let col = -1
    hours.forEach((h, i) => { if (hour >= h) col = i })
    const v = col >= 0 && hour < (hours[col] ?? 0) + 2 ? heat.values[weekday]?.[col] : null
    return v == null || !(mean > 0) ? 1 : clamp(v / mean, 0.6, 1.6)
  }
}

/** 한 번 주차에 후진 기어를 넣는 횟수 상한 (시연 기록) */
export const MAX_REVERSE = 12

export function generateSessions(src: LotSource, opts: GenerateOptions): SessionRec[] {
  const { lot } = src
  const count = Math.max(0, Math.round(opts.count))
  const days = Math.max(1, Math.round(opts.days))
  const r = mulberry32(hashSeed(`${lot.id}:${opts.endDate}:${days}:${count}`))
  const floors = lot.floors.filter((f) => src.layout.some((l) => l.floor === f))
  if (!count || !floors.length) return []
  const weights = floors.map((_, i) => FLOOR_SHARE[Math.min(i, FLOOR_SHARE.length - 1)])
  const perFloor = apportion(count, weights)
  const floorRev = new Map(src.floorAvgReverse.map((f) => [f.floor, f.avgReverse]))
  const factor = heatFactor(src.heat)
  const classMult = new Map(classReverse(lot.avgReverse).map((c) => [c.name, c.value / Math.max(0.1, lot.avgReverse)]))
  const classShare = CAR_CLASSES.map((c) => CAR_CLASS_SHARE[c])
  const firstDate = addDays(opts.endDate, -(days - 1))
  const stayMean = STAY_MIN[lot.category] ?? STAY_MIN.OTHER
  const usedIds = new Set<string>()
  const out: SessionRec[] = []

  floors.forEach((floor, fi) => {
    const n = perFloor[fi]
    if (!n) return
    const layout = src.layout.find((l) => l.floor === floor)!
    const plan = floorPlanInfo(layout)
    if (!plan.bays.length) return
    const bayW = plan.bays.map((b) => Math.exp(-Math.hypot(b.x - plan.origin.x, b.aisleY - plan.origin.y) / 9) + 0.015)
    const bayTotal = bayW.reduce((a, b) => a + b, 0)
    const avgRev = floorRev.get(floor) ?? lot.avgReverse
    const classes = shuffle(apportion(n, classShare).flatMap((k, i) => Array<CarClass>(k).fill(CAR_CLASSES[i])), r)

    // 자리 · 시각 · 차 크기 먼저, 후진은 '잘 나오는 정도'(차 크기 × 시간대 × 흔들림) 순으로 나눠 준다
    const draft = classes.map((carClass) => {
      const dayIdx = Math.floor(r() * days)
      const date = addDays(firstDate, dayIdx)
      const weekday = weekdayOf(date)
      const profile = weekday >= 5 ? HOUR_VOLUME.weekend : HOUR_VOLUME.weekday
      const last = date === opts.endDate && opts.endHour != null ? Math.max(1, opts.endHour) : 24
      const hw = profile.slice(0, last)
      const hour = pickWeighted(hw, hw.reduce((a, b) => a + b, 0), r)
      const minute: 0 | 30 = r() < 0.5 ? 0 : 30
      const bay = plan.bays[pickWeighted(bayW, bayTotal, r)]
      const propensity = (classMult.get(carClass) ?? 1) * factor(weekday, hour) * Math.exp(gauss(r) * 0.3)
      return { carClass, date, weekday, hour, minute, bay, propensity, reverseN: 0 }
    })

    // 한 번에 들어간 주차(후진 0~1회) 수와 층 후진 합을 정확히 맞춘다
    const byProp = draft.map((_, i) => i).sort((a, b) => draft[a].propensity - draft[b].propensity)
    let n1 = Math.round((n * oneShotPct(avgRev)) / 100)
    const target = Math.round(n * avgRev)
    let ones = Math.round(n1 * 0.65)
    let n2 = n - n1
    let extra = target - ones - 2 * n2
    if (extra < 0) {
      ones = Math.max(0, ones + extra)
      extra = target - ones - 2 * n2
    }
    while (extra < 0 && n2 > 0) {
      // 후진이 아주 적은 층: 한 번에 들어간 쪽을 늘린다
      n1 += 1
      n2 -= 1
      ones += 1
      extra += 1
      if (ones > n1) {
        ones = n1
        extra -= 1
      }
    }
    byProp.forEach((idx, k) => {
      if (k < n1) draft[idx].reverseN = k < n1 - ones ? 0 : 1
      else draft[idx].reverseN = 2
    })
    if (n2 > 0 && extra > 0) {
      // 남은 후진: 2회 + 기하 분포(대부분 2~3회, 드물게 많이)를 고르게 뽑아(분위) '잘 나오는 정도' 순서로 준다.
      // 층 합이 정확히 맞게 큰 값부터 고치고, 한 번 주차에 MAX_REVERSE 회를 넘지 않게
      const many = byProp.slice(n1)
      const cap = MAX_REVERSE - 2
      const p = 1 / (1 + extra / n2)
      const vals = many.map((_, k) => Math.min(cap, Math.floor(Math.log(1 - (k + 0.5) / n2) / Math.log(1 - p))))
      let diff = extra - vals.reduce((a, b) => a + b, 0)
      for (let guard = 0; diff !== 0 && guard < 50; guard++) {
        let moved = false
        for (let k = vals.length - 1; k >= 0 && diff !== 0; k--) {
          if (diff > 0 && vals[k] < cap) { vals[k] += 1; diff -= 1; moved = true }
          else if (diff < 0 && vals[k] > 0) { vals[k] -= 1; diff += 1; moved = true }
        }
        if (!moved) break
      }
      vals.sort((a, b) => a - b)
      many.forEach((idx, k) => { draft[idx].reverseN = 2 + vals[k] })
    }

    // 걸린 시간: 층마다 분포를 고르게 뽑고(분위), 후진이 많을수록 길게
    const durations = Array.from({ length: n }, (_, k) => durationQuantile((k + 0.5) / n, lot.avgDurationSec)).sort((a, b) => a - b)
    const byRev = draft.map((d, i) => [d.reverseN + gauss(r) * 0.9, i] as const).sort((a, b) => a[0] - b[0])

    byRev.forEach(([, idx], k) => {
      const d = draft[idx]
      let sessionId = ''
      do sessionId = `s_${Math.floor(r() * 0xffffff).toString(16).padStart(6, '0')}`
      while (usedIds.has(sessionId))
      usedIds.add(sessionId)
      const hh = String(d.hour).padStart(2, '0')
      out.push({
        lotId: lot.id,
        sessionId,
        floor,
        bay: d.bay,
        date: d.date,
        weekday: d.weekday,
        hour: d.hour,
        minute: d.minute,
        enteredAt: `${d.date} ${hh}:${d.minute === 0 ? '00' : '30'}`,
        reverseN: d.reverseN,
        steerTurns: Math.max(0.5, Math.round((1 + 0.6 * d.reverseN + gauss(r) * 0.3) * 2) / 2),
        durationS: Math.max(8, Math.round(durations[k])),
        carClass: d.carClass,
        hardBrake: r() < HARD_BRAKE.base + HARD_BRAKE.perReverse * d.reverseN,
        stayMin: Math.max(5, Math.round(stayMean * Math.exp(gauss(r) * 0.45))),
        seed: Math.floor(r() * 0x7fffffff),
      })
    })
  })

  return out.sort((a, b) => (a.enteredAt < b.enteredAt ? 1 : a.enteredAt > b.enteredAt ? -1 : a.sessionId < b.sessionId ? -1 : 1))
}

// ───────────── 동선 (입구 → 칸) ─────────────

export type Gear = 'D' | 'R'

export interface PathPoint { x: number; y: number; gear: Gear; kind: 'cruise' | 'slow' | 'reverse' }

/**
 * 한 번 주차한 길: 입구에서 통로를 따라 칸까지. 후진 0회 = 앞으로 넣기, 1회 = 지나쳐 섰다가 뒤로 넣기,
 * 그 뒤로 1회마다 조금 빼고 다시 뒤로. 좌표는 도면 좌표(m). 점의 gear 는 바로 앞 점에서 이 점까지의 기어.
 */
export function buildPath(s: Pick<SessionRec, 'bay' | 'reverseN' | 'seed'>, plan: FloorPlanInfo): { points: PathPoint[]; waitAt: number } {
  const r = mulberry32(s.seed)
  const lane = clamp(gauss(r) * 0.3, -0.7, 0.7)
  const { bay, reverseN } = s
  const o = plan.origin
  const pts: PathPoint[] = [{ x: o.x, y: o.y + lane * 0.3, gear: 'D', kind: 'cruise' }]
  const go = (x: number, y: number, gear: Gear = 'D', kind: PathPoint['kind'] = 'cruise') => pts.push({ x, y, gear, kind })
  const ly = bay.aisleY + lane
  if (bay.aisleRank > 0) {
    const xs = plan.spineX + lane * 0.4
    go(xs + 1.2, o.y + lane * 0.4)
    go(xs, o.y + 1.6)
    go(xs, ly - 1.6)
    go(xs - 1.6, ly)
  }
  let waitAt: number
  if (reverseN === 0) {
    go(bay.x + 2.6, ly)
    waitAt = pts.length - 1
    go(bay.x + 0.9, ly + bay.dir * 0.5, 'D', 'slow')
    go(bay.x + 0.2, ly + bay.dir * 1.8, 'D', 'slow')
    go(bay.x, bay.endY, 'D', 'slow')
  } else {
    const past = bay.x - 2.8 - r() * 0.6
    go(bay.x + 2.0, ly)
    waitAt = pts.length - 1
    go(past, ly, 'D', 'slow')
    go(bay.x - 0.8, ly + bay.dir * 0.6, 'R', 'reverse')
    go(bay.x - 0.1, ly + bay.dir * 2.0, 'R', 'reverse')
    go(bay.x, bay.endY, 'R', 'reverse')
    for (let k = 1; k < reverseN; k++) {
      const side = k % 2 ? 0.45 : -0.45
      go(bay.x + side, ly + bay.dir * 1.1, 'D', 'slow')
      go(bay.x + side * 0.3, ly + bay.dir * 2.1, 'R', 'reverse')
      go(bay.x, bay.endY, 'R', 'reverse')
    }
  }
  return { points: pts, waitAt }
}

export interface TracePoint { t: number; x: number; y: number; gear: 'D' | 'R' | 'P'; speedKmh: number }

const SPEED: Record<PathPoint['kind'], number> = { cruise: 2.0, slow: 0.9, reverse: 0.6 } // m/s

/**
 * 1초마다 한 점 (durationS + 1 점, 마지막은 P). 자연스러운 속도로 다 가도 시간이 남으면 칸 앞에서 기다리고
 * (자리 찾기), 모자라면 조금 빨리 간다. 좌표는 입구 기준 (m, 소수 한 자리).
 */
export function sampleTrace(path: { points: PathPoint[]; waitAt: number }, durationS: number, origin: { x: number; y: number }): TracePoint[] {
  const pts = path.points
  const segs: { a: PathPoint; b: PathPoint; time: number }[] = []
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    segs.push({ a: pts[i - 1], b: pts[i], time: len / SPEED[pts[i].kind] })
  }
  const T = Math.max(1, Math.round(durationS))
  const natural = segs.reduce((a, s) => a + s.time, 0)
  const scale = natural > T ? T / natural : 1
  const wait = Math.max(0, T - natural * scale)
  // 타임라인 (합 = T 초). 기다림은 waitAt 점에 닿은 다음에 끼운다
  const timeline: { t0: number; t1: number; seg: (typeof segs)[number] | null; at: PathPoint }[] = []
  let t = 0
  const pause = (at: PathPoint) => {
    if (wait <= 0) return
    timeline.push({ t0: t, t1: t + wait, seg: null, at })
    t += wait
  }
  if (path.waitAt <= 0) pause(pts[0])
  segs.forEach((s, i) => {
    const dt = s.time * scale
    timeline.push({ t0: t, t1: t + dt, seg: s, at: s.b })
    t += dt
    if (i + 1 === path.waitAt) pause(s.b)
  })
  const posAt = (time: number): { x: number; y: number; gear: Gear } => {
    const e = timeline.find((x) => time <= x.t1 + 1e-9) ?? timeline[timeline.length - 1]
    if (!e) return { x: pts[0].x, y: pts[0].y, gear: 'D' }
    if (!e.seg) return { x: e.at.x, y: e.at.y, gear: 'D' }
    const f = e.t1 > e.t0 ? clamp((time - e.t0) / (e.t1 - e.t0), 0, 1) : 1
    return { x: e.seg.a.x + (e.seg.b.x - e.seg.a.x) * f, y: e.seg.a.y + (e.seg.b.y - e.seg.a.y) * f, gear: e.seg.b.gear }
  }
  const firstSpeed = pts.length > 1 ? (SPEED[pts[1].kind] / scale) * 3.6 : 0
  const out: TracePoint[] = []
  let prev = posAt(0)
  for (let s = 0; s <= T; s++) {
    const p = posAt(s)
    const speed = s === 0 ? firstSpeed : Math.hypot(p.x - prev.x, p.y - prev.y) * 3.6
    out.push({
      t: s,
      x: round1(p.x - origin.x),
      y: round1(p.y - origin.y),
      gear: s === T ? 'P' : p.gear,
      speedKmh: s === T ? 0 : round1(Math.min(speed, 15)),
    })
    prev = p
  }
  return out
}

/** 후진 이벤트 자리: 후진 기어로 바꾸는 점 (D → R 바뀌는 곳). 급정지: 칸 앞에서 선 곳 */
export function eventSpots(path: { points: PathPoint[]; waitAt: number }): { reverse: { x: number; y: number }[]; brake: { x: number; y: number } } {
  const pts = path.points
  const reverse: { x: number; y: number }[] = []
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].gear === 'R' && pts[i - 1].gear !== 'R') reverse.push({ x: pts[i - 1].x, y: pts[i - 1].y })
  }
  const b = pts[Math.max(0, path.waitAt)]
  return { reverse, brake: { x: b.x, y: b.y } }
}
