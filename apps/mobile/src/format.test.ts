import { describe, expect, it } from 'vitest'
import { formatClock, formatElapsed, formatParkedAt, formatWhen, spotOf } from './format'

// vite.config.ts test.env: TZ=Asia/Seoul
const kst = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime()
const MIN = 60_000

describe('시간대', () => {
  it('테스트는 한국 시간', () => {
    expect(new Date(1793685120000).getHours()).toBe(14) // 2026-11-03 14:52 KST
  })
})

describe('formatElapsed', () => {
  const t = kst(2026, 11, 3, 14, 52)
  it.each([
    [0, '방금 전'],
    [59 * 1000, '방금 전'],
    [-5 * MIN, '방금 전'], // 폰 시계가 차보다 늦어도
    [MIN, '1분 전'],
    [59 * MIN + 59_000, '59분 전'],
    [60 * MIN, '1시간 전'],
    [130 * MIN, '2시간 10분 전'],
    [23 * 60 * MIN + 59 * MIN, '23시간 59분 전'],
    [24 * 60 * MIN, '1일 전'],
    [75 * 60 * MIN, '3일 전'],
  ])('%i ms → %s', (d, text) => {
    expect(formatElapsed(t, t + d)).toBe(text)
  })
})

describe('formatParkedAt', () => {
  const parked = kst(2026, 11, 3, 14, 52)
  it('오늘', () => expect(formatParkedAt(parked, parked + 130 * MIN)).toBe('오후 2:52 주차'))
  it('어제', () => expect(formatParkedAt(parked, kst(2026, 11, 4, 9, 0))).toBe('어제 오후 2:52 주차'))
  it('더 전', () => expect(formatParkedAt(parked, kst(2026, 11, 6, 9, 0))).toBe('11월 3일 오후 2:52 주차'))
  it('작년', () => expect(formatParkedAt(parked, kst(2027, 1, 2, 9, 0))).toBe('2026년 11월 3일 오후 2:52 주차'))
  it('자정 직전 주차 → 자정 직후는 어제', () => {
    expect(formatParkedAt(kst(2026, 11, 3, 23, 50), kst(2026, 11, 4, 0, 10))).toBe('어제 오후 11:50 주차')
  })
})

describe('formatClock', () => {
  it.each([
    [0, 5, '오전 12:05'],
    [9, 0, '오전 9:00'],
    [11, 59, '오전 11:59'],
    [12, 0, '오후 12:00'],
    [14, 52, '오후 2:52'],
    [23, 7, '오후 11:07'],
  ])('%i:%i → %s', (hh, mm, text) => {
    expect(formatClock(kst(2026, 11, 3, hh, mm))).toBe(text)
  })
})

it('M-01 한 줄: 시안과 같은 "오후 2:52 주차 · 2시간 10분 전"', () => {
  const parked = kst(2026, 11, 3, 14, 52)
  expect(formatWhen(parked, kst(2026, 11, 3, 17, 2))).toBe('오후 2:52 주차 · 2시간 10분 전')
})

describe('spotOf', () => {
  it('층·구역·기둥', () => {
    expect(spotOf({ f: 'B2', z: 'D', n: '07' })).toEqual({ floor: 'B2', zoneNumber: 'D-07', zoneLabel: '구역 · 기둥', title: 'B2 · D-07' })
  })
  it('구역만 / 기둥만 / 층만 / 아무것도 없음', () => {
    expect(spotOf({ f: 'B2', z: 'D', n: '' })).toMatchObject({ zoneNumber: 'D', zoneLabel: '구역', title: 'B2 · D' })
    expect(spotOf({ f: 'B2', z: '', n: '07' })).toMatchObject({ zoneNumber: '07', zoneLabel: '기둥', title: 'B2 · 07' })
    expect(spotOf({ f: 'B4', z: '', n: '' })).toMatchObject({ zoneNumber: '', zoneLabel: '', title: 'B4' })
    expect(spotOf({ f: '', z: '', n: '' }).title).toBe('위치 미기록')
  })
})
