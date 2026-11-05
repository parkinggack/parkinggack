/**
 * 공개 대시보드 공용 상태: 통계 API 클라이언트(실제 서버 또는 시연 데이터), 기간(최근 N일), 응답 캐시.
 *
 * - 서버에 연결이 안 되면 화면이 '시연 데이터로 보기'를 권한다 → 이 탭에서만 시연 데이터로 (sessionStorage)
 * - 응답은 (시연 여부 · 기간 · 요청) 별로 기억해서 화면을 오가도 다시 부르지 않는다
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, createInsightsClient, errorMessage, type FetchLike, type InsightsClient } from '../api'
import { config } from '../config'

const MOCK_KEY = 'pg-dash-mock'

/** 시연 데이터는 쓸 때만 따로 불러온다 */
const lazyMockFetch: FetchLike = async (input, init) => (await import('../mock/mockFetch')).appMockFetch(input, init)

function readMockSession(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(MOCK_KEY) === '1'
  } catch {
    return false
  }
}

function writeMockSession(on: boolean): void {
  try {
    if (on) globalThis.sessionStorage?.setItem(MOCK_KEY, '1')
    else globalThis.sessionStorage?.removeItem(MOCK_KEY)
  } catch {
    /* 저장이 막힌 브라우저: 이번 페이지 동안만 */
  }
}

interface CacheEntry { data?: unknown; error?: string; code?: string; promise?: Promise<unknown> }

interface InsightsContextValue {
  client: InsightsClient
  /** 시연 데이터로 보는 중 (빌드부터 시연 모드이거나, 이 탭에서 고름) */
  mock: boolean
  /** 서버 없는 시연 빌드 (VITE_MOCK=1) — 서버로 돌아갈 수 없음 */
  mockBuild: boolean
  days: number
  setDays: (days: number) => void
  switchToDemo: () => void
  switchToServer: () => void
  /** 마지막으로 본 주차장 (머리글 '주차장 상세'가 그리로) */
  lastLotId: string | null
  setLastLotId: (id: string) => void
  cache: Map<string, CacheEntry>
  listeners: Map<string, Set<() => void>>
}

const Ctx = createContext<InsightsContextValue | null>(null)

export interface InsightsProviderProps {
  children: ReactNode
  /** 테스트용: 클라이언트를 직접 */
  client?: InsightsClient
  /** 테스트용: 시연 데이터 fetch 를 직접 */
  mockFetch?: FetchLike
  initialMock?: boolean
}

export function InsightsProvider({ children, client: injected, mockFetch, initialMock }: InsightsProviderProps) {
  const [mock, setMock] = useState<boolean>(() => initialMock ?? (config.mockBuild || readMockSession()))
  const [days, setDays] = useState(30)
  const [lastLotId, setLastLotId] = useState<string | null>(null)
  const caches = useRef(new Map<string, Map<string, CacheEntry>>())
  const listeners = useRef(new Map<string, Set<() => void>>()).current

  const client = useMemo(
    () => (injected && !mock ? injected : createInsightsClient({ baseUrl: config.apiBase, fetchImpl: mock ? mockFetch ?? lazyMockFetch : undefined })),
    [injected, mock, mockFetch],
  )
  const cacheKey = `${mock ? 'mock' : 'server'}:${days}`
  let cache = caches.current.get(cacheKey)
  if (!cache) {
    cache = new Map()
    caches.current.set(cacheKey, cache)
  }

  const switchToDemo = useCallback(() => {
    writeMockSession(true)
    setMock(true)
  }, [])
  const switchToServer = useCallback(() => {
    writeMockSession(false)
    caches.current.clear()
    setMock(false)
  }, [])

  const value: InsightsContextValue = {
    client, mock, mockBuild: config.mockBuild, days, setDays, switchToDemo, switchToServer, lastLotId, setLastLotId, cache, listeners,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useInsightsContext(): InsightsContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('InsightsProvider 밖에서 useInsightsContext를 불렀어요')
  return v
}

export interface InsightState<T> {
  data: T | null
  error: string | null
  /** ApiError 코드 ('not_found', 'network' …) */
  errorCode: string | null
  loading: boolean
  reload: () => void
}

/**
 * key 로 한 번 불러서 기억한다 (같은 기간·같은 모드 안에서). reload() 는 기억을 지우고 다시.
 * 기간을 바꾸는 동안에는 이전 기간의 값을 그대로 보여 준다 (깜빡이지 않게).
 */
export function useInsight<T>(key: string, fetcher: (c: InsightsClient, days: number) => Promise<T>): InsightState<T> {
  const { client, cache, days, listeners } = useInsightsContext()
  const [, force] = useState(0)
  const last = useRef<{ key: string; data: T } | null>(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  /** 같은 key 를 보는 모든 화면 조각에 알린다 (머리글 · 본문이 같은 응답을 같이 씀) */
  const notify = useCallback(() => listeners.get(key)?.forEach((fn) => fn()), [listeners, key])

  const start = useCallback(() => {
    const e: CacheEntry = {}
    e.promise = fetcherRef.current(client, days).then(
      (data) => { e.data = data; e.promise = undefined },
      (err) => {
        e.error = errorMessage(err)
        e.code = err instanceof ApiError ? err.code : undefined
        e.promise = undefined
      },
    ).finally(notify)
    cache.set(key, e)
    notify()
  }, [cache, client, days, key, notify])

  useEffect(() => {
    const fn = () => force((n) => n + 1)
    let set = listeners.get(key)
    if (!set) {
      set = new Set()
      listeners.set(key, set)
    }
    set.add(fn)
    if (!cache.has(key)) start()
    else fn() // 구독 전에 끝났을 수도 있다
    return () => {
      set.delete(fn)
    }
  }, [cache, key, listeners, start])

  const current = cache.get(key)
  if (current?.data !== undefined) last.current = { key, data: current.data as T }
  const stale = last.current?.key === key ? last.current.data : null
  return {
    data: (current?.data as T | undefined) ?? (current?.error ? null : stale),
    error: current?.error ?? null,
    errorCode: current?.code ?? null,
    loading: !current || !!current.promise,
    reload: () => {
      cache.delete(key)
      start()
    },
  }
}
