package com.parkinggack.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/**
 * 제때 디자인 토큰 (docs/design/tokens-jettae.json). 따뜻한 회색 단색.
 * 상태는 색이 아니라 채움·굵기·단어로 구분한다 — 빨강·초록 상태색, 그라데이션, 그림자 없음.
 */
@Immutable
data class ParkingColors(
    /** 화면 바탕 */
    val surface: Color,
    /** 카드·목록·선택지 바탕 */
    val surfaceRaised: Color,
    /** 장식용 구분선 1px */
    val line: Color,
    /** 보조 버튼·칩 테두리, 점선 */
    val lineStrong: Color,
    /** 진행 막대 빈 트랙 */
    val track: Color,
    /** 본문, 큰 숫자, 채움 */
    val ink: Color,
    /** 보조 문장 */
    val inkMuted: Color,
    /** 주 버튼, 선택된 선택지 */
    val inverse: Color,
    /** inverse 위 글자·아이콘 */
    val onInverse: Color,
    /** 빗금·히트맵 진한 단계 */
    val hatchA: Color,
    /** 빗금·히트맵 옅은 단계 */
    val hatchB: Color,
    /** 내비 지도·시스템 화면 자리 표시 (시안의 .hatch 바탕) */
    val placeholder: Color,
    /** 화면 테두리 띠: 왼쪽 아이콘 메뉴, OS 시스템 영역 (시안 #161616) */
    val chrome: Color,
    val isDark: Boolean,
)

val DarkParkingColors = ParkingColors(
    surface = Color(0xFF1E1E1E),
    surfaceRaised = Color(0xFF2A2A28),
    line = Color(0xFF3A3936),
    lineStrong = Color(0xFF8A8780),
    track = Color(0xFF4A4944),
    ink = Color(0xFFF4F3EF),
    inkMuted = Color(0xFFB5B3AD),
    inverse = Color(0xFFF4F3EF),
    onInverse = Color(0xFF1E1E1E),
    hatchA = Color(0xFF6B6964),
    hatchB = Color(0xFF3E3D3A),
    placeholder = Color(0xFF242423),
    chrome = Color(0xFF161616),
    isDark = true,
)

val LightParkingColors = ParkingColors(
    surface = Color(0xFFF4F3EF),
    surfaceRaised = Color(0xFFFFFFFF),
    line = Color(0xFFD6D3CB),
    lineStrong = Color(0xFF8A8780),
    track = Color(0xFFD6D3CB),
    ink = Color(0xFF1E1E1E),
    inkMuted = Color(0xFF5F5D57),
    inverse = Color(0xFF1E1E1E),
    onInverse = Color(0xFFFFFFFF),
    hatchA = Color(0xFFC9C6BD),
    hatchB = Color(0xFFE6E3DC),
    placeholder = Color(0xFFEBE9E3),
    chrome = Color(0xFFE6E3DC),
    isDark = false,
)
