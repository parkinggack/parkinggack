package com.parkinggack.app.share

import com.parkinggack.app.domain.ReturnHints
import com.parkinggack.app.model.ParkingRecord
import com.parkinggack.app.net.ApiClient
import com.parkinggack.app.net.ApiResult
import com.parkinggack.app.net.SharePayloadDto

/** C-07에 보여 줄 링크 */
data class ShareTarget(
    /** QR에 넣을 전체 주소 */
    val url: String,
    /** QR 아래 글자 (https:// 뺀 것) */
    val display: String,
    /** 서버 짧은 링크면 true, 오프라인 fragment 링크면 false */
    val short: Boolean,
)

/**
 * 폰으로 보내기 링크. 서버가 되면 짧은 링크(/s/code — QR이 성글어 잘 찍힘), 안 되면 위치를 URL에 담은 링크(/p/..#..).
 * 두 링크 모두 apps/mobile 이 같은 화면(M-01·M-02)으로 연다.
 */
class ShareService(private val api: ApiClient?, private val webBase: String) {

    /** 네트워크 없이 바로 만들 수 있는 링크 */
    fun offline(record: ParkingRecord): ShareTarget {
        val url = ShareLink.build(record, base = webBase)
        return ShareTarget(url, ShareLink.display(record, base = webBase), short = false)
    }

    /**
     * 서버 짧은 링크. 실패하면 null (→ offline 링크 유지).
     * 시연·예시 기록(staysOnDevice)은 서버에 만들지 않는다 — sim·시연을 돌릴 때마다 운영 DB에 링크가 쌓이고
     * 대시보드 '공유 링크' 수가 부풀었다 (docs/sim-findings.md 2-4). 위치를 담은 /p/ 링크로도 폰에서 같은 화면이 열린다
     */
    suspend fun shorten(record: ParkingRecord): ShareTarget? {
        if (record.staysOnDevice) return null
        val api = api ?: return null
        return when (val r = api.createShare(payload(record))) {
            is ApiResult.Ok -> ShareTarget(r.value.url, r.value.url.removePrefix("https://").removePrefix("http://"), short = true)
            else -> null
        }
    }

    /** ShareLink.payloadJson 과 같은 내용 (서버 저장용) */
    fun payload(record: ParkingRecord): SharePayloadDto {
        val route = if (record.summary?.approximate == true) null else ReturnHints.route(record.trajectory, record.floor)
        val hints = route?.lines.orEmpty().filter { it.isNotBlank() }.take(ShareLink.MAX_HINTS)
        return SharePayloadDto(
            v = ShareLink.VERSION,
            lot = record.lotName,
            f = record.floor.orEmpty(),
            z = record.zone.orEmpty(),
            n = record.number.orEmpty(),
            t = record.parkedAtMs,
            m = record.note?.takeIf { it.isNotBlank() },
            h = hints.ifEmpty { null },
            r = if (hints.isNotEmpty()) route?.code?.takeIf { it.isNotEmpty() } else null,
        )
    }
}
