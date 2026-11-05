/**
 * D-12 데이터 내보내기 — 시안 docs/design/D-12.dc.html (1440×2040). 질문 하나: 그 숫자를 어떻게 뽑아 가나.
 * 왼쪽 1 무엇을(데이터 5종) · 2 범위(주차장 · 기간 · 층 · 차 크기) · 3 형식 · 4 받는 방법, 오른쪽 미리보기(실제 파일 앞 몇 줄) ·
 * 파일에 들어 있지 않은 것 · 받을 내용 · 만들기. 아래 내보낸 기록 · 시스템에서 바로 가져가기(안내 그림).
 *
 * 정직하게: 파일은 이 브라우저에서 실제로 만들어 내려받는다 (CSV · Excel · Parquet · GeoJSON). 메일 · 매주 자동 · API 키는
 * 시연 화면에서 하지 않으므로 그렇다고 적는다. 기록은 API 집계에 맞춘 시연용 예시 (export/records.ts).
 * API: GET /v1/insights/overview?days=7|30|90 (주차장 · 그 기간 기록 수), GET /v1/insights/lots/:id?maxPaths=1 (층 · 층별 평균 후진 · 도면 · 히트맵)
 */
import type { InsightsLotResponse, InsightsOverviewResponse } from '@api-types'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatNumber } from '../../format'
import { href, navigate } from '../../router'
import { DLoading } from '../components'
import { useInsight, useInsightsContext } from '../context'
import { DashError } from '../DashError'
import { addDaysIso, dateRangeText, kstMonthDay, kstMonthDayTime, kstToday } from '../format'
import { buildExport, formatCell, type ExportSet } from '../export/datasets'
import { estimateBytes, formatBytes, makeExportFile, saveFile, type FileFormat } from '../export/files'
import { generateSessions, type LotSource, type SessionRec } from '../export/records'
import {
  API_INFO, CAR_CLASSES, DATASETS, DEFAULT_DATASETS, EXPORT_HISTORY, FORMATS, type DatasetId, type ExportHistoryRow, type FormatId,
} from '../v2demo'

type Period = '7' | '30' | '90' | 'custom'
type Deliver = 'once' | 'weekly'

const PERIODS: { id: Exclude<Period, 'custom'>; label: string }[] = [
  { id: '7', label: '7일' },
  { id: '30', label: '30일' },
  { id: '90', label: '90일' },
]

const DELIVERS: { id: Deliver; title: string; desc: string }[] = [
  { id: 'once', title: '지금 한 번', desc: '이 브라우저에서 바로 파일로 받아요' },
  { id: 'weekly', title: '매주 자동', desc: '월요일 아침 6시, 지난 7일치를 메일로 보내요' },
]

const comma = (n: number) => formatNumber(n)
/** 183400 → "18.3만", 5210 → "5,210" */
export function shortCount(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만` : comma(n)
}

function kstHour(ms = Date.now()): number {
  return new Date(ms + 9 * 3_600_000).getUTCHours()
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1

function toSource(r: InsightsLotResponse): LotSource {
  return { lot: r.lot, floorAvgReverse: r.floorAvgReverse, layout: r.layout, heat: r.heat }
}

const Check = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
)
const DownloadIcon = ({ size = 20 }: { size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
)
const Lock = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
)

function Step({ n, title, children, id }: { n: number; title: string; children: ReactNode; id: string }) {
  return (
    <section className="v2-box v2-step" aria-labelledby={id}>
      <div className="v2-step__head"><span className="v2-step__no" aria-hidden="true">{n}</span><h2 id={id} className="v2-h4">{title}</h2></div>
      {children}
    </section>
  )
}

/** 집합 칩: '전체' + 하나씩 (다 고르면 다시 전체) */
function ChipSet({ label, all, value, onChange }: { label: string; all: readonly string[]; value: ReadonlySet<string>; onChange: (next: Set<string>) => void }) {
  const toggle = (x: string) => {
    const next = new Set(value)
    if (next.has(x)) next.delete(x)
    else next.add(x)
    onChange(next.size === all.length ? new Set() : next)
  }
  const id = useId()
  return (
    <div className="v2-range__row">
      <span className="v2-range__label" id={id}>{label}</span>
      <div role="group" aria-labelledby={id} className="v2-range__chips">
        <button type="button" className="v2-chip" aria-pressed={value.size === 0} onClick={() => onChange(new Set())}>전체</button>
        {all.map((x) => <button key={x} type="button" className="v2-chip" aria-pressed={value.has(x)} onClick={() => toggle(x)}>{x}</button>)}
      </div>
    </div>
  )
}

export function ExportPage({ lotParam }: { lotParam: string | null }) {
  const { lastLotId } = useInsightsContext()
  const listOv = useInsight('overview', (c, days) => c.overview({ days }))
  if (listOv.error && !listOv.data) return <DashError message={listOv.error} code={listOv.errorCode} onRetry={listOv.reload} />
  if (!listOv.data) return <DLoading />
  const all = listOv.data.lots.map((l) => l.id)
  const wanted = lotParam === 'all' ? all : (lotParam ?? '').split(',').map((s) => s.trim()).filter((id) => all.includes(id))
  const ids = wanted.length ? wanted : [lastLotId && all.includes(lastLotId) ? lastLotId : all[0]].filter(Boolean)
  return <ExportView ids={ids} overview={listOv.data} />
}

function ExportView({ ids, overview }: { ids: string[]; overview: InsightsOverviewResponse }) {
  const today = kstToday()
  const [sets, setSets] = useState<Record<DatasetId, boolean>>({ ...DEFAULT_DATASETS })
  const [previewId, setPreviewId] = useState<DatasetId | null>(null)
  const [period, setPeriod] = useState<Period>('30')
  const [range, setRange] = useState({ from: addDaysIso(today, -29), to: today })
  const [rangeOpen, setRangeOpen] = useState(false)
  const [floors, setFloors] = useState<Set<string>>(new Set())
  const [classes, setClasses] = useState<Set<string>>(new Set())
  const [fmt, setFmt] = useState<FormatId>('csv')
  const [deliver, setDeliver] = useState<Deliver>('once')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [apiNote, setApiNote] = useState<string | null>(null)
  const apiRef = useRef<HTMLHeadingElement>(null)
  const uid = useId()

  const days = period === 'custom' ? Math.max(1, daysBetween(range.from, range.to)) : Number(period)
  const endDate = period === 'custom' ? range.to : today
  const fromDate = addDaysIso(endDate, -(days - 1))
  const countDays = period === 'custom' ? 90 : days
  const countOv = useInsight(`overview@${countDays}`, (c) => c.overview({ days: countDays }))
  const metas = useInsight(`lotmeta-export:${ids.join(',')}`, (c, d) => Promise.all(ids.map((id) => c.lot(id, { days: d, maxPaths: 1 }))))

  const lotRows = overview.lots
  const nameOf = (id: string) => lotRows.find((l) => l.id === id)?.shortName ?? id
  const sources = useMemo(() => metas.data?.map(toSource) ?? null, [metas.data])
  const counts = useMemo(() => {
    if (!countOv.data) return null
    return ids.map((id) => {
      const n = countOv.data!.lots.find((l) => l.id === id)?.records ?? 0
      return period === 'custom' ? Math.round((n * days) / 90) : n
    })
  }, [countOv.data, ids, period, days])

  const endHour = endDate === today ? kstHour() : undefined
  const sessions = useMemo<SessionRec[][] | null>(() => {
    if (!sources || !counts) return null
    return sources.map((src, i) => generateSessions(src, { count: counts[i], endDate, days, endHour }))
  }, [sources, counts, endDate, days, endHour])
  const set = useMemo<ExportSet | null>(() => {
    if (!sources || !sessions) return null
    return buildExport(sources.map((source, i) => ({ source, sessions: sessions[i] })), { floors, classes })
  }, [sources, sessions, floors, classes])

  // 층 칩: 고른 주차장들의 층 (지상 → 지하 순)
  const allFloors = useMemo(() => {
    const fs = new Set<string>()
    sources?.forEach((s) => s.lot.floors.forEach((f) => fs.add(f)))
    const rank = (f: string) => (/^(\d+)F$/i.test(f) ? -Number(f.slice(0, -1)) : /^B(\d+)$/i.test(f) ? Number(f.slice(1)) : 99)
    return [...fs].sort((a, b) => rank(a) - rank(b))
  }, [sources])

  const selIds = DATASETS.filter((d) => sets[d.id]).map((d) => d.id)
  const prevId = selIds.find((id) => id === previewId) ?? selIds[0] ?? null
  const prevDef = prevId ? DATASETS.find((d) => d.id === prevId)! : null
  const prevTable = set && prevId ? set.tables[prevId] : null
  const fd = FORMATS.find((f) => f.id === fmt)!
  const ready = selIds.length > 0
  const totalRows = set ? selIds.reduce((a, id) => a + set.tables[id].rowCount, 0) : 0
  const size = set ? estimateBytes(set, selIds, fmt) : 0

  const lotsLabel = ids.length === 1
    ? nameOf(ids[0])
    : ids.length === lotRows.length
      ? `${overview.region.name} ${ids.length}곳`
      : `${nameOf(ids[0])} 외 ${ids.length - 1}곳`
  const periodText = period === 'custom' ? `${kstMonthDay(fromDate)} ~ ${kstMonthDay(endDate)}` : `최근 ${days}일`
  const floorText = floors.size ? [...allFloors].filter((f) => floors.has(f)).join('·') : '전체 층'
  const classText = classes.size ? ` · ${CAR_CLASSES.filter((c) => classes.has(c)).join('·')}만` : ''
  const lotPart = ids.length === 1 ? ids[0] : ids.length === lotRows.length ? `${overview.region.id}-all` : `${ids.length}lots`
  const baseName = `parkinggack_${lotPart}_${fromDate}_${endDate}`

  const setLots = (next: string[]) => {
    const v = next.length === lotRows.length ? 'all' : next.join(',')
    navigate(href('/export', { lot: v }), { replace: true })
  }

  let cta = `${fd.label} 파일 만들기`
  let ctaKind: 'file' | 'api' | 'off' = 'file'
  if (fmt === 'api') {
    cta = 'API 주소 보기'
    ctaKind = 'api'
  }
  if (deliver === 'weekly') {
    cta = '매주 자동은 시연 화면에서 켜지 않아요'
    ctaKind = 'off'
  }
  if (!ready) {
    cta = '데이터를 골라 주세요'
    ctaKind = 'off'
  }
  if (busy) {
    cta = '파일 만드는 중…'
    ctaKind = 'off'
  }

  const download = async (ds: readonly DatasetId[], format: FileFormat, from: ExportSet, name: string) => {
    setBusy(true)
    setStatus(null)
    try {
      await new Promise((r) => setTimeout(r, 20)) // '만드는 중' 이 먼저 보이게
      const file = await makeExportFile(from, ds, format, name)
      saveFile(file)
      setStatus(`파일을 만들었어요 · ${file.name} · ${formatBytes(file.bytes.length)}${file.contents.length ? ` · 파일 ${file.contents.length}개를 ZIP으로 묶었어요` : ''}`)
    } catch {
      setStatus('파일을 만드는 중에 문제가 생겼어요. 다시 해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const onCta = () => {
    if (ctaKind === 'api') {
      apiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      apiRef.current?.focus({ preventScroll: true })
      return
    }
    if (ctaKind !== 'file' || !set) return
    void download(selIds, fmt as FileFormat, set, baseName)
  }

  // 내보낸 기록: 같은 조건(그 날까지 며칠 치)으로 다시 만든다 — 양은 그 파일에서 센다
  const history = useMemo(() => {
    if (!sources) return null
    const src = sources[0]
    const base = lotRows.find((l) => l.id === src.lot.id)?.records ?? 0
    return EXPORT_HISTORY.map((row) => {
      const end = row.at.slice(0, 10)
      const s = generateSessions(src, { count: Math.round((base * row.days) / overview.days), endDate: end, days: row.days, endHour: Number(row.at.slice(11, 13)) })
      const x = buildExport([{ source: src, sessions: s }])
      return { row, set: x, n: x.tables[row.dataset].rowCount, end, from: addDaysIso(end, -(row.days - 1)) }
    })
  }, [sources, lotRows, overview.days])

  const unitOf = (id: DatasetId) => DATASETS.find((d) => d.id === id)!.unit
  const amount = (id: DatasetId, n: number) => (id === 'traces' ? `${shortCount(n)} 점` : `${comma(n)}${unitOf(id)}`)
  const apiPath = prevId ?? 'sessions'

  useEffect(() => setStatus(null), [fmt, deliver, period])

  return (
    <div className="v2-page v2-page--export">
      <div className="v2-pagehead">
        <div className="v2-pagehead__text">
          <span className="v2-eyebrow">{lotsLabel} · 운영사 계정</span>
          <h1 className="v2-h1">데이터 내보내기</h1>
          <p className="v2-lede">필요한 기록만 골라 파일이나 API로 받아요. 개인을 알아볼 수 있는 값은 처음부터 모으지 않아요.</p>
        </div>
        <a className="v2-btn v2-btn--ghost v2-btn--sm" href={href(`/lots/${encodeURIComponent(ids[0])}`)}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
          주차장 상세로
        </a>
      </div>

      <div className="v2-export">
        <div className="v2-export__left">
          <Step n={1} title="무엇을 받을까요" id={`${uid}-s1`}>
            <div className="v2-sets">
              {DATASETS.map((d) => (
                <label key={d.id} className="v2-option" data-on={sets[d.id] || undefined}>
                  <input type="checkbox" checked={sets[d.id]} onChange={() => setSets((s) => ({ ...s, [d.id]: !s[d.id] }))} />
                  <span className="v2-option__text"><span className="v2-option__name">{d.name}</span><span className="v2-option__desc">{d.desc}</span></span>
                  <span className="v2-option__count">{set ? `${shortCount(set.tables[d.id].rowCount)}${d.unit}` : '…'}</span>
                </label>
              ))}
            </div>
          </Step>

          <Step n={2} title="범위" id={`${uid}-s2`}>
            <div className="v2-range">
              <div className="v2-range__row">
                <span className="v2-range__label">주차장</span>
                <div className="v2-range__chips">
                  {ids.map((id) => (
                    <span key={id} className="v2-pill">
                      <Check />{nameOf(id)}
                      {ids.length > 1 && (
                        <button type="button" className="v2-pill__x" aria-label={`${nameOf(id)} 빼기`} onClick={() => setLots(ids.filter((x) => x !== id))}>×</button>
                      )}
                    </span>
                  ))}
                  {ids.length < lotRows.length && (
                    <button type="button" className="v2-addlot" aria-expanded={addOpen} onClick={() => setAddOpen((o) => !o)}>주차장 더하기</button>
                  )}
                </div>
              </div>
              {addOpen && ids.length < lotRows.length && (
                <div role="group" aria-label="더할 주차장" className="v2-range__more">
                  {lotRows.filter((l) => !ids.includes(l.id)).map((l) => (
                    <button key={l.id} type="button" className="v2-chip v2-chip--add" onClick={() => setLots([...ids, l.id])}>+ {l.shortName}</button>
                  ))}
                  <button type="button" className="v2-chip v2-chip--add" onClick={() => setLots(lotRows.map((l) => l.id))}>모두 더하기</button>
                </div>
              )}
              <div className="v2-range__row">
                <span className="v2-range__label">기간</span>
                <div role="group" aria-label="기간" className="v2-seg v2-seg--sm">
                  {PERIODS.map((p) => (
                    <button key={p.id} type="button" className="v2-seg__btn" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</button>
                  ))}
                </div>
                <button type="button" className="v2-btn v2-btn--ghost v2-btn--date" aria-expanded={rangeOpen} aria-pressed={period === 'custom'} onClick={() => setRangeOpen((o) => !o)}>
                  {period === 'custom' ? dateRangeText(fromDate, endDate) : '날짜 직접 고르기'}
                </button>
              </div>
              {rangeOpen && (
                <div className="v2-range__dates">
                  <label>시작 <input type="date" value={range.from} min={addDaysIso(today, -89)} max={range.to} onChange={(e) => {
                    const v = e.target.value
                    if (v) { setRange((r) => ({ ...r, from: v > r.to ? r.to : v })); setPeriod('custom') }
                  }} /></label>
                  <label>끝 <input type="date" value={range.to} min={range.from} max={today} onChange={(e) => {
                    const v = e.target.value
                    if (v) { setRange((r) => ({ ...r, to: v < r.from ? r.from : v > today ? today : v })); setPeriod('custom') }
                  }} /></label>
                  <span className="v2-range__hint">최근 90일 안에서 골라요</span>
                </div>
              )}
              {allFloors.length > 0 && <ChipSet label="층" all={allFloors} value={floors} onChange={setFloors} />}
              <ChipSet label="차 크기" all={CAR_CLASSES} value={classes} onChange={setClasses} />
            </div>
          </Step>

          <Step n={3} title="형식" id={`${uid}-s3`}>
            <div className="v2-formats">
              {FORMATS.map((x) => (
                <label key={x.id} className="v2-option v2-option--fmt" data-on={x.id === fmt || undefined}>
                  <span className="v2-option__fmthead">
                    <input type="radio" name={`${uid}-fmt`} checked={x.id === fmt} onChange={() => setFmt(x.id)} />
                    <span className="v2-option__mono">{x.label}</span>
                  </span>
                  <span className="v2-option__desc">{x.desc}</span>
                </label>
              ))}
            </div>
          </Step>

          <Step n={4} title="받는 방법" id={`${uid}-s4`}>
            <div className="v2-delivers">
              {DELIVERS.map((d) => (
                <label key={d.id} className="v2-option" data-on={d.id === deliver || undefined}>
                  <input type="radio" name={`${uid}-deliver`} checked={d.id === deliver} onChange={() => setDeliver(d.id)} />
                  <span className="v2-option__text"><span className="v2-option__name">{d.title}</span><span className="v2-option__desc">{d.desc}</span></span>
                </label>
              ))}
            </div>
          </Step>
        </div>

        <section className="v2-darkbox v2-preview" aria-labelledby={`${uid}-prev`}>
          <div className="v2-preview__head">
            <div className="v2-preview__titles">
              <span className="v2-darkbox__eyebrow">미리보기 · 앞 몇 줄</span>
              <h2 id={`${uid}-prev`} className="v2-h2 v2-h2--plan">{prevDef ? prevDef.name : '미리볼 데이터가 없어요'}</h2>
            </div>
            <div role="group" aria-label="미리볼 데이터" className="v2-layers">
              {selIds.map((id) => (
                <button key={id} type="button" className="v2-layer v2-layer--sm" aria-pressed={id === prevId} onClick={() => setPreviewId(id)}>
                  {DATASETS.find((d) => d.id === id)!.name}
                </button>
              ))}
            </div>
          </div>

          {prevDef && prevTable && (
            <>
              <div className="v2-prevtable-wrap">
                <table className="v2-prevtable">
                  <caption className="visually-hidden">{prevDef.name} 앞 5줄</caption>
                  <thead><tr>{prevTable.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
                  <tbody>
                    {prevTable.head(5).map((row, r) => (
                      <tr key={r}>{row.map((v, i) => <td key={i}>{formatCell(v, prevTable.types[i])}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="v2-schema">
                <span className="v2-darkbox__eyebrow">열 설명</span>
                <dl>
                  {prevDef.schema.map(([k, d]) => <div key={k} className="v2-schema__row"><dt>{k}</dt><dd>{d}</dd></div>)}
                </dl>
              </div>
            </>
          )}
          {prevDef && !prevTable && <DLoading />}
          {!prevDef && <div className="v2-preview__empty">왼쪽에서 받을 데이터를 하나 이상 골라 주세요</div>}

          {fmt === 'geojson' && selIds.some((id) => id !== 'traces' && id !== 'events') && (
            <p className="v2-preview__note">GeoJSON에는 동선 좌표와 후진·급정지 이벤트만 담겨요. 나머지는 CSV로 함께 묶어 드려요.</p>
          )}
          {fmt === 'api' && (
            <p className="v2-preview__note">API는 시스템이 직접 가져가는 방법이라 파일을 만들지 않아요. 요청 모양은 아래 ‘시스템에서 바로 가져가기’에 있어요.</p>
          )}
          {deliver === 'weekly' && (
            <p className="v2-preview__note">매주 자동 내보내기는 시연 화면에서 켜지 않아요. ‘지금 한 번’을 고르면 같은 파일을 바로 받을 수 있어요.</p>
          )}

          <div className="v2-privacy">
            <span className="v2-privacy__title"><Lock />파일에 들어 있지 않은 것</span>
            <ul className="v2-privacy__list">
              <li>GPS 원본</li>
              <li>차량번호 · VIN</li>
              <li>주차장 밖 경로</li>
              <li>5대 미만 칸·시간대</li>
            </ul>
            <span className="v2-privacy__text">시각은 30분 단위로 묶고, 좌표는 입구를 (0, 0)으로 둔 상대 좌표(m)로만 나가요. session_id는 주차할 때마다 새로 만드는 번호라 같은 차를 이어 볼 수 없어요.</span>
          </div>

          <div className="v2-summary">
            <div className="v2-summary__text">
              <span className="v2-summary__label">받을 내용</span>
              <span className="v2-summary__value" aria-live="polite">
                {!ready ? '고른 데이터가 없어요' : set ? `${selIds.length}종 · ${shortCount(totalRows)}줄 · 약 ${formatBytes(size)}` : '…'}
              </span>
              <span className="v2-summary__sub">{fd.label} · {periodText} · {lotsLabel} · {floorText}{classText} · 시연용 예시</span>
            </div>
            <button type="button" className="v2-cta" disabled={ctaKind === 'off' || (ctaKind === 'file' && !set)} onClick={onCta}>
              {ctaKind !== 'api' && <DownloadIcon />}{cta}
            </button>
          </div>
          {status && <p className="v2-preview__status" role="status">{status}</p>}
        </section>
      </div>

      <div className="v2-export__bottom">
        <section className="v2-box v2-history" aria-labelledby={`${uid}-hist`}>
          <div className="v2-history__head">
            <h2 id={`${uid}-hist`} className="v2-h4">내보낸 기록</h2>
            <span className="v2-box__sub">파일은 7일 동안 보관돼요</span>
          </div>
          <div className="v2-scroll">
            <table className="v2-table">
              <thead>
                <tr>
                  <th scope="col">만든 때</th>
                  <th scope="col">누가</th>
                  <th scope="col">데이터</th>
                  <th scope="col" className="is-num">양</th>
                  <th scope="col">형식</th>
                  <th scope="col" className="is-num"><span className="visually-hidden">받기</span></th>
                </tr>
              </thead>
              <tbody>
                {EXPORT_HISTORY.map((row: ExportHistoryRow, i) => {
                  const h = history?.[i]
                  const ds = DATASETS.find((d) => d.id === row.dataset)!
                  return (
                    <tr key={row.at} className={row.expired ? 'is-expired' : undefined}>
                      <td className="is-nowrap">{kstMonthDayTime(row.at)}</td>
                      <td className="is-muted">{row.who}</td>
                      <td className="is-strong">{ds.name}</td>
                      <td className="is-num">{h ? amount(row.dataset, h.n) : '…'}</td>
                      <td className="is-mono">{FORMATS.find((f) => f.id === row.format)!.label}</td>
                      <td className="is-num">
                        {row.expired ? (
                          <span className="is-muted">보관 끝남</span>
                        ) : (
                          <button
                            type="button"
                            className="v2-btn v2-btn--line"
                            disabled={!h || busy}
                            aria-label={`${kstMonthDayTime(row.at)} ${ds.name} 받기`}
                            onClick={() => h && void download([row.dataset], row.format, h.set, `parkinggack_${ids[0]}_${h.from}_${h.end}`)}
                          >
                            받기
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="v2-box v2-api" aria-labelledby={`${uid}-api`}>
          <div className="v2-box__titles">
            <h2 id={`${uid}-api`} ref={apiRef} tabIndex={-1} className="v2-h4">시스템에서 바로 가져가기</h2>
            <p className="v2-box__sub">주차장 관제·주차 유도 시스템이 매일 새 기록을 받아 갈 수 있어요. 규칙은 파일과 같아요.</p>
          </div>
          <pre className="v2-api__pre">{`GET /v1/lots/${ids[0]}/${apiPath}\n    ?from=${fromDate}&to=${endDate}\nAuthorization: Bearer ${API_INFO.maskedKey}`}</pre>
          <dl className="v2-api__dl">
            <dt>한도</dt><dd>{API_INFO.limit}</dd>
            <dt>응답</dt><dd>{API_INFO.response}</dd>
            <dt>키</dt><dd>{API_INFO.keyCreated}</dd>
          </dl>
          <div className="v2-api__spacer" />
          <div className="v2-api__actions">
            <button type="button" className="v2-btn v2-btn--line v2-btn--md" onClick={() => setApiNote('시연 화면이라 새 키를 만들지 않아요. 위 키도 가려 둔 예시예요.')}>키 새로 만들기</button>
            <button type="button" className="v2-btn v2-btn--ghost v2-btn--md" onClick={() => setApiNote('시연 화면에는 API 문서를 싣지 않았어요. 요청 모양과 열 설명은 이 화면에 있는 그대로예요.')}>API 문서 보기</button>
          </div>
          {apiNote && <p className="v2-api__note" role="status">{apiNote}</p>}
        </section>
      </div>
    </div>
  )
}
