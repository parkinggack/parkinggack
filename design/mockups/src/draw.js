/*
 * 주차각 화면 시안 — 반복 컴포넌트와 도식(SVG)을 그린다.
 * 외부 라이브러리 없음. 난수는 시드 고정(mulberry32)이라 빌드할 때마다 같은 그림이 나온다.
 * QR 코드는 build.mjs 가 qrcode 패키지로 만들어 window.__QR_SVG 로 넣어 준다.
 */
(function () {
  'use strict';
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const f1 = (n) => Math.round(n * 10) / 10;
  const ic = (name, style = '') => `<svg class="ic"${style ? ` style="${style}"` : ''}><use href="#i-${name}"/></svg>`;
  const LV_WORD = { 1: '아주 쉬움', 2: '쉬움', 3: '보통', 4: '어려움', 5: '아주 어려움' };
  const lvOf = (s) => Math.min(5, Math.max(1, Math.floor(s + 0.5)));
  const barsHtml = (lv, style = '') => `<span class="bars lv${lv}"${style ? ` style="${style}"` : ''}>${[1, 2, 3, 4, 5].map((k) => `<i${k <= lv ? ' class="f"' : ''}></i>`).join('')}</span>`;
  const logoSvg = () => `<svg viewBox="0 0 48 48" style="width:100%;height:100%;display:block"><rect class="lg-bg" width="48" height="48" rx="13"/><path class="lg-fg" d="M15 36V12h9a7 7 0 0 1 0 14h-9" stroke-width="5"/><path class="lg-fg" d="M27 38h8a3 3 0 0 0 3-3v-8" stroke-width="3.5"/></svg>`;

  /* Catmull-Rom → 3차 베지어 (점을 부드럽게 잇기) */
  function smooth(pts, t = 0.5) {
    if (pts.length < 2) return '';
    let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
    if (pts.length === 2) return d + `L${pts[1][0].toFixed(2)} ${pts[1][1].toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) * t / 3, p1[1] + (p2[1] - p0[1]) * t / 3];
      const c2 = [p2[0] - (p3[0] - p1[0]) * t / 3, p2[1] - (p3[1] - p1[1]) * t / 3];
      d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d;
  }
  function sampleCurve(pts, step) {
    // 직선 보간으로 고르게 점 찍기 (히트맵 집계용)
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
      for (let k = 0; k < n; k++) out.push([x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n]);
    }
    return out;
  }

  /* ───────── 화면 조각 (주간·야간이 같은 내용을 공유) ───────── */
  const C02 = `
    <div class="map" data-map="city" style="left:-168px"></div>
    <div class="map-note">내비 지도 자리 (도식)</div>
    <section class="card strong c02card">
      <div class="top"><span class="label">도착지 주차장</span><span class="iconbtn tap">${ic('close')}</span></div>
      <div class="badge-big" style="margin-top:4px"><div class="score"><em>★</em><b>4.3</b></div><div class="side">${barsHtml(4)}<span>어려움</span></div></div>
      <h2>도착지 주차장은 조금 까다로워요</h2>
      <p class="name">한빛백화점 지하주차장</p>
      <div class="tags" style="margin-top:28px">
        <span class="tag">${ic('ramp')}회전 램프 좁음</span>
        <span class="tag">${ic('rev')}평균 후진 3.2회</span>
        <span class="tag">${ic('pillar')}기둥 많음</span>
      </div>
      <p class="caption" style="margin-top:22px">최근 30일, 차량 142대 기준</p>
      <div style="flex:1"></div>
      <span class="btn primary tap">더 쉬운 곳 보기</span>
      <span class="btn secondary mid tap" style="margin-top:16px">괜찮아요, 그냥 갈게요</span>
    </section>`;

  const C05 = `
    <div style="position:absolute;left:64px;top:52px;width:840px;display:flex;flex-direction:column">
      <span class="chip-p" style="align-self:flex-start"><i>P</i>주차 완료</span>
      <span class="floor" style="font-size:330px;margin-top:34px">B2</span>
      <span style="font-size:56px;line-height:70px;font-weight:700;margin-top:26px">B2에 대셨나요?</span>
      <span style="font-size:31px;line-height:44px;color:var(--muted);margin-top:8px">후진 2회, 1분 40초, 평소보다 수월했어요</span>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:40px">
        <span class="btn primary tap" style="height:120px;font-size:38px">맞아요</span>
        <span class="btn secondary tap" style="height:120px">다른 층이에요</span>
        <span class="btn quiet tap" style="height:104px;font-size:30px">${ic('grid')}구역도 기억하기</span>
        <span class="btn quiet tap" style="height:104px;font-size:30px">${ic('phone')}폰으로 보내기</span>
      </div>
    </div>
    <div class="card strong" style="position:absolute;left:968px;right:56px;top:52px;height:740px;padding:32px 36px;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="label">오늘 주차 동선</span><span style="font-size:24px;font-weight:500;color:var(--muted)">눌러서 크게 보기 ›</span></div>
      <div class="trail tap" data-trail="thumb" style="flex:1;margin-top:18px;border-radius:14px;overflow:hidden"></div>
      <div style="display:flex;align-items:center;gap:14px;margin-top:24px;font-size:31px;font-weight:700">${ic('crown', 'width:38px;height:38px')}주차왕 이번 주 12등 → 10등</div>
    </div>
    <div style="position:absolute;left:64px;right:56px;bottom:56px;display:flex;align-items:center;gap:30px">
      <div class="track" style="flex:1;height:14px"><i style="width:45%"></i></div>
      <span style="font-size:27px;color:var(--muted)">그대로 두면 3초 뒤 B2로 저장돼요</span>
    </div>`;

  /* ───────── 지도 도식 (실제 지도 아님: 블록·도로선만) ───────── */
  function cityMap(car) {
    const W = 1920, H = 1032, R = rng(7);
    const xs = [-40, 420, 820, 1200, 1580, 1960], ys = [-40, 230, 420, 610, 840, 1072];
    let blocks = '';
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
      const x0 = xs[i] + 34, x1 = xs[i + 1] - 34, y0 = ys[j] + 34, y1 = ys[j + 1] - 34;
      const splits = 1 + Math.floor(R() * 3);
      const horiz = R() < 0.5;
      for (let k = 0; k < splits; k++) {
        const a = k / splits, b = (k + 1) / splits;
        const bx0 = horiz ? x0 + (x1 - x0) * a + (k ? 10 : 0) : x0, bx1 = horiz ? x0 + (x1 - x0) * b - (k < splits - 1 ? 10 : 0) : x1;
        const by0 = horiz ? y0 : y0 + (y1 - y0) * a + (k ? 10 : 0), by1 = horiz ? y1 : y0 + (y1 - y0) * b - (k < splits - 1 ? 10 : 0);
        if (bx1 - bx0 > 40 && by1 - by0 > 40) blocks += `<rect class="m-blk" x="${bx0.toFixed(0)}" y="${by0.toFixed(0)}" width="${(bx1 - bx0).toFixed(0)}" height="${(by1 - by0).toFixed(0)}" rx="10"/>`;
      }
    }
    const roads = [
      ['M820 -40V1072', 34], ['M1200 -40V1072', 34], ['M1580 -40V1072', 34], ['M420 -40V1072', 22],
      ['M-40 230H1960', 34], ['M-40 420H1960', 34], ['M-40 840H1960', 22],
      ['M-40 650C500 650 820 612 1200 606S1700 580 1960 566', 48],
    ];
    const edge = roads.map(([d, w]) => `<path class="m-road-edge" d="${d}" stroke-width="${w + 4}"/>`).join('');
    const road = roads.map(([d, w]) => `<path class="m-road" d="${d}" stroke-width="${w}"/>`).join('');
    const route = 'M1200 1072V420H1440V340';
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><rect class="m-bg" width="${W}" height="${H}"/>${blocks}${edge}${road}
      <path class="m-route-case" d="${route}"/><path class="m-route" d="${route}"/>
      <circle class="m-pin-o" cx="1440" cy="300" r="36"/><circle class="m-pin-i" cx="1440" cy="300" r="13"/>
      <rect class="m-label" x="1496" y="270" width="190" height="60" rx="14"/><text class="m-label-t" x="1591" y="301" text-anchor="middle" dominant-baseline="central">한빛백화점</text>${car ? navArrow(...car) : ''}</svg>`;
  }

  // 내 차 위치(내비 화살표)
  const navArrow = (x, y, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot})"><circle r="40" fill="var(--ink)"/><path d="M0 -22L17 16 0 7 -17 16Z" fill="var(--surface)"/></g>`;
  function entranceMap() {
    const W = 1920, H = 1032, R = rng(11);
    let blocks = '';
    [[60, 80, 520, 300], [60, 420, 520, 260], [1720, 80, 180, 520], [60, 900, 560, 200], [760, 900, 600, 200], [1480, 900, 420, 200]].forEach(([x, y, w, h]) => {
      blocks += `<rect class="m-blk" x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/>`;
    });
    const road = [['M-40 800H1960', 64], ['M660 -40V800', 36], ['M1160 800V700', 72]];
    const r1 = road.map(([d, w]) => `<path class="m-road-edge" d="${d}" stroke-width="${w + 4}"/>`).join('') + road.map(([d, w]) => `<path class="m-road" d="${d}" stroke-width="${w}"/>`).join('');
    // 램프 빗금(아래로 내려가는 길)
    let hatch = '';
    for (let y = 430; y < 640; y += 26) hatch += `<path d="M1124 ${y}l36 22 36-22" fill="none" stroke="var(--line-strong)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
    const route = 'M-40 800H1160V660';
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><rect class="m-bg" width="${W}" height="${H}"/>${blocks}${r1}
      <rect class="m-lot" x="760" y="120" width="880" height="540" rx="18"/>
      <text class="m-label-t" x="1200" y="200" text-anchor="middle" style="font-size:34px">한빛백화점</text>
      <text x="1200" y="246" text-anchor="middle" style="font-size:24px;fill:var(--muted);font-family:var(--font)">건물 (도식)</text>
      <rect x="1110" y="400" width="100" height="262" fill="var(--placeholder)" stroke="var(--line-strong)" stroke-width="3"/>
      ${hatch}
      <path class="m-route-case" d="${route}"/><path class="m-route" d="${route}"/>
      <g transform="translate(1160 712)"><circle r="40" fill="var(--ink)"/><path d="M0 -22L17 16 0 7 -17 16Z" fill="var(--surface)"/></g>
      <rect class="m-label" x="1250" y="560" width="290" height="60" rx="14"/><text class="m-label-t" x="1395" y="591" text-anchor="middle" dominant-baseline="central">지하주차장 입구</text>
      <g transform="translate(1290 690)"><rect width="64" height="64" rx="14" fill="var(--ink)"/><text x="32" y="34" text-anchor="middle" dominant-baseline="central" style="font-size:40px;font-weight:700;fill:var(--surface);font-family:var(--font)">P</text></g></svg>`;
  }

  function miniMap() {
    // C-03 왼쪽: 도착지와 대안 두 곳 (도식)
    let s = `<svg viewBox="0 0 540 420" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;position:absolute;inset:0"><rect width="540" height="420" fill="var(--placeholder)"/>`;
    [60, 180, 300, 420, 520].forEach((x) => { s += `<path d="M${x} -10V430" stroke="var(--map-road)" stroke-width="14"/>`; });
    [50, 160, 270, 380].forEach((y) => { s += `<path d="M-10 ${y}H550" stroke="var(--map-road)" stroke-width="14"/>`; });
    // 걷는 길 점선
    s += `<path d="M300 215L180 105" stroke="var(--ink)" stroke-width="5" stroke-dasharray="4 12" stroke-linecap="round" fill="none"/>`;
    s += `<path d="M300 215L420 325" stroke="var(--ink)" stroke-width="5" stroke-dasharray="4 12" stroke-linecap="round" fill="none"/>`;
    // 도착지
    s += `<circle cx="300" cy="215" r="30" fill="var(--ink)"/><circle cx="300" cy="215" r="11" fill="var(--placeholder)"/>`;
    s += `<rect x="338" y="192" width="118" height="44" rx="10" fill="var(--raised)" stroke="var(--line)" stroke-width="2"/><text x="397" y="215" text-anchor="middle" dominant-baseline="central" style="font-size:22px;font-weight:700;fill:var(--ink);font-family:var(--font)">도착지</text>`;
    [[180, 105, '1', '4분'], [420, 325, '2', '6분']].forEach(([x, y, n, w]) => {
      s += `<circle cx="${x}" cy="${y}" r="30" fill="var(--surface)" stroke="var(--ink)" stroke-width="5"/><text x="${x}" y="${y + 1}" text-anchor="middle" dominant-baseline="central" style="font-size:28px;font-weight:700;fill:var(--ink);font-family:var(--font)">${n}</text>`;
      const lx = n === '1' ? x - 6 : x - 112;
      s += `<rect x="${lx - 68}" y="${y + 38}" width="136" height="40" rx="10" fill="var(--raised)" stroke="var(--line)" stroke-width="2"/><text x="${lx}" y="${y + 58}" text-anchor="middle" dominant-baseline="central" style="font-size:21px;font-weight:500;fill:var(--ink);font-family:var(--font)">걸어서 ${w}</text>`;
    });
    return s + '</svg>';
  }

  /* ───────── 주차 동선 (위에서 내려다본 일러스트, 단위 m) ─────────
   * 칸 2.5m × 5.0m, 통로 6.0m. 위 칸줄 y 0~5, 통로 5~11, 아래 칸줄 11~16. 목표 칸 x 15~17.5 (중심선 16.25).
   * 선을 따라가면 ① → ② → ③ 순서로만 만나고, 네 구간은 서로 겹치지 않는다.
   *   1 전진: 통로 가운데로 들어와 목표 칸을 1.5칸 지나쳐 정지 ①
   *   2 후진: 위쪽 왼쪽으로 크게 휘며 칸 입구 오른쪽 모서리로, 칸 안 1/4쯤에서 정지 ② (마지막 구간과 떨어지게 오른쪽으로)
   *   3 전진: 앞으로 조금 나와 칸 중심선 바로 아래 ③ (짧은 실선)
   *   4 후진: 칸 중심선을 따라 곧게 올라가 정차 (차 아이콘) */
  const TRAIL = {
    segs: [
      { t: 'f', p: [[-1, 8.4], [8, 8.4], [15, 8.4], [18.5, 8.4], [20, 8.4]] },
      { t: 'r', p: [[20, 8.4], [19.2, 7.85], [18.55, 7.1], [18.1, 6.2], [17.75, 5.15], [17.35, 4.0]] },
      { t: 'f', p: [[17.35, 4.0], [17.05, 4.9], [16.75, 5.85], [16.5, 6.55], [16.25, 7.0]] },
      { t: 'r', p: [[16.25, 7.0], [16.25, 5.4], [16.25, 3.7], [16.25, 2.4]] },
    ],
    pts: [[20, 8.4, '1'], [17.35, 4.0, '2'], [16.25, 7.0, '3']],
    car: [16.25, 2.4],
  };
  function carTop(cx, cy, w = 1.85, l = 4.3, rot = 0) {
    // 위에서 본 차. 앞(앞유리)이 +y 쪽(통로 쪽)
    return `<g class="car-top" transform="translate(${cx} ${cy}) rotate(${rot})"><rect class="body" x="${-w / 2}" y="${-l / 2}" width="${w}" height="${l}" rx="${w * 0.26}"/>` +
      `<rect class="glass" x="${-w / 2 + 0.2}" y="${0.25}" width="${w - 0.4}" height="${0.95}" rx="0.16"/>` +
      `<rect class="glass" x="${-w / 2 + 0.28}" y="${-l / 2 + 0.42}" width="${w - 0.56}" height="${0.5}" rx="0.12" opacity=".75"/></g>`;
  }
  function trailInner(win, o) {
    const [x0, x1, y0, y1] = win;
    let s = `<rect class="tr-bg" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>`;
    s += `<rect class="tr-aisle" x="${x0}" y="5" width="${x1 - x0}" height="6"/>`;
    const k0 = Math.floor(x0 / 2.5) - 1, k1 = Math.ceil(x1 / 2.5) + 1;
    for (let k = k0; k <= k1; k++) {
      s += `<line class="tr-stall" x1="${k * 2.5}" y1="0" x2="${k * 2.5}" y2="5" style="stroke-width:${o.lw}"/>`;
      if (y1 > 11.5) s += `<line class="tr-stall" x1="${k * 2.5}" y1="11" x2="${k * 2.5}" y2="16" style="stroke-width:${o.lw}"/>`;
    }
    s += `<line class="tr-wall" x1="${x0}" y1="0" x2="${x1}" y2="0" style="stroke-width:${o.lw * 1.4}"/>`;
    if (y1 > 15.8) s += `<line class="tr-wall" x1="${x0}" y1="16" x2="${x1}" y2="16" style="stroke-width:${o.lw * 1.4}"/>`;
    if (o.center) s += `<line class="tr-center" x1="${x0}" y1="8" x2="${x1}" y2="8" style="stroke-width:${o.lw};stroke-dasharray:${o.lw * 7} ${o.lw * 6}"/>`;
    if (o.labels) {
      s += `<text class="tr-txt on-aisle" x="${x0 + 0.35}" y="5.75" style="font-size:${o.fs}px">통로</text>`;
      s += `<text class="tr-txt" x="${x0 + 0.35}" y="0.85" style="font-size:${o.fs}px">주차 칸 (그림)</text>`;
    }
    TRAIL.segs.forEach((g, i) => {
      const p = i === 0 ? [[Math.min(-1, x0 - 0.5), g.p[0][1]], ...g.p.slice(1)] : g.p;
      s += g.t === 'f' ? `<path class="tr-fwd" d="${smooth(p)}" style="stroke-width:${o.sw}"/>`
        : `<path class="tr-rev" d="${smooth(p)}" style="stroke-width:${o.sw};stroke-dasharray:${o.sw * 2.1} ${o.sw * 1.7}"/>`;
    });
    s += carTop(TRAIL.car[0], TRAIL.car[1]);
    if (o.start) {
      const ax = Math.max(x0 + 1.9, 4.2), ay = TRAIL.segs[0].p[0][1];
      s += `<path d="M${ax} ${ay - 0.5}L${ax + 0.7} ${ay} ${ax} ${ay + 0.5}" fill="none" stroke="var(--ink)" style="stroke-width:${o.sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
      s += `<text class="tr-txt on-aisle" x="${ax - 1}" y="${ay + 1.2}" style="font-size:${o.fs}px">진입</text>`;
    }
    if (o.carLabel) s += `<text x="17.75" y="2.2" style="font-size:${o.fs}px;font-weight:700;fill:var(--ink);font-family:var(--font)">내 차</text>`;
    // 번호 원: 바탕색 테두리를 한 겹 둘러 차 아이콘, 칸 선 위에서도 또렷하게
    if (o.num) TRAIL.pts.forEach(([x, y, n]) => {
      s += `<g class="tr-pt"><circle class="halo" cx="${x}" cy="${y}" r="${o.num + o.sw * 0.55}"/><circle cx="${x}" cy="${y}" r="${o.num}" style="stroke-width:${o.sw * 0.6}"/><text x="${x}" y="${y + o.num * 0.06}" style="font-size:${o.num * 1.15}px">${n}</text></g>`;
    });
    return s;
  }
  const TRAIL_VARIANTS = {
    full: { win: [3, 26, -0.6, 16.6], sw: 0.17, lw: 0.06, num: 0.56, fs: 0.56, labels: true, start: true, center: true, carLabel: true },
    thumb: { win: [7.5, 25, -0.5, 13.2], sw: 0.2, lw: 0.07, num: 0.6, fs: 0.7, labels: true, center: true },
    mini: { win: [10.5, 23.5, -0.1, 9.2], sw: 0.3, lw: 0.11, num: 0, fs: 0, labels: false },
  };
  const TRAIL_WIN = Object.fromEntries(Object.entries(TRAIL_VARIANTS).map(([k, v]) => [k, v.win.slice()]));
  function trail(el) {
    const o = TRAIL_VARIANTS[el.dataset.trail];
    let [x0, x1, y0, y1] = o.win;
    // 요소 비율에 맞춰 보이는 범위를 넓힌다 (지정 범위는 항상 다 보이게)
    const W = el.clientWidth, H = el.clientHeight;
    if (W && H) {
      const ea = W / H, wa = (x1 - x0) / (y1 - y0);
      if (ea > wa) { const w = (y1 - y0) * ea, c = (x0 + x1) / 2; x0 = c - w / 2; x1 = c + w / 2; }
      else { const h = (x1 - x0) / ea, c = (y0 + y1) / 2; y0 = c - h / 2; y1 = c + h / 2; }
    }
    o.win = [x0, x1, y0, y1];
    el.innerHTML = `<svg viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" preserveAspectRatio="xMidYMid slice">${trailInner([x0, x1, y0, y1], o)}</svg>`;
    o.win = TRAIL_WIN[el.dataset.trail];
  }

  function steps(el) {
    const rows = [['S', '0:00', '통로로 들어옴'], ['1', '0:32', '칸을 지나쳐 멈춤 → 후진'], ['2', '1:05', '앞으로 조금 (보정)'], ['3', '1:20', '다시 후진해서 칸으로'], ['P', '1:40', '주차 완료']];
    el.innerHTML = rows.map(([n, t, d], i) => {
      const mark = n === 'S' ? `<span style="width:46px;height:46px;display:flex;align-items:center;justify-content:center"><i style="width:14px;height:14px;border-radius:7px;background:var(--ink);display:block"></i></span>`
        : `<span style="width:46px;height:46px;border-radius:23px;${n === 'P' ? 'background:var(--inverse);color:var(--on-inverse);' : 'border:3px solid var(--ink);'}display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;flex:none">${n}</span>`;
      return `<div style="display:flex;align-items:center;gap:22px;height:50px">${mark}<span style="width:76px;font-size:26px;color:var(--muted)">${t}</span><span style="font-size:28px;${i === 4 ? 'font-weight:700' : ''}">${d}</span></div>`;
    }).join('');
  }

  /* ───────── 원칙 페이지 견본 ───────── */
  function kitLevels(el) {
    const desc = { 1: '넓은 평면, 후진 거의 없음', 2: '조금 좁지만 자리 넉넉', 3: '램프와 기둥이 조금', 4: '좁은 램프, 기둥 많음', 5: '기계식, 나선 램프' };
    el.innerHTML = [1, 2, 3, 4, 5].map((lv) => `<div style="display:flex;align-items:center;gap:30px;height:76px">${barsHtml(lv, 'font-size:54px')}<b style="width:96px;font-size:44px">★${lv}</b><b style="width:250px;font-size:40px">${LV_WORD[lv]}</b><span class="caption" style="font-size:28px">${desc[lv]}</span></div>`).join('');
    el.style.gap = '6px';
  }
  function kitTrail(el) {
    const m = 64; // px per m
    let s = `<svg viewBox="0 0 1120 904" style="width:100%;height:100%">`;
    s += `<rect width="1120" height="904" fill="var(--surface)"/>`;
    s += `<text x="44" y="52" style="font-size:26px;font-weight:700;fill:var(--muted);font-family:var(--font)">주차 칸과 통로 (실제 비율)</text>`;
    // 칸 하나 (2.5 × 5.0m)
    const sx = 72, sy = 150, sw = 2.5 * m, sh = 5 * m;
    s += `<rect x="${sx - 20}" y="${sy + sh}" width="${sw + 140}" height="76" fill="var(--placeholder)"/>`;
    s += `<path d="M${sx} ${sy + sh}V${sy}H${sx + sw}V${sy + sh}" fill="none" stroke="var(--line-strong)" stroke-width="4"/>`;
    s += `<g transform="translate(${sx + sw / 2} ${sy + sh / 2}) scale(${m})">${carTop(0, 0)}</g>`;
    s += `<path d="M${sx} ${sy - 26}H${sx + sw}M${sx} ${sy - 36}v20M${sx + sw} ${sy - 36}v20" stroke="var(--ink)" stroke-width="3"/>`;
    s += `<text x="${sx + sw / 2}" y="${sy - 44}" text-anchor="middle" style="font-size:28px;font-weight:700;fill:var(--ink);font-family:var(--font)">2.5m</text>`;
    s += `<path d="M${sx + sw + 26} ${sy}V${sy + sh}M${sx + sw + 16} ${sy}h20M${sx + sw + 16} ${sy + sh}h20" stroke="var(--ink)" stroke-width="3"/>`;
    s += `<text x="${sx + sw + 44}" y="${sy + sh / 2 + 10}" style="font-size:28px;font-weight:700;fill:var(--ink);font-family:var(--font)">5.0m</text>`;
    s += `<text x="${sx}" y="${sy + sh + 48}" style="font-size:26px;font-weight:500;fill:var(--muted);font-family:var(--font)">통로 띠 (폭 6.0m)</text>`;
    // 작은 동선 예시
    const win = [9, 25, -0.4, 11.4];
    s += `<svg x="470" y="110" width="600" height="${600 * (win[3] - win[2]) / (win[1] - win[0])}" viewBox="${win[0]} ${win[2]} ${win[1] - win[0]} ${win[3] - win[2]}">${trailInner(win, { sw: 0.2, lw: 0.07, num: 0.62, fs: 0.6, labels: false, center: true })}</svg>`;
    // 범례
    const ly = 586, row = 74;
    const legend = [
      [`<line x1="0" y1="0" x2="130" y2="0" stroke="var(--ink)" stroke-width="10" stroke-linecap="round"/>`, '전진 = 실선', '앞으로 간 길'],
      [`<line x1="0" y1="0" x2="130" y2="0" stroke="var(--ink)" stroke-width="10" stroke-linecap="round" stroke-dasharray="20 16"/>`, '후진 = 점선', '뒤로 간 길'],
      [[1, 2, 3].map((n, i) => `<circle cx="${18 + i * 46}" cy="0" r="18" fill="var(--surface)" stroke="var(--ink)" stroke-width="4"/><text x="${18 + i * 46}" y="1" text-anchor="middle" dominant-baseline="central" style="font-size:21px;font-weight:700;fill:var(--ink);font-family:var(--font)">${n}</text>`).join(''), '전환점 ①②③', '방향을 바꾼 곳, 순서대로'],
      [`<g transform="translate(65 0) rotate(-90) scale(30)">${carTop(0, 0)}</g>`, '위에서 본 차', '앞유리 쪽이 앞'],
    ];
    legend.forEach(([g, t, d], i) => {
      const y = ly + i * row;
      s += `<g transform="translate(72 ${y})">${g}</g>`;
      s += `<text x="260" y="${y + 10}" style="font-size:32px;font-weight:700;fill:var(--ink);font-family:var(--font)">${t}</text>`;
      s += `<text x="520" y="${y + 10}" style="font-size:27px;fill:var(--muted);font-family:var(--font)">${d}</text>`;
    });
    s += `<text x="72" y="${ly + 4 * row + 6}" style="font-size:26px;fill:var(--muted);font-family:var(--font)">카메라 영상이 아니에요. 차속, 핸들, 기어 신호로 다시 그린 그림</text>`;
    el.innerHTML = s + '</svg>';
  }

  /* ───────── 히트맵 (요일 × 시간, 밝기 단계) ───────── */
  const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
  function heatLevel(d, h, R) {
    // 평일 오후 · 주말 낮이 붐빈다 (예시)
    const weekend = d >= 5;
    const peak = weekend ? Math.exp(-((h - 15) ** 2) / 18) * 4.4 : Math.exp(-((h - 16) ** 2) / 10) * (d === 4 ? 3.9 : 3.1);
    return Math.max(1, Math.min(5, Math.round(1 + peak + (R() - 0.5) * 0.8)));
  }
  function heat(el) {
    const car = el.dataset.heat === 'car';
    const R = rng(car ? 31 : 32);
    const hours = car ? [8, 10, 12, 14, 16, 18, 20] : [8, 10, 12, 14, 16, 18, 20, 22];
    const pal = car ? ['#2F2F2D', '#4A4944', '#6B6964', '#B5B3AD', '#F4F3EF'] : ['#ECEAE4', '#D6D3CB', '#A3A098', '#5F5D57', '#1E1E1E'];
    const cw = car ? 54 : 70, ch = car ? 56 : 17, lab = car ? 40 : 26, gap = car ? 7 : 4, fs = car ? 21 : 11;
    let s = `<div style="display:grid;grid-template-columns:${lab}px repeat(${hours.length},${cw}px);gap:${gap}px;align-items:center">`;
    s += `<span></span>` + hours.map((h) => `<span style="font-size:${fs}px;color:var(--muted);text-align:center">${h}시</span>`).join('');
    DAYS.forEach((d, i) => {
      s += `<span style="font-size:${fs}px;color:var(--muted);text-align:center">${d}</span>`;
      hours.forEach((h) => { const lv = heatLevel(i, h, R); s += `<span style="height:${ch}px;border-radius:${car ? 8 : 4}px;background:${pal[lv - 1]};${car && lv === 1 ? 'border:1.5px solid #3A3936;' : ''}display:block"></span>`; });
    });
    s += '</div>';
    if (car) s += `<div style="display:flex;align-items:center;gap:10px;margin-top:26px;font-size:21px;color:var(--muted)">한산${pal.map((c) => `<span style="width:30px;height:22px;border-radius:5px;background:${c};${c === '#2F2F2D' ? 'border:1.5px solid #3A3936;' : ''}display:block"></span>`).join('')}붐빔</div>`;
    el.innerHTML = s;
  }

  /* ───────── D-01 지역 지도 (도식) ───────── */
  const LOTS = [
    { n: '한빛백화점 지하주차장', l: '한빛백화점', x: 430, y: 176, c: 1284, s: 4.3, me: true, lab: 'r' },
    { n: '오피스 A', l: '오피스 A', x: 290, y: 96, c: 860, s: 4.0, lab: 'l' },
    { n: '푸른숲병원', l: '푸른숲병원', x: 628, y: 112, c: 640, s: 3.6, lab: 'r' },
    { n: '상가 B', x: 540, y: 282, c: 420, s: 3.5 },
    { n: '오피스 C', x: 170, y: 232, c: 530, s: 3.3 },
    { n: '주상복합 D', x: 712, y: 300, c: 380, s: 3.1 },
    { n: '문화센터 E', x: 96, y: 96, c: 300, s: 2.9 },
    { n: '아파트 상가 F', x: 382, y: 334, c: 260, s: 2.7 },
    { n: '중앙시장 공영주차장', l: '중앙시장 공영', x: 236, y: 330, c: 720, s: 2.4, lab: 'l' },
    { n: '새솔마트', l: '새솔마트', x: 646, y: 212, c: 910, s: 2.1, lab: 'r' },
    { n: '한빛로 공영주차장', l: '한빛로 공영', x: 498, y: 66, c: 690, s: 1.8, lab: 'r' },
    { x: 740, y: 60, c: 180, s: 2.2 }, { x: 120, y: 330, c: 150, s: 1.6 }, { x: 330, y: 250, c: 210, s: 3.0 },
    { x: 590, y: 352, c: 160, s: 2.6 }, { x: 760, y: 170, c: 120, s: 1.9 }, { x: 40, y: 200, c: 140, s: 2.4 },
  ];
  const WEB_LV = ['#C9C6BD', '#A3A098', '#7A7770', '#4A4944', '#1E1E1E'];
  function regionMap(el) {
    const R = rng(5);
    const W = 800, H = 392;
    let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%"><rect width="${W}" height="${H}" fill="#E9E7E1"/>`;
    // 블록
    const xs = [-20, 140, 260, 400, 560, 690, 820], ys = [-20, 80, 150, 250, 310, 412];
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
      const x0 = xs[i] + 10, x1 = xs[i + 1] - 10, y0 = ys[j] + 10, y1 = ys[j + 1] - 10;
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const a = k / n, b = (k + 1) / n;
        s += `<rect x="${(x0 + (x1 - x0) * a + (k ? 4 : 0)).toFixed(1)}" y="${y0}" width="${((x1 - x0) / n - (k ? 4 : 0)).toFixed(1)}" height="${y1 - y0}" rx="4" fill="#DFDCD4"/>`;
      }
    }
    // 공원(블록 하나를 옅게)
    s += `<rect x="570" y="320" width="110" height="82" rx="6" fill="#E3E1DA" stroke="#D6D3CB"/>`;
    // 도로
    xs.slice(1, -1).forEach((x) => { s += `<path d="M${x} -10V402" stroke="#FFFFFF" stroke-width="9"/>`; });
    ys.slice(1, -1).forEach((y) => { s += `<path d="M-10 ${y}H810" stroke="#FFFFFF" stroke-width="9"/>`; });
    s += `<path d="M-10 214C200 206 330 160 470 150S690 120 810 104" stroke="#D6D3CB" stroke-width="20" fill="none"/><path d="M-10 214C200 206 330 160 470 150S690 120 810 104" stroke="#FFFFFF" stroke-width="15" fill="none"/>`;
    s += `<text x="96" y="196" style="font-size:12px;font-weight:700;fill:#8A8780;font-family:var(--font)" transform="rotate(-3 96 196)">한빛로</text>`;
    s += `<text x="300" y="384" style="font-size:12px;font-weight:700;fill:#8A8780;font-family:var(--font)">중앙시장</text>`;
    // 원: 크기 = 기록 수, 진하기 = 난이도
    const sorted = LOTS.slice().sort((a, b) => b.c - a.c);
    sorted.forEach((p) => {
      const r = 4 + Math.sqrt(p.c) * 0.46, lv = lvOf(p.s);
      s += `<circle cx="${p.x}" cy="${p.y}" r="${r.toFixed(1)}" fill="${WEB_LV[lv - 1]}" stroke="#FFFFFF" stroke-width="2"/>`;
      if (p.me) s += `<circle cx="${p.x}" cy="${p.y}" r="${(r + 6).toFixed(1)}" fill="none" stroke="#1E1E1E" stroke-width="2" stroke-dasharray="4 3"/>`;
    });
    LOTS.filter((p) => p.l).forEach((p) => {
      const r = 4 + Math.sqrt(p.c) * 0.46 + (p.me ? 8 : 3);
      const right = p.lab === 'r';
      s += `<text x="${p.x + (right ? r + 4 : -r - 4)}" y="${p.y + 4}" text-anchor="${right ? 'start' : 'end'}" style="font-size:12.5px;font-weight:700;fill:#1E1E1E;font-family:var(--font);paint-order:stroke;stroke:#F4F3EF;stroke-width:4px;stroke-linejoin:round">${p.l} ${p.s.toFixed(1)}</text>`;
    });
    s += `<g transform="translate(14 ${H - 30})"><rect width="118" height="22" rx="6" fill="#FFFFFF" stroke="#D6D3CB"/><circle cx="14" cy="11" r="5" fill="none" stroke="#1E1E1E" stroke-width="1.5" stroke-dasharray="3 2"/><text x="26" y="15" style="font-size:11px;fill:#1E1E1E;font-family:var(--font)">내 주차장 (운영사)</text></g>`;
    el.innerHTML = s + '</svg>';
  }
  function legendLv(el) {
    el.innerHTML = `<span style="display:inline-flex;gap:3px">${WEB_LV.map((c) => `<span style="width:11px;height:11px;border-radius:6px;background:${c};display:block"></span>`).join('')}</span>쉬움 → 어려움,`;
    el.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
  }
  function top10(el) {
    const rows = [
      ['한빛백화점 지하주차장', 4.3, 3.2, true], ['오피스 A', 4.0, 2.9], ['푸른숲병원', 3.6, 2.6], ['상가 B', 3.5, 2.5], ['오피스 C', 3.3, 2.4],
      ['주상복합 D', 3.1, 2.2], ['문화센터 E', 2.9, 2.0], ['아파트 상가 F', 2.7, 1.9], ['중앙시장 공영주차장', 2.4, 1.6], ['새솔마트', 2.1, 1.4],
    ];
    el.innerHTML = rows.map(([n, s, r, me], i) => `<div style="display:grid;grid-template-columns:22px 1fr 78px 40px 30px;align-items:center;gap:8px;height:37.5px;border-bottom:${i < 9 ? '1px solid #E6E3DC' : '0'};font-size:13.5px">
      <span style="color:#5F5D57;text-align:right">${i + 1}</span>
      <span style="font-weight:700;white-space:nowrap;overflow:hidden">${n}${me ? ' <span style="font-size:11px;font-weight:700;padding:1px 6px;border-radius:5px;border:1.2px solid #1E1E1E;margin-left:4px">내 주차장</span>' : ''}</span>
      <span style="color:#5F5D57;text-align:right;font-size:12.5px">후진 ${r.toFixed(1)}회</span>
      ${barsHtml(lvOf(s), 'font-size:16px;justify-self:end')}
      <b style="text-align:right">${s.toFixed(1)}</b></div>`).join('');
  }
  function better(el) {
    const rows = [
      ['한빛백화점 지하주차장', '램프 출구 반사경 설치', [3.8, 3.7, 3.7, 3.6, 3.2, 3.2], 3.7, 3.2],
      ['중앙시장 공영주차장', '주차선 다시 칠함', [2.0, 2.0, 1.9, 1.7, 1.6, 1.6], 2.0, 1.6],
      ['상가 B', '기둥 보호대, 칸 번호 표지', [2.9, 2.9, 2.8, 2.7, 2.6, 2.5], 2.9, 2.5],
    ];
    el.innerHTML = rows.map(([n, w, v, a, b], i) => {
      const max = Math.max(...v), min = Math.min(...v);
      const pts = v.map((y, k) => `${(k * 22).toFixed(1)},${(4 + (max - y) / Math.max(0.3, max - min) * 20).toFixed(1)}`).join(' ');
      return `<div style="display:grid;grid-template-columns:1fr 120px 128px;align-items:center;gap:12px;height:50px;border-bottom:${i < 2 ? '1px solid #E6E3DC' : '0'}">
        <div style="min-width:0"><b style="display:block;font-size:14px;white-space:nowrap">${n}</b><span style="font-size:12px;color:#5F5D57">${w}</span></div>
        <svg width="120" height="28" viewBox="-4 0 120 28"><polyline points="${pts}" fill="none" stroke="#1E1E1E" stroke-width="2" stroke-linejoin="round"/><circle cx="110" cy="${(4 + (max - v[5]) / Math.max(0.3, max - min) * 20).toFixed(1)}" r="3" fill="#1E1E1E"/></svg>
        <b style="font-size:14px;text-align:right;white-space:nowrap">후진 ${a.toFixed(1)} → ${b.toFixed(1)}회</b></div>`;
    }).join('') + `<p class="wnote" style="margin-top:8px">개선 전 4개월과 개선 후 2개월의 평균 후진이에요.</p>`;
  }

  /* ───────── D-02 평면 위 동선 겹치기 (시드 고정 난수로 280개) ───────── */
  function lotPlan(el) {
    const R = rng(20261104);
    const X0 = 210, SW = 25, N = 31, X1 = X0 + SW * N; // 985
    const RX = 1015, LX = 180;
    const AISLE = { 1: 110, 2: 270, 3: 430 };
    const ROWS = {
      A: { y0: 30, y1: 80, open: 1, a: 1 }, B: { y0: 140, y1: 190, open: -1, a: 1 },
      C: { y0: 190, y1: 240, open: 1, a: 2 }, D: { y0: 300, y1: 350, open: -1, a: 2 },
      E: { y0: 350, y1: 400, open: 1, a: 3 }, F: { y0: 460, y1: 510, open: -1, a: 3 },
    };
    const pick = (list) => { let r = R(), acc = 0; for (const [k, w] of list) { acc += w; if (r <= acc) return k; } return list[list.length - 1][0]; };
    const segsAll = [];
    const NPATH = 280;
    for (let p = 0; p < NPATH; p++) {
      const j = (R() - 0.5) * 18;
      const jj = () => (R() - 0.5) * 5;
      const rowKey = pick([['A', 0.13], ['B', 0.18], ['C', 0.21], ['D', 0.2], ['E', 0.16], ['F', 0.12]]);
      const row = ROWS[rowKey];
      const loop = row.a >= 2 && R() < 0.22;
      let i = loop ? N - 1 - Math.floor(Math.pow(R(), 1.1) * 11) : Math.floor(Math.pow(R(), 1.25) * N);
      i = Math.max(0, Math.min(N - 1, i));
      const cx = X0 + SW * i + SW / 2 + (R() - 0.5) * 3;
      const ay = AISLE[row.a] + j;
      const segs = [];
      let cur = [], type = 'f';
      const push = (x, y) => cur.push([x, y]);
      const flip = (t) => { segs.push({ t: type, p: cur }); cur = [cur[cur.length - 1]]; type = t; };
      // 램프에서 나와 왼쪽 통로로
      push(124 + jj() * 0.4, 252 + jj() * 0.4); push(142 + jj() * 0.5, 258 + j * 0.25); push(160, 266 + j * 0.5);
      if (R() < 0.36) { // ① 램프 출구: 돌자마자 시야가 좁아 멈칫 후진
        push(186 + jj(), 256 + j * 0.3); flip('r'); push(172 + jj(), 276 + jj()); flip('f');
      }
      let dir = 1;
      if (loop) { // 통로 1로 올라가 북동쪽 코너를 돌아 내려온다
        push(LX + j * 0.5, 236); push(LX + j * 0.5, 140); push(LX + 26, AISLE[1] + j * 0.7); push(560, AISLE[1] + j * 0.7); push(950, AISLE[1] + j * 0.6);
        if (R() < 0.8) { push(1002 + jj(), 96 + jj()); flip('r'); push(990 + jj(), 128 + jj()); flip('f'); } // ③ 북동쪽 코너
        push(RX + j * 0.4, 150); push(RX + j * 0.4, ay - 24); push(RX - 24, ay);
        dir = -1;
      } else if (row.a === 1) { push(LX + j * 0.5, 236); push(LX + j * 0.5, 140); push(LX + 26, ay); }
      else if (row.a === 3) { push(LX + j * 0.5, 304); push(LX + j * 0.5, 400); push(LX + 26, ay); }
      else {
        push(LX + 34, ay);
        if (!loop && cx > 500 && R() < 0.42) { // ② 기둥 C-4 옆을 지나다 멈칫
          push(430 + jj(), ay + jj() * 0.6); flip('r'); push(412 + jj(), ay + 5 + jj()); flip('f'); push(470, ay);
        }
      }
      // 칸을 지나쳐 멈추고 뒤로 넣기
      const entY = row.open > 0 ? row.y1 : row.y0;
      const finY = (row.y0 + row.y1) / 2 + (R() - 0.5) * 4;
      const pass = 32 + R() * 18;
      if (Math.abs(cx - dir * 70 - (dir > 0 ? LX : RX)) > 40) push(cx - dir * 70, ay);
      push(cx + dir * pass * 0.55, ay + row.open * 7);
      push(cx + dir * pass, ay + row.open * 15 + jj());
      flip('r');
      const nearPillar = row.a === 2 && Math.abs(cx - 435) < 62;
      if (nearPillar ? R() < 0.95 : R() < 0.1) { // ② 기둥 C-4 앞: 한 번 더 고쳐 넣기
        push(cx + dir * 14, ay - row.open * 2);
        push(cx + dir * 7 + jj(), entY + row.open * 10);
        flip('f');
        push(cx + dir * 20, ay - row.open * 3 + jj());
        flip('r');
      }
      push(cx + dir * 12, ay - row.open * 6);
      push(cx + dir * 2, entY + row.open * 6);
      push(cx, entY - row.open * 8);
      push(cx, finY);
      segs.push({ t: type, p: cur });
      segsAll.push(...segs);
    }
    // 히트맵: 후진 구간을 20×20 칸으로 집계
    const CELL = 25, counts = new Map();
    segsAll.filter((g) => g.t === 'r').forEach((g) => sampleCurve(g.p, 5).forEach(([x, y]) => {
      const k = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`; counts.set(k, (counts.get(k) || 0) + 1);
    }));
    const vals = [...counts.values()].sort((a, b) => a - b);
    const q = (t) => vals[Math.floor(vals.length * t)];
    const th = [q(0.72), q(0.88), q(0.955), q(0.985)];
    const op = [0.06, 0.13, 0.23, 0.38];

    el.style.position = 'relative';
    let s = `<svg viewBox="22 12 1042 538" preserveAspectRatio="xMidYMid meet" style="position:absolute;inset:0;width:100%;height:100%">`;
    // 바닥: 벽, 통로 띠
    s += `<rect x="40" y="30" width="1005" height="480" fill="#1E1E1E" stroke="#6B6964" stroke-width="2"/>`;
    [[X0 - 60, 80, X1 - X0 + 120, 60], [X0 - 60, 240, X1 - X0 + 120, 60], [X0 - 60, 400, X1 - X0 + 120, 60], [150, 80, 60, 380], [985, 80, 60, 380]]
      .forEach(([x, y, w, h]) => { s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#262625"/>`; });
    // 램프 · 코어
    s += `<rect x="128" y="246" width="30" height="48" fill="#262625"/>`;
    s += `<circle cx="92" cy="270" r="46" fill="#262625" stroke="#6B6964" stroke-width="2"/><circle cx="92" cy="270" r="20" fill="#1E1E1E" stroke="#4A4944" stroke-width="2"/>`;
    s += `<path d="M92 232a38 38 0 0 1 38 38" fill="none" stroke="#8A8780" stroke-width="2" stroke-dasharray="4 4"/><path d="M126 262l4 9 6-8" fill="none" stroke="#8A8780" stroke-width="2"/>`;
    s += `<rect x="52" y="356" width="86" height="80" rx="4" fill="#2A2A28" stroke="#4A4944"/><text x="95" y="400" text-anchor="middle" style="font-size:13px;fill:#B5B3AD;font-family:var(--font)">엘리베이터</text>`;
    s += `<rect x="52" y="44" width="86" height="150" rx="4" fill="#2A2A28" stroke="#4A4944"/><text x="95" y="124" text-anchor="middle" style="font-size:13px;fill:#B5B3AD;font-family:var(--font)">계단</text>`;
    // 주차 칸
    Object.values(ROWS).forEach((r) => {
      let d = '';
      for (let k = 0; k <= N; k++) d += `M${X0 + SW * k} ${r.y0}V${r.y1}`;
      d += r.open > 0 ? `M${X0} ${r.y0}H${X1}` : `M${X0} ${r.y1}H${X1}`;
      s += `<path d="${d}" stroke="#3A3936" stroke-width="1.2" fill="none"/>`;
    });
    // 히트맵 칸
    counts.forEach((c, k) => {
      let lv = -1; th.forEach((t, i) => { if (c >= t) lv = i; });
      if (lv < 0) return;
      const [cx, cy] = k.split(',').map(Number);
      s += `<rect x="${cx * CELL + 1.5}" y="${cy * CELL + 1.5}" width="${CELL - 3}" height="${CELL - 3}" rx="5" fill="#F4F3EF" fill-opacity="${op[lv]}"/>`;
    });
    // 동선: 전진 실선(옅게), 후진 점선(진하게)
    segsAll.filter((g) => g.t === 'f').forEach((g) => { s += `<path d="${smooth(g.p)}" fill="none" stroke="#F4F3EF" stroke-opacity=".085" stroke-width="1.5" stroke-linecap="round"/>`; });
    segsAll.filter((g) => g.t === 'r').forEach((g) => { s += `<path d="${smooth(g.p)}" fill="none" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="1.3" stroke-dasharray="3 2.6"/>`; });
    // 기둥 (7.5m 간격)
    [80, 140, 240, 300, 400, 460].forEach((y) => { for (let k = 0; k <= 10; k++) s += `<rect x="${X0 + 75 * k - 4.5}" y="${y - 4.5}" width="9" height="9" fill="#8A8780"/>`; });
    s += `<text x="${X0 + 225 + 8}" y="236" style="font-size:12px;font-weight:700;fill:#F4F3EF;font-family:var(--font);paint-order:stroke;stroke:#1E1E1E;stroke-width:3px">C-4</text>`;
    // 후진 다발 지점 상위 3
    [[176, 268, '1', '램프 출구'], [435, 262, '2', '기둥 C-4 앞'], [1006, 112, '3', '북동쪽 코너']].forEach(([x, y, n]) => {
      s += `<circle cx="${x}" cy="${y}" r="30" fill="none" stroke="#F4F3EF" stroke-width="2.2" stroke-dasharray="5 4"/>`;
      const bx = n === '1' ? x + 24 : x - 26, by = y - 26;
      s += `<circle cx="${bx}" cy="${by}" r="13" fill="#F4F3EF"/><text x="${bx}" y="${by + 1}" text-anchor="middle" dominant-baseline="central" style="font-size:15px;font-weight:700;fill:#1E1E1E;font-family:var(--font)">${n}</text>`;
    });
    s += `<text x="70" y="324" style="font-size:12px;fill:#B5B3AD;font-family:var(--font)">램프</text>`;
    // 범례
    const ly = 534;
    s += `<g style="font-size:13px;fill:#B5B3AD;font-family:var(--font)">
      <line x1="44" y1="${ly}" x2="74" y2="${ly}" stroke="#F4F3EF" stroke-width="2.5"/><text x="82" y="${ly + 4.5}">앞으로</text>
      <line x1="140" y1="${ly}" x2="170" y2="${ly}" stroke="#FFFFFF" stroke-width="2.5" stroke-dasharray="4 3"/><text x="178" y="${ly + 4.5}">후진</text>
      <rect x="226" y="${ly - 7}" width="14" height="14" rx="3" fill="#F4F3EF" fill-opacity=".42"/><text x="248" y="${ly + 4.5}">후진이 잦은 칸 (진할수록 많음)</text>
      <rect x="452" y="${ly - 4.5}" width="9" height="9" fill="#8A8780"/><text x="468" y="${ly + 4.5}">기둥</text>
      <circle cx="520" cy="${ly}" r="7" fill="none" stroke="#F4F3EF" stroke-width="1.6" stroke-dasharray="3 2"/><text x="534" y="${ly + 4.5}">후진 다발 지점 상위 3</text>
      <text x="1044" y="${ly + 4.5}" text-anchor="end">동선은 차량 신호로 다시 그린 그림 (예시)</text></g>`;
    el.innerHTML = s + '</svg>';
  }
  function hot(el) {
    const rows = [
      ['1', '램프 출구', '돌자마자 시야가 좁아 멈칫해요', '34%', '반사경, 바닥 화살표'],
      ['2', '기둥 C-4 앞', '기둥이 칸 입구를 가려요', '27%', '기둥 보호대, 칸 폭 표시'],
      ['3', '북동쪽 코너', '막다른 모퉁이에서 돌아 나와요', '19%', '회전 안내 표지'],
    ];
    el.innerHTML = rows.map(([n, t, d, v, idea], i) => `<div style="display:grid;grid-template-columns:30px 1fr auto;gap:12px;padding:12px 0;border-bottom:${i < 2 ? '1px solid #E6E3DC' : '0'}">
      <span style="width:28px;height:28px;border-radius:14px;border:2px solid #1E1E1E;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">${n}</span>
      <div><b style="display:block;font-size:15px;line-height:20px">${t}</b><span style="font-size:12px;color:#5F5D57">${d}</span>
      <div style="margin-top:6px;display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:6px;background:#F4F3EF;font-size:11.5px;font-weight:500">고칠 거리: ${idea}</div></div>
      <b style="font-size:20px;line-height:26px">${v}</b></div>`).join('');
  }
  function floorsDist(el) {
    const rows = [['B1', 18], ['B2', 31], ['B3', 22], ['B4', 14], ['B5', 9], ['B6', 6]];
    el.innerHTML = rows.map(([f, v]) => `<div class="hbar" style="grid-template-columns:28px 1fr 38px"><b>${f}</b><div class="t"><i class="${f === 'B2' ? '' : 'm'}" style="width:${v / 31 * 100}%"></i></div><span>${v}%</span></div>`).join('');
  }
  function hoursDist(el) {
    const v = [4, 9, 16, 21, 22, 15, 9, 4], hs = [8, 10, 12, 14, 16, 18, 20, 22];
    const W = 290, H = 150, bw = 26, gap = (W - bw * v.length) / (v.length - 1);
    let s = `<svg viewBox="0 -18 ${W} ${H + 54}" style="width:100%;height:150px">`;
    v.forEach((x, i) => {
      const h = x / 22 * H, X = i * (bw + gap);
      s += `<rect x="${X.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="4" fill="${x >= 20 ? '#1E1E1E' : '#A3A098'}"/>`;
      s += `<text x="${(X + bw / 2).toFixed(1)}" y="${H + 16}" text-anchor="middle" style="font-size:11px;fill:#5F5D57;font-family:var(--font)">${hs[i]}</text>`;
      if (x >= 20) s += `<text x="${(X + bw / 2).toFixed(1)}" y="${(H - h - 6).toFixed(1)}" text-anchor="middle" style="font-size:11px;font-weight:700;fill:#1E1E1E;font-family:var(--font)">${x}%</text>`;
    });
    s += `<text x="0" y="${H + 33}" style="font-size:11px;fill:#5F5D57;font-family:var(--font)">가로 = 들어온 시각, 오후 2~5시에 몰려요</text>`;
    el.innerHTML = s + '</svg>';
  }
  function modes(el) {
    const row = (t, a, la, b, lb) => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px"><b>${t}</b><span style="font-size:11.5px;color:#5F5D57">${lb} ${b}%</span></div>
      <div style="display:flex;height:22px;border-radius:6px;overflow:hidden;margin-top:5px"><span style="width:${a}%;background:#1E1E1E;color:#FFF;font-size:11.5px;font-weight:700;display:flex;align-items:center;padding-left:8px;white-space:nowrap">${la} ${a}%</span><span style="flex:1;background:#E6E3DC"></span></div></div>`;
    el.innerHTML = row('직각, 평행', 92, '직각', 8, '평행') + row('어느 쪽으로 대나', 74, '뒤로 대기', 26, '앞으로 대기') +
      `<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;padding-top:8px;border-top:1px solid #E6E3DC"><b>한 번에 들어간 비율</b><span><b style="font-size:16px">48%</b> <span style="font-size:11px;color:#5F5D57">판교 61%</span></span></div>`;
  }
  function carClass(el) {
    const rows = [['소형', 3.6, 2.4], ['중형', 4.2, 3.1], ['대형', 4.7, 3.9]];
    el.innerHTML = rows.map(([n, s, r], i) => `<div style="display:grid;grid-template-columns:40px 1fr auto;align-items:center;gap:10px;height:40px;border-bottom:${i < 2 ? '1px solid #E6E3DC' : '0'}">
      <b style="font-size:14px">${n}</b><span class="diff" style="gap:6px">${barsHtml(lvOf(s), 'font-size:17px')}<b style="font-size:15px">★${s.toFixed(1)}</b><span style="font-size:12.5px;font-weight:500">${LV_WORD[lvOf(s)]}</span></span>
      <span style="font-size:12.5px;color:#5F5D57">후진 ${r.toFixed(1)}회</span></div>`).join('') + `<p class="wnote" style="margin-top:8px">큰 차일수록 기둥 C-4 앞 후진이 늘어요.</p>`;
  }

  /* ───────── D-03 ───────── */
  function compare(el) {
    const rows = [
      ['한빛백화점 지하주차장', 4.3, '3.2회', '2분 10초', '1,284', [3.8, 3.7, 3.7, 3.6, 3.2, 3.2], 'me'],
      ['푸른숲병원', 3.6, '2.6회', '1분 50초', '640', [2.8, 2.8, 2.7, 2.7, 2.6, 2.6]],
      ['중앙시장 공영주차장', 2.4, '1.6회', '1분 15초', '720', [2.0, 2.0, 1.9, 1.7, 1.6, 1.6]],
      ['새솔마트', 2.1, '1.4회', '1분 05초', '910', [1.5, 1.5, 1.4, 1.4, 1.4, 1.4]],
      ['한빛로 공영주차장', 1.8, '1.1회', '50초', '690', [1.2, 1.1, 1.2, 1.1, 1.1, 1.1]],
      ['판교 일대 평균 (24곳)', 2.6, '2.0회', '1분 25초', '9,412', [2.2, 2.2, 2.1, 2.1, 2.1, 2.0], 'avg'],
    ];
    el.innerHTML = rows.map(([n, s, r, t, c, v, k]) => {
      const pts = v.map((y, i) => `${i * 30},${(4 + (4.0 - y) / 3.0 * 22).toFixed(1)}`).join(' ');
      const lv = lvOf(s);
      return `<tr class="${k || ''}"><td>${n}${k === 'me' ? ' <span style="font-size:11px;font-weight:700;padding:1px 6px;border-radius:5px;border:1.2px solid #1E1E1E;margin-left:6px">내 주차장</span>' : ''}</td>
        <td><span class="diff" style="gap:8px">${barsHtml(lv, 'font-size:18px')}<b style="font-size:15px">${s.toFixed(1)}</b><span style="font-size:13px;font-weight:500;color:#5F5D57">${LV_WORD[lv]}</span></span></td>
        <td class="r">${r}</td><td class="r">${t}</td><td class="r">${c}</td>
        <td><svg width="170" height="30" viewBox="-4 0 162 30"><polyline points="${pts}" fill="none" stroke="${k === 'avg' ? '#8A8780' : '#1E1E1E'}" stroke-width="2"${k === 'avg' ? ' stroke-dasharray="4 3"' : ''} stroke-linejoin="round"/><circle cx="150" cy="${(4 + (4.0 - v[5]) / 3.0 * 22).toFixed(1)}" r="3" fill="${k === 'avg' ? '#8A8780' : '#1E1E1E'}"/></svg></td></tr>`;
    }).join('');
  }
  function trend(el) {
    const me = [3.8, 3.7, 3.7, 3.6, 3.2, 3.2], avg = [2.2, 2.2, 2.1, 2.1, 2.1, 2.0];
    const months = ['5월', '6월', '7월', '8월', '9월', '10월'];
    const W = 860, H = 262, L = 44, Rr = 20, T = 18, B = 34;
    const x = (i) => L + i * (W - L - Rr) / 5, y = (v) => T + (4.2 - v) / (4.2 - 1.6) * (H - T - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100%">`;
    [2.0, 2.5, 3.0, 3.5, 4.0].forEach((v) => { s += `<line x1="${L}" y1="${y(v)}" x2="${W - Rr}" y2="${y(v)}" stroke="#E6E3DC"/><text x="${L - 10}" y="${y(v) + 4}" text-anchor="end" style="font-size:12px;fill:#5F5D57;font-family:var(--font)">${v.toFixed(1)}</text>`; });
    months.forEach((m, i) => { s += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" style="font-size:12.5px;fill:#5F5D57;font-family:var(--font)">${m}</text>`; });
    // 설치 이후 구간 표시 (단색, 그라데이션 없음)
    const xi = x(3) + (x(4) - x(3)) * 0.8;
    s += `<rect x="${xi}" y="${T}" width="${W - Rr - xi}" height="${H - T - B}" fill="#F4F3EF"/>`;
    s += `<line x1="${xi}" y1="${T - 6}" x2="${xi}" y2="${H - B}" stroke="#1E1E1E" stroke-width="2" stroke-dasharray="5 4"/>`;
    s += `<g transform="translate(${xi - 8} ${T + 2})"><rect x="-128" y="-2" width="128" height="40" rx="8" fill="#1E1E1E"/><text x="-64" y="13" text-anchor="middle" style="font-size:12px;font-weight:700;fill:#FFF;font-family:var(--font)">8월 25일</text><text x="-64" y="29" text-anchor="middle" style="font-size:12px;fill:#FFF;font-family:var(--font)">반사경 설치</text></g>`;
    // 전후 평균
    s += `<line x1="${x(0)}" y1="${y(3.7)}" x2="${xi - 6}" y2="${y(3.7)}" stroke="#8A8780" stroke-width="1.5" stroke-dasharray="2 4"/>`;
    s += `<line x1="${xi + 6}" y1="${y(3.2)}" x2="${x(5)}" y2="${y(3.2)}" stroke="#8A8780" stroke-width="1.5" stroke-dasharray="2 4"/>`;
    s += `<text x="${(x(1) + x(2)) / 2}" y="${y(3.7) + 24}" text-anchor="middle" style="font-size:12.5px;font-weight:700;fill:#1E1E1E;font-family:var(--font)">설치 전 평균 3.7회</text>`;
    s += `<text x="${x(5) - 4}" y="${y(3.2) + 28}" text-anchor="end" style="font-size:12.5px;font-weight:700;fill:#1E1E1E;font-family:var(--font)">설치 후 평균 3.2회</text>`;
    const line = (vals, st) => `<polyline points="${vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" ${st} stroke-linejoin="round" stroke-linecap="round"/>`;
    s += line(avg, 'stroke="#8A8780" stroke-width="2.5" stroke-dasharray="6 5"');
    s += line(me, 'stroke="#1E1E1E" stroke-width="3"');
    me.forEach((v, i) => { s += `<circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="#FFF" stroke="#1E1E1E" stroke-width="2.5"/><text x="${x(i) + (i === 0 ? 10 : 0)}" y="${y(v) - 11}" text-anchor="${i === 0 ? 'start' : 'middle'}" style="font-size:12px;font-weight:700;fill:#1E1E1E;font-family:var(--font)">${v.toFixed(1)}</text>`; });
    avg.forEach((v, i) => { s += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="#8A8780"/>`; });
    s += `<text x="${x(5)}" y="${y(avg[5]) + 20}" text-anchor="end" style="font-size:12px;fill:#5F5D57;font-family:var(--font)">판교 일대 2.0회</text>`;
    el.innerHTML = s + '</svg>';
  }

  /* ───────── 머리·메뉴 ───────── */
  function rail(el) {
    const items = [['home', '홈', 'home'], ['lots', '주차장', 'pin'], ['records', '기록', 'list'], ['king', '주차왕', 'crown']];
    const on = el.dataset.active;
    el.innerHTML = `<span class="logo">${logoSvg()}</span>` +
      items.map(([k, t, i]) => `<span class="item${k === on ? ' on' : ''}">${ic(i)}${t}</span>`).join('') +
      `<span class="gap"></span><span class="item${on === 'settings' ? ' on' : ''}">${ic('sliders')}설정</span>`;
  }
  function tabbar(el) {
    const items = [['home', '홈', 'home'], ['lots', '주차장', 'pin'], ['king', '주차왕', 'crown'], ['records', '기록', 'chart'], ['settings', '설정', 'sliders']];
    el.innerHTML = items.map(([k, t, i]) => `<a class="${k === el.dataset.tabs ? 'on' : ''}">${ic(i)}${t}</a>`).join('');
  }
  function webHeader(el) {
    const tabs = [['overview', '지역 개요'], ['detail', '주차장 상세'], ['compare', '비교와 추이']];
    el.innerHTML = `<span class="brand paper-logo"><svg viewBox="0 0 48 48"><rect class="lg-bg" width="48" height="48" rx="13"/><path class="lg-fg" d="M15 36V12h9a7 7 0 0 1 0 14h-9" stroke-width="5"/><path class="lg-fg" d="M27 38h8a3 3 0 0 0 3-3v-8" stroke-width="3.5"/></svg>주차각 for Business</span>
      <nav>${tabs.map(([k, t]) => `<a class="${k === el.dataset.wh ? 'on' : ''}">${t}</a>`).join('')}</nav><span class="sp"></span>
      <span class="wex">예시</span>
      <span class="wsel">${ic('building')}한빛백화점 지하주차장${ic('down')}</span>
      <span class="wsel">${ic('cal')}최근 30일${ic('down')}</span>
      <span class="wacct">${ic('lock')}운영사 계정, 자기 주차장만 열람</span>`;
    el.style.gap = '12px';
  }

  /* ───────── 실행 ───────── */
  $$('[data-c02]').forEach((el) => { el.innerHTML = C02; });
  $$('[data-c05]').forEach((el) => { el.innerHTML = C05; });
  $$('[data-logo]').forEach((el) => { el.innerHTML = logoSvg(); el.style.display = el.style.display || 'inline-block'; });
  $$('.bars[data-lv]').forEach((el) => { const lv = +el.dataset.lv; el.classList.add('lv' + lv); el.innerHTML = [1, 2, 3, 4, 5].map((k) => `<i${k <= lv ? ' class="f"' : ''}></i>`).join(''); });
  $$('.diff[data-score]').forEach((el) => { const s = +el.dataset.score, lv = lvOf(s); el.innerHTML = `${barsHtml(lv)}<b>★${s.toFixed(1)}</b><span>${LV_WORD[lv]}</span>`; });
  $$('[data-banner]').forEach((el) => { const s = +el.dataset.banner, lv = lvOf(s); el.innerHTML = `<span class="logo">${logoSvg()}</span>${barsHtml(lv)}<b>도착지 주차 ★${s.toFixed(1)}${el.dataset.short ? '' : ' ' + LV_WORD[lv]}</b>`; });
  $$('nav.rail').forEach(rail);
  $$('nav.tabbar').forEach(tabbar);
  $$('header.wh').forEach(webHeader);
  $$('[data-map="city"]').forEach((el) => { el.innerHTML = cityMap(el.dataset.car ? el.dataset.car.split(',').map(Number) : null); });
  $$('[data-map="entrance"]').forEach((el) => { el.innerHTML = entranceMap(); });
  $$('[data-minimap]').forEach((el) => { el.innerHTML = miniMap(); });
  $$('[data-trail]').forEach(trail);
  $$('[data-steps]').forEach(steps);
  $$('[data-kit="levels"]').forEach(kitLevels);
  $$('[data-kit="trail"]').forEach(kitTrail);
  $$('[data-heat]').forEach(heat);
  $$('[data-region]').forEach(regionMap);
  $$('[data-legend-lv]').forEach(legendLv);
  $$('[data-top10]').forEach(top10);
  $$('[data-better]').forEach(better);
  $$('[data-lotplan]').forEach(lotPlan);
  $$('[data-hot]').forEach(hot);
  $$('[data-floors]').forEach(floorsDist);
  $$('[data-hours]').forEach(hoursDist);
  $$('[data-modes]').forEach(modes);
  $$('[data-class]').forEach(carClass);
  $$('[data-compare]').forEach(compare);
  $$('[data-trend]').forEach(trend);
  $$('[data-qr]').forEach((el) => {
    el.innerHTML = window.__QR_SVG || '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#1E1E1E;font-size:40px">QR (build.mjs)</div>';
    const svg = el.querySelector('svg'); if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); }
  });
  // 축소 미리보기: 이미 그린 화면을 복제
  $$('[data-clone]').forEach((el) => {
    const src = document.getElementById(el.dataset.clone);
    if (!src) return;
    const c = src.cloneNode(true); c.removeAttribute('id'); el.appendChild(c);
  });
  // 바닥글
  const pages = $$('section.page');
  pages.forEach((p, i) => {
    const f = p.querySelector('.pf');
    if (f) f.innerHTML = `<b>주차각 (Parkinggack)</b><span>화면 시안</span><span>예시 데이터</span><span>${i + 1}</span>`;
  });

  /* ───────── 자동 점검 (build.mjs 가 읽는다) ───────── */
  window.__checks = function () {
    const out = { carScreens: [], tapTooSmall: [], drivingWithTouch: [], textOverflow: [], carTextTooSmall: [], outsideScreen: [], forbiddenText: [] };
    $$('figure.dev').forEach((fig) => {
      const scr = fig.querySelector('.screen');
      const id = fig.dataset.png;
      const sr = scr.getBoundingClientRect();
      const s = sr.width / scr.offsetWidth;
      if (scr.classList.contains('car-screen')) {
        const taps = $$('.tap, .btn, .iconbtn, .opt, .rail .item', scr);
        const driving = scr.classList.contains('driving');
        if (driving && (taps.length || scr.querySelector('.rail'))) out.drivingWithTouch.push(id);
        let min = Infinity;
        taps.forEach((t) => { min = Math.min(min, t.offsetHeight); if (t.offsetHeight < 76) out.tapTooSmall.push(`${id}: "${t.textContent.trim()}" ${t.offsetHeight}px`); });
        out.carScreens.push({ id, driving, buttons: taps.length, minButtonHeight: taps.length ? min : null });
        $$('*', scr).forEach((e) => {
          if (e.closest('svg')) return;
          const own = Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
          if (own && parseFloat(getComputedStyle(e).fontSize) < 21) out.carTextTooSmall.push(`${id}: "${e.textContent.trim().slice(0, 20)}" ${getComputedStyle(e).fontSize}`);
        });
      }
      $$('*', scr).forEach((e) => {
        const own = Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own || e.closest('svg')) return;
        if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline') out.textOverflow.push(`${id}: "${e.textContent.trim().slice(0, 24)}" ${e.scrollWidth}>${e.clientWidth}`);
        const r = e.getBoundingClientRect();
        if (r.width && (r.left < sr.left - 1 || r.right > sr.right + 1 || r.top < sr.top - 1 || r.bottom > sr.bottom + 1)) out.outsideScreen.push(`${id}: "${e.textContent.trim().slice(0, 24)}"`);
      });
    });
    // 금지 문구와 문장부호: 쪽 제목, 설명, 바닥글, 화면 안 문구까지 PDF의 모든 글 (CSS content 포함)
    const BAN = /[·•ㆍ・‧—–]|실패|서툴러요|위험 운전|꼴찌|하위|제일 빨리|주차는즐겁/g;
    pages.forEach((p, i) => {
      const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        if (n.parentElement.closest('style, script')) continue;
        for (const m of n.textContent.matchAll(BAN)) out.forbiddenText.push(`${i + 1}쪽 "${m[0]}": ${n.textContent.trim().slice(0, 40)}`);
      }
      $$('*', p).forEach((e) => ['::before', '::after'].forEach((ps) => {
        const c = getComputedStyle(e, ps).content;
        if (c && c !== 'none' && c !== 'normal') for (const m of c.matchAll(BAN)) out.forbiddenText.push(`${i + 1}쪽 ${ps} "${m[0]}"`);
      }));
    });
    return out;
  };
  window.__ready = true;
})();
