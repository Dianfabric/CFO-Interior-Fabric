/**
 * Airtable 거래처 DB 유틸리티
 * dian-quote(https://dianfabric.github.io/dian-quote/)와 동일한 Base/Table 사용
 *
 * Fields: 거래처 이름 | 전화번호 | E-mail | 직군
 */

const TOKEN = process.env.AIRTABLE_API_TOKEN ?? ''
const BASE_ID = process.env.AIRTABLE_BASE_ID ?? ''
const TABLE_ID = process.env.AIRTABLE_CLIENTS_TABLE_ID ?? ''
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`

export interface AirtableClient {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  type?: string | null  // 직군 (다중 선택 → comma-joined)
}

function authHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  }
}

/** Airtable 레코드 → AirtableClient 정규화 */
function toClient(rec: { id: string; fields: Record<string, unknown> }): AirtableClient {
  const f = rec.fields
  const rawType = f['직군']
  return {
    id: rec.id,
    name: (f['거래처 이름'] as string) || '',
    phone: (f['전화번호'] as string) || null,
    email: (f['E-mail'] as string) || null,
    type: Array.isArray(rawType)
      ? (rawType as string[]).join(', ')
      : typeof rawType === 'string' ? rawType : null,
  }
}

/** 전체 거래처 목록 (페이지네이션 자동 처리) */
export async function listClients(): Promise<AirtableClient[]> {
  const all: AirtableClient[] = []
  let offset: string | undefined

  do {
    const url = new URL(BASE_URL)
    if (offset) url.searchParams.set('offset', offset)
    // 100개 최대 (Airtable 기본 제한)
    url.searchParams.set('pageSize', '100')

    const res = await fetch(url.toString(), { headers: authHeaders(), cache: 'no-store' })
    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Airtable listClients ${res.status}: ${txt}`)
    }
    const data = await res.json() as { records: Array<{ id: string; fields: Record<string, unknown> }>; offset?: string }
    all.push(...data.records.map(toClient))
    offset = data.offset
  } while (offset)

  // 이름 없는 레코드 제외 후 오름차순 정렬
  return all
    .filter(c => c.name.trim() !== '')
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

/** 단건 조회 */
export async function getClient(id: string): Promise<AirtableClient | null> {
  const res = await fetch(`${BASE_URL}/${id}`, { headers: authHeaders(), cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Airtable getClient ${res.status}`)
  const rec = await res.json()
  return toClient(rec)
}

/** 신규 거래처 등록 */
export async function createClient(data: { name: string; phone?: string; email?: string }): Promise<AirtableClient> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      fields: {
        '거래처 이름': data.name,
        ...(data.phone ? { '전화번호': data.phone } : {}),
        ...(data.email ? { 'E-mail': data.email } : {}),
      },
    }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Airtable createClient ${res.status}: ${txt}`)
  }
  return toClient(await res.json())
}

/** 거래처 수정 (PATCH) */
export async function updateClient(
  id: string,
  data: { name?: string; phone?: string | null; email?: string | null },
): Promise<AirtableClient> {
  const fields: Record<string, string> = {}
  if (data.name !== undefined) fields['거래처 이름'] = data.name
  if (data.phone !== undefined) fields['전화번호'] = data.phone ?? ''
  if (data.email !== undefined) fields['E-mail'] = data.email ?? ''

  const res = await fetch(`${BASE_URL}/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Airtable updateClient ${res.status}: ${txt}`)
  }
  return toClient(await res.json())
}

/**
 * clientId(Airtable record ID) → { name, phone } 맵 반환
 * 서버 라우트에서 거래/미수금에 거래처명을 붙일 때 사용
 */
export async function buildClientMap(): Promise<Map<string, { name: string; phone?: string | null }>> {
  const clients = await listClients()
  return new Map(clients.map(c => [c.id, { name: c.name, phone: c.phone }]))
}

/** 거래처 삭제 */
export async function deleteClient(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Airtable deleteClient ${res.status}`)
}
