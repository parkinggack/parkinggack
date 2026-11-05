import type { Parking } from './payload'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** "방금 전" · "25분 전" · "2시간 10분 전" · "3시간 전" · "2일 전" */
export function formatElapsed(parkedAtMs: number, nowMs: number): string {
  const d = Math.max(0, nowMs - parkedAtMs)
  if (d < MIN) return '방금 전'
  if (d < HOUR) return `${Math.floor(d / MIN)}분 전`
  if (d < DAY) {
    const h = Math.floor(d / HOUR)
    const m = Math.floor((d % HOUR) / MIN)
    return m ? `${h}시간 ${m}분 전` : `${h}시간 전`
  }
  return `${Math.floor(d / DAY)}일 전`
}

/** "오후 2:52" (기기 시간대) */
export function formatClock(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours()
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h < 12 ? '오전' : '오후'} ${h12}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "오후 2:52 주차" · "어제 오후 2:52 주차" · "11월 1일 오후 2:52 주차" */
export function formatParkedAt(parkedAtMs: number, nowMs: number): string {
  const p = new Date(parkedAtMs)
  const now = new Date(nowMs)
  const dayDiff = Math.round((startOfDay(now) - startOfDay(p)) / DAY)
  let prefix = ''
  if (dayDiff === 1) prefix = '어제 '
  else if (dayDiff !== 0) {
    prefix = `${p.getMonth() + 1}월 ${p.getDate()}일 `
    if (p.getFullYear() !== now.getFullYear()) prefix = `${p.getFullYear()}년 ${prefix}`
  }
  return `${prefix}${formatClock(parkedAtMs)} 주차`
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** "오후 2:52 주차 · 2시간 10분 전" */
export function formatWhen(parkedAtMs: number, nowMs: number): string {
  return `${formatParkedAt(parkedAtMs, nowMs)} · ${formatElapsed(parkedAtMs, nowMs)}`
}

export interface Spot {
  /** "B2" (없으면 '') */
  floor: string
  /** "D-07" · "D" · "07" (없으면 '') */
  zoneNumber: string
  /** zoneNumber 위 작은 라벨: "구역 · 기둥" · "구역" · "기둥" */
  zoneLabel: string
  /** 짧은 요약: "B2 · D-07" */
  title: string
}

export function spotOf(p: Pick<Parking, 'f' | 'z' | 'n'>): Spot {
  const zoneNumber = p.z && p.n ? `${p.z}-${p.n}` : p.z || p.n
  const zoneLabel = p.z && p.n ? '구역 · 기둥' : p.z ? '구역' : p.n ? '기둥' : ''
  const title = [p.f, zoneNumber].filter(Boolean).join(' · ') || '위치 미기록'
  return { floor: p.f, zoneNumber, zoneLabel, title }
}

// ───────────── 짝꿍 앱 (M-10~M-40) ─────────────

/** 홈·M-01 짧은 경과: "방금 전" · "25분 전" · "2시간 전" · "3일 전" */
export function formatAgo(atMs: number, nowMs: number): string {
  const d = Math.max(0, nowMs - atMs)
  if (d < MIN) return '방금 전'
  if (d < HOUR) return `${Math.floor(d / MIN)}분 전`
  if (d < DAY) return `${Math.floor(d / HOUR)}시간 전`
  return `${Math.floor(d / DAY)}일 전`
}

/** 기록 목록 날짜: "오늘" · "어제" · "11월 1일" · "2025년 11월 1일" */
export function dayLabel(atMs: number, nowMs: number): string {
  const p = new Date(atMs)
  const now = new Date(nowMs)
  const diff = Math.round((startOfDay(now) - startOfDay(p)) / DAY)
  if (diff === 0) return '오늘'
  if (diff === 1) return '어제'
  const md = `${p.getMonth() + 1}월 ${p.getDate()}일`
  return p.getFullYear() === now.getFullYear() ? md : `${p.getFullYear()}년 ${md}`
}

/** "1분 40초" · "45초" · "2분" */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (!m) return `${r}초`
  return r ? `${m}분 ${r}초` : `${m}분`
}

/** 평균값: 1.6 → "1.6", 2 → "2", 2.04 → "2" */
export function formatCount(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/** 난이도 점수 "4.3" · "2.0" (없으면 "–") */
export function formatScore(score: number | null | undefined): string {
  return score == null || !Number.isFinite(score) ? '–' : (Math.round(score * 10) / 10).toFixed(1)
}

/** "후진 없이" · "후진 2번" */
export function reverseText(n: number): string {
  return n <= 0 ? '후진 없이' : `후진 ${n}번`
}

/** 난이도 점수 0~5 → 막대 5칸 중 채울 칸 수 */
export function barsFilled(score: number | null | undefined): number {
  if (score == null || !Number.isFinite(score)) return 0
  return Math.max(0, Math.min(5, Math.round(score)))
}

/** 기획서 9장 5단계. 주차장 이야기라 운전자를 평가하지 않는다 */
export function difficultyLabel(score: number | null | undefined): string {
  if (score == null) return '아직 기록이 적어요'
  return ['아주 쉬워요', '아주 쉬워요', '쉬워요', '보통이에요', '어려워요', '아주 어려워요'][barsFilled(score)]
}

/**
 * 주차장 이름을 화면용으로 짧게: "아브뉴프랑 판교 주차장" → "아브뉴프랑 판교",
 * "현대백화점 판교점 지하주차장" → "현대백화점 판교점", "화랑공원 공영주차장" → "화랑공원 공영", "집 · 백현마을 5단지" → "백현마을 5단지"
 */
export function shortLotName(name: string): string {
  const full = name.trim()
  let s = full.replace(/^(집|회사|학교)\s*[·:]\s*/, '')
  s = s.replace(/\s*공영\s*주차장$/, ' 공영').replace(/\s*(지하|지상|부설|노상)?\s*주차장$/, '')
  return s.trim() || full
}

/** 걷는 시간 (분): 직선거리 × 1.25(길 돌아감) ÷ 75m/분 */
export function walkMinutes(distanceM: number): number {
  return Math.max(1, Math.round((distanceM * 1.25) / 75))
}

/** "바로 앞" · "걸어서 4분" */
export function walkLabel(distanceM: number | null | undefined): string {
  if (distanceM == null || !Number.isFinite(distanceM)) return ''
  if (distanceM <= 120) return '바로 앞'
  return `걸어서 ${walkMinutes(distanceM)}분`
}

/** 층별 혼잡 0..1 → 낱말 (색이 아니라 단어로) */
export function congestionWord(occupancy: number): string {
  if (occupancy >= 0.97) return '만차'
  if (occupancy >= 0.85) return '꽉 참'
  if (occupancy >= 0.5) return '여유'
  return '넉넉'
}

/** "2026-06" → "6월" */
export function monthLabel(month: string): string {
  const m = /^\d{4}-(\d{1,2})$/.exec(month)
  return m ? `${Number(m[1])}월` : month
}

/** 위치 요약 "B2 · D-07" (MyParking 필드 이름으로) */
export function spotTitle(p: { floor?: string | null; zone?: string | null; number?: string | null }): string {
  return spotOf({ f: p.floor ?? '', z: p.zone ?? '', n: p.number ?? '' }).title
}

/** 두 좌표 사이 거리 (m) */
export function distanceBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
