package com.parkinggack.app.ui.theme

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import kotlin.math.min

/** 마지막으로 계산한 배율 — 앱 창 밖(내비 위 배너)에서도 같은 크기로 그리려고 */
object DesignScaleState {
    @Volatile var factor: Float = 1f
}

/** 시안(docs/design)의 앱 영역: 1280×720에서 OS 띠 44px를 뺀 크기 */
val DesignWidth = 1280.dp
val DesignHeight = 676.dp

/**
 * 시안 비율 그대로 창 크기에 맞춰 키운다.
 *
 * 시안은 1280×676dp 기준인데, Pleos Connect 에뮬레이터(2560×1440 @160dpi)에서 앱이 받는 창은
 * 런처 오른쪽 칸 1682×1210px다. 그대로 그리면 글자·버튼이 화면에 비해 작고 빈 곳이 많아진다.
 * → 가로를 시안 폭(1280dp)에 맞추는 배율로 density를 키운다 (세로가 모자라면 세로 기준).
 *   1682×1210 창 → ×1.31 → 앱 입장에서는 1280×921dp. 1보다 작게 줄이지는 않는다.
 */
@Composable
fun DesignScale(content: @Composable () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val scale = min(maxWidth / DesignWidth, maxHeight / DesignHeight).coerceAtLeast(1f)
        DesignScaleState.factor = scale
        val base = LocalDensity.current
        CompositionLocalProvider(LocalDensity provides Density(base.density * scale, base.fontScale)) {
            content()
        }
    }
}
