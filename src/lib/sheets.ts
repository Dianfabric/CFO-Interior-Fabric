/**
 * Google Sheets 제품(원단) DB 유틸리티
 * dian-quote(https://dianfabric.github.io/dian-quote/)와 동일한 스프레드시트 사용
 *
 * Sheet: 쇼룸단가표
 * Columns: A=원단명 | B=단가(원) | C=(unused) | D=규격(폭) | E=(unused) | F=별칭
 */

const SHEET_ID  = process.env.SHEETS_ID     ?? ''
const API_KEY   = process.env.SHEETS_API_KEY ?? ''
const RANGE     = encodeURIComponent('쇼룸단가표!A2:F')
const SHEET_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${RANGE}?key=${API_KEY}`

export interface SheetProduct {
  name: string         // 원단명 (column A)
  sellingPrice: number // 단가(원) (column B)
  spec?: string        // 규격(폭) (column D) — e.g. "1400mm"
  alias?: string       // 별칭 (column F)
}

/** 쇼룸단가표 전체 조회 */
export async function listSheetProducts(): Promise<SheetProduct[]> {
  if (!SHEET_ID || !API_KEY) {
    console.warn('Google Sheets credentials not set (SHEETS_ID / SHEETS_API_KEY)')
    return []
  }

  const res = await fetch(SHEET_URL, { cache: 'no-store' })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Google Sheets API ${res.status}: ${txt}`)
  }

  const data = await res.json() as { values?: string[][] }
  const rows = data.values ?? []

  return rows
    .filter(r => r[0]?.trim())                        // 원단명 없는 행 제외
    .map(r => ({
      name: r[0].trim(),
      sellingPrice: r[1] ? parseInt(r[1].replace(/,/g, ''), 10) || 0 : 0,
      spec:  r[3]?.trim() ? (r[3].trim().endsWith('mm') ? r[3].trim() : r[3].trim() + 'mm') : undefined,
      alias: r[5]?.trim() || undefined,
    }))
}

/** 쇼룸단가표 이름→SheetProduct 맵 */
export async function buildSheetProductMap(): Promise<Map<string, SheetProduct>> {
  const products = await listSheetProducts()
  return new Map(products.map(p => [p.name.toUpperCase(), p]))
}
