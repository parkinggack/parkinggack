import { useEffect, useState } from 'preact/hooks'
import { session, type Session } from '../session'

/** '2시간 전' 같은 글자를 위해 주기적으로 다시 그림 (화면이 다시 보일 때도) */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = setInterval(tick, everyMs)
    const vis = () => !document.hidden && tick()
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [everyMs])
  return now
}

export function useSession(): Session {
  const [s, setS] = useState(session.get())
  useEffect(() => {
    setS(session.get())
    return session.subscribe(setS)
  }, [])
  return s
}

/** 접근성 설정 '동작 줄이기' */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
