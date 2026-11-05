package com.parkinggack.app.car

import android.car.Car
import android.car.VehiclePropertyIds
import android.car.drivingstate.CarUxRestrictionsManager
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/**
 * AAOS 표준 Car API 래퍼.
 * - 주행 중 UX 제한: CarUxRestrictionsManager (CarDrivingStateManager는 @SystemApi라 사용 불가)
 * - 차속/기어 등 표준 속성: CarPropertyManager
 *
 * car service 수명 주기를 직접 받는다 ([Car.createCar] 4인자 + [Car.CarServiceLifecycleListener]).
 * 한 인자 `createCar(context)`는 (1) car service가 없으면 메인 스레드에서 최대 5초 기다리고
 * (2) car service가 죽으면 AOSP가 이 앱 프로세스를 `killProcess`로 같이 죽인다 — 기록 중이면 세션이 통째로 사라진다
 * (2026-11-05 에뮬레이터 VHAL 재시작 때 확인, docs/sim-findings.md 2-6·1-3).
 * 지금은 기다리지 않고(DO_NOT_WAIT) 연결되면 [connected]가 바뀌고, 다시 연결되면 아래 Flow들이 콜백을 새로 등록한다.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CarSignals(context: Context) {

    private val _connected = MutableStateFlow<Car?>(null)
    /** 연결된 Car (car service가 죽은 동안·AAOS가 아니면 null) */
    val connected: StateFlow<Car?> = _connected.asStateFlow()

    private val car: Car? = runCatching {
        Car.createCar(context.applicationContext, Handler(Looper.getMainLooper()), Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { c, ready ->
            Log.i(TAG, "car service ${if (ready) "connected" else "disconnected — waiting for restart"}")
            _connected.value = if (ready) c else null
        }
    }.onFailure { Log.w(TAG, "Car.createCar failed (AAOS 아님?)", it) }.getOrNull()

    val isAvailable get() = car != null

    /** 주행 중 UX 제한. car service가 다시 연결되면 리스너를 새로 단다 (끊긴 동안은 마지막 값 유지 = 아무것도 안 보냄) */
    fun uxRestrictions(): Flow<UxRestriction> = connected.flatMapLatest { c ->
        val manager = c?.let { runCatching { it.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as? CarUxRestrictionsManager }.getOrNull() }
            ?: return@flatMapLatest emptyFlow()
        callbackFlow {
            fun emit(r: android.car.drivingstate.CarUxRestrictions?) {
                trySend(
                    r?.let { UxRestriction(it.isRequiresDistractionOptimization, it.activeRestrictions) }
                        ?: UxRestriction.UNKNOWN
                )
            }
            runCatching {
                emit(manager.currentCarUxRestrictions)
                manager.registerListener { emit(it) }
            }.onFailure { Log.w(TAG, "ux restrictions unavailable", it) }
            awaitClose { runCatching { manager.unregisterListener() } }
        }
    }

    /** 차속 (m/s). 권한(CAR_SPEED, dangerous) 없거나 미지원이면 아무 값도 내보내지 않음. */
    fun speedMps(): Flow<Float> = property(VehiclePropertyIds.PERF_VEHICLE_SPEED, CarPropertyManager.SENSOR_RATE_NORMAL)

    /** 기어 선택값 (VehicleGear 상수, 예: 4=P, 8=D) */
    fun gearSelection(): Flow<Int> = property(VehiclePropertyIds.GEAR_SELECTION, CarPropertyManager.SENSOR_RATE_ONCHANGE)

    /**
     * 차 모델 이름 (AAOS INFO_MODEL, 예 "GRANDEUR"). 미지원·권한 없음·연결 안 됨이면 null.
     * getProperty는 car service→VHAL 동기 호출이라 VHAL이 재시작 중이면 오래 걸린다 → 메인 스레드 밖에서.
     */
    suspend fun modelName(timeoutMs: Long = 5_000): String? {
        if (car == null) return null
        val c = withTimeoutOrNull(timeoutMs) { connected.filterNotNull().first() } ?: return null
        return withContext(Dispatchers.IO) {
            val manager = runCatching { c.getCarManager(Car.PROPERTY_SERVICE) as? CarPropertyManager }.getOrNull() ?: return@withContext null
            runCatching { manager.getProperty(String::class.java, VehiclePropertyIds.INFO_MODEL, 0)?.value }
                .onFailure { Log.w(TAG, "INFO_MODEL unavailable", it) }
                .getOrNull()?.takeIf { it.isNotBlank() }
        }
    }

    /** 차량 야간 모드 (true = 밤 → 다크 테마). 미지원이면 아무 값도 내보내지 않음 */
    fun nightMode(): Flow<Boolean> = property(VehiclePropertyIds.NIGHT_MODE, CarPropertyManager.SENSOR_RATE_ONCHANGE)

    private fun <T : Any> property(propertyId: Int, rate: Float): Flow<T> = connected.flatMapLatest { c ->
        val manager = c?.let { runCatching { it.getCarManager(Car.PROPERTY_SERVICE) as? CarPropertyManager }.getOrNull() }
            ?: return@flatMapLatest emptyFlow()
        callbackFlow {
            val callback = object : CarPropertyManager.CarPropertyEventCallback {
                override fun onChangeEvent(value: CarPropertyValue<*>) {
                    @Suppress("UNCHECKED_CAST")
                    (value.value as? T)?.let { trySend(it) }
                }
                override fun onErrorEvent(propId: Int, zone: Int) {
                    Log.w(TAG, "property error ${VehiclePropertyIds.toString(propId)} zone=$zone")
                }
            }
            val ok = runCatching {
                @Suppress("DEPRECATION")
                manager.registerCallback(callback, propertyId, rate)
            }.onFailure { Log.w(TAG, "register ${VehiclePropertyIds.toString(propertyId)} failed", it) }
                .getOrDefault(false)
            if (!ok) close()
            awaitClose {
                @Suppress("DEPRECATION")
                runCatching { manager.unregisterCallback(callback, propertyId) }
            }
        }
    }

    fun release() = car?.disconnect()

    private companion object { const val TAG = "CarSignals" }
}
