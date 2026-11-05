/**
 * HTTP 앱 (Hono). 네트워크 없이 테스트할 수 있게 앱만 만든다 — Node 서버는 server.ts, Vercel 은 api/index.ts.
 * 계약: packages/api-types/index.ts · 설명: docs/api.md
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import type { Config } from './config.js'
import { ApiHttpError, errorBody } from './errors.js'
import type { AppEnv, Ctx } from './http.js'
import { Insights } from './insights.js'
import { KingStore } from './king-store.js'
import { Maintenance } from './maintenance.js'
import { MeStore } from './me-store.js'
import { noPush, type PushSender } from './push.js'
import { TokenBucketLimiter } from './ratelimit.js'
import { adminRoutes, bearerMatches } from './routes-admin.js'
import { insightsRoutes } from './routes-insights.js'
import { kingRoutes } from './routes-king.js'
import { meRoutes } from './routes-me.js'
import { publicRoutes } from './routes-public.js'
import type { Store } from './store.js'

export interface AppOptions {
  store: Store
  config: Config
  /** 공개 POST 레이트 리밋 (없으면 config.rateLimitPerMin 으로 만듦) */
  limiter?: TokenBucketLimiter
  claimLimiter?: TokenBucketLimiter
  push?: PushSender
  /** 첫 요청 전에 한 번 (서버리스: 마이그레이션 확인) */
  init?: () => Promise<void>
}

export function createApp(opts: AppOptions) {
  const { store, config } = opts
  const me = new MeStore(store)
  const king = new KingStore(store, me)
  const ctx: Ctx = {
    store,
    me,
    king,
    insights: new Insights(store),
    config,
    push: opts.push ?? noPush,
    limiter: opts.limiter ?? new TokenBucketLimiter(config.rateLimitPerMin, store.now),
    claimLimiter: opts.claimLimiter ?? new TokenBucketLimiter(config.claimFailuresPerMin, store.now),
  }
  const maintenance = new Maintenance(store, me, config, king)
  const app = new Hono<AppEnv>()

  // ───── 공통 ─────
  const publicCors = cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // 폰 앱은 다른 출처에서 Authorization: Device <token> 으로 부른다 (쿠키 없음 → * 로 충분)
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Retry-After'],
    maxAge: 86_400,
  })
  const adminCors = cors({
    origin: (origin) => (config.adminOrigins.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  })
  const isAdminPath = (p: string) => p === '/v1/admin' || p.startsWith('/v1/admin/')
  app.use('*', (c, next) => (isAdminPath(c.req.path) ? adminCors(c, next) : publicCors(c, next)))
  if (config.log) app.use('*', logger())

  // 서버리스: 첫 요청(또는 예약 함수)에서 한 번 — 마이그레이션 확인
  let readyP: Promise<void> | null = null
  const ready = (): Promise<void> =>
    opts.init
      ? (readyP ??= opts.init().catch((e) => {
          readyP = null // 다음 요청에서 다시
          throw e
        }))
      : Promise.resolve()
  if (opts.init) {
    app.use('*', async (_c, next) => {
      await ready()
      await next()
    })
  }
  app.use('*', async (c, next) => {
    if (c.req.method !== 'OPTIONS' && c.req.path !== '/health') await maintenance.light()
    await next()
  })

  app.onError((err, c) => {
    if (err instanceof ApiHttpError) return c.json(errorBody(err.code, err.message), err.status, err.headers)
    if (err instanceof HTTPException && err.status === 413) return c.json(errorBody('bad_request', '본문이 너무 커요'), 413)
    if (err instanceof HTTPException && err.status < 500) return c.json(errorBody('bad_request', err.message || '요청을 처리할 수 없어요'), err.status)
    console.error('[parkinggack] 처리 중 오류', err)
    return c.json(errorBody('internal', '서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요'), 500)
  })
  app.notFound((c) => c.json(errorBody('not_found', `없는 주소예요: ${c.req.method} ${c.req.path}`), 404))

  publicRoutes(app, ctx)
  meRoutes(app, ctx)
  kingRoutes(app, ctx)
  insightsRoutes(app, ctx)
  adminRoutes(app, ctx)

  /** Vercel Cron (하루 한 번, Authorization: Bearer $CRON_SECRET) 또는 어드민 토큰. Netlify 는 예약 함수(netlify/functions/maintain.mts)가 직접 부른다 */
  app.get('/v1/cron/maintain', async (c) => {
    const auth = c.req.header('authorization')
    if (!(config.cronSecret && bearerMatches(auth, config.cronSecret)) && !bearerMatches(auth, config.adminToken)) {
      throw new ApiHttpError(401, 'unauthorized', 'CRON_SECRET 이나 어드민 토큰이 필요해요', { 'WWW-Authenticate': 'Bearer' })
    }
    c.header('Cache-Control', 'no-store')
    return c.json(await maintenance.full())
  })

  return Object.assign(app, { maintenance, ready })
}

export type ParkingApp = ReturnType<typeof createApp>
