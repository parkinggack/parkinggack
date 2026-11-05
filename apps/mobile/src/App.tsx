/**
 * 주차각 짝꿍 앱 — 주소에 따라 화면 하나를 그린다 (router.ts). 첫 실행 안내, 연결 여부에 따른 이동,
 * '지금 주차 중' 30초 확인과 새 주차 알림을 여기서 맡는다. 화면이 바뀔 때의 스프링 전환은 ui/Stage.tsx.
 */
import type { MyParking } from '@api-types'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { POLL_MS } from './config'
import { parkedNoticeText } from './copy'
import { onNewParking, refreshCurrent, showToast, toastStore, useStore } from './data'
import { finishesOnboarding, redirectFor } from './flow'
import { spotTitle } from './format'
import { showLocalNotification } from './push'
import { currentRoute, navigate, onRouteChange, routePath, type Route } from './router'
import { session } from './session'
import { ConnectedScreen, ConnectScreen, CodeScreen, PairScreen } from './screens/Connect'
import { HomeScreen } from './screens/Home'
import { KingMeScreen, KingResultScreen, KingScreen } from './screens/King'
import { EasierScreen, LotScreen, LotsScreen } from './screens/Lots'
import { ShareScreen, SpotScreen, StartScreen } from './screens/Onboarding'
import { CurrentParkingScreen, LinkParkingScreen, MessageScreen, ShortLinkScreen } from './screens/Parking'
import { RecordScreen, RecordsScreen } from './screens/Records'
import { ExperienceScreen, SettingsScreen } from './screens/Settings'
import { useSession } from './ui/hooks'
import { Toast } from './ui/kit'
import { captureLeaving, Stage } from './ui/Stage'

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'start':
      return <StartScreen />
    case 'start-spot':
      return <SpotScreen />
    case 'start-share':
      return <ShareScreen />
    case 'connect':
      return <ConnectScreen />
    case 'connect-code':
      return <CodeScreen />
    case 'connected':
      return <ConnectedScreen />
    case 'pair':
      return <PairScreen code={route.code} />
    case 'home':
      return <HomeScreen />
    case 'parking':
      return <CurrentParkingScreen way={route.way} />
    case 'link':
      return <LinkParkingScreen id={route.id} way={route.way} />
    case 'short':
      return <ShortLinkScreen code={route.code} way={route.way} />
    case 'lots':
      return <LotsScreen />
    case 'lot':
      return <LotScreen id={route.id} />
    case 'lot-easier':
      return <EasierScreen id={route.id} />
    case 'records':
      return <RecordsScreen />
    case 'record':
      return <RecordScreen id={route.id} />
    case 'king':
      return <KingScreen />
    case 'king-me':
      return <KingMeScreen />
    case 'king-result':
      return <KingResultScreen />
    case 'settings':
      return <SettingsScreen />
    case 'experience':
      return <ExperienceScreen />
    case 'notfound':
      return <MessageScreen title="없는 화면이에요" />
  }
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute)
  const s = useSession()
  const toast = useStore(toastStore)

  // 그리자마자 눌러도 놓치지 않게 (useEffect는 그린 뒤에 붙음). 다시 그리기 전에 지금 화면을 떠 둔다 (나가는 움직임용)
  useLayoutEffect(
    () =>
      onRouteChange(() => {
        captureLeaving()
        setRoute(currentRoute())
      }),
    [],
  )

  // 들어갈 수 없는 화면이면 바꿔 놓기 (뒤로 가기 기록을 늘리지 않게 replace)
  const redirect = redirectFor(route, { onboarded: s.onboarded, paired: !!s.token })
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true })
    else if (!s.onboarded && finishesOnboarding(route)) session.setOnboarded(true)
  }, [route, redirect?.name])

  // 화면 이름 (스크린 리더·탭 제목)
  useEffect(() => {
    const h1 = document.querySelector('main h1')?.textContent?.replace(/\s+/g, ' ').trim()
    document.title = h1 && h1 !== '주차각' ? `${h1} · 주차각` : '주차각'
  })

  // 지금 주차 중: 열 때, 화면이 다시 보일 때, 30초마다 (웹 푸시가 있어도 화면을 새로 고치려고)
  useEffect(() => {
    if (!s.token) return
    void refreshCurrent()
    const id = setInterval(() => void refreshCurrent(), POLL_MS)
    const vis = () => {
      if (!document.hidden) void refreshCurrent()
    }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('online', vis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', vis)
      window.removeEventListener('online', vis)
    }
  }, [s.token, s.demo])

  // 새 주차를 알아채면 "B2 · D-07에 주차했어요" (알림을 켠 경우)
  useEffect(() => {
    onNewParking((p: MyParking) => {
      if (session.get().prefs.notify !== 'on') return
      const text = parkedNoticeText(spotTitle(p))
      showToast(text, 4000)
      void showLocalNotification(text, `${import.meta.env.BASE_URL}parking`)
    })
    return () => onNewParking(null)
  }, [])

  // 바꿔 놓을 화면이면 그리지 않고 지금 화면을 그대로 둔다 (바뀐 뒤 그 화면에서 새 화면으로 움직이게)
  const shown = useRef<Route | null>(null)
  if (!redirect) shown.current = route
  const display = shown.current
  return (
    <>
      {display ? (
        <Stage route={display} routeKey={routePath(display)}>
          <Screen key={routePath(display)} route={display} />
        </Stage>
      ) : null}
      <Toast text={toast} />
    </>
  )
}
