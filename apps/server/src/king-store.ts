/**
 * v1.2 주차왕 — 참여자 · 이번 주 순위(그때그때 계산) · 끝난 주 순위(고정) · 시연 차 도우미.
 * 계산 규칙은 king.ts, 화면·필드는 docs/api.md "v1.2 — 주차왕".
 *
 * - 참여는 차 단위 (폰 토큰은 연결된 차로). 차 한 대에 참여자 행 하나 (id = 차 기기 id), 그만두면 left_ms 만 채운다
 * - 이번 주 순위: 리그의 지금 참여자 — 시연 참여자는 저장된 고정 점수, 차는 이번 주 주차(+ 그 전 30일)로 계산
 * - 끝난 주: 주가 바뀐 뒤 처음 요청(또는 하루 정리) 때 지난주·지지난주가 없으면 계산해서 king_week_scores 에 고정.
 *   그 주 끝에 참여 중이던 사람만, 등수·인원·전 주 등수·개척자·깔끔한 한 주를 같이 저장 (배지는 읽을 때 저장값으로 만든다)
 * - 순위판에는 닉네임·점수·등수·나인지만. 다른 사람의 주차장·시각은 어떤 응답에도 없다
 */
import { randomInt } from 'node:crypto'
import type { InStatement, InValue } from '@libsql/client'
import type {
  DrivingExperience,
  KingBoardResponse,
  KingBoardRow,
  KingLeague,
  KingMeResponse,
  KingParkingRow,
  KingResultResponse,
  KingScore,
} from '@parkinggack/api-types'
import { ApiHttpError, badRequest, notFound } from './errors.js'
import {
  BOARD_TOP,
  KING_BASELINE_MS,
  KING_DEFAULT_REGION,
  KING_WEEK_MS,
  PIONEER_MAX_RECORDS,
  badgesFor,
  counts,
  generateNickname,
  gradeOf,
  isCleanWeek,
  isValidNickname,
  leagueId,
  leagueOf,
  nextHintFor,
  normalizeNickname,
  parseLeagueId,
  percentileOf,
  rankStandings,
  scoreWeek,
  weekRange,
  weekStartOf,
  type KingParkingIn,
  type Standing,
} from './king.js'
import type { MeStore } from './me-store.js'
import { DAY_MS, HOUR_MS, SAMPLE_WINDOW_DAYS } from './scoring.js'
import { KING_DEMO_OTTER } from './seed/king.js'
import { multiInsert, placeholders, type Store } from './store.js'

type Row = Record<string, InValue>
const num = (v: InValue) => Number(v ?? 0)
const iso = (ms: number) => new Date(ms).toISOString()

export interface Participant {
  id: string
  carId: string | null
  nickname: string
  region: string
  experience: DrivingExperience
  leagueId: string
  joinedMs: number
  leftMs: number | null
  demo: boolean
  /** 시연 참여자의 고정 점수 */
  demoScore: KingScore | null
}

function rowToParticipant(r: Row): Participant {
  const demo = num(r.demo) === 1
  const m = num(r.demo_maneuver)
  const l = num(r.demo_lots)
  const i = num(r.demo_improvement)
  return {
    id: String(r.id),
    carId: r.car_id == null ? null : String(r.car_id),
    nickname: String(r.nickname),
    region: String(r.region),
    experience: String(r.experience) as DrivingExperience,
    leagueId: String(r.league_id),
    joinedMs: num(r.joined_ms),
    leftMs: r.left_ms == null ? null : num(r.left_ms),
    demo,
    demoScore: demo ? { total: m + l + i, maneuver: m, lotsVisited: l, improvement: i } : null,
  }
}

/** 한 차의 한 주 주차 (요약 있는 것만) */
interface CarWeek {
  thisWeek: KingParkingIn[]
  baseline: KingParkingIn[]
}

type Ranked = Standing & { rank: number; carId: string | null }

interface LiveBoard {
  league: KingLeague
  weekStart: number
  ranked: Ranked[]
  /** 차 참여자의 주차 (점수 없는 차도) */
  cars: Map<string, CarWeek>
}

export type DemoCarScenario = 'board' | 'results'

const PARTICIPANT_COLS = ['id', 'car_id', 'nickname', 'region', 'experience', 'league_id', 'joined_ms', 'left_ms', 'demo', 'demo_maneuver', 'demo_lots', 'demo_improvement'] as const
const SCORE_COLS = [
  'league_id', 'week_ms', 'participant_id', 'car_id', 'nickname', 'demo', 'joined_ms', 'total', 'maneuver', 'lots_visited', 'improvement',
  'rank', 'league_total', 'prev_rank', 'pioneer', 'clean_week',
] as const

export class KingStore {
  constructor(
    private readonly s: Store,
    private readonly me: MeStore,
  ) {}

  private get now() {
    return this.s.now()
  }

  // ───────── 참여자 ─────────

  async participantOfCar(carId: string): Promise<Participant | null> {
    const r = await this.s.one('SELECT * FROM king_participants WHERE car_id = ?', [carId])
    return r ? rowToParticipant(r) : null
  }

  /** 지금 참여 중이면 */
  async activeParticipant(carId: string): Promise<Participant | null> {
    const p = await this.participantOfCar(carId)
    return p && p.leftMs == null ? p : null
  }

  /** 이 차가 가장 최근에 댄 (서버가 아는, 지역이 정해진) 주차장의 지역, 없으면 pangyo */
  async defaultRegion(carId: string): Promise<string> {
    const r = await this.s.one(
      `SELECT l.region FROM my_parkings p JOIN lots l ON l.id = p.lot_id
       WHERE p.car_id = ? AND l.region != 'other' ORDER BY p.parked_ms DESC, p.id DESC LIMIT 1`,
      [carId],
    )
    return r ? String(r.region) : KING_DEFAULT_REGION
  }

  /** 참여 전 화면(M-52 "내 리그")용: 참여하면 들어갈 리그 */
  async prospectiveLeague(carId: string): Promise<KingLeague> {
    return leagueOf(await this.defaultRegion(carId), (await this.me.settings(carId)).experience)
  }

  /** M-52 "다시 뽑기": 그 지역에서 지금 참여 중인 닉네임과 겹치지 않게 */
  async newNickname(region: string): Promise<string> {
    const rows = await this.s.all('SELECT nickname FROM king_participants WHERE region = ? AND left_ms IS NULL', [region])
    return generateNickname(region, new Set(rows.map((r) => String(r.nickname))), (n) => randomInt(n))
  }

  /**
   * 참여(또는 닉네임·리그 바꾸기). 경력은 차 설정, 지역은 보낸 값 → 최근 주차장 지역 → pangyo.
   * 같은 리그에서 다른 차가 쓰는 닉네임이면 409, 시연 참여자가 쓰는 닉네임이면 그 시연 참여자의 닉네임을 새로 뽑아 준다
   */
  async join(carId: string, req: { nickname: string; region?: string }): Promise<Participant> {
    const nickname = normalizeNickname(req.nickname)
    if (!isValidNickname(nickname)) throw badRequest('닉네임은 한글·영문·숫자·띄어쓰기 2~20자예요')
    const region = req.region ?? (await this.defaultRegion(carId))
    const experience = (await this.me.settings(carId)).experience
    const league = leagueId(region, experience)
    const clashes = (
      await this.s.all('SELECT * FROM king_participants WHERE league_id = ? AND nickname = ? AND left_ms IS NULL AND id != ?', [league, nickname, carId])
    ).map(rowToParticipant)
    if (clashes.some((p) => !p.demo)) throw new ApiHttpError(409, 'conflict', '같은 리그에서 이미 쓰는 닉네임이에요. 다시 뽑아 주세요')
    const stmts: InStatement[] = []
    for (const p of clashes) {
      stmts.push({ sql: 'UPDATE king_participants SET nickname = ? WHERE id = ?', args: [await this.newNickname(region), p.id] })
    }
    const cur = await this.participantOfCar(carId)
    const now = this.now
    // 참여 중에 닉네임·리그만 바꾸면 참여 시각(동점 순서)은 그대로, 그만뒀다 다시 오면 지금
    const joinedMs = cur && cur.leftMs == null ? cur.joinedMs : now
    stmts.push({
      sql: `INSERT INTO king_participants (id, car_id, nickname, region, experience, league_id, joined_ms, left_ms, demo)
            VALUES (:id, :id, :nickname, :region, :experience, :league, :joined, NULL, 0)
            ON CONFLICT(id) DO UPDATE SET nickname = :nickname, region = :region, experience = :experience, league_id = :league, joined_ms = :joined, left_ms = NULL`,
      args: { id: carId, nickname, region, experience, league, joined: joinedMs },
    })
    await this.s.db.batch(stmts, 'write')
    return (await this.participantOfCar(carId))!
  }

  /** 그만두기 — 순위판에서 빠짐 (주차 기록·지난 결과는 그대로) */
  async leave(carId: string): Promise<void> {
    await this.s.run('UPDATE king_participants SET left_ms = ? WHERE car_id = ? AND left_ms IS NULL', [this.now, carId])
  }

  // ───────── 주차 → 점수 ─────────

  /** 차들의 [from, to) 주차 (요약 있는 것만) */
  private async parkings(carIds: readonly string[], from: number, to: number): Promise<Map<string, KingParkingIn[]>> {
    const out = new Map<string, KingParkingIn[]>(carIds.map((id) => [id, []]))
    if (!carIds.length) return out
    const rows = await this.s.all(
      `SELECT car_id, id, lot_id, lot_name, parked_ms, summary FROM my_parkings
       WHERE car_id IN (${placeholders(carIds.length)}) AND parked_ms >= ? AND parked_ms < ? AND summary IS NOT NULL
       ORDER BY parked_ms DESC, id DESC`,
      [...carIds, from, to],
    )
    for (const r of rows) {
      const s = JSON.parse(String(r.summary)) as { reverseCount?: number; steeringTurns?: number; maxSpeedKmh?: number | null }
      out.get(String(r.car_id))!.push({
        id: String(r.id),
        lotId: r.lot_id == null ? null : String(r.lot_id),
        lotName: String(r.lot_name),
        parkedMs: num(r.parked_ms),
        reverseCount: Number(s.reverseCount ?? 0),
        steeringTurns: Number(s.steeringTurns ?? 0),
        maxSpeedKmh: s.maxSpeedKmh == null ? null : Number(s.maxSpeedKmh),
      })
    }
    return out
  }

  /** 참여자들의 weekStart 주 점수 (점수 없는 차는 빠짐) */
  private async scoreParticipants(participants: readonly Participant[], weekStart: number): Promise<{ ranked: Ranked[]; cars: Map<string, CarWeek> }> {
    const carIds = participants.filter((p) => !p.demo && p.carId).map((p) => p.carId!)
    const all = await this.parkings(carIds, weekStart - KING_BASELINE_MS, weekStart + KING_WEEK_MS)
    const cars = new Map<string, CarWeek>()
    for (const [carId, list] of all) {
      cars.set(carId, { thisWeek: list.filter((p) => p.parkedMs >= weekStart), baseline: list.filter((p) => p.parkedMs < weekStart) })
    }
    const standings: Array<Standing & { carId: string | null }> = []
    for (const p of participants) {
      const score = p.demo ? p.demoScore : p.carId ? scoreWeek(cars.get(p.carId)!.thisWeek, cars.get(p.carId)!.baseline) : null
      if (score) standings.push({ id: p.id, nickname: p.nickname, demo: p.demo, joinedMs: p.joinedMs, score, carId: p.carId })
    }
    return { ranked: rankStandings(standings), cars }
  }

  /** 리그의 이번 주 순위 (지금 참여 중인 사람) */
  private async live(league: KingLeague): Promise<LiveBoard> {
    const weekStart = weekStartOf(this.now)
    const participants = (await this.s.all('SELECT * FROM king_participants WHERE league_id = ? AND left_ms IS NULL', [league.id])).map(rowToParticipant)
    return { league, weekStart, ...(await this.scoreParticipants(participants, weekStart)) }
  }

  /** PUT /v1/me/parkings 전후 등수 (C-05). 참여 중이 아니면 null */
  async rankNow(carId: string): Promise<{ rank: number | null } | null> {
    const p = await this.activeParticipant(carId)
    if (!p) return null
    const board = await this.live(parseLeagueId(p.leagueId))
    return { rank: board.ranked.find((r) => r.id === p.id)?.rank ?? null }
  }

  // ───────── 응답 ─────────

  /** GET /v1/me/king */
  async meResponse(carId: string): Promise<KingMeResponse> {
    await this.ensureSnapshots()
    const p = await this.activeParticipant(carId)
    const league = p ? parseLeagueId(p.leagueId) : await this.prospectiveLeague(carId)
    const board = await this.live(league)
    const week = weekRange(board.weekStart)
    if (!p) {
      return { joined: false, nickname: null, league, week, rank: null, total: board.ranked.length, percentile: null, score: null, prevWeekRank: null, nextHint: null, parkings: [] }
    }
    const mine = board.ranked.find((r) => r.id === p.id) ?? null
    const others = board.ranked.filter((r) => r.id !== p.id)
    const car = board.cars.get(carId) ?? { thisWeek: [], baseline: [] }
    const prev = await this.s.one('SELECT rank FROM king_week_scores WHERE league_id = ? AND week_ms = ? AND participant_id = ?', [
      league.id,
      board.weekStart - KING_WEEK_MS,
      p.id,
    ])
    return {
      joined: true,
      nickname: p.nickname,
      league,
      week,
      rank: mine?.rank ?? null,
      total: board.ranked.length,
      percentile: mine ? percentileOf(mine.rank, board.ranked.length) : null,
      score: mine?.score ?? null,
      prevWeekRank: prev ? num(prev.rank) : null,
      nextHint: nextHintFor({ rank: mine?.rank ?? null, me: p, thisWeek: car.thisWeek, baseline: car.baseline, others, weekStart: board.weekStart }),
      parkings: car.thisWeek.map(
        (k): KingParkingRow => ({ parkingId: k.id, lotName: k.lotName, parkedAt: iso(k.parkedMs), reverseCount: k.reverseCount, ...gradeOf(k) }),
      ),
    }
  }

  /** GET /v1/me/king/board — 상위 5 + 내 앞·나·뒤. 참여 전이면 들어갈 리그 (M-52 미리 보기) */
  async boardResponse(carId: string): Promise<KingBoardResponse> {
    await this.ensureSnapshots()
    const p = await this.activeParticipant(carId)
    const board = await this.live(p ? parseLeagueId(p.leagueId) : await this.prospectiveLeague(carId))
    const row = (r: Ranked): KingBoardRow => ({ rank: r.rank, nickname: r.nickname, score: r.score.total, isMe: !!p && r.id === p.id })
    const myRank = p ? (board.ranked.find((r) => r.id === p.id)?.rank ?? null) : null
    return {
      league: board.league,
      week: weekRange(board.weekStart),
      total: board.ranked.length,
      top: board.ranked.slice(0, BOARD_TOP).map(row),
      around: myRank && myRank > BOARD_TOP ? board.ranked.filter((r) => r.rank > BOARD_TOP && Math.abs(r.rank - myRank) <= 1).map(row) : [],
      demo: board.ranked.some((r) => r.demo),
    }
  }

  /** GET /v1/me/king/results/last — 지난주에 점수가 없으면 404 */
  async lastResult(carId: string): Promise<KingResultResponse> {
    await this.ensureSnapshots()
    const week = weekStartOf(this.now) - KING_WEEK_MS
    const r = await this.s.one('SELECT * FROM king_week_scores WHERE car_id = ? AND week_ms = ? ORDER BY rank LIMIT 1', [carId, week])
    if (!r) throw notFound('지난주 주차왕 점수가 없어요')
    const rank = num(r.rank)
    const total = num(r.league_total)
    const percentile = percentileOf(rank, total)
    const rankDelta = r.prev_rank == null ? null : num(r.prev_rank) - rank
    return {
      week: weekRange(week),
      league: parseLeagueId(String(r.league_id)),
      rank,
      total,
      percentile,
      score: num(r.total),
      rankDelta,
      badges: badgesFor({ rank, percentile, rankDelta, pioneer: num(r.pioneer) === 1, cleanWeek: num(r.clean_week) === 1 }),
    }
  }

  // ───────── 끝난 주 고정 ─────────

  /** 지난주·지지난주 순위가 아직 없으면 계산해서 고정 (주가 바뀐 뒤 처음 요청 · 하루 정리). 새로 고정한 주 수 */
  async ensureSnapshots(): Promise<number> {
    const cur = weekStartOf(this.now)
    const want = [cur - 2 * KING_WEEK_MS, cur - KING_WEEK_MS]
    const have = new Set((await this.s.all(`SELECT week_ms FROM king_weeks WHERE week_ms IN (?, ?)`, want)).map((r) => num(r.week_ms)))
    let n = 0
    for (const w of want) {
      if (have.has(w)) continue
      await this.snapshotWeek(w)
      n++
    }
    return n
  }

  /**
   * weekStart 주를 계산해서 저장. 그 주가 끝날 때 참여 중이던 사람(시연 포함)만.
   * 같은 입력이면 같은 결과라 인스턴스 여럿이 동시에 해도 ON CONFLICT DO NOTHING 으로 한 벌만 남는다
   */
  async snapshotWeek(weekStart: number): Promise<number> {
    const end = weekStart + KING_WEEK_MS
    const participants = (
      await this.s.all('SELECT * FROM king_participants WHERE joined_ms < ? AND (left_ms IS NULL OR left_ms >= ?)', [end, end])
    ).map(rowToParticipant)
    const byLeague = new Map<string, Participant[]>()
    for (const p of participants) byLeague.set(p.leagueId, [...(byLeague.get(p.leagueId) ?? []), p])
    const prevRanks = await this.ranksOf(weekStart - KING_WEEK_MS)
    const rows: InValue[][] = []
    for (const [league, list] of byLeague) {
      const { ranked, cars } = await this.scoreParticipants(list, weekStart)
      const pioneerLots = await this.sparseLots(
        [...cars.values()].flatMap((c) => c.thisWeek.filter(counts).map((k) => k.lotId).filter((id): id is string => !!id)),
        end,
      )
      for (const r of ranked) {
        const week = r.carId ? cars.get(r.carId)!.thisWeek : []
        const pioneer = week.some((k) => counts(k) && k.lotId != null && pioneerLots.has(k.lotId))
        rows.push(this.scoreRow(league, weekStart, r, ranked.length, prevRanks.get(`${league}|${r.id}`) ?? null, pioneer, isCleanWeek(week)))
      }
    }
    await this.s.db.batch(
      [
        ...multiInsert('king_week_scores', SCORE_COLS, rows, 50, 'ON CONFLICT(league_id, week_ms, participant_id) DO NOTHING'),
        { sql: 'INSERT INTO king_weeks (week_ms, computed_ms) VALUES (?, ?) ON CONFLICT(week_ms) DO NOTHING', args: [weekStart, this.now] },
      ],
      'write',
    )
    return rows.length
  }

  private scoreRow(league: string, week: number, r: Ranked, total: number, prevRank: number | null, pioneer: boolean, cleanWeek: boolean): InValue[] {
    return [
      league, week, r.id, r.carId, r.nickname, r.demo ? 1 : 0, r.joinedMs, r.score.total, r.score.maneuver, r.score.lotsVisited, r.score.improvement,
      r.rank, total, prevRank, pioneer ? 1 : 0, cleanWeek ? 1 : 0,
    ]
  }

  /** "<리그>|<참여자>" → 그 주 등수 */
  private async ranksOf(week: number): Promise<Map<string, number>> {
    const rows = await this.s.all('SELECT league_id, participant_id, rank FROM king_week_scores WHERE week_ms = ?', [week])
    return new Map(rows.map((r) => [`${r.league_id}|${r.participant_id}`, num(r.rank)]))
  }

  /** 개척자 주차장: 그 주 끝 기준 최근 30일 익명 기록이 10건 안 되는 곳 (서버가 모르는 주차장도 0건) */
  private async sparseLots(lotIds: readonly string[], end: number): Promise<Set<string>> {
    const ids = [...new Set(lotIds)]
    if (!ids.length) return new Set()
    const rows = await this.s.all(
      `SELECT lot_id, COUNT(*) AS c FROM records WHERE lot_id IN (${placeholders(ids.length)}) AND received_ms >= ? AND received_ms < ? GROUP BY lot_id`,
      [...ids, end - SAMPLE_WINDOW_DAYS * DAY_MS, end],
    )
    const n = new Map(rows.map((r) => [String(r.lot_id), num(r.c)]))
    return new Set(ids.filter((id) => (n.get(id) ?? 0) < PIONEER_MAX_RECORDS))
  }

  /** 고정된 리그·주의 등수·인원·전 주 등수를 다시 매김 (시연 차 도우미가 행을 바꾼 뒤) */
  private async rerank(league: string, week: number): Promise<void> {
    const rows = await this.s.all('SELECT participant_id, joined_ms, total, maneuver FROM king_week_scores WHERE league_id = ? AND week_ms = ?', [league, week])
    const prev = await this.ranksOf(week - KING_WEEK_MS)
    const ranked = rankStandings(
      rows.map((r) => ({
        id: String(r.participant_id),
        nickname: '',
        demo: false,
        joinedMs: num(r.joined_ms),
        score: { total: num(r.total), maneuver: num(r.maneuver), lotsVisited: 0, improvement: 0 },
      })),
    )
    const stmts: InStatement[] = ranked.map((r) => ({
      sql: 'UPDATE king_week_scores SET rank = ?, league_total = ?, prev_rank = ? WHERE league_id = ? AND week_ms = ? AND participant_id = ?',
      args: [r.rank, ranked.length, prev.get(`${league}|${r.id}`) ?? null, league, week, r.id],
    }))
    for (let i = 0; i < stmts.length; i += 200) await this.s.db.batch(stmts.slice(i, i + 200), 'write')
  }

  // ───────── 시연 차 (POST /v1/admin/king/demo-car) ─────────

  /**
   * 촬영용: 이 차를 판교 초보의 "판교 느긋한 수달"로 만든다 — 이번 주 82점(58·13·11) 12등 / 148명, 다음 한 번 깔끔하면 10등.
   *  - 차 설정 경력을 UNDER_1Y 로, 시연 참여자 "판교 느긋한 수달"은 지운다(인원 148 그대로). 같은 닉네임을 쓰던 다른 차는 그만두기 처리
   *  - **이 차의 [이번 주 시작 − 30일, 다음 주 시작) 주차를 지우고** 시연 주차 9건(이번 주 4 · 그 전 30일 5)을 넣는다 — 시연 차에만 쓸 것
   *  - 지난 결과를 직접 정한다: board = 지난주 17등(77점) → "지난주 17등에서 올라왔어요"
   *                             results = 지난주 9등(86점, 상위 7%) · 지지난주 12등 → M-53 "지난주보다 3계단" · 상위 10% · 개척자 · 많이 올랐어요
   */
  async demoCar(carId: string, scenario: DemoCarScenario): Promise<{ replacedParkings: number }> {
    const now = this.now
    const W = weekStartOf(now)
    const league = leagueId('pangyo', 'UNDER_1Y')
    await this.me.patchSettings(carId, { experience: 'UNDER_1Y' })

    const demoOtter = (await this.s.all("SELECT id FROM king_participants WHERE league_id = ? AND nickname = ? AND demo = 1", [league, KING_DEMO_OTTER])).map((r) => String(r.id))
    const parkings = demoCarParkings(W, now)
    const del = await this.s.run('DELETE FROM my_parkings WHERE car_id = ? AND parked_ms >= ? AND parked_ms < ?', [carId, W - KING_BASELINE_MS, W + KING_WEEK_MS])
    await this.s.db.batch(
      [
        ...demoOtter.flatMap((id) => [
          { sql: 'DELETE FROM king_participants WHERE id = ?', args: [id] },
          { sql: 'DELETE FROM king_week_scores WHERE participant_id = ?', args: [id] },
        ]),
        { sql: "UPDATE king_participants SET left_ms = ? WHERE league_id = ? AND nickname = ? AND left_ms IS NULL AND demo = 0 AND car_id != ?", args: [now, league, KING_DEMO_OTTER, carId] },
        {
          sql: `INSERT INTO king_participants (${PARTICIPANT_COLS.join(', ')}) VALUES (:id, :id, :nickname, 'pangyo', 'UNDER_1Y', :league, :joined, NULL, 0, NULL, NULL, NULL)
                ON CONFLICT(id) DO UPDATE SET nickname = :nickname, region = 'pangyo', experience = 'UNDER_1Y', league_id = :league, joined_ms = :joined, left_ms = NULL`,
          // 지난주 중간에 참여한 것으로 (지난주 순위에는 들고 지지난주에는 없음)
          args: { id: carId, nickname: KING_DEMO_OTTER, league, joined: W - 6 * DAY_MS },
        },
        ...parkings.map((p) => ({
          sql: `INSERT INTO my_parkings (car_id, id, lot_id, lot_name, floor, zone, number, note, parked_ms, summary, hints, route, path, found_ms, created_ms, updated_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, '[]', NULL, '[]', ?, ?, ?)
                ON CONFLICT(car_id, id) DO UPDATE SET lot_id = excluded.lot_id, lot_name = excluded.lot_name, floor = excluded.floor, zone = excluded.zone,
                  number = excluded.number, parked_ms = excluded.parked_ms, summary = excluded.summary, found_ms = excluded.found_ms, updated_ms = excluded.updated_ms`,
          args: [
            carId, p.id, p.lotId, p.lotName, p.floor, p.zone, p.number, p.parkedMs,
            JSON.stringify({ reverseCount: p.reverseCount, steeringTurns: p.steeringTurns, durationSec: p.durationSec, rampTurns: p.rampTurns, shape: 'PERPENDICULAR', approximate: false, maxSpeedKmh: p.maxSpeedKmh }),
            // "지금 주차 중"(M-20)을 가로채지 않게 모두 찾은 것으로
            Math.min(now, p.parkedMs + 2 * HOUR_MS), now, now,
          ],
        })),
      ],
      'write',
    )

    await this.ensureSnapshots()
    const prevWeek = W - KING_WEEK_MS
    const twoAgo = W - 2 * KING_WEEK_MS
    const p = (await this.participantOfCar(carId))!
    const cars = await this.parkings([carId], twoAgo, W)
    const weekOf = (w: number) => (cars.get(carId) ?? []).filter((k) => k.parkedMs >= w && k.parkedMs < w + KING_WEEK_MS)
    const flags = async (w: number) => {
      const list = weekOf(w)
      const sparse = await this.sparseLots(list.filter(counts).map((k) => k.lotId).filter((id): id is string => !!id), w + KING_WEEK_MS)
      return { pioneer: list.some((k) => counts(k) && k.lotId != null && sparse.has(k.lotId)), cleanWeek: isCleanWeek(list) }
    }
    const setRow = async (w: number, score: KingScore | null) => {
      await this.s.run('DELETE FROM king_week_scores WHERE week_ms = ? AND participant_id = ?', [w, p.id])
      if (score) {
        const f = await flags(w)
        const r: Ranked = { id: p.id, nickname: p.nickname, demo: false, joinedMs: p.joinedMs, score, rank: 0, carId }
        await this.s.db.batch(multiInsert('king_week_scores', SCORE_COLS, [this.scoreRow(league, w, r, 0, null, f.pioneer, f.cleanWeek)]), 'write')
      }
      await this.rerank(league, w)
    }
    const s = (maneuver: number, lotsVisited: number, improvement: number): KingScore => ({ total: maneuver + lotsVisited + improvement, maneuver, lotsVisited, improvement })
    if (scenario === 'results') {
      await setRow(twoAgo, s(58, 13, 11)) // 82점 → 12등
      await setRow(prevWeek, s(63, 13, 10)) // 86점 → 9등 (같은 86점 시연 참여자보다 후진·핸들이 높음)
    } else {
      await setRow(twoAgo, null)
      await setRow(prevWeek, s(52, 13, 12)) // 77점 → 17등
    }
    return { replacedParkings: del }
  }
}

interface DemoParking extends KingParkingIn {
  floor: string
  zone: string
  number: string
  durationSec: number
  rampTurns: number
}

/**
 * 시연 차의 주차 9건. 이번 주 4건(M-51): 아브뉴프랑 후진 0·깔끔 · H스퀘어 후진 2·보통 · 백현마을 5단지 시속 14km·빠짐 · 현대백화점 후진 1·깔끔
 *   → 후진·핸들 70 × (0.96 + 0.68 + 0.84) / 3 = 57.9 → 58, 주차장 3곳 13, 지난달 평균 후진 3.6 → 이번 주 1.0 : 15 × 2.6/3.6 = 10.8 → 11 → 82점.
 * 시각은 목요일 밤 이후면 시안처럼 월·화·수·오늘, 그 전이면 이번 주 시작부터 지금까지 고르게.
 * 그 전 30일 5건(평균 후진 3.6) 중 지난주 것은 판교 테크원(기록 3건 → 개척자)
 */
export function demoCarParkings(weekStart: number, now: number): DemoParking[] {
  const H = HOUR_MS
  const M = 60_000
  const designDays = now - 40 * M > weekStart + 2 * DAY_MS + 20 * H
  const thisWeek: Array<Omit<DemoParking, 'parkedMs'>> = [
    { id: 'king-demo-1', lotId: 'avenue-france-pangyo', lotName: '아브뉴프랑 판교 주차장', floor: 'B2', zone: 'D', number: '07', reverseCount: 0, steeringTurns: 2, maxSpeedKmh: 8, durationSec: 48, rampTurns: 0.2 },
    { id: 'king-demo-2', lotId: 'h-square', lotName: 'H스퀘어 지하주차장', floor: 'B3', zone: 'B', number: '11', reverseCount: 2, steeringTurns: 1, maxSpeedKmh: 9, durationSec: 96, rampTurns: 2 },
    { id: 'king-demo-3', lotId: 'baekhyun-5', lotName: '백현마을 5단지 지하주차장', floor: 'B1', zone: 'A', number: '03', reverseCount: 1, steeringTurns: 1, maxSpeedKmh: 14, durationSec: 40, rampTurns: 0 },
    { id: 'king-demo-4', lotId: 'hyundai-pangyo', lotName: '현대백화점 판교점 지하주차장', floor: 'B4', zone: 'C', number: '12', reverseCount: 1, steeringTurns: 1, maxSpeedKmh: 7, durationSec: 118, rampTurns: 2.5 },
  ]
  const designAt = [weekStart + 10 * H + 20 * M, weekStart + DAY_MS + 15 * H + 40 * M, weekStart + 2 * DAY_MS + 19 * H + 10 * M, now - 40 * M]
  const spreadAt = (i: number) => weekStart + Math.floor(((now - weekStart) * (i + 1)) / (thisWeek.length + 1))
  const before: Array<Omit<DemoParking, 'parkedMs'> & { daysBefore: number }> = [
    { id: 'king-demo-5', daysBefore: 3, lotId: 'pangyo-new', lotName: '판교 테크원 주차장', floor: 'B2', zone: 'A', number: '05', reverseCount: 4, steeringTurns: 3, maxSpeedKmh: 7, durationSec: 150, rampTurns: 1 },
    { id: 'king-demo-6', daysBefore: 8, lotId: 'hyundai-pangyo', lotName: '현대백화점 판교점 지하주차장', floor: 'B5', zone: 'E', number: '02', reverseCount: 3, steeringTurns: 4, maxSpeedKmh: 8, durationSec: 160, rampTurns: 3 },
    { id: 'king-demo-7', daysBefore: 13, lotId: 'u-space-pangyo', lotName: '유스페이스 지하주차장', floor: 'B3', zone: 'C', number: '09', reverseCount: 4, steeringTurns: 5, maxSpeedKmh: 9, durationSec: 170, rampTurns: 1.5 },
    { id: 'king-demo-8', daysBefore: 19, lotId: 'botdeul-mall', lotName: '봇들마을 상가 주차장', floor: '1F', zone: 'B', number: '04', reverseCount: 4, steeringTurns: 3, maxSpeedKmh: 6, durationSec: 120, rampTurns: 0 },
    { id: 'king-demo-9', daysBefore: 26, lotId: 'alphadom-tower', lotName: '알파돔타워 지하주차장', floor: 'B2', zone: 'F', number: '08', reverseCount: 3, steeringTurns: 4, maxSpeedKmh: 8, durationSec: 110, rampTurns: 0.3 },
  ]
  return [
    ...thisWeek.map((p, i) => ({ ...p, parkedMs: designDays ? designAt[i] : spreadAt(i) })),
    ...before.map(({ daysBefore, ...p }) => ({ ...p, parkedMs: weekStart - daysBefore * DAY_MS + 14 * H + 30 * M })),
  ]
}
