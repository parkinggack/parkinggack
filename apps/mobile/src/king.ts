/**
 * 주차왕(v1.2) 화면 값 — 순수 함수 (테스트: king.test.ts). 화면은 screens/King.tsx.
 * 메모 ps4: 순위는 종합 점수 하나(후진·핸들 70 + 가 본 주차장 15 + 지난달보다 나아진 만큼 15), 리그 = 동네 × 운전 경력,
 * 매주 월요일 00:00(한국 시각) 새로 시작. 운전자를 평가하지 않는다 — 내려간 것은 말하지 않고 다음에 할 일만.
 */
import type { DrivingExperience, KingBoardResponse, KingBoardRow, KingGrade, KingLeague, KingMeResponse, KingParkingRow, KingResultResponse, KingScore } from '@api-types'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
/** 리그 주기는 한국 시각 (기기 시간대와 상관없이) */
const KST = 9 * HOUR

export const KING_GRADE_LABEL: Record<KingGrade, string> = { CLEAN: '깔끔', OK: '보통', EXCLUDED: '빠짐' }

/** 순위판 제목 (서버 league.label 과 같은 규칙 — 서버가 리그를 안 줄 때만 씀) */
export const LEAGUE_SHORT: Record<DrivingExperience, string> = { UNDER_1Y: '초보', Y1_3: '새내기', Y3_10: '중수', OVER_10Y: '베테랑', UNKNOWN: '모두' }
const LEAGUE_LONG: Record<DrivingExperience, string> = { UNDER_1Y: '1년 미만', Y1_3: '1~3년', Y3_10: '3~10년', OVER_10Y: '10년 넘게', UNKNOWN: '모든 경력' }

export const DEFAULT_REGION = { id: 'pangyo', name: '판교' } as const

export const kingRank = (n: number) => `${n}등`
export const kingPoints = (n: number) => `${n}점`

// ───────────── 한국 시각 날짜 ─────────────

function kst(ms: number) {
  const d = new Date(ms + KST)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay() }
}

/** 그 시각이 든 주의 월요일 00:00 (KST) */
export function weekStartKst(ms: number): number {
  const p = kst(ms)
  const midnight = Date.UTC(p.y, p.m - 1, p.d) - KST
  return midnight - ((p.wd + 6) % 7) * DAY
}

const WEEKDAY = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

/** M-51 "오늘" · "월요일" (이번 주) · "11월 1일" (그 전) */
export function kingDayLabel(ms: number, now: number): string {
  const a = kst(ms)
  const b = kst(now)
  if (a.y === b.y && a.m === b.m && a.d === b.d) return '오늘'
  if (ms >= weekStartKst(now) && ms <= now) return WEEKDAY[a.wd]
  return `${a.m}월 ${a.d}일`
}

/** "11월 2일 ~ 8일" · "10월 26일 ~ 11월 1일" (끝은 다음 월요일 00:00 → 그 전날) */
export function weekRangeLabel(week: { start: string; end: string }): string {
  const s = kst(Date.parse(week.start))
  const e = kst(Date.parse(week.end) - 1)
  return s.m === e.m ? `${s.m}월 ${s.d}일 ~ ${e.d}일` : `${s.m}월 ${s.d}일 ~ ${e.m}월 ${e.d}일`
}

// ───────────── 리그 ─────────────

/** "판교 · 1년 미만" — 서버 리그가 있으면 그것, 없으면(참여 전) 동네 + 차의 운전 경력으로 */
export function leagueLongLabel(league: KingLeague | null | undefined, fallback: { regionName?: string; experience?: DrivingExperience | null } = {}): string {
  if (league?.longLabel) return league.longLabel
  return `${fallback.regionName ?? DEFAULT_REGION.name} · ${LEAGUE_LONG[fallback.experience ?? 'UNKNOWN']}`
}

export function leagueShortLabel(league: KingLeague | null | undefined, fallback: { regionName?: string; experience?: DrivingExperience | null } = {}): string {
  if (league?.label) return league.label
  return `${fallback.regionName ?? DEFAULT_REGION.name} ${LEAGUE_SHORT[fallback.experience ?? 'UNKNOWN']}`
}

// ───────────── M-50 위 카드 ─────────────

/** "판교 초보 148명 중 · 82점" (이번 주 점수가 없으면 "판교 초보 148명이 겨루고 있어요") */
export function kingSummary(me: Pick<KingMeResponse, 'league' | 'total' | 'rank' | 'score'>): string {
  const label = leagueShortLabel(me.league)
  if (me.rank == null || !me.score) return `${label} ${me.total}명이 겨루고 있어요`
  return `${label} ${me.total}명 중 · ${kingPoints(me.score.total)}`
}

/**
 * 위 카드 아래 한 줄. 올라왔으면 화살표와 함께 "지난주 17등에서 올라왔어요".
 * 내려간 것은 말하지 않는다 → 다음 등수 힌트(서버 nextHint) 또는 "점수 자세히 볼게요".
 */
export function kingMovement(me: Pick<KingMeResponse, 'rank' | 'prevWeekRank' | 'nextHint'>): { text: string; up: boolean } {
  if (me.rank == null) return { text: '주차하면 이번 주 순위가 생겨요', up: false }
  const prev = me.prevWeekRank
  if (prev == null) return { text: '이번 주 처음 순위에 올랐어요', up: false }
  if (prev > me.rank) return { text: `지난주 ${kingRank(prev)}에서 올라왔어요`, up: true }
  if (prev === me.rank) return { text: `지난주와 같은 ${kingRank(me.rank)}이에요`, up: false }
  return { text: me.nextHint ?? '점수 자세히 볼게요', up: false }
}

/** 위 카드 링크 이름 (스크린 리더) "이번 주 12등, 82점. 점수 자세히 보기" */
export function kingCardLabel(me: Pick<KingMeResponse, 'rank' | 'score'>): string {
  if (me.rank == null || !me.score) return '이번 주 순위 전. 점수 자세히 보기'
  return `이번 주 ${kingRank(me.rank)}, ${kingPoints(me.score.total)}. 점수 자세히 보기`
}

// ───────────── M-50 목록: 상위 5 + ··· + 내 앞뒤 ─────────────

export type BoardItem = { kind: 'row'; row: KingBoardRow } | { kind: 'gap'; key: string }

const rowKey = (r: KingBoardRow) => `${r.rank}:${r.nickname}`

/**
 * 서버는 top(1~5등)과 around(내 앞·나·뒤, top 과 겹치면 빠짐)를 준다. 그래도 겹치면 한 번만 (같은 등수 동점자는 둘 다).
 * 사이가 비면 "···" 한 줄. 내가 5등 안이면 around = [] → 상위 5만.
 */
export function boardItems(board: Pick<KingBoardResponse, 'top' | 'around'>): BoardItem[] {
  const top = [...board.top].sort((a, b) => a.rank - b.rank)
  const byKey = new Map(top.map((r) => [rowKey(r), r]))
  const around: KingBoardRow[] = []
  for (const r of [...board.around].sort((a, b) => a.rank - b.rank)) {
    const dup = byKey.get(rowKey(r))
    if (dup) {
      if (r.isMe && !dup.isMe) byKey.set(rowKey(r), { ...dup, isMe: true })
      continue
    }
    byKey.set(rowKey(r), r)
    around.push(r)
  }
  const items: BoardItem[] = top.map((r) => ({ kind: 'row', row: byKey.get(rowKey(r))! }))
  const lastTop = top.length ? top[top.length - 1].rank : 0
  around.forEach((r, i) => {
    const prevRank = i === 0 ? lastTop : around[i - 1].rank
    if (items.length && r.rank > prevRank + 1) items.push({ kind: 'gap', key: `gap-${r.rank}` })
    items.push({ kind: 'row', row: r })
  })
  return items
}

// ───────────── M-51 내 점수 자세히 ─────────────

export interface ScorePart {
  key: 'maneuver' | 'lotsVisited' | 'improvement'
  label: string
  value: number
  max: number
  /** 막대 채움 % (정수) */
  pct: number
}

const PARTS: Array<Pick<ScorePart, 'key' | 'label' | 'max'>> = [
  { key: 'maneuver', label: '후진·핸들', max: 70 },
  { key: 'lotsVisited', label: '가 본 주차장', max: 15 },
  { key: 'improvement', label: '지난달보다 나아진 만큼', max: 15 },
]

/** 58/70 → 83%, 11/15 → 73%, 13/15 → 87% */
export function scoreParts(score: KingScore): ScorePart[] {
  return PARTS.map((p) => {
    const value = Math.max(0, Math.min(p.max, Math.round(score[p.key] ?? 0)))
    return { ...p, value, pct: Math.round((value / p.max) * 100) }
  })
}

export const SPEED_TEXT = '주차장 안에서 시속 10km를 넘었어요'

/** "오늘 · 후진 1번" · "수요일 · 주차장 안에서 시속 10km를 넘었어요" */
export function kingParkingSub(row: Pick<KingParkingRow, 'parkedAt' | 'reverseCount' | 'grade' | 'excludedReason'>, now: number): string {
  const day = kingDayLabel(Date.parse(row.parkedAt), now)
  if (row.grade === 'EXCLUDED') return `${day} · ${row.excludedReason === 'SPEED' ? SPEED_TEXT : '이번 점수에서는 빠졌어요'}`
  return `${day} · 후진 ${Math.max(0, Math.round(row.reverseCount))}번`
}

// ───────────── M-53 지난주 결과 ─────────────

export function resultWeekLine(r: Pick<KingResultResponse, 'week'>): string {
  return `지난주 결과 · ${weekRangeLabel(r.week)}`
}

/** ["판교 · 1년 미만 리그에서", "9등 했어요"] */
export function resultTitle(r: Pick<KingResultResponse, 'league' | 'rank'>): [string, string] {
  return [`${leagueLongLabel(r.league)} 리그에서`, `${kingRank(r.rank)} 했어요`]
}

/** "148명 중 · 상위 6%" */
export function resultSub(r: Pick<KingResultResponse, 'total' | 'percentile'>): string {
  return `${r.total}명 중 · 상위 ${Math.max(1, Math.min(100, Math.round(r.percentile)))}%`
}

/** "지난주보다 3계단 올랐어요" — 내려간 것은 말하지 않음 */
export function resultDelta(r: Pick<KingResultResponse, 'rankDelta'>): string {
  const d = r.rankDelta
  if (d == null) return '처음 받은 주차왕 결과예요'
  if (d > 0) return `지난주보다 ${d}계단 올랐어요`
  if (d === 0) return '지난주와 같은 자리를 지켰어요'
  return '이번 주도 차근차근 함께해요'
}

// ───────────── M-53 한 주에 한 번 ─────────────

/** 새 결과(지난번에 본 주와 다름)면 보여 준다 */
export function shouldShowResult(r: Pick<KingResultResponse, 'week'> | null | undefined, seenWeekStart: string | null): boolean {
  return !!r && typeof r.week?.start === 'string' && r.week.start !== seenWeekStart
}
