package com.parkinggack.app.domain

import com.parkinggack.app.model.FloorEstimate
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.ParkingShape
import com.parkinggack.app.model.Pose
import com.parkinggack.app.model.VehicleSample
import com.parkinggack.app.model.VehicleSpec

/*
 * 도메인 로직 계약. 순수 Kotlin (android.* 의존 금지) → JVM 단위 테스트로 검증.
 * 구현은 domain 패키지 안 각 파일에. 이 파일의 시그니처는 UI·오케스트레이터가 의존하므로 바꿀 때 같이 고칠 것.
 */

/** 차속·조향각·기어 → (x, y, heading) 궤적. 자전거 모델: yawRate = v·tan(δ/조향비)/축거 */
interface TrajectoryIntegrator {
    fun integrate(samples: List<VehicleSample>, spec: VehicleSpec = VehicleSpec()): List<Pose>
}

/** 진입~P 한 건 분석: 후진 횟수, 핸들 꺾은 횟수, 전환점, 회전 누적, 주차 형태, 근사 여부 */
interface ManeuverAnalyzer {
    fun analyze(samples: List<VehicleSample>, poses: List<Pose>): ManeuverSummary
}

/** 통로 방향(마지막으로 곧게 저속 주행한 구간)과 최종 차 방향의 각도로 직각/평행/사선 판별 */
interface ParkingShapeClassifier {
    fun classify(poses: List<Pose>): ParkingShape
}

/**
 * 층 추정. 나선 램프 한 바퀴 ≈ 한 층. 내려가는지 올라가는지는 주차장 층 구성(지하만 있으면 아래로)으로 가정.
 * @param lotFloors 위→아래 층 목록, 예 ["1F","B1","B2","B3"]. 비어 있으면 지하 6층까지 가정.
 * @param entryFloor 진입한 층 (보통 "1F")
 */
interface FloorEstimator {
    fun estimate(summary: ManeuverSummary, lotFloors: List<String>, entryFloor: String = "1F"): FloorEstimate
}

/** 오차가 클 때 전환점만 직선으로 잇는 단순 궤적 */
interface TrajectorySimplifier {
    fun simplify(poses: List<Pose>, summary: ManeuverSummary): List<Pose>
}

/**
 * 주차장 진입 감지 (기록 시작 트리거). 상태를 가짐 — 샘플을 순서대로 넣는다.
 * 규칙(기획): 저속(예: < 15km/h)이 일정 시간 이상 + 목적지/주차장 근처(예: 300m 이내) → 진입.
 * 목적지 정보가 없으면(distance null) 저속 지속 + 후진 or 큰 회전으로 판단.
 */
interface ParkingEntryDetector {
    /** @return 이번 샘플로 '주차장 진입'이 확정되면 true (한 번만) */
    fun onSample(sample: VehicleSample, distanceToTargetM: Double?): Boolean
    fun reset()
}

/** 두 좌표 사이 거리(m) */
fun distanceMeters(a: LatLng, b: LatLng): Double {
    val r = 6_371_000.0
    val dLat = Math.toRadians(b.lat - a.lat)
    val dLng = Math.toRadians(b.lng - a.lng)
    val h = Math.sin(dLat / 2).let { it * it } +
        Math.cos(Math.toRadians(a.lat)) * Math.cos(Math.toRadians(b.lat)) * Math.sin(dLng / 2).let { it * it }
    return 2 * r * Math.asin(Math.sqrt(h))
}
