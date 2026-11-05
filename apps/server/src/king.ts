/**
 * v1.2 주차왕 — 순수 계산 (DB 없음). 규칙은 docs/api.md "v1.2 — 주차왕", 계약은 packages/api-types 맨 아래.
 *
 * 점수(주마다, 100점) = 후진·핸들 70 + 가 본 주차장 15 + 지난달보다 나아진 만큼 15
 *  - 판정: 주차장 안 최고 속도 > 10km/h → 빠짐(EXCLUDED, 점수·배지 어디에도 안 셈) · 후진 ≤1 이고 핸들 ≤2 → 깔끔 · 그 밖 → 보통
 *  - 후진·핸들: 빠지지 않은 주차마다 70 × clamp(1 − 0.16·후진 − 0.04·max(0, 핸들 − 1), 0, 1) 의 평균. 1건뿐이면 × 0.8
 *  - 가 본 주차장: 빠지지 않은 주차의 서로 다른 주차장 수 1→6, 2→10, 3→13, 4곳 이상→15
 *  - 지난달보다: 이번 주 시작 전 30일 평균 후진(빠진 것 제외) 대비 이번 주 평균 후진이 준 비율 × 15. 그 30일에 기록이 없으면 7
 *  - 후진·핸들·지난달은 각각 반올림한 정수, total = 세 칸의 합 (화면의 "58 + 11 + 13 = 82" 가 늘 맞게)
 * 순위: 점수 높은 순 → 후진·핸들 높은 순 → 먼저 참여한 순 (→ id). 주는 월요일 00:00 Asia/Seoul 에 바뀐다.
 */
import type { DrivingExperience, KingBadge, KingGrade, KingLeague, KingScore } from '@parkinggack/api-types'
import { DAY_MS, HOUR_MS, clamp } from './scoring.js'

export const KING_WEEK_MS = 7 * DAY_MS
const KST_OFFSET_MS = 9 * HOUR_MS
/** 주차장 안에서 이 속도(km/h)를 넘으면 그 주차는 빠짐 */
export const KING_SPEED_LIMIT_KMH = 10
/** "지난달" = 이번 주 시작 전 30일 */
export const KING_BASELINE_MS = 30 * DAY_MS
/** 지난달 기록이 없을 때 "지난달보다" 점수 */
export const KING_NO_HISTORY_IMPROVEMENT = 7
/** 개척자: 그 주에 최근 30일 익명 기록이 이보다 적은 주차장에 댄 적이 있으면 */
export const PIONEER_MAX_RECORDS = 10
export const CLIMBER_MIN_DELTA = 3
export const CLEAN_WEEK_MIN = 3
export const BOARD_TOP = 5

export const MANEUVER_MAX = 70
export const LOTS_MAX = 15
export const IMPROVEMENT_MAX = 15
export const SINGLE_PARKING_FACTOR = 0.8

// ───────── 주 (월요일 00:00 KST) ─────────

/** ms 가 속한 주의 시작 (월요일 00:00 KST, epoch ms). 한국은 서머타임이 없어서 +9시간 고정 */
export function weekStartOf(ms: number): number {
  const day = Math.floor((ms + KST_OFFSET_MS) / DAY_MS)
  const monday = day - ((day + 3) % 7) // 1970-01-01 은 목요일 (월=0 기준 3)
  return monday * DAY_MS - KST_OFFSET_MS
}

export const weekRange = (start: number) => ({ start: new Date(start).toISOString(), end: new Date(start + KING_WEEK_MS).toISOString() })

// ───────── 판정 · 점수 ─────────

export interface KingParkingIn {
  id: string
  lotId: string | null
  lotName: string
  parkedMs: number
  reverseCount: number
  steeringTurns: number
  maxSpeedKmh: number | null
}

export function gradeOf(p: Pick<KingParkingIn, 'reverseCount' | 'steeringTurns' | 'maxSpeedKmh'>): { grade: KingGrade; excludedReason: 'SPEED' | null } {
  if (p.maxSpeedKmh != null && p.maxSpeedKmh > KING_SPEED_LIMIT_KMH) return { grade: 'EXCLUDED', excludedReason: 'SPEED' }
  return { grade: p.reverseCount <= 1 && p.steeringTurns <= 2 ? 'CLEAN' : 'OK', excludedReason: null }
}

export const counts = (p: KingParkingIn) => gradeOf(p).grade !== 'EXCLUDED'

/** 0..1 */
export function maneuverFactor(reverseCount: number, steeringTurns: number): number {
  return clamp(1 - 0.16 * reverseCount - 0.04 * Math.max(0, steeringTurns - 1), 0, 1)
}

const LOT_STEPS = [0, 6, 10, 13, 15]
export function lotsVisitedPoints(distinctLots: number): number {
  return LOT_STEPS[Math.min(Math.max(0, Math.floor(distinctLots)), LOT_STEPS.length - 1)]
}

/** 같은 주차장인지: 서버가 아는 id, 없으면 이름 */
export const lotKey = (p: Pick<KingParkingIn, 'lotId' | 'lotName'>) => p.lotId ?? `name:${p.lotName.trim()}`

/** 부동소수 오차 없이 반올림 (10.4999999 → 10 이 되지 않게) */
const roundPts = (x: number) => Math.round(Math.round(x * 1e6) / 1e6)

/**
 * 한 주 점수. thisWeek = 그 주의 주차, baseline = 그 주 시작 전 30일 주차 (둘 다 요약 있는 것).
 * 빠지지 않은 주차가 없으면 null (그 주 순위에 없음)
 */
export function scoreWeek(thisWeek: readonly KingParkingIn[], baseline: readonly KingParkingIn[]): KingScore | null {
  const ok = thisWeek.filter(counts)
  if (!ok.length) return null
  const mean = ok.reduce((a, p) => a + maneuverFactor(p.reverseCount, p.steeringTurns), 0) / ok.length
  const maneuver = roundPts(MANEUVER_MAX * mean * (ok.length === 1 ? SINGLE_PARKING_FACTOR : 1))
  const lotsVisited = lotsVisitedPoints(new Set(ok.map(lotKey)).size)
  const base = baseline.filter(counts)
  let improvement = KING_NO_HISTORY_IMPROVEMENT
  if (base.length) {
    const prev = base.reduce((a, p) => a + p.reverseCount, 0) / base.length
    const cur = ok.reduce((a, p) => a + p.reverseCount, 0) / ok.length
    // 지난달 평균이 0회였으면 줄일 게 없다: 이번 주도 0회면 만점, 아니면 0
    const ratio = prev > 0 ? clamp((prev - cur) / prev, 0, 1) : cur === 0 ? 1 : 0
    improvement = roundPts(IMPROVEMENT_MAX * ratio)
  }
  return { total: maneuver + lotsVisited + improvement, maneuver, lotsVisited, improvement }
}

// ───────── 순위 ─────────

export interface Standing {
  /** 참여자 id (차 = 차 기기 id, 시연 = demo-…) */
  id: string
  nickname: string
  demo: boolean
  joinedMs: number
  score: KingScore
}

/** 앞이 더 높은 순위면 음수: 점수 → 후진·핸들 → 먼저 참여 → id */
export function compareStandings(a: Pick<Standing, 'id' | 'joinedMs' | 'score'>, b: Pick<Standing, 'id' | 'joinedMs' | 'score'>): number {
  return (
    b.score.total - a.score.total ||
    b.score.maneuver - a.score.maneuver ||
    a.joinedMs - b.joinedMs ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

export function rankStandings<T extends Standing>(list: readonly T[]): (T & { rank: number })[] {
  return [...list].sort(compareStandings).map((s, i) => ({ ...s, rank: i + 1 }))
}

/** 다른 사람들 사이에서 candidate 가 몇 등인지 (others 에 candidate 자신은 없어야 함) */
export function rankAmong(candidate: Pick<Standing, 'id' | 'joinedMs' | 'score'>, others: readonly Pick<Standing, 'id' | 'joinedMs' | 'score'>[]): number {
  return 1 + others.filter((o) => compareStandings(o, candidate) < 0).length
}

/** 상위 % (1..100) = ceil(등수 / 인원 × 100) */
export function percentileOf(rank: number, total: number): number {
  return clamp(Math.ceil(Math.round((rank / total) * 100 * 1e6) / 1e6), 1, 100)
}

/**
 * "한 번만 더 깔끔하게 대면 10등이에요" — 깔끔한 주차(후진 0, 핸들 1) 한 번을 더하면 몇 등이 되는지.
 * 더하는 주차는 이번 주에 이미 간 주차장(가 본 주차장 점수는 그대로)으로 셈해서 약속을 작게 한다. 그래도 그대로면 새 주차장으로 다시 셈.
 * 1등이면 "1등을 지키고 있어요", 올라갈 수 없으면 null
 */
export function nextHintFor(input: {
  rank: number | null
  me: Pick<Standing, 'id' | 'joinedMs'>
  thisWeek: readonly KingParkingIn[]
  baseline: readonly KingParkingIn[]
  others: readonly Pick<Standing, 'id' | 'joinedMs' | 'score'>[]
  weekStart: number
}): string | null {
  const { rank, me, thisWeek, baseline, others } = input
  if (rank === 1) return '1등을 지키고 있어요'
  const visited = thisWeek.find(counts)
  const tryOne = (lot: { lotId: string | null; lotName: string }) => {
    const extra: KingParkingIn = { id: '(next)', ...lot, parkedMs: input.weekStart, reverseCount: 0, steeringTurns: 1, maxSpeedKmh: null }
    const score = scoreWeek([...thisWeek, extra], baseline)!
    return rankAmong({ ...me, score }, others)
  }
  const same = tryOne(visited ? { lotId: visited.lotId, lotName: visited.lotName } : { lotId: null, lotName: '(새 주차장)' })
  if (rank == null) return `깔끔하게 한 번 대면 ${same}등이에요`
  if (same < rank) return `한 번만 더 깔끔하게 대면 ${same}등이에요`
  const lots = new Set(thisWeek.filter(counts).map(lotKey)).size
  if (lots < LOT_STEPS.length - 1) {
    const fresh = tryOne({ lotId: null, lotName: '(새 주차장)' })
    if (fresh < rank) return `새 주차장에서 한 번 더 깔끔하게 대면 ${fresh}등이에요`
  }
  return null
}

// ───────── 배지 (지난주 결과 M-53) ─────────

const BADGE_ORDER: readonly KingBadge[] = ['TOP10', 'TOP3', 'FIRST', 'PIONEER', 'CLIMBER', 'CLEAN_WEEK']

export function badgesFor(r: { rank: number; percentile: number; rankDelta: number | null; pioneer: boolean; cleanWeek: boolean }): KingBadge[] {
  const has: Record<KingBadge, boolean> = {
    TOP10: r.percentile <= 10,
    TOP3: r.rank <= 3,
    FIRST: r.rank === 1,
    PIONEER: r.pioneer,
    CLIMBER: r.rankDelta != null && r.rankDelta >= CLIMBER_MIN_DELTA,
    CLEAN_WEEK: r.cleanWeek,
  }
  return BADGE_ORDER.filter((b) => has[b])
}

/** 깔끔한 한 주: 그 주 판정 받은 주차(빠짐 포함)가 모두 깔끔이고 3건 이상 */
export function isCleanWeek(thisWeek: readonly KingParkingIn[]): boolean {
  return thisWeek.length >= CLEAN_WEEK_MIN && thisWeek.every((p) => gradeOf(p).grade === 'CLEAN')
}

// ───────── 리그 ─────────

/** 순위판에 쓰는 짧은 동네 이름 (대시보드 REGIONS 의 "판교 일대" 와 다름) */
export const KING_REGION_NAMES: Record<string, string> = { pangyo: '판교', bundang: '분당', seoul: '서울', gyeonggi: '경기', incheon: '인천' }
export const KING_DEFAULT_REGION = 'pangyo'

export const EXPERIENCE_LABEL: Record<DrivingExperience, { short: string; long: string }> = {
  UNDER_1Y: { short: '초보', long: '1년 미만' },
  Y1_3: { short: '새내기', long: '1~3년' },
  Y3_10: { short: '중수', long: '3~10년' },
  OVER_10Y: { short: '베테랑', long: '10년 이상' },
  UNKNOWN: { short: '모두', long: '모든 경력' },
}
export const EXPERIENCES = Object.keys(EXPERIENCE_LABEL) as DrivingExperience[]

export const leagueId = (region: string, experience: DrivingExperience) => `${region}:${experience}`

export function leagueOf(region: string, experience: DrivingExperience): KingLeague {
  const regionName = KING_REGION_NAMES[region] ?? region
  const e = EXPERIENCE_LABEL[experience] ?? EXPERIENCE_LABEL.UNKNOWN
  return { id: leagueId(region, experience), region, regionName, experience, label: `${regionName} ${e.short}`, longLabel: `${regionName} · ${e.long}` }
}

export function parseLeagueId(id: string): KingLeague {
  const i = id.lastIndexOf(':')
  const exp = id.slice(i + 1) as DrivingExperience
  return leagueOf(id.slice(0, i), EXPERIENCE_LABEL[exp] ? exp : 'UNKNOWN')
}

// ───────── 닉네임 "동네 형용사 동물" ─────────

export const KING_DONG: Record<string, readonly string[]> = {
  pangyo: ['판교', '백현', '삼평', '운중'],
  bundang: ['정자', '수내', '서현', '야탑', '이매', '미금'],
  seoul: ['성수', '망원', '서촌', '잠실', '연남', '반포'],
  gyeonggi: ['광교', '동탄', '일산', '평촌', '죽전', '위례'],
  incheon: ['송도', '청라', '부평', '검단', '영종', '구월'],
}
/** 동네 단어가 없는 지역 */
export const KING_DONG_FALLBACK = ['이웃'] as const

/** 운전자를 평가하는 말·빠르기를 부추기는 말은 넣지 않는다 */
export const KING_ADJECTIVES = [
  '조용한', '단단한', '느린', '맑은', '둥근', '차분한', '느긋한', '다정한', '상냥한', '씩씩한',
  '포근한', '반듯한', '꼼꼼한', '든든한', '산뜻한', '신중한', '부드러운', '따뜻한', '성실한', '침착한',
  '밝은', '너그러운', '용감한', '슬기로운', '얌전한', '수줍은', '우아한', '유쾌한', '의젓한', '환한',
] as const

export const KING_ANIMALS = [
  '고래', '펭귄', '거북', '여우', '너구리', '두루미', '수달', '곰', '다람쥐', '토끼',
  '고양이', '강아지', '부엉이', '사슴', '판다', '코알라', '알파카', '오리', '참새', '고슴도치',
  '해달', '물개', '기린', '코끼리', '하마', '미어캣', '햄스터', '돌고래', '백조', '까치',
] as const

export const dongWords = (region: string): readonly string[] => KING_DONG[region] ?? KING_DONG_FALLBACK

/** 앞뒤 공백을 떼고 공백 여럿을 하나로 */
export const normalizeNickname = (s: string) => s.trim().replace(/\s+/g, ' ')
const NICKNAME_RE = /^[가-힣A-Za-z0-9]+(?: [가-힣A-Za-z0-9]+)*$/
export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 20

const ALL_DONG = new Set([...Object.values(KING_DONG).flat(), ...KING_DONG_FALLBACK])
const ADJ = new Set<string>(KING_ADJECTIVES)
const ANIMAL = new Set<string>(KING_ANIMALS)

/** 생성기 문법 ("백현 조용한 고래") 인지 */
export function isGeneratedNickname(s: string): boolean {
  const parts = normalizeNickname(s).split(' ')
  return parts.length === 3 && ALL_DONG.has(parts[0]) && ADJ.has(parts[1]) && ANIMAL.has(parts[2])
}

/** 생성기 문법이거나, 한글·영문·숫자·공백 2~20자 */
export function isValidNickname(s: string): boolean {
  const n = normalizeNickname(s)
  if (isGeneratedNickname(n)) return true
  return n.length >= NICKNAME_MIN && n.length <= NICKNAME_MAX && NICKNAME_RE.test(n)
}

/**
 * taken 에 없는 닉네임 하나. rand(n) = 0..n-1 정수.
 * 동네 4개 × 형용사 30 × 동물 30 = 3,600가지라 거의 늘 한 번에 끝나지만, 다 찼으면 끝에 숫자를 붙인다
 */
export function generateNickname(region: string, taken: ReadonlySet<string>, rand: (n: number) => number): string {
  const dong = dongWords(region)
  const pick = <T>(a: readonly T[]) => a[rand(a.length)]
  let base = ''
  for (let i = 0; i < 64; i++) {
    base = `${pick(dong)} ${pick(KING_ADJECTIVES)} ${pick(KING_ANIMALS)}`
    if (!taken.has(base)) return base
  }
  for (let k = 2; k < 1000; k++) if (!taken.has(`${base} ${k}`)) return `${base} ${k}`
  return `${base} ${rand(1_000_000)}`
}
