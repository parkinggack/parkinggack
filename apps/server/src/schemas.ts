/** 요청 검증 (zod). 타입은 packages/api-types 와 맞는지 컴파일 때 확인한다 (아래 Assert). */
import { z } from 'zod'
import type {
  AdminLotInput,
  AnonymousRecord,
  ClaimPairingRequest,
  CreateShareRequest,
  KingJoinRequest,
  LotCategory,
  MyParkingInput,
  ParkingSummaryV12,
  RatingRequest,
  ReasonTag,
  RegisterDeviceRequest,
} from '@parkinggack/api-types'

const REASON_TAGS = [
  'SPIRAL_RAMP',
  'NARROW_AISLE',
  'MANY_PILLARS',
  'MECHANICAL',
  'STEEP_SLOPE',
  'FREQUENT_REVERSE',
  'SPACIOUS',
  'FLAT',
  'MANY_FLOORS',
] as const satisfies readonly ReasonTag[]

const LOT_CATEGORIES = ['DEPARTMENT', 'MALL', 'OFFICE', 'PUBLIC', 'APARTMENT', 'OTHER'] as const satisfies readonly LotCategory[]
export const REGION_RE = /^[a-z0-9][a-z0-9-]{0,31}$/

const int = (min: number, max: number) => z.number().int().min(min).max(max)
/** 재전송 중복 제거용 무작위 id (UUID 등) */
const clientId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, '8~64자 영문·숫자·-_')

export const anonymousRecordSchema = z.object({
  clientRecordId: clientId,
  lotId: z.string().min(1).max(64),
  floor: z.string().trim().max(8).nullable(),
  reverseCount: int(0, 50),
  steeringTurns: int(0, 100),
  brakeCount: int(0, 1000).nullable(),
  durationSec: int(1, 3600),
  rampTurns: z.number().min(0).max(20),
  shape: z.enum(['PERPENDICULAR', 'PARALLEL', 'ANGLED', 'UNKNOWN']),
  approximate: z.boolean(),
  vehicleClass: z.enum(['COMPACT', 'MIDSIZE', 'LARGE', 'SUV', 'UNKNOWN']),
  experience: z.enum(['UNDER_1Y', 'Y1_3', 'Y3_10', 'OVER_10Y', 'UNKNOWN']),
  parkedHour: int(0, 23),
  parkedWeekday: int(1, 7),
})

export const ratingSchema = z.object({
  clientRatingId: clientId,
  stars: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
})

/** apps/mobile/src/payload.ts 와 같은 한도: 이름 60자, 층·구역·기둥 12자, 메모·힌트 80자, 힌트 4줄, 경로 15개 */
export const SHARE_LIMITS = { lot: 60, spot: 12, text: 80, hints: 4, route: 2 + 2 * 6 + 1 } as const

export const sharePayloadSchema = z.object({
  v: int(1, 1000),
  lot: z.string().max(SHARE_LIMITS.lot),
  f: z.string().max(SHARE_LIMITS.spot),
  z: z.string().max(SHARE_LIMITS.spot),
  n: z.string().max(SHARE_LIMITS.spot),
  t: z.number().int().positive().max(8.64e15),
  m: z.string().max(SHARE_LIMITS.text).optional(),
  h: z.array(z.string().max(SHARE_LIMITS.text)).max(SHARE_LIMITS.hints).optional(),
  r: z.array(int(-2000, 2000)).max(SHARE_LIMITS.route).optional(),
})

export const createShareSchema = z.object({ payload: sharePayloadSchema })

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
const floors = z
  .array(z.string().trim().min(1).max(8))
  .min(1)
  .max(40)
  .refine((a) => new Set(a).size === a.length, '층 이름이 겹쳐요')
const zoneScheme = z.object({
  zones: z.array(z.string().trim().min(1).max(4)).max(40),
  numbers: z.array(z.string().trim().min(1).max(6)).max(99),
  description: z.string().max(80).nullable().optional(),
})

export const LOT_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

export const adminLotInputSchema = z.object({
  id: z.string().regex(LOT_ID_RE, '영문 소문자·숫자·- (예: hyundai-pangyo)'),
  name: z.string().trim().min(1).max(60),
  location: latLng,
  address: z.string().trim().max(120).nullable().optional(),
  floors,
  zoneScheme: zoneScheme.optional(),
  manualTags: z
    .array(z.enum(REASON_TAGS))
    .max(REASON_TAGS.length)
    .refine((a) => new Set(a).size === a.length, '태그가 겹쳐요')
    .optional(),
  publicInfo: z.array(z.string().trim().min(1).max(80)).max(8).optional(),
  feeText: z.string().trim().max(80).nullable().optional(),
  aliases: z.array(z.string().trim().min(2).max(40)).max(12).optional(),
  pitch: z.string().trim().max(30).nullable().optional(),
  suggestible: z.boolean().optional(),
  category: z.enum(LOT_CATEGORIES).optional(),
  region: z.string().regex(REGION_RE, '영문 소문자·숫자·- (예: pangyo)').optional(),
  shortName: z.string().trim().min(1).max(30).nullable().optional(),
  rampKind: z.enum(['NONE', 'STRAIGHT', 'SPIRAL']).nullable().optional(),
})

export const adminLotPatchSchema = adminLotInputSchema.partial()

// ───── 쿼리 ─────

/** 빈 문자열은 없는 것으로 */
const q = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema)
const qNum = (min: number, max: number) => q(z.coerce.number().min(min).max(max).optional())
const qInt = (min: number, max: number, def: number) => q(z.coerce.number().int().min(min).max(max).default(def))

const withLatLng = <T extends { lat?: number; lng?: number }>(o: T) => (o.lat == null) === (o.lng == null)
const LAT_LNG_PAIR = { message: 'lat 와 lng 는 같이 보내 주세요', path: ['lat'] }

export const listLotsQuery = z
  .object({ lat: qNum(-90, 90), lng: qNum(-180, 180), radius: qInt(1, 50_000, 1000), limit: qInt(1, 200, 50) })
  .refine(withLatLng, LAT_LNG_PAIR)

export const matchQuery = z
  .object({ name: q(z.string().trim().max(120).optional()), lat: qNum(-90, 90), lng: qNum(-180, 180) })
  .refine(withLatLng, LAT_LNG_PAIR)
  .refine((o) => !!o.name || o.lat != null, { message: 'name 이나 lat·lng 중 하나는 필요해요', path: ['name'] })

export const easierQuery = z.object({ max: qInt(1, 10, 3), radius: qInt(1, 5000, 1000) })
export const adminLotsQuery = z.object({ q: q(z.string().trim().max(100).optional()) })
const qBefore = q(z.coerce.number().int().min(1).optional())
/** GET /v1/admin/lots/:id/records (예전부터 limit 1000 까지) */
export const adminLotRecordsQuery = z.object({ limit: qInt(1, 1000, 100), before: qBefore })
/** GET /v1/admin/records */
export const adminRecordsQuery = z.object({
  lotId: q(z.string().min(1).max(64).optional()),
  demo: q(
    z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  ),
  limit: qInt(1, 500, 100),
  before: qBefore,
})

// ───── v1.1 기기·페어링·내 주차·푸시 ─────

/** 제어 문자 없는 짧은 이름 (차종·폰 이름). 차량 번호·VIN 은 넣지 말라고 안내만 */
const deviceName = z
  .string()
  .trim()
  .max(40)
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), '제어 문자는 쓸 수 없어요')
  .nullable()
  .optional()

export const registerDeviceSchema = z.object({ kind: z.enum(['car', 'phone']), name: deviceName })
export const claimPairingSchema = z.object({ phoneName: deviceName })

/** 차량 앱 MyParkingSync 와 같은 한도: 동선 300점, 힌트 4줄 */
export const MY_PARKING_LIMITS = { path: 300, hints: 4, text: 80, spot: 12, route: 64, speedKmh: 400 } as const
const coord = z.number().finite().min(-100_000).max(100_000)
const pathPoint = z.tuple([z.number().finite().min(0), coord, coord, z.number().finite().min(-1000).max(1000), z.union([z.literal(0), z.literal(1)])])
const isoDate = z.string().max(40).refine((v) => Number.isFinite(Date.parse(v)), 'ISO-8601 시각이어야 해요')

export const myParkingInputSchema = z.object({
  lotId: z.string().min(1).max(64).nullable(),
  lotName: z.string().max(MY_PARKING_LIMITS.text),
  floor: z.string().max(MY_PARKING_LIMITS.spot).nullable(),
  zone: z.string().max(MY_PARKING_LIMITS.spot).nullable(),
  number: z.string().max(MY_PARKING_LIMITS.spot).nullable(),
  note: z.string().max(MY_PARKING_LIMITS.text).nullable(),
  parkedAt: isoDate,
  summary: z
    .object({
      reverseCount: int(0, 50),
      steeringTurns: int(0, 100),
      durationSec: int(0, 7200),
      rampTurns: z.number().min(0).max(20),
      shape: z.enum(['PERPENDICULAR', 'PARALLEL', 'ANGLED', 'UNKNOWN']),
      approximate: z.boolean(),
      /** v1.2 주차장 안 최고 속도 (km/h). 없거나 null 이면 주차왕 판정에서 속도 조건을 건너뜀 */
      maxSpeedKmh: z.number().finite().min(0).max(MY_PARKING_LIMITS.speedKmh).nullable().optional(),
    })
    .nullable(),
  hints: z.array(z.string().max(MY_PARKING_LIMITS.text)).max(MY_PARKING_LIMITS.hints),
  route: z.array(int(-100_000, 100_000)).max(MY_PARKING_LIMITS.route).nullable(),
  path: z.array(pathPoint).max(MY_PARKING_LIMITS.path),
})

/** 내 주차 id: 차가 만든 UUID (ParkingRecord.id) */
export const MY_PARKING_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export const myParkingsQuery = z.object({
  limit: qInt(1, 100, 50),
  before: q(isoDate.optional()),
})

/** 브라우저 PushSubscription.toJSON() */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine((v) => v.startsWith('https://'), 'https 주소여야 해요'),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
})
export const pushUnsubscribeSchema = z.object({ endpoint: z.string().max(1000).optional() }).optional()

/** PATCH /v1/me/settings — 바꿀 것만 (빈 객체도 됨 → 지금 값) */
export const sharedSettingsPatchSchema = z.strictObject({
  shareAnonymous: z.boolean().optional(),
  experience: z.enum(['UNDER_1Y', 'Y1_3', 'Y3_10', 'OVER_10Y', 'UNKNOWN']).optional(),
})

// ───── v1.1 대시보드 ─────
const qRegion = q(z.string().regex(REGION_RE).default('pangyo'))
const qDays = qInt(1, 365, 30)
export const insightsOverviewQuery = z.object({ region: qRegion, days: qDays })
export const insightsLotQuery = z.object({ days: qDays, floor: q(z.string().trim().min(1).max(8).optional()), maxPaths: qInt(1, 2000, 300) })
export const insightsCompareQuery = z.object({
  region: qRegion,
  days: qDays,
  /** 하나 또는 쉼표로 여러 개 (D-03 "백화점·상가" = DEPARTMENT,MALL) */
  category: q(
    z
      .string()
      .transform((v) => v.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean))
      .pipe(z.array(z.enum(LOT_CATEGORIES)).min(1).max(6))
      .optional(),
  ),
})

// ───── v1.2 주차왕 ─────
/** GET /v1/king/nickname?region= (기본 pangyo) */
export const kingNicknameQuery = z.object({ region: qRegion })
/** POST /v1/me/king/join — 닉네임 형식은 라우트에서 (king.isValidNickname, 공백 정리 뒤 2~20자) */
export const kingJoinSchema = z.strictObject({
  nickname: z.string().max(60),
  region: z.string().regex(REGION_RE, '영문 소문자·숫자·- (예: pangyo)').optional(),
})
/** POST /v1/admin/king/demo-car */
export const kingDemoCarSchema = z.strictObject({
  deviceId: z.string().min(1).max(64),
  scenario: z.enum(['board', 'results']).default('board'),
})

// ───── 계약과 맞는지 (타입만) ─────
type Assert<T extends true> = T
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
export type _Checks = [
  Assert<Same<z.infer<typeof anonymousRecordSchema>, AnonymousRecord>>,
  Assert<Same<z.infer<typeof ratingSchema>, RatingRequest>>,
  Assert<Same<z.infer<typeof createShareSchema>, CreateShareRequest>>,
  Assert<z.infer<typeof adminLotInputSchema> extends AdminLotInput ? true : false>,
  Assert<z.infer<typeof registerDeviceSchema> extends RegisterDeviceRequest ? true : false>,
  Assert<z.infer<typeof claimPairingSchema> extends ClaimPairingRequest ? true : false>,
  // v1.2: 요약에 maxSpeedKmh (ParkingSummaryV12)
  Assert<Same<z.infer<typeof myParkingInputSchema>, Omit<MyParkingInput, 'summary'> & { summary: ParkingSummaryV12 | null }>>,
  Assert<Same<z.infer<typeof kingJoinSchema>, KingJoinRequest>>,
]
