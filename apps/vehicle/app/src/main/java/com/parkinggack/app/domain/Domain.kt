package com.parkinggack.app.domain

import com.parkinggack.app.model.FloorEstimate
import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.Pose
import com.parkinggack.app.model.VehicleSample
import com.parkinggack.app.model.VehicleSpec

/** 주차 한 건을 끝까지 처리한 결과 (C-05 카드 + C-12 리플레이에 필요한 것 전부) */
data class ParkingAnalysis(
    /** 원래 궤적 — samples와 같은 길이 */
    val poses: List<Pose>,
    val summary: ManeuverSummary,
    val floor: FloorEstimate,
    /** 화면에 그릴 궤적: approximate면 전환점만 이은 단순 궤적, 아니면 poses 그대로 */
    val displayPoses: List<Pose>,
)

/**
 * 도메인 기본 구현 모음 (DI 대용). 상태 없는 것은 공유 인스턴스, 진입 감지기는 상태가 있어 매번 새로 만든다.
 *
 * ```
 * val result = Domain.process(samples, spec, lot.floors)
 * val detector = Domain.newEntryDetector(spec)
 * ```
 */
object Domain {
    val integrator: TrajectoryIntegrator = BicycleTrajectoryIntegrator()
    val shapeClassifier: AisleShapeClassifier = AisleShapeClassifier()
    val analyzer: ManeuverAnalyzer = DefaultManeuverAnalyzer(shapeClassifier, integrator)
    val floorEstimator: FloorEstimator = SpiralFloorEstimator()
    val simplifier: TrajectorySimplifier = SwitchPointSimplifier()

    fun newEntryDetector(spec: VehicleSpec = VehicleSpec()): ParkingEntryDetector = LowSpeedEntryDetector(spec)

    /** 적분 → 분석 → 층 추정 → (필요하면) 단순화 */
    fun process(
        samples: List<VehicleSample>,
        spec: VehicleSpec = VehicleSpec(),
        lotFloors: List<String> = emptyList(),
        entryFloor: String = "1F",
    ): ParkingAnalysis {
        val poses = integrator.integrate(samples, spec)
        val summary = analyzer.analyze(samples, poses)
        return ParkingAnalysis(
            poses = poses,
            summary = summary,
            floor = floorEstimator.estimate(summary, lotFloors, entryFloor),
            displayPoses = simplifier.simplify(poses, summary),
        )
    }
}
