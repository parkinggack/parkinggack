/**
 * 차와 연결 (M-13 ↔ 차 C-10 › 폰 연결). 화면과 떨어진 순수 상태 기계 — pairing.test.ts.
 *
 *   차  POST /v1/pairings → QR(`${WEB}/pair/483920`) + 숫자 6자리 (10분 유효)
 *   폰  QR 찍기(앱 안 카메라 또는 기본 카메라 앱 → /pair/:code) 또는 '코드로 연결할게요' → 6자리 입력
 *   폰  POST /v1/pairings/:code/claim → { token, car } → localStorage → M-14
 *
 *   idle ──SCAN──▶ scanning ──SCANNED(pair)──▶ claiming ──CLAIMED──▶ paired
 *     │              │  └─CAMERA_FAILED──▶ entering(notice)                │
 *     └──USE_CODE──▶ entering ──TYPE(6자리)/SUBMIT──▶ claiming ──FAILED──▶ failed ──RETRY──▶ claiming
 *   LINK(code) → claiming (/pair/:code 로 열었을 때)
 */
import type { ClaimPairingResponse, PairedCar } from '@api-types'
import { ApiError, type Api } from './api/client'

export type CameraProblem = 'denied' | 'unavailable' | 'unsupported'
export type FailReason = 'not_found' | 'expired' | 'offline' | 'invalid' | 'unknown'
export type Via = 'scan' | 'code' | 'link'

export type PairState =
  | { step: 'idle' }
  | { step: 'scanning' }
  | { step: 'entering'; code: string; notice: CameraProblem | 'wrong-qr' | null }
  | { step: 'claiming'; code: string; via: Via }
  | { step: 'paired'; car: PairedCar; via: Via }
  | { step: 'failed'; code: string; via: Via; reason: FailReason }

export type PairEvent =
  | { type: 'SCAN' }
  | { type: 'SCANNED'; text: string }
  | { type: 'CAMERA_FAILED'; problem: CameraProblem }
  | { type: 'USE_CODE' }
  | { type: 'TYPE'; value: string }
  | { type: 'SUBMIT' }
  | { type: 'LINK'; code: string }
  | { type: 'CLAIMED'; car: PairedCar }
  | { type: 'FAILED'; reason: FailReason }
  | { type: 'RETRY' }
  | { type: 'RESET' }

export const CODE_LENGTH = 6

/** 입력칸: 숫자만, 6자리까지 (붙여 넣은 "483 920" · "483-920"도) */
export function cleanCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, CODE_LENGTH)
}

export const isCompleteCode = (code: string) => /^\d{6}$/.test(code)

export type Scanned =
  | { kind: 'pair'; code: string }
  /** C-07 주차 위치 QR(/p/…#…, /s/…)을 찍었을 때 — 앱 안 경로 */
  | { kind: 'share'; path: string }
  | { kind: 'unknown' }

/**
 * QR 내용 읽기. 차 QR은 `${PUBLIC_WEB_BASE}/pair/483920` — 배포 주소가 바뀌어도(미리보기 배포 등) 경로로 판단한다.
 * 숫자 6자리만 들어 있어도 코드로 받아 준다.
 */
export function parseScan(text: string): Scanned {
  const t = text.trim()
  if (/^\d{6}$/.test(t)) return { kind: 'pair', code: t }
  let url: URL
  try {
    url = new URL(t)
  } catch {
    return { kind: 'unknown' }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'unknown' }
  const pair = /\/pair\/(\d{6})\/?$/.exec(url.pathname)
  if (pair) return { kind: 'pair', code: pair[1] }
  const share = /\/(p\/[A-Za-z0-9_-]{1,32}|s\/[A-Za-z0-9]{1,16})\/?(%23.*)?$/i.exec(url.pathname)
  if (share) return { kind: 'share', path: '/' + share[1] + (url.hash || (share[2] ? '#' + share[2].slice(3) : '')) }
  return { kind: 'unknown' }
}

export function reducePairing(s: PairState, e: PairEvent): PairState {
  switch (e.type) {
    case 'RESET':
      return { step: 'idle' }
    case 'SCAN':
      return s.step === 'claiming' ? s : { step: 'scanning' }
    case 'USE_CODE':
      return s.step === 'claiming' ? s : { step: 'entering', code: '', notice: null }
    case 'CAMERA_FAILED':
      return s.step === 'scanning' || s.step === 'idle' ? { step: 'entering', code: '', notice: e.problem } : s
    case 'SCANNED': {
      if (s.step !== 'scanning') return s
      const r = parseScan(e.text)
      if (r.kind === 'pair') return { step: 'claiming', code: r.code, via: 'scan' }
      // 다른 QR은 계속 찾는다 (화면이 share 경로를 따로 처리)
      return s
    }
    case 'TYPE': {
      if (s.step !== 'entering' && s.step !== 'failed') return s
      const code = cleanCode(e.value)
      return { step: 'entering', code, notice: s.step === 'entering' ? s.notice : null }
    }
    case 'SUBMIT':
      if (s.step === 'entering' && isCompleteCode(s.code)) return { step: 'claiming', code: s.code, via: 'code' }
      return s
    case 'LINK': {
      const code = cleanCode(e.code)
      return isCompleteCode(code) ? { step: 'claiming', code, via: 'link' } : { step: 'failed', code, via: 'link', reason: 'invalid' }
    }
    case 'CLAIMED':
      return s.step === 'claiming' ? { step: 'paired', car: e.car, via: s.via } : s
    case 'FAILED':
      return s.step === 'claiming' ? { step: 'failed', code: s.code, via: s.via, reason: e.reason } : s
    case 'RETRY':
      return s.step === 'failed' && isCompleteCode(s.code) ? { step: 'claiming', code: s.code, via: s.via } : s
  }
}

export function failReason(err: unknown): FailReason {
  if (err instanceof ApiError) {
    if (err.offline) return 'offline'
    if (err.code === 'not_found') return 'not_found'
    if (err.code === 'gone') return 'expired'
    if (err.code === 'bad_request') return 'invalid'
  }
  return 'unknown'
}

/** 실패 이유 → 한 줄 (운전자를 탓하지 않음, 다음에 할 일을 말함) */
export const FAIL_TEXT: Record<FailReason, string> = {
  not_found: '이 코드에 맞는 차가 없어요. 차 화면의 숫자를 다시 확인해주세요',
  expired: '시간이 지나 코드가 바뀌었어요. 차 화면에서 새 코드를 받아주세요',
  offline: '인터넷에 연결되면 다시 해볼게요',
  invalid: '숫자 6자리를 넣어주세요',
  unknown: '잠시 뒤에 다시 해주세요',
}

/** 차 화면(C-10)에 '폰과 연결됐어요 · iPhone' 처럼 보일 이름. 모델명·번호 같은 식별값은 넣지 않는다 */
export function phoneNameFromUA(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android 폰'
  return '웹 브라우저'
}

/** claim 한 번 — 결과를 상태 기계 이벤트로 */
export async function claim(api: Api, code: string, phoneName: string): Promise<{ event: PairEvent; res?: ClaimPairingResponse }> {
  try {
    const res = await api.claimPairing(code, phoneName)
    if (!res || typeof res.token !== 'string' || !res.token) return { event: { type: 'FAILED', reason: 'unknown' } }
    return { event: { type: 'CLAIMED', car: res.car }, res }
  } catch (err) {
    return { event: { type: 'FAILED', reason: failReason(err) } }
  }
}
