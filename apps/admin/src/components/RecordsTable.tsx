/** 익명 주차 기록 표. 좌표·정확한 주차 시각·차량 식별값은 서버에도 없다 (주차 시각대는 요일 + 시만) */
import type { AdminRecordRow } from '@api-types'
import { adminHref } from '../router'
import {
  experienceLabel, formatCount, formatDateTime, formatDurationKo, parkedWhen, shapeLabel, vehicleClassLabel,
} from '../format'
import { KindBadge } from './ui'

export function RecordsTable({ records, showLot = true, caption }: { records: readonly AdminRecordRow[]; showLot?: boolean; caption: string }) {
  if (!records.length) return <p className="empty">조건에 맞는 기록이 없어요</p>
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="table table--records">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">받은 시각</th>
            {showLot && <th scope="col">주차장</th>}
            <th scope="col">층</th>
            <th scope="col" className="num">후진</th>
            <th scope="col" className="num">핸들</th>
            <th scope="col" className="num">걸린 시간</th>
            <th scope="col" className="num">램프</th>
            <th scope="col" className="hide-md">형태</th>
            <th scope="col" className="hide-md">차 크기</th>
            <th scope="col" className="hide-md">경력</th>
            <th scope="col">주차 시각대</th>
            <th scope="col">구분</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td className="nowrap">{formatDateTime(r.receivedAt)}</td>
              {showLot && (
                <td><a href={adminHref(`/lots/${encodeURIComponent(r.lotId)}`)}>{r.lotName}</a></td>
              )}
              <td className="mono">{r.floor ?? '–'}</td>
              <td className="num">{r.reverseCount}회</td>
              <td className="num">{r.steeringTurns}번</td>
              <td className="num nowrap">{formatDurationKo(r.durationSec)}</td>
              <td className="num">{formatCount(r.rampTurns)}바퀴</td>
              <td className="hide-md">{shapeLabel(r.shape)}</td>
              <td className="hide-md">{vehicleClassLabel(r.vehicleClass)}</td>
              <td className="hide-md nowrap">{experienceLabel(r.experience)}</td>
              <td className="nowrap">{parkedWhen(r.parkedWeekday, r.parkedHour)}</td>
              <td><KindBadge demo={r.demo} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
