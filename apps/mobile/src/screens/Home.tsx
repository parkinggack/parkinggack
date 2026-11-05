/**
 * M-20 홈 — 맨 위는 늘 '지금 주차 중' 카드, 자주 가는 곳(난이도), 좋아진 것 한 줄.
 * 카드가 처음 보일 때(또는 새 주차) 그림 속 차가 실제로 주차한다 (carpath.ts HOME_PARK, 약 2.5초 — 30초 새로 고침에는 다시 안 함).
 */
import type { MyParking, ParkingLot } from '@api-types'
import { useEffect } from 'preact/hooks'
import { api } from '../api'
import { DEFAULT_CENTER } from '../config'
import { COPY } from '../copy'
import { currentStore, refreshCurrent, useAsync, useStore } from '../data'
import { formatAgo, formatScore, shortLotName, spotOf } from '../format'
import { homeTip } from '../insights'
import { HOME_PARK } from '../carpath'
import { loadLast } from '../storage'
import { CarDrive } from '../ui/CarDrive'
import { Bars, ChevronIcon, Link, Logo, TabBar } from '../ui/kit'
import { useNow, useSession } from '../ui/hooks'

const LINE = '#4a4944'

/** 카드 오른쪽 그림. carKey 가 있으면 차가 그 주차로 들어와 선다 (carKey 가 바뀔 때만 처음부터) */
function CardArt({ carKey }: { carKey?: string }) {
  return (
    <svg aria-hidden="true" class="card-art" viewBox="0 0 350 230">
      <path d="M236 0 V120 M300 0 V120 M364 0 V120 M236 0 H364" stroke={LINE} stroke-width="2" stroke-linecap="round" />
      {carKey ? <CarDrive script={HOME_PARK} w={34.5} playKey={carKey} /> : null}
    </svg>
  )
}

function ParkedCard({ label, floor, zone, line, to, carKey }: { label: string; floor: string; zone: string; line: string; to: string | { name: 'parking'; way: false }; carKey: string }) {
  const aria = [label, floor, zone, line].filter(Boolean).join(', ') + '. 위치 보기'
  return (
    <Link to={to} class="now-card" label={aria}>
      <CardArt carKey={carKey} />
      <span class="now-label">{label}</span>
      {floor ? <span class="now-floor">{floor}</span> : null}
      {zone ? <span class={floor ? 'now-zone' : 'now-floor'}>{zone}</span> : null}
      <span class="grow" />
      <span class="now-foot">
        <span>{line}</span>
        <ChevronIcon color="#ffffff" size={22} width={2.4} />
      </span>
    </Link>
  )
}

function MessageCard({ text, action }: { text: string; action?: { label: string; to: { name: 'connect' } } }) {
  const body = (
    <>
      <CardArt />
      <span class="now-msg">
        {text.split('\n').map((l, i) => (
          <>
            {i > 0 && <br />}
            {l}
          </>
        ))}
      </span>
      <span class="grow" />
      {action ? (
        <span class="now-foot now-foot-strong">
          <span>{action.label}</span>
          <ChevronIcon color="#ffffff" size={22} width={2.4} />
        </span>
      ) : null}
    </>
  )
  return action ? (
    <Link to={action.to} class="now-card">
      {body}
    </Link>
  ) : (
    <div class="now-card">{body}</div>
  )
}

function CurrentCard({ now }: { now: number }) {
  const s = useSession()
  const cur = useStore(currentStore)
  if (!s.token) {
    const last = loadLast()
    if (last && now - last.t < 2 * 86_400_000) {
      const [floor, zone] = last.title.split(' · ')
      return (
        <ParkedCard
          label={COPY.lastLink}
          floor={floor ?? ''}
          zone={zone ?? ''}
          line={[last.lot, formatAgo(last.t, now)].filter(Boolean).join(' · ')}
          to={last.href}
          carKey={`link:${last.href}:${last.t}`}
        />
      )
    }
    return <MessageCard text={COPY.homeUnpairedTitle} action={{ label: COPY.homeUnpairedAction, to: { name: 'connect' } }} />
  }
  const p = cur.parking
  if (p === undefined) {
    return (
      <div class="now-card" aria-busy="true">
        <CardArt />
        <span class="now-label">{COPY.nowParked}</span>
        <span class="grow" />
        <span class="now-foot">{cur.error ? COPY.offline : COPY.loading}</span>
      </div>
    )
  }
  if (!p) return <MessageCard text={COPY.homeNoParkingTitle} />
  const sp = spotOf({ f: p.floor ?? '', z: p.zone ?? '', n: p.number ?? '' })
  const t = Date.parse(p.parkedAt)
  return (
    <ParkedCard
      label={COPY.nowParked}
      floor={sp.floor || sp.zoneNumber}
      zone={sp.floor ? sp.zoneNumber : ''}
      line={`${shortLotName(p.lotName)} · ${formatAgo(t, now)}`}
      to={{ name: 'parking', way: false }}
      carKey={p.id}
    />
  )
}

interface FavRow {
  lot: ParkingLot
}

async function loadFavorites(paired: boolean): Promise<{ title: string; rows: FavRow[]; stats: Awaited<ReturnType<ReturnType<typeof api>['stats']>> | null }> {
  if (paired) {
    const stats = await api().stats()
    const lots = await Promise.all(stats.favorites.slice(0, 3).map((f) => api().lot(f.lotId).catch(() => null)))
    return { title: COPY.favorites, rows: lots.filter((l): l is NonNullable<typeof l> => !!l).map((lot) => ({ lot })), stats }
  }
  const lots = await api().lots({ lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng, radius: 1000, limit: 3 })
  return { title: COPY.nearby, rows: lots.slice(0, 3).map((lot) => ({ lot })), stats: null }
}

export function HomeScreen() {
  const s = useSession()
  const now = useNow()
  const cur = useStore(currentStore)
  const paired = !!s.token
  // 홈을 열 때마다 바로 확인 (30초 폴링을 기다리지 않게 — 연결 직후 차가 주차를 올린 경우 등)
  useEffect(() => {
    if (paired) void refreshCurrent()
  }, [paired])
  const favs = useAsync(() => loadFavorites(paired), [paired, s.demo])
  const tip = paired ? homeTip(favs.data?.stats ?? null, (cur.parking as MyParking | null | undefined) ?? null, now) : null
  return (
    <main class="screen tabscreen home" aria-label="홈">
      <div class="tab-body">
        <header class="home-top">
          <span class="brand">
            <Logo size={32} label={COPY.appName} />
          </span>
        </header>
        <CurrentCard now={now} />
        {favs.data?.rows.length ? (
          <section class="favs" aria-label={favs.data.title}>
            <span class="section-label">{favs.data.title}</span>
            {favs.data.rows.map(({ lot }) => (
              <Link key={lot.id} to={{ name: 'lot', id: lot.id }} class="fav-row">
                <span class="fav-name">{shortLotName(lot.name)}</span>
                <Bars score={lot.difficulty} />
                <span class="fav-score">{formatScore(lot.difficulty)}</span>
              </Link>
            ))}
          </section>
        ) : null}
        {tip ? (
          <Link to={tip.to} class="tip-row">
            <span class="grow">{tip.text}</span>
            <ChevronIcon />
          </Link>
        ) : null}
      </div>
      <TabBar active="home" />
    </main>
  )
}
