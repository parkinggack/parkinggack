/** 어드민 (Authorization: Bearer <ADMIN_TOKEN>) */
import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import type { AdminLotResponse, AdminLotsResponse, AdminOverviewResponse, AdminRecordsResponse, KingBoardResponse, KingMeResponse, KingResultResponse } from '@parkinggack/api-types'
import { ApiHttpError, badRequest, lotNotFound, notFound } from './errors.js'
import { bodyMax, parse, readJson, type App, type AppEnv, type Ctx } from './http.js'
import { normalizeName } from './match.js'
import { adminLotInputSchema, adminLotPatchSchema, adminLotRecordsQuery, adminLotsQuery, adminRecordsQuery, kingDemoCarSchema } from './schemas.js'
import { toAdminLot, toParkingLot } from './views.js'

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'ko')

/** 상수 시간 비교 (길이도 숨김) */
export function bearerMatches(header: string | undefined, secret: string): boolean {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '')
  if (!m) return false
  return timingSafeEqual(createHash('sha256').update(m[1]).digest(), createHash('sha256').update(secret).digest())
}

export function adminRoutes(app: App, ctx: Ctx) {
  const { store, config } = ctx
  const admin = new Hono<AppEnv>()
  const body = bodyMax(64 * 1024)

  admin.use('*', async (c, next) => {
    if (!bearerMatches(c.req.header('authorization'), config.adminToken)) {
      throw new ApiHttpError(401, 'unauthorized', '어드민 토큰이 없거나 맞지 않아요', { 'WWW-Authenticate': 'Bearer' })
    }
    c.header('Cache-Control', 'no-store')
    await next()
  })

  admin.get('/overview', async (c) => {
    const p = await store.overviewParts()
    const scored = p.lots.filter((l) => l.difficulty != null)
    const order = (dir: 1 | -1) => (a: (typeof scored)[number], b: (typeof scored)[number]) =>
      dir * (a.difficulty! - b.difficulty!) || b.sampleCount - a.sampleCount || byName(a, b)
    const res: AdminOverviewResponse = {
      totals: p.totals,
      hardest: [...scored].sort(order(-1)).slice(0, 5).map(toParkingLot),
      easiest: [...scored].sort(order(1)).slice(0, 5).map(toParkingLot),
      byHour: p.byHour,
      byWeekday: p.byWeekday,
      recentRecords: p.recentRecords,
    }
    return c.json(res)
  })

  admin.get('/lots', async (c) => {
    const { q } = parse(adminLotsQuery, c.req.query())
    const needle = q ? normalizeName(q) : ''
    const [lots, overall] = await Promise.all([store.allLots(), store.overall()])
    const res: AdminLotsResponse = {
      lots: lots
        .filter((l) => !needle || [l.id, l.name, l.address ?? '', l.region, ...l.aliases].some((s) => normalizeName(s).includes(needle)))
        .sort(byName)
        .map((l) => toAdminLot(l, overall)),
    }
    return c.json(res)
  })

  admin.get('/lots/:id', async (c) => {
    const lot = await store.getLot(c.req.param('id'))
    if (!lot) throw lotNotFound(c.req.param('id'))
    const res: AdminLotResponse = { lot: toAdminLot(lot, await store.overall()) }
    return c.json(res)
  })

  admin.post('/lots', body, async (c) => {
    const input = parse(adminLotInputSchema, await readJson(c))
    const lot = await store.insertLot(input)
    if (!lot) throw new ApiHttpError(409, 'conflict', `이미 있는 주차장 id예요: ${input.id}`)
    const res: AdminLotResponse = { lot: toAdminLot(lot, await store.overall()) }
    return c.json(res, 201)
  })

  admin.put('/lots/:id', body, async (c) => {
    const id = c.req.param('id')
    const patch = parse(adminLotPatchSchema, await readJson(c))
    if (patch.id !== undefined && patch.id !== id) throw badRequest('id는 바꿀 수 없어요 (새로 추가한 뒤 지워 주세요)')
    const { id: _ignored, ...rest } = patch
    const lot = await store.updateLot(id, rest)
    if (!lot) throw lotNotFound(id)
    const res: AdminLotResponse = { lot: toAdminLot(lot, await store.overall()) }
    return c.json(res)
  })

  admin.delete('/lots/:id', async (c) => {
    const id = c.req.param('id')
    if (!(await store.deleteLot(id))) throw lotNotFound(id)
    return c.body(null, 204)
  })

  admin.get('/lots/:id/records', async (c) => {
    const id = c.req.param('id')
    const { limit, before } = parse(adminLotRecordsQuery, c.req.query())
    if (!(await store.hasLot(id))) throw lotNotFound(id)
    const res: AdminRecordsResponse = await store.listRecords({ lotId: id, limit, before })
    return c.json(res)
  })

  admin.get('/records', async (c) => {
    const f = parse(adminRecordsQuery, c.req.query())
    if (f.lotId !== undefined && !(await store.hasLot(f.lotId))) throw lotNotFound(f.lotId)
    const res: AdminRecordsResponse = await store.listRecords(f)
    return c.json(res)
  })

  admin.post('/recompute', async (c) => c.json({ lots: await store.recomputeAll() }))

  /**
   * v1.2 촬영용: 이 차를 판교 초보 "판교 느긋한 수달"(82점 12등 / 148명)로 — 이 차의 최근 30일+이번 주 주차를 시연 주차로 바꾼다.
   * scenario board(기본): 지난주 17등 · results: 지난주 9등, 지지난주 12등 (M-53). 자세한 것은 docs/api.md v1.2
   */
  admin.post('/king/demo-car', body, async (c) => {
    const { deviceId, scenario } = parse(kingDemoCarSchema, await readJson(c))
    const car = await ctx.me.device(deviceId)
    if (!car || car.kind !== 'car') throw notFound(`차 기기를 찾을 수 없어요: ${deviceId}`)
    const { replacedParkings } = await ctx.king.demoCar(car.id, scenario)
    const lastWeek = await ctx.king.lastResult(car.id).catch(() => null)
    const res: { scenario: typeof scenario; replacedParkings: number; me: KingMeResponse; board: KingBoardResponse; lastWeek: KingResultResponse | null } = {
      scenario,
      replacedParkings,
      me: await ctx.king.meResponse(car.id),
      board: await ctx.king.boardResponse(car.id),
      lastWeek,
    }
    return c.json(res)
  })

  app.route('/v1/admin', admin)
}
