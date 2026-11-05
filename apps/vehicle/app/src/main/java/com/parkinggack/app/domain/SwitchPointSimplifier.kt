package com.parkinggack.app.domain

import com.parkinggack.app.model.ManeuverSummary
import com.parkinggack.app.model.Pose

/**
 * 오차가 클 때(summary.approximate) 시작 → 전환점들 → 끝만 남긴 직선 궤적. 아니면 받은 궤적 그대로.
 *
 * 단순화한 궤적에서 `reverse`는 **그 점으로 들어오는 선분**의 진행 방향이다 (첫 점은 첫 선분 방향).
 * → UI는 선분 (i−1 → i)을 poses[i].reverse로 실선/점선을 고르면 된다.
 * (원래 궤적에서도 샘플 간격이 짧아 같은 규칙으로 그려도 결과가 같다.)
 */
class SwitchPointSimplifier : TrajectorySimplifier {

    override fun simplify(poses: List<Pose>, summary: ManeuverSummary): List<Pose> {
        if (!summary.approximate || poses.size <= 2) return poses
        val first = poses.first()
        val last = poses.last()
        val switches = summary.switchPoints.sortedBy { it.tMs }.filter { it.tMs > first.tMs && it.tMs < last.tMs }

        val startReverse = switches.firstOrNull()?.let { !it.toReverse } ?: (poses.count { it.reverse } * 2 > poses.size)
        // (점, 이 점 다음 선분이 후진인지)
        val keys = ArrayList<Pair<Pose, Boolean>>(switches.size + 2)
        keys += first to startReverse
        switches.forEach { keys += it.pose to it.toReverse }
        keys += last to keys.last().second
        return keys.mapIndexed { k, (pose, _) ->
            pose.copy(reverse = if (k == 0) keys[0].second else keys[k - 1].second)
        }
    }
}
