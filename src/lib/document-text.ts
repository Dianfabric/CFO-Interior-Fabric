/**
 * 공문을 메신저(카카오톡 등)에 붙여넣기 좋은 평문(plain-text)으로 변환합니다.
 * 발행일 옆 "복사" 버튼에서 사용.
 */

interface PriceChangeRow {
  productName: string
  unit?: string
  oldPrice: number
  newPrice: number
  discount?: number
}

interface PriceInfoRow {
  productName: string
  unit?: string
  unitPrice: number
}

type AnyRow = PriceChangeRow | PriceInfoRow

interface CommonInput {
  documentNumber?: string
  title: string
  recipientName: string
  ccLine?: string
  senderLine: string
  bodyText: string
  issueDate?: string      // YYYY-MM-DD or display string
  effectiveDate?: string  // YYYY-MM-DD
  rows?: AnyRow[]
  /** 전체 단가 변경(범위) — PRICE_CHANGE WHOLE 모드 */
  rangeMode?: {
    direction: 'UP' | 'DOWN'
    unit: 'PERCENT' | 'AMOUNT'
    min: number
    max: number
  }
  /** 발신측 추가 정보 (전화번호 등) */
  contact?: {
    phone?: string
    fax?: string
    email?: string
    website?: string
  }
}

function fmtKRW(n: number): string {
  return new Intl.NumberFormat('ko-KR').format(n) + '원'
}

function fmtDate(s?: string): string {
  if (!s) return ''
  // YYYY-MM-DD → YYYY. MM. DD.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.replace(/-/g, '. ') + '.'
  return s
}

function isPriceChangeRow(r: AnyRow): r is PriceChangeRow {
  return 'oldPrice' in r && 'newPrice' in r
}

export function buildMessengerText(input: CommonInput): string {
  const lines: string[] = []

  // 헤더
  lines.push(`[${input.title}]`)
  if (input.documentNumber) {
    lines.push(`문서번호: ${input.documentNumber}`)
  }
  if (input.issueDate) {
    lines.push(`발행일: ${fmtDate(input.issueDate)}`)
  }
  lines.push('')

  // 수신
  lines.push(`수신: ${input.recipientName}`)
  if (input.ccLine) lines.push(`참조: ${input.ccLine}`)
  lines.push('')

  // 본문
  if (input.bodyText) {
    lines.push(input.bodyText.trim())
    lines.push('')
  }

  // 표
  if (input.rangeMode) {
    const dir = input.rangeMode.direction === 'UP' ? '인상' : '인하'
    const unit = input.rangeMode.unit === 'PERCENT' ? '%' : '원'
    lines.push(`■ 전체 단가 ${dir}: ${input.rangeMode.min}${unit} ~ ${input.rangeMode.max}${unit}`)
    if (input.effectiveDate) {
      lines.push(`■ 적용일: ${fmtDate(input.effectiveDate)}`)
    }
    lines.push('')
  } else if (input.rows && input.rows.length > 0) {
    lines.push('■ 품목별 단가')
    input.rows.forEach((r) => {
      if (isPriceChangeRow(r)) {
        const diff = r.newPrice - r.oldPrice
        const pct = r.oldPrice > 0 ? Math.round((diff / r.oldPrice) * 1000) / 10 : 0
        const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '─'
        const unit = r.unit ? `(${r.unit})` : ''
        lines.push(
          `• ${r.productName}${unit}: ${fmtKRW(r.oldPrice)} → ${fmtKRW(r.newPrice)} ${arrow}${
            pct !== 0 ? Math.abs(pct) + '%' : ''
          }`,
        )
      } else {
        const unit = r.unit ? `(${r.unit})` : ''
        lines.push(`• ${r.productName}${unit}: ${fmtKRW(r.unitPrice)}`)
      }
    })
    if (input.effectiveDate) {
      lines.push('')
      lines.push(`■ 적용일: ${fmtDate(input.effectiveDate)}`)
    }
    lines.push('')
  }

  // 발신
  lines.push('───────────')
  lines.push(input.senderLine)
  if (input.contact?.phone) lines.push(`TEL ${input.contact.phone}`)
  if (input.contact?.email) lines.push(input.contact.email)
  if (input.contact?.website) lines.push(input.contact.website)

  // 끝
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 클립보드에 텍스트 복사. Promise<boolean> 반환.
 * navigator.clipboard 실패 시 textarea fallback 사용.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to fallback
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
