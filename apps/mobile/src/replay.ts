/**
 * M-33 주차 동선 그림 — 차 화면 C-12(apps/vehicle/.../ui/components/TrajectoryView.kt)와 같은 규칙을 줄인 판.
 *
 * 실제 도면이 아니라 '그림'이다: 마지막 위치 기준으로 칸 줄 + 통로 띠 + 건너편 칸 줄. 옆 차는 그리지 않는다.
 * 앞으로 = 실선, 후진 = 점선, 전진↔후진이 바뀐 곳 = 번호 원 (색만으로 구분하지 않음).
 *
 * 입력 PathPoint = [tMs, x, y, headingRad, reverse] — 시작점 기준 m, x 오른쪽, y 앞, heading은 +y 기준 반시계.
 * 장면은 통로가 화면 가로가 되도록 돌리고, 내 칸 줄이 늘 위쪽에 오게 한다(필요하면 180° 더 돌림 — 좌우 뒤집기는
 * 하지 않는다: 뒤집으면 왼쪽/오른쪽으로 감은 방향이 바뀌어 보이므로). 그림 크기는 시안과 같은 780×500, 기본 축척 32px/m.
 */
import type { ParkingShape, PathPoint } from '@api-types'

export const VIEW_W = 780
export const VIEW_H = 500
const BASE_K = 32 // px per m (시안: 칸 폭 80px = 2.5m)
const STALL_W = 2.5
const STALL_L = 5.0
const PARALLEL_L = 6.0
export const CAR_W = 1.75
export const CAR_L = 4.55
const TRIM_ABOVE_M = 45
const TRIM_LEAD_M = 14
const LEAD_SHOWN_M = 6 // 첫 전환점 앞으로 화면에 꼭 보일 길이
const MARGIN = 44
const ROW_TOP = 16

export interface Pt {
  x: number
  y: number
}

interface V {
  x: number
  y: number
}
const v = (x: number, y: number): V => ({ x, y })

const sub = (a: V, b: V): V => v(a.x - b.x, a.y - b.y)
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y
const len = (a: V) => Math.hypot(a.x, a.y)
const unit = (a: V): V => {
  const l = len(a)
  return l < 1e-9 ? v(0, 1) : v(a.x / l, a.y / l)
}
/** heading(+y 기준 반시계) → 앞 방향 */
const forwardOf = (h: number): V => v(-Math.sin(h), Math.cos(h))

export interface ScenePoint extends Pt {
  /** 화면에서 차 앞이 향하는 각 (SVG rotate 도, 시계 +) */
  rot: number
  reverse: boolean
  /** 0..1 그리기 진행값 */
  at: number
}

export interface Line {
  x1: number
  y1: number
  x2: number
  y2: number
  dashed?: boolean
}

export interface ReplayScene {
  width: number
  height: number
  /** px per m */
  k: number
  shape: Exclude<ParkingShape, 'UNKNOWN'>
  approximate: boolean
  aisle: { top: number; bottom: number; mid: number }
  /** 칸 경계선 (내 칸 줄 + 건너편) */
  stallLines: Line[]
  /** 칸 줄 끝선 (벽 쪽) */
  backLines: Line[]
  /** 평행주차일 때 연석 너머 보도 띠 */
  sidewalk: { y: number; h: number } | null
  points: ScenePoint[]
  switches: Array<Pt & { index: number; at: number }>
  /** 진입 방향 화살표 (끝점과 방향) */
  arrow: { tip: Pt; dir: Pt } | null
  car: { w: number; l: number }
}

interface RawPt {
  t: number
  p: V
  h: number
  reverse: boolean
}

export function isValidPath(path: unknown): path is PathPoint[] {
  return (
    Array.isArray(path) &&
    path.every((q) => Array.isArray(q) && q.length >= 5 && q.slice(0, 4).every((n) => typeof n === 'number' && Number.isFinite(n)) && (q[4] === 0 || q[4] === 1))
  )
}

/** 전진↔후진이 바뀐 점의 인덱스 (그 점부터 새 방향) */
export function switchIndices(path: ReadonlyArray<{ reverse: boolean }>): number[] {
  const out: number[] = []
  for (let i = 1; i < path.length; i++) if (path[i].reverse !== path[i - 1].reverse && (i > 1 || path[i].reverse)) out.push(i)
  return out
}

export function buildReplay(path: readonly PathPoint[], shapeIn: ParkingShape = 'UNKNOWN', approximate = false): ReplayScene | null {
  if (!isValidPath(path) || path.length < 2) return null
  // 같은 자리에 겹친 점(정지)도 남긴다 — 다시 보기에서 기어를 바꾸며 멈춘 시간이 그대로 보이게
  let raw: RawPt[] = path.map(([t, x, y, h, r]) => ({ t, p: v(x, y), h, reverse: r === 1 }))

  // 대략적이면 전환점만 직선으로
  if (approximate && raw.length > 2) {
    const sw = switchIndices(raw)
    const keep = new Set([0, raw.length - 1, ...sw.map((i) => i - 1), ...sw])
    raw = raw.filter((_, i) => keep.has(i))
  }
  if (raw.length < 2) return null
  const tFirst = raw[0].t
  const tLast = raw[raw.length - 1].t

  // 1) 긴 궤적(램프 등)은 첫 전환점 앞 14m부터
  let total = 0
  for (let i = 1; i < raw.length; i++) total += len(sub(raw[i].p, raw[i - 1].p))
  const sw0 = switchIndices(raw)
  if (total > TRIM_ABOVE_M) {
    const anchor = sw0.length ? sw0[0] - 1 : raw.length - 1
    let start = anchor
    let back = 0
    while (start > 0 && back < TRIM_LEAD_M) {
      back += len(sub(raw[start].p, raw[start - 1].p))
      start--
    }
    raw = raw.slice(start)
  }
  const first = raw[0]
  const fin = raw[raw.length - 1]

  // 2) 진입 방향: 처음 같은 진행 방향으로 6m 간 방향
  let approachEnd = 0
  {
    let dist = 0
    const motion = raw[Math.min(1, raw.length - 1)].reverse
    for (let i = 1; i < raw.length; i++) {
      if (raw[i].reverse !== motion) break
      dist += len(sub(raw[i].p, raw[i - 1].p))
      approachEnd = i
      if (dist >= 6) break
    }
  }
  const approachVec = sub(raw[approachEnd].p, first.p)
  const a = len(approachVec) > 0.5 ? unit(approachVec) : ((f) => (first.reverse ? v(-f.x, -f.y) : f))(forwardOf(first.h))

  // 3) 주차 형태
  const hf = forwardOf(fin.h)
  const angle = (Math.acos(Math.min(1, Math.abs(dot(a, hf)))) * 180) / Math.PI
  const shape: ReplayScene['shape'] =
    shapeIn !== 'UNKNOWN' ? shapeIn : angle < 25 ? 'PARALLEL' : angle > 70 ? 'PERPENDICULAR' : 'ANGLED'

  // 4) 통로 방향 d (진입 방향 쪽으로)
  let d = shape === 'PERPENDICULAR' ? v(hf.y, -hf.x) : shape === 'PARALLEL' ? hf : a
  if (dot(d, a) < 0) d = v(-d.x, -d.y)

  // 5) d → +x 로 돌리고, 내 칸 줄이 위(+y)가 아니면 180° 더
  let rho = -Math.atan2(d.y, d.x)
  const rotate = (q: V, r: number) => v(q.x * Math.cos(r) - q.y * Math.sin(r), q.x * Math.sin(r) + q.y * Math.cos(r))
  const approachMeanY = (r: number) => raw.slice(0, approachEnd + 1).reduce((s, q) => s + rotate(q.p, r).y, 0) / (approachEnd + 1)
  if (rotate(fin.p, rho).y < approachMeanY(rho)) rho += Math.PI
  const pts = raw.map((q) => ({ ...q, p: rotate(q.p, rho), h: q.h + rho }))
  const car = pts[pts.length - 1]
  const yA = approachMeanY(rho)

  // 6) 칸 기하 (side = +1: 칸 줄이 통로 위쪽)
  const hRot = forwardOf(car.h)
  let u = hRot.y > 0 ? hRot : v(-hRot.x, -hRot.y) // 통로 → 칸 안쪽
  let yEdge: number
  let rowDepth: number
  let pitch: number
  let x0: number
  let aisleW: number
  if (shape === 'PARALLEL') {
    u = v(1, 0)
    yEdge = car.p.y - STALL_W / 2
    rowDepth = STALL_W
    pitch = PARALLEL_L
    x0 = car.p.x - PARALLEL_L / 2
    aisleW = 3.5
  } else {
    if (shape === 'PERPENDICULAR') {
      u = v(0, 1)
      aisleW = 5.25
    } else {
      const beta = Math.min((150 * Math.PI) / 180, Math.max((30 * Math.PI) / 180, Math.atan2(u.y, u.x)))
      u = v(Math.cos(beta), Math.sin(beta))
      aisleW = 4.5
    }
    const sinB = Math.abs(u.y)
    yEdge = car.p.y - (STALL_L / 2) * sinB
    rowDepth = STALL_L * sinB
    pitch = STALL_W / sinB
    x0 = car.p.x - (STALL_L / 2) * u.x - pitch / 2
  }
  aisleW = Math.max(aisleW, yEdge - yA + 1.6)

  // 7) 진행값: 시각이 늘어나면 시간, 아니면 길이
  const n = pts.length
  const prog = new Array<number>(n).fill(0)
  const span = tLast - tFirst
  const timeOk = span > 0 && pts.every((q, i) => i === 0 || q.t >= pts[i - 1].t)
  const t0 = pts[0].t
  const tSpan = pts[n - 1].t - t0
  if (timeOk && tSpan > 0) {
    for (let i = 0; i < n; i++) prog[i] = (pts[i].t - t0) / tSpan
  } else {
    let acc = 0
    for (let i = 1; i < n; i++) {
      acc += len(sub(pts[i].p, pts[i - 1].p))
      prog[i] = acc
    }
    if (acc > 0) for (let i = 0; i < n; i++) prog[i] /= acc
  }

  // 8) 축척과 위치: 전환점 이후 동작 + 앞 6m + 차가 꼭 보이게. 진입 직선은 왼쪽(또는 오른쪽) 밖으로 잘려도 됨
  const sws = switchIndices(pts)
  const focusFrom = (() => {
    const anchor = sws.length ? sws[0] - 1 : n - 1
    let i = anchor
    let back = 0
    while (i > 0 && back < LEAD_SHOWN_M) {
      back += len(sub(pts[i].p, pts[i - 1].p))
      i--
    }
    return i
  })()
  const focus = pts.slice(focusFrom).map((q) => q.p)
  const halfDiag = Math.hypot(CAR_W, CAR_L) / 2
  const fxs = [...focus.map((q) => q.x), car.p.x - halfDiag, car.p.x + halfDiag]
  const minFX = Math.min(...fxs)
  const maxFX = Math.max(...fxs)
  const yTopWorld = yEdge + rowDepth // 벽 쪽 끝선
  const minY = Math.min(...pts.map((q) => q.p.y), yEdge - aisleW)
  let k = BASE_K
  k = Math.min(k, (VIEW_W - 2 * MARGIN) / Math.max(1, maxFX - minFX))
  k = Math.min(k, (VIEW_H - ROW_TOP - 12) / Math.max(1, yTopWorld - minY + 0.6))
  const travel = d // 회전 뒤 진입 방향이 +x 인지 -x 인지
  const enterFromLeft = rotate(travel, rho).x >= 0
  // 동작 범위 가운데를 화면 56%(오른쪽에서 들어오면 44%) 지점에
  const centerX = (minFX + maxFX) / 2
  const targetX = VIEW_W * (enterFromLeft ? 0.56 : 0.44)
  let ox = targetX - centerX * k
  // 동작 범위가 화면 밖으로 나가지 않게
  ox = Math.min(ox, VIEW_W - MARGIN - maxFX * k)
  ox = Math.max(ox, MARGIN - minFX * k)
  const sx = (x: number) => ox + x * k
  const sy = (y: number) => ROW_TOP + (yTopWorld - y) * k
  const r1 = (n2: number) => Math.round(n2 * 10) / 10

  const points: ScenePoint[] = pts.map((q, i) => ({
    x: r1(sx(q.p.x)),
    y: r1(sy(q.p.y)),
    rot: r1((-q.h * 180) / Math.PI),
    reverse: q.reverse,
    at: prog[i],
  }))

  // 9) 통로·칸
  const aisleTop = sy(yEdge)
  const aisleBottom = sy(yEdge - aisleW)
  const stallLines: Line[] = []
  const backLines: Line[] = []
  let sidewalk: ReplayScene['sidewalk'] = null
  const worldLeft = -ox / k
  const worldRight = (VIEW_W - ox) / k
  const farY = yEdge + rowDepth
  const dash = approximate
  if (shape === 'PARALLEL') {
    const kFrom = approximate ? 0 : Math.floor((worldLeft - x0) / pitch) - 1
    const kTo = approximate ? 1 : Math.ceil((worldRight - x0) / pitch) + 1
    for (let j = kFrom; j <= kTo; j++) {
      const x = sx(x0 + j * pitch)
      stallLines.push({ x1: r1(x), y1: r1(sy(yEdge)), x2: r1(x), y2: r1(sy(farY)), dashed: dash })
    }
    const sideH = STALL_W * k
    sidewalk = { y: r1(sy(farY) - sideH), h: r1(sideH) }
    backLines.push({ x1: 0, y1: r1(sy(farY)), x2: VIEW_W, y2: r1(sy(farY)), dashed: dash })
  } else {
    const along = rowDepth / Math.abs(u.y)
    const dx = u.x * along
    const kFrom = approximate ? 0 : Math.floor((worldLeft - x0 - Math.max(0, dx)) / pitch) - 1
    const kTo = approximate ? 1 : Math.ceil((worldRight - x0 - Math.min(0, dx)) / pitch) + 1
    const xs: number[] = []
    for (let j = kFrom; j <= kTo; j++) {
      const x = x0 + j * pitch
      xs.push(x)
      stallLines.push({ x1: r1(sx(x)), y1: r1(sy(yEdge)), x2: r1(sx(x + dx)), y2: r1(sy(farY)), dashed: dash })
    }
    const lo = Math.max(MARGIN / 2, sx(Math.min(...xs) + Math.min(0, dx)))
    const hi = Math.min(VIEW_W - MARGIN / 2, sx(Math.max(...xs) + Math.max(0, dx)))
    backLines.push({ x1: r1(approximate ? sx(x0 + dx) : lo), y1: r1(sy(farY)), x2: r1(approximate ? sx(x0 + pitch + dx) : hi), y2: r1(sy(farY)), dashed: dash })
    if (shape === 'PERPENDICULAR' && !approximate) {
      // 건너편 칸 줄 (경계선만)
      const oppEdge = yEdge - aisleW
      for (const x of xs) stallLines.push({ x1: r1(sx(x)), y1: r1(sy(oppEdge)), x2: r1(sx(x)), y2: r1(sy(oppEdge - STALL_L)) })
    }
  }
  // 그림 밖으로 많이 나간 선은 빼기
  const visible = (l: Line) => Math.max(l.x1, l.x2) >= MARGIN / 2 - 1 && Math.min(l.x1, l.x2) <= VIEW_W - MARGIN / 2 + 1
  const stall = stallLines.filter(visible)

  const switches = sws.map((i, idx) => ({ index: idx + 1, x: points[i - 1].x, y: points[i - 1].y, at: points[i - 1].at }))

  // 10) 진입 화살표: 첫 구간에서 화면 안에 들어온 지점 + 2.2m
  let arrow: ReplayScene['arrow'] = null
  {
    const firstRunEnd = sws.length ? sws[0] - 1 : n - 1
    const dir = unit(rotate(a, rho))
    const sdir = { x: dir.x, y: -dir.y }
    for (let i = 0; i <= firstRunEnd; i++) {
      const q = points[i]
      if (q.x >= 24 && q.x <= VIEW_W - 24) {
        const tip = { x: r1(q.x + sdir.x * 2.2 * k), y: r1(q.y + sdir.y * 2.2 * k) }
        const last = points[firstRunEnd]
        // 화살표가 첫 전환점보다 앞서면 그리지 않음
        if ((tip.x - last.x) * sdir.x + (tip.y - last.y) * sdir.y < -1.5 * k) arrow = { tip, dir: { x: r1(sdir.x * 100) / 100, y: r1(sdir.y * 100) / 100 } }
        break
      }
    }
  }

  return {
    width: VIEW_W,
    height: VIEW_H,
    k,
    shape,
    approximate,
    aisle: { top: r1(aisleTop), bottom: r1(aisleBottom), mid: r1((aisleTop + aisleBottom) / 2) },
    stallLines: stall,
    backLines,
    sidewalk,
    points,
    switches,
    arrow,
    car: { w: CAR_W * k, l: CAR_L * k },
  }
}

export interface Trail {
  /** 같은 진행 방향끼리 묶은 SVG path d */
  runs: Array<{ reverse: boolean; d: string }>
  /** 지금 차 위치·방향 */
  head: { x: number; y: number; rot: number }
}

/** progress(0..1)까지 그린 동선과 그때 차 위치 */
export function trailAt(scene: ReplayScene, progress: number): Trail {
  const pts = scene.points
  const pr = Math.max(0, Math.min(1, progress))
  const runs: Array<{ reverse: boolean; parts: string[] }> = []
  let head = { x: pts[0].x, y: pts[0].y, rot: pts[0].rot }
  const f = (n: number) => String(Math.round(n * 10) / 10)
  const runFor = (reverse: boolean, from: Pt) => {
    const last = runs[runs.length - 1]
    if (last && last.reverse === reverse) return last
    const run = { reverse, parts: [`M${f(from.x)} ${f(from.y)}`] }
    runs.push(run)
    return run
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (a.at >= pr && i > 1) break
    const run = runFor(b.reverse, a)
    const spanAt = b.at - a.at
    if (b.at <= pr || spanAt <= 0) {
      run.parts.push(`L${f(b.x)} ${f(b.y)}`)
      head = { x: b.x, y: b.y, rot: b.rot }
    } else {
      const t = (pr - a.at) / spanAt
      const x = a.x + (b.x - a.x) * t
      const y = a.y + (b.y - a.y) * t
      run.parts.push(`L${f(x)} ${f(y)}`)
      let dr = b.rot - a.rot
      while (dr > 180) dr -= 360
      while (dr < -180) dr += 360
      head = { x, y, rot: a.rot + dr * t }
      break
    }
  }
  return { runs: runs.map((r) => ({ reverse: r.reverse, d: r.parts.join(' ') })), head }
}
