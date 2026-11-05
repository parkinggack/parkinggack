import { describe, expect, it } from 'vitest'
import { appPath, needsPairing, opensWithoutOnboarding, parseRoute, routePath, tabOf, type Route } from './router'

describe('parseRoute', () => {
  it.each<[string, Route]>([
    ['/', { name: 'home' }],
    ['', { name: 'home' }],
    ['/start', { name: 'start' }],
    ['/start/spot', { name: 'start-spot' }],
    ['/start/share/', { name: 'start-share' }],
    ['/connect', { name: 'connect' }],
    ['/connect/code', { name: 'connect-code' }],
    ['/connected', { name: 'connected' }],
    ['/pair/483920', { name: 'pair', code: '483920' }],
    ['/pair/483920/', { name: 'pair', code: '483920' }],
    ['/parking', { name: 'parking', way: false }],
    ['/parking/way', { name: 'parking', way: true }],
    ['/p/3a9c2e', { name: 'link', id: '3a9c2e', way: false }],
    ['/p/3a9c2e/way', { name: 'link', id: '3a9c2e', way: true }],
    ['/s/k7m2qp', { name: 'short', code: 'k7m2qp', way: false }],
    ['/s/k7m2qp/way', { name: 'short', code: 'k7m2qp', way: true }],
    ['/lots', { name: 'lots' }],
    ['/lots/hyundai-pangyo', { name: 'lot', id: 'hyundai-pangyo' }],
    ['/lots/hyundai-pangyo/easier', { name: 'lot-easier', id: 'hyundai-pangyo' }],
    ['/records', { name: 'records' }],
    ['/records/6f1d2a90-3c1e', { name: 'record', id: '6f1d2a90-3c1e' }],
    ['/settings', { name: 'settings' }],
    ['/settings/experience', { name: 'experience' }],
    ['/king', { name: 'king' }],
    ['/king/me', { name: 'king-me' }],
    ['/king/result/', { name: 'king-result' }],
    ['/king/nope', { name: 'notfound' }],
    ['/nope', { name: 'notfound' }],
    ['/lots/a/b/c', { name: 'notfound' }],
  ])('%s', (path, route) => {
    expect(parseRoute(path)).toEqual(route)
  })

  it('/pair/ 뒤가 숫자가 아니면 코드 입력으로', () => {
    expect(parseRoute('/pair/')).toEqual({ name: 'connect-code' })
    expect(parseRoute('/pair/abc')).toEqual({ name: 'connect-code' })
    expect(parseRoute('/pair/12-34-56')).toEqual({ name: 'pair', code: '123456' })
  })

  it("'#'이 %23 으로 바뀌어 경로에 붙은 C-07 링크도 /p/{id}", () => {
    expect(parseRoute('/p/3a9c2e%23eyJ2IjoxfQ')).toEqual({ name: 'link', id: '3a9c2e', way: false })
  })

  it('id·코드의 이상한 글자는 지움 (링크는 누구나 만들 수 있음)', () => {
    expect(parseRoute('/p/<script>')).toEqual({ name: 'link', id: 'script', way: false })
    expect(parseRoute('/s/a%2Fb')).toEqual({ name: 'short', code: 'ab', way: false })
  })

  it('하위 경로 배포 (BASE_PATH=/parkinggack/)', () => {
    expect(appPath('/parkinggack/lots/x', '/parkinggack/')).toBe('/lots/x')
    expect(appPath('/parkinggack', '/parkinggack/')).toBe('/')
    expect(parseRoute('/parkinggack/pair/483920', '/parkinggack/')).toEqual({ name: 'pair', code: '483920' })
    expect(parseRoute('/parkinggack/', '/parkinggack/')).toEqual({ name: 'home' })
  })
})

describe('routePath', () => {
  const all: Route[] = [
    { name: 'home' },
    { name: 'start' },
    { name: 'start-spot' },
    { name: 'start-share' },
    { name: 'connect' },
    { name: 'connect-code' },
    { name: 'connected' },
    { name: 'pair', code: '483920' },
    { name: 'parking', way: false },
    { name: 'parking', way: true },
    { name: 'link', id: '3a9c2e', way: true },
    { name: 'short', code: 'k7m2qp', way: false },
    { name: 'lots' },
    { name: 'lot', id: 'hyundai-pangyo' },
    { name: 'lot-easier', id: 'hyundai-pangyo' },
    { name: 'records' },
    { name: 'record', id: '6f1d2a90-3c1e-4b8a' },
    { name: 'settings' },
    { name: 'experience' },
    { name: 'king' },
    { name: 'king-me' },
    { name: 'king-result' },
  ]
  it.each(all.map((r) => [routePath(r), r] as const))('%s 왕복', (path, r) => {
    expect(parseRoute(path)).toEqual(r)
  })
})

describe('탭·조건', () => {
  it('아래 탭은 홈·주차장·주차왕·기록·설정에서만', () => {
    expect(tabOf({ name: 'home' })).toBe('home')
    expect(tabOf({ name: 'king' })).toBe('king')
    expect(tabOf({ name: 'king-me' })).toBeNull()
    expect(tabOf({ name: 'king-result' })).toBeNull()
    expect(tabOf({ name: 'records' })).toBe('records')
    expect(tabOf({ name: 'record', id: 'x' })).toBeNull()
    expect(tabOf({ name: 'parking', way: false })).toBeNull()
  })

  it('링크·페어링은 첫 실행 없이 / 지금 주차·동선은 연결이 있어야', () => {
    expect(opensWithoutOnboarding({ name: 'link', id: 'x', way: false })).toBe(true)
    expect(opensWithoutOnboarding({ name: 'pair', code: '483920' })).toBe(true)
    expect(opensWithoutOnboarding({ name: 'home' })).toBe(false)
    expect(needsPairing({ name: 'parking', way: true })).toBe(true)
    expect(needsPairing({ name: 'record', id: 'x' })).toBe(true)
    expect(needsPairing({ name: 'lots' })).toBe(false)
    // 주차왕 탭은 연결 전에도 열림(연결 안내), 안쪽 화면은 연결이 있어야
    expect(needsPairing({ name: 'king' })).toBe(false)
    expect(needsPairing({ name: 'king-me' })).toBe(true)
    expect(needsPairing({ name: 'king-result' })).toBe(true)
  })
})
