import { describe, expect, it } from 'vitest'
import {
  barsFilled,
  congestionWord,
  dayLabel,
  difficultyLabel,
  distanceBetween,
  formatAgo,
  formatCount,
  formatDuration,
  formatScore,
  monthLabel,
  reverseText,
  shortLotName,
  spotTitle,
  walkLabel,
  walkMinutes,
} from './format'

// vite.config.ts test.env: TZ=Asia/Seoul
const kst = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime()
const MIN = 60_000

describe('formatAgo (홈·M-01 "2시간 전")', () => {
  const t = kst(2026, 11, 3, 14, 52)
  it.each([
    [0, '방금 전'],
    [-MIN, '방금 전'],
    [5 * MIN, '5분 전'],
    [130 * MIN, '2시간 전'], // 시안: 오후 2:52 주차 → 오후 5:02
    [23 * 60 * MIN + 59 * MIN, '23시간 전'],
    [26 * 60 * MIN, '1일 전'],
  ])('%i → %s', (d, text) => expect(formatAgo(t, t + d)).toBe(text))
})

describe('dayLabel (M-32 목록)', () => {
  const now = kst(2026, 11, 3, 17, 2)
  it('오늘 · 어제 · 날짜 · 다른 해', () => {
    expect(dayLabel(kst(2026, 11, 3, 0, 5), now)).toBe('오늘')
    expect(dayLabel(kst(2026, 11, 2, 23, 59), now)).toBe('어제')
    expect(dayLabel(kst(2026, 11, 1, 12, 0), now)).toBe('11월 1일')
    expect(dayLabel(kst(2026, 10, 30, 8, 0), now)).toBe('10월 30일')
    expect(dayLabel(kst(2025, 12, 31, 8, 0), now)).toBe('2025년 12월 31일')
  })
})

describe('숫자', () => {
  it('formatDuration "1분 40초"', () => {
    expect(formatDuration(100)).toBe('1분 40초')
    expect(formatDuration(45)).toBe('45초')
    expect(formatDuration(120)).toBe('2분')
    expect(formatDuration(-3)).toBe('0초')
  })
  it('formatCount (평균): 1.6 · 2 · 0.4', () => {
    expect(formatCount(1.6)).toBe('1.6')
    expect(formatCount(2)).toBe('2')
    expect(formatCount(2.04)).toBe('2')
    expect(formatCount(0.39999)).toBe('0.4')
  })
  it('formatScore (난이도): 늘 소수 한 자리, 없으면 –', () => {
    expect(formatScore(4.3)).toBe('4.3')
    expect(formatScore(2)).toBe('2.0')
    expect(formatScore(null)).toBe('–')
  })
  it('reverseText — 0번은 "후진 없이"', () => {
    expect(reverseText(0)).toBe('후진 없이')
    expect(reverseText(2)).toBe('후진 2번')
  })
})

describe('난이도 표시 (막대 5칸 + 숫자 + 낱말)', () => {
  it('시안 값: 4.3→4칸, 3.1→3칸, 1.6→2칸, 1.8→2칸, 2.4→2칸, 2.9→3칸', () => {
    expect([4.3, 3.1, 1.6, 1.8, 2.4, 2.9].map(barsFilled)).toEqual([4, 3, 2, 2, 2, 3])
    expect(barsFilled(null)).toBe(0)
    expect(barsFilled(9)).toBe(5)
  })
  it('낱말 (주차장 이야기, 운전자 평가 아님)', () => {
    expect(difficultyLabel(4.3)).toBe('어려워요')
    expect(difficultyLabel(1.8)).toBe('쉬워요')
    expect(difficultyLabel(2.9)).toBe('보통이에요')
    expect(difficultyLabel(4.6)).toBe('아주 어려워요')
    expect(difficultyLabel(null)).toBe('아직 기록이 적어요')
  })
  it('층별 혼잡 낱말 (시안 M-31)', () => {
    expect([1.0, 0.92, 0.6, 0.35].map(congestionWord)).toEqual(['만차', '꽉 참', '여유', '넉넉'])
  })
})

describe('이름·거리', () => {
  it('shortLotName — 서버 이름을 시안처럼 짧게', () => {
    expect(shortLotName('아브뉴프랑 판교 주차장')).toBe('아브뉴프랑 판교')
    expect(shortLotName('현대백화점 판교점 지하주차장')).toBe('현대백화점 판교점')
    expect(shortLotName('화랑공원 공영주차장')).toBe('화랑공원 공영')
    expect(shortLotName('집 · 백현마을 5단지')).toBe('백현마을 5단지')
    expect(shortLotName('회사 · H스퀘어')).toBe('H스퀘어')
    expect(shortLotName('주차장')).toBe('주차장')
  })
  it('walkLabel — 바로 앞 / 걸어서 N분', () => {
    expect(walkLabel(60)).toBe('바로 앞')
    expect(walkLabel(205)).toBe('걸어서 3분')
    expect(walkMinutes(245)).toBe(4)
    expect(walkLabel(undefined)).toBe('')
  })
  it('distanceBetween — 판교역 → 현대백화점 약 245m', () => {
    const d = distanceBetween({ lat: 37.3947, lng: 127.1112 }, { lat: 37.3926, lng: 127.1121 })
    expect(d).toBeGreaterThan(230)
    expect(d).toBeLessThan(260)
  })
  it('monthLabel · spotTitle', () => {
    expect(monthLabel('2026-06')).toBe('6월')
    expect(monthLabel('2026-11')).toBe('11월')
    expect(spotTitle({ floor: 'B2', zone: 'D', number: '07' })).toBe('B2 · D-07')
    expect(spotTitle({ floor: null, zone: null, number: null })).toBe('위치 미기록')
  })
})
