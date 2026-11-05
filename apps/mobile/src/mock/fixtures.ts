/**
 * 시연 데이터 — 시안(M-01~M-40)과 같은 값. 장소 이름은 실제 판교 장소, 점수·통계는 시연용 예시.
 * 서버 시드(apps/server, docs/api.md "시드 데이터")·차량 앱 SeedLots와 같은 id·이름·좌표.
 * 시각은 모두 '지금' 기준 상대값이라 언제 열어도 "2시간 전", "오늘" 처럼 보인다.
 */
import type {
  LotStats,
  MyParking,
  MyStatsResponse,
  PairedCar,
  ParkingLotDetail,
  ReasonTag,
  SharePayload,
  LotCategory,
} from '@api-types'
import { countReverses, forwardPath, oneReversePath, threeReversePath, twoReversePath } from './pathgen'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

const iso = (ms: number) => new Date(ms).toISOString()

const HOURS = ['10시', '12시', '14시', '16시', '18시', '20시']
const HEAT = [
  [0.2, 0.3, 0.5, 0.7, 0.6, 0.4],
  [0.2, 0.3, 0.5, 0.6, 0.6, 0.4],
  [0.2, 0.3, 0.4, 0.6, 0.7, 0.5],
  [0.2, 0.3, 0.5, 0.7, 0.7, 0.5],
  [0.3, 0.4, 0.6, 0.8, 0.9, 0.7],
  [0.4, 0.6, 0.9, 1.0, 0.9, 0.7],
  [0.4, 0.6, 0.8, 0.9, 0.8, 0.5],
]

function stats(o: Partial<LotStats> & Pick<LotStats, 'avgReverse' | 'avgRampTurns' | 'avgDurationSec' | 'floorCongestion'>): LotStats {
  return {
    overallAvgReverse: 1.4,
    overallAvgRampTurns: 0.8,
    overallAvgDurationSec: 65,
    congestionLabel: '주말 오후',
    congestionSummary: '',
    hourlyHeat: HEAT,
    hourLabels: HOURS,
    ...o,
  }
}

interface LotSeed {
  id: string
  name: string
  lat: number
  lng: number
  d: number | null
  n: number
  tags: ReasonTag[]
  floors: string[]
  address?: string
  feeText?: string
  publicInfo?: string[]
  chips?: string[]
  stats?: LotStats | null
}

const fl = (above: number, below: number) => [
  ...Array.from({ length: above }, (_, i) => `${above - i}F`),
  ...Array.from({ length: below }, (_, i) => `B${i + 1}`),
]

const SEEDS: LotSeed[] = [
  {
    id: 'hyundai-pangyo', name: '현대백화점 판교점 지하주차장', lat: 37.3926, lng: 127.1121, d: 4.3, n: 142,
    tags: ['SPIRAL_RAMP', 'MANY_PILLARS', 'FREQUENT_REVERSE'], chips: ['평균 후진 3.2회'], floors: fl(1, 6),
    address: '경기 성남시 분당구 판교역로146번길 20', feeText: '구매 고객 3시간 무료',
    stats: stats({
      avgReverse: 3.2, avgRampTurns: 2.5, avgDurationSec: 130,
      floorCongestion: [
        { floor: 'B1', occupancy: 1.0 },
        { floor: 'B2', occupancy: 0.92 },
        { floor: 'B3', occupancy: 0.6 },
        { floor: 'B4', occupancy: 0.35 },
      ],
      congestionSummary: 'B1 만차 · B3부터 여유',
    }),
  },
  {
    id: 'avenue-france-pangyo', name: '아브뉴프랑 판교 주차장', lat: 37.3943, lng: 127.1112, d: 1.8, n: 87,
    tags: ['FLAT', 'SPACIOUS'], floors: fl(1, 3), address: '경기 성남시 분당구 동판교로 226',
    stats: stats({
      avgReverse: 1.1, avgRampTurns: 0.5, avgDurationSec: 50,
      floorCongestion: [
        { floor: 'B1', occupancy: 0.7 },
        { floor: 'B2', occupancy: 0.5 },
        { floor: 'B3', occupancy: 0.3 },
      ],
      congestionSummary: 'B2부터 여유',
    }),
  },
  {
    id: 'alphadom-tower', name: '알파돔타워 주차장', lat: 37.3941, lng: 127.109, d: 2.4, n: 64,
    tags: ['SPACIOUS'], floors: fl(1, 4), address: '경기 성남시 분당구 판교역로 152',
    stats: stats({
      avgReverse: 1.5, avgRampTurns: 1.0, avgDurationSec: 62,
      floorCongestion: [
        { floor: 'B1', occupancy: 0.88 },
        { floor: 'B2', occupancy: 0.64 },
        { floor: 'B3', occupancy: 0.42 },
        { floor: 'B4', occupancy: 0.2 },
      ],
      congestionSummary: 'B2부터 여유',
    }),
  },
  {
    id: 'hwarang-park-public', name: '화랑공원 공영주차장', lat: 37.3901, lng: 127.1165, d: 2.9, n: 41,
    tags: ['FLAT'], floors: ['1F'], address: '경기 성남시 분당구 삼평동', feeText: '30분 1,000원 · 10분마다 300원',
    stats: stats({ avgReverse: 1.9, avgRampTurns: 0, avgDurationSec: 70, floorCongestion: [{ floor: '1F', occupancy: 0.78 }], congestionSummary: '1F 여유' }),
  },
  {
    id: 'h-square', name: 'H스퀘어 주차장', lat: 37.4021, lng: 127.1083, d: 3.1, n: 58,
    tags: ['NARROW_AISLE'], floors: fl(1, 4), address: '경기 성남시 분당구 판교역로 235',
    stats: stats({
      avgReverse: 2.2, avgRampTurns: 1.2, avgDurationSec: 88, congestionLabel: '평일 오전',
      floorCongestion: [
        { floor: 'B1', occupancy: 0.98 },
        { floor: 'B2', occupancy: 0.9 },
        { floor: 'B3', occupancy: 0.55 },
        { floor: 'B4', occupancy: 0.3 },
      ],
      congestionSummary: 'B1 만차 · B3부터 여유',
    }),
  },
  {
    id: 'baekhyun-5', name: '백현마을 5단지 주차장', lat: 37.3869, lng: 127.1047, d: 1.6, n: 35,
    tags: ['SPACIOUS'], floors: fl(1, 2), address: '경기 성남시 분당구 백현동',
    stats: stats({
      avgReverse: 0.8, avgRampTurns: 0.4, avgDurationSec: 40, congestionLabel: '평일 저녁',
      floorCongestion: [
        { floor: 'B1', occupancy: 0.9 },
        { floor: 'B2', occupancy: 0.6 },
      ],
      congestionSummary: 'B2 여유',
    }),
  },
  {
    id: 'youspace', name: '유스페이스 주차장', lat: 37.4008, lng: 127.1098, d: 3.3, n: 49,
    tags: ['MANY_PILLARS'], chips: ['평균 후진 2.4회'], floors: fl(1, 5), address: '경기 성남시 분당구 대왕판교로 660',
    stats: stats({
      avgReverse: 2.4, avgRampTurns: 1.6, avgDurationSec: 96,
      floorCongestion: [
        { floor: 'B1', occupancy: 0.95 },
        { floor: 'B2', occupancy: 0.8 },
        { floor: 'B3', occupancy: 0.5 },
      ],
      congestionSummary: 'B3부터 여유',
    }),
  },
  {
    id: 'botdeul-shops', name: '봇들마을 상가 주차장', lat: 37.3888, lng: 127.1135, d: 3.4, n: 33,
    tags: ['NARROW_AISLE'], chips: ['평균 후진 2.6회'], floors: fl(1, 2), address: '경기 성남시 분당구 삼평동',
    stats: stats({ avgReverse: 2.6, avgRampTurns: 0.9, avgDurationSec: 101, floorCongestion: [{ floor: 'B1', occupancy: 0.9 }, { floor: 'B2', occupancy: 0.7 }] }),
  },
  {
    id: 'pangyo-seven-venture', name: '판교세븐벤처밸리 주차장', lat: 37.4046, lng: 127.1052, d: 3.6, n: 52,
    tags: ['MANY_FLOORS', 'STEEP_SLOPE'], chips: ['평균 후진 2.7회'], floors: fl(1, 6), address: '경기 성남시 수정구 시흥동',
    stats: stats({ avgReverse: 2.7, avgRampTurns: 2.1, avgDurationSec: 118, floorCongestion: [{ floor: 'B1', occupancy: 0.97 }, { floor: 'B2', occupancy: 0.86 }, { floor: 'B3', occupancy: 0.6 }] }),
  },
  {
    id: 'pangyo-new', name: '판교 테크원 주차장', lat: 37.4005, lng: 127.111, d: null, n: 3,
    tags: [], floors: fl(1, 4), address: '경기 성남시 분당구 분당내곡로 131',
    publicInfo: ['기계식 아님 · 지하 4층까지', '주차면 612면'], stats: null,
  },
]

/** v1.1 주차장 유형 (D-03 유형 칸과 같게) */
const CATEGORY: Record<string, LotCategory> = {
  'hyundai-pangyo': 'DEPARTMENT', 'avenue-france-pangyo': 'MALL', 'botdeul-mall': 'MALL',
  'alphadom-tower': 'OFFICE', 'h-square': 'OFFICE', 'u-space-pangyo': 'OFFICE', 'pangyo-seven-venture': 'OFFICE',
  // 시연 목록의 id (서버 시드 id 와 다름) — 없으면 유형이 '기타'로 나왔다
  youspace: 'OFFICE', 'botdeul-shops': 'MALL',
  'hwarang-park-public': 'PUBLIC', 'baekhyun-5': 'APARTMENT',
}

export function lotFixtures(now: number): ParkingLotDetail[] {
  return SEEDS.map((s) => ({
    id: s.id,
    name: s.name,
    location: { lat: s.lat, lng: s.lng },
    address: s.address ?? null,
    difficulty: s.d,
    tags: s.tags,
    statChips: s.chips ?? [],
    category: CATEGORY[s.id] ?? 'OTHER',
    region: 'pangyo',
    sampleCount: s.n,
    ratingCount: Math.round(s.n / 9),
    floors: s.floors,
    zoneScheme: { zones: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], numbers: Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')), description: null },
    publicInfo: s.publicInfo ?? [],
    feeText: s.feeText ?? null,
    updatedAt: iso(now - 3 * HOUR),
    stats: s.stats ?? null,
  }))
}

export const DEMO_CAR: Omit<PairedCar, 'pairedAt'> = { deviceId: 'car-demo-ioniq', name: '아이오닉 5' }
export const DEMO_TOKEN = 'demo-phone-token'
export const DEMO_PAIR_CODE = '483920'

interface RecordSeed {
  id: string
  lotId: string
  lotName: string
  floor: string
  zone: string
  number: string
  note: string | null
  agoMs: number
  durationSec: number
  rampTurns: number
  steeringTurns: number
  path: (startMs: number) => MyParking['path']
  hints: string[]
  route: number[] | null
}

const RECORDS: RecordSeed[] = [
  {
    id: '6f1d2a90-3c1e-4b8a-9d7e-0a5b3c2e1f07', lotId: 'avenue-france-pangyo', lotName: '아브뉴프랑 판교 주차장',
    floor: 'B2', zone: 'D', number: '07', note: '엘리베이터 2번 쪽', agoMs: 130 * MIN, durationSec: 100, rampTurns: 2, steeringTurns: 3,
    path: twoReversePath, hints: ['B2에서 내리기', 'D 구역 쪽으로 곧장', 'D-07 왼쪽 칸'], route: [0, 24, 1],
  },
  {
    id: '1b7e4c22-8f0a-4d51-a3c9-5e2f6b8d9a11', lotId: 'h-square', lotName: 'H스퀘어 주차장',
    floor: 'B3', zone: 'C', number: '12', note: null, agoMs: 2 * DAY + 4 * HOUR, durationSec: 62, rampTurns: 1.2, steeringTurns: 2,
    path: oneReversePath, hints: ['램프를 다 내려와서 곧장', '약 15m 가서 왼쪽', '오른쪽 칸 줄, 약 20m 지점'], route: [1, 16, 1, 21, -1],
  },
  {
    id: '9c3a5e71-2d4b-4f6c-8e1a-7b9d0c2e4f13', lotId: 'baekhyun-5', lotName: '백현마을 5단지 주차장',
    floor: 'B1', zone: 'A', number: '03', note: '102동 입구 앞', agoMs: 4 * DAY + 9 * HOUR, durationSec: 38, rampTurns: 0.4, steeringTurns: 1,
    path: forwardPath, hints: ['주차장 입구에서 곧장', '왼쪽 칸 줄, 약 15m 지점'], route: [0, 16, 1],
  },
  {
    id: '4e8b1f36-7a2c-4d9e-b5f0-3c6a8d1e2b15', lotId: 'hyundai-pangyo', lotName: '현대백화점 판교점 지하주차장',
    floor: 'B4', zone: 'F', number: '11', note: '식품관 엘리베이터 쪽', agoMs: 6 * DAY + 3 * HOUR, durationSec: 142, rampTurns: 2.6, steeringTurns: 5,
    path: threeReversePath, hints: ['램프를 다 내려와서 곧장', '오른쪽 칸 줄, 약 20m 지점'], route: [1, 22, -1],
  },
  {
    id: '2a6d9b48-5e1f-4c3a-9b7d-8e0f1a2c3d17', lotId: 'alphadom-tower', lotName: '알파돔타워 주차장',
    floor: 'B2', zone: 'B', number: '04', note: null, agoMs: 9 * DAY + 5 * HOUR, durationSec: 55, rampTurns: 1, steeringTurns: 2,
    path: oneReversePath, hints: ['램프를 다 내려와서 곧장', '왼쪽 칸 줄, 약 15m 지점'], route: [1, 16, 1],
  },
  {
    id: '8d2f5a13-9c6e-4b7a-a1d3-6f4e2b8c0a19', lotId: 'baekhyun-5', lotName: '백현마을 5단지 주차장',
    floor: 'B2', zone: 'B', number: '08', note: null, agoMs: 12 * DAY + 10 * HOUR, durationSec: 41, rampTurns: 0.8, steeringTurns: 1,
    path: forwardPath, hints: [], route: null,
  },
]

export function parkingFixtures(now: number): MyParking[] {
  return RECORDS.map((r) => {
    const parked = now - r.agoMs
    const path = r.path(parked - Math.max(30, r.durationSec - 20) * 1000)
    return {
      id: r.id,
      lotId: r.lotId,
      lotName: r.lotName,
      floor: r.floor,
      zone: r.zone,
      number: r.number,
      note: r.note,
      parkedAt: iso(parked),
      summary: {
        reverseCount: countReverses(path),
        steeringTurns: r.steeringTurns,
        durationSec: r.durationSec,
        rampTurns: r.rampTurns,
        shape: 'PERPENDICULAR',
        approximate: false,
      },
      hints: r.hints,
      route: r.route,
      path,
      // 가장 최근 것만 '지금 주차 중'
      foundAt: r.agoMs > DAY ? iso(parked + 3 * HOUR) : null,
      updatedAt: iso(parked + MIN),
    }
  })
}

/** 최근 6개월 'YYYY-MM' (이번 달이 마지막) */
export function lastMonths(now: number, n = 6): string[] {
  const d = new Date(now)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

export function statsFixture(now: number): MyStatsResponse {
  const values = [3.8, 3.1, 2.6, 2.4, 2.0, 1.6]
  return {
    thisMonthAvgReverse: 1.6,
    lastMonthAvgReverse: 2.0,
    monthly: lastMonths(now).map((month, i) => ({ month, avgReverse: values[i] })),
    favorites: [
      { lotId: 'hyundai-pangyo', count: 12 },
      { lotId: 'h-square', count: 9 },
      { lotId: 'baekhyun-5', count: 7 },
    ],
  }
}

/** /s/:code 짧은 링크 (C-07) — 시안 M-01과 같은 값 */
export function shareFixture(now: number): SharePayload {
  return {
    v: 1,
    lot: '아브뉴프랑 판교 주차장',
    f: 'B2',
    z: 'D',
    n: '07',
    t: now - 130 * MIN,
    m: '엘리베이터 2번 쪽',
    h: ['B2에서 내리기', 'D 구역 쪽으로 곧장', 'D-07 왼쪽 칸'],
    r: [0, 24, 1],
  }
}

/** C-03 추천 문구 — 주차장 이야기만, 운전자를 평가하지 않음 */
export function pitchFor(tags: ReasonTag[]): string {
  if (tags.includes('SPACIOUS')) return '훨씬 넓어요'
  if (tags.includes('FLAT')) return '평면이라 편해요'
  return '자리 넉넉해요'
}
