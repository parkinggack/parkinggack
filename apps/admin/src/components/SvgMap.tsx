/**
 * 지도 타일 없이 그리는 단순 그림 (오프라인 PT · 타일 서버 막힘 · 테스트).
 * 위도·경도를 평면에 그대로 옮긴 그림이라 도로는 없고, 기준 장소 몇 곳만 글자로 찍는다.
 */
import type { AdminLot } from '@api-types'
import { useEffect, useRef, useState } from 'react'
import { adminHref } from '../router'
import { boundsFor, inBounds, LANDMARKS, markerInfo, paintOrder, type MapViewKey } from './mapShared'

export function SvgMap({ lots, view }: { lots: readonly AdminLot[]; view: MapViewKey }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 900, h: 420 })

  useEffect(() => {
    const node = box.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  const b = boundsFor(view, lots)
  const pad = 44
  const midLat = (b[0][0] + b[1][0]) / 2
  const kx = Math.cos((midLat * Math.PI) / 180)
  const spanX = (b[1][1] - b[0][1]) * kx
  const spanY = b[1][0] - b[0][0]
  const scale = Math.min((size.w - pad * 2) / spanX, (size.h - pad * 2) / spanY)
  const cx = (b[0][1] + b[1][1]) / 2
  const cy = midLat
  const project = (lat: number, lng: number) => ({
    x: size.w / 2 + (lng - cx) * kx * scale,
    y: size.h / 2 - (lat - cy) * scale,
  })

  const visible = lots.filter((l) => {
    const p = project(l.location.lat, l.location.lng)
    return p.x > -40 && p.x < size.w + 40 && p.y > -40 && p.y < size.h + 40
  })
  const maxSamples = Math.max(1, ...lots.map((l) => l.sampleCount))
  // 격자: 판교 500m · 서울 2km · 전체 10km
  const gridKm = view === 'pangyo' ? 0.5 : view === 'seoul' ? 2 : 10
  const stepPx = (gridKm / 111) * scale
  const gridX: number[] = []
  const gridY: number[] = []
  if (stepPx > 24) {
    for (let x = (size.w / 2) % stepPx; x < size.w; x += stepPx) gridX.push(x)
    for (let y = (size.h / 2) % stepPx; y < size.h; y += stepPx) gridY.push(y)
  }

  return (
    <div className="svg-map" ref={box}>
      <svg
        role="group"
        aria-label={`주차장 난이도 단순 그림, ${visible.length}곳`}
        width="100%"
        height="100%"
        viewBox={`0 0 ${size.w} ${size.h}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <rect x="0" y="0" width={size.w} height={size.h} className="svg-map__bg" />
        <g className="svg-map__grid" aria-hidden="true">
          {gridX.map((x) => <line key={`x${x}`} x1={x} y1={0} x2={x} y2={size.h} />)}
          {gridY.map((y) => <line key={`y${y}`} x1={0} y1={y} x2={size.w} y2={y} />)}
        </g>
        <g className="svg-map__landmarks" aria-hidden="true">
          {LANDMARKS.filter((m) => inBounds([[b[0][0] - 0.02, b[0][1] - 0.02], [b[1][0] + 0.02, b[1][1] + 0.02]], m.lat, m.lng)).map((m) => {
            const p = project(m.lat, m.lng)
            return (
              <g key={m.name} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
                <path d="M-4 0 H4 M0 -4 V4" />
                <text x="7" y="-6">{m.name}</text>
              </g>
            )
          })}
        </g>
        <g>
          {paintOrder(visible).map((lot) => {
            const info = markerInfo(lot, maxSamples, view === 'all' ? 'sm' : view === 'seoul' ? 'md' : 'lg')
            const p = project(lot.location.lat, lot.location.lng)
            const r = info.diameter / 2
            return (
              <a key={lot.id} href={adminHref(`/lots/${encodeURIComponent(lot.id)}`)} aria-label={info.ariaLabel} className="svg-pin">
                <title>{info.ariaLabel}</title>
                <circle
                  cx={p.x} cy={p.y} r={r}
                  className={info.level == null ? 'svg-pin__dot is-sparse' : 'svg-pin__dot'}
                  style={info.level == null ? undefined : { fillOpacity: info.fillOpacity }}
                />
                <text x={p.x} y={p.y} dy="0.35em" textAnchor="middle" className={info.darkFill ? 'svg-pin__text is-dark' : 'svg-pin__text'}>
                  {info.text}
                </text>
              </a>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
