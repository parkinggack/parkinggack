/**
 * 화면 문구 포맷 (한국어). 차량 앱 ui/screens/Format.kt · model/ParkingLot.kt 와 같은 규칙.
 * 운전자를 평가하는 말("실패", "서툴러요", "위험 운전")은 쓰지 않는다.
 * 시각은 운영자 기준 한국 시간(Asia/Seoul)으로 보여 준다.
 */
import type { DrivingExperience, ParkingShape, ReasonTag, VehicleClass } from '@api-types'

export const REASON_TAGS: readonly ReasonTag[] = [
  'SPIRAL_RAMP', 'NARROW_AISLE', 'MANY_PILLARS', 'MECHANICAL', 'STEEP_SLOPE',
  'FREQUENT_REVERSE', 'SPACIOUS', 'FLAT', 'MANY_FLOORS',
]

const TAG_LABELS: Record<ReasonTag, string> = {
  SPIRAL_RAMP: '회전 램프 좁음',
  NARROW_AISLE: '좁은 통로',
  MANY_PILLARS: '기둥 많음',
  MECHANICAL: '기계식',
  STEEP_SLOPE: '경사 급함',
  FREQUENT_REVERSE: '후진 잦음',
  SPACIOUS: '자리 넉넉',
  FLAT: '평면 주차장',
  MANY_FLOORS: '층 많음',
}

export function tagLabel(tag: ReasonTag | string): string {
  return TAG_LABELS[tag as ReasonTag] ?? tag
}

const SHAPE_LABELS: Record<ParkingShape, string> = {
  PERPENDICULAR: '직각', PARALLEL: '평행', ANGLED: '사선', UNKNOWN: '모름',
}
export const shapeLabel = (s: ParkingShape | string) => SHAPE_LABELS[s as ParkingShape] ?? s

const VEHICLE_LABELS: Record<VehicleClass, string> = {
  COMPACT: '소형', MIDSIZE: '중형', LARGE: '대형', SUV: 'SUV', UNKNOWN: '모름',
}
export const vehicleClassLabel = (v: VehicleClass | string) => VEHICLE_LABELS[v as VehicleClass] ?? v

const EXPERIENCE_LABELS: Record<DrivingExperience, string> = {
  UNDER_1Y: '1년 미만', Y1_3: '1–3년', Y3_10: '3–10년', OVER_10Y: '10년 이상', UNKNOWN: '모름',
}
export const experienceLabel = (e: DrivingExperience | string) => EXPERIENCE_LABELS[e as DrivingExperience] ?? e

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

/** 1(월)..7(일) → "월" */
export function weekdayLabel(weekday: number): string {
  return WEEKDAYS[weekday - 1] ?? '?'
}

/** 기록의 주차 시각대 "화 17시" (정확한 시각은 서버에 없다) */
export function parkedWhen(weekday: number, hour: number): string {
  return `${weekdayLabel(weekday)} ${hour}시`
}

// ───────────── 난이도 ─────────────

/** 1~5 (막대 5칸 중 채울 칸 수). Kotlin Difficulty.level 과 같음 */
export function difficultyLevel(score: number): 1 | 2 | 3 | 4 | 5 {
  const clamped = Math.min(5, Math.max(1, score))
  return Math.min(5, Math.max(1, Math.round(clamped))) as 1 | 2 | 3 | 4 | 5
}

const LEVEL_LABELS = ['아주 쉬움', '쉬움', '보통', '어려움', '아주 어려움'] as const

export function levelLabel(level: number): string {
  return LEVEL_LABELS[Math.min(5, Math.max(1, level)) - 1]
}

/** null(데이터 부족)이면 "기록 적음" */
export function difficultyLabel(score: number | null): string {
  return score == null ? '기록 적음' : levelLabel(difficultyLevel(score))
}

/** 4.25 → "★4.3", null → "–" */
export function formatScore(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return '–'
  return `★${score.toFixed(1)}`
}

// ───────────── 숫자 · 시간 ─────────────

/** 2.0 → "2", 2.45 → "2.5" (Kotlin formatCount) */
export function formatCount(v: number): string {
  const rounded = Math.round(v * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** 1234 → "1,234" */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('ko-KR')
}

/** 0.256 → "26%" */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '–'
  return `${Math.round(ratio * 100)}%`
}

/** 100 → "1분 40초", 55 → "55초", 125 → "2분 05초", 120 → "2분" (Kotlin formatDurationKo) */
export function formatDurationKo(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m === 0) return `${r}초`
  if (r === 0) return `${m}분`
  return `${m}분 ${String(r).padStart(2, '0')}초`
}

const SEOUL = 'Asia/Seoul'

function seoulParts(ms: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SEOUL, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date(ms))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'))
  return {
    year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
    hour: Number(get('hour')), minute: Number(get('minute')), weekday: wd + 1,
  }
}

/** "오후 5:02" */
export function formatTimeOfDay(iso: string | number): string {
  const p = seoulParts(typeof iso === 'number' ? iso : Date.parse(iso))
  const ampm = p.hour < 12 ? '오전' : '오후'
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  return `${ampm} ${h12}:${String(p.minute).padStart(2, '0')}`
}

/** "11.3 (화)" */
export function formatDateShort(iso: string | number): string {
  const p = seoulParts(typeof iso === 'number' ? iso : Date.parse(iso))
  return `${p.month}.${p.day} (${weekdayLabel(p.weekday)})`
}

/** "11.3 (화) 오후 5:02" */
export function formatDateTime(iso: string | number | null | undefined): string {
  if (iso == null || iso === '') return '–'
  const ms = typeof iso === 'number' ? iso : Date.parse(iso)
  if (Number.isNaN(ms)) return '–'
  return `${formatDateShort(ms)} ${formatTimeOfDay(ms)}`
}

/** "방금" / "3분 전" / "2시간 10분 전" / "어제" / "5일 전" / 그보다 오래면 날짜 */
export function formatRelative(iso: string | number, nowMs: number = Date.now()): string {
  const ms = typeof iso === 'number' ? iso : Date.parse(iso)
  if (Number.isNaN(ms)) return '–'
  const min = Math.max(0, Math.floor((nowMs - ms) / 60000))
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  if (min < 24 * 60) {
    const h = Math.floor(min / 60)
    const m = min % 60
    return m === 0 ? `${h}시간 전` : `${h}시간 ${m}분 전`
  }
  const days = Math.floor(min / (24 * 60))
  if (days === 1) return '어제'
  if (days < 30) return `${days}일 전`
  return formatDateShort(ms)
}

/** 37.39260 → "37.39260" (5자리 ≈ 1m) */
export function formatCoord(v: number): string {
  return Number.isFinite(v) ? v.toFixed(5) : '–'
}

/** 층별 혼잡 0..1 → "만차"/"붐빔"/"여유" (색이 아니라 단어로, 차량 앱 C-08과 같음) */
export function congestionWord(v: number): string {
  if (v >= 0.95) return '만차'
  if (v >= 0.7) return '붐빔'
  return '여유'
}
