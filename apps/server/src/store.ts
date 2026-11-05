/**
 * DB 읽기·쓰기 (libSQL, 모두 비동기). 주차장 점수는 lots 테이블에 캐시해 두고 기록·별점이 들어올 때마다 그 주차장만 다시 계산한다.
 * 시각은 모두 epoch ms, 기록이 받은 시각은 정시로 내려서 저장한다 (정확한 시각을 남기지 않음).
 * 외래 키(ON DELETE CASCADE)는 Turso 에서 연결마다 켜야 해서 기대지 않고, 지울 때 딸린 행을 직접 지운다.
 */
import { randomInt } from 'node:crypto'
import type { InStatement, InValue } from '@libsql/client'
import type {
  AdminOverviewResponse,
  AdminRecordRow,
  AnonymousRecord,
  DrivingExperience,
  LatLng,
  LotCategory,
  ParkingShape,
  RampKind,
  ReasonTag,
  SharePayload,
  VehicleClass,
  ZoneScheme,
} from '@parkinggack/api-types'
import type { DB } from './db.js'
import {
  DAY_MS,
  HOUR_MS,
  SAMPLE_WINDOW_DAYS,
  SCORE_WINDOW_DAYS,
  emptyHeat,
  heatBucket,
  isWeekdayAfternoon,
  overallFrom,
  recordDifficulty,
  round1,
  scoreLot,
  type CachedStats,
  type LotAggregate,
  type OverallAverages,
} from './scoring.js'

export const DEFAULT_ZONE_SCHEME: ZoneScheme = {
  zones: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  numbers: Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')),
  description: null,
}

export const LOT_CATEGORIES = ['DEPARTMENT', 'MALL', 'OFFICE', 'PUBLIC', 'APARTMENT', 'OTHER'] as const satisfies readonly LotCategory[]

/** 서버 안에서 쓰는 주차장 (API 모양은 views.ts) */
export interface Lot {
  id: string
  name: string
  aliases: string[]
  location: LatLng
  address: string | null
  floors: string[]
  zoneScheme: ZoneScheme
  manualTags: ReasonTag[]
  publicInfo: string[]
  feeText: string | null
  pitch: string | null
  suggestible: boolean
  category: LotCategory
  region: string
  /** 운영자가 정한 짧은 이름·램프 종류 (null = 자동, effectiveShortName·effectiveRampKind) */
  shortName: string | null
  rampKind: RampKind | null
  demo: boolean
  createdAt: number
  updatedAt: number
  // 캐시
  difficulty: number | null
  tags: ReasonTag[]
  statChips: string[]
  sampleCount: number
  scoreSampleCount: number
  ratingCount: number
  stats: CachedStats | null
}

export interface LotInput {
  id: string
  name: string
  location: LatLng
  address?: string | null
  floors: string[]
  zoneScheme?: ZoneScheme
  manualTags?: ReasonTag[]
  publicInfo?: string[]
  feeText?: string | null
  aliases?: string[]
  pitch?: string | null
  suggestible?: boolean
  category?: LotCategory
  region?: string
  shortName?: string | null
  rampKind?: RampKind | null
}

type Row = Record<string, InValue>

/** 시드가 한꺼번에 넣는 기록 */
export interface RecordInsert extends AnonymousRecord {
  demo: boolean
  receivedMs: number
}

export interface RatingInsert {
  clientRatingId: string
  lotId: string
  stars: number
  demo: boolean
  createdMs: number
}

export interface RecordFilter {
  lotId?: string
  demo?: boolean
  /** 이 id 보다 작은 것만 (커서) */
  before?: number
  limit: number
}

export type ShareLookup = { status: 'ok'; payload: SharePayload; expiresMs: number } | { status: 'gone' } | { status: 'missing' }

/** 헷갈리는 글자(0 o 1 l i) 뺀 31자 */
export const SHARE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const SHARE_CODE_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{6,8}$/
/** 만료된 링크는 내용을 지우고 코드만 30일 더 남겨서 410 을 준다 */
export const SHARE_TOMBSTONE_MS = 30 * DAY_MS

const json = <T>(s: InValue): T => JSON.parse(String(s)) as T
const num = (v: InValue): number => Number(v ?? 0)
const str = (v: InValue): string | null => (v == null ? null : String(v))
export const floorHour = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS
export const normalizeFloor = (f: string | null) => (f == null ? null : f.trim().toUpperCase() || null)

function rowToLot(r: Row): Lot {
  return {
    id: String(r.id),
    name: String(r.name),
    aliases: json(r.aliases),
    location: { lat: num(r.lat), lng: num(r.lng) },
    address: str(r.address),
    floors: json(r.floors),
    zoneScheme: json(r.zone_scheme),
    manualTags: json(r.manual_tags),
    publicInfo: json(r.public_info),
    feeText: str(r.fee_text),
    pitch: str(r.pitch),
    suggestible: num(r.suggestible) === 1,
    category: String(r.category ?? 'OTHER') as LotCategory,
    region: String(r.region ?? 'other'),
    shortName: str(r.short_name),
    rampKind: (str(r.ramp_kind) as RampKind | null) ?? null,
    demo: num(r.demo) === 1,
    createdAt: num(r.created_at),
    updatedAt: num(r.updated_at),
    difficulty: r.difficulty == null ? null : num(r.difficulty),
    tags: json(r.tags),
    statChips: json(r.stat_chips),
    sampleCount: num(r.sample_count),
    scoreSampleCount: num(r.score_sample_count),
    ratingCount: num(r.rating_count),
    stats: r.stats ? json(r.stats) : null,
  }
}

function rowToRecord(r: Row): AdminRecordRow {
  return {
    id: num(r.id),
    lotId: String(r.lot_id),
    lotName: String(r.lot_name),
    floor: str(r.floor),
    reverseCount: num(r.reverse_count),
    steeringTurns: num(r.steering_turns),
    durationSec: num(r.duration_sec),
    rampTurns: num(r.ramp_turns),
    shape: String(r.shape) as ParkingShape,
    vehicleClass: String(r.vehicle_class) as VehicleClass,
    experience: String(r.experience) as DrivingExperience,
    parkedHour: num(r.parked_hour),
    parkedWeekday: num(r.parked_weekday),
    demo: num(r.demo) === 1,
    receivedAt: new Date(num(r.received_ms)).toISOString(),
  }
}

const RECORD_COLS = [
  'client_record_id', 'lot_id', 'floor', 'reverse_count', 'steering_turns', 'brake_count', 'duration_sec', 'ramp_turns',
  'shape', 'approximate', 'vehicle_class', 'experience', 'parked_hour', 'parked_weekday', 'd', 'demo', 'received_ms',
] as const

function recordValues(r: RecordInsert): InValue[] {
  return [
    r.clientRecordId, r.lotId, normalizeFloor(r.floor), r.reverseCount, r.steeringTurns, r.brakeCount, r.durationSec, r.rampTurns,
    r.shape, r.approximate ? 1 : 0, r.vehicleClass, r.experience, r.parkedHour, r.parkedWeekday, recordDifficulty(r), r.demo ? 1 : 0,
    floorHour(r.receivedMs),
  ]
}

/** 여러 행을 한 문장에 (원격 Turso 왕복을 줄임) */
export function multiInsert(table: string, cols: readonly string[], rows: InValue[][], per = 100, tail = ''): InStatement[] {
  const out: InStatement[] = []
  const one = `(${cols.map(() => '?').join(',')})`
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per)
    out.push({ sql: `INSERT INTO ${table} (${cols.join(',')}) VALUES ${chunk.map(() => one).join(',')} ${tail}`, args: chunk.flat() })
  }
  return out
}

/** IN (?,?,…) 자리 */
export const placeholders = (n: number) => new Array(n).fill('?').join(',')

export class Store {
  private overallCache: { at: number; value: OverallAverages } | null = null

  constructor(
    readonly db: DB,
    readonly now: () => number = Date.now,
  ) {}

  async all(sql: string, args: InValue[] | Record<string, InValue> = []): Promise<Row[]> {
    const rs = await this.db.execute({ sql, args })
    return rs.rows as unknown as Row[]
  }

  async one(sql: string, args: InValue[] | Record<string, InValue> = []): Promise<Row | null> {
    return (await this.all(sql, args))[0] ?? null
  }

  async run(sql: string, args: InValue[] | Record<string, InValue> = []): Promise<number> {
    return (await this.db.execute({ sql, args })).rowsAffected
  }

  async count(sql: string, args: InValue[] = []): Promise<number> {
    return num((await this.one(sql, args))?.c ?? 0)
  }

  // ───────── 주차장 ─────────

  async allLots(): Promise<Lot[]> {
    return (await this.all('SELECT * FROM lots ORDER BY name')).map(rowToLot)
  }

  async getLot(id: string): Promise<Lot | null> {
    const r = await this.one('SELECT * FROM lots WHERE id = ?', [id])
    return r ? rowToLot(r) : null
  }

  async hasLot(id: string): Promise<boolean> {
    return (await this.one('SELECT 1 AS x FROM lots WHERE id = ?', [id])) != null
  }

  async lotCount(): Promise<number> {
    return this.count('SELECT COUNT(*) AS c FROM lots')
  }

  private lotParams(l: LotInput): Record<string, InValue> {
    return {
      id: l.id,
      name: l.name,
      aliases: JSON.stringify(l.aliases ?? []),
      lat: l.location.lat,
      lng: l.location.lng,
      address: l.address ?? null,
      floors: JSON.stringify(l.floors),
      zone_scheme: JSON.stringify({ ...DEFAULT_ZONE_SCHEME, ...l.zoneScheme, description: l.zoneScheme?.description ?? null }),
      manual_tags: JSON.stringify(l.manualTags ?? []),
      public_info: JSON.stringify(l.publicInfo ?? []),
      fee_text: l.feeText ?? null,
      pitch: l.pitch ?? null,
      suggestible: l.suggestible === false ? 0 : 1,
      category: l.category ?? 'OTHER',
      region: l.region ?? 'other',
      short_name: l.shortName ?? null,
      ramp_kind: l.rampKind ?? null,
    }
  }

  insertLotStatement(l: LotInput, demo: boolean): InStatement {
    return {
      sql: `INSERT INTO lots (id, name, aliases, lat, lng, address, floors, zone_scheme, manual_tags, public_info, fee_text, pitch, suggestible, category, region, short_name, ramp_kind, demo, created_at, updated_at)
        VALUES (:id, :name, :aliases, :lat, :lng, :address, :floors, :zone_scheme, :manual_tags, :public_info, :fee_text, :pitch, :suggestible, :category, :region, :short_name, :ramp_kind, :demo, :now, :now)
        ON CONFLICT(id) DO NOTHING`,
      args: { ...this.lotParams(l), demo: demo ? 1 : 0, now: this.now() },
    }
  }

  /** 새 주차장. 같은 id가 있으면 null */
  async insertLot(l: LotInput, opts: { demo?: boolean } = {}): Promise<Lot | null> {
    const rs = await this.db.execute(this.insertLotStatement(l, !!opts.demo))
    if (rs.rowsAffected === 0) return null
    return this.recomputeLot(l.id)
  }

  /** 메타데이터 수정 (id는 못 바꿈). 없으면 null */
  async updateLot(id: string, patch: Partial<Omit<LotInput, 'id'>>): Promise<Lot | null> {
    const cur = await this.getLot(id)
    if (!cur) return null
    const merged: LotInput = {
      id,
      name: patch.name ?? cur.name,
      location: patch.location ?? cur.location,
      address: patch.address !== undefined ? patch.address : cur.address,
      floors: patch.floors ?? cur.floors,
      zoneScheme: patch.zoneScheme ?? cur.zoneScheme,
      manualTags: patch.manualTags ?? cur.manualTags,
      publicInfo: patch.publicInfo ?? cur.publicInfo,
      feeText: patch.feeText !== undefined ? patch.feeText : cur.feeText,
      aliases: patch.aliases ?? cur.aliases,
      pitch: patch.pitch !== undefined ? patch.pitch : cur.pitch,
      suggestible: patch.suggestible ?? cur.suggestible,
      category: patch.category ?? cur.category,
      region: patch.region ?? cur.region,
      shortName: patch.shortName !== undefined ? patch.shortName : cur.shortName,
      rampKind: patch.rampKind !== undefined ? patch.rampKind : cur.rampKind,
    }
    await this.run(
      `UPDATE lots SET name=:name, aliases=:aliases, lat=:lat, lng=:lng, address=:address, floors=:floors, zone_scheme=:zone_scheme,
        manual_tags=:manual_tags, public_info=:public_info, fee_text=:fee_text, pitch=:pitch, suggestible=:suggestible,
        category=:category, region=:region, short_name=:short_name, ramp_kind=:ramp_kind, updated_at=:now WHERE id=:id`,
      { ...this.lotParams(merged), now: this.now() },
    )
    return this.recomputeLot(id)
  }

  /** 기록·별점·도면·동선도 같이 지운다 */
  async deleteLot(id: string): Promise<boolean> {
    const rs = await this.db.batch(
      [
        ...['records', 'ratings', 'lot_layouts', 'lot_hotspots', 'lot_overlays'].map((t) => ({ sql: `DELETE FROM ${t} WHERE lot_id = ?`, args: [id] })),
        { sql: 'DELETE FROM lots WHERE id = ?', args: [id] },
      ],
      'write',
    )
    this.overallCache = null
    return rs[rs.length - 1].rowsAffected > 0
  }

  // ───────── 점수 ─────────

  /** 여러 주차장의 90일 집계를 한 번에 (lotIds 없으면 전체) */
  async aggregate(lotIds?: string[]): Promise<Map<string, LotAggregate>> {
    const now = this.now()
    const from90 = now - SCORE_WINDOW_DAYS * DAY_MS
    const from30 = now - SAMPLE_WINDOW_DAYS * DAY_MS
    const filter = lotIds ? ` AND lot_id IN (${placeholders(lotIds.length)})` : ''
    const ids: InValue[] = lotIds ?? []
    const out = new Map<string, LotAggregate>()
    const get = (id: string): LotAggregate => {
      let a = out.get(id)
      if (!a) {
        a = { n90: 0, n30: 0, dSum: 0, reverseSum: 0, rampSum: 0, durationSum: 0, ratingCount: 0, starSum: 0, floorsSeen: new Set(), afternoonFloors: {}, heatCounts: emptyHeat() }
        out.set(id, a)
      }
      return a
    }
    for (const id of lotIds ?? []) get(id)
    const [main, slots, ratings] = await Promise.all([
      this.all(
        `SELECT lot_id, COUNT(*) AS n90, SUM(CASE WHEN received_ms >= ? THEN 1 ELSE 0 END) AS n30, COALESCE(SUM(d), 0) AS d_sum,
           COALESCE(SUM(reverse_count), 0) AS rev, COALESCE(SUM(ramp_turns), 0) AS ramp, COALESCE(SUM(duration_sec), 0) AS dur
         FROM records WHERE received_ms >= ?${filter} GROUP BY lot_id`,
        [from30, from90, ...ids],
      ),
      this.all(
        `SELECT lot_id, floor, parked_weekday AS w, parked_hour AS h, COUNT(*) AS c FROM records
         WHERE received_ms >= ?${filter} GROUP BY lot_id, floor, parked_weekday, parked_hour`,
        [from90, ...ids],
      ),
      this.all(`SELECT lot_id, COUNT(*) AS c, COALESCE(SUM(stars), 0) AS s FROM ratings WHERE created_ms >= ?${filter} GROUP BY lot_id`, [from90, ...ids]),
    ])
    for (const r of main) {
      const a = get(String(r.lot_id))
      a.n90 = num(r.n90)
      a.n30 = num(r.n30)
      a.dSum = num(r.d_sum)
      a.reverseSum = num(r.rev)
      a.rampSum = num(r.ramp)
      a.durationSum = num(r.dur)
    }
    for (const s of slots) {
      const a = get(String(s.lot_id))
      const w = num(s.w)
      const h = num(s.h)
      const c = num(s.c)
      if (s.floor != null) {
        const f = String(s.floor)
        a.floorsSeen.add(f)
        if (isWeekdayAfternoon(w, h)) a.afternoonFloors[f] = (a.afternoonFloors[f] ?? 0) + c
      }
      const b = heatBucket(h)
      if (b >= 0 && w >= 1 && w <= 7) a.heatCounts[w - 1][b] += c
    }
    for (const r of ratings) {
      const a = get(String(r.lot_id))
      a.ratingCount = num(r.c)
      a.starSum = num(r.s)
    }
    return out
  }

  /** 주차장 점수 다시 계산해서 저장. 다시 계산한 주차장 수 */
  async recomputeLots(lotIds?: string[]): Promise<number> {
    const lots = lotIds ? (await Promise.all(lotIds.map((id) => this.getLot(id)))).filter((l): l is Lot => !!l) : await this.allLots()
    if (!lots.length) return 0
    const aggs = await this.aggregate(lotIds ? lots.map((l) => l.id) : undefined)
    const now = this.now()
    const stmts: InStatement[] = lots.map((lot) => {
      const s = scoreLot(aggs.get(lot.id) ?? emptyAggregate(), lot)
      return {
        sql: `UPDATE lots SET difficulty=:difficulty, tags=:tags, stat_chips=:stat_chips, sample_count=:sample_count,
          score_sample_count=:score_sample_count, rating_count=:rating_count, stats=:stats, updated_at=:now WHERE id=:id`,
        args: {
          id: lot.id,
          difficulty: s.difficulty,
          tags: JSON.stringify(s.tags),
          stat_chips: JSON.stringify(s.statChips),
          sample_count: s.sampleCount,
          score_sample_count: s.scoreSampleCount,
          rating_count: s.ratingCount,
          stats: s.stats ? JSON.stringify(s.stats) : null,
          now,
        },
      }
    })
    for (let i = 0; i < stmts.length; i += 200) await this.db.batch(stmts.slice(i, i + 200), 'write')
    this.overallCache = null
    return lots.length
  }

  async recomputeLot(id: string): Promise<Lot | null> {
    await this.recomputeLots([id])
    return this.getLot(id)
  }

  async recomputeAll(): Promise<number> {
    return this.recomputeLots()
  }

  /** C-08 "전체 평균" — 주차장마다 같은 무게 (1분 캐시) */
  async overall(): Promise<OverallAverages> {
    const now = this.now()
    if (this.overallCache && now - this.overallCache.at < 60_000 && now >= this.overallCache.at) return this.overallCache.value
    const rows = await this.all(
      `SELECT COUNT(*) AS n, COALESCE(SUM(reverse_count), 0) AS rev, COALESCE(SUM(ramp_turns), 0) AS ramp, COALESCE(SUM(duration_sec), 0) AS dur
       FROM records WHERE received_ms >= ? GROUP BY lot_id`,
      [now - SCORE_WINDOW_DAYS * DAY_MS],
    )
    const value = overallFrom(rows.map((r) => ({ n: num(r.n), reverseSum: num(r.rev), rampSum: num(r.ramp), durationSum: num(r.dur) })))
    this.overallCache = { at: now, value }
    return value
  }

  // ───────── 기록 ─────────

  /** 받은 기록 저장. clientRecordId 가 이미 있으면 duplicate (아무것도 안 바꿈) */
  async insertRecord(rec: AnonymousRecord): Promise<{ duplicate: boolean }> {
    const [stmt] = multiInsert('records', RECORD_COLS, [recordValues({ ...rec, demo: false, receivedMs: this.now() })], 1, 'ON CONFLICT(client_record_id) DO NOTHING')
    return { duplicate: (await this.db.execute(stmt)).rowsAffected === 0 }
  }

  /** 시드용 (점수는 recomputeAll 로 따로) */
  recordInsertStatements(rows: RecordInsert[]): InStatement[] {
    return multiInsert('records', RECORD_COLS, rows.map(recordValues), 50, 'ON CONFLICT(client_record_id) DO NOTHING')
  }

  /** 어드민 기록 목록: 최신(id 큰) 순, before 보다 작은 id 만. nextBefore = 다음 쪽 커서 (없으면 null) */
  async listRecords(f: RecordFilter): Promise<{ records: AdminRecordRow[]; nextBefore: number | null }> {
    const where: string[] = []
    const args: InValue[] = []
    if (f.lotId !== undefined) {
      where.push('r.lot_id = ?')
      args.push(f.lotId)
    }
    if (f.demo !== undefined) {
      where.push('r.demo = ?')
      args.push(f.demo ? 1 : 0)
    }
    if (f.before !== undefined) {
      where.push('r.id < ?')
      args.push(f.before)
    }
    const rows = await this.all(
      `SELECT r.*, l.name AS lot_name FROM records r JOIN lots l ON l.id = r.lot_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.id DESC LIMIT ?`,
      [...args, f.limit + 1],
    )
    const page = rows.slice(0, f.limit).map(rowToRecord)
    return { records: page, nextBefore: rows.length > f.limit ? page[page.length - 1].id : null }
  }

  // ───────── 별점 ─────────

  async insertRating(lotId: string, clientRatingId: string, stars: number): Promise<{ duplicate: boolean }> {
    const n = await this.run(
      'INSERT INTO ratings (client_rating_id, lot_id, stars, demo, created_ms) VALUES (?, ?, ?, 0, ?) ON CONFLICT(client_rating_id) DO NOTHING',
      [clientRatingId, lotId, stars, floorHour(this.now())],
    )
    return { duplicate: n === 0 }
  }

  ratingInsertStatements(rows: RatingInsert[]): InStatement[] {
    return multiInsert(
      'ratings',
      ['client_rating_id', 'lot_id', 'stars', 'demo', 'created_ms'],
      rows.map((r) => [r.clientRatingId, r.lotId, r.stars, r.demo ? 1 : 0, floorHour(r.createdMs)]),
      100,
      'ON CONFLICT(client_rating_id) DO NOTHING',
    )
  }

  // ───────── 짧은 링크 ─────────

  async createShare(payload: SharePayload, ttlMs: number): Promise<{ code: string; expiresMs: number }> {
    const now = this.now()
    const expiresMs = now + ttlMs
    const body = JSON.stringify(payload)
    for (let attempt = 0; attempt < 12; attempt++) {
      const len = attempt < 6 ? 6 : attempt < 9 ? 7 : 8
      let code = ''
      for (let i = 0; i < len; i++) code += SHARE_ALPHABET[randomInt(SHARE_ALPHABET.length)]
      if ((await this.run('INSERT OR IGNORE INTO shares (code, payload, created_ms, expires_ms) VALUES (?, ?, ?, ?)', [code, body, now, expiresMs])) === 1) {
        return { code, expiresMs }
      }
    }
    throw new Error('짧은 링크 코드를 만들지 못했어요')
  }

  async getShare(code: string): Promise<ShareLookup> {
    const row = await this.one('SELECT payload, expires_ms FROM shares WHERE code = ?', [code])
    if (!row) return { status: 'missing' }
    if (row.payload == null) return { status: 'gone' }
    if (num(row.expires_ms) <= this.now()) {
      await this.run('UPDATE shares SET payload = NULL WHERE code = ?', [code]) // 내용은 바로 지움
      return { status: 'gone' }
    }
    return { status: 'ok', payload: json<SharePayload>(row.payload), expiresMs: num(row.expires_ms) }
  }

  /** 만료된 링크 내용 지우기 + 오래된 코드 정리 */
  async cleanupShares(): Promise<{ expired: number; purged: number }> {
    const now = this.now()
    const [a, b] = await this.db.batch(
      [
        { sql: 'UPDATE shares SET payload = NULL WHERE expires_ms <= ? AND payload IS NOT NULL', args: [now] },
        { sql: 'DELETE FROM shares WHERE expires_ms <= ?', args: [now - SHARE_TOMBSTONE_MS] },
      ],
      'write',
    )
    return { expired: a.rowsAffected, purged: b.rowsAffected }
  }

  // ───────── 메타 · 시연 데이터 ─────────

  async getMeta(key: string): Promise<string | null> {
    const r = await this.one('SELECT value FROM meta WHERE key = ?', [key])
    return r ? String(r.value) : null
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
  }

  /**
   * 시연 기록(demo=1)의 시각을 시드 기준 시각(demo_anchor_ms)에서 지금까지 흐른 만큼(정시 단위) 앞으로 옮긴다.
   * 그래야 시드 뒤 며칠이 지나도 "최근 30일 1,284대" 같은 시연 수치가 그대로다. 옮긴 시간(시)을 돌려준다.
   * 서버리스 인스턴스 여럿이 동시에 해도 한 번만 옮겨지게, 기준 시각이 그대로일 때만 바꾸는 조건을 한 트랜잭션에 둔다.
   */
  async rollDemo(): Promise<number> {
    const old = await this.getMeta('demo_anchor_ms')
    const anchor = Number(old)
    if (!old || !Number.isFinite(anchor) || anchor <= 0) return 0
    const hours = Math.floor((this.now() - anchor) / HOUR_MS)
    if (hours <= 0) return 0
    const d = hours * HOUR_MS
    const cond = `(SELECT value FROM meta WHERE key = 'demo_anchor_ms') = :old`
    const rs = await this.db.batch(
      [
        { sql: `UPDATE records SET received_ms = received_ms + :d WHERE demo = 1 AND ${cond}`, args: { d, old } },
        { sql: `UPDATE ratings SET created_ms = created_ms + :d WHERE demo = 1 AND ${cond}`, args: { d, old } },
        { sql: `UPDATE meta SET value = :next WHERE key = 'demo_anchor_ms' AND value = :old`, args: { next: String(anchor + d), old } },
      ],
      'write',
    )
    if (rs[2].rowsAffected === 0) return 0
    this.overallCache = null
    return hours
  }

  // ───────── 어드민 ─────────

  async overviewParts(): Promise<Omit<AdminOverviewResponse, 'hardest' | 'easiest'> & { lots: Lot[] }> {
    const now = this.now()
    const from90 = now - SCORE_WINDOW_DAYS * DAY_MS
    const [hourRows, dayRows, lots, records, records30d, ratings, shares, recent] = await Promise.all([
      this.all('SELECT parked_hour AS k, COUNT(*) AS c FROM records WHERE received_ms >= ? GROUP BY parked_hour', [from90]),
      this.all('SELECT parked_weekday AS k, COUNT(*) AS c FROM records WHERE received_ms >= ? GROUP BY parked_weekday', [from90]),
      this.allLots(),
      this.count('SELECT COUNT(*) AS c FROM records'),
      this.count('SELECT COUNT(*) AS c FROM records WHERE received_ms >= ?', [now - SAMPLE_WINDOW_DAYS * DAY_MS]),
      this.count('SELECT COUNT(*) AS c FROM ratings'),
      this.count('SELECT COUNT(*) AS c FROM shares WHERE payload IS NOT NULL AND expires_ms > ?', [now]),
      this.listRecords({ limit: 20 }),
    ])
    const byHour = new Array<number>(24).fill(0)
    for (const r of hourRows) if (num(r.k) >= 0 && num(r.k) < 24) byHour[num(r.k)] = num(r.c)
    const byWeekday = new Array<number>(7).fill(0)
    for (const r of dayRows) if (num(r.k) >= 1 && num(r.k) <= 7) byWeekday[num(r.k) - 1] = num(r.c)
    const scored = lots.filter((l) => l.difficulty != null)
    return {
      lots,
      totals: {
        lots: lots.length,
        avgDifficulty: scored.length ? round1(scored.reduce((a, l) => a + l.difficulty!, 0) / scored.length) : null,
        records,
        records30d,
        ratings,
        shares,
      },
      byHour,
      byWeekday,
      recentRecords: recent.records,
    }
  }
}

function emptyAggregate(): LotAggregate {
  return { n90: 0, n30: 0, dSum: 0, reverseSum: 0, rampSum: 0, durationSum: 0, ratingCount: 0, starSum: 0, floorsSeen: new Set(), afternoonFloors: {}, heatCounts: emptyHeat() }
}
