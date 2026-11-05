import { describe, expect, it } from 'vitest'
import {
  congestionWord, difficultyLabel, difficultyLevel, experienceLabel, formatCount, formatDateTime, formatDurationKo,
  formatNumber, formatPercent, formatRelative, formatScore, parkedWhen, REASON_TAGS, shapeLabel, tagLabel, vehicleClassLabel,
} from './format'
import { describeHourPeak, markerDiameter, markerScaleForZoom, peakIndex, summarizeLots } from './stats'
import type { ParkingLot } from '@api-types'

describe('난이도 표시 (Kotlin Difficulty 와 같음)', () => {
  it('등급은 반올림, 1..5로 자름', () => {
    expect(difficultyLevel(4.3)).toBe(4)
    expect(difficultyLevel(4.5)).toBe(5)
    expect(difficultyLevel(1.8)).toBe(2)
    expect(difficultyLevel(0.2)).toBe(1)
    expect(difficultyLevel(7)).toBe(5)
  })
  it('라벨 · 별점 글자', () => {
    expect(difficultyLabel(4.3)).toBe('어려움')
    expect(difficultyLabel(1.4)).toBe('아주 쉬움')
    expect(difficultyLabel(3.0)).toBe('보통')
    expect(difficultyLabel(4.6)).toBe('아주 어려움')
    expect(difficultyLabel(null)).toBe('기록 적음')
    expect(formatScore(4.25)).toBe('★4.3')
    expect(formatScore(1.8)).toBe('★1.8')
    expect(formatScore(null)).toBe('–')
  })
})

describe('태그·라벨', () => {
  it('ReasonTag 9개 한국어 라벨', () => {
    expect(REASON_TAGS).toHaveLength(9)
    expect(REASON_TAGS.map(tagLabel)).toEqual([
      '회전 램프 좁음', '좁은 통로', '기둥 많음', '기계식', '경사 급함', '후진 잦음', '자리 넉넉', '평면 주차장', '층 많음',
    ])
    expect(tagLabel('UNKNOWN_TAG')).toBe('UNKNOWN_TAG')
  })
  it('형태·차 크기·경력·주차 시각대', () => {
    expect(shapeLabel('PERPENDICULAR')).toBe('직각')
    expect(shapeLabel('PARALLEL')).toBe('평행')
    expect(vehicleClassLabel('SUV')).toBe('SUV')
    expect(vehicleClassLabel('COMPACT')).toBe('소형')
    expect(experienceLabel('UNDER_1Y')).toBe('1년 미만')
    expect(parkedWhen(2, 17)).toBe('화 17시')
    expect(parkedWhen(7, 9)).toBe('일 9시')
  })
})

describe('숫자 · 시간', () => {
  it('formatCount / formatDurationKo (Kotlin Format.kt 와 같음)', () => {
    expect(formatCount(2.0)).toBe('2')
    expect(formatCount(2.45)).toBe('2.5')
    expect(formatCount(3.2)).toBe('3.2')
    expect(formatDurationKo(100)).toBe('1분 40초')
    expect(formatDurationKo(55)).toBe('55초')
    expect(formatDurationKo(125)).toBe('2분 05초')
    expect(formatDurationKo(120)).toBe('2분')
    expect(formatDurationKo(-3)).toBe('0초')
  })
  it('천 단위 쉼표 · 퍼센트', () => {
    expect(formatNumber(10904)).toBe('10,904')
    expect(formatPercent(0.0851)).toBe('9%')
    expect(formatPercent(NaN)).toBe('–')
  })
  it('날짜는 한국 시간으로', () => {
    // 2026-11-03 08:02 UTC = 오후 5:02 KST (화)
    expect(formatDateTime('2026-11-03T08:02:00Z')).toBe('11.3 (화) 오후 5:02')
    expect(formatDateTime('2026-11-02T15:30:00Z')).toBe('11.3 (화) 오전 12:30')
    expect(formatDateTime(null)).toBe('–')
    expect(formatDateTime('nope')).toBe('–')
  })
  it('상대 시각', () => {
    const now = Date.parse('2026-11-03T08:02:00Z')
    expect(formatRelative(now - 20_000, now)).toBe('방금')
    expect(formatRelative(now - 4 * 60_000, now)).toBe('4분 전')
    expect(formatRelative(now - 130 * 60_000, now)).toBe('2시간 10분 전')
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe('3시간 전')
    expect(formatRelative(now - 26 * 3_600_000, now)).toBe('어제')
    expect(formatRelative(now - 5 * 86_400_000, now)).toBe('5일 전')
    expect(formatRelative(now - 40 * 86_400_000, now)).toBe('9.24 (목)')
  })
  it('층별 혼잡 단어', () => {
    expect(congestionWord(1)).toBe('만차')
    expect(congestionWord(0.9)).toBe('붐빔')
    expect(congestionWord(0.3)).toBe('여유')
  })
})

describe('대시보드 요약', () => {
  const lot = (id: string, difficulty: number | null, sampleCount: number): ParkingLot => ({
    id, name: id, location: { lat: 37, lng: 127 }, difficulty, tags: [], statChips: [], sampleCount, ratingCount: 0,
    floors: ['1F'], zoneScheme: { zones: [], numbers: [] }, publicInfo: [], feeText: null, updatedAt: '2026-11-03T00:00:00Z', category: 'OTHER', region: 'pangyo',
  })
  it('평균 난이도와 ★4 이상 비율은 점수 있는 곳만으로', () => {
    const s = summarizeLots([lot('a', 4.3, 142), lot('b', 1.8, 87), lot('c', null, 3), lot('d', 4.0, 10)])
    expect(s.lots).toBe(4)
    expect(s.rated).toBe(3)
    expect(s.sparse).toBe(1)
    expect(s.avgDifficulty).toBeCloseTo((4.3 + 1.8 + 4.0) / 3)
    expect(s.hardCount).toBe(2)
    expect(s.hardShare).toBeCloseTo(2 / 3)
    expect(s.samples30d).toBe(242)
  })
  it('점수가 하나도 없으면 null', () => {
    const s = summarizeLots([lot('c', null, 3)])
    expect(s.avgDifficulty).toBeNull()
    expect(s.hardShare).toBeNull()
  })
  it('가장 많은 시간대 문장', () => {
    const h = new Array(24).fill(1)
    h[18] = 9
    expect(peakIndex(h)).toBe(18)
    expect(describeHourPeak(h)).toBe('오후 6시 무렵이 가장 많아요')
    expect(describeHourPeak(new Array(24).fill(0))).toBe('아직 기록이 없어요')
  })
  it('마커 지름은 기록 수(면적)에 비례, 확대 수준에 따라 작아짐', () => {
    expect(markerDiameter(0, 200)).toBe(26)
    expect(markerDiameter(200, 200)).toBe(58)
    expect(markerDiameter(50, 200)).toBe(42)
    expect(markerDiameter(200, 200, 'sm')).toBe(40)
    expect(markerScaleForZoom(9.5)).toBe('sm')
    expect(markerScaleForZoom(11)).toBe('md')
    expect(markerScaleForZoom(15)).toBe('lg')
  })
})
