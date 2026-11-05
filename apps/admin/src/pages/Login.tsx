/**
 * 관리자 토큰 입력. /v1/admin/overview 를 그 토큰으로 불러 보고 되면 sessionStorage 에 저장한다.
 * 서버 없이 PT를 해야 할 때를 위해 '시연 데이터로 둘러보기'도 있다 (이 탭에서만, 서버에 아무것도 안 보냄).
 */
import { useId, useState, type FormEvent } from 'react'
import { ApiError, createApiClient, type FetchLike } from '../api'
import { config, DEV_ADMIN_TOKEN } from '../config'

export interface LoginProps {
  onLogin: (token: string, mock: boolean) => void
  /** 401로 쫓겨났을 때 이유 */
  reason?: string | null
  mockFetch: FetchLike
}

export function Login({ onLogin, reason, mockFetch }: LoginProps) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const errId = useId()
  const mockOnly = config.mockBuild

  async function tryLogin(candidate: string, mock: boolean) {
    setBusy(true)
    setError(null)
    try {
      const client = createApiClient({
        baseUrl: config.apiBase,
        getToken: () => candidate,
        fetchImpl: mock ? mockFetch : undefined,
      })
      await client.overview()
      onLogin(candidate, mock)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'unauthorized') setError('토큰이 맞지 않아요. 서버의 ADMIN_TOKEN 값을 확인해 주세요')
      else if (e instanceof ApiError && e.code === 'network') {
        setError(`서버에 연결할 수 없어요 (${config.apiBase}). 서버가 켜져 있는지, 이 주소(${location.origin})가 서버 ADMIN_ORIGINS에 들어 있는지 확인해 주세요`)
      } else setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = token.trim()
    if (!t) {
      setError('토큰을 넣어 주세요')
      return
    }
    void tryLogin(t, mockOnly)
  }

  return (
    <main className="login" id="main">
      <div className="login__card">
        <h1 className="login__title">주차각 인사이트</h1>
        <p className="login__lede">주차장 정보와 익명 주차 기록을 관리하는 운영자 화면이에요.</p>
        {reason && <p className="login__reason" role="status">{reason}</p>}
        <form onSubmit={submit} noValidate>
          <label htmlFor={inputId} className="field__label">관리자 토큰</label>
          <input
            id={inputId}
            className="input"
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
            autoFocus
          />
          <p className="field__hint">
            {mockOnly
              ? `시연 모드예요 (서버 없음). 토큰: ${DEV_ADMIN_TOKEN}`
              : `서버 ${config.apiBase} · 개발 서버 기본값은 ${DEV_ADMIN_TOKEN}`}
          </p>
          {error && <p className="field__error" id={errId} role="alert">{error}</p>}
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? '확인하는 중…' : '들어가기'}
          </button>
        </form>
        {!mockOnly && (
          <div className="login__alt">
            <button type="button" className="btn btn--secondary btn--block" disabled={busy} onClick={() => void tryLogin(DEV_ADMIN_TOKEN, true)}>
              서버 없이 시연 데이터로 둘러보기
            </button>
            <p className="field__hint">이 탭에서만 동작하고 서버에는 아무것도 보내지 않아요. 고친 내용은 새로고침하면 처음으로 돌아가요.</p>
          </div>
        )}
        <p className="login__public">
          로그인 없이 보는 집계 화면은 <a href="#/">공개 대시보드 '주차각 데이터'</a>에 있어요.
        </p>
      </div>
    </main>
  )
}
