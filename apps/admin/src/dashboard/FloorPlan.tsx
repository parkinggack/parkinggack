/**
 * D-11 '층 평면 위에 N대의 동선을 겹쳤어요' — 시안 그림 언어: 먹색 바닥 + 흰 선, 회색 단계.
 *
 * 바닥(칸·기둥·램프·구역 글자·진행 방향·기준점)은 API 도면(layout)에서 SVG 로, 동선은 수백 대라 <canvas> 두 장
 * (앞으로 · 후진 구간)으로 그린다 — 선 하나하나가 반투명이라 겹친 곳이 밝아진다. 후진이 몰리는 곳은 누를 수 있는 버튼.
 * 세 겹은 따로 켜고 끈다 (시안 '동선 · 후진 구간 · 몰리는 곳').
 */
import type { InsightLotRow, InsightsLotResponse } from '@api-types'
import { deriveStalls, type FloorLayout } from '@insights-layout'
import { useEffect, useMemo, useRef, useState } from 'react'
import { entranceOf, fitLayout, lineAlpha, PLAN_H, PLAN_W } from './plan'

type Path = InsightsLotResponse['overlays'][number]['paths'][number]
type Hotspot = InsightsLotResponse['hotspots'][number]

const INK = '244,243,239' // #f4f3ef

/** 동선을 캔버스에 (앞으로 = 실선, 후진 = 점선) */
export function drawPaths(canvas: HTMLCanvasElement, cssW: number, scale: number, layout: FloorLayout, paths: readonly Path[], mode: 'fwd' | 'rev'): void {
  const cssH = (cssW * PLAN_H) / PLAN_W
  const w = Math.max(1, Math.round(cssW * scale))
  const h = Math.max(1, Math.round(cssH * scale))
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const s = (cssW / PLAN_W) * scale
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.setTransform(s, 0, 0, s, 0, 0)
  const { k, ox, oy } = fitLayout(layout)
  const X = (x: number) => ox + x * k
  const Y = (y: number) => oy + y * k
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const want = mode === 'rev' ? 1 : 0
  const a = lineAlpha(paths.length)
  ctx.lineWidth = mode === 'rev' ? 2 : 2.2
  ctx.strokeStyle = `rgba(${INK},${mode === 'rev' ? Math.min(0.55, a * 2.4) : a})`
  ctx.setLineDash(mode === 'rev' ? [5, 6] : [])
  for (const path of paths) {
    ctx.beginPath()
    let pen = false
    for (let i = 1; i < path.length; i++) {
      const seg = path[i][2] === 1 ? 1 : 0
      if (seg !== want) {
        pen = false
        continue
      }
      if (!pen) ctx.moveTo(X(path[i - 1][0]), Y(path[i - 1][1]))
      ctx.lineTo(X(path[i][0]), Y(path[i][1]))
      pen = true
    }
    ctx.stroke()
  }
  ctx.setLineDash([])
}

function PathCanvas({ cssW, layout, paths, mode, hidden }: { cssW: number; layout: FloorLayout; paths: readonly Path[]; mode: 'fwd' | 'rev'; hidden: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || cssW <= 0) return
    const screen = () => drawPaths(c, cssW, Math.max(2, window.devicePixelRatio || 1), layout, paths, mode)
    const print = () => drawPaths(c, cssW, 2.5, layout, paths, mode)
    screen()
    window.addEventListener('beforeprint', print)
    window.addEventListener('afterprint', screen)
    return () => {
      window.removeEventListener('beforeprint', print)
      window.removeEventListener('afterprint', screen)
    }
  }, [cssW, layout, paths, mode])
  return <canvas ref={ref} className="v2-plan__canvas" hidden={hidden} data-layer={mode} />
}

/** 바닥 그림 (시안 D-11 의 칸 · 기둥 · 램프 · 구역 · 진행 방향 · 기준점) */
function PlanBase({ layout, rampKind }: { layout: FloorLayout; rampKind: InsightLotRow['rampKind'] }) {
  const { k, ox, oy } = fitLayout(layout)
  const X = (x: number) => ox + x * k
  const Y = (y: number) => oy + y * k
  const { rows, pillars } = useMemo(() => deriveStalls(layout), [layout])
  const origin = entranceOf(layout)
  const horiz = layout.aisles.filter((a) => Math.abs(a[3] - a[1]) < Math.abs(a[2] - a[0]))
  const vert = layout.aisles.filter((a) => Math.abs(a[3] - a[1]) > Math.abs(a[2] - a[0]))
  // 진행 방향: 입구에서 먼 쪽으로 (가로 통로 가운데, 세로 통로 가운데)
  const arrows = [
    ...horiz.filter((a) => Math.abs(a[2] - a[0]) > 12).map((a) => {
      const toLeft = Math.abs(Math.max(a[0], a[2]) - origin.x) < Math.abs(Math.min(a[0], a[2]) - origin.x)
      const mx = (a[0] + a[2]) / 2
      const my = (a[1] + a[3]) / 2
      return { x: X(mx), y: Y(my), d: toLeft ? 'M8 -6l-8 6 8 6' : 'M-8 -6l8 6-8 6' }
    }),
    ...vert.filter((a) => Math.abs(a[3] - a[1]) > 8 && a[1] > 0.5).map((a) => ({ x: X(a[0]), y: Y((a[1] + a[3]) / 2), d: 'M-6 -8l6 8 6-8' })),
  ]
  const oy0 = Y(origin.y)
  return (
    <svg viewBox={`0 0 ${PLAN_W} ${PLAN_H}`} width="100%" height="100%" className="v2-plan__base" aria-hidden="true">
      <rect x={X(0)} y={Y(0)} width={layout.width * k} height={layout.height * k} rx={10} fill="#262624" stroke="#4a4944" strokeWidth={2} />
      <g stroke="#5a5954" strokeWidth={2}>
        {rows.map((row, i) => (
          <g key={i}>
            <path d={`M${X(row.lines[0])} ${Y(row.y0)}H${X(row.lines[row.lines.length - 1])}`} />
            {row.lines.map((x) => <path key={x} d={`M${X(x)} ${Y(row.y0)}V${Y(row.y1)}`} />)}
          </g>
        ))}
      </g>
      <g fill="#8a8780">
        {pillars.map((p, i) => <rect key={i} x={X(p.x) - 7} y={Y(p.y) - 7} width={14} height={14} rx={2} />)}
      </g>
      {layout.ramps.map(([cx, cy, r], i) => {
        const R = r * k
        const a0 = -Math.PI / 2
        const a1 = a0 + Math.PI * 1.6
        const rr = R * 0.74
        const sx = X(cx) + rr * Math.cos(a0)
        const sy = Y(cy) + rr * Math.sin(a0)
        const ex = X(cx) + rr * Math.cos(a1)
        const ey = Y(cy) + rr * Math.sin(a1)
        return (
          <g key={i}>
            <circle cx={X(cx)} cy={Y(cy)} r={R} fill="#1e1e1e" stroke="#4a4944" strokeWidth={2} />
            <circle cx={X(cx)} cy={Y(cy)} r={R * 0.42} fill="#262624" stroke="#4a4944" strokeWidth={2} />
            <path d={`M${sx} ${sy} A${rr} ${rr} 0 1 1 ${ex} ${ey}`} fill="none" stroke="#8a8780" strokeWidth={2} strokeDasharray="5 6" />
            <text x={X(cx)} y={Y(cy) + 4} textAnchor="middle" className="v2-plan__label">램프</text>
          </g>
        )
      })}
      {layout.ramps.length === 0 && (
        <text x={Math.min(X(origin.x) + 34, X(layout.width) - 10)} y={rampKind === 'STRAIGHT' ? Y(0) + 22 : oy0 - 14} textAnchor="end" className="v2-plan__label">
          {rampKind === 'STRAIGHT' ? '램프' : '입구'}
        </text>
      )}
      <g stroke="#6b6964" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round">
        {arrows.map((a, i) => <path key={i} transform={`translate(${a.x} ${a.y})`} d={a.d} />)}
      </g>
      <g className="v2-plan__zones">
        {layout.zones.map((z) => (
          <g key={z.label}>
            <circle cx={X(z.x)} cy={Y(z.y)} r={11} fill="#1e1e1e" stroke="#8a8780" strokeWidth={1.5} />
            <text x={X(z.x)} y={Y(z.y) + 4} textAnchor="middle">{z.label}</text>
          </g>
        ))}
      </g>
    </svg>
  )
}

/** 기준점 (0, 0) = 입구. 동선 위에 얹어 늘 읽히게 (글자는 먹색 테두리) */
function PlanTop({ layout }: { layout: FloorLayout }) {
  const { k, ox, oy } = fitLayout(layout)
  const origin = entranceOf(layout)
  const x = ox + origin.x * k
  const y = oy + origin.y * k
  return (
    <svg viewBox={`0 0 ${PLAN_W} ${PLAN_H}`} width="100%" height="100%" className="v2-plan__top" aria-hidden="true">
      <g stroke="#1e1e1e" strokeWidth={4} fill="none">
        <circle cx={x} cy={y} r={5} />
        <path d={`M${x} ${y - 10}V${y + 10}M${x - 10} ${y}H${x + 10}`} />
      </g>
      <g stroke="#d6d3cb" strokeWidth={1.5} fill="none">
        <circle cx={x} cy={y} r={5} />
        <path d={`M${x} ${y - 10}V${y + 10}M${x - 10} ${y}H${x + 10}`} />
      </g>
      <text x={x - 16} y={y - 10} textAnchor="end" className="v2-plan__origin">기준점 (0, 0)</text>
    </svg>
  )
}

export interface FloorPlanProps {
  layout: FloorLayout
  rampKind: InsightLotRow['rampKind']
  /** null = 불러오는 중 */
  paths: readonly Path[] | null
  hotspots: readonly Hotspot[]
  selected: number | null
  onSelect: (rank: number) => void
  show: { trails: boolean; rev: boolean; spots: boolean }
  ariaLabel: string
}

export function FloorPlan({ layout, rampKind, paths, hotspots, selected, onSelect, show, ariaLabel }: FloorPlanProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const [cssW, setCssW] = useState(0)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    setCssW(el.clientWidth)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setCssW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { k, ox, oy } = fitLayout(layout)
  const list = paths ?? []
  return (
    <div className="v2-plan" ref={wrap}>
      <div className="v2-plan__art" role="img" aria-label={ariaLabel}>
        <PlanBase layout={layout} rampKind={rampKind} />
        <PathCanvas cssW={cssW} layout={layout} paths={list} mode="fwd" hidden={!show.trails} />
        <PathCanvas cssW={cssW} layout={layout} paths={list} mode="rev" hidden={!show.rev} />
        <PlanTop layout={layout} />
      </div>
      {paths === null && <p className="v2-plan__loading" role="status">동선을 불러오는 중…</p>}
      {show.spots && hotspots.map((h) => {
        const on = h.rank === selected
        return (
          <button
            key={h.rank}
            type="button"
            className="v2-plan__spot"
            aria-label={`${h.rank}번 지점 · ${h.title}`}
            aria-pressed={on}
            onClick={() => onSelect(h.rank)}
            style={{ left: `${((ox + h.x * k) / PLAN_W) * 100}%`, top: `${((oy + h.y * k) / PLAN_H) * 100}%` }}
          >
            {h.rank}
          </button>
        )
      })}
    </div>
  )
}
