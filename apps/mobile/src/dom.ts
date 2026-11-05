/** 아주 작은 DOM 도우미. 링크에서 온 값은 항상 글자(textContent)로만 넣는다 — innerHTML 금지. */

type Child = Node | string | null | undefined | false
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  setAttrs(el, attrs)
  append(el, children)
  return el
}

const SVG_NS = 'http://www.w3.org/2000/svg'

export function s(tag: string, attrs: Attrs = {}, ...children: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag)
  setAttrs(el, attrs)
  append(el, children)
  return el
}

function setAttrs(el: Element, attrs: Attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? '' : String(v))
  }
}

function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c == null || c === false) continue
    el.append(typeof c === 'string' ? document.createTextNode(c) : c)
  }
}

/** 위치 핀 아이콘 (시안 메모 칩) */
export function pinIcon(): SVGElement {
  return s(
    'svg',
    { 'aria-hidden': 'true', width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'icon' },
    s('path', { d: 'M12 21s-6-5.4-6-10.5a6 6 0 0 1 12 0C18 15.6 12 21 12 21z' }),
    s('circle', { cx: 12, cy: 10.5, r: 2.2 }),
  )
}

export function backIcon(): SVGElement {
  return s(
    'svg',
    { 'aria-hidden': 'true', width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    s('path', { d: 'M15 5l-7 7 7 7' }),
  )
}

/** 글자가 칸보다 넓으면 줄인다 (긴 구역 이름 등). 글꼴이 늦게 와도 다시 맞추게 여러 번 불러도 됨 */
export function fitText(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-fit]').forEach((el) => {
    el.style.fontSize = ''
    const avail = el.clientWidth
    const need = el.scrollWidth
    if (avail > 0 && need > avail + 1) {
      const size = parseFloat(getComputedStyle(el).fontSize)
      el.style.fontSize = `${Math.floor(size * (avail / need) * 0.98)}px`
    }
  })
}
