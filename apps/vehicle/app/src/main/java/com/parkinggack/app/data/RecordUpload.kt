package com.parkinggack.app.data

import com.parkinggack.app.model.DrivingExperience
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.model.VehicleSpec
import com.parkinggack.app.net.AnonymousRecordDto
import java.util.Calendar
import java.util.TimeZone

/** 차 크기 등급 (서버 난이도 보정용) */
enum class VehicleClass { COMPACT, MIDSIZE, LARGE, SUV, UNKNOWN }

/**
 * 저장한 주차 기록 → 서버로 보낼 익명 기록. 이름·차량번호·VIN·좌표·정확한 시각은 넣지 않는다 (시·요일만).
 * 주차장을 모르는 기록(lotId 없음)이나 분석 요약이 없는 기록은 보내지 않는다.
 */
object RecordUpload {
    fun from(
        record: ParkingRecord,
        vehicleClass: VehicleClass,
        experience: DrivingExperience,
        clientRecordId: String = record.id,
        timeZone: TimeZone = TimeZone.getDefault(),
    ): AnonymousRecordDto? {
        val lotId = record.lotId ?: return null
        val s = record.summary ?: return null
        val cal = Calendar.getInstance(timeZone).apply { timeInMillis = record.parkedAtMs }
        val weekday = ((cal.get(Calendar.DAY_OF_WEEK) + 5) % 7) + 1 // 월=1 … 일=7
        return AnonymousRecordDto(
            clientRecordId = clientRecordId,
            lotId = lotId,
            floor = record.floor,
            reverseCount = s.reverseCount.coerceIn(0, 50),
            steeringTurns = s.steeringTurns.coerceIn(0, 100),
            brakeCount = s.brakeCount,
            durationSec = s.durationSec.coerceIn(1, 3600),
            rampTurns = s.rampTurns.coerceIn(0.0, 20.0),
            shape = s.shape.name,
            approximate = s.approximate,
            vehicleClass = vehicleClass.name,
            experience = experience.name,
            parkedHour = cal.get(Calendar.HOUR_OF_DAY),
            parkedWeekday = weekday,
        )
    }

    /** 차종 이름 → 등급 (VehicleSpecs 표 기준) */
    fun classify(spec: VehicleSpec): VehicleClass = when {
        spec.name.startsWith("기본") -> VehicleClass.UNKNOWN
        spec.isSuv -> VehicleClass.SUV
        spec.lengthM >= 5.0 -> VehicleClass.LARGE
        spec.lengthM >= 4.6 -> VehicleClass.MIDSIZE
        else -> VehicleClass.COMPACT
    }
}
