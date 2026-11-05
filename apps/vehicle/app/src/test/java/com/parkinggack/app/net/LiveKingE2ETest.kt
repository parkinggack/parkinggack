package com.parkinggack.app.net

import com.parkinggack.app.data.InMemoryDeviceTokens
import com.parkinggack.app.data.MyParkingSync
import com.parkinggack.app.data.Outbox
import com.parkinggack.app.domain.Domain
import com.parkinggack.app.domain.sim.ScenarioGenerator
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.session.DriveState
import com.parkinggack.app.session.ParkingSession
import com.parkinggack.app.session.PhoneLink
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.UUID

/**
 * 주차왕 (v1.2) — 차량 앱 코드 그대로 실제 서버와: 기기 등록 → 닉네임 → 참여 → 주차 업로드(등수 변화) → 내 순위·순위판.
 *   PG_SERVER_URL=http://localhost:8787 ./gradlew testDebugUnitTest --tests '*LiveKingE2ETest*'
 * 운영 서버에는 돌리지 말 것 (시험 참여자가 순위판에 생김).
 */
class LiveKingE2ETest {
    private val base: String? = System.getenv("PG_SERVER_URL")

    @Test fun joinParkAndSeeRank() = runBlocking {
        assumeTrue("PG_SERVER_URL not set", !base.isNullOrBlank())
        val api = ApiClient(base!!)
        val device = InMemoryDeviceTokens()
        val token = PhoneLink(api, device, { "그랜저" }).ensureToken()
        assertNotNull(token)

        // 참여 전: 리그 미리보기 + 닉네임
        val before = (api.kingMe(token!!) as ApiResult.Ok).value
        assertEquals(false, before.joined)
        val nick = (api.kingNickname("pangyo") as ApiResult.Ok).value.nickname
        assertTrue(nick, nick.split(' ').size >= 3)

        // 참여
        val joined = api.kingJoin(token, nick)
        assertTrue("join: $joined", joined is ApiResult.Ok)
        assertEquals(true, (joined as ApiResult.Ok).value.me.joined)

        // 시연 주행 → 주차 → 업로드 (maxSpeedKmh 포함) → PUT 응답의 등수
        val s = ParkingSession(Domain.integrator, Domain.analyzer, Domain.floorEstimator, Domain.simplifier, Domain.newEntryDetector())
        ScenarioGenerator.mainDemo().samples.forEach { s.onSample(it, null) }
        val r = (s.state.value as DriveState.Parked).result
        assertTrue("max speed inside lot ${r.summary.maxSpeedKmh}", (r.summary.maxSpeedKmh ?: 99.0) <= 15.0)
        val rec = ParkingRecord(UUID.randomUUID().toString(), "avenue-france-pangyo", "아브뉴프랑 판교 주차장", "B2", "D", "07", null,
            System.currentTimeMillis(), r.summary, r.trajectory)
        val box = Outbox(null, api, deviceToken = { token })
        box.enqueueParking(rec.id, MyParkingSync.input(rec))
        var after: Int? = null
        assertEquals(1, box.flush(onParkingSynced = { _, _, a -> after = a }))
        assertNotNull("PUT 응답에 주차왕 등수", after)

        // 내 순위·순위판
        val me = (api.kingMe(token) as ApiResult.Ok).value
        assertEquals(true, me.joined); assertEquals(after, me.rank)
        assertNotNull(me.score); assertTrue(me.score!!.total in 1..100)
        assertEquals("판교", me.league!!.regionName)
        val board = (api.kingBoard(token) as ApiResult.Ok).value
        assertTrue(board.top.size in 1..5)
        assertTrue("내 줄이 보여야 함", (board.top + board.around).any { it.isMe && it.nickname == nick })
    }
}
