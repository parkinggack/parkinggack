package com.parkinggack.app.domain

import com.parkinggack.app.model.Pose
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * 폰 M-02 "돌아가는 길 힌트"용 길 요약. 걸어서 **차를 찾아가는 순서**(기준점 → 차)로 적는다.
 *
 * @property start 걸음을 시작하는 기준점: 주차장 입구(기록 시작점) 또는 나선 램프가 끝나는 곳
 * @property legs 기준점에서 차까지 곧은 구간들. legs[0].turn = null, 이후는 그 구간에 들어가기 전에 꺾는 방향.
 *   마지막 구간 길이 = 그 통로에 들어서서 차 옆까지 거리
 * @property stallSide 마지막 통로에서 차가 있는 쪽 (모르면 null)
 * @property lines 화면에 보여 줄 한 줄 힌트 (최대 4줄)
 */
data class ReturnRoute(
    val start: Start,
    val legs: List<Leg>,
    val stallSide: Side?,
    val lines: List<String>,
) {
    enum class Start(val code: Int) { ENTRY(0), RAMP(1) }
    enum class Turn(val code: Int) { LEFT(1), RIGHT(-1), U_LEFT(2), U_RIGHT(-2) }
    enum class Side(val code: Int) { LEFT(1), RIGHT(-1) }
    data class Leg(val turn: Turn?, val lengthM: Double)

    /**
     * 폰이 작은 그림을 그릴 때 쓰는 압축 표기 (링크의 "r"): `[start, L0, T1, L1, …, Tk, Lk, side]`.
     * start 0=입구 1=램프 · L 미터(정수) · T 1=왼쪽 −1=오른쪽 ±2=크게 돌아 옆 통로 · side 1=왼쪽 −1=오른쪽 0=모름.
     * 구간이 없으면 null (그림 없이 글만).
     */
    val code: List<Int>?
        get() {
            if (legs.isEmpty()) return null
            val out = mutableListOf(start.code, legs[0].lengthM.roundToInt())
            legs.drop(1).forEach { out += (it.turn ?: return null).code; out += it.lengthM.roundToInt() }
            out += stallSide?.code ?: 0
            return out
        }
}

/**
 * 차가 지나온 궤적([Pose], 진입~P)을 **끝(주차한 자리)에서 거꾸로 읽어** 걸어서 돌아갈 때의 대략적인 힌트를 만든다.
 * 순수 함수 — android 의존 없음.
 *
 * 1. 궤적을 '전진 구간 + 후진 덩어리' 걸음으로 나누고, 곡률(|Δheading|/거리)이 큰 걸음을 같은 방향끼리 묶어 '꺾음'을 찾는다
 *    (같은 방향 꺾음 사이 직선이 [Config.mergeGapM] 이하면 하나로 — 나선 램프 층 사이 짧은 직선).
 * 2. 한 방향으로 [Config.rampMinDeg](270°) 이상 돈 전진 꺾음 = 나선 램프. 마지막 램프 이전은 버리고 '램프 끝'을 기준점으로
 *    (램프를 몇 바퀴 돌았는지는 걸어서는 의미가 없음). 램프가 없으면 기록 시작점을 '주차장 입구'로 본다.
 * 3. 끝에서 거꾸로 훑어 마지막으로 곧게 [Config.aisleMinM] 이상 전진한 구간 = 차를 댄 통로.
 *    그 뒤(지나쳐 멈춤·후진·칸에 들어가기)는 '주차 동작'이라 길 안내에서 뺀다.
 *    최종 위치가 통로 선의 왼쪽/오른쪽 어디인지 → "왼쪽 칸 줄", 통로를 따라 얼마나 가야 하는지 → "약 15m 지점".
 * 4. 기준점 ~ 통로 사이 [Config.turnMinDeg](45°) 이상 꺾음을 왼쪽/오른쪽(150° 이상은 '돌아 옆 통로')으로 적는다.
 * 5. 꺾음이 2번 이하면 "…에서 곧장 → 약 10m 가서 오른쪽 → 왼쪽 칸 줄, 약 30m 지점" (최대 4줄).
 *    더 많으면(자리를 찾아 돌아다닌 경우) 지나온 순서 대신 기준점에서 곧게 가는 방향·거리 2줄로 줄인다.
 *
 * 거리는 5m(50m 넘으면 10m) 단위로 반올림한 "약 Nm", 5m 미만은 "바로". 오차가 큰 추측항법이라 폰 화면에
 * "차가 지나온 길로 계산한 힌트예요. 실제와 조금 다를 수 있어요"를 반드시 같이 보여 준다.
 */
object ReturnHints {

    data class Config(
        /** 이 곡률(°/m) 이상이면 꺾는 중 (반지름 약 28m 이하) */
        val turnRateDegPerM: Double = 2.0,
        /** 후진 덩어리는 heading이 이만큼 바뀌면 꺾음으로 침 */
        val reverseTurnMinDeg: Double = 5.0,
        val mergeGapM: Double = 6.0,
        val turnMinDeg: Double = 45.0,
        val uTurnMinDeg: Double = 150.0,
        val rampMinDeg: Double = 270.0,
        val rampMinLengthM: Double = 15.0,
        /** 곧은 구간 heading 폭 */
        val straightSpanDeg: Double = 12.0,
        val aisleMinM: Double = 7.0,
        val aisleFallbackMinM: Double = 3.0,
        /** 통로 선에서 이만큼 옆이어야 왼쪽/오른쪽 칸이라고 말함 */
        val sideMinM: Double = 1.5,
        /** 이보다 짧으면 "바로" */
        val nearM: Double = 5.0,
        val maxDetailedTurns: Int = 2,
    )

    val defaultConfig = Config()

    /** 힌트 줄만 (없으면 빈 목록) */
    fun from(poses: List<Pose>, floor: String? = null, config: Config = defaultConfig): List<String> =
        route(poses, floor, config)?.lines.orEmpty()

    /**
     * @param floor 주차한 층("B2", "3F"). 램프를 내려왔는지 올라왔는지 문구에만 쓴다 (모르면 "램프를 다 지나서")
     * @return 궤적이 너무 짧거나(이동 3m 미만) 비어 있으면 null
     */
    fun route(poses: List<Pose>, floor: String? = null, config: Config = defaultConfig): ReturnRoute? {
        if (poses.size < 2) return null
        val c = config
        val n = poses.size
        val head = DoubleArray(n) { poses[it].headingRad }

        // 전진 누적 거리 (후진으로 움직인 거리는 걷는 길에 넣지 않음)
        val cumF = DoubleArray(n)
        var total = 0.0
        for (k in 1 until n) {
            val d = hypot(poses[k].x - poses[k - 1].x, poses[k].y - poses[k - 1].y)
            total += d
            cumF[k] = cumF[k - 1] + if (poses[k].reverse) 0.0 else d
        }
        if (total < MIN_PATH_M) return null

        val steps = steps(poses, cumF)
        val events = turnEvents(steps, head, cumF, c)

        // 마지막 나선 램프 → 그 끝이 기준점
        val ramp = events.lastOrNull { abs(it.angleDeg) >= c.rampMinDeg && it.forwardOnly && it.lengthM >= c.rampMinLengthM }
        val startPose = ramp?.to ?: 0
        val start = if (ramp != null) ReturnRoute.Start.RAMP else ReturnRoute.Start.ENTRY
        val rampDir = rampDirection(floor)
        val final = poses.last()

        // 곧은 구간은 꺾음 끝(핸들 푸는 꼬리)과 조금 겹칠 수 있음 → 기준점 앞부분만 잘라 씀
        val runs = straightRuns(steps, head, cumF, c).mapNotNull { r ->
            when {
                r.to <= startPose -> null
                r.from >= startPose -> r
                else -> Run(startPose, r.to, cumF[r.to] - cumF[startPose], r.headingRad)
            }
        }
        val aisle = runs.lastOrNull { it.lengthM >= c.aisleMinM } ?: runs.lastOrNull { it.lengthM >= c.aisleFallbackMinM }
        if (aisle == null) {
            // 램프(입구)를 지나자마자 댐
            val legs = listOf(ReturnRoute.Leg(null, cumF[n - 1] - cumF[startPose]))
            return ReturnRoute(start, legs, null, listOf("${place(start, rampDir)} 바로 근처"))
        }

        // 통로 기준 최종 위치: 앞(+along) / 왼쪽(+lateral)
        val origin = poses[aisle.from]
        val dx = final.x - origin.x
        val dy = final.y - origin.y
        val along = dx * -sin(aisle.headingRad) + dy * cos(aisle.headingRad)
        val lateral = dx * -cos(aisle.headingRad) + dy * -sin(aisle.headingRad)
        val side = when {
            lateral >= c.sideMinM -> ReturnRoute.Side.LEFT
            lateral <= -c.sideMinM -> ReturnRoute.Side.RIGHT
            else -> null
        }

        val turns = events.filter {
            it !== ramp && it.from >= startPose && it.from < aisle.from && abs(it.angleDeg) >= c.turnMinDeg
        }

        if (turns.size > c.maxDetailedTurns) return straightLine(poses, startPose, start, rampDir, c)

        val legs = mutableListOf<ReturnRoute.Leg>()
        var legStart = startPose
        var turn: ReturnRoute.Turn? = null
        for (e in turns) {
            legs += ReturnRoute.Leg(turn, (cumF[e.from] - cumF[legStart]).coerceAtLeast(0.0))
            turn = turnOf(e.angleDeg, c)
            legStart = e.to
        }
        // along은 통로 시작점 기준. 마지막 꺾음 끝이 통로 시작보다 뒤면(겹침) 그만큼 빼서 꺾은 곳부터 거리로
        val lastLeg = (cumF[aisle.from] - cumF[legStart] + along).coerceAtLeast(0.0)
        legs += ReturnRoute.Leg(turn, lastLeg)
        return ReturnRoute(start, legs, side, detailedLines(start, rampDir, legs, side, c))
    }

    // ---- 문구 ----

    private fun detailedLines(
        start: ReturnRoute.Start,
        rampDir: Int,
        legs: List<ReturnRoute.Leg>,
        side: ReturnRoute.Side?,
        c: Config,
    ): List<String> {
        val out = mutableListOf<String>()
        val from = startPhrase(start, rampDir)
        if (legs.size == 1) {
            if (legs[0].lengthM < c.nearM && side == null) return listOf("${place(start, rampDir)} 바로 근처")
            out += "$from 곧장"
        } else if (legs[0].lengthM < c.nearM) {
            out += "$from 바로 ${turnWord(legs[1].turn)}"
        } else {
            out += "$from 곧장"
            out += "${approx(legs[0].lengthM)} 가서 ${turnWord(legs[1].turn)}"
        }
        for (k in 2 until legs.size) {
            val before = legs[k - 1].lengthM
            out += if (before < c.nearM) "바로 ${turnWord(legs[k].turn)}" else "${approx(before)} 가서 ${turnWord(legs[k].turn)}"
        }
        val last = legs.last().lengthM
        out += when {
            side != null && last < c.nearM -> "바로 ${sideWord(side)} 칸 줄"
            side != null -> "${sideWord(side)} 칸 줄, ${approx(last)} 지점"
            last < c.nearM -> "바로 근처"
            else -> "통로 따라 ${approx(last)} 지점"
        }
        return out
    }

    /** 자리를 찾느라 여러 번 꺾었으면 지나온 순서 대신 기준점에서 곧게: 앞으로 얼마, 옆으로 얼마 */
    private fun straightLine(poses: List<Pose>, startPose: Int, start: ReturnRoute.Start, rampDir: Int, c: Config): ReturnRoute {
        val o = poses[startPose]
        val f = poses.last()
        val dx = f.x - o.x
        val dy = f.y - o.y
        val fwd = dx * -sin(o.headingRad) + dy * cos(o.headingRad)
        val left = dx * -cos(o.headingRad) + dy * -sin(o.headingRad)
        val ref = place(start, rampDir)
        val near = c.nearM
        val lines = mutableListOf<String>()
        if (abs(fwd) >= near) lines += "${ref}에서 ${if (fwd > 0) "앞쪽" else "뒤쪽"}으로 ${approx(abs(fwd))}"
        if (abs(left) >= near) {
            val sideText = "${if (left > 0) "왼쪽" else "오른쪽"}으로 ${approx(abs(left))}"
            lines += if (lines.isEmpty()) "${ref}에서 $sideText" else sideText
        }
        if (lines.isEmpty()) lines += "$ref 바로 근처"

        val legs = when {
            fwd < -near -> emptyList() // 뒤쪽: 그림으로 그리지 않음
            abs(left) < near -> listOf(ReturnRoute.Leg(null, fwd.coerceAtLeast(0.0)))
            else -> listOf(
                ReturnRoute.Leg(null, fwd.coerceAtLeast(0.0)),
                ReturnRoute.Leg(if (left > 0) ReturnRoute.Turn.LEFT else ReturnRoute.Turn.RIGHT, abs(left)),
            )
        }
        return ReturnRoute(start, legs, null, lines)
    }

    private fun startPhrase(start: ReturnRoute.Start, rampDir: Int) = when (start) {
        ReturnRoute.Start.ENTRY -> "주차장 입구에서"
        ReturnRoute.Start.RAMP -> when {
            rampDir < 0 -> "램프를 다 내려와서"
            rampDir > 0 -> "램프를 다 올라와서"
            else -> "램프를 다 지나서"
        }
    }

    private fun place(start: ReturnRoute.Start, rampDir: Int) = when (start) {
        ReturnRoute.Start.ENTRY -> "주차장 입구"
        ReturnRoute.Start.RAMP -> when {
            rampDir < 0 -> "램프를 다 내려온 곳"
            rampDir > 0 -> "램프를 다 올라온 곳"
            else -> "램프가 끝나는 곳"
        }
    }

    private fun turnWord(t: ReturnRoute.Turn?) = when (t) {
        ReturnRoute.Turn.LEFT -> "왼쪽"
        ReturnRoute.Turn.RIGHT -> "오른쪽"
        ReturnRoute.Turn.U_LEFT -> "왼쪽으로 돌아 옆 통로"
        ReturnRoute.Turn.U_RIGHT -> "오른쪽으로 돌아 옆 통로"
        null -> "곧장"
    }

    private fun sideWord(s: ReturnRoute.Side) = if (s == ReturnRoute.Side.LEFT) "왼쪽" else "오른쪽"

    private fun turnOf(angleDeg: Double, c: Config) = when {
        angleDeg >= c.uTurnMinDeg -> ReturnRoute.Turn.U_LEFT
        angleDeg <= -c.uTurnMinDeg -> ReturnRoute.Turn.U_RIGHT
        angleDeg > 0 -> ReturnRoute.Turn.LEFT
        else -> ReturnRoute.Turn.RIGHT
    }

    /** "약 15m" — 50m 미만은 5m, 그 이상은 10m 단위 */
    internal fun approx(m: Double): String {
        val v = if (m < 50.0) maxOf(5, (m / 5.0).roundToInt() * 5) else (m / 10.0).roundToInt() * 10
        return "약 ${v}m"
    }

    /** 층 이름으로 램프 방향: −1 내려옴(지하), +1 올라옴(2층 이상), 0 모름 */
    internal fun rampDirection(floor: String?): Int {
        val f = floor?.trim()?.uppercase().orEmpty()
        if (f.isEmpty()) return 0
        if (f.startsWith("B") || f.startsWith("지하")) return -1
        val level = Regex("^(\\d+)\\s*(F|층)$").find(f)?.groupValues?.get(1)?.toIntOrNull() ?: return 0
        return if (level >= 2) 1 else 0
    }

    // ---- 궤적 나누기 ----

    /** from→to 한 걸음. 전진은 샘플 한 칸, 후진은 이어진 덩어리 하나(걷는 거리 0) */
    private class Step(val from: Int, val to: Int, val lengthM: Double, val dHeading: Double, val reverse: Boolean)

    private class TurnEvent(val from: Int, val to: Int, val angleDeg: Double, val lengthM: Double, val forwardOnly: Boolean)

    private class Run(val from: Int, val to: Int, val lengthM: Double, val headingRad: Double)

    private fun steps(poses: List<Pose>, cumF: DoubleArray): List<Step> {
        val out = ArrayList<Step>(poses.size)
        var k = 1
        while (k < poses.size) {
            if (poses[k].reverse) {
                var j = k
                while (j + 1 < poses.size && poses[j + 1].reverse) j++
                out += Step(k - 1, j, 0.0, poses[j].headingRad - poses[k - 1].headingRad, reverse = true)
                k = j + 1
            } else {
                out += Step(k - 1, k, cumF[k] - cumF[k - 1], poses[k].headingRad - poses[k - 1].headingRad, reverse = false)
                k++
            }
        }
        return out
    }

    private fun turnEvents(steps: List<Step>, head: DoubleArray, cumF: DoubleArray, c: Config): List<TurnEvent> {
        val out = mutableListOf<TurnEvent>()
        val rate = Math.toRadians(c.turnRateDegPerM)
        val revMin = Math.toRadians(c.reverseTurnMinDeg)
        var sign = 0
        var from = -1
        var to = -1
        var forwardOnly = true
        var gap = 0.0
        fun close() {
            if (sign != 0) out += TurnEvent(from, to, Math.toDegrees(head[to] - head[from]), cumF[to] - cumF[from], forwardOnly)
            sign = 0
        }
        for (s in steps) {
            val turning = if (s.reverse) abs(s.dHeading) >= revMin else s.lengthM > 1e-6 && abs(s.dHeading) / s.lengthM >= rate
            if (!turning) {
                gap += s.lengthM
                if (sign != 0 && gap > c.mergeGapM) close()
                continue
            }
            val sg = if (s.dHeading > 0) 1 else -1
            if (sign == sg) {
                to = s.to
            } else {
                close()
                sign = sg; from = s.from; to = s.to; forwardOnly = true
            }
            if (s.reverse) forwardOnly = false
            gap = 0.0
        }
        close()
        return out
    }

    private fun straightRuns(steps: List<Step>, head: DoubleArray, cumF: DoubleArray, c: Config): List<Run> {
        val out = mutableListOf<Run>()
        val span = Math.toRadians(c.straightSpanDeg)
        var from = -1
        var to = -1
        var lo = 0.0
        var hi = 0.0
        var weighted = 0.0
        var len = 0.0
        fun close() {
            if (from >= 0 && len > 0) out += Run(from, to, len, weighted / len)
            from = -1; len = 0.0; weighted = 0.0
        }
        for (s in steps) {
            if (s.reverse) { close(); continue }
            if (s.lengthM <= 1e-6) continue // 멈춰 있음
            val h1 = head[s.to]
            if (from >= 0 && maxOf(hi, h1) - minOf(lo, h1) <= span) {
                to = s.to; lo = minOf(lo, h1); hi = maxOf(hi, h1)
            } else {
                close()
                from = s.from; to = s.to; lo = minOf(head[s.from], h1); hi = maxOf(head[s.from], h1)
                if (hi - lo > span) { from = -1; continue } // 이 걸음 자체가 꺾는 중
            }
            len += s.lengthM
            weighted += s.lengthM * (head[s.from] + h1) / 2.0
        }
        close()
        return out
    }

    private const val MIN_PATH_M = 3.0
}
