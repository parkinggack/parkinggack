/**
 * '주차 끝나면 알림' (M-14 알림 받을게요 · M-40 토글).
 *
 * 1) 서버에 웹 푸시 키가 있으면(GET /v1/push/key) 서비스 워커로 구독 → POST /v1/me/push. 차가 새 주차를 올리면 서버가
 *    "B2 · D-07에 주차했어요" 푸시 → public/sw.js 의 push 처리기가 알림을 띄운다
 * 2) 키가 없거나(404) 브라우저가 못 하면(iOS 일반 사파리, WebView 등) 설정만 기억하고, 앱이 열려 있는 동안
 *    30초마다 /v1/me/parkings/current 를 확인해서 새 주차를 알려 준다 (App.tsx)
 * 어느 쪽이든 실패해도 화면은 멈추지 않는다.
 */
import type { Api } from './api/client'

export type NotifyMode = 'push' | 'polling'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])
  } catch {
    return null
  }
}

/** 알림 켜기 — 반드시 사용자 누름(버튼) 안에서 부를 것 (권한 창) */
export async function enableNotifications(api: Api): Promise<NotifyMode> {
  try {
    if (!pushSupported()) return await askLocalPermission()
    const key = await api.pushKey().catch(() => null)
    if (!key) return await askLocalPermission()
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return 'polling'
    const reg = await registration()
    if (!reg) return 'polling'
    const existing = await reg.pushManager.getSubscription()
    const sub =
      existing ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource }))
    const json = sub.toJSON()
    if (!json.endpoint) return 'polling'
    await api.pushSubscribe({ endpoint: json.endpoint, expirationTime: json.expirationTime ?? null, keys: json.keys as Record<string, string> | undefined })
    return 'push'
  } catch {
    return 'polling'
  }
}

/** 푸시 없이도: 알림 권한만 받아 두면 앱이 열려 있을 때(다른 탭에 있어도) 시스템 알림으로 보여 줄 수 있다 */
async function askLocalPermission(): Promise<NotifyMode> {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission()
  } catch {
    /* WebView 등 — 앱 안 안내만 */
  }
  return 'polling'
}

export async function disableNotifications(api: Api): Promise<void> {
  try {
    const reg = pushSupported() ? await registration(1500) : null
    const sub = reg ? await reg.pushManager.getSubscription() : null
    if (sub) await sub.unsubscribe()
    if (sub) await api.pushUnsubscribe().catch(() => undefined)
  } catch {
    /* 이미 꺼짐 */
  }
}

/** 지금 이 폰이 웹 푸시로 받고 있는지 */
export async function currentMode(): Promise<NotifyMode> {
  try {
    if (!pushSupported()) return 'polling'
    const reg = await registration(1500)
    const sub = reg ? await reg.pushManager.getSubscription() : null
    return sub ? 'push' : 'polling'
  } catch {
    return 'polling'
  }
}

/** 앱이 열려 있을 때 새 주차를 알게 되면: 화면이 가려져 있고 권한이 있으면 시스템 알림 */
export async function showLocalNotification(body: string, url: string) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (!document.hidden) return
    const reg = await registration(1500)
    if (reg) await reg.showNotification('주차각', { body, tag: 'parking', data: { url }, icon: `${import.meta.env.BASE_URL}icons/icon-192.png` })
  } catch {
    /* 무시 */
  }
}
