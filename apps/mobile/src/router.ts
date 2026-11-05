/**
 * 주소 ↔ 화면. 히스토리 라우팅 (호스팅은 모든 경로를 index.html로 — vercel.json, public/_redirects).
 *
 *   /                      M-20 홈 (첫 실행이면 M-10)
 *   /start /start/spot /start/share          M-10 · M-11 · M-12
 *   /connect /connect/code /connected        M-13 · 코드 입력 · M-14
 *   /pair/:code            차 QR (C-10 › 폰 연결) → 바로 연결 → M-14
 *   /parking /parking/way  지금 주차 중 M-01 · M-02 (연결된 폰)
 *   /p/:id[/way]#payload   C-07 링크 (서버 없이, 연결 안 해도) → M-01 · M-02
 *   /s/:code[/way]         C-07 짧은 링크 (GET /v1/shares/:code) → M-01 · M-02
 *   /lots /lots/:id /lots/:id/easier         M-30 · M-31 · 더 쉬운 곳
 *   /records /records/:id  M-32 · M-33
 *   /king /king/me /king/result              주차왕: M-50 (참여 전이면 M-52) · M-51 내 점수 · M-53 지난주 결과
 *   /settings /settings/experience           M-40 · 운전 경력
 */

export type Route =
  | { name: 'home' }
  | { name: 'start' }
  | { name: 'start-spot' }
  | { name: 'start-share' }
  | { name: 'connect' }
  | { name: 'connect-code' }
  | { name: 'connected' }
  | { name: 'pair'; code: string }
  | { name: 'parking'; way: boolean }
  | { name: 'link'; id: string; way: boolean }
  | { name: 'short'; code: string; way: boolean }
  | { name: 'lots' }
  | { name: 'lot'; id: string }
  | { name: 'lot-easier'; id: string }
  | { name: 'records' }
  | { name: 'record'; id: string }
  | { name: 'king' }
  | { name: 'king-me' }
  | { name: 'king-result' }
  | { name: 'settings' }
  | { name: 'experience' }
  | { name: 'notfound' }

export type Tab = 'home' | 'lots' | 'king' | 'records' | 'settings'

const seg = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return ''
  }
}

/** 배포 경로(BASE_URL)를 뺀 앱 안 경로 — 항상 '/'로 시작, 끝 '/' 없음 */
export function appPath(pathname: string, base = '/'): string {
  let p = pathname || '/'
  const b = base.endsWith('/') ? base.slice(0, -1) : base
  if (b && (p === b || p.startsWith(b + '/'))) p = p.slice(b.length) || '/'
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p || '/'
}

export function parseRoute(pathname: string, base = '/'): Route {
  const p = appPath(pathname, base)
  // '#'이 %23 으로 바뀌어 경로에 붙은 C-07 링크: /p/{id}%23{payload}
  const parts = p.split('/').filter(Boolean)
  const [a, b, c] = parts
  if (parts.length === 0) return { name: 'home' }
  switch (a) {
    case 'home':
      return { name: 'home' }
    case 'start':
      if (!b) return { name: 'start' }
      if (b === 'spot') return { name: 'start-spot' }
      if (b === 'share') return { name: 'start-share' }
      break
    case 'connect':
      if (!b) return { name: 'connect' }
      if (b === 'code') return { name: 'connect-code' }
      break
    case 'connected':
      return { name: 'connected' }
    case 'pair': {
      const code = seg(b ?? '').replace(/\D/g, '')
      return code ? { name: 'pair', code: code.slice(0, 6) } : { name: 'connect-code' }
    }
    case 'parking':
      if (!b || b === 'way') return { name: 'parking', way: b === 'way' }
      break
    case 'p': {
      const raw = seg(b ?? '')
      const id = raw.split('#')[0].replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)
      return { name: 'link', id, way: c === 'way' }
    }
    case 's': {
      const code = seg(b ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 16)
      if (code) return { name: 'short', code, way: c === 'way' }
      break
    }
    case 'lots':
      if (!b) return { name: 'lots' }
      if (c === 'easier') return { name: 'lot-easier', id: seg(b) }
      if (!c) return { name: 'lot', id: seg(b) }
      break
    case 'records':
      if (!b) return { name: 'records' }
      if (!c) return { name: 'record', id: seg(b) }
      break
    case 'king':
      if (!b) return { name: 'king' }
      if (b === 'me' && !c) return { name: 'king-me' }
      if (b === 'result' && !c) return { name: 'king-result' }
      break
    case 'settings':
      if (!b) return { name: 'settings' }
      if (b === 'experience') return { name: 'experience' }
      break
  }
  return { name: 'notfound' }
}

/** 화면 → 앱 안 경로 (link는 # 를 붙이지 않음 — navigate가 지금 #payload를 이어 붙인다) */
export function routePath(r: Route): string {
  const e = encodeURIComponent
  switch (r.name) {
    case 'home':
      return '/'
    case 'start':
      return '/start'
    case 'start-spot':
      return '/start/spot'
    case 'start-share':
      return '/start/share'
    case 'connect':
      return '/connect'
    case 'connect-code':
      return '/connect/code'
    case 'connected':
      return '/connected'
    case 'pair':
      return `/pair/${e(r.code)}`
    case 'parking':
      return r.way ? '/parking/way' : '/parking'
    case 'link':
      return `/p/${e(r.id || 'x')}${r.way ? '/way' : ''}`
    case 'short':
      return `/s/${e(r.code)}${r.way ? '/way' : ''}`
    case 'lots':
      return '/lots'
    case 'lot':
      return `/lots/${e(r.id)}`
    case 'lot-easier':
      return `/lots/${e(r.id)}/easier`
    case 'records':
      return '/records'
    case 'record':
      return `/records/${e(r.id)}`
    case 'king':
      return '/king'
    case 'king-me':
      return '/king/me'
    case 'king-result':
      return '/king/result'
    case 'settings':
      return '/settings'
    case 'experience':
      return '/settings/experience'
    case 'notfound':
      return '/'
  }
}

/** 아래 탭이 보이는 화면과 그 탭 */
export function tabOf(r: Route): Tab | null {
  switch (r.name) {
    case 'home':
      return 'home'
    case 'lots':
      return 'lots'
    case 'records':
      return 'records'
    case 'king':
      return 'king'
    case 'settings':
      return 'settings'
    default:
      return null
  }
}

/** 처음 실행을 안 끝내도 열리는 화면 (링크·페어링·첫 실행 자체) */
export function opensWithoutOnboarding(r: Route): boolean {
  return ['start', 'start-spot', 'start-share', 'connect', 'connect-code', 'connected', 'pair', 'link', 'short'].includes(r.name)
}

/** 연결된 차가 있어야 뜻이 있는 화면 */
export function needsPairing(r: Route): boolean {
  return r.name === 'parking' || r.name === 'record' || r.name === 'connected' || r.name === 'king-me' || r.name === 'king-result'
}

// ───────────── 브라우저 히스토리 ─────────────

const BASE = typeof import.meta !== 'undefined' ? import.meta.env?.BASE_URL ?? '/' : '/'

/**
 * 마지막 이동이 어떤 것이었는지 — 화면 전환 방향(ui/transition.ts)과 스크롤 되돌리기에 쓴다.
 * - push: 앞으로 (navigate, 브라우저 '앞으로')   - pop: 뒤로 (goBack, 브라우저 '뒤로')
 * - replace: 바꿔 놓기 (navigate replace, 들어갈 수 없는 화면 바꾸기)   - initial: 앱을 연 첫 화면
 */
export type NavKind = 'initial' | 'push' | 'pop' | 'replace'
export interface NavInfo {
  kind: NavKind
  /** 새 화면에서 되돌릴 세로 스크롤 (앞으로·바꿔 놓기는 0, 뒤로는 그 화면을 떠날 때 값) */
  scroll: number
}

interface HistState {
  depth?: number
  key?: string
  scroll?: number
}

type RouteListener = () => void
const listeners = new Set<RouteListener>()
let depth = 0 // 이 앱 안에서 앞으로 간 횟수 (뒤로 가기 버튼이 앱 밖으로 나가지 않게)
let entryKey = ''
let last: NavInfo = { kind: 'initial', scroll: 0 }
const scrolls = new Map<string, number>()
let scrollSource: () => number = () => (typeof window === 'undefined' ? 0 : window.scrollY || 0)

const newKey = () => Math.random().toString(36).slice(2, 10)

export function currentRoute(): Route {
  return parseRoute(location.pathname, BASE)
}

/** 마지막 이동 (App·Stage가 읽음) */
export function lastNavigation(): NavInfo {
  return last
}

/** 화면 전환 중에는 window.scrollY 가 0이라 (화면이 고정돼 있음) 실제 스크롤을 Stage 가 알려 준다 */
export function setScrollSource(fn: (() => number) | null) {
  scrollSource = fn ?? (() => window.scrollY || 0)
}

/**
 * 앱을 열 때 한 번: 새로 고침해도 앱 안 뒤로 가기 깊이를 이어 받고,
 * '#'이 %23 으로 바뀌어 온 C-07 링크(/p/{id}%23{payload})는 정상 모양(/p/{id}#{payload})으로 바꿔 둔다.
 * 스크롤은 앱이 직접 되돌린다 (뒤로 갈 때 화면이 미끄러져 들어오는 동안 브라우저가 먼저 움직이지 않게).
 */
export function initRouter() {
  const st = history.state as HistState | null
  depth = typeof st?.depth === 'number' ? st.depth : 0
  entryKey = typeof st?.key === 'string' ? st.key : newKey()
  last = { kind: 'initial', scroll: 0 }
  try {
    history.scrollRestoration = 'manual'
  } catch {
    /* 오래된 WebView */
  }
  let url: string | undefined
  if (!location.hash) {
    const i = location.pathname.toLowerCase().indexOf('%23')
    if (i >= 0 && /\/p\//.test(location.pathname)) url = location.pathname.slice(0, i) + '#' + location.pathname.slice(i + 3)
  }
  history.replaceState({ ...(st ?? {}), depth, key: entryKey } satisfies HistState, '', url)
}

export function onRouteChange(l: RouteListener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

function fire() {
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (e) => {
    const st = e.state as HistState | null
    const d = st?.depth ?? 0
    scrolls.set(entryKey, scrollSource())
    const kind: NavKind = d < depth ? 'pop' : d > depth ? 'push' : 'replace'
    depth = d
    entryKey = st?.key ?? newKey()
    last = { kind, scroll: kind === 'push' ? 0 : scrolls.get(entryKey) ?? st?.scroll ?? 0 }
    fire()
  })
}

/** 앱 안 경로로 이동. link/short 화면끼리는 지금 #payload 를 그대로 이어 붙인다 */
export function navigate(to: Route | string, opts: { replace?: boolean; keepHash?: boolean } = {}) {
  const path = typeof to === 'string' ? to : routePath(to)
  const keepHash = opts.keepHash ?? (typeof to !== 'string' && to.name === 'link')
  const full = (BASE.endsWith('/') ? BASE.slice(0, -1) : BASE) + path + (keepHash ? location.hash : '')
  if (opts.replace) {
    history.replaceState({ depth, key: entryKey } satisfies HistState, '', full)
    last = { kind: 'replace', scroll: 0 }
  } else {
    // 떠나는 화면의 스크롤을 기억 (뒤로 오면 그 자리로)
    const y = scrollSource()
    scrolls.set(entryKey, y)
    try {
      history.replaceState({ ...((history.state as HistState | null) ?? {}), depth, key: entryKey, scroll: y } satisfies HistState, '')
    } catch {
      /* 저장 못 해도 이동은 됨 */
    }
    depth += 1
    entryKey = newKey()
    history.pushState({ depth, key: entryKey } satisfies HistState, '', full)
    last = { kind: 'push', scroll: 0 }
  }
  fire()
  window.scrollTo(0, 0)
}

/** 뒤로: 앱 안에서 온 곳이 있으면 history.back, 아니면 fallback 으로 바꿔 놓기 */
export function goBack(fallback: Route) {
  if (depth > 0) history.back()
  else navigate(fallback, { replace: true })
}
