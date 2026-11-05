import type { PathPoint } from '@api-types'
import { describe, expect, it } from 'vitest'
import { forwardPath, oneReversePath, PathBuilder, threeReversePath, twoReversePath } from './mock/pathgen'
import { buildReplay, isValidPath, switchIndices, trailAt, VIEW_H, VIEW_W } from './replay'

const T0 = 1_793_685_000_000

describe('PathBuilder (시연 동선)', () => {
  it('heading·좌표 규칙은 차량 앱 Pose와 같다 (x 오른쪽, y 앞, 반시계 +)', () => {
    const p = new PathBuilder(0).straight(10).points
    const last = p[p.length - 1]
    expect(last[1]).toBeCloseTo(0)
    expect(last[2]).toBeCloseTo(10)
    const left = new PathBuilder(0).arc(90, 5).points
    const end = left[left.length - 1]
    expect(end[3]).toBeCloseTo(Math.PI / 2, 2) // 왼쪽으로 돎
    expect(end[1]).toBeCloseTo(-5, 1) // 왼쪽(-x)으로
    expect(end[2]).toBeCloseTo(5, 1)
  })

  it('후진 원호는 뒤로 가면서 heading이 바뀐다', () => {
    const p = new PathBuilder(0).arc(-90, 5, true).points
    const end = p[p.length - 1]
    expect(end[4]).toBe(1)
    expect(end[3]).toBeCloseTo(-Math.PI / 2, 2)
    expect(end[2]).toBeLessThan(0) // 뒤로
  })
})

describe('전환점', () => {
  it('시안 M-33: 후진 2번 = 전환점 ①②③', () => {
    const path = twoReversePath(T0).map(([, , , , r]) => ({ reverse: r === 1 }))
    expect(switchIndices(path)).toHaveLength(3)
  })
  it('후진 없이 = 전환점 없음, 후진 1번 = 1개, 3번 = 5개', () => {
    const sw = (p: PathPoint[]) => switchIndices(p.map((q) => ({ reverse: q[4] === 1 }))).length
    expect(sw(forwardPath(T0))).toBe(0)
    expect(sw(oneReversePath(T0))).toBe(1)
    expect(sw(threeReversePath(T0))).toBe(5)
  })
})

describe('buildReplay', () => {
  const scene = buildReplay(twoReversePath(T0), 'PERPENDICULAR')!

  it('시안 크기 780×500, 기본 축척 32px/m (칸 폭 80px)', () => {
    expect(scene.width).toBe(VIEW_W)
    expect(scene.height).toBe(VIEW_H)
    expect(scene.k).toBeCloseTo(32)
    expect(scene.shape).toBe('PERPENDICULAR')
  })

  it('통로는 가로, 내 칸 줄은 위쪽, 차는 그 칸 줄 안 (시안처럼)', () => {
    const car = scene.points[scene.points.length - 1]
    expect(car.y).toBeLessThan(scene.aisle.top)
    expect(scene.aisle.bottom).toBeGreaterThan(scene.aisle.top)
    // 직각주차: 차가 세로로 (앞이 통로 쪽 = 후진으로 들어감 → 앞이 아래)
    const rot = ((car.rot % 360) + 360) % 360
    expect(Math.abs(rot - 180)).toBeLessThan(8)
  })

  it('진입은 왼쪽에서 오른쪽으로, 통로 안에서', () => {
    const p = scene.points
    const sw1 = scene.switches[0]
    expect(sw1.x).toBeGreaterThan(p[Math.floor(p.length / 6)].x)
    expect(scene.arrow).not.toBeNull()
    expect(scene.arrow!.dir.x).toBeGreaterThan(0.9)
    expect(sw1.y).toBeGreaterThan(scene.aisle.top)
    expect(sw1.y).toBeLessThan(scene.aisle.bottom)
  })

  it('동작 부분(첫 전환점 이후)과 차는 모두 그림 안', () => {
    const from = scene.switches[0].at
    for (const q of scene.points.filter((q) => q.at >= from)) {
      expect(q.x).toBeGreaterThanOrEqual(0)
      expect(q.x).toBeLessThanOrEqual(VIEW_W)
      expect(q.y).toBeGreaterThanOrEqual(0)
      expect(q.y).toBeLessThanOrEqual(VIEW_H)
    }
  })

  it('칸 경계선 간격 = 2.5m, 칸 깊이 = 5m', () => {
    const top = scene.stallLines.filter((l) => l.y1 === scene.stallLines[0].y1).map((l) => l.x1).sort((a, b) => a - b)
    const gaps = top.slice(1).map((x, i) => Math.round(x - top[i]))
    expect(new Set(gaps)).toEqual(new Set([Math.round(2.5 * scene.k)]))
    const l0 = scene.stallLines[0]
    expect(Math.abs(l0.y2 - l0.y1)).toBeCloseTo(5 * scene.k, 0)
  })

  it('진행값은 0 → 1로 늘어남, 전환점은 그 사이', () => {
    const at = scene.points.map((q) => q.at)
    expect(at[0]).toBe(0)
    expect(at[at.length - 1]).toBeCloseTo(1)
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThanOrEqual(at[i - 1])
    for (const sw of scene.switches) {
      expect(sw.at).toBeGreaterThan(0)
      expect(sw.at).toBeLessThan(1)
    }
    expect(scene.switches.map((s) => s.index)).toEqual([1, 2, 3])
  })

  it('형태를 모르면 각도로 판별 (직각)', () => {
    expect(buildReplay(twoReversePath(T0), 'UNKNOWN')!.shape).toBe('PERPENDICULAR')
    expect(buildReplay(forwardPath(T0))!.shape).toBe('PERPENDICULAR')
  })

  it('평행·사선도 그린다', () => {
    const parallel = new PathBuilder(T0).straight(14).stop(1).arc(-35, 5, true).arc(35, 5, true).straight(0.8).points
    const sp = buildReplay(parallel)!
    expect(sp.shape).toBe('PARALLEL')
    expect(sp.sidewalk).not.toBeNull()
    const angled = new PathBuilder(T0).straight(15).arc(60, 5).straight(3).points
    const sa = buildReplay(angled)!
    expect(sa.shape).toBe('ANGLED')
    expect(sa.stallLines.length).toBeGreaterThan(2)
    expect(sa.stallLines.some((l) => Math.abs(l.x2 - l.x1) > 5)).toBe(true) // 비스듬한 경계선
  })

  it('램프를 여러 바퀴 돈 긴 궤적은 앞부분을 자른다', () => {
    const long = new PathBuilder(T0).straight(30).arc(360, 6).arc(360, 6).straight(20).stop(1).arc(-90, 5, true).straight(2, true).points
    const s = buildReplay(long)!
    expect(s.points.length).toBeLessThan(long.length)
    expect(s.switches).toHaveLength(1)
  })

  it('대략적인 동선은 전환점만 잇고 점선 칸', () => {
    const s = buildReplay(twoReversePath(T0), 'PERPENDICULAR', true)!
    expect(s.approximate).toBe(true)
    expect(s.points.length).toBeLessThanOrEqual(2 + 3 * 2)
    expect(s.stallLines.every((l) => l.dashed)).toBe(true)
  })

  it('잘못된 동선은 그리지 않음', () => {
    expect(buildReplay([])).toBeNull()
    expect(buildReplay([[0, 0, 0, 0, 0]])).toBeNull()
    expect(isValidPath([[0, 0, 0, 0, 2]])).toBe(false)
    expect(isValidPath([[0, 'x', 0, 0, 0]])).toBe(false)
    expect(isValidPath('nope')).toBe(false)
    expect(isValidPath(twoReversePath(T0))).toBe(true)
  })
})

describe('trailAt (다시 보기)', () => {
  const scene = buildReplay(twoReversePath(T0), 'PERPENDICULAR')!

  it('끝까지: 실선·점선이 번갈아 (앞 → 후진 → 앞 → 후진), 차는 마지막 자리', () => {
    const t = trailAt(scene, 1)
    expect(t.runs.map((r) => r.reverse)).toEqual([false, true, false, true])
    const last = scene.points[scene.points.length - 1]
    expect(t.head.x).toBeCloseTo(last.x)
    expect(t.head.y).toBeCloseTo(last.y)
    for (const r of t.runs) expect(r.d).toMatch(/^M[\d.-]+ [\d.-]+( L[\d.-]+ [\d.-]+)+$/)
  })

  it('처음: 아직 진입 중 (실선 하나), 중간: 차가 그 사이', () => {
    const t0 = trailAt(scene, 0)
    expect(t0.runs.length).toBeLessThanOrEqual(1)
    expect(t0.head.x).toBeCloseTo(scene.points[0].x)
    const mid = trailAt(scene, scene.switches[1].at + 0.001)
    expect(mid.runs.length).toBe(3)
    expect(mid.runs[2].reverse).toBe(false)
  })

  it('진행값은 0..1로 자름', () => {
    expect(trailAt(scene, 5)).toEqual(trailAt(scene, 1))
    expect(trailAt(scene, -1)).toEqual(trailAt(scene, 0))
  })
})
