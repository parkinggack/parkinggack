/**
 * 화면 공통 부품 — 시안(docs/design/M-*.dc.html)의 인라인 스타일을 그대로 옮긴 것.
 * 흰 바탕 + 회색 면(#f4f3ef), 테두리·그림자 없음, 주 버튼은 아래 하나(56px, 반지름 16), 보조는 글자 버튼(48px).
 */
import type { ComponentChildren, JSX } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { COPY } from '../copy'
import { barsFilled } from '../format'
import { goBack, navigate, routePath, type Route, type Tab } from '../router'

// ───────────── 로고 · 그림 조각 ─────────────

/** 로고: 둥근 사각형 + P + 주차 칸 모서리. inverse = 흰 판에 먹색 글자(어두운 바탕 위). label 이 있으면 그림 이름(홈 머리) */
export function Logo({ size = 28, inverse = false, label }: { size?: number; inverse?: boolean; label?: string }) {
  // CSS 변수는 SVG 속성(fill=)에 못 쓰므로 style로 (다크 테마에서 판·글자 색이 뒤집힘)
  const bg = inverse ? '#ffffff' : 'var(--logo-bg)'
  const fg = inverse ? '#1e1e1e' : 'var(--logo-fg)'
  return (
    <svg role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'} width={size} height={size} viewBox="0 0 48 48" class="logo">
      <rect width="48" height="48" rx="13" style={{ fill: bg }} />
      <path d="M15 36V12h9a7 7 0 0 1 0 14h-9" fill="none" style={{ stroke: fg }} stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M27 38h8a3 3 0 0 0 3-3v-8" fill="none" style={{ stroke: fg }} stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}

/** 위에서 본 차 (그림 모티프). w = 차 폭(px), 앞(앞유리 큰 쪽)이 위. rot = 시계 방향 도 */
export function CarTop({ x, y, w = 37.5, rot = 0, fill = '#f4f3ef', glass = '#1e1e1e' }: { x: number; y: number; w?: number; rot?: number; fill?: string; glass?: string }) {
  const s = w / 37.5
  const f = (n: number) => Math.round(n * s * 10) / 10
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={f(-18.75)} y={f(-35)} width={f(37.5)} height={f(70)} rx={f(11.2)} fill={fill} />
      <rect x={f(-13.75)} y={f(-21.2)} width={f(27.5)} height={f(12.5)} rx={f(3.8)} fill={glass} fill-opacity="0.85" />
      <rect x={f(-12.5)} y={f(20)} width={f(25)} height={f(7.5)} rx={f(2.5)} fill={glass} fill-opacity="0.6" />
    </g>
  )
}

// ───────────── 아이콘 ─────────────

export function BackIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

export function ChevronIcon({ color = 'var(--line-strong)', size = 20, width = 2.2 }: { color?: string; size?: number; width?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ stroke: color }} stroke-width={width} stroke-linecap="round" stroke-linejoin="round" class="shrink0">
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

/** 주차왕 (왕관) — 탭·1등·배지 */
export function CrownIcon({ size = 24, width = 2.2 }: { size?: number; width?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={width} stroke-linecap="round" stroke-linejoin="round" class="shrink0">
      <path d="M4 18h16" />
      <path d="M5 15.5L3.5 7l5 4L12 5l3.5 6 5-4-1.5 8.5z" />
    </svg>
  )
}

/** 깃발 — 다음 등수 힌트 · 개척자 배지 */
export function FlagIcon({ size = 20, width = 2.2 }: { size?: number; width?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={width} stroke-linecap="round" stroke-linejoin="round" class="shrink0">
      <path d="M6 21V4" />
      <path d="M6 4h11l-2 4 2 4H6" />
    </svg>
  )
}

/** 위 화살표 — 올라왔어요 */
export function UpIcon({ size = 18, width = 2.4 }: { size?: number; width?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={width} stroke-linecap="round" stroke-linejoin="round" class="shrink0">
      <path d="M12 19V6" />
      <path d="M6.5 11.5L12 6l5.5 5.5" />
    </svg>
  )
}

/** 체크 — 깔끔한 한 주 배지 */
export function CheckIcon({ size = 18, width = 2.2 }: { size?: number; width?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={width} stroke-linecap="round" stroke-linejoin="round" class="shrink0">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export function ChevronDownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="shrink0">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

/** 공유 (위로 나가는 화살표 + 상자) */
export function ShareIcon({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink0">
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 13v6h14v-6" />
    </svg>
  )
}

// ───────────── 난이도 막대 5칸 (숫자와 함께, 색만으로 구분하지 않음) ─────────────

export function Bars({ score, big = false }: { score: number | null | undefined; big?: boolean }) {
  const filled = barsFilled(score)
  const heights = big ? [12, 16, 21, 26, 30] : [8, 11, 14, 17, 20]
  return (
    <span aria-hidden="true" class={big ? 'bars bars-big' : 'bars'}>
      {heights.map((h, i) => (
        <span key={i} class={i < filled ? 'bar on' : 'bar'} style={{ height: `${h}px` }} />
      ))}
    </span>
  )
}

// ───────────── 레이아웃 ─────────────

/** 위쪽 뒤로 가기 줄 (48px) */
export function TopBar({ back, right }: { back?: Route | (() => void); right?: ComponentChildren }) {
  const onBack = () => {
    if (!back) return
    if (typeof back === 'function') back()
    else goBack(back)
  }
  return (
    <div class="topbar">
      {back ? (
        <button type="button" class="icon-btn" aria-label={COPY.back} onClick={onBack}>
          <BackIcon />
        </button>
      ) : (
        <span />
      )}
      {right}
    </div>
  )
}

/** 제목 26px 굵게 (줄바꿈 \n) + 한 줄 설명 */
export function Title({ text, desc, id }: { text: string | string[]; desc?: ComponentChildren; id?: string }) {
  const lines = Array.isArray(text) ? text : text.split('\n')
  return (
    <div class="title-block">
      <h1 class="title" id={id}>
        {lines.map((l, i) => (
          <>
            {i > 0 && <br />}
            {l}
          </>
        ))}
      </h1>
      {desc ? <p class="desc">{desc}</p> : null}
    </div>
  )
}

/** 화면 아래 고정 버튼 자리 (흰 바탕) */
export function BottomCTA({ children }: { children: ComponentChildren }) {
  return <div class="cta">{children}</div>
}

interface BtnProps {
  variant?: 'primary' | 'secondary' | 'text' | 'white'
  busy?: boolean
  disabled?: boolean
  onClick?: () => void
  children: ComponentChildren
  label?: string
}

export function Button({ variant = 'primary', busy, children, disabled, onClick, label }: BtnProps) {
  return (
    <button type="button" class={`btn btn-${variant}`} disabled={disabled || busy} aria-busy={busy ? 'true' : undefined} aria-label={label} onClick={onClick}>
      {children}
    </button>
  )
}

/** 앱 안 링크 (a 요소라 길게 눌러 새 탭도 됨) */
export function Link({
  to,
  class: cls,
  children,
  label,
  keepHash,
  current,
}: {
  to: Route | string
  class?: string
  children: ComponentChildren
  label?: string
  keepHash?: boolean
  current?: boolean
}) {
  const href = typeof to === 'string' ? to : hrefOf(to)
  return (
    <a
      href={href}
      class={cls}
      aria-label={label}
      aria-current={current ? 'page' : undefined}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(to, { keepHash })
      }}
    >
      {children}
    </a>
  )
}

function hrefOf(r: Route): string {
  const base = import.meta.env.BASE_URL ?? '/'
  return (base.endsWith('/') ? base.slice(0, -1) : base) + routePath(r)
}

// ───────────── 아래 탭 (M-20 · M-30 · M-50 · M-32 · M-40) ─────────────

const TABS: Array<{ tab: Tab; label: string; route: Route; icon: (active: boolean) => JSX.Element }> = [
  {
    tab: 'home',
    label: '홈',
    route: { name: 'home' },
    icon: (a) => (
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={a ? 2.2 : 1.8} stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 11l8-7 8 7" />
        <path d="M6 9.5V20h12V9.5" />
      </svg>
    ),
  },
  {
    tab: 'lots',
    label: '주차장',
    route: { name: 'lots' },
    icon: (a) => (
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={a ? 2.2 : 1.8} stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 21s-6-5.4-6-10.5a6 6 0 0 1 12 0C18 15.6 12 21 12 21z" />
        <circle cx="12" cy="10.5" r="2.2" />
      </svg>
    ),
  },
  {
    tab: 'king',
    label: '주차왕',
    route: { name: 'king' },
    icon: (a) => <CrownIcon size={24} width={a ? 2.2 : 1.8} />,
  },
  {
    tab: 'records',
    label: '기록',
    route: { name: 'records' },
    icon: (a) => (
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={a ? 2.2 : 1.8} stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 20h16" />
        <path d="M7 16v-5M12 16V6M17 16v-3" />
      </svg>
    ),
  },
  {
    tab: 'settings',
    label: '설정',
    route: { name: 'settings' },
    icon: (a) => (
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={a ? 2.2 : 1.8} stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
      </svg>
    ),
  },
]

export function TabBar({ active }: { active: Tab }) {
  return (
    <nav class="tabbar" aria-label="주요 메뉴">
      {TABS.map((t) => (
        <Link key={t.tab} to={t.route} class={t.tab === active ? 'tab tab-on' : 'tab'} current={t.tab === active}>
          <span class="tab-inner">
            {t.icon(t.tab === active)}
            {t.label}
          </span>
        </Link>
      ))}
    </nav>
  )
}

// ───────────── 토글 · 알림 줄 ─────────────

export function Toggle({ label, checked, onChange, note }: { label: string; checked: boolean; onChange: (v: boolean) => void; note?: string }) {
  return (
    <div class="toggle-row">
      <span class="toggle-text">
        <span class="toggle-label">{label}</span>
        {note ? <span class="toggle-note">{note}</span> : null}
      </span>
      <button type="button" role="switch" aria-checked={checked ? 'true' : 'false'} aria-label={label} class={checked ? 'switch on' : 'switch'} onClick={() => onChange(!checked)}>
        <span class="knob" />
      </button>
    </div>
  )
}

/** 잠깐 떴다 사라지는 한 줄 (role=status) */
export function Toast({ text }: { text: string }) {
  return (
    <p class={text ? 'toast toast-on' : 'toast'} role="status" aria-live="polite">
      {text}
    </p>
  )
}

/**
 * 아래에서 올라오는 시트 (스프링으로 올라옴 — style.css .sheet). 바깥(어두운 막)·Esc·닫기 버튼으로 닫힘.
 * 열면 시트에 초점, 닫으면 연 버튼으로 되돌림.
 */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ComponentChildren }) {
  const [shown, setShown] = useState(open)
  const [closing, setClosing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)
  useLayoutEffect(() => {
    if (open) {
      opener.current = document.activeElement
      setShown(true)
      setClosing(false)
    } else if (shown) {
      setClosing(true)
      // 내려가는 움직임이 끝나면 (animationend 가 없을 때를 대비해 시간으로도)
      const id = setTimeout(() => {
        setShown(false)
        setClosing(false)
      }, 220)
      ;(opener.current as HTMLElement | null)?.focus?.({ preventScroll: true })
      return () => clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => {
    if (!open || !shown) return
    ref.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, shown])
  if (!shown) return null
  return (
    <div class={closing ? 'sheet-wrap sheet-closing' : 'sheet-wrap'}>
      <div class="sheet-scrim" onClick={onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        {children}
      </div>
    </div>
  )
}

/** 큰 글자가 칸보다 넓으면 줄인다 (긴 구역 이름 등) */
export function useFitText(deps: unknown[]) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.querySelectorAll<HTMLElement>('[data-fit]').forEach((t) => {
        t.style.fontSize = ''
        const avail = (t.parentElement?.clientWidth ?? t.clientWidth) - 32
        const need = t.scrollWidth
        if (avail > 0 && need > avail) {
          const size = parseFloat(getComputedStyle(t).fontSize)
          t.style.fontSize = `${Math.floor(size * (avail / need) * 0.98)}px`
        }
      })
    }
    fit()
    document.fonts?.ready.then(fit).catch(() => {})
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}

/** 불러오는 중·오류 (한 줄 + 다시) */
export function Status({ loading, error, onRetry }: { loading?: boolean; error?: string | null; onRetry?: () => void }) {
  if (loading)
    return (
      <p class="status" role="status">
        {COPY.loading}
      </p>
    )
  if (error)
    return (
      <div class="status" role="status">
        <span>{error}</span>
        {onRetry ? (
          <button type="button" class="link-btn" onClick={onRetry}>
            {COPY.retry}
          </button>
        ) : null}
      </div>
    )
  return null
}
