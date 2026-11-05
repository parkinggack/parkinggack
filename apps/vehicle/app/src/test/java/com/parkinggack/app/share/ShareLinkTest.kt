package com.parkinggack.app.share

import com.parkinggack.app.domain.Domain
import com.parkinggack.app.domain.sim.ScenarioGenerator
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.session.DriveState
import com.parkinggack.app.session.ParkingSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShareLinkTest {

    private val record = ParkingRecord(
        id = "rec-7f3a9c2e",
        lotId = "avenue-france-pangyo",
        lotName = "아브뉴프랑 판교 주차장",
        floor = "B2",
        zone = "D",
        number = "07",
        note = "엘리베이터 2번 쪽",
        parkedAtMs = 1_793_685_120_000L, // 2026-11-03 14:52 KST
        summary = null,
    )

    private fun payloadOf(url: String) = ShareLink.decode(url.substringAfter('#'))

    /**
     * 폰 웹과 같은 테스트 벡터 — apps/mobile/src/payload.test.ts 의 VECTOR_URL 과 글자 하나까지 같아야 한다.
     * (파이썬 base64.urlsafe_b64encode 로도 따로 확인한 값)
     */
    @Test fun testVectorMatchesTheWebApp() {
        val url = ShareLink.build(
            record,
            hints = listOf("램프를 다 내려와서 곧장", "오른쪽 칸 줄, 약 15m 지점"),
            route = listOf(1, 17, -1),
            base = "https://parkinggack.vercel.app",
        )
        assertEquals(VECTOR_URL, url)
        assertEquals(VECTOR_JSON, payloadOf(url))
    }

    @Test fun baseUrlIsTheDeployedPhoneWeb() {
        assertEquals("https://parkinggack.vercel.app", ShareLink.BASE_URL)
        assertTrue(ShareLink.build(record).startsWith("https://parkinggack.vercel.app/p/3a9c2e#"))
        assertEquals("parkinggack.vercel.app/p/3a9c2e", ShareLink.display(record))
        assertEquals("http://192.168.0.5:5173/p/3a9c2e", ShareLink.build(record, "http://192.168.0.5:5173/").substringBefore('#'))
    }

    @Test fun noHintsWithoutTrajectory() {
        val json = payloadOf(ShareLink.build(record))
        assertEquals(
            "{\"v\":1,\"lot\":\"아브뉴프랑 판교 주차장\",\"f\":\"B2\",\"z\":\"D\",\"n\":\"07\",\"t\":1793685120000,\"m\":\"엘리베이터 2번 쪽\"}",
            json,
        )
    }

    @Test fun emptyZoneAndNumberAndNoNote() {
        val json = payloadOf(ShareLink.build(record.copy(zone = null, number = null, note = null)))
        assertEquals("{\"v\":1,\"lot\":\"아브뉴프랑 판교 주차장\",\"f\":\"B2\",\"z\":\"\",\"n\":\"\",\"t\":1793685120000}", json)
        val url = ShareLink.build(record)
        assertFalse("base64url, 패딩 없음", url.substringAfter('#').any { it == '=' || it == '+' || it == '/' })
    }

    @Test fun hintsComeFromTheRecordedTrajectory() {
        val s = ParkingSession(Domain.integrator, Domain.analyzer, Domain.floorEstimator, Domain.simplifier, Domain.newEntryDetector())
        ScenarioGenerator.mainDemo().samples.forEach { s.onSample(it, null) }
        val result = (s.state.value as DriveState.Parked).result
        val withTrajectory = record.copy(summary = result.summary, trajectory = result.trajectory)

        val json = payloadOf(ShareLink.build(withTrajectory))
        assertTrue(json, json.endsWith(",\"h\":[\"램프를 다 내려와서 곧장\",\"오른쪽 칸 줄, 약 15m 지점\"],\"r\":[1,17,-1]}"))

        // 궤적이 대략적이면 힌트를 넣지 않음
        val approx = withTrajectory.copy(summary = result.summary.copy(approximate = true))
        assertFalse(payloadOf(ShareLink.build(approx)).contains("\"h\""))
    }

    @Test fun jsonEscapingRoundTrips() {
        val tricky = record.copy(lotName = "\"따옴표\" \\ 주차장\n2관", note = "\u0001탭\t")
        val json = payloadOf(ShareLink.build(tricky))
        assertTrue(json, json.contains("\"lot\":\"\\\"따옴표\\\" \\\\ 주차장\\n2관\""))
        assertTrue(json, json.contains("\"m\":\"\\u0001탭\\t\""))
    }

    @Test fun atMostFourHints() {
        val json = payloadOf(ShareLink.build(record, (1..6).map { "힌트 $it" }, listOf(0, 10, 0)))
        assertTrue(json, json.contains("\"h\":[\"힌트 1\",\"힌트 2\",\"힌트 3\",\"힌트 4\"]"))
    }

    companion object {
        const val VECTOR_JSON = "{\"v\":1,\"lot\":\"아브뉴프랑 판교 주차장\",\"f\":\"B2\",\"z\":\"D\",\"n\":\"07\",\"t\":1793685120000," +
            "\"m\":\"엘리베이터 2번 쪽\",\"h\":[\"램프를 다 내려와서 곧장\",\"오른쪽 칸 줄, 약 15m 지점\"],\"r\":[1,17,-1]}"
        const val VECTOR_URL = "https://parkinggack.vercel.app/p/3a9c2e#" +
            "eyJ2IjoxLCJsb3QiOiLslYTruIzribTtlITrnpEg7YyQ6rWQIOyjvOywqOyepSIsImYiOiJCMiIsInoiOiJEIiwibiI6IjA3IiwidCI6MTc5MzY4NTEyMDAwMCwibSI6IuyXmOumrOuyoOydtO2EsCAy67KIIOyqvSIsImgiOlsi656o7ZSE66W8IOuLpCDrgrTroKTsmYDshJwg6rOn7J6lIiwi7Jik66W47Kq9IOy5uCDspIQsIOyVvSAxNW0g7KeA7KCQIl0sInIiOlsxLDE3LC0xXX0"
    }
}
