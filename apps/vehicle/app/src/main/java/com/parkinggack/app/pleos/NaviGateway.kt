package com.parkinggack.app.pleos

import ai.pleos.playground.navi.data.NavigationScreenRequest
import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.constants.NavigationStatus
import ai.pleos.playground.navi.constants.WaypointIndex
import ai.pleos.playground.navi.data.RequestWaypointInfo
import ai.pleos.playground.navi.data.CurrentLocationInfo
import ai.pleos.playground.navi.data.DestinationArrivedInfo
import ai.pleos.playground.navi.data.WaypointArrivedInfo
import ai.pleos.playground.navi.data.DestinationInfo
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import android.content.Context
import android.util.Log
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * NaviHelper SDK 래퍼. 이벤트 순서는 보장되지 않음 (SDK 문서).
 * 시그니처는 docs/sdk-signatures/NaviHelper-3.0.5.txt, navi-data-3.0.4.txt 참고.
 */
class NaviGateway(context: Context) : NaviHelperEventListener {

    private val appContext = context.applicationContext
    private var helper: NaviHelper? = null

    private val _status = MutableStateFlow<SdkStatus>(SdkStatus.Idle)
    val status: StateFlow<SdkStatus> = _status.asStateFlow()

    private val _navigationStatus = MutableStateFlow<NavigationStatus?>(null)
    val navigationStatus: StateFlow<NavigationStatus?> = _navigationStatus.asStateFlow()

    private val _destination = MutableStateFlow<DestinationInfo?>(null)
    val destination: StateFlow<DestinationInfo?> = _destination.asStateFlow()

    private val _speedLimit = MutableStateFlow<Int?>(null)
    val speedLimit: StateFlow<Int?> = _speedLimit.asStateFlow()

    /** 내비가 아는 현재 위치 (getCurrentLocationInfo 응답). 지하에선 부정확할 수 있음 */
    private val _location = MutableStateFlow<CurrentLocationInfo?>(null)
    val location: StateFlow<CurrentLocationInfo?> = _location.asStateFlow()

    /** 경유지(쉬운 주차장) 도착 */
    private val _waypointArrivals = MutableSharedFlow<WaypointArrivedInfo>(extraBufferCapacity = 4, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val waypointArrivals: SharedFlow<WaypointArrivedInfo> = _waypointArrivals.asSharedFlow()

    /** 주차각: 목적지 도착 = 주차 난이도 안내 / 주차 위치 기록 트리거 */
    private val _arrivals = MutableSharedFlow<DestinationArrivedInfo>(extraBufferCapacity = 4, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val arrivals: SharedFlow<DestinationArrivedInfo> = _arrivals.asSharedFlow()

    fun initialize() {
        if (helper != null) return
        val h = NaviHelper(appContext)
        runCatching {
            h.initialize()
            h.addListener(this)
        }.onSuccess {
            helper = h
            _status.value = SdkStatus.Ready
            h.getDestinationInfo()
        }.onFailure {
            runCatching { h.release() }
            _status.value = SdkStatus.Failed(it.describe())
        }
    }

    fun release() {
        helper?.let { runCatching { it.removeListener(this); it.release() } }
        helper = null
        _status.value = SdkStatus.Idle
    }

    fun refreshDestination() { helper?.getDestinationInfo() }

    /** 주행을 시작하면 Pleos 내비 화면을 앞으로 (주행 중 지도·경로는 내비가 보여 준다). 내비가 없으면 false */
    fun showNavigation(): Boolean {
        val h = helper ?: return false
        return runCatching { h.requestNavigationScreen(NavigationScreenRequest.Foreground) }
            .onFailure { Log.w(TAG, "requestNavigationScreen failed", it) }.isSuccess
    }

    /** 현재 위치 요청 → onCurrentLocationInfo. 주차장 진입 감지(목적지까지 거리)에 쓴다 */
    fun requestLocation() { runCatching { helper?.getCurrentLocationInfo() } }

    /** C-03 "경유지로 안내": 쉬운 주차장을 첫 경유지로 추가. 내비가 없으면 false */
    fun addWaypoint(lat: Double, lng: Double, name: String): Boolean {
        val h = helper ?: return false
        return runCatching {
            h.addWaypoint(
                RequestWaypointInfo(
                    latitude = lat, longitude = lng, poiName = name,
                    waypointIndex = WaypointIndex.FIRST,
                    poiId = "", address = "", poiSubId = "", poiProvider = "",
                )
            )
        }.onFailure { Log.w(TAG, "addWaypoint failed", it) }.isSuccess
    }

    override fun onNavigationStatus(status: NavigationStatus) { _navigationStatus.value = status }
    override fun onDestinationInfo(info: DestinationInfo) { _destination.value = info }
    override fun onDestinationChanged() { helper?.getDestinationInfo() }
    override fun onCurrentRoadSpeedLimit(limit: Int) { _speedLimit.value = limit }
    override fun onDestinationArrived(info: DestinationArrivedInfo) { _arrivals.tryEmit(info) }
    override fun onCurrentLocationInfo(info: CurrentLocationInfo) {
        if (info.address != _location.value?.address) Log.i(TAG, "address: ${info.address}")
        _location.value = info
    }
    override fun onWayPointArrived(info: WaypointArrivedInfo) { _waypointArrivals.tryEmit(info) }
    override fun onError(code: NaviErrorCode) { Log.w(TAG, "navi error: $code") }

    private companion object { const val TAG = "NaviGateway" }
}
