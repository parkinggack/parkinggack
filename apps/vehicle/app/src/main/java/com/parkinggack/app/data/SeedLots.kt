package com.parkinggack.app.data

import com.parkinggack.app.model.Difficulty
import com.parkinggack.app.model.FloorCongestion
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.model.LotStats
import com.parkinggack.app.model.ParkingLot
import com.parkinggack.app.model.ReasonTag
import com.parkinggack.app.model.ZoneScheme

/**
 * 시연용 판교 주차장 데이터 (디자인 시안과 같은 값).
 * 장소 이름은 실제 판교 장소, 별점·대수·통계는 시연용 예시. 좌표는 근사치.
 * 서버(난이도 집계)가 붙으면 RemoteParkingLotRepository로 교체.
 */
object SeedLots {
    private val heat = listOf(
        listOf(0.2, 0.3, 0.5, 0.7, 0.6, 0.4),
        listOf(0.2, 0.3, 0.5, 0.6, 0.6, 0.4),
        listOf(0.2, 0.3, 0.4, 0.6, 0.7, 0.5),
        listOf(0.2, 0.3, 0.5, 0.7, 0.7, 0.5),
        listOf(0.3, 0.4, 0.6, 0.8, 0.9, 0.7),
        listOf(0.4, 0.6, 0.9, 1.0, 0.9, 0.7),
        listOf(0.4, 0.6, 0.8, 0.9, 0.8, 0.5),
    )
    private val hours = listOf("10시", "12시", "14시", "16시", "18시", "20시")

    val hyundaiDept = ParkingLot(
        id = "hyundai-pangyo",
        name = "현대백화점 판교점 지하주차장",
        location = LatLng(37.3926, 127.1121),
        difficulty = Difficulty(4.3),
        tags = listOf(ReasonTag.SPIRAL_RAMP, ReasonTag.MANY_PILLARS),
        statChips = listOf("평균 후진 3.2회"),
        sampleCount = 1_284,
        floors = listOf("1F", "B1", "B2", "B3", "B4", "B5", "B6"),
        stats = LotStats(
            avgReverse = 3.2, overallAvgReverse = 2.0,
            avgRampTurns = 2.5, overallAvgRampTurns = 0.9,
            avgDurationSec = 130, overallAvgDurationSec = 80,
            congestionLabel = "평일 오후",
            floorCongestion = listOf(
                FloorCongestion("B1", 1.0), FloorCongestion("B2", 0.9), FloorCongestion("B3", 0.6),
                FloorCongestion("B4", 0.4), FloorCongestion("B5", 0.3), FloorCongestion("B6", 0.2),
            ),
            congestionSummary = "B1 만차 · B3부터 여유",
            hourlyHeat = heat, hourLabels = hours,
        ),
        publicInfo = listOf("기계식 아님 · 지하 6층까지"),
    )

    val avenueFrance = ParkingLot(
        id = "avenue-france-pangyo",
        name = "아브뉴프랑 판교 주차장",
        location = LatLng(37.3943, 127.1112),
        difficulty = Difficulty(1.8),
        tags = listOf(ReasonTag.FLAT, ReasonTag.SPACIOUS),
        sampleCount = 1_106,
        floors = listOf("1F", "B1", "B2", "B3"),
        zoneScheme = ZoneScheme(description = "기둥 색 + 알파벳 A–H · 기둥 번호 01–12"),
        stats = LotStats(
            avgReverse = 1.1, overallAvgReverse = 2.0,
            avgRampTurns = 0.0, overallAvgRampTurns = 0.9,
            avgDurationSec = 50, overallAvgDurationSec = 80,
            congestionLabel = "평일 오후",
            floorCongestion = listOf(FloorCongestion("B1", 0.7), FloorCongestion("B2", 0.5), FloorCongestion("B3", 0.3)),
            congestionSummary = "B2부터 여유",
            hourlyHeat = heat.map { row -> row.map { it * 0.7 } }, hourLabels = hours,
        ),
    )

    val alphadom = ParkingLot(
        id = "alphadom-tower",
        name = "알파돔타워 주차장",
        location = LatLng(37.3941, 127.1090),
        difficulty = Difficulty(2.4),
        tags = listOf(ReasonTag.SPACIOUS),
        sampleCount = 958,
        floors = listOf("1F", "B1", "B2", "B3", "B4"),
    )

    val hwarangPark = ParkingLot(
        id = "hwarang-park-public",
        name = "화랑공원 공영주차장",
        location = LatLng(37.3901, 127.1165),
        difficulty = Difficulty(2.9),
        tags = listOf(ReasonTag.FLAT),
        sampleCount = 402,
        floors = listOf("1F"),
    )

    val home = ParkingLot(
        id = "baekhyun-5", name = "백현마을 5단지", location = LatLng(37.3869, 127.1047),
        difficulty = Difficulty(1.6), tags = listOf(ReasonTag.SPACIOUS), sampleCount = 377,
        floors = listOf("1F", "B1", "B2"),
    )

    val office = ParkingLot(
        id = "h-square", name = "H스퀘어", location = LatLng(37.4021, 127.1083),
        difficulty = Difficulty(3.9), tags = listOf(ReasonTag.NARROW_AISLE, ReasonTag.SPIRAL_RAMP), statChips = listOf("평균 후진 2.6회"), sampleCount = 871,
        floors = listOf("1F", "B1", "B2", "B3", "B4"),
    )

    /** 데이터 부족 상태 시연용 */
    val newLot = ParkingLot(
        id = "pangyo-new", name = "판교 테크원 주차장", location = LatLng(37.4005, 127.1110),
        difficulty = null, tags = emptyList(), sampleCount = 3,
        floors = listOf("1F", "B1", "B2", "B3", "B4"),
        publicInfo = listOf("기계식 아님 · 지하 4층까지"),
    )

    val uspace = ParkingLot(
        id = "u-space-pangyo", name = "유스페이스", location = LatLng(37.4016, 127.1088),
        difficulty = Difficulty(4.1), tags = listOf(ReasonTag.NARROW_AISLE, ReasonTag.FREQUENT_REVERSE), statChips = listOf("평균 후진 2.9회"),
        sampleCount = 642, floors = listOf("1F", "B1", "B2", "B3", "B4", "B5"),
    )

    val sevenVenture = ParkingLot(
        id = "pangyo-seven-venture", name = "판교세븐벤처밸리", location = LatLng(37.4113, 127.0986),
        difficulty = Difficulty(3.6), tags = listOf(ReasonTag.NARROW_AISLE), statChips = listOf("평균 후진 2.4회"),
        sampleCount = 515, floors = listOf("1F", "B1", "B2", "B3", "B4"),
    )

    val botdeul = ParkingLot(
        id = "botdeul-mall", name = "봇들마을 상가", location = LatLng(37.3893, 127.1139),
        difficulty = Difficulty(3.4), tags = listOf(ReasonTag.MANY_PILLARS), statChips = listOf("평균 후진 2.3회"),
        sampleCount = 233, floors = listOf("1F", "B1", "B2"),
    )

    val all = listOf(hyundaiDept, avenueFrance, alphadom, hwarangPark, home, office, newLot, uspace, sevenVenture, botdeul)
    val favorites = listOf(home, office, hyundaiDept)
    /** 아파트·사옥 주차장 (입주민·직원용) — C-03 더 쉬운 곳 추천 후보에서 뺀다 */
    val residential = listOf(home, office)

    /** 목적지 이름 → 주차장 (내비 POI 이름 일부 매칭용 키워드) */
    val destinationKeywords = mapOf(
        "현대백화점" to hyundaiDept,
        "아브뉴프랑" to avenueFrance,
        "알파돔" to alphadom,
        "화랑공원" to hwarangPark,
        "H스퀘어" to office,
        "유스페이스" to uspace,
        "세븐벤처" to sevenVenture,
        "봇들마을" to botdeul,
        "테크원" to newLot,
    )

    /** 추천 문구 (C-03) */
    val pitches = mapOf(
        avenueFrance.id to "훨씬 넓어요",
        alphadom.id to "자리 넉넉해요",
        hwarangPark.id to "평면이라 편해요",
    )
}
