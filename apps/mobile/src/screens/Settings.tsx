/** M-40 설정 · 운전 경력 고르기 */
import { useEffect, useState } from 'preact/hooks'
import { api, errorText, resetDemo } from '../api'
import { ENV_MOCK } from '../config'
import { COPY } from '../copy'
import { forgetCurrent, showToast, useAsync } from '../data'
import { currentMode, disableNotifications, enableNotifications, type NotifyMode } from '../push'
import { goBack, navigate } from '../router'
import { applyTheme, effectiveDark, EXPERIENCE_LABEL, EXPERIENCE_ORDER, session } from '../session'
import { useSession } from '../ui/hooks'
import { Button, ChevronIcon, Link, TabBar, Title, Toggle, TopBar } from '../ui/kit'

function CarIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink0">
      <path d="M5 16V11l2-5h10l2 5v5" />
      <path d="M4 16h16v3H4z" />
      <circle cx="8" cy="13" r="1" />
      <circle cx="16" cy="13" r="1" />
    </svg>
  )
}

export function SettingsScreen() {
  const s = useSession()
  const paired = !!s.token
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<NotifyMode>('polling')
  useEffect(() => {
    currentMode().then(setMode)
  }, [])
  // 주차왕에 참여 중이면 '그만두기' (서버에 v1.2 가 없거나 못 닿으면 줄을 안 보임)
  const king = useAsync(() => (paired ? api().kingMe().catch(() => null) : Promise.resolve(null)), [paired, s.demo, s.token])
  const [askingKing, setAskingKing] = useState(false)
  const [kingBusy, setKingBusy] = useState(false)
  const leaveKing = async () => {
    setKingBusy(true)
    try {
      await api().kingLeave()
      king.set(null)
      setAskingKing(false)
      showToast(COPY.kingLeft)
    } catch (e) {
      showToast(errorText(e))
    } finally {
      setKingBusy(false)
    }
  }

  const endDemo = () => {
    resetDemo()
    forgetCurrent()
    session.clearPairing()
    session.setDemo(false)
    session.setOnboarded(false)
    navigate({ name: 'start' }, { replace: true })
  }

  const unpair = async () => {
    setBusy(true)
    try {
      await disableNotifications(api())
      await api()
        .unpair()
        .catch(() => undefined) // 서버에 못 닿아도 이 폰에서는 토큰을 지운다 (토큰은 이 폰에만 있음)
    } finally {
      forgetCurrent()
      session.clearPairing()
      setBusy(false)
      setAsking(false)
      showToast(COPY.unpaired)
    }
  }

  const setNotify = async (on: boolean) => {
    session.setPref('notify', on ? 'on' : 'off')
    if (on) setMode(await enableNotifications(api()))
    else {
      await disableNotifications(api())
      setMode('polling')
    }
  }

  const dark = effectiveDark(s.prefs.theme)
  const setDark = (on: boolean) => {
    session.setPref('theme', on ? 'dark' : 'light')
    applyTheme(on ? 'dark' : 'light')
  }

  const demo = s.demo && !ENV_MOCK
  const carState = !paired ? COPY.carNotConnected : demo ? COPY.carDemo : COPY.carConnected
  return (
    <main class="screen tabscreen settings">
      <div class="tab-body">
        <h1 class="tab-title">{COPY.settingsTitle}</h1>
        {paired ? (
          <button type="button" class="car-card" aria-expanded={asking ? 'true' : 'false'} onClick={() => setAsking((a) => !a)}>
            <CarIcon />
            <span class="car-name">{COPY.myCar}</span>
            <span class="car-state">{carState}</span>
          </button>
        ) : (
          <Link to={{ name: 'connect' }} class="car-card">
            <CarIcon />
            <span class="car-name">{COPY.myCar}</span>
            <span class="car-state car-state-strong">{carState}</span>
            <ChevronIcon />
          </Link>
        )}
        {asking ? (
          <div class="confirm" role="group" aria-label={demo ? COPY.demoEnd : COPY.unpairYes}>
            <p class="confirm-text">{demo ? COPY.demoAsk : COPY.unpairAsk}</p>
            <div class="confirm-actions">
              <Button variant="primary" onClick={demo ? endDemo : unpair} busy={busy}>
                {demo ? COPY.demoEnd : COPY.unpairYes}
              </Button>
              <Button variant="text" onClick={() => setAsking(false)}>
                {COPY.unpairNo}
              </Button>
            </div>
          </div>
        ) : null}
        <div class="setting-list">
          <Toggle label={COPY.toggleShare} checked={s.prefs.share !== 'off'} onChange={(v) => session.setPref('share', v ? 'on' : 'off')} />
          <Toggle
            label={COPY.toggleNotify}
            checked={s.prefs.notify === 'on'}
            onChange={setNotify}
            note={s.prefs.notify === 'on' && paired && mode === 'polling' ? COPY.notifyPolling : undefined}
          />
          <Toggle label={COPY.toggleDark} checked={dark} onChange={setDark} />
          <Link to={{ name: 'experience' }} class="setting-link">
            <span class="grow setting-label">{COPY.experience}</span>
            <span class="setting-value">{s.prefs.experience ? EXPERIENCE_LABEL[s.prefs.experience] : '고르기'}</span>
            <ChevronIcon />
          </Link>
          {paired && king.data?.joined ? (
            <button type="button" class="setting-link setting-button" aria-expanded={askingKing ? 'true' : 'false'} onClick={() => setAskingKing((a) => !a)}>
              <span class="grow setting-label">{COPY.kingLeave}</span>
              <span class="setting-value">{king.data.nickname ?? ''}</span>
            </button>
          ) : null}
        </div>
        {askingKing && king.data?.joined ? (
          <div class="confirm" role="group" aria-label={COPY.kingLeave}>
            <p class="confirm-text">{COPY.kingLeaveAsk}</p>
            <div class="confirm-actions">
              <Button variant="primary" onClick={leaveKing} busy={kingBusy}>
                {COPY.kingLeaveYes}
              </Button>
              <Button variant="text" onClick={() => setAskingKing(false)}>
                {COPY.unpairNo}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <TabBar active="settings" />
    </main>
  )
}

export function ExperienceScreen() {
  const s = useSession()
  const pick = (v: (typeof EXPERIENCE_ORDER)[number]) => {
    session.setPref('experience', v)
    goBack({ name: 'settings' })
  }
  return (
    <main class="screen detail">
      <div class="detail-body">
        <TopBar back={{ name: 'settings' }} />
        <Title text={COPY.experienceTitle} desc={COPY.experienceDesc} />
        <div class="options" role="radiogroup" aria-label={COPY.experience}>
          {EXPERIENCE_ORDER.map((v) => {
            const on = s.prefs.experience === v
            return (
              <button key={v} type="button" role="radio" aria-checked={on ? 'true' : 'false'} class={on ? 'option option-on' : 'option'} onClick={() => pick(v)}>
                {EXPERIENCE_LABEL[v]}
              </button>
            )
          })}
        </div>
      </div>
    </main>
  )
}
