package com.parkinggack.app.domain

import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.Pose
import com.parkinggack.app.model.VehicleSpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AisleShapeClassifierTest {
    private val classifier = AisleShapeClassifier()
    private val integrator = BicycleTrajectoryIntegrator()

    /** 통로를 곧게 가다가 angleDeg만큼 돌아 앞으로 칸에 들어감 */
    private fun forwardIn(angleDeg: Double, radius: Double = 5.0): List<Pose> {
        val samples = cleanBuilder()
            .start(15.0).straight(20.0, 15.0)
            .straight(15.0, 6.0)
            .arc(angleDeg, radius, 4.0)
            .straight(3.0, 3.0).stop(1.0).shift(Gear.PARK)
            .build("t", "t", "t", listOf("1F")).samples
        return integrator.integrate(samples, VehicleSpec())
    }

    @Test fun ninetyDegreesIsPerpendicular() {
        assertEquals(ParkingShape.PERPENDICULAR, classifier.classify(forwardIn(90.0)))
        assertEquals(ParkingShape.PERPENDICULAR, classifier.classify(forwardIn(-90.0)))
        assertEquals(ParkingShape.PERPENDICULAR, classifier.classify(forwardIn(80.0)))
    }

    @Test fun midAnglesAreAngled() {
        assertEquals(ParkingShape.ANGLED, classifier.classify(forwardIn(45.0)))
        assertEquals(ParkingShape.ANGLED, classifier.classify(forwardIn(-60.0)))
        assertEquals(ParkingShape.ANGLED, classifier.classify(forwardIn(35.0)))
    }

    @Test fun ambiguousAngleIsUnknown() {
        assertEquals(ParkingShape.UNKNOWN, classifier.classify(forwardIn(25.0, radius = 8.0)))
    }

    @Test fun angleIsFoldedModulo180() {
        // 유턴해서 통로 반대 방향으로 섬 → 통로와 나란함
        val poses = forwardIn(170.0, radius = 6.0)
        assertEquals(10.0, classifier.aisleAngleDeg(poses)!!, 2.0)
        assertEquals(ParkingShape.PARALLEL, classifier.classify(poses))
    }

    @Test fun reverseParallelSIsParallel() {
        val samples = cleanBuilder()
            .start(10.0).straight(25.0, 10.0).stop(1.0)
            .shift(Gear.REVERSE).arc(40.0, 5.5, 3.0).arc(-40.0, 5.5, 3.0).stop(1.0)
            .shift(Gear.PARK).build("t", "t", "t", listOf("1F")).samples
        assertEquals(ParkingShape.PARALLEL, classifier.classify(integrator.integrate(samples, VehicleSpec())))
    }

    @Test fun aisleIsTheLastStraightBeforeTheManeuverNotTheStallItself() {
        // 마지막 직선(칸 안 3 m)은 통로가 아님 → 직선 3 m를 7 m로 늘려도 결과는 같아야 함
        val samples = cleanBuilder()
            .start(6.0).straight(15.0, 6.0).arc(90.0, 5.0, 4.0)
            .straight(7.0, 3.0).stop(1.0).shift(Gear.PARK)
            .build("t", "t", "t", listOf("1F")).samples
        assertEquals(ParkingShape.PERPENDICULAR, classifier.classify(integrator.integrate(samples, VehicleSpec())))
    }

    @Test fun noAisleFound() {
        assertEquals(ParkingShape.UNKNOWN, classifier.classify(emptyList()))
        assertEquals(ParkingShape.UNKNOWN, classifier.classify(listOf(Pose(0, 0.0, 0.0, 0.0, false))))
        // 계속 돌기만 함 (곧은 구간 없음)
        val circling = integrator.integrate(constantSamples(200, speed = 2f, steer = 300f), VehicleSpec())
        assertNull(classifier.aisleHeadingRad(circling))
        assertEquals(ParkingShape.UNKNOWN, classifier.classify(circling))
    }

    @Test fun fastStraightIsNotAnAisle() {
        // 40 km/h 직진 뒤 바로 90° → 저속 통로가 없음
        val samples = cleanBuilder().start(40.0).straight(60.0, 40.0).arc(90.0, 30.0, 40.0).straight(3.0, 40.0)
            .build("t", "t", "t", listOf("1F")).samples
        assertNull(classifier.aisleHeadingRad(integrator.integrate(samples, VehicleSpec())))
    }
}
