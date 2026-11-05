/** 라우트 공통: 검증·본문 읽기·IP·레이트 리밋·앱 타입 */
import { getConnInfo } from '@hono/node-server/conninfo'
import type { DeviceKind } from '@parkinggack/api-types'
import type { Context, Hono, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { z } from 'zod'
import type { Config } from './config.js'
import { ApiHttpError, badRequest } from './errors.js'
import type { Insights } from './insights.js'
import type { KingStore } from './king-store.js'
import type { Device, MeStore } from './me-store.js'
import type { PushSender } from './push.js'
import type { TokenBucketLimiter } from './ratelimit.js'
import type { Store } from './store.js'

export type AppEnv = { Variables: { device: Device } }
export type App = Hono<AppEnv>

/** 라우트 모듈이 쓰는 것들 */
export interface Ctx {
  store: Store
  me: MeStore
  /** v1.2 주차왕 */
  king: KingStore
  insights: Insights
  config: Config
  push: PushSender
  /** 공개 POST (IP당 분당) */
  limiter: TokenBucketLimiter
  /** 페어링 코드 틀린 시도 (IP당 분당) */
  claimLimiter: TokenBucketLimiter
}

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data)
  if (r.success) return r.data
  const msg = r.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.length ? i.path.join('.') : '(본문)'}: ${i.message}`)
    .join('; ')
  throw badRequest(`입력값이 올바르지 않아요 — ${msg}`)
}

export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    throw badRequest('본문이 올바른 JSON이 아니에요')
  }
}

/** 본문이 비어 있어도 되는 요청 (POST /v1/pairings 등) */
export async function readJsonOptional(c: Context): Promise<unknown> {
  const text = await c.req.text()
  if (!text.trim()) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw badRequest('본문이 올바른 JSON이 아니에요')
  }
}

/** 클라이언트 IP — 프록시 뒤면 X-Forwarded-For 의 마지막(프록시가 본) 주소 */
export function clientIp(c: Context, trustProxy: boolean, ipHeader: string | null = null): string {
  if (trustProxy) {
    const own = ipHeader ? c.req.header(ipHeader)?.trim() : undefined
    if (own) return own
    const xff = c.req.header('x-forwarded-for')
    if (xff) {
      const last = xff.split(',').map((s) => s.trim()).filter(Boolean).pop()
      if (last) return last
    }
    const real = c.req.header('x-real-ip')
    if (real) return real.trim()
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown' // 테스트(app.request)·서버리스처럼 소켓이 없을 때
  }
}

export function rateLimit(ctx: Ctx): MiddlewareHandler {
  return async (c, next) => {
    const r = ctx.limiter.take(clientIp(c, ctx.config.trustProxy, ctx.config.clientIpHeader))
    if (!r.ok) {
      throw new ApiHttpError(429, 'rate_limited', '요청이 너무 많아요. 잠시 후 다시 시도해 주세요', { 'Retry-After': String(r.retryAfterSec) })
    }
    await next()
  }
}

const tooLarge = () => {
  throw new ApiHttpError(413, 'bad_request', '본문이 너무 커요')
}
export const bodyMax = (bytes: number) => bodyLimit({ maxSize: bytes, onError: tooLarge })

export const iso = (ms: number) => new Date(ms).toISOString()

/** Device 토큰 → c.get('device'). 모르는 토큰이면 401 (차는 401 이면 기기를 새로 등록한다) */
export function deviceAuth(me: MeStore) {
  return (...kinds: DeviceKind[]): MiddlewareHandler<AppEnv> =>
    async (c, next) => {
      const m = /^Device\s+(\S+)\s*$/i.exec(c.req.header('authorization') ?? '')
      const d = m ? await me.deviceByToken(m[1]) : null
      if (!d) throw new ApiHttpError(401, 'unauthorized', '기기 토큰이 없거나 맞지 않아요 (POST /v1/devices 로 새로 받아 주세요)', { 'WWW-Authenticate': 'Device' })
      if (!kinds.includes(d.kind)) throw new ApiHttpError(401, 'unauthorized', `${kinds.includes('car') ? '차' : '폰'} 기기 토큰이 필요해요`)
      c.set('device', d)
      c.header('Cache-Control', 'no-store')
      await next()
    }
}

/** 이 기기가 볼 수 있는 차 (차 = 자기, 폰 = 연결된 차, 연결 안 된 폰 = 없음) */
export const carOf = (d: Device) => (d.kind === 'car' ? d.id : d.carId)

/** 차 단위 기능(설정·주차왕): 연결 전 폰이면 409 */
export function requireCar(d: Device): string {
  const carId = carOf(d)
  if (!carId) throw new ApiHttpError(409, 'conflict', '아직 차와 연결되지 않았어요. 차 화면의 코드로 먼저 연결해 주세요')
  return carId
}
