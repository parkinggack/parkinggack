import { DEMO_NOW, demoLotInsights } from '@insights-demo'
import { describe, expect, it } from 'vitest'
import { durationHistogram, floorScore, oneShotPct, parkDirection } from '../v2demo'
import { buildExport, MIN_GROUP } from './datasets'
import { makeExportFile } from './files'
import { parquetBytes } from './parquet'
import { addDays, generateSessions, type LotSource } from './records'
import { csvBytes, eventGeoJson, traceGeoJson } from './writers'
import { crc32, encodeChunks } from './zip'

const r = demoLotInsights('hyundai-pangyo', { now: DEMO_NOW, floor: 'auto', maxPaths: 1 })!
const src: LotSource = { lot: r.lot, floorAvgReverse: r.floorAvgReverse, layout: r.layout, heat: r.heat }
const END = '2026-11-03'
const sessions = generateSessions(src, { count: 1284, endDate: END, days: 30, endHour: 17 })
const set = buildExport([{ source: src, sessions }])
const text = (b: Uint8Array) => new TextDecoder().decode(b)
const PRIVATE = /lat|lng|lon|gps|plate|vin|vehicle|car_no|phone|name|user/i

describe('v2demo 관계 (시안 D-11 층 표)', () => {
  it('층 난이도 · 한 번에 들어간 비율 · 주차 방향 (B3 3.9회 → 4.6 · 31% · 63/31/6)', () => {
    expect(floorScore(4.3, 3.2, 3.6)).toBe(4.6) // 현대백화점 B2 (API 평균 후진 3.6회)
    expect(floorScore(4.3, 3.2, 2.1)).toBe(3.4)
    expect([2.1, 2.8, 3.9].map(oneShotPct)).toEqual([58, 48, 31])
    expect(parkDirection(3.9)).toEqual({ rear: 63, front: 31, parallel: 6 })
    expect(parkDirection(2.1)).toEqual({ rear: 52, front: 41, parallel: 7 })
  })

  it('들어와서 대기까지: 평균 130초면 시안 막대 그대로, 짧은 곳은 앞쪽 칸으로', () => {
    expect(durationHistogram(130)).toEqual([4, 8, 15, 20, 25, 16, 12])
    const quick = durationHistogram(40)
    expect(quick[0] + quick[1]).toBeGreaterThan(60)
    expect(Math.round(quick.reduce((a, b) => a + b, 0))).toBe(100)
  })
})

describe('시연 기록 생성기 (API 집계에 맞춤)', () => {
  it('기록 수 · 층별 평균 후진 · 한 번에 들어간 비율이 API·D-11 값과 맞다', () => {
    expect(sessions).toHaveLength(1284)
    for (const f of r.floorAvgReverse) {
      const xs = sessions.filter((s) => s.floor === f.floor)
      expect(xs.length).toBeGreaterThan(100)
      const avg = xs.reduce((a, s) => a + s.reverseN, 0) / xs.length
      expect(Math.abs(avg - f.avgReverse)).toBeLessThan(0.01)
      const one = (xs.filter((s) => s.reverseN <= 1).length / xs.length) * 100
      expect(Math.abs(one - oneShotPct(f.avgReverse))).toBeLessThan(1)
    }
    const meanDur = sessions.reduce((a, s) => a + s.durationS, 0) / sessions.length
    expect(Math.abs(meanDur - r.lot.avgDurationSec)).toBeLessThan(3)
  })

  it('같은 입력이면 같은 기록, 시각은 기간 안 30분 단위, 오늘은 지금 시각 전까지', () => {
    expect(generateSessions(src, { count: 1284, endDate: END, days: 30, endHour: 17 })).toEqual(sessions)
    const first = addDays(END, -29)
    for (const s of sessions) {
      expect(s.enteredAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:(00|30)$/)
      expect(s.date >= first && s.date <= END).toBe(true)
      if (s.date === END) expect(s.hour).toBeLessThan(17)
    }
    expect(new Set(sessions.map((s) => s.sessionId)).size).toBe(1284)
  })
})

describe('내보내기 표 — 개인을 알아볼 값 없음', () => {
  it('세션 요약: 시안 열 그대로, 5대 미만 칸은 구역만', () => {
    const t = set.tables.sessions
    expect(t.columns).toEqual(['session_id', 'floor', 'bay_id', 'entered_at', 'reverse_n', 'steer_turns', 'duration_s', 'car_class', 'one_shot'])
    expect(t.rowCount).toBe(1284)
    const perBay = new Map<string, number>()
    for (const s of sessions) perBay.set(`${s.floor}|${s.bay.id}`, (perBay.get(`${s.floor}|${s.bay.id}`) ?? 0) + 1)
    let generalized = 0
    for (const row of t.rows()) {
      const [, floor, bay, at, rev, , , , one] = row as string[]
      expect(String(at)).toMatch(/:(00|30)$/)
      expect(one).toBe(Number(rev) <= 1 ? 'Y' : 'N')
      if (/^[A-H]$/.test(String(bay))) generalized++
      else expect(perBay.get(`${floor}|${bay}`)).toBeGreaterThanOrEqual(MIN_GROUP)
    }
    expect(generalized).toBeGreaterThan(0)
    expect(set.hidden.bays).toBeGreaterThan(0)
  })

  it('칸별 · 시간대 집계는 5대 이상인 칸·시간대만', () => {
    const bays = [...set.tables.bays.rows()]
    expect(bays.length).toBeGreaterThan(0)
    expect(bays.every((b) => Number(b[2]) >= MIN_GROUP)).toBe(true)
    const hours = [...set.tables.hours.rows()]
    expect(hours.length).toBeGreaterThan(0)
    expect(hours.every((h) => Number(h[2]) >= MIN_GROUP && Number(h[1]) >= 0 && Number(h[1]) <= 23)).toBe(true)
  })

  it('동선: 1초마다 한 점, 입구 (0, 0)에서 시작해 P로 끝, 후진 구간 수 = reverse_n', () => {
    const t = set.tables.traces
    expect(t.rowCount).toBe(sessions.reduce((a, s) => a + s.durationS + 1, 0))
    const head = t.head(sessions[0].durationS + 1)
    expect(head[0].slice(1, 4)).toEqual([0, 0, head[0][3]])
    expect(Math.abs(Number(head[0][2])) + Math.abs(Number(head[0][3]))).toBeLessThan(1)
    expect(head[head.length - 1][5]).toBe('P')
    let runs = 0
    head.forEach((row, i) => { if (row[5] === 'R' && (i === 0 || head[i - 1][5] !== 'R')) runs++ })
    expect(runs).toBe(sessions[0].reverseN)
    // 도면 밖(주차장 밖)으로 나가지 않는다
    for (const row of head) {
      expect(Math.abs(Number(row[2]))).toBeLessThan(70)
      expect(Math.abs(Number(row[3]))).toBeLessThan(40)
    }
  })

  it('이벤트: 후진 수 + 급정지, 30분 단위 시각', () => {
    const t = set.tables.events
    const expected = sessions.reduce((a, s) => a + s.reverseN + (s.hardBrake ? 1 : 0), 0)
    expect(t.rowCount).toBe(expected)
    for (const row of t.head(50)) {
      expect(['reverse', 'hard_brake']).toContain(row[2])
      expect(String(row[7])).toMatch(/:(00|30)$/)
      expect(String(row[4])).toMatch(/^B\d_-?\d{2,}_-?\d{2,}$/)
    }
  })

  it('어느 표에도 위경도 · 차량번호 · VIN 같은 열이 없다', () => {
    for (const t of Object.values(set.tables)) for (const c of t.columns) expect(c).not.toMatch(PRIVATE)
  })

  it('층 · 차 크기로 거르면 모든 표가 그 기록에서 다시 나온다, 여러 주차장이면 lot_id 열', () => {
    const b2 = buildExport([{ source: src, sessions }], { floors: new Set(['B2']), classes: new Set(['SUV']) })
    const n = sessions.filter((s) => s.floor === 'B2' && s.carClass === 'SUV').length
    expect(b2.tables.sessions.rowCount).toBe(n)
    expect([...b2.tables.sessions.rows()].every((row) => row[1] === 'B2' && row[7] === 'SUV')).toBe(true)
    const two = buildExport([{ source: src, sessions }, { source: { ...src, lot: { ...src.lot, id: 'other' } }, sessions: sessions.slice(0, 10).map((s) => ({ ...s, lotId: 'other' })) }])
    expect(two.tables.sessions.columns[0]).toBe('lot_id')
    expect(two.tables.sessions.rowCount).toBe(1294)
  })
})

describe('파일 형식', () => {
  it('CSV: BOM · 머리 줄 · CRLF, 개인 정보 열 없음', () => {
    const bytes = csvBytes(set.tables.sessions)
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]) // 엑셀이 UTF-8 로 읽게
    const csv = text(bytes)
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('session_id,floor,bay_id,entered_at,reverse_n,steer_turns,duration_s,car_class,one_shot')
    expect(lines).toHaveLength(1284 + 2) // 마지막 줄바꿈 뒤 빈 줄
    expect(lines[1]).toMatch(/^s_[0-9a-f]{6},B\d,[A-H](\d{2})?,\d{4}-\d{2}-\d{2} \d{2}:(00|30),\d+,\d+\.\d,\d+,(경차|소형|중형|대형|SUV),[YN]$/)
    expect(csv).not.toMatch(PRIVATE)
  })

  it('GeoJSON: 상대 좌표라고 적고, 동선은 기어마다 LineString · 이벤트는 Point', () => {
    const small = buildExport([{ source: src, sessions: sessions.slice(0, 3) }])
    const tr = JSON.parse(text(encodeChunks(traceGeoJson(small.tables.traces))))
    expect(tr.type).toBe('FeatureCollection')
    expect(tr.coordinate_system).toMatch(/상대 좌표/)
    expect(tr.features.every((f: { geometry: { type: string } }) => f.geometry.type === 'LineString')).toBe(true)
    expect(new Set(tr.features.map((f: { properties: { gear: string } }) => f.properties.gear))).toEqual(new Set(['D', 'R']))
    const ev = JSON.parse(text(encodeChunks(eventGeoJson(small.tables.events))))
    expect(ev.features).toHaveLength(small.tables.events.rowCount)
    expect(ev.features[0].geometry.type).toBe('Point')
  })

  it('Excel · Parquet · ZIP 은 진짜 파일 머리 (PK · PAR1)', async () => {
    const small = buildExport([{ source: src, sessions: sessions.slice(0, 40) }])
    const x = await makeExportFile(small, ['sessions', 'bays'], 'xlsx', 'demo')
    expect(x.name).toBe('demo.xlsx')
    expect(String.fromCharCode(x.bytes[0], x.bytes[1])).toBe('PK')
    const pq = parquetBytes(small.tables.sessions)
    expect(text(pq.slice(0, 4))).toBe('PAR1')
    expect(text(pq.slice(-4))).toBe('PAR1')
    const z = await makeExportFile(small, ['sessions', 'traces', 'events'], 'geojson', 'demo')
    expect(z.name).toBe('demo.zip')
    expect(z.contents).toEqual(['demo_sessions.csv', 'demo_traces.geojson', 'demo_events.geojson'])
    const one = await makeExportFile(small, ['events'], 'csv', 'demo')
    expect(one.name).toBe('demo_events.csv')
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})
