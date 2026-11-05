/**
 * D-10 난이도 한눈에 — 시안 docs/design/D-10.dc.html (1440×2560). 질문 하나: 어디가 어려운가.
 * 요약 4칸 · 9곳을 난이도 자 위에 한 줄씩 · 주차장별 카드(작은 평면 + 후진 다발 지점, 정렬 3가지) · 이번 달 눈에 띄는 변화 · 내보내기 안내.
 *
 * API: GET /v1/insights/overview (주차장 · 점수 · 기록 수 · 평균 후진 · 평균 시간 · 6개월 추이 · 지역 합계)
 *      GET /v1/insights/lots/:id?maxPaths=1 (주차장마다 후진 잦은 곳 · 도면 크기 — 동선은 받지 않음)
 * API 에 없는 값(한 번에 들어간 비율 · 지난 기간 대비 기록 증가 · 눈에 띄는 변화 · 5건 미만 칸)은 v2demo 의 시연용 예시.
 */
import type { InsightLotRow, InsightsLotResponse, InsightsOverviewResponse } from '@api-types'
import { useMemo, useState, type ReactNode } from 'react'
import { difficultyLabel, difficultyLevel, formatDurationKo, formatNumber } from '../../format'
import { href } from '../../router'
import { DLoading, LevelBars } from '../components'
import { useInsight, useInsightsContext } from '../context'
import { DashError } from '../DashError'
import { categoryLabel, floorRangeText, formatTimes, kstMonthDay, kstToday, mapLabel, periodRangeText, prevPeriodLabel } from '../format'
import {
  DATASETS, EXPORT_HISTORY, FORMATS, NOTABLE_CHANGES, RECORDS_GROWTH_PCT, REGION_ONE_SHOT_PCT, SCORE_PER_REVERSE, type ChangeIcon,
} from '../v2demo'

type SortKey = 'score' | 'count' | 'delta'
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: '어려운 순' },
  { key: 'count', label: '기록 많은 순' },
  { key: 'delta', label: '많이 좋아진 순' },
]

const round1 = (v: number) => Math.round(v * 10 + (v >= 0 ? 1e-9 : -1e-9)) / 10

/** 6개월 추이(평균 후진) → 난이도 변화 (−는 쉬워짐) */
export function trendScoreDelta(l: InsightLotRow): number {
  if (l.trend.length < 2) return 0
  return round1(SCORE_PER_REVERSE * (l.trend[l.trend.length - 1].avgReverse - l.trend[0].avgReverse))
}

export function trendBadge(d: number): string {
  if (d < 0) return `${Math.abs(d).toFixed(1)} 쉬워짐`
  if (d > 0) return `${d.toFixed(1)} 어려워짐`
  return '변화 없음'
}

/** 기록 수 → 점 지름 (시안 범례: 200건 12px · 600건 20px · 1,200건 32px, 30일 기준) */
export function dotSize(records: number, days: number): number {
  const per30 = (records * 30) / Math.max(1, days)
  return Math.round(Math.min(40, Math.max(8, 8 + 0.02 * per30)))
}

function legendCounts(days: number): number[] {
  return [200, 600, 1200].map((n) => {
    const v = (n * days) / 30
    const mag = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 1)
    return Math.round(v / mag) * mag
  })
}

/** 지역 평균 난이도 = 기록 수로 가중한 주차장 난이도 평균 */
export function regionScore(lots: readonly InsightLotRow[]): number | null {
  const scored = lots.filter((l) => l.difficulty != null && l.records > 0)
  const n = scored.reduce((a, l) => a + l.records, 0)
  if (!n) return null
  return round1(scored.reduce((a, l) => a + (l.difficulty as number) * l.records, 0) / n)
}

type LotMeta = Pick<InsightsLotResponse, 'hotspots' | 'layout'> | null

function Icon({ kind }: { kind: ChangeIcon }) {
  const p = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: '#1e1e1e', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (kind === 'down') return <svg {...p}><path d="M3 7l6 6 4-4 8 8M21 11v6h-6" /></svg>
  if (kind === 'up') return <svg {...p}><path d="M3 17l6-6 4 4 8-8M21 13V7h-6" /></svg>
  if (kind === 'clock') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>
  return <svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
}

const DownloadIcon = ({ size = 18 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
)

function Kpi({ label, value, unit, sub }: { label: string; value: ReactNode; unit: string; sub: string }) {
  return (
    <div className="v2-kpi">
      <span className="v2-kpi__label">{label}</span>
      <span className="v2-kpi__value"><span className="v2-kpi__num">{value}</span><span className="v2-kpi__unit">{unit}</span></span>
      <span className="v2-kpi__sub">{sub}</span>
    </div>
  )
}

/** 9곳이 어디쯤 있나요 — 난이도 자 (1~5, 구간: 아주 쉬움 1fr · 쉬움 · 보통 · 어려움 2fr · 아주 어려움 1fr) */
function Ruler({ lots, days }: { lots: readonly InsightLotRow[]; days: number }) {
  const rows = lots.filter((l) => l.difficulty != null).sort((a, b) => (b.difficulty as number) - (a.difficulty as number) || b.records - a.records)
  const legend = legendCounts(days)
  return (
    <section className="v2-ruler" aria-labelledby="v2-ruler-title">
      <div className="v2-ruler__head">
        <div className="v2-ruler__titles">
          <h2 id="v2-ruler-title" className="v2-h2">{rows.length}곳이 어디쯤 있나요</h2>
          <p className="v2-ruler__sub">오른쪽으로 갈수록 주차가 어려워요. 점이 클수록 기록이 많아요.</p>
        </div>
        <div className="v2-ruler__legend" aria-hidden="true">
          {legend.map((n, i) => {
            const s = [12, 20, 32][i]
            return <span key={i}><span className="v2-ruler__legend-dot" style={{ width: s, height: s }} />{formatNumber(n)}건</span>
          })}
        </div>
      </div>
      <div className="v2-scroll">
        <div className="v2-ruler__table">
          <div className="v2-ruler__row v2-ruler__row--head" aria-hidden="true">
            <span>어려운 순</span>
            <div className="v2-ruler__bands-label"><span>아주 쉬움</span><span>쉬움</span><span>보통</span><span>어려움</span><span>아주 어려움</span></div>
            <span className="v2-ruler__count">기록</span>
          </div>
          <ol className="v2-ruler__list">
            {rows.map((l, i) => {
              const left = `${(((l.difficulty as number) - 1) / 4) * 100}%`
              const size = dotSize(l.records, days)
              return (
                <li key={l.id} className="v2-ruler__row">
                  <a className="v2-ruler__name" href={href(`/lots/${encodeURIComponent(l.id)}`)}>
                    <span className="v2-ruler__rank" aria-hidden="true">{i + 1}</span>{l.shortName}
                  </a>
                  <div className="v2-ruler__track">
                    <div className="v2-ruler__bands" aria-hidden="true"><span /><span /><span /><span /><span /></div>
                    <div className="v2-ruler__line" style={{ width: left }} aria-hidden="true" />
                    <div className="v2-ruler__dot" style={{ left, width: size, height: size }} aria-hidden="true" />
                    <span className="v2-ruler__score" style={{ left, transform: `translate(${Math.round(size / 2 + 10)}px, -50%)` }}>
                      <span className="visually-hidden">난이도 </span>{(l.difficulty as number).toFixed(1)}
                      <span className="visually-hidden"> {difficultyLabel(l.difficulty)}</span>
                    </span>
                  </div>
                  <span className="v2-ruler__count">{formatNumber(l.records)}<span className="visually-hidden">건</span></span>
                </li>
              )
            })}
          </ol>
          <div className="v2-ruler__row v2-ruler__row--axis" aria-hidden="true">
            <span />
            <div className="v2-ruler__axis">{[1, 2, 3, 4, 5].map((n) => <span key={n} style={{ left: `${((n - 1) / 4) * 100}%` }}>{n}</span>)}</div>
            <span />
          </div>
        </div>
      </div>
    </section>
  )
}

/** 카드 안 작은 평면: 위아래 칸 줄 + 가운데 통로, 원 = 후진 다발 지점 (모든 층을 한 그림에, 같은 자리는 한 번) */
function MiniPlan({ meta }: { meta: LotMeta | undefined }) {
  const spots = useMemo(() => {
    if (!meta) return []
    const w = meta.layout[0]?.width ?? 65.6
    const h = meta.layout[0]?.height ?? 35.84
    const byPos = new Map<string, { x: number; y: number; v: number }>()
    for (const s of meta.hotspots) {
      const key = `${s.x},${s.y}`
      const cur = byPos.get(key)
      if (!cur || s.avgReverse > cur.v) byPos.set(key, { x: s.x / w, y: s.y / h, v: s.avgReverse })
    }
    return [...byPos.values()].map((p) => ({
      left: `${Math.min(94, Math.max(6, p.x * 100)).toFixed(1)}%`,
      // 오른쪽 아래 '후진 다발 N곳' 글자와 겹치지 않게 18~100px 안에
      top: Math.round(18 + Math.min(1, Math.max(0, p.y)) * 82),
      size: Math.round(Math.min(26, Math.max(12, 8 + 5.5 * p.v))),
    }))
  }, [meta])
  const n = meta?.hotspots.length ?? 0
  return (
    <div className="v2-mini">
      <div className="v2-mini__bays v2-mini__bays--top" aria-hidden="true" />
      <div className="v2-mini__bays v2-mini__bays--bottom" aria-hidden="true" />
      <div className="v2-mini__aisle" aria-hidden="true" />
      {spots.map((s, i) => <span key={i} className="v2-mini__spot" aria-hidden="true" style={{ left: s.left, top: s.top, width: s.size, height: s.size }} />)}
      {meta !== undefined && <span className="v2-mini__text">{meta === null ? '후진 다발 지점 정보 없음' : n ? `후진 다발 ${n}곳` : '후진 다발 지점 없음'}</span>}
    </div>
  )
}

function LotCard({ l, meta }: { l: InsightLotRow; meta: LotMeta | undefined }) {
  const lv = l.difficulty == null ? 0 : difficultyLevel(l.difficulty)
  const delta = trendScoreDelta(l)
  const floors = meta ? meta.layout.map((x) => x.floor) : null
  return (
    <a className="v2-card" href={href(`/lots/${encodeURIComponent(l.id)}`)}>
      <div className="v2-card__head">
        <div className="v2-card__titles">
          <span className="v2-card__name">{l.shortName}</span>
          <span className="v2-card__type">{categoryLabel(l.category)}{floors ? ` · ${floorRangeText(floors)}` : ''}</span>
        </div>
        <span className="v2-card__trend" title="6개월 전보다">
          <span className="visually-hidden">6개월 전보다 </span>{trendBadge(delta)}
        </span>
      </div>
      <MiniPlan meta={meta} />
      <div className="v2-card__foot">
        <span className="v2-card__score"><span className="visually-hidden">난이도 </span>{l.difficulty == null ? '–' : l.difficulty.toFixed(1)}</span>
        <div className="v2-card__level">
          <LevelBars level={lv} size="card" />
          <span className="v2-card__label">{difficultyLabel(l.difficulty)}</span>
        </div>
        <div className="v2-card__spacer" />
        <dl className="v2-card__stats">
          <dt>평균 후진</dt><dd>{formatTimes(l.avgReverse)}</dd>
          <dt>평균 시간</dt><dd>{formatDurationKo(l.avgDurationSec)}</dd>
          <dt>기록</dt><dd>{formatNumber(l.records)}건</dd>
        </dl>
      </div>
    </a>
  )
}

/** items 를 limit 개씩만 동시에 처리 (결과 순서는 items 순서) */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export function DifficultyView({ o }: { o: InsightsOverviewResponse }) {
  const { days } = useInsightsContext()
  const [sort, setSort] = useState<SortKey>('score')
  const ids = o.lots.map((l) => l.id)
  // 9곳을 한꺼번에 부르면 서버(Vercel 함수)가 인스턴스를 여럿 새로 띄우며 각각 20초 넘게 걸렸다 → 2곳씩 차례로
  const metas = useInsight(`lotmeta-all:${ids.join(',')}`, (c, d) =>
    mapLimit(ids, 2, (id) => c.lot(id, { days: d, maxPaths: 1 }).then((r) => ({ hotspots: r.hotspots, layout: r.layout }), () => null)),
  )
  const metaOf = (id: string): LotMeta | undefined => (metas.data ? metas.data[ids.indexOf(id)] ?? null : undefined)

  const avg = regionScore(o.lots)
  const prevAvg = avg != null && o.totals.prevAvgReverse != null
    ? round1(avg + SCORE_PER_REVERSE * (o.totals.prevAvgReverse - o.totals.avgReverse))
    : null
  const prevName = prevPeriodLabel(days)
  const avgSub = avg == null || prevAvg == null
    ? `${prevName} 기록과 비교할 수 없어요`
    : prevAvg > avg
      ? `${prevName} ${prevAvg.toFixed(1)}에서 ${round1(prevAvg - avg).toFixed(1)} 쉬워졌어요`
      : prevAvg < avg
        ? `${prevName} ${prevAvg.toFixed(1)}에서 ${round1(avg - prevAvg).toFixed(1)} 어려워졌어요`
        : `${prevName}과 같아요`

  const byScore = [...o.lots].sort((a, b) => (b.difficulty ?? -1) - (a.difficulty ?? -1))
  const spotTotal = metas.data ? metas.data.reduce((a, m) => a + (m?.hotspots.length ?? 0), 0) : null
  const spotTop4 = metas.data ? byScore.slice(0, 4).reduce((a, l) => a + (metaOf(l.id)?.hotspots.length ?? 0), 0) : null

  const cards = useMemo(() => {
    const xs = [...o.lots]
    if (sort === 'count') xs.sort((a, b) => b.records - a.records)
    else if (sort === 'delta') xs.sort((a, b) => trendScoreDelta(a) - trendScoreDelta(b) || (b.difficulty ?? -1) - (a.difficulty ?? -1))
    else xs.sort((a, b) => (b.difficulty ?? -1) - (a.difficulty ?? -1) || b.records - a.records)
    return xs
  }, [o.lots, sort])

  const shortOf = new Map(o.lots.map((l) => [l.id, mapLabel(l.shortName)]))
  const latest = EXPORT_HISTORY[0]
  const latestLot = o.lots.find((l) => l.id === 'hyundai-pangyo')
  const latestText = [
    kstMonthDay(latest.at),
    `${DATASETS.find((d) => d.id === latest.dataset)!.name}${latest.dataset === 'sessions' && latest.days === days && latestLot ? ` ${formatNumber(latestLot.records)}행` : ''}`,
    FORMATS.find((f) => f.id === latest.format)!.label,
  ].join(' · ')

  return (
    <div className="v2-page">
      <div className="v2-pagehead">
        <div className="v2-pagehead__text">
          <span className="v2-eyebrow">{o.region.name} · {periodRangeText(kstToday(), days)}</span>
          <h1 className="v2-h1">주차 난이도 한눈에</h1>
          <p className="v2-lede">{o.totals.lots}곳에서 {formatNumber(o.totals.records)}번의 주차를 차가 직접 기록했어요. 후진·핸들·걸린 시간으로 매긴 점수예요.</p>
        </div>
        <a className="v2-btn v2-btn--outline" href={href('/export', { lot: 'all' })}><DownloadIcon />이 화면 데이터 받기</a>
      </div>

      <section aria-label="요약" className="v2-kpis">
        <Kpi label="평균 난이도" value={avg == null ? '–' : avg.toFixed(1)} unit={avg == null ? '' : difficultyLabel(avg)} sub={avgSub} />
        <Kpi label="주차 기록" value={formatNumber(o.totals.records)} unit="건" sub={`${prevName}보다 ${RECORDS_GROWTH_PCT}% 늘었어요`} />
        <Kpi label="한 번에 들어간 비율" value={REGION_ONE_SHOT_PCT} unit="%" sub="후진 1회 이하로 끝난 주차" />
        <Kpi
          label="후진 다발 지점"
          value={spotTotal == null ? '–' : formatNumber(spotTotal)}
          unit="곳"
          sub={spotTotal == null ? '주차장별 지점을 불러오는 중이에요' : `어려운 4곳에 ${formatNumber(spotTop4 ?? 0)}곳이 몰려 있어요`}
        />
      </section>

      <Ruler lots={o.lots} days={days} />

      <section className="v2-section" aria-labelledby="v2-cards-title">
        <div className="v2-section__head">
          <div className="v2-section__titles">
            <h2 id="v2-cards-title" className="v2-h2">주차장별로 보기</h2>
            <p className="v2-section__sub">그림의 원은 후진이 몰리는 자리예요. 카드를 누르면 자세히 볼 수 있어요.</p>
          </div>
          <div role="group" aria-label="정렬" className="v2-seg">
            {SORTS.map((s) => (
              <button key={s.key} type="button" className="v2-seg__btn" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>{s.label}</button>
            ))}
          </div>
        </div>
        <div className="v2-cards">
          {cards.map((l) => <LotCard key={l.id} l={l} meta={metaOf(l.id)} />)}
        </div>
      </section>

      <div className="v2-bottom">
        <section className="v2-box v2-changes" aria-labelledby="v2-changes-title">
          <h2 id="v2-changes-title" className="v2-h3">이번 달 눈에 띄는 변화</h2>
          <ul className="v2-changes__list">
            {NOTABLE_CHANGES.map((c, i) => {
              const name = c.lotId ? shortOf.get(c.lotId) ?? null : null
              const title = c.title ?? (name ? (c.where ? `${name} · ${c.where}` : name) : '')
              return (
                <li key={i} className="v2-changes__item">
                  <span className="v2-changes__icon" aria-hidden="true"><Icon kind={c.icon} /></span>
                  <span className="v2-changes__text"><span className="v2-changes__title">{title}</span><span className="v2-changes__desc">{c.text}</span></span>
                  {c.lotId && name && (
                    <a className="v2-changes__link" href={href(`/lots/${encodeURIComponent(c.lotId)}`, { floor: c.floor })} aria-label={`${title} 보기`}>보기</a>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        <section className="v2-darkbox v2-exportcta" aria-labelledby="v2-exportcta-title">
          <span className="v2-darkbox__eyebrow">데이터 내보내기</span>
          <h2 id="v2-exportcta-title" className="v2-exportcta__title">보고 있는 숫자를<br />그대로 받아 갈 수 있어요</h2>
          <p className="v2-exportcta__text">주차 세션, 동선 좌표, 후진·급정지 지점, 칸별 집계, 시간대 집계. 개인을 알아볼 수 있는 값은 처음부터 모으지 않아요.</p>
          <ul aria-label="받을 수 있는 형식" className="v2-exportcta__formats">
            {FORMATS.map((f) => <li key={f.id}>{f.label}</li>)}
          </ul>
          <div className="v2-exportcta__spacer" />
          <div className="v2-exportcta__foot">
            <a className="v2-btn v2-btn--light" href={href('/export')}><DownloadIcon />내보내기 시작</a>
            <span className="v2-exportcta__recent">최근: {latestText}</span>
          </div>
        </section>
      </div>
    </div>
  )
}

export function Difficulty() {
  const ov = useInsight('overview', (c, days) => c.overview({ days }))
  if (ov.error && !ov.data) return <DashError message={ov.error} code={ov.errorCode} onRetry={ov.reload} />
  if (!ov.data) return <DLoading />
  return <DifficultyView o={ov.data} />
}
