/** 작은 공용 표시 — 상태는 색이 아니라 채움·굵기·단어로 (빨강·초록·그라데이션·그림자 없음) */
import type { ReasonTag } from '@api-types'
import { useEffect, useRef, type ReactNode } from 'react'
import { difficultyLabel, difficultyLevel, formatScore, tagLabel } from '../format'

/** 난이도 막대 5칸 (C-02 · C-08과 같은 표시법). 채운 칸 수 = 등급 */
export function LevelBars({ score, size = 'md' }: { score: number | null; size?: 'sm' | 'md' }) {
  const level = score == null ? 0 : difficultyLevel(score)
  return (
    <span className={`level-bars level-bars--${size}`} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= level ? 'on' : score == null ? 'off dashed' : 'off'} />
      ))}
    </span>
  )
}

/** ★4.3 + 막대 + "어려움". 데이터 부족이면 점선 막대 + "기록 적음" */
export function Difficulty({ score, size = 'md', showLabel = true }: { score: number | null; size?: 'sm' | 'md' | 'lg'; showLabel?: boolean }) {
  const label = difficultyLabel(score)
  return (
    <span className={`difficulty difficulty--${size}`} aria-label={score == null ? `난이도 ${label}` : `난이도 ${formatScore(score)}, ${label}`}>
      <span className="difficulty__score" aria-hidden="true">{formatScore(score)}</span>
      <LevelBars score={score} size={size === 'lg' ? 'md' : 'sm'} />
      {showLabel && <span className="difficulty__label" aria-hidden="true">{label}</span>}
    </span>
  )
}

export function TagChips({ tags, manual = [], empty = '없음' }: { tags: readonly ReasonTag[]; manual?: readonly ReasonTag[]; empty?: string }) {
  if (!tags.length) return <span className="muted">{empty}</span>
  return (
    <span className="chips">
      {tags.map((t) => (
        <span key={t} className={manual.includes(t) ? 'chip chip--manual' : 'chip'} title={manual.includes(t) ? '운영자가 붙인 태그' : '기록으로 붙은 태그'}>
          {tagLabel(t)}
          {manual.includes(t) && <span className="visually-hidden"> (운영자 태그)</span>}
        </span>
      ))}
    </span>
  )
}

/** 시연 데이터(점선 테두리) / 실제(채움) — 단어로 구분 */
export function KindBadge({ demo }: { demo: boolean }) {
  return <span className={demo ? 'badge badge--demo' : 'badge badge--real'}>{demo ? '시연' : '실제'}</span>
}

export function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <p>
        <strong>데이터를 불러올 수 없어요.</strong> {message}
      </p>
      {onRetry && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
          다시 불러오기
        </button>
      )}
    </div>
  )
}

/**
 * 화면 안에서 한 번 더 묻기 (시스템 팝업 없이 — C-10 '기록 모두 지우기'와 같은 방식).
 * 열리면 '그대로 두기'에 포커스가 가서 Enter 한 번으로 지워지지 않는다.
 */
export function InlineConfirm({
  title, detail, confirmLabel, onConfirm, onCancel, busy,
}: {
  title: string
  detail?: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => cancelRef.current?.focus(), [])
  return (
    <div
      className="confirm"
      role="group"
      aria-labelledby="confirm-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
    >
      <p id="confirm-title" className="confirm__title">{title}</p>
      {detail && <p className="confirm__detail">{detail}</p>}
      <div className="confirm__actions">
        <button type="button" className="btn btn--primary" onClick={onConfirm} disabled={busy}>
          {busy ? '지우는 중…' : confirmLabel}
        </button>
        <button type="button" ref={cancelRef} className="btn btn--secondary" onClick={onCancel} disabled={busy}>
          그대로 두기
        </button>
      </div>
    </div>
  )
}

export function Card({ title, aside, children, className = '', id, headingLevel = 2 }: {
  title?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
  id?: string
  headingLevel?: 2 | 3
}) {
  const H = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <section className={`card ${className}`} id={id} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {(title || aside) && (
        <div className="card__head">
          {title && <H className="card__title" id={id ? `${id}-title` : undefined}>{title}</H>}
          {aside && <div className="card__aside">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
