/**
 * 스프링 — 감쇠 조화 진동자 하나로 화면 전환·누름·토스트·시트·차 그림의 '멈출 때 출렁임'을 같이 맞춘다.
 *
 *   m·y'' = −k·y − c·y'      (y = 목표에서 떨어진 거리)
 *
 * 닫힌 꼴(부족·임계·과감쇠 모두)로 푸니 프레임이 빠져도 같은 자리에 있다. 쓰는 곳은 두 가지:
 *  (a) requestAnimationFrame 으로 값 하나를 움직이기 (animateSpring)
 *  (b) CSS transition/animation·Web Animations 용 `linear()` 이징 글자 (springEasing) — 합성 스레드에서 돈다.
 *      linear()를 모르는 브라우저는 cubic-bezier 로 (style.css 의 `@supports not (animation-timing-function: linear(0, 1))`).
 */

export interface Spring {
  stiffness: number
  damping: number
  mass: number
}

/** 화면 전환 (밀어 넣기·뒤로): ζ≈0.81 → 1.4%쯤 살짝 넘었다 돌아옴 (iOS 느낌) */
export const SPRING_SCREEN: Spring = { stiffness: 260, damping: 26, mass: 1 }
/** 아래에서 올라오는 화면·시트: 같은 강성에 임계 감쇠(ζ=1) — 넘치면 아래 가장자리에 틈이 보여서 */
export const SPRING_SHEET: Spring = { stiffness: 260, damping: 2 * Math.sqrt(260), mass: 1 }
/** 탭 바꾸기 내용·토스트: 조금 더 통통 (ζ≈0.62) */
export const SPRING_POP: Spring = { stiffness: 380, damping: 24, mass: 1 }
/** 눌렀다 뗄 때 (0.97 → 1): 빠르고 통통 (ζ≈0.57) */
export const SPRING_PRESS: Spring = { stiffness: 600, damping: 28, mass: 1 }
/** 차가 멈출 때 앞이 살짝 숙였다 돌아옴 (ζ≈0.35) */
export const SPRING_SETTLE: Spring = { stiffness: 520, damping: 16, mass: 1 }

/** linear()를 못 쓰는 브라우저용 — 살짝 넘침 / 넘침 없음 */
export const FALLBACK_SPRING = 'cubic-bezier(0.22, 1.1, 0.36, 1)'
export const FALLBACK_SMOOTH = 'cubic-bezier(0.2, 0.9, 0.3, 1)'

export function dampingRatio(s: Spring): number {
  return s.damping / (2 * Math.sqrt(s.stiffness * s.mass))
}

/** 목표에서 y0 만큼, 속도 v0 로 놓았을 때 t초 뒤 (목표 기준 거리 y, 속도 v) */
export function springDisplacement(s: Spring, t: number, y0: number, v0 = 0): { y: number; v: number } {
  const w0 = Math.sqrt(s.stiffness / s.mass)
  const zeta = dampingRatio(s)
  if (t <= 0) return { y: y0, v: v0 }
  if (Math.abs(zeta - 1) < 1e-6) {
    // 임계: y = (a + b t) e^(−w0 t)
    const a = y0
    const b = v0 + w0 * y0
    const e = Math.exp(-w0 * t)
    return { y: (a + b * t) * e, v: (b - w0 * (a + b * t)) * e }
  }
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    const a = y0
    const b = (v0 + zeta * w0 * y0) / wd
    const e = Math.exp(-zeta * w0 * t)
    const cos = Math.cos(wd * t)
    const sin = Math.sin(wd * t)
    const y = e * (a * cos + b * sin)
    const v = e * (-zeta * w0 * (a * cos + b * sin) + wd * (b * cos - a * sin))
    return { y, v }
  }
  // 과감쇠: y = A e^(r1 t) + B e^(r2 t)
  const sq = Math.sqrt(zeta * zeta - 1)
  const r1 = -w0 * (zeta - sq)
  const r2 = -w0 * (zeta + sq)
  const B = (v0 - r1 * y0) / (r2 - r1)
  const A = y0 - B
  const e1 = Math.exp(r1 * t)
  const e2 = Math.exp(r2 * t)
  return { y: A * e1 + B * e2, v: A * r1 * e1 + B * r2 * e2 }
}

/** 0 → 1 로 가는 진행값 (시작 속도 v0, 단위/초) */
export function springAt(s: Spring, t: number, v0 = 0): { x: number; v: number } {
  const d = springDisplacement(s, t, -1, v0)
  return { x: 1 + d.y, v: d.v }
}

/** 목표 ±eps 안에 들어와 다시 나가지 않는 시각(초). 속도도 거의 0 */
export function settleTime(s: Spring, v0 = 0, eps = 0.001): number {
  const dt = 1 / 1000
  let last = 0
  for (let t = 0; t <= 6; t += dt) {
    const { x, v } = springAt(s, t, v0)
    if (Math.abs(1 - x) > eps || Math.abs(v) > eps * 20) last = t
  }
  return Math.min(6, last + dt)
}

/** 1을 넘는 최대치 (넘침 없으면 0) */
export function overshoot(s: Spring, v0 = 0): number {
  const end = settleTime(s, v0)
  let max = 0
  for (let t = 0; t <= end; t += 1 / 1000) max = Math.max(max, springAt(s, t, v0).x - 1)
  return max
}

const fmt = (v: number): string => {
  const r = Math.round(v * 10000) / 10000
  return Object.is(r, -0) ? '0' : String(r)
}

export interface SpringEasing {
  /** `linear(0, 0.0123, …, 1)` */
  easing: string
  /** 이 이징을 쓸 길이 (ms) */
  duration: number
}

/** 스프링을 CSS `linear()` 로 (같은 간격 점들). 처음은 0, 끝은 1로 딱 맞춘다 */
export function springEasing(s: Spring, opts: { v0?: number; points?: number } = {}): SpringEasing {
  const v0 = opts.v0 ?? 0
  const dur = settleTime(s, v0)
  const n = opts.points ?? Math.max(16, Math.min(90, Math.round((dur * 1000) / 12)))
  const vals: string[] = []
  for (let i = 0; i <= n; i++) {
    if (i === 0) vals.push('0')
    else if (i === n) vals.push('1')
    else vals.push(fmt(springAt(s, (dur * i) / n, v0).x))
  }
  return { easing: `linear(${vals.join(', ')})`, duration: Math.round(dur * 1000) }
}

let linearOk: boolean | null = null
/** 이 브라우저가 CSS linear() 이징을 아는지 */
export function supportsLinearEasing(): boolean {
  if (linearOk == null) {
    try {
      linearOk = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timing-function', 'linear(0, 1)')
    } catch {
      linearOk = false
    }
  }
  return linearOk
}

const cache = new Map<Spring, SpringEasing>()
/** 지금 브라우저에서 쓸 이징 (linear() 또는 cubic-bezier) + 길이 */
export function easingFor(s: Spring): SpringEasing {
  let e = cache.get(s)
  if (!e) {
    e = springEasing(s)
    cache.set(s, e)
  }
  if (supportsLinearEasing()) return e
  return { easing: dampingRatio(s) >= 1 ? FALLBACK_SMOOTH : FALLBACK_SPRING, duration: e.duration }
}

export interface AnimateOpts {
  from: number
  to: number
  spring?: Spring
  /** 시작 속도 (값/초) */
  velocity?: number
  onUpdate: (value: number, velocity: number) => void
  onDone?: () => void
  /** 동작 줄이기면 바로 끝값 */
  reduced?: boolean
}

/** requestAnimationFrame 으로 값 하나를 스프링으로. 멈추는 함수를 돌려준다 */
export function animateSpring(o: AnimateOpts): () => void {
  const s = o.spring ?? SPRING_SCREEN
  const span = o.to - o.from
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null
  if (o.reduced || !raf || span === 0) {
    o.onUpdate(o.to, 0)
    o.onDone?.()
    return () => {}
  }
  const v0 = (o.velocity ?? 0) / span
  const end = settleTime(s, v0)
  const t0 = performance.now()
  let id = 0
  let stopped = false
  const tick = () => {
    if (stopped) return
    const t = (performance.now() - t0) / 1000
    if (t >= end) {
      o.onUpdate(o.to, 0)
      o.onDone?.()
      return
    }
    const { x, v } = springAt(s, t, v0)
    o.onUpdate(o.from + span * x, v * span)
    id = raf(tick)
  }
  id = raf(tick)
  return () => {
    stopped = true
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id)
  }
}
