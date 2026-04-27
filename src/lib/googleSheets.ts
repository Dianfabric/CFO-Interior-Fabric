// Google Sheets 2025 TMS 시트 구조:
// A열: 코드, B열: 브랜드, C열: 제품명, D열: 원단단가, E열: 소재, F열: 폭
// G열: 무게, H열: 원가(USD), I~M열: 가격정보, N열: 브랜드
export interface FabricPrice {
  name: string        // C열: 제품명
  price: number       // D열: 원단단가
  material: string    // E열: 소재
  width: string       // F열: 폭
  altName: string     // A열: 코드 (보조 검색용)
  brand: string       // N열: 브랜드
  dealerPrice: number // H열: 원가(USD)
}

let cachedPrices: FabricPrice[] | null = null
let cacheTime = 0
const CACHE_TTL = 10 * 60 * 1000

export function clearFabricCache() {
  cachedPrices = null
  cacheTime = 0
}

let cachedRate: number | null = null
let rateCacheTime = 0
const RATE_TTL = 60 * 60 * 1000 // 1시간 캐시

export async function getUSDtoKRW(): Promise<number> {
  const now = Date.now()
  if (cachedRate && now - rateCacheTime < RATE_TTL) return cachedRate

  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=KRW')
    const data = await res.json()
    const rate = data?.rates?.KRW
    if (rate && typeof rate === 'number') {
      cachedRate = rate
      rateCacheTime = now
      return rate
    }
  } catch {
    // 조회 실패 시 기본값 사용
  }

  return cachedRate ?? 1380 // fallback
}

export async function getFabricPrices(sheetName = '2025 TMS'): Promise<FabricPrice[]> {
  const now = Date.now()
  if (cachedPrices && now - cacheTime < CACHE_TTL) return cachedPrices

  const apiKey = process.env.GOOGLE_API_KEY
  const sheetId = process.env.SHEET_ID
  if (!apiKey || !sheetId) throw new Error('Google Sheets 환경변수가 설정되지 않았습니다')

  const range = encodeURIComponent(`${sheetName}!A:N`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`

  const res = await fetch(url)
  const data = await res.json()
  if (data.error) throw new Error(`Google Sheets 오류: ${data.error.message}`)

  const rows: string[][] = (data.values ?? []).slice(1) // 헤더 제외

  cachedPrices = rows
    .filter(r => r[2]?.trim()) // C열(제품명) 기준 필터
    .map(r => ({
      name: r[2]?.trim() ?? '',       // C열: 제품명
      price: parseSheetNum(r[3]),     // D열: 원단단가
      material: r[4]?.trim() ?? '',   // E열: 소재
      width: r[5]?.trim() ?? '',      // F열: 폭
      altName: r[0]?.trim() ?? '',    // A열: 코드 (보조 검색용)
      brand: r[13]?.trim() ?? '',     // N열: 브랜드
      dealerPrice: parseSheetNum(r[7]), // H열: 원가(USD)
    }))

  cacheTime = now
  return cachedPrices
}

// 경영박사 품명으로 딜러가격(원가) 찾기
// Dian-fabric-search와 동일한 매칭 로직:
// 1) 완전일치 (name 또는 altName)
// 2) 컬러번호 제거 후 재시도 ("BOHO-28" → "BOHO")
// 3) 부분일치 (includes)
export function findFabric(fabricName: string, prices: FabricPrice[]): FabricPrice | null {
  if (!fabricName || prices.length === 0) return null

  // ⓪ [BN##] 패턴 범위 매칭
  const bnMatch = fabricName.match(/\[BN(\d+)\]/i)
  if (bnMatch) {
    const bnNum = parseInt(bnMatch[1], 10)
    const rangeEntry = prices.find(p => {
      const m = p.name.match(/(\d+)~(\d+)/)
      if (!m) return false
      return bnNum >= parseInt(m[1], 10) && bnNum <= parseInt(m[2], 10) && p.dealerPrice > 0
    })
    if (rangeEntry) return rangeEntry
  }

  const bracketMatch = fabricName.match(/\[([A-Z0-9\s\-]+)\]/i)
  const keywords = bracketMatch
    ? [bracketMatch[1].trim(), fabricName.replace(/\[.*?\]/g, '').trim()]
    : [fabricName.trim()]

  for (const keyword of keywords) {
    if (!keyword) continue
    const baseKeyword = keyword.replace(/-\w+$/, '').trim()

    const exact = prices.find(p =>
      p.name.toUpperCase() === keyword.toUpperCase() ||
      p.altName.toUpperCase() === keyword.toUpperCase()
    )
    if (exact?.dealerPrice) return exact

    if (baseKeyword !== keyword) {
      const baseExact = prices.find(p =>
        p.name.toUpperCase() === baseKeyword.toUpperCase() ||
        p.altName.toUpperCase() === baseKeyword.toUpperCase()
      )
      if (baseExact?.dealerPrice) return baseExact
    }

    // 부분일치 — dealerPrice 있는 항목 우선
    const partials = prices.filter(p =>
      p.name.toUpperCase().includes(keyword.toUpperCase()) ||
      keyword.toUpperCase().includes(p.name.toUpperCase()) ||
      (p.altName && (
        p.altName.toUpperCase().includes(keyword.toUpperCase()) ||
        keyword.toUpperCase().includes(p.altName.toUpperCase())
      ))
    )
    const partial = partials.find(p => p.dealerPrice > 0) ?? partials[0]
    if (partial?.dealerPrice) return partial

    if (baseKeyword !== keyword) {
      const basePartials = prices.filter(p =>
        p.name.toUpperCase().includes(baseKeyword.toUpperCase()) ||
        (p.altName && p.altName.toUpperCase().includes(baseKeyword.toUpperCase()))
      )
      const basePartial = basePartials.find(p => p.dealerPrice > 0) ?? basePartials[0]
      if (basePartial?.dealerPrice) return basePartial
    }
  }

  return null
}

export function findFabricCost(fabricName: string, prices: FabricPrice[]): number {
  if (!fabricName || prices.length === 0) return 0

  // ⓪ [BN##] 패턴: "바론[BARON] [BN01]" → 01 → "BARON 01~04" 범위 매칭
  const bnMatch = fabricName.match(/\[BN(\d+)\]/i)
  if (bnMatch) {
    const bnNum = parseInt(bnMatch[1], 10)
    const rangeEntry = prices.find(p => {
      const m = p.name.match(/(\d+)~(\d+)/)
      if (!m) return false
      return bnNum >= parseInt(m[1], 10) && bnNum <= parseInt(m[2], 10) && p.dealerPrice > 0
    })
    if (rangeEntry) return rangeEntry.dealerPrice
  }

  // 경영박사 품명 전처리: "날리 [NELLY]" → keyword 추출
  const bracketMatch = fabricName.match(/\[([A-Z0-9\s\-]+)\]/i)
  const keywords = bracketMatch
    ? [bracketMatch[1].trim(), fabricName.replace(/\[.*?\]/g, '').trim()]
    : [fabricName.trim()]

  for (const keyword of keywords) {
    if (!keyword) continue

    // ① 완전일치
    const exact = prices.find(p =>
      p.name.toUpperCase() === keyword.toUpperCase() ||
      p.altName.toUpperCase() === keyword.toUpperCase()
    )
    if (exact?.dealerPrice) return exact.dealerPrice

    // ② 컬러번호 제거 후 완전일치 ("BOHO-28" → "BOHO")
    const baseKeyword = keyword.replace(/-\w+$/, '').trim()
    if (baseKeyword !== keyword) {
      const baseExact = prices.find(p =>
        p.name.toUpperCase() === baseKeyword.toUpperCase() ||
        p.altName.toUpperCase() === baseKeyword.toUpperCase()
      )
      if (baseExact?.dealerPrice) return baseExact.dealerPrice
    }

    // ③ 부분일치 — dealerPrice 있는 항목 우선 (첫 번째 매칭이 가격 없을 때 놓치는 버그 수정)
    const partials = prices.filter(p =>
      p.name.toUpperCase().includes(keyword.toUpperCase()) ||
      keyword.toUpperCase().includes(p.name.toUpperCase()) ||
      (p.altName && (
        p.altName.toUpperCase().includes(keyword.toUpperCase()) ||
        keyword.toUpperCase().includes(p.altName.toUpperCase())
      ))
    )
    const partial = partials.find(p => p.dealerPrice > 0) ?? partials[0]
    if (partial?.dealerPrice) return partial.dealerPrice

    // ④ 베이스 키워드 부분일치
    if (baseKeyword !== keyword) {
      const basePartials = prices.filter(p =>
        p.name.toUpperCase().includes(baseKeyword.toUpperCase()) ||
        (p.altName && p.altName.toUpperCase().includes(baseKeyword.toUpperCase()))
      )
      const basePartial = basePartials.find(p => p.dealerPrice > 0) ?? basePartials[0]
      if (basePartial?.dealerPrice) return basePartial.dealerPrice
    }
  }

  return 0
}

function parseSheetNum(val: string | undefined): number {
  if (!val) return 0
  const n = parseFloat(val.replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}
