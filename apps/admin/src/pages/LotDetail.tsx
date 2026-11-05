/** 주차장 상세: 점수·메타데이터 요약, C-08 근거 통계, 그 주차장 기록 */
import type { AdminLot } from '@api-types'
import { useState } from 'react'
import { errorMessage } from '../api'
import { LotStatsView } from '../components/LotStatsView'
import { RecordsTable } from '../components/RecordsTable'
import { Card, Difficulty, ErrorBox, InlineConfirm, KindBadge, Loading, TagChips } from '../components/ui'
import { useAsync, useData } from '../data'
import { formatCoord, formatDateTime, formatNumber } from '../format'
import { adminHref, navigate } from '../router'

export function useLot(id: string): { lot: AdminLot | null; loading: boolean; error: string | null; reload: () => void } {
  const { lots, reloadLots } = useData()
  const lot = lots.data?.find((l) => l.id === id) ?? null
  return { lot, loading: lots.loading && !lots.data, error: lots.data ? null : lots.error, reload: () => void reloadLots() }
}

export function DeleteLot({ lot, onDeleted }: { lot: AdminLot; onDeleted?: () => void }) {
  const { client, reloadLots, notify } = useData()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run() {
    setBusy(true)
    setError(null)
    try {
      await client.deleteLot(lot.id)
      await reloadLots()
      notify(`"${lot.name}"을(를) 지웠어요`)
      onDeleted?.()
      navigate(adminHref('/lots'))
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }
  if (!asking) {
    return (
      <button type="button" className="btn btn--secondary" onClick={() => setAsking(true)}>
        삭제
      </button>
    )
  }
  return (
    <div className="delete-confirm">
      <InlineConfirm
        title={`"${lot.name}"을(를) 지울까요?`}
        detail={<>이 주차장의 기록 {formatNumber(lot.scoreSampleCount)}건(90일)과 별점도 같이 지워지고 되돌릴 수 없어요. 차량 앱은 다음 동기화부터 이 주차장을 모르게 돼요.</>}
        confirmLabel="지우기"
        onConfirm={run}
        onCancel={() => setAsking(false)}
        busy={busy}
      />
      {error && <p className="field__error" role="alert">지우지 않았어요: {error}</p>}
    </div>
  )
}

function KindFilter({ value, onChange }: { value: 'all' | 'demo' | 'real'; onChange: (v: 'all' | 'demo' | 'real') => void }) {
  return (
    <div className="segmented" role="group" aria-label="기록 구분">
      {([['all', '전체'], ['real', '실제'], ['demo', '시연']] as const).map(([k, label]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  )
}

export function LotDetail({ id }: { id: string }) {
  const { client } = useData()
  const { lot, loading, error, reload } = useLot(id)
  const records = useAsync(() => client.lotRecords(id, 100), [client, id])
  const [kind, setKind] = useState<'all' | 'demo' | 'real'>('all')
  const [shown, setShown] = useState(20)

  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (loading) return <Loading />
  if (!lot) {
    return (
      <div className="page">
        <p className="empty">주차장 "{id}"이(가) 없어요. 지워졌거나 id가 바뀌었을 수 있어요.</p>
        <a href={adminHref('/lots')} className="btn btn--secondary">주차장 관리로</a>
      </div>
    )
  }

  const manual = lot.manualTags
  const autoTags = lot.tags.filter((t) => !manual.includes(t))
  const hard = lot.difficulty == null ? null : lot.difficulty >= 3.5 ? true : lot.difficulty < 2.5 ? false : null
  const recs = (records.data?.records ?? []).filter((r) => (kind === 'all' ? true : kind === 'demo' ? r.demo : !r.demo))

  return (
    <div className="page">
      <nav className="crumbs" aria-label="위치">
        <a href={adminHref('/lots')}>주차장 관리</a>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{lot.name}</span>
      </nav>

      <header className="lot-head card">
        <div className="lot-head__main">
          <div className="lot-head__title-row">
            <h1 className="page__title">{lot.name}</h1>
            <KindBadge demo={lot.demo} />
          </div>
          <p className="muted">
            <span className="mono">{lot.id}</span>
            {lot.address ? ` · ${lot.address}` : ''}
          </p>
          <p className="lot-head__basis">
            최근 30일 · 차량 {formatNumber(lot.sampleCount)}대 기준 · 점수 표본(90일) {formatNumber(lot.scoreSampleCount)}건 · 별점 {formatNumber(lot.ratingCount)}개
          </p>
        </div>
        <Difficulty score={lot.difficulty} size="lg" />
        <div className="lot-head__actions">
          <a className="btn btn--primary" href={adminHref(`/lots/${encodeURIComponent(lot.id)}/edit`)}>정보 수정</a>
          <DeleteLot lot={lot} />
        </div>
      </header>

      <div className="info-grid">
        <Card title="차량 앱에 나가는 정보" headingLevel={2}>
          <dl className="facts">
            <dt>층 (위→아래)</dt>
            <dd><span className="chips">{lot.floors.map((f) => <span key={f} className="chip chip--mono">{f}</span>)}</span></dd>
            <dt>구역 체계</dt>
            <dd>
              {lot.zoneScheme.zones.length ? <span className="mono">{lot.zoneScheme.zones.join(' ')}</span> : <span className="muted">구역 없음</span>}
              {' · '}
              {lot.zoneScheme.numbers.length ? <span className="mono">{lot.zoneScheme.numbers[0]}–{lot.zoneScheme.numbers[lot.zoneScheme.numbers.length - 1]}</span> : <span className="muted">번호 없음</span>}
              {lot.zoneScheme.description && <div className="muted">{lot.zoneScheme.description}</div>}
            </dd>
            <dt>태그</dt>
            <dd><TagChips tags={lot.tags} manual={manual} empty="태그 없음" /></dd>
            <dt>수치 칩</dt>
            <dd>{lot.statChips.length ? lot.statChips.join(' · ') : <span className="muted">없음</span>}</dd>
            <dt>요금</dt>
            <dd>{lot.feeText ?? <span className="muted">없음 (차량 앱은 '공공데이터 연동 시 표시')</span>}</dd>
            <dt>공공정보</dt>
            <dd>
              {lot.publicInfo.length ? <ul className="plain-list">{lot.publicInfo.map((x, i) => <li key={i}>{x}</li>)}</ul> : <span className="muted">없음</span>}
            </dd>
          </dl>
        </Card>
        <Card title="관리 정보" headingLevel={2}>
          <dl className="facts">
            <dt>좌표</dt>
            <dd>
              <span className="mono">{formatCoord(lot.location.lat)}, {formatCoord(lot.location.lng)}</span>{' '}
              <a href={`https://www.openstreetmap.org/?mlat=${lot.location.lat}&mlon=${lot.location.lng}#map=18/${lot.location.lat}/${lot.location.lng}`} target="_blank" rel="noopener noreferrer">
                지도에서 보기<span className="visually-hidden"> (새 창)</span>
              </a>
            </dd>
            <dt>운영자 태그</dt>
            <dd><TagChips tags={manual} manual={manual} empty="없음" /></dd>
            <dt>자동 태그</dt>
            <dd><TagChips tags={autoTags} empty="없음" /></dd>
            <dt>만든 때</dt>
            <dd>{formatDateTime(lot.createdAt)}</dd>
            <dt>고친 때</dt>
            <dd>{formatDateTime(lot.updatedAt)}</dd>
          </dl>
        </Card>
      </div>

      <h2 className="section-title">점수의 근거 <span className="muted">(차량 앱 C-08과 같은 값)</span></h2>
      {lot.stats ? (
        <LotStatsView stats={lot.stats} hard={hard} />
      ) : (
        <p className="empty empty--dashed">아직 기록이 적어요 ({formatNumber(lot.sampleCount)}대). 기록이 쌓이면 근거 통계가 생겨요.</p>
      )}

      <div className="section-head">
        <h2 className="section-title">이 주차장 기록 <span className="muted">(최근 100건)</span></h2>
        <KindFilter value={kind} onChange={(k) => { setKind(k); setShown(20) }} />
      </div>
      {records.error && !records.data && <ErrorBox message={records.error} onRetry={records.reload} />}
      {!records.data && !records.error && <Loading />}
      {records.data && <RecordsTable records={recs.slice(0, shown)} showLot={false} caption={`${lot.name} 기록`} />}
      {records.data && recs.length > shown && (
        <div className="more-row">
          <button type="button" className="btn btn--secondary" onClick={() => setShown((n) => n + 40)}>
            더 보기 ({formatNumber(shown)} / {formatNumber(recs.length)}건)
          </button>
          <a className="btn btn--ghost" href={adminHref('/records', { lot: lot.id })}>기록 화면에서 보기</a>
        </div>
      )}
    </div>
  )
}
