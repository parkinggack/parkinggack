/**
 * 주차왕 탭 (v1.2) — 시안 M-50 순위 · M-51 내 점수 자세히 · M-52 참여하기 · M-53 지난주 결과·공유.
 * 계약: packages/api-types (v1.2 절), docs/api.md "v1.2 — 주차왕". 화면 값·문구는 king.ts (순수 함수).
 *
 * - /king: 연결 전이면 "내 차와 연결하면…" 카드, 참여 전이면 M-52(아래 탭 없음), 참여했으면 M-50
 * - 새 주의 지난주 결과가 있고 아직 안 봤으면 M-50 을 연 뒤 M-53 이 아래에서 올라온다 (한 주에 한 번, pg:king:seen)
 * - M-50 오른쪽 위 리그 칩 → 시트(리그 설명 · 지난주 결과 볼게요)
 */
import { KING_BADGE_LABEL, type KingBadge, type KingBoardResponse, type KingMeResponse, type KingResultResponse } from '@api-types'
import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { api } from '../api'
import { errorText } from '../api/client'
import { COPY } from '../copy'
import { showToast, useAsync } from '../data'
import { shortLotName } from '../format'
import {
  boardItems,
  DEFAULT_REGION,
  KING_GRADE_LABEL,
  kingCardLabel,
  kingMovement,
  kingParkingSub,
  kingPoints,
  kingRank,
  kingSummary,
  leagueLongLabel,
  leagueShortLabel,
  resultDelta,
  resultSub,
  resultTitle,
  resultWeekLine,
  scoreParts,
  shouldShowResult,
} from '../king'
import { resultCardModel, resultPng, shareOrSave } from '../resultImage'
import { goBack, navigate } from '../router'
import { session } from '../session'
import { getItem, setItem } from '../storage'
import { useNow, useSession } from '../ui/hooks'
import {
  BottomCTA,
  Button,
  CheckIcon,
  ChevronDownIcon,
  ChevronIcon,
  CrownIcon,
  FlagIcon,
  Link,
  Logo,
  Sheet,
  ShareIcon,
  Status,
  TabBar,
  Title,
  TopBar,
  UpIcon,
} from '../ui/kit'

/** 지난주 결과를 본 주 (week.start) */
export const RESULT_SEEN_KEY = 'pg:king:seen'

// ───────────── 받아 둔 값 (탭을 오가도 빈 화면 없이) ─────────────

interface KingCache {
  token: string | null
  me?: KingMeResponse
  board?: KingBoardResponse
  result?: KingResultResponse | null
  nickname?: string
}
let cache: KingCache = { token: null }
function cached(): KingCache {
  const t = session.get().token
  if (cache.token !== t) cache = { token: t }
  return cache
}
const keepMe = (m: KingMeResponse) => (cached().me = m)
const keepBoard = (b: KingBoardResponse) => (cached().board = b)
const keepResult = (r: KingResultResponse | null) => (cached().result = r)

// ───────────── 그림 조각 ─────────────

const LINE = '#4a4944'

/** M-50 위 카드 오른쪽 그림 (시안 그대로: 칸 2개 + 작은 차) */
function BoardCardArt() {
  return (
    <svg aria-hidden="true" class="king-card-art" viewBox="0 0 350 180">
      <path d="M254 0 V92 M302 0 V92 M350 0 V92 M254 92 H350" stroke={LINE} stroke-width="2" stroke-linecap="round" />
      <g transform="translate(278 44)">
        <rect x="-14" y="-26" width="28" height="52" rx="8" fill="#f4f3ef" />
        <rect x="-10" y="-15" width="20" height="9" rx="3" fill="#1e1e1e" fill-opacity="0.85" />
        <rect x="-9" y="14" width="18" height="5" rx="2" fill="#1e1e1e" fill-opacity="0.6" />
      </g>
    </svg>
  )
}

/** M-53 결과 카드 아래 그림 (칸 + 차) */
function ResultArt() {
  return (
    <svg aria-hidden="true" class="result-art" width="310" height="110" viewBox="0 0 310 110">
      <g transform="translate(-20 8)">
        {[-6, 52, 110, 168, 226, 284, 342].map((x) => (
          <path key={x} d={`M${x} 0 V92`} stroke={LINE} stroke-width="2.5" stroke-linecap="round" />
        ))}
        <path d="M-6 92 H360" stroke={LINE} stroke-width="2.5" />
      </g>
      <g transform="translate(166 54)">
        <rect x="-16" y="-30" width="32" height="60" rx="9" fill="#f4f3ef" />
        <rect x="-11.5" y="-18" width="23" height="10" rx="3" fill="#1e1e1e" fill-opacity="0.85" />
        <rect x="-10" y="16" width="20" height="6" rx="2" fill="#1e1e1e" fill-opacity="0.6" />
      </g>
    </svg>
  )
}

function BadgeIcon({ b }: { b: KingBadge }) {
  if (b === 'PIONEER') return <FlagIcon size={18} width={2} />
  if (b === 'CLIMBER') return <UpIcon size={18} width={2} />
  if (b === 'CLEAN_WEEK') return <CheckIcon size={18} width={2} />
  return <CrownIcon size={18} width={2} />
}

// ───────────── /king ─────────────

export function KingScreen() {
  const s = useSession()
  if (!s.token) return <KingUnpaired />
  return <KingPaired key={`${s.token}:${s.demo ? 'demo' : 'srv'}`} />
}

function KingHead({ children }: { children?: ComponentChildren }) {
  return (
    <header class="king-head">
      <h1 class="tab-title">{COPY.kingTitle}</h1>
      {children}
    </header>
  )
}

/** 연결 전: 한 문장 + 연결 (홈의 연결 카드와 같은 모양) */
function KingUnpaired() {
  return (
    <main class="screen tabscreen king">
      <div class="tab-body">
        <KingHead />
        <Link to={{ name: 'connect' }} class="king-card king-card-msg">
          <BoardCardArt />
          <span class="king-card-msg-text">
            {COPY.kingUnpaired.split('\n').map((l, i) => (
              <>
                {i > 0 && <br />}
                {l}
              </>
            ))}
          </span>
          <span class="grow" />
          <span class="king-card-foot king-card-foot-strong">
            <span>{COPY.homeUnpairedAction}</span>
            <ChevronIcon color="#ffffff" size={20} width={2.4} />
          </span>
        </Link>
      </div>
      <TabBar active="king" />
    </main>
  )
}

function KingPaired() {
  const me = useAsync(() => api().kingMe().then(keepMe), [], cached().me)
  const [joinedNow, setJoinedNow] = useState(false)
  const m = me.data
  if (!m) {
    const unavailable = me.error?.code === 'not_found'
    return (
      <main class="screen tabscreen king">
        <div class="tab-body">
          <KingHead />
          {unavailable ? <p class="notice notice-big">{COPY.kingUnavailable}</p> : <Status loading={me.loading} error={me.error ? errorText(me.error) : null} onRetry={me.reload} />}
        </div>
        <TabBar active="king" />
      </main>
    )
  }
  if (!m.joined)
    return (
      <KingJoin
        me={m}
        onJoined={(next) => {
          keepMe(next)
          me.set(next)
          setJoinedNow(true)
          showToast(COPY.kingJoined)
        }}
      />
    )
  return <KingBoardView me={m} fresh={joinedNow} />
}

// ───────────── M-50 주차왕 ─────────────

function KingBoardView({ me, fresh }: { me: KingMeResponse; fresh: boolean }) {
  const board = useAsync(() => api().kingBoard().then(keepBoard), [], cached().board)
  const result = useAsync(() => api().kingResultLast().then(keepResult), [], cached().result ?? undefined)
  const [sheet, setSheet] = useState(false)

  // 새 주의 결과를 한 번 (M-53 이 아래에서 올라옴) — M-50 이 먼저 자리 잡은 뒤
  useEffect(() => {
    if (!shouldShowResult(result.data, getItem(RESULT_SEEN_KEY))) return
    const id = setTimeout(() => navigate({ name: 'king-result' }), 450)
    return () => clearTimeout(id)
  }, [result.data?.week.start])

  const items = useMemo(() => (board.data ? boardItems(board.data) : []), [board.data])
  const mv = kingMovement(me)
  const league = leagueShortLabel(me.league ?? board.data?.league)
  return (
    <main class="screen tabscreen king">
      <div class={fresh ? 'tab-body king-body enter-up' : 'tab-body king-body'}>
        <KingHead>
          <button type="button" class="league-chip" aria-haspopup="dialog" aria-expanded={sheet ? 'true' : 'false'} onClick={() => setSheet(true)}>
            {league}
            <ChevronDownIcon />
          </button>
        </KingHead>
        <Link to={{ name: 'king-me' }} class="king-card" label={kingCardLabel(me)}>
          <BoardCardArt />
          <span class="king-card-label">{COPY.kingThisWeek}</span>
          {me.rank != null ? (
            <span class="king-card-rank">{kingRank(me.rank)}</span>
          ) : (
            <span class="king-card-wait">
              {COPY.kingWaiting.split('\n').map((l, i) => (
                <>
                  {i > 0 && <br />}
                  {l}
                </>
              ))}
            </span>
          )}
          <span class="king-card-sub">{kingSummary(me)}</span>
          <span class="grow" />
          <span class="king-card-foot">
            <span class="king-card-move">
              {mv.up ? <UpIcon /> : null}
              {mv.text}
            </span>
            <ChevronIcon color="#ffffff" size={20} width={2.4} />
          </span>
        </Link>
        <div class="king-order">
          <span>{COPY.kingOrder}</span>
          <span>{COPY.kingResets}</span>
        </div>
        {items.length ? (
          <ol class="board" aria-label={`${league} ${COPY.kingOrder}`}>
            {items.map((it) =>
              it.kind === 'gap' ? (
                <li key={it.key} class="board-gap" aria-hidden="true">
                  ···
                </li>
              ) : (
                <li key={`${it.row.rank}:${it.row.nickname}`} class={it.row.isMe ? 'board-row board-me' : 'board-row'} aria-current={it.row.isMe ? 'true' : undefined}>
                  <span class="board-rank">{it.row.rank}</span>
                  <span class={it.row.rank <= 3 || it.row.isMe ? 'board-name board-strong' : 'board-name'}>{it.row.nickname}</span>
                  {it.row.isMe ? <span class="me-chip">{COPY.kingMe}</span> : null}
                  {it.row.rank === 1 ? <CrownIcon size={18} /> : null}
                  <span class="board-score">{kingPoints(it.row.score)}</span>
                </li>
              ),
            )}
          </ol>
        ) : (
          <Status loading={board.loading} error={board.error ? errorText(board.error) : null} onRetry={board.reload} />
        )}
        {board.data?.demo ? <p class="king-demo">{COPY.kingDemo}</p> : null}
      </div>
      <TabBar active="king" />
      <Sheet open={sheet} onClose={() => setSheet(false)} label={`${leagueLongLabel(me.league)} ${COPY.kingLeagueTitle}`}>
        <h2 class="sheet-title">
          {leagueLongLabel(me.league)} {COPY.kingLeagueTitle}
        </h2>
        <p class="sheet-text">{COPY.kingLeagueDesc}</p>
        <p class="sheet-note">{COPY.kingLeagueScore}</p>
        <div class="sheet-actions">
          {result.data ? (
            <Button
              onClick={() => {
                setSheet(false)
                navigate({ name: 'king-result' })
              }}
            >
              {COPY.kingSeeResult}
            </Button>
          ) : null}
          <Button variant="text" onClick={() => setSheet(false)}>
            {COPY.kingClose}
          </Button>
        </div>
      </Sheet>
    </main>
  )
}

// ───────────── M-52 주차왕 참여하기 ─────────────

function KingJoin({ me, onJoined }: { me: KingMeResponse; onJoined: (me: KingMeResponse) => void }) {
  const s = useSession()
  const region = me.league?.region ?? DEFAULT_REGION.id
  const leagueText = leagueLongLabel(me.league, { regionName: me.league?.regionName, experience: s.prefs.experience })
  const [nick, setNick] = useState(cached().nickname ?? '')
  const [busy, setBusy] = useState<'draw' | 'join' | null>(null)

  const draw = async () => {
    setBusy('draw')
    try {
      const n = await api().kingNickname(region)
      cached().nickname = n
      setNick(n)
    } catch (e) {
      showToast(errorText(e))
    } finally {
      setBusy(null)
    }
  }
  useEffect(() => {
    if (!nick) void draw()
  }, [])

  const join = async () => {
    if (!nick) return
    setBusy('join')
    try {
      const next = await api().kingJoin({ nickname: nick, region })
      cached().nickname = undefined
      onJoined(next)
    } catch (e) {
      showToast(errorText(e))
      setBusy(null)
    }
  }

  const rows: Array<[number, string, number, boolean]> = [
    [11, '판교 차분한 두루미', 84, false],
    [12, nick || ' ', 82, true],
    [13, '운중 다정한 곰', 81, false],
  ]
  return (
    <main class="screen flow king-join">
      <div class="flow-body">
        <Title text={COPY.kingJoinTitle} desc={COPY.kingJoinDesc} />
        <svg role="img" aria-label={COPY.kingPreviewLabel} class="illus king-preview" viewBox="0 0 350 220">
          <rect width="350" height="220" class="illus-bg" />
          <text x="24" y="34" class="svg-text" font-size="14" fill="#b5b3ad">
            {COPY.kingPreviewCaption}
          </text>
          {rows.map(([rank, name, score, me2], i) => (
            <g key={rank} transform={`translate(22 ${54 + i * 46})`}>
              <rect width="306" height="38" rx="10" fill={me2 ? '#f4f3ef' : 'none'} />
              <text x="14" y="25" class="svg-text" font-size="15" font-weight="700" fill={me2 ? '#1e1e1e' : '#f4f3ef'}>
                {rank}
              </text>
              <text x="44" y="25" class="svg-text" font-size="15" font-weight={me2 ? '700' : '500'} fill={me2 ? '#1e1e1e' : '#f4f3ef'}>
                {name}
              </text>
              <text x="292" y="25" text-anchor="end" class="svg-text" font-size="15" font-weight="700" fill={me2 ? '#1e1e1e' : '#f4f3ef'}>
                {kingPoints(score)}
              </text>
            </g>
          ))}
          <text x="24" y="206" class="svg-text" font-size="13" fill="#8a8780">
            {COPY.kingPreviewPrivacy}
          </text>
        </svg>
        <div class="nick">
          <span class="nick-label" id="king-nick-label">
            {COPY.kingNickname}
          </span>
          <span class="nick-field">
            <input type="text" readOnly value={nick} aria-labelledby="king-nick-label" aria-busy={busy === 'draw' ? 'true' : undefined} />
            <button type="button" class="nick-redraw" onClick={draw} disabled={busy !== null} aria-label={`${COPY.kingNickname} ${COPY.kingRedraw}`}>
              {COPY.kingRedraw}
            </button>
          </span>
        </div>
        <div class="king-league-row">
          <span class="king-league-key">{COPY.kingMyLeague}</span>
          <span class="king-league-val">{leagueText}</span>
        </div>
      </div>
      <BottomCTA>
        <Button onClick={join} busy={busy === 'join'} disabled={!nick || busy === 'draw'}>
          {COPY.kingJoinYes}
        </Button>
        <Button variant="text" onClick={() => goBack({ name: 'home' })}>
          {COPY.kingJoinLater}
        </Button>
      </BottomCTA>
    </main>
  )
}

// ───────────── M-51 내 점수 자세히 ─────────────

export function KingMeScreen() {
  const now = useNow(60_000)
  const me = useAsync(() => api().kingMe().then(keepMe), [], cached().me)
  const m = me.data
  if (m && !m.joined)
    return (
      <main class="screen detail">
        <div class="detail-body">
          <TopBar back={{ name: 'king' }} />
          <Title text={COPY.kingNotJoined} />
        </div>
        <BottomCTA>
          <Button onClick={() => navigate({ name: 'king' }, { replace: true })}>{COPY.kingGoJoin}</Button>
        </BottomCTA>
      </main>
    )
  const parts = m?.score ? scoreParts(m.score) : []
  return (
    <main class="screen detail king-me">
      <div class="detail-body">
        <TopBar back={{ name: 'king' }} />
        <h1 class="king-me-title">{m?.score ? `이번 주 ${kingPoints(m.score.total)}이에요` : COPY.kingScoreTitle}</h1>
        {parts.length ? (
          <section class="score-panel" aria-label="점수 나눠 보기">
            {parts.map((p) => (
              <div key={p.key} class="score-part">
                <span class="score-head">
                  <span class="score-label">{p.label}</span>
                  <span class="score-val">
                    {p.value} <span class="score-max">/ {p.max}</span>
                  </span>
                </span>
                <span class="score-track" aria-hidden="true">
                  <span class="score-fill" style={{ width: `${p.pct}%` }} />
                </span>
              </div>
            ))}
          </section>
        ) : null}
        {m?.nextHint ? (
          <p class="king-hint">
            <FlagIcon />
            {m.nextHint}
          </p>
        ) : null}
        {m ? <h2 class="king-places-title">{COPY.kingPlaces}</h2> : null}
        {m && m.parkings.length ? (
          <ol class="king-places">
            {m.parkings.map((row) => (
              <li key={row.parkingId} class={row.grade === 'EXCLUDED' ? 'place place-out' : 'place'}>
                <span class="place-text">
                  <span class="place-name">{shortLotName(row.lotName)}</span>
                  <span class="place-sub">{kingParkingSub(row, now)}</span>
                </span>
                <span class="place-grade">{KING_GRADE_LABEL[row.grade]}</span>
              </li>
            ))}
          </ol>
        ) : m ? (
          <p class="notice">{COPY.kingNoPlaces}</p>
        ) : null}
        <Status loading={me.loading && !m} error={me.error && !m ? errorText(me.error) : null} onRetry={me.reload} />
      </div>
      <BottomCTA>
        <Button onClick={() => goBack({ name: 'king' })}>{COPY.kingBackToBoard}</Button>
      </BottomCTA>
    </main>
  )
}

// ───────────── M-53 주간 결과 · 공유 ─────────────

export function KingResultScreen() {
  const res = useAsync(() => api().kingResultLast().then(keepResult), [], cached().result ?? undefined)
  const r = res.data
  const [png, setPng] = useState<Blob | null>(null)
  const [busy, setBusy] = useState(false)
  // 바닥글에 앱 주소 (로컬·IP 로 연 개발 중에는 빼고)
  const host = typeof location !== 'undefined' && !/^(localhost|[\d.]+|\[[\da-f:]+\])(:\d+)?$/i.test(location.host) ? location.host : ''
  const model = useMemo(() => (r ? resultCardModel(r, host) : null), [r?.week.start, r?.rank, host])

  // 봤다고 남김 (다음 주 결과가 나올 때까지 저절로 안 뜸)
  useEffect(() => {
    if (r) setItem(RESULT_SEEN_KEY, r.week.start)
  }, [r?.week.start])
  // 누른 순간에 바로 공유 시트를 열 수 있게 미리 그려 둠
  useEffect(() => {
    if (!model) return
    let alive = true
    resultPng(model).then(
      (b) => alive && setPng(b),
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [model])

  const close = () => goBack({ name: 'king' })
  const share = async () => {
    if (!model || !r) return
    setBusy(true)
    try {
      const blob = png ?? (await resultPng(model))
      if (!blob) {
        showToast(errorText(null))
        return
      }
      const how = await shareOrSave(blob, model.file, `${resultTitle(r).join(' ')} · ${resultSub(r)}`)
      if (how === 'saved') showToast(COPY.kingSaved)
    } finally {
      setBusy(false)
    }
  }

  if (!r) {
    return (
      <main class="screen screen-dark king-result">
        <div class="flow-body">
          {res.loading ? (
            <p class="status status-dark" role="status">
              {COPY.loading}
            </p>
          ) : (
            <Title text={res.error ? errorText(res.error) : COPY.kingNoResult} />
          )}
        </div>
        <div class="cta cta-ink">
          <Button variant="text" onClick={close}>
            {COPY.kingClose}
          </Button>
        </div>
      </main>
    )
  }
  const [t1, t2] = resultTitle(r)
  return (
    <main class="screen screen-dark king-result">
      <div class="flow-body result-body">
        <span class="result-week">{resultWeekLine(r)}</span>
        <h1 class="result-title">
          {t1}
          <br />
          {t2}
        </h1>
        <section class="result-card" aria-label={COPY.kingResultPreview}>
          <span class="result-brand">
            <Logo size={24} inverse />
            {COPY.kingTitle}
          </span>
          <span class="result-rank">{kingRank(r.rank)}</span>
          <span class="result-sub">{resultSub(r)}</span>
          {r.badges.length ? (
            <div class="badges">
              {r.badges
                .filter((b) => b in KING_BADGE_LABEL)
                .map((b) => (
                  <span key={b} class="badge">
                    <BadgeIcon b={b} />
                    {KING_BADGE_LABEL[b]}
                  </span>
                ))}
            </div>
          ) : null}
          <div class="result-art-wrap">
            <ResultArt />
          </div>
        </section>
        <p class="result-delta">{resultDelta(r)}</p>
      </div>
      <div class="cta cta-ink">
        <Button variant="white" onClick={share} busy={busy}>
          <ShareIcon />
          {COPY.kingShare}
        </Button>
        <Button variant="text" onClick={close}>
          {COPY.kingClose}
        </Button>
      </div>
    </main>
  )
}
