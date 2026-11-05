/**
 * PC 대시보드 v2(D-10 · D-11 · D-12) — 서버 API 에 없는 수치의 **시연용 예시 값** 한곳 모음.
 *
 * 값은 시안 docs/design/D-10~D-12.dc.html 그대로다 (canvas.json 메모 ws2: "수치는 전부 시연용 예시. 장소 이름만 실제").
 * API 가 주는 숫자(주차장·점수·기록 수·평균 후진·평균 시간·추이·층·도면·후진 잦은 곳·동선·히트맵·지역 합계)는
 * 여기 두지 않는다 — 화면이 API 에서 읽는다. 여기 있는 것은 API 에 없는 것뿐:
 *   한 번에 들어간 비율 · 주차 방향 · 차 크기별 평균 후진 · 들어와서 대기까지 분포 · 개선 전후 주별 추이 ·
 *   이번 달 눈에 띄는 변화 · 5건 미만 칸 수 · 내보내기 기록 · API 키 · 내보내기 파일을 만드는 규칙(시연 기록 생성기의 비율).
 *
 * 시안은 현대백화점 판교점 한 곳(층 표)만 그렸다. 다른 주차장·층 값은 시안 층 표에서 잰 관계로 **결정적으로** 만든다
 * (같은 입력이면 늘 같은 값). 시안 스크립트가 지점 값을 층 점수 비율로 늘리고 줄인 것과 같은 방식이다.
 * 운전자를 평가하는 말은 쓰지 않는다 — 어려운 건 주차장이다.
 */

const round1 = (v: number) => Math.round(v * 10 + 1e-9) / 10
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// ───────────── 층 · 주차장 값 (시안 D-11 층 표에서 잰 관계) ─────────────

/**
 * 평균 후진 1회 차이 ↔ 난이도 0.83 차이. 시안 D-11 층 표 (B1 2.1회 3.1 … B3 3.9회 4.6) 의 기울기.
 * 층 난이도, 지난 기간 평균 난이도, 6개월 추이 배지(쉬워짐·어려워짐), 시간대 점수를 이것으로 만든다.
 */
export const SCORE_PER_REVERSE = 0.83

/** 층 난이도 = 주차장 난이도 + 0.83 × (층 평균 후진 − 주차장 평균 후진), 1.0~5.0 */
export function floorScore(lotScore: number, lotAvgReverse: number, floorAvgReverse: number): number {
  return clamp(round1(lotScore + SCORE_PER_REVERSE * (floorAvgReverse - lotAvgReverse)), 1, 5)
}

/** 한 번에 들어간 비율(후진 1회 이하, %). 시안 층 표: 2.1회 58% … 3.9회 31% → 후진 1회마다 15%p */
export function oneShotPct(avgReverse: number): number {
  return Math.round(clamp(58 - 15 * (avgReverse - 2.1), 5, 95))
}

/** 판교 9곳 평균 한 번에 들어간 비율 (D-10 요약 · D-11 비교) */
export const REGION_ONE_SHOT_PCT = 61

/** 주차 방향 비율(%): 뒤로 넣기 · 앞으로 넣기 · 평행. 시안 층 표: 2.1회 52/41 … 3.9회 63/31 */
export function parkDirection(avgReverse: number): { rear: number; front: number; parallel: number } {
  const d = avgReverse - 2.1
  const rear = Math.round(clamp(52 + 6 * d, 20, 88))
  const front = Math.round(clamp(41 - 5.5 * d, 6, 70))
  return { rear, front, parallel: Math.max(0, 100 - rear - front) }
}

/** D-10 '주차 기록' 아래: 지난 기간보다 늘어난 비율(%) — API 에 지난 기간 기록 수가 없어 시안 값 */
export const RECORDS_GROWTH_PCT = 12

/** D-10 '이번 달 눈에 띄는 변화' 마지막 줄: 기록이 5건보다 적어 화면·내보내기에서 뺀 칸 (판교 9곳) */
export const SMALL_CELLS_EXCLUDED = 212

/** 차 크기. 내보내기 car_class 값과 D-11 막대 이름 */
export const CAR_CLASSES = ['경차', '소형', '중형', '대형', 'SUV'] as const
export type CarClass = (typeof CAR_CLASSES)[number]

/** 시안 D-11 '차 크기별 평균 후진' (현대백화점, 주차장 평균 3.2회 기준). 다른 곳은 평균 후진 비율로 늘리고 줄인다 */
const CLASS_REVERSE_BASE: { avg: number; values: Record<CarClass, number> } = {
  avg: 3.2,
  values: { 경차: 2.1, 소형: 2.6, 중형: 3.1, 대형: 3.8, SUV: 3.6 },
}

export function classReverse(lotAvgReverse: number): { name: CarClass; value: number }[] {
  const k = lotAvgReverse / CLASS_REVERSE_BASE.avg
  return CAR_CLASSES.map((name) => ({ name, value: round1(CLASS_REVERSE_BASE.values[name] * k) }))
}

/** 시연 기록의 차 크기 비율 (시안에 없음 — 국내 등록 비율에 가깝게 둔 예시) */
export const CAR_CLASS_SHARE: Record<CarClass, number> = { 경차: 0.1, 소형: 0.2, 중형: 0.38, 대형: 0.12, SUV: 0.2 }

// ───────────── 들어와서 대기까지 (D-11 막대) ─────────────

/**
 * 시안 D-11 분포 (현대백화점, 평균 2분 10초). 마지막 칸 '3분+'은 3분~6분 17초로 두면 평균이 정확히 130초가 된다.
 * 다른 곳은 시간을 (평균 ÷ 130초) 배로 늘리고 줄여서 같은 칸에 다시 담는다.
 */
export const DURATION_BASE_AVG_SEC = 130
export const DURATION_BINS: readonly { label: string; from: number; to: number; pct: number }[] = [
  { label: '~30초', from: 0, to: 30, pct: 4 },
  { label: '~1분', from: 30, to: 60, pct: 8 },
  { label: '~1분반', from: 60, to: 90, pct: 15 },
  { label: '~2분', from: 90, to: 120, pct: 20 },
  { label: '~2분반', from: 120, to: 150, pct: 25 },
  { label: '~3분', from: 150, to: 180, pct: 16 },
  { label: '3분+', from: 180, to: 377, pct: 12 },
]

/** 평균 avgSec 인 주차장의 7칸 비율(%, 합 100) */
export function durationHistogram(avgSec: number): number[] {
  const s = Math.max(0.05, avgSec / DURATION_BASE_AVG_SEC)
  const out = DURATION_BINS.map(() => 0)
  for (const src of DURATION_BINS) {
    const a = src.from * s
    const b = src.to * s
    DURATION_BINS.forEach((dst, i) => {
      const hi = i === DURATION_BINS.length - 1 ? Infinity : dst.to
      const overlap = Math.max(0, Math.min(b, hi) - Math.max(a, dst.from))
      out[i] += (src.pct * overlap) / (b - a)
    })
  }
  return out.map((v) => Math.round(v * 10) / 10)
}

/** 분포의 u 분위(0~1) 시간(초) — 시연 기록 생성기가 층마다 고르게 뽑는 데 쓴다 */
export function durationQuantile(u: number, avgSec: number): number {
  const s = Math.max(0.05, avgSec / DURATION_BASE_AVG_SEC)
  let acc = 0
  for (const b of DURATION_BINS) {
    const p = b.pct / 100
    if (u <= acc + p || b === DURATION_BINS[DURATION_BINS.length - 1]) {
      const t = p > 0 ? clamp((u - acc) / p, 0, 1) : 0
      return (b.from + (b.to - b.from) * t) * s
    }
    acc += p
  }
  return DURATION_BASE_AVG_SEC * s
}

// ───────────── 후진 잦은 곳 — 바꿔 볼 만한 것 (D-11 지점 카드를 눌렀을 때) ─────────────

export type SpotKind = 'ramp' | 'entrance' | 'pillar' | 'end' | 'other'

/** API 후진 잦은 곳 제목으로 종류를 가른다 ("램프 나와서 바로 왼쪽", "C 구역 기둥 사이", "E 구역 끝 칸", "입구 지나 바로 왼쪽") */
export function spotKind(title: string): SpotKind {
  if (/램프/.test(title)) return 'ramp'
  if (/입구/.test(title)) return 'entrance'
  if (/기둥/.test(title)) return 'pillar'
  if (/끝|막다른|회차/.test(title)) return 'end'
  return 'other'
}

/** 시안 D-11 지점 카드의 제안 문구 (종류별) */
export const SPOT_IDEAS: Record<SpotKind, string> = {
  ramp: '램프에서 나오자마자 꺾이는 자리예요. 볼록거울이나 바닥 유도선을 더하면 좋은 후보예요.',
  entrance: '들어오는 차가 한꺼번에 몰려요. 바닥에 진행 방향 화살표를 그려 볼 만해요.',
  pillar: '기둥 쪽 칸 폭 표시선을 다시 칠하거나 경차 전용 칸으로 바꿔 볼 만해요.',
  end: '회차 공간 표시나 일방통행 안내가 있으면 후진이 줄 수 있어요.',
  other: '칸이 통로보다 좁게 나 있어요. 앞으로 대기 쉬운 방향 화살표를 그려 볼 만해요.',
}

// ───────────── 바꾸고 나서 좋아졌나요 (D-11 개선 전후) ─────────────

/**
 * 시안 D-11: 9월 22일 반사경을 단 지점의 주별 평균 후진 (전 6주 평균 4.0회 → 후 6주 평균 3.3회, 0.7회 줄어듦).
 * 시안은 B3 램프 출구라고 썼지만 API 의 현대백화점 후진 잦은 곳에서 램프 출구는 B2 1번이라 B2 로 맞췄다.
 * 화면은 '후 평균'을 API 의 그 지점 평균 후진에 맞춰 전체를 같은 만큼 옮긴다 (줄어든 0.7회는 그대로).
 */
export interface Improvement {
  lotId: string
  floor: string
  rank: number
  spotLabel: string
  /** "9월 22일" · 눈금 "9.22" */
  dateText: string
  dateShort: string
  /** "반사경 설치" · 문장용 "반사경을 단 뒤" */
  change: string
  changeSentence: string
  weeks: string[]
  before: number[]
  after: number[]
  beforeAvg: number
  afterAvg: number
}

export const IMPROVEMENTS: readonly Improvement[] = [
  {
    lotId: 'hyundai-pangyo',
    floor: 'B2',
    rank: 1,
    spotLabel: '램프 출구',
    dateText: '9월 22일',
    dateShort: '9.22',
    change: '반사경 설치',
    changeSentence: '반사경을 단 뒤',
    weeks: ['8.11', '8.18', '8.25', '9.1', '9.8', '9.15', '9.22', '9.29', '10.6', '10.13', '10.20', '10.27'],
    before: [3.9, 4.0, 3.8, 4.1, 3.9, 4.0],
    after: [3.5, 3.3, 3.2, 3.3, 3.2, 3.2],
    beforeAvg: 4.0,
    afterAvg: 3.3,
  },
]

export function improvementFor(lotId: string): Improvement | null {
  return IMPROVEMENTS.find((m) => m.lotId === lotId) ?? null
}

// ───────────── 이번 달 눈에 띄는 변화 (D-10) ─────────────

export type ChangeIcon = 'down' | 'up' | 'clock' | 'lock'
export interface NotableChange {
  icon: ChangeIcon
  /** 없으면 '보기' 링크 없음 */
  lotId: string | null
  floor: string | null
  /** 주차장 이름 뒤에 붙는 곳 (" · 지하 2층") */
  where: string | null
  /** lotId 가 없을 때의 제목 */
  title?: string
  text: string
}

export const NOTABLE_CHANGES: readonly NotableChange[] = [
  { icon: 'down', lotId: 'hyundai-pangyo', floor: 'B2', where: 'B2 램프 출구', text: '9월 22일 반사경을 단 뒤 이 지점 후진이 평균 0.7회 줄었어요' },
  { icon: 'up', lotId: 'u-space-pangyo', floor: 'B2', where: '지하 2층', text: '평일 저녁 7시 이후 후진이 18% 늘었어요' },
  { icon: 'clock', lotId: 'hwarang-park-public', floor: null, where: null, text: '주말 오전 들어와서 대기까지 25초 짧아졌어요' },
  {
    icon: 'lock', lotId: null, floor: null, where: null,
    title: `기록이 5건보다 적은 칸 ${SMALL_CELLS_EXCLUDED}개`,
    text: '누가 댔는지 짐작할 수 없게 화면과 내보내기에서 빼 두었어요',
  },
]

// ───────────── D-12 내보내기 ─────────────

export type DatasetId = 'sessions' | 'traces' | 'events' | 'bays' | 'hours'
export type FormatId = 'csv' | 'xlsx' | 'parquet' | 'geojson' | 'api'

export interface DatasetDef {
  id: DatasetId
  name: string
  unit: string
  desc: string
  /** 미리보기 아래 '열 설명' */
  schema: [string, string][]
}

/** 시안 D-12 데이터 5종. 줄 수는 화면이 실제로 만든 파일에서 센다 (시안 수치를 쓰지 않음) */
export const DATASETS: readonly DatasetDef[] = [
  {
    id: 'sessions', name: '주차 세션 요약', unit: '행',
    desc: '주차 한 번에 한 줄. 층·칸·후진·핸들·걸린 시간·차 크기',
    schema: [
      ['session_id', '주차할 때마다 새로 만드는 번호. 차·사람과 이어지지 않아요'],
      ['bay_id', '운전자가 차 화면에서 확인한 구역·칸. 5대 미만 칸은 구역만 남겨요'],
      ['entered_at', '들어온 시각, 30분 단위'],
      ['reverse_n', '후진 기어로 바꾼 횟수'],
      ['steer_turns', '핸들을 돌린 바퀴 수'],
      ['duration_s', '들어와서 P를 넣기까지 초'],
      ['one_shot', '후진 1회 이하로 끝났는지'],
    ],
  },
  {
    id: 'traces', name: '동선 좌표', unit: '점',
    desc: '1초마다 한 점. 입구 기준 상대 좌표(m), 주차장 밖 경로는 없어요',
    schema: [
      ['t_s', '들어온 뒤 지난 초'],
      ['x_m, y_m', '입구를 (0, 0)으로 둔 거리, 미터 (도면 오른쪽·아래가 +)'],
      ['gear', 'D · R · P'],
      ['speed_kmh', '차속'],
    ],
  },
  {
    id: 'events', name: '후진·급정지 이벤트', unit: '건',
    desc: '일어난 자리(1m 격자)와 30분 단위 시각',
    schema: [
      ['type', 'reverse(후진) · hard_brake(급정지)'],
      ['cell_1m', '1m 격자 칸 번호. 층_가로_세로 (입구 기준 m)'],
      ['at', '30분 단위 시각'],
    ],
  },
  {
    id: 'bays', name: '칸별 집계', unit: '칸',
    desc: '칸마다 시도 횟수·평균 후진·머문 시간. 5대 미만 칸은 빠져요',
    schema: [
      ['sessions', '이 칸에 댄 횟수 (5회 미만 칸은 빠짐)'],
      ['avg_attempts', '칸에 들어가기까지 평균 시도'],
      ['avg_stay_min', '평균 머문 시간, 분'],
    ],
  },
  {
    id: 'hours', name: '시간대 집계', unit: '행',
    desc: '요일 × 시간마다 난이도와 기록 수',
    schema: [
      ['hour', '시작 시각 (0~23)'],
      ['score', '그 시간대 난이도 0.0~5.0'],
      ['sessions', '기록 수 (5회 미만 시간대는 빠짐)'],
    ],
  },
]

export const DEFAULT_DATASETS: Record<DatasetId, boolean> = { sessions: true, traces: false, events: true, bays: false, hours: false }

export interface FormatDef {
  id: FormatId
  label: string
  desc: string
  /** 크기 어림: CSV 대비 배수 (시안 값) */
  sizeFactor: number
}

export const FORMATS: readonly FormatDef[] = [
  { id: 'csv', label: 'CSV', desc: '엑셀·구글 시트에서 바로', sizeFactor: 1 },
  { id: 'xlsx', label: 'Excel', desc: '데이터마다 시트를 나눠서', sizeFactor: 0.8 },
  { id: 'parquet', label: 'Parquet', desc: '분석용 · 가장 작아요', sizeFactor: 0.25 },
  { id: 'geojson', label: 'GeoJSON', desc: '지도 도구용 · 동선·이벤트만', sizeFactor: 1.7 },
  { id: 'api', label: 'API', desc: '시스템이 직접 가져가요', sizeFactor: 1 },
]

/** 내보낸 기록 (시안 D-12 표). 양은 화면이 같은 조건으로 다시 만든 파일에서 센다 */
export interface ExportHistoryRow {
  /** 한국 시간 */
  at: string
  who: string
  dataset: DatasetId
  format: Exclude<FormatId, 'api'>
  /** 이 날까지 며칠 치 */
  days: number
  /** 보관 기간이 지나 받을 수 없음 */
  expired?: boolean
}

export const EXPORT_RETENTION_DAYS = 7

export const EXPORT_HISTORY: readonly ExportHistoryRow[] = [
  { at: '2026-11-03T15:12:00+09:00', who: '운영팀', dataset: 'sessions', format: 'csv', days: 30 },
  { at: '2026-11-02T06:00:00+09:00', who: '매주 자동', dataset: 'bays', format: 'xlsx', days: 7 },
  { at: '2026-10-26T06:00:00+09:00', who: '매주 자동', dataset: 'bays', format: 'xlsx', days: 7 },
  { at: '2026-10-21T10:40:00+09:00', who: '시설팀', dataset: 'events', format: 'geojson', days: 30 },
  { at: '2026-10-14T09:05:00+09:00', who: '운영팀', dataset: 'traces', format: 'parquet', days: 30, expired: true },
]

/** '시스템에서 바로 가져가기' — 그림으로만 보여 주는 안내 (키는 가려서, 새로 만들지 않음) */
export const API_INFO = {
  maskedKey: 'pk_live_••••••••3f9a',
  limit: '하루 1만 번',
  response: 'JSON · 1,000줄씩 나눠서',
  keyCreated: '2026년 10월 2일 만듦 · 운영팀',
} as const

// ───────────── 시연 기록 생성기의 비율 (D-12 파일 · 시안에 없는 값) ─────────────

/**
 * 층별 기록 비율 — 시안 D-11 현대백화점 층 표의 대수 (B1 241 · B2 236 · B3 228 · B4 214 · B5 196 · B6 169).
 * 층이 적은 곳은 앞에서부터 쓰고 다시 나눈다.
 */
export const FLOOR_SHARE = [241, 236, 228, 214, 196, 169] as const

/** 들어온 시각 비율 (0~23시). 평일은 점심·저녁, 주말은 오후가 많다 */
export const HOUR_VOLUME = {
  weekday: [0.2, 0.1, 0.05, 0.05, 0.05, 0.1, 0.4, 1.0, 2.0, 2.4, 2.4, 3.0, 4.2, 4.0, 3.0, 2.8, 3.0, 3.6, 4.8, 5.0, 4.2, 2.6, 1.2, 0.5],
  weekend: [0.2, 0.1, 0.05, 0.05, 0.05, 0.1, 0.2, 0.5, 1.2, 2.2, 3.4, 4.6, 5.4, 6.2, 6.6, 6.4, 5.8, 5.0, 4.6, 4.0, 3.0, 1.8, 0.9, 0.4],
} as const

/** 급정지 이벤트가 나오는 확률: 0.12 + 후진 1회마다 0.03 */
export const HARD_BRAKE = { base: 0.12, perReverse: 0.03 } as const

/** 평균 머문 시간(분) — 유형별 */
export const STAY_MIN: Record<string, number> = {
  DEPARTMENT: 105, MALL: 75, OFFICE: 380, PUBLIC: 95, APARTMENT: 540, OTHER: 120,
}
