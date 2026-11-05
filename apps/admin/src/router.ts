/**
 * 아주 작은 해시 라우터. 정적 호스팅에서 다시 쓰기 설정 없이 동작하도록 #/경로?쿼리 를 쓴다.
 *
 * 공개 대시보드 '주차각 데이터' v2 (로그인 없음, 집계값만)
 *   #/                        D-10 난이도 한눈에
 *   #/lots/:id?floor=         D-11 주차장 상세 · 어떻게 대고 있나   (#/lots 만 있으면 가장 어려운 곳)
 *   #/export?lot=             D-12 데이터 내보내기 (lot=id[,id…] 또는 all, 없으면 마지막으로 본 곳)
 *   #/compare?type=           D-03 비교표
 *
 * 운영자 화면 (관리자 토큰 필요)
 *   #/admin                   → #/admin/lots
 *   #/admin/lots?q=           주차장 관리
 *   #/admin/lots/new          주차장 추가
 *   #/admin/lots/:id          주차장 상세 (통계 · 기록)
 *   #/admin/lots/:id/edit     메타데이터 수정
 *   #/admin/records?lot=&kind= 기록
 *   #/admin/vision            W-01 PT 비전 (이전 시안)
 */
import { useEffect, useState } from 'react'

export interface Route {
  path: string
  parts: string[]
  query: URLSearchParams
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/'
  const [pathPart, queryPart = ''] = raw.split('?', 2)
  const path = ('/' + pathPart.replace(/^\/+/, '')).replace(/\/+$/, '') || '/'
  const parts = path.split('/').filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p)
    } catch {
      return p
    }
  })
  return { path, parts, query: new URLSearchParams(queryPart) }
}

export function href(path: string, query?: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const qs = p.toString()
  return `#${path}${qs ? `?${qs}` : ''}`
}

/** 운영자 화면 주소: adminHref('/lots') → "#/admin/lots" */
export function adminHref(path: string, query?: Record<string, string | number | null | undefined>): string {
  return href(`/admin${path === '/' ? '' : path}`, query)
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const target = to.startsWith('#') ? to : `#${to}`
  if (opts.replace) {
    const url = `${location.pathname}${location.search}${target}`
    history.replaceState(null, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    location.hash = target
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
