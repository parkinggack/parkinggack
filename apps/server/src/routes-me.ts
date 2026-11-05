/**
 * v1.1 기기 · 페어링 · 내 주차 · 푸시 (Authorization: Device <token>).
 * 폰 토큰은 연결된 차 한 대의 주차만 본다. 차 토큰은 자기 주차만.
 */
import type {
  ClaimPairingResponse,
  CreatePairingResponse,
  CurrentParkingResponse,
  MeResponse,
  MyParkingPutResponseV12,
  MyParkingResponse,
  MyParkingsResponse,
  MyStatsResponse,
  PairingStatusResponse,
  PushMessage,
  RegisterDeviceResponse,
  SharedSettingsResponse,
} from '@parkinggack/api-types'
import { ApiHttpError, badRequest, notFound } from './errors.js'
import { bodyMax, carOf, clientIp, deviceAuth, iso, parse, rateLimit, readJson, readJsonOptional, requireCar, type App, type Ctx } from './http.js'
import { DEFAULT_SETTINGS, PAIRING_CODE_RE, spotText } from './me-store.js'
import {
  MY_PARKING_ID_RE,
  claimPairingSchema,
  myParkingInputSchema,
  myParkingsQuery,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  registerDeviceSchema,
  sharedSettingsPatchSchema,
} from './schemas.js'

const PUSH_TIMEOUT_MS = 5000

export function meRoutes(app: App, ctx: Ctx) {
  const { me, config, push } = ctx
  const limited = rateLimit(ctx)
  const small = bodyMax(16 * 1024)
  /** 동선 300점이 들어가므로 넉넉히 */
  const parkingBody = bodyMax(128 * 1024)

  const device = deviceAuth(me)
  const car = device('car')
  const phone = device('phone')
  const either = device('car', 'phone')

  // ───── 기기 ─────
  app.post('/v1/devices', limited, small, async (c) => {
    const req = parse(registerDeviceSchema, await readJson(c))
    const { device: d, token } = await me.registerDevice(req.kind, req.name ?? null)
    const res: RegisterDeviceResponse = { deviceId: d.id, token }
    return c.json(res, 201)
  })

  // ───── 페어링 ─────
  app.post('/v1/pairings', limited, small, car, async (c) => {
    await readJsonOptional(c) // 본문은 {} 또는 없음
    const { code, expiresMs } = await me.createPairing(c.get('device').id, config.pairingTtlMs)
    const res: CreatePairingResponse = { code, url: `${config.publicWebBase}/pair/${code}`, expiresAt: iso(expiresMs) }
    return c.json(res, 201)
  })

  app.get('/v1/pairings/:code', car, async (c) => {
    const code = c.req.param('code')
    const st = PAIRING_CODE_RE.test(code) ? await me.pairingStatus(c.get('device').id, code) : null
    if (!st) throw notFound('페어링 코드를 찾을 수 없어요')
    const res: PairingStatusResponse = st
    return c.json(res)
  })

  /** 인증 없음 — 6자리 숫자라서 IP당 틀린 시도를 분당 CLAIM_FAILURES_PER_MIN 번으로 막는다 */
  app.post('/v1/pairings/:code/claim', limited, small, async (c) => {
    const ip = clientIp(c, config.trustProxy, config.clientIpHeader)
    const gate = ctx.claimLimiter.peek(ip)
    if (!gate.ok) throw new ApiHttpError(429, 'rate_limited', '코드를 너무 많이 틀렸어요. 잠시 후 다시 해 주세요', { 'Retry-After': String(gate.retryAfterSec) })
    const req = parse(claimPairingSchema, (await readJsonOptional(c)) ?? {})
    const code = c.req.param('code')
    const r = PAIRING_CODE_RE.test(code) ? await me.claim(code, req.phoneName ?? null) : ({ ok: false, reason: 'not_found' } as const)
    if (!r.ok) {
      ctx.claimLimiter.take(ip)
      if (r.reason === 'not_found') throw notFound('코드를 찾을 수 없어요. 차 화면의 숫자를 다시 확인해 주세요')
      throw new ApiHttpError(410, 'gone', r.reason === 'used' ? '이미 연결에 쓴 코드예요. 차 화면에서 새 코드를 받아 주세요' : '코드가 만료됐어요 (10분). 차 화면에서 새 코드를 받아 주세요')
    }
    const res: ClaimPairingResponse = { token: r.token, car: r.car }
    return c.json(res)
  })

  // ───── 나 ─────
  app.get('/v1/me', either, async (c) => {
    const d = c.get('device')
    let res: MeResponse
    if (d.kind === 'car') {
      res = { kind: 'car', car: null, phones: (await me.phonesOf(d.id)).length, settings: await me.settings(d.id) }
    } else {
      const carDev = d.carId ? await me.device(d.carId) : null
      res = {
        kind: 'phone',
        car: carDev ? me.pairedCar(carDev, d) : null,
        phones: carDev ? (await me.phonesOf(carDev.id)).length : 0,
        settings: carDev ? await me.settings(carDev.id) : { ...DEFAULT_SETTINGS },
      }
    }
    return c.json(res)
  })

  /** 차와 연결된 폰이 같이 쓰는 설정 (M-12 보낼게요/나만 볼게요 · M-40 운전 경력). 바꿀 것만 보낸다 */
  app.patch('/v1/me/settings', small, either, async (c) => {
    const patch = parse(sharedSettingsPatchSchema, await readJson(c))
    const carId = requireCar(c.get('device'))
    const res: SharedSettingsResponse = { settings: await me.patchSettings(carId, patch) }
    return c.json(res)
  })

  /** 폰: 연결 끊기(이 폰 토큰 폐기). 차: 연결된 폰을 모두 끊음 (차 토큰은 그대로) */
  app.delete('/v1/me', either, async (c) => {
    const d = c.get('device')
    await me.deletePhones(d.kind === 'phone' ? [d.id] : (await me.phonesOf(d.id)).map((p) => p.id))
    return c.body(null, 204)
  })

  // ───── 내 주차 ─────
  app.put('/v1/me/parkings/:id', parkingBody, car, async (c) => {
    const id = c.req.param('id')
    if (!MY_PARKING_ID_RE.test(id)) throw badRequest('주차 id는 영문·숫자·-_ 64자까지예요')
    const input = parse(myParkingInputSchema, await readJson(c))
    const d = c.get('device')
    // v1.2 주차왕: 참여 중이면 이 주차를 반영하기 전·후 등수 (C-05 "주차왕 이번 주 12등 → 10등")
    const before = await ctx.king.rankNow(d.id)
    const { parking, created } = await me.putParking(d.id, id, input)
    const king = before ? { rankBefore: before.rank, rankAfter: (await ctx.king.rankNow(d.id))?.rank ?? null } : null
    if (created && push.publicKey) {
      const subs = await me.pushSubsForCar(d.id)
      const msg: PushMessage = { title: '주차각', body: `${spotText(parking)}에 주차했어요`, url: '/', parkingId: parking.id }
      const outcomes = await Promise.all(
        subs.map((s) =>
          Promise.race([push.send(s, msg), new Promise<'error'>((r) => setTimeout(() => r('error'), PUSH_TIMEOUT_MS))]).catch(() => 'error' as const),
        ),
      )
      await Promise.all(outcomes.map((o, i) => (o === 'gone' ? me.dropPushEndpoint(subs[i].endpoint) : null)))
    }
    const res: MyParkingPutResponseV12 = { parking, king }
    return c.json(res)
  })

  app.get('/v1/me/parkings', either, async (c) => {
    const { limit, before } = parse(myParkingsQuery, c.req.query())
    const carId = carOf(c.get('device'))
    const res: MyParkingsResponse = carId ? await me.listParkings(carId, limit, before) : { parkings: [], nextBefore: null }
    return c.json(res)
  })

  // /v1/me/parkings/:id/found 보다 먼저 (경로가 겹치지는 않지만 읽기 쉽게)
  app.get('/v1/me/parkings/current', either, async (c) => {
    const carId = carOf(c.get('device'))
    const res: CurrentParkingResponse = { parking: carId ? await me.currentParking(carId) : null }
    return c.json(res)
  })

  /** M-33 한 건 (폰이 목록을 넘겨 가며 찾지 않게) — current 뒤에 둬서 "current" 가 id 로 잡히지 않게 */
  app.get('/v1/me/parkings/:id', either, async (c) => {
    const carId = carOf(c.get('device'))
    const id = c.req.param('id')
    const p = carId && MY_PARKING_ID_RE.test(id) ? await me.getParking(carId, id) : null
    if (!p) throw notFound('주차 기록을 찾을 수 없어요')
    const res: MyParkingResponse = { parking: p }
    return c.json(res)
  })

  app.post('/v1/me/parkings/:id/found', either, async (c) => {
    const carId = carOf(c.get('device'))
    const p = carId ? await me.markFound(carId, c.req.param('id')) : null
    if (!p) throw notFound('주차 기록을 찾을 수 없어요')
    return c.json({ parking: p })
  })

  app.get('/v1/me/stats', either, async (c) => {
    const carId = carOf(c.get('device'))
    const res: MyStatsResponse = carId
      ? await me.stats(carId)
      : { thisMonthAvgReverse: null, lastMonthAvgReverse: null, monthly: [], favorites: [] }
    return c.json(res)
  })

  // ───── 푸시 ─────
  app.get('/v1/push/key', (c) => {
    if (!push.publicKey) throw notFound('이 서버는 알림을 보내지 않아요')
    return c.json({ publicKey: push.publicKey })
  })

  app.post('/v1/me/push', small, phone, async (c) => {
    const sub = parse(pushSubscriptionSchema, await readJson(c))
    await me.savePush(c.get('device').id, sub)
    return c.body(null, 204)
  })

  app.delete('/v1/me/push', small, phone, async (c) => {
    const req = parse(pushUnsubscribeSchema, await readJsonOptional(c))
    await me.deletePush(c.get('device').id, req?.endpoint)
    return c.body(null, 204)
  })
}
