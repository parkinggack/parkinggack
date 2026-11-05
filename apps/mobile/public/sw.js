/*
 * 주차각 폰 앱 서비스 워커 — 지하(신호 약함·없음)에서도 앱이 뜨고 마지막 '지금 주차 중'이 보이게.
 *
 * - 페이지 이동(/, /parking, /p/{id}, /pair/{code} …): 네트워크 먼저, 3.5초 안에 안 오거나 끊기면 저장해 둔 앱(index.html).
 *   히스토리 라우팅 앱 하나라 어떤 경로든 같은 index.html 로 그린다 (/dev/ 는 제외)
 * - /assets/*(해시 붙은 파일)·아이콘·Google Fonts: 캐시 먼저
 * - GET …/v1/me/parkings/current (다른 주소의 API 서버여도): 네트워크 먼저, 실패하면 마지막 응답
 *   → 앱이 연결을 끊거나 시연을 끝내면 'forget-parking' 메시지로 지움
 * - 웹 푸시: 서버가 보낸 새 주차를 "B2 · D-07에 주차했어요" 알림으로, 누르면 /parking
 */
const VERSION = 'v2'
const SHELL_CACHE = `parkinggack-shell-${VERSION}`
const DATA_CACHE = 'parkinggack-data-v1'
const SCOPE = new URL(self.registration.scope)
const SHELL = new URL('./', SCOPE).href
const PRECACHE = [SHELL, new URL('manifest.webmanifest', SCOPE).href, new URL('icons/icon-192.png', SCOPE).href]
const NAV_TIMEOUT_MS = 3500
const API_TIMEOUT_MS = 4000

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('parkinggack-') && k !== SHELL_CACHE && k !== DATA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type
  if (type === 'forget-parking') event.waitUntil(caches.delete(DATA_CACHE))
})

function isAppPage(url) {
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return false
  const rest = url.pathname.slice(SCOPE.pathname.length)
  if (rest.startsWith('dev')) return false
  const last = rest.split('/').pop() || ''
  return rest === '' || rest === 'index.html' || !last.includes('.')
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (req.mode === 'navigate') {
    if (!isAppPage(url)) return
    const network = fetch(req).then((res) => {
      // 정상 응답만 앱 껍데기로 갱신 (GitHub Pages의 404.html 대체 응답은 설치 때 받은 것을 유지)
      if (res.ok) {
        const copy = res.clone()
        caches.open(SHELL_CACHE).then((c) => c.put(SHELL, copy))
      }
      return res
    })
    event.respondWith(
      Promise.race([network, timeout(NAV_TIMEOUT_MS).then(() => caches.match(SHELL))])
        .then((res) => res || network)
        .catch(() => caches.match(SHELL))
        .then((res) => res || network),
    )
    return
  }

  // 마지막 '지금 주차 중' — 지하에서 열어도 층·구역이 보이게
  if (/\/v1\/me\/parkings\/current$/.test(url.pathname)) {
    const network = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone()
        caches.open(DATA_CACHE).then((c) => c.put(url.href, copy))
      }
      return res
    })
    event.respondWith(
      Promise.race([network, timeout(API_TIMEOUT_MS).then(() => caches.match(url.href, { cacheName: DATA_CACHE }))])
        .then((res) => res || network)
        .catch(() => caches.match(url.href, { cacheName: DATA_CACHE }).then((hit) => hit || Response.error())),
    )
    return
  }

  const cacheFirst =
    (url.origin === SCOPE.origin && (url.pathname.startsWith(SCOPE.pathname + 'assets/') || url.pathname.startsWith(SCOPE.pathname + 'icons/'))) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  if (!cacheFirst) return
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone()
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})

// ───────────── 웹 푸시 (서버: 차가 새 주차를 올리면 연결된 폰으로) ─────────────

function spotText(p) {
  if (!p || typeof p !== 'object') return ''
  const zone = p.zone && p.number ? `${p.zone}-${p.number}` : p.zone || p.number || ''
  return [p.floor, zone].filter(Boolean).join(' · ')
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const spot = spotText(data.parking) || spotText(data)
  const body = (typeof data.body === 'string' && data.body) || (spot ? `${spot}에 주차했어요` : '주차 위치를 저장했어요')
  const title = (typeof data.title === 'string' && data.title) || '주차각'
  const url = new URL(typeof data.url === 'string' ? data.url : 'parking', SCOPE).href
  event.waitUntil(
    Promise.all([
      caches.delete(DATA_CACHE), // 새 주차 → 저장해 둔 '지금 주차 중'은 낡음
      self.registration.showNotification(title, {
        body,
        tag: 'parking',
        renotify: true,
        icon: new URL('icons/icon-192.png', SCOPE).href,
        badge: new URL('icons/icon-192.png', SCOPE).href,
        data: { url },
        lang: 'ko',
      }),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || SHELL
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(SCOPE.origin) && 'focus' in c) {
          return c.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : w))
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
