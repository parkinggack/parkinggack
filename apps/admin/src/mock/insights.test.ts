import {
  DEMO_LOTS, DEMO_NOW, deriveStalls, demoCompare, demoLotInsights, demoOverview, generateFloorLayout, generateOverlayPaths, hashSeed,
  monthLabels,
} from '@insights-demo'
import { describe, expect, it } from 'vitest'
import { createInsightsClient } from '../api'
import { createMockDb } from './fixtures'
import { createMockFetch } from './mockFetch'

/** D-03 시안 표: 이름 · 유형 · 난이도 · 평균 후진 · 램프 바퀴 · 평균 시간(초) · 기록 */
const D03: [string, string, number, number, number, number, number][] = [
  ['현대백화점 판교점 지하', 'DEPARTMENT', 4.3, 3.2, 2.5, 130, 1284],
  ['유스페이스', 'OFFICE', 4.1, 2.9, 1.5, 115, 642],
  ['H스퀘어', 'OFFICE', 3.9, 2.6, 2, 110, 871],
  ['판교세븐벤처밸리', 'OFFICE', 3.6, 2.4, 1, 100, 515],
  ['봇들마을 상가', 'MALL', 3.4, 2.3, 0, 90, 233],
  ['화랑공원 공영', 'PUBLIC', 2.9, 1.8, 0, 70, 402],
  ['알파돔타워', 'OFFICE', 2.4, 1.5, 0.3, 65, 958],
  ['아브뉴프랑 판교', 'MALL', 1.8, 1.1, 0.2, 50, 1106],
  ['백현마을 5단지', 'APARTMENT', 1.6, 0.9, 0, 40, 377],
]

describe('대시보드 시연 데이터 (packages/insights-demo) — 시안 수치', () => {
  it('D-01 합계: 6,388건 · 9곳 · 평균 후진 2.0회 (지난달 2.3회), 판교 일대', () => {
    const o = demoOverview({ now: DEMO_NOW })!
    expect(o.region).toEqual({ id: 'pangyo', name: '판교 일대', center: { lat: 37.39475, lng: 127.11119 } })
    expect(o.days).toBe(30)
    expect(o.totals).toEqual({ records: 6388, lots: 9, avgReverse: 2.0, prevAvgReverse: 2.3 })
  })

  it('D-03 표의 9곳 값과 어려운 순서 그대로', () => {
    const o = demoOverview()!
    expect(o.lots.map((l) => [l.shortName, l.category, l.difficulty, l.avgReverse, l.avgRampTurns, l.avgDurationSec, l.records])).toEqual(D03)
    expect(o.lots[0]).toMatchObject({ id: 'hyundai-pangyo', name: '현대백화점 판교점 지하주차장' })
  })

  it('좋아진 곳 4곳: 화랑공원 2.2→1.8, H스퀘어 2.9→2.6, 아브뉴프랑 1.4→1.1, 알파돔 1.7→1.5', () => {
    const o = demoOverview()!
    expect(o.improved.map((m) => [m.name, m.before, m.after])).toEqual([
      ['화랑공원 공영', 2.2, 1.8], ['H스퀘어', 2.9, 2.6], ['아브뉴프랑 판교', 1.4, 1.1], ['알파돔타워', 1.7, 1.5],
    ])
    for (const m of o.improved) {
      expect(m.trend).toHaveLength(6)
      expect(m.trend[0]).toBe(m.before)
      expect(m.trend[5]).toBe(m.after)
    }
  })

  it('6개월 추이는 이번 달까지, 마지막 값 = 지금 평균 후진', () => {
    expect(monthLabels(DEMO_NOW)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    expect(monthLabels(Date.parse('2027-01-31T16:00:00Z'))[5]).toBe('2027-02') // 한국 시간 2월 1일
    for (const l of demoOverview({ now: DEMO_NOW })!.lots) {
      expect(l.trend.map((t) => t.month)).toEqual(monthLabels(DEMO_NOW))
      expect(l.trend[5].avgReverse).toBe(l.avgReverse)
    }
  })

  it('요일 × 시간대 히트맵 7 × 8 (8시 … 22시)', () => {
    const { heat } = demoOverview()!
    expect(heat.weekdays).toEqual(['월', '화', '수', '목', '금', '토', '일'])
    expect(heat.hours).toEqual(['8시', '10시', '12시', '14시', '16시', '18시', '20시', '22시'])
    expect(heat.values).toHaveLength(7)
    expect(heat.values.every((r) => r.length === 8)).toBe(true)
  })

  it('기간을 바꾸면 기록 수만 비례 (평균은 같음), 모르는 지역은 null', () => {
    const o7 = demoOverview({ days: 7 })!
    expect(o7.days).toBe(7)
    expect(o7.lots.find((l) => l.id === 'hyundai-pangyo')!.records).toBe(Math.round((1284 * 7) / 30))
    expect(o7.totals.avgReverse).toBe(2.0)
    expect(demoOverview({ region: 'seoul' })).toBeNull()
    expect(demoCompare({ region: 'seoul' })).toBeNull()
  })

  it('비교: 유형 하나 · 여럿 (쉼표)', () => {
    expect(demoCompare({ category: 'OFFICE' })!.lots.map((l) => l.shortName)).toEqual(['유스페이스', 'H스퀘어', '판교세븐벤처밸리', '알파돔타워'])
    expect(demoCompare({ category: 'DEPARTMENT,MALL' })!.lots).toHaveLength(3)
    expect(demoCompare({ category: ['PUBLIC'] })!.lots.map((l) => l.id)).toEqual(['hwarang-park-public'])
    expect(demoCompare()!.lots).toHaveLength(9)
  })
})

describe('D-02 주차장 상세: 도면 · 겹친 동선 · 후진 잦은 곳', () => {
  const r = demoLotInsights('hyundai-pangyo', { now: DEMO_NOW })!

  it('현대백화점: 지하 1~6층, 지역 평균 2.0회, 층별 평균 후진 (B2 3.6회가 가장 많음)', () => {
    expect(r.lot).toMatchObject({ id: 'hyundai-pangyo', floors: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'], regionAvgReverse: 2.0, records: 1284 })
    expect(r.floorAvgReverse).toEqual([
      { floor: 'B1', avgReverse: 2.1 }, { floor: 'B2', avgReverse: 3.6 }, { floor: 'B3', avgReverse: 3.4 },
      { floor: 'B4', avgReverse: 3.0 }, { floor: 'B5', avgReverse: 2.8 }, { floor: 'B6', avgReverse: 2.6 },
    ])
  })

  it('B2 후진 잦은 곳 3곳 (시안 문구·값)', () => {
    const b2 = r.hotspots.filter((h) => h.floor === 'B2')
    expect(b2.map((h) => [h.rank, h.title, h.detail, h.avgReverse])).toEqual([
      [1, '램프 나와서 바로 왼쪽', '회전 직후 시야가 좁아요', 2.8],
      [2, 'C 구역 기둥 사이', '기둥이 촘촘해요', 2.4],
      [3, 'E 구역 끝 칸', '막다른 통로', 2.1],
    ])
  })

  it('층마다 동선을 나눠 그리고 합은 기록 수 (B2 360대)', () => {
    expect(r.overlays.map((o) => o.floor)).toEqual(r.lot.floors)
    expect(r.overlays.reduce((a, o) => a + o.paths.length, 0)).toBe(1284)
    expect(r.overlays.find((o) => o.floor === 'B2')!.paths).toHaveLength(360)
  })

  it('동선 점은 도면 안([x, y, 0|1]), 첫 점은 앞으로, 후진 구간이 있다', () => {
    const layout = r.layout.find((l) => l.floor === 'B2')!
    const paths = r.overlays.find((o) => o.floor === 'B2')!.paths
    let rev = 0
    for (const p of paths) {
      expect(p.length).toBeGreaterThan(10)
      expect(p[0][2]).toBe(0)
      for (const [x, y, f] of p) {
        expect(x).toBeGreaterThanOrEqual(-1)
        expect(x).toBeLessThanOrEqual(layout.width + 1)
        expect(y).toBeGreaterThanOrEqual(-1)
        expect(y).toBeLessThanOrEqual(layout.height + 1)
        if (f === 1) rev++
      }
    }
    expect(rev).toBeGreaterThan(paths.length) // 후진 주차 60% × 여러 점
  })

  it('도면: 나선 램프 1개, 통로 4개, 구역 A–H, 주차 칸 6줄과 기둥', () => {
    const l = r.layout[0]
    expect(l.ramps).toHaveLength(1)
    expect(l.aisles).toHaveLength(4)
    expect(l.zones.map((z) => z.label)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    const s = deriveStalls(l)
    expect(s.rows).toHaveLength(6)
    expect(s.rows[0].lines).toHaveLength(18) // 시안: 150…728 px, 34 px 간격
    expect(s.pillars.length).toBeGreaterThan(10)
    // 곧은 경사로·지상 주차장은 나선 램프 없음
    expect(generateFloorLayout({ floor: 'B1', ramp: 'straight' }).ramps).toEqual([])
    expect(demoLotInsights('hwarang-park-public')!.layout.map((x) => x.floor)).toEqual(['1F'])
  })

  it('같은 인자면 같은 결과 · 상한 · 없는 주차장은 null', () => {
    expect(demoLotInsights('h-square')).toEqual(demoLotInsights('h-square'))
    const capped = demoLotInsights('hyundai-pangyo', { maxPathsPerFloor: 20 })!
    expect(capped.overlays.every((o) => o.paths.length <= 20)).toBe(true)
    expect(demoLotInsights('nope')).toBeNull()
    const layout = generateFloorLayout({ floor: 'B1', ramp: 'spiral' })
    expect(generateOverlayPaths(layout, { count: 5, seed: hashSeed('x'), ramp: 'spiral' })).toHaveLength(5)
    expect(generateOverlayPaths(layout, { count: 0, seed: 1, ramp: 'spiral' })).toEqual([])
  })

  it('9곳 모두 상세가 있다 (가장 쉬운 곳은 후진 잦은 곳 없음)', () => {
    for (const d of DEMO_LOTS) {
      const x = demoLotInsights(d.id)!
      expect(x.lot.records).toBe(d.records)
      expect(x.overlays.reduce((a, o) => a + o.paths.length, 0)).toBe(d.records)
    }
    expect(demoLotInsights('baekhyun-5')!.hotspots).toEqual([])
  })
})

describe('가짜 서버: GET /v1/insights/* (공개, 인증 없음)', () => {
  const db = createMockDb(DEMO_NOW)
  const api = createInsightsClient({ baseUrl: 'http://localhost:8787', fetchImpl: createMockFetch(() => db, { now: () => DEMO_NOW }) })

  it('토큰 없이 개요 · 비교 · 상세', async () => {
    expect((await api.overview()).totals.records).toBe(6388)
    expect((await api.compare({ category: 'OFFICE' })).lots).toHaveLength(4)
    expect((await api.compare({ category: ['DEPARTMENT', 'MALL'] })).lots).toHaveLength(3)
    const lot = await api.lot('hyundai-pangyo')
    expect(lot.hotspots.filter((h) => h.floor === 'B2')).toHaveLength(3)
    expect((await api.overview({ days: 90 })).totals.records).toBe(6388 * 3)
  })

  it('잘못된 값은 400, 없는 주차장·지역은 404', async () => {
    await expect(api.overview({ days: 0 })).rejects.toMatchObject({ status: 400, code: 'bad_request' })
    await expect(api.compare({ category: 'CASTLE' as never })).rejects.toMatchObject({ status: 400 })
    await expect(api.lot('nope')).rejects.toMatchObject({ status: 404, code: 'not_found' })
    await expect(api.overview({ region: 'busan' })).rejects.toMatchObject({ status: 404 })
  })
})
