/** M-30 주차장 · M-31 주차장 상세 · 더 쉬운 곳 (C-03과 같은 /easier) */
import type { ParkingLot, ParkingLotDetail, ReasonTag } from '@api-types'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { api } from '../api'
import { errorText } from '../api/client'
import { DEFAULT_CENTER } from '../config'
import { COPY } from '../copy'
import { useAsync } from '../data'
import { congestionWord, difficultyLabel, formatCount, formatDuration, formatScore, shortLotName, walkLabel } from '../format'
import { findPlace } from '../places'
import { navigate } from '../router'
import { useSession } from '../ui/hooks'
import { Bars, BottomCTA, Button, Link, Status, TabBar, Title, TopBar } from '../ui/kit'

type Sort = 'easy' | 'near'
interface Center {
  label: string
  lat: number
  lng: number
  source: 'geo' | 'default' | 'search'
}

// 탭을 오가도 기준점·정렬은 그대로
let remembered: { center: Center; sort: Sort } | null = null

function locate(timeoutMs = 6000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    let done = false
    const finish = (v: { lat: number; lng: number } | null) => {
      if (!done) {
        done = true
        resolve(v)
      }
    }
    setTimeout(() => finish(null), timeoutMs + 500)
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => finish({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => finish(null),
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60_000 },
      )
    } catch {
      finish(null)
    }
  })
}

type Row = ParkingLot & { distanceM?: number }

export function sortLots(lots: Row[], sort: Sort): Row[] {
  const list = [...lots]
  if (sort === 'near') return list.sort((a, b) => (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9))
  return list.sort((a, b) => (a.difficulty ?? 99) - (b.difficulty ?? 99) || (a.distanceM ?? 1e9) - (b.distanceM ?? 1e9))
}

export function LotsScreen() {
  const s = useSession()
  const [center, setCenter] = useState<Center>(remembered?.center ?? { ...DEFAULT_CENTER, source: 'default' })
  const [sort, setSort] = useState<Sort>(remembered?.sort ?? 'easy')
  const [query, setQuery] = useState(center.source === 'geo' ? '' : center.label)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    remembered = { center, sort }
  }, [center, sort])

  // 처음 한 번: 위치를 쓸 수 있으면 내 주변, 아니면 판교역
  useEffect(() => {
    if (remembered && remembered.center.source !== 'default') return
    // 시연 데이터는 판교 주차장뿐 — 판교 밖에서 위치를 허용해도 목록이 비지 않게 판교역 기준 그대로
    if (s.demo) return
    let alive = true
    locate().then((pos) => {
      if (alive && pos) {
        setCenter({ label: '', ...pos, source: 'geo' })
        setQuery('')
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const lots = useAsync(() => api().lots({ lat: center.lat, lng: center.lng, radius: 1000, limit: 50 }), [center.lat, center.lng, s.demo])
  const rows = useMemo(() => sortLots(lots.data ?? [], sort), [lots.data, sort])

  const search = async (e: Event) => {
    e.preventDefault()
    const q = query.trim()
    setNotice('')
    ;(document.activeElement as HTMLElement | null)?.blur()
    if (!q) {
      const pos = await locate(4000)
      setCenter(pos ? { label: '', ...pos, source: 'geo' } : { ...DEFAULT_CENTER, source: 'default' })
      if (!pos) setQuery(DEFAULT_CENTER.label)
      return
    }
    const place = findPlace(q)
    if (place) {
      setCenter({ label: place.label, lat: place.lat, lng: place.lng, source: 'search' })
      setQuery(place.label)
      return
    }
    const local = (lots.data ?? []).find((l) => l.name.replace(/\s+/g, '').includes(q.replace(/\s+/g, '')))
    if (local) {
      setCenter({ label: q, ...local.location, source: 'search' })
      return
    }
    try {
      const m = await api().match(q, { lat: center.lat, lng: center.lng })
      if (m.lot) {
        setCenter({ label: q, ...m.lot.location, source: 'search' })
        return
      }
      setNotice(COPY.searchNotFound)
    } catch (err) {
      setNotice(errorText(err))
    }
  }

  return (
    <main class="screen tabscreen lots">
      <div class="tab-body">
        <h1 class="tab-title">{COPY.lotsTitle}</h1>
        <form class="search" role="search" onSubmit={search}>
          <label class="search-box">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink0">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
            <input
              type="search"
              aria-label={COPY.searchLabel}
              placeholder={COPY.searchPlaceholder}
              value={query}
              enterKeyHint="search"
              autoComplete="off"
              onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
        </form>
        <div role="group" aria-label={COPY.sortLabel} class="chips">
          {(
            [
              ['easy', COPY.sortEasy],
              ['near', COPY.sortNear],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" class={sort === k ? 'chip chip-on' : 'chip'} aria-pressed={sort === k ? 'true' : 'false'} onClick={() => setSort(k)}>
              {label}
            </button>
          ))}
        </div>
        {notice ? (
          <p class="notice" role="status">
            {notice}
          </p>
        ) : null}
        <div class="lot-list">
          {rows.map((l) => (
            <Link key={l.id} to={{ name: 'lot', id: l.id }} class="lot-row">
              <span class="lot-text">
                <span class="lot-name">{shortLotName(l.name)}</span>
                <span class="lot-sub">{[walkLabel(l.distanceM), l.difficulty == null ? COPY.sparse : ''].filter(Boolean).join(' · ')}</span>
              </span>
              <Bars score={l.difficulty} />
              <span class="lot-score">{formatScore(l.difficulty)}</span>
            </Link>
          ))}
        </div>
        {!lots.loading && !lots.error && lots.data && !rows.length ? <p class="notice">{COPY.lotsEmpty}</p> : null}
        <Status loading={lots.loading && !lots.data} error={lots.error && !lots.data ? errorText(lots.error) : null} onRetry={lots.reload} />
      </div>
      <TabBar active="lots" />
    </main>
  )
}

// ───────────── M-31 ─────────────

const TAG_ROW: Partial<Record<ReasonTag, [string, string]>> = {
  MANY_PILLARS: ['기둥', '많아요'],
  NARROW_AISLE: ['통로', '좁아요'],
  MECHANICAL: ['방식', '기계식이에요'],
  STEEP_SLOPE: ['경사', '가팔라요'],
  MANY_FLOORS: ['층', '많아요'],
  SPACIOUS: ['자리', '넉넉해요'],
  FLAT: ['바닥', '평면이에요'],
}

/** 근거 3줄: 평균 후진 · 램프 · (태그 하나 또는 평균 시간) */
export function lotStatRows(lot: ParkingLotDetail): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  const st = lot.stats
  if (st) rows.push([COPY.statReverse, `${formatCount(st.avgReverse)}번`])
  const flat = lot.floors.length <= 1 || lot.tags.includes('FLAT')
  if (st) rows.push([COPY.statRamp, st.avgRampTurns >= 0.3 ? `${formatCount(st.avgRampTurns)}바퀴 회전` : flat ? '평면이에요' : '거의 없어요'])
  const tag = lot.tags.find((t) => TAG_ROW[t] && !(t === 'FLAT' && rows.some((r) => r[1] === '평면이에요')))
  if (tag) rows.push(TAG_ROW[tag]!)
  else if (st) rows.push(['평균 시간', formatDuration(st.avgDurationSec)])
  return rows.slice(0, 3)
}

export function LotScreen({ id }: { id: string }) {
  const s = useSession()
  const res = useAsync(() => api().lot(id), [id, s.demo])
  const lot = res.data
  if (!lot) {
    return (
      <main class="screen detail">
        <div class="detail-body">
          <TopBar back={{ name: 'lots' }} />
          <Status loading={res.loading} error={res.error ? errorText(res.error) : null} onRetry={res.reload} />
        </div>
      </main>
    )
  }
  const sparse = lot.difficulty == null
  const statRows = lotStatRows(lot)
  const floors = lot.stats?.floorCongestion ?? []
  const showEasier = sparse || (lot.difficulty ?? 0) >= 2.5
  return (
    <main class="screen detail m31">
      <div class="detail-body">
        <TopBar back={{ name: 'lots' }} />
        <div class="lot-head">
          <h1 class="lot-title">{shortLotName(lot.name)}</h1>
          <div class="lot-score-line">
            <Bars score={lot.difficulty} big />
            {sparse ? null : <span class="score-big">{formatScore(lot.difficulty)}</span>}
            <span class="score-word">{difficultyLabel(lot.difficulty)}</span>
          </div>
        </div>
        {statRows.length ? (
          <section class="panel panel-rows">
            {statRows.map(([k, v]) => (
              <div key={k} class="stat-row">
                <span class="stat-key">{k}</span>
                <span class="stat-val">{v}</span>
              </div>
            ))}
          </section>
        ) : null}
        {sparse ? (
          <section class="panel">
            <span class="panel-label">{COPY.sparseBody}</span>
            {lot.publicInfo.map((line) => (
              <span key={line} class="panel-line">
                {line}
              </span>
            ))}
          </section>
        ) : null}
        {floors.length ? (
          <section class="panel" aria-label={`${lot.stats?.congestionLabel ?? ''} 층별 혼잡`}>
            <span class="panel-label">{lot.stats?.congestionLabel}</span>
            {floors.slice(0, 6).map((f) => (
              <div key={f.floor} class="floor-row">
                <span class="floor-name">{f.floor}</span>
                <span class="floor-track" aria-hidden="true">
                  <span class={f.occupancy >= 0.85 ? 'floor-fill full' : 'floor-fill'} style={{ width: `${Math.round(Math.max(0.04, Math.min(1, f.occupancy)) * 100)}%` }} />
                </span>
                <span class="floor-word">{congestionWord(f.occupancy)}</span>
              </div>
            ))}
          </section>
        ) : null}
      </div>
      {showEasier ? (
        <BottomCTA>
          <Button onClick={() => navigate({ name: 'lot-easier', id })}>{COPY.easierButton}</Button>
        </BottomCTA>
      ) : null}
    </main>
  )
}

// ───────────── 더 쉬운 곳 ─────────────

export function EasierScreen({ id }: { id: string }) {
  const s = useSession()
  const base = useAsync(() => api().lot(id), [id, s.demo])
  const res = useAsync(() => api().easier(id, { max: 3, radius: 800 }), [id, s.demo])
  const name = base.data ? shortLotName(base.data.name) : ''
  const list = res.data ?? []
  return (
    <main class="screen detail">
      <div class="detail-body">
        <TopBar back={{ name: 'lot', id }} />
        {res.data && !list.length ? (
          <Title text={COPY.easierNone} desc="가까운 다른 곳은 여기보다 까다로워요" />
        ) : (
          <Title text={name ? [`${name}보다`, '쉬운 곳이에요'] : ['더 쉬운 곳이에요']} desc="걸어서 가까운 곳만 골랐어요" />
        )}
        <div class="lot-list" style={{ marginTop: '20px' }}>
          {list.map((sg) => (
            <Link key={sg.lot.id} to={{ name: 'lot', id: sg.lot.id }} class="lot-row">
              <span class="lot-text">
                <span class="lot-name">{shortLotName(sg.lot.name)}</span>
                <span class="lot-sub">{sg.pitch}</span>
              </span>
              <Bars score={sg.lot.difficulty} />
              <span class="lot-score">{formatScore(sg.lot.difficulty)}</span>
            </Link>
          ))}
        </div>
        <Status loading={res.loading && !res.data} error={res.error ? errorText(res.error) : null} onRetry={res.reload} />
      </div>
    </main>
  )
}
