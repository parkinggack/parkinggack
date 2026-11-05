/**
 * 대시보드 D-02 도면 틀 — 순수 기하 (의존성 없음). generateFloorLayout 은 시연 도면을 만들고,
 * deriveStalls 는 아무 도면(layout)에서나 가로 통로 양옆의 주차 칸·기둥을 정한다.
 * 화면(apps/admin 겹친 동선 그림)과 동선 생성기(index.ts)가 같은 규칙을 쓰려고 따로 뺐다.
 *
 * 좌표: 미터, 원점 = 층 바닥 왼쪽 위, x 오른쪽 · y 아래.
 */
import type { InsightsLotResponse } from '../api-types/index.ts'

export type FloorLayout = InsightsLotResponse['layout'][number]
/** spiral = 회전(나선) 램프로 층을 오르내림, straight = 곧은 경사로, none = 램프 없음(지상·단층) */
export type RampKind = 'spiral' | 'straight' | 'none'

const round2 = (v: number) => Math.round(v * 100) / 100

// ───────────── 도면 ─────────────

export const FLOOR_W = 65.6
export const FLOOR_H = 35.84
export const AISLE_HALF = 2.08 // 통로 반폭
export const EDGE_GAP = 1.28 // 바깥벽과 주차 칸 사이
export const STALL_PITCH = 2.72 // 칸 폭
export const STALL_DEPTH = 5.76 // 칸 깊이 (최대)
export const AISLE_YS = [9.12, 17.92, 26.72]
export const AISLE_X0 = 6.4
export const SPINE_X = 58.4
export const RAMP = { x: 60.0, y: 5.12, r: 4.0 } // 바닥이 1번 통로에 닿는 나선 램프
export const EXIT = { x: 60.0, y: AISLE_YS[0] } // 램프·입구에서 나와 통로로 들어서는 곳
export const ZONE_BANDS = [14.56, 26.16, 37.76, 49.28] // 구역 글자 x (A–D 위쪽, E–H 아래쪽은 거꾸로)

export interface FloorLayoutSpec { floor: string; ramp: RampKind }

/** 기본 층 틀: 가로 통로 3개 + 오른쪽 세로 통로(램프 → 각 통로), 구역 A–H (위 A→D, 아래 E→H 로 되돌아옴) */
export function generateFloorLayout(spec: FloorLayoutSpec): FloorLayout {
  const aisles: [number, number, number, number][] = [
    [AISLE_X0, AISLE_YS[0], EXIT.x, AISLE_YS[0]],
    [AISLE_X0, AISLE_YS[1], SPINE_X, AISLE_YS[1]],
    [AISLE_X0, AISLE_YS[2], SPINE_X, AISLE_YS[2]],
    [SPINE_X, AISLE_YS[0], SPINE_X, AISLE_YS[2]],
  ]
  if (spec.ramp === 'straight') aisles.push([EXIT.x, 0, EXIT.x, AISLE_YS[0]])
  if (spec.ramp === 'none') aisles.push([EXIT.x, AISLE_YS[0], FLOOR_W, AISLE_YS[0]])
  const zones = [
    ...['A', 'B', 'C', 'D'].map((label, i) => ({ label, x: ZONE_BANDS[i], y: 0.64 })),
    ...['E', 'F', 'G', 'H'].map((label, i) => ({ label, x: ZONE_BANDS[3 - i], y: FLOOR_H - 0.64 })),
  ]
  return {
    floor: spec.floor,
    width: FLOOR_W,
    height: FLOOR_H,
    aisles,
    ramps: spec.ramp === 'spiral' ? [[RAMP.x, RAMP.y, RAMP.r]] : [],
    zones,
  }
}

export interface StallRow {
  /** 이 줄이 붙은 가로 통로 번호 (layout.aisles 안의 index) */
  aisle: number
  side: 'north' | 'south'
  /** 칸 경계선 x 목록 (칸 수 = 길이 − 1) */
  lines: number[]
  /** 통로 쪽 끝 y, 안쪽 끝 y */
  y0: number
  y1: number
}

export interface Stalls {
  rows: StallRow[]
  /** 기둥 중심 (네 칸마다, 통로 가장자리) */
  pillars: { x: number; y: number }[]
}

/**
 * 가로 통로 양옆의 주차 칸과 기둥 — 도면(layout)만으로 정해진다. 화면은 이것을 장식으로 그리고,
 * 동선 생성기는 여기서 주차할 칸을 고른다. 세로 통로(램프 연결)에는 칸을 두지 않는다.
 */
export function deriveStalls(layout: FloorLayout): Stalls {
  const horiz = layout.aisles
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => Math.abs(a[3] - a[1]) < Math.abs(a[2] - a[0]) && Math.abs(a[2] - a[0]) > STALL_PITCH * 4)
    .sort((p, q) => p.a[1] - q.a[1])
  const rows: StallRow[] = []
  const pillars: { x: number; y: number }[] = []
  horiz.forEach(({ a, i }, k) => {
    const y = (a[1] + a[3]) / 2
    const x0 = Math.min(a[0], a[2]) + 2.4
    const x1 = Math.max(a[0], a[2]) - 5.8
    const n = Math.max(1, Math.round((x1 - x0) / STALL_PITCH))
    const lines = Array.from({ length: n + 1 }, (_, j) => round2(x0 + j * STALL_PITCH))
    const northLimit = k === 0 ? EDGE_GAP : (horiz[k - 1].a[1] + y) / 2
    const southLimit = k === horiz.length - 1 ? layout.height - EDGE_GAP : (horiz[k + 1].a[1] + y) / 2
    const ny0 = y - AISLE_HALF
    const ny1 = Math.max(northLimit, ny0 - STALL_DEPTH)
    const sy0 = y + AISLE_HALF
    const sy1 = Math.min(southLimit, sy0 + STALL_DEPTH)
    if (ny0 - ny1 > 1) rows.push({ aisle: i, side: 'north', lines, y0: round2(ny0), y1: round2(ny1) })
    if (sy1 - sy0 > 1) rows.push({ aisle: i, side: 'south', lines, y0: round2(sy0), y1: round2(sy1) })
    for (let j = 1; j < lines.length; j += 4) {
      pillars.push({ x: lines[j], y: round2(ny0) }, { x: lines[j], y: round2(sy0) })
    }
  })
  return { rows, pillars }
}
