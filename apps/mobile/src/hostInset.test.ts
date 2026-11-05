// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { measureHostInset } from './hostInset'

describe('호스팅 배지 자리 비우기', () => {
  it('배지가 없으면 0', () => {
    document.body.innerHTML = '<div id="app"></div>'
    expect(measureHostInset(document)).toBe(0)
  })
  it('화면 아래에 붙은 Netlify 배지 높이만큼', () => {
    document.body.innerHTML = '<iframe id="nl-badge-frame"></iframe>'
    const f = document.getElementById('nl-badge-frame')!
    f.getBoundingClientRect = () => ({ top: window.innerHeight - 64, bottom: window.innerHeight, height: 64, left: 0, right: 0, width: 201, x: 0, y: 0, toJSON() {} }) as DOMRect
    expect(measureHostInset(document)).toBe(64)
  })
  it('위쪽에 있는 배지는 무시', () => {
    document.body.innerHTML = '<iframe id="nl-badge-frame"></iframe>'
    const f = document.getElementById('nl-badge-frame')!
    f.getBoundingClientRect = () => ({ top: 0, bottom: 64, height: 64, left: 0, right: 0, width: 201, x: 0, y: 0, toJSON() {} }) as DOMRect
    expect(measureHostInset(document)).toBe(0)
  })
})
