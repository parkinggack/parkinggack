import { describe, expect, it } from 'vitest'
import { DEMO_LOTS, DEMO_NOW, DEMO_REGION, demoCompare, demoLotInsights, demoOverview } from '../../../packages/insights-demo/index.ts'
import { PANGYO_TARGETS } from '../src/seed/lots.js'
import { makeApp, record } from './helpers.js'

const t = await makeApp()
const ROW_KEYS = ['avgDurationSec', 'avgRampTurns', 'avgReverse', 'category', 'difficulty', 'id', 'location', 'name', 'rampKind', 'records', 'shortName', 'trend'].sort()

describe('GET /v1/insights/overview (D-01)', () => {
  it('판교 일대: 6,388건 · 9곳 · 평균 후진 2.0회 (지난 기간 2.3회)', async () => {
    const { status, body, res } = await t.get('/v1/insights/overview?region=pangyo&days=30')
    expect(status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=60')
    expect(body.region).toEqual({ id: 'pangyo', name: '판교 일대', center: { lat: expect.any(Number), lng: expect.any(Number) } })
    // 지역 중심은 insights-demo DEMO_REGION 과 같다
    expect(body.region).toEqual(DEMO_REGION)
    expect(body.days).toBe(30)
    expect(body.demo).toBe(true)
    expect(body.totals).toEqual({ records: 6388, lots: 9, avgReverse: 2, prevAvgReverse: 2.3 })
    // 기본값 region=pangyo, days=30
    expect((await t.get('/v1/insights/overview')).body.totals).toEqual(body.totals)
  })

  it('주차장 표: 어려운 순, D-03 값 그대로, 6개월 추이', async () => {
    const { body } = await t.get('/v1/insights/overview')
    expect(body.lots.map((l: any) => l.shortName)).toEqual([
      '현대백화점 판교점 지하',
      '유스페이스',
      'H스퀘어',
      '판교세븐벤처밸리',
      '봇들마을 상가',
      '화랑공원 공영',
      '알파돔타워',
      '아브뉴프랑 판교',
      '백현마을 5단지',
    ])
    for (const row of body.lots) {
      expect(Object.keys(row).sort()).toEqual(ROW_KEYS)
      const want = PANGYO_TARGETS[row.id]
      expect([row.id, row.difficulty, row.avgReverse, row.avgRampTurns, row.avgDurationSec, row.records]).toEqual([
        row.id,
        want.difficulty,
        want.avgReverse,
        want.ramp,
        want.duration,
        want.sampleCount,
      ])
      expect(row.trend.map((x: any) => x.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
      expect(row.trend.at(-1).avgReverse).toBe(row.avgReverse)
    }
    const rk = Object.fromEntries(body.lots.map((l: any) => [l.id, l.rampKind]))
    expect(rk).toMatchObject({ 'hyundai-pangyo': 'SPIRAL', 'alphadom-tower': 'STRAIGHT', 'avenue-france-pangyo': 'STRAIGHT', 'botdeul-mall': 'NONE', 'baekhyun-5': 'NONE' })
    expect(body.lots.find((l: any) => l.id === 'hyundai-pangyo').category).toBe('DEPARTMENT')
  })

  it('insights-demo(어드민 시연 모드)와 같은 숫자 — 다른 곳은 지난 칸(추이 5번째) 하나뿐', async () => {
    const { body } = await t.get('/v1/insights/overview')
    const want = demoOverview({ now: DEMO_NOW })!
    expect(body.totals).toEqual(want.totals)
    expect(body.region).toEqual(want.region)
    expect(body.lots.map((l: any) => l.id)).toEqual(want.lots.map((l) => l.id))
    body.lots.forEach((row: any, i: number) => {
      const w = want.lots[i]
      const strip = (r: any) => ({ ...r, trend: r.trend.filter((_: unknown, k: number) => k !== 4) })
      expect(strip(row), row.id).toEqual(strip(w))
    })
    expect(body.improved.map((x: any) => [x.id, x.name, x.before, x.after])).toEqual(want.improved.map((x) => [x.id, x.name, x.before, x.after]))
  })

  it('좋아진 곳 (6개월 전 → 지금): 화랑공원 2.2→1.8, H스퀘어 2.9→2.6, 아브뉴프랑 1.4→1.1, 알파돔 1.7→1.5', async () => {
    const { body } = await t.get('/v1/insights/overview')
    expect(body.improved.map((i: any) => [i.name, i.before, i.after])).toEqual([
      ['화랑공원 공영', 2.2, 1.8],
      ['H스퀘어', 2.9, 2.6],
      ['아브뉴프랑 판교', 1.4, 1.1],
      ['알파돔타워', 1.7, 1.5],
    ])
    for (const i of body.improved) {
      expect(i.trend).toHaveLength(6)
      expect(i.trend[0]).toBe(i.before)
      expect(i.trend[5]).toBe(i.after)
    }
  })

  it('요일 × 시간대 평균 후진 (8시~22시, 2시간 칸) — 주말 오후가 더 어렵다', async () => {
    const { body } = await t.get('/v1/insights/overview')
    expect(body.heat.weekdays).toEqual(['월', '화', '수', '목', '금', '토', '일'])
    expect(body.heat.hours).toEqual(['8시', '10시', '12시', '14시', '16시', '18시', '20시', '22시'])
    expect(body.heat.values).toHaveLength(7)
    for (const row of body.heat.values) {
      expect(row).toHaveLength(8)
      for (const v of row) expect(v === null || (v >= 0 && v <= 10)).toBe(true)
    }
    const at = (w: number, b: number) => body.heat.values[w][b] ?? 0
    expect(at(5, 3) + at(6, 3)).toBeGreaterThan(at(0, 3) + at(1, 3)) // 토·일 14시 > 월·화 14시
  })

  it('days·region 검증, 없는 지역 404', async () => {
    expect((await t.get('/v1/insights/overview?days=0')).status).toBe(400)
    expect((await t.get('/v1/insights/overview?days=366')).status).toBe(400)
    expect((await t.get('/v1/insights/overview?region=Pangyo!')).status).toBe(400)
    const nf = await t.get('/v1/insights/overview?region=busan')
    expect(nf.status).toBe(404)
    expect(nf.body.error.code).toBe('not_found')
    // 다른 기간도 됨
    const week = (await t.get('/v1/insights/overview?days=7')).body
    expect(week.days).toBe(7)
    expect(week.totals.records).toBeLessThan(6388)
    expect(week.totals.records).toBeGreaterThan(1000)
    // 서울 시연 주차장들
    expect((await t.get('/v1/insights/overview?region=seoul')).body.region.name).toBe('서울')
  })

  it('집계값만: 기록 한 건을 알 수 있는 값(id·clientRecordId·받은 시각)이 없다', async () => {
    const [ov, lot, cmp] = await Promise.all([t.get('/v1/insights/overview'), t.get('/v1/insights/lots/hyundai-pangyo?floor=B2'), t.get('/v1/insights/compare')])
    for (const r of [ov, lot, cmp]) {
      const s = JSON.stringify(r.body)
      expect(s).not.toMatch(/clientRecordId|receivedAt|client_record_id|received_ms|steeringTurns|vehicleClass/)
    }
  })

  it('새 기록이 들어오면 바로 반영', async () => {
    const t2 = await makeApp()
    await t2.send('POST', '/v1/records', record({ lotId: 'botdeul-mall', reverseCount: 9 }))
    const row = (await t2.get('/v1/insights/overview')).body.lots.find((l: any) => l.id === 'botdeul-mall')
    expect(row.records).toBe(234)
  })
})

describe('GET /v1/insights/lots/:id (D-02)', () => {
  it('현대백화점: 층별 평균 후진 B1 2.1 · B2 3.6 · B3 3.4 · B4 3.0 · B5 2.8 · B6 2.6, 판교 일대 평균 2.0', async () => {
    const { status, body } = await t.get('/v1/insights/lots/hyundai-pangyo')
    expect(status).toBe(200)
    expect(body.lot).toMatchObject({
      id: 'hyundai-pangyo',
      name: '현대백화점 판교점 지하주차장',
      shortName: '현대백화점 판교점 지하',
      difficulty: 4.3,
      avgReverse: 3.2,
      records: 1284,
      floors: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'],
      regionAvgReverse: 2,
      rampKind: 'SPIRAL',
    })
    expect(body.floorAvgReverse).toEqual([
      { floor: 'B1', avgReverse: 2.1 },
      { floor: 'B2', avgReverse: 3.6 },
      { floor: 'B3', avgReverse: 3.4 },
      { floor: 'B4', avgReverse: 3 },
      { floor: 'B5', avgReverse: 2.8 },
      { floor: 'B6', avgReverse: 2.6 },
    ])
    expect(body.heat.values).toHaveLength(7)
  })

  it('동선은 한 층만: 기본은 동선이 가장 많은 층, 최대 300개 (insights-demo floor:auto 와 같음), 도면·후진 잦은 곳은 전 층', async () => {
    const { body } = await t.get('/v1/insights/lots/hyundai-pangyo')
    const want = demoLotInsights('hyundai-pangyo', { days: 30, now: DEMO_NOW, floor: 'auto' })!
    expect(body.layout.map((l: any) => l.floor)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6'])
    expect(body.layout).toEqual(want.layout)
    expect(body.hotspots).toEqual(want.hotspots)
    expect(body.overlays.map((o: any) => [o.floor, o.paths.length])).toEqual([['B2', 300]])
    expect(body.overlays).toEqual(want.overlays)
    expect(body.overlays[0].paths[0][0]).toHaveLength(3)
    expect(body.demo).toBe(true)
  })

  it('?floor=b3&maxPaths=50 → 그 층 50개, 모르는 층이면 기본 층, maxPaths 1~2000', async () => {
    const b3 = (await t.get('/v1/insights/lots/hyundai-pangyo?floor=b3&maxPaths=50')).body
    expect(b3.overlays.map((o: any) => [o.floor, o.paths.length])).toEqual([['B3', 50]])
    expect(b3.overlays).toEqual(demoLotInsights('hyundai-pangyo', { days: 30, now: DEMO_NOW, floor: 'B3', maxPaths: 50 })!.overlays)
    expect(b3.layout).toHaveLength(6)
    expect((await t.get('/v1/insights/lots/hyundai-pangyo?floor=B9')).body.overlays[0].floor).toBe('B2')
    expect((await t.get('/v1/insights/lots/hyundai-pangyo?maxPaths=0')).status).toBe(400)
    expect((await t.get('/v1/insights/lots/hyundai-pangyo?maxPaths=2001')).status).toBe(400)
  })

  it('판교 9곳 모두 insights-demo 와 같은 기본 층·동선·층별 평균 후진·램프 종류', async () => {
    for (const d of DEMO_LOTS) {
      const { body } = await t.get(`/v1/insights/lots/${d.id}`)
      const want = demoLotInsights(d.id, { days: 30, now: DEMO_NOW, floor: 'auto' })!
      expect(body.overlays, d.id).toEqual(want.overlays)
      expect(body.floorAvgReverse, d.id).toEqual(want.floorAvgReverse)
      expect(body.lot.rampKind, d.id).toBe(want.lot.rampKind)
      expect(body.lot.regionAvgReverse, d.id).toBe(want.lot.regionAvgReverse)
    }
  })

  it('도면이 없는 주차장은 빈 배열, 지역 평균은 그 주차장 지역', async () => {
    const { body } = await t.get('/v1/insights/lots/pangyo-new')
    expect(body).toMatchObject({ overlays: [], layout: [], hotspots: [] })
    expect(body.lot).toMatchObject({ records: 3, regionAvgReverse: 2 })
    const seoul = await t.get('/v1/insights/lots/coex-samseong')
    expect(seoul.status).toBe(200)
    expect(seoul.body.lot.category).toBe('MALL')
    expect(seoul.body.overlays).toEqual([])
  })

  it('404 · 400', async () => {
    expect((await t.get('/v1/insights/lots/nope')).status).toBe(404)
    expect((await t.get('/v1/insights/lots/hyundai-pangyo?days=abc')).status).toBe(400)
  })
})

describe('GET /v1/insights/compare (D-03)', () => {
  it('9곳 어려운 순, 유형 거르기 (하나 또는 여러 개)', async () => {
    const all = (await t.get('/v1/insights/compare?region=pangyo&days=30')).body
    expect(all).toMatchObject({ region: { id: 'pangyo', name: '판교 일대' }, days: 30, demo: true })
    expect(Object.keys(all).sort()).toEqual(['days', 'demo', 'lots', 'region'])
    expect(all.lots).toHaveLength(9)
    expect(all.lots.map((l: any) => l.id)).toEqual(demoCompare({ now: DEMO_NOW })!.lots.map((l) => l.id))
    expect(all.lots.map((l: any) => l.difficulty)).toEqual([4.3, 4.1, 3.9, 3.6, 3.4, 2.9, 2.4, 1.8, 1.6])
    const office = (await t.get('/v1/insights/compare?category=OFFICE')).body.lots.map((l: any) => l.shortName)
    expect(office).toEqual(['유스페이스', 'H스퀘어', '판교세븐벤처밸리', '알파돔타워'])
    const dm = (await t.get('/v1/insights/compare?category=DEPARTMENT,mall')).body.lots.map((l: any) => l.shortName)
    expect(dm).toEqual(['현대백화점 판교점 지하', '봇들마을 상가', '아브뉴프랑 판교'])
    expect((await t.get('/v1/insights/compare?category=APARTMENT')).body.lots.map((l: any) => l.id)).toEqual(['baekhyun-5'])
    expect((await t.get('/v1/insights/compare?category=OTHER')).body.lots).toEqual([])
  })

  it('400 · 404', async () => {
    expect((await t.get('/v1/insights/compare?category=CASTLE')).status).toBe(400)
    expect((await t.get('/v1/insights/compare?region=nowhere')).status).toBe(404)
  })

  it('CORS * (대시보드는 다른 출처)', async () => {
    const { res } = await t.get('/v1/insights/compare', { Origin: 'https://parkinggack-admin.vercel.app' })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
