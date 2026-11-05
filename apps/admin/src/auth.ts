/**
 * 로그인 상태 — 탭을 닫으면 사라지는 sessionStorage 에만 둔다 (localStorage 아님).
 * - pg-admin-token: 관리자 토큰
 * - pg-admin-mock: '1' 이면 서버 없이 시연 데이터로 보는 중 (로그인 화면의 '시연 데이터로 둘러보기')
 */
const TOKEN_KEY = 'pg-admin-token'
const MOCK_KEY = 'pg-admin-mock'

function store(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

export function getToken(): string | null {
  try {
    return store()?.getItem(TOKEN_KEY) || null
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    store()?.setItem(TOKEN_KEY, token)
  } catch {
    /* 저장이 막힌 브라우저: 이번 페이지 동안만 메모리로 (App state) */
  }
}

export function isMockSession(): boolean {
  try {
    return store()?.getItem(MOCK_KEY) === '1'
  } catch {
    return false
  }
}

export function setMockSession(on: boolean): void {
  try {
    if (on) store()?.setItem(MOCK_KEY, '1')
    else store()?.removeItem(MOCK_KEY)
  } catch {
    /* 무시 */
  }
}

export function clearSession(): void {
  try {
    store()?.removeItem(TOKEN_KEY)
    store()?.removeItem(MOCK_KEY)
  } catch {
    /* 무시 */
  }
}
