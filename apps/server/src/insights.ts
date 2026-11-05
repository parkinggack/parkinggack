/**
 * PC 대시보드 통계 (D-01 개요 · D-02 주차장 상세 · D-03 비교). 공개 · 집계값만 — 기록 한 건은 절대 내보내지 않는다.
 * 같은 모양을 서버 없이 만드는 시연 생성기: packages/insights-demo (어드민 시연 모드). 시드도 그 생성기를 쓴다.
 *
 * - 기간(days): [지금 − days, 지금]. 지난 기간: [지금 − 2·days, 지금 − days)
 * - 지역 평균 후진 = 지역 주차장들의 평균 후진을 다시 평균 (주차장마다 같은 무게 — 큰 주차장 하나가 지역을 대표하지 않게)
 * - 대상: 그 지역에서 데이터가 충분한(difficulty 가 있는) 주차장
 * - 추이(trend): 30일씩 6칸, 오래된 → 최근. 칸 이름은 지금 달에서 k달 전 ("2026-06" … "2026-11").
 *   값은 소수 둘째 자리, 마지막 칸(= 최근 30일)은 표에 보이는 평균 후진과 같게 소수 한 자리
 * - 좋아진 곳: 첫 칸(6개월 전) − 마지막 칸(지금) > 0 인 곳, 많이 줄어든 순(같으면 어려운 순) 4곳 — insights-demo improvedLots 와 같은 규칙
 * - 히트맵: 요일 × 8시부터 2시간 칸 평균 후진 (기록 없으면 null)
 * - demo: 집계한 기록(또는 그린 동선)에 시연 데이터가 섞여 있으면 true → 화면의 "시연용 예시 데이터" 띠
 */
import type { InValue } from '@libsql/client'
import type {
  ImprovedLot,
  InsightLotRow,
  InsightsCompareResponse,
  InsightsLotResponse,
  InsightsOverviewResponse,
  LatLng,
  LotCategory,
  WeekdayHourHeat,
} from '@parkinggack/api-types'
import { DASH_HOUR_LABELS, DAY_MS, WEEKDAY_LABELS, dashBucket, round1, round2 } from './scoring.js'
import { monthBefore, monthKey } from './me-store.js'
import { placeholders, type Lot, type Store } from './store.js'
import { effectiveRampKind, effectiveShortName } from './views.js'

export const TREND_BUCKETS = 6
export const TREND_BUCKET_MS = 30 * DAY_MS
export const IMPROVED_MAX = 4
export const DEFAULT_MAX_PATHS = 300

/** 지역 이름·지도 중심. 없는 지역은 id 그대로, 중심은 주차장 좌표 평균 (판교 중심 = insights-demo DEMO_REGION) */
export const REGIONS: Record<string, { name: string; center?: LatLng }> = {
  pangyo: { name: '판교 일대', center: { lat: 37.39475, lng: 127.11119 } },
  bundang: { name: '분당' },
  seoul: { name: '서울' },
  gyeonggi: { name: '경기' },
  incheon: { name: '인천' },
}

type Row = Record<string, InValue>
const num = (v: InValue) => Number(v ?? 0)

interface WindowStat {
  n: number
  rev: number
  ramp: number
  dur: number
  demo: number
}

export class Insights {
  constructor(private readonly s: Store) {}

  /** 지역의 데이터 충분한 주차장 */
  async regionLots(region: string): Promise<Lot[]> {
    return (await this.s.allLots()).filter((l) => l.region === region && l.difficulty != null)
  }

  private async windowStats(ids: string[], from: number, to: number): Promise<Map<string, WindowStat>> {
    const out = new Map<string, WindowStat>()
    if (!ids.length) return out
    const rows = await this.s.all(
      `SELECT lot_id, COUNT(*) AS n, SUM(reverse_count) AS rev, SUM(ramp_turns) AS ramp, SUM(duration_sec) AS dur, SUM(demo) AS demo FROM records
       WHERE lot_id IN (${placeholders(ids.length)}) AND received_ms >= ? AND received_ms <= ? GROUP BY lot_id`,
      [...ids, from, to],
    )
    for (const r of rows) out.set(String(r.lot_id), { n: num(r.n), rev: num(r.rev), ramp: num(r.ramp), dur: num(r.dur), demo: num(r.demo) })
    return out
  }

  /** 주차장별 6칸 추이 (오래된 → 최근), 기록 없는 칸은 null */
  private async trends(ids: string[]): Promise<Map<string, { month: string; avgReverse: number | null }[]>> {
    const now = this.s.now()
    const out = new Map<string, { month: string; avgReverse: number | null }[]>()
    if (!ids.length) return out
    const rows = await this.s.all(
      `SELECT lot_id, CAST((? - received_ms) / ? AS INTEGER) AS k, COUNT(*) AS n, SUM(reverse_count) AS rev FROM records
       WHERE lot_id IN (${placeholders(ids.length)}) AND received_ms > ? AND received_ms <= ? GROUP BY lot_id, k`,
      [now, TREND_BUCKET_MS, ...ids, now - TREND_BUCKETS * TREND_BUCKET_MS, now],
    )
    const cur = monthKey(now)
    for (const id of ids) out.set(id, Array.from({ length: TREND_BUCKETS }, (_, i) => ({ month: monthBefore(cur, TREND_BUCKETS - 1 - i), avgReverse: null })))
    for (const r of rows) {
      const k = num(r.k)
      if (k < 0 || k >= TREND_BUCKETS || !num(r.n)) continue
      const v = num(r.rev) / num(r.n)
      out.get(String(r.lot_id))![TREND_BUCKETS - 1 - k].avgReverse = k === 0 ? round1(v) : round2(v)
    }
    return out
  }

  private async heat(ids: string[], from: number, to: number): Promise<WeekdayHourHeat> {
    const values: (number | null)[][] = WEEKDAY_LABELS.map(() => DASH_HOUR_LABELS.map(() => null))
    if (ids.length) {
      const rows = await this.s.all(
        `SELECT parked_weekday AS w, parked_hour AS h, COUNT(*) AS n, SUM(reverse_count) AS rev FROM records
         WHERE lot_id IN (${placeholders(ids.length)}) AND received_ms >= ? AND received_ms <= ? GROUP BY w, h`,
        [...ids, from, to],
      )
      const acc = WEEKDAY_LABELS.map(() => DASH_HOUR_LABELS.map(() => ({ n: 0, rev: 0 })))
      for (const r of rows) {
        const w = num(r.w)
        const b = dashBucket(num(r.h))
        if (w < 1 || w > 7 || b < 0) continue
        acc[w - 1][b].n += num(r.n)
        acc[w - 1][b].rev += num(r.rev)
      }
      acc.forEach((row, w) => row.forEach((c, b) => (values[w][b] = c.n ? round1(c.rev / c.n) : null)))
    }
    return { weekdays: [...WEEKDAY_LABELS], hours: [...DASH_HOUR_LABELS], values }
  }

  private row(l: Lot, st: WindowStat | undefined, trend: { month: string; avgReverse: number | null }[]): InsightLotRow {
    const n = st?.n ?? 0
    return {
      id: l.id,
      name: l.name,
      shortName: effectiveShortName(l),
      category: l.category,
      rampKind: effectiveRampKind(l),
      location: { lat: l.location.lat, lng: l.location.lng },
      difficulty: l.difficulty,
      avgReverse: n ? round1(st!.rev / n) : 0,
      avgRampTurns: n ? round1(st!.ramp / n) : 0,
      avgDurationSec: n ? Math.round(st!.dur / n) : 0,
      records: n,
      trend: trend.filter((t) => t.avgReverse != null).map((t) => ({ month: t.month, avgReverse: t.avgReverse! })),
    }
  }

  /** 지역 평균 (주차장마다 같은 무게) — 기록 있는 주차장만 */
  private static regionMean(stats: Map<string, WindowStat>): number | null {
    const xs = [...stats.values()].filter((s) => s.n > 0).map((s) => s.rev / s.n)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
  }

  private static anyDemo(...stats: Map<string, WindowStat>[]): boolean {
    return stats.some((m) => [...m.values()].some((s) => s.demo > 0))
  }

  private async rows(lots: Lot[], days: number) {
    const now = this.s.now()
    const ids = lots.map((l) => l.id)
    const [cur, trends] = await Promise.all([this.windowStats(ids, now - days * DAY_MS, now), this.trends(ids)])
    const rows = lots.map((l) => this.row(l, cur.get(l.id), trends.get(l.id)!))
    rows.sort((a, b) => (b.difficulty ?? -1) - (a.difficulty ?? -1) || b.records - a.records || a.name.localeCompare(b.name, 'ko'))
    return { rows, cur, trends }
  }

  private regionInfo(region: string, lots: Lot[]) {
    const known = REGIONS[region]
    const center = known?.center ?? {
      lat: Math.round((lots.reduce((a, l) => a + l.location.lat, 0) / lots.length) * 1e5) / 1e5,
      lng: Math.round((lots.reduce((a, l) => a + l.location.lng, 0) / lots.length) * 1e5) / 1e5,
    }
    return { id: region, name: known?.name ?? region, center }
  }

  /** D-01 */
  async overview(region: string, days: number): Promise<InsightsOverviewResponse | null> {
    const lots = await this.regionLots(region)
    if (!lots.length) return null
    const now = this.s.now()
    const ids = lots.map((l) => l.id)
    const [{ rows, cur, trends }, prev, heat] = await Promise.all([
      this.rows(lots, days),
      this.windowStats(ids, now - 2 * days * DAY_MS, now - days * DAY_MS - 1),
      this.heat(ids, now - days * DAY_MS, now),
    ])
    const avg = Insights.regionMean(cur)
    const prevAvg = Insights.regionMean(prev)
    const byId = new Map(rows.map((r) => [r.id, r]))
    const improved: Array<ImprovedLot & { drop: number; difficulty: number }> = []
    for (const l of lots) {
      const t = trends.get(l.id)!
      const before = t[0].avgReverse
      const after = t[TREND_BUCKETS - 1].avgReverse
      if (before == null || after == null) continue
      const drop = Math.round((before - after) * 100)
      if (drop <= 0) continue
      improved.push({ id: l.id, name: byId.get(l.id)!.shortName, before, after, trend: t.map((x) => x.avgReverse ?? 0), drop, difficulty: l.difficulty ?? 0 })
    }
    improved.sort((a, b) => b.drop - a.drop || b.difficulty - a.difficulty)
    const { center, ...rest } = this.regionInfo(region, lots)
    return {
      region: { ...rest, center },
      days,
      demo: Insights.anyDemo(cur),
      totals: {
        records: rows.reduce((a, r) => a + r.records, 0),
        lots: rows.length,
        avgReverse: avg == null ? 0 : round1(avg),
        prevAvgReverse: prevAvg == null ? null : round1(prevAvg),
      },
      lots: rows,
      heat,
      improved: improved.slice(0, IMPROVED_MAX).map(({ drop: _d, difficulty: _f, ...x }) => x),
    }
  }

  /**
   * D-02. 동선(overlays)은 floor 한 층만 (없거나 모르는 층이면 동선이 가장 많은 층, 동선이 없으면 기간 안 기록이 가장 많은 층), maxPaths 개까지.
   * 도면(layout)·후진 잦은 곳(hotspots)은 전 층 (작음)
   */
  async lot(id: string, days: number, floor?: string, maxPaths = DEFAULT_MAX_PATHS): Promise<InsightsLotResponse | null> {
    const lot = await this.s.getLot(id)
    if (!lot) return null
    const now = this.s.now()
    const from = now - days * DAY_MS
    const regionLots = await this.regionLots(lot.region)
    const [{ rows, cur }, regionStats, floorRows, layouts, hotspots, overlayFloors, heat] = await Promise.all([
      this.rows([lot], days),
      this.windowStats(regionLots.map((l) => l.id), from, now),
      this.s.all(
        `SELECT floor, COUNT(*) AS n, SUM(reverse_count) AS rev FROM records WHERE lot_id = ? AND received_ms >= ? AND received_ms <= ? AND floor IS NOT NULL GROUP BY floor`,
        [id, from, now],
      ),
      this.s.all('SELECT * FROM lot_layouts WHERE lot_id = ?', [id]),
      this.s.all('SELECT * FROM lot_hotspots WHERE lot_id = ? ORDER BY floor, rank', [id]),
      this.s.all('SELECT floor, json_array_length(paths) AS n FROM lot_overlays WHERE lot_id = ?', [id]),
      this.heat([id], from, now),
    ])
    const order = (f: string) => {
      const i = lot.floors.indexOf(f)
      return i < 0 ? 999 : i
    }
    const byFloor = <T extends { floor: string }>(xs: T[]) => xs.sort((a, b) => order(a.floor) - order(b.floor))
    const counted = floorRows.filter((r) => num(r.n) > 0).sort((a, b) => num(b.n) - num(a.n) || order(String(a.floor)) - order(String(b.floor)))
    const wanted = floor?.toUpperCase()
    // 기본 층: 동선이 가장 많은 층 (동선이 없으면 기간 안 기록이 가장 많은 층)
    const drawn = overlayFloors.filter((r) => num(r.n) > 0).sort((a, b) => num(b.n) - num(a.n) || order(String(a.floor)) - order(String(b.floor)))
    const busiest = drawn.length ? String(drawn[0].floor) : counted.length ? String(counted[0].floor) : lot.floors[0]
    const pick = wanted && lot.floors.includes(wanted) ? wanted : busiest
    let overlays: InsightsLotResponse['overlays'] = []
    let overlayDemo = false
    if (overlayFloors.some((r) => String(r.floor) === pick)) {
      const r = await this.s.one('SELECT paths, demo FROM lot_overlays WHERE lot_id = ? AND floor = ?', [id, pick])
      overlays = [{ floor: pick, paths: (JSON.parse(String(r!.paths)) as InsightsLotResponse['overlays'][number]['paths']).slice(0, maxPaths) }]
      overlayDemo = num(r!.demo) === 1
    }
    const regionAvg = Insights.regionMean(regionStats)
    return {
      demo: Insights.anyDemo(cur) || overlayDemo,
      lot: { ...rows[0], floors: lot.floors, regionAvgReverse: regionAvg == null ? rows[0].avgReverse : round1(regionAvg) },
      overlays,
      layout: byFloor(
        layouts.map((r: Row) => ({
          floor: String(r.floor),
          width: num(r.width),
          height: num(r.height),
          aisles: JSON.parse(String(r.aisles)),
          ramps: JSON.parse(String(r.ramps)),
          zones: JSON.parse(String(r.zones)),
        })),
      ),
      hotspots: hotspots
        .map((r: Row) => ({
          floor: String(r.floor),
          rank: num(r.rank),
          title: String(r.title),
          detail: String(r.detail),
          avgReverse: num(r.avg_reverse),
          x: num(r.x),
          y: num(r.y),
          r: num(r.r),
        }))
        .sort((a, b) => order(a.floor) - order(b.floor) || a.rank - b.rank),
      floorAvgReverse: byFloor(counted.map((r) => ({ floor: String(r.floor), avgReverse: round1(num(r.rev) / num(r.n)) }))),
      heat,
    }
  }

  /** D-03 (category 여러 개면 그중 하나) */
  async compare(region: string, days: number, categories?: LotCategory[]): Promise<InsightsCompareResponse | null> {
    const all = await this.regionLots(region)
    if (!all.length) return null
    const lots = categories?.length ? all.filter((l) => categories.includes(l.category)) : all
    const { rows, cur } = await this.rows(lots, days)
    const { id, name } = this.regionInfo(region, all)
    return { region: { id, name }, days, demo: Insights.anyDemo(cur), lots: rows }
  }
}
