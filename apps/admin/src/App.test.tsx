import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

// jsdom 에는 scrollTo 가 없다 (화면이 바뀌면 맨 위로 올리는 코드)
vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

describe('로그인 · 로그아웃 흐름 (운영자 화면 #/admin)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    location.hash = '#/admin'
  })
  afterEach(() => cleanup())

  it('토큰 없으면 로그인 화면, 빈 토큰은 막는다', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: '주차각 인사이트' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '들어가기' }))
    expect((await screen.findByRole('alert')).textContent).toContain('토큰을 넣어 주세요')
  })

  it('서버가 꺼져 있으면 연결 안내 (토큰은 저장하지 않음)', async () => {
    // 이 컴퓨터에 서버가 떠 있어도 '꺼짐'으로 (fetch 가 네트워크 오류를 던지게)
    const down = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    render(<App />)
    fireEvent.change(await screen.findByLabelText('관리자 토큰'), { target: { value: 'dev-admin-token' } })
    fireEvent.click(screen.getByRole('button', { name: '들어가기' }))
    expect((await screen.findByRole('alert', {}, { timeout: 5000 })).textContent).toMatch(/서버에 연결할 수 없어요.*ADMIN_ORIGINS/)
    expect(sessionStorage.getItem('pg-admin-token')).toBeNull()
    down.mockRestore()
  })

  it('시연 데이터로 둘러보기 → 주차장 관리 → PT 비전(W-01) → 나가기', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '서버 없이 시연 데이터로 둘러보기' }))
    expect(await screen.findByRole('heading', { name: '주차장 관리' }, { timeout: 5000 })).toBeTruthy()
    expect(sessionStorage.getItem('pg-admin-token')).toBe('dev-admin-token')
    expect(screen.getByText('예시 데이터 (서버 없음)')).toBeTruthy()
    expect(screen.getByRole('link', { name: '주차장 관리' }).getAttribute('aria-current')).toBe('page')
    expect(location.hash).toBe('#/admin/lots')

    const vision = screen.getByRole('link', { name: 'PT 비전 (이전 시안)' })
    expect(vision.getAttribute('href')).toBe('#/admin/vision')
    location.hash = '#/admin/vision'
    expect(await screen.findByRole('heading', { name: '수도권 주차장 난이도 지도' }, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'PT 비전 (이전 시안)' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: '공개 대시보드' }).getAttribute('href')).toBe('#/')

    fireEvent.click(screen.getByRole('button', { name: '나가기' }))
    expect(await screen.findByRole('button', { name: '들어가기' })).toBeTruthy()
    expect(sessionStorage.getItem('pg-admin-token')).toBeNull()
  })

  it('저장된 토큰이 401을 받으면 로그인 화면으로 돌아가며 이유를 알려 준다', async () => {
    sessionStorage.setItem('pg-admin-token', 'stale-token')
    sessionStorage.setItem('pg-admin-mock', '1') // 시연 서버는 dev-admin-token 만 받는다
    render(<App />)
    expect(await screen.findByText(/토큰이 바뀌었거나 맞지 않아요/, {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByRole('button', { name: '들어가기' })).toBeTruthy()
    expect(sessionStorage.getItem('pg-admin-token')).toBeNull()
  })
})
