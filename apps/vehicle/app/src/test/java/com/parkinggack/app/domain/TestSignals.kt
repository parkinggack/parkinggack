package com.parkinggack.app.domain

import com.parkinggack.app.domain.sim.ScenarioBuilder
import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.SwitchPoint
import com.parkinggack.app.model.VehicleSample

/** 일정한 신호 [count]개 (t0부터 dtMs 간격) */
internal fun constantSamples(
    count: Int,
    speed: Float,
    steer: Float = 0f,
    gear: Gear = Gear.DRIVE,
    dtMs: Long = 100,
    t0: Long = 0,
    brake: Boolean? = false,
): List<VehicleSample> = (0 until count).map { VehicleSample(t0 + it * dtMs, speed, steer, gear, brake) }

internal fun summaryOf(
    rampTurns: Double = 0.0,
    approximate: Boolean = false,
    switchPoints: List<SwitchPoint> = emptyList(),
) = ManeuverSummary(
    reverseCount = switchPoints.count { it.toReverse },
    steeringTurns = 0,
    brakeCount = null,
    durationSec = 60,
    netTurns = rampTurns,
    rampTurns = rampTurns,
    switchPoints = switchPoints,
    shape = ParkingShape.UNKNOWN,
    approximate = approximate,
)

/** 잡음 없는 시나리오 빌더 (기하 검증용) */
internal fun cleanBuilder(seed: Long = 1L) = ScenarioBuilder(seed = seed, steeringNoiseDeg = 0.0, speedNoiseMps = 0.0)
