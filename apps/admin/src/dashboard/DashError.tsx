/** 불러오기 실패 — 차분하게: 무엇이 안 됐는지 + 다시 해 보기 + 서버 없이 시연 데이터로 보기 */
import { useEffect } from 'react'
import { href } from '../router'
import { useInsightsContext } from './context'

export interface DashErrorProps {
  message: string
  /** ApiError 코드 ('network' = 서버 꺼짐·CORS, 'not_found' …) */
  code?: string | null
  onRetry?: () => void
  /** 주차장 상세에서 없는 id */
  notFound?: boolean
}

export function DashError({ message, code, onRetry, notFound }: DashErrorProps) {
  const { mock, switchToDemo, client } = useInsightsContext()
  // 심사·발표 중 서버가 잠깐 안 되면 오류 화면 대신 바로 시연 데이터로. 머리글이 '서버 없이 … 시연 데이터로 보고 있어요'와
  // '서버 데이터로 다시 보기'를 보여 주므로 숨기는 것은 없다. 없는 주차장(404)은 그대로 안내
  useEffect(() => {
    if (!notFound && !mock) switchToDemo()
  }, [notFound, mock, switchToDemo])
  const text = notFound
    ? '주소가 바뀌었거나 이 기간에 기록이 없는 주차장이에요.'
    : mock
      ? message
      : code === 'network'
        ? `서버(${client.baseUrl})에 연결되지 않았어요. 잠시 뒤 다시 해 보거나, 서버 없이 시연 데이터로 둘러볼 수 있어요.`
        : `서버(${client.baseUrl})에서 통계를 받아 오다 문제가 생겼어요. 잠시 뒤 다시 해 보거나, 서버 없이 시연 데이터로 둘러볼 수 있어요.`
  return (
    <section className="d-error" role="alert" aria-labelledby="d-error-title">
      <h1 className="d-error__title" id="d-error-title">{notFound ? '찾는 주차장이 없어요' : '지금은 데이터를 불러올 수 없어요'}</h1>
      <p className="d-error__text">{text}</p>
      {!notFound && !mock && <p className="d-error__detail">{message}</p>}
      <div className="d-error__actions">
        {notFound ? (
          <a className="d-btn d-btn--primary" href={href('/')}>처음 화면으로 돌아가기</a>
        ) : (
          <>
            {onRetry && <button type="button" className="d-btn d-btn--secondary" onClick={onRetry}>다시 불러오기</button>}
            {!mock && <button type="button" className="d-btn d-btn--primary" onClick={switchToDemo}>시연 데이터로 보기</button>}
          </>
        )}
      </div>
    </section>
  )
}
