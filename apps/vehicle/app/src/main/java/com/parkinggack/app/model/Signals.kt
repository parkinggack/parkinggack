package com.parkinggack.app.model

/** 앱 내부 기어 표현. Vehicle SDK의 VehicleGear / AAOS GEAR_SELECTION 둘 다 여기로 변환한다. */
enum class Gear { PARK, REVERSE, NEUTRAL, DRIVE, UNKNOWN;
    val isMoving get() = this == DRIVE || this == REVERSE
}

/**
 * 한 시점의 차량 신호 묶음. 실차/에뮬레이터(SDK)와 리플레이(녹화 파일) 모두 이 형태로 흘러간다.
 * @param timestampMs 단조 증가 시각(ms)
 * @param speedMps 차속 (m/s, 항상 0 이상 — 후진 여부는 gear로 판단)
 * @param steeringDeg 핸들(스티어링 휠) 각도, 도 단위. 왼쪽 + / 오른쪽 − (SDK 부호 규약 확인 후 SignalSource에서 맞춤)
 * @param gear 현재 기어
 * @param brakePressed 브레이크 페달 (모르면 null)
 */
data class VehicleSample(
    val timestampMs: Long,
    val speedMps: Float,
    val steeringDeg: Float,
    val gear: Gear,
    val brakePressed: Boolean? = null,
)

/** 차종 제원 (궤적 계산 보정). 기본값은 중형 세단 근사치. */
data class VehicleSpec(
    val name: String = "기본 (중형 세단)",
    val wheelbaseM: Double = 2.85,
    val steeringRatio: Double = 14.5,
    val lengthM: Double = 4.9,
    val widthM: Double = 1.88,
    val isSuv: Boolean = false,
)

/** 위치 (WGS84) */
data class LatLng(val lat: Double, val lng: Double)
