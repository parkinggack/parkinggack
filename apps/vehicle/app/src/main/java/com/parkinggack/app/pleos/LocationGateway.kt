package com.parkinggack.app.pleos

import ai.pleos.playground.location.fused.FusedLocation
import ai.pleos.playground.location.fused.listener.FusedLocationListener
import ai.pleos.playground.location.fused.listener.ProximityAlertListener
import ai.pleos.playground.location.fused.model.LocationData
import ai.pleos.playground.location.fused.model.ProximityAlertEvent
import ai.pleos.playground.location.fused.model.ProximityAlertRequest
import ai.pleos.playground.location.fused.model.ProximityTransition
import android.content.Context
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * FusedLocation SDK 래퍼. 상태 "Not Available Yet" → isSupported()가 false면 기능 숨김.
 * 권한 pleos.car.permission.FUSED_LOCATION 은 런타임 허용 필요.
 */
class LocationGateway(context: Context) {

    private val fused = FusedLocation(context.applicationContext)
    private var initialized = false

    fun initialize(): SdkStatus = runCatching {
        if (!fused.isSupported()) return SdkStatus.NotSupported
        if (!initialized) { fused.initialize(); initialized = true }
        SdkStatus.Ready
    }.getOrElse { SdkStatus.Failed(it.describe()) }

    fun release() { if (initialized) runCatching { fused.release() }; initialized = false }

    fun locations(): Flow<LocationData> = callbackFlow {
        val listener = object : FusedLocationListener {
            override fun onChanged(location: LocationData?) { location?.let { trySend(it) } }
            override fun onError(e: Exception) { close(e) }
        }
        fused.registerFusedLocationCallback(listener)
        awaitClose { runCatching { fused.unregisterFusedLocationCallback(listener) } }
    }

    /** 지오펜스 — 주차각: 목적지 반경 진입 시 주차장 추천 띄우기 등에 사용 */
    fun geofence(lat: Double, lng: Double, radiusM: Float): Flow<ProximityAlertEvent> = callbackFlow {
        var alertId: String? = null
        val listener = object : ProximityAlertListener {
            override fun onRegistered(id: String) { alertId = id }
            override fun onTransition(event: ProximityAlertEvent) { trySend(event) }
            override fun onError(e: Exception) { close(e) }
        }
        fused.addProximityAlert(
            ProximityAlertRequest(lat, lng, radiusM, setOf(ProximityTransition.ENTER, ProximityTransition.EXIT)),
            listener,
        )
        awaitClose { alertId?.let { runCatching { fused.removeProximityAlert(it) } } }
    }
}
