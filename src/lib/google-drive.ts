/**
 * Google Drive REST API 유틸리티 (클라이언트 사이드)
 * GIS(Google Identity Services)에서 받은 access_token을 사용합니다.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

/**
 * 주어진 이름의 폴더를 parentId 하위에서 찾고,
 * 없으면 새로 만든 후 폴더 ID를 반환합니다.
 */
export async function getOrCreateFolder(
  name: string,
  parentId: string,
  token: string,
): Promise<string> {
  // 검색
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const searchRes = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!searchRes.ok) throw new Error(`Drive search failed: ${searchRes.status}`)
  const searchData = await searchRes.json()
  if (searchData.files?.length > 0) return searchData.files[0].id as string

  // 생성
  const createRes = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  })
  if (!createRes.ok) throw new Error(`Drive folder create failed: ${createRes.status}`)
  const folder = await createRes.json()
  return folder.id as string
}

/**
 * Blob을 Drive에 멀티파트 업로드합니다.
 * 업로드된 파일의 ID를 반환합니다.
 */
export async function uploadToDrive(
  blob: Blob,
  filename: string,
  mimeType: string,
  parentId: string,
  token: string,
): Promise<string> {
  const metadata = JSON.stringify({ name: filename, parents: [parentId] })

  const form = new FormData()
  form.append('metadata', new Blob([metadata], { type: 'application/json' }))
  form.append('file', blob, filename)

  const res = await fetch(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  )
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Drive upload failed (${res.status}): ${txt}`)
  }
  const json = await res.json()
  return json.id as string
}
