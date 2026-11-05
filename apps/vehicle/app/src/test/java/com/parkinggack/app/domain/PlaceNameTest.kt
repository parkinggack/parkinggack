package com.parkinggack.app.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlaceNameTest {
    @Test fun roadAddressKeepsRoadAndNumber() {
        assertEquals("판교역로146번길 20", PlaceName.fromAddress("경기도 성남시 분당구 판교역로146번길 20"))
    }

    @Test fun lotAddressKeepsTown() {
        assertEquals("백현동 541", PlaceName.fromAddress("경기도 성남시 분당구 백현동 541"))
    }

    @Test fun spacedNumberedStreetKeepsRoadName() {
        assertEquals("판교역로 146번길 20", PlaceName.fromAddress("경기 성남시 분당구 판교역로 146번길 20"))
    }

    @Test fun unknownShapeFallsBackToLastTwoWords() {
        assertEquals("Pangyo 20", PlaceName.fromAddress("Seongnam Pangyo 20"))
    }

    @Test fun shortNaviAddressStaysWhole() {
        assertEquals("수정구 시흥동", PlaceName.fromAddress("수정구 시흥동"))
    }

    @Test fun blankIsNull() {
        assertNull(PlaceName.fromAddress(null))
        assertNull(PlaceName.fromAddress("   "))
    }

    @Test fun longNamesAreCut() {
        val n = PlaceName.fromAddress("서울 중구 아주아주아주아주아주아주아주긴이름로 12345678901234")!!
        assertEquals(true, n.length <= 24)
    }
}
