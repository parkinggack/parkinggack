/** M-10 시작 (차가 왼쪽에서 들어와 칸에 서는 짧은 등장 — carpath.ts START_ARRIVE) · M-11 주차 위치 · M-12 익명 기록 동의 */
import { ENV_MOCK } from '../config'
import { COPY } from '../copy'
import { afterShareChoice } from '../flow'
import { navigate } from '../router'
import { session } from '../session'
import { enterDemo } from '../demo'
import { START_ARRIVE } from '../carpath'
import { CarDrive } from '../ui/CarDrive'
import { BottomCTA, Button, CarTop, Logo, Title } from '../ui/kit'

const LINE = '#4a4944'

export function StartScreen() {
  const startDemo = () => {
    enterDemo()
    navigate({ name: 'home' }, { replace: true })
  }
  return (
    <main class="screen screen-dark m10">
      <svg aria-hidden="true" class="m10-bg" viewBox="0 0 390 844" preserveAspectRatio="xMidYMax slice">
        <path d="M-10 700 H400" stroke={LINE} stroke-width="3" />
        {[-10, 56, 122, 188, 254, 320, 386].map((x) => (
          <path key={x} d={`M${x} 560 V700`} stroke={LINE} stroke-width="3" stroke-linecap="round" />
        ))}
        <CarDrive script={START_ARRIVE} w={40.5} playKey="start" />
      </svg>
      <div class="m10-hero">
        <Logo size={104} inverse />
        <h1 class="visually-hidden">{COPY.appName}</h1>
        <p class="m10-lead">
          {COPY.startLead.split('\n').map((l, i) => (
            <>
              {i > 0 && <br />}
              {l}
            </>
          ))}
        </p>
      </div>
      <div class="cta cta-dark">
        <Button variant="white" onClick={() => navigate({ name: 'start-spot' })}>
          {COPY.startButton}
        </Button>
        {!ENV_MOCK ? (
          <Button variant="text" onClick={startDemo}>
            {COPY.startDemo}
          </Button>
        ) : null}
      </div>
    </main>
  )
}

export function SpotScreen() {
  return (
    <main class="screen flow">
      <div class="flow-body">
        <Title text={COPY.spotTitle} />
        <svg role="img" aria-label="주차 칸에 댄 차 위에 B2 D-07이 표시된 그림" class="illus" viewBox="0 0 350 380" style={{ marginTop: '36px' }}>
          <rect width="350" height="380" class="illus-bg" />
          <path d="M-20 196 V346 M46 196 V346 M112 196 V346 M178 196 V346 M244 196 V346 M310 196 V346 M376 196 V346 M-20 196 H376" stroke={LINE} stroke-width="2" stroke-linecap="round" />
          <CarTop x={178} y={272} w={37.5} />
          <g transform="translate(150 60)">
            <rect width="168" height="96" rx="18" fill="#ffffff" />
            <path d="M30 96 l14 16 l14 -16 z" fill="#ffffff" />
            <text x="20" y="56" class="svg-text" font-size="46" font-weight="700" letter-spacing="-1.5" fill="#1e1e1e">
              B2
            </text>
            <text x="88" y="56" class="svg-text" font-size="26" font-weight="700" fill="#1e1e1e">
              D-07
            </text>
            <text x="20" y="80" class="svg-text" font-size="14" fill="#5f5d57">
              {COPY.spotSaved}
            </text>
          </g>
        </svg>
      </div>
      <BottomCTA>
        <Button onClick={() => navigate({ name: 'start-share' })}>{COPY.next}</Button>
      </BottomCTA>
    </main>
  )
}

export function ShareScreen() {
  const choose = (v: 'on' | 'off') => {
    session.setPref('share', v)
    const s = session.get()
    const next = afterShareChoice({ paired: !!s.token, shareChosen: true })
    if (next.name === 'home') session.setOnboarded(true)
    navigate(next, { replace: next.name === 'home' })
  }
  const trails = [
    'M-10 300 C 80 300, 110 270, 120 220',
    'M-10 270 C 90 270, 160 250, 186 220',
    'M-10 330 C 140 330, 230 300, 252 220',
    'M-10 240 C 30 240, 50 236, 56 220',
  ]
  return (
    <main class="screen flow">
      <div class="flow-body">
        <Title text={COPY.shareTitle} />
        <svg role="img" aria-label="여러 차의 익명 동선이 모여 난이도 4.3이 되는 그림" class="illus" viewBox="0 0 350 360" style={{ marginTop: '28px' }}>
          <rect width="350" height="360" class="illus-bg" />
          <path d="M22 160 V220 M88 160 V220 M154 160 V220 M220 160 V220 M286 160 V220 M22 220 H286" stroke={LINE} stroke-width="2" stroke-linecap="round" />
          {trails.map((d) => (
            <path key={d} d={d} fill="none" stroke="#8a8780" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 8" />
          ))}
          <g transform="translate(24 40)">
            <text x="0" y="74" class="svg-text" font-size="84" font-weight="700" letter-spacing="-3" fill="#ffffff">
              4.3
            </text>
            {[
              [150, 56, 18],
              [172, 46, 28],
              [194, 36, 38],
              [216, 26, 48],
            ].map(([x, y, h]) => (
              <rect key={x} x={x} y={y} width="14" height={h} rx="3" fill="#ffffff" stroke="#ffffff" stroke-width="2" />
            ))}
            <rect x="238" y="16" width="14" height="58" rx="3" fill="none" stroke="#ffffff" stroke-width="2" />
            <text x="2" y="104" class="svg-text" font-size="16" fill="#b5b3ad">
              {COPY.shareCaption}
            </text>
          </g>
        </svg>
        <p class="privacy-line">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink0">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          {COPY.sharePrivacy}
        </p>
      </div>
      <BottomCTA>
        <Button onClick={() => choose('on')}>{COPY.shareYes}</Button>
        <Button variant="text" onClick={() => choose('off')}>
          {COPY.shareNo}
        </Button>
      </BottomCTA>
    </main>
  )
}
