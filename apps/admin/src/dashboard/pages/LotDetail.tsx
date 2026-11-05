/**
 * D-11 주차장 상세 · 어떻게 대고 있나 — 시안 docs/design/D-11.dc.html (1440×1840).
 * 층을 고르면 그 층 평면 위에 동선 · 후진 구간 · 후진이 몰리는 곳(각각 켜고 끔), 옆에 그 자리 목록(누르면 평면에 크게 + 바꿔 볼 만한 것),
 * 아래에 주차 방향 · 한 번에 들어간 비율 · 들어와서 대기까지 · 차 크기별 평균 후진, 요일 × 시간, 바꾸고 나서 좋아졌나요.
 *
 * API: GET /v1/insights/lots/:id?floor=&maxPaths=2000 (점수 · 기록 수 · 층 · 층별 평균 후진 · 도면 · 후진 잦은 곳 · 그 층 동선 전부 · 히트맵)
 *      GET /v1/insights/overview (지역 이름 · 9곳 중 순위)
 * API 에 없는 값(층 난이도 · 한 번에 들어간 비율 · 주차 방향 · 걸린 시간 분포 · 차 크기별 · 개선 전후)은 v2demo 가
 * API 값(층별 평균 후진 · 평균 시간 · 평균 후진)에서 결정적으로 만든다.
 */
import type { InsightsLotResponse, InsightsOverviewResponse, WeekdayHourHeat } from '@api-types'
import { useEffect, useMemo, useState } from 'react'
import { config } from '../../config'
import { difficultyLabel, difficultyLevel, formatDurationKo, formatNumber } from '../../format'
import { href, navigate } from '../../router'
import { DLoading, LevelBars } from '../components'
import { useInsight, useInsightsContext } from '../context'
import { DashError } from '../DashError'
import { FloorPlan } from '../FloorPlan'
import { floorRangeText, formatTimes, formatToday, periodLabel, reverseLevel } from '../format'
import {
  classReverse, DURATION_BINS, durationHistogram, floorScore, improvementFor, oneShotPct, parkDirection, REGION_ONE_SHOT_PCT,
  SPOT_IDEAS, spotKind, type Improvement,
} from '../v2demo'

const MAX_PATHS = 2000

export function LotDetail({ id, floor }: { id: string | null; floor: string | null }) {
  return id ? <LotDetailFor id={id} floor={floor} /> : <DefaultLot />
}

/** #/lots 만 왔으면 가장 어려운 곳으로 */
function DefaultLot() {
  const ov = useInsight('overview', (c, days) => c.overview({ days }))
  const first = ov.data?.lots[0]?.id
  useEffect(() => {
    if (first) navigate(href(`/lots/${encodeURIComponent(first)}`), { replace: true })
  }, [first])
  if (ov.error && !ov.data) return <DashError message={ov.error} code={ov.errorCode} onRetry={ov.reload} />
  return <DLoading />
}

/** 층 난이도가 가장 높은 층 (같으면 위층) */
export function hardestFloor(data: Pick<InsightsLotResponse, 'lot' | 'floorAvgReverse'>): string | null {
  const avg = new Map(data.floorAvgReverse.map((f) => [f.floor, f.avgReverse]))
  let best: string | null = null
  for (const f of data.lot.floors) {
    if (best == null || (avg.get(f) ?? -1) > (avg.get(best) ?? -1)) best = f
  }
  return best
}

function LotDetailFor({ id, floor }: { id: string; floor: string | null }) {
  const { setLastLotId } = useInsightsContext()
  // 첫 응답: 층을 정하지 않고 (서버가 기록이 가장 많은 층의 동선을 준다) — 도면 · 층별 값은 전 층
  const base = useInsight(`lot:${id}:auto`, (c, days) => c.lot(id, { days, maxPaths: MAX_PATHS }))
  const ov = useInsight('overview', (c, days) => c.overview({ days }))
  const data = base.data
  const hardest = data ? hardestFloor(data) : null
  const current = data ? (floor && data.lot.floors.includes(floor) ? floor : hardest) : null
  const inBase = !!(data && current && data.overlays.some((o) => o.floor === current))
  const own = useInsight(inBase || !current ? `lot:${id}:auto` : `lot:${id}:${current}`, (c, days) =>
    inBase || !current ? c.lot(id, { days, maxPaths: MAX_PATHS }) : c.lot(id, { days, floor: current, maxPaths: MAX_PATHS }),
  )
  useEffect(() => setLastLotId(id), [id, setLastLotId])
  useEffect(() => {
    if (data) document.title = `${data.lot.shortName} · 주차각 데이터`
  }, [data])
  if (base.error && !data) {
    return <DashError message={base.error} code={base.errorCode} onRetry={base.reload} notFound={base.errorCode === 'not_found'} />
  }
  if (!data || !current) return <DLoading />
  const paths = (inBase ? data : own.data)?.overlays.find((o) => o.floor === current)?.paths ?? (own.error ? [] : null)
  return <LotDetailView data={data} current={current} hardest={hardest} paths={paths} overview={ov.data} />
}

function printReport(title: string) {
  const prev = document.title
  document.title = title
  const restore = () => {
    document.title = prev
    window.removeEventListener('afterprint', restore)
  }
  window.addEventListener('afterprint', restore)
  window.print()
}

const DownloadIcon = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
)

/** "판교 9곳 중 가장 어려움" */
function rankText(o: InsightsOverviewResponse | null, lotId: string): string | null {
  if (!o) return null
  const scored = o.lots.filter((l) => l.difficulty != null).sort((a, b) => (b.difficulty as number) - (a.difficulty as number))
  const i = scored.findIndex((l) => l.id === lotId)
  if (i < 0) return null
  const region = o.region.name.replace(/\s*일대$/, '')
  const n = scored.length
  const what = i === 0 ? '가장 어려움' : i === n - 1 ? '가장 쉬움' : `${i + 1}번째로 어려움`
  return `${region} ${n}곳 중 ${what}`
}

type Layers = { trails: boolean; rev: boolean; spots: boolean }
const LAYERS: { key: keyof Layers; label: string }[] = [
  { key: 'trails', label: '동선' },
  { key: 'rev', label: '후진 구간' },
  { key: 'spots', label: '몰리는 곳' },
]

export function LotDetailView({ data, current, hardest, paths, overview }: {
  data: InsightsLotResponse
  current: string
  hardest: string | null
  paths: InsightsLotResponse['overlays'][number]['paths'] | null
  overview: InsightsOverviewResponse | null
}) {
  const { days, mock } = useInsightsContext()
  const demo = config.demoBadge || mock
  const lot = data.lot
  const [layers, setLayers] = useState<Layers>({ trails: true, rev: true, spots: true })
  const [picked, setPicked] = useState<{ floor: string; rank: number } | null>(null)
  const floorAvg = useMemo(() => new Map(data.floorAvgReverse.map((f) => [f.floor, f.avgReverse])), [data])
  const scoreOf = (f: string) => (lot.difficulty == null ? null : floorScore(lot.difficulty, lot.avgReverse, floorAvg.get(f) ?? lot.avgReverse))
  const rev = floorAvg.get(current) ?? lot.avgReverse
  const fScore = scoreOf(current)
  const oneShot = oneShotPct(rev)
  const dir = parkDirection(rev)
  const spots = data.hotspots.filter((h) => h.floor === current).sort((a, b) => a.rank - b.rank)
  const selected = picked?.floor === current ? picked.rank : spots[0]?.rank ?? null
  const layout = data.layout.find((l) => l.floor === current) ?? data.layout[0]
  const rank = rankText(overview, lot.id)
  const meta = [periodLabel(days), `${formatNumber(lot.records)}대`, floorRangeText(lot.floors), rank].filter(Boolean).join(' · ')
  const count = paths?.length ?? null

  const pickFloor = (f: string) => {
    setPicked(null)
    navigate(href(`/lots/${encodeURIComponent(lot.id)}`, { floor: f === hardest ? undefined : f }), { replace: true })
  }

  return (
    <div className="v2-page v2-page--lot">
      <div className="d-print-only v2-report-head">
        <span className="v2-report-head__brand">주차각 데이터 · 주차장 리포트</span>
        <span>{formatToday()} 만듦 · {periodLabel(days)}{demo ? ' · 시연용 예시 데이터' : ''}</span>
      </div>

      <nav aria-label="위치" className="v2-crumbs d-no-print">
        <a href={href('/')}>난이도 한눈에</a>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{lot.shortName}</span>
      </nav>

      <div className="v2-pagehead">
        <div className="v2-pagehead__text v2-pagehead__text--lot">
          <h1 className="v2-h1 v2-h1--lot">{lot.name}</h1>
          <div className="v2-lotscore">
            <LevelBars level={lot.difficulty == null ? 0 : difficultyLevel(lot.difficulty)} size="head" />
            <span className="v2-lotscore__value"><span className="visually-hidden">난이도 </span>{lot.difficulty == null ? '–' : lot.difficulty.toFixed(1)}</span>
            <span className="v2-lotscore__label">{difficultyLabel(lot.difficulty)}</span>
            <span className="v2-lotscore__sep" aria-hidden="true" />
            <span className="v2-lotscore__meta">{meta}</span>
          </div>
        </div>
        <div className="v2-pagehead__actions d-no-print">
          <button type="button" className="v2-btn v2-btn--ghost" onClick={() => printReport(`주차각 리포트 - ${lot.shortName} - ${formatToday()}`)}>리포트 PDF</button>
          <a className="v2-btn v2-btn--dark" href={href('/export', { lot: lot.id })}><DownloadIcon />이 주차장 데이터 내보내기</a>
        </div>
      </div>

      <div className="v2-floorpick d-no-print">
        <span className="v2-floorpick__label">층</span>
        <div role="group" aria-label="층 고르기" className="v2-floorpick__list">
          {lot.floors.map((f) => {
            const s = scoreOf(f)
            return (
              <button key={f} type="button" className="v2-floorbtn" aria-pressed={f === current} onClick={() => pickFloor(f)}>
                <span className="v2-floorbtn__id">{f}</span>
                <span className="v2-floorbtn__score">난이도 {s == null ? '–' : s.toFixed(1)}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="v2-lot-top">
        <section className="v2-darkbox v2-plancard" aria-labelledby="v2-plan-title">
          <div className="v2-plancard__head">
            <div className="v2-plancard__titles">
              <h2 id="v2-plan-title" className="v2-h2 v2-h2--plan">
                {current} 평면 위에 {count == null ? '…' : formatNumber(count)}대의 동선을 겹쳤어요
              </h2>
              <p className="v2-plancard__sub">
                난이도 {fScore == null ? '–' : fScore.toFixed(1)} · 평균 후진 {formatTimes(rev)} · 한 번에 들어간 비율 {oneShot}%
              </p>
            </div>
            <div role="group" aria-label="평면에 보일 것" className="v2-layers d-no-print">
              {LAYERS.map((y) => (
                <button key={y.key} type="button" className="v2-layer" aria-pressed={layers[y.key]} onClick={() => setLayers((s) => ({ ...s, [y.key]: !s[y.key] }))}>
                  {y.label}
                </button>
              ))}
            </div>
          </div>
          {layout ? (
            <FloorPlan
              layout={layout}
              rampKind={lot.rampKind}
              paths={paths}
              hotspots={spots}
              selected={selected}
              onSelect={(r) => setPicked({ floor: current, rank: r })}
              show={layers}
              ariaLabel={`${lot.shortName} ${current} 평면에 ${count == null ? '' : `${formatNumber(count)}대의 `}동선을 겹친 그림. 후진이 몰리는 곳 ${spots.length}곳`}
            />
          ) : (
            <p className="v2-plancard__empty">이 주차장은 아직 도면에 맞춘 동선이 없어요</p>
          )}
          <div className="v2-planlegend">
            <span><svg aria-hidden="true" width="28" height="8" viewBox="0 0 28 8"><path d="M2 4H26" stroke="#f4f3ef" strokeWidth="2.5" strokeLinecap="round" /></svg>앞으로</span>
            <span><svg aria-hidden="true" width="28" height="8" viewBox="0 0 28 8"><path d="M2 4H26" stroke="#f4f3ef" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" /></svg>후진</span>
            <span><span aria-hidden="true" className="v2-planlegend__ring" />후진이 몰리는 곳</span>
            <span><span aria-hidden="true" className="v2-planlegend__pillar" />기둥</span>
            <span>평면은 운영사 도면 대신 동선으로 다시 그린 그림이에요</span>
          </div>
        </section>

        <section className="v2-box v2-spots" aria-labelledby="v2-spots-title">
          <div className="v2-box__titles">
            <h2 id="v2-spots-title" className="v2-h3">{current}에서 후진이 잦은 곳</h2>
            <p className="v2-box__sub">누르면 평면에 크게 표시돼요</p>
          </div>
          {spots.length === 0 ? (
            <p className="v2-spots__empty">이 층은 후진이 몰리는 곳이 따로 없어요</p>
          ) : (
            <ol className="v2-spots__list">
              {spots.map((h) => {
                const on = h.rank === selected
                const kind = spotKind(h.title)
                const imp = improvementFor(lot.id)
                const idea = imp && imp.floor === current && imp.rank === h.rank
                  ? `${imp.dateText} ${imp.changeSentence} 후진이 줄고 있어요. 바닥 유도선을 더하면 좋은 후보예요.`
                  : SPOT_IDEAS[kind]
                return (
                  <li key={h.rank}>
                    <button type="button" className="v2-spot" aria-pressed={on} onClick={() => setPicked({ floor: current, rank: h.rank })}>
                      <span className="v2-spot__no" aria-hidden="true">{h.rank}</span>
                      <span className="v2-spot__body">
                        <span className="v2-spot__title">{h.title}</span>
                        <span className="v2-spot__where">{current} · {h.detail}</span>
                        <span className="v2-spot__metric"><span className="v2-spot__value">{formatTimes(h.avgReverse)}</span><span className="v2-spot__what">이 자리에서 평균 후진</span></span>
                        {on && <span className="v2-spot__idea">{idea}</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>

      <div className="v2-quad">
        <section className="v2-box" aria-labelledby="v2-dir-title">
          <div className="v2-box__titles">
            <h2 id="v2-dir-title" className="v2-h4">어느 방향으로 대나요</h2>
            <p className="v2-box__sub">{current} · 다 대고 난 차의 방향</p>
          </div>
          <div className="v2-dirbar" aria-hidden="true">
            <span style={{ width: `${dir.rear}%` }} className="v2-dirbar__rear" />
            <span style={{ width: `${dir.front}%` }} className="v2-dirbar__front" />
            <span className="v2-dirbar__par" />
          </div>
          <ul className="v2-dirlist">
            <li>
              <svg aria-hidden="true" width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="8" fill="#1e1e1e" /><path d="M8 4V32M28 4V32" stroke="#8a8780" strokeWidth="2" /><rect x="11" y="7" width="14" height="22" rx="4" fill="#f4f3ef" /><rect x="13" y="21" width="10" height="4" rx="1" fill="#1e1e1e" /></svg>
              <span className="v2-dirlist__text"><span className="v2-dirlist__name">뒤로 넣기</span><span className="v2-dirlist__sub">앞이 통로 쪽</span></span>
              <span className="v2-dirlist__value">{dir.rear}%</span>
            </li>
            <li>
              <svg aria-hidden="true" width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="8" fill="#1e1e1e" /><path d="M8 4V32M28 4V32" stroke="#8a8780" strokeWidth="2" /><rect x="11" y="7" width="14" height="22" rx="4" fill="#f4f3ef" /><rect x="13" y="11" width="10" height="4" rx="1" fill="#1e1e1e" /></svg>
              <span className="v2-dirlist__text"><span className="v2-dirlist__name">앞으로 넣기</span><span className="v2-dirlist__sub">뒤가 통로 쪽</span></span>
              <span className="v2-dirlist__value">{dir.front}%</span>
            </li>
            <li>
              <svg aria-hidden="true" width="36" height="36" viewBox="0 0 36 36"><rect width="36" height="36" rx="8" fill="#1e1e1e" /><path d="M4 8H32M4 28H32" stroke="#8a8780" strokeWidth="2" /><rect x="7" y="11" width="22" height="14" rx="4" fill="#f4f3ef" /><rect x="21" y="13" width="4" height="10" rx="1" fill="#1e1e1e" /></svg>
              <span className="v2-dirlist__text"><span className="v2-dirlist__name">평행 주차</span><span className="v2-dirlist__sub">벽 쪽 긴 칸</span></span>
              <span className="v2-dirlist__value">{dir.parallel}%</span>
            </li>
          </ul>
        </section>

        <section className="v2-box" aria-labelledby="v2-oneshot-title">
          <div className="v2-box__titles">
            <h2 id="v2-oneshot-title" className="v2-h4">한 번에 들어간 비율</h2>
            <p className="v2-box__sub">{current} · 후진 1회 이하로 끝난 주차</p>
          </div>
          <div className="v2-oneshot">
            <div role="img" aria-label={`100대 중 ${oneShot}대`} className="v2-waffle">
              {Array.from({ length: 100 }, (_, i) => <span key={i} className={i < oneShot ? 'is-on' : undefined} />)}
            </div>
            <div className="v2-oneshot__text">
              <span className="v2-oneshot__value">{oneShot}%</span>
              <span className="v2-box__sub">{overview ? overview.region.name.replace(/\s*일대$/, '') : '판교'} {overview?.totals.lots ?? 9}곳 평균 {REGION_ONE_SHOT_PCT}%</span>
            </div>
          </div>
        </section>

        <DurationCard avgSec={lot.avgDurationSec} />

        <section className="v2-box" aria-labelledby="v2-class-title">
          <div className="v2-box__titles">
            <h2 id="v2-class-title" className="v2-h4">차 크기별 평균 후진</h2>
            <p className="v2-box__sub">주차장 전체 · 점수에는 차 크기 보정이 들어가요</p>
          </div>
          <ClassBars avgReverse={lot.avgReverse} />
        </section>
      </div>

      <div className="v2-duo">
        <section className="v2-box" aria-labelledby="v2-heat-title">
          <div className="v2-box__headrow">
            <div className="v2-box__titles">
              <h2 id="v2-heat-title" className="v2-h4">언제 어려운가요</h2>
              <p className="v2-box__sub">요일 × 시간 · 진할수록 어려움</p>
            </div>
            <HeatLegend />
          </div>
          <WeekHeat heat={data.heat} name={lot.shortName} />
        </section>
        <ImprovementCard imp={improvementFor(lot.id)} data={data} />
      </div>

      <p className="v2-footnote">동선은 차속·핸들 각도·기어로 계산해 다시 그린 그림이에요. 5대보다 적게 댄 칸과 시간대는 보여 주지 않아요.</p>
      <p className="d-print-only v2-report-foot">
        주차각 데이터 — 차에서 모인 익명 주차 기록을 주차장 단위로 묶은 값이에요. 개별 차량·운전자 기록은 없어요.
        {demo ? ' 수치는 시연용 예시이고 장소 이름만 실제예요.' : ''} {location.origin}{location.pathname}#/lots/{lot.id}
      </p>
    </div>
  )
}

function DurationCard({ avgSec }: { avgSec: number }) {
  const hist = durationHistogram(avgSec)
  const max = Math.max(...hist, 1)
  const top = hist.indexOf(Math.max(...hist))
  const b = DURATION_BINS[top]
  const topText = top === DURATION_BINS.length - 1 ? `${formatDurationKo(b.from)} 넘게 걸린 주차` : `${formatDurationKo(b.from)}에서 ${formatDurationKo(b.to)} 사이`
  return (
    <section className="v2-box" aria-labelledby="v2-dur-title">
      <div className="v2-box__titles">
        <h2 id="v2-dur-title" className="v2-h4">들어와서 대기까지</h2>
        <p className="v2-box__sub">주차장 전체 · 평균 {formatDurationKo(avgSec)}</p>
      </div>
      <div role="img" aria-label={`진입부터 주차까지 걸린 시간 분포. ${topText}가 가장 많음`} className="v2-hist">
        {hist.map((v, i) => (
          <div key={i} className="v2-hist__col"><span className={i === top ? 'is-top' : undefined} style={{ height: `${Math.round((v / max) * 100)}%` }} /></div>
        ))}
      </div>
      <div className="v2-hist__labels" aria-hidden="true">
        {DURATION_BINS.map((x) => <span key={x.label}>{x.label}</span>)}
      </div>
    </section>
  )
}

function ClassBars({ avgReverse }: { avgReverse: number }) {
  const rows = classReverse(avgReverse)
  const max = Math.max(4, Math.ceil(Math.max(...rows.map((r) => r.value))))
  return (
    <ul className="v2-classes">
      {rows.map((c) => (
        <li key={c.name}>
          <span className="v2-classes__name">{c.name}</span>
          <span className="v2-classes__track" aria-hidden="true"><span style={{ width: `${Math.round((c.value / max) * 100)}%` }} /></span>
          <span className="v2-classes__value">{formatTimes(c.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/** 시안 D-11 회색 5단 (옅음 → 진함). 칸 진하기 = 평균 후진 5단계 (2.2 · 2.8 · 3.4 · 4.0회, 모든 화면 같은 잣대) */
const HEAT_SHADES = ['#efede8', '#d6d3cb', '#a9a69e', '#6b6964', '#1e1e1e'] as const

function HeatLegend() {
  return (
    <div className="v2-heatlegend" aria-hidden="true">
      <span>쉬움</span>
      {HEAT_SHADES.map((s, i) => <span key={s} className={`v2-heatlegend__sw${i === 0 ? ' is-light' : ''}`} style={{ background: s }} />)}
      <span>어려움</span>
    </div>
  )
}

function WeekHeat({ heat, name }: { heat: WeekdayHourHeat; name: string }) {
  const labels = heat.hours.map((h) => h.replace(/시$/, ''))
  let best: { v: number; d: string; h: string } | null = null
  heat.values.forEach((row, r) => row.forEach((v, c) => {
    if (v != null && (!best || v > best.v)) best = { v, d: heat.weekdays[r], h: heat.hours[c] }
  }))
  const b = best as { v: number; d: string; h: string } | null
  const summary = b ? `가장 진한 칸은 ${b.d}요일 ${b.h}, 평균 후진 ${formatTimes(b.v)}` : '아직 기록이 없어요'
  const cols = { gridTemplateColumns: `28px repeat(${heat.hours.length}, minmax(0, 1fr))` }
  return (
    <>
      <div role="img" aria-label={`요일·시간대별 난이도. ${summary}`} className="v2-heat">
        <div className="v2-heat__row v2-heat__row--head" style={cols} aria-hidden="true">
          <span />
          {labels.map((h) => <span key={h}>{h}</span>)}
        </div>
        {heat.weekdays.map((d, r) => (
          <div key={d} className="v2-heat__row" style={cols} aria-hidden="true">
            <span className="v2-heat__day">{d}</span>
            {heat.hours.map((h, c) => {
              const v = heat.values[r]?.[c]
              const lv = v == null ? null : reverseLevel(v)
              return (
                <span
                  key={h}
                  className={`v2-heat__cell${v == null ? ' is-empty' : lv === 1 ? ' is-light' : ''}`}
                  style={lv == null ? undefined : { background: HEAT_SHADES[lv - 1] }}
                  title={`${d}요일 ${h} · ${v == null ? '5대 미만이라 빼 둔 칸' : `평균 후진 ${formatTimes(v)}`}`}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="visually-hidden">
      <table>
        <caption>{name} 요일 · 시간대별 평균 후진 (2시간 단위)</caption>
        <thead><tr><th scope="col">요일</th>{heat.hours.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {heat.weekdays.map((d, r) => (
            <tr key={d}><th scope="row">{d}</th>{heat.hours.map((h, c) => {
              const v = heat.values[r]?.[c]
              return <td key={h}>{v == null ? '기록 적음' : formatTimes(v)}</td>
            })}</tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  )
}

/** 시안 좌표 (560×230): 앞 6주 x 40~260, 뒤 6주 x 304~524, 눈금 4줄 y 70 · 110 · 150 · 190 */
export function improvementSeries(imp: Improvement, spotAvg: number | null) {
  const shift = spotAvg == null ? 0 : Math.round((spotAvg - imp.afterAvg) * 10) / 10
  const r1 = (v: number) => Math.round((v + shift) * 10) / 10
  const before = imp.before.map(r1)
  const after = imp.after.map(r1)
  const beforeAvg = r1(imp.beforeAvg)
  const afterAvg = r1(imp.afterAvg)
  const all = [...before, ...after, beforeAvg, afterAvg]
  const top = Math.ceil(Math.max(...all) * 2 - 1e-9) / 2
  const bottom = Math.floor(Math.min(...all) * 2 + 1e-9) / 2
  const step = Math.max(0.5, Math.ceil(((top - bottom) / 3) * 2 - 1e-9) / 2)
  const ticks = [0, 1, 2, 3].map((i) => Math.round((top - i * step) * 10) / 10)
  const y = (v: number) => 70 + ((top - v) / step) * 40
  return {
    before, after, beforeAvg, afterAvg, drop: Math.round((beforeAvg - afterAvg) * 10) / 10, ticks, y,
    bx: before.map((_, i) => 40 + i * 44),
    ax: after.map((_, i) => 304 + i * 44),
  }
}

function ImprovementCard({ imp, data }: { imp: Improvement | null; data: InsightsLotResponse }) {
  if (!imp) {
    return (
      <section className="v2-box" aria-labelledby="v2-imp-title">
        <div className="v2-box__titles">
          <h2 id="v2-imp-title" className="v2-h4">바꾸고 나서 좋아졌나요</h2>
          <p className="v2-box__sub">시설을 바꾼 날 앞뒤의 주별 평균 후진</p>
        </div>
        <p className="v2-imp__empty">이 주차장은 아직 시설을 바꾼 기록이 없어요. 바꾼 날이 생기면 그 전후 주별 평균 후진을 여기서 견줘 봐요.</p>
      </section>
    )
  }
  const spot = data.hotspots.find((h) => h.floor === imp.floor && h.rank === imp.rank) ?? null
  const s = improvementSeries(imp, spot?.avgReverse ?? null)
  const f1 = (v: number) => v.toFixed(1)
  return (
    <section className="v2-box v2-imp" aria-labelledby="v2-imp-title">
      <div className="v2-box__headrow">
        <div className="v2-box__titles">
          <h2 id="v2-imp-title" className="v2-h4">바꾸고 나서 좋아졌나요</h2>
          <p className="v2-box__sub">{imp.floor} {imp.spotLabel}({imp.rank}번 지점) · 주별 평균 후진</p>
        </div>
        <span className="v2-imp__badge">{f1(s.drop)}회 줄었어요</span>
      </div>
      <svg role="img" aria-label={`${imp.dateText} ${imp.change} 전 6주 평균 후진 ${f1(s.beforeAvg)}회, 설치 후 6주 평균 ${f1(s.afterAvg)}회`} viewBox="0 0 560 230" width="100%" className="v2-imp__svg">
        <g stroke="#e6e3dc" strokeWidth="1.5">
          {s.ticks.map((t, i) => <line key={t} x1="40" y1={70 + i * 40} x2="540" y2={70 + i * 40} stroke={i === 3 ? '#d6d3cb' : undefined} />)}
        </g>
        <g className="v2-imp__axis" textAnchor="end">
          {s.ticks.map((t, i) => <text key={t} x="32" y={74 + i * 40}>{f1(t)}</text>)}
        </g>
        <path d="M282 34V190" stroke="#8a8780" strokeWidth="1.5" strokeDasharray="4 5" />
        <text x="288" y="44" className="v2-imp__event">{imp.dateShort} {imp.change}</text>
        <path d={`M40 ${s.y(s.beforeAvg)}H260`} stroke="#8a8780" strokeWidth="1.5" strokeDasharray="2 4" />
        <path d={`M304 ${s.y(s.afterAvg)}H524`} stroke="#8a8780" strokeWidth="1.5" strokeDasharray="2 4" />
        <text x="40" y={s.y(s.beforeAvg) - 10} className="v2-imp__axis">전 평균 {f1(s.beforeAvg)}회</text>
        <text x="524" y={s.y(s.afterAvg) + 20} className="v2-imp__axis" textAnchor="end">후 평균 {f1(s.afterAvg)}회</text>
        <polyline points={s.before.map((v, i) => `${s.bx[i]},${s.y(v)}`).join(' ')} fill="none" stroke="#1e1e1e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={s.after.map((v, i) => `${s.ax[i]},${s.y(v)}`).join(' ')} fill="none" stroke="#1e1e1e" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <g fill="#ffffff" stroke="#1e1e1e" strokeWidth="2">
          {s.before.map((v, i) => <circle key={i} cx={s.bx[i]} cy={s.y(v)} r="4" />)}
        </g>
        <g fill="#1e1e1e">
          {s.after.map((v, i) => <circle key={i} cx={s.ax[i]} cy={s.y(v)} r="4.5" />)}
        </g>
        <g className="v2-imp__axis" textAnchor="middle">
          {imp.weeks.map((w, i) => (i % 2 === 0 ? <text key={w} x={i < 6 ? 40 + i * 44 : 304 + (i - 6) * 44} y="214">{w}</text> : null))}
        </g>
      </svg>
    </section>
  )
}
