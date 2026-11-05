package com.parkinggack.app.data

import com.parkinggack.app.domain.ReturnHints
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.model.Pose
import com.parkinggack.app.net.MyParkingInputDto
import com.parkinggack.app.net.ParkingSummaryDto
import java.time.Instant

/**
 * 주차 기록 → 연결된 폰으로 보낼 '내 주차' (PUT /v1/me/parkings/:id).
 * 익명 집계와 달리 층·구역·메모·동선이 들어가며, 이 차와 연결된 폰만 볼 수 있다.
 */
object MyParkingSync {
    const val MAX_PATH_POINTS = 300

    fun input(record: ParkingRecord): MyParkingInputDto {
        val s = record.summary
        val route = if (s?.approximate == true) null else ReturnHints.route(record.trajectory, record.floor)
        return MyParkingInputDto(
            lotId = record.lotId,
            lotName = record.lotName,
            floor = record.floor,
            zone = record.zone,
            number = record.number,
            note = record.note,
            parkedAt = Instant.ofEpochMilli(record.parkedAtMs).toString(),
            summary = s?.let { ParkingSummaryDto(it.reverseCount, it.steeringTurns, it.durationSec, it.rampTurns, it.shape.name, it.approximate, it.maxSpeedKmh) },
            hints = route?.lines.orEmpty().filter { it.isNotBlank() }.take(4),
            route = route?.code,
            path = downsample(record.trajectory).map { listOf(it.tMs.toDouble(), round2(it.x), round2(it.y), round3(it.headingRad), if (it.reverse) 1.0 else 0.0) },
        )
    }

    private fun downsample(p: List<Pose>): List<Pose> {
        if (p.size <= MAX_PATH_POINTS) return p
        val step = (p.size - 1).toDouble() / (MAX_PATH_POINTS - 1)
        return (0 until MAX_PATH_POINTS).map { p[Math.round(it * step).toInt()] }
    }

    private fun round2(v: Double) = Math.round(v * 100) / 100.0
    private fun round3(v: Double) = Math.round(v * 1000) / 1000.0
}
