import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function todayPrefix() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

async function nextDocumentNumber(): Promise<string> {
  const prefix = todayPrefix()
  const last = await prisma.officialDocument.findFirst({
    where: { documentNumber: { startsWith: prefix } },
    orderBy: { documentNumber: 'desc' },
  })
  let seq = 1
  if (last) {
    const tail = last.documentNumber.slice(prefix.length)
    const n = parseInt(tail, 10)
    if (!isNaN(n)) seq = n + 1
  }
  return `${prefix}${String(seq).padStart(2, '0')}`
}

// GET - 공문 목록
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (type) where.type = type
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { recipientName: { contains: search } },
        { documentNumber: { contains: search } },
      ]
    }

    const docs = await prisma.officialDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return NextResponse.json(docs)
  } catch (error) {
    console.error('Documents GET Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST - 공문 저장
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      type, title, recipientClientId, recipientName, ccLine, senderLine,
      bodyText, tableJson, metaJson, documentNumber: providedNumber,
      driveFileId, driveJpgId,
    } = body

    if (!type || !title || !recipientName || !senderLine) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
    }

    const documentNumber = providedNumber || (await nextDocumentNumber())

    const doc = await prisma.officialDocument.create({
      data: {
        documentNumber,
        type,
        title,
        recipientClientId: recipientClientId || null,
        recipientName,
        ccLine: ccLine || null,
        senderLine,
        bodyText: bodyText || '',
        tableJson: tableJson ? JSON.stringify(tableJson) : null,
        metaJson: metaJson ? JSON.stringify(metaJson) : null,
        driveFileId: driveFileId || null,
        driveJpgId: driveJpgId || null,
      },
    })
    return NextResponse.json(doc, { status: 201 })
  } catch (error) {
    console.error('Documents POST Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
