package com.parkinggack.app.data

import com.parkinggack.app.model.Difficulty
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.model.ParkingLot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** 공공데이터 → 요금 문구 · 시드 짝 찾기. 아래 값은 테스트용으로 만든 것 (실제 주차장 값 아님) */
class PublicParkingTest {

    /** 공공데이터에 실제로 있는 공영주차장 (206-2-000015). 앱 시드 목록은 서버와 맞춰 두어 여기서만 쓴다 */
    private val pangyoPublic = ParkingLot(
        id = "pangyo-public", name = "판교공영주차장", location = LatLng(37.393624, 127.110748),
        difficulty = Difficulty(2.9), tags = emptyList(), sampleCount = 41, floors = listOf("1F"),
    )

    private fun lot(
        name: String = "테스트 공영주차장",
        at: LatLng = LatLng(37.3901, 127.1165),
        feeKind: String? = "유료",
        baseMinutes: Int? = 30, baseFee: Int? = 1000,
        extraMinutes: Int? = 10, extraFee: Int? = 500,
        dayPass: Int? = null,
    ) = PublicLot(
        id = "T-1", name = name, category = "공영", type = "노외", location = at, spaces = 1200,
        feeKind = feeKind, baseMinutes = baseMinutes, baseFee = baseFee, extraMinutes = extraMinutes, extraFee = extraFee,
        dayPassFee = dayPass, weekdayOpen = "09:00", weekdayClose = "21:00", referenceDate = "2026-06-30",
    )

    @Test fun paidLotShowsBaseAndExtra() {
        assertEquals("기본 30분 1,000원 · 추가 10분당 500원", PublicParking.feeText(lot()))
    }

    @Test fun freeBaseThenPaid() {
        assertEquals("기본 30분 무료 · 추가 10분당 500원", PublicParking.feeText(lot(baseFee = 0)))
    }

    @Test fun freeLot() {
        assertEquals("무료", PublicParking.feeText(lot(feeKind = "무료", baseFee = null, extraFee = null)))
    }

    @Test fun unknownFeeIsNotInvented() {
        assertNull(PublicParking.feeText(lot(baseMinutes = null, baseFee = null, extraMinutes = null, extraFee = null)))
        assertNull(PublicParking.feeText(lot(baseFee = 0, extraFee = 0)))
    }

    @Test fun dayPassWhenOnlyThatIsKnown() {
        assertEquals("1일 10,000원", PublicParking.feeText(lot(baseMinutes = null, baseFee = null, extraMinutes = null, extraFee = null, dayPass = 10000)))
    }

    @Test fun infoLines() {
        assertEquals(listOf("공영 노외 · 1,200면", "평일 09:00–21:00"), PublicParking.infoLines(lot()))
    }

    @Test fun keyTokenSkipsGenericWords() {
        assertEquals("현대백화점", PublicParking.keyToken("현대백화점 판교점 지하주차장"))
        assertEquals("화랑공원", PublicParking.keyToken("화랑공원 공영주차장"))
        assertEquals("아브뉴프랑", PublicParking.keyToken("아브뉴프랑 판교 주차장"))
    }

    @Test fun matchesByNameNotByDistanceAlone() {
        val seed = pangyoPublic
        val sameName = lot(name = "판교공영주차장", at = LatLng(seed.location.lat + 0.003, seed.location.lng))
        // 이름이 비슷해도 핵심 낱말("판교공영")이 없으면 다른 곳
        val similar = lot(name = "판교제2공영주차장", at = seed.location)
        val nextDoor = lot(name = "옆 건물 주차장", at = seed.location)
        assertEquals(sameName, PublicParking.match(seed, listOf(nextDoor, similar, sameName)))
        assertNull(PublicParking.match(seed, listOf(nextDoor, similar)))
    }

    /** 실제로 받아 둔 공공데이터([PublicLots])로: 판교공영주차장에 요금·출처가 붙고, 부설 주차장엔 지어낸 요금이 없다 */
    @Test fun bundledPublicDataFillsPangyoPublicOnly() {
        val repo = SeedParkingLotRepository(seeds = SeedLots.all + pangyoPublic)
        val pub = repo.cached(pangyoPublic.id)!!
        assertTrue(pub.feeText!!.startsWith("기본 "))
        assertTrue(pub.feeSource!!.startsWith(PublicParking.SOURCE_NAME))
        assertTrue(pub.publicInfo.any { it.startsWith("공영 노외") })
        assertNull(repo.cached(SeedLots.hyundaiDept.id)!!.feeText)
        assertNull(repo.cached(SeedLots.avenueFrance.id)!!.feeText)
    }

    @Test fun enrichFillsFeeAndSourceAndDropsPlaceholders() {
        val seed = SeedLots.newLot // publicInfo 에 "주차면 [수] 면" 자리 문구가 있음
        val p = lot(name = "판교테크원 주차장", at = seed.location)
        val e = PublicParking.enrich(seed, listOf(p))
        assertEquals("기본 30분 1,000원 · 추가 10분당 500원", e.feeText)
        assertEquals("공공데이터포털 전국주차장정보표준데이터 · 2026-06-30 기준", e.feeSource)
        assertTrue(e.publicInfo.none { it.contains('[') })
        assertTrue(e.publicInfo.contains("공영 노외 · 1,200면"))
        assertEquals(seed.location, e.location) // 위치는 바꾸지 않음
    }

    @Test fun repositoryKeepsKeywordLookupAndResidentialFilterWithEnrichedLots() {
        val p = lot(name = "아브뉴프랑 판교", at = SeedLots.avenueFrance.location)
        val repo = SeedParkingLotRepository(publicLots = listOf(p))
        assertEquals("기본 30분 1,000원 · 추가 10분당 500원", repo.cached(SeedLots.avenueFrance.id)?.feeText)
        val dest = repo.matchNow("현대백화점 판교점", null)!!
        val easier = repo.easierNow(dest)
        assertTrue(easier.none { s -> SeedLots.residential.any { it.id == s.lot.id } })
        assertEquals("기본 30분 1,000원 · 추가 10분당 500원", easier.first { it.lot.id == SeedLots.avenueFrance.id }.lot.feeText)
    }
}
