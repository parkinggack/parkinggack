/**
 * W-01 난이도 지도 — 운영자 화면 'PT 비전 (이전 시안)' (#/admin/vision). 시안: docs/design/W-01.dc.html
 * 숫자는 전부 서버(/v1/admin/overview, /v1/admin/lots)에서 — 하드코딩 없음.
 */
import type { AdminLot, AdminOverviewResponse, ParkingLot } from '@api-types'
import { HourChart, WeekdayChart } from '../components/Charts'
import { DifficultyMap } from '../components/DifficultyMap'
import { ErrorBox, KindBadge, Loading } from '../components/ui'
import { VISION_FIGURES } from '../components/visionFigures'
import { useAsync, useData } from '../data'
import {
  difficultyLabel, formatDateTime, formatDurationKo, formatNumber, formatPercent, formatRelative, formatScore, tagLabel,
} from '../format'
import { adminHref } from '../router'
import { describeHourPeak, summarizeLots } from '../stats'

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <section className="kpi" aria-label={label}>
      <span className="kpi__label">{label}</span>
      <strong className="kpi__value">{value}</strong>
      {sub && <span className="kpi__sub">{sub}</span>}
    </section>
  )
}

function reasonLine(lot: ParkingLot): string {
  if (lot.tags.length) return lot.tags.slice(0, 2).map(tagLabel).join(' · ')
  if (lot.statChips.length) return lot.statChips.join(' · ')
  return `최근 30일 차량 ${formatNumber(lot.sampleCount)}대`
}

function RankList({ lots, empty }: { lots: readonly ParkingLot[]; empty: string }) {
  if (!lots.length) return <p className="muted">{empty}</p>
  return (
    <ol className="rank">
      {lots.map((lot, i) => (
        <li key={lot.id}>
          <a className="rank__row" href={adminHref(`/lots/${encodeURIComponent(lot.id)}`)}
            aria-label={`${i + 1}위 ${lot.name}, ${formatScore(lot.difficulty)} ${difficultyLabel(lot.difficulty)}, ${reasonLine(lot)}`}>
            <span className="rank__no" aria-hidden="true">{i + 1}</span>
            <span className="rank__text" aria-hidden="true">
              <span className="rank__name">{lot.name}</span>
              <span className="rank__why">{reasonLine(lot)}</span>
            </span>
            <span className="rank__score" aria-hidden="true">{formatScore(lot.difficulty)}</span>
          </a>
        </li>
      ))}
    </ol>
  )
}

export function DashboardView({ overview, lots }: { overview: AdminOverviewResponse; lots: readonly AdminLot[] }) {
  const sum = summarizeLots(lots)
  const t = overview.totals
  const demoCount = lots.filter((l) => l.demo).length
  const now = Date.now()
  return (
    <div className="dash">
      <div className="kpis">
        <Kpi label="기록된 주차장" value={`${formatNumber(t.lots)}곳`} sub={`점수 있음 ${sum.rated}곳 · 기록 적음 ${sum.sparse}곳`} />
        <Kpi label="누적 주차 기록" value={`${formatNumber(t.records)}건`} sub={`최근 30일 ${formatNumber(t.records30d)}건`} />
        <Kpi label="평균 난이도" value={formatScore(sum.avgDifficulty)} sub={`점수 있는 ${sum.rated}곳 평균 · 별점 ${formatNumber(t.ratings)}개`} />
        <Kpi
          label="어려움(★4 이상) 주차장"
          value={sum.hardShare == null ? '–' : formatPercent(sum.hardShare)}
          sub={`${sum.hardCount}곳 / 점수 있는 ${sum.rated}곳`}
        />
      </div>

      <div className="dash-row">
        <section id="map" className="card card--map" aria-labelledby="map-title">
          <div className="card__head">
            <h2 className="card__title" id="map-title">수도권 주차장 난이도 지도</h2>
            <span className="card__aside muted">원 크기 = 기록 수 · 진하기와 숫자 = 난이도</span>
          </div>
          <DifficultyMap lots={lots} demoCount={demoCount} />
        </section>

        <section id="rank" className="card card--rank" aria-labelledby="rank-title">
          <h2 className="card__title" id="rank-title">까다로운 주차장 순위</h2>
          <RankList lots={overview.hardest} empty="아직 점수가 나온 주차장이 없어요" />
          <span className="muted card__foot">보험사 · 주차장 운영사에 제공하는 리포트 예시</span>
        </section>
      </div>

      <section id="vision" className="card card--vision" aria-labelledby="vision-title">
        <div className="vision__head">
          <h2 className="vision__title" id="vision-title">주차하다 헤맨 흔적이 진짜 주차장 지도가 돼요</h2>
          <span className="muted">비전 · 실제 구현 아님</span>
        </div>
        <div className="vision__figures">
          {VISION_FIGURES.map((f) => (
            <figure key={f.caption} className="vision__figure">
              <svg role="img" aria-label={f.label} width="100%" height="200" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid meet"
                dangerouslySetInnerHTML={{ __html: f.svg }} />
              <figcaption>{f.caption}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <div className="dash-row dash-row--3">
        <section className="card" aria-labelledby="easy-title">
          <h2 className="card__title" id="easy-title">편한 주차장 순위</h2>
          <RankList lots={overview.easiest} empty="아직 점수가 나온 주차장이 없어요" />
          <span className="muted card__foot">초보 운전자에게 먼저 권하는 곳 (C-03 추천 후보)</span>
        </section>
        <section className="card" aria-labelledby="hour-title">
          <div className="card__head">
            <h2 className="card__title" id="hour-title">시간대별 주차 기록</h2>
            <span className="card__aside muted">{describeHourPeak(overview.byHour)}</span>
          </div>
          <HourChart byHour={overview.byHour} />
        </section>
        <section className="card" aria-labelledby="weekday-title">
          <div className="card__head">
            <h2 className="card__title" id="weekday-title">요일별 주차 기록</h2>
            <span className="card__aside muted">주차한 요일 기준</span>
          </div>
          <WeekdayChart byWeekday={overview.byWeekday} />
        </section>
      </div>

      <section className="card" aria-labelledby="recent-title">
        <div className="card__head">
          <h2 className="card__title" id="recent-title">방금 들어온 기록</h2>
          <a className="card__aside link-more" href={adminHref('/records')}>기록 전체 보기</a>
        </div>
        {overview.recentRecords.length === 0 ? (
          <p className="muted">아직 들어온 기록이 없어요. 차량 앱 설정에서 익명 기록 보내기를 켜면 여기에 쌓여요.</p>
        ) : (
          <ul className="feed">
            {overview.recentRecords.slice(0, 8).map((r) => (
              <li key={r.id} className="feed__item">
                <time className="feed__time" dateTime={r.receivedAt} title={formatDateTime(r.receivedAt)}>{formatRelative(r.receivedAt, now)}</time>
                <a className="feed__lot" href={adminHref(`/lots/${encodeURIComponent(r.lotId)}`)}>{r.lotName}</a>
                <span className="feed__detail">
                  {r.floor ?? '층 모름'} · 후진 {r.reverseCount}회 · 핸들 {r.steeringTurns}번 · {formatDurationKo(r.durationSec)}
                </span>
                <KindBadge demo={r.demo} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function Dashboard() {
  const { client, lots } = useData()
  const overview = useAsync(() => client.overview(), [client])
  if (overview.error && !overview.data) return <ErrorBox message={overview.error} onRetry={overview.reload} />
  if (lots.error && !lots.data) return <ErrorBox message={lots.error} />
  if (!overview.data || !lots.data) return <Loading />
  return <DashboardView overview={overview.data} lots={lots.data} />
}
