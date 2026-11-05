/** 지도(Leaflet · SVG 대체 그림)가 같이 쓰는 표시 규칙 */
import type { ParkingLot } from '@api-types'
import { difficultyLabel, difficultyLevel, formatNumber, formatScore, tagLabel } from '../format'
import { LEVEL_FILL_OPACITY, markerDiameter, type MarkerScale } from '../stats'

export type MapViewKey = 'all' | 'seoul' | 'pangyo'
export type Bounds = [[number, number], [number, number]] // [[남, 서], [북, 동]]

export const MAP_VIEWS: { key: MapViewKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'seoul', label: '서울' },
  { key: 'pangyo', label: '판교' },
]

const FIXED_BOUNDS: Record<Exclude<MapViewKey, 'all'>, Bounds> = {
  seoul: [[37.455, 126.82], [37.69, 127.16]],
  pangyo: [[37.383, 127.099], [37.407, 127.126]],
}

export const VIEW_CAPTION: Record<MapViewKey, string> = {
  all: '수도권 전체',
  seoul: '서울',
  pangyo: '판교 일대',
}

export function boundsFor(view: MapViewKey, lots: readonly ParkingLot[]): Bounds {
  if (view !== 'all' || lots.length === 0) return FIXED_BOUNDS[view === 'all' ? 'seoul' : view]
  let s = 90, w = 180, n = -90, e = -180
  for (const l of lots) {
    s = Math.min(s, l.location.lat); n = Math.max(n, l.location.lat)
    w = Math.min(w, l.location.lng); e = Math.max(e, l.location.lng)
  }
  if (n - s < 0.01) { s -= 0.005; n += 0.005 }
  if (e - w < 0.01) { w -= 0.005; e += 0.005 }
  return [[s, w], [n, e]]
}

export function inBounds(b: Bounds, lat: number, lng: number): boolean {
  return lat >= b[0][0] && lat <= b[1][0] && lng >= b[0][1] && lng <= b[1][1]
}

export interface MarkerInfo {
  diameter: number
  level: number | null
  fillOpacity: number
  /** 진한 원이면 글자를 흰색으로 */
  darkFill: boolean
  text: string
  ariaLabel: string
}

export function markerInfo(lot: ParkingLot, maxSamples: number, scale: MarkerScale = 'lg'): MarkerInfo {
  const diameter = markerDiameter(lot.sampleCount, maxSamples, scale)
  if (lot.difficulty == null) {
    return {
      diameter, level: null, fillOpacity: 0, darkFill: false, text: '–',
      ariaLabel: `${lot.name}, 기록 적음 (최근 30일 ${formatNumber(lot.sampleCount)}대)`,
    }
  }
  const level = difficultyLevel(lot.difficulty)
  return {
    diameter,
    level,
    fillOpacity: LEVEL_FILL_OPACITY[level - 1],
    darkFill: level >= 4,
    text: lot.difficulty.toFixed(1),
    ariaLabel: `${lot.name}, ${formatScore(lot.difficulty)} ${difficultyLabel(lot.difficulty)}, 최근 30일 ${formatNumber(lot.sampleCount)}대`,
  }
}

/** 기록 적은(점수 없는) 곳은 맨 아래, 나머지는 큰 원을 아래·작은 원을 위에 (겹쳐도 작은 곳이 가려지지 않게) */
export function paintOrder<T extends ParkingLot>(lots: readonly T[]): T[] {
  return [...lots].sort((a, b) => {
    const sa = a.difficulty == null ? 0 : 1
    const sb = b.difficulty == null ? 0 : 1
    return sa - sb || b.sampleCount - a.sampleCount
  })
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

export function levelBarsHtml(score: number | null): string {
  const level = score == null ? 0 : difficultyLevel(score)
  return `<span class="level-bars level-bars--sm" aria-hidden="true">${[1, 2, 3, 4, 5]
    .map((i) => `<span class="${i <= level ? 'on' : score == null ? 'off dashed' : 'off'}"></span>`)
    .join('')}</span>`
}

export function popupHtml(lot: ParkingLot & { demo?: boolean }): string {
  const tags = lot.tags.map(tagLabel).join(' · ')
  return `<div class="pg-popup">
  <a class="pg-popup__name" href="#/admin/lots/${encodeURIComponent(lot.id)}">${escapeHtml(lot.name)}</a>
  <div class="pg-popup__score"><strong>${formatScore(lot.difficulty)}</strong>${levelBarsHtml(lot.difficulty)}<span>${difficultyLabel(lot.difficulty)}</span></div>
  ${tags ? `<div class="pg-popup__tags">${escapeHtml(tags)}</div>` : ''}
  <div class="pg-popup__meta">최근 30일 · 차량 ${formatNumber(lot.sampleCount)}대${lot.demo ? ' · 시연 데이터' : ''}</div>
</div>`
}

/** SVG 대체 그림에 찍을 기준 장소 (방향 감 잡기용) */
export const LANDMARKS: { name: string; lat: number; lng: number }[] = [
  { name: '서울역', lat: 37.5547, lng: 126.9707 },
  { name: '강남역', lat: 37.4979, lng: 127.0276 },
  { name: '잠실', lat: 37.5133, lng: 127.1001 },
  { name: '여의도', lat: 37.5219, lng: 126.9245 },
  { name: '판교역', lat: 37.3948, lng: 127.1112 },
  { name: '수원역', lat: 37.2656, lng: 127.0001 },
  { name: '인천 부평', lat: 37.4895, lng: 126.724 },
  { name: '일산', lat: 37.6584, lng: 126.77 },
  { name: '하남', lat: 37.5393, lng: 127.2149 },
  { name: '김포공항', lat: 37.5586, lng: 126.7945 },
]
