package com.parkinggack.app.data

import com.parkinggack.app.model.VehicleSpec

/**
 * 차종 제원 표 (공개 제원 근사치) — 궤적 계산(축거·조향비)과 난이도 보정(크기 등급)에 쓴다.
 * AAOS INFO_MODEL 문자열(영문/한글)에 별칭이 들어 있으면 매칭. 못 찾으면 기본(중형 세단).
 * 조향비는 공개 값이 드물어 대부분 14 안팎으로 둠 — 실차에서 보정할 것.
 */
object VehicleSpecs {
    private data class Entry(val aliases: List<String>, val spec: VehicleSpec)

    private fun e(name: String, aliases: List<String>, len: Double, width: Double, wb: Double, ratio: Double = 14.0, suv: Boolean = false) =
        Entry(aliases + name, VehicleSpec(name, wb, ratio, len, width, suv))

    private val table = listOf(
        e("그랜저", listOf("grandeur", "azera"), 5.035, 1.880, 2.895, 13.2),
        e("쏘나타", listOf("sonata"), 4.910, 1.860, 2.840, 13.5),
        e("아반떼", listOf("avante", "elantra"), 4.710, 1.825, 2.720, 13.8),
        e("아이오닉 5", listOf("ioniq 5", "ioniq5"), 4.655, 1.890, 3.000, 13.6, suv = true),
        e("아이오닉 6", listOf("ioniq 6", "ioniq6"), 4.855, 1.880, 2.950, 13.6),
        e("코나", listOf("kona"), 4.350, 1.825, 2.660, 13.9, suv = true),
        e("투싼", listOf("tucson"), 4.630, 1.865, 2.755, 13.9, suv = true),
        e("싼타페", listOf("santa fe", "santafe"), 4.830, 1.900, 2.815, 14.2, suv = true),
        e("팰리세이드", listOf("palisade"), 4.995, 1.975, 2.900, 14.5, suv = true),
        e("캐스퍼", listOf("casper"), 3.595, 1.595, 2.400, 14.5),
        e("스타리아", listOf("staria"), 5.255, 1.995, 3.275, 15.5, suv = true),
        e("K5", listOf("k5", "optima"), 4.905, 1.860, 2.850, 13.5),
        e("K8", listOf("k8", "cadenza"), 5.015, 1.875, 2.895, 13.3),
        e("모닝", listOf("morning", "picanto"), 3.595, 1.595, 2.400, 14.5),
        e("레이", listOf("ray"), 3.595, 1.595, 2.520, 14.5),
        e("스포티지", listOf("sportage"), 4.660, 1.865, 2.755, 13.9, suv = true),
        e("쏘렌토", listOf("sorento"), 4.815, 1.900, 2.815, 14.2, suv = true),
        e("카니발", listOf("carnival"), 5.155, 1.995, 3.090, 15.0, suv = true),
        e("EV6", listOf("ev6"), 4.680, 1.880, 2.900, 13.6, suv = true),
        e("EV9", listOf("ev9"), 5.010, 1.980, 3.100, 14.5, suv = true),
        e("G80", listOf("g80"), 5.005, 1.925, 3.010, 13.5),
        e("G90", listOf("g90"), 5.275, 1.930, 3.180, 13.5),
        e("GV70", listOf("gv70"), 4.715, 1.910, 2.875, 13.8, suv = true),
        e("GV80", listOf("gv80"), 4.945, 1.975, 2.955, 14.0, suv = true),
    )

    /** INFO_MODEL(예: "GRANDEUR", "Grandeur Hybrid", "그랜저") → 제원. 못 찾으면 null */
    fun find(model: String?): VehicleSpec? {
        val m = model?.lowercase()?.trim().orEmpty()
        if (m.isEmpty()) return null
        // 긴 별칭부터 (예: "ioniq 5"가 "ioniq"보다 먼저)
        return table.flatMap { en -> en.aliases.map { it.lowercase() to en.spec } }
            .sortedByDescending { it.first.length }
            .firstOrNull { m.contains(it.first) }?.second
    }
}
