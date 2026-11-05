/**
 * M-02 돌아가는 길 그림 (새 시안 350×300): 먹색 바닥, 마지막 통로 양쪽 칸 줄, 출발 표시(엘리베이터·램프·입구),
 * 흰 점선 길, 칸 안의 내 차. 길 모양은 차가 보낸 압축 경로 `route`(route.ts parseRoute)로 그린다 — 축척은 대략.
 *
 * 마지막 통로가 늘 가로(왼쪽 → 오른쪽)가 되게 돌린다. 좌우 뒤집기는 하지 않으므로 '왼쪽 칸'은 늘 위 줄, '오른쪽 칸'은 아래 줄.
 */
import { routePolyline, type Route } from './route'

export type StartKind = 'elevator' | 'stairs' | 'ramp' | 'entry'

export interface WayLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface WayFigure {
  width: number
  height: number
  /** 칸 경계선과 통로 쪽 앞선 (두 줄) */
  rows: WayLine[]
  /** 걸어갈 길 (흰 점선) */
  path: string
  /** 길의 꺾은 점들 (테스트·접근성) */
  points: Array<[number, number]>
  /** 내 차 가운데·회전(도, 0 = 앞이 위) */
  car: { x: number; y: number; rot: number }
  /** 출발 표시 상자 (왼쪽 위, 40×44) */
  start: { x: number; y: number; w: number; h: number; kind: StartKind }
}

type P = [number, number]

const W = 350
const H = 300
const PAD = 8
const PITCH = 58 // 칸 폭
const DEPTH = 92 // 칸 깊이
const NEAR = 38 // 통로 가운데 → 칸 앞선
const CAR_SET = 50 // 칸 앞선 → 차 가운데
const CAR_W = 30
const CAR_L = 56
const ICON_W = 40
const ICON_H = 44
const GAP = 6

const rot = (p: P, quarter: number): P => {
  // quarter: 시계 방향 90° 횟수 (화면 좌표)
  let [x, y] = p
  for (let i = 0; i < ((quarter % 4) + 4) % 4; i++) [x, y] = [-y, x]
  return [x, y]
}

export function layoutWay(route: Route, kind: StartKind): WayFigure {
  const { pts: raw, lastDir } = routePolyline(route)
  // 마지막 다리 방향 → 오른쪽(+x)
  const q = lastDir[0] === 1 ? 0 : lastDir[1] === 1 ? 3 : lastDir[0] === -1 ? 2 : 1
  const pts = raw.map((p) => rot(p, q))
  const first = pts.length > 1 ? norm([pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]]) : ([1, 0] as P)
  const side = route.side // 1 = 왼쪽 = 위 줄
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const bw = Math.max(1, Math.max(...xs) - Math.min(...xs))
  const bh = Math.max(0, Math.max(...ys) - Math.min(...ys))

  let s = Math.min(9, 230 / bw, bh > 0 ? 200 / bh : 9)
  for (let attempt = 0; attempt < 14; attempt++, s *= 0.88) {
    const fig = place(pts, first, side, kind, s, attempt === 13)
    if (fig) return fig
  }
  return place(pts, first, side, kind, s, true)!
}

function norm(d: P): P {
  const l = Math.hypot(d[0], d[1]) || 1
  return [Math.round(d[0] / l), Math.round(d[1] / l)]
}

function place(pts: P[], first: P, side: number, kind: StartKind, s: number, force: boolean): WayFigure | null {
  const px = pts.map(([x, y]): P => [x * s, y * s])
  const end = px[px.length - 1]
  const aisleY0 = end[1]
  // 차와 칸 (위 줄 = 앞이 위, 아래 줄 = 앞이 아래)
  const carRow = side === 1 ? -1 : side === -1 ? 1 : 0
  const car = carRow
    ? { x: end[0], y: aisleY0 + carRow * (NEAR + CAR_SET), rot: carRow < 0 ? 0 : 180 }
    : { x: end[0] + CAR_L / 2 + 4, y: aisleY0, rot: 90 }
  const stubEnd: P | null = carRow ? [end[0], car.y - carRow * (CAR_L / 2 + 6)] : null
  // 출발 상자: 첫 다리 반대쪽에 붙임
  const st = px[0]
  const icon = {
    x: first[0] === 1 ? st[0] - GAP - ICON_W : first[0] === -1 ? st[0] + GAP : st[0] - ICON_W / 2,
    y: first[1] === 1 ? st[1] - GAP - ICON_H : first[1] === -1 ? st[1] + GAP : st[1] - ICON_H / 2,
  }
  // 경계: 길 + 차 + 출발 상자 (칸 줄은 장식이라 잘려도 됨)
  const boxes: Array<[number, number, number, number]> = [
    [Math.min(...px.map((p) => p[0])), Math.min(...px.map((p) => p[1])), Math.max(...px.map((p) => p[0])), Math.max(...px.map((p) => p[1]))],
    // 차 칸 + 오른쪽 옆 칸 하나 (칸 줄이 차 너머로 조금 이어져 보이게 — 시안처럼)
    carRow ? [car.x - PITCH / 2, car.y - CAR_L / 2, car.x + PITCH * 1.5, car.y + CAR_L / 2] : [car.x - CAR_L / 2, car.y - CAR_W / 2, car.x + CAR_L / 2, car.y + CAR_W / 2],
    [icon.x, icon.y, icon.x + ICON_W, icon.y + ICON_H],
  ]
  const minX = Math.min(...boxes.map((b) => b[0]))
  const minY = Math.min(...boxes.map((b) => b[1]))
  const maxX = Math.max(...boxes.map((b) => b[2]))
  const maxY = Math.max(...boxes.map((b) => b[3]))
  if (!force && (maxX - minX > W - 2 * PAD || maxY - minY > H - 2 * PAD)) return null
  // 가로는 가운데, 세로는 통로가 가운데(150)에 오도록 — 넘치면 안으로 밀기
  const dx = (W - (maxX + minX)) / 2
  let dy = H / 2 - aisleY0
  if (minY + dy < PAD) dy = PAD - minY
  if (maxY + dy > H - PAD) dy = H - PAD - maxY
  const r = (n: number) => Math.round(n * 10) / 10
  const T = (p: P): P => [r(p[0] + dx), r(p[1] + dy)]

  const aisleY = aisleY0 + dy
  const carX = car.x + dx
  // 칸 줄: 차 칸을 기준으로 58px 간격, 마지막 통로 시작 근처부터 오른쪽 끝 근처까지
  const lastStartX = px[px.length - 2][0] + dx
  const left = Math.max(PAD + 40, Math.min(lastStartX, carX - PITCH / 2) - 2)
  const right = Math.min(W - PAD - 6, carX + PITCH / 2 + PITCH)
  const seps: number[] = []
  for (let x = carX - PITCH / 2; x >= left - 0.5; x -= PITCH) seps.unshift(x)
  for (let x = carX + PITCH / 2; x <= right + 0.5; x += PITCH) seps.push(x)
  const rows: WayLine[] = []
  if (seps.length >= 2) {
    const a = seps[0]
    const b = seps[seps.length - 1]
    for (const dir of [-1, 1]) {
      const front = aisleY + dir * NEAR + (dir > 0 ? 2 : 0)
      const back = front + dir * DEPTH
      for (const x of seps) rows.push({ x1: r(x), y1: r(Math.min(front, back)), x2: r(x), y2: r(Math.max(front, back)) })
      rows.push({ x1: r(a), y1: r(front), x2: r(b), y2: r(front) })
    }
  }

  const path = [...px.map(T), ...(stubEnd ? [T(stubEnd)] : [])]
  const d = path.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')
  return {
    width: W,
    height: H,
    rows,
    path: d,
    points: path,
    car: { x: r(carX), y: r(car.y + dy), rot: car.rot },
    start: { x: r(icon.x + dx), y: r(icon.y + dy), w: ICON_W, h: ICON_H, kind },
  }
}

/** 메모·힌트에서 출발 기준을 고른다. 힌트가 램프·입구에서 시작하면 그걸 따르고, 아니면 메모의 엘리베이터·계단 */
export function startKindOf(route: Route | null, hints: readonly string[], note: string | null | undefined): StartKind {
  const h0 = hints[0] ?? ''
  if (/램프/.test(h0)) return 'ramp'
  if (/입구/.test(h0)) return 'entry'
  if (/엘리베이터|에스컬레이터/.test(note ?? '') || /엘리베이터/.test(h0)) return 'elevator'
  if (/계단/.test(note ?? '') || /계단/.test(h0)) return 'stairs'
  return route?.start === 'ramp' ? 'ramp' : 'entry'
}
