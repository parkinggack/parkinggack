package com.parkinggack.app.net

import com.parkinggack.app.data.Outbox
import com.parkinggack.app.data.RecordUpload
import com.parkinggack.app.data.RemoteParkingLotRepository
import com.parkinggack.app.data.SeedLots
import com.parkinggack.app.data.VehicleClass
import com.parkinggack.app.data.VehicleSpecs
import com.parkinggack.app.model.DrivingExperience
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.ReasonTag
import com.parkinggack.app.share.ShareLink
import com.parkinggack.app.share.ShareService
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.util.TimeZone

class ServerIntegrationTest {
    private lateinit var server: MockWebServer
    private lateinit var api: ApiClient

    @Before fun setUp() { server = MockWebServer().apply { start() }; api = ApiClient(server.url("/").toString()) }
    @After fun tearDown() { server.shutdown() }

    private fun json(body: String, code: Int = 200) = MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)

    private val hyundaiJson = """
        {"id":"hyundai-pangyo","name":"현대백화점 판교점 지하주차장","location":{"lat":37.3926,"lng":127.1121},
         "difficulty":4.3,"tags":["SPIRAL_RAMP","MANY_PILLARS","NOT_A_TAG"],"statChips":["평균 후진 3.2회"],"sampleCount":142,"ratingCount":3,
         "floors":["1F","B1","B2"],"zoneScheme":{"zones":["A","B"],"numbers":["01","02"],"description":null},
         "publicInfo":[],"feeText":null,"updatedAt":"2026-11-03T00:00:00Z","futureField":1}
    """.trimIndent()

    @Test fun matchSendsQueryAndMapsLot() = runBlocking {
        server.enqueue(json("""{"lot":$hyundaiJson,"matchedBy":"name"}"""))
        val repo = RemoteParkingLotRepository(api)
        val lot = repo.match("현대백화점 판교점", LatLng(37.39, 127.11))!!
        val req = server.takeRequest()
        assertEquals("/v1/lots/match", req.requestUrl!!.encodedPath)
        assertEquals("현대백화점 판교점", req.requestUrl!!.queryParameter("name"))
        assertEquals(4.3, lot.difficulty!!.score, 1e-9)
        assertEquals(listOf(ReasonTag.SPIRAL_RAMP, ReasonTag.MANY_PILLARS), lot.tags) // 모르는 태그는 버림
        assertEquals(3, lot.ratingCount)
        assertEquals(true, repo.lastOnline)
        assertEquals(lot, repo.cached("hyundai-pangyo")) // 캐시됨
    }

    @Test fun matchNullFromServerMeansNoCard() = runBlocking {
        server.enqueue(json("""{"lot":null,"matchedBy":null}"""))
        assertNull(RemoteParkingLotRepository(api).match("어딘가", null))
    }

    @Test fun offlineFallsBackToSeed() = runBlocking {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        val repo = RemoteParkingLotRepository(api)
        val lot = repo.match("현대백화점 판교점", null)
        assertEquals(SeedLots.hyundaiDept.id, lot!!.id)
        assertEquals(false, repo.lastOnline)
    }

    @Test fun serverErrorOnEasierFallsBackToSeed() = runBlocking {
        server.enqueue(json("""{"error":{"code":"internal","message":"x"}}""", 500))
        val list = RemoteParkingLotRepository(api).easier(SeedLots.hyundaiDept)
        assertEquals(SeedLots.avenueFrance.id, list.first().lot.id)
    }

    @Test fun detailKeepsStatsAndUpdatesCache() = runBlocking {
        val stats = """"stats":{"avgReverse":3.2,"overallAvgReverse":1.4,"avgRampTurns":2.5,"overallAvgRampTurns":0.8,"avgDurationSec":130,"overallAvgDurationSec":65,
            "congestionLabel":"평일 오후","floorCongestion":[{"floor":"B1","occupancy":1.0}],"congestionSummary":"B1 만차","hourlyHeat":[[0.1,0.2]],"hourLabels":["10시","12시"]}"""
        server.enqueue(json("""{"lot":${hyundaiJson.dropLast(1)},$stats}}"""))
        val repo = RemoteParkingLotRepository(api)
        val d = repo.detail("hyundai-pangyo")!!
        assertEquals(130, d.stats!!.avgDurationSec)
        assertEquals("B1 만차", d.stats!!.congestionSummary)
        repo.applyScore("hyundai-pangyo", 4.1, 143, 4)
        val c = repo.cached("hyundai-pangyo")!!
        assertEquals(4.1, c.difficulty!!.score, 1e-9); assertEquals(143, c.sampleCount); assertNotNull(c.stats)
    }

    @Test fun ratingResponseWithoutSampleCountKeepsCachedCount() = runBlocking {
        server.enqueue(json("""{"lot":$hyundaiJson}"""))
        val repo = RemoteParkingLotRepository(api)
        val before = repo.detail("hyundai-pangyo")!!.sampleCount
        // 서버 RatingResponse 는 {lot:{id, difficulty, ratingCount}} — sampleCount 없음
        server.enqueue(json("""{"lot":{"id":"hyundai-pangyo","difficulty":4.3,"ratingCount":32}}"""))
        val box = Outbox(File.createTempFile("outbox", ".json").apply { delete() }, api)
        box.enqueueRating("hyundai-pangyo", RatingRequest("r-1", 4))
        box.flush(onScore = { repo.applyScore(it.id, it.difficulty, it.sampleCount, it.ratingCount) })
        val c = repo.cached("hyundai-pangyo")!!
        assertEquals(before, c.sampleCount)
        assertEquals(32, c.ratingCount)
        assertEquals(4.3, c.difficulty!!.score, 1e-9)
    }

    @Test fun outboxSendsRecordAndKeepsItWhenOffline() = runBlocking {
        val file = File.createTempFile("outbox", ".json").apply { delete() }
        val box = Outbox(file, api)
        box.enqueueRecord(sampleDto())
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        assertEquals(0, box.flush())
        assertEquals(1, box.size)
        assertEquals(1, Outbox(file, api).size) // 파일에 남아 있음 (앱 재시작 후에도)

        server.enqueue(json("""{"accepted":true,"duplicate":false,"lot":{"id":"avenue-france-pangyo","difficulty":1.8,"sampleCount":88}}""", 202))
        var score: LotScoreDto? = null
        assertEquals(1, box.flush(onScore = { score = it }))
        assertEquals(0, box.size)
        assertEquals(88, score!!.sampleCount)
        server.takeRequest() // 끊긴 요청
        val body = server.takeRequest().body.readUtf8()
        assertTrue(body.contains("\"clientRecordId\":\"rec-1\""))
        assertTrue(body.contains("\"vehicleClass\":\"LARGE\""))
        assertFalse("좌표는 보내지 않음", body.contains("lat"))
    }

    @Test fun outboxDropsPermanentlyRejectedItems() = runBlocking {
        val box = Outbox(null, api)
        box.enqueueRating("nope", RatingRequest("r1", 3))
        server.enqueue(json("""{"error":{"code":"not_found","message":""}}""", 404))
        assertEquals(1, box.flush()); assertEquals(0, box.size)
    }

    @Test fun outboxRetriesOnRateLimit() = runBlocking {
        val box = Outbox(null, api)
        box.enqueueRating("hyundai-pangyo", RatingRequest("r1", 5))
        server.enqueue(json("""{"error":{"code":"rate_limited","message":""}}""", 429))
        assertEquals(0, box.flush()); assertEquals(1, box.size)
    }

    // ---- docs/sim-findings.md 2-5: 오프라인은 시도 횟수로 세지 않는다 · 토큰 없는 'parking'이 뒤를 막지 않는다 ----

    @Test fun offlineFailuresDoNotUseUpAttempts() = runBlocking {
        val file = File.createTempFile("outbox", ".json").apply { delete() }
        val box = Outbox(file, api)
        box.enqueueRecord(sampleDto())
        repeat(Outbox.MAX_ATTEMPTS + 5) {
            server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
            assertEquals(0, box.flush())
        }
        assertEquals("약 50분 오프라인이어도 버리지 않음", 1, box.size)
        assertEquals("파일에도 남아 있음", 1, Outbox(file, api).size)
        // 서버에 닿았는데 5xx 면 센다 → 결국 버림
        repeat(Outbox.MAX_ATTEMPTS) { server.enqueue(json("""{"error":{"code":"internal","message":""}}""", 503)); box.flush() }
        assertEquals(0, box.size)
    }

    @Test fun parkingWithoutTokenDoesNotBlockRecordsBehindIt() = runBlocking {
        val box = Outbox(null, api, deviceToken = { null })
        box.enqueueParking("p-1", com.parkinggack.app.data.MyParkingSync.input(record()))
        box.enqueueRecord(sampleDto())
        server.enqueue(json("""{"accepted":true,"duplicate":false,"lot":{"id":"avenue-france-pangyo","difficulty":1.8,"sampleCount":88}}""", 202))
        assertEquals(1, box.flush())
        assertEquals("parking 은 토큰이 생길 때까지 남김", 1, box.size)
        assertEquals("/v1/records", server.takeRequest().path)
    }

    // ---- 2-1·3-5: 같이 쓰는 설정 · 주차왕 그만두기 · 폰 연결 끊기 ----

    @Test fun settingsLeaveAndUnlinkCalls() = runBlocking {
        server.enqueue(json("""{"settings":{"shareAnonymous":true,"experience":"Y1_3"}}"""))
        val r = api.patchSettings("tok", SettingsPatchDto(shareAnonymous = true, experience = "Y1_3"))
        assertEquals("Y1_3", (r as ApiResult.Ok).value.settings.experience)
        val req = server.takeRequest()
        assertEquals("PATCH", req.method); assertEquals("/v1/me/settings", req.path)
        assertEquals("Device tok", req.getHeader("Authorization"))
        assertEquals("""{"shareAnonymous":true,"experience":"Y1_3"}""", req.body.readUtf8())

        server.enqueue(MockResponse().setResponseCode(204))
        assertTrue(api.leaveKing("tok") is ApiResult.Ok)
        server.takeRequest().let { assertEquals("DELETE", it.method); assertEquals("/v1/me/king", it.path) }

        server.enqueue(MockResponse().setResponseCode(204))
        assertTrue(api.unlinkPhones("tok") is ApiResult.Ok)
        server.takeRequest().let { assertEquals("DELETE", it.method); assertEquals("/v1/me", it.path) }

        server.enqueue(json("""{"error":{"code":"unauthorized","message":""}}""", 401))
        assertEquals(401, (api.leaveKing("bad") as ApiResult.Http).status)
    }

    @Test fun demoRecordsGetNoServerShortLink() = runBlocking {
        // 2-4: 시연·예시 기록은 운영 서버에 공유 링크를 만들지 않는다
        val svc = ShareService(api, "https://parkinggack.vercel.app")
        assertNull(svc.shorten(record().copy(id = ParkingRecord.DEMO_ID_PREFIX + "x")))
        assertNull(svc.shorten(record().copy(id = ParkingRecord.SEED_ID_PREFIX + "x")))
        assertEquals(0, server.requestCount)
    }

    @Test fun shareServiceUsesShortLinkOrFallsBack() = runBlocking {
        val svc = ShareService(api, "https://parkinggack.vercel.app")
        server.enqueue(json("""{"code":"k3x9qa","url":"https://parkinggack.vercel.app/s/k3x9qa","expiresAt":"2026-11-05T00:00:00Z"}""", 201))
        val short = svc.shorten(record())!!
        assertTrue(short.short); assertEquals("parkinggack.vercel.app/s/k3x9qa", short.display)
        val sent = server.takeRequest().body.readUtf8()
        assertTrue(sent.contains("\"lot\":\"아브뉴프랑 판교 주차장\"")); assertTrue(sent.contains("\"f\":\"B2\""))
        assertFalse("optional 필드는 null 대신 생략 (서버 계약 m?: string)", sent.contains("null"))

        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        assertNull(svc.shorten(record()))
        val off = svc.offline(record())
        assertFalse(off.short); assertTrue(off.url.startsWith("https://parkinggack.vercel.app/p/"))
    }

    @Test fun sharePayloadMatchesFragmentLink() {
        val svc = ShareService(null, "https://x")
        val dto = svc.payload(record())
        val fromServerShape = ApiClient.JSON.encodeToString(SharePayloadDto.serializer(), dto)
        val fragment = ShareLink.payloadJson(record())
        val a = ApiClient.JSON.parseToJsonElement(fromServerShape).jsonObjectWithoutNulls()
        val b = ApiClient.JSON.parseToJsonElement(fragment).jsonObjectWithoutNulls()
        assertEquals(b, a)
    }

    @Test fun recordUploadIsAnonymousAndBucketed() {
        val kst = TimeZone.getTimeZone("Asia/Seoul")
        val dto = RecordUpload.from(record(), VehicleClass.MIDSIZE, DrivingExperience.UNDER_1Y, timeZone = kst)!!
        assertEquals("avenue-france-pangyo", dto.lotId)
        assertEquals(2, dto.parkedWeekday) // 2026-11-03 화요일
        assertEquals(14, dto.parkedHour)
        assertEquals("PERPENDICULAR", dto.shape)
        assertNull(RecordUpload.from(record().copy(lotId = null), VehicleClass.MIDSIZE, DrivingExperience.UNKNOWN))
    }

    @Test fun vehicleSpecsMatchModelNames() {
        assertEquals("그랜저", VehicleSpecs.find("GRANDEUR Hybrid")!!.name)
        assertEquals("아이오닉 5", VehicleSpecs.find("IONIQ 5")!!.name)
        assertEquals("아이오닉 6", VehicleSpecs.find("ioniq6")!!.name)
        assertNull(VehicleSpecs.find("Unknown Car"))
        assertEquals(VehicleClass.LARGE, RecordUpload.classify(VehicleSpecs.find("그랜저")!!))
        assertEquals(VehicleClass.SUV, RecordUpload.classify(VehicleSpecs.find("Palisade")!!))
        assertEquals(VehicleClass.COMPACT, RecordUpload.classify(VehicleSpecs.find("casper")!!))
    }

    // ---------------------------------------------------------------------

    private fun record() = ParkingRecord(
        id = "rec-1", lotId = "avenue-france-pangyo", lotName = "아브뉴프랑 판교 주차장",
        floor = "B2", zone = "D", number = "07", note = null,
        parkedAtMs = 1793685120000L, // 2026-11-03 14:52 KST
        summary = ManeuverSummary(2, 3, 5, 100, -2.0, 2.0, emptyList(), ParkingShape.PERPENDICULAR, false),
    )

    private fun sampleDto() = RecordUpload.from(record(), VehicleClass.LARGE, DrivingExperience.Y3_10)!!

    private fun kotlinx.serialization.json.JsonElement.jsonObjectWithoutNulls() =
        kotlinx.serialization.json.JsonObject((this as kotlinx.serialization.json.JsonObject).filterValues { it !is kotlinx.serialization.json.JsonNull })
}
