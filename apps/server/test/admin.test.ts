import { beforeAll, describe, expect, it } from 'vitest'
import { DAY_MS } from '../src/scoring.js'
import { ADMIN, makeApp, record, type TestApp } from './helpers.js'

const NEW_LOT = {
  id: 'test-mall',
  name: '테스트몰 주차장',
  location: { lat: 37.5, lng: 127.05 },
  floors: ['B1', 'B2', 'B3', 'B4', 'B5'],
  manualTags: ['NARROW_AISLE'],
  publicInfo: ['기계식 아님'],
  aliases: ['테스트몰'],
}

describe('어드민 인증', () => {
  let t: TestApp
  beforeAll(async () => {
    t = await makeApp({ seed: false })
  })
  it.each([
    ['토큰 없음', {}],
    ['틀린 토큰', { Authorization: 'Bearer nope' }],
    ['Bearer 아님', { Authorization: 'dev-admin-token' }],
    ['Basic', { Authorization: 'Basic ZGV2LWFkbWluLXRva2Vu' }],
  ])('401: %s', async (_n, headers) => {
    const { status, body, res } = await t.get('/v1/admin/overview', headers as Record<string, string>)
    expect(status).toBe(401)
    expect(body.error.code).toBe('unauthorized')
    expect(res.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('모든 어드민 경로가 막혀 있다', async () => {
    for (const [m, p] of [
      ['GET', '/v1/admin/lots'],
      ['GET', '/v1/admin/lots/x'],
      ['GET', '/v1/admin/records'],
      ['POST', '/v1/admin/lots'],
      ['PUT', '/v1/admin/lots/x'],
      ['DELETE', '/v1/admin/lots/x'],
      ['GET', '/v1/admin/lots/x/records'],
      ['POST', '/v1/admin/recompute'],
    ]) {
      expect((await t.send(m, p, m === 'GET' || m === 'DELETE' ? undefined : {})).status, `${m} ${p}`).toBe(401)
    }
  })

  it('ADMIN_TOKEN 을 바꾸면 그 토큰만', async () => {
    const t2 = await makeApp({ seed: false, env: { ADMIN_TOKEN: 'a-much-longer-secret-token' } })
    expect((await t2.get('/v1/admin/overview', ADMIN)).status).toBe(401)
    expect((await t2.get('/v1/admin/overview', { Authorization: 'Bearer a-much-longer-secret-token' })).status).toBe(200)
  })
})

describe('GET /v1/admin/overview', () => {
  it('합계 · 어려운/쉬운 곳 5 · 시간대·요일 분포 · 최근 기록 20', async () => {
    const t = await makeApp()
    await t.send('POST', '/v1/shares', { payload: { v: 1, lot: 'x', f: 'B1', z: '', n: '', t: 1 } })
    const { status, body } = await t.get('/v1/admin/overview', ADMIN)
    expect(status).toBe(200)
    const count = (sql: string) => t.store.count(sql)
    expect(body.totals).toEqual({
      avgDifficulty: expect.any(Number),
      lots: await t.store.lotCount(),
      records: await count('SELECT COUNT(*) AS c FROM records'),
      records30d: (await t.store.allLots()).reduce((a, l) => a + l.sampleCount, 0),
      ratings: await count('SELECT COUNT(*) AS c FROM ratings'),
      shares: 1,
    })
    expect(body.hardest).toHaveLength(5)
    expect(body.easiest).toHaveLength(5)
    const hd = body.hardest.map((l: any) => l.difficulty)
    expect(hd).toEqual([...hd].sort((a: number, b: number) => b - a))
    const ed = body.easiest.map((l: any) => l.difficulty)
    expect(ed).toEqual([...ed].sort((a: number, b: number) => a - b))
    expect(body.hardest.every((l: any) => l.difficulty != null)).toBe(true)
    expect(body.byHour).toHaveLength(24)
    expect(body.byWeekday).toHaveLength(7)
    expect(body.byHour.reduce((a: number, b: number) => a + b, 0)).toBe(await count(`SELECT COUNT(*) AS c FROM records WHERE received_ms >= ${t.clock.t - 90 * DAY_MS}`))
    expect(body.recentRecords).toHaveLength(20)
    const r = body.recentRecords[0]
    expect(Object.keys(r).sort()).toEqual(
      ['demo', 'durationSec', 'experience', 'floor', 'id', 'lotId', 'lotName', 'parkedHour', 'parkedWeekday', 'rampTurns', 'receivedAt', 'reverseCount', 'shape', 'steeringTurns', 'vehicleClass'].sort(),
    )
    const times = body.recentRecords.map((x: any) => x.receivedAt)
    expect(times).toEqual([...times].sort().reverse())
  })

  it('새 기록이 맨 위', async () => {
    const t = await makeApp()
    await t.send('POST', '/v1/records', record({ lotId: 'h-square', reverseCount: 7 }))
    const { body } = await t.get('/v1/admin/overview', ADMIN)
    expect(body.recentRecords[0]).toMatchObject({ lotId: 'h-square', lotName: 'H스퀘어 지하주차장', reverseCount: 7, demo: false })
  })
})

describe('어드민 주차장 관리', () => {
  it('GET /v1/admin/lots: 관리 필드 포함, q 로 찾기 (이름·id·별칭)', async () => {
    const t = await makeApp()
    const all = await t.get('/v1/admin/lots', ADMIN)
    expect(all.status).toBe(200)
    expect(all.body.lots).toHaveLength(await t.store.lotCount())
    const h = all.body.lots.find((l: any) => l.id === 'hyundai-pangyo')
    expect(h).toMatchObject({
      manualTags: ['SPIRAL_RAMP', 'MANY_PILLARS'],
      aliases: ['현대백화점'],
      pitch: null,
      suggestible: true,
      demo: true,
      sampleCount: 1284,
      category: 'DEPARTMENT',
      region: 'pangyo',
    })
    expect(h.scoreSampleCount).toBe(await t.store.count(`SELECT COUNT(*) AS c FROM records WHERE lot_id = 'hyundai-pangyo' AND received_ms >= ${t.clock.t - 90 * DAY_MS}`))
    expect(h.stats.overallAvgReverse).toBe(1.4)
    expect(new Date(h.createdAt).toISOString()).toBe(h.createdAt)
    expect(all.body.lots.find((l: any) => l.id === 'baekhyun-5').suggestible).toBe(false)

    expect((await t.get(`/v1/admin/lots?q=${encodeURIComponent('아브뉴')}`, ADMIN)).body.lots.map((l: any) => l.id)).toEqual(['avenue-france-pangyo'])
    expect((await t.get('/v1/admin/lots?q=h-square', ADMIN)).body.lots.map((l: any) => l.id)).toEqual(['h-square'])
    expect((await t.get(`/v1/admin/lots?q=${encodeURIComponent('IFC몰')}`, ADMIN)).body.lots.map((l: any) => l.id)).toEqual(['ifc-mall'])
    expect((await t.get('/v1/admin/lots?q=zzzz', ADMIN)).body.lots).toEqual([])
  })

  it('POST → 201, 같은 id → 409, 공개 API에도 바로 보임', async () => {
    const t = await makeApp()
    const c = await t.send('POST', '/v1/admin/lots', NEW_LOT, ADMIN)
    expect(c.status).toBe(201)
    expect(c.body.lot).toMatchObject({
      ...NEW_LOT,
      address: null,
      feeText: null,
      pitch: null,
      suggestible: true,
      demo: false,
      difficulty: null,
      sampleCount: 0,
      scoreSampleCount: 0,
      stats: null,
      tags: ['NARROW_AISLE', 'MANY_FLOORS'],
      zoneScheme: { zones: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], description: null },
    })
    expect((await t.send('POST', '/v1/admin/lots', NEW_LOT, ADMIN)).status).toBe(409)
    expect((await t.get('/v1/lots/test-mall')).status).toBe(200)
    const m = await t.get(`/v1/lots/match?name=${encodeURIComponent('테스트몰 본관')}`)
    expect(m.body.lot.id).toBe('test-mall')
  })

  it.each([
    ['id 대문자', { ...NEW_LOT, id: 'Test' }],
    ['id 공백', { ...NEW_LOT, id: 'a b' }],
    ['이름 없음', { ...NEW_LOT, name: '' }],
    ['층 없음', { ...NEW_LOT, floors: [] }],
    ['층 중복', { ...NEW_LOT, floors: ['B1', 'B1'] }],
    ['좌표 범위', { ...NEW_LOT, location: { lat: 100, lng: 0 } }],
    ['모르는 태그', { ...NEW_LOT, manualTags: ['SCARY'] }],
    ['태그 중복', { ...NEW_LOT, manualTags: ['FLAT', 'FLAT'] }],
    ['별칭 한 글자', { ...NEW_LOT, aliases: ['a'] }],
  ])('POST 400: %s', async (_n, body) => {
    const t = await makeApp({ seed: false })
    const r = await t.send('POST', '/v1/admin/lots', body, ADMIN)
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('bad_request')
  })

  it('PUT: 일부만 바꾸고 점수(태그) 다시 계산, id는 못 바꿈', async () => {
    const t = await makeApp()
    const r = await t.send('PUT', '/v1/admin/lots/hyundai-pangyo', { manualTags: ['MANY_PILLARS'], feeText: '10분 1,000원', pitch: '바로 옆' }, ADMIN)
    expect(r.status).toBe(200)
    expect(r.body.lot).toMatchObject({
      name: '현대백화점 판교점 지하주차장',
      manualTags: ['MANY_PILLARS'],
      tags: ['MANY_PILLARS', 'FREQUENT_REVERSE', 'SPIRAL_RAMP'],
      feeText: '10분 1,000원',
      pitch: '바로 옆',
      difficulty: 4.3,
      sampleCount: 1284,
    })
    expect((await t.get('/v1/lots/hyundai-pangyo')).body.lot.feeText).toBe('10분 1,000원')
    // null 로 지우기
    expect((await t.send('PUT', '/v1/admin/lots/hyundai-pangyo', { feeText: null }, ADMIN)).body.lot.feeText).toBeNull()
    // 같은 id 는 괜찮고 다른 id 는 400
    expect((await t.send('PUT', '/v1/admin/lots/hyundai-pangyo', { id: 'hyundai-pangyo', name: '새 이름' }, ADMIN)).body.lot.name).toBe('새 이름')
    expect((await t.send('PUT', '/v1/admin/lots/hyundai-pangyo', { id: 'other' }, ADMIN)).status).toBe(400)
    expect((await t.send('PUT', '/v1/admin/lots/hyundai-pangyo', { floors: [] }, ADMIN)).status).toBe(400)
    expect((await t.send('PUT', '/v1/admin/lots/nope', { name: 'x' }, ADMIN)).status).toBe(404)
  })

  it('PUT suggestible=false 면 추천에서 빠짐', async () => {
    const t = await makeApp()
    await t.send('PUT', '/v1/admin/lots/avenue-france-pangyo', { suggestible: false }, ADMIN)
    const { body } = await t.get('/v1/lots/hyundai-pangyo/easier')
    expect(body.suggestions.map((s: any) => s.lot.id)).toEqual(['alphadom-tower', 'hwarang-park-public', 'botdeul-mall'])
  })

  it('DELETE → 204, 기록·별점도 같이 지움', async () => {
    const t = await makeApp()
    const d = await t.send('DELETE', '/v1/admin/lots/alphadom-tower', undefined, ADMIN)
    expect(d.status).toBe(204)
    expect(d.body).toBeNull()
    expect((await t.get('/v1/lots/alphadom-tower')).status).toBe(404)
    expect(await t.store.count("SELECT (SELECT COUNT(*) FROM records WHERE lot_id='alphadom-tower') + (SELECT COUNT(*) FROM ratings WHERE lot_id='alphadom-tower') AS c")).toBe(0)
    expect((await t.send('DELETE', '/v1/admin/lots/alphadom-tower', undefined, ADMIN)).status).toBe(404)
  })

  it('GET /v1/admin/lots/:id/records?limit', async () => {
    const t = await makeApp()
    const r = await t.get('/v1/admin/lots/hyundai-pangyo/records', ADMIN)
    expect(r.status).toBe(200)
    expect(r.body.records).toHaveLength(100)
    expect(r.body.records.every((x: any) => x.lotId === 'hyundai-pangyo' && x.lotName === '현대백화점 판교점 지하주차장' && x.demo === true)).toBe(true)
    expect((await t.get('/v1/admin/lots/hyundai-pangyo/records?limit=5', ADMIN)).body.records).toHaveLength(5)
    expect((await t.get('/v1/admin/lots/hyundai-pangyo/records?limit=1000', ADMIN)).body.records).toHaveLength(1000)
    expect((await t.get('/v1/admin/lots/hyundai-pangyo/records?limit=0', ADMIN)).status).toBe(400)
    expect((await t.get('/v1/admin/lots/nope/records', ADMIN)).status).toBe(404)
  })

  it('POST /v1/admin/recompute → { lots }', async () => {
    const t = await makeApp()
    // 캐시를 일부러 망가뜨린 뒤 다시 계산
    await t.store.run("UPDATE lots SET difficulty = 0.1, sample_count = 0 WHERE id = 'hyundai-pangyo'")
    const r = await t.send('POST', '/v1/admin/recompute', undefined, ADMIN)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ lots: await t.store.lotCount() })
    expect((await t.get('/v1/lots/hyundai-pangyo')).body.lot).toMatchObject({ difficulty: 4.3, sampleCount: 1284 })
  })
})

describe('조정자 요청 추가분 (admin web)', () => {
  it('shortName·rampKind: 시드 값, PUT 으로 고치고 null 이면 자동(이름에서 · 램프 바퀴에서)으로', async () => {
    const t = await makeApp()
    const get = async (id: string) => (await t.get(`/v1/admin/lots/${id}`, ADMIN)).body.lot
    expect(await get('hyundai-pangyo')).toMatchObject({ shortName: '현대백화점 판교점 지하', rampKind: 'SPIRAL' })
    expect(await get('alphadom-tower')).toMatchObject({ shortName: '알파돔타워', rampKind: 'STRAIGHT' })
    const r = await t.send('PUT', '/v1/admin/lots/alphadom-tower', { shortName: '알파돔', rampKind: 'SPIRAL' }, ADMIN)
    expect(r.status).toBe(200)
    expect(r.body.lot).toMatchObject({ shortName: '알파돔', rampKind: 'SPIRAL' })
    const row = (await t.get('/v1/insights/overview')).body.lots.find((l: any) => l.id === 'alphadom-tower')
    expect(row).toMatchObject({ shortName: '알파돔', rampKind: 'SPIRAL' })
    const back = await t.send('PUT', '/v1/admin/lots/alphadom-tower', { shortName: null, rampKind: null }, ADMIN)
    // 자동: 이름 끝 "주차장"을 떼고, 평균 램프 0.3바퀴 · 4층 → 곧은 램프
    expect(back.body.lot).toMatchObject({ shortName: '알파돔타워 지하', rampKind: 'STRAIGHT' })
    expect((await t.send('PUT', '/v1/admin/lots/alphadom-tower', { rampKind: 'CURVY' }, ADMIN)).status).toBe(400)
    expect((await t.send('PUT', '/v1/admin/lots/alphadom-tower', { shortName: '' }, ADMIN)).status).toBe(400)
  })

  it('GET /v1/admin/lots/:id → { lot: AdminLot }, 없으면 404', async () => {
    const t = await makeApp()
    const r = await t.get('/v1/admin/lots/hyundai-pangyo', ADMIN)
    expect(r.status).toBe(200)
    expect(r.body.lot).toMatchObject({ id: 'hyundai-pangyo', aliases: ['현대백화점'], manualTags: ['SPIRAL_RAMP', 'MANY_PILLARS'], demo: true, category: 'DEPARTMENT', region: 'pangyo' })
    expect(r.body.lot.scoreSampleCount).toBeGreaterThan(r.body.lot.sampleCount)
    expect(r.body.lot.stats.overallAvgDurationSec).toBe(65)
    const list = await t.get('/v1/admin/lots', ADMIN)
    expect(r.body.lot).toEqual(list.body.lots.find((l: any) => l.id === 'hyundai-pangyo'))
    const nf = await t.get('/v1/admin/lots/nope', ADMIN)
    expect(nf.status).toBe(404)
    expect(nf.body.error.code).toBe('not_found')
  })

  it('GET /v1/admin/records: 최신(id 큰) 순 100개 + nextBefore 커서로 끝까지 겹치지 않게', async () => {
    const t = await makeApp()
    const total = await t.store.count('SELECT COUNT(*) AS c FROM records')
    const first = await t.get('/v1/admin/records', ADMIN)
    expect(first.status).toBe(200)
    expect(first.body.records).toHaveLength(100)
    const ids = first.body.records.map((x: any) => x.id)
    expect(ids).toEqual([...ids].sort((a: number, b: number) => b - a))
    expect(first.body.nextBefore).toBe(ids.at(-1))
    const seen = new Set<number>()
    let before: number | null = null
    let pages = 0
    do {
      const r: any = await t.get(`/v1/admin/records?limit=500${before ? `&before=${before}` : ''}`, ADMIN)
      expect(r.body.records.length).toBeLessThanOrEqual(500)
      for (const x of r.body.records) {
        expect(seen.has(x.id)).toBe(false)
        if (before) expect(x.id).toBeLessThan(before)
        seen.add(x.id)
      }
      before = r.body.nextBefore
      pages++
    } while (before != null)
    expect(seen.size).toBe(total)
    expect(pages).toBe(Math.ceil(total / 500))
  })

  it('GET /v1/admin/records: lotId · demo 거르기, 마지막 쪽 nextBefore null', async () => {
    const t = await makeApp()
    await t.send('POST', '/v1/records', record({ lotId: 'pangyo-new' }))
    await t.send('POST', '/v1/records', record({ lotId: 'h-square' }))
    const real = await t.get('/v1/admin/records?demo=false', ADMIN)
    expect(real.body.records.map((x: any) => x.lotId)).toEqual(['h-square', 'pangyo-new'])
    expect(real.body.nextBefore).toBeNull()
    const lot = await t.get('/v1/admin/records?lotId=pangyo-new', ADMIN)
    expect(lot.body.records).toHaveLength(4)
    expect(lot.body.records.every((x: any) => x.lotId === 'pangyo-new')).toBe(true)
    expect(lot.body.records[0].demo).toBe(false)
    const demoOnly = await t.get('/v1/admin/records?lotId=pangyo-new&demo=true', ADMIN)
    expect(demoOnly.body.records).toHaveLength(3)
    expect(demoOnly.body.records.every((x: any) => x.demo)).toBe(true)
    const page = await t.get('/v1/admin/records?lotId=pangyo-new&limit=2', ADMIN)
    expect(page.body.records).toHaveLength(2)
    const rest = await t.get(`/v1/admin/records?lotId=pangyo-new&limit=2&before=${page.body.nextBefore}`, ADMIN)
    expect(rest.body.records).toHaveLength(2)
    expect(rest.body.nextBefore).toBeNull()
    // 주차장별 기록에도 같은 커서
    const byLot = await t.get('/v1/admin/lots/pangyo-new/records?limit=3', ADMIN)
    expect(byLot.body.records).toHaveLength(3)
    expect(byLot.body.nextBefore).toBe(byLot.body.records[2].id)
  })

  it.each([
    ['limit 501', '?limit=501'],
    ['limit 0', '?limit=0'],
    ['demo=maybe', '?demo=maybe'],
    ['before=0', '?before=0'],
    ['before=abc', '?before=abc'],
  ])('GET /v1/admin/records 400: %s', async (_n, qs) => {
    const t = await makeApp({ seed: false })
    const r = await t.get(`/v1/admin/records${qs}`, ADMIN)
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('bad_request')
  })

  it('GET /v1/admin/records 404: 없는 lotId', async () => {
    const t = await makeApp({ seed: false })
    expect((await t.get('/v1/admin/records?lotId=nope', ADMIN)).status).toBe(404)
  })

  it('aliases: POST·PUT 로 정하면 /v1/lots/match 가 쓴다', async () => {
    const t = await makeApp()
    await t.send('PUT', '/v1/admin/lots/pangyo-new', { aliases: ['테크원', '판교 신축'] }, ADMIN)
    const m = await t.get(`/v1/lots/match?name=${encodeURIComponent('판교신축 오피스')}`)
    expect(m.body).toMatchObject({ matchedBy: 'name', lot: { id: 'pangyo-new' } })
    expect((await t.get('/v1/admin/lots/pangyo-new', ADMIN)).body.lot.aliases).toEqual(['테크원', '판교 신축'])
    // 별칭을 비우면 이름으로만
    await t.send('PUT', '/v1/admin/lots/pangyo-new', { aliases: [] }, ADMIN)
    expect((await t.get(`/v1/lots/match?name=${encodeURIComponent('판교신축 오피스')}`)).body.lot).toBeNull()
  })

  it('tags = 수동 먼저 → 자동, 중복 없이 최대 3개', async () => {
    const t = await makeApp()
    const r = await t.send('PUT', '/v1/admin/lots/hyundai-pangyo', { manualTags: ['STEEP_SLOPE', 'MANY_FLOORS'] }, ADMIN)
    // 자동: FREQUENT_REVERSE, SPIRAL_RAMP, MANY_FLOORS(중복) → 앞에서 3개
    expect(r.body.lot.tags).toEqual(['STEEP_SLOPE', 'MANY_FLOORS', 'FREQUENT_REVERSE'])
    expect(r.body.lot.manualTags).toEqual(['STEEP_SLOPE', 'MANY_FLOORS'])
    expect((await t.get('/v1/lots/hyundai-pangyo')).body.lot.tags).toEqual(['STEEP_SLOPE', 'MANY_FLOORS', 'FREQUENT_REVERSE'])
  })

  it('PUT 본문 id 가 경로와 다르면 400, 바뀌지 않음', async () => {
    const t = await makeApp()
    const r = await t.send('PUT', '/v1/admin/lots/h-square', { id: 'h-square-2', name: '바뀌면 안 됨' }, ADMIN)
    expect(r.status).toBe(400)
    expect(r.body.error.code).toBe('bad_request')
    expect((await t.store.getLot('h-square'))!.name).toBe('H스퀘어 지하주차장')
    expect(await t.store.getLot('h-square-2')).toBeNull()
  })

  it('overview: byHour·byWeekday 는 최근 90일 기록만, hardest/easiest 는 null 제외, avgDifficulty', async () => {
    const t = await makeApp()
    // 100일 전에 받은 기록 하나 (전체 합계에는 들어가고 분포에는 안 들어감)
    const now = t.clock.t
    t.clock.t = now - 100 * DAY_MS
    await t.store.insertRecord(record({ clientRecordId: 'old-record-0001', parkedHour: 3, parkedWeekday: 7 }) as any)
    t.clock.t = now
    const { body } = await t.get('/v1/admin/overview', ADMIN)
    const in90 = await t.store.count('SELECT COUNT(*) AS c FROM records WHERE received_ms >= ?', [now - 90 * DAY_MS])
    const total = await t.store.count('SELECT COUNT(*) AS c FROM records')
    expect(total).toBeGreaterThan(in90 + 1) // 시드는 180일치
    expect(body.totals.records).toBe(total)
    expect(body.byHour.reduce((a: number, b: number) => a + b, 0)).toBe(in90)
    expect(body.byWeekday.reduce((a: number, b: number) => a + b, 0)).toBe(in90)
    expect(body.byHour[3]).toBe(await t.store.count('SELECT COUNT(*) AS c FROM records WHERE parked_hour = 3 AND received_ms >= ?', [now - 90 * DAY_MS]))
    const nullIds = (await t.store.allLots()).filter((l) => l.difficulty == null).map((l) => l.id)
    expect(nullIds.length).toBeGreaterThan(0)
    for (const l of [...body.hardest, ...body.easiest]) {
      expect(l.difficulty).not.toBeNull()
      expect(nullIds).not.toContain(l.id)
    }
    const ds = (await t.store.allLots()).map((l) => l.difficulty).filter((d): d is number => d != null)
    expect(body.totals.avgDifficulty).toBe(Math.round((ds.reduce((a, b) => a + b, 0) / ds.length) * 10) / 10)
    expect(body.totals.avgDifficulty).toBeGreaterThan(1)
    expect(body.totals.avgDifficulty).toBeLessThan(5)
  })

  it('overview: 점수가 있는 주차장이 없으면 avgDifficulty null, hardest/easiest 빈 배열', async () => {
    const t = await makeApp({ seed: false })
    await t.store.insertLot({ id: 'only', name: '하나', location: { lat: 37.5, lng: 127 }, floors: ['B1'] })
    const { body } = await t.get('/v1/admin/overview', ADMIN)
    expect(body.totals).toMatchObject({ lots: 1, records: 0, avgDifficulty: null })
    expect(body.hardest).toEqual([])
    expect(body.easiest).toEqual([])
    expect(body.byHour).toEqual(new Array(24).fill(0))
  })
})
