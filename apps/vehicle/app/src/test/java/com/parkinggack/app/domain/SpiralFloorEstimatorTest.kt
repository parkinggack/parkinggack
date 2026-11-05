package com.parkinggack.app.domain

import com.parkinggack.app.model.Confidence
import com.parkinggack.app.model.FloorEstimate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SpiralFloorEstimatorTest {
    private val estimator = SpiralFloorEstimator()
    private val dept = listOf("1F", "B1", "B2", "B3", "B4", "B5")

    private fun est(turns: Double, floors: List<String> = dept, entry: String = "1F", approximate: Boolean = false) =
        estimator.estimate(summaryOf(rampTurns = turns, approximate = approximate), floors, entry)

    @Test fun nearIntegerTurnsAreHigh() {
        assertEquals(FloorEstimate("B2", Confidence.HIGH), est(2.03))
        assertEquals(FloorEstimate("B2", Confidence.HIGH), est(1.85))
        assertEquals(FloorEstimate("B3", Confidence.HIGH), est(3.15))
        assertEquals(FloorEstimate("B1", Confidence.HIGH), est(0.85))
        // 경계값은 포함 (부동소수 표현 오차 무시)
        assertEquals(FloorEstimate("B2", Confidence.HIGH), est(2.2))
        assertEquals(FloorEstimate("B2", Confidence.LOW), est(1.6))
    }

    @Test fun inBetweenTurnsAreMedium() {
        assertEquals(FloorEstimate("B1", Confidence.MEDIUM), est(1.3))
        assertEquals(FloorEstimate("B2", Confidence.MEDIUM), est(1.75))
        assertEquals(FloorEstimate("1F", Confidence.MEDIUM), est(0.3))
    }

    @Test fun halfTurnsAreLow() {
        assertEquals(Confidence.LOW, est(1.5).confidence)
        assertEquals(FloorEstimate("B1", Confidence.LOW), est(1.42))
        assertEquals(FloorEstimate("B2", Confidence.LOW), est(1.58))
        assertEquals(FloorEstimate("1F", Confidence.LOW), est(0.45))
    }

    @Test fun approximateIsAlwaysLow() {
        assertEquals(FloorEstimate("B2", Confidence.LOW), est(2.0, approximate = true))
        assertEquals(FloorEstimate("1F", Confidence.LOW), est(0.0, floors = listOf("1F"), approximate = true))
    }

    @Test fun zeroTurnsOnFlatLotIsHigh() {
        assertEquals(FloorEstimate("1F", Confidence.HIGH), est(0.05, floors = listOf("1F")))
        // 지하 단층 주차장에 그 층으로 진입
        assertEquals(FloorEstimate("B1", Confidence.HIGH), est(0.0, floors = listOf("B1"), entry = "B1"))
    }

    @Test fun zeroTurnsOnMultiFloorLotIsMedium() {
        // 회전 없이도 직선 경사로로 내려갔을 수 있음
        assertEquals(FloorEstimate("1F", Confidence.MEDIUM), est(0.05))
    }

    @Test fun clampsToLowestFloor() {
        assertEquals(FloorEstimate("B2", Confidence.MEDIUM), est(4.0, floors = listOf("1F", "B1", "B2")))
    }

    @Test fun goesUpWhenThereIsNoBasement() {
        // 위→아래가 계약이지만 아래→위로 줘도 높이로 정렬
        assertEquals(FloorEstimate("3F", Confidence.HIGH), est(2.0, floors = listOf("1F", "2F", "3F", "4F")))
        assertEquals(FloorEstimate("4F", Confidence.MEDIUM), est(5.0, floors = listOf("4F", "3F", "2F", "1F")))
    }

    @Test fun emptyFloorsAssumesSixBasements() {
        assertEquals(FloorEstimate("B3", Confidence.HIGH), est(3.0, floors = emptyList()))
        assertEquals(FloorEstimate("B6", Confidence.MEDIUM), est(8.0, floors = emptyList()))
        assertEquals(FloorEstimate("1F", Confidence.MEDIUM), est(0.0, floors = emptyList()))
    }

    @Test fun entryFloorMissingFromBasementOnlyList() {
        // 지상 입구에서 바로 지하로: 한 바퀴 → 목록 맨 위 B1
        assertEquals(FloorEstimate("B1", Confidence.HIGH), est(1.0, floors = listOf("B1", "B2", "B3")))
        assertEquals(FloorEstimate("1F", Confidence.MEDIUM), est(0.0, floors = listOf("B1", "B2", "B3")))
    }

    @Test fun entryFromAnotherFloor() {
        assertEquals(FloorEstimate("B3", Confidence.HIGH), est(1.0, floors = listOf("1F", "B1", "B2", "B3"), entry = "B2"))
    }

    @Test fun negativeTurnsAreTreatedAsZero() {
        assertEquals("1F", est(-1.0).floor)
    }

    @Test fun floorNameParsing() {
        assertEquals(-2, SpiralFloorEstimator.level("B2"))
        assertEquals(-10, SpiralFloorEstimator.level("b10"))
        assertEquals(-3, SpiralFloorEstimator.level("지하3층"))
        assertEquals(1, SpiralFloorEstimator.level("1F"))
        assertEquals(2, SpiralFloorEstimator.level("2층"))
        assertEquals(4, SpiralFloorEstimator.level("F4"))
        assertNull(SpiralFloorEstimator.level("옥상"))
        assertEquals(listOf("2F", "1F", "B1", "B2"), SpiralFloorEstimator.orderTopToBottom(listOf("B1", "1F", "B2", "2F")))
        // 해석 못 하는 이름이 섞이면 받은 순서 그대로
        assertEquals(listOf("옥상", "B1", "1F"), SpiralFloorEstimator.orderTopToBottom(listOf("옥상", "B1", "1F")))
    }
}
