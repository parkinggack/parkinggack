// @vitest-environment jsdom
/**
 * 앱 전체를 jsdom에 띄워 흐름을 끝까지 눌러 본다 (시연 데이터 또는 가짜 fetch).
 * 모듈 상태(세션·시연 Api)를 매번 새로 하려고 vi.resetModules 후 동적 import — JSX 대신 h()로 (preact 인스턴스를 하나로).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const VECTOR_HASH =
  '#eyJ2IjoxLCJsb3QiOiLslYTruIzribTtlITrnpEg7YyQ6rWQIOyjvOywqOyepSIsImYiOiJCMiIsInoiOiJEIiwibiI6IjA3IiwidCI6MTc5MzY4NTEyMDAwMCwibSI6IuyXmOumrOuyoOydtO2EsCAy67KIIOyqvSIsImgiOlsi656o7ZSE66W8IOuLpCDrgrTroKTsmYDshJwg6rOn7J6lIiwi7Jik66W47Kq9IOy5uCDspIQsIOyVvSAxNW0g7KeA7KCQIl0sInIiOlsxLDE3LC0xXX0'
const DEMO = { 'pg:demo': '1' }
const PAIRED_DEMO = { ...DEMO, 'pg:onboarded': '1', 'pg:token': 'demo-phone-token', 'pg:pref:share': 'on' }

let unmount: (() => void) | null = null

afterEach(() => {
  unmount?.()
  unmount = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function boot(path: string, store: Record<string, string> = {}) {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
  for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v)
  window.scrollTo = () => {}
  history.replaceState(null, '', path)
  document.body.innerHTML = '<div id="app"></div>'
  const { h, render } = await import('preact')
  const { App } = await import('./App')
  const { initRouter } = await import('./router')
  initRouter()
  const el = document.getElementById('app')!
  render(h(App, null), el)
  unmount = () => render(null, el)
  return el
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const text = () => document.body.textContent ?? ''

async function see(s: string, ms = 2500) {
  const t0 = Date.now()
  while (!text().includes(s)) {
    if (Date.now() - t0 > ms) throw new Error(`"${s}" 가 안 보여요. 지금: ${location.pathname} — ${text().slice(0, 300)}`)
    await sleep(20)
  }
}

function click(label: string) {
  const el = [...document.querySelectorAll<HTMLElement>('button, a')].find((b) => (b.textContent ?? '').trim() === label || b.getAttribute('aria-label') === label)
  if (!el) throw new Error(`"${label}" 버튼이 없어요. 지금: ${location.pathname} — ${text().slice(0, 300)}`)
  el.click()
}

describe('첫 실행', () => {
  it('M-10 → M-11 → M-12(나만 볼게요) → M-13(나중에) → 홈, 연결 없이도 쓸 수 있음', async () => {
    await boot('/')
    await see('시작하기')
    expect(location.pathname).toBe('/start')
    click('시작하기')
    await see('폰에 남겨둘게요')
    click('다음')
    await see('익명으로 보내주실래요?')
    click('나만 볼게요')
    await see('찍어주세요')
    expect(location.pathname).toBe('/connect')
    expect(localStorage.getItem('pg:pref:share')).toBe('off')
    click('나중에 연결할게요')
    await see('차와 연결할게요')
    expect(location.pathname).toBe('/')
    expect(localStorage.getItem('pg:onboarded')).toBe('1')
    expect(localStorage.getItem('pg:token')).toBeNull()
  })

  it("'시연 데이터로 둘러보기' → 홈 (지금 주차 중 B2 · D-07, 자주 가는 곳, 한 줄)", async () => {
    await boot('/')
    await see('시연 데이터로 둘러보기')
    click('시연 데이터로 둘러보기')
    await see('지금 주차 중')
    await see('D-07')
    await see('현대백화점 판교점')
    await see('오늘은 후진 2번이면 충분했어요')
  })
})

describe('차와 연결', () => {
  it('코드 6자리 → M-14 → (익명 기록 안 골랐으면) M-12 → 홈', async () => {
    await boot('/connect/code', DEMO)
    await see('입력해주세요')
    const input = document.querySelector<HTMLInputElement>('.code-input')!
    input.value = '483920'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await see('내 차와 연결됐어요')
    expect(location.pathname).toBe('/connected')
    expect(localStorage.getItem('pg:token')).toBeTruthy()
    click('나중에')
    await see('익명으로 보내주실래요?')
    click('보낼게요')
    await see('지금 주차 중')
    expect(location.pathname).toBe('/')
    expect(localStorage.getItem('pg:pref:notify')).toBe('off')
  })

  it('/pair/:code — 차 QR을 기본 카메라로 찍어 바로 연결 (시연 중이었어도 서버로)', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push(`${init.method ?? 'GET'} ${url}`)
        if (url.endsWith('/v1/pairings/483920/claim')) return new Response(JSON.stringify({ token: 'phone-tok', car: { deviceId: 'car-9', name: null, pairedAt: '2026-11-03T08:00:00Z' } }))
        if (url.endsWith('/v1/pairings/111111/claim')) return new Response(JSON.stringify({ error: { code: 'gone', message: '' } }), { status: 410 })
        return new Response(JSON.stringify({ parking: null }))
      }),
    )
    await boot('/pair/483920', DEMO)
    await see('내 차와 연결됐어요')
    expect(localStorage.getItem('pg:token')).toBe('phone-tok')
    expect(localStorage.getItem('pg:demo')).toBeNull()
    expect(calls[0]).toBe('POST http://localhost:8787/v1/pairings/483920/claim')
  })

  it('/pair/:code — 시간이 지난 코드는 다음 할 일을 알려 줌', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'gone', message: '' } }), { status: 410 })))
    await boot('/pair/111111')
    await see('시간이 지나 코드가 바뀌었어요')
    click('코드로 연결할게요')
    await see('입력해주세요')
  })
})

describe('주차 위치', () => {
  it('홈 카드 → M-01 → M-02 → 차 찾았어요 → 홈에 지금 주차 없음', async () => {
    await boot('/', PAIRED_DEMO)
    await see('지금 주차 중')
    await see('D-07')
    const card = document.querySelector<HTMLAnchorElement>('a.now-card')!
    expect(card.getAttribute('aria-label')).toMatch(/^지금 주차 중, B2, D-07, 아브뉴프랑 판교 · \d+시간 전\. 위치 보기$/)
    card.click()
    await see('돌아가는 길 보기')
    expect(location.pathname).toBe('/parking')
    click('돌아가는 길 보기')
    await see('엘리베이터 2번에서')
    await see('실제와 조금 다를 수 있어요')
    expect(location.pathname).toBe('/parking/way')
    click('차 찾았어요')
    await see('주차하면 여기에')
    expect(location.pathname).toBe('/')
  })

  it('연결 안 한 폰도 C-07 링크(/p/…#)로 M-01, 위쪽에 연결 입구, M-02는 # 그대로', async () => {
    await boot('/p/3a9c2e' + VECTOR_HASH)
    await see('D-07')
    await see('아브뉴프랑 판교')
    await see('앱에서 내 차와 연결할게요')
    click('돌아가는 길 보기')
    await see('램프를 다 내려와서 곧장')
    expect(location.pathname).toBe('/p/3a9c2e/way')
    expect(location.hash).toBe(VECTOR_HASH)
    expect(JSON.parse(localStorage.getItem('pg:last')!).title).toBe('B2 · D-07')
  })

  it('짧은 링크 /s/:code 도 M-01', async () => {
    await boot('/s/k7m2qp', DEMO)
    await see('D-07')
    await see('엘리베이터 2번 쪽')
  })
})

describe('탭', () => {
  it('주차장 → 상세 → 더 쉬운 곳', async () => {
    await boot('/lots', PAIRED_DEMO)
    await see('쉬운 순')
    await see('현대백화점 판교점')
    click('가까운 순')
    await sleep(30)
    expect(document.querySelector('[aria-pressed="true"]')?.textContent).toBe('가까운 순')
    ;[...document.querySelectorAll<HTMLAnchorElement>('a.lot-row')].find((a) => a.textContent?.includes('현대백화점'))!.click()
    await see('어려워요')
    await see('3.2번')
    await see('만차')
    click('더 쉬운 곳 보기')
    await see('쉬운 곳이에요')
    await see('훨씬 넓어요')
  })

  it('기록 → 동선 (다시 보기)', async () => {
    await boot('/records', PAIRED_DEMO)
    await see('0.4번 줄었어요')
    await see('오늘 · 후진 2번')
    ;[...document.querySelectorAll<HTMLAnchorElement>('a.rec-row')][0].click()
    await see('후진 2번으로')
    await see('동선을 그림으로 다시 그렸어요')
    expect(document.querySelectorAll('.replay-svg circle')).toHaveLength(3)
    click('다시 보기')
    await see('다시 보기')
  })

  it('설정: 토글·운전 경력·어두운 화면', async () => {
    await boot('/settings', PAIRED_DEMO)
    await see('익명 기록 보내기')
    const share = document.querySelector<HTMLButtonElement>('[aria-label="익명 기록 보내기"]')!
    expect(share.getAttribute('aria-checked')).toBe('true')
    share.click()
    await sleep(10)
    expect(localStorage.getItem('pg:pref:share')).toBe('off')
    document.querySelector<HTMLButtonElement>('[aria-label="어두운 화면"]')!.click()
    await sleep(10)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    click('운전 경력고르기')
    await see('얼마나 됐어요?')
    expect(location.pathname).toBe('/settings/experience')
    click('1년 미만')
    await see('주차 끝나면 알림')
    expect(location.pathname).toBe('/settings')
    expect(localStorage.getItem('pg:pref:experience')).toBe('UNDER_1Y')
    await see('1년 미만')
  })
})

describe('주차왕 (v1.2, 시연 데이터)', () => {
  it('아래 탭 5개 (홈 · 주차장 · 주차왕 · 기록 · 설정), 홈 머리는 로고 그림 "주차각"', async () => {
    await boot('/', PAIRED_DEMO)
    await see('지금 주차 중')
    expect([...document.querySelectorAll('nav.tabbar a')].map((a) => a.textContent)).toEqual(['홈', '주차장', '주차왕', '기록', '설정'])
    expect(document.querySelector('.home-top svg[role="img"]')?.getAttribute('aria-label')).toBe('주차각')
  })

  it('연결 전이면 한 문장 + 연결', async () => {
    await boot('/king', { 'pg:onboarded': '1' })
    await see('주차왕에')
    await see('참여할 수 있어요')
    await see('차와 연결할게요')
    document.querySelector<HTMLAnchorElement>('a.king-card')!.click()
    await see('찍어주세요')
    expect(location.pathname).toBe('/connect')
  })

  it('M-52 참여하기(닉네임 다시 뽑기) → M-50 → 새 주 결과 M-53 이 한 번 올라옴 → 닫기 → 다시 열어도 안 뜸', async () => {
    await boot('/', PAIRED_DEMO)
    await see('지금 주차 중')
    ;[...document.querySelectorAll<HTMLAnchorElement>('nav.tabbar a')].find((a) => a.textContent === '주차왕')!.click()
    await see('참여할까요?')
    await see('판교 · 1년 미만')
    const nick = () => document.querySelector<HTMLInputElement>('.nick-field input')!.value
    await new Promise<void>(async (res) => {
      while (!nick()) await sleep(10)
      res()
    })
    expect(nick()).toBe('판교 느긋한 수달')
    click('닉네임 다시 뽑기')
    for (let i = 0; i < 100 && nick() === '판교 느긋한 수달'; i++) await sleep(10)
    expect(nick()).not.toBe('판교 느긋한 수달')
    click('참여할게요')
    await see('12등')
    await see('판교 초보 148명 중 · 82점')
    await see('지난주 17등에서 올라왔어요')
    await see('월요일에 다시 시작해요')
    await see('판교 차분한 두루미')
    expect(document.querySelectorAll('.board-row')).toHaveLength(8)
    expect(document.querySelector('.board-me')?.textContent).toContain('나')
    // 새 주의 지난주 결과 (아직 안 봄) → 아래에서 올라옴
    await see('9등 했어요', 3000)
    expect(location.pathname).toBe('/king/result')
    await see('148명 중 · 상위 6%')
    await see('지난주보다 3계단 올랐어요')
    await sleep(150) // useEffect (그린 뒤)
    expect(localStorage.getItem('pg:king:seen')).toMatch(/^\d{4}-\d\d-\d\dT15:00:00\.000Z$/)
    click('닫기')
    await see('이번 주 점수 순')
    expect(location.pathname).toBe('/king')
    await sleep(700)
    expect(location.pathname).toBe('/king') // 한 주에 한 번
    // 화면이 바뀌면 새 화면 제목으로 초점 (스크린 리더)
    expect(document.activeElement?.textContent).toBe('주차왕')
  })

  it('M-50 위 카드 → M-51 내 점수 자세히 → 순위로 돌아가기', async () => {
    await boot('/king', { ...PAIRED_DEMO, 'pg:mock:king': '판교 느긋한 수달', 'pg:king:seen': 'x' })
    await see('12등')
    // seen 이 지난주와 달라서 결과가 먼저 올라오면 닫고
    await sleep(600)
    if (location.pathname === '/king/result') {
      click('닫기')
      await see('이번 주 점수 순')
    }
    document.querySelector<HTMLAnchorElement>('a.king-card')!.click()
    await see('이번 주 82점이에요')
    expect(location.pathname).toBe('/king/me')
    await see('58 / 70')
    await see('한 번만 더 깔끔하게 대면 10등이에요')
    await see('현대백화점 판교점')
    await see('주차장 안에서 시속 10km를 넘었어요')
    expect([...document.querySelectorAll('.place-grade')].map((e) => e.textContent)).toEqual(['깔끔', '깔끔', '보통', '빠짐'])
    click('순위로 돌아가기')
    await see('이번 주 점수 순')
    expect(location.pathname).toBe('/king')
  })

  it('리그 칩 → 시트(지난주 결과 볼게요) → M-53', async () => {
    await boot('/king', { ...PAIRED_DEMO, 'pg:mock:king': '판교 느긋한 수달' })
    await see('12등')
    await sleep(600)
    if (location.pathname === '/king/result') {
      click('닫기')
      await see('이번 주 점수 순')
    }
    click('판교 초보')
    await see('같은 경력, 같은 동네 사람들끼리 겨뤄요')
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true')
    click('지난주 결과 볼게요')
    await see('9등 했어요')
    expect(location.pathname).toBe('/king/result')
  })

  it("M-52 '다음에 할게요' → 온 곳으로", async () => {
    await boot('/records', PAIRED_DEMO)
    await see('0.4번 줄었어요')
    ;[...document.querySelectorAll<HTMLAnchorElement>('nav.tabbar a')].find((a) => a.textContent === '주차왕')!.click()
    await see('참여할까요?')
    click('다음에 할게요')
    await see('0.4번 줄었어요')
    expect(location.pathname).toBe('/records')
  })

  it('설정: 참여 중이면 "주차왕 그만두기" → 화면 안에서 한 번 더 → 그만둘게요', async () => {
    await boot('/settings', { ...PAIRED_DEMO, 'pg:mock:king': '판교 느긋한 수달' })
    await see('주차왕 그만두기')
    click('주차왕 그만두기판교 느긋한 수달')
    await see('그만두면 순위판에서 빠지고')
    click('그만둘게요')
    await see('주차왕을 그만뒀어요')
    expect(document.body.textContent).not.toContain('주차왕 그만두기')
    expect(localStorage.getItem('pg:mock:king')).toBeNull()
  })

  it('연결 안 한 폰이 /king/me 를 열면 주차왕 탭(연결 안내)으로', async () => {
    await boot('/king/me', { 'pg:onboarded': '1' })
    await see('참여할 수 있어요')
    expect(location.pathname).toBe('/king')
  })
})

describe('서버와 (가짜 fetch)', () => {
  function stubServer(state: { parking: unknown }) {
    const calls: Array<{ url: string; method: string; auth: string | undefined }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const method = init.method ?? 'GET'
        calls.push({ url, method, auth: (init.headers as Record<string, string>)?.Authorization })
        const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s })
        if (url.endsWith('/v1/me/parkings/current')) return j({ parking: state.parking })
        if (url.endsWith('/v1/me') && method === 'DELETE') return new Response(null, { status: 204 })
        if (url.includes('/v1/push/key')) return j({ error: { code: 'not_found', message: '' } }, 404)
        if (url.includes('/v1/me/stats')) return j({ thisMonthAvgReverse: null, lastMonthAvgReverse: null, monthly: [], favorites: [] })
        return j({ error: { code: 'not_found', message: '' } }, 404)
      }),
    )
    return calls
  }
  const P = (id: string, floor: string) => ({
    id, lotId: null, lotName: '알파돔타워 주차장', floor, zone: 'C', number: '12', note: null, parkedAt: new Date().toISOString(),
    summary: null, hints: [], route: null, path: [], foundAt: null, updatedAt: new Date().toISOString(),
  })

  it('Authorization: Device <토큰>, 새 주차를 알아채면 "B3 · C-12에 주차했어요"', async () => {
    const state = { parking: P('a', 'B2') as unknown }
    const calls = stubServer(state)
    await boot('/', { 'pg:onboarded': '1', 'pg:token': 'tok-1', 'pg:pref:notify': 'on' })
    await see('B2')
    expect(calls.find((c) => c.url.endsWith('/parkings/current'))?.auth).toBe('Device tok-1')
    state.parking = P('b', 'B3')
    const { refreshCurrent } = await import('./data')
    await refreshCurrent()
    await see('B3 · C-12에 주차했어요')
  })

  it('연결 끊기: 화면 안에서 한 번 더 묻고 DELETE /v1/me → 연결하기', async () => {
    const calls = stubServer({ parking: null })
    await boot('/settings', { 'pg:onboarded': '1', 'pg:token': 'tok-2' })
    await see('연결됨')
    click('내 차연결됨')
    await see('연결을 끊으면')
    click('연결 끊을게요')
    await see('연결하기')
    expect(localStorage.getItem('pg:token')).toBeNull()
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/v1/me') && c.auth === 'Device tok-2')).toBe(true)
  })

  it('이미 연결된 폰이 다른 차 QR을 열면 먼저 묻고, 새로 연결하면 예전 토큰은 서버에서 폐기', async () => {
    const calls: Array<{ url: string; method: string; auth: string | undefined }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, method: init.method ?? 'GET', auth: (init.headers as Record<string, string>)?.Authorization })
        if (url.endsWith('/claim')) return new Response(JSON.stringify({ token: 'new-tok', car: { deviceId: 'car-2', name: null, pairedAt: '2026-11-03T08:00:00Z' } }))
        if (init.method === 'DELETE') return new Response(null, { status: 204 })
        return new Response(JSON.stringify({ parking: null }))
      }),
    )
    await boot('/pair/483920', { 'pg:onboarded': '1', 'pg:token': 'old-tok', 'pg:pref:share': 'on' })
    await see('이 차와 새로')
    expect(calls.some((c) => c.url.endsWith('/claim'))).toBe(false)
    click('새로 연결할게요')
    await see('내 차와 연결됐어요')
    expect(localStorage.getItem('pg:token')).toBe('new-tok')
    await sleep(30)
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/v1/me') && c.auth === 'Device old-tok')).toBe(true)
  })

  it('…그대로 두면 연결은 바뀌지 않음', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ parking: null }))))
    await boot('/pair/483920', { 'pg:onboarded': '1', 'pg:token': 'old-tok' })
    await see('이 차와 새로')
    click('그대로 둘게요')
    await see('주차하면 여기에')
    expect(localStorage.getItem('pg:token')).toBe('old-tok')
  })

  it('토큰이 거부되면(401) 연결 안 한 상태로', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'unauthorized', message: '' } }), { status: 401 })))
    await boot('/', { 'pg:onboarded': '1', 'pg:token': 'old' })
    await see('차와 연결할게요')
    expect(localStorage.getItem('pg:token')).toBeNull()
  })

  it('서버에 못 닿으면 마지막으로 받은 지금 주차를 보여 줌 (지하)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    const cached = { token: 'tok-3', parking: P('c', 'B4'), at: Date.now() }
    await boot('/parking', { 'pg:onboarded': '1', 'pg:token': 'tok-3', 'pg:current': JSON.stringify(cached) })
    await see('B4')
    await see('C-12')
  })
})
