package com.parkinggack.app.ui.components

import android.annotation.SuppressLint
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Path
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.parkinggack.app.model.LatLng
import com.parkinggack.app.ui.theme.ParkingTheme
import com.parkinggack.app.ui.theme.sized
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.MapTileProviderBasic
import org.osmdroid.tileprovider.tilesource.OnlineTileSourceBase
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.MapTileIndex
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Overlay
import org.osmdroid.views.overlay.TilesOverlay
import java.io.File
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sin

/** 지도 위 내 차 위치 (heading: 북쪽 0°, 시계 방향) */
data class CarPosition(val location: LatLng, val headingDeg: Float? = null)

/** 위치를 모를 때 보여 줄 곳: 판교역 */
private val DEFAULT_CENTER = LatLng(37.3947, 127.1112)

/** 내 위치가 목적지에서 이보다 멀면(에뮬레이터 기본 GPS 등) 목적지 쪽을 보여 준다 */
private const val FAR_FROM_DEST_M = 30_000.0

/**
 * 주행 중(C-04)·도착지 카드(C-02) 바탕 지도. 시안의 어두운 회색 지도에 맞춰 Esri Dark Gray Canvas 타일(OSM 데이터 포함)을 쓴다.
 *
 * Pleos NaviHelper에는 내비 지도를 앱 안에 넣는 API가 없어(requestNavigationScreen으로 내비를 앞으로 띄우는 것만 있음)
 * 앱 안 지도를 직접 그린다. 경로선은 없고 내 차·목적지만.
 * - **터치 입력 없음** (주행 중 규칙). 지도는 내 차(없으면 목적지)를 따라간다
 * - 스냅숏(Paparazzi)·미리보기에서는 네트워크가 없으므로 [fallback]을 그린다
 */
@Composable
fun LiveMap(
    car: CarPosition?,
    destination: LatLng?,
    modifier: Modifier = Modifier,
    zoom: Double = 16.0,
    fallback: @Composable () -> Unit,
) {
    if (LocalInspectionMode.current) {
        Box(modifier) { fallback() }
        return
    }
    val colors = ParkingTheme.colors
    val context = LocalContext.current
    // 앱은 시안 비율로 키워 그리므로(DesignScale) 지도 글자·타일도 같은 배율로
    val scale = LocalDensity.current.density / context.resources.displayMetrics.density
    val pins = remember { PinsOverlay() }
    pins.ink = colors.ink.toArgb()
    pins.ground = colors.surface.toArgb()
    pins.scale = scale * context.resources.displayMetrics.density

    Box(modifier) {
        AndroidView(
            factory = { ctx -> createMap(ctx, scale, zoom).also { it.overlays.add(pins) } },
            update = { map ->
                pins.car = car?.let { GeoPoint(it.location.lat, it.location.lng) }
                pins.headingDeg = car?.headingDeg
                pins.destination = destination?.let { GeoPoint(it.lat, it.lng) }
                val near = car != null && (destination == null || distanceMeters(car.location, destination) < FAR_FROM_DEST_M)
                val center = when {
                    near -> car!!.location
                    destination != null -> destination
                    else -> car?.location ?: DEFAULT_CENTER
                }
                map.controller.setCenter(GeoPoint(center.lat, center.lng))
                map.invalidate()
            },
        )
        // 왼쪽은 C-02 카드가 덮으므로 오른쪽 아래
        MapAttribution(Modifier.align(Alignment.BottomEnd).padding(16.dp))
    }
}

/**
 * C-03 더 쉬운 주차장 지도: 도착지(가운데 점 핀)와 후보 주차장(번호 핀 1·2·3, 카드 순서와 같음).
 * 모든 핀이 들어오게 범위를 맞추고, 지도는 움직이지 않는다 (터치 입력 없음 — 정차 중 화면이지만 지도 조작은 필요 없음).
 */
@Composable
fun LotsMap(
    destination: LatLng,
    candidates: List<LatLng>,
    modifier: Modifier = Modifier,
    fallback: @Composable () -> Unit,
) {
    if (LocalInspectionMode.current) {
        Box(modifier) { fallback() }
        return
    }
    val colors = ParkingTheme.colors
    val context = LocalContext.current
    val scale = LocalDensity.current.density / context.resources.displayMetrics.density
    val pins = remember { PinsOverlay() }
    pins.ink = colors.ink.toArgb()
    pins.ground = colors.surface.toArgb()
    pins.scale = scale * context.resources.displayMetrics.density

    Box(modifier) {
        AndroidView(
            factory = { ctx -> createMap(ctx, scale, MAX_TILE_ZOOM.toDouble()).also { it.overlays.add(pins) } },
            update = { map ->
                pins.destination = GeoPoint(destination.lat, destination.lng)
                pins.numbered = candidates.map { GeoPoint(it.lat, it.lng) }
                val points = listOf(destination) + candidates
                // 핀 반지름(번호 핀 22dp)이 가장자리에서 잘리지 않게 여백
                val border = (56 * pins.scale).toInt()
                val fit = {
                    if (points.size == 1) {
                        map.controller.setZoom(MAX_TILE_ZOOM.toDouble())
                        map.controller.setCenter(GeoPoint(destination.lat, destination.lng))
                    } else {
                        val box = BoundingBox.fromGeoPointsSafe(points.map { GeoPoint(it.lat, it.lng) })
                        map.zoomToBoundingBox(box, false, border)
                        // 소수 배율이면 타일을 늘려 그려 글자가 크고 흐려진다 → 정수 단계로 내림(핀은 더 안쪽으로), 타일 한계 16까지
                        map.controller.setZoom(floor(map.zoomLevelDouble).coerceAtMost(MAX_TILE_ZOOM.toDouble()))
                    }
                    map.invalidate()
                }
                if (map.isLayoutOccurred) fit() else map.addOnFirstLayoutListener { _, _, _, _, _ -> fit() }
            },
        )
        MapAttribution(Modifier.align(Alignment.BottomEnd).padding(12.dp))
    }
}

/** 지도 출처 표시 (Esri 타일 이용 조건 — 지우지 말 것) */
@Composable
private fun MapAttribution(modifier: Modifier) {
    val colors = ParkingTheme.colors
    Text(
        "Esri · © OpenStreetMap",
        style = ParkingTheme.type.caption.sized(14.sp, 1.2f),
        color = colors.inkMuted,
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(colors.surface.copy(alpha = 0.8f))
            .padding(horizontal = 8.dp, vertical = 4.dp),
    )
}

/**
 * Esri 'Dark Gray Canvas' (API 키 없이 받을 수 있음, 2026-11-03 확인. CARTO dark_all은 이제 키가 없으면 워터마크 타일).
 * URL 순서가 {z}/{y}/{x}라 XYTileSource 대신 직접 만든다. Canvas 지도는 16레벨까지.
 */
private fun esriTiles(name: String, service: String) = object : OnlineTileSourceBase(
    name, 3, MAX_TILE_ZOOM, 256, "",
    arrayOf("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/$service/MapServer/tile/"),
    "Esri, © OpenStreetMap contributors",
) {
    override fun getTileURLString(index: Long): String =
        baseUrl + MapTileIndex.getZoom(index) + "/" + MapTileIndex.getY(index) + "/" + MapTileIndex.getX(index)
}

private const val MAX_TILE_ZOOM = 16
private val DARK_GRAY_BASE = esriTiles("EsriDarkGrayBase", "World_Dark_Gray_Base")
private val DARK_GRAY_LABELS = esriTiles("EsriDarkGrayReference", "World_Dark_Gray_Reference")

/** 바탕 타일(#4a4a4a 안팎)을 시안의 먹색(#1e1e1e)으로 낮추고 도로 대비는 살린다: v' = 1.4·v − 70 */
private val DARKEN = ColorMatrixColorFilter(
    ColorMatrix(
        floatArrayOf(
            1.4f, 0f, 0f, 0f, -70f,
            0f, 1.4f, 0f, 0f, -70f,
            0f, 0f, 1.4f, 0f, -70f,
            0f, 0f, 0f, 1f, 0f,
        ),
    ),
)

@SuppressLint("ClickableViewAccessibility")
private fun createMap(ctx: android.content.Context, scale: Float, zoom: Double): MapView {
    Configuration.getInstance().apply {
        userAgentValue = "${ctx.packageName}/1.0 (Pleos Connect vehicle app)"
        val base = File(ctx.cacheDir, "osmdroid")
        osmdroidBasePath = base
        osmdroidTileCache = File(base, "tiles")
    }
    val ground = android.graphics.Color.rgb(0x1e, 0x1e, 0x1e)
    return MapView(ctx).apply {
        setTileSource(DARK_GRAY_BASE)
        // 불러오는 동안 격자 대신 바탕색
        overlayManager.tilesOverlay.apply { loadingBackgroundColor = ground; loadingLineColor = ground; setColorFilter(DARKEN) }
        // 지명 글자 레이어 (밝은 글자, 색 변환 없이 위에)
        overlays.add(
            TilesOverlay(MapTileProviderBasic(ctx, DARK_GRAY_LABELS), ctx).apply {
                loadingBackgroundColor = android.graphics.Color.TRANSPARENT
                loadingLineColor = android.graphics.Color.TRANSPARENT
            },
        )
        setMultiTouchControls(false)
        zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
        isTilesScaledToDpi = false
        tilesScaleFactor = scale
        isHorizontalMapRepetitionEnabled = false
        isVerticalMapRepetitionEnabled = false
        setBackgroundColor(ground)
        maxZoomLevel = MAX_TILE_ZOOM.toDouble()
        controller.setZoom(zoom.coerceAtMost(MAX_TILE_ZOOM.toDouble()))
        // 주행 중 터치 입력 없음 — 지도도 움직이지 않게
        setOnTouchListener { _, _ -> true }
    }
}

/**
 * 목적지(흰 원 + 검은 테 + 가운데 점, 시안 C-02 표시), 내 차(흰 원 + 진행 방향 화살),
 * 후보 주차장(바탕색 원 + 굵은 테 + 번호, 시안 C-03 표시)
 */
private class PinsOverlay : Overlay() {
    var car: GeoPoint? = null
    var headingDeg: Float? = null
    var destination: GeoPoint? = null
    /** 번호 핀 1, 2, 3 … (목록 순서) */
    var numbered: List<GeoPoint> = emptyList()
    var ink: Int = android.graphics.Color.WHITE
    var ground: Int = android.graphics.Color.BLACK
    /** dp → px (DesignScale 포함) */
    var scale: Float = 1f

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = android.graphics.Typeface.DEFAULT_BOLD
    }

    override fun draw(canvas: Canvas, map: MapView, shadow: Boolean) {
        if (shadow) return
        val proj = map.projection
        numbered.forEachIndexed { i, g ->
            val p = proj.toPixels(g, null)
            val cx = p.x.toFloat(); val cy = p.y.toFloat()
            fill.color = ground; canvas.drawCircle(cx, cy, 20 * scale, fill)
            stroke.color = ink; stroke.strokeWidth = 3 * scale; canvas.drawCircle(cx, cy, 20 * scale, stroke)
            label.color = ink; label.textSize = 20 * scale
            // 글자 세로 가운데: 기준선을 (ascent+descent)/2 만큼 내림
            canvas.drawText("${i + 1}", cx, cy - (label.ascent() + label.descent()) / 2, label)
        }
        destination?.let { g ->
            val p = proj.toPixels(g, null)
            fill.color = ink; canvas.drawCircle(p.x.toFloat(), p.y.toFloat(), 18 * scale, fill)
            fill.color = ground; canvas.drawCircle(p.x.toFloat(), p.y.toFloat(), 12 * scale, fill)
            fill.color = ink; canvas.drawCircle(p.x.toFloat(), p.y.toFloat(), 6 * scale, fill)
        }
        car?.let { g ->
            val p = proj.toPixels(g, null)
            val cx = p.x.toFloat(); val cy = p.y.toFloat()
            fill.color = ground; canvas.drawCircle(cx, cy, 22 * scale, fill)
            stroke.color = ink; stroke.strokeWidth = 3 * scale; canvas.drawCircle(cx, cy, 22 * scale, stroke)
            // 진행 방향 화살 (모르면 위쪽)
            val a = Math.toRadians((headingDeg ?: 0f).toDouble())
            fun pt(r: Float, da: Double) = (cx + r * sin(a + da)).toFloat() to (cy - r * cos(a + da)).toFloat()
            val (tx, ty) = pt(14 * scale, 0.0)
            val (lx, ly) = pt(11 * scale, Math.toRadians(140.0))
            val (rx, ry) = pt(11 * scale, Math.toRadians(-140.0))
            val arrow = Path().apply { moveTo(tx, ty); lineTo(lx, ly); lineTo(cx, cy + 0f); lineTo(rx, ry); close() }
            fill.color = ink; canvas.drawPath(arrow, fill)
        }
    }
}

private fun distanceMeters(a: LatLng, b: LatLng): Double {
    val r = 6_371_000.0
    val dLat = Math.toRadians(b.lat - a.lat)
    val dLng = Math.toRadians(b.lng - a.lng)
    val h = sin(dLat / 2) * sin(dLat / 2) + cos(Math.toRadians(a.lat)) * cos(Math.toRadians(b.lat)) * sin(dLng / 2) * sin(dLng / 2)
    return 2 * r * kotlin.math.asin(kotlin.math.sqrt(h))
}
