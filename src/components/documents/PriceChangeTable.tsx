'use client'

export interface PriceRow {
  productName: string
  itemCode?: string   // 원단 번호 (선택)
  oldPrice: number
  newPrice: number
  unit?: string
  note?: string
  discount?: number   // 특별할인 금액 (양수 → 최종가에서 차감)
  vipOldPrice?: number  // VIP 거래처 기존 단가
  vipNewPrice?: number  // VIP 거래처 인상 단가
}

interface Props {
  rows: PriceRow[]
  direction: 'UP' | 'DOWN'
  effectiveDate?: string // YYYY-MM-DD
  vipName?: string       // VIP 거래처 이름 (헤더 부기 표시)
  recipientName?: string // 수신 거래처 — 특별할인 안내문 "○○님" 표시
}

export default function PriceChangeTable({ rows, direction, effectiveDate, vipName, recipientName }: Props) {
  const cleanRecipient = (recipientName || '')
    .replace(/\s*귀하\s*$/, '')
    .split(/\s*\/\s*/)[0]
    .trim()
  const isUp = direction === 'UP'
  const labelNew = isUp ? '인상 금액' : '인하 금액'
  const labelDelta = isUp ? '인상률' : '인하율'

  // 특별할인이 있는 행이 하나라도 있으면 할인 컬럼 표시
  const hasDiscount = rows.some(r => (r.discount ?? 0) > 0)
  // VIP 가격이 있는 행이 하나라도 있으면 VIP 부기 표시
  const hasVip = rows.some(r => (r.vipOldPrice ?? 0) > 0 || (r.vipNewPrice ?? 0) > 0)

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
          <th style={{ ...th, width: 110, textAlign: 'right' }}>기존 금액</th>
          <th style={{ ...th, width: 110, textAlign: 'right' }}>{labelNew}</th>
          {hasDiscount && (
            <th style={{ ...th, width: 100, textAlign: 'right', color: '#1a5fa0' }}>특별할인</th>
          )}
          {hasDiscount && (
            <th style={{ ...th, width: 100, textAlign: 'right', color: '#1a5fa0' }}>최종 단가</th>
          )}
          <th style={{ ...th, width: 86, textAlign: 'right' }}>{labelDelta}</th>
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

          const vipOld = r.vipOldPrice ?? 0
          const vipNew = r.vipNewPrice ?? 0
          const vipDelta = vipOld > 0 ? ((vipNew - vipOld) / vipOld) * 100 : 0
          const rowHasVip = vipOld > 0 || vipNew > 0

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
              <td style={{ ...td, textAlign: 'center', color: '#666' }}>{r.unit || '-'}</td>
              <td style={{ ...td, textAlign: 'right', color: '#666' }}>
                <div>{krw(r.oldPrice)}</div>
                {hasVip && vipOld > 0 && (
                  <div style={{ fontSize: 11, color: '#7a3aa0', marginTop: 2 }}>
                    ({krw(vipOld)})
                  </div>
                )}
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: isUp ? '#a01a1a' : '#0a6f3a' }}>
                <div>{krw(r.newPrice)}</div>
                {hasVip && vipNew > 0 && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#7a3aa0', marginTop: 2 }}>
                    ({krw(vipNew)})
                  </div>
                )}
              </td>
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
                <div>{delta === 0 ? '-' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}</div>
                {hasVip && vipOld > 0 && vipNew > 0 && (
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#7a3aa0', marginTop: 2 }}>
                    ({vipDelta > 0 ? '+' : ''}{vipDelta.toFixed(1)}%)
                  </div>
                )}
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
        ※ 특별할인 금액은 벌크 수량 충족 후 선입금 등의 특별 합의에 따라 별도 적용되는 할인 금액으로,{' '}
        {cleanRecipient ? <><strong>{cleanRecipient}</strong>님</> : '해당 거래처'}에 한하여 적용됩니다.
      </div>
    )}

    {/* VIP 가격 안내 — VIP 적용 행이 있을 때만 표시 */}
    {hasVip && (
      <div style={{
        marginTop: 8,
        fontSize: 12,
        color: '#7a3aa0',
        borderLeft: '3px solid #7a3aa0',
        paddingLeft: 10,
        lineHeight: 1.7,
      }}>
        ※ 괄호 안의 단가는 {vipName ? <><strong>{vipName}</strong>님</> : '귀사'}에 한하여 적용되는 특별 단가입니다.
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
