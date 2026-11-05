import type { LatLng } from '@parkinggack/api-types'

/** 두 점 사이 직선거리 (m). 차량 앱 domain/Contracts.kt distanceMeters 와 같은 식 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const r = 6_371_000
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

/** 도보 4.5km/h(분당 75m), 직선거리 × 1.3 우회 계수 — 차량 앱 SeedParkingLotRepository.walkMinutes 와 같음 */
export function walkMinutes(meters: number): number {
  return Math.max(1, Math.ceil((meters * 1.3) / 75))
}
