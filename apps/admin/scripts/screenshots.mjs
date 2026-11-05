// docs/screenshots/{dashboard,admin}/*.png 다시 만들기: 시연 모드(--mode mock) 개발 서버를 띄우고 Playwright(Chromium)로 1배율.
// 시각은 2026-11-03 오후 5:02(KST)로 고정 → '4분 전' 같은 상대 시각·6개월 추이의 달이 늘 같다. 운영자 W-01 지도 타일은
// OpenStreetMap에서 받는다 (네트워크가 없으면 단순 그림 지도로 찍힌다). 공개 대시보드 지도는 저장소 안의 그림이라 네트워크 필요 없음.
//
//   npm run screenshots              # 전부
//   npm run screenshots -- dashboard # 대시보드만 (admin 만도 됨)
//
// D-02 'PDF 리포트'는 page.pdf()(A4, 인쇄 스타일)로 만들어 쪽수를 확인하고, pdftoppm 이 있으면 쪽마다 PNG 미리보기를 남긴다
// (PDF 자체는 동선이 벡터로 들어가 1MB 넘게 커서 저장소에 넣지 않는다 — REPORT_PDF=경로 를 주면 거기에 저장).
//
// Playwright는 의존성에 넣지 않았다 (브라우저가 커서). 없으면: npm i --no-save playwright && npx playwright install chromium
// 이미 다른 곳에 깔려 있으면 PLAYWRIGHT=/경로/node_modules/playwright/index.js npm run screenshots
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'

let chromium
try {
  const spec = process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright'
  const mod = await import(spec)
  chromium = mod.chromium ?? mod.default?.chromium
  if (!chromium) throw new Error('chromium 없음')
} catch {
  console.error('playwright가 없어요: npm i --no-save playwright && npx playwright install chromium')
  process.exit(1)
}

const root = fileURLToPath(new URL('..', import.meta.url))
const outDirs = {
  admin: fileURLToPath(new URL('../../../docs/screenshots/admin/', import.meta.url)),
  dashboard: fileURLToPath(new URL('../../../docs/screenshots/dashboard/', import.meta.url)),
}
for (const d of Object.values(outDirs)) mkdirSync(d, { recursive: true })

const NOW = new Date('2026-11-03T17:02:00+09:00')
const only = process.argv[2] // 'admin' | 'dashboard' | undefined

const shots = [
  // 공개 대시보드 — 시안 docs/design/D-01~D-03.dc.html 과 같은 크기 (겹쳐 비교)
  { dir: 'dashboard', name: 'd10_difficulty', hash: '#/', w: 1440, h: 2560 },
  { dir: 'dashboard', name: 'd11_lot_detail', hash: '#/lots/hyundai-pangyo', w: 1440, h: 1840 },
  { dir: 'dashboard', name: 'd12_export', hash: '#/export?lot=hyundai-pangyo', w: 1440, h: 2040 },
  { dir: 'dashboard', name: 'd03_compare', hash: '#/compare', w: 1440, h: 940 },
  { dir: 'dashboard', name: 'd11_lot_detail_b4', hash: '#/lots/hyundai-pangyo?floor=B4', w: 1440, h: 900 },
  { dir: 'dashboard', name: 'd11_lot_detail_flat', hash: '#/lots/hwarang-park-public', w: 1440, h: 900 },
  { dir: 'dashboard', name: 'd03_compare_office', hash: '#/compare?type=office', w: 1440, h: 700 },
  { dir: 'dashboard', name: 'd10_difficulty_1024', hash: '#/', w: 1024, h: 900, full: true },
  { dir: 'dashboard', name: 'd11_lot_detail_1024', hash: '#/lots/hyundai-pangyo', w: 1024, h: 900, full: true },
  // 운영자 화면 (#/admin/...)
  { dir: 'admin', name: 'w01_dashboard', hash: '#/admin/vision', w: 1440, h: 1100, admin: true },
  { dir: 'admin', name: 'w01_dashboard_full', hash: '#/admin/vision', w: 1440, h: 1100, full: true, admin: true },
  { dir: 'admin', name: 'w01_dashboard_tablet', hash: '#/admin/vision', w: 820, h: 1180, full: true, admin: true },
  { dir: 'admin', name: 'lots', hash: '#/admin/lots', w: 1440, h: 900, admin: true },
  { dir: 'admin', name: 'lot_detail', hash: '#/admin/lots/hyundai-pangyo', w: 1440, h: 900, full: true, admin: true },
  { dir: 'admin', name: 'lot_edit', hash: '#/admin/lots/hyundai-pangyo/edit', w: 1440, h: 900, admin: true },
  { dir: 'admin', name: 'records', hash: '#/admin/records?lot=hyundai-pangyo', w: 1440, h: 900, admin: true },
  { dir: 'admin', name: 'login', hash: '#/admin', w: 1440, h: 900 },
].filter((s) => !only || s.dir === only)

const server = await createServer({
  root,
  mode: 'mock',
  logLevel: 'warn',
  server: { port: 5199, strictPort: false, host: '127.0.0.1' },
})
await server.listen()
const base = server.resolvedUrls.local[0].replace(/\/$/, '')
const browser = await chromium.launch()
const written = []

async function open(s) {
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, locale: 'ko-KR', timezoneId: 'Asia/Seoul', colorScheme: 'light',
  })
  if (s.admin) {
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem('pg-admin-token', 'dev-admin-token') } catch { /* 무시 */ }
    })
  }
  const page = await ctx.newPage()
  await page.clock.setFixedTime(NOW)
  await page.goto(base + '/' + s.hash, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  // 지도 타일·그림이 다 올 때까지 (없으면 바로 통과)
  await page
    .waitForFunction(() => [...document.querySelectorAll('img.leaflet-tile, img.d-map__base')].every((i) => i.complete), null, { timeout: 20000 })
    .catch(() => console.warn(`${s.name}: 지도 그림을 기다리다 넘어감`))
  await page.waitForTimeout(800)
  return { ctx, page }
}

try {
  for (const s of shots) {
    const { ctx, page } = await open(s)
    const path = `${outDirs[s.dir]}${s.name}.png`
    await page.screenshot({ path, fullPage: !!s.full })
    written.push(path)
    console.log(`✓ ${s.dir}/${s.name}.png`)
    await ctx.close()
  }

  if (!only || only === 'dashboard') {
    // D-02 리포트: 인쇄 스타일(A4) → PDF
    const { ctx, page } = await open({ hash: '#/lots/hyundai-pangyo', w: 1440, h: 1000 })
    await page.emulateMedia({ media: 'print' })
    const tmp = mkdtempSync(join(tmpdir(), 'pg-report-'))
    const pdf = join(tmp, 'd02_report.pdf')
    await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true })
    await ctx.close()
    if (process.env.REPORT_PDF) copyFileSync(pdf, process.env.REPORT_PDF)
    const r = spawnSync('pdftoppm', ['-r', '80', '-png', pdf, join(tmp, 'page')])
    if (r.status === 0) {
      const pages = readdirSync(tmp).filter((f) => f.startsWith('page') && f.endsWith('.png')).sort()
      pages.forEach((f, i) => {
        const path = `${outDirs.dashboard}d02_report_p${i + 1}.png`
        copyFileSync(join(tmp, f), path)
        written.push(path)
      })
      console.log(`✓ d02 리포트 PDF ${pages.length}쪽 → dashboard/d02_report_p*.png`)
    } else {
      console.log('✓ d02 리포트 PDF 만듦 (pdftoppm 이 없어 쪽 미리보기는 건너뜀)')
    }
    rmSync(tmp, { recursive: true, force: true })
  }
} finally {
  await browser.close()
  await server.close()
}

// 저장소가 무거워지지 않게 256색으로 줄인다 (지도 타일 때문에 600KB → 250KB 정도). Pillow 없으면 건너뜀
const QUANTIZE = `
import sys
from PIL import Image
for p in sys.argv[1:]:
    im = Image.open(p).convert('RGB')
    im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(p, optimize=True)
`
const q = spawnSync('python3', ['-I', '-c', QUANTIZE, ...written], { stdio: 'inherit' })
console.log(q.status === 0 ? '256색으로 줄임' : '(Pillow 없음: 원본 PNG 그대로)')
