import { describe, expect, it } from 'vitest'
import { HOUR_MS } from '../src/scoring.js'
import { NOW, makeApp, record } from './helpers.js'

describe('POST /v1/records', () => {
  it('202 + 그 주차장 점수를 바로 다시 계산 (테크원 3대 → 4대)', async () => {
    const t = await makeApp()
    const { status, body } = await t.send('POST', '/v1/records', record())
    expect(status).toBe(202)
    expect(body).toEqual({ accepted: true, duplicate: false, lot: { id: 'pangyo-new', difficulty: null, sampleCount: 4 } })
  })

  it('10대가 모이면 데이터 부족이 풀린다', async () => {
    const t = await makeApp()
    let last: any
    for (let i = 0; i < 7; i++) last = (await t.send('POST', '/v1/records', record())).body
    expect(last.lot.sampleCount).toBe(10)
    expect(last.lot.difficulty).toEqual(expect.any(Number))
    const detail = await t.get('/v1/lots/pangyo-new')
    expect(detail.body.lot.difficulty).toBe(last.lot.difficulty)
    expect(detail.body.lot.sampleCount).toBe(10)
  })

  it('같은 clientRecordId 는 한 번만 (duplicate: true)', async () => {
    const t = await makeApp()
    const r = record({ lotId: 'hyundai-pangyo' })
    const a = await t.send('POST', '/v1/records', r)
    const b = await t.send('POST', '/v1/records', r)
    expect(a.body).toMatchObject({ duplicate: false, lot: { sampleCount: 1285 } })
    expect(b.status).toBe(202)
    expect(b.body).toMatchObject({ accepted: true, duplicate: true, lot: { id: 'hyundai-pangyo', sampleCount: 1285 } })
    // 다른 주차장으로 보내도 같은 id면 중복
    const c = await t.send('POST', '/v1/records', { ...r, lotId: 'pangyo-new' })
    expect(c.body).toMatchObject({ duplicate: true, lot: { id: 'pangyo-new', sampleCount: 3 } })
  })

  it('정확한 시각은 남기지 않는다 (정시로 내림), 층은 대문자로', async () => {
    const t = await makeApp()
    t.clock.t = NOW + 37 * 60_000 + 12_345
    await t.send('POST', '/v1/records', record({ clientRecordId: 'time-check-0001', floor: 'b3' }))
    const row = (await t.store.one("SELECT received_ms AS t, floor, demo FROM records WHERE client_record_id = 'time-check-0001'"))!
    expect(Number(row.t) % HOUR_MS).toBe(0)
    expect(row.floor).toBe('B3')
    expect(row.demo).toBe(0)
  })

  it('floor·brakeCount 는 null 가능, 모르는 키는 무시', async () => {
    const t = await makeApp()
    const { status } = await t.send('POST', '/v1/records', { ...record({ floor: null, brakeCount: null }), vin: 'KMH123', lat: 37.1 })
    expect(status).toBe(202)
    const cols = (await t.store.all('PRAGMA table_info(records)')) as unknown as { name: string }[]
    expect(cols.map((c) => c.name)).not.toContain('vin')
    expect(cols.map((c) => c.name)).not.toContain('lat')
  })

  it('알 수 없는 주차장 → 404', async () => {
    const t = await makeApp()
    const { status, body } = await t.send('POST', '/v1/records', record({ lotId: 'no-such-lot' }))
    expect(status).toBe(404)
    expect(body.error.code).toBe('not_found')
  })

  it.each([
    ['clientRecordId 짧음', { clientRecordId: 'abc' }],
    ['clientRecordId 이상한 글자', { clientRecordId: 'abc def ghi' }],
    ['후진 51', { reverseCount: 51 }],
    ['후진 음수', { reverseCount: -1 }],
    ['후진 소수', { reverseCount: 1.5 }],
    ['핸들 101', { steeringTurns: 101 }],
    ['시간 0', { durationSec: 0 }],
    ['시간 3601', { durationSec: 3601 }],
    ['램프 21', { rampTurns: 21 }],
    ['모양 잘못', { shape: 'DIAGONAL' }],
    ['차 크기 잘못', { vehicleClass: 'TRUCK' }],
    ['경력 잘못', { experience: 'PRO' }],
    ['시 24', { parkedHour: 24 }],
    ['요일 0', { parkedWeekday: 0 }],
    ['요일 8', { parkedWeekday: 8 }],
    ['approximate 문자열', { approximate: 'no' }],
    ['lotId 없음', { lotId: undefined }],
    ['층 너무 김', { floor: 'B12345678' }],
  ])('400: %s', async (_n, over) => {
    const t = await makeApp({ seed: false })
    const { status, body } = await t.send('POST', '/v1/records', record(over))
    expect(status).toBe(400)
    expect(body.error.code).toBe('bad_request')
  })

  it('400: JSON 아님 · 빈 본문 · 배열', async () => {
    const t = await makeApp({ seed: false })
    expect((await t.send('POST', '/v1/records', '{oops')).status).toBe(400)
    expect((await t.send('POST', '/v1/records', '')).status).toBe(400)
    expect((await t.send('POST', '/v1/records', [record()])).status).toBe(400)
  })
})

describe('POST /v1/lots/:id/ratings', () => {
  it('별점이 점수에 0.5 가중으로 들어간다', async () => {
    const t = await makeApp({ seed: false })
    await t.store.insertLot({ id: 'rated-lot', name: '별점 주차장', location: { lat: 37.5, lng: 127 }, floors: ['B1'] })
    // 쉬운 기록 10건 (d = 1) → (10 + 15) / 15 = 1.67 → ★1.7
    for (let i = 0; i < 10; i++) {
      await t.send('POST', '/v1/records', record({ lotId: 'rated-lot', reverseCount: 0, steeringTurns: 0, durationSec: 30, rampTurns: 0 }))
    }
    expect((await t.get('/v1/lots/rated-lot')).body.lot.difficulty).toBe(1.7)
    let res: any
    for (let i = 0; i < 10; i++) res = await t.send('POST', '/v1/lots/rated-lot/ratings', { clientRatingId: `rate-lot-${i}-xx`, stars: 5 })
    expect(res.status).toBe(200)
    expect(Object.keys(res.body.lot).sort()).toEqual(['difficulty', 'id', 'ratingCount'])
    // (10 + 15 + 5·10·0.5) / (10 + 5 + 10·0.5) = 50 / 20 = 2.5
    expect(res.body.lot).toEqual({ id: 'rated-lot', difficulty: 2.5, ratingCount: 10 })
  })

  it('같은 clientRatingId 는 한 번만', async () => {
    const t = await makeApp()
    const a = await t.send('POST', '/v1/lots/pangyo-new/ratings', { clientRatingId: 'rate-same-0001', stars: 2 })
    const b = await t.send('POST', '/v1/lots/pangyo-new/ratings', { clientRatingId: 'rate-same-0001', stars: 5 })
    expect(a.body).toEqual({ lot: { id: 'pangyo-new', difficulty: null, ratingCount: 1 } })
    expect(b.status).toBe(200)
    expect(b.body.lot.ratingCount).toBe(1)
  })

  it.each([0, 6, 2.5, '3', null])('400: stars=%s', async (stars) => {
    const t = await makeApp({ seed: false })
    const { status } = await t.send('POST', '/v1/lots/x/ratings', { clientRatingId: 'rate-bad-0001', stars })
    expect(status).toBe(400)
  })

  it('404: 없는 주차장', async () => {
    const t = await makeApp()
    const { status, body } = await t.send('POST', '/v1/lots/nope/ratings', { clientRatingId: 'rate-404-0001', stars: 3 })
    expect(status).toBe(404)
    expect(body.error.code).toBe('not_found')
  })
})
