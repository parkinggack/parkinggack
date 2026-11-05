package com.parkinggack.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.parkinggack.app.model.DrivingExperience
import com.parkinggack.app.model.UserSettings
import com.parkinggack.app.ui.components.ChoiceButton
import com.parkinggack.app.ui.components.LocalReduceMotion
import com.parkinggack.app.ui.components.PrimaryButton
import com.parkinggack.app.ui.components.SecondaryButton
import com.parkinggack.app.ui.components.TrajectoryView
import com.parkinggack.app.ui.components.cssLineBox
import com.parkinggack.app.ui.components.parkingBorder
import com.parkinggack.app.ui.theme.DesignHeight
import com.parkinggack.app.ui.theme.DesignWidth
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized
import kotlinx.coroutines.delay

/**
 * C-11 온보딩 3장: 소개 → 익명 기록 동의 → 운전 경력. '시작하기'에서 고른 값을 [onFinish]로 넘긴다.
 * '나만 볼게요'를 골라도 주차 위치 기억은 그대로 동작한다.
 *
 * 모션: 튀어오르지 않는다. 오른쪽 글은 페이지처럼 우→좌로 넘어가고('이전'은 좌→우), 아래 점·버튼 줄은 제자리.
 * 왼쪽 칸은 바뀔 때 겹쳐 사라진다. 1장은 차가 칸에 들어가며 동선이 찍히는 애니메이션,
 * 2·3장은 실제 앱 화면 축소본이 하나씩 우→좌로 넘어간다.
 */
@Composable
fun OnboardingScreen(onFinish: (UserSettings) -> Unit, initialStep: Int = 1) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val still = LocalInspectionMode.current || LocalReduceMotion.current
    var step by rememberSaveable { mutableIntStateOf(initialStep.coerceIn(1, 3)) }
    // 차의 뒤로 키 = 화면의 '이전' (예전엔 2·3장에서 아무 일도 안 했다, 3-9)
    // (Paparazzi 스냅숏처럼 뒤로 키 주인이 없는 곳에선 건너뜀)
    if (LocalOnBackPressedDispatcherOwner.current != null) BackHandler(enabled = step > 1) { step -= 1 }
    var share by rememberSaveable { mutableStateOf(true) }
    var experience by rememberSaveable { mutableStateOf(DrivingExperience.UNKNOWN) }

    Row(
        Modifier.fillMaxSize().background(c.surface).padding(start = 56.dp, end = 56.dp, top = 40.dp, bottom = 36.dp),
        horizontalArrangement = Arrangement.spacedBy(56.dp),
    ) {
        AnimatedContent(
            targetState = step,
            modifier = Modifier
                .weight(520f)
                .fillMaxHeight()
                .clip(RoundedCornerShape(12.dp))
                .background(c.placeholder)
                .parkingBorder(1.5.dp, c.line, 12.dp),
            transitionSpec = { if (still) noMotion() else fadeIn(tween(SLIDE_MS)) togetherWith fadeOut(tween(SLIDE_MS)) },
            contentAlignment = Alignment.Center,
            label = "onboardingPanel",
        ) { s ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                when (s) {
                    1 -> IntroParkingAnimation(Modifier.fillMaxWidth().padding(28.dp))
                    2 -> ScreenSlideShow(RECORD_SLIDES, Modifier.fillMaxWidth().padding(28.dp))
                    else -> ScreenSlideShow(RECOMMEND_SLIDES, Modifier.fillMaxWidth().padding(28.dp))
                }
            }
        }

        // 시안은 제목 44였으나 1장 제목이 592dp 칸에서 '요' 한 글자만 넘쳐 40으로 (세 장 모두 같은 크기). 설명 22 / 1.55
        val titleStyle = t.title.sized(40.sp, 1.25f)
        val bodyStyle = t.body.sized(22.sp, 1.55f)
        Column(Modifier.weight(592f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            AnimatedContent(
                targetState = step,
                modifier = Modifier.weight(1f).fillMaxWidth().clipToBounds(),
                transitionSpec = { if (still) noMotion() else pageSlide(forward = targetState > initialState) },
                contentAlignment = Alignment.TopStart,
                label = "onboardingStep",
            ) { s ->
                Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    Text("$s / 3", style = t.label.sized(18.sp, 1.3f), color = c.inkMuted)
                    when (s) {
                        1 -> {
                            Text("주차하다 헤맨 흔적이 지도가 돼요", style = titleStyle, modifier = Modifier.cssLineBox(titleStyle))
                            Text(
                                "까다로운 곳은 미리 알려 드리고, 댄 자리는 기억해 둘게요.",
                                style = bodyStyle, color = c.inkMuted, modifier = Modifier.cssLineBox(bodyStyle),
                            )
                        }
                        2 -> {
                            Text("주차 기록은 익명으로만 모여요", style = titleStyle, modifier = Modifier.cssLineBox(titleStyle))
                            Text(
                                "누가 어디에 댔는지는 아무도 알 수 없어요. 모인 기록은 주차장 난이도 점수에만 쓰여요.",
                                style = bodyStyle, color = c.inkMuted, modifier = Modifier.cssLineBox(bodyStyle),
                            )
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                RadioOption("익명 기록 보내기", "난이도 지도가 정확해져요", share) { share = true }
                                RadioOption("나만 볼게요", "주차 위치 기억은 그대로 돼요", !share) { share = false }
                            }
                        }
                        else -> {
                            Text("운전한 지 얼마나 되셨어요?", style = titleStyle, modifier = Modifier.cssLineBox(titleStyle))
                            Text("초보라면 조금 덜 까다로운 곳부터 먼저 보여 드릴게요.", style = bodyStyle, color = c.inkMuted, modifier = Modifier.cssLineBox(bodyStyle))
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                EXPERIENCE_OPTIONS.chunked(2).forEach { row ->
                                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                        row.forEach { e ->
                                            ChoiceButton(
                                                e.label, experience == e,
                                                { experience = if (experience == e) DrivingExperience.UNKNOWN else e },
                                                Modifier.weight(1f), height = 84.dp, fontSize = 24.sp,
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                StepDots(step, Modifier.semantics { contentDescription = "3단계 중 ${step}단계" })
                Spacer(Modifier.weight(1f))
                if (step > 1) {
                    SecondaryButton("이전", { step -= 1 }, Modifier.width(150.dp), fontSize = 20.sp, fontWeight = FontWeight.Medium)
                }
                if (step < 3) {
                    PrimaryButton("다음", { step += 1 }, Modifier.width(240.dp), fontSize = 24.sp)
                } else {
                    PrimaryButton(
                        "시작하기",
                        { onFinish(UserSettings(onboarded = true, shareAnonymous = share, experience = experience)) },
                        Modifier.width(240.dp),
                        fontSize = 24.sp,
                    )
                }
            }
        }
    }
}

/** 넘김 길이 — 넘침 없는 감속 곡선 (스프링 아님: 튀지 않게) */
private const val SLIDE_MS = 380
private val SlideOffsetSpec = tween<IntOffset>(SLIDE_MS, easing = FastOutSlowInEasing)

/** 페이지 넘김: 다음은 오른쪽에서 들어와 왼쪽으로 밀어내고, 이전은 그 반대 */
private fun pageSlide(forward: Boolean): ContentTransform {
    val dir = if (forward) 1 else -1
    return slideInHorizontally(SlideOffsetSpec) { w -> dir * w } togetherWith slideOutHorizontally(SlideOffsetSpec) { w -> -dir * w }
}

private fun noMotion(): ContentTransform = EnterTransition.None togetherWith ExitTransition.None

/** 왼쪽 칸에서 차례로 넘겨 보여 줄 실제 앱 화면 하나와 그 아래 한 줄 설명 */
private class ScreenSlide(val caption: String, val screen: @Composable () -> Unit)

/** 2장 (익명 기록): 내 주차가 기록되고 → 여럿의 기록이 난이도가 된다 */
private val RECORD_SLIDES = listOf(
    ScreenSlide("주차를 마치면 후진 횟수와 걸린 시간이 남아요") {
        ParkedScreen(
            estimate = PreviewData.estimateHigh,
            floors = PreviewData.parkedFloors,
            summary = PreviewData.summary,
            comparisonText = "평소보다 수월했어요",
            trajectory = PreviewData.trajectory,
            autoSaveProgress = 0.4f,
            autoSaveSecondsLeft = 3,
            onConfirm = {}, onOtherFloor = {}, onPickFloor = {}, onRememberZone = {}, onSendToPhone = {}, onOpenReplay = {},
        )
    },
    ScreenSlide("여러 차의 기록이 모여 주차장 난이도가 돼요") {
        LotDetailScreen(PreviewData.hyundai, myAvgReverse = null, onRouteVia = {}, onRate = {}, onBack = {})
    },
)

/** 3장 (운전 경력): 까다로운 곳을 미리 알리고 → 경력에 맞는 더 쉬운 곳을 고른다 */
private val RECOMMEND_SLIDES = listOf(
    ScreenSlide("까다로운 곳은 도착 전에 미리 알려 드려요") {
        DestinationCardScreen("현대백화점 판교점", PreviewData.hyundai, onShowEasier = {}, onDismiss = {})
    },
    ScreenSlide("경력에 맞춰 더 쉬운 주차장을 골라 드려요") {
        EasierLotsScreen(PreviewData.hyundai, PreviewData.suggestions, onRouteVia = {}, onBack = {})
    },
)

/** 한 장이 머무는 시간 */
private const val SLIDE_INTERVAL_MS = 3200L

/** 앱 화면 축소본을 [SLIDE_INTERVAL_MS]마다 하나씩 우→좌로 넘긴다. 스냅숏·모션 끔이면 첫 장에 멈춤 */
@Composable
private fun ScreenSlideShow(slides: List<ScreenSlide>, modifier: Modifier) {
    val t = ParkingTheme.type
    val still = LocalInspectionMode.current || LocalReduceMotion.current
    var index by remember(slides) { mutableIntStateOf(0) }
    LaunchedEffect(slides, still) {
        if (still || slides.size < 2) return@LaunchedEffect
        while (true) {
            delay(SLIDE_INTERVAL_MS)
            index = (index + 1) % slides.size
        }
    }
    AnimatedContent(
        targetState = index,
        modifier = modifier.clipToBounds(),
        transitionSpec = { if (still) noMotion() else pageSlide(forward = true) },
        contentAlignment = Alignment.TopCenter,
        label = "onboardingScreens",
    ) { i ->
        val slide = slides[i]
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            ScreenMiniature(slide.caption, Modifier.fillMaxWidth(), slide.screen)
            Text(slide.caption, style = t.heading.sized(20.sp, 1.3f), textAlign = TextAlign.Center)
        }
    }
}

/**
 * 실제 화면 컴포저블을 시안 크기(1280×676dp)로 배치한 뒤 칸 폭에 맞게 density만 줄여 그린다 — 비트맵이 아니라 늘 지금 UI 그대로.
 * 그림일 뿐이라: 미리보기 모드(지도 대신 자리 그림·등장 모션 없음), 시각 고정, 터치·접근성 읽기는 막고 설명 한 줄만.
 */
@Composable
private fun ScreenMiniature(description: String, modifier: Modifier, screen: @Composable () -> Unit) {
    val c = ParkingTheme.colors
    BoxWithConstraints(
        modifier
            .aspectRatio(DesignWidth / DesignHeight)
            .clip(RoundedCornerShape(10.dp))
            .background(c.surface)
            .clearAndSetSemantics { contentDescription = "$description (화면 예시)" },
    ) {
        val base = LocalDensity.current
        CompositionLocalProvider(
            LocalDensity provides Density(base.density * (maxWidth / DesignWidth), base.fontScale),
            LocalInspectionMode provides true,
            LocalNowMs provides { PreviewData.nowMs },
        ) {
            Box(Modifier.fillMaxSize()) { screen() }
        }
        // 맨 위 형제가 터치를 모두 가져가 아래 화면의 버튼은 눌리지 않는다. 테두리도 화면 배경 위에 보이도록 여기서
        Box(
            Modifier
                .matchParentSize()
                .parkingBorder(1.5.dp, c.lineStrong, 10.dp)
                .pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent().changes.forEach { it.consume() } } },
        )
    }
}

@Composable
private fun RadioOption(label: String, desc: String, selected: Boolean, onClick: () -> Unit) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 76.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(c.surfaceRaised)
            .parkingBorder(if (selected) 2.5.dp else 1.5.dp, if (selected) c.ink else c.line, 16.dp)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 24.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Box(Modifier.size(26.dp).clip(CircleShape).parkingBorder(2.dp, c.ink, 13.dp), contentAlignment = Alignment.Center) {
            if (selected) Box(Modifier.size(12.dp).clip(CircleShape).background(c.ink))
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, style = t.heading.sized(22.sp, 1.25f))
            Text(desc, style = t.label.sized(16.sp, 1.3f, FontWeight.Normal), color = c.inkMuted)
        }
    }
}

@Composable
private fun StepDots(step: Int, modifier: Modifier = Modifier) {
    val c = ParkingTheme.colors
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        (1..3).forEach { n ->
            val width by animateDpAsState(if (n == step) 36.dp else 10.dp, tween(SLIDE_MS, easing = FastOutSlowInEasing), label = "stepDot")
            Box(
                Modifier
                    .size(width = width, height = 10.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(if (n == step) c.ink else c.track),
            )
        }
    }
}

/** 1장: 동선이 그려지는 시간 / 다 그린 채 머무는 시간 / 다시 시작할 때 흐려졌다 나타나는 시간 */
private const val INTRO_DRAW_MS = 5000
private const val INTRO_HOLD_MS = 1800L
private const val INTRO_FADE_MS = 350

/**
 * 1장 그림: 차가 통로로 들어와 지나쳤다가 후진 → 앞으로 조금 → 다시 후진해 칸에 들어가고, 지나간 길이 그대로 찍힌다.
 * C-12 동선 그림([TrajectoryView])을 그대로 써서 전진 실선·후진 점선·전환점 번호가 실제 기록 화면과 같다.
 * 다 그리면 잠깐 머문 뒤 흐려졌다가 처음부터 다시. 스냅숏·모션 끔이면 다 그린 모습에 멈춤.
 */
@Composable
private fun IntroParkingAnimation(modifier: Modifier) {
    val c = ParkingTheme.colors
    val t = ParkingTheme.type
    val still = LocalInspectionMode.current || LocalReduceMotion.current
    val progress = remember { Animatable(if (still) 1f else 0f) }
    val alpha = remember { Animatable(1f) }
    LaunchedEffect(still) {
        if (still) {
            progress.snapTo(1f)
            alpha.snapTo(1f)
            return@LaunchedEffect
        }
        while (true) {
            progress.snapTo(0f)
            alpha.animateTo(1f, tween(INTRO_FADE_MS))
            progress.animateTo(1f, tween(INTRO_DRAW_MS, easing = LinearEasing))
            delay(INTRO_HOLD_MS)
            alpha.animateTo(0f, tween(INTRO_FADE_MS))
        }
    }
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
        TrajectoryView(
            poses = PreviewData.trajectory,
            switchPoints = PreviewData.summary.switchPoints,
            shape = PreviewData.summary.shape,
            progress = progress.value,
            approximate = false,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(4f / 3f)
                .clip(RoundedCornerShape(12.dp))
                .graphicsLayer { this.alpha = alpha.value },
            showLabels = false,
        )
        Text("헤맨 흔적 → 난이도 점수", style = t.body.sized(18.sp, 1.4f, FontWeight.Bold), color = c.inkMuted)
    }
}

@CarPreview
@Composable
private fun OnboardingPreview() = PreviewFrame {
    OnboardingScreen(onFinish = {})
}

@CarPreviewLight
@Composable
private fun OnboardingLightPreview() = PreviewFrame(dark = false) {
    OnboardingScreen(onFinish = {})
}
