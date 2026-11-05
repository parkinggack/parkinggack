package com.parkinggack.app.ui.theme

import androidx.compose.ui.unit.dp

/** 간격·모서리·크기 토큰 (tokens-jettae.json). 시안 1280×720px ≈ 1280×720dp. */
object ParkingDimens {
    val space1 = 4.dp
    val space2 = 8.dp
    val space3 = 12.dp
    val space4 = 16.dp
    val space6 = 24.dp
    val space8 = 32.dp
    val space10 = 40.dp
    val space16 = 64.dp

    val radiusSm = 8.dp
    val radiusMd = 12.dp
    val radiusLg = 16.dp

    /** 차 화면 버튼 최소 높이 */
    val targetCar = 64.dp
    /** 주요 버튼 높이 */
    val targetPrimary = 76.dp
    val trackHeight = 8.dp
    val marker = 32.dp

    /** 화면 위 앱 머리 (C-01, C-03, C-06 …) */
    val headerHeight = 88.dp
    /** 화면 좌우 기본 여백 */
    val screenPadding = 32.dp

    /** 테두리 두께: 기본 1.5, 강조 2, 선택 2.5 */
    val border = 1.5.dp
    val borderStrong = 2.dp
    val borderSelected = 2.5.dp
}
