/**
 * W-01 난이도 지도. 원 크기 = 최근 30일 기록 수, 원 진하기 + 숫자 = 난이도 (색상만으로 구분하지 않음).
 * 기본은 Leaflet + OSM 타일, 타일이 안 오거나 VITE_TILE_URL=none 이면 SVG 단순 그림.
 */
import type { AdminLot } from '@api-types'
import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { config } from '../config'
import { LEVEL_FILL_OPACITY } from '../stats'
import { MAP_VIEWS, VIEW_CAPTION, type MapViewKey } from './mapShared'
import { SvgMap } from './SvgMap'

const LeafletMap = lazy(() => import('./LeafletMap'))

class MapErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export function DifficultyMap({ lots, demoCount }: { lots: readonly AdminLot[]; demoCount: number }) {
  const [view, setView] = useState<MapViewKey>('all')
  const [mode, setMode] = useState<'tiles' | 'svg'>(config.tileUrl ? 'tiles' : 'svg')
  const [fellBack, setFellBack] = useState(false)
  const fallback = () => {
    setFellBack(true)
    setMode('svg')
  }

  return (
    <div className="map-frame">
      {mode === 'tiles' ? (
        <MapErrorBoundary onError={fallback}>
          <Suspense fallback={<div className="map-loading" role="status">지도를 불러오는 중…</div>}>
            <LeafletMap lots={lots} view={view} onTileFailure={fallback} />
          </Suspense>
        </MapErrorBoundary>
      ) : (
        <SvgMap lots={lots} view={view} />
      )}

      <div className="map-tools">
        <div className="segmented" role="group" aria-label="지도 범위">
          {MAP_VIEWS.map((v) => (
            <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => setView(v.key)}>
              {v.label}
            </button>
          ))}
        </div>
        {config.tileUrl && (
          <button
            type="button"
            className="map-tools__mode"
            aria-pressed={mode === 'svg'}
            onClick={() => {
              setFellBack(false)
              setMode(mode === 'svg' ? 'tiles' : 'svg')
            }}
          >
            {mode === 'svg' ? '지도로 보기' : '단순 그림'}
          </button>
        )}
      </div>

      <div className="map-legend">
        <div className="map-legend__row" aria-label="난이도 범례: 진할수록 어려움, 점선은 기록 적음">
          <span className="map-legend__title">난이도</span>
          {LEVEL_FILL_OPACITY.map((o, i) => (
            <span key={i} className={`map-legend__dot${i >= 3 ? ' is-dark' : ''}`} style={{ ['--pin-fill' as string]: o }} aria-hidden="true">
              {i + 1}
            </span>
          ))}
          <span className="map-legend__dot is-sparse" aria-hidden="true">–</span>
          <span className="map-legend__sparse" aria-hidden="true">기록 적음</span>
        </div>
        <span className="map-legend__caption">
          {VIEW_CAPTION[view]}
          {demoCount > 0 ? ` · 시연 데이터 ${demoCount}곳 포함` : ''}
          {fellBack ? ' · 지도 타일을 불러올 수 없어 단순 그림으로 보여요' : ''}
        </span>
      </div>
    </div>
  )
}
