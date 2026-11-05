// 주차각 화면 시안: src/index.html → out/*.pdf (벡터 글자) + out/png/<화면ID>.png (기기 프레임, 2배)
// 실행: node build.mjs   (Playwright Chromium, pdf-lib, qrcode)
import { chromium } from 'playwright';
import { PDFDocument, PDFName } from 'pdf-lib';
import QRCode from 'qrcode';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = pathToFileURL(path.join(ROOT, 'src', 'index.html')).href;
const OUT = path.join(ROOT, 'out');
const PNG_DIR = path.join(OUT, 'png');
const PDF_PATH = path.join(OUT, '주차각_화면시안.pdf');
const QR_URL = 'https://example.com/p/demo';

const qrSvg = await QRCode.toString(QR_URL, {
  type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1E1E1E', light: '#FFFFFF' },
});

async function openPage(browser, { dsf, viewport }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dsf });
  const page = await context.newPage();
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  page.on('requestfailed', (r) => console.error('request failed:', r.url()));
  await page.addInitScript(({ svg }) => { window.__QR_SVG = svg; }, { svg: qrSvg });
  await page.goto(SRC, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (!document.fonts.check('700 20px "Noto Sans KR App"')) throw new Error('Noto Sans KR 글꼴을 못 읽음');
  });
  return { context, page };
}

await fs.mkdir(PNG_DIR, { recursive: true });
const browser = await chromium.launch();

// ── 1. PDF (페이지 = 1920×1080, 글자는 벡터) ──
{
  const { context, page } = await openPage(browser, { dsf: 1, viewport: { width: 1920, height: 1080 } });
  const checks = await page.evaluate(() => window.__checks());
  const pageCount = await page.evaluate(() => document.querySelectorAll('section.page').length);
  const pdfBytes = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  // 블라인드 심사: 메타데이터에 사람·팀·도구 이름이 남지 않게 한다.
  // updateMetadata:false → pdf-lib 기본 Producer/Creator를 쓰지 않음. Chromium이 넣은 Creator도 지운다.
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const info = doc.getInfoDict();
  for (const k of ['Author', 'Creator', 'Subject', 'Keywords']) info.delete(PDFName.of(k));
  doc.setTitle('주차각 화면 시안');
  doc.setProducer('주차각');
  doc.setLanguage('ko-KR');
  await fs.writeFile(PDF_PATH, await doc.save());
  const { size } = await fs.stat(PDF_PATH);
  console.log(`PDF ${path.relative(ROOT, PDF_PATH)} · ${pageCount}쪽 · ${(size / 1024 / 1024).toFixed(2)} MB`);
  console.log('차 화면 버튼 (정차 중 76px 이상, 주행 중 0개):');
  for (const c of checks.carScreens) console.log(`  ${c.id.padEnd(12)} ${c.driving ? '주행 중' : '정차 중'}  버튼 ${String(c.buttons).padStart(2)}개  최소 높이 ${c.minButtonHeight ?? '-'}px`);
  for (const k of ['tapTooSmall', 'drivingWithTouch', 'carTextTooSmall', 'textOverflow', 'outsideScreen', 'forbiddenText']) {
    const v = checks[k];
    console.log(`  ${k}: ${v.length ? '\n    ' + v.join('\n    ') : '없음'}`);
    if (v.length && k !== 'outsideScreen') process.exitCode = 1;
  }
  await context.close();
}

// ── 2. 화면별 PNG (기기 프레임만, 원래 크기 × 2배) ──
{
  const { context, page } = await openPage(browser, { dsf: 2, viewport: { width: 2200, height: 1400 } });
  const ids = await page.evaluate(() => {
    document.documentElement.classList.add('png');
    const stage = document.createElement('div');
    stage.id = 'png-stage';
    document.body.prepend(stage);
    return Array.from(document.querySelectorAll('figure.dev[data-png]')).map((f) => f.dataset.png);
  });
  for (const id of ids) {
    await page.evaluate((id) => {
      const fig = document.querySelector(`section.page figure.dev[data-png="${id}"]`);
      document.getElementById('png-stage').replaceChildren(fig.cloneNode(true));
    }, id);
    const frame = await page.$('#png-stage .bezel');
    await frame.screenshot({ path: path.join(PNG_DIR, `${id}.png`), omitBackground: true });
  }
  console.log(`PNG ${ids.length}장 → ${path.relative(ROOT, PNG_DIR)}/ (${ids.join(', ')})`);
  await context.close();
}

await browser.close();
