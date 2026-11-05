/**
 * 첫 실행 흐름 (M-10 → M-11 → M-12 → M-13 → M-14 → 홈). 어디서 들어와도 빠진 단계만 거쳐 홈에 닿게.
 *
 * - 차 QR을 기본 카메라 앱으로 찍어 /pair/:code 로 바로 들어온 사람: 연결 → M-14 → (익명 기록을 아직 안 골랐으면) M-12 → 홈
 * - M-13에서 '나중에 연결할게요': 홈 (연결 없이도 주차장·설정은 쓸 수 있음)
 */
import { needsPairing, opensWithoutOnboarding, type Route } from './router'

/** 지금 상태로 이 화면을 열어도 되는지 — 아니면 갈 곳 (App이 replace로 이동) */
export function redirectFor(r: Route, s: { onboarded: boolean; paired: boolean }): Route | null {
  if (!s.onboarded && !opensWithoutOnboarding(r)) return { name: 'start' }
  // 주차왕 안쪽 화면은 주차왕 탭으로 (연결 안내가 거기 있음), 나머지는 홈
  if (needsPairing(r) && !s.paired) return r.name === 'king-me' || r.name === 'king-result' ? { name: 'king' } : { name: 'home' }
  if (r.name === 'notfound') return { name: 'home' }
  return null
}

export interface FlowState {
  paired: boolean
  /** 익명 기록 보내기를 골랐는지 (M-12) */
  shareChosen: boolean
}

/** M-12 '보낼게요' / '나만 볼게요' 다음 */
export function afterShareChoice(s: FlowState): Route {
  return s.paired ? { name: 'home' } : { name: 'connect' }
}

/** M-14 '알림 받을게요' / '나중에' 다음 */
export function afterConnected(s: FlowState): Route {
  return s.shareChosen ? { name: 'home' } : { name: 'start-share' }
}

/** 이 화면에 닿으면 첫 실행을 끝낸 것으로 */
export function finishesOnboarding(r: Route): boolean {
  return r.name === 'home' || r.name === 'lots' || r.name === 'king' || r.name === 'records' || r.name === 'settings'
}
