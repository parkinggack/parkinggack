/**
 * 그림 속 차가 실제로 주차하듯 움직이는 길 — 순수 함수 (테스트: carpath.test.ts). 그리는 건 ui/CarDrive.tsx.
 *
 * 좌표는 그 SVG 의 viewBox 그대로(y 아래로). 차의 방향 rot 은 kit.tsx CarTop 과 같은 '시계 방향 도, 0 = 앞이 위(−y)'.
 * 방향은 길의 접선으로 정한다 → 옆으로 미끄러지지 않는다. 후진 구간은 접선의 반대쪽이 앞(앞이 계속 원래 쪽을 본다).
 *
 * 대본(DriveScript) = 구간(Leg: 한 방향으로 쭉 가다 멈춤)과 쉼(Pause)을 차례로, 끝에 '멈출 때 출렁임'(Settle: 앞이 1~2px 숙였다 돌아옴).
 */
import { springDisplacement, SPRING_SETTLE, type Spring } from './ui/spring'

export interface Pt {
  x: number
  y: number
}

export interface Pose {
  x: number
  y: number
  /** 시계 방향 도, 0 = 앞이 위 */
  rot: number
}

export type Seg =
  | { kind: 'line'; a: Pt; b: Pt }
  /** 중심 c, 반지름 r, 각도(도, 화면 좌표: 0 = +x, 90 = +y) from → to */
  | { kind: 'arc'; c: Pt; r: number; from: number; to: number }
  | { kind: 'cubic'; p: [Pt, Pt, Pt, Pt] }

export type Ease = (u: number) => number

export interface Leg {
  segs: Seg[]
  /** 1 앞으로, −1 후진 */
  dir: 1 | -1
  ms: number
  ease: Ease
}

export interface Pause {
  pause: number
}

export interface Settle {
  ms: number
  spring: Spring
  /** 멈추는 순간 앞으로 쏠리는 속도 (px/s) — 최대 숙임 ≈ v0 × 0.028 (SPRING_SETTLE) */
  v0: number
}

export interface DriveScript {
  steps: Array<Leg | Pause>
  settle?: Settle
  /** 끝 자세 (마지막 구간의 끝과 같아야 함 — 테스트) */
  end: Pose
}

// ───────────── 이징 ─────────────

export const easeInOutSine: Ease = (u) => -(Math.cos(Math.PI * u) - 1) / 2
export const easeInOutCubic: Ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2)
/** 화면 밖에서 달려 들어와(처음부터 속도 있음) 앞 k 동안 같은 속도, 그 뒤 고르게 줄여 멈춤 */
export function cruiseThenBrake(k = 0.4): Ease {
  const vmax = 2 / (1 + k)
  return (u) => {
    if (u <= k) return vmax * u
    const d = u - k
    return vmax * k + vmax * d - (vmax * d * d) / (2 * (1 - k))
  }
}

// ───────────── 구간 계산 ─────────────

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

function segPoint(s: Seg, u: number): Pt {
  switch (s.kind) {
    case 'line':
      return { x: s.a.x + (s.b.x - s.a.x) * u, y: s.a.y + (s.b.y - s.a.y) * u }
    case 'arc': {
      const a = rad(s.from + (s.to - s.from) * u)
      return { x: s.c.x + s.r * Math.cos(a), y: s.c.y + s.r * Math.sin(a) }
    }
    case 'cubic': {
      const [p0, p1, p2, p3] = s.p
      const v = 1 - u
      const b0 = v * v * v
      const b1 = 3 * u * v * v
      const b2 = 3 * u * u * v
      const b3 = u * u * u
      return { x: b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x, y: b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y }
    }
  }
}

/** 진행 방향의 접선 (길이 상관없음) */
function segTangent(s: Seg, u: number): Pt {
  switch (s.kind) {
    case 'line':
      return { x: s.b.x - s.a.x, y: s.b.y - s.a.y }
    case 'arc': {
      const a = rad(s.from + (s.to - s.from) * u)
      const sign = s.to >= s.from ? 1 : -1
      return { x: -Math.sin(a) * sign, y: Math.cos(a) * sign }
    }
    case 'cubic': {
      const [p0, p1, p2, p3] = s.p
      const v = 1 - u
      return {
        x: 3 * v * v * (p1.x - p0.x) + 6 * u * v * (p2.x - p1.x) + 3 * u * u * (p3.x - p2.x),
        y: 3 * v * v * (p1.y - p0.y) + 6 * u * v * (p2.y - p1.y) + 3 * u * u * (p3.y - p2.y),
      }
    }
  }
}

/** 접선 → 차 방향(도). 후진이면 앞은 접선의 반대쪽 */
export function headingOf(t: Pt, dir: 1 | -1): number {
  const fx = t.x * dir
  const fy = t.y * dir
  return deg(Math.atan2(fx, -fy))
}

/** 각도를 ref 에서 ±180 안으로 (179 → −179 로 튀지 않게) */
export function unwrap(a: number, ref: number): number {
  return a + 360 * Math.round((ref - a) / 360)
}

interface Lut {
  /** 누적 길이, 구간 번호, 구간 안 u */
  s: number[]
  seg: number[]
  u: number[]
  length: number
}

const luts = new WeakMap<Leg, Lut>()

function lutOf(leg: Leg): Lut {
  let l = luts.get(leg)
  if (l) return l
  l = { s: [0], seg: [0], u: [0], length: 0 }
  let acc = 0
  leg.segs.forEach((sg, i) => {
    const n = sg.kind === 'line' ? 1 : 64
    let prev = segPoint(sg, 0)
    for (let k = 1; k <= n; k++) {
      const u = k / n
      const p = segPoint(sg, u)
      acc += Math.hypot(p.x - prev.x, p.y - prev.y)
      l!.s.push(acc)
      l!.seg.push(i)
      l!.u.push(u)
      prev = p
    }
  })
  l.length = acc
  luts.set(leg, l)
  return l
}

export function legLength(leg: Leg): number {
  return lutOf(leg).length
}

/** 구간 처음에서 거리 d 만큼 간 자세 */
export function legPoseAt(leg: Leg, d: number, ref: number): Pose {
  const l = lutOf(leg)
  const dist = Math.max(0, Math.min(l.length, d))
  let lo = 0
  let hi = l.s.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (l.s[mid] <= dist) lo = mid
    else hi = mid
  }
  let segI = l.seg[hi]
  let u: number
  if (l.seg[lo] !== segI) {
    // 구간 경계: hi 쪽 구간의 처음부터
    const span = l.s[hi] - l.s[lo] || 1
    u = (l.u[hi] * (dist - l.s[lo])) / span
  } else {
    const span = l.s[hi] - l.s[lo] || 1
    u = l.u[lo] + ((l.u[hi] - l.u[lo]) * (dist - l.s[lo])) / span
  }
  if (dist <= 0) {
    segI = 0
    u = 0
  }
  const sg = leg.segs[segI]
  const p = segPoint(sg, u)
  return { x: p.x, y: p.y, rot: unwrap(headingOf(segTangent(sg, u), leg.dir), ref) }
}

const isPause = (s: Leg | Pause): s is Pause => 'pause' in s

export function scriptDuration(sc: DriveScript): number {
  return sc.steps.reduce((t, s) => t + (isPause(s) ? s.pause : s.ms), 0) + (sc.settle?.ms ?? 0)
}

/** t(ms) 의 자세. reduced(동작 줄이기)면 언제든 끝 자세 */
export function poseAt(sc: DriveScript, tMs: number, reduced = false): Pose {
  if (reduced) return { ...sc.end }
  let t = Math.max(0, tMs)
  const ref = sc.end.rot
  let lastPose: Pose | null = null
  for (const st of sc.steps) {
    if (isPause(st)) {
      if (t < st.pause) return lastPose ?? firstPose(sc)
      t -= st.pause
      continue
    }
    if (t < st.ms) return legPoseAt(st, st.ease(t / st.ms) * legLength(st), ref)
    t -= st.ms
    lastPose = legPoseAt(st, legLength(st), ref)
  }
  if (sc.settle && t < sc.settle.ms) {
    // 멈춘 뒤: 차가 향한 쪽으로 살짝 쏠렸다 돌아옴
    const { y } = springDisplacement(sc.settle.spring, t / 1000, 0, sc.settle.v0)
    const r = rad(sc.end.rot)
    return { x: sc.end.x + Math.sin(r) * y, y: sc.end.y - Math.cos(r) * y, rot: sc.end.rot }
  }
  return { ...sc.end }
}

function firstPose(sc: DriveScript): Pose {
  const leg = sc.steps.find((s): s is Leg => !isPause(s))
  return leg ? legPoseAt(leg, 0, sc.end.rot) : { ...sc.end }
}

/** SVG transform 글자 ("translate(268 62) rotate(0)") */
export function poseTransform(p: Pose): string {
  const r = (n: number) => {
    const v = Math.round(n * 100) / 100
    return Object.is(v, -0) ? 0 : v
  }
  return `translate(${r(p.x)} ${r(p.y)}) rotate(${r(p.rot)})`
}

/**
 * 차 테두리 점들 (테스트: 글자·주차선에 닿지 않는지). w = 폭, len = 길이, r = 모서리 둥글기(CarTop rx).
 * r > 0 이면 모서리마다 둥근 곳의 세 점(양 끝 + 가운데)으로 — 날카로운 사각형보다 실제 그림에 가깝다.
 */
export function carCorners(p: Pose, w: number, len: number, r = 0): Pt[] {
  const a = rad(p.rot)
  const f = { x: Math.sin(a), y: -Math.cos(a) }
  const right = { x: Math.cos(a), y: Math.sin(a) }
  const hl = len / 2
  const hw = w / 2
  const local: Array<[number, number]> = []
  for (const [sa, sb] of [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ]) {
    if (r <= 0) local.push([sa * hl, sb * hw])
    else {
      const k = r * (1 - Math.SQRT1_2)
      local.push([sa * hl, sb * (hw - r)], [sa * (hl - k), sb * (hw - k)], [sa * (hl - r), sb * hw])
    }
  }
  return local.map(([u, v]) => ({ x: p.x + f.x * u + right.x * v, y: p.y + f.y * u + right.y * v }))
}

// ───────────── 대본 ─────────────

/**
 * M-20 '지금 주차 중' 카드 (viewBox 350×230, 주차선 x=236·300·364, y=0..120, 위가 막힘). 끝 자세 (268, 62, 0°) = 시안.
 * 오른쪽 밖에서 칸 아래 통로(y=162)를 따라 서쪽으로 와서, 앞이 칸을 조금 지나쳤을 때 오른쪽으로 꺾어 들어가고(조금 덜 꺾임 −10°),
 * 멈춰서 살짝 후진하며 똑바로 편 뒤, 앞으로 쭉 들어가 멈춘다. 차는 늘 x ≥ 215 (왼쪽의 층·구역 글자를 가리지 않음). 약 2.5초.
 */
const HOME_R = 40
const HOME_SWEEP = 80
/** 꺾기가 끝났을 때 차 가운데 x (칸 가운데 268보다 조금 왼쪽 → 후진하며 맞춤) */
const HOME_TURN_END_X = 266.2
const HOME_TURN_X0 = HOME_TURN_END_X + HOME_R * Math.sin(rad(HOME_SWEEP))
const HOME_AISLE_Y = 162
const HOME_C: Pt = { x: HOME_TURN_X0, y: HOME_AISLE_Y - HOME_R }
const HOME_A: Pt = { x: HOME_C.x + HOME_R * Math.cos(rad(90 + HOME_SWEEP)), y: HOME_C.y + HOME_R * Math.sin(rad(90 + HOME_SWEEP)) }
const HOME_REV = 15
const HOME_B: Pt = { x: 268, y: HOME_A.y + HOME_REV }
// 후진 시작 방향 = 차 앞의 반대 (앞이 −10° → 아래·조금 오른쪽으로)
const HOME_A_BACK: Pt = { x: Math.sin(rad(HOME_SWEEP - 90 + 180)), y: -Math.cos(rad(HOME_SWEEP - 90 + 180)) }

export const HOME_PARK: DriveScript = {
  steps: [
    {
      dir: 1,
      ms: 1000,
      ease: cruiseThenBrake(0.4),
      segs: [
        { kind: 'line', a: { x: 392, y: HOME_AISLE_Y }, b: { x: HOME_TURN_X0, y: HOME_AISLE_Y } },
        { kind: 'arc', c: HOME_C, r: HOME_R, from: 90, to: 90 + HOME_SWEEP },
      ],
    },
    { pause: 90 },
    {
      dir: -1,
      ms: 400,
      ease: easeInOutSine,
      segs: [
        {
          kind: 'cubic',
          p: [HOME_A, { x: HOME_A.x + HOME_A_BACK.x * 6, y: HOME_A.y + HOME_A_BACK.y * 6 }, { x: HOME_B.x, y: HOME_B.y - 6 }, HOME_B],
        },
      ],
    },
    { pause: 80 },
    { dir: 1, ms: 600, ease: easeInOutCubic, segs: [{ kind: 'line', a: HOME_B, b: { x: 268, y: 62 } }] },
  ],
  settle: { ms: 380, spring: SPRING_SETTLE, v0: 58 },
  end: { x: 268, y: 62, rot: 0 },
}

/**
 * M-10 시작 화면 (viewBox 390×844, 칸 x=…188·254…, y=560..700, 아래가 막힘). 끝 자세 (221, 626, 180°) = 시안.
 * 왼쪽 밖에서 칸 위 통로(y=505)를 동쪽으로 달려와 오른쪽으로 꺾어 앞으로 들어가 멈춘다. 약 1.6초.
 */
const START_R = 52
export const START_ARRIVE: DriveScript = {
  steps: [
    { pause: 160 },
    {
      dir: 1,
      ms: 1150,
      ease: cruiseThenBrake(0.35),
      segs: [
        { kind: 'line', a: { x: -60, y: 505 }, b: { x: 221 - START_R, y: 505 } },
        { kind: 'arc', c: { x: 221 - START_R, y: 505 + START_R }, r: START_R, from: -90, to: 0 },
        { kind: 'line', a: { x: 221, y: 505 + START_R }, b: { x: 221, y: 626 } },
      ],
    },
  ],
  settle: { ms: 380, spring: SPRING_SETTLE, v0: 58 },
  end: { x: 221, y: 626, rot: 180 },
}
