/**
 * 고른 데이터 · 형식 → 내려받을 파일 하나 (여러 개면 ZIP 으로 묶음).
 *   CSV      데이터마다 .csv
 *   Excel    .xlsx 하나, 데이터마다 시트
 *   Parquet  데이터마다 .parquet
 *   GeoJSON  동선 좌표 · 이벤트는 .geojson, 나머지는 .csv 로 같이 묶음 (시안 안내 그대로)
 */
import { DATASETS, FORMATS, type DatasetId, type FormatId } from '../v2demo'
import type { ExportSet } from './datasets'
import { parquetBytes } from './parquet'
import { csvBytes, csvBytesPerRow, eventGeoJson, traceGeoJson, xlsxBytes } from './writers'
import { encodeChunks, zip } from './zip'

export type FileFormat = Exclude<FormatId, 'api'>

export interface ExportFile {
  name: string
  mime: string
  bytes: Uint8Array
  /** ZIP 이면 안에 든 파일 이름 */
  contents: string[]
}

const MIME = {
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  parquet: 'application/vnd.apache.parquet',
  geojson: 'application/geo+json',
  zip: 'application/zip',
} as const

export const FILE_NOTE = '주차각 시연용 예시 데이터 · 좌표는 입구 기준 상대 좌표(m) · 시각은 30분 단위 · 5대 미만 칸·시간대 제외'

const nameOf = (id: DatasetId) => DATASETS.find((d) => d.id === id)!.name
const isGeo = (id: DatasetId) => id === 'traces' || id === 'events'

export async function makeExportFile(set: ExportSet, ids: readonly DatasetId[], format: FileFormat, base: string): Promise<ExportFile> {
  if (!ids.length) throw new Error('받을 데이터를 하나 이상 골라 주세요')
  if (format === 'xlsx') {
    const bytes = await xlsxBytes(ids.map((id) => ({ name: nameOf(id), table: set.tables[id] })))
    return { name: ids.length === 1 ? `${base}_${ids[0]}.xlsx` : `${base}.xlsx`, mime: MIME.xlsx, bytes, contents: [] }
  }
  const parts: { name: string; data: Uint8Array; mime: string }[] = ids.map((id) => {
    const t = set.tables[id]
    if (format === 'geojson' && isGeo(id)) {
      return { name: `${base}_${id}.geojson`, data: encodeChunks(id === 'traces' ? traceGeoJson(t) : eventGeoJson(t)), mime: MIME.geojson }
    }
    if (format === 'parquet') return { name: `${base}_${id}.parquet`, data: parquetBytes(t, { 'parkinggack.note': FILE_NOTE }), mime: MIME.parquet }
    return { name: `${base}_${id}.csv`, data: csvBytes(t), mime: MIME.csv }
  })
  if (parts.length === 1) return { name: parts[0].name, mime: parts[0].mime, bytes: parts[0].data, contents: [] }
  const bytes = await zip(parts.map((p) => ({ name: p.name, data: p.data })), { compress: format !== 'parquet' })
  return { name: `${base}.zip`, mime: MIME.zip, bytes, contents: parts.map((p) => p.name) }
}

/** 크기 어림 (바이트): CSV 한 줄 평균 × 줄 수 × 형식 배수 (시안 배수) */
export function estimateBytes(set: ExportSet, ids: readonly DatasetId[], format: FormatId): number {
  const factor = FORMATS.find((f) => f.id === format)?.sizeFactor ?? 1
  return ids.reduce((a, id) => {
    const t = set.tables[id]
    const per = csvBytesPerRow(t)
    const k = format === 'geojson' ? (isGeo(id) ? factor : 1) : factor
    return a + per * t.rowCount * k
  }, 0)
}

export function formatBytes(n: number): string {
  const kb = n / 1024
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)}MB`
  return `${Math.max(1, Math.round(kb))}KB`
}

/** 브라우저로 내려받기 */
export function saveFile(f: ExportFile): void {
  const blob = new Blob([f.bytes as BlobPart], { type: f.mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = f.name
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
