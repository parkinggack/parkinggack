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
import com.parkinggack.app.session.PhoneLinkState
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class PairingSyncTest {
    private lateinit var server: MockWebServer
    private lateinit var api: ApiClient

    @Before fun setUp() { server = MockWebServer().apply { start() }; api = ApiClient(server.url("/").toString()) }
    @After fun tearDown() { server.shutdown() }

    private fun json(body: String, code: Int = 200) = MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)

    @Test fun registersDeviceThenPairsUntilClaimed() = runBlocking {
        val device = InMemoryDeviceTokens()
        server.enqueue(json("""{"deviceId":"car-1","token":"tok-car"}""", 201))
        server.enqueue(json("""{"code":"483920","url":"https://w/pair/483920","expiresAt":"2999-01-01T00:00:00Z"}""", 201))
        server.enqueue(json("""{"status":"pending","phoneName":null}"""))
        server.enqueue(json("""{"status":"claimed","phoneName":"갤럭시 S25"}"""))
        val link = PhoneLink(api, device, vehicleName = { "그랜저" }, pollMs = 1)
        assertTrue(link.run())
        assertEquals("tok-car", device.token)
        assertTrue(device.paired)
        assertEquals(PhoneLinkState.Linked("갤럭시 S25"), link.state.value)

        val reg = server.takeRequest()
        assertEquals("/v1/devices", reg.path); assertTrue(reg.body.readUtf8().contains("\"kind\":\"car\""))
        val create = server.takeRequest()
        assertEquals("POST", create.method); assertEquals("/v1/pairings", create.path)
        assertEquals("Device tok-car", create.getHeader("Authorization"))
        assertEquals("/v1/pairings/483920", server.takeRequest().path)
    }

    @Test fun offlineShowsOfflineState() = runBlocking {
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        val link = PhoneLink(api, InMemoryDeviceTokens(), { null }, pollMs = 1)
        assertFalse(link.run())
        assertEquals(PhoneLinkState.Offline, link.state.value)
    }

    @Test fun expiredCodeStops() = runBlocking {
        val device = InMemoryDeviceTokens().apply { token = "t" }
        server.enqueue(json("""{"code":"111222","url":"u","expiresAt":"2999-01-01T00:00:00Z"}""", 201))
        server.enqueue(json("""{"status":"expired","phoneName":null}"""))
        val link = PhoneLink(api, device, { null }, pollMs = 1)
        assertFalse(link.run())
        assertEquals(PhoneLinkState.Expired, link.state.value)
        assertFalse(device.paired)
    }

    @Test fun unknownTokenReRegisters() = runBlocking {
        val device = InMemoryDeviceTokens().apply { token = "stale" }
        server.enqueue(json("""{"error":{"code":"unauthorized","message":""}}""", 401))
        server.enqueue(json("""{"deviceId":"car-2","token":"fresh"}""", 201))
        server.enqueue(json("""{"code":"999000","url":"u","expiresAt":"2999-01-01T00:00:00Z"}""", 201))
        server.enqueue(json("""{"status":"claimed","phoneName":null}"""))
        assertTrue(PhoneLink(api, device, { null }, pollMs = 1).run())
        assertEquals("fresh", device.token)
    }

    @Test fun parkingSyncWaitsForTokenAndReplacesOlderVersion() = runBlocking {
        var token: String? = null
        val box = Outbox(null, api, deviceToken = { token })
        val rec = demoRecord()
        box.enqueueParking(rec.id, MyParkingSync.input(rec))
        box.enqueueParking(rec.id, MyParkingSync.input(rec.copy(zone = "E", number = "03"))) // 층·구역 수정 → 하나로
        assertEquals(1, box.size)
        assertEquals(0, box.flush()) // 토큰 없음 → 남김
        assertEquals(1, box.size)

        token = "tok-car"
        server.enqueue(json("""{"parking":{"id":"${rec.id}"}}"""))
        assertEquals(1, box.flush())
        val req = server.takeRequest()
        assertEquals("PUT", req.method)
        assertEquals("/v1/me/parkings/${rec.id}", req.path)
        assertEquals("Device tok-car", req.getHeader("Authorization"))
        val body = req.body.readUtf8()
        assertTrue(body.contains("\"zone\":\"E\"") && body.contains("\"number\":\"03\""))
        assertTrue(body.contains("\"hints\":[\""))
    }

    @Test fun syncPayloadIsBounded() {
        val input = MyParkingSync.input(demoRecord())
        assertTrue(input.path.size in 2..MyParkingSync.MAX_PATH_POINTS)
        assertTrue(input.path.all { it.size == 5 && (it[4] == 0.0 || it[4] == 1.0) })
        assertTrue(input.path.any { it[4] == 1.0 }) // 후진 구간 있음
        assertTrue(input.parkedAt.endsWith("Z"))
        assertEquals(2, input.summary!!.reverseCount)
        assertTrue(input.hints.size in 1..4)
    }

    private fun demoRecord(): ParkingRecord {
        val s = ParkingSession(Domain.integrator, Domain.analyzer, Domain.floorEstimator, Domain.simplifier, Domain.newEntryDetector())
        ScenarioGenerator.mainDemo().samples.forEach { s.onSample(it, null) }
        val r = (s.state.value as DriveState.Parked).result
        return ParkingRecord("rec-sync-1", "avenue-france-pangyo", "아브뉴프랑 판교 주차장", r.estimate.floor, "D", "07", null,
            1793685120000L, r.summary, r.trajectory)
    }
}
