/**
 * M-30 '어디로 가세요?' — 지도 검색 API 없이 고를 수 있는 판교 일대 장소 몇 곳 (좌표는 근사치).
 * 여기 없는 이름은 주차장 이름 → 서버 /v1/lots/match 순으로 찾는다.
 */
export interface Place {
  label: string
  lat: number
  lng: number
  /** 검색에 걸리는 다른 이름 */
  alias?: string[]
}

export const PLACES: Place[] = [
  { label: '판교역', lat: 37.3947, lng: 127.1112, alias: ['판교', '판교역 신분당선'] },
  { label: '현대백화점 판교점', lat: 37.3926, lng: 127.1121, alias: ['현대백화점'] },
  { label: '아브뉴프랑 판교', lat: 37.3943, lng: 127.1112, alias: ['아브뉴프랑'] },
  { label: '알파돔시티', lat: 37.3941, lng: 127.109, alias: ['알파돔'] },
  { label: '판교테크노밸리', lat: 37.4013, lng: 127.1086, alias: ['테크노밸리', '판교 테크노밸리'] },
  { label: 'H스퀘어', lat: 37.4021, lng: 127.1083, alias: ['에이치스퀘어'] },
  { label: '화랑공원', lat: 37.3901, lng: 127.1165 },
  { label: '백현마을', lat: 37.3869, lng: 127.1047, alias: ['백현동'] },
  { label: '봇들마을', lat: 37.3888, lng: 127.1135 },
  { label: '정자역', lat: 37.367, lng: 127.108 },
  { label: '서현역', lat: 37.385, lng: 127.1233, alias: ['서현'] },
]

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

export function findPlace(q: string): Place | null {
  const n = norm(q)
  if (!n) return null
  return (
    PLACES.find((p) => norm(p.label) === n || p.alias?.some((a) => norm(a) === n)) ??
    PLACES.find((p) => norm(p.label).includes(n) || n.includes(norm(p.label))) ??
    null
  )
}
