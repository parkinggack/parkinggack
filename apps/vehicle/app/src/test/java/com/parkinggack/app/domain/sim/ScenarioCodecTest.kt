package com.parkinggack.app.domain.sim

import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.VehicleSample
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ScenarioCodecTest {

    @Test fun roundTripsEveryScenarioExactly() {
        ScenarioGenerator.all().forEach { sc ->
            val text = ScenarioCodec.encode(sc.samples)
            assertTrue(text.startsWith(ScenarioCodec.HEADER))
            assertEquals(sc.id, sc.samples, ScenarioCodec.decode(text, strict = true))
        }
    }

    @Test fun roundTripsAllGearsAndUnknownBrake() {
        val samples = listOf(
            VehicleSample(0, 0f, 0f, Gear.PARK, null),
            VehicleSample(100, 1.25f, -540.5f, Gear.REVERSE, true),
            VehicleSample(200, 0.000123f, 12.75f, Gear.NEUTRAL, false),
            VehicleSample(300, 33.3333f, 1e-3f, Gear.DRIVE, null),
            VehicleSample(1_700_000_000_000, 2f, 3f, Gear.UNKNOWN, true),
        )
        assertEquals(samples, ScenarioCodec.decode(ScenarioCodec.encode(samples, header = false), strict = true))
    }

    @Test fun lineFormat() {
        assertEquals("100,1.5,-12.25,R,1", ScenarioCodec.encodeLine(VehicleSample(100, 1.5f, -12.25f, Gear.REVERSE, true)))
        assertEquals("0,0.0,0.0,P,", ScenarioCodec.encodeLine(VehicleSample(0, 0f, 0f, Gear.PARK, null)))
    }

    @Test fun decodesLenientInput() {
        val text = "# 주석\r\n\r\n 0 , 1.0 , 2.0 , drive , true \r\n100,1.0,2.0,REVERSE\r\n이상한 줄\n200,1.0,2.0,D,0\n300,1."
        val samples = ScenarioCodec.decode(text)
        assertEquals(3, samples.size)
        assertEquals(Gear.DRIVE, samples[0].gear)
        assertEquals(true, samples[0].brakePressed)
        assertEquals(Gear.REVERSE, samples[1].gear)
        assertNull(samples[1].brakePressed) // brake 칸 없음 → 모름
        assertEquals(false, samples[2].brakePressed)
    }

    @Test(expected = IllegalArgumentException::class)
    fun strictModeRejectsMalformedLines() {
        ScenarioCodec.decode("0,1.0,2.0,D,1\n100,abc,2.0,D,1", strict = true)
    }

    @Test fun commentsAndBlanksDecodeToNull() {
        assertNull(ScenarioCodec.decodeLine("   "))
        assertNull(ScenarioCodec.decodeLine("# t,speed"))
    }
}
