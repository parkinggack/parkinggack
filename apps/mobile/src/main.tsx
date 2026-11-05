import './style.css'
import { render } from 'preact'
import { App } from './App'
import { initRouter } from './router'
import { applyTheme, session } from './session'
import { watchHostInset } from './hostInset'
import { demoFromUrl } from './demo'

// 심사·발표용 링크 https://parkinggack.vercel.app/?demo=1 → 바로 시연 데이터 (라우터가 주소를 읽기 전에)
demoFromUrl()
initRouter()
applyTheme(session.get().prefs.theme)
session.subscribe((s) => applyTheme(s.prefs.theme))
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(session.get().prefs.theme))
} catch {
  /* 오래된 WebView */
}
// 다른 탭에서 연결·설정을 바꾸면 따라감
window.addEventListener('storage', (e) => {
  if (!e.key || e.key.startsWith('pg:')) session.reload()
})

// iOS 사파리는 touchstart 처리기가 있어야 :active(누름 0.97)를 그린다
document.addEventListener('touchstart', () => {}, { passive: true })

render(<App />, document.getElementById('app')!)
watchHostInset()

// 오프라인 껍데기·마지막 '지금 주차 중' 캐시·웹 푸시 — 빌드본 + https(또는 localhost)에서만.
// WebView는 지원할 때만 (안드로이드 WebView는 됨, iOS WKWebView는 App-Bound Domains 설정이 있어야 함). file:// 이면 건너뜀
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
  const base = import.meta.env.BASE_URL
  navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
    /* 오프라인 캐시는 덤 — 실패해도 화면은 그대로 */
  })
}
