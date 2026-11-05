/**
 * 시연 모드(VITE_MOCK=1) 데이터 — docs/api.md "시드 데이터"와 같은 구성.
 *
 * - 판교 시연 주차장 7곳: 차량 앱 data/SeedLots.kt 와 같은 id·이름·좌표·별점·대수·태그·층
 * - W-01 지도용 수도권 시연 주차장 42곳 (판교 3곳은 W-01 시안 순위의 이름)
 * - 합성 기록(demo=true): 주차장마다 최근 30일 = sampleCount 건, 30~90일에 더 있음
 * - 실제 기록(demo=false) 몇 건: 차량 앱에서 개발 중 보낸 것처럼
 *
 * 숫자는 시연용 예시다. 고정 시드 난수라 같은 '지금'이면 늘 같은 데이터.
 */
import type {
  AdminLot,
  AdminRecordRow,
  DrivingExperience,
  FloorCongestion,
  LotCategory,
  LotStats,
  ParkingShape,
  ReasonTag,
  VehicleClass,
} from '@api-types'
import { formatCount } from '../format'
import type { AdminLotV11 } from '../types'
import { DEFAULT_NUMBERS, DEFAULT_ZONES } from '../validate'

export interface MockDb {
  now: number
  lots: AdminLot[]
  records: AdminRecordRow[]
  shares: number
  nextRecordId: number
}

// ───────────── 난수 ─────────────

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
type Rnd = () => number
const gauss = (r: Rnd) => {
  const u = Math.max(1e-9, r())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
}
function pick<T>(r: Rnd, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((a, [, w]) => a + w, 0)
  let x = r() * total
  for (const [v, w] of items) {
    x -= w
    if (x <= 0) return v
  }
  return items[items.length - 1][0]
}
const round1 = (v: number) => Math.round(v * 10) / 10
const round2 = (v: number) => Math.round(v * 100) / 100
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// ───────────── 판교 7곳 (SeedLots.kt) ─────────────

const SEED_HEAT = [
  [0.2, 0.3, 0.5, 0.7, 0.6, 0.4],
  [0.2, 0.3, 0.5, 0.6, 0.6, 0.4],
  [0.2, 0.3, 0.4, 0.6, 0.7, 0.5],
  [0.2, 0.3, 0.5, 0.7, 0.7, 0.5],
  [0.3, 0.4, 0.6, 0.8, 0.9, 0.7],
  [0.4, 0.6, 0.9, 1.0, 0.9, 0.7],
  [0.4, 0.6, 0.8, 0.9, 0.8, 0.5],
]
const HOUR_LABELS = ['10시', '12시', '14시', '16시', '18시', '20시']
const OVERALL = { reverse: 1.4, ramp: 0.8, duration: 65 }

interface LotDef {
  id: string
  name: string
  lat: number
  lng: number
  d: number | null
  n: number
  tags: ReasonTag[]
  manual?: ReasonTag[]
  floors: string[]
  address?: string
  publicInfo?: string[]
  feeText?: string
  zoneDescription?: string
  ratings?: number
  /** undefined → 난이도로 만듦, null → 통계 없음 */
  stats?: LotStats | null
}

const fl = (above: number, below: number) => [
  ...Array.from({ length: above }, (_, i) => `${above - i}F`),
  ...Array.from({ length: below }, (_, i) => `B${i + 1}`),
]

export const PANGYO_SEED: LotDef[] = [
  {
    id: 'hyundai-pangyo', name: '현대백화점 판교점 지하주차장', lat: 37.3926, lng: 127.1121, d: 4.3, n: 142,
    tags: ['SPIRAL_RAMP', 'MANY_PILLARS'], manual: ['MANY_PILLARS'], floors: fl(1, 6),
    address: '경기 성남시 분당구 판교역로146번길 20', publicInfo: ['기계식 아님 · 지하 6층까지'], ratings: 23,
    stats: {
      avgReverse: 3.2, overallAvgReverse: 1.4, avgRampTurns: 2.5, overallAvgRampTurns: 0.8,
      avgDurationSec: 130, overallAvgDurationSec: 65, congestionLabel: '평일 오후',
      floorCongestion: [
        { floor: 'B1', occupancy: 1.0 }, { floor: 'B2', occupancy: 0.9 }, { floor: 'B3', occupancy: 0.6 },
        { floor: 'B4', occupancy: 0.4 }, { floor: 'B5', occupancy: 0.3 }, { floor: 'B6', occupancy: 0.2 },
      ],
      congestionSummary: 'B1 만차 · B3부터 여유', hourlyHeat: SEED_HEAT, hourLabels: HOUR_LABELS,
    },
  },
  {
    id: 'avenue-france-pangyo', name: '아브뉴프랑 판교 주차장', lat: 37.3943, lng: 127.1112, d: 1.8, n: 87,
    tags: ['FLAT', 'SPACIOUS'], manual: ['FLAT'], floors: fl(1, 3), address: '경기 성남시 분당구 판교역로 145',
    zoneDescription: '기둥 색 + 알파벳 A–H · 기둥 번호 01–12', ratings: 31,
    stats: {
      avgReverse: 1.1, overallAvgReverse: 1.4, avgRampTurns: 0.5, overallAvgRampTurns: 0.8,
      avgDurationSec: 50, overallAvgDurationSec: 65, congestionLabel: '평일 오후',
      floorCongestion: [{ floor: 'B1', occupancy: 0.7 }, { floor: 'B2', occupancy: 0.5 }, { floor: 'B3', occupancy: 0.3 }],
      congestionSummary: 'B2부터 여유', hourlyHeat: SEED_HEAT.map((r) => r.map((v) => round2(v * 0.7))), hourLabels: HOUR_LABELS,
    },
  },
  { id: 'alphadom-tower', name: '알파돔타워 주차장', lat: 37.3941, lng: 127.109, d: 2.4, n: 64, tags: ['SPACIOUS'], floors: fl(1, 4), address: '경기 성남시 분당구 판교역로 152', ratings: 12 },
  { id: 'hwarang-park-public', name: '화랑공원 공영주차장', lat: 37.3901, lng: 127.1165, d: 2.9, n: 41, tags: ['FLAT'], floors: ['1F'], address: '경기 성남시 분당구 삼평동', feeText: '30분 1,000원 · 10분마다 300원', ratings: 9 },
  { id: 'baekhyun-5', name: '집 · 백현마을 5단지', lat: 37.3869, lng: 127.1047, d: 1.4, n: 35, tags: ['SPACIOUS'], floors: fl(1, 2), address: '경기 성남시 분당구 백현동', ratings: 4 },
  { id: 'h-square', name: '회사 · H스퀘어', lat: 37.4021, lng: 127.1083, d: 3.1, n: 58, tags: ['NARROW_AISLE'], manual: ['NARROW_AISLE'], floors: fl(1, 4), address: '경기 성남시 분당구 판교역로 235', ratings: 15 },
  {
    id: 'pangyo-new', name: '판교 테크원 주차장', lat: 37.4005, lng: 127.111, d: null, n: 3, tags: [], floors: fl(1, 4),
    address: '경기 성남시 분당구 분당내곡로 131', publicInfo: ['기계식 아님 · 지하 4층까지', '주차면 [수] 면'], ratings: 0, stats: null,
  },
]

/** W-01 지도용 수도권 시연 주차장. 이름은 지역 + 시설 종류(판교 3곳은 W-01 시안 순위와 같은 이름) */
export const METRO_DEMO: LotDef[] = [
  { id: 'uspace-pangyo', name: '유스페이스 판교', lat: 37.4009, lng: 127.1072, d: 4.1, n: 96, tags: ['NARROW_AISLE', 'FREQUENT_REVERSE'], floors: fl(1, 5), address: '경기 성남시 분당구 대왕판교로 660' },
  { id: 'pangyo-seven-venture', name: '판교세븐벤처밸리', lat: 37.4046, lng: 127.1052, d: 3.6, n: 52, tags: ['MANY_FLOORS', 'STEEP_SLOPE'], floors: fl(1, 6), address: '경기 성남시 수정구 시흥동' },
  { id: 'botdeul-shops', name: '봇들마을 상가', lat: 37.3888, lng: 127.1135, d: 3.4, n: 33, tags: ['NARROW_AISLE'], floors: fl(1, 2), address: '경기 성남시 분당구 삼평동' },
  { id: 'seohyeon-dept', name: '서현역 백화점 지하주차장', lat: 37.385, lng: 127.1233, d: 3.9, n: 128, tags: ['SPIRAL_RAMP', 'MANY_PILLARS'], floors: fl(1, 5), address: '경기 성남시 분당구 서현동' },
  { id: 'jeongja-cafe-street', name: '정자동 카페거리 공영주차장', lat: 37.366, lng: 127.1078, d: 3.2, n: 44, tags: ['NARROW_AISLE'], floors: fl(1, 2), address: '경기 성남시 분당구 정자동' },
  { id: 'gangnam-station-public', name: '강남역 공영주차장', lat: 37.4979, lng: 127.0276, d: 3.8, n: 118, tags: ['NARROW_AISLE', 'MANY_PILLARS'], floors: fl(1, 4), address: '서울 강남구 역삼동', feeText: '5분 400원' },
  { id: 'samseong-complex', name: '삼성동 복합몰 지하주차장', lat: 37.5115, lng: 127.0595, d: 3.9, n: 205, tags: ['MANY_FLOORS', 'SPIRAL_RAMP'], floors: fl(1, 6), address: '서울 강남구 삼성동' },
  { id: 'jamsil-mall', name: '잠실 쇼핑몰 지하주차장', lat: 37.5133, lng: 127.1028, d: 4.0, n: 231, tags: ['SPIRAL_RAMP', 'MANY_FLOORS', 'FREQUENT_REVERSE'], floors: fl(1, 6), address: '서울 송파구 신천동' },
  { id: 'munjeong-outlet', name: '문정동 아울렛 주차장', lat: 37.4855, lng: 127.1226, d: 3.0, n: 112, tags: ['MANY_FLOORS'], floors: fl(1, 5), address: '서울 송파구 문정동' },
  { id: 'suseo-station', name: '수서역 환승주차장', lat: 37.4874, lng: 127.1015, d: 2.7, n: 91, tags: ['SPACIOUS'], floors: fl(1, 3), address: '서울 강남구 수서동' },
  { id: 'yangjae-forest-public', name: '양재 시민의숲 공영주차장', lat: 37.4699, lng: 127.0365, d: 1.9, n: 73, tags: ['FLAT', 'SPACIOUS'], floors: ['1F'], address: '서울 서초구 양재동' },
  { id: 'sadang-public', name: '사당역 공영주차장', lat: 37.4766, lng: 126.9816, d: 3.1, n: 57, tags: ['NARROW_AISLE'], floors: fl(1, 3), address: '서울 동작구 사당동' },
  { id: 'yeouido-mall', name: '여의도 복합몰 지하주차장', lat: 37.5251, lng: 126.9255, d: 3.9, n: 176, tags: ['SPIRAL_RAMP', 'MANY_PILLARS'], floors: fl(1, 5), address: '서울 영등포구 여의도동' },
  { id: 'yeouido-park-public', name: '여의도공원 공영주차장', lat: 37.5243, lng: 126.9195, d: 2.1, n: 64, tags: ['FLAT', 'SPACIOUS'], floors: ['1F'], address: '서울 영등포구 여의도동' },
  { id: 'yeongdeungpo-tower', name: '영등포 쇼핑몰 주차타워', lat: 37.517, lng: 126.9033, d: 3.9, n: 143, tags: ['MECHANICAL', 'SPIRAL_RAMP'], floors: fl(7, 0), address: '서울 영등포구 영등포동' },
  { id: 'guro-digital', name: '구로디지털단지 지식산업센터', lat: 37.4852, lng: 126.897, d: 3.3, n: 62, tags: ['STEEP_SLOPE'], floors: fl(1, 4), address: '서울 구로구 구로동' },
  { id: 'mokdong-dept', name: '목동 백화점 지하주차장', lat: 37.5266, lng: 126.875, d: 3.6, n: 133, tags: ['MANY_FLOORS'], floors: fl(1, 6), address: '서울 양천구 목동' },
  { id: 'gimpo-airport', name: '김포공항 주차장', lat: 37.5622, lng: 126.801, d: 2.2, n: 210, tags: ['SPACIOUS', 'FLAT'], floors: fl(3, 1), address: '서울 강서구 공항동' },
  { id: 'sangam-stadium', name: '상암 경기장 주차장', lat: 37.5683, lng: 126.8972, d: 1.6, n: 98, tags: ['FLAT', 'SPACIOUS'], floors: ['1F'], address: '서울 마포구 성산동' },
  { id: 'hongdae-public', name: '홍대입구 공영주차장', lat: 37.5572, lng: 126.9245, d: 3.8, n: 84, tags: ['NARROW_AISLE', 'FREQUENT_REVERSE'], floors: fl(1, 3), address: '서울 마포구 동교동' },
  { id: 'seoul-station-transfer', name: '서울역 환승주차장', lat: 37.5547, lng: 126.9707, d: 3.2, n: 88, tags: ['NARROW_AISLE'], floors: fl(1, 3), address: '서울 용산구 동자동' },
  { id: 'myeongdong-tower', name: '명동 기계식 주차타워', lat: 37.5636, lng: 126.985, d: 4.0, n: 47, tags: ['MECHANICAL', 'NARROW_AISLE'], floors: fl(8, 0), address: '서울 중구 명동', publicInfo: ['기계식 · 중형 SUV까지'] },
  { id: 'gwanghwamun-public', name: '광화문 지하 공영주차장', lat: 37.572, lng: 126.9769, d: 3.0, n: 95, tags: ['MANY_PILLARS'], floors: fl(0, 3), address: '서울 종로구 세종로' },
  { id: 'jongno-public', name: '종로 공영주차장', lat: 37.5704, lng: 126.9921, d: 3.5, n: 71, tags: ['MANY_PILLARS', 'STEEP_SLOPE'], floors: fl(1, 3), address: '서울 종로구 종로3가' },
  { id: 'dongdaemun-public', name: '동대문 공영주차장', lat: 37.5665, lng: 127.0092, d: 3.7, n: 102, tags: ['SPIRAL_RAMP'], floors: fl(1, 4), address: '서울 중구 을지로7가' },
  { id: 'seongsu-mart', name: '성수 대형마트 주차장', lat: 37.5446, lng: 127.0557, d: 2.6, n: 156, tags: ['SPACIOUS'], floors: fl(3, 1), address: '서울 성동구 성수동2가' },
  { id: 'konkuk-mall', name: '건대입구 쇼핑몰 주차장', lat: 37.5403, lng: 127.0703, d: 3.9, n: 121, tags: ['SPIRAL_RAMP', 'NARROW_AISLE'], floors: fl(1, 5), address: '서울 광진구 자양동' },
  { id: 'nowon-dept', name: '노원역 백화점 지하주차장', lat: 37.6553, lng: 127.0613, d: 3.8, n: 79, tags: ['SPIRAL_RAMP'], floors: fl(1, 5), address: '서울 노원구 상계동' },
  { id: 'uijeongbu-station', name: '의정부역 공영주차장', lat: 37.7385, lng: 127.0459, d: 2.9, n: 39, tags: ['FLAT'], floors: fl(2, 0), address: '경기 의정부시 의정부동' },
  { id: 'guri-market', name: '구리 농수산물시장 주차장', lat: 37.604, lng: 127.143, d: 2.8, n: 66, tags: ['FLAT'], floors: ['1F'], address: '경기 구리시 인창동' },
  { id: 'hanam-mall', name: '하남 대형 쇼핑몰 주차장', lat: 37.5453, lng: 127.2237, d: 2.3, n: 248, tags: ['SPACIOUS', 'FLAT'], floors: fl(1, 3), address: '경기 하남시 신장동' },
  { id: 'ilsan-lake-park', name: '일산 호수공원 주차장', lat: 37.6584, lng: 126.7697, d: 1.5, n: 104, tags: ['FLAT', 'SPACIOUS'], floors: ['1F'], address: '경기 고양시 일산동구 장항동' },
  { id: 'goyang-mall', name: '고양 대형 쇼핑몰 주차장', lat: 37.6471, lng: 126.8949, d: 2.5, n: 187, tags: ['SPACIOUS'], floors: fl(1, 3), address: '경기 고양시 덕양구 동산동' },
  { id: 'bucheon-dept', name: '부천 중동 백화점 주차장', lat: 37.5047, lng: 126.7632, d: 3.7, n: 94, tags: ['SPIRAL_RAMP', 'MANY_PILLARS'], floors: fl(1, 5), address: '경기 부천시 중동' },
  { id: 'bupyeong-underground', name: '부평역 지하상가 주차장', lat: 37.4895, lng: 126.724, d: 3.9, n: 69, tags: ['NARROW_AISLE', 'MANY_PILLARS', 'STEEP_SLOPE'], floors: fl(0, 3), address: '인천 부평구 부평동' },
  { id: 'songdo-park-public', name: '송도 센트럴파크 공영주차장', lat: 37.3925, lng: 126.639, d: 1.7, n: 81, tags: ['FLAT', 'SPACIOUS'], floors: fl(1, 1), address: '인천 연수구 송도동' },
  { id: 'gwangmyeong-warehouse', name: '광명 창고형 매장 주차장', lat: 37.4239, lng: 126.8829, d: 2.0, n: 166, tags: ['SPACIOUS'], floors: fl(3, 0), address: '경기 광명시 일직동' },
  { id: 'beomgye-public', name: '안양 범계역 공영주차장', lat: 37.3897, lng: 126.9507, d: 3.4, n: 58, tags: ['NARROW_AISLE'], floors: fl(1, 3), address: '경기 안양시 동안구 호계동' },
  { id: 'suwon-station-mall', name: '수원역 쇼핑몰 주차장', lat: 37.2656, lng: 127.0001, d: 3.5, n: 140, tags: ['MANY_FLOORS', 'SPIRAL_RAMP'], floors: fl(1, 5), address: '경기 수원시 팔달구 매산로' },
  { id: 'hwaseong-haenggung-public', name: '수원 화성행궁 공영주차장', lat: 37.2828, lng: 127.0146, d: 2.4, n: 52, tags: ['FLAT'], floors: ['1F'], address: '경기 수원시 팔달구 남창동' },
  { id: 'gwanggyo-lake-park', name: '광교 호수공원 주차장', lat: 37.2836, lng: 127.066, d: 1.8, n: 77, tags: ['FLAT', 'SPACIOUS'], floors: ['1F'], address: '경기 수원시 영통구 하동' },
  { id: 'suji-new-shops', name: '용인 수지 신축 상가 주차장', lat: 37.3221, lng: 127.0952, d: null, n: 6, tags: [], floors: fl(1, 3), address: '경기 용인시 수지구 성복동', publicInfo: ['기계식 아님 · 지하 3층까지'] },
]

// ───────────── 통계 만들기 ─────────────

export function summarizeCongestion(fc: FloorCongestion[]): string {
  if (!fc.length) return '아직 기록이 적어요'
  const full = fc.filter((f) => f.occupancy >= 0.95).map((f) => f.floor)
  const roomy = fc.find((f) => f.occupancy < 0.7)
  const parts: string[] = []
  if (full.length) parts.push(`${full.join('·')} 만차`)
  if (roomy && roomy !== fc[0]) parts.push(`${roomy.floor}부터 여유`)
  else if (roomy) parts.push('전 층 여유')
  return parts.join(' · ') || '전 층 붐빔'
}

function deriveStats(def: LotDef, r: Rnd): LotStats {
  const d = def.d ?? 3
  const has = (t: ReasonTag) => def.tags.includes(t)
  const avgReverse = round1(clamp(0.35 + 0.62 * (d - 1) + (has('FREQUENT_REVERSE') ? 0.4 : 0) + gauss(r) * 0.15, 0.2, 6))
  const below = def.floors.filter((f) => f.startsWith('B')).length
  const above = def.floors.filter((f) => /F$/.test(f)).length
  const ramp = has('SPIRAL_RAMP') || has('MECHANICAL')
    ? 1.5 + 0.35 * Math.max(0, d - 3) + r() * 0.5
    : Math.max(0, (below + Math.max(0, above - 1)) * 0.22 + gauss(r) * 0.1)
  const avgDurationSec = Math.round(clamp(32 + 23 * (d - 1) + gauss(r) * 6, 25, 400))
  const levels = def.floors.filter((f) => f.startsWith('B')).length ? def.floors.filter((f) => f.startsWith('B')) : def.floors
  const start = clamp(0.75 + d * 0.06 + r() * 0.1, 0.5, 1)
  const floorCongestion = levels.slice(0, 6).map((floor, i) => ({
    floor,
    occupancy: round1(clamp(start - i * (0.18 + r() * 0.08), 0.1, 1)),
  }))
  const scale = 0.75 + r() * 0.25
  const raw = SEED_HEAT.map((row) => row.map((v) => clamp(v * scale + gauss(r) * 0.06, 0.05, 1)))
  const max = Math.max(...raw.flat())
  return {
    avgReverse,
    overallAvgReverse: OVERALL.reverse,
    avgRampTurns: round1(ramp),
    overallAvgRampTurns: OVERALL.ramp,
    avgDurationSec,
    overallAvgDurationSec: OVERALL.duration,
    congestionLabel: '평일 오후',
    floorCongestion,
    congestionSummary: summarizeCongestion(floorCongestion),
    hourlyHeat: raw.map((row) => row.map((v) => round2(v / max))),
    hourLabels: HOUR_LABELS,
  }
}

/** docs/api.md 자동 태그 규칙 + 운영자 태그(먼저), 최대 3개 */
export function mergeTags(lot: Pick<AdminLot, 'manualTags' | 'stats' | 'floors'>, fallback: ReasonTag[] = []): ReasonTag[] {
  const auto: ReasonTag[] = []
  const s = lot.stats
  if (s) {
    if (s.avgReverse >= 2.5) auto.push('FREQUENT_REVERSE')
    if (s.avgRampTurns >= 1.5) auto.push('SPIRAL_RAMP')
    if (s.avgReverse <= 1 && s.avgDurationSec <= 60) auto.push('SPACIOUS')
  }
  if (lot.floors.length >= 5) auto.push('MANY_FLOORS')
  const out: ReasonTag[] = []
  for (const t of [...lot.manualTags, ...fallback, ...auto]) {
    if (!out.includes(t)) out.push(t)
    if (out.length === 3) break
  }
  return out
}

export function statChipsFor(stats: LotStats | null): string[] {
  return stats && stats.avgReverse >= 2 ? [`평균 후진 ${formatCount(stats.avgReverse)}회`] : []
}

// ───────────── 기록 만들기 ─────────────

const DAY = 86_400_000
const KST = 9 * 3_600_000
/** epoch ms → 한국 날짜 번호 / 요일(월=1) */
const kstDay = (ms: number) => Math.floor((ms + KST) / DAY)
const weekdayOfDay = (day: number) => ((day + 3) % 7) + 1

const HOUR_WEIGHTS = [1, 0.5, 0.3, 0.2, 0.2, 0.4, 1, 2.5, 4, 4, 5, 7, 9, 8, 7, 7, 8, 10, 11, 9, 7, 5, 3, 2]
const WEEKDAY_WEIGHTS = [0.85, 0.8, 0.85, 0.9, 1.1, 1.45, 1.3]
const SHAPES: [ParkingShape, number][] = [['PERPENDICULAR', 85], ['PARALLEL', 8], ['ANGLED', 5], ['UNKNOWN', 2]]
const CLASSES: [VehicleClass, number][] = [['MIDSIZE', 35], ['SUV', 30], ['COMPACT', 15], ['LARGE', 15], ['UNKNOWN', 5]]
const EXPERIENCE: [DrivingExperience, number][] = [['OVER_10Y', 35], ['Y3_10', 30], ['Y1_3', 18], ['UNDER_1Y', 12], ['UNKNOWN', 5]]

interface RawRecord extends Omit<AdminRecordRow, 'id'> { t: number }

function makeRecord(lot: AdminLot, r: Rnd, t: number, demo: boolean, stats: LotStats | null, d: number): RawRecord {
  const avgRev = stats?.avgReverse ?? 0.4 + 0.6 * (d - 1)
  const avgRamp = stats?.avgRampTurns ?? 0.5
  const avgDur = stats?.avgDurationSec ?? 40 + 20 * (d - 1)
  const floorPool = lot.floors.filter((f) => f.startsWith('B'))
  const floors = floorPool.length ? floorPool : lot.floors
  const fi = Math.min(floors.length - 1, Math.floor(Math.pow(r(), 1.6) * floors.length))
  const reverseCount = Math.max(0, Math.round(avgRev + gauss(r) * 0.9))
  return {
    t,
    lotId: lot.id,
    lotName: lot.name,
    floor: r() < 0.06 ? null : floors[fi] ?? null,
    reverseCount,
    steeringTurns: Math.max(0, Math.round(1.5 + reverseCount * 1.3 + gauss(r) * 1.2)),
    durationSec: Math.round(clamp(avgDur + gauss(r) * avgDur * 0.28, 12, 900)),
    rampTurns: round1(clamp(avgRamp + gauss(r) * 0.4, 0, 8)),
    shape: pick(r, SHAPES),
    vehicleClass: pick(r, CLASSES),
    experience: pick(r, EXPERIENCE),
    parkedHour: new Date(t + KST).getUTCHours(),
    parkedWeekday: weekdayOfDay(kstDay(t)),
    demo,
    receivedAt: new Date(t).toISOString(),
  }
}

/** now 이전 [fromDays, toDays) 사이 아무 날의, 시간대 분포를 따르는 시각 */
function randomTime(r: Rnd, now: number, fromDays: number, toDays: number): number {
  for (let tries = 0; tries < 20; tries++) {
    const day = kstDay(now) - Math.floor(fromDays + r() * (toDays - fromDays))
    if (r() * 1.45 > WEEKDAY_WEIGHTS[weekdayOfDay(day) - 1]) continue
    const hour = pick(r, HOUR_WEIGHTS.map((w, h) => [h, w] as const))
    const t = day * DAY - KST + hour * 3_600_000 + Math.floor(r() * 60) * 60_000
    if (t < now - 60_000) return t
  }
  return now - Math.floor((fromDays + r() * (toDays - fromDays)) * DAY)
}

/** v1.1 유형 (대시보드 D-03 필터). 판교 대시보드 9곳은 시안 표와 같게, 나머지는 이름으로 어림 */
const CATEGORY_BY_ID: Record<string, LotCategory> = {
  'hyundai-pangyo': 'DEPARTMENT', 'uspace-pangyo': 'OFFICE', 'h-square': 'OFFICE', 'pangyo-seven-venture': 'OFFICE',
  'botdeul-shops': 'MALL', 'hwarang-park-public': 'PUBLIC', 'alphadom-tower': 'OFFICE', 'avenue-france-pangyo': 'MALL',
  'baekhyun-5': 'APARTMENT', 'pangyo-new': 'OFFICE',
}

export function guessCategory(id: string, name: string): LotCategory {
  if (CATEGORY_BY_ID[id]) return CATEGORY_BY_ID[id]
  if (/백화점/.test(name)) return 'DEPARTMENT'
  if (/공영|환승|공원|경기장|공항/.test(name)) return 'PUBLIC'
  if (/아파트|마을|단지/.test(name)) return 'APARTMENT'
  if (/지식산업|오피스|타워|센터/.test(name)) return 'OFFICE'
  if (/몰|아울렛|상가|마트|매장|시장/.test(name)) return 'MALL'
  return 'OTHER'
}

/** v1.1 지역 id: 판교(분당 삼평·백현·판교 일대) · 서울 · 인천 · 경기 */
export function guessRegion(lat: number, lng: number, address: string | undefined): string {
  if (lat > 37.383 && lat < 37.407 && lng > 127.099 && lng < 127.126) return 'pangyo'
  if (address?.startsWith('서울')) return 'seoul'
  if (address?.startsWith('인천')) return 'incheon'
  return 'gyeonggi'
}

function buildLot(def: LotDef, r: Rnd, now: number, demo: boolean): AdminLot {
  const stats = def.stats === undefined ? (def.d == null ? null : deriveStats(def, r)) : def.stats
  const createdAt = new Date(now - (14 + Math.floor(r() * 3)) * DAY).toISOString()
  const lot: AdminLotV11 = {
    id: def.id,
    name: def.name,
    location: { lat: def.lat, lng: def.lng },
    address: def.address ?? null,
    difficulty: def.d,
    tags: def.tags.slice(0, 3),
    statChips: statChipsFor(stats),
    sampleCount: def.n,
    ratingCount: def.ratings ?? (def.d == null ? 0 : 3 + Math.floor(r() * 40)),
    aliases: [],
    pitch: null,
    suggestible: true,
    floors: def.floors,
    zoneScheme: { zones: [...DEFAULT_ZONES], numbers: [...DEFAULT_NUMBERS], description: def.zoneDescription ?? null },
    publicInfo: def.publicInfo ?? [],
    feeText: def.feeText ?? null,
    updatedAt: new Date(now - (1 + Math.floor(r() * 20)) * 3_600_000).toISOString(),
    stats,
    manualTags: def.manual ?? [],
    scoreSampleCount: 0,
    demo,
    createdAt,
    category: guessCategory(def.id, def.name),
    region: guessRegion(def.lat, def.lng, def.address),
    shortName: def.name.replace(/\s*주차장$/, ''),
    rampKind: (stats?.avgRampTurns ?? 0) >= 1 ? 'SPIRAL' : def.floors && def.floors.length > 1 ? 'STRAIGHT' : 'NONE',
  }
  return lot
}

/** 실제 기록(demo=false): 차량 앱에서 개발 중 보낸 것처럼 최근 하루 안 */
const REAL_RECORDS: { lotId: string; minutesAgo: number; floor: string; reverse: number; steer: number; sec: number; ramp: number }[] = [
  { lotId: 'hyundai-pangyo', minutesAgo: 4, floor: 'B2', reverse: 2, steer: 3, sec: 100, ramp: 2.1 },
  { lotId: 'avenue-france-pangyo', minutesAgo: 52, floor: 'B2', reverse: 1, steer: 2, sec: 48, ramp: 0.6 },
  { lotId: 'h-square', minutesAgo: 9 * 60 + 12, floor: 'B3', reverse: 2, steer: 4, sec: 95, ramp: 1.1 },
  { lotId: 'baekhyun-5', minutesAgo: 22 * 60 + 40, floor: 'B1', reverse: 0, steer: 1, sec: 38, ramp: 0.4 },
  { lotId: 'hyundai-pangyo', minutesAgo: 26 * 60 + 5, floor: 'B3', reverse: 3, steer: 5, sec: 142, ramp: 2.6 },
]

export function createMockDb(now: number = Date.now(), seed = 20261103): MockDb {
  const r = mulberry32(seed)
  const lots = [
    ...PANGYO_SEED.map((d) => buildLot(d, r, now, true)),
    ...METRO_DEMO.map((d) => buildLot(d, r, now, true)),
  ]
  const raw: RawRecord[] = []
  for (const lot of lots) {
    const d = lot.difficulty ?? 3
    const n30 = lot.sampleCount
    const n90 = lot.difficulty == null ? n30 : Math.round(n30 * (2 + r() * 0.6))
    for (let i = 0; i < n90; i++) {
      const t = i < n30 ? randomTime(r, now, 0, 30) : randomTime(r, now, 31, 90)
      raw.push(makeRecord(lot, r, t, true, lot.stats, d))
    }
    lot.scoreSampleCount = n90
  }
  for (const rr of REAL_RECORDS) {
    const lot = lots.find((l) => l.id === rr.lotId)
    if (!lot) continue
    const rec = makeRecord(lot, r, now - rr.minutesAgo * 60_000, false, lot.stats, lot.difficulty ?? 3)
    raw.push({ ...rec, floor: rr.floor, reverseCount: rr.reverse, steeringTurns: rr.steer, durationSec: rr.sec, rampTurns: rr.ramp, shape: 'PERPENDICULAR', vehicleClass: 'MIDSIZE', experience: 'Y3_10' })
  }
  raw.sort((a, b) => a.t - b.t)
  const records: AdminRecordRow[] = raw.map((rec, i) => {
    const { t, ...rest } = rec
    void t
    return { id: i + 1, ...rest }
  })
  return { now, lots, records, shares: 37, nextRecordId: records.length + 1 }
}
