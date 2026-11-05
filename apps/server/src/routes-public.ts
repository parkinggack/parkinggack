/** v1 공개: 주차장·기록·별점·짧은 링크 */
import type {
  CreateShareResponse,
  EasierLotsResponse,
  GetShareResponse,
  ListLotsResponse,
  LotDetailResponse,
  MatchLotResponse,
  RatingResponse,
  RecordAcceptedResponse,
  SharePayload,
} from '@parkinggack/api-types'
import { ApiHttpError, lotNotFound, notFound } from './errors.js'
import { distanceMeters } from './geo.js'
import { bodyMax, parse, rateLimit, readJson, type App, type Ctx } from './http.js'
import { easierLots, matchLot } from './match.js'
import { anonymousRecordSchema, createShareSchema, easierQuery, listLotsQuery, matchQuery, ratingSchema } from './schemas.js'
import { SHARE_CODE_RE } from './store.js'
import { VERSION } from './version.js'
import { toDetail, toParkingLot } from './views.js'

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'ko')

/** 차량 앱 ShareLink 와 같은 키 순서로 저장 (모르는 키는 버림) */
function canonicalPayload(p: SharePayload): SharePayload {
  const o: SharePayload = { v: p.v, lot: p.lot, f: p.f, z: p.z, n: p.n, t: p.t }
  if (p.m !== undefined) o.m = p.m
  if (p.h !== undefined) o.h = p.h
  if (p.r !== undefined) o.r = p.r
  return o
}

export function publicRoutes(app: App, ctx: Ctx) {
  const { store, config } = ctx
  const limited = rateLimit(ctx)
  const body = bodyMax(16 * 1024)

  app.get('/health', (c) => c.json({ ok: true as const, version: VERSION }))

  app.get('/v1/lots', async (c) => {
    const qy = parse(listLotsQuery, c.req.query())
    const lots = await store.allLots()
    let res: ListLotsResponse
    if (qy.lat != null && qy.lng != null) {
      const at = { lat: qy.lat, lng: qy.lng }
      res = {
        lots: lots
          .map((l) => ({ l, m: distanceMeters(at, l.location) }))
          .filter((x) => x.m <= qy.radius)
          .sort((a, b) => a.m - b.m)
          .slice(0, qy.limit)
          .map(({ l, m }) => ({ ...toParkingLot(l), distanceM: Math.round(m) })),
      }
    } else {
      res = { lots: lots.sort(byName).slice(0, qy.limit).map(toParkingLot) }
    }
    return c.json(res)
  })

  // /v1/lots/:id 보다 먼저
  app.get('/v1/lots/match', async (c) => {
    const qy = parse(matchQuery, c.req.query())
    const at = qy.lat != null && qy.lng != null ? { lat: qy.lat, lng: qy.lng } : undefined
    const hit = matchLot(await store.allLots(), qy.name, at)
    const res: MatchLotResponse = hit ? { lot: toParkingLot(hit.lot), matchedBy: hit.matchedBy } : { lot: null, matchedBy: null }
    return c.json(res)
  })

  app.get('/v1/lots/:id', async (c) => {
    const lot = await store.getLot(c.req.param('id'))
    if (!lot) throw lotNotFound(c.req.param('id'))
    const res: LotDetailResponse = { lot: toDetail(lot, await store.overall()) }
    return c.json(res)
  })

  app.get('/v1/lots/:id/easier', async (c) => {
    const qy = parse(easierQuery, c.req.query())
    const base = await store.getLot(c.req.param('id'))
    if (!base) throw lotNotFound(c.req.param('id'))
    const res: EasierLotsResponse = { suggestions: easierLots(base, await store.allLots(), qy) }
    return c.json(res)
  })

  app.post('/v1/records', limited, body, async (c) => {
    const rec = parse(anonymousRecordSchema, await readJson(c))
    if (!(await store.hasLot(rec.lotId))) throw lotNotFound(rec.lotId)
    const { duplicate } = await store.insertRecord(rec)
    const lot = duplicate ? (await store.getLot(rec.lotId))! : (await store.recomputeLot(rec.lotId))!
    const res: RecordAcceptedResponse = { accepted: true, duplicate, lot: { id: lot.id, difficulty: lot.difficulty, sampleCount: lot.sampleCount } }
    return c.json(res, 202)
  })

  app.post('/v1/lots/:id/ratings', limited, body, async (c) => {
    const id = c.req.param('id')
    const req = parse(ratingSchema, await readJson(c))
    if (!(await store.hasLot(id))) throw lotNotFound(id)
    const { duplicate } = await store.insertRating(id, req.clientRatingId, req.stars)
    const lot = duplicate ? (await store.getLot(id))! : (await store.recomputeLot(id))!
    const res: RatingResponse = { lot: { id: lot.id, difficulty: lot.difficulty, ratingCount: lot.ratingCount } }
    return c.json(res)
  })

  app.post('/v1/shares', limited, body, async (c) => {
    const req = parse(createShareSchema, await readJson(c))
    const { code, expiresMs } = await store.createShare(canonicalPayload(req.payload), config.shareTtlMs)
    const res: CreateShareResponse = { code, url: `${config.publicWebBase}/s/${code}`, expiresAt: new Date(expiresMs).toISOString() }
    return c.json(res, 201, { Location: `/v1/shares/${code}` })
  })

  app.get('/v1/shares/:code', async (c) => {
    c.header('Cache-Control', 'no-store')
    const code = c.req.param('code').toLowerCase()
    if (!SHARE_CODE_RE.test(code)) throw notFound('링크를 찾을 수 없어요')
    const s = await store.getShare(code)
    if (s.status === 'missing') throw notFound('링크를 찾을 수 없어요')
    if (s.status === 'gone') throw new ApiHttpError(410, 'gone', '링크가 만료됐어요 (48시간)')
    const res: GetShareResponse = { payload: s.payload, expiresAt: new Date(s.expiresMs).toISOString() }
    return c.json(res)
  })
}
