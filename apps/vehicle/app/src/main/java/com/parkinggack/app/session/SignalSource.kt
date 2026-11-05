package com.parkinggack.app.session

import android.util.Log
import com.parkinggack.app.car.CarSignals
import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.VehicleSample
import com.parkinggack.app.pleos.VehicleGateway
import ai.pleos.playground.vehicle.constant.control.VehicleGear
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.catch

/** 차량 신호 스트림. 실차/에뮬레이터(Live)와 녹화 재생(Replay) 둘 다 이 인터페이스. */
interface SignalSource {
    val samples: Flow<VehicleSample>

    /**
     * 샘플 + 그때 목적지(주차장 입구)까지 직선거리(m, 모르면 null) — 진입 감지기 규칙 A에 들어간다.
     * Live는 아직 거리를 모른다(null). Replay는 시나리오의 거리를 같이 흘린다.
     */
    val withDistance: Flow<Pair<VehicleSample, Double?>> get() = samples.map { it to null }
}

/**
 * Live: 각 SDK 콜백의 최신값을 모아 10Hz로 샘플링한다.
 * - 차속: AAOS PERF_VEHICLE_SPEED (Vehicle SDK에 없음)
 * - 기어·조향각·브레이크: Pleos Vehicle SDK
 */
class LiveSignalSource(
    private val car: CarSignals,
    private val vehicle: VehicleGateway,
    private val periodMs: Long = 100,
    /**
     * 차속 신호가 안 들어올 때(권한 없음·에뮬레이터 미지원) 기어 D/R + 브레이크 뗌이면 서행 속도로 가정.
     * Virtual Console로 기어·조향만 바꿔도 궤적이 그려지게 하는 시연 보조. 실차에서는 차속이 들어오므로 영향 없음.
     */
    private val creepFallbackMps: Float? = 1.4f,
) : SignalSource {
    override val samples: Flow<VehicleSample> = flow {
        val speed = MutableStateFlow(0f)
        val steer = MutableStateFlow(0f)
        val gear = MutableStateFlow(Gear.UNKNOWN)
        val brake = MutableStateFlow<Boolean?>(null)
        var lastSpeedAt = 0L
        var tick = 0
        coroutineScope {
            car.speedMps().onEach { speed.value = kotlin.math.abs(it); lastSpeedAt = System.currentTimeMillis() }.catch { }.launchIn(this)
            vehicle.gearSelection().onEach { gear.value = it.toGear() }.catch { }.launchIn(this)
            vehicle.steeringAngle().onEach { steer.value = it * STEERING_SIGN }.catch { }.launchIn(this)
            vehicle.brakePedal().onEach { brake.value = it }.catch { }.launchIn(this)
            while (true) {
                val now = System.currentTimeMillis()
                val noSpeedSignal = now - lastSpeedAt > 3_000
                val v = if (noSpeedSignal && creepFallbackMps != null) {
                    if (gear.value.isMoving && brake.value != true) creepFallbackMps else 0f
                } else speed.value
                // 진단: adb shell setprop log.tag.LiveSignal DEBUG 일 때만 1초에 한 줄
                if (++tick % 10 == 0 && Log.isLoggable(LOG_TAG, Log.DEBUG)) {
                    Log.d(LOG_TAG, "v=%.2f raw=%.2f speedAge=%dms gear=%s brake=%s steer=%.1f".format(
                        v, speed.value, if (lastSpeedAt == 0L) -1 else now - lastSpeedAt, gear.value, brake.value, steer.value))
                }
                emit(VehicleSample(now, v, steer.value, gear.value, brake.value))
                delay(periodMs)
            }
        }
    }

    companion object {
        /** SDK 각도 부호를 앱 규약(왼쪽 +)에 맞추는 계수. 에뮬레이터에서 확인 후 조정 */
        const val STEERING_SIGN = 1f
        private const val LOG_TAG = "LiveSignal"
    }
}

fun VehicleGear.toGear(): Gear = when (this) {
    VehicleGear.GEAR_PARK -> Gear.PARK
    VehicleGear.GEAR_REVERSE -> Gear.REVERSE
    VehicleGear.GEAR_NEUTRAL -> Gear.NEUTRAL
    VehicleGear.GEAR_UNKNOWN -> Gear.UNKNOWN
    else -> Gear.DRIVE // GEAR_DRIVE, GEAR_1..9
}

/**
 * Replay: 녹화/합성한 샘플을 원래 시간 간격대로 다시 흘려보낸다 (시연용).
 * @param speedFactor 2.0 이면 두 배 빠르게
 * @param distances [recorded]와 같은 순서의 목적지 거리 (Scenario.distanceToTargetM). 비어 있으면 null로 흘림.
 *   없으면 앞으로 바로 대는 주차(사선·평면, 후진·큰 회전 없음)는 진입 감지가 안 돼 C-05까지 가지 않는다
 */
class ReplaySignalSource(
    private val recorded: List<VehicleSample>,
    private val speedFactor: Double = 1.0,
    private val distances: List<Double?> = emptyList(),
) : SignalSource {
    override val withDistance: Flow<Pair<VehicleSample, Double?>> = flow {
        if (recorded.isEmpty()) return@flow
        val t0 = recorded.first().timestampMs
        val wall0 = System.currentTimeMillis()
        for ((i, s) in recorded.withIndex()) {
            val due = wall0 + ((s.timestampMs - t0) / speedFactor).toLong()
            val wait = due - System.currentTimeMillis()
            if (wait > 0) delay(wait)
            // 시각은 재생 시점 기준으로 다시 매김 (세션 경과시간 표시용), 간격은 원본 비율 유지
            emit(s.copy(timestampMs = wall0 + (s.timestampMs - t0)) to distances.getOrNull(i))
        }
    }
    override val samples: Flow<VehicleSample> = withDistance.map { it.first }
}
