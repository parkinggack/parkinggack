import type { MyParking } from '@api-types'
import { describe, expect, it } from 'vitest'
import { homeTip, monthBars, monthHeadline, recordRowSub, recordSubtitle, recordTitle } from './insights'
import { parkingFixtures, statsFixture } from './mock/fixtures'

const NOW = new Date('2026-11-03T17:02:00+09:00').getTime()
const ps = parkingFixtures(NOW)
const today = ps[0]

describe('M-32 큰 글자 (좋아진 것만)', () => {
  it('줄었으면 얼마나 줄었는지 — 시안 "1.6번, 지난달보다 / 0.4번 줄었어요"', () => {
    expect(monthHeadline({ thisMonthAvgReverse: 1.6, lastMonthAvgReverse: 2.0 })).toEqual(['1.6번, 지난달보다', '0.4번 줄었어요'])
  })
  it('같으면 꾸준함, 늘었으면 비교하지 않음, 없으면 아직', () => {
    expect(monthHeadline({ thisMonthAvgReverse: 2, lastMonthAvgReverse: 2 })).toEqual(['2번, 지난달처럼', '꾸준해요'])
    expect(monthHeadline({ thisMonthAvgReverse: 2.4, lastMonthAvgReverse: 1.6 })).toEqual(['2.4번이에요'])
    expect(monthHeadline({ thisMonthAvgReverse: 1.2, lastMonthAvgReverse: null })).toEqual(['1.2번이에요'])
    expect(monthHeadline({ thisMonthAvgReverse: null, lastMonthAvgReverse: 2 })).toEqual(['이번 달은 아직', '기록이 없어요'])
  })
  it('막대 높이는 시안과 같은 비율 (3.8번 = 91px)', () => {
    expect(monthBars(statsFixture(NOW).monthly).map((b) => b.h)).toEqual([91, 74, 62, 57, 48, 38])
  })
})

describe('M-20 한 줄', () => {
  it('오늘 주차가 있으면 그 이야기 → M-33 (시안 "오늘은 후진 2번이면 충분했어요")', () => {
    expect(homeTip(statsFixture(NOW), today, NOW)).toEqual({ text: '오늘은 후진 2번이면 충분했어요', to: { name: 'record', id: today.id } })
    const zero: MyParking = { ...today, summary: { ...today.summary!, reverseCount: 0 } }
    expect(homeTip(null, zero, NOW)?.text).toBe('오늘은 후진 없이 바로 댔어요')
  })
  it('오늘 주차가 없으면 줄었을 때만 → M-32', () => {
    expect(homeTip(statsFixture(NOW), ps[1], NOW)).toEqual({ text: '지난달보다 후진이 0.4번 줄었어요', to: { name: 'records' } })
    expect(homeTip({ ...statsFixture(NOW), thisMonthAvgReverse: 2.5 }, null, NOW)).toBeNull()
    expect(homeTip(null, null, NOW)).toBeNull()
  })
})

describe('M-32 목록 · M-33 제목', () => {
  it('시안 값', () => {
    expect(recordRowSub(ps[0], NOW)).toBe('오늘 · 후진 2번')
    expect(recordRowSub(ps[1], NOW)).toBe('11월 1일 · 후진 1번')
    expect(recordRowSub(ps[2], NOW)).toBe('10월 30일 · 후진 없이')
    expect(recordTitle(today)).toEqual(['후진 2번으로', '주차했어요'])
    expect(recordSubtitle(today)).toBe('1분 40초 · 아브뉴프랑 판교 B2')
  })
  it('요약이 없어도', () => {
    const p = { ...today, summary: null }
    expect(recordTitle(p)).toEqual(['이번 주차', '동선이에요'])
    expect(recordSubtitle(p)).toBe('아브뉴프랑 판교 B2')
    expect(recordRowSub(p, NOW)).toBe('오늘 · B2')
    expect(recordTitle({ ...today, summary: { ...today.summary!, reverseCount: 0 } })).toEqual(['후진 없이', '주차했어요'])
  })
})
