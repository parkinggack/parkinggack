/**
 * 주차왕(v1.2) 시연 데이터 — 시안 M-50~M-53 과 같은 값 (이름·점수는 시연용 예시, 메모 ps4).
 *
 *   M-50  판교 초보 148명 중 12등 · 82점, 지난주 17등에서 올라왔어요, 1~5등 + 11·12(나)·13
 *   M-51  58/70 · 11/15 · 13/15, "한 번만 더 깔끔하게 대면 10등이에요", 이번 주에 댄 곳 4곳(깔끔·깔끔·보통·빠짐)
 *   M-52  닉네임 "판교 느긋한 수달" (다시 뽑기로 다른 이름), 내 리그 "판교 · 1년 미만"
 *   M-53  지난주 9등 · 148명 중 · 상위 6%, 배지 상위 10% · 개척자, 지난주보다 3계단 올랐어요
 *
 * 시각은 '지금' 기준 (이번 주 = 지금이 든 주의 월요일 00:00 KST부터). M-51 의 요일(오늘·월·화·수)은 목요일 이후에 열면 시안과 같고,
 * 그 전 요일이면 지금보다 앞선 시각으로 당겨 둔다(미래 기록이 없게).
 */
import type { KingBoardResponse, KingBoardRow, KingLeague, KingMeResponse, KingParkingRow, KingResultResponse } from '@api-types'
import { weekStartKst } from '../king'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const iso = (ms: number) => new Date(ms).toISOString()

export const KING_LEAGUE: KingLeague = {
  id: 'pangyo:UNDER_1Y',
  region: 'pangyo',
  regionName: '판교',
  experience: 'UNDER_1Y',
  label: '판교 초보',
  longLabel: '판교 · 1년 미만',
}

export const KING_TOTAL = 148
export const KING_FIRST_NICKNAME = '판교 느긋한 수달'

/** 다시 뽑기 순서 (동네 + 형용사 + 동물) — 첫 번째가 시안 */
export const NICKNAMES = ['판교 느긋한 수달', '판교 다정한 고래', '판교 차분한 고양이', '판교 단단한 거북', '판교 맑은 다람쥐', '판교 조용한 부엉이', '판교 둥근 펭귄', '판교 너그러운 사슴']

const TOP: Array<[string, number]> = [
  ['백현 조용한 고래', 96],
  ['삼평 단단한 펭귄', 94],
  ['운중 느린 거북', 93],
  ['판교 맑은 여우', 91],
  ['백현 둥근 너구리', 90],
]

export function kingWeek(now: number): { start: string; end: string } {
  const s = weekStartKst(now)
  return { start: iso(s), end: iso(s + 7 * DAY) }
}

/** 이번 주에 댄 곳 (시안 순서 그대로: 오늘 · 월 · 화 · 수) */
export function kingParkingRows(now: number): KingParkingRow[] {
  const ws = weekStartKst(now)
  const at = (target: number, i: number) => Math.min(target, now - (i + 1) * 47 * MIN)
  return [
    { parkingId: 'k-today-hyundai', lotName: '현대백화점 판교점 지하주차장', parkedAt: iso(at(now - 3 * HOUR, 0)), reverseCount: 1, grade: 'CLEAN', excludedReason: null },
    { parkingId: 'k-mon-avenue', lotName: '아브뉴프랑 판교 주차장', parkedAt: iso(at(ws + 13 * HOUR, 1)), reverseCount: 1, grade: 'CLEAN', excludedReason: null },
    { parkingId: 'k-tue-hsquare', lotName: 'H스퀘어 주차장', parkedAt: iso(at(ws + DAY + 15 * HOUR, 2)), reverseCount: 2, grade: 'OK', excludedReason: null },
    { parkingId: 'k-wed-baekhyun', lotName: '백현마을 5단지 주차장', parkedAt: iso(at(ws + 2 * DAY + 11 * HOUR, 3)), reverseCount: 0, grade: 'EXCLUDED', excludedReason: 'SPEED' },
  ]
}

export function kingMeFixture(now: number, nickname: string | null): KingMeResponse {
  const week = kingWeek(now)
  if (!nickname) {
    // 참여 전: 리그는 미리 보기로 같이 준다 (M-52 '내 리그')
    return { joined: false, nickname: null, league: KING_LEAGUE, week, rank: null, total: KING_TOTAL, percentile: null, score: null, prevWeekRank: null, nextHint: null, parkings: [] }
  }
  return {
    joined: true,
    nickname,
    league: KING_LEAGUE,
    week,
    rank: 12,
    total: KING_TOTAL,
    percentile: 9,
    score: { total: 82, maneuver: 58, lotsVisited: 11, improvement: 13 },
    prevWeekRank: 17,
    nextHint: '한 번만 더 깔끔하게 대면 10등이에요',
    parkings: kingParkingRows(now),
  }
}

export function kingBoardFixture(now: number, nickname: string): KingBoardResponse {
  const top: KingBoardRow[] = TOP.map(([n, score], i) => ({ rank: i + 1, nickname: n, score, isMe: false }))
  return {
    league: KING_LEAGUE,
    week: kingWeek(now),
    total: KING_TOTAL,
    top,
    around: [
      { rank: 11, nickname: '판교 차분한 두루미', score: 84, isMe: false },
      { rank: 12, nickname, score: 82, isMe: true },
      { rank: 13, nickname: '운중 다정한 곰', score: 81, isMe: false },
    ],
    demo: true,
  }
}

export function kingResultFixture(now: number): KingResultResponse {
  const ws = weekStartKst(now)
  return {
    week: { start: iso(ws - 7 * DAY), end: iso(ws) },
    league: KING_LEAGUE,
    rank: 9,
    total: KING_TOTAL,
    percentile: 6,
    score: 86,
    rankDelta: 3,
    badges: ['TOP10', 'PIONEER'],
  }
}
