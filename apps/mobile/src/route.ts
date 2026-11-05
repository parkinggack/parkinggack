/**
 * M-02 작은 길 그림. 링크의 "r" (차량 앱 ReturnRoute.code)을 읽어 342×190 상자에 맞춘다.
 *
 *   r = [start, L0, T1, L1, …, Tk, Lk, side]
 *   start 0=입구 1=램프 · L 미터 · T 1=왼쪽 −1=오른쪽 ±2=크게 돌아 옆 통로 · side 1=왼쪽 −1=오른쪽 0=모름
 *
 * 축척은 '대략'이다: 짧은 구간도 보이게 최소 길이를 두고, 칸·차·글자는 시안과 같은 픽셀 크기로 그린다.
 */

export interface Route {
  start: 'entry' | 'ramp'
  legs: Array<{ turn: -2 | -1 | 1 | 2 | 0; meters: number }>
  side: -1 | 0 | 1
}

type Pt = [number, number]

export interface Figure {
  width: number
  height: number
  /** 통로 띠 (굵은 회색 선) */
  bands: Array<[Pt, Pt]>
  /** 걸어갈 길 (실선) */
  path: Pt[]
  /** 통로에서 칸으로 들어가는 짧은 점선 */
  stub: [Pt, Pt] | null
  car: { x: number; y: number; w: number; h: number }
  startLabel: { x: number; y: number; text: string }
  carLabel: { x: number; y: number; anchor: 'start' | 'end' }
}

export function parseRoute(r: readonly number[] | undefined | null): Route | null {
  if (!r || r.length < 3 || r.length % 2 === 0) return null
  const start = r[0]
  const side = r[r.length - 1]
  if ((start !== 0 && start !== 1) || (side !== -1 && side !== 0 && side !== 1)) return null
  const mid = r.slice(1, -1) // L0, T1, L1, …
  const okLen = (m: number) => m >= 0 && m <= 2000
  if (!okLen(mid[0])) return null
  const legs: Route['legs'] = [{ turn: 0, meters: mid[0] }]
  for (let i = 1; i < mid.length; i += 2) {
    const turn = mid[i]
    if (![-2, -1, 1, 2].includes(turn) || !okLen(mid[i + 1])) return null
    legs.push({ turn: turn as -2 | -1 | 1 | 2, meters: mid[i + 1] })
  }
  return { start: start === 1 ? 'ramp' : 'entry', legs, side: side as Route['side'] }
}

// 화면 좌표 (y 아래로). 처음엔 위로 걷는다.
const left = ([x, y]: Pt): Pt => [y, -x]
const right = ([x, y]: Pt): Pt => [-y, x]
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k]

const MIN_LEG_M = 6
const U_JOG_M = 8
const BAND = 22
const STUB = 20
const CAR_ALONG = 24 // 통로 방향 폭
const CAR_ACROSS = 26 // 칸 방향 길이
const NEXT_AISLE = 70 // 차 너머 옆 통로까지
const EXT = 40 // 통로 띠를 끝보다 더 그림
const LABEL = 14

/**
 * 미터 단위 꺾은선 (화면 좌표, y 아래로, 처음엔 위로 걷는다). 짧은 구간도 보이게 다리마다 최소 6m.
 * M-02 새 그림(wayfigure.ts)도 이걸 돌려서 쓴다.
 */
export function routePolyline(route: Route): { pts: Array<[number, number]>; lastDir: [number, number] } {
  let dir: Pt = [0, -1]
  let p: Pt = [0, 0]
  const pts: Pt[] = [p]
  route.legs.forEach((leg, i) => {
    if (i > 0) {
      if (leg.turn === 1) dir = left(dir)
      else if (leg.turn === -1) dir = right(dir)
      else {
        const jog = leg.turn === 2 ? left(dir) : right(dir)
        p = add(p, jog, U_JOG_M)
        pts.push(p)
        dir = [-dir[0], -dir[1]]
      }
    }
    p = add(p, dir, Math.max(MIN_LEG_M, leg.meters))
    pts.push(p)
  })
  return { pts, lastDir: dir }
}

export function layoutRoute(route: Route, width = 342, height = 190): Figure {
  // 1) 미터 단위 꺾은선
  const { pts, lastDir } = routePolyline(route)
  const firstEnd = pts[1]

  const xs = pts.map((q) => q[0])
  const ys = pts.map((q) => q[1])
  const bw = Math.max(1, Math.max(...xs) - Math.min(...xs))
  const bh = Math.max(1, Math.max(...ys) - Math.min(...ys))

  // 2) 픽셀로 — 칸·차·글자는 고정 크기라 맞을 때까지 축척을 줄인다
  let scale = Math.min(9, (width - 60) / bw, (height - 50) / bh)
  for (let attempt = 0; attempt < 12; attempt++) {
    for (const withNext of [true, false]) {
      const fig = build(route, pts, firstEnd, lastDir, scale, withNext, width, height)
      if (fig) return fig
    }
    scale *= 0.85
  }
  return build(route, pts, firstEnd, lastDir, scale, false, width, height, true)!
}

function build(
  route: Route,
  pts: Pt[],
  firstEnd: Pt,
  dir: Pt,
  scale: number,
  withNext: boolean,
  width: number,
  height: number,
  force = false,
): Figure | null {
  const px = (q: Pt): Pt => [q[0] * scale, q[1] * scale]
  const path = pts.map(px)
  const end = path[path.length - 1]
  const side = route.side
  const perp: Pt | null = side === 1 ? left(dir) : side === -1 ? right(dir) : null

  const bands: Array<[Pt, Pt]> = []
  // 다리마다 통로 띠. 첫 통로는 꺾은 곳 너머로, 마지막 통로는 차 너머로 조금 더
  for (let i = 1; i < path.length; i++) bands.push([path[i - 1], path[i]])
  if (path.length > 2) {
    const a = path[0]
    const b = px(firstEnd)
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const u: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    const reach = perp && withNext && u[0] * perp[0] + u[1] * perp[1] > 0.5 ? NEXT_AISLE : EXT
    bands[0] = [a, add(b, u, reach)]
  }
  const lastStart = path[path.length - 2]
  const lastEnd = add(end, dir, EXT)
  bands[bands.length - 1] = [bands[bands.length - 1][0], lastEnd]
  if (perp && withNext) {
    // 차 너머 옆 통로(장식). 지나온 길과 겹치면 헷갈리므로 그리지 않음
    const next: [Pt, Pt] = [add(lastStart, perp, NEXT_AISLE), add(lastEnd, perp, NEXT_AISLE)]
    for (let i = 1; i < path.length - 1; i++) if (segDist(next, [path[i - 1], path[i]]) < BAND + 6) return null
    bands.push(next)
  }

  let stub: [Pt, Pt] | null = null
  let carCenter: Pt = end
  if (perp) {
    stub = [end, add(end, perp, STUB)]
    carCenter = add(end, perp, STUB + CAR_ACROSS / 2 - 2)
  }
  const horizontalAisle = Math.abs(dir[0]) > 0.5
  const cw = horizontalAisle ? CAR_ALONG : CAR_ACROSS
  const ch = horizontalAisle ? CAR_ACROSS : CAR_ALONG
  const car = { x: carCenter[0] - cw / 2, y: carCenter[1] - ch / 2, w: cw, h: ch }

  const startLabel = { x: path[0][0] + 14, y: path[0][1] + 6, text: route.start === 'ramp' ? '램프' : '입구' }
  const carLabelW = LABEL * 2.2

  // 경계 상자
  const boxes: Array<[number, number, number, number]> = []
  for (const [a, b] of bands) {
    boxes.push([Math.min(a[0], b[0]) - BAND / 2, Math.min(a[1], b[1]) - BAND / 2, Math.max(a[0], b[0]) + BAND / 2, Math.max(a[1], b[1]) + BAND / 2])
  }
  boxes.push([car.x, car.y, car.x + car.w, car.y + car.h])
  boxes.push([startLabel.x, startLabel.y - LABEL, startLabel.x + LABEL * 2.2, startLabel.y + 4])
  const minX = Math.min(...boxes.map((b) => b[0]))
  const minY = Math.min(...boxes.map((b) => b[1]))
  const maxX = Math.max(...boxes.map((b) => b[2]))
  const maxY = Math.max(...boxes.map((b) => b[3]))
  // '내 차' 글자는 차 오른쪽(자리가 없으면 왼쪽)
  const room = 8 + carLabelW
  const fitW = maxX - minX
  const pad = 6
  if (!force && (fitW > width - 2 * pad || maxY - minY > height - 2 * pad)) return null

  const dx = (width - (maxX + minX)) / 2
  const dy = (height - (maxY + minY)) / 2
  const T = (q: Pt): Pt => [round(q[0] + dx), round(q[1] + dy)]
  const carX = car.x + dx
  const labelRight = carX + car.w + room <= width - pad
  return {
    width,
    height,
    bands: bands.map(([a, b]) => [T(a), T(b)]),
    path: path.map(T),
    stub: stub && [T(stub[0]), T(stub[1])],
    car: { x: round(carX), y: round(car.y + dy), w: car.w, h: car.h },
    startLabel: { x: round(startLabel.x + dx), y: round(startLabel.y + dy), text: startLabel.text },
    carLabel: labelRight
      ? { x: round(carX + car.w + 8), y: round(car.y + dy + car.h / 2 + 5), anchor: 'start' }
      : { x: round(carX - 8), y: round(car.y + dy + car.h / 2 + 5), anchor: 'end' },
  }
}

const round = (v: number) => Math.round(v * 10) / 10

function pointSegDist(p: Pt, [a, b]: [Pt, Pt]): number {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const len2 = vx * vx + vy * vy
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2)) : 0
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy)
}

/** 두 선분 사이 최소 거리 (축에 나란한 짧은 선분들이라 끝점·중간점 표본으로 충분) */
function segDist(s1: [Pt, Pt], s2: [Pt, Pt]): number {
  let d = Infinity
  for (let k = 0; k <= 20; k++) {
    const t = k / 20
    d = Math.min(d, pointSegDist([s1[0][0] + (s1[1][0] - s1[0][0]) * t, s1[0][1] + (s1[1][1] - s1[0][1]) * t], s2))
  }
  return d
}
