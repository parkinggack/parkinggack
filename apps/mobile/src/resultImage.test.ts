import { describe, expect, it } from 'vitest'
import { kingResultFixture } from './mock/king'
import { drawResultCard, resultCardModel, SHARE_H, SHARE_SCALE, SHARE_W } from './resultImage'

const MON = new Date('2026-11-09T09:12:00+09:00').getTime()

/** 캔버스 2D 대신 그린 것을 받아 적는 가짜 (jsdom·node 에는 캔버스가 없음) */
function recorder() {
  const calls: Array<{ op: string; args: unknown[]; fill?: unknown; font?: string }> = []
  const state = { fillStyle: '' as unknown, font: '', textAlign: 'start', strokeStyle: '', lineWidth: 1, globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter', textBaseline: 'alphabetic', letterSpacing: '0px' }
  const ctx = new Proxy(state as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'measureText') return (t: string) => ({ width: t.length * 9 })
      return (...args: unknown[]) => calls.push({ op: prop, args, fill: state.fillStyle, font: state.font })
    },
    set(target, prop: string, v) {
      target[prop] = v
      return true
    },
  })
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

describe('M-53 공유 이미지', () => {
  const model = resultCardModel(kingResultFixture(MON), 'parkinggack.vercel.app')

  it('모델: 화면과 같은 말 (장소·시간 없음), 파일 이름은 그 주', () => {
    expect(model).toEqual({
      brand: '주차왕',
      meta: '판교 · 1년 미만 · 11월 2일 ~ 8일',
      rank: '9등',
      sub: '148명 중 · 상위 6%',
      badges: [
        { label: '상위 10%', icon: 'crown' },
        { label: '개척자', icon: 'flag' },
      ],
      footer: '주차각 · parkinggack.vercel.app',
      file: 'parkinggack-king-2026-11-02.png',
    })
  })

  it('직접 그린다: 먹색 바탕 1080×1350, 등수 96px 굵게, 배지·문구·바닥글', () => {
    const { ctx, calls } = recorder()
    drawResultCard(ctx, model)
    expect(SHARE_W * SHARE_SCALE).toBe(1080)
    expect(SHARE_H * SHARE_SCALE).toBe(1350)
    expect(calls[0]).toMatchObject({ op: 'save' })
    expect(calls.find((c) => c.op === 'scale')?.args).toEqual([3, 3])
    expect(calls.find((c) => c.op === 'fillRect')).toMatchObject({ args: [0, 0, 360, 450], fill: '#1e1e1e' })
    const texts = calls.filter((c) => c.op === 'fillText')
    expect(texts.map((c) => c.args[0])).toEqual(['주차왕', '판교 · 1년 미만 · 11월 2일 ~ 8일', '9등', '148명 중 · 상위 6%', '상위 10%', '개척자', '주차각 · parkinggack.vercel.app'])
    expect(texts.find((c) => c.args[0] === '9등')?.font).toMatch(/^700 96px "Noto Sans KR"/)
    expect(calls.filter((c) => c.op === 'save').length).toBe(calls.filter((c) => c.op === 'restore').length)
  })
})
