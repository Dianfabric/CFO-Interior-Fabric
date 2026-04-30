import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET — 단일 공문 전체 데이터 (수정 생성 시 폼 채우기용)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const doc = await prisma.officialDocument.findUnique({ where: { id } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(doc)
  } catch (error) {
    console.error('Document GET Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// PATCH — Drive 파일 ID 등 부분 업데이트
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = await request.json()
    const { driveFileId, driveJpgId } = body as {
      driveFileId?: string | null
      driveJpgId?: string | null
    }

    const doc = await prisma.officialDocument.update({
      where: { id },
      data: {
        ...(driveFileId !== undefined && { driveFileId }),
        ...(driveJpgId !== undefined && { driveJpgId }),
      },
    })
    return NextResponse.json(doc)
  } catch (error) {
    console.error('Document PATCH Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
