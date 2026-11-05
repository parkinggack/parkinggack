/**
 * 주차각 API v1 계약 — 단일 기준(source of truth). 사람이 읽는 설명은 docs/api.md.
 *
 * - JSON, UTF-8, 필드는 camelCase. 시각은 ISO-8601 문자열(UTC) 또는 epoch ms(이름이 ...Ms).
 * - 차량 앱 Kotlin 모델(apps/vehicle/.../model/*.kt)과 이름·의미를 맞춘다.
 * - 바꿀 때: 이 파일 + docs/api.md + 서버 구현/테스트 + 차량 앱 DTO + admin/mobile 사용처를 같이 고칠 것.
 */

// ───────────── 공통 ─────────────

export interface LatLng { lat: number; lng: number }

export interface ApiError { error: { code: ErrorCode; message: string } }
export type ErrorCode =
  | 'bad_request'      // 400 입력 검증 실패
  | 'unauthorized'     // 401 어드민 토큰 없음/틀림
  | 'not_found'        // 404
  | 'gone'             // 410 만료된 공유 링크
  | 'conflict'         // 409 중복 id 등
  | 'rate_limited'     // 429
  | 'internal'         // 500

/** 난이도 이유 태그 — Kotlin ReasonTag enum과 같은 이름 */
export type ReasonTag =
  | 'SPIRAL_RAMP' | 'NARROW_AISLE' | 'MANY_PILLARS' | 'MECHANICAL' | 'STEEP_SLOPE'
  | 'FREQUENT_REVERSE' | 'SPACIOUS' | 'FLAT' | 'MANY_FLOORS'

export type ParkingShape = 'PERPENDICULAR' | 'PARALLEL' | 'ANGLED' | 'UNKNOWN'
export type DrivingExperience = 'UNDER_1Y' | 'Y1_3' | 'Y3_10' | 'OVER_10Y' | 'UNKNOWN'
/** 차 크기 등급 (난이도 보정용). 차량 앱이 AAOS INFO_MODEL/제원으로 분류 */
export type VehicleClass = 'COMPACT' | 'MIDSIZE' | 'LARGE' | 'SUV' | 'UNKNOWN'

// ───────────── 주차장 ─────────────

export interface ZoneScheme {
  zones: string[]          // 예 ["A".."H"]
  numbers: string[]        // 예 ["01".."12"]
  description?: string | null
}

export interface FloorCongestion { floor: string; occupancy: number /* 0..1 */ }

/** C-08 근거 통계 — Kotlin LotStats와 같은 필드 */
export interface LotStats {
  avgReverse: number
  overallAvgReverse: number
  avgRampTurns: number
  overallAvgRampTurns: number
  avgDurationSec: number
  overallAvgDurationSec: number
  congestionLabel: string          // "평일 오후"
  floorCongestion: FloorCongestion[]
  congestionSummary: string        // "B1 만차 · B3부터 여유"
  hourlyHeat: number[][]           // [7 요일(월..일)][hourLabels.length], 0..1
  hourLabels: string[]             // ["10시","12시","14시","16시","18시","20시"]
}

/** 목록·카드용 (C-01, C-02, C-03) */
export interface ParkingLot {
  id: string                       // slug, 예 "hyundai-pangyo"
  name: string
  location: LatLng
  address?: string | null
  /** 0.0~5.0, 데이터 부족(표본 < MIN_SAMPLES)이면 null */
  difficulty: number | null
  tags: ReasonTag[]
  statChips: string[]              // 예 ["평균 후진 3.2회"]
  /** 최근 30일 기록 차량 수 */
  sampleCount: number
  ratingCount: number
  floors: string[]                 // 위→아래 ["1F","B1",...]
  zoneScheme: ZoneScheme
  publicInfo: string[]             // 데이터 부족 상태에서 보여 줄 공공데이터 기본 정보
  feeText: string | null
  updatedAt: string                // ISO
  /** v1.1 주차장 유형 (대시보드 필터) */
  category: LotCategory
  /** v1.1 지역 id (예 "pangyo") — /v1/insights/*?region= */
  region: string
}

/** 상세 (C-08) */
export interface ParkingLotDetail extends ParkingLot {
  stats: LotStats | null           // 표본이 하나도 없으면 null
}

export const MIN_SAMPLES = 10

// GET /v1/lots?lat=&lng=&radius=1000&limit=50   (lat/lng 없으면 전체, 이름순)
export interface ListLotsResponse { lots: (ParkingLot & { distanceM?: number })[] }

// GET /v1/lots/match?name=&lat=&lng=     내비 목적지 → 그 목적지의 주차장
export interface MatchLotResponse { lot: ParkingLot | null; matchedBy: 'name' | 'location' | null }

// GET /v1/lots/:id
export interface LotDetailResponse { lot: ParkingLotDetail }

// GET /v1/lots/:id/easier?max=3&radius=1000    (C-03, 쉬운 순)
export interface LotSuggestion {
  lot: ParkingLot
  walkMinutes: number
  distanceM: number
  pitch: string                    // "걸어서 4분, 훨씬 넓어요"
}
export interface EasierLotsResponse { suggestions: LotSuggestion[] }

// ───────────── 익명 주차 기록 (F3, 설정에서 동의한 경우만) ─────────────

/**
 * POST /v1/records → 202 RecordAcceptedResponse
 * 사람·차를 식별할 수 있는 값은 보내지 않는다: 이름·차량번호·VIN·좌표·정확한 시각 없음.
 * clientRecordId: 재전송 중복 제거용 무작위 UUID (기기·사용자와 연결되지 않음)
 */
export interface AnonymousRecord {
  clientRecordId: string
  lotId: string
  floor: string | null
  reverseCount: number             // 0..50
  steeringTurns: number            // 0..100
  brakeCount: number | null
  durationSec: number              // 1..3600
  rampTurns: number                // 0..20
  shape: ParkingShape
  approximate: boolean
  vehicleClass: VehicleClass
  experience: DrivingExperience
  parkedHour: number               // 0..23 (현지 시각)
  parkedWeekday: number            // 1..7 (월=1)
}
export interface RecordAcceptedResponse {
  accepted: true
  duplicate: boolean
  lot: { id: string; difficulty: number | null; sampleCount: number }
}

// POST /v1/lots/:id/ratings   (C-08 "별점 남기기")
export interface RatingRequest { clientRatingId: string; stars: 1 | 2 | 3 | 4 | 5 }
export interface RatingResponse { lot: { id: string; difficulty: number | null; ratingCount: number } }

// ───────────── 폰으로 보내기 짧은 링크 (C-07 → M-01/M-02) ─────────────

/** 차량 앱 ShareLink fragment JSON과 같은 형태 (apps/mobile/src/payload.ts Parking) */
export interface SharePayload {
  v: number
  lot: string
  f: string
  z: string
  n: string
  t: number
  m?: string
  h?: string[]
  r?: number[]
}
// POST /v1/shares  → 201
export interface CreateShareRequest { payload: SharePayload }
export interface CreateShareResponse {
  code: string                     // 6~8자 [a-z0-9], 헷갈리는 글자(0 o 1 l i) 제외
  url: string                      // `${PUBLIC_WEB_BASE}/s/${code}`
  expiresAt: string                // 기본 48시간
}
// GET /v1/shares/:code → 200 / 404 not_found / 410 gone
export interface GetShareResponse { payload: SharePayload; expiresAt: string }

// ───────────── 어드민 (Authorization: Bearer <ADMIN_TOKEN>) ─────────────

export interface AdminLot extends ParkingLotDetail {
  /** 운영자가 직접 붙인 태그. tags = 수동 태그 먼저(운영자 순서) → 자동 태그, 중복 제거, 최대 3개 */
  manualTags: ReasonTag[]
  /** 점수 계산에 쓰인 90일 표본 수 */
  scoreSampleCount: number
  demo: boolean                    // 시연용 합성 데이터로 채운 주차장
  createdAt: string
  /** 내비 목적지 키워드 (GET /v1/lots/match 이름 부분 일치에 같이 씀). 예 ["현대백화점"] */
  aliases: string[]
  /** C-03 추천 문구 뒷부분 ("걸어서 4분, " 다음). null이면 태그로 자동 (FLAT → "평면이라 편해요" 등) */
  pitch: string | null
  /** false면 /easier 추천 후보에서 뺌 (집·회사 같은 개인 장소) */
  suggestible: boolean
  /** v1.1 대시보드 짧은 이름 (예 "현대백화점 판교점 지하"). 정하지 않으면 이름 끝 "주차장"을 뗀 것 */
  shortName: string
  /** v1.1 램프 종류 (D-03 "없음"/"직선"/"N바퀴"). 정하지 않으면 평균 램프 바퀴·층 수로 정함 */
  rampKind: RampKind
}

// GET /v1/admin/overview
export interface AdminOverviewResponse {
  totals: {
    lots: number
    records: number                // 전체 기간
    records30d: number
    ratings: number
    shares: number                 // 지금 열 수 있는(만료 전) 짧은 링크
    /** difficulty 가 null 이 아닌 주차장들의 난이도 평균 (소수 한 자리). 그런 곳이 없으면 null */
    avgDifficulty: number | null
  }
  hardest: ParkingLot[]            // 난이도 높은 순 5 (difficulty null 제외)
  easiest: ParkingLot[]            // 낮은 순 5 (difficulty null 제외)
  byHour: number[]                 // 24, 최근 90일 기록의 parkedHour 분포
  byWeekday: number[]              // 7 (월..일), 최근 90일 기록의 parkedWeekday 분포
  recentRecords: AdminRecordRow[]  // 최근 20 (id 큰 순)
}
export interface AdminRecordRow {
  id: number
  lotId: string
  lotName: string
  floor: string | null
  reverseCount: number
  steeringTurns: number
  durationSec: number
  rampTurns: number
  shape: ParkingShape
  vehicleClass: VehicleClass
  experience: DrivingExperience
  parkedHour: number
  parkedWeekday: number
  demo: boolean
  receivedAt: string
}

// GET  /v1/admin/lots?q=         → { lots: AdminLot[] }
// GET  /v1/admin/lots/:id        → { lot: AdminLot }  (404 not_found)
// POST /v1/admin/lots            body AdminLotInput (id 포함) → 201 { lot: AdminLot }  (같은 id 있으면 409 conflict)
// PUT  /v1/admin/lots/:id        body Partial<AdminLotInput>  → { lot: AdminLot }
//                                id 는 못 바꿈: 본문 id 가 경로와 다르면 400 bad_request (같으면 무시)
// DELETE /v1/admin/lots/:id      → 204
// GET  /v1/admin/lots/:id/records?limit=100&before= → AdminRecordsResponse
// GET  /v1/admin/records?lotId=&demo=true|false&limit=100&before=<record id> → AdminRecordsResponse
//                                최신(id 큰) 순, before 보다 작은 id 만. limit 1~500. 없는 lotId 는 404
// POST /v1/admin/recompute       → { lots: number }   전체 점수 다시 계산
export interface AdminLotInput {
  id: string
  name: string
  location: LatLng
  address?: string | null
  floors: string[]
  zoneScheme?: ZoneScheme
  manualTags?: ReasonTag[]
  publicInfo?: string[]
  feeText?: string | null
  aliases?: string[]                // 기본 []
  pitch?: string | null             // 기본 null
  suggestible?: boolean             // 기본 true
  category?: LotCategory            // v1.1, 기본 'OTHER'
  region?: string                   // v1.1, 기본 'other' (영문 소문자·숫자·-)
  shortName?: string | null         // v1.1, null 이면 자동 (이름 끝 "주차장" 뗌)
  rampKind?: RampKind | null        // v1.1, null 이면 자동 (평균 램프 ≥ 1바퀴 SPIRAL, 층 여럿 STRAIGHT, 아니면 NONE)
}
export interface AdminLotsResponse { lots: AdminLot[] }
export interface AdminLotResponse { lot: AdminLot }
export interface AdminRecordsResponse {
  records: AdminRecordRow[]
  /** 다음 쪽을 읽을 때 before 로 넘길 값 (= 이번 쪽 마지막 id). 더 없으면 null */
  nextBefore?: number | null
}

// GET /health → { ok: true, version: string }

// ═══════════════════════════════════════════════════════════════════
// v1.1 — 폰 앱(짝꿍 앱) 페어링·동기화, PC 대시보드 통계 (디자인 M-10~M-40, D-01~D-03)
// ═══════════════════════════════════════════════════════════════════

// ───────────── 기기 (차·폰) ─────────────
/**
 * 계정 없음. 기기마다 무작위 토큰을 발급하고 `Authorization: Device <token>` 으로 인증한다.
 * 토큰은 기기 안에만 저장 (차: 앱 저장소, 폰: localStorage). 서버는 토큰의 SHA-256만 저장.
 */
export type DeviceKind = 'car' | 'phone'

// POST /v1/devices → 201
export interface RegisterDeviceRequest {
  kind: DeviceKind
  /** 차: "그랜저" 같은 차종 이름(선택) / 폰: 표시 이름(선택). 차량 번호·VIN 금지 */
  name?: string | null
}
export interface RegisterDeviceResponse { deviceId: string; token: string }

// ───────────── 페어링 (C-10 › 폰 연결 ↔ M-13) ─────────────

// POST /v1/pairings  (차 토큰) → 201   차 화면이 QR + 6자리 숫자 코드를 띄운다 (10분 유효)
export interface CreatePairingResponse {
  code: string                     // 숫자 6자리 "483920" (손으로 입력하기 쉬움)
  url: string                      // `${PUBLIC_WEB_BASE}/pair/${code}` — QR 내용. 폰 앱이 열면 바로 연결
  expiresAt: string
}
// GET /v1/pairings/:code  (차 토큰) → 차가 2초마다 확인
export interface PairingStatusResponse { status: 'pending' | 'claimed' | 'expired'; phoneName: string | null }
// POST /v1/pairings/:code/claim  (인증 없음, 폰) → 200 / 404 / 410
export interface ClaimPairingRequest { phoneName?: string | null }
export interface ClaimPairingResponse {
  /** 폰 기기 토큰 (이후 /v1/me/* 에 사용) */
  token: string
  car: PairedCar
}
export interface PairedCar { deviceId: string; name: string | null; pairedAt: string }

// GET /v1/me  (폰 토큰) → 연결된 차 / DELETE /v1/me → 연결 끊기(폰 토큰 폐기) 204
//   차 토큰이면 GET → { kind:'car', car:null, phones:연결된 폰 수 }, DELETE → 연결된 폰 모두 끊기 (차 토큰은 그대로)
export interface MeResponse {
  kind: DeviceKind
  car: PairedCar | null
  phones: number
  /** 차와 연결된 폰이 같이 쓰는 설정 (차마다 저장). 폰 M-12 보낼게요/나만 볼게요 · M-40 운전 경력, 차는 시작할 때·설정 화면에서 읽음 */
  settings: SharedSettings
}

/** 기본 { shareAnonymous: true, experience: 'UNKNOWN' } */
export interface SharedSettings {
  /** 익명 기록(/v1/records)을 보낼지 — false 면 차가 보내지 않는다 ("나만 볼게요") */
  shareAnonymous: boolean
  experience: DrivingExperience
}
// PATCH /v1/me/settings  (차 또는 연결된 폰 토큰) body Partial<SharedSettings> → { settings: SharedSettings }
//   폰이 아직 차와 연결 전이면 409 conflict
export type SharedSettingsPatch = Partial<SharedSettings>
export interface SharedSettingsResponse { settings: SharedSettings }

// ───────────── 내 주차 (차 → 서버 → 폰). 익명 집계(/v1/records)와 별개, 연결된 폰만 볼 수 있음 ─────────────

export interface ParkingSummary {
  reverseCount: number
  steeringTurns: number
  durationSec: number
  rampTurns: number
  shape: ParkingShape
  approximate: boolean
}
/** 위에서 본 동선 (M-33). [tMs, x, y, headingRad, reverse(0|1)] 최대 300점, 미터 단위 로컬 좌표 */
export type PathPoint = [number, number, number, number, 0 | 1]

export interface MyParking {
  id: string                       // 차가 만든 UUID (ParkingRecord.id)
  lotId: string | null
  lotName: string
  floor: string | null
  zone: string | null
  number: string | null
  note: string | null
  parkedAt: string                 // ISO
  summary: ParkingSummary | null
  hints: string[]                  // 돌아가는 길 (M-02)
  route: number[] | null           // 힌트 그림용 압축 경로 (apps/mobile route.ts)
  path: PathPoint[]                // 동선 (M-33)
  foundAt: string | null           // 폰에서 "차 찾았어요"
  updatedAt: string
}
// PUT /v1/me/parkings/:id  (차 토큰) body MyParkingInput → { parking: MyParking }   같은 id는 덮어씀(층·구역 수정)
export type MyParkingInput = Omit<MyParking, 'id' | 'foundAt' | 'updatedAt'>
// GET /v1/me/parkings?limit=50&before=<ISO>  (차·폰 토큰) → 최신순
export interface MyParkingsResponse { parkings: MyParking[]; nextBefore: string | null }
// GET /v1/me/parkings/:id  (차·연결된 폰 토큰) → { parking: MyParking } (M-33), 이 차의 것이 아니면 404
export interface MyParkingResponse { parking: MyParking }
// GET /v1/me/parkings/current  (폰 토큰) → 가장 최근 것 중 foundAt 없는 것 (M-20 "지금 주차 중"), 없으면 null
export interface CurrentParkingResponse { parking: MyParking | null }
// POST /v1/me/parkings/:id/found  (폰 토큰) → { parking }
// GET  /v1/me/stats (차·폰 토큰) → M-32 / C-09
export interface MyStatsResponse {
  thisMonthAvgReverse: number | null
  lastMonthAvgReverse: number | null
  monthly: { month: string; avgReverse: number }[]   // 최근 6개월 "2026-06"
  favorites: { lotId: string; count: number }[]      // 자주 간 주차장 Top3
}

// ───────────── 알림 (M-14 "알림 받을게요", 선택 구현) ─────────────
// GET  /v1/push/key → { publicKey }   (VAPID, 서버에 키가 없으면 404 → 폰은 알림 끔)
// POST /v1/me/push  (폰 토큰) body PushSubscriptionJSON → 204 ; DELETE /v1/me/push → 204
// 차가 새 주차를 올리면(같은 id 를 고칠 때는 아님) 연결된 폰에 웹 푸시 — 내용은 PushMessage JSON 그대로
/** 웹 푸시 내용 (서비스 워커가 받는 JSON). 예 { title: "주차각", body: "B2 · D-07에 주차했어요", url: "/", parkingId } */
export interface PushMessage {
  title: string
  /** 층·구역·번호가 있으면 "B2 · D-07에 주차했어요", 없으면 "<주차장 이름>에 주차했어요" */
  body: string
  /** 눌렀을 때 열 폰 앱 경로 (항상 "/") */
  url: string
  parkingId: string
}

// ───────────── 주차장 유형·지역 (대시보드 필터) ─────────────
export type LotCategory = 'DEPARTMENT' | 'MALL' | 'OFFICE' | 'PUBLIC' | 'APARTMENT' | 'OTHER'
export const LOT_CATEGORY_LABEL: Record<LotCategory, string> = {
  DEPARTMENT: '백화점', MALL: '상가', OFFICE: '오피스', PUBLIC: '공영', APARTMENT: '아파트', OTHER: '기타',
}
// ParkingLot 응답에 category: LotCategory, region: string (예 "pangyo") 추가(위 ParkingLot 에 반영). AdminLotInput에도 선택 필드로.

// ───────────── PC 대시보드 통계 (공개, 집계값만) ─────────────

// GET /v1/insights/overview?region=pangyo&days=30   (D-01)
/** 램프 종류: 없음(지상·단층) · 곧은 경사로 · 나선(회전) 램프 */
export type RampKind = 'NONE' | 'STRAIGHT' | 'SPIRAL'

export interface InsightsOverviewResponse {
  region: { id: string; name: string; center: LatLng }   // "판교 일대"
  days: number
  /** 집계에 시연(시드) 기록이 들어 있으면 true → 화면에 "시연용 예시 데이터" 띠 */
  demo: boolean
  totals: {
    records: number                // 6,388
    lots: number                   // 9
    avgReverse: number             // 2.0
    prevAvgReverse: number | null  // 지난 기간 2.3
  }
  lots: InsightLotRow[]            // 지도·순위용 (어려운 순)
  heat: WeekdayHourHeat            // 요일·시간대별 평균 후진
  improved: ImprovedLot[]          // 6개월 전 → 지금, 좋아진 순 (최대 4)
}
export interface InsightLotRow {
  id: string
  name: string
  shortName: string                // "현대백화점 판교점 지하"
  category: LotCategory
  rampKind: RampKind               // D-03 램프 칸: NONE "없음" · STRAIGHT "직선" · SPIRAL "{avgRampTurns}바퀴"
  location: LatLng
  difficulty: number | null
  avgReverse: number
  avgRampTurns: number
  avgDurationSec: number
  records: number                  // 기간 내 기록 수 (원 크기)
  trend: { month: string; avgReverse: number }[]  // 최근 6개월
}
export interface WeekdayHourHeat {
  weekdays: string[]               // ["월","화",...,"일"]
  hours: string[]                  // ["8시","10시",...]
  values: (number | null)[][]      // [weekday][hour] 평균 후진, 기록 없으면 null
}
/** name = 짧은 이름 (InsightLotRow.shortName). before = 추이 첫 칸, after = 마지막 칸(= 지금 평균 후진), trend = 6칸 */
export interface ImprovedLot { id: string; name: string; before: number; after: number; trend: number[] }

// GET /v1/insights/lots/:id?days=30&floor=B2&maxPaths=300   (D-02)
//   overlays 는 floor 한 층만 (기본: 기간 안 기록이 가장 많은 층), 동선은 maxPaths 개까지 (기본 300, 1~2000).
//   layout·hotspots 는 전 층 (작음), lot.floors 로 층 버튼
// 도면 좌표는 미터, 원점 왼쪽 위: aisles = 통로 중심선 [x1,y1,x2,y2], ramps = 나선 램프 [cx,cy,r], hotspots = 원 {x,y,r}
export interface InsightsLotResponse {
  /** 집계(기록)나 동선에 시연 데이터가 들어 있으면 true */
  demo: boolean
  lot: InsightLotRow & { floors: string[]; regionAvgReverse: number }
  /** 겹쳐 그릴 동선 — 층별, 주차장 도면 좌표(m)에 맞춘 것만. [x,y,reverse] 점 목록 */
  overlays: { floor: string; paths: [number, number, 0 | 1][][] }[]
  /** 그림 틀: 통로·램프·구역 (도면이 없으면 시드 레이아웃) */
  layout: { floor: string; width: number; height: number; aisles: [number, number, number, number][]; ramps: [number, number, number][]; zones: { label: string; x: number; y: number }[] }[]
  hotspots: { floor: string; rank: number; title: string; detail: string; avgReverse: number; x: number; y: number; r: number }[]
  floorAvgReverse: { floor: string; avgReverse: number }[]
  heat: WeekdayHourHeat
}

// GET /v1/insights/compare?region=pangyo&category=OFFICE&days=30   (D-03, 어려운 순)  category 는 쉼표로 여러 개도 (DEPARTMENT,MALL)
// 지역 평균(totals.avgReverse·regionAvgReverse) = 주차장별 평균 후진의 평균 (주차장마다 같은 무게)
export interface InsightsCompareResponse {
  region: { id: string; name: string }
  days: number
  /** 집계에 시연(시드) 기록이 들어 있으면 true */
  demo: boolean
  lots: InsightLotRow[]
}

// ═══════════════════════════════════════════════════════════════════
// v1.2 — 주차왕 (커뮤니티 순위). 디자인: 차 C-01·C-05·C-13, 폰 M-20(탭)·M-50~M-53
// 규칙(canvas notes s9·ps4): 종합 점수 하나 100점 = 후진·핸들 70 + 가 본 주차장 15 + 지난달보다 나아진 만큼 15.
// 빠르기는 점수에 없음 — 주차장 안에서 시속 10km를 넘은 주차는 빠짐(EXCLUDED).
// 리그 = 동네(region) × 운전 경력. 같은 경력끼리만. 매주 월요일 00:00 (Asia/Seoul) 초기화.
// 순위판엔 닉네임·점수만 (장소·시간 없음). 상위 5 + 내 앞뒤 1명. 참여는 따로 동의, 닉네임 자동 생성.
// 차·폰 모두 같은 '차' 단위로 참여한다 (폰 토큰은 연결된 차의 참여 정보를 본다).
// ═══════════════════════════════════════════════════════════════════

/** ParkingSummary 에 v1.2 로 추가: 주차장 안 최고 속도 (km/h, 차가 계산). 없으면 판정에서 속도 조건을 건너뜀 */
export interface ParkingSummaryV12 extends ParkingSummary { maxSpeedKmh?: number | null }

export interface KingLeague {
  id: string                       // "pangyo:UNDER_1Y"
  region: string                   // "pangyo"
  regionName: string               // "판교"
  experience: DrivingExperience
  label: string                    // 순위판 제목 "판교 초보" (UNDER_1Y=초보, Y1_3=새내기, Y3_10=중수, OVER_10Y=베테랑, UNKNOWN=모두)
  longLabel: string                // "판교 · 1년 미만"
}

export interface KingScore {
  total: number                    // 0..100 정수
  maneuver: number                 // 0..70 후진·핸들
  lotsVisited: number              // 0..15 가 본 주차장 (이번 주 서로 다른 주차장 수)
  improvement: number              // 0..15 지난달 평균 후진보다 줄어든 만큼
}

export type KingGrade = 'CLEAN' | 'OK' | 'EXCLUDED'   // 깔끔 · 보통 · 빠짐
export interface KingParkingRow {
  parkingId: string
  lotName: string
  parkedAt: string
  reverseCount: number
  grade: KingGrade
  excludedReason: 'SPEED' | null   // "주차장 안에서 시속 10km를 넘었어요"
}

export interface KingBoardRow {
  rank: number
  nickname: string
  score: number
  isMe: boolean
}

// GET /v1/king/nickname?region=pangyo → 새 닉네임 후보 (M-52 "다시 뽑기", 인증 없음, 저장 안 함)
export interface KingNicknameResponse { nickname: string }   // "판교 느긋한 수달" (동네 + 형용사 + 동물)

// POST /v1/me/king/join  (차 또는 연결된 폰 토큰) body KingJoinRequest → { me: KingMeResponse }
//   region 없으면 이 차의 최근 주차장 지역(없으면 pangyo), 경력은 /v1/me/settings.experience (참여할 때 고정, 바꾸려면 다시 join)
//   nickname: 공백 정리 뒤 한글·영문·숫자·띄어쓰기 2~20자 (아니면 400). 같은 리그의 다른 차가 쓰면 409. 연결 전 폰은 409
export interface KingJoinRequest { nickname: string; region?: string }
// DELETE /v1/me/king → 204 (그만두기: 순위판에서 빠짐, 기록은 그대로)

// GET /v1/me/king  (차·폰 토큰) — C-13 왼쪽 카드, M-50 위 카드, M-51, C-01·C-05 한 줄
export interface KingMeResponse {
  joined: boolean
  nickname: string | null
  /** 참여 전(joined=false)이면 참여하면 들어갈 리그 (M-52 "내 리그") */
  league: KingLeague | null
  week: { start: string; end: string } // 이번 주 (월 00:00 ~ 다음 월 00:00, KST)
  rank: number | null              // 이번 주 등수 (이번 주 점수가 없으면 null)
  total: number                    // 리그 참여자 수 = 이번 주 순위에 든 사람 수 (아직 점수 없는 참여자는 빼고 셈)
  percentile: number | null        // 상위 % (1..100)
  score: KingScore | null
  prevWeekRank: number | null      // "지난주 17등에서 올라왔어요"
  /** "한 번만 더 깔끔하게 대면 10등이에요" — 다음 등수까지 필요한 것, 없으면 null */
  nextHint: string | null
  parkings: KingParkingRow[]       // 이번 주에 댄 곳 (M-51, 최신순, 빠짐 포함 — 이 차·연결된 폰만 봄)
}

// GET /v1/me/king/board  (차·폰 토큰) — C-13 오른쪽, M-50 목록
export interface KingBoardResponse {
  league: KingLeague
  week: { start: string; end: string }
  total: number
  top: KingBoardRow[]              // 1~5등
  around: KingBoardRow[]           // 내 앞·나·뒤 (top 과 겹치면 빠짐). 내가 5등 안이면 []
  demo: boolean                    // 시연용 참여자가 섞여 있으면 true ("순위는 시연용 예시예요")
}

// GET /v1/me/king/results/last  (차·폰 토큰) — M-53 지난주 결과 (지난주에 점수가 없으면 404)
export type KingBadge = 'TOP10' | 'TOP3' | 'FIRST' | 'PIONEER' | 'CLIMBER' | 'CLEAN_WEEK'
export const KING_BADGE_LABEL: Record<KingBadge, string> = {
  TOP10: '상위 10%', TOP3: '3등 안', FIRST: '1등', PIONEER: '개척자', CLIMBER: '많이 올랐어요', CLEAN_WEEK: '깔끔한 한 주',
}
export interface KingResultResponse {
  week: { start: string; end: string }
  league: KingLeague
  rank: number
  total: number
  percentile: number
  score: number
  rankDelta: number | null         // 지난지난주보다 몇 계단 (+ 올라감)
  badges: KingBadge[]
}

// PUT /v1/me/parkings/:id 응답에 v1.2 로 추가: 참여 중이면 그 주차 반영 전후 등수 (C-05 "주차왕 이번 주 12등 → 10등")
export interface MyParkingPutResponseV12 { parking: MyParking; king: { rankBefore: number | null; rankAfter: number | null } | null }
