/**
 * 공개 대시보드 '주차각 데이터' v2 — 화면마다 질문 하나 (canvas.json 메모 ws2). 로그인 없음, 집계값만.
 *   #/                 D-10 난이도 한눈에   — 어디가 어려운가
 *   #/lots/:id?floor=  D-11 주차장 상세     — 그 주차장에서 어떻게 대고 있나 (#/lots 만 있으면 가장 어려운 곳)
 *   #/export?lot=      D-12 데이터 내보내기 — 그 숫자를 어떻게 뽑아 가나 (lot=a,b 또는 all)
 *   #/compare?type=    D-03 비교표
 * 보는 사람: 주차장 운영사 · 지자체 · 보험사. 시안: docs/design/D-10~D-12.dc.html, D-03.dc.html (1440 폭)
 */
import { lazy, Suspense, useEffect, useId, useRef, type ReactNode } from 'react'
import { config } from '../config'
import { href, type Route } from '../router'
import { DLoading, Logo } from './components'
import { InsightsProvider, useInsight, useInsightsContext, type InsightsProviderProps } from './context'
import { PERIODS, periodLabel } from './format'
import { Compare } from './pages/Compare'
import { Difficulty } from './pages/Difficulty'
import { LotDetail } from './pages/LotDetail'
import './dashboard.css'

/** 내보내기 화면(파일 만드는 코드)은 열 때만 불러온다 */
const ExportPage = lazy(() => import('./pages/Export').then((m) => ({ default: m.ExportPage })))

type Tab = 'overview' | 'lot' | 'export' | 'compare' | 'none'

function tabOf(route: Route): Tab {
  const [first] = route.parts
  if (!first) return 'overview'
  if (first === 'lots') return 'lot'
  if (first === 'export') return 'export'
  if (first === 'compare') return 'compare'
  return 'none'
}

const TITLES: Record<Tab, string> = {
  overview: '난이도 한눈에', lot: '주차장 상세', export: '데이터 내보내기', compare: '비교표', none: '없는 화면',
}

const Chevron = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="v2-select__chevron">
    <path d="M6 9l6 6 6-6" />
  </svg>
)

function PeriodSelect() {
  const { days, setDays } = useInsightsContext()
  const id = useId()
  return (
    <span className="v2-select">
      <label htmlFor={id} className="visually-hidden">기간</label>
      <select id={id} className="v2-select__control" value={days} onChange={(e) => setDays(Number(e.target.value))}>
        {PERIODS.map((d) => <option key={d} value={d}>{periodLabel(d)}</option>)}
      </select>
      <Chevron />
    </span>
  )
}

/** 지역: 지금은 판교 일대 하나뿐이라 고를 것도 하나 */
function RegionSelect() {
  const ov = useInsight('overview', (c, days) => c.overview({ days }))
  const id = useId()
  if (!ov.data) return null
  const { region, totals } = ov.data
  return (
    <span className="v2-select">
      <label htmlFor={id} className="visually-hidden">지역</label>
      <select id={id} className="v2-select__control" value={region.id} onChange={() => {}}>
        <option value={region.id}>{region.name} · {totals.lots}곳</option>
      </select>
      <Chevron />
    </span>
  )
}

/** 머리글 '주차장 상세'가 갈 곳: 마지막으로 본 곳, 없으면 가장 어려운 곳 */
function useLotNavTarget(): string {
  const { lastLotId } = useInsightsContext()
  const overview = useInsight('overview', (c, days) => c.overview({ days }))
  const id = lastLotId ?? overview.data?.lots[0]?.id
  return id ? href(`/lots/${encodeURIComponent(id)}`) : href('/lots')
}

/** 머리글 메뉴 아이콘 — 선 하나짜리 (글자 앞, 화면 낭독기는 건너뜀) */
function NavIcon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="v2-nav__icon"><path d={d} /></svg>
  )
}

function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const tab = tabOf(route)
  const { mock, mockBuild, switchToServer } = useInsightsContext()
  const demo = config.demoBadge || mock
  const lotHref = useLotNavTarget()
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (tab !== 'lot') document.title = `${TITLES[tab]} · 주차각 데이터`
  }, [tab])
  // 화면이 바뀌면 맨 위로 + 본문에 초점 (처음 열 때와 같은 주소 안의 바뀜은 그대로)
  const key = route.path
  const prevKey = useRef(key)
  useEffect(() => {
    if (prevKey.current === key) return
    prevKey.current = key
    window.scrollTo(0, 0)
    mainRef.current?.focus({ preventScroll: true })
  }, [key])

  const nav: { t: Tab; label: string; to: string; icon: ReactNode }[] = [
    { t: 'overview', label: '난이도 한눈에', to: href('/'), icon: <NavIcon d="M5 19v-4M10 19v-7M15 19v-10M20 19V5" /> },
    { t: 'lot', label: '주차장 상세', to: lotHref, icon: <NavIcon d="M4 5h16v14H4zM4 11h16M10 11v8M15 5v6" /> },
    { t: 'export', label: '데이터 내보내기', to: href('/export'), icon: <NavIcon d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" /> },
    { t: 'compare', label: '비교표', to: href('/compare'), icon: <NavIcon d="M4 6h16M4 12h16M4 18h16M9 6v12" /> },
  ]

  return (
    <div className="d-root">
      <a className="skip-link" href="#d-main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus() }}>본문으로 건너뛰기</a>
      <header className="v2-header">
        <div className="v2-header__inner">
          <a className="v2-brand" href={href('/')} aria-label="주차각 데이터 처음 화면">
            <Logo size={34} />
            <span className="v2-brand__name">주차각</span>
            <span className="v2-brand__sub">데이터</span>
          </a>
          <nav aria-label="대시보드 메뉴" className="v2-nav">
            {nav.map((n) => (
              <a key={n.t} href={n.to} className="v2-nav__link" aria-current={tab === n.t ? 'page' : undefined}>{n.icon}{n.label}</a>
            ))}
          </nav>
          <div className="v2-header__spacer" />
          <div className="v2-header__tools">
            {demo && <span className="v2-demo-badge">시연용 예시 데이터</span>}
            {tab === 'overview' && <RegionSelect />}
            {(tab === 'overview' || tab === 'lot' || tab === 'compare') && <PeriodSelect />}
            <span className="v2-header__divider" aria-hidden="true" />
            <span className="v2-avatar" aria-hidden="true" title="기관 화면 (시연)">기관</span>
          </div>
        </div>
      </header>
      <main id="d-main" ref={mainRef} tabIndex={-1} className="d-main">
        {children}
      </main>
      <footer className="d-footer d-no-print">
        <div className="d-footer__inner">
          <span>
            차에서 모인 익명 주차 기록을 주차장 단위로 묶은 값만 보여 줘요.
            {demo && ' 수치는 시연용 예시, 장소 이름만 실제예요.'}
            {mock && !mockBuild && ' 지금은 서버 없이 이 브라우저 안의 시연 데이터로 보고 있어요.'}
          </span>
          <span className="d-footer__links">
            {mock && !mockBuild && (
              <button type="button" className="d-linkbtn" onClick={switchToServer}>서버 데이터로 다시 보기</button>
            )}
            <a href={href('/admin')}>운영자 화면</a>
          </span>
        </div>
      </footer>
    </div>
  )
}

function NotFound() {
  return (
    <div className="d-stack">
      <h1 className="d-title">없는 화면이에요</h1>
      <p><a href={href('/')}>처음 화면으로 돌아가기</a></p>
    </div>
  )
}

function Page({ route }: { route: Route }) {
  const [first, second] = route.parts
  if (!first) return <Difficulty />
  if (first === 'lots') return <LotDetail id={second ?? null} floor={route.query.get('floor')} />
  if (first === 'export') {
    return (
      <Suspense fallback={<DLoading />}>
        <ExportPage lotParam={route.query.get('lot')} />
      </Suspense>
    )
  }
  if (first === 'compare') return <Compare type={route.query.get('type')} />
  return <NotFound />
}

export function DashboardApp({ route, ...provider }: { route: Route } & Omit<InsightsProviderProps, 'children'>) {
  return (
    <InsightsProvider {...provider}>
      <Shell route={route}>
        <Page route={route} />
      </Shell>
    </InsightsProvider>
  )
}
