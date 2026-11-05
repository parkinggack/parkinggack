/**
 * 시연 데이터용 동선 만들기 — 차량 앱 ScenarioBuilder(domain/sim/ScenarioGenerator.kt)를 아주 줄인 판.
 * 직진·원호를 이어 붙여 PathPoint([tMs, x, y, headingRad, reverse])를 찍는다.
 *
 * 좌표는 차량 앱 Pose와 같다: 시작점 기준 m, x = 처음 진행 방향 오른쪽(+), y = 앞(+), heading = +y 기준 반시계(+).
 * reverse = 그 점으로 '들어오는' 움직임이 후진이면 1.
 */
import type { PathPoint } from '@api-types'

export class PathBuilder {
  private x = 0
  private y = 0
  private h = 0
  private t: number
  private rev: 0 | 1 = 0
  readonly points: PathPoint[] = []

  constructor(startMs: number) {
    this.t = startMs
    this.emit()
  }

  /** 앞 방향 단위 벡터 */
  private fwd(h: number): [number, number] {
    return [-Math.sin(h), Math.cos(h)]
  }

  private emit() {
    const r = (v: number, k = 100) => Math.round(v * k) / k
    this.points.push([Math.round(this.t), r(this.x), r(this.y), r(this.h, 1000), this.rev])
  }

  /** [m] 만큼 곧게 (reverse면 뒤로) */
  straight(m: number, reverse = false, speedMps = 1.6, step = 0.6): this {
    this.rev = reverse ? 1 : 0
    const n = Math.max(1, Math.ceil(m / step))
    const ds = m / n
    const [fx, fy] = this.fwd(this.h)
    const dir = reverse ? -1 : 1
    for (let i = 0; i < n; i++) {
      this.x += fx * ds * dir
      this.y += fy * ds * dir
      this.t += (ds / speedMps) * 1000
      this.emit()
    }
    return this
  }

  /** heading을 deg(반시계 +)만큼 바꾸는 반지름 radius 원호. 후진이어도 heading 기준 */
  arc(deg: number, radius: number, reverse = false, speedMps = 1.0, stepDeg = 6): this {
    this.rev = reverse ? 1 : 0
    const total = (deg * Math.PI) / 180
    const n = Math.max(2, Math.ceil(Math.abs(deg) / stepDeg))
    const dh = total / n
    const ds = Math.abs(dh) * radius
    const dir = reverse ? -1 : 1
    for (let i = 0; i < n; i++) {
      const [fx, fy] = this.fwd(this.h + dh / 2)
      this.x += fx * ds * dir
      this.y += fy * ds * dir
      this.h += dh
      this.t += (ds / speedMps) * 1000
      this.emit()
    }
    return this
  }

  /** 멈춰서 [sec] 동안 (기어 바꾸기 등) */
  stop(sec: number): this {
    this.t += sec * 1000
    this.emit()
    return this
  }

  get durationMs(): number {
    return this.points.length ? this.points[this.points.length - 1][0] - this.points[0][0] : 0
  }
}

/** 전진↔후진이 바뀐 횟수 중 후진으로 들어간 횟수 */
export function countReverses(path: readonly PathPoint[]): number {
  let n = 0
  for (let i = 1; i < path.length; i++) if (path[i][4] === 1 && path[i - 1][4] === 0) n++
  return n
}

/**
 * 시안 M-33: 통로로 들어와 자리를 지나쳐 멈춤 → ① 왼쪽으로 감고 후진 → ② 앞으로 조금 → ③ 다시 후진해서 칸으로.
 * 차량 앱 메인 시연(pangyoDepartmentStore)의 B2 부분을 좌우로 바꾼 것 (시안처럼 칸이 진행 방향 왼쪽).
 */
export function twoReversePath(startMs: number): PathPoint[] {
  return new PathBuilder(startMs)
    .straight(20, false, 1.9)
    .stop(1.5)
    .arc(-60, 5.5, true, 1.1)
    .stop(2)
    .arc(-20, 6, false, 0.8)
    .stop(1.5)
    .arc(-10, 7, true, 0.8)
    .straight(4.5, true, 0.8)
    .stop(1.5).points
}

/** 후진 한 번: 지나쳐 멈춘 뒤 오른쪽 칸으로 크게 감고 후진 */
export function oneReversePath(startMs: number): PathPoint[] {
  return new PathBuilder(startMs)
    .straight(18, false, 1.8)
    .stop(1.2)
    .arc(90, 5, true, 1.0)
    .straight(2.6, true, 0.7)
    .stop(1).points
}

/** 후진 없이: 통로에서 왼쪽 칸으로 앞으로 */
export function forwardPath(startMs: number): PathPoint[] {
  return new PathBuilder(startMs)
    .straight(16, false, 1.8)
    .arc(90, 5, false, 1.0)
    .straight(2.4, false, 0.7)
    .stop(1).points
}

/** 후진 세 번: 좁은 통로에서 여러 번 고쳐 넣음 */
export function threeReversePath(startMs: number): PathPoint[] {
  return new PathBuilder(startMs)
    .straight(22, false, 1.8)
    .stop(1.5)
    .arc(-45, 5, true, 1.0)
    .stop(1.5)
    .arc(-15, 5, false, 0.7)
    .straight(0.8, false, 0.6)
    .stop(1.5)
    .arc(-25, 5.5, true, 0.8)
    .stop(1.5)
    .straight(0.8, false, 0.6)
    .stop(1.2)
    .arc(-5, 6, true, 0.7)
    .straight(3.5, true, 0.7)
    .stop(1).points
}
