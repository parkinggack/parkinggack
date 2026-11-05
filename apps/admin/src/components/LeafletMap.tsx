/**
 * Leaflet + OpenStreetMap 타일. 타일은 CSS로 따뜻한 회색으로 바꿔 시안 톤에 맞춘다 (출처 표시는 그대로).
 * 타일이 하나도 안 오면 onTileFailure → 상위가 SVG 대체 그림으로 바꾼다.
 * 이 파일은 지도를 쓸 때만 따로 불러온다 (React.lazy).
 */
import type { AdminLot } from '@api-types'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { config } from '../config'
import { markerScaleForZoom, type MarkerScale } from '../stats'
import { boundsFor, markerInfo, paintOrder, popupHtml, type MapViewKey } from './mapShared'

export interface LeafletMapProps {
  lots: readonly AdminLot[]
  view: MapViewKey
  onTileFailure: () => void
}

export default function LeafletMap({ lots, view, onTileFailure }: LeafletMapProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const failRef = useRef(onTileFailure)
  failRef.current = onTileFailure
  const [scale, setScale] = useState<MarkerScale>('lg')

  useEffect(() => {
    if (!el.current || !config.tileUrl) return
    const m = L.map(el.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
      keyboard: true,
      zoomSnap: 0.25,
      // 타일 페이드는 Date 기준이라 시각을 고정한 스냅숏에서 타일이 안 보임 → 끔
      fadeAnimation: false,
    })
    m.attributionControl.setPrefix(false)
    // 페이지를 스크롤하다 지도에 걸리지 않게: 지도를 누르거나 포커스했을 때만 휠 확대
    m.on('focus click', () => m.scrollWheelZoom.enable())
    m.on('blur', () => m.scrollWheelZoom.disable())
    m.on('zoomend', () => setScale(markerScaleForZoom(m.getZoom())))
    m.getContainer().setAttribute('aria-label', '주차장 난이도 지도. 화살표 키로 이동, +/- 키로 확대·축소')

    let loaded = 0
    let failed = 0
    const tiles = L.tileLayer(config.tileUrl, {
      attribution: config.tileAttribution,
      maxZoom: 19,
      className: 'pg-tiles',
    })
    tiles.on('tileload', () => { loaded += 1 })
    tiles.on('tileerror', () => {
      failed += 1
      if (loaded === 0 && failed >= 6) failRef.current()
    })
    tiles.addTo(m)
    const watchdog = window.setTimeout(() => {
      if (loaded === 0) failRef.current()
    }, 12000)

    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => {
      window.clearTimeout(watchdog)
      m.remove()
      map.current = null
      layer.current = null
    }
  }, [])

  // 마커
  useEffect(() => {
    const group = layer.current
    if (!group) return
    group.clearLayers()
    const maxSamples = Math.max(1, ...lots.map((l) => l.sampleCount))
    paintOrder(lots).forEach((lot, i) => {
      const info = markerInfo(lot, maxSamples, scale)
      const d = info.diameter
      const cls = `pg-pin pg-pin--${scale} ${info.level == null ? 'pg-pin--sparse' : `pg-pin--l${info.level}${info.darkFill ? ' is-dark' : ''}`}`
      const icon = L.divIcon({
        className: 'pg-marker',
        html: `<span class="${cls}" style="width:${d}px;height:${d}px;--pin-fill:${info.fillOpacity}"><span>${info.text}</span></span>`,
        iconSize: [d, d],
        iconAnchor: [d / 2, d / 2],
        popupAnchor: [0, -d / 2],
      })
      const marker = L.marker([lot.location.lat, lot.location.lng], {
        icon,
        keyboard: true,
        title: info.ariaLabel,
        zIndexOffset: i * 10,
        riseOnHover: true,
      })
      marker.bindPopup(popupHtml(lot), { maxWidth: 280, autoPanPadding: [24, 24] })
      marker.addTo(group)
      marker.getElement()?.setAttribute('aria-label', info.ariaLabel)
    })
  }, [lots, scale])

  // 보기 범위
  useEffect(() => {
    const m = map.current
    if (!m) return
    m.fitBounds(boundsFor(view, lots), { padding: [36, 36], animate: false })
    setScale(markerScaleForZoom(m.getZoom()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, lots.length])

  return <div ref={el} className="leaflet-host" />
}
