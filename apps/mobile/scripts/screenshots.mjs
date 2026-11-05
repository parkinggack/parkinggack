// docs/screenshots/mobile/*.png 다시 만들기 — 시연 데이터(VITE_MOCK=1)로 빌드해서 vite preview로 띄우고
// Playwright(Chromium)로 390×844, 2배율(시안과 같은 조건). 시각은 2026-11-03 오후 5:02(KST)로 고정 →
// 시안과 같은 "2시간 전", "오늘 · 후진 2번", "11월 1일". 주차왕은 시안의 요일·주에 맞춰 목요일(M-50~M-52)·월요일(M-53).
//
//   npm run screenshots                 전부 (Playwright 필요 — scripts/playwright.mjs)
//   npm run screenshots -- m50_king,m20_home      몇 장만
//   npm run screenshots -- motion       움직임 낱장 모음(contact sheet)만 — motion_*.png
//
// Pillow(python3 -c "import PIL")가 있으면 256색으로 줄여 저장소를 가볍게 하고, 움직임 낱장을 한 장으로 모은다.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, preview } from 'vite'
import { loadChromium } from './playwright.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = fileURLToPath(new URL('../../../docs/screenshots/mobile/', import.meta.url))
const distDir = fileURLToPath(new URL('../node_modules/.screens-dist/', import.meta.url))
mkdirSync(out, { recursive: true })

const NOW = new Date('2026-11-03T17:02:00+09:00')
const THU = new Date('2026-11-05T17:02:00+09:00') // M-51 "오늘 · 월요일 · 화요일 · 수요일"
const MON = new Date('2026-11-09T09:12:00+09:00') // M-53 "지난주 결과 · 11월 2일 ~ 8일"
const LAST_WEEK_OF_THU = '2026-10-25T15:00:00.000Z' // 목요일 기준 지난주 시작 = 이미 본 결과 (M-50 이 M-53 을 저절로 안 띄우게)
const T = NOW.getTime() - 130 * 60_000 // 오후 2:52
const enc = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url')
const CURRENT_ID = '6f1d2a90-3c1e-4b8a-9d7e-0a5b3c2e1f07'

// C-07 링크 (연결 안 한 폰) — 시안과 같은 값
const linkPayload = { v: 1, lot: '아브뉴프랑 판교 주차장', f: 'B2', z: 'D', n: '07', t: T, m: '엘리베이터 2번 쪽', h: ['B2에서 내리기', 'D 구역 쪽으로 곧장', 'D-07 왼쪽 칸'], r: [0, 24, 1] }
// 차량 앱 시연 시나리오가 실제로 만든 힌트 (payload.test.ts 벡터)
const demoPayload = { v: 1, lot: '아브뉴프랑 판교 주차장', f: 'B2', z: 'D', n: '07', t: T, m: '엘리베이터 2번 쪽', h: ['램프를 다 내려와서 곧장', '오른쪽 칸 줄, 약 15m 지점'], r: [1, 17, -1] }

const PAIRED = { 'pg:onboarded': '1', 'pg:demo': '1', 'pg:token': 'demo-phone-token', 'pg:car': JSON.stringify({ deviceId: 'car-demo-ioniq', name: '아이오닉 5', pairedAt: '2026-10-01T00:00:00Z' }), 'pg:pref:share': 'on', 'pg:pref:notify': 'on', 'pg:pref:experience': 'UNDER_1Y' }
const JOINED = { ...PAIRED, 'pg:mock:king': '판교 느긋한 수달', 'pg:king:seen': LAST_WEEK_OF_THU }
const FRESH = {}
const UNPAIRED = { 'pg:onboarded': '1', 'pg:pref:share': 'on' }

/** 홈 카드의 차가 주차를 마칠 때까지 (carpath.ts HOME_PARK ≈ 2.5초) */
const PARKED = 2900

/** [파일, 경로, 저장소, 옵션] — 옵션: now(시각), wait(ms), type, click, replayAt, download */
const shots = [
  ['m10_start', '/', FRESH, { wait: 2200 }],
  ['m11_spot', '/start/spot', FRESH],
  ['m12_share', '/start/share', FRESH],
  ['m13_connect', '/connect', FRESH],
  ['m13_code', '/connect/code', FRESH, { type: '4839' }],
  ['m13_code_error', '/connect/code', FRESH, { type: '000000' }],
  ['m14_connected', '/connected', { ...PAIRED, 'pg:onboarded': null, 'pg:pref:notify': null }],
  ['pair_expired', '/pair/111111', FRESH],
  ['m20_home', '/', PAIRED, { wait: PARKED }],
  ['m20_home_unpaired', '/', UNPAIRED],
  ['m01_parking', '/parking', PAIRED],
  ['m02_way', '/parking/way', PAIRED],
  ['m01_link', `/p/3a9c2e#${enc(linkPayload)}`, FRESH],
  ['m02_link_demo', `/p/3a9c2e/way#${enc(demoPayload)}`, FRESH],
  ['m01_link_invalid', '/p/x3#eyJ2IjoxLCJsb3QiOiLslYTr', FRESH],
  ['m30_lots', '/lots', PAIRED],
  ['m31_lot', '/lots/hyundai-pangyo', PAIRED],
  ['m31_easier', '/lots/hyundai-pangyo/easier', PAIRED],
  ['m32_records', '/records', PAIRED],
  ['m33_record', `/records/${CURRENT_ID}`, PAIRED],
  ['m33_record_replay', `/records/${CURRENT_ID}`, PAIRED, { replayAt: 0.55 }],
  ['m40_settings', '/settings', PAIRED],
  ['m40_settings_unpair', '/settings', PAIRED, { click: '.car-card' }],
  ['m40_settings_king_leave', '/settings', JOINED, { now: THU, click: 'button.setting-button' }],
  ['m40_experience', '/settings/experience', { ...PAIRED, 'pg:pref:experience': 'UNDER_1Y' }],
  ['m50_king', '/king', JOINED, { now: THU, wait: 900 }],
  ['m50_king_sheet', '/king', JOINED, { now: THU, wait: 900, click: '.league-chip', after: 700 }],
  ['m50_king_unpaired', '/king', UNPAIRED, { now: THU }],
  ['m51_king_me', '/king/me', JOINED, { now: THU, wait: 900 }],
  ['m52_king_join', '/king', PAIRED, { now: THU, wait: 900 }],
  ['m53_king_result', '/king/result', JOINED, { now: MON, wait: 900, download: 'm53_share_image' }],
  ['m20_home_dark', '/', { ...PAIRED, 'pg:pref:theme': 'dark' }, { wait: PARKED }],
  ['m50_king_dark', '/king', { ...JOINED, 'pg:pref:theme': 'dark' }, { now: THU, wait: 900 }],
  ['m01_parking_dark', '/parking', { ...PAIRED, 'pg:pref:theme': 'dark' }],
]

const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null
const wantMotion = !only || only.has('motion')

rmSync(distDir, { recursive: true, force: true })
process.env.VITE_MOCK = '1'
await build({ root, logLevel: 'warn', build: { outDir: distDir, emptyOutDir: true } })
const server = await preview({ root, preview: { port: 4179, strictPort: false, host: '127.0.0.1' }, build: { outDir: distDir } })
const base = server.resolvedUrls.local[0].replace(/\/$/, '')
const chromium = await loadChromium()
const browser = await chromium.launch()
const saved = []
const frameDir = join(tmpdir(), `pg-motion-${process.pid}`)
// 낱장 모음 글자용 (차량 앱에 넣은 Noto Sans KR 부분 집합)
const KR_FONT = fileURLToPath(new URL('../../vehicle/app/src/main/res/font/noto_sans_kr_regular.ttf', import.meta.url))
const sheets = [] // [이름, 제목, [[라벨, 파일], …]]

async function open(store, { now = NOW, scale = 2, clockHook = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: scale,
    colorScheme: 'light',
    timezoneId: 'Asia/Seoul',
    locale: 'ko-KR',
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
    acceptDownloads: true,
  })
  await ctx.addInitScript((entries) => {
    if (sessionStorage.getItem('__seeded')) return
    sessionStorage.setItem('__seeded', '1')
    localStorage.clear()
    for (const [k, v] of Object.entries(entries)) if (v != null) localStorage.setItem(k, v)
  }, store)
  if (clockHook) {
    // 차 그림(rAF + performance.now)을 원하는 시각에 세우려고 — window.__t 를 정하면 그 시각
    await ctx.addInitScript(() => {
      const real = performance.now.bind(performance)
      window.__t = null
      performance.now = () => (window.__t == null ? real() : window.__t)
    })
  }
  const page = await ctx.newPage()
  // 고정 시계는 performance.now 를 세우는 것과 같이 못 씀 (타이머가 멈춤) — 시연 데이터는 '지금' 기준이라 없어도 같은 글자
  if (!clockHook) await page.clock.setFixedTime(now)
  return { ctx, page }
}

try {
  for (const [name, path, store, opt = {}] of shots) {
    if (only && !only.has(name)) continue
    const { ctx, page } = await open(store, { now: opt.now })
    await page.goto(base + path, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(opt.wait ?? 450)
    if (opt.type) {
      await page.locator('.code-input').fill(opt.type)
      await page.waitForTimeout(700)
    }
    if (opt.click) {
      await page.locator(opt.click).first().click()
      await page.waitForTimeout(opt.after ?? 250)
    }
    if (opt.replayAt) {
      // '다시 보기' 중간 장면: 애니메이션을 멈춘 채로 그 진행값을 그리게
      await page.evaluate(() => {
        let t = 0
        window.performance.now = () => t
        window.requestAnimationFrame = (cb) => setTimeout(() => cb(t), 0)
        window.__setT = (v) => (t = v)
      })
      await page.getByRole('button', { name: '다시 보기' }).click()
      await page.evaluate((v) => window.__setT(v * 4200), opt.replayAt)
      await page.waitForTimeout(300)
    }
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `${out}${name}.png` })
    saved.push(name)
    console.log('saved', name)
    if (opt.download) {
      // '이미지로 공유하기' — 헤드리스 크롬은 navigator.share 가 없어 내려받기로 → 그 PNG(캔버스로 직접 그린 1080×1350)
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '이미지로 공유하기' }).click()])
      await dl.saveAs(`${out}${opt.download}.png`)
      saved.push(opt.download)
      console.log('saved', opt.download, '(공유 이미지)')
    }
    await ctx.close()
  }

  if (wantMotion) {
    mkdirSync(frameDir, { recursive: true })
    // ① 홈 카드: 차가 들어와 주차 (rAF 시각을 세워서 찍음)
    {
      const { ctx, page } = await open(PAIRED, { clockHook: true, scale: 1 })
      await page.addInitScript(() => (window.__t = 0))
      await page.goto(base + '/', { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      const frames = []
      for (const [t, label] of [
        [0, '0 ms'],
        [520, '0.5 s 통로'],
        [1000, '1.0 s 꺾어 들어감'],
        [1330, '1.3 s 살짝 후진'],
        [1800, '1.8 s 앞으로'],
        [2600, '2.6 s 섬'],
      ]) {
        await page.evaluate((v) => (window.__t = v), t)
        await page.waitForTimeout(80)
        const f = join(frameDir, `home_${t}.png`)
        await page.locator('a.now-card').screenshot({ path: f })
        frames.push([label, f])
      }
      sheets.push(['motion_home_parking', 'M-20 지금 주차 중 카드 — 차가 통로로 와서 꺾어 들어가고, 살짝 후진해 편 뒤 들어가 멈춤 (약 2.5초)', frames])
      await ctx.close()
    }
    // ② 화면 전환: Web Animations 를 멈추고 시각을 옮기며 찍음
    const TIMES = [0, 60, 130, 220, 330, 560]
    async function transition(name, title, store, { now = THU, start, act, kind, settle = PARKED }) {
      const { ctx, page } = await open(store, { now, scale: 1 })
      await page.goto(base + start, { waitUntil: settle ? 'networkidle' : 'domcontentloaded' })
      if (settle) await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(settle)
      await act(page)
      await page.waitForFunction((k) => document.querySelector('.stage-run')?.getAttribute('data-transition') === k, kind)
      await page.evaluate(() => {
        window.__anims = document.getAnimations().filter((a) => a.effect?.target?.closest?.('.stage'))
        window.__anims.forEach((a) => a.pause())
      })
      await page.waitForTimeout(500) // 들어오는 화면이 시연 데이터를 받을 시간
      await page.evaluate(() => document.fonts.ready)
      const frames = []
      for (const t of TIMES) {
        await page.evaluate((v) => window.__anims.forEach((a) => (a.currentTime = v)), t)
        await page.waitForTimeout(60)
        const f = join(frameDir, `${name}_${t}.png`)
        await page.screenshot({ path: f })
        frames.push([`${t} ms`, f])
      }
      await page.evaluate(() => window.__anims.forEach((a) => a.play()))
      sheets.push([name, title, frames])
      await ctx.close()
    }
    const SEEN = { ...JOINED }
    await transition('motion_push', '앞으로 (push): 홈 카드 → M-01 — 새 화면이 오른쪽에서 스프링(260/26)으로, 이전 화면은 왼쪽으로 조금 밀리며 옅어짐', SEEN, {
      start: '/',
      kind: 'push',
      act: (p) => p.locator('a.now-card').click(),
    })
    await transition('motion_pop', '뒤로 (pop): M-01 → 홈 — 그 반대 (떠나는 화면이 오른쪽으로 나감)', SEEN, {
      start: '/',
      kind: 'pop',
      act: async (p) => {
        await p.locator('a.now-card').click()
        await p.waitForTimeout(900)
        await p.getByRole('button', { name: '뒤로' }).click()
      },
    })
    await transition('motion_tab', '탭 (홈 → 주차왕): 미끄러지지 않고 옅게 + 내용만 살짝 위로 (탭바 제자리)', SEEN, {
      start: '/',
      kind: 'tab',
      act: (p) => p.getByRole('link', { name: '주차왕' }).click(),
    })
    await transition('motion_rise', '모달 (M-50 → M-53 지난주 결과): 아래에서 올라옴 (넘치지 않는 스프링)', { ...JOINED, 'pg:king:seen': null }, {
      now: MON,
      start: '/king',
      kind: 'rise',
      settle: 0,
      act: async () => {}, // 새 주의 결과가 저절로 올라옴 (M-50 이 자리 잡고 0.45초 뒤)
    })
  }
} finally {
  await browser.close()
  await new Promise((r) => server.httpServer.close(r))
  rmSync(distDir, { recursive: true, force: true })
}

// 움직임 낱장을 한 장으로 (Pillow)
if (sheets.length) {
  try {
    const spec = join(frameDir, 'sheets.json')
    writeFileSync(spec, JSON.stringify(sheets.map(([name, title, frames]) => ({ out: `${out}${name}.png`, title, frames }))))
    execFileSync('python3', ['-I', '-c', `
import json, sys
from PIL import Image, ImageDraw, ImageFont
def font(size):
    for f in [sys.argv[2], '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', '/System/Library/Fonts/AppleSDGothicNeo.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        try:
            return ImageFont.truetype(f, size)
        except Exception:
            pass
    return ImageFont.load_default()
for s in json.load(open(sys.argv[1])):
    ims = [Image.open(f).convert('RGB') for _, f in s['frames']]
    w, h = ims[0].size
    pad, top = 16, 64
    sheet = Image.new('RGB', (pad + len(ims) * (w + pad), top + h + pad), (244, 243, 239))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 10), s['title'], fill=(30, 30, 30), font=font(17))
    for i, ((label, _), im) in enumerate(zip(s['frames'], ims)):
        x = pad + i * (w + pad)
        d.text((x, 38), label, fill=(95, 93, 87), font=font(15))
        sheet.paste(im, (x, top))
    sheet.save(s['out'])
    print('sheet', s['out'], sheet.size)
`, spec, KR_FONT], { stdio: 'inherit' })
    saved.push(...sheets.map(([n]) => n))
  } catch {
    console.log('Pillow가 없어 움직임 낱장 모음을 만들지 않음')
  }
  rmSync(frameDir, { recursive: true, force: true })
}

// 256색으로 줄이기 (있으면)
try {
  const files = readdirSync(out).filter((f) => f.endsWith('.png') && saved.includes(f.replace(/\.png$/, '')))
  execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
for p in sys.argv[1:]:
    im = Image.open(p).convert('RGB')
    im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(p, optimize=True)
`, ...files.map((f) => out + f)])
  console.log('palette-reduced', files.length)
} catch {
  console.log('Pillow가 없어 원본 PNG 그대로 둠')
}
