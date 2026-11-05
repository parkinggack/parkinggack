import { describe, expect, it } from 'vitest'
import {
  barScaleMax, categoryLabel, formatFloorRange, formatRampTurns, formatTimes, mapLabel, prevPeriodLabel, reverseLevel, sparkPoints,
} from './format'

describe('대시보드 표시 규칙', () => {
  it('평균 후진 5단계: 2.2 · 2.8 · 3.4 · 4.0회 경계', () => {
    expect([1.6, 2.19, 2.2, 2.79, 2.8, 3.39, 3.4, 3.99, 4.0, 4.6].map(reverseLevel)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
  })

  it('램프: 바퀴 수는 0.5 단위, 조금 돌면 직선, 0이면 없음 (D-03 표)', () => {
    expect([2.5, 1.5, 2, 1, 0.3, 0.2, 0].map(formatRampTurns)).toEqual(['2.5바퀴', '1.5바퀴', '2바퀴', '1바퀴', '직선', '직선', '없음'])
    expect(formatRampTurns(1.74)).toBe('1.5바퀴')
  })

  it('횟수·층 범위·유형·기간', () => {
    expect([3.2, 2, 0.94].map(formatTimes)).toEqual(['3.2회', '2.0회', '0.9회'])
    expect(formatFloorRange(['B1', 'B2', 'B3', 'B4', 'B5', 'B6'])).toBe('지하 1~6층')
    expect(formatFloorRange(['1F'])).toBe('지상 1층')
    expect(formatFloorRange(['1F', 'B1', 'B2'])).toBe('지상 1층 · 지하 1~2층')
    expect(categoryLabel('DEPARTMENT')).toBe('백화점')
    expect(categoryLabel(null)).toBe('기타')
    expect([30, 7, 90].map(prevPeriodLabel)).toEqual(['지난달', '지난주', '이전 90일'])
    expect(mapLabel('현대백화점 판교점 지하')).toBe('현대백화점 판교점')
  })

  it('꺾은선: 시안과 같은 120×32 틀, 변화가 클수록 높게', () => {
    expect(sparkPoints([2.9, 2.8, 2.8, 2.7, 2.6, 2.6])).toEqual([[4, 10], [26, 14], [49, 14], [71, 18], [94, 22], [116, 22]]) // 시안 H스퀘어와 같음
    expect(sparkPoints([1.7, 1.7, 1.6, 1.6, 1.5, 1.5])).toEqual([[4, 11], [26, 11], [49, 16], [71, 16], [94, 21], [116, 21]]) // 알파돔
    expect(sparkPoints([2, 2, 2]).every(([, y]) => y === 16)).toBe(true)
    expect(sparkPoints([])).toEqual([])
  })

  it('막대 눈금: 가장 큰 값 × 1.1 올림 (시안 3.6 → 4, 3.2 → 4)', () => {
    expect(barScaleMax([2.1, 3.6, 3.4])).toBe(4)
    expect(barScaleMax([3.2, 2.0])).toBe(4)
    expect(barScaleMax([])).toBe(1)
  })
})
