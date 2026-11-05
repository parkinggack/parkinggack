package com.parkinggack.app.data

import android.content.Context

/** 이 차의 기기 토큰과 폰 연결 상태 (서버 /v1/devices, /v1/pairings). 토큰은 기기 밖으로 나가지 않는다 */
class DeviceStore(context: Context) : DeviceTokens {
    private val prefs = context.getSharedPreferences("device", Context.MODE_PRIVATE)

    override var token: String?
        get() = prefs.getString("token", null)
        set(v) { prefs.edit().putString("token", v).apply() }

    override var paired: Boolean
        get() = prefs.getBoolean("paired", false)
        set(v) { prefs.edit().putBoolean("paired", v).apply() }

    override var phoneName: String?
        get() = prefs.getString("phoneName", null)
        set(v) { prefs.edit().putString("phoneName", v).apply() }

    override var kingJoined: Boolean
        get() = prefs.getBoolean("kingJoined", false)
        set(v) { prefs.edit().putBoolean("kingJoined", v).apply() }
}

/** 테스트용으로 분리한 인터페이스 */
interface DeviceTokens {
    var token: String?
    var paired: Boolean
    var phoneName: String?
    /** 주차왕 참여 중 (폰 연결이 없어도 주차를 서버로 보내야 점수가 생김) */
    var kingJoined: Boolean
}

class InMemoryDeviceTokens : DeviceTokens {
    override var token: String? = null
    override var paired: Boolean = false
    override var phoneName: String? = null
    override var kingJoined: Boolean = false
}
