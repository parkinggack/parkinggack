/**
 * 주차장 추가·수정 (AdminLotInput). POST /v1/admin/lots · PUT /v1/admin/lots/:id
 * 점수·표본·자동 태그는 서버가 기록으로 계산하므로 여기서 고치지 않는다.
 */
import { LOT_CATEGORY_LABEL, type AdminLot, type LotCategory, type ReasonTag } from '@api-types'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, errorMessage } from '../api'
import { ChipListEditor } from '../components/ChipListEditor'
import { Difficulty, ErrorBox, KindBadge, Loading } from '../components/ui'
import { useData } from '../data'
import { REASON_TAGS, tagLabel } from '../format'
import { adminHref, navigate } from '../router'
import {
  coordWarning, DEFAULT_FLOORS, DEFAULT_NUMBERS, DEFAULT_ZONES, emptyForm, formFromLot, LOT_CATEGORIES, nextAboveGround, nextBasement,
  toLotInput, toLotPatch, validateLotForm, type LotFormErrors, type LotFormValues,
} from '../validate'
import { DeleteLot, useLot } from './LotDetail'

function Field({ label, error, hint, children, id }: { label: string; error?: string; hint?: ReactNode; children: (ids: { id: string; describedBy?: string }) => ReactNode; id?: string }) {
  const autoId = useId()
  const fid = id ?? autoId
  const hintId = `${fid}-hint`
  const errId = `${fid}-err`
  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label className="field__label" htmlFor={fid}>{label}</label>
      {children({ id: fid, describedBy })}
      {hint && <p className="field__hint" id={hintId}>{hint}</p>}
      {error && <p className="field__error" id={errId}>{error}</p>}
    </div>
  )
}

const TAG_HINTS: Partial<Record<ReasonTag, string>> = {
  MECHANICAL: '기계식 주차 설비가 있음',
  SPACIOUS: '쉬운 쪽 태그',
  FLAT: '쉬운 쪽 태그',
}

/** 차량 앱으로 나갈 태그 미리보기: 운영자 태그 먼저 + 지금의 자동 태그, 최대 3개 */
function previewTags(manual: ReasonTag[], lot: AdminLot | null): ReasonTag[] {
  const auto = lot ? lot.tags.filter((t) => !lot.manualTags.includes(t)) : []
  const out: ReasonTag[] = []
  for (const t of [...manual, ...auto]) if (!out.includes(t) && out.length < 3) out.push(t)
  return out
}

export function LotEdit({ id }: { id: string | null }) {
  const isNew = id == null
  const { lot, loading, error } = useLot(id ?? '')
  if (!isNew && error) return <ErrorBox message={error} />
  if (!isNew && loading) return <Loading />
  if (!isNew && !lot) {
    return (
      <div className="page">
        <p className="empty">주차장 "{id}"이(가) 없어요.</p>
        <a href={adminHref('/lots')} className="btn btn--secondary">주차장 관리로</a>
      </div>
    )
  }
  return <LotForm key={id ?? 'new'} lot={lot} />
}

function LotForm({ lot }: { lot: AdminLot | null }) {
  const isNew = lot == null
  const { client, reloadLots, notify } = useData()
  const initial = useMemo(() => (lot ? formFromLot(lot) : emptyForm()), [lot])
  const [v, setV] = useState<LotFormValues>(initial)
  const [errors, setErrors] = useState<LotFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const warn = coordWarning(v)

  const set = <K extends keyof LotFormValues>(k: K, value: LotFormValues[K]) => {
    setV((s) => ({ ...s, [k]: value }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  // 저장하지 않은 내용이 있으면 탭 닫기 전에 묻기
  useEffect(() => {
    if (!dirty) return
    const on = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', on)
    return () => window.removeEventListener('beforeunload', on)
  }, [dirty])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const errs = validateLotForm(v, isNew)
    setErrors(errs)
    setServerError(null)
    if (Object.values(errs).some(Boolean)) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('.has-error input, .has-error button')?.focus())
      return
    }
    setSaving(true)
    try {
      const res = isNew ? await client.createLot(toLotInput(v)) : await client.updateLot(lot.id, toLotPatch(v))
      await reloadLots()
      notify(isNew ? `"${res.lot.name}"을(를) 추가했어요` : `"${res.lot.name}" 정보를 저장했어요`)
      navigate(adminHref(`/lots/${encodeURIComponent(res.lot.id)}`))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'conflict') setErrors((x) => ({ ...x, id: err.message }))
      setServerError(errorMessage(err))
      setSaving(false)
    }
  }

  const toggleTag = (t: ReasonTag) =>
    set('manualTags', v.manualTags.includes(t) ? v.manualTags.filter((x) => x !== t) : REASON_TAGS.filter((x) => x === t || v.manualTags.includes(x)))

  const lat = Number(v.lat)
  const lng = Number(v.lng)
  const coordOk = Number.isFinite(lat) && Number.isFinite(lng) && v.lat.trim() !== '' && v.lng.trim() !== ''
  const tagsOut = previewTags(v.manualTags, lot)

  return (
    <div className="page">
      <nav className="crumbs" aria-label="위치">
        <a href={adminHref('/lots')}>주차장 관리</a>
        {lot && (
          <>
            <span aria-hidden="true"> / </span>
            <a href={adminHref(`/lots/${encodeURIComponent(lot.id)}`)}>{lot.name}</a>
          </>
        )}
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{isNew ? '새 주차장' : '정보 수정'}</span>
      </nav>
      <div className="page__head">
        <div>
          <h1 className="page__title">{isNew ? '주차장 추가' : '주차장 정보 수정'}</h1>
          <p className="page__lede">차량 앱의 도착지 카드(C-02)·층 고르기(C-06)·상세(C-08)에 그대로 나가요.</p>
        </div>
      </div>

      <form className="edit-layout" onSubmit={save} noValidate ref={formRef}>
        <div className="edit-main">
          <section className="card form-section" aria-labelledby="sec-basic">
            <h2 className="card__title" id="sec-basic">기본 정보</h2>
            {isNew ? (
              <Field label="id (영문 소문자·숫자·하이픈)" error={errors.id} hint="한 번 정하면 바꿀 수 없어요. 차량 앱·기록이 이 값으로 주차장을 찾아요. 예: hyundai-pangyo">
                {({ id, describedBy }) => (
                  <input id={id} className="input mono" value={v.id} onChange={(e) => set('id', e.target.value.toLowerCase())} aria-invalid={!!errors.id} aria-describedby={describedBy} autoComplete="off" spellCheck={false} />
                )}
              </Field>
            ) : (
              <div className="field">
                <span className="field__label">id</span>
                <span className="mono readonly">{lot.id}</span>
              </div>
            )}
            <div className="field-grid">
              <Field label="이름" error={errors.name} hint="내비 목적지 이름과 부분 일치로 찾아요 (예: '현대백화점 판교점 지하주차장')">
                {({ id, describedBy }) => (
                  <input id={id} className="input" value={v.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} aria-describedby={describedBy} />
                )}
              </Field>
              <Field label="주소" hint="비워 두면 표시하지 않아요">
                {({ id, describedBy }) => (
                  <input id={id} className="input" value={v.address} onChange={(e) => set('address', e.target.value)} aria-describedby={describedBy} />
                )}
              </Field>
            </div>
            <div className="field-row">
              <Field label="위도" error={errors.lat}>
                {({ id, describedBy }) => (
                  <input id={id} className="input mono" inputMode="decimal" value={v.lat} onChange={(e) => set('lat', e.target.value)} aria-invalid={!!errors.lat} aria-describedby={describedBy} placeholder="37.3926" />
                )}
              </Field>
              <Field label="경도" error={errors.lng}>
                {({ id, describedBy }) => (
                  <input id={id} className="input mono" inputMode="decimal" value={v.lng} onChange={(e) => set('lng', e.target.value)} aria-invalid={!!errors.lng} aria-describedby={describedBy} placeholder="127.1121" />
                )}
              </Field>
              <div className="field field--link">
                {coordOk ? (
                  <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`} target="_blank" rel="noopener noreferrer">
                    지도에서 확인<span className="visually-hidden"> (새 창)</span>
                  </a>
                ) : <span className="muted">좌표를 넣으면 지도에서 확인할 수 있어요</span>}
              </div>
            </div>
            {warn && <p className="field__warn" role="status">{warn}</p>}
            <div className="field-grid">
              <Field label="유형" hint="공개 대시보드 '주차장 비교'(D-03)의 유형 칩으로 거를 때 써요">
                {({ id, describedBy }) => (
                  <select id={id} className="input select" value={v.category} onChange={(e) => set('category', e.target.value as LotCategory | '')} aria-describedby={describedBy}>
                    <option value="">정하지 않음</option>
                    {LOT_CATEGORIES.map((c) => <option key={c} value={c}>{LOT_CATEGORY_LABEL[c]}</option>)}
                  </select>
                )}
              </Field>
              <Field label="지역 id" error={errors.region} hint="공개 대시보드에서 묶어 보는 지역. 예: pangyo (판교 일대)">
                {({ id, describedBy }) => (
                  <input id={id} className="input mono" value={v.region} onChange={(e) => set('region', e.target.value.toLowerCase())} aria-invalid={!!errors.region} aria-describedby={describedBy} placeholder="pangyo" autoComplete="off" spellCheck={false} />
                )}
              </Field>
            </div>
          </section>

          <section className="card form-section" aria-labelledby="sec-floors">
            <h2 className="card__title" id="sec-floors">층</h2>
            <ChipListEditor
              label="층 목록 (위층 → 아래층 순서)"
              itemName="층"
              values={v.floors}
              onChange={(x) => set('floors', x)}
              placeholder="B5 또는 2F"
              error={errors.floors}
              hint="C-06 층 버튼과 층 추정(회전 램프 한 바퀴 = 한 층)이 이 순서를 써요. 쉼표로 여러 개를 한 번에 넣을 수 있어요."
              presets={[
                { label: `지하 한 층 더 (${nextBasement(v.floors)})`, apply: (c) => [...c, nextBasement(c)] },
                { label: `지상 한 층 더 (${nextAboveGround(v.floors)})`, apply: (c) => [nextAboveGround(c), ...c] },
                { label: '기본값 1F · B1–B4', apply: () => [...DEFAULT_FLOORS] },
              ]}
            />
          </section>

          <section className="card form-section" aria-labelledby="sec-zones">
            <h2 className="card__title" id="sec-zones">구역 체계</h2>
            <ChipListEditor
              label="구역"
              itemName="구역"
              values={v.zones}
              onChange={(x) => set('zones', x)}
              placeholder="A"
              error={errors.zones}
              presets={[{ label: 'A–H로 채우기', apply: () => [...DEFAULT_ZONES] }, { label: '모두 비우기', apply: () => [] }]}
            />
            <ChipListEditor
              label="기둥 번호"
              itemName="번호"
              values={v.numbers}
              onChange={(x) => set('numbers', x)}
              placeholder="13"
              error={errors.numbers}
              presets={[
                { label: '01–12로 채우기', apply: () => [...DEFAULT_NUMBERS] },
                { label: '01–20으로 채우기', apply: () => Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')) },
                { label: '모두 비우기', apply: () => [] },
              ]}
            />
            <Field label="설명" hint="C-06에 작게 보여요. 예: 기둥 색 + 알파벳 A–H · 기둥 번호 01–12">
              {({ id, describedBy }) => (
                <input id={id} className="input" value={v.zoneDescription} onChange={(e) => set('zoneDescription', e.target.value)} aria-describedby={describedBy} />
              )}
            </Field>
          </section>

          <section className="card form-section" aria-labelledby="sec-tags">
            <h2 className="card__title" id="sec-tags">운영자 태그</h2>
            <fieldset className="tag-grid">
              <legend className="visually-hidden">운영자가 직접 붙이는 이유 태그</legend>
              {REASON_TAGS.map((t) => (
                <label key={t} className={`tag-option${v.manualTags.includes(t) ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={v.manualTags.includes(t)} onChange={() => toggleTag(t)} />
                  <span className="tag-option__label">{tagLabel(t)}</span>
                  {TAG_HINTS[t] && <span className="tag-option__hint">{TAG_HINTS[t]}</span>}
                </label>
              ))}
            </fieldset>
            <p className="field__hint">기록으로 붙는 자동 태그(후진 잦음·회전 램프·자리 넉넉·층 많음)와 합쳐서 최대 3개가 나가요. 운영자 태그가 먼저예요.</p>
          </section>

          <section className="card form-section" aria-labelledby="sec-public">
            <h2 className="card__title" id="sec-public">공공정보 · 요금</h2>
            <fieldset className={`lines${errors.publicInfo ? ' has-error' : ''}`}>
              <legend className="field__label">공공정보 줄 (기록이 적을 때 C-02 · C-08에 보여요)</legend>
              {v.publicInfo.length === 0 && <p className="muted">아직 없어요</p>}
              {v.publicInfo.map((line, i) => (
                <div className="lines__row" key={i}>
                  <label className="visually-hidden" htmlFor={`pi-${i}`}>공공정보 {i + 1}번째 줄</label>
                  <input id={`pi-${i}`} className="input" value={line} placeholder="예: 기계식 아님 · 지하 6층까지"
                    onChange={(e) => set('publicInfo', v.publicInfo.map((x, j) => (j === i ? e.target.value : x)))} />
                  <button type="button" className="btn btn--ghost btn--sm" aria-label={`공공정보 ${i + 1}번째 줄 빼기`}
                    onClick={() => set('publicInfo', v.publicInfo.filter((_, j) => j !== i))}>빼기</button>
                </div>
              ))}
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => set('publicInfo', [...v.publicInfo, ''])}>줄 추가</button>
              {errors.publicInfo && <p className="field__error">{errors.publicInfo}</p>}
            </fieldset>
            <Field label="요금" hint="비워 두면 차량 앱은 '공공데이터 연동 시 표시'로 보여요">
              {({ id, describedBy }) => (
                <input id={id} className="input" value={v.feeText} onChange={(e) => set('feeText', e.target.value)} placeholder="예: 30분 1,000원 · 10분마다 300원" aria-describedby={describedBy} />
              )}
            </Field>
          </section>
        </div>

        <aside className="edit-side" aria-label="저장과 미리보기">
          <div className="card edit-side__card">
            <h2 className="card__title">차량 앱에 이렇게 나가요</h2>
            <p className="field__hint">점수·자동 태그는 서버가 기록으로 정해요. 태그는 운영자 태그 먼저, 최대 3개 (예상).</p>
            <div className="preview">
              <div className="preview__name">{v.name.trim() || '이름 없음'}</div>
              <div className="preview__score">
                <Difficulty score={lot?.difficulty ?? null} size="sm" />
                {lot && <KindBadge demo={lot.demo} />}
              </div>
              <div className="preview__tags">{tagsOut.length ? tagsOut.map(tagLabel).join(' · ') : <span className="muted">태그 없음</span>}</div>
              <div className="preview__line"><span className="muted">층</span> <span className="mono">{v.floors.join(' ') || '–'}</span></div>
              <div className="preview__line"><span className="muted">구역</span> <span className="mono">{v.zones.length ? `${v.zones[0]}–${v.zones[v.zones.length - 1]}` : '–'} · {v.numbers.length ? `${v.numbers[0]}–${v.numbers[v.numbers.length - 1]}` : '–'}</span></div>
              <div className="preview__line"><span className="muted">요금</span> {v.feeText.trim() || <span className="muted">공공데이터 연동 시 표시</span>}</div>
            </div>
            {isNew && <p className="field__hint">새 주차장은 기록이 10대 이상 쌓일 때까지 '기록 적음'으로 나가요.</p>}
            <div className="edit-side__actions">
              <button type="submit" className="btn btn--primary btn--block" disabled={saving}>
                {saving ? '저장하는 중…' : isNew ? '추가하기' : '저장'}
              </button>
              <a className="btn btn--secondary btn--block" href={lot ? adminHref(`/lots/${encodeURIComponent(lot.id)}`) : adminHref('/lots')}>취소</a>
              <p className="edit-side__state" role="status">{dirty ? '저장하지 않은 고친 내용이 있어요' : '고친 내용 없음'}</p>
              {serverError && <p className="field__error" role="alert">저장되지 않았어요: {serverError}</p>}
            </div>
          </div>
          {lot && (
            <div className="card edit-side__card">
              <h2 className="card__title">주차장 지우기</h2>
              <p className="field__hint">기록과 별점도 같이 지워져요.</p>
              <DeleteLot lot={lot} />
            </div>
          )}
        </aside>
      </form>
    </div>
  )
}
