/**
 * 내비 목적지 → 주차장 (GET /v1/lots/match), 더 쉬운 곳 (GET /v1/lots/:id/easier).
 * 차량 앱 SeedParkingLotRepository 와 같은 규칙에 서버라서 더 할 수 있는 것만 보탰다.
 */
import type { LatLng, LotSuggestion } from '@parkinggack/api-types'
import { distanceMeters, walkMinutes } from './geo.js'
import type { Lot } from './store.js'
import { toParkingLot } from './views.js'

/** 이름이 맞아도 좌표가 이보다 멀면 다른 곳 (예: 목적지 "현대백화점 천호점" ↔ 별칭 "현대백화점"인 판교점) */
export const NAME_MATCH_MAX_M = 3000
/** 이름이 안 맞으면 이 거리 안의 가장 가까운 주차장 */
export const LOCATION_MATCH_M = 250

/** 소문자 + 공백·가운뎃점·괄호 등 제거 ("H스퀘어" = "h 스퀘어") */
export function normalizeName(s: string): string {
  return s.normalize('NFC').toLowerCase().replace(/[\s·・.,\-_()[\]{}'"/]+/g, '')
}

/**
 * 목적지 이름이 주차장 이름·별칭과 얼마나 맞나 (0 = 안 맞음, 클수록 구체적).
 * - 같음 → 1000+길이
 * - 목적지가 별칭/이름을 품음 ("현대백화점 판교점" ⊃ "현대백화점") → 그 길이
 * - 이름이 목적지를 품음 ("아브뉴프랑 판교 주차장" ⊃ "아브뉴프랑 판교", 목적지 3자 이상) → 목적지 길이
 */
export function nameMatchScore(destination: string, lot: Pick<Lot, 'name' | 'aliases'>): number {
  const d = normalizeName(destination)
  if (d.length < 2) return 0
  let best = 0
  for (const cand of [lot.name, ...lot.aliases]) {
    const c = normalizeName(cand)
    if (c.length < 2) continue
    if (c === d) best = Math.max(best, 1000 + c.length)
    else if (d.includes(c)) best = Math.max(best, c.length)
    else if (d.length >= 3 && c.includes(d)) best = Math.max(best, d.length)
  }
  return best
}

export function matchLot(lots: readonly Lot[], name: string | undefined, at: LatLng | undefined): { lot: Lot; matchedBy: 'name' | 'location' } | null {
  if (name) {
    const hits = lots
      .map((lot) => ({ lot, score: nameMatchScore(name, lot), m: at ? distanceMeters(at, lot.location) : 0 }))
      .filter((x) => x.score > 0 && (!at || x.m <= NAME_MATCH_MAX_M))
      .sort((a, b) => b.score - a.score || a.m - b.m || a.lot.name.localeCompare(b.lot.name, 'ko'))
    if (hits.length) return { lot: hits[0].lot, matchedBy: 'name' }
  }
  if (at) {
    const near = lots
      .map((lot) => ({ lot, m: distanceMeters(at, lot.location) }))
      .filter((x) => x.m <= LOCATION_MATCH_M)
      .sort((a, b) => a.m - b.m)
    if (near.length) return { lot: near[0].lot, matchedBy: 'location' }
  }
  return null
}

/** C-03 추천 문구 뒷부분: 운영자 문구가 없으면 태그로 */
export function pitchExtra(lot: Pick<Lot, 'pitch' | 'tags'>): string | null {
  if (lot.pitch) return lot.pitch
  if (lot.tags.includes('FLAT')) return '평면이라 편해요'
  if (lot.tags.includes('SPACIOUS')) return '자리 넉넉해요'
  return null
}

/**
 * 기준 주차장보다 쉬운 곳, 쉬운 순. 기준이 데이터 부족이면 5.0으로 보고,
 * 데이터 부족인 곳·추천 후보가 아닌 곳(집·회사 같은 개인 장소)은 뺀다.
 */
export function easierLots(base: Lot, lots: readonly Lot[], opts: { max: number; radius: number }): LotSuggestion[] {
  const baseScore = base.difficulty ?? 5.0
  return lots
    .filter((l) => l.id !== base.id && l.suggestible && l.difficulty != null && l.difficulty < baseScore)
    .map((l) => ({ l, m: distanceMeters(base.location, l.location) }))
    .filter((x) => x.m <= opts.radius)
    .sort((a, b) => a.l.difficulty! - b.l.difficulty! || a.m - b.m)
    .slice(0, opts.max)
    .map(({ l, m }) => {
      const walk = walkMinutes(m)
      const extra = pitchExtra(l)
      return {
        lot: toParkingLot(l),
        walkMinutes: walk,
        distanceM: Math.round(m),
        pitch: extra ? `걸어서 ${walk}분, ${extra}` : `걸어서 ${walk}분`,
      }
    })
}
