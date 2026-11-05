/**
 * M-01 내 주차 위치 · M-02 돌아가는 길.
 * 같은 화면을 세 곳에서 연다: /parking (연결된 차의 '지금 주차 중'), /p/:id#payload (C-07 링크, 서버 없이), /s/:code (짧은 링크).
 * 링크로 연 사람은 연결 없이 바로 보고, 위쪽 '앱에서 내 차와 연결할게요'로 앱을 시작할 수 있다.
 */
import { useEffect, useMemo, useState } from 'preact/hooks'
import { api } from '../api'
import { ApiError, errorText } from '../api/client'
import { COPY } from '../copy'
import { clearCurrent, currentStore, refreshCurrent, showToast, useAsync, useStore } from '../data'
import { formatAgo } from '../format'
import { decodePayload, fragmentFromLocation, validate } from '../payload'
import { navigate, type Route } from '../router'
import { bigLines, fromMyParking, fromPayload, spotLabel, waySteps, wayTitle, type SpotView } from '../spot'
import { loadLast, saveLast } from '../storage'
import { BottomCTA, Button, CarTop, Link, Title, TopBar, useFitText } from '../ui/kit'
import { useNow, useSession } from '../ui/hooks'
import { layoutWay, startKindOf, type StartKind } from '../wayfigure'

const CORNER_D = 'M26 92 V26 H92 M258 26 H324 V92 M26 348 V414 H92 M258 414 H324 V348'

interface Props {
  spot: SpotView
  /** 돌아가는 길 화면 경로 */
  wayRoute: Route
  onFound: () => Promise<void> | void
}

function SpotView({ spot, wayRoute, onFound }: Props) {
  const now = useNow()
  const s = useSession()
  const [busy, setBusy] = useState(false)
  const lines = bigLines(spot)
  const ref = useFitText([lines.top, lines.bottom])
  const meta = [formatAgo(spot.parkedAtMs, now), spot.note].filter(Boolean).join(' · ')
  const found = async () => {
    setBusy(true)
    try {
      await onFound()
    } finally {
      setBusy(false)
    }
  }
  return (
    <main class="screen detail m01" ref={ref as never}>
      <div class="detail-body">
        <TopBar
          back={{ name: 'home' }}
          right={
            spot.source === 'link' && !s.token ? (
              <Link to={{ name: 'connect' }} class="top-link">
                {COPY.connectFromLink}
              </Link>
            ) : null
          }
        />
        <section class="spot-card" aria-label={[lines.top && `${lines.top} 층`, lines.bottom].filter(Boolean).join(', ') || spotLabel(spot)}>
          <svg aria-hidden="true" class="spot-corners" viewBox="0 0 350 440" preserveAspectRatio="none">
            <path d={CORNER_D} fill="none" stroke="#4a4944" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          </svg>
          {lines.top ? (
            <span class="spot-floor" data-fit aria-hidden="true">
              {lines.top}
            </span>
          ) : (
            <span class="spot-none">{spotLabel(spot)}</span>
          )}
          {lines.bottom ? (
            <span class="spot-zone" data-fit aria-hidden="true">
              {lines.bottom}
            </span>
          ) : null}
        </section>
        <div class="spot-info">
          <span class="spot-lot">{spot.lotName}</span>
          <span class="spot-meta">{meta}</span>
        </div>
      </div>
      <BottomCTA>
        <Button onClick={() => navigate(wayRoute)}>{COPY.wayButton}</Button>
        <Button variant="text" onClick={found} busy={busy}>
          {COPY.foundCar}
        </Button>
      </BottomCTA>
    </main>
  )
}

function StartIcon({ x, y, kind }: { x: number; y: number; kind: StartKind }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="40" height="44" rx="10" fill="#ffffff" />
      {kind === 'elevator' ? (
        <path d="M12 17 l8 -8 8 8 M12 27 l8 8 8 -8" fill="none" stroke="#1e1e1e" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      ) : kind === 'stairs' ? (
        <path d="M10 32 h7 v-7 h7 v-7 h7 v-7" fill="none" stroke="#1e1e1e" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      ) : (
        <text x="20" y="27" text-anchor="middle" class="svg-text" font-size="13" font-weight="700" fill="#1e1e1e">
          {kind === 'ramp' ? '램프' : '입구'}
        </text>
      )}
    </g>
  )
}

function WayView({ spot, onFound, back }: { spot: SpotView; onFound: Props['onFound']; back: Route }) {
  const [busy, setBusy] = useState(false)
  const title = wayTitle(spot)
  const { steps, fromCar } = waySteps(spot)
  const fig = useMemo(() => (spot.route && spot.hints.length ? layoutWay(spot.route, startKindOf(spot.route, spot.hints, spot.note)) : null), [spot])
  const found = async () => {
    setBusy(true)
    try {
      await onFound()
    } finally {
      setBusy(false)
    }
  }
  return (
    <main class="screen detail m02">
      <div class="detail-body">
        <TopBar back={back} />
        <Title text={title} />
        {fig ? (
          <svg role="img" aria-label={COPY.figureLabel} class="illus way-fig" viewBox={`0 0 ${fig.width} ${fig.height}`}>
            <rect width={fig.width} height={fig.height} class="illus-bg" />
            {fig.rows.map((l, i) => (
              <path key={i} d={`M${l.x1} ${l.y1} L${l.x2} ${l.y2}`} stroke="#4a4944" stroke-width="2" stroke-linecap="round" />
            ))}
            {fig.car ? <CarTop x={fig.car.x} y={fig.car.y} w={30} rot={fig.car.rot} /> : null}
            <StartIcon x={fig.start.x} y={fig.start.y} kind={fig.start.kind} />
            <path d={fig.path} fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 11" />
          </svg>
        ) : null}
        {steps.length ? (
          <ol class="steps">
            {steps.map((line, i) => (
              <li key={i} class={i === steps.length - 1 ? 'step step-last' : 'step'}>
                <span class="step-no" aria-hidden="true">
                  {i + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>
        ) : null}
        <p class="disclaimer">{fromCar ? COPY.disclaimer : COPY.noHints}</p>
      </div>
      <BottomCTA>
        <Button onClick={found} busy={busy}>
          {COPY.foundCar}
        </Button>
      </BottomCTA>
    </main>
  )
}

/** 화면 가운데 한 문장 + 버튼 (없음·오류) */
export function MessageScreen({ title, body, action, secondary }: { title: string; body?: string; action?: { label: string; run: () => void }; secondary?: { label: string; run: () => void } }) {
  return (
    <main class="screen detail">
      <div class="detail-body">
        <TopBar back={{ name: 'home' }} />
        <Title text={title} desc={body} />
      </div>
      {action || secondary ? (
        <BottomCTA>
          {action ? <Button onClick={action.run}>{action.label}</Button> : null}
          {secondary ? (
            <Button variant="text" onClick={secondary.run}>
              {secondary.label}
            </Button>
          ) : null}
        </BottomCTA>
      ) : null}
    </main>
  )
}

// ───────────── /parking — 연결된 차의 지금 주차 ─────────────

export function CurrentParkingScreen({ way }: { way: boolean }) {
  const cur = useStore(currentStore)
  useEffect(() => {
    if (cur.parking === undefined) void refreshCurrent()
  }, [])
  const p = cur.parking
  if (p === undefined) return <MessageScreen title={cur.error ? COPY.offline : COPY.loadingSpot} action={cur.error ? { label: COPY.retry, run: () => void refreshCurrent() } : undefined} />
  if (!p) return <MessageScreen title={COPY.noCurrentTitle} body={COPY.noCurrentDesc} action={{ label: COPY.goHome, run: () => navigate({ name: 'home' }, { replace: true }) }} />
  const spot = fromMyParking(p)
  const onFound = async () => {
    try {
      await api().found(p.id)
    } catch (e) {
      // 오프라인이어도 이 폰에서는 찾은 것으로 — 다음에 열 때 서버가 아직 주차 중이면 다시 보인다
      if (!(e instanceof ApiError && e.offline)) {
        showToast(errorText(e))
        return
      }
    }
    clearCurrent()
    showToast(COPY.foundToast)
    navigate({ name: 'home' }, { replace: true })
  }
  return way ? <WayView spot={spot} onFound={onFound} back={{ name: 'parking', way: false }} /> : <SpotView spot={spot} wayRoute={{ name: 'parking', way: true }} onFound={onFound} />
}

// ───────────── /p/:id#payload · /s/:code — 링크로 받은 주차 ─────────────

function linkFound(onboarded: boolean) {
  saveLast(null)
  navigate(onboarded ? { name: 'home' } : { name: 'start' }, { replace: true })
}

function rememberLink(spot: SpotView) {
  saveLast({ href: location.pathname.replace(/\/way$/, '') + location.hash, title: spotLabel(spot), lot: spot.lotName, t: spot.parkedAtMs })
}

export function LinkParkingScreen({ id, way }: { id: string; way: boolean }) {
  const s = useSession()
  const result = useMemo(() => decodePayload(fragmentFromLocation(location)), [location.hash, location.pathname])
  const spot = result.ok ? fromPayload(result.parking, id) : null
  useEffect(() => {
    if (spot) rememberLink(spot)
  }, [spot?.key, spot?.parkedAtMs])
  if (!result.ok) {
    const last = loadLast()
    const here = location.pathname + location.hash
    return (
      <MessageScreen
        title={result.reason === 'invalid' ? COPY.invalidTitle : COPY.emptyTitle}
        body={result.reason === 'invalid' ? COPY.invalidBody : COPY.emptyBody}
        action={last && last.href !== here ? { label: COPY.lastLink, run: () => navigate(last.href) } : undefined}
        secondary={{ label: COPY.goHome, run: () => navigate({ name: 'home' }, { replace: true }) }}
      />
    )
  }
  const onFound = () => linkFound(s.onboarded)
  return way ? <WayView spot={spot!} onFound={onFound} back={{ name: 'link', id, way: false }} /> : <SpotView spot={spot!} wayRoute={{ name: 'link', id, way: true }} onFound={onFound} />
}

export function ShortLinkScreen({ code, way }: { code: string; way: boolean }) {
  const s = useSession()
  const res = useAsync(() => api().share(code), [code, s.demo])
  const payload = res.data ? validate(res.data.payload) : null
  const spot = payload ? fromPayload(payload, code) : null
  useEffect(() => {
    if (spot) rememberLink(spot)
  }, [spot?.key, spot?.parkedAtMs])
  if (res.loading && !res.data) return <MessageScreen title={COPY.loadingSpot} />
  if (res.error || !spot) {
    const e = res.error
    if (e?.code === 'gone') return <MessageScreen title={COPY.goneTitle} body={COPY.goneBody} secondary={{ label: COPY.goHome, run: () => navigate({ name: 'home' }, { replace: true }) }} />
    if (e?.offline)
      return <MessageScreen title={COPY.offline} action={{ label: COPY.retry, run: res.reload }} secondary={{ label: COPY.goHome, run: () => navigate({ name: 'home' }, { replace: true }) }} />
    return <MessageScreen title={COPY.invalidTitle} body={COPY.invalidBody} secondary={{ label: COPY.goHome, run: () => navigate({ name: 'home' }, { replace: true }) }} />
  }
  const onFound = () => linkFound(s.onboarded)
  return way ? <WayView spot={spot} onFound={onFound} back={{ name: 'short', code, way: false }} /> : <SpotView spot={spot} wayRoute={{ name: 'short', code, way: true }} onFound={onFound} />
}
