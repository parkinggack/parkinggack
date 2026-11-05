package com.parkinggack.app.session

import com.parkinggack.app.data.DeviceTokens
import com.parkinggack.app.net.ApiClient
import com.parkinggack.app.net.ApiResult
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.time.Instant

/** 폰 연결 화면 상태 */
sealed interface PhoneLinkState {
    data object Loading : PhoneLinkState
    data class Ready(val code: String, val url: String, val expiresAtMs: Long) : PhoneLinkState
    data class Linked(val phoneName: String?) : PhoneLinkState
    data object Expired : PhoneLinkState
    /** 서버에 닿지 않음 (인터넷 없음) */
    data object Offline : PhoneLinkState
}

/**
 * 차 ↔ 폰 페어링 (docs/api.md v1.1). android 의존 없음 → 단위 테스트.
 * 1) 기기 토큰이 없으면 POST /v1/devices 로 발급  2) POST /v1/pairings → QR·코드  3) 2초마다 상태 확인 → claimed 면 연결 완료
 */
class PhoneLink(
    private val api: ApiClient,
    private val device: DeviceTokens,
    private val vehicleName: () -> String?,
    private val pollMs: Long = 2_000,
    private val now: () -> Long = System::currentTimeMillis,
) {
    private val _state = MutableStateFlow<PhoneLinkState>(PhoneLinkState.Loading)
    val state: StateFlow<PhoneLinkState> = _state.asStateFlow()

    /** 기기 토큰 (없으면 발급). 오프라인이면 null */
    suspend fun ensureToken(): String? {
        device.token?.let { return it }
        return when (val r = api.registerDevice(vehicleName())) {
            is ApiResult.Ok -> r.value.token.also { device.token = it }
            else -> null
        }
    }

    /**
     * 코드를 만들고 폰이 연결될 때까지(또는 만료까지) 기다린다. 화면을 나가면 호출한 코루틴을 취소할 것.
     * @return 연결되면 true
     */
    suspend fun run(): Boolean {
        _state.value = PhoneLinkState.Loading
        val token = ensureToken() ?: run { _state.value = PhoneLinkState.Offline; return false }
        val pairing = when (val r = api.createPairing(token)) {
            is ApiResult.Ok -> r.value
            is ApiResult.Http -> if (r.status == 401) {
                // 서버 DB가 초기화돼 토큰을 모름 → 새로 발급받아 한 번 더
                device.token = null
                val t2 = ensureToken() ?: run { _state.value = PhoneLinkState.Offline; return false }
                (api.createPairing(t2) as? ApiResult.Ok)?.value ?: run { _state.value = PhoneLinkState.Offline; return false }
            } else { _state.value = PhoneLinkState.Offline; return false }
            is ApiResult.Offline -> { _state.value = PhoneLinkState.Offline; return false }
        }
        val expires = runCatching { Instant.parse(pairing.expiresAt).toEpochMilli() }.getOrElse { now() + 10 * 60_000 }
        _state.value = PhoneLinkState.Ready(pairing.code, pairing.url, expires)
        while (true) {
            delay(pollMs)
            if (now() >= expires) { _state.value = PhoneLinkState.Expired; return false }
            val st = (api.pairingStatus(device.token ?: return false, pairing.code) as? ApiResult.Ok)?.value ?: continue
            when (st.status) {
                "claimed" -> {
                    device.paired = true
                    device.phoneName = st.phoneName
                    _state.value = PhoneLinkState.Linked(st.phoneName)
                    return true
                }
                "expired" -> { _state.value = PhoneLinkState.Expired; return false }
            }
        }
    }
}
