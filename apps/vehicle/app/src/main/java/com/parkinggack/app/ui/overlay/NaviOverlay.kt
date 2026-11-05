package com.parkinggack.app.ui.overlay

import android.content.Context
import android.graphics.PixelFormat
import android.graphics.Rect
import android.hardware.display.DisplayManager
import android.provider.Settings
import android.util.Log
import android.view.Display
import android.view.Gravity
import android.view.WindowManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.unit.Density
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.parkinggack.app.ui.components.LocalReduceMotion
import com.parkinggack.app.ui.theme.DesignScaleState
import com.parkinggack.app.ui.theme.ParkingTheme

/**
 * Pleos 내비 위에 띄우는 작은 창 (C-04 주행 배너). 주행 중에는 진짜 내비가 지도·경로를 보여 주고,
 * 주차각은 오른쪽 위 한 줄만 얹는다 — 시안 메모 "Pleos 기본 내비 위에 얹히는 앱 화면".
 *
 * - '다른 앱 위에 그리기'(SYSTEM_ALERT_WINDOW)가 있어야 한다. 없으면 [show]가 false → 앱 안 C-04로 대신
 * - **터치를 받지 않는다** (FLAG_NOT_TOUCHABLE·NOT_FOCUSABLE) — 주행 중 터치 입력 없음 규칙, 내비 조작도 막지 않음
 * - 앱 창과 같은 배율([DesignScaleState])로 그리고, 앱 창(런처 오른쪽 칸) 오른쪽 위에 맞춘다
 * - 모션 없음 (주행 중)
 *
 * Pleos 문서에는 다른 앱 위 창에 대한 허용·금지 규정이 없다(2026-11-03) → 앱 마켓 심사 전 Pleos에 확인할 것.
 */
class NaviOverlay(private val app: Context) {

    private var view: ComposeView? = null
    private var owner: OverlayOwner? = null
    private val windowContext: Context by lazy {
        val display = app.getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)
        app.createDisplayContext(display).createWindowContext(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, null)
    }
    private val wm: WindowManager get() = windowContext.getSystemService(WindowManager::class.java)

    /** 앱 창이 화면에서 차지하는 자리 (마지막으로 앞에 있었을 때). 배너를 그 오른쪽 위에 놓는다 */
    var panelBounds: Rect? = null

    val isShowing: Boolean get() = view != null

    fun canShow(): Boolean = Settings.canDrawOverlays(app)

    /** 이미 떠 있으면 그대로 둔다. 권한이 없거나 실패하면 false */
    fun show(content: @Composable () -> Unit): Boolean {
        if (view != null) return true
        if (!canShow()) return false
        return runCatching {
            val o = OverlayOwner().also { it.start() }
            val v = ComposeView(windowContext).apply {
                setViewTreeLifecycleOwner(o)
                setViewTreeSavedStateRegistryOwner(o)
                setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnDetachedFromWindow)
                setContent {
                    val base = LocalDensity.current
                    // 앱과 같은 배율, 모션 끔, 차 화면 다크
                    CompositionLocalProvider(
                        LocalDensity provides Density(base.density * DesignScaleState.factor, base.fontScale),
                        LocalReduceMotion provides true,
                    ) {
                        ParkingTheme(dark = true) { content() }
                    }
                }
            }
            wm.addView(v, layoutParams())
            view = v
            owner = o
            true
        }.getOrElse { Log.w(TAG, "show failed: ${it.message}"); hide(); false }
    }

    fun hide() {
        view?.let { v -> runCatching { wm.removeViewImmediate(v) } }
        owner?.stop()
        view = null
        owner = null
    }

    private fun layoutParams(): WindowManager.LayoutParams {
        val screen = wm.currentWindowMetrics.bounds
        val panel = panelBounds ?: screen
        val px = app.resources.displayMetrics.density * DesignScaleState.factor
        return WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            // 시안 C-04: 앱 영역 오른쪽 위에서 24 · 20dp
            x = (screen.right - panel.right) + (24 * px).toInt()
            y = panel.top + (20 * px).toInt()
            title = "parkinggack-navi-banner"
            // 터치를 내비로 넘기는(FLAG_NOT_TOUCHABLE) 다른 앱 창은 Android 12+에서 불투명도가 최대 0.8로 묶인다.
            // 1.0을 주면 시스템이 매번 경고와 함께 0.8로 낮춘다 → 처음부터 그 값으로 (배너 배경·글자 대비는 0.8 기준으로 본다, 3-6)
            alpha = runCatching { app.getSystemService(android.hardware.input.InputManager::class.java).maximumObscuringOpacityForTouch }
                .getOrDefault(0.8f).coerceIn(0f, 1f)
        }
    }

    /** ComposeView를 액티비티 밖에 붙이려면 생명주기·저장 상태 주인이 필요하다 */
    private class OverlayOwner : LifecycleOwner, SavedStateRegistryOwner {
        private val registry = LifecycleRegistry(this)
        private val saved = SavedStateRegistryController.create(this)
        override val lifecycle: Lifecycle get() = registry
        override val savedStateRegistry: SavedStateRegistry get() = saved.savedStateRegistry

        fun start() {
            saved.performRestore(null)
            registry.currentState = Lifecycle.State.RESUMED
        }

        fun stop() {
            registry.currentState = Lifecycle.State.DESTROYED
        }
    }

    private companion object { const val TAG = "NaviOverlay" }
}
