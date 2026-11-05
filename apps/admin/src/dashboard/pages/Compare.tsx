/**
 * D-03 주차장 비교 — 시안 docs/design/D-03.dc.html (1440×940). GET /v1/insights/compare
 * 유형 칩(전체 / 백화점·상가 / 오피스 / 공영 / 아파트)으로 거르고, 열 제목을 눌러 정렬(기본: 어려운 순).
 * 유형은 한 번에 전체를 받아 화면에서 거른다 ('백화점·상가'는 두 유형이라 서버 category 하나로는 못 보냄).
 */
import type { InsightLotRow, LotCategory } from '@api-types'
import { useMemo, useState } from 'react'
import { difficultyLabel, formatDurationKo, formatNumber } from '../../format'
import { href, navigate } from '../../router'
import { DLevelBars, DLoading, Sparkline, trendText } from '../components'
import { useInsight } from '../context'
import { DashError } from '../DashError'
import { categoryLabel, formatRampTurns, formatTimes } from '../format'

export const TYPE_FILTERS: { key: string; label: string; categories: LotCategory[] | null }[] = [
  { key: 'all', label: '전체', categories: null },
  { key: 'retail', label: '백화점·상가', categories: ['DEPARTMENT', 'MALL'] },
  { key: 'office', label: '오피스', categories: ['OFFICE'] },
  { key: 'public', label: '공영', categories: ['PUBLIC'] },
  { key: 'apartment', label: '아파트', categories: ['APARTMENT'] },
]

type SortKey = 'name' | 'category' | 'difficulty' | 'avgReverse' | 'ramp' | 'duration' | 'records' | 'trend'
type Dir = 'asc' | 'desc'

const trendDelta = (l: InsightLotRow) => (l.trend.length ? l.trend[l.trend.length - 1].avgReverse - l.trend[0].avgReverse : 0)

const VALUE: Record<SortKey, (l: InsightLotRow) => number | string> = {
  name: (l) => l.shortName,
  category: (l) => categoryLabel(l.category),
  difficulty: (l) => l.difficulty ?? -1,
  avgReverse: (l) => l.avgReverse,
  ramp: (l) => l.avgRampTurns,
  duration: (l) => l.avgDurationSec,
  records: (l) => l.records,
  trend: trendDelta,
}

const PHRASE: Record<SortKey, Record<Dir, string>> = {
  name: { asc: '이름 순', desc: '이름 역순' },
  category: { asc: '유형 순', desc: '유형 역순' },
  difficulty: { desc: '어려운 순', asc: '쉬운 순' },
  avgReverse: { desc: '후진 많은 순', asc: '후진 적은 순' },
  ramp: { desc: '램프 많이 도는 순', asc: '램프 적게 도는 순' },
  duration: { desc: '오래 걸리는 순', asc: '빨리 끝나는 순' },
  records: { desc: '기록 많은 순', asc: '기록 적은 순' },
  trend: { asc: '많이 좋아진 순', desc: '덜 좋아진 순' },
}

const FIRST_DIR: Record<SortKey, Dir> = {
  name: 'asc', category: 'asc', difficulty: 'desc', avgReverse: 'desc', ramp: 'desc', duration: 'desc', records: 'desc', trend: 'asc',
}

export function sortLots(lots: readonly InsightLotRow[], key: SortKey, dir: Dir): InsightLotRow[] {
  const f = VALUE[key]
  const sign = dir === 'asc' ? 1 : -1
  return [...lots].sort((a, b) => {
    const va = f(a)
    const vb = f(b)
    const c = typeof va === 'string' ? va.localeCompare(vb as string, 'ko') : (va as number) - (vb as number)
    return c * sign || (b.difficulty ?? -1) - (a.difficulty ?? -1)
  })
}

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'name', label: '주차장' },
  { key: 'category', label: '유형' },
  { key: 'difficulty', label: '난이도' },
  { key: 'avgReverse', label: '평균 후진', num: true },
  { key: 'ramp', label: '램프', num: true },
  { key: 'duration', label: '평균 시간', num: true },
  { key: 'records', label: '기록', num: true },
  { key: 'trend', label: '6개월 후진 추이' },
]

export function CompareView({ lots, regionName, type }: { lots: readonly InsightLotRow[]; regionName: string; type: string | null }) {
  const filter = TYPE_FILTERS.find((t) => t.key === type) ?? TYPE_FILTERS[0]
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: 'difficulty', dir: 'desc' })
  const rows = useMemo(() => {
    const cats = filter.categories
    const shown = cats ? lots.filter((l) => cats.includes(l.category)) : lots
    return sortLots(shown, sort.key, sort.dir)
  }, [lots, filter, sort])

  const choose = (key: string) => navigate(href('/compare', { type: key === 'all' ? undefined : key }), { replace: true })
  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: FIRST_DIR[key] }))

  return (
    <div className="d-stack">
      <div className="d-pagehead">
        <div className="d-pagehead__text">
          <h1 className="d-title">주차장 비교</h1>
          <p className="d-lede" aria-live="polite">{regionName} {formatNumber(rows.length)}곳 · {PHRASE[sort.key][sort.dir]}</p>
        </div>
        <div role="group" aria-label="유형" className="d-chips">
          {TYPE_FILTERS.map((t) => (
            <button key={t.key} type="button" className="d-chip" aria-pressed={t === filter} onClick={() => choose(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>

      <section className="d-card d-card--table" aria-label="주차장 비교 표">
        <table className="d-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const active = sort.key === c.key
                return (
                  <th key={c.key} scope="col" className={c.num ? 'is-num' : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    <button type="button" className="d-th-sort" onClick={() => toggle(c.key)}>
                      {c.label}
                      {active && <span className="d-th-sort__mark" aria-hidden="true">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={COLUMNS.length} className="d-table__empty">이 유형의 주차장은 아직 없어요</td></tr>
            )}
            {rows.map((l) => (
              <tr key={l.id}>
                <td><a className="d-table__name" href={href(`/lots/${encodeURIComponent(l.id)}`)}>{l.shortName}</a></td>
                <td><span className="d-muted">{categoryLabel(l.category)}</span></td>
                <td>
                  <span className="d-table__diff">
                    <DLevelBars score={l.difficulty} />
                    <b>{l.difficulty == null ? '–' : l.difficulty.toFixed(1)}</b>
                    <span className="d-table__difflabel">{difficultyLabel(l.difficulty)}</span>
                  </span>
                </td>
                <td className="is-num">{formatTimes(l.avgReverse)}</td>
                <td className="is-num">{formatRampTurns(l.avgRampTurns)}</td>
                <td className="is-num">{formatDurationKo(l.avgDurationSec)}</td>
                <td className="is-num">{formatNumber(l.records)}</td>
                <td>
                  <Sparkline values={l.trend.map((t) => t.avgReverse)} />
                  <span className="visually-hidden">{trendText(l.trend.map((t) => t.avgReverse))}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="d-footnote">점수는 같은 주차장 차량 기록의 가중 평균이에요. 차 크기 차이는 보정해요.</p>
    </div>
  )
}

export function Compare({ type }: { type: string | null }) {
  const res = useInsight('compare', (c, days) => c.compare({ days }))
  const ov = useInsight('overview', (c, days) => c.overview({ days }))
  if (res.error && !res.data) return <DashError message={res.error} code={res.errorCode} onRetry={res.reload} />
  if (!res.data) return <DLoading />
  return <CompareView lots={res.data.lots} regionName={ov.data?.region.name ?? '판교 일대'} type={type} />
}
