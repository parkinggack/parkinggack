package com.parkinggack.app.net

import kotlinx.serialization.Serializable

/*
 * 서버 API v1 DTO — packages/api-types/index.ts 와 1:1. 필드 이름을 바꾸면 양쪽을 같이 고칠 것.
 * 모르는 필드는 무시(Json { ignoreUnknownKeys = true })하므로 서버가 필드를 추가해도 안전하다.
 */

@Serializable data class LatLngDto(val lat: Double, val lng: Double)

@Serializable data class ZoneSchemeDto(
    val zones: List<String> = emptyList(),
    val numbers: List<String> = emptyList(),
    val description: String? = null,
)

@Serializable data class FloorCongestionDto(val floor: String, val occupancy: Double)

@Serializable data class LotStatsDto(
    val avgReverse: Double,
    val overallAvgReverse: Double,
    val avgRampTurns: Double,
    val overallAvgRampTurns: Double,
    val avgDurationSec: Int,
    val overallAvgDurationSec: Int,
    val congestionLabel: String = "",
    val floorCongestion: List<FloorCongestionDto> = emptyList(),
    val congestionSummary: String = "",
    val hourlyHeat: List<List<Double>> = emptyList(),
    val hourLabels: List<String> = emptyList(),
)

@Serializable data class ParkingLotDto(
    val id: String,
    val name: String,
    val location: LatLngDto,
    val address: String? = null,
    val difficulty: Double? = null,
    val tags: List<String> = emptyList(),
    val statChips: List<String> = emptyList(),
    val sampleCount: Int = 0,
    val ratingCount: Int = 0,
    val floors: List<String> = emptyList(),
    val zoneScheme: ZoneSchemeDto = ZoneSchemeDto(),
    val publicInfo: List<String> = emptyList(),
    val feeText: String? = null,
    val updatedAt: String? = null,
    /** 상세 응답에만 */
    val stats: LotStatsDto? = null,
    /** 목록 응답(좌표 검색)에만 */
    val distanceM: Double? = null,
)

@Serializable data class ListLotsResponse(val lots: List<ParkingLotDto>)
@Serializable data class MatchLotResponse(val lot: ParkingLotDto? = null, val matchedBy: String? = null)
@Serializable data class LotDetailResponse(val lot: ParkingLotDto)

@Serializable data class LotSuggestionDto(val lot: ParkingLotDto, val walkMinutes: Int, val distanceM: Double = 0.0, val pitch: String = "")
@Serializable data class EasierLotsResponse(val suggestions: List<LotSuggestionDto>)

@Serializable data class AnonymousRecordDto(
    val clientRecordId: String,
    val lotId: String,
    val floor: String?,
    val reverseCount: Int,
    val steeringTurns: Int,
    val brakeCount: Int?,
    val durationSec: Int,
    val rampTurns: Double,
    val shape: String,
    val approximate: Boolean,
    val vehicleClass: String,
    val experience: String,
    val parkedHour: Int,
    val parkedWeekday: Int,
)

/**
 * 기록·별점 응답의 새 점수. 별점 응답(RatingResponse)에는 sampleCount 가 없다 → 없으면 null (0으로 채우면
 * 캐시가 "기록 0대"로 덮여 C-08이 점수를 숨기고 "아직 기록이 적어요 (0대)"를 띄웠다 — 2026-11-04 시뮬레이션 루틴 12)
 */
@Serializable data class LotScoreDto(val id: String, val difficulty: Double? = null, val sampleCount: Int? = null, val ratingCount: Int? = null)
@Serializable data class RecordAcceptedResponse(val accepted: Boolean, val duplicate: Boolean = false, val lot: LotScoreDto)

@Serializable data class RatingRequest(val clientRatingId: String, val stars: Int)
@Serializable data class RatingResponse(val lot: LotScoreDto)

/** apps/mobile/src/payload.ts Parking 과 같은 모양 */
@Serializable data class SharePayloadDto(
    val v: Int = 1,
    val lot: String,
    val f: String,
    val z: String,
    val n: String,
    val t: Long,
    val m: String? = null,
    val h: List<String>? = null,
    val r: List<Int>? = null,
)
@Serializable data class CreateShareRequest(val payload: SharePayloadDto)
@Serializable data class CreateShareResponse(val code: String, val url: String, val expiresAt: String)

@Serializable data class ApiErrorBody(val error: ApiErrorDetail)
@Serializable data class ApiErrorDetail(val code: String, val message: String = "")

// ───────────── v1.1 기기·페어링·내 주차 동기화 ─────────────

@Serializable data class RegisterDeviceRequest(val kind: String, val name: String? = null)
@Serializable data class RegisterDeviceResponse(val deviceId: String, val token: String)

@Serializable data class CreatePairingResponse(val code: String, val url: String, val expiresAt: String)
@Serializable data class PairingStatusResponse(val status: String, val phoneName: String? = null)

@Serializable data class ParkingSummaryDto(
    val reverseCount: Int,
    val steeringTurns: Int,
    val durationSec: Int,
    val rampTurns: Double,
    val shape: String,
    val approximate: Boolean,
    /** v1.2 주차장 안 최고 속도 (km/h) */
    val maxSpeedKmh: Double? = null,
)

/** MyParkingInput — PUT /v1/me/parkings/:id. path 점: [tMs, x, y, headingRad, reverse(0|1)] */
@Serializable data class MyParkingInputDto(
    val lotId: String?,
    val lotName: String,
    val floor: String?,
    val zone: String?,
    val number: String?,
    val note: String?,
    val parkedAt: String,
    val summary: ParkingSummaryDto?,
    val hints: List<String>,
    val route: List<Int>?,
    val path: List<List<Double>>,
)
@Serializable data class MyParkingIdDto(val id: String)
@Serializable data class KingRankChangeDto(val rankBefore: Int? = null, val rankAfter: Int? = null)
@Serializable data class MyParkingResponse(val parking: MyParkingIdDto, val king: KingRankChangeDto? = null)

// ───────────── v1.2 주차왕 ─────────────

@Serializable data class KingLeagueDto(val id: String, val region: String, val regionName: String, val experience: String, val label: String, val longLabel: String)
@Serializable data class KingScoreDto(val total: Int, val maneuver: Int, val lotsVisited: Int, val improvement: Int)
@Serializable data class KingWeekDto(val start: String, val end: String)
@Serializable data class KingMeDto(
    val joined: Boolean,
    val nickname: String? = null,
    val league: KingLeagueDto? = null,
    val week: KingWeekDto? = null,
    val rank: Int? = null,
    val total: Int = 0,
    val percentile: Int? = null,
    val score: KingScoreDto? = null,
    val prevWeekRank: Int? = null,
    val nextHint: String? = null,
)
@Serializable data class KingBoardRowDto(val rank: Int, val nickname: String, val score: Int, val isMe: Boolean = false)
@Serializable data class KingBoardDto(val league: KingLeagueDto, val total: Int = 0, val top: List<KingBoardRowDto> = emptyList(), val around: List<KingBoardRowDto> = emptyList(), val demo: Boolean = false)
@Serializable data class KingNicknameDto(val nickname: String)
@Serializable data class KingJoinRequestDto(val nickname: String, val region: String? = null)
@Serializable data class KingJoinResponseDto(val me: KingMeDto)

// ───────── 같이 쓰는 설정 (PATCH /v1/me/settings) ─────────

/** 바꿀 것만. experience = DrivingExperience 이름 ("UNDER_1Y" …) */
@Serializable data class SettingsPatchDto(val shareAnonymous: Boolean? = null, val experience: String? = null)
@Serializable data class SharedSettingsDto(val shareAnonymous: Boolean, val experience: String)
@Serializable data class SharedSettingsResponse(val settings: SharedSettingsDto)
