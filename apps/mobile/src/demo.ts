/**
 * 시연 데이터로 들어가기 — M-10 '시연 데이터로 둘러보기' 버튼과 주소 `?demo=1` (심사·발표용 링크)이 같은 일을 한다.
 * 서버에는 아무것도 보내지 않는다 (mock/mockApi). 주차왕은 참여한 상태로 시작해 순위판이 바로 보인다 (설정에서 그만둘 수 있음).
 */
import { resetDemo } from './api'
import { forgetCurrent, refreshCurrent } from './data'
import { DEMO_CAR, DEMO_TOKEN } from './mock/fixtures'
import { KING_FIRST_NICKNAME } from './mock/king'
import { KING_KEY } from './mock/mockApi'
import { session } from './session'
import { setItem } from './storage'

export function enterDemo() {
  resetDemo()
  forgetCurrent()
  setItem(KING_KEY, KING_FIRST_NICKNAME)
  session.setDemo(true)
  session.setPaired(DEMO_TOKEN, { ...DEMO_CAR, pairedAt: new Date().toISOString() })
  session.setPref('share', 'on')
  session.setOnboarded(true)
  void refreshCurrent()
}

/** 주소에 `?demo=1` 이 있으면 시연 모드로 열고, 그 표시는 주소에서 지운다. 열었으면 true */
export function demoFromUrl(loc: Pick<Location, 'search' | 'pathname' | 'hash'> = location): boolean {
  const q = new URLSearchParams(loc.search)
  if (q.get('demo') !== '1') return false
  enterDemo()
  q.delete('demo')
  const rest = q.toString()
  // /start?demo=1 처럼 와도 홈으로 (온보딩은 시연에서 건너뜀)
  const path = loc.pathname.replace(/\/start\/?$/, '/')
  try {
    history.replaceState(history.state, '', path + (rest ? `?${rest}` : '') + loc.hash)
  } catch {
    /* file:// 등 */
  }
  return true
}
