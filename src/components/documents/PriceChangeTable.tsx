'use client'

export interface PriceRow {
  productName: string
  oldPrice: number
  newPrice: number
  unit?: string
  note?: string
  discount?: number   // 특별할인 금액 (양수 → 최종가에서 차감)
}

interface Props {
  rows: PriceRow[]
  direction: 'UP' | 'DOWN'
  effectiveDate?: string // YYYY-MM-DD
}

export default function PriceChangeTable({ rows, direction, effectiveDate }: Props) {
  const isUp = direction === 'UP'
  const labelNew = isUp ? '인상 가격' : '인하 가격'
  const labelDelta = isUp ? '인상률' : '인하율'

  // 특별할인이 있는 행이 하나라도 있으면 할인 컬럼 표시
  const hasDiscount = rows.some(r => (r.discount ?? 0) > 0)

  return (
    <>
    <table style={{
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 12,
    }}>
      <thead>
        <tr>
          <th style={th}>품　명</th>
          <th style={{ ...th, width: 70 }}>단위</th>
          <th style={{ ...th, width: 100, textAlign: 'right' }}>기존 가격</th>
          <th style={{ ...th, width: 100, textAlign: 'right' }}>{labelNew}</th>
          {hasDiscount && (
            <th style={{ ...th, width: 100, textAlign: 'right', color: '#1a5fa0' }}>특별할인</th>
          )}
          {hasDiscount && (
            <th style={{ ...th, width: 100, textAlign: 'right', color: '#1a5fa0' }}>최종 단가</th>
          )}
          <th style={{ ...th, width: 76, textAlign: 'right' }}>{labelDelta}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={hasDiscount ? 7 : 5} style={{ ...td, textAlign: 'center', color: '#aaa', padding: 24 }}>품목을 추가해 주세요</td>
          </tr>
        ) : rows.map((r, i) => {
          const disc = r.discount ?? 0
          const finalPrice = r.newPrice - disc
          const delta = r.oldPrice > 0 ? ((finalPrice - r.oldPrice) / r.oldPrice) * 100 : 0
          return (
            <tr key={i}>
              <td style={td}>{r.productName}</td>
              <td style={{ ...td, textAlign: 'center', color: '#666' }}>{r.unit || '-'}</td>
              <td style={{ ...td, textAlign: 'right', color: '#666' }}>{krw(r.oldPrice)}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: isUp ? '#a01a1a' : '#0a6f3a' }}>{krw(r.newPrice)}</td>
              {hasDiscount && (
                <td style={{ ...td, textAlign: 'right', color: disc > 0 ? '#1a5fa0' : '#bbb', fontWeight: disc > 0 ? 600 : 400 }}>
                  {disc > 0 ? `−${krw(disc)}` : '－'}
                </td>
              )}
              {hasDiscount && (
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#1a5fa0' }}>
                  {krw(finalPrice)}
                </td>
              )}
              <td style={{ ...td, textAlign: 'right', color: isUp ? '#a01a1a' : '#0a6f3a', fontWeight: 600 }}>
                {delta === 0 ? '-' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>

    {/* 적용 시점 — 표 하단 주석 */}
    {effectiveDate && (
      <div style={{
        marginTop: 12,
        fontSize: 12,
        color: '#444',
        borderLeft: '3px solid #888',
        paddingLeft: 10,
        lineHeight: 1.7,
      }}>
        ※ 위 단가는 <strong>{formatKoreanDate(effectiveDate)}</strong>부터 적용됩니다.
      </div>
    )}

    {/* 특별할인 안내 — 할인 적용 행이 있을 때만 표시 */}
    {hasDiscount && (
      <div style={{
        marginTop: 8,
        fontSize: 12,
        color: '#1a5fa0',
        borderLeft: '3px solid #1a5fa0',
        paddingLeft: 10,
        lineHeight: 1.7,
      }}>
        ※ 특별할인 금액은 선입금, 대량 주문 등의 조건에 따라 별도 적용되는 할인 금액으로, 해당 거래처에 한하여 적용됩니다.
      </div>
    )}
  </>
  )
}

function formatKoreanDate(dateStr: string): string {
  // "YYYY-MM-DD" → "YYYY년 MM월 DD일"
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  return `${y}년 ${m}월 ${d}일`
}

const th: React.CSSProperties = {
  borderTop: '1.5px solid #111',
  borderBottom: '1px solid #111',
  padding: '10px 8px',
  textAlign: 'left',
  fontSize: 11.5,
  fontWeight: 700,
  color: '#222',
  letterSpacing: 1,
  background: '#fafafa',
}

const td: React.CSSProperties = {
  padding: '10px 8px',
  borderBottom: '1px solid #eee',
  fontSize: 12.5,
  color: '#222',
}

function krw(n: number) {
  return new Intl.NumberFormat('ko-KR').format(Math.round(n)) + '원'
}
