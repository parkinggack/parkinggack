/** 운영자 화면 (#/admin/...): 로그인 → 셸(머리글 · 메뉴 · 알림) → 해시 라우트별 화면 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createApiClient, type FetchLike } from './api'
import { clearSession, getToken, isMockSession, setMockSession, setToken } from './auth'
import { config } from './config'
import { DataProvider, useData } from './data'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { LotDetail } from './pages/LotDetail'
import { LotEdit } from './pages/LotEdit'
import { Lots } from './pages/Lots'
import { Records } from './pages/Records'
import { adminHref, href, navigate, useRoute, type Route } from './router'

/** 시연 데이터는 쓸 때만 따로 불러온다 (서버 모드 번들에 넣지 않음) */
export const lazyMockFetch: FetchLike = async (input, init) => (await import('./mock/mockFetch')).appMockFetch(input, init)

type Section = 'lots' | 'records' | 'vision' | 'none'

/** #/admin 뒤의 경로 조각 */
const adminParts = (route: Route) => (route.parts[0] === 'admin' ? route.parts.slice(1) : route.parts)

function sectionOf(route: Route): Section {
  const [first] = adminParts(route)
  if (!first || first === 'lots') return 'lots'
  if (first === 'records') return 'records'
  if (first === 'vision') return 'vision'
  return 'none'
}

const TITLES: Record<Section, string> = {
  lots: '주차장 관리',
  records: '기록',
  vision: 'PT 비전 (이전 시안)',
  none: '없는 화면',
}

function Page({ route }: { route: Route }) {
  const [first, second, third] = adminParts(route)
  // #/admin 은 주차장 관리로 (주소도 바꿔서 뒤로 가기가 자연스럽게)
  useEffect(() => {
    if (!first) navigate(adminHref('/lots'), { replace: true })
  }, [first])
  if (!first) return <Lots />
  if (first === 'lots') {
    if (!second) return <Lots />
    if (second === 'new') return <LotEdit id={null} />
    if (third === 'edit') return <LotEdit id={second} />
    if (!third) return <LotDetail id={second} />
  }
  if (first === 'records') return <Records />
  if (first === 'vision') return <Dashboard />
  return (
    <div className="page">
      <p className="empty">없는 화면이에요.</p>
      <a className="btn btn--secondary" href={adminHref('/lots')}>주차장 관리로</a>
    </div>
  )
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const route = useRoute()
  const section = sectionOf(route)
  const { mock, lots, notice } = useData()
  const mainRef = useRef<HTMLElement>(null)
  const demoLots = lots.data?.filter((l) => l.demo).length ?? 0

  useEffect(() => {
    document.title = `${TITLES[section]} · 주차각 인사이트`
  }, [section])
  // 화면이 바뀌면 맨 위로 + 본문에 포커스 (키보드·화면 낭독기 사용자가 처음부터 읽게)
  // (처음 열 때는 그대로 — 이전 주소와 다를 때만. StrictMode 에서 효과가 두 번 돌아도 같은 주소면 건너뜀)
  const key = route.path
  const prevKey = useRef(key)
  useEffect(() => {
    if (prevKey.current === key) return
    prevKey.current = key
    window.scrollTo(0, 0)
    mainRef.current?.focus({ preventScroll: true })
  }, [key])

  const chip = mock
    ? '예시 데이터 (서버 없음)'
    : demoLots > 0
      ? '시연 데이터 포함'
      : '실제 기록'

  const nav: { s: Section; label: string; to: string }[] = [
    { s: 'lots', label: '주차장 관리', to: adminHref('/lots') },
    { s: 'records', label: '기록', to: adminHref('/records') },
    { s: 'vision', label: 'PT 비전 (이전 시안)', to: adminHref('/vision') },
  ]

  return (
    <div className="shell">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus() }}>본문으로 건너뛰기</a>
      <header className="topbar">
        <a className="topbar__brand" href={adminHref('/lots')}>주차각 인사이트</a>
        <span className="topbar__chip">{chip}</span>
        <div className="topbar__spacer" />
        <nav aria-label="어드민 메뉴" className="topbar__nav">
          {nav.map((n) => (
            <a key={n.s} href={n.to} className="pill" aria-current={section === n.s ? 'page' : undefined}>{n.label}</a>
          ))}
        </nav>
        <a className="topbar__logout" href={href('/')}>공개 대시보드</a>
        <button type="button" className="topbar__logout" onClick={onLogout}>나가기</button>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1} className="main">
        <Page route={route} />
      </main>
      <div className="toast" role="status" aria-live="polite">{notice && <span className="toast__msg">{notice}</span>}</div>
    </div>
  )
}

export function AdminApp() {
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [mock, setMock] = useState<boolean>(() => config.mockBuild || isMockSession())
  const [reason, setReason] = useState<string | null>(null)
  const tokenRef = useRef(token)
  tokenRef.current = token

  const logout = useCallback((why: string | null) => {
    clearSession()
    setTokenState(null)
    setMock(config.mockBuild)
    setReason(why)
  }, [])

  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: config.apiBase,
        getToken: () => tokenRef.current,
        onUnauthorized: () => logout('토큰이 바뀌었거나 맞지 않아요. 다시 들어와 주세요.'),
        fetchImpl: mock ? lazyMockFetch : undefined,
      }),
    [mock, logout],
  )

  useEffect(() => {
    if (!token) document.title = '로그인 · 주차각 인사이트'
  }, [token])

  if (!token) {
    return (
      <Login
        reason={reason}
        mockFetch={lazyMockFetch}
        onLogin={(t, m) => {
          setToken(t)
          setMockSession(m && !config.mockBuild)
          setMock(m || config.mockBuild)
          setReason(null)
          setTokenState(t)
        }}
      />
    )
  }
  return (
    <DataProvider client={client} mock={mock} key={`${mock}`}>
      <Shell onLogout={() => logout(null)} />
    </DataProvider>
  )
}
