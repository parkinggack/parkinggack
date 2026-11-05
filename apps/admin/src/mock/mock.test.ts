import { describe, expect, it } from 'vitest'
import { createApiClient } from '../api'
import { createMockDb, PANGYO_SEED } from './fixtures'
import { createMockFetch } from './mockFetch'

const NOW = Date.parse('2026-11-03T08:02:00Z') // 오후 5:02 KST

function setup(token = 'dev-admin-token') {
  const db = createMockDb(NOW)
  const fetchImpl = createMockFetch(() => db)
  const api = createApiClient({ baseUrl: 'http://localhost:8787', getToken: () => token, fetchImpl })
  return { db, api }
}

describe('시연 데이터 (docs/api.md 시드와 같은 구성)', () => {
  it('판교 7곳은 차량 앱 SeedLots 와 같은 id·이름·좌표·별점·대수', () => {
    const { db } = setup()
    const byId = new Map(db.lots.map((l) => [l.id, l]))
    const expected: [string, string, number, number, number | null, number][] = [
      ['hyundai-pangyo', '현대백화점 판교점 지하주차장', 37.3926, 127.1121, 4.3, 142],
      ['avenue-france-pangyo', '아브뉴프랑 판교 주차장', 37.3943, 127.1112, 1.8, 87],
      ['alphadom-tower', '알파돔타워 주차장', 37.3941, 127.109, 2.4, 64],
      ['hwarang-park-public', '화랑공원 공영주차장', 37.3901, 127.1165, 2.9, 41],
      ['baekhyun-5', '집 · 백현마을 5단지', 37.3869, 127.1047, 1.4, 35],
      ['h-square', '회사 · H스퀘어', 37.4021, 127.1083, 3.1, 58],
      ['pangyo-new', '판교 테크원 주차장', 37.4005, 127.111, null, 3],
    ]
    expect(PANGYO_SEED).toHaveLength(7)
    for (const [id, name, lat, lng, d, n] of expected) {
      const lot = byId.get(id)!
      expect(lot, id).toBeTruthy()
      expect(lot).toMatchObject({ name, location: { lat, lng }, difficulty: d, sampleCount: n })
    }
    expect(byId.get('hyundai-pangyo')!.stats!.avgReverse).toBe(3.2)
    expect(byId.get('hyundai-pangyo')!.statChips).toEqual(['평균 후진 3.2회'])
    expect(byId.get('avenue-france-pangyo')!.zoneScheme.description).toBe('기둥 색 + 알파벳 A–H · 기둥 번호 01–12')
  })

  it('수도권 시연 주차장 약 40곳, 모두 demo', () => {
    const { db } = setup()
    expect(db.lots.length).toBeGreaterThanOrEqual(45)
    expect(db.lots.every((l) => l.demo)).toBe(true)
    expect(new Set(db.lots.map((l) => l.id)).size).toBe(db.lots.length)
    for (const l of db.lots) {
      expect(l.location.lat).toBeGreaterThan(37.2)
      expect(l.location.lat).toBeLessThan(37.8)
      expect(l.tags.length).toBeLessThanOrEqual(3)
    }
  })

  it('최근 30일 기록 수 = sampleCount, 실제(demo=false) 기록도 몇 건', () => {
    const { db } = setup()
    const since = NOW - 30 * 86_400_000
    const lot = db.lots.find((l) => l.id === 'avenue-france-pangyo')!
    const recent = db.records.filter((r) => r.lotId === lot.id && Date.parse(r.receivedAt) >= since && r.demo)
    expect(recent.length).toBe(87)
    expect(db.records.some((r) => !r.demo)).toBe(true)
    expect(db.records.every((r) => Date.parse(r.receivedAt) <= NOW)).toBe(true)
    // 주차 시각대(요일·시)는 받은 시각의 한국 시간과 맞다
    const r = db.records[db.records.length - 1]
    expect(r.parkedHour).toBe(16)
    expect(r.parkedWeekday).toBe(2)
  })

  it('같은 시각이면 늘 같은 데이터 (고정 시드)', () => {
    expect(createMockDb(NOW).records.slice(0, 50)).toEqual(createMockDb(NOW).records.slice(0, 50))
  })
})

describe('가짜 서버 (어드민 API 계약)', () => {
  it('토큰이 틀리면 401', async () => {
    const { api } = setup('wrong')
    await expect(api.overview()).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
  })

  it('overview: 합계 · Top5 · 분포 · 최근 20', async () => {
    const { api, db } = setup()
    const o = await api.overview()
    expect(o.totals.lots).toBe(db.lots.length)
    expect(o.totals.records).toBe(db.records.length)
    expect(o.totals.records30d).toBe(db.lots.reduce((a, l) => a + l.sampleCount, 0) + db.records.filter((r) => !r.demo).length)
    expect(o.hardest).toHaveLength(5)
    expect(o.hardest[0].id).toBe('hyundai-pangyo')
    expect(o.easiest[0].difficulty).toBe(1.4)
    expect(o.hardest.map((l) => l.difficulty)).toEqual([...o.hardest.map((l) => l.difficulty)].sort((a, b) => b! - a!))
    expect(o.byHour).toHaveLength(24)
    expect(o.byWeekday).toHaveLength(7)
    expect(o.byHour.reduce((a, b) => a + b, 0)).toBe(db.records.length)
    expect(o.recentRecords).toHaveLength(20)
    expect(o.recentRecords[0].demo).toBe(false) // 4분 전 실제 기록
    expect('manualTags' in o.hardest[0]).toBe(false)
  })

  it('목록 검색 q', async () => {
    const { api } = setup()
    const res = await api.listLots('판교')
    expect(res.lots.length).toBeGreaterThan(3)
    expect(res.lots.every((l) => l.name.includes('판교') || (l.address ?? '').includes('판교') || l.id.includes('판교'))).toBe(true)
  })

  it('추가 → 중복 409 → 수정 → 기록 → 삭제', async () => {
    const { api } = setup()
    const created = await api.createLot({ id: 'test-lot', name: '시험 주차장', location: { lat: 37.4, lng: 127.1 }, floors: ['1F', 'B1'], manualTags: ['MECHANICAL'] })
    expect(created.lot).toMatchObject({ id: 'test-lot', difficulty: null, sampleCount: 0, demo: false, tags: ['MECHANICAL'], manualTags: ['MECHANICAL'] })
    await expect(api.createLot({ id: 'test-lot', name: 'x', location: { lat: 37, lng: 127 }, floors: ['1F'] }))
      .rejects.toMatchObject({ status: 409, code: 'conflict' })
    await expect(api.createLot({ id: 'Bad Id', name: 'x', location: { lat: 37, lng: 127 }, floors: ['1F'] }))
      .rejects.toMatchObject({ status: 400, code: 'bad_request' })

    const updated = await api.updateLot('test-lot', { name: '이름 바꿈', floors: ['1F', 'B1', 'B2', 'B3', 'B4'], feeText: '30분 1,000원', manualTags: [] })
    expect(updated.lot).toMatchObject({ name: '이름 바꿈', feeText: '30분 1,000원', manualTags: [], tags: ['MANY_FLOORS'] })
    await expect(api.updateLot('test-lot', { floors: [] })).rejects.toMatchObject({ code: 'bad_request' })

    expect((await api.lotRecords('test-lot')).records).toEqual([])
    await expect(api.deleteLot('test-lot')).resolves.toBeUndefined()
    await expect(api.deleteLot('test-lot')).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })

  it('주차장 기록은 최신 순, limit 적용, 이름 바꾸면 기록의 lotName도', async () => {
    const { api } = setup()
    const res = await api.lotRecords('hyundai-pangyo', 30)
    expect(res.records).toHaveLength(30)
    const times = res.records.map((r) => Date.parse(r.receivedAt))
    expect(times).toEqual([...times].sort((a, b) => b - a))
    await api.updateLot('hyundai-pangyo', { name: '현대백화점 판교점' })
    expect((await api.lotRecords('hyundai-pangyo', 1)).records[0].lotName).toBe('현대백화점 판교점')
  })

  it('recompute 는 주차장 수를 돌려준다', async () => {
    const { api, db } = setup()
    await expect(api.recompute()).resolves.toEqual({ lots: db.lots.length })
    expect(db.lots.every((l) => l.tags.length <= 3)).toBe(true)
  })
})
