import { NextRequest, NextResponse } from 'next/server'
import { getClient, updateClient, deleteClient } from '@/lib/airtable'
import { prisma } from '@/lib/prisma'

// GET - 거래처 상세 + SQLite 거래 통계
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const client = await getClient(id)
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // SQLite 거래 통계 (clientId = Airtable record ID)
    const [totalSales, totalAR] = await Promise.all([
      prisma.transaction.aggregate({
        where: { clientId: id, type: 'SALE' },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.accountsReceivable.aggregate({
        where: { clientId: id, status: { in: ['OUTSTANDING', 'PARTIAL', 'OVERDUE'] } },
        _sum: { remainingAmount: true },
      }),
    ])

    return NextResponse.json({
      ...client,
      stats: {
        totalSales: totalSales._sum.totalAmount ?? 0,
        salesCount: totalSales._count ?? 0,
        totalReceivable: totalAR._sum.remainingAmount ?? 0,
      },
    })
  } catch (error) {
    console.error('Client GET Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// PUT - 거래처 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const body = await request.json()
    const client = await updateClient(id, body)
    return NextResponse.json(client)
  } catch (error) {
    console.error('Client PUT Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// DELETE - 거래처 삭제
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    await deleteClient(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Client DELETE Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
