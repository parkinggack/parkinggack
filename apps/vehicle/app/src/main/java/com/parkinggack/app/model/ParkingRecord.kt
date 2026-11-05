package com.parkinggack.app.model

/** 저장된 주차 한 건 (C-01, C-05~C-07, C-09, 폰 M-01로 전송) */
data class ParkingRecord(
    val id: String,
    val lotId: String?,
    val lotName: String,
    val floor: String?,
    val zone: String?,
    val number: String?,
    val note: String? = null,
    val parkedAtMs: Long,
    val summary: ManeuverSummary?,
    val trajectory: List<Pose> = emptyList(),
) {
    /**
     * 기기에만 두는 기록 — 시연 재생(`--es demo`)으로 생긴 것과 예전 버전의 예시 기록("seed-…").
     * 실제 운전이 아니므로 서버 난이도 집계·주차왕 점수·폰 동기화로 보내지 않는다. (내 기록·C-07 공유는 그대로)
     */
    val staysOnDevice: Boolean get() = id.startsWith(DEMO_ID_PREFIX) || id.startsWith(SEED_ID_PREFIX)

    /** "B2 · D-07" / "B2" / "위치 미기록" */
    val positionText: String get() = buildString {
        append(floor ?: "위치 미기록")
        if (zone != null) { append(" · "); append(zone); if (number != null) { append("-"); append(number) } }
    }

    companion object {
        const val DEMO_ID_PREFIX = "demo-"
        const val SEED_ID_PREFIX = "seed-"
        /** 주차장도 주소도 모를 때의 이름 (목적지 없이 대고 위치도 못 받음) */
        const val UNKNOWN_PLACE = "주차 위치"
    }
}

/** 운전 경력 (C-10, C-11) */
enum class DrivingExperience(val label: String) {
    UNDER_1Y("1년 미만"), Y1_3("1~3년"), Y3_10("3~10년"), OVER_10Y("10년 이상"), UNKNOWN("말하지 않을게요")
}

/** C-10 도착지 난이도 카드 표시 시점 */
enum class CardTiming(val label: String) {
    HARD_ONLY("어려운 곳만"), ALWAYS("항상"), NEVER("안 보기")
}

data class UserSettings(
    val onboarded: Boolean = false,
    val shareAnonymous: Boolean = true,
    val showParkedCard: Boolean = true,
    val experience: DrivingExperience = DrivingExperience.UNKNOWN,
    val cardTiming: CardTiming = CardTiming.HARD_ONLY,
)
