import { describe, expect, it } from 'vitest'
import { layoutRoute, parseRoute, type Figure } from './route'
import { MAIN_DEMO_ROUTE, samples } from './samples'

describe('parseRoute', () => {
  it('[start, L0, T1, L1, …, side]', () => {
    expect(parseRoute([1, 17, -1])).toEqual({ start: 'ramp', legs: [{ turn: 0, meters: 17 }], side: -1 })
    expect(parseRoute([0, 10, -1, 32, 1])).toEqual({
      start: 'entry',
      legs: [
        { turn: 0, meters: 10 },
        { turn: -1, meters: 32 },
      ],
      side: 1,
    })
  })

  it('형식이 틀리면 null (그림 없이 글만)', () => {
    expect(parseRoute(undefined)).toBeNull()
    expect(parseRoute([])).toBeNull()
    expect(parseRoute([0, 10])).toBeNull() // 짝수 길이
    expect(parseRoute([2, 10, 1])).toBeNull() // start
    expect(parseRoute([0, 10, 3])).toBeNull() // side
    expect(parseRoute([0, 10, 5, 20, 1])).toBeNull() // turn
    expect(parseRoute([0, -1, 1])).toBeNull() // 거리
  })
})

const inside = (f: Figure, x: number, y: number, pad = 0) => x >= pad && x <= f.width - pad && y >= pad && y <= f.height - pad

describe('layoutRoute', () => {
  const cases: Array<[string, number[]]> = [
    ['시연 (램프 → 오른쪽 칸)', MAIN_DEMO_ROUTE],
    ...samples(0)
      .filter((s) => s.parking?.r)
      .map((s): [string, number[]] => [s.id, s.parking!.r!]),
    ['아주 긴 직선', [0, 400, 1]],
    ['크게 돌아 옆 통로', [0, 20, 2, 30, -1]],
    ['칸 쪽 모름', [0, 25, 0]],
  ]

  it.each(cases)('%s: 모든 요소가 342×190 상자 안', (_, r) => {
    const f = layoutRoute(parseRoute(r)!)
    for (const [x, y] of f.path) expect(inside(f, x, y, 8)).toBe(true)
    for (const [a, b] of f.bands) {
      expect(inside(f, a[0], a[1], 8)).toBe(true)
      expect(inside(f, b[0], b[1], 8)).toBe(true)
    }
    expect(inside(f, f.car.x, f.car.y)).toBe(true)
    expect(inside(f, f.car.x + f.car.w, f.car.y + f.car.h)).toBe(true)
  })

  it('시안처럼: 입구에서 위로 → 오른쪽 → 차는 통로 왼쪽(위)', () => {
    const f = layoutRoute(parseRoute([0, 12, -1, 55, 1])!)
    const [p0, p1, p2] = f.path
    expect(p1[0]).toBeCloseTo(p0[0]) // 위로
    expect(p1[1]).toBeLessThan(p0[1])
    expect(p2[1]).toBeCloseTo(p1[1]) // 오른쪽으로
    expect(p2[0]).toBeGreaterThan(p1[0])
    expect(f.car.y + f.car.h).toBeLessThan(p2[1]) // 차는 통로 위쪽(왼쪽 칸)
    expect(f.stub).not.toBeNull()
    expect(f.startLabel.text).toBe('입구')
  })

  it('오른쪽 칸이면 차가 진행 방향 오른쪽', () => {
    const f = layoutRoute(parseRoute(MAIN_DEMO_ROUTE)!)
    const [p0, p1] = f.path
    expect(p1[1]).toBeLessThan(p0[1]) // 위로 걸음
    expect(f.car.x).toBeGreaterThan(p1[0]) // 오른쪽
    expect(f.startLabel.text).toBe('램프')
  })

  it('칸 쪽을 모르면 점선 없이 길 끝에 차', () => {
    const f = layoutRoute(parseRoute([0, 25, 0])!)
    expect(f.stub).toBeNull()
    const end = f.path[f.path.length - 1]
    expect(f.car.x).toBeLessThan(end[0])
    expect(f.car.x + f.car.w).toBeGreaterThan(end[0])
  })
})
