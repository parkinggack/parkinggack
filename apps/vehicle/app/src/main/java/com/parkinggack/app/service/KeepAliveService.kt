package com.parkinggack.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.parkinggack.app.R
import com.parkinggack.app.ui.MainActivity

/**
 * 앱이 떠 있는 동안 프로세스가 얼지 않게 붙잡아 두는 포그라운드 서비스.
 *
 * 후진(R)하면 시스템 후방 카메라가 앱을 덮어 Activity가 onStop → 프로세스가 '캐시된 앱'이 되고,
 * Android 14 앱 동결(cached app freezer, freeze_debounce_timeout 10초)이 프로세스를 얼린다.
 * 얼어 있는 동안 LiveSignalSource 샘플링이 멈춰 궤적이 끊긴다 → 동선이 '대략적'으로, 층 추정은 LOW로.
 * (2026-11-03 Pleos 에뮬레이터 실차 주행 테스트: 평행주차 S자 후진 16초 중 5.2초 동결)
 * 포그라운드 서비스가 있으면 프로세스가 캐시 상태가 아니라서 얼지 않는다.
 *
 * 백그라운드에서는 포그라운드 서비스를 시작할 수 없으므로 화면이 보일 때(MainActivity.onStart) 시작한다.
 * 앱 작업을 닫으면(onTaskRemoved) 멈춘다.
 */
class KeepAliveService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    /**
     * startForegroundService() 뒤 시스템은 startForeground()를 기다린다. 그 사이 서비스가 내려가면(강제 종료 등)
     * 앱이 `ForegroundServiceDidNotStartInTimeException`으로 죽는다 → 가장 이른 onCreate에서 바로 부른다.
     * (2026-11-05: car service 재시작으로 앱이 죽었다 다시 뜰 때 메인 스레드가 Car 연결을 기다리느라 늦어져 한 번 남. docs/sim-findings.md 1-3)
     */
    override fun onCreate() {
        super.onCreate()
        goForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // startForegroundService()를 부를 때마다 다시 불러야 한다 (이미 떠 있어도)
        goForeground()
        return START_STICKY
    }

    private fun goForeground() {
        runCatching { startInForeground() }
            .onFailure { Log.w(TAG, "startForeground failed: ${it.message}"); stopSelf() }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    private fun startInForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "주차 기록", NotificationManager.IMPORTANCE_MIN))
        }
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("주차각")
            .setContentText("주차할 때 동선을 기록해요")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        private const val TAG = "KeepAliveService"
        private const val CHANNEL = "parking-recording"
        private const val NOTIFICATION_ID = 7001

        /** 화면이 보일 때 부른다. 이미 떠 있으면 아무 일 없음 */
        fun start(context: Context) {
            runCatching { context.startForegroundService(Intent(context, KeepAliveService::class.java)) }
                .onFailure { Log.w(TAG, "start failed: ${it.message}") }
        }
    }
}
