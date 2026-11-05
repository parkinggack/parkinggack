#!/usr/bin/env node
// 주차각 PC 화면 녹화 — Playwright(Chromium). flow_video.py 의 'console-drive' · 'web-*' 클립이 부른다.
//
//   node desk_flows.mjs <flow> --out DIR [--name CLIP]
//   node desk_flows.mjs list
//
// flow
//   vc         Pleos Virtual Console(http://127.0.0.1:8088) 페이지를 직접 눌러 차를 굴린다 — D·ACCEL로 천천히 → BRAKE → R·ACCEL로 후진
//              → D → R → D → P. 1280×720, Playwright recordVideo(실시간). 앱 쪽 화면은 flow_video.py 가 adb 로 같은 시각에 찍는다
//   design     시안 D-01 개요(판교 지도) → D-02 주차장 상세(겹친 동선) → D-03 비교 — docs/design/*.dc.html, 1920×1080
//   w01        시안 W-01 난이도 지도 대시보드(PT 비전 화면) — 1920×1080
//   dashboard  배포된 PC 대시보드 https://parkinggack-data.vercel.app — D-10 난이도 한눈에 → D-11 주차장 상세 → D-12 데이터 내보내기
//
// 결과 (DIR 안)
//   vc: CLIP.mp4(1280×720 30 fps) + CLIP.webm(원본) · 나머지: CLIP.mp4(1920×1080 30 fps — 스크린샷을 한 장씩 찍어 이어 붙여서 스크롤이 매끈함)
//   CLIP.events.json  시작 시각(벽시계 ms)과 누른 순간들
//   stdout: {"ev":"start"|"mark"|"done"|"error", "t": epoch_ms, ...} 줄 단위 JSON
//
// 준비: 이 폴더에서 npm i, ffmpeg. design·w01 은 docs/design 을 이 스크립트가 잠깐 띄운 로컬 서버로 연다
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, renameSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../..')
const FPS = 30
const VC = 'http://127.0.0.1:8088'
const DASH = 'https://parkinggack-data.vercel.app'

const argv = process.argv.slice(2)
const flowName = argv[0]
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const OUT = resolve(opt('out', join(HERE, 'out')))
const NAME = opt('name', `desk-${flowName}`)
const FFMPEG = process.env.FFMPEG || 'ffmpeg'

const events = []
let tStart = null
function emit(ev, extra = {}) {
  const o = { ev, t: Date.now(), ...extra }
  process.stdout.write(JSON.stringify(o) + '\n')
  return o
}
function mark(label) {
  const o = emit('mark', { label })
  events.push({ t: o.t, label })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

function ff(args) {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', ...args], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg 실패: ${args.join(' ')}`)
}

// ------------------------------------------------------------------ 한 장씩 찍는 녹화 (정적인 웹 화면)

class StepRec {
  constructor(page, name) {
    this.page = page
    this.dir = join(OUT, `.frames-${name}`)
    rmSync(this.dir, { recursive: true, force: true })
    mkdirSync(this.dir, { recursive: true })
    this.list = [] // [file, seconds]
    this.n = 0
    this.clock = 0 // 영상 안 시각(초)
  }
  async shot(sec) {
    const f = join(this.dir, `${String(++this.n).padStart(5, '0')}.png`)
    await this.page.screenshot({ path: f })
    this.list.push([f, sec])
    this.clock += sec
  }
  /** 지금 화면을 sec 초 동안 */
  async hold(sec) {
    await this.shot(sec)
  }
  /** 실제 시간으로 ms 동안 계속 찍기 (전환 애니메이션) */
  async live(ms) {
    const end = Date.now() + ms
    let last = Date.now()
    while (Date.now() < end) {
      const f = join(this.dir, `${String(++this.n).padStart(5, '0')}.png`)
      await this.page.screenshot({ path: f })
      const now = Date.now()
      this.list.push([f, Math.max(1 / FPS, (now - last) / 1000)])
      this.clock += (now - last) / 1000
      last = now
    }
  }
  /** 문서를 to(px)까지 sec 초 동안 부드럽게 스크롤 (한 프레임씩) */
  async scrollTo(to, sec, sel = null) {
    const from = await this.page.evaluate((s) => (s ? document.querySelector(s).scrollTop : window.scrollY), sel)
    const frames = Math.max(2, Math.round(sec * FPS))
    for (let i = 1; i <= frames; i++) {
      const y = from + (to - from) * ease(i / frames)
      await this.page.evaluate(([s, v]) => (s ? (document.querySelector(s).scrollTop = v) : window.scrollTo(0, v)), [sel, y])
      await this.shot(1 / FPS)
    }
  }
  mark(label) {
    events.push({ t: Math.round(this.clock * 1000), label, videoTime: true })
    emit('mark', { label, at: +this.clock.toFixed(2) })
  }
  encode(mp4) {
    const txt = join(this.dir, 'list.txt')
    const lines = []
    for (const [f, d] of this.list) lines.push(`file '${f}'`, `duration ${d.toFixed(4)}`)
    lines.push(`file '${this.list[this.list.length - 1][0]}'`)
    writeFileSync(txt, lines.join('\n') + '\n')
    ff(['-f', 'concat', '-safe', '0', '-i', txt, '-vf', `fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-crf', '16',
      '-preset', 'slow', '-movflags', '+faststart', mp4])
    rmSync(this.dir, { recursive: true, force: true })
  }
}

async function desktop(width = 1920, height = 1080) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'ko-KR' })
  const page = await ctx.newPage()
  return { browser, page }
}

function serveDesign() {
  const port = 8766
  const p = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
    cwd: join(REPO, 'docs/design'), stdio: 'ignore',
  })
  return { url: `http://127.0.0.1:${port}`, stop: () => p.kill() }
}

/** 화면에 '불러오는 중'이 사라지고 네트워크가 잠잠해질 때까지 (최대 40초) */
async function settled(page) {
  await page.waitForFunction(() => !document.body.innerText.includes('불러오는 중'), null, { timeout: 40_000 }).catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
  await sleep(700)
}

async function gotoSettled(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.evaluate(() => document.fonts && document.fonts.ready)
  await sleep(800)
}

// ------------------------------------------------------------------ flows

const FLOWS = {
  // 시안 D-01 → D-02 → D-03 (엔딩 지도 장면용)
  async design() {
    const srv = serveDesign()
    await sleep(800)
    const { browser, page } = await desktop()
    try {
      await gotoSettled(page, `${srv.url}/D-01.dc.html`)
      const rec = new StepRec(page, NAME)
      tStart = Date.now()
      emit('start', { kind: 'step' })
      rec.mark('D-01 개요 — 판교 지도')
      await rec.hold(4.0)
      await rec.scrollTo(260, 2.2)
      await rec.hold(2.0)
      await rec.scrollTo(0, 1.6)
      await rec.hold(1.5)
      rec.mark('D-02 주차장 상세 — 겹친 동선')
      await page.getByRole('link', { name: '주차장 상세' }).first().click()
      await page.waitForLoadState('networkidle')
      await sleep(600)
      await rec.hold(4.0)
      await rec.scrollTo(320, 2.4)
      await rec.hold(2.5)
      await rec.scrollTo(0, 1.6)
      await rec.hold(1.0)
      rec.mark('D-03 주차장 비교')
      await page.getByRole('link', { name: '비교' }).first().click()
      await page.waitForLoadState('networkidle')
      await sleep(600)
      await rec.hold(4.0)
      rec.mark('D-01 로 돌아감 (지도)')
      await page.getByRole('link', { name: '개요' }).first().click()
      await page.waitForLoadState('networkidle')
      await sleep(600)
      await rec.hold(3.0)
      rec.encode(join(OUT, `${NAME}.mp4`))
    } finally {
      await browser.close()
      srv.stop()
    }
  },

  // 시안 W-01 (난이도 지도 대시보드 — PT 비전 화면)
  async w01() {
    const srv = serveDesign()
    await sleep(800)
    const { browser, page } = await desktop()
    try {
      await gotoSettled(page, `${srv.url}/W-01.dc.html`)
      const rec = new StepRec(page, NAME)
      tStart = Date.now()
      emit('start', { kind: 'step' })
      rec.mark('W-01 난이도 지도 · 까다로운 주차장 순위')
      await rec.hold(4.5)
      const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
      rec.mark('아래로 — 주차하다 헤맨 흔적이 진짜 주차장 지도가 돼요')
      await rec.scrollTo(h, 2.6)
      await rec.hold(4.0)
      await rec.scrollTo(0, 2.0)
      await rec.hold(2.5)
      rec.encode(join(OUT, `${NAME}.mp4`))
    } finally {
      await browser.close()
      srv.stop()
    }
  },

  // 배포된 대시보드 D-10 → D-11 → D-12
  async dashboard() {
    const { browser, page } = await desktop()
    try {
      await gotoSettled(page, `${DASH}/`)
      await settled(page)
      const rec = new StepRec(page, NAME)
      tStart = Date.now()
      emit('start', { kind: 'step' })
      rec.mark('D-10 주차 난이도 한눈에')
      await rec.hold(3.5)
      await rec.scrollTo(560, 2.4)
      await rec.hold(3.0)
      const h = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
      await rec.scrollTo(Math.min(h, 1500), 2.4)
      await rec.hold(2.5)
      await rec.scrollTo(0, 1.8)
      await rec.hold(1.0)
      rec.mark('D-11 주차장 상세 (현대백화점 판교점)')
      await page.getByRole('link', { name: '주차장 상세' }).first().click()
      await settled(page) // '불러오는 중…'은 찍지 않는다 (데이터가 다 온 뒤부터)
      await rec.live(500)
      await rec.hold(3.5)
      await rec.scrollTo(520, 2.4)
      await rec.hold(3.0)
      const h2 = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
      await rec.scrollTo(Math.min(h2, 1400), 2.4)
      await rec.hold(2.5)
      await rec.scrollTo(0, 1.6)
      rec.mark('D-12 데이터 내보내기')
      await page.getByRole('link', { name: '데이터 내보내기' }).first().click()
      await settled(page)
      // 오른쪽 미리보기 표(session_id …)가 채워질 때까지
      await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length >= 3 && !document.body.innerText.includes('불러오는 중'),
        null, { timeout: 45_000 }).catch(() => emit('mark', { label: 'D-12 미리보기가 45초 안에 안 옴' }))
      await sleep(600)
      await rec.live(500)
      await rec.hold(3.5)
      await rec.scrollTo(480, 2.2)
      await rec.hold(3.0)
      await rec.scrollTo(0, 1.6)
      await rec.hold(1.5)
      rec.encode(join(OUT, `${NAME}.mp4`))
    } finally {
      await browser.close()
    }
  },

  // Virtual Console 페이지를 직접 눌러 운전 (실시간 녹화)
  async vc() {
    const vdir = join(OUT, `.video-${NAME}`)
    rmSync(vdir, { recursive: true, force: true })
    const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, recordVideo: { dir: vdir, size: { width: 1280, height: 720 } },
    })
    tStart = Date.now() // recordVideo 는 페이지가 생길 때부터
    const page = await ctx.newPage()
    emit('start', { kind: 'realtime' })
    const state = async () => {
      try {
        const j = await (await fetch(`${VC}/vehicle/state`)).json()
        return { gear: j?.gear?.actual?.value, kph: j?.controls?.speed_kph }
      } catch {
        return {}
      }
    }
    const gear = async (g) => {
      mark(`console gear ${g}`)
      await page.locator('button.prnd-i', { hasText: new RegExp(`^${g}$`) }).click()
      await sleep(300)
    }
    const hold = async (sel, ms, label) => {
      const b = await page.locator(sel).boundingBox()
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      mark(`console ${label} ${ms}ms`)
      await page.mouse.down()
      await sleep(ms)
      await page.mouse.up()
    }
    const steer = async (deg) => {
      mark(`console steering ${deg}`)
      await page.evaluate((v) => {
        const s = document.querySelector('#steeringSlider')
        s.value = String(v)
        s.dispatchEvent(new Event('input', { bubbles: true }))
        s.dispatchEvent(new Event('change', { bubbles: true }))
      }, deg)
      await sleep(250)
    }
    try {
      await page.goto(`${VC}/`, { waitUntil: 'networkidle' })
      await sleep(2500)
      mark('console ready')
      await sleep(2000)
      // 저속 구간 10초 이상 + 후진 1 m 이상 → 앱이 '주차 기록 중'(LowSpeedEntryDetector 규칙 B)
      await gear('D')
      await sleep(1200)
      await hold('#acceleratorPad', 550, 'ACCEL')
      await sleep(3200)
      await hold('#brakePad', 1400, 'BRAKE')
      await sleep(900)
      await steer(-260)
      await gear('R') // Pleos 후방 카메라가 앱을 덮는다 (정상)
      await sleep(900)
      await hold('#acceleratorPad', 650, 'ACCEL')
      await sleep(2600)
      await hold('#brakePad', 1200, 'BRAKE')
      await sleep(600)
      await steer(0)
      await gear('D') // → 앱 '주차 기록 중 · 후진 1'
      await sleep(4500)
      await hold('#acceleratorPad', 450, 'ACCEL')
      await sleep(2200)
      await hold('#brakePad', 1300, 'BRAKE')
      await sleep(800)
      await steer(220)
      await gear('R')
      await sleep(900)
      await hold('#acceleratorPad', 600, 'ACCEL')
      await sleep(2400)
      await hold('#brakePad', 1200, 'BRAKE')
      await sleep(600)
      await steer(0)
      await gear('D') // → '후진 2'
      await sleep(4500)
      await gear('P') // → C-05
      await sleep(7000)
      mark('end')
      emit('state', await state())
    } finally {
      await ctx.close()
      await browser.close()
    }
    const webm = readdirSync(vdir).find((f) => f.endsWith('.webm'))
    renameSync(join(vdir, webm), join(OUT, `${NAME}.webm`))
    rmSync(vdir, { recursive: true, force: true })
    ff(['-i', join(OUT, `${NAME}.webm`), '-vf', `fps=${FPS},format=yuv420p`, '-c:v', 'libx264', '-crf', '16',
      '-movflags', '+faststart', join(OUT, `${NAME}.mp4`)])
  },
}

// ------------------------------------------------------------------ main

if (flowName === 'list' || !FLOWS[flowName]) {
  console.log('flows: ' + Object.keys(FLOWS).join(', '))
  process.exit(flowName === 'list' ? 0 : 1)
}
mkdirSync(OUT, { recursive: true })
try {
  await FLOWS[flowName]()
  const info = { name: NAME, flow: flowName, start: tStart, events }
  writeFileSync(join(OUT, `${NAME}.events.json`), JSON.stringify(info, null, 1))
  emit('done', { mp4: join(OUT, `${NAME}.mp4`), start: tStart, events })
} catch (e) {
  emit('error', { message: String(e && e.stack || e) })
  process.exit(1)
}
