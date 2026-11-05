/**
 * 순서 있는 칩 목록 편집 (층·구역·번호). 키보드만으로: 입력 후 Enter로 추가, 칩마다 ◀ ▶ 옮기기 · × 빼기.
 */
import { useId, useRef, useState, type ReactNode } from 'react'
import { move } from '../validate'

export function ChipListEditor({
  label, values, onChange, placeholder, hint, error, presets, itemName, maxLength = 8, mono = true,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  hint?: ReactNode
  error?: string
  /** 빠른 버튼 [글자, 결과] */
  presets?: { label: string; apply: (cur: string[]) => string[] }[]
  /** 스크린 리더용 이름, 예 '층' */
  itemName: string
  maxLength?: number
  mono?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const inputId = useId()
  const hintId = useId()
  const errId = useId()
  const listRef = useRef<HTMLOListElement>(null)

  function add() {
    const parts = draft.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean)
    if (!parts.length) return
    const next = [...values]
    for (const p of parts) {
      if (p.length > maxLength) {
        setLocalError(`"${p}"이(가) 너무 길어요 (${maxLength}자까지)`)
        return
      }
      if (next.some((x) => x.toUpperCase() === p.toUpperCase())) {
        setLocalError(`"${p}"은(는) 이미 있어요`)
        return
      }
      next.push(p)
    }
    setLocalError(null)
    onChange(next)
    setDraft('')
  }

  function focusChip(i: number, which: 'prev' | 'next' | 'remove') {
    requestAnimationFrame(() => {
      const items = listRef.current?.querySelectorAll<HTMLElement>('li')
      const li = items?.[Math.min(i, (items?.length ?? 1) - 1)]
      const btn = li?.querySelector<HTMLButtonElement>(`[data-act="${which}"]:not(:disabled)`) ?? li?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      btn?.focus()
    })
  }

  const shownError = localError ?? error
  return (
    <fieldset className={`chip-editor${shownError ? ' has-error' : ''}`} aria-describedby={[hint ? hintId : '', shownError ? errId : ''].filter(Boolean).join(' ') || undefined}>
      <legend className="field__label">{label}</legend>
      {values.length === 0 ? (
        <p className="muted chip-editor__empty">아직 없어요</p>
      ) : (
        <ol className="chip-editor__list" ref={listRef}>
          {values.map((v, i) => (
            <li key={`${v}-${i}`} className="chip-editor__chip">
              <span className={mono ? 'mono' : undefined}>{v}</span>
              <button type="button" data-act="prev" aria-label={`${itemName} ${v} 앞으로`} disabled={i === 0}
                onClick={() => { onChange(move(values, i, -1)); focusChip(i - 1, 'prev') }}>◀</button>
              <button type="button" data-act="next" aria-label={`${itemName} ${v} 뒤로`} disabled={i === values.length - 1}
                onClick={() => { onChange(move(values, i, 1)); focusChip(i + 1, 'next') }}>▶</button>
              <button type="button" data-act="remove" aria-label={`${itemName} ${v} 빼기`}
                onClick={() => { onChange(values.filter((_, j) => j !== i)); focusChip(i, 'remove') }}>×</button>
            </li>
          ))}
        </ol>
      )}
      <div className="chip-editor__add">
        <label htmlFor={inputId} className="visually-hidden">{itemName} 추가</label>
        <input
          id={inputId}
          className="input input--sm"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => { setDraft(e.target.value); setLocalError(null) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className="btn btn--secondary btn--sm" onClick={add}>추가</button>
        {presets?.map((p) => (
          <button key={p.label} type="button" className="btn btn--ghost btn--sm" onClick={() => { onChange(p.apply(values)); setLocalError(null) }}>
            {p.label}
          </button>
        ))}
      </div>
      {hint && <p className="field__hint" id={hintId}>{hint}</p>}
      {shownError && <p className="field__error" id={errId} role="alert">{shownError}</p>}
    </fieldset>
  )
}
