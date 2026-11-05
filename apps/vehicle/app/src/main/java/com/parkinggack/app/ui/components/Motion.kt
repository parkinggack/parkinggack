package com.parkinggack.app.ui.components

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/**
 * 주차각 모션 — "살짝 튀어오르며 나온다".
 *
 * 스프링 하나로 통일: 감쇠 0.6 → 목표를 10% 안팎 넘었다가 돌아옴(통통). 0.4초 안팎이면 멈춘다.
 * 차 화면 원칙: 시선을 끌지 않게 짧고 한 번만. 깜빡임·반복 애니메이션 없음. **주행 중에는 모두 끔**([LocalReduceMotion]).
 * 스냅숏·미리보기(LocalInspectionMode)에서는 움직이지 않고 최종 모습으로 그린다 (시안 비교가 흔들리지 않게).
 * 시스템 '애니메이션 끄기'(animator duration scale 0)면 Compose가 바로 끝 상태로 보낸다.
 */
/**
 * 주행 중(CarUxRestrictions)에는 true → 모든 모션을 끈다.
 * Pleos 주행 안전 가이드: 주행 중 시선을 끄는 애니메이션·자동 화면 전환을 줄일 것.
 */
val LocalReduceMotion = staticCompositionLocalOf { false }

object ParkingMotion {
    /** 등장·되돌아오기 */
    val pop: SpringSpec<Float> = spring(dampingRatio = 0.6f, stiffness = 380f)
    /** 누르는 순간 (빠르게, 넘침 없이) */
    val press: SpringSpec<Float> = spring(dampingRatio = 1f, stiffness = 1200f)
    /** 같은 화면 안에서 여러 덩어리가 순서대로 나올 때 간격 */
    const val STAGGER_MS = 60L
}

/**
 * 처음 나타날 때 [fromY]만큼 아래(음수면 위)에서 튀어오르며 [fromScale]에서 1로 커진다.
 * 스프링이 목표를 살짝 넘으므로 제자리보다 조금 더 올라갔다 내려앉는다.
 * @param index 같은 화면에서 몇 번째로 나올지 (0부터, [ParkingMotion.STAGGER_MS] 간격)
 */
fun Modifier.popIn(index: Int = 0, fromY: Dp = 28.dp, fromScale: Float = 0.94f, trigger: Any? = Unit): Modifier = composed {
    if (LocalInspectionMode.current || LocalReduceMotion.current) return@composed this
    val progress = remember { Animatable(0f) }
    // trigger가 바뀌면(예: 온보딩 단계) 다시 튀어오름
    LaunchedEffect(trigger) {
        progress.snapTo(0f)
        if (index > 0) delay(index * ParkingMotion.STAGGER_MS)
        progress.animateTo(1f, ParkingMotion.pop)
    }
    val dy = with(LocalDensity.current) { fromY.toPx() }
    graphicsLayer {
        val p = progress.value
        translationY = (1f - p) * dy
        val s = fromScale + (1f - fromScale) * p
        scaleX = s
        scaleY = s
        alpha = (p * 2.5f).coerceIn(0f, 1f) // 투명도는 넘치지 않게 빨리 1로
    }
}

/** 누르면 [pressedScale]로 살짝 들어갔다가, 떼면 튀어오르며 돌아온다 */
fun Modifier.pressBounce(interactionSource: InteractionSource, pressedScale: Float = 0.95f): Modifier = composed {
    if (LocalInspectionMode.current || LocalReduceMotion.current) return@composed this
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) pressedScale else 1f,
        animationSpec = if (pressed) ParkingMotion.press else ParkingMotion.pop,
        label = "pressBounce",
    )
    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

/**
 * [key]가 바뀔 때마다 한 번 톡 튄다 (처음 그릴 때는 가만히). 후진 횟수·고른 층처럼 '방금 바뀐 값'에.
 * @param enabled false면 튀지 않음 (예: 선택이 풀릴 때)
 */
fun Modifier.bumpOn(key: Any?, enabled: Boolean = true, from: Float = 0.86f): Modifier = composed {
    if (LocalInspectionMode.current || LocalReduceMotion.current) return@composed this
    val scale = remember { Animatable(1f) }
    val first = remember { booleanArrayOf(true) }
    LaunchedEffect(key) {
        if (first[0]) { first[0] = false; return@LaunchedEffect }
        if (!enabled) return@LaunchedEffect
        scale.snapTo(from)
        scale.animateTo(1f, ParkingMotion.pop)
    }
    graphicsLayer {
        scaleX = scale.value
        scaleY = scale.value
    }
}
