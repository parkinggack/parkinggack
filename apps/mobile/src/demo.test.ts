// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { demoFromUrl } from './demo'
import { KING_KEY } from './mock/mockApi'
import { session } from './session'
import { getItem } from './storage'

describe('demoFromUrl (심사·발표용 링크 ?demo=1)', () => {
  beforeEach(() => {
    localStorage.clear()
    session.reload()
  })

  it('?demo=1 이면 온보딩 없이 시연 데이터 + 연결된 차 + 주차왕 참여 상태', () => {
    expect(demoFromUrl({ search: '?demo=1', pathname: '/start', hash: '' })).toBe(true)
    const s = session.get()
    expect(s.demo).toBe(true)
    expect(s.onboarded).toBe(true)
    expect(s.car?.name).toBe('아이오닉 5')
    expect(getItem(KING_KEY)).toBeTruthy()
  })

  it('다른 주소는 건드리지 않음', () => {
    expect(demoFromUrl({ search: '?x=1', pathname: '/', hash: '' })).toBe(false)
    expect(demoFromUrl({ search: '?demo=0', pathname: '/', hash: '' })).toBe(false)
  })

  it('예전 시연에서 "차 찾았어요"를 눌렀어도 링크로 다시 열면 지금 주차가 보임 (페이지를 새로 연 것처럼)', async () => {
    localStorage.setItem('pg:mock:found', JSON.stringify(['6f1d2a90-3c1e-4b8a-9d7e-0a5b3c2e1f07']))
    vi.resetModules() // 앞 테스트가 만든 시연 Api 없이 — 새 페이지
    const fresh = await import('./demo')
    const { api: freshApi } = await import('./api')
    ;(await import('./session')).session.reload()
    expect(fresh.demoFromUrl({ search: '?demo=1', pathname: '/', hash: '' })).toBe(true)
    const cur = await freshApi().currentParking()
    expect(cur?.lotName).toBe('아브뉴프랑 판교 주차장')
    expect(cur?.floor).toBe('B2')
  })
})
