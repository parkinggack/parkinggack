/**
 * M-01·M-02 이 그리는 '주차 위치 한 건' — 연결된 차(MyParking)에서 왔든, 링크(/p/…#, /s/…)에서 왔든 같은 모양으로.
 */
import type { MyParking, SharePayload } from '@api-types'
import { shortLotName, spotOf } from './format'
import type { Parking } from './payload'
import { parseRoute, type Route } from './route'

export interface SpotView {
  /** 'mine' = 서버의 내 주차 (차 찾았어요 → POST found), 'link' = 링크로 받은 것 */
  source: 'mine' | 'link'
  /** mine: MyParking.id · link: 경로의 id(없으면 t{시각}) */
  key: string
  lotName: string
  floor: string
  zone: string
  number: string
  note: string
  parkedAtMs: number
  hints: string[]
  route: Route | null
}

export function fromMyParking(p: MyParking): SpotView {
  const t = Date.parse(p.parkedAt)
  return {
    source: 'mine',
    key: p.id,
    lotName: shortLotName(p.lotName || '주차 위치'),
    floor: p.floor ?? '',
    zone: p.zone ?? '',
    number: p.number ?? '',
    note: p.note ?? '',
    parkedAtMs: Number.isFinite(t) ? t : 0,
    hints: Array.isArray(p.hints) ? p.hints.filter((h) => typeof h === 'string' && h.trim()).slice(0, 4) : [],
    route: parseRoute(p.route ?? null),
  }
}

export function fromPayload(p: Parking | SharePayload, key: string): SpotView {
  return {
    source: 'link',
    key: key || `t${p.t}`,
    lotName: shortLotName(p.lot || '주차 위치'),
    floor: p.f ?? '',
    zone: p.z ?? '',
    number: p.n ?? '',
    note: p.m ?? '',
    parkedAtMs: p.t,
    hints: p.h ?? [],
    route: p.h?.length ? parseRoute(p.r ?? null) : null,
  }
}

/** 큰 글자 두 줄: 층 "B2" / 구역·기둥 "D-07" */
export function bigLines(s: SpotView): { top: string; bottom: string } {
  const sp = spotOf({ f: s.floor, z: s.zone, n: s.number })
  if (sp.floor) return { top: sp.floor, bottom: sp.zoneNumber }
  if (sp.zoneNumber) return { top: sp.zoneNumber, bottom: '' }
  return { top: '', bottom: '' }
}

export function spotLabel(s: SpotView): string {
  return spotOf({ f: s.floor, z: s.zone, n: s.number }).title
}

/** 메모에서 기준점: "엘리베이터 2번 쪽" → "엘리베이터 2번" */
export function landmarkOf(note: string): string | null {
  const m = /(엘리베이터|에스컬레이터|계단|출입구|출구|입구)\s*(\d+\s*번)?/.exec(note)
  if (!m) return null
  return m[2] ? `${m[1]} ${m[2].replace(/\s+/g, '')}` : m[1]
}

/**
 * M-02 제목 두 줄 (시안 "엘리베이터 2번에서 / D 구역으로 가세요").
 * 힌트가 램프·입구에서 시작하면 그 기준을 따르고(층), 아니면 메모의 기준점.
 */
export function wayTitle(s: SpotView): [string, string] {
  const fromRamp = /^(램프|주차장 입구|입구)/.test(s.hints[0] ?? '')
  const landmark = fromRamp ? null : landmarkOf(s.note)
  const from = landmark ?? s.floor
  const to = s.zone ? `${s.zone} 구역으로 가세요` : s.number ? `${s.number}번 기둥으로 가세요` : '내 차로 가세요'
  return from ? [`${from}에서`, to] : [to.replace(/ 가세요$/, ''), '가세요']
}

/** M-02 단계 — 차가 계산한 힌트가 없으면 층·구역 표지판으로 */
export function waySteps(s: SpotView): { steps: string[]; fromCar: boolean } {
  if (s.hints.length) return { steps: s.hints, fromCar: true }
  const steps: string[] = []
  if (s.floor) steps.push(`${s.floor}에서 내리기`)
  if (s.zone) steps.push(`${s.zone} 구역 표지판 따라가기`)
  const sp = spotOf({ f: s.floor, z: s.zone, n: s.number })
  if (sp.zoneNumber) steps.push(`${sp.zoneNumber} 찾기`)
  return { steps, fromCar: false }
}
