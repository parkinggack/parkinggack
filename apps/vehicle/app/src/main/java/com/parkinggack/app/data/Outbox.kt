package com.parkinggack.app.data

import com.parkinggack.app.net.AnonymousRecordDto
import com.parkinggack.app.net.ApiClient
import com.parkinggack.app.net.ApiResult
import com.parkinggack.app.net.LotScoreDto
import com.parkinggack.app.net.MyParkingInputDto
import com.parkinggack.app.net.RatingRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.util.Collections
import java.util.IdentityHashMap

/**
 * 서버로 보낼 것(익명 주차 기록, 별점) 대기열. 파일에 저장 → 앱이 꺼졌다 켜져도 유지.
 * 오프라인이면 남겨 두고 다음 flush에서 다시 보낸다. 서버가 거절(4xx)한 건 버린다.
 * clientRecordId/clientRatingId로 서버가 중복을 걸러 주므로 재전송해도 안전.
 *
 * 시도 횟수([Item.attempts])는 서버에 닿았는데 실패한 것(5xx·429)만 센다. 오프라인은 세지 않는다 —
 * 예전엔 오프라인도 세어서 60초마다 flush → 약 50분 지하·통신 없음이면 익명 기록·별점을 조용히 버렸다 (docs/sim-findings.md 2-5).
 * 파일은 [SafeFile]로 쓰고, [scope]가 있으면 백그라운드에서 쓴다.
 */
class Outbox(
    file: File?,
    private val api: ApiClient,
    /** 내 주차 동기화용 차 기기 토큰. 없으면 'parking' 항목은 남겨 두고 뒤의 것부터 보낸다 */
    private val deviceToken: () -> String? = { null },
    scope: CoroutineScope? = null,
) {

    @Serializable
    data class Item(
        val kind: String,                      // "record" | "rating" | "parking"
        val record: AnonymousRecordDto? = null,
        val parkingId: String? = null,
        val parking: MyParkingInputDto? = null,
        val lotId: String? = null,
        val rating: RatingRequest? = null,
        val attempts: Int = 0,
    )

    private val lock = Any()
    private val safe = file?.let(::SafeFile)
    private var items: MutableList<Item> = load()
    private val writer = if (safe != null && scope != null) BackgroundWriter(scope, safe) { synchronized(lock) { encode(items.toList()) } } else null

    val size: Int get() = synchronized(lock) { items.size }

    fun enqueueRecord(r: AnonymousRecordDto) = add(Item("record", record = r))
    fun enqueueRating(lotId: String, r: RatingRequest) = add(Item("rating", lotId = lotId, rating = r))
    /** 같은 주차를 다시 저장하면(층·구역 수정) 대기 중인 이전 것을 대신한다 */
    fun enqueueParking(id: String, p: MyParkingInputDto) = synchronized(lock) {
        items.removeAll { it.kind == "parking" && it.parkingId == id }
        add(Item("parking", parkingId = id, parking = p))
    }

    /**
     * 보낼 수 있는 만큼 보낸다. 네트워크가 끊기면 거기서 멈춤.
     * @param onScore 서버가 새로 계산한 주차장 점수 (캐시 갱신용)
     * @return 보낸(또는 버린) 개수
     */
    suspend fun flush(
        onScore: (LotScoreDto) -> Unit = {},
        /** 내 주차 PUT 성공 — (주차 id, 주차왕 등수 전, 후). 참여 안 했으면 등수는 null */
        onParkingSynced: (String, Int?, Int?) -> Unit = { _, _, _ -> },
    ): Int {
        var done = 0
        val token = deviceToken()
        // 기기 토큰이 없어 지금은 못 보내는 'parking' 항목 — 남겨 두고 뒤의 기록·별점은 보낸다 (예전엔 여기서 전부 멈춤)
        val skipped = Collections.newSetFromMap(IdentityHashMap<Item, Boolean>())
        while (true) {
            val next = synchronized(lock) { items.firstOrNull { it !in skipped } } ?: break
            if (next.kind == "parking" && token == null) { skipped += next; continue }
            val result: ApiResult<*> = when (next.kind) {
                "record" -> api.postRecord(next.record!!).also { (it as? ApiResult.Ok)?.value?.lot?.let(onScore) }
                "rating" -> api.postRating(next.lotId!!, next.rating!!).also { (it as? ApiResult.Ok)?.value?.lot?.let(onScore) }
                "parking" -> api.putMyParking(token!!, next.parkingId!!, next.parking!!).also { r ->
                    (r as? ApiResult.Ok)?.value?.let { onParkingSynced(next.parkingId, it.king?.rankBefore, it.king?.rankAfter) }
                }
                else -> ApiResult.Http(400, "unknown_kind")
            }
            val offline = result is ApiResult.Offline
            val drop = result is ApiResult.Ok || result.isPermanentFailure || (!offline && next.attempts + 1 >= MAX_ATTEMPTS)
            synchronized(lock) {
                if (drop) items.remove(next)
                else if (!offline) { val i = items.indexOf(next); if (i >= 0) items[i] = next.copy(attempts = next.attempts + 1) }
                if (drop || !offline) save()
            }
            if (!drop) break // 오프라인·5xx·429 → 다음 기회에
            done++
        }
        return done
    }

    private fun add(item: Item) = synchronized(lock) {
        items.add(item)
        while (items.size > MAX_ITEMS) items.removeAt(0)
        save()
    }

    private fun load(): MutableList<Item> =
        safe?.read(parse = { ApiClient.JSON.decodeFromString(ListSerializer(Item.serializer()), it) })?.toMutableList() ?: mutableListOf()

    private fun encode(list: List<Item>) = ApiClient.JSON.encodeToString(ListSerializer(Item.serializer()), list)

    /** lock 안에서 부른다 */
    private fun save() {
        val f = safe ?: return
        if (writer != null) writer.request() else runCatching { f.write(encode(items)) }
    }

    companion object {
        const val MAX_ITEMS = 200
        const val MAX_ATTEMPTS = 50
    }
}
