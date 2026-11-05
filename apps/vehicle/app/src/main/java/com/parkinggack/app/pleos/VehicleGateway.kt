package com.parkinggack.app.pleos

import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.constant.control.VehicleGear
import ai.pleos.playground.vehicle.listener.BrakePedalStatusListener
import ai.pleos.playground.vehicle.listener.FuelPercentListener
import ai.pleos.playground.vehicle.listener.SteeringWheelAngleListener
import ai.pleos.playground.vehicle.listener.GearSelectionListener
import android.content.Context
import android.util.Log
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Pleos Vehicle SDK 래퍼. 콜백 API를 Flow로 감싼다.
 * 시그니처는 docs/sdk-signatures/Vehicle-2.3.2.txt 참고.
 *
 * 주의: 기어는 문서와 달리 Vehicle SDK에도 있음 (`vehicle.getGear()`), 차속은 없음 → CarSignals.speedMps()
 */
class VehicleGateway(context: Context) {

    private val vehicle = Vehicle(context.applicationContext)

    private val _status = MutableStateFlow<SdkStatus>(SdkStatus.Idle)
    val status: StateFlow<SdkStatus> = _status.asStateFlow()

    fun initialize() {
        if (_status.value == SdkStatus.Ready) return
        _status.value = runCatching { vehicle.initialize() }
            .fold({ SdkStatus.Ready }, { SdkStatus.Failed(it.describe()) })
    }

    fun release() {
        runCatching { vehicle.release() }
        _status.value = SdkStatus.Idle
    }

    /** 기어 선택 (P/R/N/D…). 주차각: P 진입 = 주차 완료 이벤트로 사용 */
    fun gearSelection(): Flow<VehicleGear> = callbackFlow {
        val gear = vehicle.getGear()
        val listener = object : GearSelectionListener {
            override fun onSelected(gear: VehicleGear?) { gear?.let { trySend(it) } }
            override fun onFailed(e: Exception) { Log.w(TAG, "gear: ${e.describe()}") }
        }
        gear.getCurrentGearSelectionState({ it?.let { g -> trySend(g) } }, { Log.w(TAG, "gear get: ${it.describe()}") })
        gear.registerGearSelection(listener)
        awaitClose { runCatching { gear.unregisterGearSelection(listener) } }
    }

    /** 핸들 각도(도). 부호 규약은 에뮬레이터에서 확인 → LiveSignalSource.STEERING_SIGN 으로 맞춤 */
    fun steeringAngle(): Flow<Float> = callbackFlow {
        val wheel = vehicle.getSteeringWheel()
        val listener = object : SteeringWheelAngleListener {
            override fun onSteeringWheelAngleUpdated(angle: Float?) { angle?.let { trySend(it) } }
            override fun onFailed(e: Exception) { Log.w(TAG, "steering: ${e.describe()}") }
        }
        wheel.getCurrentSteeringWheelAngle({ it?.let { a -> trySend(a) } }, { Log.w(TAG, "steering get: ${it.describe()}") })
        wheel.registerSteeringWheelAngle(listener)
        awaitClose { runCatching { wheel.unregisterSteeringWheelAngle(listener) } }
    }

    /** 브레이크 페달 밟음 여부 */
    fun brakePedal(): Flow<Boolean> = callbackFlow {
        val brake = vehicle.getBrake()
        val listener = object : BrakePedalStatusListener {
            override fun onBrakePedalStatusUpdated(pressed: Boolean?) { pressed?.let { trySend(it) } }
            override fun onFailed(e: Exception) { Log.w(TAG, "brake: ${e.describe()}") }
        }
        brake.getCurrentBrakePedalStatus({ it?.let { b -> trySend(b) } }, { Log.w(TAG, "brake get: ${it.describe()}") })
        brake.registerBrakePedalStatus(listener)
        awaitClose { runCatching { brake.unregisterBrakePedalStatus(listener) } }
    }

    /** 연료 잔량(%) — 샘플용. EV면 EvBattery.registerEvBatteryStateOfCharge 사용 */
    fun fuelPercent(): Flow<Int?> = callbackFlow {
        val fuel = vehicle.getFuel()
        val listener = object : FuelPercentListener {
            override fun onFuelPercentUpdated(percent: Int?) { trySend(percent) }
            override fun onFailed(e: Exception) { Log.w(TAG, "fuel: ${e.describe()}") }
        }
        fuel.registerFuelPercent(listener)
        awaitClose { runCatching { fuel.unregisterFuelPercent(listener) } }
    }

    private companion object { const val TAG = "VehicleGateway" }
}

/**
 * VehicleException 클래스는 2.3.2 AAR에서 난독화돼 직접 import 불가 (공식 샘플도 message만 사용).
 * 메시지에 ErrorCode 이름(ERROR_DRIVING_RESTRICTED 등)이 들어오는지 에뮬레이터에서 확인할 것.
 */
internal fun Throwable.describe(): String = "${javaClass.simpleName}: ${message ?: "-"}"
