/**
 * 시연 모드용 가짜 서버. fetch 와 같은 모양이라 api.ts 클라이언트가 그대로 쓴다
 * (Authorization 헤더 검사·에러 본문·상태 코드까지 계약과 같게).
 * 데이터는 메모리에만 있다 — 새로고침하면 처음 상태로 돌아간다.
 *
 * - /v1/admin/*    어드민 (Bearer 토큰). 데이터는 fixtures.ts
 * - /v1/insights/* 공개 대시보드 통계 (인증 없음). 데이터는 packages/insights-demo (서버와 같은 생성기)
 */
import type {
  AdminLot,
  AdminLotInput,
  AdminOverviewResponse,
  LotCategory,
  ParkingLot,
  ReasonTag,
} from '@api-types'
import { demoCompare, demoLotInsights, demoOverview } from '@insights-demo'
import { DEV_ADMIN_TOKEN } from '../config'
import type { AdminLotInputV11, AdminLotV11 } from '../types'
import { ID_PATTERN } from '../validate'
import { createMockDb, mergeTags, type MockDb } from './fixtures'

export interface MockFetchOptions {
  token?: string
  latencyMs?: number
  /** 대시보드 6개월 추이의 기준 시각 (테스트용). 기본 Date.now() */
  now?: () => number
}

const REASON_TAGS: ReadonlySet<string> = new Set([
  'SPIRAL_RAMP', 'NARROW_AISLE', 'MANY_PILLARS', 'MECHANICAL', 'STEEP_SLOPE',
  'FREQUENT_REVERSE', 'SPACIOUS', 'FLAT', 'MANY_FLOORS',
])
const LOT_CATEGORIES: ReadonlySet<string> = new Set(['DEPARTMENT', 'MALL', 'OFFICE', 'PUBLIC', 'APARTMENT', 'OTHER'])
const REGION_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
}
const err = (status: number, code: string, message: string) => json(status, { error: { code, message } })

/** AdminLot → 공개 목록용 ParkingLot (관리 필드·통계 뺌) */
export function toPublicLot(l: AdminLot): ParkingLot {
  return {
    id: l.id, name: l.name, location: l.location, address: l.address, difficulty: l.difficulty, tags: l.tags,
    statChips: l.statChips, sampleCount: l.sampleCount, ratingCount: l.ratingCount, floors: l.floors,
    zoneScheme: l.zoneScheme, publicInfo: l.publicInfo, feeText: l.feeText, updatedAt: l.updatedAt,
    category: l.category, region: l.region,
  }
}

export function buildOverview(db: MockDb): AdminOverviewResponse {
  const since30 = db.now - 30 * 86_400_000
  const byHour = new Array<number>(24).fill(0)
  const byWeekday = new Array<number>(7).fill(0)
  let records30d = 0
  for (const r of db.records) {
    byHour[r.parkedHour] += 1
    byWeekday[r.parkedWeekday - 1] += 1
    if (Date.parse(r.receivedAt) >= since30) records30d += 1
  }
  const rated = db.lots.filter((l) => l.difficulty != null)
  const hardest = [...rated].sort((a, b) => (b.difficulty as number) - (a.difficulty as number) || b.sampleCount - a.sampleCount)
  const easiest = [...rated].sort((a, b) => (a.difficulty as number) - (b.difficulty as number) || b.sampleCount - a.sampleCount)
  return {
    totals: {
      lots: db.lots.length,
      records: db.records.length,
      records30d,
      ratings: db.lots.reduce((a, l) => a + l.ratingCount, 0),
      shares: db.shares,
      avgDifficulty: rated.length ? Math.round((rated.reduce((a, l) => a + (l.difficulty as number), 0) / rated.length) * 10) / 10 : null,
    },
    hardest: hardest.slice(0, 5).map(toPublicLot),
    easiest: easiest.slice(0, 5).map(toPublicLot),
    byHour,
    byWeekday,
    recentRecords: db.records.slice(-20).reverse(),
  }
}

function validateInput(body: unknown, partial: boolean): string | null {
  if (!body || typeof body !== 'object') return '본문이 JSON 객체가 아니에요'
  const b = body as Partial<AdminLotInput>
  if (!partial || b.id !== undefined) {
    if (!partial && (typeof b.id !== 'string' || !ID_PATTERN.test(b.id))) return 'id는 영문 소문자·숫자·하이픈이에요'
  }
  if (!partial || b.name !== undefined) {
    if (typeof b.name !== 'string' || !b.name.trim()) return 'name이 비었어요'
  }
  if (!partial || b.location !== undefined) {
    const loc = b.location
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng) || Math.abs(loc.lat) > 90 || Math.abs(loc.lng) > 180) {
      return 'location.lat / location.lng 가 올바르지 않아요'
    }
  }
  if (!partial || b.floors !== undefined) {
    if (!Array.isArray(b.floors) || b.floors.length === 0 || b.floors.some((f) => typeof f !== 'string' || !f.trim())) {
      return 'floors는 빈 칸 없는 문자열 배열이에요'
    }
  }
  if (b.manualTags !== undefined && (!Array.isArray(b.manualTags) || b.manualTags.some((t) => !REASON_TAGS.has(t)))) {
    return 'manualTags에 모르는 태그가 있어요'
  }
  const v11 = body as Partial<AdminLotInputV11>
  if (v11.category !== undefined && (typeof v11.category !== 'string' || !LOT_CATEGORIES.has(v11.category))) {
    return 'category는 DEPARTMENT · MALL · OFFICE · PUBLIC · APARTMENT · OTHER 중 하나예요'
  }
  if (v11.region !== undefined && (typeof v11.region !== 'string' || !REGION_PATTERN.test(v11.region))) {
    return 'region은 영문 소문자·숫자·하이픈이에요 (예: pangyo)'
  }
  return null
}

function applyInput(lot: AdminLot, b: Partial<AdminLotInputV11>, now: number): AdminLot {
  const next: AdminLotV11 = { ...lot }
  if (b.category !== undefined) next.category = b.category as LotCategory
  if (b.region !== undefined) next.region = b.region
  if (b.name !== undefined) next.name = b.name.trim()
  if (b.location !== undefined) next.location = { lat: b.location.lat, lng: b.location.lng }
  if (b.address !== undefined) next.address = b.address
  if (b.floors !== undefined) next.floors = [...b.floors]
  if (b.zoneScheme !== undefined) next.zoneScheme = { ...b.zoneScheme }
  if (b.manualTags !== undefined) next.manualTags = [...b.manualTags] as ReasonTag[]
  if (b.publicInfo !== undefined) next.publicInfo = [...b.publicInfo]
  if (b.feeText !== undefined) next.feeText = b.feeText
  // 자동 태그는 기존 tags 중 운영자 태그가 아니었던 것으로 둔다 (실제 서버는 기록으로 다시 계산)
  const prevAuto = lot.tags.filter((t) => !lot.manualTags.includes(t))
  next.tags = mergeTags(next, prevAuto)
  next.updatedAt = new Date(now).toISOString()
  return next
}

/** 겹친 동선은 크니까 (주차장 · 기간 · 달)마다 한 번만 만든다 */
const lotInsightsCache = new Map<string, string>()

/** GET /v1/insights/* (공개, 인증 없음) — packages/insights-demo 로 만든 시안 수치 */
export function insights(url: URL, path: string, now: number): Response {
  const q = url.searchParams
  const days = q.get('days') == null ? 30 : Number(q.get('days'))
  if (!Number.isInteger(days) || days < 1 || days > 365) return err(400, 'bad_request', 'days는 1~365 사이 정수예요')
  const region = q.get('region')
  if (path === '/v1/insights/overview') {
    const o = demoOverview({ days, region, now })
    return o ? json(200, o) : err(404, 'not_found', `지역 "${region}" 의 통계가 없어요`)
  }
  if (path === '/v1/insights/compare') {
    const category = q.get('category')
    if (category && category.split(',').some((c) => !LOT_CATEGORIES.has(c.trim()))) return err(400, 'bad_request', '모르는 category 예요')
    const c = demoCompare({ days, region, category, now })
    return c ? json(200, c) : err(404, 'not_found', `지역 "${region}" 의 통계가 없어요`)
  }
  const m = /^\/v1\/insights\/lots\/([^/]+)$/.exec(path)
  if (m) {
    const id = decodeURIComponent(m[1])
    // 서버와 같게: floor 나 maxPaths 를 주면 동선은 한 층만 (floor 없으면 기록이 가장 많은 층), maxPaths 1~2000
    const floor = q.get('floor')
    const maxPathsRaw = q.get('maxPaths')
    const maxPaths = maxPathsRaw == null ? undefined : Number(maxPathsRaw)
    if (maxPaths !== undefined && (!Number.isInteger(maxPaths) || maxPaths < 1 || maxPaths > 2000)) {
      return err(400, 'bad_request', 'maxPaths는 1~2000 사이 정수예요')
    }
    const single = floor != null || maxPaths !== undefined
    const key = `${id}:${days}:${new Date(now).toISOString().slice(0, 7)}:${single ? `${floor ?? 'auto'}:${maxPaths ?? ''}` : 'all'}`
    let body = lotInsightsCache.get(key)
    if (body === undefined) {
      const r = demoLotInsights(id, single ? { days, now, floor: floor ?? 'auto', maxPaths } : { days, now })
      if (!r) return err(404, 'not_found', `주차장 "${id}" 의 통계가 없어요`)
      body = JSON.stringify(r)
      lotInsightsCache.set(key, body)
    }
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
  }
  return err(404, 'not_found', `GET ${path} 없음`)
}

export function createMockFetch(getDb: () => MockDb, opts: MockFetchOptions = {}) {
  const token = opts.token ?? DEV_ADMIN_TOKEN
  const latency = opts.latencyMs ?? 0

  async function handle(url: URL, method: string, headers: Headers, bodyText: string | null): Promise<Response> {
    const path = url.pathname.replace(/\/+$/, '') || '/'
    if (path === '/health' && method === 'GET') return json(200, { ok: true, version: 'mock' })
    if (path.startsWith('/v1/insights/')) return method === 'GET' ? insights(url, path, opts.now?.() ?? Date.now()) : err(400, 'bad_request', `${method} 은 지원하지 않아요`)

    if (!path.startsWith('/v1/admin')) return err(404, 'not_found', `${method} ${path} 없음 (시연 모드는 어드민 API만)`)
    if (headers.get('Authorization') !== `Bearer ${token}`) return err(401, 'unauthorized', '관리자 토큰이 맞지 않아요')

    const db = getDb()
    db.now = Math.max(db.now, Date.now())
    let body: unknown = undefined
    if (bodyText) {
      try {
        body = JSON.parse(bodyText)
      } catch {
        return err(400, 'bad_request', '본문이 JSON이 아니에요')
      }
    }

    if (path === '/v1/admin/overview' && method === 'GET') return json(200, buildOverview(db))

    if (path === '/v1/admin/recompute' && method === 'POST') {
      db.lots = db.lots.map((l) => {
        const prevAuto = l.tags.filter((t) => !l.manualTags.includes(t))
        return { ...l, tags: mergeTags(l, prevAuto), updatedAt: new Date(db.now).toISOString() }
      })
      return json(200, { lots: db.lots.length })
    }

    if (path === '/v1/admin/lots') {
      if (method === 'GET') {
        const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
        const lots = [...db.lots]
          .filter((l) => !q || l.name.toLowerCase().includes(q) || l.id.includes(q) || (l.address ?? '').toLowerCase().includes(q))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        return json(200, { lots })
      }
      if (method === 'POST') {
        const problem = validateInput(body, false)
        if (problem) return err(400, 'bad_request', problem)
        const input = body as AdminLotInputV11
        if (db.lots.some((l) => l.id === input.id)) return err(409, 'conflict', `id "${input.id}" 가 이미 있어요`)
        const nowIso = new Date(db.now).toISOString()
        const blank: AdminLot = {
          id: input.id, name: input.name.trim(), location: input.location, address: null, difficulty: null, tags: [],
          statChips: [], sampleCount: 0, ratingCount: 0, floors: input.floors,
          zoneScheme: { zones: [], numbers: [], description: null }, publicInfo: [], feeText: null,
          updatedAt: nowIso, stats: null, manualTags: [], scoreSampleCount: 0, demo: false, createdAt: nowIso,
          aliases: [], pitch: null, suggestible: true,
          shortName: input.name.trim().replace(/\s*주차장$/, ''), rampKind: 'NONE', category: 'OTHER', region: 'other',
        }
        const lot = applyInput(blank, input, db.now)
        db.lots.push(lot)
        return json(201, { lot })
      }
      return err(400, 'bad_request', `${method} 은 지원하지 않아요`)
    }

    const m = /^\/v1\/admin\/lots\/([^/]+)(\/records)?$/.exec(path)
    if (m) {
      const id = decodeURIComponent(m[1])
      const idx = db.lots.findIndex((l) => l.id === id)
      if (idx < 0) return err(404, 'not_found', `주차장 "${id}" 가 없어요`)
      if (m[2]) {
        if (method !== 'GET') return err(400, 'bad_request', `${method} 은 지원하지 않아요`)
        const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100))
        const records = db.records.filter((r) => r.lotId === id).slice(-limit).reverse()
        return json(200, { records })
      }
      if (method === 'PUT') {
        const problem = validateInput(body, true)
        if (problem) return err(400, 'bad_request', problem)
        const lot = applyInput(db.lots[idx], body as Partial<AdminLotInput>, db.now)
        db.lots[idx] = lot
        for (const r of db.records) if (r.lotId === id) r.lotName = lot.name
        return json(200, { lot })
      }
      if (method === 'DELETE') {
        db.lots.splice(idx, 1)
        db.records = db.records.filter((r) => r.lotId !== id)
        return new Response(null, { status: 204 })
      }
      return err(400, 'bad_request', `${method} 은 지원하지 않아요`)
    }
    return err(404, 'not_found', `${method} ${path} 없음`)
  }

  return async function mockFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(input, 'http://mock.local')
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = new Headers(init.headers)
    const bodyText = typeof init.body === 'string' ? init.body : null
    if (latency > 0) await new Promise((r) => setTimeout(r, latency))
    return handle(url, method, headers, bodyText)
  }
}

let shared: MockDb | null = null
/** 앱 전체가 쓰는 시연 데이터 (처음 부를 때 '지금' 기준으로 만든다) */
export function sharedMockDb(): MockDb {
  if (!shared) shared = createMockDb()
  return shared
}

export const appMockFetch = createMockFetch(sharedMockDb, { latencyMs: 120 })
