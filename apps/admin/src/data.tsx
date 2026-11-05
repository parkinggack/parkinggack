/**
 * 화면 공용 상태: API 클라이언트, 주차장 목록 캐시(대시보드·관리·기록이 같이 씀), 알림 한 줄.
 */
import type { AdminLot } from '@api-types'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { errorMessage, type ApiClient } from './api'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

interface DataContextValue {
  client: ApiClient
  /** 서버 없이 시연 데이터로 보는 중 */
  mock: boolean
  lots: AsyncState<AdminLot[]>
  reloadLots: () => Promise<AdminLot[] | null>
  /** 화면 아래 알림 (스크린 리더에도 읽힘) */
  notify: (message: string) => void
  notice: string | null
}

const Ctx = createContext<DataContextValue | null>(null)

export function DataProvider({ client, mock = false, children }: { client: ApiClient; mock?: boolean; children: ReactNode }) {
  const [lots, setLots] = useState<AsyncState<AdminLot[]>>({ data: null, error: null, loading: true })
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const seq = useRef(0)

  const reloadLots = useCallback(async () => {
    const my = ++seq.current
    setLots((s) => ({ ...s, loading: true }))
    try {
      const res = await client.listLots()
      if (my === seq.current) setLots({ data: res.lots, error: null, loading: false })
      return res.lots
    } catch (e) {
      if (my === seq.current) setLots((s) => ({ data: s.data, error: errorMessage(e), loading: false }))
      return null
    }
  }, [client])

  useEffect(() => {
    void reloadLots()
  }, [reloadLots])

  const notify = useCallback((message: string) => {
    setNotice(message)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setNotice(null), 6000)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  return <Ctx.Provider value={{ client, mock, lots, reloadLots, notify, notice }}>{children}</Ctx.Provider>
}

export function useData(): DataContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('DataProvider 밖에서 useData를 불렀어요')
  return v
}

/** 한 번 불러오고 reload()로 다시 부르는 비동기 상태 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e) => alive && setState((s) => ({ data: s.data, error: errorMessage(e), loading: false })),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { ...state, reload: () => setTick((t) => t + 1) }
}
