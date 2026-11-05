package com.parkinggack.app.ui.overlay

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.parkinggack.app.pleos.NaviGateway
import com.parkinggack.app.session.AppController
import com.parkinggack.app.session.AppUiState
import com.parkinggack.app.session.DriveState
import com.parkinggack.app.session.Screen
import com.parkinggack.app.ui.MainActivity
import com.parkinggack.app.ui.components.DrivingBanner
import com.parkinggack.app.ui.components.RecordingBadge
import com.parkinggack.app.ui.screens.levelFromBanner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * 주행 중에는 진짜 Pleos 내비가 화면을 쓰고, 주차각은 그 위 작은 배너만 (사용자 결정 2026-11-03).
 *
 * - 주행 시작 → 내비를 앞으로([NaviGateway.showNavigation]) → 앱이 뒤로 가면 내비 위 배너([NaviOverlay])
 * - P(주차 완료, C-05) → 배너 내리고 주차각을 앞으로 (P 넣은 뒤 3초 안에 끝나야 하므로)
 * - 목적지를 정해 C-02 카드가 생기면 → 주차각을 앞으로 (정차 중에만 뜨는 카드)
 * - 앱이 앞에 있으면 배너는 숨긴다 (앱 안 C-04와 겹치지 않게)
 *
 * '다른 앱 위에 그리기'가 없으면 아무것도 바꾸지 않는다 → 예전처럼 앱 안 C-04가 보인다.
 * 앱이 뒤에 있어도 살아 있는 건 KeepAliveService(포그라운드 서비스) 덕분.
 */
class DrivePresenter(
    private val app: Application,
    private val controller: AppController,
    private val navi: NaviGateway,
    private val scope: CoroutineScope,
) : Application.ActivityLifecycleCallbacks {

    private enum class Phase { DRIVING, PARKED, CARD, OTHER }

    private val overlay = NaviOverlay(app)
    private var resumed = 0
    private var phase = Phase.OTHER

    fun start() {
        app.registerActivityLifecycleCallbacks(this)
        scope.launch {
            controller.ui.map(::phaseOf).distinctUntilChanged().collect(::onPhase)
        }
    }

    private fun phaseOf(ui: AppUiState): Phase = when {
        ui.showDrivingOverlay -> Phase.DRIVING
        ui.screen == Screen.Parked -> Phase.PARKED
        ui.screen == Screen.DestinationCard -> Phase.CARD
        else -> Phase.OTHER
    }

    private fun onPhase(p: Phase) {
        val prev = phase
        phase = p
        val canOverlay = overlay.canShow()
        Log.i(TAG, "phase $prev -> $p (overlay=$canOverlay, inFront=${resumed > 0})")
        when (p) {
            Phase.DRIVING -> if (canOverlay) {
                navi.showNavigation()
                if (resumed == 0) showBanner() // 이미 뒤에 있으면 바로, 아니면 onActivityPaused에서
            }
            Phase.PARKED -> {
                overlay.hide()
                if (canOverlay && resumed == 0) bringToFront()
            }
            Phase.CARD -> {
                overlay.hide()
                if (canOverlay && resumed == 0) bringToFront()
            }
            Phase.OTHER -> overlay.hide()
        }
    }

    private fun showBanner() {
        overlay.show { Banner(controller) }
    }

    /** 뒤에 있는 주차각을 앞으로 (백그라운드 화면 시작 — '다른 앱 위에 그리기'가 있어야 허용됨) */
    private fun bringToFront() {
        runCatching {
            app.startActivity(
                Intent(app, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT),
            )
        }.onFailure { Log.w(TAG, "bringToFront: ${it.message}") }
    }

    // ---- 앱이 앞에 있는지 (배너 숨김/표시, 배너 자리 계산) ----

    override fun onActivityResumed(activity: Activity) {
        resumed++
        overlay.panelBounds = activity.windowManager.currentWindowMetrics.bounds
        overlay.hide()
    }

    override fun onActivityPaused(activity: Activity) {
        resumed = (resumed - 1).coerceAtLeast(0)
        if (phase == Phase.DRIVING && resumed == 0) showBanner()
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
    override fun onActivityStarted(activity: Activity) {}
    override fun onActivityStopped(activity: Activity) {}
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
    override fun onActivityDestroyed(activity: Activity) {}

    private companion object { const val TAG = "DrivePresenter" }
}

/** 내비 위 배너 내용: 기록 중이면 '주차 기록 중 | 후진 n · m:ss', 아니면 '도착지 주차 ★4.3' (없으면 아무것도) */
@Composable
private fun Banner(c: AppController) {
    val ui by c.ui.collectAsState()
    val rec = ui.drive as? DriveState.Recording
    val text = ui.bannerText
    when {
        rec != null -> RecordingBadge(rec.reverseCount, rec.elapsedSec)
        text != null -> DrivingBanner(text, level = levelFromBanner(text))
        else -> Box {}
    }
}
