package com.parkinggack.app.model

/**
 * 추측항법(dead reckoning)으로 계산한 차의 자세. 시작점 기준 로컬 좌표계(m).
 * x = 시작 시 차 진행 방향 오른쪽(+), y = 시작 시 차 진행 방향 앞(+), headingRad = y축 기준 반시계(+)
 */
data class Pose(
    val tMs: Long,
    val x: Double,
    val y: Double,
    val headingRad: Double,
    val reverse: Boolean,
)

/** 전진↔후진이 바뀐 지점 (C-12의 ①②③). index는 1부터. */
data class SwitchPoint(
    val index: Int,
    val tMs: Long,
    val pose: Pose,
    /** 이 지점부터 후진이면 true */
    val toReverse: Boolean,
)

enum class ParkingShape(val label: String) {
    PERPENDICULAR("직각주차"),
    PARALLEL("평행주차"),
    ANGLED("사선주차"),
    UNKNOWN("주차"),
}

/** 이번 주차(진입~P) 한 건의 분석 결과 */
data class ManeuverSummary(
    /** 후진(R) 진입 횟수 */
    val reverseCount: Int,
    /** 핸들을 크게 꺾은(방향 전환) 횟수 */
    val steeringTurns: Int,
    /** 브레이크 밟은 횟수 (신호 없으면 null) */
    val brakeCount: Int?,
    /** 진입~P 걸린 시간(초) */
    val durationSec: Int,
    /** 누적 회전량(바퀴, 부호 있음: 반시계 +). 나선 램프 판단·층 추정에 사용 */
    val netTurns: Double,
    /** 회전 램프로 판단된 누적 회전(바퀴, 절대값) */
    val rampTurns: Double,
    val switchPoints: List<SwitchPoint>,
    val shape: ParkingShape,
    /** 오차가 커서 단순화한 궤적이면 true → "대략적인 동선이에요" */
    val approximate: Boolean,
    /** 기록 구간(주차장 안) 최고 속도 km/h — 주차왕: 10 넘으면 그 주차는 빠짐. 세션이 채움 */
    val maxSpeedKmh: Double? = null,
)

/** 층 추정 */
enum class Confidence { HIGH, MEDIUM, LOW }

data class FloorEstimate(
    /** "B2", "1F" 형식 */
    val floor: String,
    val confidence: Confidence,
)
