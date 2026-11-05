/**
 * D-12 파일 형식: CSV(UTF-8 BOM, 엑셀에서 한글이 깨지지 않게) · Excel(.xlsx, 데이터마다 시트) · GeoJSON(동선·이벤트).
 * 모두 브라우저 안에서 만든다 — 의존성 없음 (.xlsx 는 ZIP 안의 XML).
 */
import type { Cell, ColType, Table } from './datasets'
import { encodeChunks, zip } from './zip'

const fmt = (v: Cell, type: ColType): string => (typeof v === 'number' ? (type === 'f' ? v.toFixed(1) : String(Math.round(v))) : v)

// ───────────── CSV ─────────────

function csvField(s: string): string {
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function* csvChunks(t: Table): Generator<string> {
  yield '﻿' + t.columns.map(csvField).join(',') + '\r\n'
  for (const row of t.rows()) yield row.map((v, i) => csvField(fmt(v, t.types[i]))).join(',') + '\r\n'
}

export function csvBytes(t: Table): Uint8Array {
  return encodeChunks(csvChunks(t))
}

/** 미리보기용: 앞 n 줄의 CSV 한 줄 평균 바이트 (크기 어림) */
export function csvBytesPerRow(t: Table, n = 60): number {
  const rows = t.head(n)
  if (!rows.length) return 0
  const enc = new TextEncoder()
  const total = rows.reduce((a, r) => a + enc.encode(r.map((v, i) => csvField(fmt(v, t.types[i]))).join(',') + '\r\n').length, 0)
  return total / rows.length
}

// ───────────── Excel (.xlsx) ─────────────

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function colLetter(i: number): string {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** 엑셀 한 시트 최대 줄 (머리 줄 포함 1,048,576) */
export const XLSX_MAX_ROWS = 1_048_575

function* sheetXml(t: Table, from: number, to: number): Generator<string> {
  const letters = t.columns.map((_, i) => colLetter(i))
  yield XML_HEAD
  yield '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  yield '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
  yield `<cols><col min="1" max="${t.columns.length}" width="14" customWidth="1"/></cols>`
  yield '<sheetData>'
  yield `<row r="1">${t.columns.map((c, i) => `<c r="${letters[i]}1" t="inlineStr" s="1"><is><t>${esc(c)}</t></is></c>`).join('')}</row>`
  let n = 0
  let r = 2
  for (const row of t.rows()) {
    if (n++ < from) continue
    if (n > to) break
    let x = `<row r="${r}">`
    row.forEach((v, i) => {
      const ref = `${letters[i]}${r}`
      x += typeof v === 'number' && Number.isFinite(v)
        ? `<c r="${ref}"><v>${t.types[i] === 'f' ? v.toFixed(1) : Math.round(v)}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t>${esc(String(v))}</t></is></c>`
    })
    yield x + '</row>'
    r++
  }
  yield '</sheetData></worksheet>'
}

const STYLES = XML_HEAD + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'

/** 시트 이름: 31자 이하, []:*?/\ 없음, 겹치지 않게 */
function sheetNames(names: string[]): string[] {
  const used = new Set<string>()
  return names.map((raw) => {
    const base = raw.replace(/[[\]:*?/\\]/g, ' ').slice(0, 28).trim() || 'Sheet'
    let name = base
    for (let k = 2; used.has(name); k++) name = `${base} ${k}`
    used.add(name)
    return name
  })
}

export async function xlsxBytes(sheets: readonly { name: string; table: Table }[], opts: { compress?: boolean } = {}): Promise<Uint8Array> {
  // 엑셀 한계를 넘는 표는 시트를 나눈다
  const parts: { name: string; table: Table; from: number; to: number }[] = []
  for (const s of sheets) {
    const n = s.table.rowCount
    const pieces = Math.max(1, Math.ceil(n / XLSX_MAX_ROWS))
    for (let k = 0; k < pieces; k++) {
      parts.push({ name: pieces > 1 ? `${s.name} (${k + 1})` : s.name, table: s.table, from: k * XLSX_MAX_ROWS, to: (k + 1) * XLSX_MAX_ROWS })
    }
  }
  const names = sheetNames(parts.map((p) => p.name))
  const enc = new TextEncoder()
  const files = [
    {
      name: '[Content_Types].xml',
      data: enc.encode(XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + parts.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + '</Types>'),
    },
    {
      name: '_rels/.rels',
      data: enc.encode(XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>'),
    },
    {
      name: 'xl/workbook.xml',
      data: enc.encode(XML_HEAD + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
        + '</sheets></workbook>'),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: enc.encode(XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + parts.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${parts.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
        + '</Relationships>'),
    },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
    ...parts.map((p, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: encodeChunks(sheetXml(p.table, p.from, p.to)) })),
  ]
  return zip(files, { compress: opts.compress })
}

// ───────────── GeoJSON ─────────────

/** 좌표가 위경도가 아니라는 표시 (RFC 7946 바깥 멤버) */
export const GEO_NOTE = '입구를 (0, 0)으로 둔 상대 좌표(m), 도면 오른쪽·아래가 +. 위경도가 아니에요'

function* features(name: string, feats: Iterable<string>): Generator<string> {
  yield `{"type":"FeatureCollection","name":${JSON.stringify(name)},"coordinate_system":${JSON.stringify(GEO_NOTE)},"features":[`
  let first = true
  for (const f of feats) {
    yield (first ? '\n' : ',\n') + f
    first = false
  }
  yield '\n]}\n'
}

/** 동선 좌표 → 세션 · 기어마다 LineString (P 점은 끝점) */
export function* traceGeoJson(t: Table): Generator<string> {
  const ix = (c: string) => t.columns.indexOf(c)
  const [iLot, iS, iT, iX, iY, iF, iG] = ['lot_id', 'session_id', 't_s', 'x_m', 'y_m', 'floor', 'gear'].map(ix)
  function* runs(): Generator<string> {
    type Run = { key: string; props: Record<string, Cell>; coords: [number, number][]; t0: number; t1: number }
    const st: { cur: Run | null } = { cur: null }
    const feature = (r: Run): string | null => (r.coords.length >= 2
      ? JSON.stringify({ type: 'Feature', properties: { ...r.props, t_from_s: r.t0, t_to_s: r.t1 }, geometry: { type: 'LineString', coordinates: r.coords } })
      : null)
    for (const row of t.rows()) {
      const gear = String(row[iG])
      const pt: [number, number] = [Number(row[iX]), Number(row[iY])]
      const tt = Number(row[iT])
      const prev = st.cur
      const motionGear: string = gear === 'P' ? String(prev?.props.gear ?? 'D') : gear
      const key = `${row[iS]}|${motionGear}`
      if (!prev || prev.key !== key) {
        const last: [number, number] | null = prev && prev.props.session_id === row[iS] ? prev.coords[prev.coords.length - 1] : null
        if (prev) {
          const f = feature(prev)
          if (f) yield f
        }
        const props: Record<string, Cell> = {}
        if (iLot >= 0) props.lot_id = row[iLot]
        props.session_id = row[iS]
        props.floor = row[iF]
        props.gear = motionGear
        st.cur = { key, props, coords: last ? [last] : [], t0: last ? tt - 1 : tt, t1: tt }
      }
      const c = st.cur as Run
      c.coords.push(pt)
      c.t1 = tt
    }
    if (st.cur) {
      const f = feature(st.cur)
      if (f) yield f
    }
  }
  yield* features('동선 좌표', runs())
}

/** 후진 · 급정지 이벤트 → Point */
export function* eventGeoJson(t: Table): Generator<string> {
  const ix = (c: string) => t.columns.indexOf(c)
  const iX = ix('x_m')
  const iY = ix('y_m')
  const keys = t.columns.filter((c) => c !== 'x_m' && c !== 'y_m')
  function* points(): Generator<string> {
    for (const row of t.rows()) {
      const props: Record<string, Cell> = {}
      keys.forEach((k) => { props[k] = row[ix(k)] })
      yield JSON.stringify({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [Number(row[iX]), Number(row[iY])] } })
    }
  }
  yield* features('후진·급정지 이벤트', points())
}
