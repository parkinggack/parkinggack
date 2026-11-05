import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../api'
import { DataProvider } from '../data'
import { formatNumber } from '../format'
import { createMockDb, type MockDb } from '../mock/fixtures'
import { createMockFetch } from '../mock/mockFetch'
import { Dashboard } from './Dashboard'

const NOW = Date.parse('2026-11-03T08:02:00Z') // 오후 5:02 KST

function renderDashboard(db: MockDb) {
  const client = createApiClient({
    baseUrl: 'http://localhost:8787',
    getToken: () => 'dev-admin-token',
    fetchImpl: createMockFetch(() => db),
  })
  return render(
    <DataProvider client={client}>
      <Dashboard />
    </DataProvider>,
  )
}

describe('W-01 대시보드 (시연 데이터로 렌더)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('합계 · 지도 · 순위 · 분포 · 최근 기록 · 비전을 그린다', async () => {
    const db = createMockDb(NOW)
    renderDashboard(db)

    // 합계 (서버 값 그대로)
    const lotsKpi = await screen.findByRole('region', { name: '기록된 주차장' })
    expect(within(lotsKpi).getByText(`${db.lots.length}곳`)).toBeTruthy()
    const recKpi = screen.getByRole('region', { name: '누적 주차 기록' })
    expect(within(recKpi).getByText(`${formatNumber(db.records.length)}건`)).toBeTruthy()
    expect(screen.getByRole('region', { name: '평균 난이도' }).textContent).toMatch(/★\d\.\d/)

    // 지도: 타일 없이(테스트 환경 VITE_TILE_URL=none) SVG 단순 그림, 주차장마다 링크
    expect(screen.getByRole('heading', { name: '수도권 주차장 난이도 지도' })).toBeTruthy()
    const pin = screen.getByRole('link', { name: '현대백화점 판교점 지하주차장, ★4.3 어려움, 최근 30일 142대' })
    expect(pin.getAttribute('href')).toBe('#/admin/lots/hyundai-pangyo')
    expect(screen.getByRole('link', { name: /판교 테크원 주차장, 기록 적음/ })).toBeTruthy()
    expect(screen.getByText(/시연 데이터 49곳 포함/)).toBeTruthy()

    // 까다로운 순위: 현대백화점 ★4.3 이 1위
    const rank = screen.getByRole('region', { name: '까다로운 주차장 순위' })
    const items = within(rank).getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items[0].textContent).toContain('현대백화점 판교점 지하주차장')
    expect(items[0].textContent).toContain('★4.3')
    expect(items[0].textContent).toContain('회전 램프 좁음 · 기둥 많음')

    // 편한 순위
    const easy = screen.getByRole('region', { name: '편한 주차장 순위' })
    expect(within(easy).getAllByRole('listitem')[0].textContent).toContain('★1.4')

    // 시간대·요일 분포 (숨은 표 = 화면 낭독기용)
    const hourTable = screen.getByRole('table', { name: '시간대별 주차 기록 수' })
    expect(within(hourTable).getAllByRole('row')).toHaveLength(24)
    const weekday = screen.getByRole('table', { name: '요일별 주차 기록 수' })
    expect(within(weekday).getAllByRole('row').map((r) => r.querySelector('th')?.textContent)).toEqual(['월', '화', '수', '목', '금', '토', '일'])

    // 최근 기록: 4분 전 실제 기록이 맨 위
    const recent = screen.getByRole('region', { name: '방금 들어온 기록' })
    const first = within(recent).getAllByRole('listitem')[0]
    expect(first.textContent).toContain('4분 전')
    expect(first.textContent).toContain('현대백화점 판교점 지하주차장')
    expect(first.textContent).toContain('실제')

    // PT 비전 (시안 문구)
    expect(screen.getByRole('heading', { name: '주차하다 헤맨 흔적이 진짜 주차장 지도가 돼요' })).toBeTruthy()
    expect(screen.getByText('비전 · 실제 구현 아님')).toBeTruthy()
  })

  it('숫자는 서버 값을 따른다 (하드코딩 없음)', async () => {
    const db = createMockDb(NOW)
    const lot = db.lots.find((l) => l.id === 'avenue-france-pangyo')!
    lot.difficulty = 4.9
    lot.tags = ['MECHANICAL']
    renderDashboard(db)
    const rank = await screen.findByRole('region', { name: '까다로운 주차장 순위' })
    const first = within(rank).getAllByRole('listitem')[0]
    expect(first.textContent).toContain('아브뉴프랑 판교 주차장')
    expect(first.textContent).toContain('★4.9')
    expect(first.textContent).toContain('기계식')
  })

  it('기록이 하나도 없는 새 서버에서도 그린다', async () => {
    const db = createMockDb(NOW)
    db.lots = []
    db.records = []
    renderDashboard(db)
    const lotsKpi = await screen.findByRole('region', { name: '기록된 주차장' })
    expect(lotsKpi.textContent).toContain('0곳')
    expect(screen.getByRole('region', { name: '평균 난이도' }).textContent).toContain('–')
    expect(screen.getAllByText('아직 점수가 나온 주차장이 없어요')).toHaveLength(2)
    expect(screen.getByText(/아직 들어온 기록이 없어요/)).toBeTruthy()
  })

  it('서버 오류면 다시 불러오기 버튼', async () => {
    const client = createApiClient({
      baseUrl: 'http://localhost:8787',
      getToken: () => 't',
      fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'internal', message: '잠깐 문제가 있어요' } }), { status: 500 }),
    })
    render(
      <DataProvider client={client}>
        <Dashboard />
      </DataProvider>,
    )
    expect((await screen.findByRole('alert')).textContent).toContain('잠깐 문제가 있어요')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
  })
})
