package com.parkinggack.app.data

import android.content.Context
import com.parkinggack.app.model.CardTiming
import com.parkinggack.app.model.DrivingExperience
import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.Pose
import com.parkinggack.app.model.SwitchPoint
import com.parkinggack.app.model.UserSettings
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.math.roundToLong

/**
 * 내 주차 기록 로컬 저장 (filesDir/records.json). 기록은 기기 밖으로 나가지 않음 — 익명 집계 전송은 별도.
 *
 * - 읽기·쓰기는 메인 스레드 밖에서 ([io]). 기록 1년 치(약 8 MB)를 메인 스레드에서 읽고 쓰면 시작 6초·저장 5.8초 멈춤·ANR이었다
 * - 쓰기는 [SafeFile] — 쓰는 중 전원이 끊겨도 이전 파일이 남고, 깨진 파일은 지우지 않고 옮겨 둔다
 * - 바꾸기(upsert 등)는 부른 스레드에서 바로 [records]에 반영된다. 파일을 다 읽기 전에 바꾼 것은 읽은 뒤 그 위에 다시 적용
 */
@OptIn(ExperimentalCoroutinesApi::class)
class RecordStore(
    file: File,
    scope: CoroutineScope,
    io: CoroutineDispatcher = Dispatchers.IO.limitedParallelism(1),
) {
    constructor(context: Context, scope: CoroutineScope) : this(File(context.filesDir, "records.json"), scope)

    private val safe = SafeFile(file)
    private val lock = Any()
    private val _records = MutableStateFlow<List<ParkingRecord>>(emptyList())
    val records: StateFlow<List<ParkingRecord>> = _records.asStateFlow()

    private val _ready = MutableStateFlow(false)
    /** 파일을 다 읽었는지 (그 전엔 [records]가 비어 있을 수 있음 — 홈이 '첫 기록' 빈 화면을 잠깐 보이지 않게) */
    val ready: StateFlow<Boolean> = _ready.asStateFlow()

    /** 다 읽기 전에 들어온 바꾸기 — 읽은 목록 위에 순서대로 다시 적용 */
    private val beforeLoad = ArrayList<(List<ParkingRecord>) -> List<ParkingRecord>>()
    private val writer = BackgroundWriter(scope, safe, io) { encode(_records.value) }

    init {
        scope.launch(io) {
            val loaded = safe.read(::decode, ::salvage).orEmpty()
            synchronized(lock) {
                _records.value = beforeLoad.fold(loaded) { acc, op -> op(acc) }
                // 깨진 파일에서 살렸으면 바로 다시 써 둔다 (안 그러면 다음 실행은 .bak만 다시 읽음)
                val changed = beforeLoad.isNotEmpty() || safe.recovered
                beforeLoad.clear()
                _ready.value = true
                if (changed) writer.request()
            }
        }
    }

    val latest: ParkingRecord? get() = _records.value.firstOrNull()

    fun upsert(record: ParkingRecord) = mutate { list ->
        (listOf(record) + list.filterNot { it.id == record.id }).sortedByDescending { it.parkedAtMs }
    }

    fun clear() = mutate { emptyList() }

    /** 여러 건을 한 번에 (같은 id 는 바꿈) — 예시 기록 넣기 */
    fun upsertAll(list: List<ParkingRecord>) {
        if (list.isEmpty()) return
        val ids = list.map { it.id }.toSet()
        mutate { cur -> (list + cur.filterNot { it.id in ids }).sortedByDescending { it.parkedAtMs } }
    }

    fun removeWhere(predicate: (ParkingRecord) -> Boolean) = mutate { cur -> cur.filterNot(predicate) }

    /** 다 읽고, 지금까지 바꾼 것을 다 쓸 때까지 (테스트) */
    suspend fun awaitIdle() { ready.first { it }; writer.awaitIdle() }

    private fun mutate(op: (List<ParkingRecord>) -> List<ParkingRecord>) = synchronized(lock) {
        val before = _records.value
        val after = op(before)
        _records.value = after
        if (!_ready.value) beforeLoad += op else if (after != before) writer.request()
    }

    private fun encode(list: List<ParkingRecord>): String = JSONArray(list.map { it.toJson() }).toString()

    private fun decode(text: String): List<ParkingRecord> {
        val arr = JSONArray(text)
        return (0 until arr.length()).map { arr.getJSONObject(it).toRecord() }
    }

    /** 깨진(잘린) 파일 앞부분에서 온전한 기록만 읽어 `.bak`과 합친다 — 같은 id 는 깨진 파일 쪽(더 새것) */
    private fun salvage(corrupt: String, backup: List<ParkingRecord>?): List<ParkingRecord>? {
        val tok = org.json.JSONTokener(corrupt)
        val front = ArrayList<ParkingRecord>()
        if (runCatching { tok.nextClean() }.getOrNull() == '[') {
            while (true) {
                val obj = runCatching { tok.nextValue() }.getOrNull() as? JSONObject ?: break
                runCatching { obj.toRecord() }.getOrNull()?.let(front::add)
                if (runCatching { tok.nextClean() }.getOrNull() != ',') break
            }
        }
        if (front.isEmpty()) return backup
        val ids = front.map { it.id }.toSet()
        return (front + backup.orEmpty().filterNot { it.id in ids }).sortedByDescending { it.parkedAtMs }
    }
}

/** 설정 (SharedPreferences) */
class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private val _settings = MutableStateFlow(read())
    val settings: StateFlow<UserSettings> = _settings.asStateFlow()

    fun update(s: UserSettings) {
        prefs.edit()
            .putBoolean("onboarded", s.onboarded)
            .putBoolean("shareAnonymous", s.shareAnonymous)
            .putBoolean("showParkedCard", s.showParkedCard)
            .putString("experience", s.experience.name)
            .putString("cardTiming", s.cardTiming.name)
            .apply()
        _settings.value = s
    }

    private fun read() = UserSettings(
        onboarded = prefs.getBoolean("onboarded", false),
        shareAnonymous = prefs.getBoolean("shareAnonymous", true),
        showParkedCard = prefs.getBoolean("showParkedCard", true),
        experience = prefs.getString("experience", null)?.let { runCatching { DrivingExperience.valueOf(it) }.getOrNull() } ?: DrivingExperience.UNKNOWN,
        cardTiming = prefs.getString("cardTiming", null)?.let { runCatching { CardTiming.valueOf(it) }.getOrNull() } ?: CardTiming.HARD_ONLY,
    )
}

// ---- JSON 변환 (org.json, 의존성 추가 없이) ----

/** 궤적 점은 cm·0.001 rad로 줄여 쓴다 (Double 전체 자릿수 대비 파일 크기 약 절반, 화면·돌아가는 길 계산엔 차이 없음) */
private fun Pose.toJson() = JSONArray().put(tMs).put(x.round(100.0)).put(y.round(100.0)).put(headingRad.round(1000.0)).put(if (reverse) 1 else 0)
private fun Double.round(scale: Double): Double = if (isFinite()) (this * scale).roundToLong() / scale else 0.0
private fun JSONArray.toPose() = Pose(getLong(0), getDouble(1), getDouble(2), getDouble(3), getInt(4) == 1)

private fun ManeuverSummary.toJson() = JSONObject()
    .put("reverseCount", reverseCount).put("steeringTurns", steeringTurns).put("brakeCount", brakeCount ?: JSONObject.NULL)
    .put("durationSec", durationSec).put("netTurns", netTurns).put("rampTurns", rampTurns)
    .put("shape", shape.name).put("approximate", approximate)
    .put("maxSpeedKmh", maxSpeedKmh ?: JSONObject.NULL)
    .put("switchPoints", JSONArray(switchPoints.map { JSONObject().put("i", it.index).put("t", it.tMs).put("p", it.pose.toJson()).put("r", it.toReverse) }))

private fun JSONObject.toSummary() = ManeuverSummary(
    reverseCount = getInt("reverseCount"), steeringTurns = getInt("steeringTurns"),
    brakeCount = if (isNull("brakeCount")) null else getInt("brakeCount"),
    durationSec = getInt("durationSec"), netTurns = getDouble("netTurns"), rampTurns = getDouble("rampTurns"),
    switchPoints = getJSONArray("switchPoints").let { a ->
        (0 until a.length()).map { a.getJSONObject(it).let { o -> SwitchPoint(o.getInt("i"), o.getLong("t"), o.getJSONArray("p").toPose(), o.getBoolean("r")) } }
    },
    shape = runCatching { ParkingShape.valueOf(getString("shape")) }.getOrDefault(ParkingShape.UNKNOWN),
    approximate = getBoolean("approximate"),
    maxSpeedKmh = if (has("maxSpeedKmh") && !isNull("maxSpeedKmh")) getDouble("maxSpeedKmh") else null,
)

private fun ParkingRecord.toJson() = JSONObject()
    .put("id", id).put("lotId", lotId ?: JSONObject.NULL).put("lotName", lotName)
    .put("floor", floor ?: JSONObject.NULL).put("zone", zone ?: JSONObject.NULL).put("number", number ?: JSONObject.NULL)
    .put("note", note ?: JSONObject.NULL).put("parkedAtMs", parkedAtMs)
    .put("summary", summary?.toJson() ?: JSONObject.NULL)
    .put("trajectory", JSONArray(trajectory.map { it.toJson() }))

private fun JSONObject.optStr(k: String) = if (isNull(k)) null else optString(k)

private fun JSONObject.toRecord() = ParkingRecord(
    id = getString("id"), lotId = optStr("lotId"), lotName = getString("lotName"),
    floor = optStr("floor"), zone = optStr("zone"), number = optStr("number"), note = optStr("note"),
    parkedAtMs = getLong("parkedAtMs"),
    summary = if (isNull("summary")) null else getJSONObject("summary").toSummary(),
    trajectory = getJSONArray("trajectory").let { a -> (0 until a.length()).map { a.getJSONArray(it).toPose() } },
)

/**
 * 예시 기록(DemoSeed)을 이미 넣었는지 — 첫 실행 한 번만 넣고, '기록 모두 지우기' 뒤에는 다시 넣지 않게.
 * 별도 파일(shared_prefs/demo.xml): 시뮬레이션 루틴이 앱 데이터를 지운 뒤 run-as 로 seeded=true 를 먼저 써서 빈 상태로 시작한다
 */
class DemoFlags(context: Context) {
    private val prefs = context.getSharedPreferences("demo", Context.MODE_PRIVATE)
    var seeded: Boolean
        get() = prefs.getBoolean("seeded", false)
        set(v) { prefs.edit().putBoolean("seeded", v).apply() }
}
