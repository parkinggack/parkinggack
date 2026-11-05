import { describe, expect, it } from 'vitest'
import { parseRoute } from './route'
import { MAIN_DEMO_ROUTE, samples } from './samples'
import { bigLines, fromMyParking, fromPayload, landmarkOf, waySteps, wayTitle } from './spot'
import { layoutWay, startKindOf } from './wayfigure'
import { parkingFixtures } from './mock/fixtures'

const inBox = (x: number, y: number, pad = 0) => x >= pad && x <= 350 - pad && y >= pad && y <= 300 - pad

describe('layoutWay (M-02 그림 350×300)', () => {
  const cases: Array<[string, number[]]> = [
    ['시안 (엘리베이터 → 곧장 → 왼쪽 칸)', [0, 24, 1]],
    ['시연 (램프 → 오른쪽 칸)', MAIN_DEMO_ROUTE],
    ...samples(0)
      .filter((s) => s.parking?.r)
      .map((s): [string, number[]] => [s.id, s.parking!.r!]),
    ['아주 긴 직선', [0, 400, 1]],
    ['크게 돌아 옆 통로', [0, 20, 2, 30, -1]],
    ['칸 쪽 모름', [0, 25, 0]],
  ]

  it.each(cases)('%s: 길·차·출발 표시가 그림 안', (_, r) => {
    const f = layoutWay(parseRoute(r)!, 'entry')
    for (const [x, y] of f.points) expect(inBox(x, y, 4)).toBe(true)
    expect(inBox(f.car.x, f.car.y, 10)).toBe(true)
    expect(inBox(f.start.x, f.start.y)).toBe(true)
    expect(inBox(f.start.x + f.start.w, f.start.y + f.start.h)).toBe(true)
  })

  it('시안처럼: 마지막 통로는 가로(→), 왼쪽 칸이면 차가 위 줄·앞이 위, 출발 상자는 길 왼쪽', () => {
    const f = layoutWay(parseRoute([0, 24, 1])!, 'elevator')
    const [p0, p1, stub] = f.points
    expect(p1[1]).toBeCloseTo(p0[1]) // 가로
    expect(p1[0]).toBeGreaterThan(p0[0]) // 오른쪽으로
    expect(p0[1]).toBeCloseTo(150) // 통로가 가운데
    expect(stub[1]).toBeLessThan(p1[1]) // 칸으로 위로
    expect(f.car.y).toBeLessThan(p1[1])
    expect(f.car.rot).toBe(0)
    expect(f.start.x + f.start.w).toBeLessThanOrEqual(p0[0])
    expect(f.rows.length).toBeGreaterThan(6) // 위·아래 칸 줄
  })

  it('오른쪽 칸이면 아래 줄, 앞이 아래', () => {
    const f = layoutWay(parseRoute(MAIN_DEMO_ROUTE)!, 'ramp')
    expect(f.car.y).toBeGreaterThan(150)
    expect(f.car.rot).toBe(180)
  })

  it('꺾인 길도 마지막 다리는 가로로 돌린다', () => {
    const f = layoutWay(parseRoute([0, 12, -1, 55, 1])!, 'entry')
    const n = f.points.length
    const a = f.points[n - 3]
    const b = f.points[n - 2]
    expect(a[1]).toBeCloseTo(b[1])
    expect(b[0]).toBeGreaterThan(a[0])
  })
})

describe('M-02 글', () => {
  const mine = fromMyParking(parkingFixtures(Date.UTC(2026, 10, 3, 8, 2))[0])

  it('시안 제목: "엘리베이터 2번에서 / D 구역으로 가세요"', () => {
    expect(landmarkOf('엘리베이터 2번 쪽')).toBe('엘리베이터 2번')
    expect(landmarkOf('기둥 색 파랑')).toBeNull()
    expect(wayTitle(mine)).toEqual(['엘리베이터 2번에서', 'D 구역으로 가세요'])
    expect(startKindOf(mine.route, mine.hints, mine.note)).toBe('elevator')
  })

  it('차가 램프 기준으로 계산한 힌트면 제목도 층 기준, 그림은 램프', () => {
    const s = fromPayload({ v: 1, lot: '아브뉴프랑 판교 주차장', f: 'B2', z: 'D', n: '07', t: 1, m: '엘리베이터 2번 쪽', h: ['램프를 다 내려와서 곧장', '오른쪽 칸 줄, 약 15m 지점'], r: [1, 17, -1] }, '3a9c2e')
    expect(wayTitle(s)).toEqual(['B2에서', 'D 구역으로 가세요'])
    expect(startKindOf(s.route, s.hints, s.note)).toBe('ramp')
    expect(waySteps(s)).toEqual({ steps: ['램프를 다 내려와서 곧장', '오른쪽 칸 줄, 약 15m 지점'], fromCar: true })
  })

  it('힌트가 없으면 표지판 단계, 그림 없음', () => {
    const s = fromPayload({ v: 1, lot: '현대백화점 판교점', f: 'B4', z: 'F', n: '11', t: 1 }, '')
    expect(s.route).toBeNull()
    expect(waySteps(s)).toEqual({ steps: ['B4에서 내리기', 'F 구역 표지판 따라가기', 'F-11 찾기'], fromCar: false })
    expect(bigLines(s)).toEqual({ top: 'B4', bottom: 'F-11' })
    expect(s.key).toBe('t1')
  })

  it('층이 없으면 구역이 큰 글자', () => {
    const s = fromPayload({ v: 1, lot: 'x', f: '', z: 'A', n: '', t: 1 }, 'k')
    expect(bigLines(s)).toEqual({ top: 'A', bottom: '' })
    expect(wayTitle(s)).toEqual(['A 구역으로', '가세요'])
  })
})
