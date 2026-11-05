/**
 * 웹 푸시 (M-14 "알림 받을게요"). VAPID 키(VAPID_PUBLIC_KEY·VAPID_PRIVATE_KEY·VAPID_SUBJECT)가 없으면 꺼짐:
 * GET /v1/push/key → 404, 보내기는 아무것도 안 함. 키 만들기: npx web-push generate-vapid-keys
 */
import type { PushMessage } from '@parkinggack/api-types'
import webpush from 'web-push'
import type { Config } from './config.js'

export type { PushMessage }

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

/** ok · gone(구독이 없어짐 → 지움) · error(나중에 다시) */
export type PushOutcome = 'ok' | 'gone' | 'error'

export interface PushSender {
  readonly publicKey: string | null
  send(target: PushTarget, msg: PushMessage): Promise<PushOutcome>
}

export const noPush: PushSender = { publicKey: null, send: async () => 'error' }

export function createPushSender(config: Pick<Config, 'vapid'>): PushSender {
  const v = config.vapid
  if (!v) return noPush
  const details = { subject: v.subject, publicKey: v.publicKey, privateKey: v.privateKey }
  return {
    publicKey: v.publicKey,
    async send(t, msg) {
      try {
        await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, JSON.stringify(msg), {
          vapidDetails: details,
          TTL: 6 * 3600,
          urgency: 'normal',
          timeout: 4000,
        })
        return 'ok'
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        return status === 404 || status === 410 ? 'gone' : 'error'
      }
    },
  }
}
