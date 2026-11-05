/**
 * 기록 문구 규칙 — "기록은 좋아진 것만 말함"(디자인 메모 ps3), 운전자를 평가하지 않음(기획서 11장).
 * 늘어난 것·나빠진 것은 말하지 않고, 비교할 수 없으면 숫자만 담담하게.
 */
import type { MyParking, MyStatsResponse } from '@api-types'
import { dayLabel, formatCount, formatDuration, reverseText, shortLotName } from './format'
import type { Route } from './router'

/** M-32 큰 글자 두 줄: "1.6번, 지난달보다 / 0.4번 줄었어요" */
export function monthHeadline(s: Pick<MyStatsResponse, 'thisMonthAvgReverse' | 'lastMonthAvgReverse'>): string[] {
  const now = s.thisMonthAvgReverse
  const prev = s.lastMonthAvgReverse
  if (now == null) return ['이번 달은 아직', '기록이 없어요']
  const n = `${formatCount(now)}번`
  if (prev != null) {
    const diff = Math.round((prev - now) * 10) / 10
    if (diff >= 0.1) return [`${n}, 지난달보다`, `${formatCount(diff)}번 줄었어요`]
    if (Math.abs(diff) < 0.1) return [`${n}, 지난달처럼`, '꾸준해요']
  }
  return [`${n}이에요`]
}

export interface Tip {
  text: string
  to: Route
}

const startOfDay = (ms: number) => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * M-20 아래 한 줄 (회색 면). 오늘 주차가 있으면 그 주차 이야기(→ M-33),
 * 아니면 이번 달이 지난달보다 줄었을 때만(→ M-32). 할 말이 없으면 null.
 */
export function homeTip(stats: MyStatsResponse | null, latest: MyParking | null, nowMs: number): Tip | null {
  if (latest?.summary && startOfDay(Date.parse(latest.parkedAt)) === startOfDay(nowMs) && latest.path?.length) {
    const n = latest.summary.reverseCount
    return {
      text: n <= 0 ? '오늘은 후진 없이 바로 댔어요' : `오늘은 후진 ${n}번이면 충분했어요`,
      to: { name: 'record', id: latest.id },
    }
  }
  if (stats?.thisMonthAvgReverse != null && stats.lastMonthAvgReverse != null) {
    const diff = Math.round((stats.lastMonthAvgReverse - stats.thisMonthAvgReverse) * 10) / 10
    if (diff >= 0.1) return { text: `지난달보다 후진이 ${formatCount(diff)}번 줄었어요`, to: { name: 'records' } }
  }
  return null
}

/** M-33 제목: "후진 2번으로 / 주차했어요" */
export function recordTitle(p: MyParking): string[] {
  const n = p.summary?.reverseCount
  if (n == null) return ['이번 주차', '동선이에요']
  if (n <= 0) return ['후진 없이', '주차했어요']
  return [`후진 ${n}번으로`, '주차했어요']
}

/** M-33 설명: "1분 40초 · 아브뉴프랑 판교 B2" */
export function recordSubtitle(p: MyParking): string {
  const where = [shortLotName(p.lotName), p.floor].filter(Boolean).join(' ')
  return p.summary ? `${formatDuration(p.summary.durationSec)} · ${where}` : where
}

/** M-32 목록 둘째 줄: "오늘 · 후진 2번" */
export function recordRowSub(p: MyParking, nowMs: number): string {
  const day = dayLabel(Date.parse(p.parkedAt), nowMs)
  if (p.summary) return `${day} · ${reverseText(p.summary.reverseCount)}`
  return p.floor ? `${day} · ${p.floor}` : day
}

/** M-32 막대: 지난 6개월 (높이는 가장 큰 값 기준) */
export function monthBars(monthly: MyStatsResponse['monthly'], maxH = 91): Array<{ month: string; value: number; h: number }> {
  const list = monthly.slice(-6)
  const max = Math.max(0.1, ...list.map((m) => m.avgReverse))
  return list.map((m) => ({ month: m.month, value: m.avgReverse, h: Math.max(4, Math.round((m.avgReverse / max) * maxH)) }))
}
