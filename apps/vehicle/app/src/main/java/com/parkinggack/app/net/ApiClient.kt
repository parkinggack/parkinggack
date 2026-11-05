package com.parkinggack.app.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/** 서버 호출 결과. 네트워크 실패(Offline)와 서버가 거절한 경우(Http)를 구분한다 — 거절은 다시 보내도 소용없음 */
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class Http(val status: Int, val code: String?) : ApiResult<Nothing>
    data class Offline(val cause: Throwable) : ApiResult<Nothing>

    fun getOrNull(): T? = (this as? Ok<T>)?.value
    /** 4xx 중 재시도해도 되는 것(429)을 빼면 영구 실패 */
    val isPermanentFailure: Boolean get() = this is Http && status in 400..499 && status != 429
}

/**
 * 주차각 API v1 클라이언트 (docs/api.md). 차 안 네트워크는 자주 끊기므로 짧은 타임아웃 + 호출 쪽 폴백 전제.
 * android 의존 없음 → MockWebServer로 JVM 테스트.
 */
class ApiClient(
    baseUrl: String,
    private val http: OkHttpClient = defaultHttp(),
) {
    private val base: HttpUrl = baseUrl.trimEnd('/').toHttpUrl()

    suspend fun matchLot(name: String?, lat: Double?, lng: Double?): ApiResult<MatchLotResponse> =
        get(MatchLotResponse.serializer(), "v1/lots/match") {
            name?.let { addQueryParameter("name", it) }
            if (lat != null && lng != null) { addQueryParameter("lat", lat.toString()); addQueryParameter("lng", lng.toString()) }
        }

    suspend fun nearbyLots(lat: Double, lng: Double, radiusM: Int = 1_000, limit: Int = 50): ApiResult<ListLotsResponse> =
        get(ListLotsResponse.serializer(), "v1/lots") {
            addQueryParameter("lat", lat.toString()); addQueryParameter("lng", lng.toString())
            addQueryParameter("radius", radiusM.toString()); addQueryParameter("limit", limit.toString())
        }

    suspend fun lotDetail(id: String): ApiResult<LotDetailResponse> = get(LotDetailResponse.serializer(), "v1/lots/$id")

    suspend fun easierLots(id: String, max: Int = 3, radiusM: Int = 1_000): ApiResult<EasierLotsResponse> =
        get(EasierLotsResponse.serializer(), "v1/lots/$id/easier") {
            addQueryParameter("max", max.toString()); addQueryParameter("radius", radiusM.toString())
        }

    suspend fun postRecord(r: AnonymousRecordDto): ApiResult<RecordAcceptedResponse> =
        post(AnonymousRecordDto.serializer(), r, RecordAcceptedResponse.serializer(), "v1/records")

    suspend fun postRating(lotId: String, r: RatingRequest): ApiResult<RatingResponse> =
        post(RatingRequest.serializer(), r, RatingResponse.serializer(), "v1/lots/$lotId/ratings")

    /** SharePayload의 m·h·r 은 "없으면 생략"(optional) — null로 보내면 서버가 400 (api-types `m?: string`) */
    suspend fun createShare(p: SharePayloadDto): ApiResult<CreateShareResponse> =
        post(CreateShareRequest.serializer(), CreateShareRequest(p), CreateShareResponse.serializer(), "v1/shares", json = JSON_OMIT_NULLS)

    // ---------- v1.1 기기·페어링·내 주차 (Authorization: Device <token>) ----------

    suspend fun registerDevice(name: String?): ApiResult<RegisterDeviceResponse> =
        post(RegisterDeviceRequest.serializer(), RegisterDeviceRequest("car", name), RegisterDeviceResponse.serializer(), "v1/devices")

    suspend fun createPairing(token: String): ApiResult<CreatePairingResponse> =
        post(kotlinx.serialization.json.JsonObject.serializer(), kotlinx.serialization.json.JsonObject(emptyMap()), CreatePairingResponse.serializer(), "v1/pairings", token)

    suspend fun pairingStatus(token: String, code: String): ApiResult<PairingStatusResponse> =
        get(PairingStatusResponse.serializer(), "v1/pairings/$code", token = token)

    suspend fun putMyParking(token: String, id: String, input: MyParkingInputDto): ApiResult<MyParkingResponse> =
        send("PUT", MyParkingInputDto.serializer(), input, MyParkingResponse.serializer(), "v1/me/parkings/$id", token)

    // ---------- v1.2 주차왕 ----------

    suspend fun kingMe(token: String): ApiResult<KingMeDto> = get(KingMeDto.serializer(), "v1/me/king", token = token)
    suspend fun kingBoard(token: String): ApiResult<KingBoardDto> = get(KingBoardDto.serializer(), "v1/me/king/board", token = token)
    suspend fun kingNickname(region: String?): ApiResult<KingNicknameDto> =
        get(KingNicknameDto.serializer(), "v1/king/nickname") { region?.let { addQueryParameter("region", it) } }
    suspend fun kingJoin(token: String, nickname: String, region: String? = null): ApiResult<KingJoinResponseDto> =
        post(KingJoinRequestDto.serializer(), KingJoinRequestDto(nickname, region), KingJoinResponseDto.serializer(), "v1/me/king/join", token, json = JSON_OMIT_NULLS)

    suspend fun leaveKing(token: String): ApiResult<Unit> = noContent("DELETE", "v1/me/king", token)

    // ---------- 같이 쓰는 설정 · 연결 ----------

    /** 바꿀 것만 (null 은 보내지 않음) → 서버의 지금 설정 */
    suspend fun patchSettings(token: String, patch: SettingsPatchDto): ApiResult<SharedSettingsResponse> =
        send("PATCH", SettingsPatchDto.serializer(), patch, SharedSettingsResponse.serializer(), "v1/me/settings", token, JSON_OMIT_NULLS)

    /** 차: 연결된 폰 모두 끊기 (차 토큰은 그대로) → 204 */
    suspend fun unlinkPhones(token: String): ApiResult<Unit> = noContent("DELETE", "v1/me", token)

    // ---------------------------------------------------------------------

    /** 본문 없는 응답(204)을 기다리는 호출 */
    private suspend fun noContent(method: String, path: String, token: String?): ApiResult<Unit> = withContext(Dispatchers.IO) {
        val url = base.newBuilder().addPathSegments(path).build()
        val req = Request.Builder().url(url).method(method, null).auth(token).build()
        try {
            http.newCall(req).execute().use { res ->
                if (res.isSuccessful) ApiResult.Ok(Unit)
                else ApiResult.Http(res.code, runCatching { JSON.decodeFromString(ApiErrorBody.serializer(), res.body?.string().orEmpty()).error.code }.getOrNull())
            }
        } catch (e: IOException) {
            ApiResult.Offline(e)
        }
    }

    private suspend fun <T> get(ser: KSerializer<T>, path: String, token: String? = null, query: HttpUrl.Builder.() -> Unit = {}): ApiResult<T> {
        val url = base.newBuilder().addPathSegments(path).apply(query).build()
        return execute(Request.Builder().url(url).get().auth(token).build(), ser)
    }

    private suspend fun <T> get(ser: KSerializer<T>, path: String, query: HttpUrl.Builder.() -> Unit): ApiResult<T> = get(ser, path, null, query)

    private suspend fun <B, T> post(bodySer: KSerializer<B>, body: B, ser: KSerializer<T>, path: String, token: String? = null, json: Json = JSON): ApiResult<T> =
        send("POST", bodySer, body, ser, path, token, json)

    private suspend fun <B, T> send(method: String, bodySer: KSerializer<B>, body: B, ser: KSerializer<T>, path: String, token: String?, encoder: Json = JSON): ApiResult<T> {
        val url = base.newBuilder().addPathSegments(path).build()
        val json = encoder.encodeToString(bodySer, body).toRequestBody(JSON_TYPE)
        return execute(Request.Builder().url(url).method(method, json).auth(token).build(), ser)
    }

    private fun Request.Builder.auth(token: String?) = apply { if (token != null) header("Authorization", "Device $token") }

    private suspend fun <T> execute(req: Request, ser: KSerializer<T>): ApiResult<T> = withContext(Dispatchers.IO) {
        try {
            http.newCall(req).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (res.isSuccessful) {
                    runCatching { ApiResult.Ok(JSON.decodeFromString(ser, text)) }
                        .getOrElse { ApiResult.Http(res.code, "decode_error") }
                } else {
                    val code = runCatching { JSON.decodeFromString(ApiErrorBody.serializer(), text).error.code }.getOrNull()
                    ApiResult.Http(res.code, code)
                }
            }
        } catch (e: IOException) {
            ApiResult.Offline(e)
        }
    }

    companion object {
        val JSON = Json { ignoreUnknownKeys = true; explicitNulls = true; encodeDefaults = true }
        /** optional 필드(null이면 키 생략)가 있는 요청용 */
        val JSON_OMIT_NULLS = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }
        private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

        fun defaultHttp(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(4, TimeUnit.SECONDS)
            .readTimeout(6, TimeUnit.SECONDS)
            .writeTimeout(6, TimeUnit.SECONDS)
            .callTimeout(10, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
}
