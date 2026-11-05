import { DEMO_NOW } from '@insights-demo'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { createMockDb } from '../mock/fixtures'
import { createMockFetch } from '../mock/mockFetch'
import { parseHash } from '../router'
import { DashboardApp } from './DashboardApp'
import type { ExportFile } from './export/files'
import { oneShotPct } from './v2demo'

// 내려받기는 브라우저 대신 여기에 모은다
const { saved } = vi.hoisted(() => ({ saved: [] as ExportFile[] }))
vi.mock('./export/files', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./export/files')>()
  return { ...mod, saveFile: (f: ExportFile) => { saved.push(f) } }
})

// jsdom 에는 scrollTo · scrollIntoView 가 없다
vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
Element.prototype.scrollIntoView = () => {}

const db = createMockDb(DEMO_NOW)
const mockFetch = createMockFetch(() => db, { now: () => DEMO_NOW })

function renderAt(hash: string) {
  location.hash = hash
  return render(<DashboardApp route={parseHash(hash)} initialMock mockFetch={mockFetch} />)
}

const text = (b: Uint8Array) => new TextDecoder().decode(b)

describe('D-10 난이도 한눈에 (시연 데이터)', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => cleanup())

  it('머리글 · 요약 4칸 · 난이도 자 · 카드 정렬 · 눈에 띄는 변화 · 내보내기 안내', async () => {
    renderAt('#/')
    expect(await screen.findByRole('heading', { level: 1, name: '주차 난이도 한눈에' })).toBeTruthy()
    expect(screen.getByText(/^판교 일대 · \d{4}년 \d+월 \d+일 ~ /)).toBeTruthy()
    expect(screen.getByText('9곳에서 6,388번의 주차를 차가 직접 기록했어요. 후진·핸들·걸린 시간으로 매긴 점수예요.')).toBeTruthy()

    // 메뉴 4개 (시안 순서) · 시연 표시 · 지역 · 기간
    const nav = screen.getByRole('navigation', { name: '대시보드 메뉴' })
    expect(within(nav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['난이도 한눈에', '#/'], ['주차장 상세', '#/lots/hyundai-pangyo'], ['데이터 내보내기', '#/export'], ['비교표', '#/compare'],
    ])
    expect(within(nav).getByRole('link', { name: '난이도 한눈에' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('시연용 예시 데이터')).toBeTruthy()
    expect((screen.getByLabelText('지역') as HTMLSelectElement).selectedOptions[0].textContent).toBe('판교 일대 · 9곳')
    expect((screen.getByLabelText('기간') as HTMLSelectElement).value).toBe('30')
    expect(screen.getByRole('link', { name: /이 화면 데이터 받기/ }).getAttribute('href')).toBe('#/export?lot=all')

    // 요약: 평균 난이도(기록 수로 가중) · 기록 · 한 번에(시연 값) · 후진 다발 지점(API, 주차장마다 불러옴)
    const kpis = screen.getByRole('region', { name: '요약' })
    expect(kpis.textContent).toContain('평균 난이도3.2보통지난달 3.4에서 0.2 쉬워졌어요')
    expect(kpis.textContent).toContain('주차 기록6,388건지난달보다 12% 늘었어요')
    expect(kpis.textContent).toContain('한 번에 들어간 비율61%후진 1회 이하로 끝난 주차')
    await waitFor(() => expect(kpis.textContent).toContain('후진 다발 지점34곳어려운 4곳에 25곳이 몰려 있어요'))

    // 난이도 자: 어려운 순 9줄, 이름은 상세로
    const ruler = screen.getByRole('region', { name: '9곳이 어디쯤 있나요' })
    const rows = within(ruler).getAllByRole('listitem')
    expect(rows).toHaveLength(9)
    expect(rows[0].textContent).toBe('1현대백화점 판교점 지하난이도 4.3 어려움1,284건')
    expect(within(rows[8]).getByRole('link').textContent).toBe('9백현마을 5단지')
    expect(within(rows[0]).getByRole('link').getAttribute('href')).toBe('#/lots/hyundai-pangyo')

    // 카드: 정렬 3가지 (aria-pressed), 작은 평면의 후진 다발 수
    const cards = screen.getByRole('region', { name: '주차장별로 보기' })
    const names = () => within(cards).getAllByRole('link').map((a) => a.querySelector('.v2-card__name')?.textContent)
    const sort = within(cards).getByRole('group', { name: '정렬' })
    expect(within(sort).getByRole('button', { name: '어려운 순' }).getAttribute('aria-pressed')).toBe('true')
    expect(names().slice(0, 3)).toEqual(['현대백화점 판교점 지하', '유스페이스', 'H스퀘어'])
    const hyundai = within(cards).getAllByRole('link')[0]
    expect(hyundai.textContent).toContain('백화점 · 지하 1~6층')
    expect(hyundai.textContent).toContain('6개월 전보다 0.1 쉬워짐')
    expect(hyundai.textContent).toContain('평균 후진3.2회평균 시간2분 10초기록1,284건')
    expect(hyundai.textContent).toContain('후진 다발 10곳')
    fireEvent.click(within(sort).getByRole('button', { name: '기록 많은 순' }))
    expect(within(sort).getByRole('button', { name: '기록 많은 순' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(sort).getByRole('button', { name: '어려운 순' }).getAttribute('aria-pressed')).toBe('false')
    expect(names().slice(0, 3)).toEqual(['현대백화점 판교점 지하', '아브뉴프랑 판교', '알파돔타워'])
    fireEvent.click(within(sort).getByRole('button', { name: '많이 좋아진 순' }))
    expect(names()[0]).toBe('화랑공원 공영')
    const avenue = within(cards).getAllByRole('link').find((a) => a.textContent?.includes('아브뉴프랑'))!
    expect(avenue.textContent).toContain('후진 다발 지점 없음')
    const hwarang = within(cards).getAllByRole('link')[0]
    expect(hwarang.textContent).toContain('공영 · 지상 평면')

    const changes = screen.getByRole('region', { name: '이번 달 눈에 띄는 변화' })
    expect(within(changes).getAllByRole('listitem')).toHaveLength(4)
    expect(within(changes).getByRole('link', { name: '현대백화점 판교점 · B2 램프 출구 보기' }).getAttribute('href')).toBe('#/lots/hyundai-pangyo?floor=B2')
    expect(changes.textContent).toContain('기록이 5건보다 적은 칸 212개')

    const cta = screen.getByRole('region', { name: /보고 있는 숫자를/ })
    expect(within(cta).getByRole('list', { name: '받을 수 있는 형식' }).textContent).toBe('CSVExcelParquetGeoJSONAPI')
    expect(within(cta).getByRole('link', { name: /내보내기 시작/ }).getAttribute('href')).toBe('#/export')
    expect(cta.textContent).toContain('최근: 11월 3일 · 주차 세션 요약 1,284행 · CSV')
  })
})

describe('D-11 주차장 상세 (시연 데이터)', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => cleanup())

  it('머리 · 층 고르기(가장 어려운 B2 먼저) · 평면 · 보기 켜고 끄기 · 지점 목록 · 아래 카드', async () => {
    renderAt('#/lots/hyundai-pangyo')
    expect(await screen.findByRole('heading', { level: 1, name: '현대백화점 판교점 지하주차장' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '위치' }).textContent).toBe('난이도 한눈에›현대백화점 판교점 지하')
    await waitFor(() => expect(screen.getByText('최근 30일 · 1,284대 · 지하 1~6층 · 판교 9곳 중 가장 어려움')).toBeTruthy())
    expect(screen.getByRole('button', { name: '리포트 PDF' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /이 주차장 데이터 내보내기/ }).getAttribute('href')).toBe('#/export?lot=hyundai-pangyo')

    const floors = screen.getByRole('group', { name: '층 고르기' })
    expect(within(floors).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'B1난이도 3.4', 'B2난이도 4.6', 'B3난이도 4.5', 'B4난이도 4.1', 'B5난이도 4.0', 'B6난이도 3.8',
    ])
    expect(within(floors).getByRole('button', { name: /B2/ }).getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByRole('heading', { name: 'B2 평면 위에 360대의 동선을 겹쳤어요' })).toBeTruthy()
    expect(screen.getByText(`난이도 4.6 · 평균 후진 3.6회 · 한 번에 들어간 비율 ${oneShotPct(3.6)}%`)).toBeTruthy()
    expect(screen.getByRole('img', { name: /현대백화점 판교점 지하 B2 평면에 360대의 동선을 겹친 그림/ })).toBeTruthy()

    // 지점: 평면 버튼 3개 + 목록 3개, 처음엔 1번 (개선한 자리라 그 이야기)
    const spots = screen.getByRole('region', { name: 'B2에서 후진이 잦은 곳' })
    const items = within(spots).getAllByRole('button')
    expect(items.map((b) => b.querySelector('.v2-spot__title')?.textContent)).toEqual(['램프 나와서 바로 왼쪽', 'C 구역 기둥 사이', 'E 구역 끝 칸'])
    expect(items[0].getAttribute('aria-pressed')).toBe('true')
    expect(items[0].textContent).toContain('B2 · 회전 직후 시야가 좁아요2.8회이 자리에서 평균 후진')
    expect(items[0].textContent).toContain('9월 22일 반사경을 단 뒤 후진이 줄고 있어요')
    fireEvent.click(items[1])
    expect(items[1].getAttribute('aria-pressed')).toBe('true')
    expect(items[1].textContent).toContain('기둥 쪽 칸 폭 표시선을 다시 칠하거나')
    expect(screen.getByRole('button', { name: '2번 지점 · C 구역 기둥 사이' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '3번 지점 · E 구역 끝 칸' }))
    expect(items[2].getAttribute('aria-pressed')).toBe('true')

    // 보기 켜고 끄기
    const layers = screen.getByRole('group', { name: '평면에 보일 것' })
    expect(within(layers).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['동선', 'true'], ['후진 구간', 'true'], ['몰리는 곳', 'true'],
    ])
    fireEvent.click(within(layers).getByRole('button', { name: '몰리는 곳' }))
    expect(within(layers).getByRole('button', { name: '몰리는 곳' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: /번 지점/ })).toBeNull()
    fireEvent.click(within(layers).getByRole('button', { name: '동선' }))
    expect((document.querySelector('canvas[data-layer="fwd"]') as HTMLCanvasElement).hidden).toBe(true)
    expect((document.querySelector('canvas[data-layer="rev"]') as HTMLCanvasElement).hidden).toBe(false)

    // 아래 카드 (시연 값은 층 평균 후진에서)
    expect(screen.getByRole('region', { name: '어느 방향으로 대나요' }).textContent).toContain('B2 · 다 대고 난 차의 방향')
    expect(screen.getByRole('img', { name: `100대 중 ${oneShotPct(3.6)}대` })).toBeTruthy()
    expect(screen.getByRole('region', { name: '한 번에 들어간 비율' }).textContent).toContain('판교 9곳 평균 61%')
    expect(screen.getByRole('region', { name: '들어와서 대기까지' }).textContent).toContain('주차장 전체 · 평균 2분 10초')
    expect(screen.getByRole('img', { name: /2분에서 2분 30초 사이가 가장 많음/ })).toBeTruthy()
    expect(screen.getByRole('region', { name: '차 크기별 평균 후진' }).textContent).toContain('경차2.1회소형2.6회중형3.1회대형3.8회SUV3.6회')
    expect(screen.getByRole('img', { name: /요일·시간대별 난이도. 가장 진한 칸은 토요일 16시/ })).toBeTruthy()
    const imp = screen.getByRole('region', { name: '바꾸고 나서 좋아졌나요' })
    expect(imp.textContent).toContain('B2 램프 출구(1번 지점) · 주별 평균 후진')
    expect(imp.textContent).toContain('0.7회 줄었어요')
    expect(within(imp).getByRole('img', { name: '9월 22일 반사경 설치 전 6주 평균 후진 3.5회, 설치 후 6주 평균 2.8회' })).toBeTruthy()
    expect(screen.getByText('동선은 차속·핸들 각도·기어로 계산해 다시 그린 그림이에요. 5대보다 적게 댄 칸과 시간대는 보여 주지 않아요.')).toBeTruthy()

    // 층을 바꾸면 주소(?floor=)에 남고, 그 층 동선을 따로 불러온다
    fireEvent.click(within(floors).getByRole('button', { name: /B4/ }))
    expect(location.hash).toBe('#/lots/hyundai-pangyo?floor=B4')
    cleanup()
    renderAt('#/lots/hyundai-pangyo?floor=B4')
    expect(await screen.findByRole('heading', { name: 'B4 평면 위에 210대의 동선을 겹쳤어요' })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'B4에서 후진이 잦은 곳' })).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('group', { name: '층 고르기' }).querySelector('[aria-pressed="true"]')?.textContent).toBe('B4난이도 4.1')
  })

  it('지상 한 층 · 개선 기록 없는 곳, #/lots 는 가장 어려운 곳으로, 없는 주차장은 차분한 안내', async () => {
    renderAt('#/lots/hwarang-park-public')
    expect(await screen.findByRole('heading', { name: '1F 평면 위에 402대의 동선을 겹쳤어요' })).toBeTruthy()
    expect(screen.getByText(/지상 평면 · 판교 9곳 중 6번째로 어려움$/)).toBeTruthy()
    expect(screen.getByRole('region', { name: '바꾸고 나서 좋아졌나요' }).textContent).toContain('아직 시설을 바꾼 기록이 없어요')
    cleanup()

    renderAt('#/lots')
    await waitFor(() => expect(location.hash).toBe('#/lots/hyundai-pangyo'))
    cleanup()

    renderAt('#/lots/nope')
    expect(await screen.findByRole('heading', { name: '찾는 주차장이 없어요' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '처음 화면으로 돌아가기' })).toBeTruthy()
  })
})

describe('D-12 데이터 내보내기 (시연 데이터)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    saved.length = 0
  })
  afterEach(() => cleanup())

  const cta = () => document.querySelector('.v2-cta') as HTMLButtonElement
  const summary = () => document.querySelector('.v2-summary__value')?.textContent
  const summarySub = () => document.querySelector('.v2-summary__sub')?.textContent

  it('데이터 종류 · 기간 · 형식 · 받는 방법이 실제로 바뀐다', async () => {
    renderAt('#/export?lot=hyundai-pangyo')
    expect(await screen.findByRole('heading', { level: 1, name: '데이터 내보내기' })).toBeTruthy()
    expect(screen.getByText('현대백화점 판교점 지하 · 운영사 계정')).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: '대시보드 메뉴' })
    expect(within(nav).getByRole('link', { name: '데이터 내보내기' }).getAttribute('aria-current')).toBe('page')

    // 1 무엇을: 기본은 세션 요약 + 이벤트, 줄 수는 만든 파일에서
    const sessions = screen.getByRole('checkbox', { name: /주차 세션 요약/ }) as HTMLInputElement
    expect(sessions.checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /동선 좌표/ }) as HTMLInputElement).checked).toBe(false)
    await waitFor(() => expect(sessions.closest('label')!.textContent).toContain('1,284행'))
    expect(summary()).toMatch(/^2종 · [\d,]+줄 · 약 \d+KB$/)
    expect(summarySub()).toBe('CSV · 최근 30일 · 현대백화점 판교점 지하 · 전체 층 · 시연용 예시')
    expect(cta().textContent).toBe('CSV 파일 만들기')

    // 미리보기 = 파일 앞 5줄 (30분 단위 시각, 개인 정보 열 없음)
    const preview = screen.getByRole('table', { name: '주차 세션 요약 앞 5줄' })
    expect(within(preview).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'session_id', 'floor', 'bay_id', 'entered_at', 'reverse_n', 'steer_turns', 'duration_s', 'car_class', 'one_shot',
    ])
    expect(within(preview).getAllByRole('row')).toHaveLength(6)
    expect(within(preview).getAllByRole('row')[1].textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:(00|30)/)
    const tabs = screen.getByRole('group', { name: '미리볼 데이터' })
    fireEvent.click(within(tabs).getByRole('button', { name: '후진·급정지 이벤트' }))
    expect(screen.getByRole('table', { name: '후진·급정지 이벤트 앞 5줄' })).toBeTruthy()

    // 동선 좌표를 더하면 3종, 미리보기 탭도
    fireEvent.click(screen.getByRole('checkbox', { name: /동선 좌표/ }))
    expect(summary()).toMatch(/^3종 · [\d.]+만줄 · 약 [\d.]+MB$/)
    expect(within(tabs).getAllByRole('button').map((b) => b.textContent)).toEqual(['주차 세션 요약', '동선 좌표', '후진·급정지 이벤트'])

    // 기간: 7일이면 그 기간 API 기록 수
    fireEvent.click(within(screen.getByRole('group', { name: '기간' })).getByRole('button', { name: '7일' }))
    await waitFor(() => expect(sessions.closest('label')!.textContent).toContain('300행'))
    expect(summarySub()).toContain('· 최근 7일 ·')

    // 층 · 차 크기 거르기
    fireEvent.click(within(screen.getByRole('group', { name: '층' })).getByRole('button', { name: 'B2' }))
    expect(summarySub()).toContain('· B2 ·')
    fireEvent.click(within(screen.getByRole('group', { name: '차 크기' })).getByRole('button', { name: 'SUV' }))
    expect(summarySub()).toContain('· B2 · SUV만 ·')
    fireEvent.click(within(screen.getByRole('group', { name: '층' })).getByRole('button', { name: '전체' }))
    expect(summarySub()).toContain('· 전체 층 · SUV만 ·')

    // 3 형식
    fireEvent.click(screen.getByRole('radio', { name: /Excel/ }))
    expect(cta().textContent).toBe('Excel 파일 만들기')
    expect(summarySub()).toMatch(/^Excel · /)
    fireEvent.click(screen.getByRole('radio', { name: /GeoJSON/ }))
    expect(screen.getByText('GeoJSON에는 동선 좌표와 후진·급정지 이벤트만 담겨요. 나머지는 CSV로 함께 묶어 드려요.')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Parquet/ }))
    expect(cta().textContent).toBe('Parquet 파일 만들기')
    fireEvent.click(screen.getByRole('radio', { name: /^API/ }))
    expect(cta().textContent).toBe('API 주소 보기')
    expect(screen.getByText(/API는 시스템이 직접 가져가는 방법이라 파일을 만들지 않아요/)).toBeTruthy()

    // 4 받는 방법: 매주 자동은 켜지 않는다고 말한다
    fireEvent.click(screen.getByRole('radio', { name: /CSV/ }))
    fireEvent.click(screen.getByRole('radio', { name: /매주 자동/ }))
    expect(cta().disabled).toBe(true)
    expect(cta().textContent).toBe('매주 자동은 시연 화면에서 켜지 않아요')
    fireEvent.click(screen.getByRole('radio', { name: /지금 한 번/ }))
    expect(cta().disabled).toBe(false)

    // 다 빼면 고르라고
    for (const name of [/주차 세션 요약/, /동선 좌표/, /후진·급정지 이벤트/]) fireEvent.click(screen.getByRole('checkbox', { name }))
    expect(cta().textContent).toBe('데이터를 골라 주세요')
    expect(cta().disabled).toBe(true)
    expect(screen.getByText('왼쪽에서 받을 데이터를 하나 이상 골라 주세요')).toBeTruthy()

    // API 안내는 그림뿐: 키는 가려 두고 새로 만들지 않는다
    const api = screen.getByRole('region', { name: '시스템에서 바로 가져가기' })
    expect(api.querySelector('pre')!.textContent).toMatch(/^GET \/v1\/lots\/hyundai-pangyo\/sessions\n {4}\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}\nAuthorization: Bearer pk_live_••••••••3f9a$/)
    fireEvent.click(within(api).getByRole('button', { name: '키 새로 만들기' }))
    expect(within(api).getByRole('status').textContent).toBe('시연 화면이라 새 키를 만들지 않아요. 위 키도 가려 둔 예시예요.')
  })

  it('CSV 를 실제로 만들어 내려받고, 파일은 개인정보 규칙을 따른다', async () => {
    renderAt('#/export?lot=hyundai-pangyo')
    const sessions = await screen.findByRole('checkbox', { name: /주차 세션 요약/ })
    await waitFor(() => expect(sessions.closest('label')!.textContent).toContain('1,284행'))
    fireEvent.click(screen.getByRole('checkbox', { name: /후진·급정지 이벤트/ })) // 세션 요약만
    fireEvent.click(screen.getByRole('button', { name: 'CSV 파일 만들기' }))
    expect(await screen.findByText(/^파일을 만들었어요 · parkinggack_hyundai-pangyo_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_sessions\.csv · \d+KB$/)).toBeTruthy()
    expect(saved).toHaveLength(1)
    const f = saved[0]
    expect(f.mime).toBe('text/csv;charset=utf-8')
    const lines = text(f.bytes).split('\r\n').filter(Boolean)
    expect(lines[0]).toBe('session_id,floor,bay_id,entered_at,reverse_n,steer_turns,duration_s,car_class,one_shot')
    expect(lines).toHaveLength(1285)
    const rows = lines.slice(1).map((l) => l.split(','))
    // 시각은 30분 단위
    expect(rows.every((r) => /^\d{4}-\d{2}-\d{2} \d{2}:(00|30)$/.test(r[3]))).toBe(true)
    // 5대 미만 칸은 구역만: 칸 번호가 남은 칸은 모두 5번 이상 나온다
    const perBay = new Map<string, number>()
    for (const r of rows) if (/\d/.test(r[2])) perBay.set(`${r[1]}|${r[2]}`, (perBay.get(`${r[1]}|${r[2]}`) ?? 0) + 1)
    expect([...perBay.values()].every((n) => n >= 5)).toBe(true)
    expect(rows.some((r) => /^[A-H]$/.test(r[2]))).toBe(true)
    // 위경도 · 차량번호 · VIN 없음
    expect(text(f.bytes)).not.toMatch(/lat|lng|gps|vin|plate|차량번호/i)

    // 내보낸 기록의 '받기'도 같은 조건으로 다시 만든다 (Excel · GeoJSON)
    const hist = screen.getByRole('region', { name: '내보낸 기록' })
    const rowsUi = within(hist).getAllByRole('row').slice(1)
    expect(rowsUi.map((r) => r.querySelectorAll('td')[0].textContent)).toEqual(['11월 3일 15:12', '11월 2일 06:00', '10월 26일 06:00', '10월 21일 10:40', '10월 14일 09:05'])
    expect(rowsUi[0].textContent).toContain('주차 세션 요약1,284행CSV')
    expect(rowsUi[4].textContent).toContain('보관 끝남')
    fireEvent.click(within(hist).getByRole('button', { name: '11월 2일 06:00 칸별 집계 받기' }))
    await waitFor(() => expect(saved).toHaveLength(2))
    expect(saved[1].name).toBe('parkinggack_hyundai-pangyo_2026-10-27_2026-11-02_bays.xlsx')
    expect(String.fromCharCode(saved[1].bytes[0], saved[1].bytes[1])).toBe('PK')
    fireEvent.click(within(hist).getByRole('button', { name: '10월 21일 10:40 후진·급정지 이벤트 받기' }))
    await waitFor(() => expect(saved).toHaveLength(3))
    const geo = JSON.parse(text(saved[2].bytes))
    expect(geo.coordinate_system).toMatch(/입구를 \(0, 0\)으로 둔 상대 좌표/)
    expect(geo.features.every((x: { properties: { at: string } }) => /:(00|30)$/.test(x.properties.at))).toBe(true)
  })

  it('여러 주차장: 주차장 더하기 · 빼기 (주소에 남김), lot=all 은 판교 9곳', async () => {
    renderAt('#/export?lot=hyundai-pangyo')
    fireEvent.click(await screen.findByRole('button', { name: '주차장 더하기' }))
    fireEvent.click(within(screen.getByRole('group', { name: '더할 주차장' })).getByRole('button', { name: '+ 유스페이스' }))
    expect(location.hash).toBe('#/export?lot=hyundai-pangyo%2Cu-space-pangyo')
    cleanup()
    renderAt('#/export?lot=all')
    expect(await screen.findByText('판교 일대 9곳 · 운영사 계정')).toBeTruthy()
    expect(screen.getByRole('button', { name: '유스페이스 빼기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '주차장 더하기' })).toBeNull()
  })
})

describe('D-03 비교표', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => cleanup())

  it('9곳 어려운 순 · 시안 열 · 유형 칩 · 열 정렬', async () => {
    renderAt('#/compare')
    const table = await screen.findByRole('table')
    expect(screen.getByText('판교 일대 9곳 · 어려운 순')).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: '대시보드 메뉴' })
    expect(within(nav).getByRole('link', { name: '비교표' }).getAttribute('aria-current')).toBe('page')
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent?.replace(/[▲▼]/g, ''))).toEqual([
      '주차장', '유형', '난이도', '평균 후진', '램프', '평균 시간', '기록', '6개월 후진 추이',
    ])
    const body = () => within(table).getAllByRole('row').slice(1)
    expect(body()).toHaveLength(9)
    expect([...body()[0].querySelectorAll('td')].slice(0, 7).map((td) => td.textContent)).toEqual([
      '현대백화점 판교점 지하', '백화점', '4.3어려움', '3.2회', '2.5바퀴', '2분 10초', '1,284',
    ])
    expect(body().map((r) => r.querySelectorAll('td')[4].textContent)).toEqual([
      '2.5바퀴', '1.5바퀴', '2바퀴', '1바퀴', '없음', '없음', '직선', '직선', '없음',
    ])

    const recordsTh = within(table).getByRole('columnheader', { name: /기록/ })
    fireEvent.click(within(recordsTh).getByRole('button'))
    expect(recordsTh.getAttribute('aria-sort')).toBe('descending')
    expect(screen.getByText('판교 일대 9곳 · 기록 많은 순')).toBeTruthy()
    fireEvent.click(within(recordsTh).getByRole('button'))
    expect(body()[0].querySelector('a')?.textContent).toBe('봇들마을 상가')

    const chips = screen.getByRole('group', { name: '유형' })
    fireEvent.click(within(chips).getByRole('button', { name: '오피스' }))
    expect(location.hash).toBe('#/compare?type=office')
    cleanup()
    renderAt('#/compare?type=retail')
    await screen.findByRole('table')
    expect(screen.getByText('판교 일대 3곳 · 어려운 순')).toBeTruthy()
    expect(screen.getByRole('button', { name: '백화점·상가' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('서버 연결 · 주소', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => cleanup())

  it('서버에 연결이 안 되면 오류 화면 대신 바로 시연 데이터 (머리글이 알리고 서버로 돌아갈 수 있음)', async () => {
    const down = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    location.hash = '#/'
    render(<App />)
    expect(await screen.findByRole('heading', { name: '주차 난이도 한눈에' }, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByText(/지금은 서버 없이 이 브라우저 안의 시연 데이터로 보고 있어요/)).toBeTruthy()
    expect(sessionStorage.getItem('pg-dash-mock')).toBe('1')
    expect(screen.getByRole('button', { name: '서버 데이터로 다시 보기' })).toBeTruthy()
    expect(down).toHaveBeenCalledWith('http://localhost:8787/v1/insights/overview?region=pangyo&days=30', expect.objectContaining({ method: 'GET' }))
    down.mockRestore()
  })

  it('예전 운영자 주소는 #/admin 아래로', async () => {
    location.hash = '#/records?lot=hyundai-pangyo'
    render(<App />)
    await screen.findByRole('heading', { name: '주차각 인사이트' })
    expect(location.hash).toBe('#/admin/records?lot=hyundai-pangyo')
  })
})
