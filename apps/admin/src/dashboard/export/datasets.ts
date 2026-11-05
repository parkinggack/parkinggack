/**
 * D-12 데이터 5종 표 — 시연 기록(records.ts)에서 만든다. 화면의 줄 수·미리보기·파일이 모두 같은 표에서 나온다.
 *
 * 파일에 들어가지 않는 것 (시안 '파일에 들어 있지 않은 것'):
 *   - GPS 원본 · 위경도 — 좌표는 입구를 (0, 0)으로 둔 상대 좌표(m)만
 *   - 차량번호 · VIN · 사람 — session_id 는 주차할 때마다 새로 만든 번호
 *   - 주차장 밖 경로 — 동선은 입구에서 시작
 *   - 5대 미만 칸·시간대 — 칸별·시간대 집계에서 빼고, 세션 요약의 bay_id 는 구역만 남긴다
 *   - 시각은 30분 단위
 */
import { type DatasetId, floorScore } from '../v2demo'
import {
  buildPath, eventSpots, floorPlanInfo, sampleTrace, WEEKDAY_KO, type FloorPlanInfo, type LotSource, type SessionRec,
} from './records'

export type Cell = string | number
/** 열 종류: s 글자, i 정수, f 소수 한 자리 */
export type ColType = 's' | 'i' | 'f'

export interface Table {
  id: DatasetId
  columns: string[]
  types: ColType[]
  rowCount: number
  /** 앞 n 줄 (미리보기) */
  head: (n: number) => Cell[][]
  /** 모든 줄 (파일 만들 때만 — 동선 좌표는 크다) */
  rows: () => Iterable<Cell[]>
}

/** 칸·시간대 묶음이 이보다 적으면 빼거나(집계) 구역만 남긴다(세션) */
export const MIN_GROUP = 5

export interface ExportLot {
  source: LotSource
  sessions: SessionRec[]
}

export interface BuildOptions {
  /** 비어 있으면 전체 층 */
  floors?: ReadonlySet<string>
  /** 비어 있으면 전체 차 크기 */
  classes?: ReadonlySet<string>
}

export interface ExportSet {
  /** 여러 주차장이면 모든 표 앞에 lot_id 열 */
  multiLot: boolean
  tables: Record<DatasetId, Table>
  sessions: number
  /** 5대 미만이라 구역만 남긴 칸 / 뺀 칸 · 시간대 수 */
  hidden: { bays: number; hours: number }
}

const f1 = (v: number) => Math.round(v * 10) / 10

function table(id: DatasetId, columns: string[], types: ColType[], rows: Cell[][]): Table {
  return { id, columns, types, rowCount: rows.length, head: (n) => rows.slice(0, n), rows: () => rows }
}

export function buildExport(lots: readonly ExportLot[], opts: BuildOptions = {}): ExportSet {
  const multi = lots.length > 1
  const lotCol = (lotId: string): Cell[] => (multi ? [lotId] : [])
  const lotHead: string[] = multi ? ['lot_id'] : []
  const lotType: ColType[] = multi ? ['s'] : []
  const floors = opts.floors?.size ? opts.floors : null
  const classes = opts.classes?.size ? opts.classes : null

  const picked = lots.map((l) => ({
    ...l,
    sessions: l.sessions.filter((s) => (!floors || floors.has(s.floor)) && (!classes || classes.has(s.carClass))),
    plans: new Map<string, FloorPlanInfo>(l.source.layout.map((lay) => [lay.floor, floorPlanInfo(lay)])),
  }))

  // 칸 · 시간대 묶음 크기 (내보내는 기록 기준)
  const bayCount = new Map<string, number>()
  const hourCount = new Map<string, number>()
  for (const l of picked) {
    for (const s of l.sessions) {
      const bk = `${s.lotId}|${s.floor}|${s.bay.id}`
      bayCount.set(bk, (bayCount.get(bk) ?? 0) + 1)
      const hk = `${s.lotId}|${s.weekday}|${s.hour}`
      hourCount.set(hk, (hourCount.get(hk) ?? 0) + 1)
    }
  }
  const bayOk = (s: SessionRec) => (bayCount.get(`${s.lotId}|${s.floor}|${s.bay.id}`) ?? 0) >= MIN_GROUP

  // 1) 주차 세션 요약
  const sessionRows: Cell[][] = []
  for (const l of picked) {
    for (const s of l.sessions) {
      sessionRows.push([
        ...lotCol(s.lotId), s.sessionId, s.floor, bayOk(s) ? s.bay.id : s.bay.zone, s.enteredAt, s.reverseN, s.steerTurns,
        s.durationS, s.carClass, s.reverseN <= 1 ? 'Y' : 'N',
      ])
    }
  }

  // 동선은 한 번만 계산해 둔다 (이벤트 자리에도 씀)
  const pathOf = new Map<SessionRec, ReturnType<typeof buildPath>>()
  const path = (s: SessionRec, plan: FloorPlanInfo) => {
    let p = pathOf.get(s)
    if (!p) {
      p = buildPath(s, plan)
      pathOf.set(s, p)
    }
    return p
  }

  // 2) 동선 좌표 — 줄 수는 (걸린 시간 + 1) 의 합, 줄은 받을 때 만든다
  const traceCount = picked.reduce((a, l) => a + l.sessions.reduce((b, s) => b + s.durationS + 1, 0), 0)
  function* traceRows(limit = Infinity): Generator<Cell[]> {
    let n = 0
    for (const l of picked) {
      for (const s of l.sessions) {
        const plan = l.plans.get(s.floor)!
        for (const p of sampleTrace(path(s, plan), s.durationS, plan.origin)) {
          if (n++ >= limit) return
          yield [...lotCol(s.lotId), s.sessionId, p.t, p.x, p.y, s.floor, p.gear, p.speedKmh]
        }
      }
    }
  }
  const traces: Table = {
    id: 'traces',
    columns: [...lotHead, 'session_id', 't_s', 'x_m', 'y_m', 'floor', 'gear', 'speed_kmh'],
    types: [...lotType, 's', 'i', 'f', 'f', 's', 's', 'f'],
    rowCount: traceCount,
    head: (n) => [...traceRows(n)],
    rows: () => traceRows(),
  }

  // 3) 후진 · 급정지 이벤트
  const eventRows: Cell[][] = []
  let eventNo = 0x0f21
  const cell = (floor: string, x: number, y: number) => {
    const part = (v: number) => {
      const i = Math.floor(v)
      return `${i < 0 ? '-' : ''}${String(Math.abs(i)).padStart(2, '0')}`
    }
    return `${floor}_${part(x)}_${part(y)}`
  }
  for (const l of picked) {
    for (const s of l.sessions) {
      const plan = l.plans.get(s.floor)!
      const spots = eventSpots(path(s, plan))
      const at = s.enteredAt
      const push = (type: string, p: { x: number; y: number }) => {
        const x = f1(p.x - plan.origin.x)
        const y = f1(p.y - plan.origin.y)
        eventRows.push([...lotCol(s.lotId), `e_${(eventNo++).toString(16).padStart(4, '0')}`, s.sessionId, type, s.floor, cell(s.floor, x, y), x, y, at])
      }
      if (s.hardBrake) push('hard_brake', spots.brake)
      for (const p of spots.reverse) push('reverse', p)
    }
  }

  // 4) 칸별 집계 (5대 이상인 칸만)
  const bayAgg = new Map<string, { lotId: string; floor: string; bay: string; n: number; attempts: number; rev: number; stay: number }>()
  for (const l of picked) {
    for (const s of l.sessions) {
      if (!bayOk(s)) continue
      const k = `${s.lotId}|${s.floor}|${s.bay.id}`
      const a = bayAgg.get(k) ?? { lotId: s.lotId, floor: s.floor, bay: s.bay.id, n: 0, attempts: 0, rev: 0, stay: 0 }
      a.n += 1
      a.attempts += Math.max(1, s.reverseN)
      a.rev += s.reverseN
      a.stay += s.stayMin
      bayAgg.set(k, a)
    }
  }
  const bayRows = [...bayAgg.values()]
    .map((a) => ({ a, rev: f1(a.rev / a.n) }))
    .sort((p, q) => q.rev - p.rev || q.a.n - p.a.n || (p.a.bay < q.a.bay ? -1 : 1))
    .map(({ a, rev }): Cell[] => [...lotCol(a.lotId), `${a.floor}-${a.bay}`, a.floor, a.n, f1(a.attempts / a.n), rev, Math.round(a.stay / a.n)])

  // 5) 시간대 집계 (5대 이상인 요일 × 시간만)
  const hourAgg = new Map<string, { lotId: string; weekday: number; hour: number; n: number; rev: number }>()
  for (const l of picked) {
    for (const s of l.sessions) {
      const k = `${s.lotId}|${s.weekday}|${s.hour}`
      if ((hourCount.get(k) ?? 0) < MIN_GROUP) continue
      const a = hourAgg.get(k) ?? { lotId: s.lotId, weekday: s.weekday, hour: s.hour, n: 0, rev: 0 }
      a.n += 1
      a.rev += s.reverseN
      hourAgg.set(k, a)
    }
  }
  const lotById = new Map(lots.map((l) => [l.source.lot.id, l.source.lot]))
  const hourRows = [...hourAgg.values()]
    .map((a) => {
      const lot = lotById.get(a.lotId)!
      const rev = f1(a.rev / a.n)
      const score = Math.min(5, Math.max(0, floorScore(lot.difficulty ?? 3, lot.avgReverse, rev)))
      return { a, rev, score }
    })
    .sort((p, q) => q.score - p.score || q.a.n - p.a.n || p.a.weekday - q.a.weekday || p.a.hour - q.a.hour)
    .map(({ a, rev, score }): Cell[] => [...lotCol(a.lotId), WEEKDAY_KO[a.weekday], a.hour, a.n, score, rev])

  const hiddenBays = [...bayCount.values()].filter((n) => n < MIN_GROUP).length
  const hiddenHours = [...hourCount.values()].filter((n) => n < MIN_GROUP).length

  return {
    multiLot: multi,
    sessions: sessionRows.length,
    hidden: { bays: hiddenBays, hours: hiddenHours },
    tables: {
      sessions: table('sessions', [...lotHead, 'session_id', 'floor', 'bay_id', 'entered_at', 'reverse_n', 'steer_turns', 'duration_s', 'car_class', 'one_shot'],
        [...lotType, 's', 's', 's', 's', 'i', 'f', 'i', 's', 's'], sessionRows),
      traces,
      events: table('events', [...lotHead, 'event_id', 'session_id', 'type', 'floor', 'cell_1m', 'x_m', 'y_m', 'at'],
        [...lotType, 's', 's', 's', 's', 's', 'f', 'f', 's'], eventRows),
      bays: table('bays', [...lotHead, 'bay_id', 'floor', 'sessions', 'avg_attempts', 'avg_reverse', 'avg_stay_min'],
        [...lotType, 's', 's', 'i', 'f', 'f', 'i'], bayRows),
      hours: table('hours', [...lotHead, 'weekday', 'hour', 'sessions', 'score', 'avg_reverse'],
        [...lotType, 's', 'i', 'i', 'f', 'f'], hourRows),
    },
  }
}

/** 칸 글자: 소수 한 자리 열은 "2.0" 처럼 */
export function formatCell(v: Cell, type: ColType): string {
  if (typeof v === 'number') return type === 'f' ? v.toFixed(1) : String(Math.round(v))
  return v
}
