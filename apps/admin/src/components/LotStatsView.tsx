/** C-08 근거 통계를 라이트 테마로: 근거 막대 3개(세로선 = 전체 평균) · 층별 혼잡 · 시간대 히트맵 */
import type { LotStats } from '@api-types'
import { congestionWord, formatCount, formatDurationKo, WEEKDAYS } from '../format'
import { Card } from './ui'

/** 차량 앱 LotDetailScreen.scaleMax 와 같음 */
const scaleMax = (nice: number, ...values: number[]) => Math.max(nice, Math.max(...values) * 1.25)

function MetricBar({ name, value, fraction, avgFraction, caption }: {
  name: string; value: string; fraction: number; avgFraction: number; caption: string
}) {
  const pct = (f: number) => `${Math.min(100, Math.max(0, f * 100)).toFixed(1)}%`
  return (
    <div className="metric">
      <div className="metric__head">
        <span className="metric__name">{name}</span>
        <strong className="metric__value">{value}</strong>
      </div>
      <div className="metric__track" aria-hidden="true">
        <div className="metric__fill" style={{ width: pct(fraction) }} />
        <span className="metric__avg" style={{ left: pct(avgFraction) }} />
      </div>
      <span className="metric__caption">{caption}</span>
    </div>
  )
}

export function LotStatsView({ stats, hard }: { stats: LotStats; hard: boolean | null }) {
  const rMax = scaleMax(5, stats.avgReverse, stats.overallAvgReverse)
  const tMax = scaleMax(4, stats.avgRampTurns, stats.overallAvgRampTurns)
  const dMax = scaleMax(200, stats.avgDurationSec, stats.overallAvgDurationSec)
  const heatShades = ['heat-0', 'heat-1', 'heat-2', 'heat-3', 'heat-4']
  const title = hard == null ? '점수의 근거' : hard ? '왜 어려울까요' : '왜 편할까요'
  return (
    <div className="stats-grid">
      <Card title={title} headingLevel={3} className="card--stats">
        <MetricBar
          name="평균 후진" value={`${formatCount(stats.avgReverse)}회`}
          fraction={stats.avgReverse / rMax} avgFraction={stats.overallAvgReverse / rMax}
          caption={`세로선 = 전체 평균 ${formatCount(stats.overallAvgReverse)}회`}
        />
        <MetricBar
          name="램프 회전" value={`${formatCount(stats.avgRampTurns)}바퀴`}
          fraction={stats.avgRampTurns / tMax} avgFraction={stats.overallAvgRampTurns / tMax}
          caption={`전체 평균 ${formatCount(stats.overallAvgRampTurns)}바퀴`}
        />
        <MetricBar
          name="진입 → 주차" value={formatDurationKo(stats.avgDurationSec)}
          fraction={stats.avgDurationSec / dMax} avgFraction={stats.overallAvgDurationSec / dMax}
          caption={`전체 평균 ${formatDurationKo(stats.overallAvgDurationSec)}`}
        />
      </Card>

      <Card title="층별 혼잡" aside={<span className="muted">{stats.congestionLabel}</span>} headingLevel={3} className="card--stats">
        {stats.floorCongestion.length === 0 ? (
          <p className="muted">아직 기록이 적어요</p>
        ) : (
          <ul className="floor-bars">
            {stats.floorCongestion.slice(0, 8).map((f) => {
              const word = congestionWord(f.occupancy)
              return (
                <li key={f.floor} aria-label={`${f.floor} ${word}`}>
                  <span className="floor-bars__floor" aria-hidden="true">{f.floor}</span>
                  <span className="floor-bars__track" aria-hidden="true">
                    <span className={`floor-bars__fill${f.occupancy >= 0.8 ? ' is-busy' : ''}`} style={{ width: `${Math.min(1, Math.max(0, f.occupancy)) * 100}%` }} />
                  </span>
                  <span className={`floor-bars__word${f.occupancy >= 0.95 ? ' is-strong' : ''}`} aria-hidden="true">{word}</span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="summary-box">{stats.congestionSummary}</p>
      </Card>

      <Card title="시간대별" aside={<span className="muted">진할수록 붐빔</span>} headingLevel={3} className="card--stats">
        <div className="heatmap" role="img" aria-label="요일·시간대별 혼잡 히트맵. 진할수록 붐빔">
          <div className="heatmap__row heatmap__row--head" aria-hidden="true">
            <span className="heatmap__day" />
            {stats.hourLabels.map((h) => <span key={h} className="heatmap__hour">{h}</span>)}
          </div>
          {stats.hourlyHeat.slice(0, 7).map((row, di) => (
            <div className="heatmap__row" key={di} aria-hidden="true">
              <span className="heatmap__day">{WEEKDAYS[di]}</span>
              {stats.hourLabels.map((h, i) => {
                const v = row[i]
                const lvl = v == null ? 0 : Math.min(4, Math.max(0, Math.floor(v * 5)))
                return <span key={h} className={`heatmap__cell ${heatShades[lvl]}`} title={`${WEEKDAYS[di]} ${h} · ${Math.round((v ?? 0) * 100)}%`} />
              })}
            </div>
          ))}
        </div>
        <div className="heat-legend" aria-hidden="true">
          <span>한산</span>
          {heatShades.map((c) => <span key={c} className={`heat-legend__swatch ${c}`} />)}
          <span>붐빔</span>
        </div>
      </Card>
    </div>
  )
}
