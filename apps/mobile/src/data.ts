/**
 * 여러 화면이 같이 보는 서버 값 — '지금 주차 중'(M-20 카드, M-01)과 연결된 차(M-40).
 * 지하에서는 신호가 약하므로 마지막으로 받은 '지금 주차 중'을 이 폰에 남겨 두고, 못 받으면 그걸 보여 준다
 * (서비스 워커도 같은 응답을 캐시 — public/sw.js).
 */
import type { MyParking } from '@api-types'
import { useEffect, useState } from 'preact/hooks'
import { api } from './api'
import { ApiError } from './api/client'
import { session } from './session'
import { getJSON, setJSON } from './storage'

export interface CurrentState {
  /** undefined = 아직 모름 */
  parking: MyParking | null | undefined
  /** 서버에서 못 받아서 저장해 둔 값을 보여 주는 중 */
  stale: boolean
  loading: boolean
  error: ApiError | null
}

type Listener<T> = (v: T) => void

export function createStore<T>(initial: T) {
  let value = initial
  const ls = new Set<Listener<T>>()
  return {
    get: () => value,
    set(v: T) {
      value = v
      ls.forEach((l) => l(v))
    },
    subscribe(l: Listener<T>) {
      ls.add(l)
      return () => {
        ls.delete(l)
      }
    },
  }
}

export function useStore<T>(store: ReturnType<typeof createStore<T>>): T {
  const [v, setV] = useState(store.get())
  useEffect(() => {
    setV(store.get())
    return store.subscribe(setV)
  }, [store])
  return v
}

const CACHE_KEY = 'pg:current'

interface Cached {
  token: string
  parking: MyParking | null
  at: number
}
const isCached = (v: unknown): v is Cached => !!v && typeof (v as Cached).token === 'string' && typeof (v as Cached).at === 'number'

function cachedFor(token: string | null): MyParking | null | undefined {
  if (!token) return undefined
  const c = getJSON(CACHE_KEY, isCached)
  return c && c.token === token ? c.parking : undefined
}

export const currentStore = createStore<CurrentState>({ parking: cachedFor(session.get().token), stale: true, loading: false, error: null })

/** 새 주차를 알아챘을 때 (폴링) — App이 알림·토스트 */
let onNew: ((p: MyParking) => void) | null = null
export function onNewParking(fn: ((p: MyParking) => void) | null) {
  onNew = fn
}

let inflight: Promise<void> | null = null

export function refreshCurrent(): Promise<void> {
  const s = session.get()
  if (!s.token) {
    currentStore.set({ parking: null, stale: false, loading: false, error: null })
    return Promise.resolve()
  }
  if (inflight) return inflight
  const before = currentStore.get()
  currentStore.set({ ...before, loading: true })
  const token = s.token
  inflight = api()
    .currentParking()
    .then((parking) => {
      setJSON(CACHE_KEY, { token, parking, at: Date.now() } satisfies Cached)
      const prev = before.parking
      currentStore.set({ parking, stale: false, loading: false, error: null })
      if (parking && prev !== undefined && prev?.id !== parking.id) onNew?.(parking)
    })
    .catch((e: unknown) => {
      const err = e instanceof ApiError ? e : new ApiError(0, 'offline', String(e))
      if (err.code === 'unauthorized') {
        // 차 쪽에서 연결을 끊었거나 토큰이 사라짐 → 연결 안 한 상태로
        session.clearPairing()
        setJSON(CACHE_KEY, null)
        currentStore.set({ parking: null, stale: false, loading: false, error: err })
        return
      }
      const cached = cachedFor(token)
      currentStore.set({ parking: before.parking ?? cached, stale: true, loading: false, error: err })
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** '차 찾았어요' 뒤: 바로 비우고 저장본도 비움 */
export function clearCurrent() {
  const token = session.get().token
  if (token) setJSON(CACHE_KEY, { token, parking: null, at: Date.now() } satisfies Cached)
  currentStore.set({ parking: null, stale: false, loading: false, error: null })
}

/** 연결을 끊거나 시연을 끝낼 때 */
export function forgetCurrent() {
  setJSON(CACHE_KEY, null)
  currentStore.set({ parking: undefined, stale: true, loading: false, error: null })
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'forget-parking' })
  } catch {
    /* 서비스 워커 없음 */
  }
}

// ───────────── 잠깐 뜨는 한 줄 (화면이 바뀌어도 이어서 보임) ─────────────

export const toastStore = createStore<string>('')
let toastTimer: ReturnType<typeof setTimeout> | null = null
export function showToast(text: string, ms = 2800) {
  toastStore.set(text)
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastStore.set(''), ms)
}

// ───────────── 화면 하나가 쓰는 비동기 값 ─────────────

export interface Async<T> {
  data: T | undefined
  error: ApiError | null
  loading: boolean
  reload: () => void
  /** 받아 둔 값으로 바로 바꾸기 (예: 참여 응답) */
  set: (v: T) => void
}

/** initial: 전에 받아 둔 값 (있으면 그걸 먼저 보여 주고 뒤에서 새로 받음 — 화면 전환 중에 빈 화면이 안 보이게) */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], initial?: T): Async<T> {
  const [state, setState] = useState<{ data: T | undefined; error: ApiError | null; loading: boolean }>({ data: initial, error: null, loading: true })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let alive = true
    setState((s) => ({ data: s.data, error: null, loading: true }))
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e: unknown) => alive && setState((s) => ({ data: s.data, error: e instanceof ApiError ? e : new ApiError(0, 'offline', String(e)), loading: false })),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])
  return { ...state, reload: () => setNonce((n) => n + 1), set: (v: T) => setState({ data: v, error: null, loading: false }) }
}
