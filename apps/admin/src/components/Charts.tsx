/**
 * 시간대·요일 분포 막대 (한 계열이라 범례 없음, 제목이 이름).
 * 색 하나(잉크) + 가장 많은 막대만 진하게·숫자 직접 표시. 마우스를 올리면 값, 화면 낭독기는 숨은 표를 읽는다.
 */
import { useState } from 'react'
import { formatNumber, WEEKDAYS } from '../format'
import { peakIndex } from '../stats'

export function HourChart({ byHour }: { byHour: readonly number[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(0, ...byHour)
  const peak = peakIndex(byHour)
  const total = byHour.reduce((a, b) => a + b, 0)
  if (total === 0) return <p className="muted">아직 기록이 없어요</p>
  const shown = hover ?? peak
  return (
    <div className="hour-chart">
      <div className="hour-chart__readout" aria-hidden="true">
        <strong>{shown}시</strong> {formatNumber(byHour[shown] ?? 0)}건
        <span className="muted"> · {Math.round(((byHour[shown] ?? 0) / total) * 100)}%</span>
      </div>
      <div className="hour-chart__plot" aria-hidden="true" onMouseLeave={() => setHover(null)}>
        {byHour.map((v, h) => (
          <div
            key={h}
            className={`hour-chart__col${h === peak ? ' is-peak' : ''}${h === hover ? ' is-hover' : ''}`}
            onMouseEnter={() => setHover(h)}
            title={`${h}시 · ${formatNumber(v)}건`}
          >
            <div className="hour-chart__bar" style={{ height: `${max ? Math.max(v > 0 ? 2 : 0, (v / max) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="hour-chart__axis" aria-hidden="true">
        {[0, 6, 12, 18].map((h) => (
          <span key={h} style={{ left: `${((h + 0.5) / 24) * 100}%` }}>{h}시</span>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>시간대별 주차 기록 수</caption>
        <tbody>
          {byHour.map((v, h) => (
            <tr key={h}><th scope="row">{h}시</th><td>{v}건</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function WeekdayChart({ byWeekday }: { byWeekday: readonly number[] }) {
  const max = Math.max(0, ...byWeekday)
  const peak = peakIndex(byWeekday)
  if (max === 0) return <p className="muted">아직 기록이 없어요</p>
  return (
    <table className="weekday-chart">
      <caption className="visually-hidden">요일별 주차 기록 수</caption>
      <tbody>
        {WEEKDAYS.map((d, i) => {
          const v = byWeekday[i] ?? 0
          return (
            <tr key={d} className={i === peak ? 'is-peak' : undefined}>
              <th scope="row">{d}</th>
              <td className="weekday-chart__track">
                <span className="weekday-chart__bar" style={{ width: `${(v / max) * 100}%` }} />
              </td>
              <td className="weekday-chart__value">{formatNumber(v)}건</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
