'use client'

export type DisplayUnit = 'YARD' | 'METER' | 'HEBE'
export type OptionMode  = 'PERCENT' | 'AMOUNT'

export interface PriceInfoRow {
  productName: string
  itemCode?: string        // 원단 번호 (선택)
  spec?: string
  yardPrice: number
  width?: number          // 폭 cm — 헤베 환산용
  discount?: number       // 특별할인 차감액 (표시 단위 기준, 항상 원)
  dealerDiscount?: number  // 대리점 할인 (optionMode 에 따라 % 또는 원)
  rollDiscount?: number    // 롤 할인
  bulk1Discount?: number   // 벌크1 할인
  bulk2Discount?: number   // 벌크2 할인
  leadTimeDays?: number    // 리드타임(일) — 품목별
}

interface Props {
  rows: PriceInfoRow[]
  unit: DisplayUnit
  optionMode: OptionMode
  showDiscount: boolean
  showDealer: boolean
  showRoll: boolean
  showBulk1: boolean
  showBulk2: boolean
  effectiveDate?: string
  /** 발행일자 — Lead time 도착 예정일 계산 기준 (없으면 오늘) */
  issueDate?: string
  /** 비고 — 표 하단 자유 작성 영역 */
  note?: string
  /** 수신 거래처 이름 — 특별할인 안내문에 "○○○님" 으로 표시 */
  recipientName?: string
}

// 야드 기준가 → 표시 단위 가격
function convertPrice(yardPrice: number, unit: DisplayUnit, widthCm?: number): number {
  if (unit === 'YARD')  return yardPrice
  if (unit === 'METER') return Math.round(yardPrice / 0.9144)
  return Math.round(yardPrice / (0.9144 * (widthCm ?? 110) / 100))
}

// 기준가에서 할인 적용 → 최종가 (없으면 null)
function applyDiscount(base: number, disc: number | undefined, mode: OptionMode): number | null {
  if (!disc || disc <= 0) return null
  if (mode === 'PERCENT') return Math.max(0, Math.round(base * (1 - disc / 100)))
  return Math.max(0, base - disc)
}

function unitLabel(unit: DisplayUnit): string {
  if (unit === 'YARD')  return '야드'
  if (unit === 'METER') return '미터'
  return '헤베(㎡)'
}

// 기준일 + N일 후 날짜를 "YYYY. MM. DD." 형식으로 반환.
// baseDateStr 이 "YYYY-MM-DD" 형식이면 그걸 기준으로, 아니면 오늘 기준.
function addDaysFromBase(days: number, baseDateStr?: string): string {
  let d: Date
  if (baseDateStr && /^\d{4}-\d{2}-\d{2}$/.test(baseDateStr)) {
    d = new Date(baseDateStr + 'T00:00:00')
  } else {
    d = new Date()
  }
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}. ${m}. ${dd}.`
}

function formatKoreanDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  return `${y}년 ${m}월 ${d}일`
}

function krw(n: number) {
  return new Intl.NumberFormat('ko-KR').format(Math.round(n)) + '원'
}

const th: React.CSSProperties = {
  borderTop: '1.5px solid #111',
  borderBottom: '1px solid #111',
  padding: '9px 7px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: '#222',
  letterSpacing: 1,
  background: '#fafafa',
}

const td: React.CSSProperties = {
  padding: '9px 7px',
  borderBottom: '1px solid #eee',
  fontSize: 12,
  color: '#222',
}

export default function PriceInfoTable({
  rows, unit, optionMode,
  showDiscount, showDealer, showRoll, showBulk1, showBulk2,
  effectiveDate, issueDate, note, recipientName,
}: Props) {
  // "회사명 / 담당자 귀하" → 회사명만 추출
  const cleanRecipient = (recipientName || '')
    .replace(/\s*귀하\s*$/, '')
    .split(/\s*\/\s*/)[0]
    .trim()
  const hasLeadTime = rows.some((r) => (r.leadTimeDays ?? 0) > 0)
  const showHebe = unit === 'HEBE'
  const hasDiscountRow = showDiscount && rows.some(r => (r.discount ?? 0) > 0)

  let colCount = 4 // 품명 + 규격 + 단위 + 단가
  if (showHebe)     colCount++
  if (showDiscount) colCount++
  if (showDealer)   colCount++
  if (showRoll)     colCount++
  if (showBulk1)    colCount++
  if (showBulk2)    colCount++
  if (hasLeadTime)  colCount++

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={th}>품명</th>
            <th style={{ ...th, width: 72 }}>규격</th>
            {showHebe && <th style={{ ...th, width: 56, textAlign: 'center' }}>폭(cm)</th>}
            <th style={{ ...th, width: 64, textAlign: 'center' }}>단위</th>
            <th style={{ ...th, width: 96, textAlign: 'right' }}>판매가</th>
            {showDealer && (
              <th style={{ ...th, width: 96, textAlign: 'right', color: '#7c3aed' }}>대리점단가</th>
            )}
            {showRoll && (
              <th style={{ ...th, width: 96, textAlign: 'right', color: '#b45309' }}>롤단가</th>
            )}
            {showBulk1 && (
              <th style={{ ...th, width: 96, textAlign: 'right', color: '#0f766e' }}>벌크1</th>
            )}
            {showBulk2 && (
              <th style={{ ...th, width: 96, textAlign: 'right', color: '#0d7490' }}>벌크2</th>
            )}
            {showDiscount && (
              <th style={{ ...th, width: 96, textAlign: 'right', color: '#1a5fa0' }}>특별할인</th>
            )}
            {hasLeadTime && (
              <th style={{ ...th, width: 110, textAlign: 'center', color: '#444' }}>Lead time</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 24 }}>
                품목을 추가해 주세요
              </td>
            </tr>
          ) : rows.map((r, i) => {
            const mainPrice    = convertPrice(r.yardPrice, unit, r.width)
            // 특별할인: 항상 원 단위 차감
            const specialFinal = (r.discount ?? 0) > 0 ? Math.max(0, mainPrice - (r.discount ?? 0)) : null
            // 대리점/롤/벌크: optionMode 따름
            const dealerFinal  = applyDiscount(mainPrice, r.dealerDiscount, optionMode)
            const rollFinal    = applyDiscount(mainPrice, r.rollDiscount,   optionMode)
            const bulk1Final   = applyDiscount(mainPrice, r.bulk1Discount,  optionMode)
            const bulk2Final   = applyDiscount(mainPrice, r.bulk2Discount,  optionMode)
            // 할인율 계산 (단가 대비 %)
            const discountRate = (final: number | null) =>
              final !== null && mainPrice > 0
                ? Math.round(((mainPrice - final) / mainPrice) * 1000) / 10
                : null

            return (
              <tr key={i}>
                <td style={td}>
                  <span>{r.productName}</span>
                  {r.itemCode && (
                    <span style={{ fontSize: 10, color: '#888', marginLeft: 6, letterSpacing: 0.5 }}>
                      {r.itemCode}
                    </span>
                  )}
                </td>
                <td style={{ ...td, color: '#666', fontSize: 11 }}>{r.spec || '－'}</td>
                {showHebe && (
                  <td style={{ ...td, textAlign: 'center', color: '#666' }}>{r.width ?? 110}</td>
                )}
                <td style={{ ...td, textAlign: 'center', color: '#666' }}>{unitLabel(unit)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{krw(mainPrice)}</td>
                {showDealer && (
                  <td style={{ ...td, textAlign: 'right',
                    fontWeight: dealerFinal !== null ? 700 : 400,
                    color:      dealerFinal !== null ? '#7c3aed' : '#bbb' }}>
                    {dealerFinal !== null ? (
                      <>
                        <div>{krw(dealerFinal)}</div>
                        {discountRate(dealerFinal) !== null && discountRate(dealerFinal)! > 0 && (
                          <div style={{ fontSize: 10.5, fontWeight: 500, marginTop: 1, opacity: 0.85 }}>
                            (−{discountRate(dealerFinal)}%)
                          </div>
                        )}
                      </>
                    ) : '－'}
                  </td>
                )}
                {showRoll && (
                  <td style={{ ...td, textAlign: 'right',
                    fontWeight: rollFinal !== null ? 700 : 400,
                    color:      rollFinal !== null ? '#b45309' : '#bbb' }}>
                    {rollFinal !== null ? (
                      <>
                        <div>{krw(rollFinal)}</div>
                        {discountRate(rollFinal) !== null && discountRate(rollFinal)! > 0 && (
                          <div style={{ fontSize: 10.5, fontWeight: 500, marginTop: 1, opacity: 0.85 }}>
                            (−{discountRate(rollFinal)}%)
                          </div>
                        )}
                      </>
                    ) : '－'}
                  </td>
                )}
                {showBulk1 && (
                  <td style={{ ...td, textAlign: 'right',
                    fontWeight: bulk1Final !== null ? 700 : 400,
                    color:      bulk1Final !== null ? '#0f766e' : '#bbb' }}>
                    {bulk1Final !== null ? (
                      <>
                        <div>{krw(bulk1Final)}</div>
                        {discountRate(bulk1Final) !== null && discountRate(bulk1Final)! > 0 && (
                          <div style={{ fontSize: 10.5, fontWeight: 500, marginTop: 1, opacity: 0.85 }}>
                            (−{discountRate(bulk1Final)}%)
                          </div>
                        )}
                      </>
                    ) : '－'}
                  </td>
                )}
                {showBulk2 && (
                  <td style={{ ...td, textAlign: 'right',
                    fontWeight: bulk2Final !== null ? 700 : 400,
                    color:      bulk2Final !== null ? '#0d7490' : '#bbb' }}>
                    {bulk2Final !== null ? (
                      <>
                        <div>{krw(bulk2Final)}</div>
                        {discountRate(bulk2Final) !== null && discountRate(bulk2Final)! > 0 && (
                          <div style={{ fontSize: 10.5, fontWeight: 500, marginTop: 1, opacity: 0.85 }}>
                            (−{discountRate(bulk2Final)}%)
                          </div>
                        )}
                      </>
                    ) : '－'}
                  </td>
                )}
                {showDiscount && (
                  <td style={{ ...td, textAlign: 'right',
                    fontWeight: specialFinal !== null ? 700 : 400,
                    color:      specialFinal !== null ? '#1a5fa0' : '#bbb' }}>
                    {specialFinal !== null ? (
                      <>
                        <div>{krw(specialFinal)}</div>
                        {discountRate(specialFinal) !== null && discountRate(specialFinal)! > 0 && (
                          <div style={{ fontSize: 10.5, fontWeight: 500, marginTop: 1, opacity: 0.85 }}>
                            (−{discountRate(specialFinal)}%)
                          </div>
                        )}
                      </>
                    ) : '－'}
                  </td>
                )}
                {hasLeadTime && (
                  <td style={{ ...td, textAlign: 'center', color: (r.leadTimeDays ?? 0) > 0 ? '#222' : '#bbb' }}>
                    {(r.leadTimeDays ?? 0) > 0 ? (
                      <>
                        <div style={{ fontWeight: 600 }}>{r.leadTimeDays}day</div>
                        <div style={{ fontSize: 10.5, color: '#666', marginTop: 1 }}>
                          ({addDaysFromBase(r.leadTimeDays!, issueDate)})
                        </div>
                      </>
                    ) : '－'}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* 기준일 + 변동 가능성 안내 — 하나의 바로 묶음 */}
      <div style={{ marginTop: 12, fontSize: 12, color: '#444',
        borderLeft: '3px solid #888', paddingLeft: 10, lineHeight: 1.9 }}>
        {effectiveDate && (
          <div>※ 위 단가는 <strong>{formatKoreanDate(effectiveDate)}</strong> 기준입니다.</div>
        )}
        {hasLeadTime && (
          <div>※ Lead time : 발주 후 납품까지 소요일 (괄호 안 날짜는 발행일 기준 도착 예정일)</div>
        )}
        <div>※ 위 단가는 원자재 가격, 환율 등 시장 상황에 따라 추후 변동될 수 있습니다.</div>
      </div>

      {/* 벌크 단가 기준 안내 */}
      {(showBulk1 || showBulk2) && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#0f766e',
          borderLeft: '3px solid #0f766e', paddingLeft: 10, lineHeight: 1.9 }}>
          {showBulk1 && <div>※ 벌크1 : 500Y 이상 ~ 1,000Y 미만 주문 기준 적용 단가입니다.</div>}
          {showBulk2 && <div>※ 벌크2 : 1,000Y 이상 주문 기준 적용 단가입니다.</div>}
        </div>
      )}

      {/* 특별할인 안내 */}
      {hasDiscountRow && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#1a5fa0',
          borderLeft: '3px solid #1a5fa0', paddingLeft: 10, lineHeight: 1.7 }}>
          ※ 특별할인 금액은 선입금, 대량 주문 등의 조건에 따라 별도 적용되는 할인 금액으로,{' '}
          {cleanRecipient ? <><strong>{cleanRecipient}</strong>님</> : '해당 거래처'}에 한하여 적용됩니다.
        </div>
      )}

      {/* 비고 — 자유 작성 */}
      {!!note?.trim() && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#222',
          border: '1px solid #ddd', borderRadius: 4, padding: '8px 10px',
          background: '#fafafa', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11.5, letterSpacing: 1, color: '#444' }}>
            비　고
          </div>
          {note}
        </div>
      )}
    </>
  )
}
