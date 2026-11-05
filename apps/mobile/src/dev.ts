/**
 * /dev/ — 차 없이 M-01·M-02를 열어 보는 개발용 페이지.
 * 노트북에서 `npm run dev` 후 터미널의 Network 주소(http://192.168.x.x:5173/dev/)로 이 페이지를 열고
 * 폰 카메라로 QR을 찍으면 같은 Wi-Fi의 폰에서 바로 열린다. 배포본에도 들어 있어 시연·심사용 예시로 쓸 수 있다.
 */
import './style.css'
import './dev.css'
import qrcode from 'qrcode-generator'
import { h, s } from './dom'
import { buildLink, type Parking } from './payload'
import { samples } from './samples'

const MIN = 60_000
const base = location.origin + import.meta.env.BASE_URL

function qrSvg(text: string): SVGElement {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  const q = 3
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`
  // 스캐너 호환: 테마와 상관없이 밝은 바탕에 어두운 점
  return s(
    'svg',
    { class: 'qr', viewBox: `0 0 ${n + 2 * q} ${n + 2 * q}`, role: 'img', 'aria-label': 'QR 코드', 'shape-rendering': 'crispEdges' },
    s('rect', { width: n + 2 * q, height: n + 2 * q, fill: '#ffffff' }),
    s('path', { d, fill: '#1e1e1e' }),
  )
}

function card(title: string, note: string, url: string): HTMLElement {
  return h(
    'article',
    { class: 'dev-card' },
    h('h2', {}, title),
    h('p', { class: 'dev-note' }, note),
    qrSvg(url),
    h('a', { class: 'dev-link', href: url }, url.length > 90 ? url.slice(0, 90) + '…' : url),
  )
}

function customForm(): HTMLElement {
  const field = (label: string, input: HTMLInputElement | HTMLTextAreaElement) => h('label', { class: 'dev-field' }, h('span', {}, label), input)
  const lot = h('input', { value: '아브뉴프랑 판교 주차장' })
  const f = h('input', { value: 'B2', maxlength: 6 })
  const z = h('input', { value: 'D', maxlength: 6 })
  const n = h('input', { value: '07', maxlength: 6 })
  const m = h('input', { value: '엘리베이터 2번 쪽', maxlength: 40 })
  const ago = h('input', { type: 'number', value: 130, min: 0, inputmode: 'numeric' })
  const hints = h('textarea', { rows: 4 })
  hints.value = '주차장 입구에서 곧장\n약 10m 가서 오른쪽\n왼쪽 칸 줄, 약 30m 지점'
  const route = h('input', { value: '0,10,-1,32,1' })
  const out = h('div', { class: 'dev-out' })

  const update = () => {
    const p: Parking = {
      v: 1,
      lot: lot.value.trim() || '주차 위치',
      f: f.value.trim(),
      z: z.value.trim(),
      n: n.value.trim(),
      t: Date.now() - Math.max(0, Number(ago.value) || 0) * MIN,
    }
    if (m.value.trim()) p.m = m.value.trim()
    const h4 = hints.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4)
    if (h4.length) p.h = h4
    const r = route.value.split(',').map((x) => Number(x.trim())).filter((x) => Number.isInteger(x))
    if (r.length >= 3) p.r = r
    const url = buildLink(base, 'custom', p)
    out.replaceChildren(qrSvg(url), h('a', { class: 'dev-link', href: url }, url.length > 90 ? url.slice(0, 90) + '…' : url))
  }
  for (const el of [lot, f, z, n, m, ago, hints, route]) el.addEventListener('input', update)
  update()

  return h(
    'article',
    { class: 'dev-card dev-custom' },
    h('h2', {}, '직접 만들기'),
    h(
      'div',
      { class: 'dev-form' },
      field('주차장', lot),
      field('층', f),
      field('구역', z),
      field('기둥', n),
      field('메모', m),
      field('몇 분 전', ago),
      field('힌트 (줄마다 하나, 최대 4줄)', hints),
      field('그림 r (예: 0,10,-1,32,1)', route),
    ),
    out,
  )
}

function render(root: HTMLElement) {
  const now = Date.now()
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname)
  root.replaceChildren(
    h(
      'main',
      { class: 'dev' },
      h('h1', {}, '주차각 폰 앱 · 예시 링크'),
      h(
        'p',
        { class: 'dev-lead' },
        '차 화면 C-07의 QR과 같은 형식의 링크예요: ',
        h('code', {}, '/p/{id}#{base64url(JSON)}'),
        '. 폰 카메라로 QR을 찍거나 링크를 눌러 M-01을 열어 보세요.',
      ),
      local
        ? h('p', { class: 'dev-warn' }, '지금 localhost로 열었어요. 폰에서 열려면 터미널에 뜬 Network 주소(예: http://192.168.0.5:5173/dev/)로 이 페이지를 다시 여세요.')
        : null,
      h(
        'section',
        { class: 'dev-grid' },
        ...samples(now).map((sm) =>
          card(sm.title, sm.note, sm.parking ? buildLink(base, sm.id, sm.parking) : `${base}p/${sm.id}#${sm.rawFragment ?? ''}`),
        ),
        card('링크 없음', '# 뒤가 비어 있을 때 (주소만 열었을 때)', `${base}p/empty`),
        card('짝꿍 앱 (M-10 시작)', "첫 화면 아래 '시연 데이터로 둘러보기'를 누르면 서버 없이 홈·기록·동선까지 볼 수 있어요", base),
        card('차 QR — 폰 연결', '차 C-10 › 폰 연결 QR과 같은 형식 (/pair/{숫자 6자리}). 서버가 만든 코드여야 연결돼요', `${base}pair/483920`),
        card('짧은 링크', '차 C-07이 서버로 만든 /s/{code} (서버 GET /v1/shares/:code)', `${base}s/k7m2qp`),
        customForm(),
      ),
    ),
  )
}

render(document.getElementById('dev')!)
