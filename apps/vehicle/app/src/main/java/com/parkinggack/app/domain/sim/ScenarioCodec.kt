package com.parkinggack.app.domain.sim

import com.parkinggack.app.model.Gear
import com.parkinggack.app.model.VehicleSample

/**
 * 차량 신호 녹화 파일 형식 (텍스트, 한 줄에 샘플 하나):
 *
 * ```
 * # parkinggack-signals v1: t_ms,speed_mps,steer_deg,gear,brake
 * 0,6.944,0.31,D,0
 * 100,6.951,-0.12,D,0
 * ```
 * - gear: P R N D U (읽을 땐 PARK/REVERSE… 전체 이름도 받음)
 * - brake: 1 / 0 / 빈칸(모름). 읽을 땐 true/false도 받음
 * - '#'로 시작하는 줄과 빈 줄은 무시
 * - 숫자는 Kotlin toString(로캘 무관, 최단 표현)이라 Float 값이 그대로 왕복한다
 */
object ScenarioCodec {
    const val HEADER = "# parkinggack-signals v1: t_ms,speed_mps,steer_deg,gear,brake"

    fun encode(samples: List<VehicleSample>, header: Boolean = true): String = buildString {
        if (header) append(HEADER).append('\n')
        samples.forEach { append(encodeLine(it)).append('\n') }
    }

    fun encodeLine(s: VehicleSample): String =
        "${s.timestampMs},${s.speedMps},${s.steeringDeg},${gearCode(s.gear)},${brakeCode(s.brakePressed)}"

    /**
     * @param strict true면 잘못된 줄에서 [IllegalArgumentException](줄 번호 포함).
     *   false(기본)면 그 줄만 건너뜀 — 녹화 중 앱이 죽어 마지막 줄이 잘린 파일도 재생되게.
     */
    fun decode(text: String, strict: Boolean = false): List<VehicleSample> {
        val out = ArrayList<VehicleSample>()
        text.lineSequence().forEachIndexed { i, raw ->
            val parsed = runCatching { decodeLine(raw) }
            parsed.exceptionOrNull()?.let { if (strict) throw IllegalArgumentException("line ${i + 1}: ${it.message}", it) }
            parsed.getOrNull()?.let(out::add)
        }
        return out
    }

    /** 주석·빈 줄이면 null, 형식이 틀리면 예외 */
    fun decodeLine(line: String): VehicleSample? {
        val l = line.trim()
        if (l.isEmpty() || l.startsWith("#")) return null
        val f = l.split(',').map { it.trim() }
        require(f.size == 4 || f.size == 5) { "expected 5 fields, got ${f.size}: '$l'" }
        return VehicleSample(
            timestampMs = f[0].toLongOrNull() ?: throw IllegalArgumentException("bad t '${f[0]}'"),
            speedMps = f[1].toFloatOrNull() ?: throw IllegalArgumentException("bad speed '${f[1]}'"),
            steeringDeg = f[2].toFloatOrNull() ?: throw IllegalArgumentException("bad steer '${f[2]}'"),
            gear = parseGear(f[3]),
            brakePressed = parseBrake(f.getOrElse(4) { "" }),
        )
    }

    private fun gearCode(g: Gear) = when (g) {
        Gear.PARK -> "P"; Gear.REVERSE -> "R"; Gear.NEUTRAL -> "N"; Gear.DRIVE -> "D"; Gear.UNKNOWN -> "U"
    }

    private fun brakeCode(b: Boolean?) = when (b) { true -> "1"; false -> "0"; null -> "" }

    private fun parseGear(s: String): Gear = when (s.uppercase()) {
        "P", "PARK" -> Gear.PARK
        "R", "REVERSE" -> Gear.REVERSE
        "N", "NEUTRAL" -> Gear.NEUTRAL
        "D", "DRIVE" -> Gear.DRIVE
        "U", "UNKNOWN", "" -> Gear.UNKNOWN
        else -> throw IllegalArgumentException("bad gear '$s'")
    }

    private fun parseBrake(s: String): Boolean? = when (s.lowercase()) {
        "1", "true" -> true
        "0", "false" -> false
        "" -> null
        else -> throw IllegalArgumentException("bad brake '$s'")
    }
}
