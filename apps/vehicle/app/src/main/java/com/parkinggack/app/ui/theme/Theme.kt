package com.parkinggack.app.ui.theme

import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf

val LocalParkingColors = staticCompositionLocalOf { DarkParkingColors }
val LocalParkingType = staticCompositionLocalOf { DefaultParkingType }

/**
 * 주차각 테마. 차 화면 기본은 다크, 낮 테마는 라이트 (AAOS NIGHT_MODE 신호로 전환).
 * Material3 컴포넌트를 쓰더라도 같은 색이 나오도록 colorScheme도 토큰으로 맞춘다.
 */
@Composable
fun ParkingTheme(dark: Boolean = true, content: @Composable () -> Unit) {
    val c = if (dark) DarkParkingColors else LightParkingColors
    val type = DefaultParkingType
    val scheme = if (dark) {
        darkColorScheme(
            primary = c.inverse, onPrimary = c.onInverse,
            secondary = c.lineStrong, onSecondary = c.surface,
            background = c.surface, onBackground = c.ink,
            surface = c.surface, onSurface = c.ink,
            surfaceVariant = c.surfaceRaised, onSurfaceVariant = c.inkMuted,
            outline = c.lineStrong, outlineVariant = c.line,
        )
    } else {
        lightColorScheme(
            primary = c.inverse, onPrimary = c.onInverse,
            secondary = c.lineStrong, onSecondary = c.surface,
            background = c.surface, onBackground = c.ink,
            surface = c.surface, onSurface = c.ink,
            surfaceVariant = c.surfaceRaised, onSurfaceVariant = c.inkMuted,
            outline = c.lineStrong, outlineVariant = c.line,
        )
    }
    MaterialTheme(colorScheme = scheme) {
        CompositionLocalProvider(
            LocalParkingColors provides c,
            LocalParkingType provides type,
            LocalContentColor provides c.ink,
            LocalTextStyle provides type.body,
            content = content,
        )
    }
}

/** `ParkingTheme.colors.ink`, `ParkingTheme.type.title`, `ParkingTheme.dimens.space4` */
object ParkingTheme {
    val colors: ParkingColors
        @Composable @ReadOnlyComposable get() = LocalParkingColors.current
    val type: ParkingType
        @Composable @ReadOnlyComposable get() = LocalParkingType.current
    val dimens: ParkingDimens get() = ParkingDimens
}
