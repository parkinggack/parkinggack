import { describe, expect, it } from 'vitest'
import { makeApp } from './helpers.js'

const t = await makeApp()
// insights-demo DEMO_LOTS 좌표
const HYUNDAI = { lat: 37.39248, lng: 127.11221 }

const PARKING_LOT_KEYS = [
  'address',
  'category',
  'region',
  'difficulty',
  'feeText',
  'floors',
  'id',
  'location',
  'name',
  'publicInfo',
  'ratingCount',
  'sampleCount',
  'statChips',
  'tags',
  'updatedAt',
  'zoneScheme',
].sort()

describe('GET /v1/lots', () => {
  it('좌표 없으면 전체, 이름순, 기본 50개', async () => {
    const { status, body } = await t.get('/v1/lots')
    expect(status).toBe(200)
    expect(body.lots.length).toBe(Math.min(50, await t.store.lotCount()))
    const names = body.lots.map((l: any) => l.name)
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b, 'ko')))
    expect(Object.keys(body.lots[0]).sort()).toEqual(PARKING_LOT_KEYS)
    expect(body.lots[0].distanceM).toBeUndefined()
  })

  it('좌표가 있으면 반경 안, 가까운 순, distanceM', async () => {
    const { body } = await t.get(`/v1/lots?lat=${HYUNDAI.lat}&lng=${HYUNDAI.lng}`)
    expect(body.lots[0].id).toBe('hyundai-pangyo')
    expect(body.lots[0].distanceM).toBe(0)
    const ds = body.lots.map((l: any) => l.distanceM)
    expect(ds).toEqual([...ds].sort((a: number, b: number) => a - b))
    expect(Math.max(...ds)).toBeLessThanOrEqual(1000)
    expect(body.lots.map((l: any) => l.id)).toEqual(
      expect.arrayContaining(['avenue-france-pangyo', 'alphadom-tower', 'hwarang-park-public', 'baekhyun-5', 'pangyo-new', 'botdeul-mall', 'u-space-pangyo']),
    )
  })

  it('radius·limit', async () => {
    const near = await t.get(`/v1/lots?lat=${HYUNDAI.lat}&lng=${HYUNDAI.lng}&radius=250`)
    expect(near.body.lots.map((l: any) => l.id)).toEqual(['hyundai-pangyo', 'avenue-france-pangyo'])
    const one = await t.get(`/v1/lots?lat=${HYUNDAI.lat}&lng=${HYUNDAI.lng}&limit=1`)
    expect(one.body.lots).toHaveLength(1)
    const all = await t.get('/v1/lots?limit=200')
    expect(all.body.lots).toHaveLength(await t.store.lotCount())
  })

  it.each([
    ['lat만', '?lat=37.39'],
    ['범위 밖 위도', '?lat=91&lng=127'],
    ['숫자 아님', '?lat=abc&lng=127'],
    ['radius 0', `?lat=37.39&lng=127.11&radius=0`],
    ['limit 너무 큼', '?limit=500'],
    ['limit 소수', '?limit=2.5'],
  ])('400: %s', async (_name, qs) => {
    const { status, body } = await t.get(`/v1/lots${qs}`)
    expect(status).toBe(400)
    expect(body.error.code).toBe('bad_request')
    expect(typeof body.error.message).toBe('string')
  })
})

describe('GET /v1/lots/match', () => {
  it.each([
    ['현대백화점 판교점', 'hyundai-pangyo'],
    ['현대백화점', 'hyundai-pangyo'],
    ['아브뉴프랑 판교', 'avenue-france-pangyo'],
    ['알파돔타워 주차장', 'alphadom-tower'],
    ['화랑공원', 'hwarang-park-public'],
    ['판교 H스퀘어 N동', 'h-square'],
    ['h스퀘어', 'h-square'],
    ['판교 테크원 타워', 'pangyo-new'],
    ['코엑스몰', 'coex-samseong'],
  ])('이름(별칭) "%s" → %s', async (name, id) => {
    const { status, body } = await t.get(`/v1/lots/match?name=${encodeURIComponent(name)}`)
    expect(status).toBe(200)
    expect(body.matchedBy).toBe('name')
    expect(body.lot.id).toBe(id)
    expect(Object.keys(body.lot).sort()).toEqual(PARKING_LOT_KEYS)
  })

  it('더 구체적인 이름이 이긴다 (현대백화점 압구정본점)', async () => {
    const { body } = await t.get(`/v1/lots/match?name=${encodeURIComponent('현대백화점 압구정본점')}`)
    expect(body.lot.id).toBe('hyundai-apgujeong')
  })

  it('이름이 같아도 좌표가 3km보다 멀면 다른 곳 → 좌표로', async () => {
    // "현대백화점 천호점" 근처 (판교점과 10km 넘게 떨어짐) — 근처 주차장 없음
    const { body } = await t.get(`/v1/lots/match?name=${encodeURIComponent('현대백화점 천호점')}&lat=37.5387&lng=127.1238`)
    expect(body).toEqual({ lot: null, matchedBy: null })
    // 판교 근처라면 이름으로
    const near = await t.get(`/v1/lots/match?name=${encodeURIComponent('현대백화점')}&lat=37.3930&lng=127.1125`)
    expect(near.body).toMatchObject({ matchedBy: 'name', lot: { id: 'hyundai-pangyo' } })
  })

  it('이름이 안 맞으면 250m 안의 가장 가까운 곳', async () => {
    const { body } = await t.get(`/v1/lots/match?name=${encodeURIComponent('판교역 3번 출구')}&lat=37.3941&lng=127.1092`)
    expect(body).toMatchObject({ matchedBy: 'location', lot: { id: 'alphadom-tower' } })
    const coordsOnly = await t.get('/v1/lots/match?lat=37.39265&lng=127.11215')
    expect(coordsOnly.body).toMatchObject({ matchedBy: 'location', lot: { id: 'hyundai-pangyo' } })
  })

  it('250m 밖이면 없음 (C-02 카드 안 띄움)', async () => {
    const { status, body } = await t.get('/v1/lots/match?lat=37.45&lng=127.2')
    expect(status).toBe(200)
    expect(body).toEqual({ lot: null, matchedBy: null })
  })

  it('두 글자 미만이나 지역 이름만은 이름으로 안 맞춘다', async () => {
    expect((await t.get(`/v1/lots/match?name=${encodeURIComponent('판교')}`)).body).toEqual({ lot: null, matchedBy: null })
    expect((await t.get('/v1/lots/match?name=a')).body).toEqual({ lot: null, matchedBy: null })
  })

  it.each([
    ['아무것도 없음', ''],
    ['빈 이름', '?name='],
    ['lng만', '?name=x&lng=127'],
    ['너무 긴 이름', `?name=${'가'.repeat(121)}`],
  ])('400: %s', async (_n, qs) => {
    const { status, body } = await t.get(`/v1/lots/match${qs}`)
    expect(status).toBe(400)
    expect(body.error.code).toBe('bad_request')
  })
})

describe('GET /v1/lots/:id', () => {
  it('상세 + 통계', async () => {
    const { status, body } = await t.get('/v1/lots/alphadom-tower')
    expect(status).toBe(200)
    expect(Object.keys(body.lot).sort()).toEqual([...PARKING_LOT_KEYS, 'stats'].sort())
    expect(Object.keys(body.lot.stats).sort()).toEqual(
      [
        'avgDurationSec',
        'avgRampTurns',
        'avgReverse',
        'congestionLabel',
        'congestionSummary',
        'floorCongestion',
        'hourLabels',
        'hourlyHeat',
        'overallAvgDurationSec',
        'overallAvgRampTurns',
        'overallAvgReverse',
      ].sort(),
    )
    expect(body.lot.stats.hourlyHeat).toHaveLength(7)
    for (const row of body.lot.stats.hourlyHeat) {
      expect(row).toHaveLength(6)
      for (const v of row) expect(v >= 0 && v <= 1).toBe(true)
    }
    expect(Number.isInteger(body.lot.stats.avgDurationSec)).toBe(true)
    expect(new Date(body.lot.updatedAt).toISOString()).toBe(body.lot.updatedAt)
  })

  it('기록이 하나도 없으면 stats null', async () => {
    await t.store.insertLot({ id: 'empty-lot', name: '빈 주차장', location: { lat: 37.6, lng: 127 }, floors: ['B1'] })
    const { body } = await t.get('/v1/lots/empty-lot')
    expect(body.lot).toMatchObject({ difficulty: null, sampleCount: 0, ratingCount: 0, stats: null, tags: [], statChips: [], feeText: null, address: null, category: 'OTHER', region: 'other' })
  })

  it('404', async () => {
    const { status, body } = await t.get('/v1/lots/nope')
    expect(status).toBe(404)
    expect(body).toEqual({ error: { code: 'not_found', message: expect.any(String) } })
  })
})

describe('GET /v1/lots/:id/easier', () => {
  it('현대백화점 → 아브뉴프랑·알파돔·화랑공원 (쉬운 순, 집·회사 제외), 시안 문구', async () => {
    const { status, body } = await t.get('/v1/lots/hyundai-pangyo/easier')
    expect(status).toBe(200)
    expect(body.suggestions.map((s: any) => s.lot.id)).toEqual(['avenue-france-pangyo', 'alphadom-tower', 'hwarang-park-public'])
    const [a, b, c] = body.suggestions
    expect(a).toMatchObject({ walkMinutes: 4, pitch: '걸어서 4분, 훨씬 넓어요' })
    expect(a.distanceM).toBeGreaterThan(170)
    expect(a.distanceM).toBeLessThan(200)
    expect(b.pitch).toBe(`걸어서 ${b.walkMinutes}분, 자리 넉넉해요`)
    expect(c.pitch).toBe(`걸어서 ${c.walkMinutes}분, 평면이라 편해요`)
    expect(Object.keys(a).sort()).toEqual(['distanceM', 'lot', 'pitch', 'walkMinutes'])
    expect(Object.keys(a.lot).sort()).toEqual(PARKING_LOT_KEYS)
  })

  it('max·radius', async () => {
    expect((await t.get('/v1/lots/hyundai-pangyo/easier?max=1')).body.suggestions).toHaveLength(1)
    expect((await t.get('/v1/lots/hyundai-pangyo/easier?radius=250')).body.suggestions.map((s: any) => s.lot.id)).toEqual(['avenue-france-pangyo'])
  })

  it('기준이 데이터 부족이면 5.0으로 본다 (테크원 → 판교세븐벤처밸리 ★3.6 도 후보, 아파트는 아님)', async () => {
    const { body } = await t.get('/v1/lots/pangyo-new/easier?max=10')
    const ids = body.suggestions.map((s: any) => s.lot.id)
    expect(ids.slice(0, 3)).toEqual(['avenue-france-pangyo', 'alphadom-tower', 'pangyo-seven-venture'])
    expect(ids).toContain('hyundai-pangyo')
    expect(ids).not.toContain('baekhyun-5')
    expect(body.suggestions.map((s: any) => s.lot.difficulty)).toEqual([...body.suggestions.map((s: any) => s.lot.difficulty)].sort((a: number, b: number) => a - b))
  })

  it('가장 쉬운 곳은 추천 없음', async () => {
    const { body } = await t.get('/v1/lots/avenue-france-pangyo/easier')
    expect(body.suggestions).toEqual([])
  })

  it('400 · 404', async () => {
    expect((await t.get('/v1/lots/hyundai-pangyo/easier?max=0')).status).toBe(400)
    expect((await t.get('/v1/lots/hyundai-pangyo/easier?radius=99999')).status).toBe(400)
    expect((await t.get('/v1/lots/nope/easier')).status).toBe(404)
  })
})
