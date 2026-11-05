/**
 * 주차각 PC 대시보드(D-01 개요 · D-02 상세 · D-03 비교) 시연 데이터 생성기.
 *
 * 순수 함수만 있다 — 입출력·전역 상태·Date.now() 없음(시각은 인자로), 의존성 없음(타입만 ../api-types).
 * admin 웹의 시연 모드(apps/admin/src/mock)가 이것으로 /v1/insights/* 응답을 만들고,
 * 서버(apps/server)도 시드·시연 응답을 같은 모양으로 만들 때 그대로 가져다 쓸 수 있다.
 *
 *   import { demoOverview, demoCompare, demoLotInsights } from '<repo>/packages/insights-demo/index.ts'
 *
 *   demoOverview({ days: 30, now })                 → InsightsOverviewResponse   (GET /v1/insights/overview)
 *   demoCompare({ category: 'OFFICE', now })        → InsightsCompareResponse    (GET /v1/insights/compare)
 *   demoLotInsights('hyundai-pangyo', { now })      → InsightsLotResponse | null (GET /v1/insights/lots/:id)
 *   (region 이 'pangyo' 가 아니면 null — 서버는 404)
 *
 * 더 낮은 단계(도면·동선만 따로):
 *   generateFloorLayout({ floor: 'B2', ramp: 'spiral' })            → 도면 틀 (통로·램프·구역 글자 위치)
 *   generateOverlayPaths(layout, { count: 360, seed, ramp, hotspots }) → [x, y, reverse][] 동선 목록
 *   deriveStalls(layout)                                            → 통로에서 나온 주차 칸·기둥 (화면이 그리는 장식과 같음)
 *
 * 수치: docs/design/D-01~D-03 시안 그대로 — 판교 9곳의 난이도·평균 후진·램프·시간·30일 기록 수(합 6,388),
 * 평균 후진 2.0회(지난달 2.3회), 좋아진 곳 4곳(6개월 전 → 지금), 현대백화점 B2의 후진 잦은 곳 3곳.
 * 좌표는 시안 그림 지도(판교역 기준 0.32px/m)에 원이 놓인 자리를 거꾸로 계산한 근사값이다. 장소 이름만 실제.
 *
 * 도면 좌표계: 미터, 원점 = 층 바닥 왼쪽 위, x 오른쪽·y 아래 (화면과 같은 방향). 기본 층 65.6 × 35.84 m
 * (시안 900×520 그림의 바닥 틀 820×448 px 를 12.5 px/m 로 잰 것).
 * 동선 점 [x, y, r]: r = 1 이면 바로 앞 점에서 이 점까지 후진으로 움직였다는 뜻 (첫 점은 늘 0).
 * 같은 인자면 늘 같은 결과 (주차장 id·층으로 정한 고정 시드 난수).
 */
import type {
  ImprovedLot,
  InsightLotRow,
  InsightsCompareResponse,
  InsightsLotResponse,
  InsightsOverviewResponse,
  LatLng,
  LotCategory,
  RampKind as LotRampKind,
  WeekdayHourHeat,
} from '../api-types/index.ts'
import { AISLE_YS, deriveStalls, EXIT, generateFloorLayout, SPINE_X, type FloorLayout, type RampKind } from './layout.ts'

export * from './layout.ts'

// ───────────── 타입 ─────────────

export type Hotspot = InsightsLotResponse['hotspots'][number]
export type OverlayPoint = [number, number, 0 | 1]
export type OverlayPath = OverlayPoint[]

export interface DemoOptions {
  /** 기간(일). 기본 30. 기록 수는 30일 값에 비례해서 늘고 줄며, 평균값은 같다 */
  days?: number
  /** 6개월 추이의 월 이름 기준 시각 (epoch ms 또는 Date). 기본 2026-11-03 (시안 날짜) */
  now?: number | Date
  /** 지역 id. 지금은 'pangyo' 하나 */
  region?: string | null
}

interface HotspotDef { title: string; detail: string; avgReverse: number; x: number; y: number; r: number }

export interface DemoLotDef {
  id: string
  name: string
  shortName: string
  category: LotCategory
  location: LatLng
  difficulty: number
  avgReverse: number
  avgRampTurns: number
  avgDurationSec: number
  /** 최근 30일 기록 수 */
  records: number
  /** 6개월 평균 후진 (오래된 달 → 이번 달). 마지막 값 = avgReverse */
  trend: number[]
  floors: string[]
  ramp: RampKind
  /** 층별 기록 비율(합 = 기록 수). 없으면 기본 분포 */
  floorRecords?: number[]
  floorAvgReverse?: number[]
  /** 층 → 후진 잦은 곳 (없으면 도면에서 만든다) */
  hotspots?: Record<string, HotspotDef[]>
  heat?: number[][]
}

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

/** 문자열 → 32비트 시드 (FNV-1a) */
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
const round2 = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// ───────────── 지역 · 주차장 (시안 수치) ─────────────

export const DEMO_REGION = { id: 'pangyo', name: '판교 일대', center: { lat: 37.39475, lng: 127.11119 } } as const
/** D-01 합계: 시안 값 그대로 (기록 수로 가중한 평균은 2.1이지만 시안은 2.0) */
export const DEMO_TOTALS = { avgReverse: 2.0, prevAvgReverse: 2.3 } as const
export const HEAT_WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
export const HEAT_HOURS = ['8시', '10시', '12시', '14시', '16시', '18시', '20시', '22시'] as const
/** 시안 날짜 2026-11-03 오후 5:02 (KST) */
export const DEMO_NOW = Date.parse('2026-11-03T08:02:00Z')

const B = (n: number) => Array.from({ length: n }, (_, i) => `B${i + 1}`)

/** D-01 '언제 어려운가요' (판교 일대, 요일 × 2시간 구간 평균 후진). 주말 오후·금요일 저녁이 진함 */
const REGION_HEAT: number[][] = [
  [1.7, 1.8, 1.9, 1.9, 2.0, 2.1, 1.9, 1.6],
  [1.7, 1.8, 1.8, 1.9, 2.0, 2.0, 1.9, 1.6],
  [2.3, 2.3, 1.9, 2.0, 2.0, 2.1, 2.4, 1.7],
  [1.8, 1.8, 1.9, 2.0, 2.1, 2.3, 2.0, 1.7],
  [1.8, 2.3, 2.0, 2.0, 2.1, 2.5, 2.6, 1.9],
  [1.6, 2.0, 2.6, 3.6, 3.7, 3.1, 2.4, 1.9],
  [1.6, 1.9, 2.5, 3.5, 3.6, 3.0, 2.3, 1.8],
]

/** D-02 현대백화점 '언제 어려운가요'. 다른 주차장은 이 모양을 평균 후진에 맞춰 줄이고 늘린다 */
const HYUNDAI_HEAT: number[][] = [
  [2.4, 2.5, 2.7, 3.0, 3.1, 2.7, 2.5, 2.3],
  [2.4, 2.5, 2.6, 3.0, 3.1, 2.7, 2.5, 2.3],
  [2.4, 2.5, 2.7, 3.1, 3.1, 2.7, 2.6, 2.3],
  [2.4, 2.5, 2.6, 3.0, 3.0, 2.7, 2.5, 2.0],
  [2.5, 2.6, 2.7, 3.1, 3.2, 3.0, 2.9, 2.4],
  [2.5, 2.7, 3.2, 4.5, 4.6, 3.3, 2.7, 2.4],
  [2.4, 2.6, 3.1, 4.4, 4.5, 3.2, 2.6, 2.3],
]

// 도면 기준 위치 (기본 층 틀, 미터) — 시안 D-02 그림의 px 를 (px − 40, px − 36) × 0.08 로 옮긴 값
const RAMP_EXIT_SPOT = { x: 60.0, y: 10.56, r: 2.4 } // 시안 (790,168)
const PILLAR_SPOT = { x: 34.4, y: 18.08, r: 2.4 } // 시안 (470,262)
const END_STALL_SPOT = { x: 52.0, y: 26.72, r: 2.4 } // 시안 (690,370)

const ramp1 = (avg: number): HotspotDef => ({ title: '램프 나와서 바로 왼쪽', detail: '회전 직후 시야가 좁아요', avgReverse: avg, ...RAMP_EXIT_SPOT })
const pillar = (avg: number, zone = 'C'): HotspotDef => ({ title: `${zone} 구역 기둥 사이`, detail: '기둥이 촘촘해요', avgReverse: avg, ...PILLAR_SPOT })
const endStall = (avg: number, zone = 'E'): HotspotDef => ({ title: `${zone} 구역 끝 칸`, detail: '막다른 통로', avgReverse: avg, ...END_STALL_SPOT })

export const DEMO_LOTS: readonly DemoLotDef[] = [
  {
    id: 'hyundai-pangyo', name: '현대백화점 판교점 지하주차장', shortName: '현대백화점 판교점 지하', category: 'DEPARTMENT',
    location: { lat: 37.39248, lng: 127.11221 }, difficulty: 4.3, avgReverse: 3.2, avgRampTurns: 2.5, avgDurationSec: 130, records: 1284,
    trend: [3.38, 3.35, 3.31, 3.27, 3.27, 3.2], floors: B(6), ramp: 'spiral',
    floorRecords: [140, 360, 330, 210, 140, 104],
    floorAvgReverse: [2.1, 3.6, 3.4, 3.0, 2.8, 2.6],
    hotspots: {
      B1: [ramp1(1.6)],
      B2: [ramp1(2.8), pillar(2.4), endStall(2.1)],
      B3: [pillar(2.3), endStall(2.0)],
      B4: [ramp1(2.2), endStall(1.8)],
      B5: [ramp1(2.0)],
      B6: [endStall(1.9)],
    },
    heat: HYUNDAI_HEAT,
  },
  {
    id: 'u-space-pangyo', name: '유스페이스 지하주차장', shortName: '유스페이스', category: 'OFFICE',
    location: { lat: 37.39944, lng: 127.11243 }, difficulty: 4.1, avgReverse: 2.9, avgRampTurns: 1.5, avgDurationSec: 115, records: 642,
    trend: [3.0, 3.0, 2.9, 3.0, 2.9, 2.9], floors: B(5), ramp: 'spiral',
  },
  {
    id: 'h-square', name: 'H스퀘어 지하주차장', shortName: 'H스퀘어', category: 'OFFICE',
    location: { lat: 37.40126, lng: 127.10935 }, difficulty: 3.9, avgReverse: 2.6, avgRampTurns: 2, avgDurationSec: 110, records: 871,
    trend: [2.9, 2.8, 2.8, 2.7, 2.6, 2.6], floors: B(4), ramp: 'spiral',
  },
  {
    id: 'pangyo-seven-venture', name: '판교세븐벤처밸리 지하주차장', shortName: '판교세븐벤처밸리', category: 'OFFICE',
    location: { lat: 37.40368, lng: 127.11002 }, difficulty: 3.6, avgReverse: 2.4, avgRampTurns: 1, avgDurationSec: 100, records: 515,
    trend: [2.5, 2.45, 2.45, 2.4, 2.4, 2.4], floors: B(3), ramp: 'spiral',
  },
  {
    id: 'botdeul-mall', name: '봇들마을 상가 주차장', shortName: '봇들마을 상가', category: 'MALL',
    location: { lat: 37.39382, lng: 127.12119 }, difficulty: 3.4, avgReverse: 2.3, avgRampTurns: 0, avgDurationSec: 90, records: 233,
    trend: [2.4, 2.35, 2.35, 2.3, 2.3, 2.3], floors: ['1F'], ramp: 'none',
  },
  {
    id: 'hwarang-park-public', name: '화랑공원 공영주차장', shortName: '화랑공원 공영', category: 'PUBLIC',
    location: { lat: 37.39118, lng: 127.11592 }, difficulty: 2.9, avgReverse: 1.8, avgRampTurns: 0, avgDurationSec: 70, records: 402,
    trend: [2.2, 2.1, 2.0, 1.9, 1.8, 1.8], floors: ['1F'], ramp: 'none',
  },
  {
    id: 'alphadom-tower', name: '알파돔타워 지하주차장', shortName: '알파돔타워', category: 'OFFICE',
    location: { lat: 37.3954, lng: 127.11006 }, difficulty: 2.4, avgReverse: 1.5, avgRampTurns: 0.3, avgDurationSec: 65, records: 958,
    trend: [1.7, 1.7, 1.6, 1.6, 1.5, 1.5], floors: B(4), ramp: 'straight',
  },
  {
    id: 'avenue-france-pangyo', name: '아브뉴프랑 판교 주차장', shortName: '아브뉴프랑 판교', category: 'MALL',
    location: { lat: 37.39225, lng: 127.11013 }, difficulty: 1.8, avgReverse: 1.1, avgRampTurns: 0.2, avgDurationSec: 50, records: 1106,
    trend: [1.4, 1.3, 1.2, 1.2, 1.1, 1.1], floors: B(3), ramp: 'straight',
  },
  {
    id: 'baekhyun-5', name: '백현마을 5단지 지하주차장', shortName: '백현마을 5단지', category: 'APARTMENT',
    location: { lat: 37.38624, lng: 127.10974 }, difficulty: 1.6, avgReverse: 0.9, avgRampTurns: 0, avgDurationSec: 40, records: 377,
    trend: [0.95, 0.95, 0.9, 0.9, 0.9, 0.9], floors: ['B1'], ramp: 'none',
  },
]

// ───────────── 공통 ─────────────

function toMs(now: number | Date | undefined): number {
  if (now == null) return DEMO_NOW
  return typeof now === 'number' ? now : now.getTime()
}

/** 최근 n개월 이름 "2026-06" … "2026-11" (한국 시간 기준 달) */
export function monthLabels(now: number | Date = DEMO_NOW, n = 6): string[] {
  const d = new Date(toMs(now) + 9 * 3_600_000)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(y, m - (n - 1 - i), 1))
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

function normDays(days: number | undefined): number {
  const d = Math.round(Number(days ?? 30))
  return Number.isFinite(d) ? clamp(d, 1, 365) : 30
}

const scaleCount = (n30: number, days: number) => Math.max(0, Math.round((n30 * days) / 30))

const regionOk = (region: string | null | undefined) => region == null || region === '' || region === DEMO_REGION.id

function heat(values: number[][]): WeekdayHourHeat {
  return { weekdays: [...HEAT_WEEKDAYS], hours: [...HEAT_HOURS], values: values.map((r) => [...r]) }
}

/** 생성기 램프 종류(소문자) → 계약 RampKind (D-03 램프 칸 "없음"/"직선"/"N바퀴") */
export const RAMP_KIND: Record<RampKind, LotRampKind> = { none: 'NONE', straight: 'STRAIGHT', spiral: 'SPIRAL' }

export function lotRow(def: DemoLotDef, opts: DemoOptions = {}): InsightLotRow {
  const days = normDays(opts.days)
  const months = monthLabels(opts.now)
  return {
    id: def.id,
    name: def.name,
    shortName: def.shortName,
    category: def.category,
    rampKind: RAMP_KIND[def.ramp],
    location: { ...def.location },
    difficulty: def.difficulty,
    avgReverse: def.avgReverse,
    avgRampTurns: def.avgRampTurns,
    avgDurationSec: def.avgDurationSec,
    records: scaleCount(def.records, days),
    trend: def.trend.map((v, i) => ({ month: months[i], avgReverse: v })),
  }
}

const byDifficulty = (a: InsightLotRow, b: InsightLotRow) =>
  (b.difficulty ?? -1) - (a.difficulty ?? -1) || b.records - a.records

/** 6개월 전보다 평균 후진이 줄어든 곳, 많이 준 순 (같으면 어려운 순), 최대 max */
export function improvedLots(defs: readonly DemoLotDef[] = DEMO_LOTS, max = 4): ImprovedLot[] {
  return defs
    .map((d) => ({ d, drop: Math.round((d.trend[0] - d.avgReverse) * 100) }))
    .filter((x) => x.drop > 0)
    .sort((a, b) => b.drop - a.drop || b.d.difficulty - a.d.difficulty)
    .slice(0, max)
    .map(({ d }) => ({ id: d.id, name: d.shortName, before: d.trend[0], after: d.avgReverse, trend: [...d.trend] }))
}

// ───────────── 응답 (GET /v1/insights/*) ─────────────

export function demoOverview(opts: DemoOptions = {}): InsightsOverviewResponse | null {
  if (!regionOk(opts.region)) return null
  const days = normDays(opts.days)
  const lots = DEMO_LOTS.map((d) => lotRow(d, opts)).sort(byDifficulty)
  return {
    region: { id: DEMO_REGION.id, name: DEMO_REGION.name, center: { ...DEMO_REGION.center } },
    days,
    demo: true,
    totals: {
      records: lots.reduce((a, l) => a + l.records, 0),
      lots: lots.length,
      avgReverse: DEMO_TOTALS.avgReverse,
      prevAvgReverse: DEMO_TOTALS.prevAvgReverse,
    },
    lots,
    heat: heat(REGION_HEAT),
    improved: improvedLots(),
  }
}

export function demoCompare(opts: DemoOptions & { category?: LotCategory | LotCategory[] | string | null } = {}): InsightsCompareResponse | null {
  if (!regionOk(opts.region)) return null
  const raw = opts.category
  const cats = raw == null || raw === '' ? null : new Set((Array.isArray(raw) ? raw : String(raw).split(',')).map((c) => c.trim().toUpperCase()))
  const lots = DEMO_LOTS.filter((d) => !cats || cats.has(d.category)).map((d) => lotRow(d, opts)).sort(byDifficulty)
  return { region: { id: DEMO_REGION.id, name: DEMO_REGION.name }, days: normDays(opts.days), demo: true, lots }
}

const FLOOR_SHARE = [0.11, 0.28, 0.26, 0.16, 0.11, 0.08]
const FLOOR_FACTOR = [0.66, 1.12, 1.06, 0.94, 0.88, 0.81]

/** 합이 total 이 되게 비율대로 나눈다 (큰 나머지 순) */
function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1
  const raw = weights.map((w) => (total * w) / sum)
  const out = raw.map(Math.floor)
  let left = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]] += 1
  return out
}

function floorAverages(def: DemoLotDef): number[] {
  if (def.floorAvgReverse) return [...def.floorAvgReverse]
  if (def.floors.length === 1) return [def.avgReverse]
  return def.floors.map((_, i) => round1(def.avgReverse * FLOOR_FACTOR[Math.min(i, FLOOR_FACTOR.length - 1)]))
}

function hotspotTemplates(ramp: RampKind, avg: number): HotspotDef[] {
  const first: HotspotDef = ramp === 'spiral'
    ? ramp1(avg)
    : ramp === 'straight'
      ? { title: '램프 내려와서 바로 왼쪽', detail: '경사가 끝나자마자 꺾여요', avgReverse: avg, ...RAMP_EXIT_SPOT }
      : { title: '입구 지나 바로 왼쪽', detail: '들어오는 차가 몰려요', avgReverse: avg, ...RAMP_EXIT_SPOT }
  return [first, pillar(avg), endStall(avg)]
}

function hotspotsFor(def: DemoLotDef, floorAvg: readonly number[]): Record<string, HotspotDef[]> {
  if (def.hotspots) return def.hotspots
  const out: Record<string, HotspotDef[]> = {}
  const hardest = floorAvg.indexOf(Math.max(...floorAvg))
  def.floors.forEach((floor, i) => {
    const t = hotspotTemplates(def.ramp, 0)
    if (i === hardest) {
      out[floor] = t
        .map((h, k) => ({ ...h, avgReverse: round1(floorAvg[i] * [0.78, 0.67, 0.58][k]) }))
        .filter((h) => h.avgReverse >= 1)
    } else {
      const v = round1(floorAvg[i] * 0.6)
      out[floor] = v >= 1.2 ? [{ ...t[i % 3], avgReverse: v }] : []
    }
  })
  return out
}

function lotHeat(def: DemoLotDef): number[][] {
  if (def.heat) return def.heat.map((r) => [...r])
  const r = mulberry32(hashSeed(`${def.id}:heat`))
  const k = def.avgReverse / 3.2
  return HYUNDAI_HEAT.map((row) => row.map((v) => Math.max(0.3, round1(v * k + gauss(r) * 0.06))))
}

export interface LotInsightsOptions extends DemoOptions {
  /** 층마다 그릴 동선 수 상한 (응답 크기). 기본 1500 */
  maxPathsPerFloor?: number
  /**
   * 서버(GET /v1/insights/lots/:id?floor=&maxPaths=)와 같게: 동선(overlays)은 이 층 하나만 (도면 layout 은 전 층).
   * '' 또는 'auto' 면 기록이 가장 많은 층. 없으면(기본) 예전처럼 전 층
   */
  floor?: string | null
  /** floor 와 같이 쓰는 상한 (서버 maxPaths, 기본 300) */
  maxPaths?: number
}

/** 서버 기본값과 같은 동선 상한 */
export const DEFAULT_MAX_PATHS = 300

export function demoLotInsights(id: string, opts: LotInsightsOptions = {}): InsightsLotResponse | null {
  const def = DEMO_LOTS.find((d) => d.id === id)
  if (!def) return null
  const days = normDays(opts.days)
  const row = lotRow(def, opts)
  const floorAvg = floorAverages(def)
  const perFloor = apportion(row.records, def.floorRecords ?? def.floors.map((_, i) => FLOOR_SHARE[Math.min(i, FLOOR_SHARE.length - 1)]))
  const hs = hotspotsFor(def, floorAvg)
  const single = opts.floor !== undefined && opts.floor !== null
  const busiest = def.floors[perFloor.indexOf(Math.max(...perFloor))]
  const only = single ? (opts.floor && opts.floor !== 'auto' && def.floors.includes(opts.floor.toUpperCase()) ? opts.floor.toUpperCase() : busiest) : null
  const cap = Math.max(0, Math.round(single ? (opts.maxPaths ?? DEFAULT_MAX_PATHS) : (opts.maxPathsPerFloor ?? 1500)))
  const layout: FloorLayout[] = []
  const overlays: InsightsLotResponse['overlays'] = []
  const hotspots: Hotspot[] = []
  def.floors.forEach((floor, i) => {
    const l = generateFloorLayout({ floor, ramp: def.ramp })
    layout.push(l)
    const spots = (hs[floor] ?? []).map((h, k) => ({ floor, rank: k + 1, ...h }))
    hotspots.push(...spots)
    if (only && floor !== only) return
    overlays.push({
      floor,
      paths: generateOverlayPaths(l, {
        count: Math.min(cap, perFloor[i]),
        seed: hashSeed(`${def.id}:${floor}:${days}`),
        ramp: def.ramp,
        hotspots: spots,
      }),
    })
  })
  return {
    demo: true,
    lot: { ...row, floors: [...def.floors], regionAvgReverse: DEMO_TOTALS.avgReverse },
    overlays,
    layout,
    hotspots,
    floorAvgReverse: def.floors.map((floor, i) => ({ floor, avgReverse: floorAvg[i] })),
    heat: heat(lotHeat(def)),
  }
}

// ───────────── 동선 ─────────────

export interface OverlayOptions {
  count: number
  seed: number
  ramp: RampKind
  /** 이 근처에서는 후진을 더 여러 번 한다 (그림에 그 자리가 진하게 드러남) */
  hotspots?: readonly { x: number; y: number; r: number }[]
}

type P = [number, number]

function bezier(p0: P, p1: P, p2: P, p3: P, n: number, from = 1 / n, to = 1): P[] {
  const out: P[] = []
  for (let k = 0; k <= n; k++) {
    const t = from + ((to - from) * k) / n
    if (t < from - 1e-9 || t > to + 1e-9) continue
    const u = 1 - t
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ])
  }
  return out
}

const near = (spots: readonly { x: number; y: number; r: number }[], x: number, y: number, pad: number) =>
  spots.some((s) => Math.hypot(s.x - x, s.y - y) <= s.r + pad)

/**
 * 차 count 대의 동선. 램프(또는 입구)로 들어와 통로를 따라 가서 칸에 앞으로/후진으로 넣는다.
 * 넣는 방식은 후진 60% · 앞으로 40%, hotspots 근처 칸이나 램프 출구에서는 후진을 한두 번 더 한다.
 */
export function generateOverlayPaths(layout: FloorLayout, opts: OverlayOptions): OverlayPath[] {
  const r = mulberry32(opts.seed)
  const spots = opts.hotspots ?? []
  const { rows } = deriveStalls(layout)
  if (!rows.length || opts.count <= 0) return []
  const exitBusy = near(spots, EXIT.x, EXIT.y + 1.2, 1)
  const aisleY = (i: number) => (layout.aisles[i][1] + layout.aisles[i][3]) / 2
  // 통로마다 무게: 램프에서 가까운 통로를 조금 더
  const weights = rows.map((row) => (row.lines.length - 1) * (aisleY(row.aisle) <= AISLE_YS[0] + 0.1 ? 1.15 : 1))
  const totalW = weights.reduce((a, b) => a + b, 0)
  const paths: OverlayPath[] = []

  for (let c = 0; c < opts.count; c++) {
    const pts: OverlayPoint[] = []
    const add = (p: P, rev: 0 | 1 = 0) => pts.push([round2(p[0]), round2(p[1]), pts.length ? rev : 0])
    const addAll = (ps: P[], rev: 0 | 1 = 0) => ps.forEach((p) => add(p, rev))

    // 1) 들어오기 → 1번 통로 입구(EXIT)에서 서쪽을 보고 선다
    const lane = clamp(gauss(r) * 0.32, -0.9, 0.9)
    const y1 = EXIT.y + lane
    if (opts.ramp === 'spiral' && layout.ramps.length) {
      const [cx, cy, rr] = layout.ramps[0]
      const rad = rr + clamp(gauss(r) * 0.18, -0.5, 0.5)
      const turns = 1 + r() * 0.2
      const a1 = Math.PI / 2
      const a0 = a1 - turns * 2 * Math.PI
      const steps = Math.ceil((a1 - a0) / (Math.PI / 10))
      for (let k = 0; k <= steps; k++) {
        const a = a0 + ((a1 - a0) * k) / steps
        add([cx + rad * Math.cos(a), cy + rad * Math.sin(a)])
      }
      add([EXIT.x - 1.2, y1])
    } else if (opts.ramp === 'straight') {
      const x = EXIT.x + lane * 0.6
      add([x, -0.4])
      add([x, EXIT.y - 2.2])
      addAll(bezier([x, EXIT.y - 2.2], [x, y1 - 0.3], [x - 0.4, y1], [x - 2.0, y1], 4))
    } else {
      add([layout.width + 0.4, y1])
      add([EXIT.x - 1.2, y1])
    }

    // 2) 칸 고르기: 통로 → 줄 → 칸 (램프 쪽 칸을 조금 더)
    let pick = r() * totalW
    let ri = 0
    while (ri < rows.length - 1 && pick > weights[ri]) pick -= weights[ri++]
    const row = rows[ri]
    const nSlots = row.lines.length - 1
    const slot = Math.min(nSlots - 1, Math.floor(nSlots * Math.pow(r(), 0.8)))
    const sx = (row.lines[slot] + row.lines[slot + 1]) / 2 + gauss(r) * 0.12
    const ay = aisleY(row.aisle)
    const ly = ay + lane * 0.8
    const dir = row.side === 'north' ? -1 : 1
    const depth = Math.min(Math.abs(row.y1 - row.y0) * 0.75, 3.0)
    const yEnd = row.y0 + dir * depth
    const last = (): P => [pts[pts.length - 1][0], pts[pts.length - 1][1]]

    // 3) 1번 통로가 아니면 세로 통로로 내려가기 (램프 출구에서 한 번 물러났다 가는 차도)
    if (Math.abs(ay - AISLE_YS[0]) > 0.5) {
      const xs = SPINE_X + clamp(gauss(r) * 0.25, -0.6, 0.6)
      if (exitBusy && r() < 0.45) {
        add([xs - 1.6, y1 + 0.1])
        add([xs + 0.6, y1 + 0.7], 1)
        addAll(bezier([xs + 0.6, y1 + 0.7], [xs, y1 + 0.9], [xs, y1 + 1.4], [xs, y1 + 2.4], 3))
      } else {
        addAll(bezier(last(), [xs - 0.2, y1], [xs, y1 + 0.2], [xs, y1 + 1.8], 4))
      }
      add([xs, ay - 1.8])
      addAll(bezier([xs, ay - 1.8], [xs, ly - 0.2], [xs - 0.2, ly], [xs - 1.8, ly], 4))
    } else if (exitBusy && sx > EXIT.x - 9 && r() < 0.3) {
      // 램프에서 나오자마자 왼쪽 칸: 한 번 더 고쳐 넣기
      add([EXIT.x - 3.2, ly])
      add([EXIT.x - 1.8, ly + 0.6], 1)
    }

    // 4) 칸에 넣기
    const extra = near(spots, sx, ay, 1.5) ? 0.7 : 0.12
    if (r() < 0.6) {
      // 후진 주차: 칸을 지나쳐 섰다가 뒤로
      const past = sx - 2.4 - r() * 0.8
      add([past, ly])
      const P0: P = [past, ly]
      const P1: P = [sx - 0.4, ly]
      const P2: P = [sx, ly + dir * 0.7]
      const P3: P = [sx, yEnd]
      if (r() < extra) {
        addAll(bezier(P0, P1, P2, P3, 5, 0.2, 0.55), 1)
        const back: P = [sx - 1.4 - r() * 0.5, ly + dir * 0.3]
        add(back)
        addAll(bezier(back, [sx - 0.3, ly + dir * 0.4], [sx, ly + dir * 0.9], P3, 6), 1)
      } else {
        addAll(bezier(P0, P1, P2, P3, 7), 1)
      }
    } else {
      // 앞으로 주차
      const before = sx + 2.0 + r() * 0.6
      add([before, ly])
      const P0: P = [before, ly]
      const P1: P = [sx - 0.4, ly]
      const P2: P = [sx, ly + dir * 0.9]
      const P3: P = [sx, yEnd]
      addAll(bezier(P0, P1, P2, P3, 7))
      if (r() < extra) {
        // 비뚤어서 한 번 빼고 다시
        add([sx + 0.5, (ly + yEnd) / 2], 1)
        add([sx, yEnd])
      }
    }
    paths.push(pts)
  }
  return paths
}
