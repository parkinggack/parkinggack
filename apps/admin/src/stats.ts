/** 대시보드 요약 수치 — 서버가 준 주차장 목록에서 계산 (화면에 숫자를 하드코딩하지 않는다) */
import type { ParkingLot } from '@api-types'

export interface LotSummary {
  lots: number
  /** 점수가 있는(표본 충분) 곳 */
  rated: number
  /** 데이터 부족(difficulty null) */
  sparse: number
  /** 점수 있는 곳의 단순 평균. 없으면 null */
  avgDifficulty: number | null
  /** ★4.0 이상 곳 수 / 비율(점수 있는 곳 기준) */
  hardCount: number
  hardShare: number | null
  /** 최근 30일 표본 합 */
  samples30d: number
}

export const HARD_THRESHOLD = 4.0

export function summarizeLots(lots: readonly ParkingLot[]): LotSummary {
  const rated = lots.filter((l) => l.difficulty != null)
  const sum = rated.reduce((a, l) => a + (l.difficulty as number), 0)
  const hardCount = rated.filter((l) => (l.difficulty as number) >= HARD_THRESHOLD).length
  return {
    lots: lots.length,
    rated: rated.length,
    sparse: lots.length - rated.length,
    avgDifficulty: rated.length ? sum / rated.length : null,
    hardCount,
    hardShare: rated.length ? hardCount / rated.length : null,
    samples30d: lots.reduce((a, l) => a + (l.sampleCount || 0), 0),
  }
}

/** 막대 그래프용: 최댓값 인덱스 (모두 0이면 -1) */
export function peakIndex(values: readonly number[]): number {
  let best = -1
  let max = 0
  values.forEach((v, i) => {
    if (v > max) {
      max = v
      best = i
    }
  })
  return best
}

/** 24시간 분포를 "가장 많은 시간대" 문장으로: "오후 6시 무렵이 가장 많아요" */
export function describeHourPeak(byHour: readonly number[]): string {
  const i = peakIndex(byHour)
  if (i < 0) return '아직 기록이 없어요'
  const ampm = i < 12 ? '오전' : '오후'
  const h12 = i % 12 === 0 ? 12 : i % 12
  return `${ampm} ${h12}시 무렵이 가장 많아요`
}

export type MarkerScale = 'sm' | 'md' | 'lg'
const MARKER_RANGE: Record<MarkerScale, [number, number]> = { sm: [22, 18], md: [24, 26], lg: [26, 32] }

/** 지도 확대 수준 → 마커 크기 단계 (멀리서 볼 때는 작게 해서 덜 겹치게) */
export function markerScaleForZoom(zoom: number): MarkerScale {
  return zoom < 10.5 ? 'sm' : zoom < 12.5 ? 'md' : 'lg'
}

/** 마커 원 지름(px) — 기록 수에 비례(면적). lg 26..58, md 24..50, sm 22..40 */
export function markerDiameter(sampleCount: number, maxSamples: number, scale: MarkerScale = 'lg'): number {
  const ratio = maxSamples > 0 ? Math.sqrt(Math.max(0, sampleCount) / maxSamples) : 0
  const [min, range] = MARKER_RANGE[scale]
  return Math.round(min + range * Math.min(1, ratio))
}

/** 난이도 등급(1..5) → 원 채움 진하기. 색상(hue)이 아니라 진하기·숫자·크기로 구분 */
export const LEVEL_FILL_OPACITY = [0.14, 0.32, 0.52, 0.74, 0.94] as const
