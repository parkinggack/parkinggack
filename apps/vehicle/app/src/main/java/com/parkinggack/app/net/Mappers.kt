package com.parkinggack.app.net

import com.parkinggack.app.model.Difficulty
import com.parkinggack.app.model.FloorCongestion
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.model.LotStats
import com.parkinggack.app.model.LotSuggestion
import com.parkinggack.app.model.ParkingLot
import com.parkinggack.app.model.ReasonTag
import com.parkinggack.app.model.ZoneScheme

fun ParkingLotDto.toModel(): ParkingLot = ParkingLot(
    id = id,
    name = name,
    location = LatLng(location.lat, location.lng),
    difficulty = difficulty?.let(::Difficulty),
    tags = tags.mapNotNull { t -> runCatching { ReasonTag.valueOf(t) }.getOrNull() },
    statChips = statChips,
    sampleCount = sampleCount,
    floors = floors.ifEmpty { listOf("1F") },
    zoneScheme = if (zoneScheme.zones.isEmpty() && zoneScheme.numbers.isEmpty()) ZoneScheme()
    else ZoneScheme(
        zones = zoneScheme.zones.ifEmpty { ZoneScheme().zones },
        numbers = zoneScheme.numbers.ifEmpty { ZoneScheme().numbers },
        description = zoneScheme.description,
    ),
    stats = stats?.toModel(),
    publicInfo = publicInfo,
    feeText = feeText,
    ratingCount = ratingCount,
    address = address,
)

fun LotStatsDto.toModel() = LotStats(
    avgReverse = avgReverse,
    overallAvgReverse = overallAvgReverse,
    avgRampTurns = avgRampTurns,
    overallAvgRampTurns = overallAvgRampTurns,
    avgDurationSec = avgDurationSec,
    overallAvgDurationSec = overallAvgDurationSec,
    congestionLabel = congestionLabel,
    floorCongestion = floorCongestion.map { FloorCongestion(it.floor, it.occupancy) },
    congestionSummary = congestionSummary,
    hourlyHeat = hourlyHeat,
    hourLabels = hourLabels,
)

fun LotSuggestionDto.toModel() = LotSuggestion(lot.toModel(), walkMinutes, pitch.ifBlank { "걸어서 ${walkMinutes}분" })
