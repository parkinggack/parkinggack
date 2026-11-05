import { describe, expect, it } from 'vitest'
import { openAndMigrate } from '../src/db-node.js'
import { DAY_MS, HOUR_MS } from '../src/scoring.js'
import { defaultFloorWeights, floorDepth, generateLot, quota } from '../src/seed/generate.js'
import { buildSeed, seedDatabase } from '../src/seed/index.js'
import { DEMO_LOTS, DEMO_NOW, FLOOR_H, FLOOR_W, RAMP_KIND, demoLotInsights } from '../../../packages/insights-demo/index.ts'
import { dashboardSeed } from '../src/seed/dashboard.js'
import { PANGYO, PANGYO_TARGETS } from '../src/seed/lots.js'
import { Rng } from '../src/seed/prng.js'
import { Store } from '../src/store.js'
import { NOW, makeApp } from './helpers.js'

const t = await makeApp()

describe('시드 v2: 판교 9곳이 대시보드 D-03 표와 같다', () => {
  it.each(Object.entries(PANGYO_TARGETS))('%s', async (id, target) => {
    const { status, body } = await t.get(`/v1/lots/${id}`)
    expect(status).toBe(200)
    expect(body.lot.difficulty).toBe(target.difficulty)
    expect(body.lot.sampleCount).toBe(target.sampleCount)
    expect(body.lot.region).toBe('pangyo')
  })

  it('30일 기록 합 6,388건 · 9곳 (테크원은 데이터 부족이라 빠짐)', () => {
    const ids = Object.keys(PANGYO_TARGETS).filter((id) => id !== 'pangyo-new')
    expect(ids).toHaveLength(9)
    expect(ids.reduce((a, id) => a + PANGYO_TARGETS[id].sampleCount, 0)).toBe(6388)
  })

  it('판교 9곳은 packages/insights-demo DEMO_LOTS 그대로 (id·이름·짧은 이름·유형·좌표·층·램프), 공공 이름', async () => {
    const lots = Object.fromEntries((await t.store.allLots()).map((l) => [l.id, l]))
    for (const d of DEMO_LOTS) {
      expect(lots[d.id], d.id).toMatchObject({
        name: d.name,
        shortName: d.shortName,
        category: d.category,
        region: 'pangyo',
        location: d.location,
        floors: [...d.floors],
        rampKind: RAMP_KIND[d.ramp],
      })
    }
    // 차량 앱 SeedLots 와 같은 id
    expect(DEMO_LOTS.map((d) => d.id)).toEqual([
      'hyundai-pangyo',
      'u-space-pangyo',
      'h-square',
      'pangyo-seven-venture',
      'botdeul-mall',
      'hwarang-park-public',
      'alphadom-tower',
      'avenue-france-pangyo',
      'baekhyun-5',
    ])
    expect(lots['baekhyun-5']).toMatchObject({ name: '백현마을 5단지 지하주차장', category: 'APARTMENT', suggestible: false })
    expect(lots['hyundai-pangyo']).toMatchObject({ name: '현대백화점 판교점 지하주차장', category: 'DEPARTMENT', rampKind: 'SPIRAL' })
    expect(lots['pangyo-new']).toMatchObject({ shortName: null, rampKind: null })
    expect(Object.values(lots).every((l) => !/^(집|회사) ·/.test(l.name))).toBe(true)
  })

  it('현대백화점 C-08 통계: 후진 3.2 · 램프 2.5 · 2분10초, 전체 평균 1.4 · 0.8 · 65초, B1 만차 · B3부터 여유', async () => {
    const { body } = await t.get('/v1/lots/hyundai-pangyo')
    const s = body.lot.stats
    expect(s).toMatchObject({
      avgReverse: 3.2,
      overallAvgReverse: 1.4,
      avgRampTurns: 2.5,
      overallAvgRampTurns: 0.8,
      avgDurationSec: 130,
      overallAvgDurationSec: 65,
      congestionLabel: '평일 오후',
      congestionSummary: 'B1 만차 · B3부터 여유',
    })
    const occ = s.floorCongestion.map((f: any) => f.occupancy)
    ;[1, 0.9, 0.6, 0.4, 0.3, 0.2].forEach((v, i) => expect(occ[i]).toBeCloseTo(v, 1))
    expect(body.lot.tags.slice(0, 2)).toEqual(['SPIRAL_RAMP', 'MANY_PILLARS'])
    expect(body.lot.statChips).toEqual(['평균 후진 3.2회'])
  })

  it('모두 demo, 최근 180일 안, 정시로 내림, 30일 경계에서 반나절 이상', async () => {
    expect((await t.store.allLots()).every((l) => l.demo)).toBe(true)
    expect(await t.store.count('SELECT COUNT(*) AS c FROM records WHERE demo = 0')).toBe(0)
    const rows = await t.store.all('SELECT received_ms AS t FROM records')
    expect(rows.length).toBeGreaterThan(30_000)
    for (const { t: ms } of rows) {
      const age = (NOW - Number(ms)) / DAY_MS
      expect(age).toBeGreaterThan(0)
      expect(age).toBeLessThan(180)
      expect(Math.abs(age - 30)).toBeGreaterThan(0.45)
      expect(Math.abs(age - 90)).toBeGreaterThan(0.45)
      expect(Number(ms) % HOUR_MS).toBe(0)
    }
  })

  it('수도권 시연 주차장 41곳도 그대로 (W-01), 난이도가 고르게', async () => {
    const lots = await t.store.allLots()
    expect(lots.length).toBe(51)
    const demo = lots.filter((l) => l.region !== 'pangyo')
    expect(demo).toHaveLength(41)
    expect(new Set(demo.map((l) => l.region))).toEqual(new Set(['seoul', 'bundang', 'gyeonggi', 'incheon']))
    const ds = lots.map((l) => l.difficulty).filter((d): d is number => d != null)
    expect(Math.min(...ds)).toBeLessThanOrEqual(1.6)
    expect(Math.max(...ds)).toBeGreaterThanOrEqual(4.4)
    expect(lots.filter((l) => l.difficulty == null).length).toBeGreaterThanOrEqual(3)
  })

  it('D-02 도면·동선·후진 잦은 곳: 9곳 전 층 (insights-demo 생성기)', async () => {
    const floors = DEMO_LOTS.reduce((a, d) => a + d.floors.length, 0)
    expect(floors).toBe(28)
    expect(await t.store.count('SELECT COUNT(*) AS c FROM lot_layouts')).toBe(floors)
    expect(await t.store.count('SELECT COUNT(*) AS c FROM lot_overlays WHERE demo = 1')).toBe(floors)
    expect(await t.store.count("SELECT COUNT(*) AS c FROM lot_layouts WHERE lot_id = 'hyundai-pangyo'")).toBe(6)
    // 동선은 층마다 30일 기록 수만큼 → 합 6,388
    expect(await t.store.count('SELECT SUM(json_array_length(paths)) AS c FROM lot_overlays')).toBe(6388)
    expect(await t.store.count('SELECT COUNT(*) AS c FROM lot_hotspots')).toBe(dashboardSeed().hotspots.length)
  })
})

describe('시드: 결정적 · 다시 만들기 · 시연 시각 옮기기', () => {
  it('같은 시각이면 같은 데이터, 도면·동선도 같다', () => {
    const a = buildSeed(NOW)
    const b = buildSeed(NOW)
    expect(a.records.length).toBe(b.records.length)
    expect(a.records.slice(0, 30)).toEqual(b.records.slice(0, 30))
    expect(a.records.at(-1)).toEqual(b.records.at(-1))
    expect(JSON.stringify(dashboardSeed())).toBe(JSON.stringify(dashboardSeed()))
  })

  it('비어 있지 않으면 건너뛰고, --reset 이면 다시 만든다 (실제 기록도 지움)', async () => {
    const t2 = await makeApp()
    const before = await t2.store.count('SELECT COUNT(*) AS c FROM records')
    expect((await seedDatabase(t2.store)).skipped).toBe(true)
    await t2.send('POST', '/v1/records', {
      clientRecordId: 'real-record-0001',
      lotId: 'pangyo-new',
      floor: 'B1',
      reverseCount: 1,
      steeringTurns: 2,
      brakeCount: null,
      durationSec: 60,
      rampTurns: 1,
      shape: 'PERPENDICULAR',
      approximate: false,
      vehicleClass: 'SUV',
      experience: 'Y1_3',
      parkedHour: 10,
      parkedWeekday: 3,
    })
    const s = await seedDatabase(t2.store, { reset: true })
    expect(s.skipped).toBe(false)
    expect(s.records).toBe(before)
    expect(s.pangyo.every((p) => p.difficulty === p.target.difficulty && p.sampleCount === p.target.sampleCount)).toBe(true)
    expect(await t2.store.count('SELECT COUNT(*) AS c FROM lot_overlays')).toBe(28)
  })

  it('며칠 지나도 시연 수치가 그대로 (demo 기록 시각을 앞으로 옮김)', async () => {
    const t2 = await makeApp()
    t2.clock.t = NOW + 10 * DAY_MS + 5 * HOUR_MS + 1234
    expect((await t2.store.recomputeLot('hyundai-pangyo'))!.sampleCount).toBeLessThan(1284)
    expect(await t2.store.rollDemo()).toBe(10 * 24 + 5)
    await t2.store.recomputeAll()
    const { body } = await t2.get('/v1/lots/hyundai-pangyo')
    expect(body.lot).toMatchObject({ sampleCount: 1284, difficulty: 4.3 })
    expect(await t2.store.rollDemo()).toBe(0)
    const ov = await t2.get('/v1/insights/overview?region=pangyo')
    expect(ov.body.totals).toMatchObject({ records: 6388, avgReverse: 2, prevAvgReverse: 2.3 })
  })

  it('두 인스턴스가 동시에 옮겨도 한 번만 (서버리스)', async () => {
    const t2 = await makeApp()
    t2.clock.t = NOW + 3 * HOUR_MS
    const before = await t2.store.one('SELECT MAX(received_ms) AS m FROM records WHERE demo = 1')
    const [a, b] = await Promise.all([t2.store.rollDemo(), t2.store.rollDemo()])
    expect(a + b).toBe(3)
    const after = await t2.store.one('SELECT MAX(received_ms) AS m FROM records WHERE demo = 1')
    expect(Number(after!.m) - Number(before!.m)).toBe(3 * HOUR_MS)
  })

  it('demo 가 아닌 기록은 옮기지 않는다', async () => {
    let now = NOW
    const store = new Store(await openAndMigrate(':memory:'), () => now)
    await store.insertLot({ id: 'x-lot', name: '실제', location: { lat: 37.5, lng: 127 }, floors: ['B1'] })
    await store.setMeta('demo_anchor_ms', String(NOW))
    await store.insertRecord({
      clientRecordId: 'real-xyz-0001',
      lotId: 'x-lot',
      floor: 'B1',
      reverseCount: 1,
      steeringTurns: 1,
      brakeCount: null,
      durationSec: 50,
      rampTurns: 0,
      shape: 'UNKNOWN',
      approximate: false,
      vehicleClass: 'UNKNOWN',
      experience: 'UNKNOWN',
      parkedHour: 9,
      parkedWeekday: 1,
    })
    const get = async () => Number((await store.one("SELECT received_ms AS t FROM records WHERE client_record_id = 'real-xyz-0001'"))!.t)
    const before = await get()
    now = NOW + 3 * DAY_MS
    expect(await store.rollDemo()).toBe(72)
    expect(await get()).toBe(before)
  })
})

describe('시드 생성기 부품', () => {
  it('quota: 비율대로 정확히 나눔', () => {
    expect(quota(136, [0, 10, 9, 6, 4, 3, 2])).toEqual([0, 40, 36, 24, 16, 12, 8])
    expect(quota(10, [1, 1, 1])).toEqual([4, 3, 3])
    expect(quota(5, [1, 0])).toEqual([5, 0])
  })

  it('층 깊이: B3→3, 1F→0, 3F→2', () => {
    expect(floorDepth('B3')).toBe(3)
    expect(floorDepth('1F')).toBe(0)
    expect(floorDepth('3F')).toBe(2)
    expect(defaultFloorWeights(['1F', 'B1', 'B2'])).toEqual([0.25, 1, 0.8])
  })

  it('칸마다 기록 수·평균을 정확히, 90일 점수 목표', () => {
    const spec = PANGYO.find((s) => s.lot.id === 'h-square')!
    const g = generateLot(spec, NOW)
    expect(g.records).toHaveLength(spec.buckets.reduce((a, b) => a + b.n, 0))
    spec.buckets.forEach((b, i) => {
      const ageIdx = spec.buckets.length - 1 - i
      const rs = g.records.filter((r) => Math.floor((NOW - r.receivedMs) / (30 * DAY_MS)) === ageIdx)
      expect(rs).toHaveLength(b.n)
      expect(rs.reduce((a, r) => a + r.reverseCount, 0) / rs.length).toBeCloseTo(b.reverse, 2)
      expect(rs.reduce((a, r) => a + r.durationSec, 0) / rs.length).toBeCloseTo(110, 1)
      expect(rs.reduce((a, r) => a + r.rampTurns, 0) / rs.length).toBeCloseTo(2, 2)
    })
    expect(Math.round(g.score * 10) / 10).toBe(3.9)
  })

  it('D-02 동선: insights-demo 와 같은 도면·동선·후진 잦은 곳 (층마다 30일 기록 수, 도면 안, 후진 구간 있음)', () => {
    const D = dashboardSeed()
    for (const def of DEMO_LOTS) {
      const want = demoLotInsights(def.id, { days: 30, now: DEMO_NOW })!
      const mine = (xs: Array<{ lotId: string }>) => xs.filter((x) => x.lotId === def.id).map(({ lotId: _l, ...x }) => x)
      expect(mine(D.layouts)).toEqual(want.layout)
      expect(mine(D.hotspots)).toEqual(want.hotspots)
      const ov = mine(D.overlays) as typeof want.overlays
      expect(ov.map((o) => o.floor)).toEqual([...def.floors])
      expect(ov.reduce((a, o) => a + o.paths.length, 0)).toBe(def.records)
      for (const o of ov) {
        for (const p of o.paths) {
          for (const [x, y, r] of p) {
            expect(x >= -1 && x <= FLOOR_W + 1 && y >= -1 && y <= FLOOR_H + 1).toBe(true)
            expect([0, 1]).toContain(r)
          }
        }
        if (o.paths.length > 50) expect(o.paths.filter((p) => p.some((q) => q[2] === 1)).length).toBeGreaterThan(o.paths.length / 3)
      }
    }
  })

  it('층별 평균 후진이 있으면 층 비율을 풀어 주차장 평균·층별 평균을 함께 맞춘다', () => {
    const spec = PANGYO.find((s) => s.lot.id === 'hyundai-pangyo')!
    const g = generateLot(spec, NOW)
    spec.buckets.forEach((b, i) => {
      const ageIdx = spec.buckets.length - 1 - i
      const rs = g.records.filter((r) => Math.floor((NOW - r.receivedMs) / (30 * DAY_MS)) === ageIdx)
      expect(rs).toHaveLength(b.n)
      expect(rs.reduce((a, r) => a + r.reverseCount, 0)).toBe(Math.round(b.reverse * b.n))
    })
    const last = g.records.filter((r) => NOW - r.receivedMs < 30 * DAY_MS)
    spec.lot.floors.forEach((f, k) => {
      const rs = last.filter((r) => r.floor === f)
      expect(Math.round((rs.reduce((a, r) => a + r.reverseCount, 0) / rs.length) * 10) / 10).toBe(spec.floorReverse![k])
    })
  })

  it('난수는 결정적', () => {
    const a = new Rng(42)
    const b = new Rng(42)
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()))
    expect(new Rng(7).uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
