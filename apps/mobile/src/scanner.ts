/**
 * M-13 앱 안 QR 찍기. 카메라(getUserMedia, 뒤쪽) → BarcodeDetector가 있으면 그걸로(안드로이드 크롬),
 * 없으면 jsQR(필요할 때만 불러옴, iOS 사파리·WebView). 권한 거부·카메라 없음·http 접속이면 이유를 돌려주고
 * 화면은 '코드로 연결할게요'로 넘어간다.
 */
import type { CameraProblem } from './pairing'

export interface Scanner {
  stop(): void
}

interface Detector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}

type DetectorCtor = {
  new (opts: { formats: string[] }): Detector
  getSupportedFormats?: () => Promise<string[]>
}

export function cameraProblemOf(err: unknown): CameraProblem {
  const name = (err as { name?: string } | null)?.name ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError' || name === 'AbortError') return 'unavailable'
  return 'unsupported'
}

export function cameraAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && (typeof window === 'undefined' || window.isSecureContext)
}

/** 이미 허락했으면 바로 켜도 된다 (Permissions API가 없으면 모름 → null) */
export async function cameraPermission(): Promise<PermissionState | null> {
  try {
    const st = await navigator.permissions?.query({ name: 'camera' as PermissionName })
    return st?.state ?? null
  } catch {
    return null
  }
}

async function nativeDetector(): Promise<Detector | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  if (!Ctor) return null
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ['qr_code']
    if (!formats.includes('qr_code')) return null
    return new Ctor({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

/**
 * video 요소에 카메라를 띄우고 QR을 찾으면 onText (같은 글자는 1.5초에 한 번만).
 * 실패하면 onError(이유) — 이때 카메라는 이미 꺼져 있다.
 */
export async function startScanner(video: HTMLVideoElement, onText: (text: string) => void, onError: (p: CameraProblem) => void): Promise<Scanner> {
  let stopped = false
  let stream: MediaStream | null = null
  let timer = 0
  const stop = () => {
    stopped = true
    clearTimeout(timer)
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    try {
      video.srcObject = null
    } catch {
      /* 무시 */
    }
  }
  if (!cameraAvailable()) {
    onError('unsupported')
    return { stop }
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    })
  } catch (err) {
    onError(cameraProblemOf(err))
    return { stop }
  }
  if (stopped) {
    stop()
    return { stop }
  }
  video.setAttribute('playsinline', '')
  video.muted = true
  video.srcObject = stream
  try {
    await video.play()
  } catch {
    /* 자동 재생 막힘 — 프레임은 그래도 들어온다 */
  }

  const native = await nativeDetector()
  let jsqr: ((data: Uint8ClampedArray, w: number, h: number, o?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }) => { data: string } | null) | null = null
  if (!native) {
    try {
      jsqr = (await import('jsqr')).default
    } catch {
      stop()
      onError('unsupported')
      return { stop }
    }
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  let last = ''
  let lastAt = 0

  const tick = async () => {
    if (stopped) return
    try {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        let text: string | null = null
        if (native) {
          const codes = await native.detect(video)
          text = codes[0]?.rawValue ?? null
        } else if (jsqr && ctx) {
          // 가운데 정사각형만, 640px 이하로 줄여서 (느린 폰 배려)
          const side = Math.min(video.videoWidth, video.videoHeight)
          const size = Math.min(640, side)
          canvas.width = size
          canvas.height = size
          ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size)
          const img = ctx.getImageData(0, 0, size, size)
          text = jsqr(img.data, size, size, { inversionAttempts: 'dontInvert' })?.data ?? null
        }
        const now = Date.now()
        if (text && (text !== last || now - lastAt > 1500)) {
          last = text
          lastAt = now
          onText(text)
        }
      }
    } catch {
      /* 프레임 하나 건너뜀 */
    }
    if (!stopped) timer = window.setTimeout(tick, native ? 150 : 250)
  }
  tick()
  return { stop }
}
