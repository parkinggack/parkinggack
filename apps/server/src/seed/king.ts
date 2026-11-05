/**
 * v1.2 주차왕 시연 참여자 (demo=1). 판교 × 운전 경력 5개 리그, 결정적 난수.
 *
 * 시연 참여자의 점수는 **매주 같다** (참여자 행에 점수 세 칸을 저장). 그래서 시드 뒤 며칠·몇 주가 지나도 "이번 주"는 늘
 * 시안 숫자(1등 96점 … 12등 82점)이고, 주가 끝나 순위를 고정할 때도 같은 숫자로 들어가서 차가 이번 주에 본 등수가
 * 다음 주 "지난주 결과"와 같다. 시각을 옮길(DEMO_ROLLING) 필요가 없다.
 *
 * 판교 초보(pangyo:UNDER_1Y) 148명 — 시안 C-13 · M-50 · M-52:
 *   1 백현 조용한 고래 96 · 2 삼평 단단한 펭귄 94 · 3 운중 느린 거북 93 · 4 판교 맑은 여우 91 · 5 백현 둥근 너구리 90
 *   6~10등 89 · 88 · 87 · 86 · 85 · 11 판교 차분한 두루미 84 · 12 판교 느긋한 수달 82 · 13 운중 다정한 곰 81 · 14~20등 80 … 75
 * 6~10등 점수(후진·핸들 칸)는 시연 차(POST /v1/admin/king/demo-car, 82점 12등)가 깔끔하게 한 번 더 대면(후진 0, 핸들 1~2) 10등이 되게 골랐다.
 */
import type { InStatement } from '@libsql/client'
import type { DrivingExperience, KingScore } from '@parkinggack/api-types'
import { generateNickname, leagueId } from '../king.js'
import { clamp } from '../scoring.js'
import { multiInsert, type Store } from '../store.js'
import { Rng, hashSeed } from './prng.js'

export const KING_DEMO_REGION = 'pangyo'
export const KING_DEMO_LEAGUE_SIZES: Readonly<Record<DrivingExperience, number>> = { UNDER_1Y: 148, Y1_3: 126, Y3_10: 203, OVER_10Y: 171, UNKNOWN: 64 }
/** 시연 차가 가져가는 닉네임 (시안의 "나") */
export const KING_DEMO_OTTER = '판교 느긋한 수달'
/** 시연 참여자 참여 시각 (순위가 같을 때 먼저 참여한 순) — 고정값이라 시드 시각과 상관없이 같다 */
export const KING_DEMO_JOINED_BASE = Date.UTC(2026, 0, 1)

/** [닉네임(null = 생성), 후진·핸들, 가 본 주차장, 지난달보다] — 판교 초보 1~20등 */
export const KING_DEMO_TOP_UNDER_1Y: ReadonlyArray<readonly [string | null, number, number, number]> = [
  ['백현 조용한 고래', 68, 15, 13], // 96
  ['삼평 단단한 펭귄', 66, 15, 13], // 94
  ['운중 느린 거북', 66, 13, 14], // 93
  ['판교 맑은 여우', 64, 15, 12], // 91
  ['백현 둥근 너구리', 63, 15, 12], // 90
  [null, 63, 13, 13], // 89
  [null, 64, 13, 11], // 88
  [null, 61, 15, 11], // 87
  [null, 62, 13, 11], // 86 — 시연 차가 깔끔하게 한 번 더(86점, 후진·핸들 61) 대도 이 사람 뒤 → 10등
  [null, 59, 13, 13], // 85 — 핸들 2번이면 85점(60) → 이 사람 앞 → 10등
  ['판교 차분한 두루미', 59, 13, 12], // 84
  [KING_DEMO_OTTER, 58, 13, 11], // 82
  ['운중 다정한 곰', 56, 15, 10], // 81
  [null, 57, 13, 10], // 80
  [null, 55, 13, 11], // 79
  [null, 54, 15, 10], // 79
  [null, 54, 13, 11], // 78 — 시연 차의 지난주(77점)는 이 바로 아래 17등
  [null, 53, 13, 10], // 76
  [null, 52, 15, 9], // 76
  [null, 52, 13, 10], // 75
]

export interface KingDemoParticipant {
  id: string
  nickname: string
  region: string
  experience: DrivingExperience
  leagueId: string
  joinedMs: number
  score: KingScore
}

const part = (maneuver: number, lotsVisited: number, improvement: number): KingScore => ({ total: maneuver + lotsVisited + improvement, maneuver, lotsVisited, improvement })

/** hi → lo 로 줄어드는 점수 count 개 (조금씩 흔들되 늘지 않게) */
function totals(rng: Rng, count: number, hi: number, lo: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 0 : i / (count - 1)
    out.push(Math.round(hi - (hi - lo) * Math.pow(x, 0.85) + rng.range(-1.4, 1.4)))
  }
  for (let i = 1; i < out.length; i++) out[i] = Math.min(out[i], out[i - 1])
  return out.map((t) => clamp(t, 8, hi))
}

/** 합이 total 이 되는 그럴듯한 세 칸 (점수가 높을수록 여러 곳을 가 봤다) */
function split(rng: Rng, total: number): KingScore {
  const lotChoices = total >= 85 ? [15, 13] : total >= 65 ? [13, 15, 10] : total >= 45 ? [10, 13, 6] : [6, 10]
  for (let attempt = 0; attempt < 20; attempt++) {
    const lots = lotChoices[rng.int(0, lotChoices.length - 1)]
    const improvement = clamp(Math.round((total / 100) * 15 + rng.range(-3, 3)), 0, 15)
    const maneuver = total - lots - improvement
    if (maneuver >= 0 && maneuver <= 70) return part(maneuver, lots, improvement)
  }
  const lots = 6
  const improvement = clamp(total - lots - 35, 0, 15)
  return part(clamp(total - lots - improvement, 0, 70), lots, improvement)
}

/** 판교 5개 리그 시연 참여자 (같은 지역 안에서 닉네임이 겹치지 않음) */
export function buildKingDemo(): KingDemoParticipant[] {
  const taken = new Set<string>(KING_DEMO_TOP_UNDER_1Y.map(([n]) => n).filter((n): n is string => !!n))
  const out: KingDemoParticipant[] = []
  let joinedIndex = 0
  for (const [experience, size] of Object.entries(KING_DEMO_LEAGUE_SIZES) as Array<[DrivingExperience, number]>) {
    const league = leagueId(KING_DEMO_REGION, experience)
    const rng = new Rng(hashSeed(`king:${league}`))
    const nick = () => {
      const n = generateNickname(KING_DEMO_REGION, taken, (k) => rng.int(0, k - 1))
      taken.add(n)
      return n
    }
    const fixed = experience === 'UNDER_1Y' ? KING_DEMO_TOP_UNDER_1Y : []
    const rows: Array<{ nickname: string | null; score: KingScore }> = fixed.map(([n, m, l, i]) => ({ nickname: n, score: part(m, l, i) }))
    const hi = fixed.length ? rows[rows.length - 1].score.total - 1 : rng.int(92, 97)
    const lo = rng.int(22, 30)
    const gen = totals(rng, size - rows.length, hi, lo)
      .map((t) => ({ nickname: null as string | null, score: split(rng, t) }))
      // 같은 점수면 후진·핸들 높은 순 = 순위 순서 (참여 시각을 이 순서로 매겨서 동점도 이 순서)
      .sort((a, b) => b.score.total - a.score.total || b.score.maneuver - a.score.maneuver)
    rows.push(...gen)
    rows.forEach((r, i) => {
      out.push({
        id: `demo:${league}:${String(i + 1).padStart(3, '0')}`,
        nickname: r.nickname ?? nick(),
        region: KING_DEMO_REGION,
        experience,
        leagueId: league,
        joinedMs: KING_DEMO_JOINED_BASE + joinedIndex++ * 60_000,
        score: r.score,
      })
    })
  }
  return out
}

const COLS = ['id', 'car_id', 'nickname', 'region', 'experience', 'league_id', 'joined_ms', 'left_ms', 'demo', 'demo_maneuver', 'demo_lots', 'demo_improvement'] as const

/**
 * 시연 참여자를 (다시) 넣는 문장. 끝난 주 순위(king_week_scores)는 시연 참여자가 섞여 있으니 같이 지운다 — 다음 요청 때 다시 계산된다
 * (실제 차의 지난 결과도 주차 기록에서 다시 계산되어 같은 값이 나온다)
 */
export function kingDemoStatements(): InStatement[] {
  return [
    'DELETE FROM king_participants WHERE demo = 1',
    'DELETE FROM king_week_scores',
    'DELETE FROM king_weeks',
    ...multiInsert(
      'king_participants',
      COLS,
      buildKingDemo().map((p) => [p.id, null, p.nickname, p.region, p.experience, p.leagueId, p.joinedMs, null, 1, p.score.maneuver, p.score.lotsVisited, p.score.improvement]),
    ),
  ]
}

/** 이미 시드된 DB(v1.2 전)에 주차왕 시연 참여자만 없으면 넣는다. 넣은 수 */
export async function ensureKingDemo(store: Store): Promise<number> {
  if (!(await store.getMeta('seeded_at'))) return 0
  if ((await store.count('SELECT COUNT(*) AS c FROM king_participants WHERE demo = 1')) > 0) return 0
  await store.db.batch(kingDemoStatements(), 'write')
  return store.count('SELECT COUNT(*) AS c FROM king_participants WHERE demo = 1')
}
