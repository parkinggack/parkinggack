package com.parkinggack.app.domain

import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.VehicleSample
import com.parkinggack.app.model.VehicleSpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.hypot
import kotlin.math.tan

class TrajectoryIntegratorTest {
    private val integrator = BicycleTrajectoryIntegrator()
    private val spec = VehicleSpec()

    @Test fun emptyInputGivesEmptyTrajectory() {
        assertTrue(integrator.integrate(emptyList(), spec).isEmpty())
    }

    @Test fun straightLineIntegratesToCorrectDistance() {
        // 5 m/s × 10 s = 50 m, 시작 방향(+y)으로
        val poses = integrator.integrate(constantSamples(101, speed = 5f), spec)
        assertEquals(101, poses.size)
        val end = poses.last()
        assertEquals(50.0, end.y, 1e-6)
        assertEquals(0.0, end.x, 1e-9)
        assertEquals(0.0, end.headingRad, 1e-12)
        assertFalse(end.reverse)
        assertEquals(10_000L, end.tMs)
    }

    @Test fun reverseGearMovesBackwardAndFlagsPoses() {
        val poses = integrator.integrate(constantSamples(101, speed = 5f, gear = Gear.REVERSE), spec)
        assertEquals(-50.0, poses.last().y, 1e-6)
        assertTrue(poses.all { it.reverse })
    }

    @Test fun constantSteeringDrawsCircleOfExpectedRadius() {
        val steer = 360f
        val radius = spec.wheelbaseM / tan(Math.toRadians(steer / spec.steeringRatio))
        val v = 2f
        val poses = integrator.integrate(constantSamples(301, speed = v, steer = steer), spec)
        // 왼쪽(+)으로 감고 전진 → 반시계, 중심은 시작점 왼쪽 (−R, 0)
        poses.forEach { assertEquals(radius, hypot(it.x + radius, it.y), 1e-6) }
        val t = 30.0
        assertEquals(v * t / radius, poses.last().headingRad, 1e-9)
        assertTrue(poses.drop(1).all { it.x < 0 })
        // 한 바퀴 지나면 출발점으로 돌아옴
        val lapMs = (2 * PI * radius / v * 1000).toLong()
        val lapIdx = (lapMs / 100).toInt()
        val nearLap = poses[lapIdx]
        assertTrue(hypot(nearLap.x, nearLap.y) < v * 0.1 + 1e-6)
    }

    @Test fun reversingWithLeftSteeringTurnsClockwise() {
        val poses = integrator.integrate(constantSamples(50, speed = 1f, steer = 300f, gear = Gear.REVERSE), spec)
        assertTrue(poses.last().headingRad < 0)
        assertTrue(poses.last().y < 0)
    }

    @Test fun irregularSampleSpacingKeepsGeometry() {
        val rnd = java.util.Random(42)
        var t = 0L
        val samples = mutableListOf<VehicleSample>()
        while (t < 10_000) {
            samples += VehicleSample(t, 3f, 200f, Gear.DRIVE, false)
            t += 30 + rnd.nextInt(140)
        }
        samples += VehicleSample(10_000, 3f, 200f, Gear.DRIVE, false)
        val poses = integrator.integrate(samples, spec)
        val radius = spec.wheelbaseM / tan(Math.toRadians(200.0 / spec.steeringRatio))
        poses.forEach { assertEquals(radius, hypot(it.x + radius, it.y), 1e-6) }
        assertEquals(3.0 * 10 / radius, poses.last().headingRad, 1e-9)
    }

    @Test fun signalGapIsClampedToOneSecond() {
        val before = constantSamples(11, speed = 5f) // 0..1000 ms
        val after = constantSamples(11, speed = 5f, t0 = 6_000) // 6000..7000 ms (5초 끊김)
        val poses = integrator.integrate(before + after, spec)
        // 1 s + (끊김 5 s → 1 s로 자름) + 1 s = 3 s × 5 m/s
        assertEquals(15.0, poses.last().y, 1e-6)
    }

    @Test fun duplicateTimestampsDoNotMove() {
        val s = constantSamples(3, speed = 5f)
        val poses = integrator.integrate(listOf(s[0], s[1], s[1].copy(), s[2]), spec)
        assertEquals(4, poses.size)
        assertEquals(poses[1].y, poses[2].y, 0.0)
        assertEquals(1.0, poses[3].y, 1e-9)
    }

    @Test fun neutralKeepsLastDirection() {
        val r = constantSamples(11, speed = 1f, gear = Gear.REVERSE)
        val n = constantSamples(10, speed = 1f, gear = Gear.NEUTRAL, t0 = 1_100)
        val poses = integrator.integrate(r + n, spec)
        assertEquals(-2.0, poses.last().y, 1e-6)
        assertFalse(poses.last().reverse) // reverse 플래그는 기어 그대로
    }

    @Test fun noiseFreeScenarioIsReconstructed() {
        // 생성기와 적분기가 같은 모델 → 잡음 없으면 지나간 길을 그대로 복원 (원 한 바퀴 → 출발점)
        val samples = cleanBuilder().start(8.0).straight(5.0, 8.0).arc(360.0, 6.0, 8.0).straight(5.0, 8.0)
            .build("t", "t", "t", listOf("1F")).samples
        val end = integrator.integrate(samples, spec).last()
        assertEquals(2 * PI, end.headingRad, Math.toRadians(1.0))
        assertEquals(0.0, end.x, 0.3)
    }
}
