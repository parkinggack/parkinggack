/**
 * 서버 없이 도는 시연용 Api (VITE_MOCK=1 또는 M-10 '시연 데이터로 둘러보기').
 * 계약(packages/api-types)과 같은 모양을 돌려주고, 서버와 같은 오류(ApiError not_found·gone)를 낸다.
 *
 * - 페어링 코드: 숫자 6자리면 연결됨. 000000 → 찾을 수 없음(404), 111111 → 시간 지남(410)
 * - 짧은 링크 /s/:code: 아무 코드나 시안 값. 'gone' → 410
 * - '차 찾았어요'는 이 브라우저에 기억 (새로 고침해도 그대로, 시연 끝내기로 초기화)
 * - 웹 푸시 키 없음 → 알림은 앱을 열어 둘 때 확인하는 방식으로 동작
 * - 주차왕(v1.2): 처음엔 참여 전(M-52). 참여하면 이 브라우저에 기억(pg:mock:king), 시안 값의 순위판·점수·지난주 결과(mock/king.ts)
 */
import type { MyParking, ParkingLotDetail } from '@api-types'
import { ApiError, type Api } from '../api/client'
import { distanceBetween, walkMinutes } from '../format'
import { getItem, getJSON, setItem, setJSON } from '../storage'
import { DEMO_CAR, DEMO_TOKEN, lotFixtures, parkingFixtures, pitchFor, shareFixture, statsFixture } from './fixtures'
import { kingBoardFixture, kingMeFixture, kingResultFixture, NICKNAMES } from './king'

const FOUND_KEY = 'pg:mock:found'
export const KING_KEY = 'pg:mock:king'

export interface MockApiOptions {
  now?: () => number
  /** 응답 지연 (실제처럼 보이게, 테스트는 0) */
  latencyMs?: number
  /** 저장소 대신 (테스트) */
  persist?: boolean
}

const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')

export function createMockApi(opts: MockApiOptions = {}): Api & { reset(): void } {
  const now = opts.now ?? (() => Date.now())
  const latency = opts.latencyMs ?? 180
  const persist = opts.persist ?? true
  // 시각은 앱을 연 때 한 번 정한다 → 30초마다 다시 불러도 같은 기록
  const t0 = now()
  const lots: ParkingLotDetail[] = lotFixtures(t0)
  const parkings: MyParking[] = parkingFixtures(t0)
  const found = new Set<string>(persist ? (getJSON(FOUND_KEY, isStrList) ?? []) : [])
  // 주차왕 참여 닉네임 (없으면 참여 전)
  let kingNick: string | null = persist ? getItem(KING_KEY) : null
  let nickTurn = 0
  for (const p of parkings) if (found.has(p.id) && !p.foundAt) p.foundAt = new Date(t0).toISOString()

  const wait = <T>(v: T | (() => T)): Promise<T> =>
    new Promise((resolve, reject) => {
      const run = () => {
        try {
          resolve(typeof v === 'function' ? (v as () => T)() : v)
        } catch (e) {
          reject(e)
        }
      }
      if (latency > 0) setTimeout(run, latency)
      else Promise.resolve().then(run)
    })
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
  const notFound = (what: string) => new ApiError(404, 'not_found', `${what}을(를) 찾을 수 없어요`)
  const findLot = (id: string) => {
    const lot = lots.find((l) => l.id === id)
    if (!lot) throw notFound('주차장')
    return lot
  }

  return {
    reset() {
      found.clear()
      if (persist) setJSON(FOUND_KEY, null)
      kingNick = null
      nickTurn = 0
      if (persist) setItem(KING_KEY, null)
      for (const p of parkingFixtures(t0)) {
        const mine = parkings.find((x) => x.id === p.id)
        if (mine) mine.foundAt = p.foundAt
      }
    },
    claimPairing: (code) =>
      wait(() => {
        if (!/^\d{6}$/.test(code)) throw new ApiError(400, 'bad_request', '코드는 숫자 6자리예요')
        if (code === '000000') throw notFound('코드')
        if (code === '111111') throw new ApiError(410, 'gone', '만료된 코드예요')
        return { token: DEMO_TOKEN, car: { ...DEMO_CAR, pairedAt: new Date(now()).toISOString() } }
      }),
    me: () => wait({ kind: 'phone' as const, car: { ...DEMO_CAR, pairedAt: new Date(t0 - 30 * 86_400_000).toISOString() }, phones: 1, settings: { shareAnonymous: true, experience: 'UNDER_1Y' as const } }),
    unpair: () => wait(undefined),
    currentParking: () => wait(() => clone(parkings.find((p) => !p.foundAt) ?? null)),
    parkings: (o = {}) =>
      wait(() => {
        const limit = Math.max(1, Math.min(50, o.limit ?? 20))
        const list = parkings.filter((p) => !o.before || p.parkedAt < o.before)
        const page = list.slice(0, limit)
        return { parkings: clone(page), nextBefore: list.length > limit ? page[page.length - 1].parkedAt : null }
      }),
    found: (id) =>
      wait(() => {
        const p = parkings.find((x) => x.id === id)
        if (!p) throw notFound('주차 기록')
        if (!p.foundAt) p.foundAt = new Date(now()).toISOString()
        found.add(id)
        if (persist) setJSON(FOUND_KEY, [...found])
        return clone(p)
      }),
    stats: () => wait(() => statsFixture(t0)),
    lots: (q = {}) =>
      wait(() => {
        const limit = q.limit ?? 50
        if (q.lat == null || q.lng == null) {
          return clone(lots)
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
            .slice(0, limit)
        }
        const at = { lat: q.lat, lng: q.lng }
        const radius = q.radius ?? 1000
        return clone(lots)
          .map((l) => ({ ...l, distanceM: Math.round(distanceBetween(at, l.location)) }))
          .filter((l) => l.distanceM <= radius)
          .sort((a, b) => a.distanceM - b.distanceM)
          .slice(0, limit)
      }),
    lot: (id) => wait(() => clone(findLot(id))),
    easier: (id, o = {}) =>
      wait(() => {
        const base = findLot(id)
        const radius = o.radius ?? 1000
        const max = o.max ?? 3
        return lots
          .filter((l) => l.id !== id && l.difficulty != null && (base.difficulty == null || l.difficulty <= base.difficulty - 0.5))
          .map((l) => ({ l, d: Math.round(distanceBetween(base.location, l.location)) }))
          .filter((x) => x.d <= radius)
          .sort((a, b) => (a.l.difficulty ?? 9) - (b.l.difficulty ?? 9))
          .slice(0, max)
          .map(({ l, d }) => {
            const { stats: _stats, ...lot } = clone(l)
            void _stats
            return { lot, walkMinutes: walkMinutes(d), distanceM: d, pitch: `걸어서 ${walkMinutes(d)}분, ${pitchFor(l.tags)}` }
          })
      }),
    match: (name) =>
      wait(() => {
        const q = name.replace(/\s+/g, '')
        const lot = lots.find((l) => l.name.replace(/\s+/g, '').includes(q))
        return lot ? { lot: clone(lot), matchedBy: 'name' as const } : { lot: null, matchedBy: null }
      }),
    share: (code) =>
      wait(() => {
        if (code === 'gone') throw new ApiError(410, 'gone', '만료된 링크예요')
        return { payload: shareFixture(t0), expiresAt: new Date(t0 + 48 * 3_600_000).toISOString() }
      }),
    pushKey: () => wait(null),
    pushSubscribe: () => wait(undefined),
    pushUnsubscribe: () => wait(undefined),

    kingNickname: () => wait(() => NICKNAMES[nickTurn++ % NICKNAMES.length]),
    kingJoin: (body) =>
      wait(() => {
        const nickname = String(body?.nickname ?? '').trim()
        if (!nickname || nickname.length > 20) throw new ApiError(400, 'bad_request', '닉네임을 다시 뽑아주세요')
        kingNick = nickname
        if (persist) setItem(KING_KEY, nickname)
        return kingMeFixture(now(), kingNick)
      }),
    kingLeave: () =>
      wait(() => {
        kingNick = null
        if (persist) setItem(KING_KEY, null)
      }),
    kingMe: () => wait(() => kingMeFixture(now(), kingNick)),
    kingBoard: () =>
      wait(() => {
        if (!kingNick) throw new ApiError(409, 'conflict', '주차왕에 참여하지 않았어요')
        return kingBoardFixture(now(), kingNick)
      }),
    kingResultLast: () => wait(() => (kingNick ? kingResultFixture(now()) : null)),
  }
}
