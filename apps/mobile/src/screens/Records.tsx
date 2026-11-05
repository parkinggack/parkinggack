/** M-32 기록 (좋아진 것만 말함) · M-33 주차 동선 (C-12와 같은 규칙: 실선 앞으로, 점선 후진, 번호 = 방향 바꾼 곳) */
import type { MyParking } from '@api-types'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { api } from '../api'
import { errorText } from '../api/client'
import { COPY } from '../copy'
import { useAsync } from '../data'
import { formatCount, monthLabel, shortLotName } from '../format'
import { monthBars, monthHeadline, recordRowSub, recordSubtitle, recordTitle } from '../insights'
import { buildReplay, trailAt, type ReplayScene } from '../replay'
import { useNow, prefersReducedMotion, useSession } from '../ui/hooks'
import { BottomCTA, Button, ChevronIcon, Link, Status, TabBar, Title, TopBar } from '../ui/kit'

// 목록에서 받은 기록을 기억 → M-33은 다시 받지 않고 바로 (계약에 기록 한 건 GET이 없어서 목록에서 찾음)
const known = new Map<string, MyParking>()

async function findParking(id: string): Promise<MyParking | null> {
  const hit = known.get(id)
  if (hit) return hit
  const cur = await api().currentParking().catch(() => null)
  if (cur) known.set(cur.id, cur)
  if (cur?.id === id) return cur
  let before: string | null = null
  for (let page = 0; page < 6; page++) {
    const res = await api().parkings({ limit: 50, before })
    res.parkings.forEach((p) => known.set(p.id, p))
    const found = res.parkings.find((p) => p.id === id)
    if (found) return found
    if (!res.nextBefore) break
    before = res.nextBefore
  }
  return null
}

function MonthChart({ monthly }: { monthly: Parameters<typeof monthBars>[0] }) {
  const bars = monthBars(monthly)
  if (!bars.length) return null
  const first = bars[0]
  const last = bars[bars.length - 1]
  const label =
    bars.length > 1 && last.value < first.value
      ? `월별 평균 후진 횟수: ${monthLabel(first.month)} ${formatCount(first.value)}번에서 ${monthLabel(last.month)} ${formatCount(last.value)}번으로 줄었어요`
      : `월별 평균 후진 횟수: ${bars.map((b) => `${monthLabel(b.month)} ${formatCount(b.value)}번`).join(', ')}`
  return (
    <svg role="img" aria-label={label} class="month-chart" viewBox="0 0 330 142">
      {bars.map((b, i) => {
        const x = 14 + i * 54
        const now = i === bars.length - 1
        return (
          <g key={b.month}>
            <rect x={x} y={112 - b.h} width="30" height={b.h} rx="6" class={now ? 'mbar mbar-now' : 'mbar'} />
            <text x={x + 15} y="136" text-anchor="middle" class={now ? 'svg-text mlabel mlabel-now' : 'svg-text mlabel'} font-size="13">
              {monthLabel(b.month)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function RecordsScreen() {
  const s = useSession()
  const now = useNow(60_000)
  const paired = !!s.token
  const stats = useAsync(() => (paired ? api().stats() : Promise.resolve(null)), [paired, s.demo])
  const [pages, setPages] = useState<MyParking[][]>([])
  const [next, setNext] = useState<string | null>(null)
  const first = useAsync(() => (paired ? api().parkings({ limit: 20 }) : Promise.resolve(null)), [paired, s.demo])
  useEffect(() => {
    if (first.data) {
      first.data.parkings.forEach((p) => known.set(p.id, p))
      setPages([first.data.parkings])
      setNext(first.data.nextBefore)
    }
  }, [first.data])
  const [moreBusy, setMoreBusy] = useState(false)
  const more = async () => {
    if (!next) return
    setMoreBusy(true)
    try {
      const res = await api().parkings({ limit: 20, before: next })
      res.parkings.forEach((p) => known.set(p.id, p))
      setPages((ps) => [...ps, res.parkings])
      setNext(res.nextBefore)
    } finally {
      setMoreBusy(false)
    }
  }
  const list = pages.flat()

  if (!paired) {
    return (
      <main class="screen tabscreen records">
        <div class="tab-body">
          <h1 class="tab-title">{COPY.recordsTitle}</h1>
          <Link to={{ name: 'connect' }} class="panel panel-link">
            <span class="panel-big">
              {COPY.recordsUnpaired.split('\n').map((l, i) => (
                <>
                  {i > 0 && <br />}
                  {l}
                </>
              ))}
            </span>
            <span class="panel-action">
              {COPY.homeUnpairedAction}
              <ChevronIcon />
            </span>
          </Link>
        </div>
        <TabBar active="records" />
      </main>
    )
  }

  const st = stats.data
  return (
    <main class="screen tabscreen records">
      <div class="tab-body">
        <h1 class="tab-title">{COPY.recordsTitle}</h1>
        {st ? (
          <section class="panel month">
            <span class="panel-label">{COPY.thisMonth}</span>
            <span class="month-head">
              {monthHeadline(st).map((l, i) => (
                <>
                  {i > 0 && <br />}
                  {l}
                </>
              ))}
            </span>
            <MonthChart monthly={st.monthly} />
          </section>
        ) : null}
        {list.length ? (
          <div class="rec-list">
            {list.map((p) => (
              <Link key={p.id} to={{ name: 'record', id: p.id }} class="rec-row">
                <span class="lot-text">
                  <span class="lot-name">{shortLotName(p.lotName)}</span>
                  <span class="lot-sub">{recordRowSub(p, now)}</span>
                </span>
                <ChevronIcon />
              </Link>
            ))}
          </div>
        ) : first.data ? (
          <p class="notice notice-big">
            {COPY.recordsEmpty.split('\n').map((l, i) => (
              <>
                {i > 0 && <br />}
                {l}
              </>
            ))}
          </p>
        ) : null}
        {next ? (
          <Button variant="text" onClick={more} busy={moreBusy}>
            {COPY.more}
          </Button>
        ) : null}
        <Status
          loading={(first.loading && !first.data) || (stats.loading && !stats.data)}
          error={first.error && !first.data ? errorText(first.error) : null}
          onRetry={() => {
            first.reload()
            stats.reload()
          }}
        />
      </div>
      <TabBar active="records" />
    </main>
  )
}

// ───────────── M-33 ─────────────

function ReplayFigure({ scene, progress, label }: { scene: ReplayScene; progress: number; label: string }) {
  const trail = trailAt(scene, progress)
  const ink = scene.approximate ? '#8a8780' : '#f4f3ef'
  const { w, l } = scene.car
  const head = progress >= 1 ? scene.points[scene.points.length - 1] : trail.head
  const arrow = scene.arrow
  return (
    <svg role="img" aria-label={label} class="replay-svg" viewBox={`0 0 ${scene.width} ${scene.height}`}>
      <rect x="0" y={scene.aisle.top} width={scene.width} height={Math.max(0, scene.aisle.bottom - scene.aisle.top)} fill="#262625" />
      {scene.shape === 'PERPENDICULAR' ? <path d={`M0 ${scene.aisle.mid} H${scene.width}`} stroke="#4a4944" stroke-width="2" stroke-dasharray="14 14" /> : null}
      {scene.sidewalk ? <rect x="0" y={scene.sidewalk.y} width={scene.width} height={scene.sidewalk.h} fill="#2a2a28" /> : null}
      {scene.backLines.map((b, i) => (
        <path key={`b${i}`} d={`M${b.x1} ${b.y1} L${b.x2} ${b.y2}`} stroke="#8a8780" stroke-width="2" stroke-dasharray={b.dashed ? '8 8' : undefined} />
      ))}
      {scene.stallLines.map((s, i) => (
        <path key={`s${i}`} d={`M${s.x1} ${s.y1} L${s.x2} ${s.y2}`} stroke="#6b6964" stroke-width="2" stroke-dasharray={s.dashed ? '8 8' : undefined} />
      ))}
      {trail.runs.map((r, i) => (
        <path key={`r${i}`} d={r.d} fill="none" stroke={ink} stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray={r.reverse ? '10 12' : undefined} />
      ))}
      {arrow ? (
        <path
          d={`M${arrow.tip.x - arrow.dir.x * 18 - arrow.dir.y * 12} ${arrow.tip.y - arrow.dir.y * 18 + arrow.dir.x * 12} L${arrow.tip.x} ${arrow.tip.y} L${arrow.tip.x - arrow.dir.x * 18 + arrow.dir.y * 12} ${arrow.tip.y - arrow.dir.y * 18 - arrow.dir.x * 12}`}
          fill="none"
          stroke={ink}
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      ) : null}
      <g transform={`translate(${head.x} ${head.y}) rotate(${Math.round(head.rot * 10) / 10})`}>
        <rect x={-w / 2} y={-l / 2} width={w} height={l} rx={w * 0.214} fill={scene.approximate ? '#b5b3ad' : '#f4f3ef'} />
        {scene.approximate ? null : (
          <>
            <rect x={-w * 0.357} y={-l / 2 + l * 0.15} width={w * 0.714} height={l * 0.164} rx={w * 0.09} fill="#2a2a28" fill-opacity="0.85" />
            <rect x={-w * 0.321} y={l / 2 - l * 0.164} width={w * 0.643} height={l * 0.096} rx={w * 0.07} fill="#2a2a28" fill-opacity="0.5" />
          </>
        )}
      </g>
      {scene.switches
        .filter((sw) => sw.at <= progress + 1e-6)
        .map((sw) => (
          <g key={sw.index}>
            <circle cx={sw.x} cy={sw.y} r="18" fill="#2a2a28" stroke={ink} stroke-width="3" />
            <text x={sw.x} y={sw.y + 6} text-anchor="middle" class="svg-text" font-size="18" font-weight="700" fill={ink}>
              {sw.index}
            </text>
          </g>
        ))}
    </svg>
  )
}

export function RecordScreen({ id }: { id: string }) {
  const s = useSession()
  const res = useAsync(() => findParking(id), [id, s.demo])
  const p = res.data
  const scene = useMemo(() => (p?.path?.length ? buildReplay(p.path, p.summary?.shape ?? 'UNKNOWN', !!p.summary?.approximate) : null), [p])
  const [progress, setProgress] = useState(1)
  const raf = useRef(0)
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const replay = () => {
    cancelAnimationFrame(raf.current)
    if (prefersReducedMotion()) {
      setProgress(1)
      return
    }
    const dur = 4200
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur)
      setProgress(k)
      if (k < 1) raf.current = requestAnimationFrame(step)
    }
    setProgress(0)
    raf.current = requestAnimationFrame(step)
  }

  if (!p) {
    return (
      <main class="screen detail">
        <div class="detail-body">
          <TopBar back={{ name: 'records' }} />
          {res.data === null ? <Title text={['이 기록은', '지금 볼 수 없어요']} /> : <Status loading={res.loading} error={res.error ? errorText(res.error) : null} onRetry={res.reload} />}
        </div>
      </main>
    )
  }
  const n = p.summary?.reverseCount ?? 0
  const label = n
    ? `통로로 들어와 ${n}번 후진해서 칸에 주차한 동선 그림. 실선은 앞으로, 점선은 후진, 번호는 방향을 바꾼 곳이에요`
    : '통로로 들어와 후진 없이 칸에 주차한 동선 그림'
  return (
    <main class="screen detail m33">
      <div class="detail-body">
        <TopBar back={{ name: 'records' }} />
        <Title text={recordTitle(p)} desc={recordSubtitle(p)} />
        <div class="replay-box">{scene ? <ReplayFigure scene={scene} progress={progress} label={label} /> : <p class="replay-empty">{COPY.noPath}</p>}</div>
        {scene ? (
          <div class="legend">
            <span class="legend-item">
              <svg aria-hidden="true" width="28" height="8" viewBox="0 0 28 8">
                <path d="M2 4 H26" class="legend-line" stroke-width="4" stroke-linecap="round" />
              </svg>
              {COPY.forward}
            </span>
            <span class="legend-item">
              <svg aria-hidden="true" width="28" height="8" viewBox="0 0 28 8">
                <path d="M2 4 H26" class="legend-line" stroke-width="4" stroke-linecap="round" stroke-dasharray="5 5" />
              </svg>
              {COPY.reverse}
            </span>
          </div>
        ) : null}
        {scene ? <p class="caption">{scene.approximate ? `${COPY.redrawn} · ${COPY.approximate}` : COPY.redrawn}</p> : null}
      </div>
      {scene ? (
        <BottomCTA>
          <Button onClick={replay}>{COPY.replay}</Button>
        </BottomCTA>
      ) : null}
    </main>
  )
}
