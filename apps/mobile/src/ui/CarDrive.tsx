/**
 * 그림 속 차를 대본(carpath.ts)대로 움직인다 — requestAnimationFrame 으로 <g transform> 하나만 바꿈 (다시 그리기 없음).
 * playKey 가 바뀔 때(새 주차) 또는 처음 붙을 때만 처음부터. 30초마다 화면을 새로 고쳐도 다시 시작하지 않는다.
 * '동작 줄이기'·rAF 없음(테스트)·탭이 가려짐이면 끝 자세로 바로.
 */
import { useLayoutEffect, useRef } from 'preact/hooks'
import { poseAt, poseTransform, scriptDuration, type DriveScript } from '../carpath'
import { prefersReducedMotion } from './hooks'
import { CarTop } from './kit'

export function CarDrive({ script, w, playKey, fill, glass }: { script: DriveScript; w: number; playKey: string; fill?: string; glass?: string }) {
  const ref = useRef<SVGGElement>(null)
  useLayoutEffect(() => {
    const g = ref.current
    if (!g) return
    const set = (t: number) => g.setAttribute('transform', poseTransform(poseAt(script, t)))
    const total = scriptDuration(script)
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function' || document.hidden) {
      set(total)
      return
    }
    const t0 = performance.now()
    let id = 0
    set(0)
    const tick = () => {
      const t = performance.now() - t0
      set(Math.min(t, total))
      if (t < total) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, script])
  return (
    <g ref={ref} class="car-drive">
      <CarTop x={0} y={0} w={w} fill={fill} glass={glass} />
    </g>
  )
}
