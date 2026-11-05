/**
 * 대시보드(D-10~D-12 · D-03) 표시 규칙. 상태는 색이 아니라 회색 5단 채움 + 숫자·단어로 (빨강·초록 없음).
 * 운전자를 평가하는 말은 쓰지 않는다 — 어려운 건 주차장이다.
 */
import { LOT_CATEGORY_LABEL, type LotCategory } from '@api-types'
import { formatCount } from '../format'

/** 회색 5단 (1 옅음 → 5 진함). 시안 지도 범례·히트맵과 같은 값 */
export const LEVEL_FILLS = ['#ebe8e1', '#c9c5bb', '#8a8780', '#5f5d57', '#1e1e1e'] as const

/**
 * 평균 후진 → 5단계. 경계 2.2 · 2.8 · 3.4 · 4.0회 (0.6회 간격, 모든 히트맵이 같은 잣대 —
 * 같은 진하기면 어느 화면에서나 같은 횟수).
 */
export const REVERSE_STEPS = [2.2, 2.8, 3.4, 4.0] as const

export function reverseLevel(v: number): 1 | 2 | 3 | 4 | 5 {
  let level = 1
  for (const s of REVERSE_STEPS) if (v >= s - 1e-9) level += 1
  return level as 1 | 2 | 3 | 4 | 5
}

export function categoryLabel(c: LotCategory | string | null | undefined): string {
  return (c && LOT_CATEGORY_LABEL[c as LotCategory]) || '기타'
}

/** 2.5 → "2.5바퀴", 2 → "2바퀴", 0.3 → "직선"(곧은 경사로), 0 → "없음" */
export function formatRampTurns(turns: number): string {
  if (!(turns > 0)) return '없음'
  if (turns < 0.75) return '직선'
  return `${formatCount(Math.round(turns * 2) / 2)}바퀴`
}

/** 3.2 → "3.2회" (정수도 소수 한 자리: 2 → "2.0회", 시안과 같음) */
export function formatTimes(v: number): string {
  return `${(Math.round(v * 10) / 10).toFixed(1)}회`
}

/** ["B1".."B6"] → "지하 1~6층", ["1F"] → "지상 1층", ["1F","B1","B2"] → "지상 1층 · 지하 1~2층" */
export function formatFloorRange(floors: readonly string[]): string {
  const below = floors.map((f) => /^B(\d+)$/i.exec(f.trim())).filter(Boolean).map((m) => Number(m![1]))
  const above = floors.map((f) => /^(\d+)F$/i.exec(f.trim())).filter(Boolean).map((m) => Number(m![1]))
  const range = (ns: number[]) => {
    const lo = Math.min(...ns)
    const hi = Math.max(...ns)
    return lo === hi ? `${lo}층` : `${lo}~${hi}층`
  }
  const parts: string[] = []
  if (above.length) parts.push(`지상 ${range(above)}`)
  if (below.length) parts.push(`지하 ${range(below)}`)
  return parts.join(' · ') || floors.join(' ')
}

export const PERIODS = [7, 30, 90] as const

export function periodLabel(days: number): string {
  return `최근 ${days}일`
}

/** 비교 대상 기간 이름: 30일 → "지난달", 7일 → "지난주", 그 밖 → "이전 N일" */
export function prevPeriodLabel(days: number): string {
  if (days === 30) return '지난달'
  if (days === 7) return '지난주'
  return `이전 ${days}일`
}

/** 지도 원에 붙이는 짧은 이름: "현대백화점 판교점 지하" → "현대백화점 판교점" */
export function mapLabel(shortName: string): string {
  return shortName.replace(/\s*지하$/, '')
}

/**
 * 6개월 추이 꺾은선 점 (120×32, 시안 D-01·D-03과 같은 틀). 가운데(16) 기준으로 위아래로 펼치되,
 * 높이는 변화량에 비례해서(0.1회 차이를 산처럼 키우지 않게) 6~24px.
 */
export function sparkPoints(values: readonly number[], w = 120, h = 32): [number, number][] {
  if (!values.length) return []
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const d = hi - lo
  const span = Math.min(h - 8, Math.max(6, 6 + 20 * d))
  const mid = h / 2
  const n = values.length
  return values.map((v, i) => [
    Math.round(4 + (n === 1 ? (w - 8) : (i * (w - 8)) / (n - 1))),
    Math.round(d === 0 ? mid : mid - span / 2 + (span * (hi - v)) / d),
  ])
}

/** 막대 눈금 끝: 가장 큰 값의 1.1배를 올림 (3.6 → 4, 3.2 → 4) */
export function barScaleMax(values: readonly number[]): number {
  const max = Math.max(0, ...values)
  return Math.max(1, Math.ceil(max * 1.1 - 1e-9))
}

/** 오늘 날짜 "2026. 11. 3." (한국 시간) */
export function formatToday(ms: number = Date.now()): string {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(ms))
}

// ───────────── 날짜 (한국 시간) ─────────────

/** 오늘 (한국 시간) "2026-11-04" */
export function kstToday(ms: number = Date.now()): string {
  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10)
}

export function addDaysIso(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

const ymd = (date: string) => date.slice(0, 10).split('-').map(Number)

/** "2026-11-03T15:12:00+09:00" 또는 "2026-11-03" → "11월 3일" (적힌 날짜 그대로) */
export function kstMonthDay(iso: string): string {
  const [, m, d] = ymd(iso)
  return `${m}월 ${d}일`
}

/** "2026-11-03T15:12:00+09:00" → "11월 3일 15:12" */
export function kstMonthDayTime(iso: string): string {
  return `${kstMonthDay(iso)} ${iso.slice(11, 16)}`
}

/** 마지막 날 · 일수 → "2026년 10월 6일 ~ 11월 4일" (해가 다르면 둘 다 연도) */
export function periodRangeText(end: string, days: number): string {
  return dateRangeText(addDaysIso(end, -(Math.max(1, days) - 1)), end)
}

export function dateRangeText(from: string, to: string): string {
  const [y1, m1, d1] = ymd(from)
  const [y2, m2, d2] = ymd(to)
  return y1 === y2 ? `${y1}년 ${m1}월 ${d1}일 ~ ${m2}월 ${d2}일` : `${y1}년 ${m1}월 ${d1}일 ~ ${y2}년 ${m2}월 ${d2}일`
}

/** 층 목록 → "지하 1~6층", 지상 한 층뿐이면 "지상 평면" (시안 D-10) */
export function floorRangeText(floors: readonly string[]): string {
  if (floors.length === 1 && /^\d+F$/i.test(floors[0].trim())) return '지상 평면'
  return formatFloorRange(floors)
}
