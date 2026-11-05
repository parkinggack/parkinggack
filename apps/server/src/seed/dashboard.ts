/**
 * 대시보드 D-02 시드: 판교 9곳의 도면(층마다)·후진 잦은 곳·동선을 packages/insights-demo 생성기 그대로 만든다
 * (generateFloorLayout · generateOverlayPaths · deriveStalls — 어드민 시연 모드와 같은 그림).
 * 동선은 층마다 30일 기록 수만큼(generateOverlayPaths 는 앞에서부터 같으므로 서버가 maxPaths 로 잘라도 시연 모드와 같다).
 */
import type { InsightsLotResponse } from '@parkinggack/api-types'
import { DEMO_LOTS, DEMO_NOW, demoLotInsights } from '../../../../packages/insights-demo/index.ts'

type Layout = InsightsLotResponse['layout'][number]
type Hotspot = InsightsLotResponse['hotspots'][number]
type Overlay = InsightsLotResponse['overlays'][number]

export interface DashboardSeed {
  layouts: Array<Layout & { lotId: string }>
  hotspots: Array<Hotspot & { lotId: string }>
  overlays: Array<Overlay & { lotId: string }>
}

/** 동선 생성 날짜 창 (insights-demo seed `${id}:${floor}:${days}`) */
export const OVERLAY_DAYS = 30

export function dashboardSeed(): DashboardSeed {
  const out: DashboardSeed = { layouts: [], hotspots: [], overlays: [] }
  for (const def of DEMO_LOTS) {
    const ins = demoLotInsights(def.id, { days: OVERLAY_DAYS, now: DEMO_NOW, maxPathsPerFloor: Number.MAX_SAFE_INTEGER })
    if (!ins) continue
    out.layouts.push(...ins.layout.map((l) => ({ lotId: def.id, ...l })))
    out.hotspots.push(...ins.hotspots.map((h) => ({ lotId: def.id, ...h })))
    out.overlays.push(...ins.overlays.map((o) => ({ lotId: def.id, ...o })))
  }
  return out
}
