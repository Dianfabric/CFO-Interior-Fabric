import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const file = form.get('file') as File | null
    const kind = (form.get('kind') as string) || 'logo' // 'logo' | 'seal'

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })
    }
    if (!['logo', 'seal'].includes(kind)) {
      return NextResponse.json({ error: 'invalid kind' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const safeExt = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext) ? ext : 'png'
    const filename = `${kind}_${Date.now()}.${safeExt}`

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })
    await writeFile(path.join(uploadsDir, filename), buffer)

    const publicPath = `/uploads/${filename}`
    return NextResponse.json({ path: publicPath })
  } catch (error) {
    console.error('Upload Error:', error)
    return NextResponse.json({ error: 'upload failed' }, { status: 500 })
  }
}
