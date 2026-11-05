/** M-13 차와 연결 (QR) · 코드 입력 · /pair/:code · M-14 연결 완료 */
import { useEffect, useReducer, useRef, useState } from 'preact/hooks'
import { api } from '../api'
import { createHttpApi } from '../api/client'
import { API_BASE, ENV_MOCK } from '../config'
import { COPY } from '../copy'
import { forgetCurrent, refreshCurrent } from '../data'
import { afterConnected } from '../flow'
import { DEMO_PAIR_CODE } from '../mock/fixtures'
import { claim, CODE_LENGTH, FAIL_TEXT, parseScan, phoneNameFromUA, reducePairing, type PairState } from '../pairing'
import { enableNotifications } from '../push'
import { navigate } from '../router'
import { cameraPermission, startScanner, type Scanner } from '../scanner'
import { session } from '../session'
import { BottomCTA, Button, CarTop, Title, TopBar } from '../ui/kit'

const QR = [
  '11111111111111111',
  '10000011111000001',
  '10111010001011101',
  '10111011011011101',
  '10111011111011101',
  '10000010001000001',
  '11111110111111111',
  '00001000111000100',
  '00010111011010110',
  '11101101001110011',
  '11111111110000011',
  '10000010010001111',
  '10111011011110111',
  '10111010111110110',
  '10111011010010111',
  '10000011110001111',
  '11111111011000100',
]
const QR_PATH = QR.flatMap((row, y) => [...row].map((c, x) => (c === '1' ? `M${x * 6} ${y * 6}h6v6h-6z` : ''))).join('')
const CORNERS = ['M104 120 V92 H132', 'M246 120 V92 H218', 'M104 236 V264 H132', 'M246 236 V264 H218']

/** 연결 상태 기계 + claim 실행. 연결되면 토큰 저장 → M-14 */
function usePairing(initial: PairState = { step: 'idle' }) {
  const [state, dispatch] = useReducer(reducePairing, initial)
  useEffect(() => {
    if (state.step !== 'claiming') return
    let alive = true
    const before = session.get()
    claim(api(), state.code, phoneNameFromUA(navigator.userAgent)).then(({ event, res }) => {
      if (!alive) return
      if (res) {
        // 다른 차와 다시 연결: 예전 폰 토큰은 서버에서도 폐기 (이 폰에만 있던 열쇠라 지금 아니면 못 지움)
        if (before.token && !before.demo && before.token !== res.token) {
          void createHttpApi({ base: API_BASE, token: () => before.token })
            .unpair()
            .catch(() => undefined)
        }
        forgetCurrent()
        session.setPaired(res.token, res.car)
        void refreshCurrent()
      }
      dispatch(event)
    })
    return () => {
      alive = false
    }
  }, [state.step === 'claiming' ? state.code : null, state.step])
  useEffect(() => {
    if (state.step === 'paired') navigate({ name: 'connected' }, { replace: true })
  }, [state.step])
  return [state, dispatch] as const
}

function skipConnect() {
  session.setOnboarded(true)
  navigate({ name: 'home' }, { replace: true })
}

export function ConnectScreen() {
  const [state, dispatch] = usePairing()
  const videoRef = useRef<HTMLVideoElement>(null)
  const scanner = useRef<Scanner | null>(null)
  const [notice, setNotice] = useState('')
  const scanning = state.step === 'scanning'
  const demo = session.get().demo

  const begin = () => {
    if (demo || ENV_MOCK) {
      // 시연: 차 화면 QR을 찍은 것처럼 (시안 "시연에서는 눌러서 넘어가요")
      dispatch({ type: 'SCAN' })
      dispatch({ type: 'SCANNED', text: `${location.origin}/pair/${DEMO_PAIR_CODE}` })
      return
    }
    dispatch({ type: 'SCAN' })
  }

  // 이미 카메라를 허락했으면 바로 켠다
  useEffect(() => {
    if (demo || ENV_MOCK) return
    cameraPermission().then((p) => p === 'granted' && dispatch({ type: 'SCAN' }))
  }, [])

  useEffect(() => {
    if (!scanning || !videoRef.current) return
    let alive = true
    startScanner(
      videoRef.current,
      (text) => {
        const r = parseScan(text)
        if (r.kind === 'pair') dispatch({ type: 'SCANNED', text })
        else if (r.kind === 'share') navigate(r.path, { replace: false })
        else {
          setNotice(COPY.wrongQr)
          setTimeout(() => alive && setNotice(''), 2500)
        }
      },
      (problem) => {
        if (!alive) return
        dispatch({ type: 'CAMERA_FAILED', problem })
      },
    ).then((s) => {
      if (alive) scanner.current = s
      else s.stop()
    })
    return () => {
      alive = false
      scanner.current?.stop()
      scanner.current = null
    }
  }, [scanning])

  // 카메라를 못 쓰면 코드 입력으로 (이유를 한 줄로)
  useEffect(() => {
    if (state.step !== 'entering') return
    sessionStorageSet('pg:camera-notice', state.notice)
    navigate({ name: 'connect-code' })
  }, [state.step])

  const claiming = state.step === 'claiming'
  return (
    <main class="screen flow">
      <div class="flow-body">
        <Title text={COPY.connectTitle} />
        <button type="button" class="qr-frame" aria-label="QR 찍기" onClick={begin} disabled={scanning || claiming}>
          {scanning ? (
            <>
              <video ref={videoRef} class="qr-video" playsInline muted aria-hidden="true" />
              <svg aria-hidden="true" class="qr-overlay" viewBox="0 0 350 350">
                {CORNERS.map((d) => (
                  <path key={d} d={d} fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
                ))}
                <text x="175" y="318" text-anchor="middle" class="svg-text" font-size="15" fill="#ffffff">
                  {notice || COPY.connectAim}
                </text>
              </svg>
            </>
          ) : (
            <svg role="img" aria-label="차 화면에 뜬 QR을 카메라 네모 안에 맞추는 그림" viewBox="0 0 350 350" class="qr-illus">
              <rect width="350" height="350" class="illus-bg" />
              <rect x="60" y="66" width="230" height="200" rx="18" fill="#2a2a28" stroke="#4a4944" stroke-width="2" />
              <g transform="translate(124 104)">
                <rect x="-10" y="-10" width="122" height="122" rx="10" fill="#ffffff" />
                <path d={QR_PATH} fill="#1e1e1e" />
              </g>
              {CORNERS.map((d) => (
                <path key={d} d={d} fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
              ))}
              {/* 시안 그림 위쪽 빈자리에 '누르면 카메라' 안내 — 그림 자체가 카메라 버튼 */}
              <text x="175" y="40" text-anchor="middle" class="svg-text" font-size="15" font-weight="500" fill="#ffffff">
                {claiming ? COPY.pairingTitle : COPY.connectHint}
              </text>
              <text x="175" y="318" text-anchor="middle" class="svg-text" font-size="15" fill="#b5b3ad">
                {COPY.connectWhere}
              </text>
            </svg>
          )}
        </button>
      </div>
      <BottomCTA>
        <Button variant="secondary" onClick={() => dispatch({ type: 'USE_CODE' })} disabled={claiming}>
          {COPY.connectCode}
        </Button>
        <Button variant="text" onClick={skipConnect}>
          {COPY.connectLater}
        </Button>
      </BottomCTA>
    </main>
  )
}

function sessionStorageSet(k: string, v: string | null) {
  try {
    if (v == null) sessionStorage.removeItem(k)
    else sessionStorage.setItem(k, v)
  } catch {
    /* 무시 */
  }
}
function sessionStorageTake(k: string): string | null {
  try {
    const v = sessionStorage.getItem(k)
    sessionStorage.removeItem(k)
    return v
  } catch {
    return null
  }
}

export function CodeScreen() {
  const [notice] = useState(() => {
    const n = sessionStorageTake('pg:camera-notice')
    return n === 'denied' ? COPY.cameraDenied : n ? COPY.cameraUnavailable : ''
  })
  const [state, dispatch] = usePairing({ step: 'entering', code: '', notice: null })
  const inputRef = useRef<HTMLInputElement>(null)
  const code = state.step === 'entering' ? state.code : state.step === 'claiming' || state.step === 'failed' ? state.code : ''
  const claiming = state.step === 'claiming'

  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    // 6자리가 차면 바로 연결
    if (state.step === 'entering' && state.code.length === CODE_LENGTH) dispatch({ type: 'SUBMIT' })
  }, [code])

  const error = state.step === 'failed' ? FAIL_TEXT[state.reason] : ''
  return (
    <main class="screen flow">
      <div class="detail-body">
        <TopBar back={{ name: 'connect' }} />
        <Title text={COPY.codeTitle} desc={notice || COPY.codeDesc} />
        <label class="code-boxes">
          <span class="visually-hidden">{COPY.codeLabel}</span>
          <input
            ref={inputRef}
            class="code-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={CODE_LENGTH}
            value={code}
            disabled={claiming}
            onInput={(e) => dispatch({ type: 'TYPE', value: (e.currentTarget as HTMLInputElement).value })}
            aria-describedby="code-msg"
          />
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <span key={i} class={i === code.length && !claiming ? 'code-box code-box-now' : 'code-box'} aria-hidden="true">
              {code[i] ?? ''}
            </span>
          ))}
        </label>
        <p id="code-msg" class="code-msg" role="status" aria-live="polite">
          {claiming ? COPY.pairingTitle : error}
        </p>
      </div>
      <BottomCTA>
        <Button onClick={() => (state.step === 'failed' ? dispatch({ type: 'RETRY' }) : dispatch({ type: 'SUBMIT' }))} disabled={code.length !== CODE_LENGTH} busy={claiming}>
          {COPY.codeButton}
        </Button>
      </BottomCTA>
    </main>
  )
}

/** /pair/:code — 차 QR을 기본 카메라 앱으로 찍으면 여기로 바로 온다 */
export function PairScreen({ code }: { code: string }) {
  // 이미 다른 차와 연결된 폰이면 먼저 묻는다 (링크 하나로 내 차 연결이 몰래 바뀌지 않게)
  const [confirmed, setConfirmed] = useState(() => {
    const s = session.get()
    return !s.token || (s.demo && !ENV_MOCK)
  })
  const [state, dispatch] = usePairing()
  useEffect(() => {
    if (!confirmed) return
    // 시연 데이터로 보던 폰이 진짜 차 QR을 찍으면 시연을 끝내고 서버로
    if (session.get().demo && !ENV_MOCK) {
      forgetCurrent()
      session.setDemo(false)
    }
    dispatch({ type: 'LINK', code })
  }, [code, confirmed])
  const failed = state.step === 'failed' ? state : null
  if (!confirmed) {
    return (
      <main class="screen flow">
        <div class="flow-body">
          <Title text={COPY.repairTitle} desc={COPY.repairDesc} />
          <ConnectIllus done={false} />
        </div>
        <BottomCTA>
          <Button onClick={() => setConfirmed(true)}>{COPY.repairYes}</Button>
          <Button variant="text" onClick={() => navigate({ name: 'home' }, { replace: true })}>
            {COPY.unpairNo}
          </Button>
        </BottomCTA>
      </main>
    )
  }
  return (
    <main class="screen flow">
      <div class="flow-body">
        <Title text={failed ? COPY.pairFailTitle : COPY.pairingTitle} desc={failed ? FAIL_TEXT[failed.reason] : undefined} />
        <ConnectIllus done={false} />
      </div>
      {failed ? (
        <BottomCTA>
          {failed.reason === 'offline' || failed.reason === 'unknown' ? (
            <Button onClick={() => dispatch({ type: 'RETRY' })}>{COPY.pairRetry}</Button>
          ) : (
            <Button onClick={() => navigate({ name: 'connect-code' }, { replace: true })}>{COPY.connectCode}</Button>
          )}
          <Button variant="text" onClick={() => navigate(session.get().onboarded ? { name: 'home' } : { name: 'start' }, { replace: true })}>
            {COPY.notifyLater}
          </Button>
        </BottomCTA>
      ) : null}
    </main>
  )
}

function ConnectIllus({ done }: { done: boolean }) {
  return (
    <svg role="img" aria-label="주차각 로고와 주차 칸의 차가 점선으로 이어진 그림" class="illus" viewBox="0 0 350 300" style={{ marginTop: '36px' }}>
      <rect width="350" height="300" class="illus-bg" />
      <g transform="translate(28 106)">
        <rect width="88" height="88" rx="24" fill="#ffffff" />
        <g transform="scale(1.8333)">
          <path d="M15 36V12h9a7 7 0 0 1 0 14h-9" fill="none" stroke="#1e1e1e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M27 38h8a3 3 0 0 0 3-3v-8" fill="none" stroke="#1e1e1e" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      </g>
      <path d="M118 150 H232" stroke="#8a8780" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 10" class={done ? '' : 'dash-move'} />
      {done ? (
        <>
          <circle cx="175" cy="150" r="20" fill="#ffffff" />
          <path d="M166 150.5l6 6 11-12" fill="none" stroke="#1e1e1e" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
        </>
      ) : null}
      <path d="M240 96 V204 M324 96 V204 M240 96 H324" stroke="#4a4944" stroke-width="2" stroke-linecap="round" />
      <CarTop x={282} y={152} w={37.5} />
    </svg>
  )
}

export function ConnectedScreen() {
  const [busy, setBusy] = useState(false)
  const next = () => {
    const s = session.get()
    const to = afterConnected({ paired: !!s.token, shareChosen: s.prefs.share != null })
    if (to.name === 'home') session.setOnboarded(true)
    navigate(to, { replace: true })
  }
  const yes = async () => {
    setBusy(true)
    session.setPref('notify', 'on')
    await enableNotifications(api())
    setBusy(false)
    next()
  }
  const later = () => {
    session.setPref('notify', 'off')
    next()
  }
  return (
    <main class="screen flow">
      <div class="flow-body">
        <Title text={COPY.connectedTitle} desc={COPY.connectedDesc} />
        <ConnectIllus done />
      </div>
      <BottomCTA>
        <Button onClick={yes} busy={busy}>
          {COPY.notifyYes}
        </Button>
        <Button variant="text" onClick={later}>
          {COPY.notifyLater}
        </Button>
      </BottomCTA>
    </main>
  )
}
