'use client'

export type DisplayUnit = 'YARD' | 'METER' | 'HEBE'
export type OptionMode  = 'PERCENT' | 'AMOUNT'

export interface PriceInfoRow {
  productName: string
  spec?: string
  yardPrice: number
  width?: number          // 폭 cm — 헤베 환산용
  discount?: number       // 특별할인 차감액 (표시 단위 기준, 항상 원)
  dealerDiscount?: number  // 대리점 할인 (optionMode 에 따라 % 또는 원)
  rollDiscount?: number    // 롤 할인
  bulk1Discount?: number   // 대량단가1 할인
  bulk2Discount?: number   // 대량단가2 할인
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
  effectiveDate,
}: Props) {
  const showHebe = unit === 'HEBE'
  const hasDiscountRow = showDiscount && rows.some(r => (r.discount ?? 0) > 0)

  let colCount = 4 // 품명 + 규격 + 단위 + 단가
  if (showHebe)     colCount++
  if (showDiscount) colCount++
  if (showDealer)   colCount++
  if (showRoll)     colCount++
  if (showBulk1)    colCount++
  if (showBulk2)    colCount++

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={th}>품　명</th>
            <th style={{ ...th, width: 72 }}>규　격</th>
            {showHebe && <th style={{ ...th, width: 56, textAlign: 'center' }}>폭(cm)</th>}
            <th style={{ ...th, width: 64, textAlign: 'center' }}>단위</th>
            <th style={{ ...th, width: 96, textAlign: 'right' }}>단　가</th>
            {showDiscount && (
              <th style={{ ...th, width: 96, textAlign: 'right', color: '#1a5fa0' }}>특별할인가</th>
            )}
            {showDealer && (
              <th style={{ ...th, width: 96, textAlign: 'right', color: '#7c3aed' }}>대리점단가</th>
            )}
            {showRoll && (
              <th style={{ ...th, width: 96, textAlign: 'right', color: '#b45309' }}>롤단가</th>
            )}
            {showBulk1 && (
              <th style={{ ...th, width: 96, textAlign: 'right', color: '#0f766e' }}>대량단가1</th>
            )}
            {showBulk2 && (
              <th style={{ ...th, width: 96, textAlign: 'right', color: '#0d7490' }}>대량단가2</th>
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

            return (
              <tr key={i}>
                <td style={td}>{r.productName}</td>
                <td style={{ ...td, color: '#666', fontSize: 11 }}>{r.spec || '－'}</td>
                {showHebe && (
                  <td style={{ ...td, textAlign: 'center', color: '#666' }}>{r.width ?? 110}</td>
                )}
                <td style={{ ...td, textAlign: 'center', color: '#666' }}>{unitLabel(unit)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{krw(mainPrice)}</td>
                {showDiscount && (
                  <td style={{ ...td, textAlign: 'right',
                    fontWeight: specialFinal !== null ? 700 : 400,
                    color:      specialFinal !== null ? '#1a5fa0' : '#bbb' }}>
                    {specialFinal !== null ? krw(specialFinal) : '－'}
                  </td>
                )}
                {showDealer && (
                  <td style={{ ...td, textAlign: 'right',
                    fontWeight: dealerFinal !== null ? 700 : 400,
                    color:      dealerFinal !== null ? '#7c3aed' : '#bbb' }}>
                    {dealerFinal !== null ? krw(dealerFinal) : '－'}
                  </td>
                )}
                {showRoll && (
                  <td style={{ ...td, textAlign: 'right',
                    fontWeight: rollFinal !== null ? 700 : 400,
                    color:      rollFinal !== null ? '#b45309' : '#bbb' }}>
                    {rollFinal !== null ? krw(rollFinal) : '－'}
                  </td>
                )}
                {showBulk1 && (
                  <td style={{ ...td, textAlign: 'right',
                    fontWeight: bulk1Final !== null ? 700 : 400,
                    color:      bulk1Final !== null ? '#0f766e' : '#bbb' }}>
                    {bulk1Final !== null ? krw(bulk1Final) : '－'}
                  </td>
                )}
                {showBulk2 && (
                  <td style={{ ...td, textAlign: 'right',
                    fontWeight: bulk2Final !== null ? 700 : 400,
                    color:      bulk2Final !== null ? '#0d7490' : '#bbb' }}>
                    {bulk2Final !== null ? krw(bulk2Final) : '－'}
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
        <div>※ 위 단가는 원자재 가격, 환율 등 시장 상황에 따라 추후 변동될 수 있습니다.</div>
      </div>

      {/* 대량단가 기준 안내 */}
      {(showBulk1 || showBulk2) && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#0f766e',
          borderLeft: '3px solid #0f766e', paddingLeft: 10, lineHeight: 1.9 }}>
          {showBulk1 && <div>※ 대량단가1 : 500Y 이상 ~ 1,000Y 미만 주문 기준 적용 단가입니다.</div>}
          {showBulk2 && <div>※ 대량단가2 : 1,000Y 이상 주문 기준 적용 단가입니다.</div>}
        </div>
      )}

      {/* 특별할인 안내 */}
      {hasDiscountRow && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#1a5fa0',
          borderLeft: '3px solid #1a5fa0', paddingLeft: 10, lineHeight: 1.7 }}>
          ※ 특별할인 금액은 선입금, 대량 주문 등의 조건에 따라 별도 적용되는 할인 금액으로, 해당 거래처에 한하여 적용됩니다.
        </div>
      )}
    </>
  )
}
