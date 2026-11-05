/**
 * 시연 주차장 (시드 v2 — 대시보드 시안 D-01~D-03 수치).
 * - 판교 9곳: 대시보드 시연 생성기 packages/insights-demo 의 DEMO_LOTS 그대로 (id 는 차량 앱 SeedLots 와 같음) + 테크원(데이터 부족).
 *   180일(30일씩 6칸)에 걸쳐 만들어서 6개월 추이가 나온다.
 * - 수도권 시연 주차장 41곳: 예전 W-01 지도용. 장소 이름은 실제 장소, 점수·대수·통계는 모두 시연용 합성 값
 */
import type { LotCategory, ParkingShape, VehicleClass } from '@parkinggack/api-types'
import { DEMO_LOTS, DEMO_NOW, RAMP_KIND, demoLotInsights, type DemoLotDef } from '../../../../packages/insights-demo/index.ts'
import type { LotInput } from '../store.js'

export type Pattern = 'mall' | 'office' | 'home' | 'park' | 'hospital' | 'transit'

export interface Bucket {
  /** 이 30일 칸의 기록 수 */
  n: number
  /** 이 칸의 평균 후진 (합을 정확히 맞춘다) */
  reverse: number
}

export interface SeedLot {
  lot: LotInput
  /** 30일씩, 오래된 → 최근. 마지막 칸 = 최근 30일 (n = 30일 대수) */
  buckets: Bucket[]
  /** 모든 칸 평균 램프 바퀴 · 평균 시간(초) */
  ramp: number
  duration: number
  /** 목표 점수 (90일 베이지안, 반올림 전). 핸들 꺾은 횟수로 맞춘다 */
  score?: number
  /** 점수 목표를 꼭 맞춰야 하나 (판교 9곳) — 못 맞추면 시드가 실패 */
  strict?: boolean
  /** 평일 오후(13~17시) 층 비율 (floors 순서) — C-08 층별 혼잡 */
  floorWeights?: number[]
  /** 층별 평균 후진 (최근 30일, D-02). 주면 층 비율을 풀어서 주차장 평균이 마지막 칸 reverse 가 되게 한다 (평일 오후 비율은 floorWeights 그대로) */
  floorReverse?: number[]
  /** 층 비율을 풀 때 시작 비율 (없으면 위층부터 많게) */
  floorBase?: number[]
  /** 차 크기 분포 (없으면 기본) */
  vehicles?: Array<[VehicleClass, number]>
  pattern: Pattern
  /** 힘들게 댄 기록 비율 p, 순조로운 기록의 후진 배율 smooth, 시간 배율 smoothDur */
  struggle: { p: number; smooth: number; smoothDur?: number }
  ratings?: { count: number; mean: number }
  shape?: Partial<Record<ParkingShape, number>>
}

const B = (n: number) => Array.from({ length: n }, (_, i) => `B${i + 1}`)
const F = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}F`)

/** 30일 칸별 기록 수 비율 (오래된 → 최근): 사용자가 늘어난 모양 */
export const VOLUME = [0.55, 0.65, 0.75, 0.85, 0.92, 1.0]

/** 6칸 추이 + 30일 대수 → buckets */
function trend(n30: number, reverse: number[]): Bucket[] {
  return reverse.map((r, i) => ({ n: i === reverse.length - 1 ? n30 : Math.round(n30 * VOLUME[i]), reverse: r }))
}

// ───────────── 판교 (region "pangyo") — packages/insights-demo 의 DEMO_LOTS 그대로 ─────────────

/**
 * 판교 9곳은 대시보드 시연 생성기(packages/insights-demo)의 DEMO_LOTS 에서 가져온다 — id·이름·짧은 이름·유형·좌표·층·램프 종류,
 * 난이도·평균 후진·램프·시간·30일 기록 수, 6개월 추이, 층별 평균 후진(demoLotInsights). 어드민 시연 모드와 같은 숫자가 나온다.
 *
 * 서버는 기록에서 다시 계산하므로 두 군데만 다르게 둔다 (생성기는 D-01 합계를 상수로 박아 두었다 — 9곳 값으로 계산하면 2.1·2.1):
 *  - 최근 칸 평균 후진은 표시값보다 0.04 낮게 (반올림하면 같은 값) → 9곳 평균 2.04 → "2.0회"
 *  - 지난 칸(30~60일 전)은 다섯 곳을 0.33~0.4 높게 → 9곳 평균 2.30 → "지난달 2.3회" (C-08 90일 평균이 3.2 로 남게 현대백화점은 그대로)
 * 나머지(추이 첫 네 칸, 좋아진 곳 4곳, 층별 평균 후진, 도면·동선·후진 잦은 곳)는 생성기와 같다.
 */
interface PangyoExtra {
  address: string
  aliases: string[]
  manualTags?: LotInput['manualTags']
  pitch?: string
  suggestible?: boolean
  publicInfo?: string[]
  zoneScheme?: LotInput['zoneScheme']
  /** 평일 오후 층 비율 (C-08 층별 혼잡) */
  floorWeights?: number[]
  pattern: Pattern
  struggle: SeedLot['struggle']
  ratings?: SeedLot['ratings']
  shape?: SeedLot['shape']
  vehicles?: SeedLot['vehicles']
  /** 지난 칸(30~60일 전) 평균 후진에 더할 값 */
  prevBump: number
}

const PANGYO_EXTRA: Record<string, PangyoExtra> = {
  'hyundai-pangyo': {
    address: '경기 성남시 분당구 백현동',
    aliases: ['현대백화점'],
    manualTags: ['SPIRAL_RAMP', 'MANY_PILLARS'],
    publicInfo: ['기계식 아님 · 지하 6층까지'],
    floorWeights: [10, 9, 6, 4, 3, 2],
    pattern: 'mall',
    struggle: { p: 0.35, smooth: 0.3, smoothDur: 0.6 },
    ratings: { count: 30, mean: 4.4 },
    prevBump: 0,
  },
  'u-space-pangyo': {
    address: '경기 성남시 분당구 삼평동',
    aliases: ['유스페이스', 'U-SPACE'],
    manualTags: ['NARROW_AISLE'],
    pattern: 'office',
    struggle: { p: 0.32, smooth: 0.3, smoothDur: 0.6 },
    ratings: { count: 10, mean: 4.0 },
    prevBump: 0.4,
  },
  'h-square': {
    address: '경기 성남시 분당구 삼평동',
    aliases: ['H스퀘어', '에이치스퀘어'],
    manualTags: ['NARROW_AISLE'],
    pattern: 'office',
    struggle: { p: 0.3, smooth: 0.3, smoothDur: 0.6 },
    ratings: { count: 8, mean: 3.8 },
    prevBump: 0.4,
  },
  'pangyo-seven-venture': {
    address: '경기 성남시 분당구 삼평동',
    aliases: ['판교세븐벤처밸리', '세븐벤처'],
    manualTags: ['NARROW_AISLE'],
    pattern: 'office',
    struggle: { p: 0.25, smooth: 0.35 },
    ratings: { count: 6, mean: 3.5 },
    prevBump: 0.4,
  },
  'botdeul-mall': {
    address: '경기 성남시 분당구 삼평동',
    aliases: ['봇들마을 상가', '봇들마을'],
    manualTags: ['MANY_PILLARS'],
    pattern: 'mall',
    struggle: { p: 0.22, smooth: 0.45 },
    shape: { PERPENDICULAR: 0.6, PARALLEL: 0.3, ANGLED: 0.1 },
    prevBump: 0.4,
  },
  'hwarang-park-public': {
    address: '경기 성남시 분당구 삼평동',
    aliases: ['화랑공원'],
    manualTags: ['FLAT'],
    pitch: '평면이라 편해요',
    pattern: 'park',
    struggle: { p: 0.2, smooth: 0.55 },
    ratings: { count: 6, mean: 3.0 },
    shape: { PERPENDICULAR: 0.5, PARALLEL: 0.3, ANGLED: 0.2 },
    prevBump: 0.33,
  },
  'alphadom-tower': {
    address: '경기 성남시 분당구 백현동',
    aliases: ['알파돔'],
    manualTags: ['SPACIOUS'],
    pitch: '자리 넉넉해요',
    pattern: 'mall',
    struggle: { p: 0.12, smooth: 0.6 },
    ratings: { count: 8, mean: 2.5 },
    prevBump: 0,
  },
  'avenue-france-pangyo': {
    address: '경기 성남시 분당구 백현동',
    aliases: ['아브뉴프랑'],
    manualTags: ['FLAT', 'SPACIOUS'],
    pitch: '훨씬 넓어요',
    zoneScheme: {
      zones: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      numbers: Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')),
      description: '기둥 색 + 알파벳 A–H · 기둥 번호 01–12',
    },
    floorWeights: [7, 5, 3],
    pattern: 'mall',
    struggle: { p: 0.05, smooth: 0.8, smoothDur: 0.95 },
    ratings: { count: 14, mean: 1.6 },
    prevBump: 0,
  },
  'baekhyun-5': {
    address: '경기 성남시 분당구 백현동',
    aliases: ['백현마을 5단지'],
    manualTags: ['SPACIOUS'],
    // 아파트 주차장은 입주민용이라 "더 쉬운 곳" 추천에서 뺀다
    suggestible: false,
    pattern: 'home',
    struggle: { p: 0.03, smooth: 0.85, smoothDur: 0.95 },
    ratings: { count: 6, mean: 1.5 },
    prevBump: 0,
  },
}

/** 최근 칸 평균 후진을 표시값보다 이만큼 낮게 (반올림은 같음) */
const NOW_OFFSET = 0.04

function fromDemo(def: DemoLotDef): SeedLot {
  const x = PANGYO_EXTRA[def.id]
  if (!x) throw new Error(`시드: ${def.id} 의 서버 메타데이터가 없어요 (PANGYO_EXTRA)`)
  const ins = demoLotInsights(def.id, { days: 30, now: DEMO_NOW })!
  const reverse = [...def.trend.slice(0, 4), def.trend[4] + x.prevBump, Math.round((def.avgReverse - NOW_OFFSET) * 100) / 100]
  return {
    lot: {
      id: def.id,
      name: def.name,
      shortName: def.shortName,
      location: { ...def.location },
      address: x.address,
      floors: [...def.floors],
      category: def.category,
      region: 'pangyo',
      rampKind: RAMP_KIND[def.ramp],
      manualTags: x.manualTags ?? [],
      aliases: x.aliases,
      pitch: x.pitch ?? null,
      suggestible: x.suggestible,
      publicInfo: x.publicInfo ?? [],
      zoneScheme: x.zoneScheme,
    },
    buckets: trend(def.records, reverse),
    ramp: def.avgRampTurns,
    duration: def.avgDurationSec,
    score: def.difficulty,
    strict: true,
    floorWeights: x.floorWeights,
    floorReverse: def.floors.length > 1 ? ins.floorAvgReverse.map((f) => f.avgReverse) : undefined,
    floorBase: ins.overlays.map((o) => o.paths.length),
    pattern: x.pattern,
    struggle: x.struggle,
    ratings: x.ratings,
    shape: x.shape,
    vehicles: x.vehicles,
  }
}

export const PANGYO: SeedLot[] = [
  ...DEMO_LOTS.map(fromDemo),
  {
    lot: {
      id: 'pangyo-new',
      name: '판교 테크원 주차장',
      location: { lat: 37.4005, lng: 127.111 },
      address: '경기 성남시 분당구 삼평동',
      floors: ['1F', ...B(4)],
      publicInfo: ['기계식 아님 · 지하 4층까지', '주차면 [수] 면'],
      aliases: ['테크원'],
      category: 'OFFICE',
      region: 'pangyo',
    },
    // 데이터 부족 시연 (최근 30일 3대) — 대시보드에서는 빠진다
    buckets: [{ n: 3, reverse: 1.3 }],
    ramp: 1.0,
    duration: 75,
    pattern: 'office',
    struggle: { p: 0.1, smooth: 0.6 },
  },
]

/** 판교가 내야 하는 값 (test/seed.test.ts) — insights-demo DEMO_LOTS = D-03 표 */
export const PANGYO_TARGETS: Record<string, { difficulty: number | null; sampleCount: number; avgReverse?: number; ramp?: number; duration?: number }> = {
  ...Object.fromEntries(
    DEMO_LOTS.map((d) => [d.id, { difficulty: d.difficulty, sampleCount: d.records, avgReverse: d.avgReverse, ramp: d.avgRampTurns, duration: d.avgDurationSec }]),
  ),
  'pangyo-new': { difficulty: null, sampleCount: 3 },
}

/**
 * C-08 "전체 평균" 목표 (주차장마다 같은 무게, 90일). 차량 앱 LiveServerE2ETest 가 1.4 ± 0.3 을 본다.
 * 시연 주차장 41곳의 평균을 한꺼번에 늘이거나 줄여서 맞춘다 (demoScale).
 */
export const OVERALL_TARGET = { reverse: 1.4, ramp: 0.8, duration: 65 }

// ───────────── 수도권 시연 주차장 (W-01 지도) ─────────────

interface DemoDef {
  id: string
  name: string
  lat: number
  lng: number
  address: string
  floors: string[]
  /** 목표 난이도 (시연용) */
  level: number
  n30: number
  pattern: Pattern
  tags?: LotInput['manualTags']
  aliases?: string[]
  feeText?: string
  publicInfo?: string[]
  category: LotCategory
  region: string
}

const DEMO_DEFS: DemoDef[] = [
  // 서울 — 강남·잠실
  { id: 'coex-samseong', name: '코엑스 주차장', lat: 37.5115, lng: 127.0595, address: '서울 강남구 삼성동', floors: B(4), level: 3.8, n30: 118, pattern: 'mall', tags: ['MANY_PILLARS'], aliases: ['코엑스'], category: 'MALL', region: 'seoul' },
  { id: 'lotte-world-mall', name: '롯데월드몰 주차장', lat: 37.5133, lng: 127.1043, address: '서울 송파구 신천동', floors: B(6), level: 3.3, n30: 126, pattern: 'mall', aliases: ['롯데월드몰'], category: 'MALL', region: 'seoul' },
  { id: 'shinsegae-gangnam', name: '신세계백화점 강남점 주차장', lat: 37.5046, lng: 127.0045, address: '서울 서초구 반포동', floors: B(6), level: 4.1, n30: 104, pattern: 'mall', tags: ['SPIRAL_RAMP'], aliases: ['신세계 강남'], category: 'DEPARTMENT', region: 'seoul' },
  { id: 'hyundai-apgujeong', name: '현대백화점 압구정본점 주차장', lat: 37.5273, lng: 127.0285, address: '서울 강남구 압구정동', floors: B(4), level: 4.4, n30: 77, pattern: 'mall', tags: ['SPIRAL_RAMP', 'NARROW_AISLE'], aliases: ['현대백화점 압구정'], category: 'DEPARTMENT', region: 'seoul' },
  { id: 'galleria-luxury', name: '갤러리아백화점 명품관 주차장', lat: 37.5283, lng: 127.0403, address: '서울 강남구 압구정동', floors: B(5), level: 4.0, n30: 52, pattern: 'mall', tags: ['NARROW_AISLE'], aliases: ['갤러리아 명품관'], category: 'DEPARTMENT', region: 'seoul' },
  { id: 'yeoksam-public', name: '역삼 공영주차장', lat: 37.5006, lng: 127.0364, address: '서울 강남구 역삼동', floors: B(3), level: 4.2, n30: 46, pattern: 'office', tags: ['MECHANICAL'], feeText: '5분 400원', publicInfo: ['기계식 · 대형 SUV 제한'], category: 'PUBLIC', region: 'seoul' },
  { id: 'sinsa-public', name: '신사동 공영주차장', lat: 37.5199, lng: 127.023, address: '서울 강남구 신사동', floors: F(5), level: 4.6, n30: 38, pattern: 'mall', tags: ['MECHANICAL', 'NARROW_AISLE'], feeText: '5분 300원', publicInfo: ['기계식 타워 · 높이 1.55m 제한'], category: 'PUBLIC', region: 'seoul' },
  { id: 'samsung-hospital', name: '삼성서울병원 주차장', lat: 37.4881, lng: 127.0855, address: '서울 강남구 일원동', floors: B(4), level: 3.5, n30: 96, pattern: 'hospital', tags: ['MANY_PILLARS'], category: 'OTHER', region: 'seoul' },
  { id: 'asan-hospital', name: '서울아산병원 주차장', lat: 37.5266, lng: 127.1082, address: '서울 송파구 풍납동', floors: B(5), level: 3.2, n30: 101, pattern: 'hospital', category: 'OTHER', region: 'seoul' },
  { id: 'jamsil-sports', name: '잠실종합운동장 주차장', lat: 37.5146, lng: 127.0736, address: '서울 송파구 잠실동', floors: ['1F'], level: 1.5, n30: 64, pattern: 'park', tags: ['FLAT'], feeText: '10분 500원', category: 'PUBLIC', region: 'seoul' },
  // 서울 — 도심·여의도·서부
  { id: 'ifc-mall', name: '여의도 IFC몰 주차장', lat: 37.5251, lng: 126.9255, address: '서울 영등포구 여의도동', floors: B(6), level: 3.0, n30: 88, pattern: 'mall', aliases: ['IFC몰'], category: 'MALL', region: 'seoul' },
  { id: 'the-hyundai-seoul', name: '더현대 서울 주차장', lat: 37.5259, lng: 126.9284, address: '서울 영등포구 여의도동', floors: B(6), level: 3.4, n30: 132, pattern: 'mall', aliases: ['더현대'], category: 'DEPARTMENT', region: 'seoul' },
  { id: 'times-square', name: '타임스퀘어 주차장', lat: 37.517, lng: 126.9033, address: '서울 영등포구 영등포동', floors: B(5), level: 2.9, n30: 85, pattern: 'mall', aliases: ['타임스퀘어'], category: 'MALL', region: 'seoul' },
  { id: 'lotte-main', name: '롯데백화점 본점 주차장', lat: 37.5649, lng: 126.9811, address: '서울 중구 소공동', floors: B(5), level: 4.5, n30: 93, pattern: 'mall', tags: ['SPIRAL_RAMP', 'NARROW_AISLE'], aliases: ['롯데백화점 본점'], category: 'DEPARTMENT', region: 'seoul' },
  { id: 'shinsegae-main', name: '신세계백화점 본점 주차장', lat: 37.5609, lng: 126.981, address: '서울 중구 충무로1가', floors: B(5), level: 4.2, n30: 61, pattern: 'mall', tags: ['SPIRAL_RAMP'], aliases: ['신세계 본점'], category: 'DEPARTMENT', region: 'seoul' },
  { id: 'seoul-station', name: '서울역 주차장', lat: 37.5547, lng: 126.9707, address: '서울 용산구 동자동', floors: B(3), level: 3.6, n30: 72, pattern: 'transit', tags: ['MANY_PILLARS'], category: 'OTHER', region: 'seoul' },
  { id: 'iparkmall-yongsan', name: '용산 아이파크몰 주차장', lat: 37.5292, lng: 126.9648, address: '서울 용산구 한강로3가', floors: ['1F', ...B(4)], level: 3.1, n30: 69, pattern: 'mall', aliases: ['아이파크몰'], category: 'MALL', region: 'seoul' },
  { id: 'sejongno-public', name: '세종로 공영주차장', lat: 37.5733, lng: 126.9768, address: '서울 종로구 세종로', floors: B(4), level: 3.9, n30: 57, pattern: 'office', tags: ['MANY_PILLARS'], feeText: '5분 400원', category: 'PUBLIC', region: 'seoul' },
  { id: 'ddp', name: '동대문디자인플라자(DDP) 주차장', lat: 37.5665, lng: 127.0092, address: '서울 중구 을지로7가', floors: B(3), level: 2.6, n30: 49, pattern: 'park', aliases: ['DDP'], category: 'PUBLIC', region: 'seoul' },
  { id: 'severance', name: '세브란스병원 주차장', lat: 37.5622, lng: 126.9408, address: '서울 서대문구 신촌동', floors: B(5), level: 3.7, n30: 83, pattern: 'hospital', tags: ['SPIRAL_RAMP'], category: 'OTHER', region: 'seoul' },
  { id: 'hongdae-public', name: '홍대 공영주차장', lat: 37.5563, lng: 126.9236, address: '서울 마포구 서교동', floors: B(3), level: 4.3, n30: 44, pattern: 'mall', tags: ['NARROW_AISLE'], feeText: '5분 300원', category: 'PUBLIC', region: 'seoul' },
  { id: 'mokdong-hyundai', name: '현대백화점 목동점 주차장', lat: 37.5263, lng: 126.8752, address: '서울 양천구 목동', floors: B(6), level: 3.0, n30: 74, pattern: 'mall', aliases: ['현대백화점 목동'], category: 'DEPARTMENT', region: 'seoul' },
  { id: 'gimpo-domestic', name: '김포공항 국내선 주차빌딩', lat: 37.5626, lng: 126.8015, address: '서울 강서구 공항동', floors: F(5), level: 1.6, n30: 140, pattern: 'transit', tags: ['SPACIOUS'], aliases: ['김포공항'], category: 'OTHER', region: 'seoul' },
  // 서울 — 동부·북부
  { id: 'seoul-forest', name: '서울숲 공영주차장', lat: 37.5444, lng: 127.0374, address: '서울 성동구 성수동1가', floors: ['1F'], level: 1.9, n30: 58, pattern: 'park', tags: ['FLAT'], feeText: '5분 300원', aliases: ['서울숲'], category: 'PUBLIC', region: 'seoul' },
  { id: 'starcity-konkuk', name: '건대 스타시티 주차장', lat: 37.5386, lng: 127.073, address: '서울 광진구 자양동', floors: B(5), level: 2.8, n30: 66, pattern: 'mall', aliases: ['스타시티'], category: 'MALL', region: 'seoul' },
  { id: 'emart-seongsu', name: '이마트 성수점 주차장', lat: 37.5394, lng: 127.0532, address: '서울 성동구 성수동2가', floors: F(4), level: 2.4, n30: 79, pattern: 'mall', aliases: ['이마트 성수'], category: 'MALL', region: 'seoul' },
  { id: 'nowon-station', name: '노원역 공영주차장', lat: 37.6551, lng: 127.0613, address: '서울 노원구 상계동', floors: B(2), level: 3.3, n30: 8, pattern: 'transit', category: 'PUBLIC', region: 'seoul' },
  // 분당
  { id: 'ak-seohyeon', name: 'AK플라자 분당점 주차장', lat: 37.3849, lng: 127.1233, address: '경기 성남시 분당구 서현동', floors: B(5), level: 3.2, n30: 71, pattern: 'mall', aliases: ['AK플라자'], category: 'DEPARTMENT', region: 'bundang' },
  { id: 'lotte-bundang', name: '롯데백화점 분당점 주차장', lat: 37.3784, lng: 127.1146, address: '경기 성남시 분당구 수내동', floors: B(4), level: 3.4, n30: 55, pattern: 'mall', aliases: ['롯데백화점 분당'], category: 'DEPARTMENT', region: 'bundang' },
  { id: 'jeongja-public', name: '정자역 공영주차장', lat: 37.3666, lng: 127.1081, address: '경기 성남시 분당구 정자동', floors: B(2), level: 2.2, n30: 42, pattern: 'transit', feeText: '10분 300원', category: 'PUBLIC', region: 'bundang' },
  { id: 'snubh', name: '분당서울대병원 주차장', lat: 37.352, lng: 127.1236, address: '경기 성남시 분당구 구미동', floors: ['1F', ...B(3)], level: 2.7, n30: 63, pattern: 'hospital', category: 'OTHER', region: 'bundang' },
  { id: 'yuldong-park', name: '율동공원 주차장', lat: 37.379, lng: 127.144, address: '경기 성남시 분당구 율동', floors: ['1F'], level: 1.4, n30: 36, pattern: 'park', tags: ['FLAT', 'SPACIOUS'], aliases: ['율동공원'], category: 'PUBLIC', region: 'bundang' },
  { id: 'nc-yatap', name: 'NC백화점 야탑점 주차장', lat: 37.4111, lng: 127.1283, address: '경기 성남시 분당구 야탑동', floors: B(4), level: 2.9, n30: 47, pattern: 'mall', category: 'DEPARTMENT', region: 'bundang' },
  // 경기·인천
  { id: 'starfield-hanam', name: '스타필드 하남 주차장', lat: 37.5455, lng: 127.2236, address: '경기 하남시 신장동', floors: ['1F', ...B(3)], level: 1.7, n30: 112, pattern: 'mall', tags: ['SPACIOUS'], aliases: ['스타필드 하남'], category: 'MALL', region: 'gyeonggi' },
  { id: 'starfield-goyang', name: '스타필드 고양 주차장', lat: 37.6474, lng: 126.8957, address: '경기 고양시 덕양구 동산동', floors: ['1F', ...B(3)], level: 1.8, n30: 98, pattern: 'mall', tags: ['SPACIOUS'], aliases: ['스타필드 고양'], category: 'MALL', region: 'gyeonggi' },
  { id: 'starfield-wirye', name: '스타필드 시티 위례 주차장', lat: 37.4774, lng: 127.1478, address: '경기 하남시 학암동', floors: B(4), level: 2.1, n30: 59, pattern: 'mall', aliases: ['스타필드 위례'], category: 'MALL', region: 'gyeonggi' },
  { id: 'lottemall-suwon', name: '롯데몰 수원점 주차장', lat: 37.2654, lng: 127.0002, address: '경기 수원시 권선구 서둔동', floors: B(4), level: 2.6, n30: 81, pattern: 'mall', aliases: ['롯데몰 수원'], category: 'MALL', region: 'gyeonggi' },
  { id: 'galleria-gwanggyo', name: '갤러리아 광교 주차장', lat: 37.2851, lng: 127.057, address: '경기 수원시 영통구 하동', floors: B(6), level: 2.3, n30: 53, pattern: 'mall', aliases: ['갤러리아 광교'], category: 'DEPARTMENT', region: 'gyeonggi' },
  { id: 'kintex', name: '킨텍스 제1전시장 주차장', lat: 37.6694, lng: 126.7454, address: '경기 고양시 일산서구 대화동', floors: ['1F'], level: 1.5, n30: 67, pattern: 'park', tags: ['FLAT', 'SPACIOUS'], aliases: ['킨텍스'], category: 'OTHER', region: 'gyeonggi' },
  { id: 'triple-street', name: '송도 트리플스트리트 주차장', lat: 37.3822, lng: 126.6567, address: '인천 연수구 송도동', floors: B(3), level: 2.0, n30: 4, pattern: 'mall', aliases: ['트리플스트리트'], category: 'MALL', region: 'incheon' },
  { id: 'seoul-grand-park', name: '서울대공원 주차장', lat: 37.4363, lng: 127.006, address: '경기 과천시 막계동', floors: ['1F'], level: 1.6, n30: 6, pattern: 'park', tags: ['FLAT'], feeText: '1일 4,000원', category: 'PUBLIC', region: 'gyeonggi' },
]


/** 시연 주차장 → SeedLot (90일, 30일씩 3칸 같은 평균). 평균은 난이도에서 정하고, 나중에 전체 평균에 맞게 한꺼번에 늘이거나 줄인다 */
export function demoLots(): SeedLot[] {
  return DEMO_DEFS.map((d) => {
    const x = d.level - 1
    const flat = d.floors.length === 1
    const spiral = d.tags?.includes('SPIRAL_RAMP')
    const ratio = 2.4 + ((d.n30 * 7) % 9) / 10 // 30일 대비 90일 (2.4~3.2배)
    const older = Math.round(d.n30 * ratio) - d.n30
    const reverse = 0.1 + 0.15 * x + 0.22 * x * x
    return {
      lot: {
        id: d.id,
        name: d.name,
        location: { lat: d.lat, lng: d.lng },
        address: d.address,
        floors: d.floors,
        manualTags: d.tags ?? [],
        aliases: d.aliases ?? [],
        feeText: d.feeText ?? null,
        publicInfo: d.publicInfo ?? [],
        category: d.category,
        region: d.region,
      },
      buckets: [
        { n: Math.floor(older / 2), reverse },
        { n: older - Math.floor(older / 2), reverse },
        { n: d.n30, reverse },
      ],
      // 어려운 곳일수록 가파르게 (전체 평균은 demoScale 이 맞춤)
      ramp: flat ? 0.03 * x : (0.05 + 0.08 * x + 0.15 * x * x) * (spiral ? 1.4 : 1),
      duration: 24 + 3 * x + 7.5 * x * x,
      score: d.level,
      pattern: d.pattern,
      struggle: { p: 0.05 + 0.02 * x, smooth: 0.75 - 0.04 * x },
      ratings: d.n30 >= 40 ? { count: Math.round(d.n30 / 9), mean: Math.min(5, Math.max(1, d.level + 0.2)) } : undefined,
      shape: flat ? { PERPENDICULAR: 0.6, ANGLED: 0.25, PARALLEL: 0.15 } : undefined,
    }
  })
}
