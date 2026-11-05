package com.parkinggack.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.common.BitMatrix
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import com.parkinggack.app.ui.theme.ParkingTheme
import kotlin.math.floor

/** zxing으로 만든 QR. 테마와 상관없이 밝은 바탕에 어두운 점 (스캐너 호환). 칸은 정수 픽셀로 맞춰 틈이 생기지 않게 한다. */
@Composable
fun QrCode(content: String, modifier: Modifier = Modifier, quietZoneModules: Int = 2) {
    val c = ParkingTheme.colors
    val light = if (c.isDark) c.ink else c.surfaceRaised
    val dark = if (c.isDark) c.surface else c.ink
    val matrix = remember(content) { encodeQr(content) }
    Canvas(modifier.semantics { contentDescription = "QR 코드" }) {
        drawRoundRect(light, cornerRadius = CornerRadius(8f * density, 8f * density))
        val m = matrix ?: return@Canvas
        val n = m.width
        val total = n + quietZoneModules * 2
        val cell = floor(minOf(size.width, size.height) / total).coerceAtLeast(1f)
        val origin = Offset(
            floor((size.width - cell * n) / 2),
            floor((size.height - cell * n) / 2),
        )
        for (y in 0 until n) {
            var x = 0
            while (x < n) {
                if (m.get(x, y)) {
                    val start = x
                    while (x < n && m.get(x, y)) x++
                    drawRect(dark, Offset(origin.x + start * cell, origin.y + y * cell), Size((x - start) * cell, cell))
                } else {
                    x++
                }
            }
        }
    }
}

private fun encodeQr(content: String): BitMatrix? = runCatching {
    QRCodeWriter().encode(
        content,
        BarcodeFormat.QR_CODE,
        0,
        0,
        mapOf(
            EncodeHintType.MARGIN to 0,
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
            EncodeHintType.CHARACTER_SET to "UTF-8",
        ),
    )
}.getOrNull()
