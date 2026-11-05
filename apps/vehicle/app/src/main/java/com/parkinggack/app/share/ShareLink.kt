package com.parkinggack.app.share

import com.parkinggack.app.domain.ReturnHints
import com.parkinggack.app.model.ParkingRecord
import java.util.Base64

/**
 * C-07 "폰으로 보내기" 링크. 서버 없이도 폰 웹(apps/mobile, M-01·M-02)이 그릴 수 있게 위치 정보를 URL fragment(#)에 담는다.
 * fragment는 서버로 전송되지 않으므로 위치가 서버 로그에 남지 않음.
 *
 * 형식: `{BASE_URL}/p/{id}#{base64url(UTF-8 JSON), 패딩 없음}`
 * ```
 * {"v":1,"lot":"아브뉴프랑 판교 주차장","f":"B2","z":"D","n":"07","t":1793685120000,"m":"엘리베이터 2번 쪽",
 *  "h":["램프를 다 내려와서 곧장","오른쪽 칸 줄, 약 15m 지점"],"r":[1,17,-1]}
 * ```
 * - z, n은 없으면 빈 문자열. m(메모), h(돌아가는 길 힌트 ≤4줄), r(힌트 그림용 압축 경로, [ReturnRoute.code])은 있을 때만
 * - 키 순서 고정(v, lot, f, z, n, t, m, h, r) — 테스트 벡터가 양쪽(ShareLinkTest ↔ apps/mobile/src/payload.test.ts)에서 같음
 * - apps/mobile 이 이 형식을 읽는다 — 바꾸면 양쪽 같이 고칠 것 (apps/mobile/README.md "링크 형식")
 */
object ShareLink {
    /**
     * 폰 웹 배포 주소 (apps/mobile → Netlify 사이트 "parkinggack"). 끝에 / 없이.
     * 다른 곳에 배포하면 여기만 바꾸면 된다 — apps/mobile/README.md "배포" 참고.
     */
    const val BASE_URL = "https://parkinggack.vercel.app"

    const val VERSION = 1

    /** 기록의 궤적으로 돌아가는 길 힌트까지 넣은 링크. 궤적이 대략적(approximate)이면 힌트는 넣지 않는다 */
    fun build(record: ParkingRecord, base: String = BASE_URL): String {
        val route = if (record.summary?.approximate == true) null else ReturnHints.route(record.trajectory, record.floor)
        return build(record, route?.lines.orEmpty(), route?.code, base)
    }

    fun build(record: ParkingRecord, hints: List<String>, route: List<Int>?, base: String = BASE_URL): String =
        "${base.trimEnd('/')}/p/${shortId(record)}#${encode(payloadJson(record, hints, route))}"

    /** 화면에 보여 줄 짧은 링크 (fragment 제외) */
    fun display(record: ParkingRecord, base: String = BASE_URL) =
        base.trimEnd('/').removePrefix("https://") + "/p/" + shortId(record)

    /** base64url(UTF-8), 패딩 없음 */
    fun encode(json: String): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(json.toByteArray(Charsets.UTF_8))

    fun decode(payload: String): String = String(Base64.getUrlDecoder().decode(payload), Charsets.UTF_8)

    fun payloadJson(record: ParkingRecord, hints: List<String> = emptyList(), route: List<Int>? = null): String = buildString {
        append("{\"v\":").append(VERSION)
        append(",\"lot\":").appendJson(record.lotName)
        append(",\"f\":").appendJson(record.floor.orEmpty())
        append(",\"z\":").appendJson(record.zone.orEmpty())
        append(",\"n\":").appendJson(record.number.orEmpty())
        append(",\"t\":").append(record.parkedAtMs)
        record.note?.takeIf { it.isNotBlank() }?.let { append(",\"m\":").appendJson(it) }
        val h = hints.filter { it.isNotBlank() }.take(MAX_HINTS)
        if (h.isNotEmpty()) {
            append(",\"h\":[")
            h.forEachIndexed { i, s -> if (i > 0) append(','); appendJson(s) }
            append(']')
        }
        if (h.isNotEmpty() && !route.isNullOrEmpty()) append(",\"r\":").append(route.joinToString(",", "[", "]"))
        append('}')
    }

    const val MAX_HINTS = 4

    private fun shortId(record: ParkingRecord) = record.id.filter { it.isLetterOrDigit() }.takeLast(6).lowercase()

    private fun StringBuilder.appendJson(s: String): StringBuilder {
        append('"')
        for (ch in s) {
            when {
                ch == '"' -> append("\\\"")
                ch == '\\' -> append("\\\\")
                ch == '\n' -> append("\\n")
                ch == '\r' -> append("\\r")
                ch == '\t' -> append("\\t")
                ch < ' ' || ch == '\u2028' || ch == '\u2029' -> append("\\u%04x".format(ch.code))
                else -> append(ch)
            }
        }
        return append('"')
    }
}
