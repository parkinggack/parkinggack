package com.parkinggack.app.car

/**
 * CarUxRestrictions 비트마스크를 앱이 쓰기 쉬운 형태로 변환.
 * 플래그 값은 android.car.drivingstate.CarUxRestrictions 상수와 동일.
 */
data class UxRestriction(
    val requiresDistractionOptimization: Boolean,
    val activeFlags: Int,
) {
    val isDriving get() = requiresDistractionOptimization
    val noKeyboard get() = has(NO_KEYBOARD)
    val noVideo get() = has(NO_VIDEO)
    val limitStringLength get() = has(LIMIT_STRING_LENGTH)
    val limitContent get() = has(LIMIT_CONTENT)
    val noSetup get() = has(NO_SETUP)

    private fun has(flag: Int) = activeFlags and flag != 0

    companion object {
        const val NO_DIALPAD = 1
        const val NO_FILTERING = 2
        const val LIMIT_STRING_LENGTH = 4
        const val NO_KEYBOARD = 8
        const val NO_VIDEO = 16
        const val LIMIT_CONTENT = 32
        const val NO_SETUP = 64

        /** Car 서비스에 연결 전/실패 시: 보수적으로 "주차 중"으로 간주하지 않고 제한 없음으로 둠 */
        val UNKNOWN = UxRestriction(false, 0)
    }
}
