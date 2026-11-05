#!/usr/bin/env node
// 주차각 폰 앱(배포본) 화면 흐름 녹화 — Playwright(Chromium), 390×844 세로 폰 화면.
//
//   node phone_flows.mjs <flow> --out DIR [--name CLIP] [--state in.json] [--save-state out.json] [--base URL]
//   node phone_flows.mjs list
//
// 결과 (DIR 안)
//   CLIP.mp4   2배(780×1688) 선명한 영상 — page.screenshot(배율 2)을 초당 ~30장 찍어 시각대로 이어 붙임 (H.264, 30 fps)
//              Playwright recordVideo 는 배율 2로도 CSS 픽셀(390×844)로만 찍혀서 이렇게 따로 만든다
//   CLIP.webm  Playwright recordVideo 원본 (1배, 390×844, VP8)
//   CLIP.events.json  시작 시각(벽시계 ms)과 누른 순간들 — 차 영상과 맞출 때
//
// 오케스트레이터(flow_video.py)와는 줄 단위 JSON 으로 이야기한다
//   stdout: {"ev":"start"|"mark"|"need"|"done"|"error", "t": epoch_ms, ...}
//   stdin : "code 483920" / "link https://parkinggack.vercel.app/s/ab12" / "go"   (need(key)가 기다리는 값)
//
// 준비: 이 폴더에서 npm i (playwright 1.62.1 — 브라우저는 ~/Library/Caches/ms-playwright 의 chromium-1234), ffmpeg (brew install ffmpeg)
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const HERE = dirname(fileURLToPath(import.meta.url))

const W = 390
const H = 844
const FPS = 30
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'

// ------------------------------------------------------------------ args

const argv = process.argv.slice(2)
const flowName = argv[0]
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const BASE = (opt('base', 'https://parkinggack.vercel.app') || '').replace(/\/$/, '')
const OUT = resolve(opt('out', join(HERE, 'out')))
const NAME = opt('name', `phone-${flowName}`)
const STATE_IN = opt('state')
const STATE_OUT = opt('save-state')
const SLOW = Number(opt('slow', '1')) // 쉬는 시간 배율

// ------------------------------------------------------------------ io

const t0wall = Date.now()
const events = []
function emit(ev, extra = {}) {
  const o = { ev, t: Date.now(), ...extra }
  process.stdout.write(JSON.stringify(o) + '\n')
  return o
}
function mark(label) {
  const o = emit('mark', { label })
  events.push({ t: o.t, label })
}
const inbox = new Map()
const waiters = new Map()
createInterface({ input: process.stdin }).on('line', (line) => {
  const s = line.trim()
  if (!s) return
  const sp = s.indexOf(' ')
  const key = sp < 0 ? s : s.slice(0, sp)
  const val = sp < 0 ? '' : s.slice(sp + 1).trim()
  if (waiters.has(key)) {
    waiters.get(key)(val)
    waiters.delete(key)
  } else inbox.set(key, val)
})
function need(key, timeoutMs = 600_000) {
  if (inbox.has(key)) {
    const v = inbox.get(key)
    inbox.delete(key)
    return Promise.resolve(v)
  }
  emit('need', { key })
  return new Promise((res, rej) => {
    waiters.set(key, res)
    setTimeout(() => rej(new Error(`no '${key}' from orchestrator in ${timeoutMs / 1000}s`)), timeoutMs)
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * SLOW))

// ------------------------------------------------------------------ browser + capture

let browser, ctx, page
let capturing = false
let captureDone = null
const frames = [] // { file, t }
const frameDir = join(OUT, `.frames-${NAME}`)

async function open(storage) {
  mkdirSync(OUT, { recursive: true })
  rmSync(frameDir, { recursive: true, force: true })
  mkdirSync(frameDir, { recursive: true })
  browser = await chromium.launch()
  ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    colorScheme: 'light',
    permissions: ['notifications'],
    storageState: storage,
    recordVideo: { dir: join(OUT, `.webm-${NAME}`), size: { width: W, height: H } },
  })
  page = await ctx.newPage()
  emit('page', { videoStart: Date.now() })
}

/** 2배 프레임 찍기 시작 (첫 화면이 그려진 뒤 부를 것) */
function startCapture() {
  capturing = true
  const minGap = 1000 / (FPS + 2)
  captureDone = (async () => {
    let n = 0
    while (capturing) {
      const a = Date.now()
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: 90, caret: 'initial', timeout: 4000 })
        const b = Date.now()
        n += 1
        const file = `f${String(n).padStart(6, '0')}.jpg`
        frames.push({ file, t: (a + b) / 2 })
        writeFile(join(frameDir, file), buf).catch(() => undefined)
      } catch {
        await new Promise((r) => setTimeout(r, 50)) // 이동 중 — 다음 장
      }
      const rest = minGap - (Date.now() - a)
      if (rest > 0) await new Promise((r) => setTimeout(r, rest))
    }
  })()
  const o = emit('start', { name: NAME })
  events.push({ t: o.t, label: 'capture start' })
}

async function finish(saveState) {
  capturing = false
  if (captureDone) await captureDone
  const tEnd = Date.now()
  if (saveState) {
    await ctx.storageState({ path: saveState })
    emit('state', { path: saveState })
  }
  const video = page.video()
  await ctx.close()
  await browser.close()
  // webm 원본
  let webm = null
  if (video) {
    const p = await video.path()
    webm = join(OUT, `${NAME}.webm`)
    renameSync(p, webm)
    rmSync(join(OUT, `.webm-${NAME}`), { recursive: true, force: true })
  }
  // 2배 mp4: 각 프레임을 찍힌 시각만큼 보여 주고 30 fps 로 고정
  await new Promise((r) => setTimeout(r, 300)) // 마지막 프레임 쓰기
  const usable = frames.filter((f) => existsSync(join(frameDir, f.file)))
  const lines = ['ffconcat version 1.0']
  for (let i = 0; i < usable.length; i++) {
    const next = i + 1 < usable.length ? usable[i + 1].t : tEnd
    lines.push(`file '${usable[i].file}'`, `duration ${Math.max(0.001, (next - usable[i].t) / 1000).toFixed(4)}`)
  }
  if (usable.length) lines.push(`file '${usable[usable.length - 1].file}'`)
  writeFileSync(join(frameDir, 'list.ffconcat'), lines.join('\n') + '\n')
  const mp4 = join(OUT, `${NAME}.mp4`)
  const ff = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(frameDir, 'list.ffconcat'),
      '-vf', `fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-movflags', '+faststart', mp4],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  )
  const span = usable.length > 1 ? (usable[usable.length - 1].t - usable[0].t) / 1000 : 0
  const info = {
    name: NAME,
    mp4: ff.status === 0 ? mp4 : null,
    webm,
    frames: usable.length,
    captureFps: span ? +(usable.length / span).toFixed(1) : 0,
    start: usable.length ? usable[0].t : null, // 2배 mp4 첫 프레임의 벽시계 ms
    end: tEnd,
    events,
  }
  writeFileSync(join(OUT, `${NAME}.events.json`), JSON.stringify(info, null, 1))
  if (ff.status === 0) rmSync(frameDir, { recursive: true, force: true })
  emit('done', info)
}

// ------------------------------------------------------------------ actions

/** 지금 보이는(전환 중 떠나는 사본이 아닌) 요소 하나 */
async function find(text, { exact = true, role, within, timeout = 15000 } = {}) {
  const root = within ? page.locator(within) : page
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const cands = []
    if (role) cands.push(root.getByRole(role, { name: text, exact }))
    else {
      cands.push(root.getByRole('button', { name: text, exact }), root.getByRole('link', { name: text, exact }))
      cands.push(root.getByText(text, { exact }))
    }
    for (const c of cands) {
      const n = await c.count()
      for (let i = n - 1; i >= 0; i--) {
        const el = c.nth(i)
        const ok = await el
          .evaluate((e) => {
            if (e.closest('[inert],[aria-hidden="true"]')) return false
            const r = e.getBoundingClientRect()
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight
          })
          .catch(() => false)
        if (ok) return el
      }
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`not on screen: '${text}'`)
}

/** 보는 사람이 화면을 읽을 틈을 두고 누름 */
async function tap(text, opts = {}) {
  const el = await find(text, opts)
  await sleep(opts.before ?? 900)
  mark(`tap ${text}`)
  await el.tap({ timeout: 5000 })
  await sleep(opts.after ?? 1300)
}

async function tab(name) {
  await tap(name, { within: 'nav', exact: true })
}

async function see(text, { exact = false, timeout = 20000, hold = 0 } = {}) {
  await find(text, { exact, timeout })
  if (hold) await sleep(hold)
}

async function scroll(dy, { hold = 900 } = {}) {
  await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), dy)
  await sleep(hold + 500)
}

async function goto(path) {
  mark(`open ${path}`)
  await page.goto(path.startsWith('http') ? path : BASE + path, { waitUntil: 'domcontentloaded' })
}

function lsState(entries) {
  return { cookies: [], origins: [{ origin: BASE, localStorage: Object.entries(entries).map(([name, value]) => ({ name, value })) }] }
}

// ------------------------------------------------------------------ flows

const FLOWS = {
  // M-10 → M-11 → M-12 → M-13 → 코드 입력 → 뒤로 → 나중에 연결할게요 → M-20(연결 전)
  async onboarding() {
    await open()
    await goto('/')
    startCapture()
    await see('시작하기', { exact: true, hold: 3200 })
    await tap('시작하기')
    await see('다음', { exact: true, hold: 1800 })
    await tap('다음')
    await see('보낼게요', { exact: true, hold: 2200 })
    await tap('보낼게요')
    await see('코드로 연결할게요', { hold: 2200 })
    await tap('코드로 연결할게요')
    await see('연결할게요', { hold: 2200 })
    mark('back')
    await page.goBack()
    await sleep(1600)
    await tap('나중에 연결할게요')
    await see('차와 연결할게요', { hold: 2500 })
    await scroll(420, { hold: 1800 })
    await scroll(-420, { hold: 1500 })
    await finish()
  },

  // M-20 시연: 지금 주차 중 카드(차가 칸에 드는 움직임) → 자주 가는 곳 → 좋아진 것
  async home() {
    await open()
    await goto('/?demo=1')
    startCapture()
    await see('지금 주차 중', { hold: 7000 })
    await finish()
  },

  // M-20 → M-01 내 주차 위치 → M-02 돌아가는 길 → 차 찾았어요 → 홈
  async parking() {
    await open()
    await goto('/?demo=1')
    startCapture()
    await see('지금 주차 중', { hold: 3500 })
    await tap('지금 주차 중', { exact: true })
    await see('돌아가는 길 보기', { hold: 2500 })
    await tap('돌아가는 길 보기')
    await sleep(3000)
    await scroll(500, { hold: 2000 })
    await tap('차 찾았어요')
    await sleep(3500)
    await finish()
  },

  // M-30 주차장 → 정렬 → M-31 상세 → 더 쉬운 곳 → 뒤로
  async lots() {
    await open()
    await goto('/?demo=1')
    startCapture()
    await see('지금 주차 중', { hold: 1800 })
    await tab('주차장')
    await sleep(2500)
    await tap('가까운 순')
    await sleep(1200)
    await tap('쉬운 순')
    await scroll(350, { hold: 1200 })
    await scroll(-350, { hold: 800 })
    await tap('현대백화점 판교점', { exact: false })
    await sleep(2500)
    await scroll(450, { hold: 1800 })
    await scroll(450, { hold: 1500 })
    await tap('더 쉬운 곳 보기')
    await sleep(3000)
    mark('back')
    await page.goBack()
    await sleep(1800)
    mark('back')
    await page.goBack()
    await sleep(2200)
    await finish()
  },

  // M-50 순위판 (M-53 이 올라오면 닫기) → M-51 내 점수 → 리그 시트 → M-53 지난주 결과
  async king() {
    await open()
    await goto('/?demo=1')
    startCapture()
    await see('지금 주차 중', { hold: 1500 })
    await tab('주차왕')
    await sleep(3000)
    if (await find('이미지로 공유하기', { timeout: 1500 }).then(() => true, () => false)) {
      await sleep(1500)
      await tap('닫기')
    }
    await scroll(400, { hold: 1500 })
    await scroll(-400, { hold: 800 })
    await tap('이번 주', { exact: true })
    await sleep(2800)
    await scroll(450, { hold: 1800 })
    await tap('순위로 돌아가기')
    await sleep(1500)
    const chip = page.locator('main').getByRole('button').filter({ hasText: /초보|모두|리그|판교/ }).first()
    await sleep(900)
    mark('tap league chip')
    await chip.tap()
    await sleep(2200)
    await tap('지난주 결과 볼게요')
    await sleep(3500)
    await tap('닫기')
    await sleep(2000)
    await finish()
  },

  // 설정 › 주차왕 그만두기 → 주차왕 탭 M-52 참여 전 → 다시 뽑기 → 참여할게요 → M-50
  async kingJoin() {
    await open()
    await goto('/?demo=1')
    startCapture()
    await see('지금 주차 중', { hold: 1500 })
    await tab('설정')
    await sleep(1800)
    await scroll(600, { hold: 900 })
    await tap('주차왕 그만두기')
    await tap('그만둘게요')
    await sleep(1200)
    await tab('주차왕')
    await see('참여할게요', { hold: 2500 })
    await tap('다시 뽑기')
    await sleep(800)
    await tap('다시 뽑기')
    await sleep(800)
    await tap('참여할게요')
    await sleep(2500)
    // 참여하면 지난주 결과(M-53)가 아래에서 한 번 올라온다 → 보고 닫으면 순위판 M-50
    if (await find('이미지로 공유하기', { timeout: 3000 }).then(() => true, () => false)) {
      await sleep(2000)
      await tap('닫기')
    }
    await sleep(2000)
    await scroll(400, { hold: 1500 })
    await scroll(-400, { hold: 1500 })
    await finish()
  },

  // M-32 기록 (이번 달 평균 후진, 6개월 막대) → M-33 주차 동선 → 다시 보기 → 뒤로
  async records() {
    await open()
    await goto('/?demo=1')
    startCapture()
    await see('지금 주차 중', { hold: 1500 })
    await tab('기록')
    await sleep(3000)
    await scroll(450, { hold: 1800 })
    const row = page.locator('main a, main [role="button"], main button').filter({ hasText: /B\d|\dF|후진/ }).first()
    await sleep(800)
    mark('tap first record')
    await row.tap()
    await sleep(5000)
    await tap('다시 보기')
    await sleep(5000)
    mark('back')
    await page.goBack()
    await sleep(2200)
    await finish()
  },

  // M-40 설정 → 운전 경력 → 뒤로 → 내 차(시연 중) › 시연 끝낼게요 → M-10
  async settings() {
    await open()
    await goto('/?demo=1')
    startCapture()
    await see('지금 주차 중', { hold: 1500 })
    await tab('설정')
    await sleep(2500)
    await tap('운전 경력', { exact: false })
    await sleep(2200)
    mark('back')
    await page.goBack()
    await sleep(1500)
    await scroll(500, { hold: 1500 })
    await scroll(-500, { hold: 900 })
    await tap('시연 중', { exact: false })
    await sleep(1500)
    await tap('시연 끝낼게요')
    await sleep(3500)
    await finish()
  },

  // (a) 실제 연결: M-13 → 코드로 연결할게요 → 차 화면의 숫자(오케스트레이터가 줌) → M-14 → 알림 받을게요 → 홈 → 설정 '연결됨'
  async pair() {
    await open(lsState({ 'pg:onboarded': '1', 'pg:pref:share': 'on' }))
    await goto('/connect')
    startCapture()
    await see('코드로 연결할게요', { hold: 1500 })
    mark('ready')
    const code = (await need('code')).replace(/\D/g, '')
    await tap('코드로 연결할게요')
    await sleep(1200)
    mark(`type ${code}`)
    await page.keyboard.type(code, { delay: 420 })
    mark('typed')
    await see('내 차와 연결됐어요', { timeout: 30000 })
    mark('phone connected')
    await sleep(3000)
    await tap('알림 받을게요')
    await see('홈', { exact: true, timeout: 20000 })
    await sleep(3500)
    await tab('설정')
    await sleep(3500)
    await tab('홈')
    await sleep(2500)
    await finish(STATE_OUT)
  },

  // (b) 연결된 폰 홈에서 기다리다 차가 주차하면(30초마다 확인) '지금 주차 중' → M-01 → M-02 → 차 찾았어요
  async park() {
    if (!STATE_IN) throw new Error('--state (pair 가 저장한 것) 필요')
    await open(JSON.parse(readFileSync(STATE_IN, 'utf8')))
    await goto('/')
    startCapture()
    await see('홈', { exact: true, hold: 1000 })
    mark('ready')
    await find('지금 주차 중', { exact: true, timeout: 600_000 })
    mark('parking appeared')
    await sleep(5000)
    await tap('지금 주차 중', { exact: true })
    await see('돌아가는 길 보기', { hold: 3000 })
    await tap('돌아가는 길 보기')
    await sleep(3500)
    await scroll(500, { hold: 2000 })
    await tap('차 찾았어요')
    await sleep(3500)
    await finish()
  },

  // (c) 연결 안 한 폰이 C-07 링크(QR·짧은 링크)를 엶 → M-01 → M-02 → 차 찾았어요 → M-10
  async share() {
    await open()
    const link = await need('link')
    await goto(link)
    startCapture()
    await see('돌아가는 길 보기', { hold: 3500, timeout: 30000 })
    await tap('돌아가는 길 보기')
    await sleep(3500)
    await scroll(500, { hold: 2000 })
    await tap('차 찾았어요')
    await sleep(3500)
    await finish()
  },
}

// ------------------------------------------------------------------ main

if (!flowName || flowName === 'list' || !FLOWS[flowName]) {
  console.log('flows: ' + Object.keys(FLOWS).join(', '))
  process.exit(flowName && flowName !== 'list' ? 2 : 0)
}
emit('hello', { flow: flowName, name: NAME, t0: t0wall })
try {
  await FLOWS[flowName]()
  process.exit(0)
} catch (e) {
  emit('error', { message: String(e?.message ?? e) })
  try {
    if (page) await page.screenshot({ path: join(OUT, `${NAME}-ERROR.png`) })
  } catch {}
  try {
    await finish()
  } catch {}
  process.exit(1)
}
