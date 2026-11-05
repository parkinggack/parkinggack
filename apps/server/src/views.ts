/** 서버 Lot → API 모양 (packages/api-types) */
import type { AdminLot, LotStats, ParkingLot, ParkingLotDetail } from '@parkinggack/api-types'
import { deriveRampKind, shortLotName, type OverallAverages } from './scoring.js'
import type { Lot } from './store.js'

const iso = (ms: number) => new Date(ms).toISOString()

export function toParkingLot(l: Lot): ParkingLot {
  return {
    id: l.id,
    name: l.name,
    location: { lat: l.location.lat, lng: l.location.lng },
    address: l.address,
    difficulty: l.difficulty,
    tags: l.tags,
    statChips: l.statChips,
    sampleCount: l.sampleCount,
    ratingCount: l.ratingCount,
    floors: l.floors,
    zoneScheme: { zones: l.zoneScheme.zones, numbers: l.zoneScheme.numbers, description: l.zoneScheme.description ?? null },
    publicInfo: l.publicInfo,
    feeText: l.feeText,
    updatedAt: iso(l.updatedAt),
    category: l.category,
    region: l.region,
  }
}

export function toStats(l: Lot, overall: OverallAverages): LotStats | null {
  if (!l.stats) return null
  const s = l.stats
  return {
    avgReverse: s.avgReverse,
    overallAvgReverse: overall.overallAvgReverse,
    avgRampTurns: s.avgRampTurns,
    overallAvgRampTurns: overall.overallAvgRampTurns,
    avgDurationSec: s.avgDurationSec,
    overallAvgDurationSec: overall.overallAvgDurationSec,
    congestionLabel: s.congestionLabel,
    floorCongestion: s.floorCongestion,
    congestionSummary: s.congestionSummary,
    hourlyHeat: s.hourlyHeat,
    hourLabels: s.hourLabels,
  }
}

export function toDetail(l: Lot, overall: OverallAverages): ParkingLotDetail {
  return { ...toParkingLot(l), stats: toStats(l, overall) }
}

export function toAdminLot(l: Lot, overall: OverallAverages): AdminLot {
  return {
    ...toDetail(l, overall),
    manualTags: l.manualTags,
    scoreSampleCount: l.scoreSampleCount,
    demo: l.demo,
    createdAt: iso(l.createdAt),
    aliases: l.aliases,
    pitch: l.pitch,
    suggestible: l.suggestible,
    shortName: effectiveShortName(l),
    rampKind: effectiveRampKind(l),
  }
}

export const effectiveShortName = (l: Pick<Lot, 'shortName' | 'name'>) => l.shortName || shortLotName(l.name)
export const effectiveRampKind = (l: Pick<Lot, 'rampKind' | 'stats' | 'floors'>) => l.rampKind ?? deriveRampKind(l.stats?.avgRampTurns, l.floors.length)
