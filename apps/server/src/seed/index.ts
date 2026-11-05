/**
 * 시연 데이터 넣기. 로컬은 서버 첫 실행(빈 DB) 때 자동으로, Turso 는 `npm run seed -- --reset` (노트북에서).
 * 모든 합성 기록·별점·주차장은 demo=1. 원격(Turso)으로도 빨리 가게 여러 행을 한 문장에 넣고 몇백 문장씩 batch.
 */
import type { InStatement } from '@libsql/client'
import type { RatingInsert, RecordInsert, Store } from '../store.js'
import { multiInsert } from '../store.js'
import { generateLot, type MeanScale } from './generate.js'
import { dashboardSeed, type DashboardSeed } from './dashboard.js'
import { ensureKingDemo, kingDemoStatements } from './king.js'
import { OVERALL_TARGET, PANGYO, PANGYO_TARGETS, demoLots, type SeedLot } from './lots.js'

export interface SeedSummary {
  skipped: boolean
  lots: number
  records: number
  ratings: number
  /** v1.2 주차왕 시연 참여자 수 (판교 5개 리그) */
  king: number
  pangyo: Array<{ id: string; name: string; difficulty: number | null; sampleCount: number; target: { difficulty: number | null; sampleCount: number } }>
}

export interface SeedData {
  lots: SeedLot[]
  records: RecordInsert[]
  ratings: RatingInsert[]
  dashboard: DashboardSeed
  scale: MeanScale
}

/**
 * 시연 주차장 41곳의 평균을 한꺼번에 늘이거나 줄여서 C-08 "전체 평균"(주차장마다 같은 무게)이 OVERALL_TARGET 이 되게.
 * fixed = 판교 주차장들의 실제 90일 평균 (만든 기록에서 잼)
 */
export function demoScale(fixed: ReadonlyArray<{ reverse: number; ramp: number; duration: number }>, demo: readonly SeedLot[]): MeanScale {
  const N = fixed.length + demo.length
  const base = (l: SeedLot, k: keyof MeanScale) => (k === 'reverse' ? l.buckets[l.buckets.length - 1].reverse : l[k])
  const scale = (k: keyof MeanScale) => {
    const f = fixed.reduce((a, x) => a + x[k], 0)
    const free = demo.reduce((a, l) => a + base(l, k), 0)
    return free > 0 ? Math.max(0.2, (OVERALL_TARGET[k] * N - f) / free) : 1
  }
  return { reverse: scale('reverse'), ramp: scale('ramp'), duration: scale('duration') }
}

export function buildSeed(now: number): SeedData {
  const records: RecordInsert[] = []
  const ratings: RatingInsert[] = []
  const fixed: Array<{ reverse: number; ramp: number; duration: number }> = []
  for (const spec of PANGYO) {
    const g = generateLot(spec, now)
    records.push(...g.records)
    ratings.push(...g.ratings)
    fixed.push(g.mean90)
  }
  const demo = demoLots()
  const scale = demoScale(fixed, demo)
  for (const spec of demo) {
    const g = generateLot(spec, now, scale)
    records.push(...g.records)
    ratings.push(...g.ratings)
  }
  // id가 받은 시각 순서가 되게 (어드민 "최근 기록")
  records.sort((a, b) => a.receivedMs - b.receivedMs || a.clientRecordId.localeCompare(b.clientRecordId))
  ratings.sort((a, b) => a.createdMs - b.createdMs || a.clientRatingId.localeCompare(b.clientRatingId))
  return { lots: [...PANGYO, ...demo], records, ratings, dashboard: dashboardSeed(), scale }
}

const RESET_TABLES = ['records', 'ratings', 'lot_layouts', 'lot_hotspots', 'lot_overlays', 'lots']
/** 한 batch 에 넣을 문장 수 (원격 요청 크기를 몇 MB 안으로) */
const BATCH = 150
/** 동선 JSON 은 층 하나에 수백 KB 라 batch 를 따로 (몇 층씩) */
const OVERLAY_BATCH = 4

export async function seedDatabase(store: Store, opts: { reset?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<SeedSummary> {
  if (!opts.reset && (await store.lotCount()) > 0) {
    await ensureKingDemo(store) // v1.2 전에 시드한 DB 에는 주차왕 시연 참여자만 더한다
    return { ...(await summarize(store)), skipped: true }
  }
  const now = store.now()
  const data = buildSeed(now)
  const D = data.dashboard
  const stmts: InStatement[] = [
    ...(opts.reset ? RESET_TABLES.map((t) => `DELETE FROM ${t}`) : []),
    "DELETE FROM meta WHERE key LIKE 'demo_%' OR key = 'seeded_at'",
    ...data.lots.map((s) => store.insertLotStatement(s.lot, true)),
    ...store.recordInsertStatements(data.records),
    ...store.ratingInsertStatements(data.ratings),
    ...multiInsert(
      'lot_layouts',
      ['lot_id', 'floor', 'width', 'height', 'aisles', 'ramps', 'zones'],
      D.layouts.map((l) => [l.lotId, l.floor, l.width, l.height, JSON.stringify(l.aisles), JSON.stringify(l.ramps), JSON.stringify(l.zones)]),
    ),
    ...multiInsert(
      'lot_hotspots',
      ['lot_id', 'floor', 'rank', 'title', 'detail', 'avg_reverse', 'x', 'y', 'r'],
      D.hotspots.map((h) => [h.lotId, h.floor, h.rank, h.title, h.detail, h.avgReverse, h.x, h.y, h.r]),
    ),
    ...kingDemoStatements(),
    { sql: "INSERT INTO meta (key, value) VALUES ('demo_anchor_ms', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [String(now)] },
    { sql: "INSERT INTO meta (key, value) VALUES ('seeded_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", args: [new Date(now).toISOString()] },
  ]
  const overlays: InStatement[] = D.overlays.map((o) => ({
    sql: 'INSERT INTO lot_overlays (lot_id, floor, paths, demo) VALUES (?, ?, ?, 1)',
    args: [o.lotId, o.floor, JSON.stringify(o.paths)],
  }))
  const total = stmts.length + overlays.length
  for (let i = 0; i < stmts.length; i += BATCH) {
    await store.db.batch(stmts.slice(i, i + BATCH), 'write')
    opts.onProgress?.(Math.min(stmts.length, i + BATCH), total)
  }
  for (let i = 0; i < overlays.length; i += OVERLAY_BATCH) {
    await store.db.batch(overlays.slice(i, i + OVERLAY_BATCH), 'write')
    opts.onProgress?.(stmts.length + Math.min(overlays.length, i + OVERLAY_BATCH), total)
  }
  await store.recomputeAll()
  return { ...(await summarize(store)), skipped: false }
}

async function summarize(store: Store): Promise<Omit<SeedSummary, 'skipped'>> {
  const [lots, records, ratings, king] = await Promise.all([
    store.count('SELECT COUNT(*) AS c FROM lots'),
    store.count('SELECT COUNT(*) AS c FROM records'),
    store.count('SELECT COUNT(*) AS c FROM ratings'),
    store.count('SELECT COUNT(*) AS c FROM king_participants WHERE demo = 1'),
  ])
  const pangyo = await Promise.all(
    PANGYO.map(async (s) => {
      const l = await store.getLot(s.lot.id)
      const t = PANGYO_TARGETS[s.lot.id]
      return { id: s.lot.id, name: s.lot.name, difficulty: l?.difficulty ?? null, sampleCount: l?.sampleCount ?? 0, target: { difficulty: t.difficulty, sampleCount: t.sampleCount } }
    }),
  )
  return { lots, records, ratings, king, pangyo }
}
