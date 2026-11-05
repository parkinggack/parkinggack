package com.parkinggack.app.data

import android.util.Log
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream

/**
 * 통째로 다시 쓰는 JSON 파일을 깨지지 않게 (android 의존 없음 → JVM 테스트).
 *
 * 쓰기: `.tmp`에 다 쓰고 fsync → 지금 파일을 `.bak`으로 → `.tmp`를 본 이름으로 (rename은 원자적).
 * 어느 순간에 전원이 끊겨도 본 파일이나 `.bak` 중 하나는 온전하다 — 차는 시동을 끄면 전원이 그냥 끊긴다.
 * 읽기: 본 파일 → 실패하면 `.bak`. 읽거나 해석하지 못한 본 파일은 지우지 않고 `.corrupt-<시각>`으로 옮겨 둔다
 * (예전엔 해석 실패 = 빈 목록 → 다음 저장이 그 위에 덮어써 기록을 영영 잃었다. docs/sim-findings.md 1-2)
 */
class SafeFile(val file: File) {
    private val tmp = File(file.path + ".tmp")
    private val bak = File(file.path + ".bak")

    fun write(text: String) {
        FileOutputStream(tmp).use { out ->
            out.write(text.toByteArray(Charsets.UTF_8))
            out.flush()
            runCatching { out.fd.sync() }
        }
        if (file.exists() && !file.renameTo(bak)) {
            bak.delete(); file.renameTo(bak)
        }
        if (!tmp.renameTo(file)) {
            // 드물게 rename이 안 되는 파일 시스템 — 그래도 .bak은 남아 있다
            file.delete()
            check(tmp.renameTo(file)) { "rename ${tmp.name} -> ${file.name} failed" }
        }
    }

    /** 마지막 [read]가 깨진 본 파일 대신 `.bak`·[recover]로 살렸는지 — 그렇다면 부르는 쪽이 바로 다시 써 둘 것 */
    var recovered = false
        private set

    /**
     * 본 파일 → `.bak` 순으로 읽어 [parse]. 둘 다 없으면 null.
     * @param recover 본 파일이 깨졌을 때 (깨진 내용, `.bak` 값) → 살린 값. 깨진 파일 앞부분에 온전한 항목이 남아 있으면 `.bak`과 합치는 데 쓴다
     *   (`.bak`은 한 번 전 저장이라, 연달아 저장한 마지막 변경을 잃지 않게)
     */
    fun <T> read(parse: (String) -> T, recover: ((String, T?) -> T?)? = null): T? {
        recovered = false
        var corrupt: String? = null
        if (file.exists()) {
            val text = runCatching { file.readText() }.getOrNull()
            runCatching { parse(text!!) }
                .onSuccess { return it }
                .onFailure { e ->
                    corrupt = text
                    val kept = File(file.path + ".corrupt-" + System.currentTimeMillis())
                    log("${file.name} unreadable (${e.javaClass.simpleName}) → kept as ${kept.name}, trying .bak")
                    if (!file.renameTo(kept)) runCatching { file.copyTo(kept, overwrite = true) }
                }
        }
        val backup = if (bak.exists()) {
            runCatching { parse(bak.readText()) }
                .onFailure { log("${bak.name} unreadable too (${it.javaClass.simpleName})") }
                .getOrNull()
        } else null
        val c = corrupt
        val result = if (c != null && recover != null) runCatching { recover(c, backup) }.getOrNull() ?: backup else backup
        if (c != null && result != null) { recovered = true; log("${file.name}: restored (${if (backup != null) ".bak" else "no .bak"} + readable part)") }
        return result
    }

    private fun log(msg: String) { runCatching { Log.w(TAG, msg) }.onFailure { println("$TAG: $msg") } }

    private companion object { const val TAG = "SafeFile" }
}

/**
 * 바뀔 때마다 최신 내용만 백그라운드에서 쓴다 (쓰는 사이 여러 번 바뀌면 마지막 것 한 번).
 * 메인 스레드에서 수 MB JSON을 만들고 쓰던 것(5.8초 멈춤·ANR) 대신. [render]는 쓰는 스레드에서 부른다.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class BackgroundWriter(
    scope: CoroutineScope,
    private val target: SafeFile,
    dispatcher: CoroutineDispatcher = Dispatchers.IO.limitedParallelism(1),
    private val render: () -> String,
) {
    private val requested = MutableStateFlow(0L)
    private val written = MutableStateFlow(0L)

    init {
        scope.launch(dispatcher) {
            requested.collect { v ->
                if (v == 0L) return@collect
                runCatching { target.write(render()) }
                    .onFailure { runCatching { Log.w("BackgroundWriter", "write ${target.file.name} failed", it) } }
                written.value = v
            }
        }
    }

    fun request() { requested.update { it + 1 } }

    /** 지금까지 요청한 쓰기가 끝날 때까지 (테스트·종료 직전) */
    suspend fun awaitIdle() { val want = requested.value; written.first { it >= want } }
}
