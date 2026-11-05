/**
 * M-53 '이미지로 공유하기' — 지난주 결과 카드를 화면 밖 캔버스(OffscreenCanvas, 없으면 문서에 붙이지 않은 <canvas>)에
 * 직접 그려 PNG 로 (html2canvas 같은 것 없음). 1080×1350 (4:5, 메신저·SNS 미리보기에 맞음).
 * 공유는 navigator.share({files}) 가 되면 그걸로, 아니면 파일로 내려받기.
 * 그림은 화면의 결과 카드와 같은 말·같은 그림 언어(먹색 바닥 + 주차선 + 위에서 본 차). 장소·시간은 넣지 않는다.
 */
import { KING_BADGE_LABEL, type KingBadge, type KingResultResponse } from '@api-types'
import { kingRank, leagueLongLabel, resultSub, weekRangeLabel } from './king'

export type BadgeIcon = 'crown' | 'flag' | 'up' | 'check'
export const BADGE_ICON: Record<KingBadge, BadgeIcon> = { TOP10: 'crown', TOP3: 'crown', FIRST: 'crown', PIONEER: 'flag', CLIMBER: 'up', CLEAN_WEEK: 'check' }
/** kit.tsx 아이콘과 같은 경로 (24×24) */
export const ICON_PATHS: Record<BadgeIcon, string[]> = {
  crown: ['M4 18h16', 'M5 15.5L3.5 7l5 4L12 5l3.5 6 5-4-1.5 8.5z'],
  flag: ['M6 21V4', 'M6 4h11l-2 4 2 4H6'],
  up: ['M12 19V6', 'M6.5 11.5L12 6l5.5 5.5'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
}
const LOGO_PATHS: Array<[string, number]> = [
  ['M15 36V12h9a7 7 0 0 1 0 14h-9', 5],
  ['M27 38h8a3 3 0 0 0 3-3v-8', 3.5],
]

export interface ResultCardModel {
  brand: string
  /** "판교 · 1년 미만 · 11월 2일 ~ 8일" */
  meta: string
  /** "9등" */
  rank: string
  /** "148명 중 · 상위 6%" */
  sub: string
  badges: Array<{ label: string; icon: BadgeIcon }>
  footer: string
  /** 내려받을 때 파일 이름 */
  file: string
}

export function resultCardModel(r: KingResultResponse, host = ''): ResultCardModel {
  const start = new Date(Date.parse(r.week.start) + 9 * 3_600_000).toISOString().slice(0, 10)
  return {
    brand: '주차왕',
    meta: `${leagueLongLabel(r.league)} · ${weekRangeLabel(r.week)}`,
    rank: kingRank(r.rank),
    sub: resultSub(r),
    badges: r.badges.filter((b) => b in KING_BADGE_LABEL).map((b) => ({ label: KING_BADGE_LABEL[b], icon: BADGE_ICON[b] })),
    footer: host ? `주차각 · ${host}` : '주차각',
    file: `parkinggack-king-${start}.png`,
  }
}

/** 그림 좌표 (CSS px) × 배율 = PNG 크기 */
export const SHARE_W = 360
export const SHARE_H = 450
export const SHARE_SCALE = 3

const FONT = '"Noto Sans KR", system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}

/** SVG 경로를 선으로 (Path2D 가 없으면 건너뜀 — 테스트) */
function strokePath(ctx: Ctx, d: string, x: number, y: number, s: number, width: number, color: string) {
  if (typeof Path2D !== 'function') return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.stroke(new Path2D(d))
  ctx.restore()
}

function drawLogo(ctx: Ctx, x: number, y: number, size: number) {
  const s = size / 48
  roundRect(ctx, x, y, size, size, 13 * s)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  for (const [d, w] of LOGO_PATHS) strokePath(ctx, d, x, y, s, w, '#1e1e1e')
}

function setSpacing(ctx: Ctx, px: number) {
  const c = ctx as Ctx & { letterSpacing?: string }
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`
}

/** 결과 카드를 그린다 (ctx 는 SHARE_W×SHARE_SCALE 크기) */
export function drawResultCard(ctx: Ctx, m: ResultCardModel, scale = SHARE_SCALE) {
  ctx.save()
  ctx.scale(scale, scale)
  ctx.fillStyle = '#1e1e1e'
  ctx.fillRect(0, 0, SHARE_W, SHARE_H)

  // 카드 (M-53 미리보기와 같은 면·테두리)
  roundRect(ctx, 20, 20, 320, 388, 24)
  ctx.fillStyle = '#262625'
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = '#4a4944'
  ctx.stroke()

  ctx.textBaseline = 'alphabetic'
  // 로고 + 주차왕
  ctx.font = `700 15px ${FONT}`
  setSpacing(ctx, 0)
  const bw = ctx.measureText(m.brand).width
  const bx = SHARE_W / 2 - (24 + 8 + bw) / 2
  drawLogo(ctx, bx, 44, 24)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.fillText(m.brand, bx + 32, 61.5)

  ctx.textAlign = 'center'
  ctx.font = `400 13px ${FONT}`
  ctx.fillStyle = '#b5b3ad'
  ctx.fillText(m.meta, SHARE_W / 2, 92)

  ctx.font = `700 96px ${FONT}`
  setSpacing(ctx, -4)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(m.rank, SHARE_W / 2, 190)
  setSpacing(ctx, 0)

  ctx.font = `400 16px ${FONT}`
  ctx.fillStyle = '#b5b3ad'
  ctx.fillText(m.sub, SHARE_W / 2, 222)

  // 배지 (가운데 정렬 한 줄)
  ctx.font = `700 14px ${FONT}`
  const pills = m.badges.map((b) => ({ ...b, w: 12 + 18 + 6 + ctx.measureText(b.label).width + 12 }))
  const total = pills.reduce((a, p) => a + p.w, 0) + Math.max(0, pills.length - 1) * 8
  let px = SHARE_W / 2 - total / 2
  for (const p of pills) {
    roundRect(ctx, px, 240, p.w, 36, 18)
    ctx.fillStyle = '#2a2a28'
    ctx.fill()
    for (const d of ICON_PATHS[p.icon]) strokePath(ctx, d, px + 12, 249, 18 / 24, 2, '#f4f3ef')
    ctx.fillStyle = '#f4f3ef'
    ctx.textAlign = 'left'
    ctx.fillText(p.label, px + 12 + 18 + 6, 263)
    px += p.w + 8
  }
  ctx.textAlign = 'center'

  // 그림: 주차선 + 위에서 본 차 (M-53 미리보기의 310×110 그림 그대로)
  ctx.save()
  ctx.beginPath()
  ctx.rect(25, 292, 310, 110)
  ctx.clip()
  ctx.translate(25, 292)
  ctx.strokeStyle = '#4a4944'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (const x of [-6, 52, 110, 168, 226, 284, 342]) {
    ctx.moveTo(x - 20, 8)
    ctx.lineTo(x - 20, 100)
  }
  ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.moveTo(-26, 100)
  ctx.lineTo(340, 100)
  ctx.stroke()
  ctx.translate(166, 54)
  roundRect(ctx, -16, -30, 32, 60, 9)
  ctx.fillStyle = '#f4f3ef'
  ctx.fill()
  ctx.globalAlpha = 0.85
  roundRect(ctx, -11.5, -18, 23, 10, 3)
  ctx.fillStyle = '#1e1e1e'
  ctx.fill()
  ctx.globalAlpha = 0.6
  roundRect(ctx, -10, 16, 20, 6, 2)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.restore()

  ctx.font = `500 13px ${FONT}`
  ctx.fillStyle = '#8a8780'
  ctx.fillText(m.footer, SHARE_W / 2, 434)
  ctx.restore()
}

/** 글꼴을 받아 둔 뒤 PNG 로. 못 그리면 null */
export async function resultPng(m: ResultCardModel): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  try {
    const all = [m.brand, m.meta, m.rank, m.sub, m.footer, ...m.badges.map((b) => b.label)].join('')
    await Promise.all(['400 16px', '500 13px', '700 15px', '700 96px'].map((f) => document.fonts?.load(`${f} "Noto Sans KR"`, all)))
  } catch {
    /* 글꼴 없이도 그림 */
  }
  const W = SHARE_W * SHARE_SCALE
  const H = SHARE_H * SHARE_SCALE
  try {
    if (typeof OffscreenCanvas === 'function') {
      const oc = new OffscreenCanvas(W, H)
      const ctx = oc.getContext('2d')
      if (ctx) {
        drawResultCard(ctx, m)
        return await oc.convertToBlob({ type: 'image/png' })
      }
    }
  } catch {
    /* 아래 <canvas> 로 */
  }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  drawResultCard(ctx, m)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

/**
 * 공유 시트가 파일을 받으면 공유, 아니면 내려받기. 사용자가 공유를 닫으면 'cancelled'.
 * (iOS 는 누른 순간에 share 를 불러야 해서, PNG 는 화면이 열릴 때 미리 만들어 둔다 — King.tsx)
 */
export async function shareOrSave(blob: Blob, filename: string, text: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  const file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null
  if (file && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: '주차왕', text })
      return 'shared'
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled'
      // 공유가 막히면(권한 등) 내려받기로
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  return 'saved'
}
