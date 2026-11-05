/** 대시보드 작은 그림들 — 시안 D-10~D-12 · D-03 의 막대 · 꺾은선과 같은 크기·간격 */
import { difficultyLevel } from '../format'
import { formatTimes, sparkPoints } from './format'

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" className="d-logo">
      <rect width="48" height="48" rx="13" fill="#1e1e1e" />
      <path d="M15 36V12h9a7 7 0 0 1 0 14h-9" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 38h8a3 3 0 0 0 3-3v-8" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 난이도 막대 5칸 (D-03 표): 채운 칸 = 등급 */
export function DLevelBars({ score, size = 'md' }: { score: number | null; size?: 'md' | 'lg' }) {
  const level = score == null ? 0 : difficultyLevel(score)
  return (
    <span className={`d-bars d-bars--${size}`} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= level ? 'is-on' : score == null ? 'is-off is-dashed' : 'is-off'} />
      ))}
    </span>
  )
}

/**
 * v2 난이도 막대 5칸: card = D-10 카드 (8px 폭, 10~26px), head = D-11 머리 (9px 폭, 11~28px).
 * 채운 칸 = 등급, 빈 칸은 테두리만 (색이 아니라 채움으로).
 */
export function LevelBars({ level, size }: { level: number; size: 'card' | 'head' }) {
  return (
    <span className={`v2-bars v2-bars--${size}`} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= level ? 'is-on' : 'is-off'} />)}
    </span>
  )
}

/** 6개월 추이 꺾은선 (120×32) + 끝 점 */
export function Sparkline({ values }: { values: readonly number[] }) {
  const pts = sparkPoints(values)
  if (!pts.length) return <svg aria-hidden="true" width="120" height="32" className="d-spark" />
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg aria-hidden="true" width="120" height="32" viewBox="0 0 120 32" className="d-spark">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#1e1e1e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3" fill="#1e1e1e" />
    </svg>
  )
}

/** 화면 낭독기용 꺾은선 설명: "6개월 전 3.4회 → 지금 3.2회" */
export function trendText(values: readonly number[]): string {
  if (!values.length) return '추이 없음'
  return `6개월 전 ${formatTimes(values[0])} → 지금 ${formatTimes(values[values.length - 1])}`
}

export function DLoading() {
  return <p className="d-loading" role="status">불러오는 중…</p>
}
