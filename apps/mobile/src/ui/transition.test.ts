// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Route } from '../router'
import { SPRING_POP, SPRING_SCREEN, SPRING_SHEET } from './spring'
import { isModalRoute, motionFor, transitionFor, type TransitionKind } from './transition'

const R = {
  home: { name: 'home' },
  lots: { name: 'lots' },
  king: { name: 'king' },
  records: { name: 'records' },
  settings: { name: 'settings' },
  lot: { name: 'lot', id: 'hyundai-pangyo' },
  parking: { name: 'parking', way: false },
  way: { name: 'parking', way: true },
  kingMe: { name: 'king-me' },
  result: { name: 'king-result' },
  connect: { name: 'connect' },
  code: { name: 'connect-code' },
  connected: { name: 'connected' },
  start: { name: 'start' },
  spot: { name: 'start-spot' },
  share: { name: 'start-share' },
  experience: { name: 'experience' },
} satisfies Record<string, Route>

describe('전환 방향 (transitionFor)', () => {
  it.each<[string, Route | null, Route, Parameters<typeof transitionFor>[2], TransitionKind]>([
    ['첫 화면', null, R.home, 'initial', 'none'],
    ['앞으로: 홈 → 주차 위치', R.home, R.parking, 'push', 'push'],
    ['앞으로: M-01 → M-02', R.parking, R.way, 'push', 'push'],
    ['뒤로: M-02 → M-01', R.way, R.parking, 'pop', 'pop'],
    ['앞으로: M-50 → M-51', R.king, R.kingMe, 'push', 'push'],
    ['탭: 홈 → 주차왕', R.home, R.king, 'push', 'tab'],
    ['탭: 주차왕 → 기록', R.king, R.records, 'push', 'tab'],
    ['탭끼리는 뒤로 가기도 탭', R.settings, R.lots, 'pop', 'tab'],
    ['탭끼리 바꿔 놓기도 탭', R.home, R.lots, 'replace', 'tab'],
    ['모달: M-50 → M-53 올라옴', R.king, R.result, 'push', 'rise'],
    ['모달 닫기: M-53 → M-50 내려감', R.result, R.king, 'pop', 'sink'],
    ['코드 입력은 모달처럼', R.connect, R.code, 'push', 'rise'],
    ['코드 입력 뒤로', R.code, R.connect, 'pop', 'sink'],
    ['차 찾았어요(바꿔 놓기) → 홈: 뒤로처럼', R.way, R.home, 'replace', 'pop'],
    ['첫 실행 다음 단계(바꿔 놓기) → 앞으로처럼', R.share, R.home, 'replace', 'push'],
    ['연결 완료 → 홈', R.connected, R.home, 'replace', 'push'],
    ['시연 끝내기 → 시작 화면', R.settings, R.start, 'replace', 'fade'],
    ['그 밖의 바꿔 놓기', R.lot, R.records, 'replace', 'pop'],
    ['그 밖의 바꿔 놓기 (상세 → 상세)', R.lot, R.parking, 'replace', 'fade'],
    ['코드 입력 → 연결 완료 (바꿔 놓기)', R.code, R.connected, 'replace', 'push'],
    ['연결 실패 → 코드 입력 (바꿔 놓기)', { name: 'pair', code: '111111' }, R.code, 'replace', 'rise'],
    ['같은 화면', R.lot, { name: 'lot', id: 'hyundai-pangyo' }, 'push', 'none'],
    ['브라우저 앞으로(=push) 도 밀어 넣기', R.lots, R.lot, 'push', 'push'],
    ['운전 경력 고르고 뒤로', R.experience, R.settings, 'pop', 'pop'],
  ])('%s', (_, from, to, nav, want) => {
    expect(transitionFor(from, to, nav)).toBe(want)
  })

  it("'동작 줄이기'면 늘 none", () => {
    expect(transitionFor(R.home, R.parking, 'push', { reducedMotion: true })).toBe('none')
    expect(transitionFor(R.king, R.result, 'push', { reducedMotion: true })).toBe('none')
    expect(transitionFor(R.home, R.king, 'push', { reducedMotion: true })).toBe('none')
  })

  it('모달 화면은 M-53 과 코드 입력', () => {
    expect(isModalRoute(R.result)).toBe(true)
    expect(isModalRoute(R.code)).toBe(true)
    expect(isModalRoute(R.kingMe)).toBe(false)
  })
})

describe('움직임 (motionFor) — transform·opacity 만', () => {
  const props = (kind: TransitionKind) => {
    const m = motionFor(kind)!
    const tracks = [...m.enter.tracks, ...m.exit.tracks, ...(m.enter.content ?? [])]
    return new Set(tracks.flatMap((t) => t.keyframes.flatMap((k) => Object.keys(k))))
  }

  it.each<TransitionKind>(['push', 'pop', 'tab', 'rise', 'sink', 'fade'])('%s: transform·opacity 말고는 안 움직임', (kind) => {
    for (const p of props(kind)) expect(['transform', 'opacity']).toContain(p)
  })

  it('push: 새 화면이 오른쪽(100%)에서 들어와 위에, 이전 화면은 왼쪽으로 조금(−25%) 밀리며 옅어짐', () => {
    const m = motionFor('push')!
    expect(m.enter.z).toBeGreaterThan(m.exit.z)
    expect(m.enter.tracks[0].keyframes[0].transform).toBe('translate3d(100%, 0, 0)')
    expect(m.enter.tracks[0].keyframes[1].transform).toBe('translate3d(0, 0, 0)')
    expect(m.enter.tracks[0].spring).toBe(SPRING_SCREEN)
    expect(m.exit.tracks[0].keyframes[1].transform).toBe('translate3d(-25%, 0, 0)')
    expect(m.exit.tracks[1].keyframes[1].opacity).toBeLessThan(1)
  })

  it('pop: 그 반대 — 떠나는 화면이 위에서 오른쪽으로 나감', () => {
    const m = motionFor('pop')!
    expect(m.exit.z).toBeGreaterThan(m.enter.z)
    expect(m.exit.tracks[0].keyframes[1].transform).toBe('translate3d(100%, 0, 0)')
    expect(m.enter.tracks[0].keyframes[0].transform).toBe('translate3d(-25%, 0, 0)')
  })

  it('tab: 미끄러지지 않고 옅게 + 내용만 살짝 위로 (탭바는 제자리)', () => {
    const m = motionFor('tab')!
    expect(m.enter.tracks.every((t) => t.keyframes.every((k) => !('transform' in k)))).toBe(true)
    expect(m.enter.content?.[0].keyframes[0].transform).toBe('translate3d(0, 14px, 0)')
    expect(m.enter.content?.[0].spring).toBe(SPRING_POP)
    expect(m.exit.tracks).toHaveLength(0)
  })

  it('rise/sink: 아래(100%)에서 올라오고 내려감, 넘치지 않는 스프링', () => {
    expect(motionFor('rise')!.enter.tracks[0].keyframes[0].transform).toBe('translate3d(0, 100%, 0)')
    expect(motionFor('rise')!.enter.tracks[0].spring).toBe(SPRING_SHEET)
    expect(motionFor('sink')!.exit.tracks[0].keyframes[1].transform).toBe('translate3d(0, 100%, 0)')
    expect(motionFor('sink')!.exit.z).toBeGreaterThan(motionFor('sink')!.enter.z)
  })

  it('none 은 움직임 없음', () => {
    expect(motionFor('none')).toBeNull()
  })
})

describe('라우터가 알려 주는 이동 종류 (lastNavigation)', () => {
  afterEach(() => {
    vi.resetModules()
  })

  async function fresh(path = '/') {
    vi.resetModules()
    history.replaceState(null, '', path)
    window.scrollTo = () => {}
    const r = await import('../router')
    r.initRouter()
    return r
  }
  const popped = () => new Promise<void>((res) => window.addEventListener('popstate', () => setTimeout(res, 0), { once: true }))

  it('처음 initial → navigate push → replace → 뒤로 pop → 앞으로 push', async () => {
    const r = await fresh('/')
    expect(r.lastNavigation().kind).toBe('initial')
    expect(history.scrollRestoration).toBe('manual')
    r.navigate({ name: 'lots' })
    expect(r.lastNavigation()).toEqual({ kind: 'push', scroll: 0 })
    r.navigate({ name: 'lot', id: 'a' })
    r.navigate({ name: 'lot', id: 'b' }, { replace: true })
    expect(r.lastNavigation().kind).toBe('replace')
    const p = popped()
    history.back()
    await p
    expect(r.lastNavigation().kind).toBe('pop')
    expect(r.currentRoute()).toEqual({ name: 'lots' })
    const f = popped()
    history.forward()
    await f
    expect(r.lastNavigation().kind).toBe('push')
  })

  it('뒤로 오면 떠날 때의 스크롤로 (화면 전환 중이면 Stage 가 알려 준 실제 스크롤)', async () => {
    const r = await fresh('/lots')
    let y = 640
    r.setScrollSource(() => y)
    r.navigate({ name: 'lot', id: 'a' })
    y = 0
    const p = popped()
    history.back()
    await p
    expect(r.lastNavigation()).toEqual({ kind: 'pop', scroll: 640 })
    expect((history.state as { scroll?: number }).scroll).toBe(640)
    r.setScrollSource(null)
  })

  it('goBack: 앱 안에서 온 곳이 없으면 fallback 으로 바꿔 놓기', async () => {
    const r = await fresh('/king/me')
    r.goBack({ name: 'king' })
    expect(r.lastNavigation().kind).toBe('replace')
    expect(location.pathname).toBe('/king')
  })
})
