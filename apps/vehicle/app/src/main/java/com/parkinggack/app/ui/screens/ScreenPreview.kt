package com.parkinggack.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.parkinggack.app.ui.theme.ParkingTheme

/** 차 화면 미리보기: 1280×720dp 가로, 다크 기본 */
@Preview(widthDp = 1280, heightDp = 720, name = "차 화면 (다크)")
annotation class CarPreview

@Preview(widthDp = 1280, heightDp = 720, name = "차 화면 (라이트)")
annotation class CarPreviewLight

@Composable
internal fun PreviewFrame(dark: Boolean = true, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalNowMs provides { PreviewData.nowMs }) {
        ParkingTheme(dark = dark) {
            Box(Modifier.fillMaxSize().background(ParkingTheme.colors.surface)) { content() }
        }
    }
}
