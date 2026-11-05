package com.parkinggack.app.net

import com.parkinggack.app.data.Outbox
import com.parkinggack.app.data.RecordUpload
import com.parkinggack.app.data.RemoteParkingLotRepository
import com.parkinggack.app.data.VehicleClass
import com.parkinggack.app.domain.Domain
import com.parkinggack.app.domain.sim.ScenarioGenerator
import com.parkinggack.app.model.DrivingExperience
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.session.DriveState
import com.parkinggack.app.session.ParkingSession
import com.parkinggack.app.share.ShareService
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.UUID

/**
 * 실제 서버(apps/server)를 띄워 놓고 차량 앱 코드 그대로 전체 플로우를 돈다.
 *   cd apps/server && npm run dev        # 다른 터미널
 *   PG_SERVER_URL=http://localhost:8787 ./gradlew testDebugUnitTest --tests '*LiveServerE2ETest*'
 * 환경변수가 없으면 건너뜀 (CI·평소 테스트에 영향 없음).
 */
class LiveServerE2ETest {
    private val base: String? = System.getenv("PG_SERVER_URL")

    @Test fun fullFlowAgainstRealServer() = runBlocking {
        assumeTrue("PG_SERVER_URL not set", !base.isNullOrBlank())
        val api = ApiClient(base!!)
        val repo = RemoteParkingLotRepository(api)

        // ① 내비 목적지 → 주차장 매칭 → C-02
        val dest = repo.match("현대백화점 판교점", null)
        assertNotNull("서버가 현대백화점을 찾아야 함", dest)
        assertEquals("hyundai-pangyo", dest!!.id)
        assertTrue("시드 난이도 ★4.3 근처: ${dest.difficulty}", dest.difficulty!!.score in 4.1..4.5)
        assertEquals(true, repo.lastOnline)

        // ② 더 쉬운 곳 → C-03 → 경유지로 아브뉴프랑
        val easier = repo.easier(dest)
        assertTrue(easier.isNotEmpty())
        val via = easier.first()
        assertEquals("avenue-france-pangyo", via.lot.id)
        assertTrue(via.walkMinutes in 1..10)

        // ③ 주행·주차 (시연 시나리오를 실제 세션에 흘림) → C-05 결과
        val session = ParkingSession(Domain.integrator, Domain.analyzer, Domain.floorEstimator, Domain.simplifier, Domain.newEntryDetector())
        session.targetLot = via.lot
        ScenarioGenerator.mainDemo().samples.forEach { session.onSample(it, null) }
        val result = (session.state.value as DriveState.Parked).result
        assertEquals("B2", result.estimate.floor)

        // ④ 저장 → 익명 기록 업로드 → 서버 점수·표본 갱신
        val before = repo.detail(via.lot.id)!!.sampleCount
        val record = ParkingRecord(
            id = UUID.randomUUID().toString(), lotId = via.lot.id, lotName = via.lot.name,
            floor = result.estimate.floor, zone = "D", number = "07", parkedAtMs = System.currentTimeMillis(),
            summary = result.summary, trajectory = result.trajectory,
        )
        val box = Outbox(null, api)
        box.enqueueRecord(RecordUpload.from(record, VehicleClass.LARGE, DrivingExperience.UNDER_1Y)!!)
        var score: LotScoreDto? = null
        assertEquals(1, box.flush(onScore = { score = it }))
        assertEquals(before + 1, score!!.sampleCount)
        // 재전송해도 중복 집계 안 됨
        box.enqueueRecord(RecordUpload.from(record, VehicleClass.LARGE, DrivingExperience.UNDER_1Y)!!)
        box.flush(onScore = { score = it })
        assertEquals(before + 1, score!!.sampleCount)

        // ⑤ C-08 상세 통계 + 별점
        val detail = repo.detail(dest.id)!!
        assertNotNull(detail.stats)
        assertEquals(1.4, detail.stats!!.overallAvgReverse, 0.3)
        box.enqueueRating(dest.id, RatingRequest(UUID.randomUUID().toString(), 5))
        assertEquals(1, box.flush())

        // ⑥ C-07 짧은 링크 → 폰 웹이 읽는 /v1/shares/:code 로 같은 내용이 돌아오는지
        val share = ShareService(api, "https://parkinggack.vercel.app").shorten(record)
        assertNotNull(share); assertTrue(share!!.short)
        val code = share.url.substringAfterLast("/s/")
        val body = OkHttpClient().newCall(Request.Builder().url("${base.trimEnd('/')}/v1/shares/$code").build()).execute().use { it.body!!.string() }
        assertTrue(body, body.contains("\"lot\":\"아브뉴프랑 판교 주차장\"") && body.contains("\"f\":\"B2\"") && body.contains("\"z\":\"D\""))
    }
}
