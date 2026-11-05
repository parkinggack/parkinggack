import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  animateSpring,
  dampingRatio,
  overshoot,
  settleTime,
  springAt,
  springDisplacement,
  springEasing,
  SPRING_POP,
  SPRING_PRESS,
  SPRING_SCREEN,
  SPRING_SETTLE,
  SPRING_SHEET,
  type Spring,
} from './spring'
import css from '../style.css?raw'

const ALL: Array<[string, Spring]> = [
  ['SCREEN', SPRING_SCREEN],
  ['SHEET', SPRING_SHEET],
  ['POP', SPRING_POP],
  ['PRESS', SPRING_PRESS],
  ['SETTLE', SPRING_SETTLE],
]

/** 같은 미분 방정식을 작은 걸음으로 직접 풀어서 (닫힌 꼴 검산) */
function integrate(s: Spring, t: number, v0 = 0): number {
  let x = 0
  let v = v0
  const dt = 1 / 20000
  for (let k = 0; k < t / dt; k++) {
    const a = (-s.stiffness * (x - 1) - s.damping * v) / s.mass
    v += a * dt
    x += v * dt
  }
  return x
}

describe('스프링 풀이', () => {
  it('화면 전환 기본값은 강성 260 · 감쇠 26 · 질량 1 (ζ≈0.81, iOS 처럼 살짝 넘침)', () => {
    expect(SPRING_SCREEN).toEqual({ stiffness: 260, damping: 26, mass: 1 })
    expect(dampingRatio(SPRING_SCREEN)).toBeCloseTo(0.806, 3)
    expect(dampingRatio(SPRING_SHEET)).toBeCloseTo(1, 6)
  })

  it.each(ALL)('%s: 0에서 시작해 1로 가라앉음', (_, s) => {
    expect(springAt(s, 0).x).toBe(0)
    const end = settleTime(s)
    expect(end).toBeGreaterThan(0.1)
    expect(end).toBeLessThan(1.2)
    for (const t of [end, end + 0.1, end + 1, 5]) expect(Math.abs(springAt(s, t).x - 1)).toBeLessThan(0.0011)
    expect(Math.abs(springAt(s, 5).v)).toBeLessThan(0.001)
  })

  it.each(ALL)('%s: 닫힌 꼴 = 수치 적분', (_, s) => {
    for (const t of [0.03, 0.1, 0.2, 0.35]) expect(springAt(s, t).x).toBeCloseTo(integrate(s, t), 3)
  })

  it('넘침은 정해 둔 만큼만: 화면 < 2%, 시트(임계 감쇠) 0, 누름·팝 < 12%', () => {
    expect(overshoot(SPRING_SCREEN)).toBeGreaterThan(0.005)
    expect(overshoot(SPRING_SCREEN)).toBeLessThan(0.02)
    expect(overshoot(SPRING_SHEET)).toBeLessThan(1e-6)
    expect(overshoot(SPRING_POP)).toBeLessThan(0.1)
    expect(overshoot(SPRING_PRESS)).toBeLessThan(0.12)
  })

  it('과감쇠도 넘치지 않고 1로', () => {
    const s = { stiffness: 100, damping: 40, mass: 1 }
    expect(dampingRatio(s)).toBeGreaterThan(1)
    expect(overshoot(s)).toBeLessThan(1e-9)
    expect(springAt(s, 0.2).x).toBeCloseTo(integrate(s, 0.2), 3)
  })

  it('시작 속도·처음 자리: 속도 v0 로 쳐서 놓으면 그만큼 나갔다 돌아옴', () => {
    const { y } = springDisplacement(SPRING_SETTLE, 0.057, 0, 58)
    expect(y).toBeGreaterThan(1.4)
    expect(y).toBeLessThan(1.8)
    expect(Math.abs(springDisplacement(SPRING_SETTLE, 1, 0, 58).y)).toBeLessThan(0.05)
  })
})

describe('CSS linear() 이징', () => {
  it('모양: linear(0, …, 1), 숫자만, 끝은 정확히 0과 1', () => {
    const { easing, duration } = springEasing(SPRING_SCREEN)
    expect(easing).toMatch(/^linear\(0, (-?\d+(\.\d+)?, )+1\)$/)
    const vals = easing.slice(7, -1).split(', ').map(Number)
    expect(vals.every((v) => Number.isFinite(v))).toBe(true)
    expect(vals[0]).toBe(0)
    expect(vals[vals.length - 1]).toBe(1)
    expect(vals.length).toBeGreaterThanOrEqual(17)
    expect(Math.max(...vals)).toBeGreaterThan(1) // 살짝 넘침이 이징에도
    expect(duration).toBe(Math.round(settleTime(SPRING_SCREEN) * 1000))
    // 소수 넷째 자리까지
    for (const v of vals) expect((String(v).split('.')[1] ?? '').length).toBeLessThanOrEqual(4)
  })

  it('점 개수를 정할 수 있고, 같은 간격 시각의 값', () => {
    const { easing, duration } = springEasing(SPRING_POP, { points: 4 })
    const vals = easing.slice(7, -1).split(', ').map(Number)
    expect(vals).toHaveLength(5)
    expect(vals[2]).toBeCloseTo(springAt(SPRING_POP, duration / 2000).x, 3)
  })

  it('style.css 의 --spring-* 가 지금 스프링 값과 같음 (바꾸면 둘 다)', () => {
    for (const [name, s] of [
      ['press', SPRING_PRESS],
      ['pop', SPRING_POP],
      ['sheet', SPRING_SHEET],
    ] as const) {
      const e = springEasing(s)
      expect(css).toContain(`--spring-${name}: ${e.easing};`)
      expect(css).toContain(`--spring-${name}-ms: ${e.duration}ms;`)
    }
    // linear() 를 모르는 브라우저는 cubic-bezier 로
    expect(css).toMatch(/@supports not \(animation-timing-function: linear\(0, 1\)\) \{\s*:root \{\s*--spring-press: cubic-bezier\(/)
  })
})

describe('animateSpring (requestAnimationFrame)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('가짜 시계로 돌리면 끝값에 정확히 멈추고 onDone', () => {
    let now = 0
    const queue: Array<() => void> = []
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => queue.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const seen: number[] = []
    let doneAt = -1
    animateSpring({ from: 100, to: 0, spring: SPRING_SCREEN, onUpdate: (v) => seen.push(v), onDone: () => (doneAt = now) })
    while (queue.length) {
      now += 16
      queue.shift()!()
    }
    expect(seen[seen.length - 1]).toBe(0)
    expect(Math.min(...seen)).toBeLessThan(0) // 살짝 넘었다가
    expect(Math.min(...seen)).toBeGreaterThan(-2)
    expect(doneAt).toBeGreaterThan(400)
    expect(doneAt).toBeLessThan(700)
  })

  it("'동작 줄이기'·rAF 없음이면 바로 끝값", () => {
    const seen: number[] = []
    let done = false
    animateSpring({ from: 0, to: 1, reduced: true, onUpdate: (v) => seen.push(v), onDone: () => (done = true) })
    expect(seen).toEqual([1])
    expect(done).toBe(true)
    vi.stubGlobal('requestAnimationFrame', undefined)
    const seen2: number[] = []
    animateSpring({ from: 0, to: 5, onUpdate: (v) => seen2.push(v) })
    expect(seen2).toEqual([5])
  })

  it('멈추기', () => {
    let now = 0
    const queue: Array<() => void> = []
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => queue.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const seen: number[] = []
    const stop = animateSpring({ from: 0, to: 1, onUpdate: (v) => seen.push(v) })
    now += 16
    queue.shift()!()
    stop()
    while (queue.length) queue.shift()!()
    expect(seen).toHaveLength(1)
  })
})
