package com.parkinggack.app.data

import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.Pose
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

/** docs/sim-findings.md 1-2: 기록 파일이 깨져도·쓰는 중 끊겨도 기록을 잃지 않는다, 메인 스레드에서 읽고 쓰지 않는다 */
class RecordStoreTest {
    private val dir: File = Files.createTempDirectory("records").toFile()
    private val file = File(dir, "records.json")
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @After fun tearDown() { scope.cancel(); dir.deleteRecursively() }

    private fun rec(id: String, at: Long) = ParkingRecord(
        id = id, lotId = null, lotName = "주차장 $id", floor = "B2", zone = null, number = null, parkedAtMs = at,
        summary = ManeuverSummary(1, 2, null, 70, 0.0, 0.0, emptyList(), ParkingShape.PERPENDICULAR, false),
        trajectory = (0 until 50).map { Pose(it * 100L, it * 0.123456789, -it * 0.987654321, 1.23456789, it % 7 == 0) },
    )

    private fun store() = RecordStore(file, scope)

    @Test fun savesInTheBackgroundAndReadsBack() = runBlocking {
        val a = store()
        a.upsert(rec("a", 1_000)); a.upsert(rec("b", 2_000))
        a.awaitIdle()
        val b = store(); b.awaitIdle()
        assertEquals(listOf("b", "a"), b.records.value.map { it.id })
        // 궤적은 cm 단위로 줄여 저장
        assertEquals(0.12, b.records.value.last().trajectory[1].x, 1e-9)
    }

    @Test fun corruptFileIsKeptAsideAndTheBackupIsUsed() = runBlocking {
        val a = store()
        a.upsert(rec("a", 1_000)); a.awaitIdle()
        a.upsert(rec("b", 2_000)); a.awaitIdle() // 이제 .bak = [a]
        // 쓰는 중 전원이 끊긴 것처럼 본 파일을 절반만 남김 (X11) — 앞부분의 온전한 b + .bak 의 a
        file.writeText(file.readText().let { it.substring(0, it.length / 2) })
        val b = store(); b.awaitIdle()
        assertEquals("깨진 파일 앞부분 + .bak", listOf("b", "a"), b.records.value.map { it.id })
        val kept = dir.listFiles()!!.filter { it.name.startsWith("records.json.corrupt-") }
        assertEquals("깨진 파일은 지우지 않고 옮겨 둠", 1, kept.size)
        // 그다음 저장이 예전 기록을 덮어 지우지 않는다
        b.upsert(rec("c", 3_000)); b.awaitIdle()
        val c = store(); c.awaitIdle()
        assertEquals(listOf("c", "b", "a"), c.records.value.map { it.id })
    }

    @Test fun unreadableFrontFallsBackToTheBackupAlone() = runBlocking {
        val a = store()
        a.upsert(rec("a", 1_000)); a.awaitIdle()
        a.upsert(rec("b", 2_000)); a.awaitIdle()
        file.writeText("[{\"id\":\"b\",\"lot") // 첫 기록도 다 안 남음
        val b = store(); b.awaitIdle()
        assertEquals(listOf("a"), b.records.value.map { it.id })
        // 살린 내용은 바로 다시 써 둔다 → 다음 실행도 같음
        val c = store(); c.awaitIdle()
        assertEquals(listOf("a"), c.records.value.map { it.id })
    }

    @Test fun changesMadeBeforeTheFileIsReadAreKept() = runBlocking {
        val a = store()
        a.upsert(rec("old", 1_000)); a.awaitIdle()
        val b = store() // 읽는 중
        b.upsert(rec("new", 2_000))
        b.awaitIdle()
        assertEquals(listOf("new", "old"), b.records.value.map { it.id })
        val c = store(); c.awaitIdle()
        assertEquals(listOf("new", "old"), c.records.value.map { it.id })
    }

    @Test fun leftoverTempFileFromAnInterruptedWriteIsIgnored() = runBlocking {
        val a = store()
        a.upsert(rec("a", 1_000)); a.awaitIdle()
        File(file.path + ".tmp").writeText("[{\"id\":") // rename 전에 끊김
        val b = store(); b.awaitIdle()
        assertEquals(listOf("a"), b.records.value.map { it.id })
        assertTrue(b.ready.value)
    }
}
