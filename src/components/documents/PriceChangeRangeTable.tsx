'use client'

interface Props {
  min: number
  max: number
  unit: 'PERCENT' | 'AMOUNT'
  direction: 'UP' | 'DOWN'
  effectiveDate?: string
  note?: string  // 비고 — 빈 값이면 '－'로 표시
}

export default function PriceChangeRangeTable({ min, max, unit, direction, effectiveDate, note }: Props) {
  const isUp = direction === 'UP'
  const fmt = (v: number) =>
    unit === 'PERCENT'
      ? `${v}%`
      : new Intl.NumberFormat('ko-KR').format(v) + '원'
  const rangeText = `약 ${fmt(min)} ~ ${fmt(max)}`
  const labelDelta = isUp ? '인상 폭' : '인하 폭'

  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={th}>구　　분</th>
            <th style={{ ...th, textAlign: 'center', width: 220 }}>{labelDelta}</th>
            <th style={{ ...th, textAlign: 'center', width: 120 }}>비　　고</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}>전 품목</td>
            <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: 14, color: isUp ? '#a01a1a' : '#0a6f3a' }}>
              {rangeText}
            </td>
            <td style={{ ...td, textAlign: 'center', color: note?.trim() ? '#222' : '#888', whiteSpace: 'pre-wrap' }}>
              {note?.trim() || '－'}
            </td>
          </tr>
        </tbody>
      </table>

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
    </>
  )
}

function formatKoreanDate(dateStr: string): string {
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
