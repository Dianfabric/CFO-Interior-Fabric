import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
