package com.parkinggack.app.pleos

/** 진단 화면용 SDK 연결 상태 */
sealed interface SdkStatus {
    data object Idle : SdkStatus
    data object Ready : SdkStatus
    data object NotSupported : SdkStatus
    data class Failed(val reason: String) : SdkStatus
}
