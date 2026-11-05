/**
 * 호스팅이 페이지 위에 겹쳐 넣는 요소만큼 화면 아래를 비운다.
 * Netlify 무료 요금제는 오른쪽 아래에 "Powered by Netlify" 배지(iframe#nl-badge-frame, 높이 64px)를 넣는데,
 * 끌 수 없어서(유료 기능) 그대로 두면 하단 버튼·탭바를 덮어 누를 수 없다. 배지를 숨기지 않고(약관) 자리를 비켜 준다.
 * 배지가 없으면(WebView·다른 호스팅) --host-inset = 0.
 */
const BADGE_IDS = ['nl-badge-frame']

export function measureHostInset(doc: Document = document): number {
  let inset = 0
  for (const id of BADGE_IDS) {
    const el = doc.getElementById(id)
    if (!el) continue
    const r = el.getBoundingClientRect()
    const vh = doc.defaultView?.innerHeight ?? 0
    // 화면 아래에 붙어 있는 것만 (배지가 위로 옮겨지면 비울 필요 없음)
    if (r.height > 0 && vh > 0 && r.bottom >= vh - 2) inset = Math.max(inset, Math.ceil(r.height))
  }
  return inset
}

export function watchHostInset(doc: Document = document): () => void {
  const apply = () => doc.documentElement.style.setProperty('--host-inset', `${measureHostInset(doc)}px`)
  apply()
  const mo = new MutationObserver(apply)
  mo.observe(doc.body, { childList: true })
  const onResize = () => apply()
  doc.defaultView?.addEventListener('resize', onResize)
  // 배지 iframe 은 늦게(async 스크립트) 붙고 크기도 나중에 정해짐 → 잠깐 더 확인
  const timers = [500, 1500, 4000].map((ms) => setTimeout(apply, ms))
  return () => { mo.disconnect(); doc.defaultView?.removeEventListener('resize', onResize); timers.forEach(clearTimeout) }
}
