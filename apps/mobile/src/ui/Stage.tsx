/**
 * 화면 무대 — 주소가 바뀌면 떠나는 화면과 들어오는 화면을 겹쳐 놓고 스프링으로 움직인다 (방향: ui/transition.ts).
 *
 * - 떠나는 화면은 그 순간의 DOM 사본(cloneNode)으로 남긴다: 실제 화면은 바로 내려서(카메라·타이머 정리) 상태가 바뀌어도
 *   나가는 동안 모습이 변하지 않는다. 사본은 aria-hidden + inert + pointer-events 없음, id 는 지움(중복 방지).
 * - 움직이는 동안만 무대가 화면에 고정(position: fixed)되고 두 겹이 absolute 로 겹친다 → 각 화면의 아래 버튼·탭바(fixed)가
 *   자기 겹을 따라 움직인다. 평소에는 겹에 transform 이 없어서 문서 스크롤·fixed 가 그대로.
 * - 스크롤: 떠나는 화면은 그 스크롤 그대로(top: −y), 들어오는 화면은 앞으로면 맨 위, 뒤로면 떠날 때 자리(router.ts 가 기억).
 *   끝나면 고정을 풀고 window.scrollTo 로 같은 자리에 → 튀지 않음.
 * - transform·opacity 만 (Web Animations, 합성 스레드). 'animate'가 없거나(jsdom) '동작 줄이기'면 바로 바뀜.
 * - 바뀐 뒤 새 화면 제목(h1, 없으면 main)으로 초점 — 화면이 스스로 초점을 잡았으면(코드 입력 칸) 두고, 제목은 읽어 준다.
 */
import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { lastNavigation, setScrollSource, type NavKind, type Route } from '../router'
import { prefersReducedMotion } from './hooks'
import { easingFor } from './spring'
import { motionFor, transitionFor, type Motion, type Track, type TransitionKind } from './transition'

interface Snapshot {
  node: HTMLElement
  scroll: number
  from: Route
  nav: NavKind
}

let stageEl: HTMLElement | null = null
let liveEl: HTMLElement | null = null
let displayed: { route: Route; key: string } | null = null
let pending: Snapshot | null = null
let running: { kind: TransitionKind; done: () => void } | null = null
/** 움직이는 동안의 '실제' 스크롤 (window.scrollY 는 0) */
let override: number | null = null

const scrollNow = () => override ?? (window.scrollY || 0)

/** 지금 움직이는 중인 전환 (테스트·스크린숏용) */
export function runningTransition(): TransitionKind | null {
  return running?.kind ?? null
}

/** 움직이는 중이면 바로 끝낸다 (그 사이 또 이동했을 때) */
export function finishRunning() {
  running?.done()
}

/**
 * 주소가 바뀐 순간(그리기 전에) App 이 부른다: 지금 보이는 화면을 사본으로 떠 둔다.
 * 한 번 그리기 전에 두 번 바뀌면(이동 → 바로 바꿔 놓기) 처음 사본을 쓴다. 뒤로가 섞이면 뒤로.
 */
export function captureLeaving() {
  const kind = lastNavigation().kind
  if (pending) {
    if (kind === 'pop') pending.nav = 'pop'
    return
  }
  if (!liveEl || !displayed) return
  const scroll = scrollNow()
  finishRunning()
  const inner = liveEl.firstElementChild as HTMLElement | null
  if (!inner) return
  const node = inner.cloneNode(true) as HTMLElement
  node.querySelectorAll('[id]').forEach((el) => {
    if (!(el instanceof SVGElement)) el.removeAttribute('id')
  })
  node.querySelectorAll('[autofocus]').forEach((el) => el.removeAttribute('autofocus'))
  pending = { node, scroll, from: displayed.route, nav: kind }
}

function play(el: Element, tracks: Track[]): Animation[] {
  return tracks.map((t) => {
    const e = t.spring ? easingFor(t.spring) : { easing: 'cubic-bezier(0.2, 0, 0, 1)', duration: t.ms ?? 240 }
    return (el as HTMLElement).animate(t.keyframes, { duration: e.duration, easing: e.easing, fill: 'both' })
  })
}

/** tab·fade 때 살짝 올라오는 것: 화면 내용만 (탭바·아래 버튼은 제자리 — 겹을 안 움직여서 화면 아래에 붙어 있음) */
function contentTargets(inner: HTMLElement): Element[] {
  const main = inner.querySelector(':scope > main') ?? inner.firstElementChild
  if (!main) return []
  const fixed = '.tabbar, .cta, .sheet-wrap'
  return [...main.children].filter((c) => !c.matches(fixed) && !c.querySelector(fixed))
}

let restoreStop: (() => void) | null = null

/** 그 자리까지 스크롤. 내용이 아직 덜 그려져(불러오는 중) 못 가면 내용이 늘어날 때 잠깐 더 시도 */
function restoreScroll(y: number) {
  restoreStop?.()
  window.scrollTo(0, y)
  if (y <= 0 || (window.scrollY || 0) >= y - 1 || typeof ResizeObserver !== 'function') return
  const ro = new ResizeObserver(() => {
    window.scrollTo(0, y)
    if ((window.scrollY || 0) >= y - 1) stop()
  })
  const cancel = () => stop()
  const timer = setTimeout(cancel, 1500)
  function stop() {
    ro.disconnect()
    clearTimeout(timer)
    window.removeEventListener('touchstart', cancel)
    window.removeEventListener('wheel', cancel)
    window.removeEventListener('keydown', cancel)
    restoreStop = null
  }
  ro.observe(document.body)
  window.addEventListener('touchstart', cancel, { passive: true })
  window.addEventListener('wheel', cancel, { passive: true })
  window.addEventListener('keydown', cancel)
  restoreStop = stop
}

let announcer: HTMLElement | null = null
function announce(text: string) {
  if (!text) return
  if (!announcer || !announcer.isConnected) {
    announcer = document.createElement('p')
    announcer.className = 'visually-hidden'
    announcer.setAttribute('aria-live', 'polite')
    announcer.setAttribute('data-route-announcer', '')
    document.body.appendChild(announcer)
  }
  const el = announcer
  el.textContent = ''
  setTimeout(() => (el.textContent = text), 60)
}

function focusScreen(layer: HTMLElement) {
  if (lastNavigation().kind === 'initial') return
  const title = layer.querySelector('main h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  const active = document.activeElement
  if (active && active !== document.body && layer.contains(active)) {
    announce(title)
    return
  }
  const target = layer.querySelector<HTMLElement>('main h1') ?? layer.querySelector<HTMLElement>('main')
  if (!target) return
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  try {
    target.focus({ preventScroll: true })
  } catch {
    target.focus()
  }
}

function start(kind: TransitionKind, m: Motion, snap: Snapshot, restore: number) {
  const st = stageEl!
  const lv = liveEl!
  const inner = lv.firstElementChild as HTMLElement
  const exit = document.createElement('div')
  exit.className = 'layer layer-exit'
  exit.setAttribute('aria-hidden', 'true')
  exit.setAttribute('inert', '')
  const exitInner = document.createElement('div')
  exitInner.className = 'layer-inner'
  exitInner.appendChild(snap.node)
  exit.appendChild(exitInner)
  st.appendChild(exit)
  st.classList.add('stage-run')
  st.setAttribute('data-transition', kind)

  // 들어오는 화면이 아직 짧으면(불러오는 중) 그 안에서만
  const liveTop = Math.min(restore, Math.max(0, inner.scrollHeight - window.innerHeight))
  exitInner.style.top = `${-snap.scroll}px`
  inner.style.top = `${-liveTop}px`
  override = liveTop
  lv.style.zIndex = String(m.enter.z)
  exit.style.zIndex = String(m.exit.z)

  const anims = [...play(lv, m.enter.tracks), ...play(exit, m.exit.tracks)]
  if (m.enter.content) for (const el of contentTargets(inner)) anims.push(...play(el, m.enter.content))

  let finished = false
  let guard: ReturnType<typeof setTimeout> | undefined
  const done = () => {
    if (finished) return
    finished = true
    clearTimeout(guard)
    anims.forEach((a) => {
      try {
        a.cancel()
      } catch {
        /* 이미 끝남 */
      }
    })
    exit.remove()
    st.classList.remove('stage-run')
    st.removeAttribute('data-transition')
    lv.style.zIndex = ''
    inner.style.top = ''
    override = null
    running = null
    restoreScroll(restore)
    // 들어온 화면이 데이터를 받아 다시 그려지며 초점 둔 제목이 바뀌었으면 다시
    if (!document.activeElement || document.activeElement === document.body) focusScreen(lv)
  }
  running = { kind, done }
  if (!anims.length) return done()
  Promise.all(anims.map((a) => a.finished)).then(done, () => {
    /* 중간에 끝냄 (finishRunning) */
  })
  // 움직이던 요소가 다시 그려져 문서에서 빠지는 등 finished 가 안 와도 무대가 고정된 채 남지 않게.
  // 누가 일부러 멈춰 둔 동안(개발자 도구 애니메이션 패널, 스크린숏 도구)은 기다린다
  const longest = Math.max(...anims.map((a) => Number(a.effect?.getTiming().duration) || 0))
  const arm = () => {
    guard = setTimeout(() => (anims.some((a) => a.playState === 'paused') ? arm() : done()), longest + 250)
  }
  arm()
}

export function Stage({ route, routeKey, children }: { route: Route; routeKey: string; children: ComponentChildren }) {
  const stage = useRef<HTMLDivElement>(null)
  const live = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    stageEl = stage.current
    liveEl = live.current
    setScrollSource(scrollNow)
    return () => {
      finishRunning()
      stageEl = null
      liveEl = null
      displayed = null
      pending = null
      setScrollSource(null)
    }
  }, [])

  useLayoutEffect(() => {
    const prev = displayed
    displayed = { route, key: routeKey }
    const snap = pending
    pending = null
    if (!prev || prev.key === routeKey) return
    const nav = lastNavigation()
    const kind = snap ? transitionFor(snap.from, route, snap.nav, { reducedMotion: prefersReducedMotion() }) : 'none'
    const m = motionFor(kind)
    const layer = live.current!
    if (!m || !snap || typeof (layer as HTMLElement & { animate?: unknown }).animate !== 'function') restoreScroll(nav.scroll)
    else start(kind, m, snap, nav.scroll)
    focusScreen(layer)
  }, [routeKey])

  return (
    <div class="stage" ref={stage}>
      <div class="layer layer-live" ref={live}>
        <div class="layer-inner">{children}</div>
      </div>
    </div>
  )
}
