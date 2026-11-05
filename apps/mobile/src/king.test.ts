import type { KingBoardRow, KingResultResponse } from '@api-types'
import { describe, expect, it } from 'vitest'
import { FORBIDDEN } from './copy'
import {
  boardItems,
  kingCardLabel,
  kingDayLabel,
  kingMovement,
  kingParkingSub,
  kingPoints,
  kingRank,
  kingSummary,
  KING_GRADE_LABEL,
  leagueLongLabel,
  leagueShortLabel,
  resultDelta,
  resultSub,
  resultTitle,
  resultWeekLine,
  scoreParts,
  shouldShowResult,
  weekRangeLabel,
  weekStartKst,
} from './king'
import { KING_LEAGUE, kingBoardFixture, kingMeFixture, kingResultFixture } from './mock/king'

const THU = new Date('2026-11-05T17:02:00+09:00').getTime()
const MON = new Date('2026-11-09T09:12:00+09:00').getTime()
const row = (rank: number, nickname: string, score: number, isMe = false): KingBoardRow => ({ rank, nickname, score, isMe })

describe('점수·등수 글자', () => {
  it('"12등" · "82점"', () => {
    expect(kingRank(12)).toBe('12등')
    expect(kingPoints(82)).toBe('82점')
  })

  it('M-50 위 카드: "판교 초보 148명 중 · 82점", 이름 "이번 주 12등, 82점. 점수 자세히 보기"', () => {
    const me = kingMeFixture(THU, '판교 느긋한 수달')
    expect(kingSummary(me)).toBe('판교 초보 148명 중 · 82점')
    expect(kingCardLabel(me)).toBe('이번 주 12등, 82점. 점수 자세히 보기')
  })

  it('이번 주 점수가 아직 없으면 순위 대신 참여자 수', () => {
    const me = { ...kingMeFixture(THU, 'x'), rank: null, score: null }
    expect(kingSummary(me)).toBe('판교 초보 148명이 겨루고 있어요')
    expect(kingMovement(me).text).toBe('주차하면 이번 주 순위가 생겨요')
  })

  it('올라왔으면 "지난주 17등에서 올라왔어요"(화살표), 같으면 그대로, 내려간 것은 말하지 않고 다음 할 일만', () => {
    expect(kingMovement({ rank: 12, prevWeekRank: 17, nextHint: null })).toEqual({ text: '지난주 17등에서 올라왔어요', up: true })
    expect(kingMovement({ rank: 12, prevWeekRank: 12, nextHint: null })).toEqual({ text: '지난주와 같은 12등이에요', up: false })
    expect(kingMovement({ rank: 12, prevWeekRank: null, nextHint: null }).up).toBe(false)
    const down = kingMovement({ rank: 20, prevWeekRank: 12, nextHint: '한 번만 더 깔끔하게 대면 18등이에요' })
    expect(down).toEqual({ text: '한 번만 더 깔끔하게 대면 18등이에요', up: false })
    expect(kingMovement({ rank: 20, prevWeekRank: 12, nextHint: null }).text).not.toMatch(/내려|떨어|20등/)
  })

  it('판정 낱말: 깔끔 · 보통 · 빠짐', () => {
    expect(KING_GRADE_LABEL).toEqual({ CLEAN: '깔끔', OK: '보통', EXCLUDED: '빠짐' })
  })

  it('M-51 막대: 58/70 → 83%, 11/15 → 73%, 13/15 → 87% (넘치는 값은 잘라냄)', () => {
    expect(scoreParts({ total: 82, maneuver: 58, lotsVisited: 11, improvement: 13 })).toEqual([
      { key: 'maneuver', label: '후진·핸들', value: 58, max: 70, pct: 83 },
      { key: 'lotsVisited', label: '가 본 주차장', value: 11, max: 15, pct: 73 },
      { key: 'improvement', label: '지난달보다 나아진 만큼', value: 13, max: 15, pct: 87 },
    ])
    expect(scoreParts({ total: 0, maneuver: 90, lotsVisited: -3, improvement: 15 }).map((p) => p.pct)).toEqual([100, 0, 100])
  })
})

describe('날짜 (한국 시각)', () => {
  it('주는 월요일 00:00 KST 부터', () => {
    expect(new Date(weekStartKst(THU)).toISOString()).toBe('2026-11-01T15:00:00.000Z')
    expect(new Date(weekStartKst(MON)).toISOString()).toBe('2026-11-08T15:00:00.000Z')
    // 일요일 밤 11시는 그 전 주
    expect(new Date(weekStartKst(new Date('2026-11-08T23:00:00+09:00').getTime())).toISOString()).toBe('2026-11-01T15:00:00.000Z')
  })

  it('M-51 요일: 오늘 · 월요일 · 화요일 · 수요일 (이번 주), 그 전은 날짜', () => {
    const at = (s: string) => new Date(s).getTime()
    expect(kingDayLabel(at('2026-11-05T09:00:00+09:00'), THU)).toBe('오늘')
    expect(kingDayLabel(at('2026-11-02T13:00:00+09:00'), THU)).toBe('월요일')
    expect(kingDayLabel(at('2026-11-04T23:59:00+09:00'), THU)).toBe('수요일')
    expect(kingDayLabel(at('2026-11-01T20:00:00+09:00'), THU)).toBe('11월 1일')
  })

  it('M-53 "11월 2일 ~ 8일", 달이 바뀌면 "10월 26일 ~ 11월 1일"', () => {
    expect(weekRangeLabel({ start: '2026-11-01T15:00:00.000Z', end: '2026-11-08T15:00:00.000Z' })).toBe('11월 2일 ~ 8일')
    expect(weekRangeLabel({ start: '2026-10-25T15:00:00.000Z', end: '2026-11-01T15:00:00.000Z' })).toBe('10월 26일 ~ 11월 1일')
  })

  it('이번 주에 댄 곳 한 줄: "오늘 · 후진 1번", 빠짐은 이유', () => {
    const rows = kingMeFixture(THU, 'x').parkings
    expect(rows.map((r) => kingParkingSub(r, THU))).toEqual(['오늘 · 후진 1번', '월요일 · 후진 1번', '화요일 · 후진 2번', '수요일 · 주차장 안에서 시속 10km를 넘었어요'])
    expect(kingParkingSub({ parkedAt: rows[0].parkedAt, reverseCount: 0, grade: 'EXCLUDED', excludedReason: null }, THU)).toBe('오늘 · 이번 점수에서는 빠졌어요')
  })
})

describe('리그 이름', () => {
  it('서버 리그가 있으면 그것, 참여 전에 없으면 동네 + 운전 경력', () => {
    expect(leagueShortLabel(KING_LEAGUE)).toBe('판교 초보')
    expect(leagueLongLabel(KING_LEAGUE)).toBe('판교 · 1년 미만')
    expect(leagueLongLabel(null, { experience: 'UNDER_1Y' })).toBe('판교 · 1년 미만')
    expect(leagueLongLabel(null, { regionName: '백현', experience: 'Y3_10' })).toBe('백현 · 3~10년')
    expect(leagueLongLabel(null, {})).toBe('판교 · 모든 경력')
    expect(leagueShortLabel(null, { experience: 'OVER_10Y' })).toBe('판교 베테랑')
  })
})

describe('순위판 자르기 (상위 5 + ··· + 내 앞뒤)', () => {
  const top = [row(1, '백현 조용한 고래', 96), row(2, '삼평 단단한 펭귄', 94), row(3, '운중 느린 거북', 93), row(4, '판교 맑은 여우', 91), row(5, '백현 둥근 너구리', 90)]

  it('시안: 1~5등, ···, 11·12(나)·13', () => {
    const items = boardItems(kingBoardFixture(THU, '판교 느긋한 수달'))
    expect(items.map((i) => (i.kind === 'gap' ? '···' : `${i.row.rank}${i.row.isMe ? '(나)' : ''}`))).toEqual(['1', '2', '3', '4', '5', '···', '11', '12(나)', '13'])
  })

  it('내가 5등 안이면 상위 5만 (중복 없음, ··· 없음)', () => {
    const items = boardItems({ top: top.map((r) => (r.rank === 3 ? { ...r, isMe: true } : r)), around: [] })
    expect(items).toHaveLength(5)
    expect(items.filter((i) => i.kind === 'row' && i.row.isMe)).toHaveLength(1)
  })

  it('서버가 겹쳐 보내도 한 번만 — 나는 표시를 살림', () => {
    const items = boardItems({ top, around: [row(4, '판교 맑은 여우', 91, true), row(5, '백현 둥근 너구리', 90), row(6, '운중 다정한 곰', 89)] })
    const rows = items.filter((i) => i.kind === 'row')
    expect(rows.map((i) => (i.kind === 'row' ? i.row.rank : 0))).toEqual([1, 2, 3, 4, 5, 6])
    expect(items.some((i) => i.kind === 'gap')).toBe(false) // 5 다음 6 → 바로 이어짐
    expect((rows[3] as { row: KingBoardRow }).row).toEqual({ ...top[3], isMe: true })
  })

  it('6등이면 ··· 없이 이어지고, 동점(같은 등수 다른 이름)은 둘 다', () => {
    const items = boardItems({ top, around: [row(5, '백현 둥근 너구리', 90), row(6, '판교 느긋한 수달', 88, true), row(7, '운중 다정한 곰', 87)] })
    expect(items.map((i) => (i.kind === 'gap' ? '···' : i.row.rank))).toEqual([1, 2, 3, 4, 5, 6, 7])
    const tie = boardItems({ top, around: [row(5, '판교 느긋한 수달', 90, true)] })
    expect(tie.filter((i) => i.kind === 'row')).toHaveLength(6)
  })

  it('정렬이 섞여 와도 등수 순, 순서 사이에 빈 곳마다 ···', () => {
    const items = boardItems({ top: [...top].reverse(), around: [row(13, 'c', 81), row(11, 'a', 84), row(12, 'b', 82, true)] })
    expect(items.map((i) => (i.kind === 'gap' ? '···' : i.row.rank))).toEqual([1, 2, 3, 4, 5, '···', 11, 12, 13])
  })
})

describe('M-53 지난주 결과', () => {
  const r: KingResultResponse = kingResultFixture(MON)

  it('시안 값: "지난주 결과 · 11월 2일 ~ 8일", "판교 · 1년 미만 리그에서 / 9등 했어요", "148명 중 · 상위 6%", "지난주보다 3계단 올랐어요"', () => {
    expect(resultWeekLine(r)).toBe('지난주 결과 · 11월 2일 ~ 8일')
    expect(resultTitle(r)).toEqual(['판교 · 1년 미만 리그에서', '9등 했어요'])
    expect(resultSub(r)).toBe('148명 중 · 상위 6%')
    expect(resultDelta(r)).toBe('지난주보다 3계단 올랐어요')
    expect(r.badges).toEqual(['TOP10', 'PIONEER'])
  })

  it('계단: 처음 · 같음 · 내려감(평가하지 않음)', () => {
    expect(resultDelta({ rankDelta: null })).toBe('처음 받은 주차왕 결과예요')
    expect(resultDelta({ rankDelta: 0 })).toBe('지난주와 같은 자리를 지켰어요')
    expect(resultDelta({ rankDelta: -4 })).not.toMatch(/내려|떨어|4계단/)
  })

  it('한 주에 한 번: 새 주의 결과이고 아직 안 봤을 때만', () => {
    expect(shouldShowResult(r, null)).toBe(true)
    expect(shouldShowResult(r, r.week.start)).toBe(false)
    expect(shouldShowResult(r, '2026-10-25T15:00:00.000Z')).toBe(true) // 그 전 주를 본 사람
    expect(shouldShowResult(null, null)).toBe(false)
    expect(shouldShowResult(undefined, 'x')).toBe(false)
  })
})

describe('문구 규칙 (주차왕)', () => {
  const me = kingMeFixture(THU, '판교 느긋한 수달')
  const texts = [
    kingSummary(me),
    kingMovement(me).text,
    kingMovement({ rank: 20, prevWeekRank: 12, nextHint: null }).text,
    ...me.parkings.map((p) => kingParkingSub(p, THU)),
    ...Object.values(KING_GRADE_LABEL),
    resultDelta({ rankDelta: -3 }),
    resultDelta({ rankDelta: null }),
    ...resultTitle(kingResultFixture(MON)),
  ]
  it.each(FORBIDDEN)("'%s' 없음", (w) => {
    for (const t of texts) expect(t).not.toContain(w)
  })
  it('느낌표·이모지 없음', () => {
    for (const t of texts) expect(t).not.toMatch(/[!！]|\p{Extended_Pictographic}/u)
  })
})
