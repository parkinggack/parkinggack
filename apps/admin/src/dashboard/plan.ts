/**
 * 층 평면 그림 틀 — D-11 평면과 D-12 좌표가 같이 쓰는 기하. 도면(layout)은 API 그대로 (미터, 원점 왼쪽 위, x 오른쪽 · y 아래).
 * 그림은 시안 D-11 과 같은 900×520 틀에 맞춰 넣는다.
 */
import type { FloorLayout } from '@insights-layout'

export const PLAN_W = 900
export const PLAN_H = 520
const PAD_X = 40
const PAD_Y = 36

export function fitLayout(layout: Pick<FloorLayout, 'width' | 'height'>) {
  const k = Math.min((PLAN_W - PAD_X * 2) / layout.width, (PLAN_H - PAD_Y * 2) / layout.height)
  return { k, ox: (PLAN_W - layout.width * k) / 2, oy: (PLAN_H - layout.height * k) / 2 }
}

/**
 * 입구 = 첫 가로 통로가 램프·입구와 만나는 끝. 내보내기 좌표의 (0, 0) 이고 평면의 '기준점'.
 * 시연 도면에서는 (60, 9.12) — 나선 램프 바닥이 1번 통로에 닿는 곳.
 */
export function entranceOf(layout: Pick<FloorLayout, 'aisles' | 'width'>): { x: number; y: number } {
  const horiz = layout.aisles.filter((a) => Math.abs(a[3] - a[1]) < Math.abs(a[2] - a[0]))
  const first = [...horiz].sort((a, b) => a[1] - b[1])[0] ?? layout.aisles[0]
  if (!first) return { x: layout.width, y: 0 }
  const [x1, y1, x2, y2] = first
  return x2 >= x1 ? { x: x2, y: y2 } : { x: x1, y: y1 }
}

/** 동선 수 → 선 하나의 투명도 (겹친 만큼 밝아지게, 층마다 밝기가 비슷하게) */
export function lineAlpha(count: number): number {
  return Math.min(0.3, Math.max(0.035, 28 / Math.max(1, count)))
}
