/**
 * 첫 갈림길: #/admin/... 은 운영자 화면(로그인), 나머지는 공개 대시보드 '주차각 데이터'(로그인 없음).
 * 운영자 화면은 따로 불러온다 — 대시보드만 보는 사람은 관리 화면 코드를 받지 않는다.
 */
import { lazy, Suspense, useEffect } from 'react'
import { DashboardApp } from './dashboard/DashboardApp'
import { href, navigate, useRoute, type Route } from './router'

const AdminApp = lazy(() => import('./AdminApp').then((m) => ({ default: m.AdminApp })))

/** 운영자 화면이 # 바로 아래 있던 때의 주소 → #/admin/... (#/lots/:id 는 이제 대시보드 상세라 그대로) */
export function legacyAdminPath(route: Route): string | null {
  const [first, second, third] = route.parts
  if (first === 'records') return `/admin${route.path}`
  if (first === 'lots' && (second === 'new' || third === 'edit')) return `/admin${route.path}`
  return null
}

export function App() {
  const route = useRoute()
  const legacy = legacyAdminPath(route)
  useEffect(() => {
    if (legacy) navigate(href(legacy, Object.fromEntries(route.query)), { replace: true })
  }, [legacy, route.query])
  if (legacy) return null
  if (route.parts[0] === 'admin') {
    return (
      <Suspense fallback={<p className="loading" role="status">불러오는 중…</p>}>
        <AdminApp />
      </Suspense>
    )
  }
  return <DashboardApp route={route} />
}
