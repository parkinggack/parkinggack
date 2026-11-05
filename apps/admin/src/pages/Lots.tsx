/** 주차장 관리: 검색·정렬 표, 추가, 점수 다시 계산 */
import type { AdminLot } from '@api-types'
import { useMemo, useState } from 'react'
import { errorMessage } from '../api'
import { Difficulty, ErrorBox, KindBadge, Loading, TagChips } from '../components/ui'
import { useData } from '../data'
import { formatDateTime, formatNumber, tagLabel } from '../format'
import { adminHref, navigate, useRoute } from '../router'

type SortKey = 'name' | 'difficulty' | 'samples' | 'ratings' | 'updated'
type Kind = 'all' | 'demo' | 'real' | 'sparse'

export function matchesQuery(lot: AdminLot, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const hay = [lot.name, lot.id, lot.address ?? '', ...lot.tags.map(tagLabel), ...lot.manualTags.map(tagLabel)].join(' ').toLowerCase()
  return s.split(/\s+/).every((w) => hay.includes(w))
}

function sortLots(lots: AdminLot[], key: SortKey, dir: 1 | -1): AdminLot[] {
  const val = (l: AdminLot): number | string => {
    switch (key) {
      case 'name': return l.name
      case 'difficulty': return l.difficulty ?? -1
      case 'samples': return l.sampleCount
      case 'ratings': return l.ratingCount
      case 'updated': return l.updatedAt
    }
  }
  return [...lots].sort((a, b) => {
    const x = val(a)
    const y = val(b)
    const c = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y, 'ko') : (x as number) - (y as number)
    return c * dir || a.name.localeCompare(b.name, 'ko')
  })
}

function SortHeader({ label, k, sort, onSort, className }: {
  label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; className?: string
}) {
  const active = sort.key === k
  return (
    <th scope="col" className={className} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={() => onSort(k)}>
        {label}
        <span aria-hidden="true" className={active ? 'th-sort__mark is-active' : 'th-sort__mark'}>{active ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

export function Lots() {
  const { client, lots, reloadLots, notify } = useData()
  const route = useRoute()
  const q = route.query.get('q') ?? ''
  const kind = (route.query.get('kind') as Kind) || 'all'
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'difficulty', dir: -1 })
  const [recomputing, setRecomputing] = useState(false)

  const setQuery = (next: { q?: string; kind?: Kind }) => {
    const nq = next.q ?? q
    const nk = next.kind ?? kind
    navigate(adminHref('/lots', { q: nq || undefined, kind: nk === 'all' ? undefined : nk }), { replace: true })
  }

  const rows = useMemo(() => {
    const all = lots.data ?? []
    const filtered = all.filter((l) => {
      if (!matchesQuery(l, q)) return false
      if (kind === 'demo') return l.demo
      if (kind === 'real') return !l.demo
      if (kind === 'sparse') return l.difficulty == null
      return true
    })
    return sortLots(filtered, sort.key, sort.dir)
  }, [lots.data, q, kind, sort])

  const onSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: k === 'name' ? 1 : -1 }))

  async function recompute() {
    setRecomputing(true)
    try {
      const res = await client.recompute()
      await reloadLots()
      notify(`주차장 ${formatNumber(res.lots)}곳의 점수를 다시 계산했어요`)
    } catch (e) {
      notify(`점수를 다시 계산하지 않았어요: ${errorMessage(e)}`)
    } finally {
      setRecomputing(false)
    }
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">주차장 관리</h1>
          <p className="page__lede">
            차량 앱이 받아 가는 주차장 정보(층·구역 체계·태그·공공정보·요금)를 고쳐요. 점수와 자동 태그는 기록으로 서버가 계산해요.
          </p>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--secondary" onClick={recompute} disabled={recomputing} aria-describedby="recompute-hint">
            {recomputing ? '계산하는 중…' : '점수 다시 계산'}
          </button>
          <a className="btn btn--primary" href={adminHref('/lots/new')}>주차장 추가</a>
        </div>
      </div>
      <p id="recompute-hint" className="visually-hidden">최근 90일 기록으로 모든 주차장의 난이도 점수와 자동 태그를 다시 계산해요</p>

      <div className="toolbar" role="search">
        <label className="toolbar__search">
          <span className="visually-hidden">주차장 검색</span>
          <input
            className="input"
            type="search"
            placeholder="이름 · id · 주소 · 태그로 찾기"
            value={q}
            onChange={(e) => setQuery({ q: e.target.value })}
          />
        </label>
        <div className="segmented" role="group" aria-label="보기">
          {([['all', '전체'], ['real', '실제'], ['demo', '시연'], ['sparse', '기록 적음']] as [Kind, string][]).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setQuery({ kind: k })}>{label}</button>
          ))}
        </div>
        <span className="toolbar__count" role="status">
          {lots.data ? `${rows.length}곳${rows.length !== lots.data.length ? ` / 전체 ${lots.data.length}곳` : ''}` : ''}
        </span>
      </div>

      {lots.error && !lots.data && <ErrorBox message={lots.error} onRetry={() => void reloadLots()} />}
      {!lots.data && !lots.error && <Loading />}
      {lots.data && (
        rows.length === 0 ? (
          <p className="empty">조건에 맞는 주차장이 없어요</p>
        ) : (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="주차장 목록">
            <table className="table table--lots">
              <caption className="visually-hidden">주차장 목록 (열 제목을 누르면 정렬)</caption>
              <thead>
                <tr>
                  <SortHeader label="이름" k="name" sort={sort} onSort={onSort} />
                  <SortHeader label="난이도" k="difficulty" sort={sort} onSort={onSort} />
                  <SortHeader label="기록(30일)" k="samples" sort={sort} onSort={onSort} className="num" />
                  <SortHeader label="별점" k="ratings" sort={sort} onSort={onSort} className="num" />
                  <th scope="col">태그</th>
                  <th scope="col">구분</th>
                  <SortHeader label="고친 때" k="updated" sort={sort} onSort={onSort} className="hide-md" />
                  <th scope="col"><span className="visually-hidden">작업</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <a className="lot-cell__name" href={adminHref(`/lots/${encodeURIComponent(l.id)}`)}>{l.name}</a>
                      <span className="lot-cell__id mono">{l.id}</span>
                    </td>
                    <td className="nowrap"><Difficulty score={l.difficulty} size="sm" /></td>
                    <td className="num">{formatNumber(l.sampleCount)}대</td>
                    <td className="num">{formatNumber(l.ratingCount)}개</td>
                    <td><TagChips tags={l.tags} manual={l.manualTags} empty="–" /></td>
                    <td><KindBadge demo={l.demo} /></td>
                    <td className="hide-md nowrap muted">{formatDateTime(l.updatedAt)}</td>
                    <td className="nowrap">
                      <a className="btn btn--ghost btn--sm" href={adminHref(`/lots/${encodeURIComponent(l.id)}/edit`)} aria-label={`${l.name} 수정`}>수정</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <p className="hint">굵은 테두리 태그 = 운영자가 붙인 태그 · 나머지는 기록으로 붙은 자동 태그 (합쳐서 최대 3개가 차량 앱에 나가요)</p>
    </div>
  )
}
