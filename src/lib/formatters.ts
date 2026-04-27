// 원화 포맷
export function formatKRW(amount: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(amount)
}

// 숫자 포맷 (원 기호 없이)
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('ko-KR').format(num)
}

// 날짜 포맷
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

// 날짜+시간 포맷
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

// 마진율 계산
export function calcMarginRate(sellingPrice: number, purchasePrice: number): number {
  if (sellingPrice === 0) return 0
  return ((sellingPrice - purchasePrice) / sellingPrice) * 100
}

// 마진율 포맷
export function formatPercent(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '0.0%'
  return `${value.toFixed(1)}%`
}

// 거래 타입 한글명
export function getTransactionTypeName(type: string): string {
  const map: Record<string, string> = {
    SALE: '매출',
    EXPENSE: '비용',
    PURCHASE: '매입',
  }
  return map[type] || type
}

// 결제 방법 한글명
export function getPaymentMethodName(method: string): string {
  const map: Record<string, string> = {
    CASH: '현금',
    CARD: '카드',
    TRANSFER: '계좌이체',
    CREDIT: '외상',
  }
  return map[method] || method
}

// 결제 상태 한글명
export function getPaymentStatusName(status: string): string {
  const map: Record<string, string> = {
    PAID: '완납',
    PARTIAL: '일부결제',
    UNPAID: '미결제',
  }
  return map[status] || status
}

// 채널 한글명
export function getChannelName(channel: string): string {
  const map: Record<string, string> = {
    B2B: 'B2B',
    B2C_OFFLINE: 'B2C 오프라인',
    B2C_ONLINE: 'B2C 온라인',
  }
  return map[channel] || channel
}

// 제품 카테고리 한글명
export function getCategoryName(category: string): string {
  const map: Record<string, string> = {
    SOFA_FABRIC: '소파원단',
    CURTAIN_FABRIC: '커튼원단',
    WALL_FABRIC: '벽원단',
    CURTAIN: '커튼(완제품)',
    SOFA: '소파(완제품)',
    OTHER: '기타',
  }
  return map[category] || category
}

// 단위 한글명
export function getUnitName(unit: string): string {
  const map: Record<string, string> = {
    METER: '미터',
    YARD: '야드',
    PIECE: '개',
    ROLL: '롤',
  }
  return map[unit] || unit
}

// 미수금 상태 한글명
export function getARStatusName(status: string): string {
  const map: Record<string, string> = {
    OUTSTANDING: '미수',
    PARTIAL: '일부회수',
    PAID: '회수완료',
    OVERDUE: '연체',
  }
  return map[status] || status
}
