/**
 * 기록 조회. 계약에 '전체 기록' 목록 API가 없어서:
 *   - 주차장 = 전체 → /v1/admin/overview 의 최근 20건
 *   - 주차장을 고르면 → /v1/admin/lots/:id/records?limit=N
 * 시연/실제 구분은 화면에서 거른다.
 */
import type { AdminRecordRow } from '@api-types'
import { useId, useMemo } from 'react'
import { RecordsTable } from '../components/RecordsTable'
import { ErrorBox, Loading } from '../components/ui'
import { useAsync, useData } from '../data'
import { formatNumber } from '../format'
import { adminHref, navigate, useRoute } from '../router'

type Kind = 'all' | 'demo' | 'real'
const LIMITS = [100, 300, 1000]

export function filterRecords(records: readonly AdminRecordRow[], kind: Kind): AdminRecordRow[] {
  if (kind === 'demo') return records.filter((r) => r.demo)
  if (kind === 'real') return records.filter((r) => !r.demo)
  return [...records]
}

export function Records() {
  const { client, lots } = useData()
  const route = useRoute()
  const lotId = route.query.get('lot') ?? ''
  const kind = ((route.query.get('kind') as Kind) || 'all') as Kind
  const limit = Number(route.query.get('limit')) || 100
  const lotSelectId = useId()
  const limitId = useId()

  const go = (next: { lot?: string; kind?: Kind; limit?: number }) => {
    const l = next.lot ?? lotId
    const k = next.kind ?? kind
    const n = next.limit ?? limit
    navigate(adminHref('/records', { lot: l || undefined, kind: k === 'all' ? undefined : k, limit: l && n !== 100 ? n : undefined }), { replace: true })
  }

  const data = useAsync<AdminRecordRow[]>(
    async () => (lotId ? (await client.lotRecords(lotId, limit)).records : (await client.overview()).recentRecords),
    [client, lotId, limit],
  )
  const rows = useMemo(() => filterRecords(data.data ?? [], kind), [data.data, kind])
  const sortedLots = useMemo(() => [...(lots.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'ko')), [lots.data])
  const lotName = sortedLots.find((l) => l.id === lotId)?.name

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <h1 className="page__title">기록</h1>
          <p className="page__lede">
            차량 앱이 보낸 익명 주차 기록이에요. 좌표·정확한 시각·차량 식별값은 받지 않아요 (주차 시각대는 요일과 시만).
          </p>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar__field">
          <label htmlFor={lotSelectId} className="toolbar__label">주차장</label>
          <select id={lotSelectId} className="input select" value={lotId} onChange={(e) => go({ lot: e.target.value })}>
            <option value="">전체 (최근 20건)</option>
            {sortedLots.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.demo ? ' · 시연' : ''}</option>
            ))}
          </select>
        </div>
        <div className="segmented" role="group" aria-label="기록 구분">
          {([['all', '전체'], ['real', '실제'], ['demo', '시연']] as [Kind, string][]).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => go({ kind: k })}>{label}</button>
          ))}
        </div>
        {lotId && (
          <div className="toolbar__field">
            <label htmlFor={limitId} className="toolbar__label">최근</label>
            <select id={limitId} className="input select select--sm" value={limit} onChange={(e) => go({ limit: Number(e.target.value) })}>
              {LIMITS.map((n) => <option key={n} value={n}>{n}건</option>)}
            </select>
          </div>
        )}
        <span className="toolbar__count" role="status">
          {data.data ? `${formatNumber(rows.length)}건${rows.length !== data.data.length ? ` / ${formatNumber(data.data.length)}건 중` : ''}` : ''}
        </span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={data.reload}>새로 고침</button>
      </div>

      {!lotId && (
        <p className="hint">전체 보기는 서버가 주는 최근 20건이에요. 더 보려면 주차장을 고르세요.</p>
      )}
      {lotId && lotName && (
        <p className="hint">
          <a href={adminHref(`/lots/${encodeURIComponent(lotId)}`)}>{lotName}</a> 상세에서 근거 통계도 볼 수 있어요.
        </p>
      )}

      {data.error && !data.data && <ErrorBox message={data.error} onRetry={data.reload} />}
      {data.loading && !data.data && <Loading />}
      {data.data && <RecordsTable records={rows} showLot={!lotId} caption={lotName ? `${lotName} 기록` : '최근 기록'} />}
    </div>
  )
}
