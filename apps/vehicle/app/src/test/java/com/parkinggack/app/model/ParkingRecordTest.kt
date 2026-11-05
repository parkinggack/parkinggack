package com.parkinggack.app.model

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ParkingRecordTest {
    private fun record(id: String) = ParkingRecord(id, null, "주차 위치", null, null, null, parkedAtMs = 0L, summary = null)

    @Test fun demoAndSeedRecordsStayOnDevice() {
        assertTrue(record(ParkingRecord.DEMO_ID_PREFIX + "1b2c").staysOnDevice)
        assertTrue(record(ParkingRecord.SEED_ID_PREFIX + "1").staysOnDevice)
    }

    @Test fun realDrivesAreSent() {
        assertFalse(record("0f8fad5b-d9cb-469f-a165-70867728950e").staysOnDevice)
    }
}
