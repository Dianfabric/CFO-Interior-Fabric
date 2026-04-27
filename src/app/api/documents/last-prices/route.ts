import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 특정 거래처의 각 제품별 가장 최근 거래 단가를 가져온다
// query: ?clientId=...&productIds=id1,id2,id3
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const productIdsParam = searchParams.get('productIds') || ''
    const productIds = productIdsParam.split(',').map(s => s.trim()).filter(Boolean)

    if (!clientId || productIds.length === 0) {
      return NextResponse.json({})
    }

    // 각 제품별 가장 최근 SALE 거래의 단가 추출
    const result: Record<string, { unitPrice: number; date: string } | null> = {}
    for (const pid of productIds) {
      const last = await prisma.transactionItem.findFirst({
        where: {
          productId: pid,
          transaction: {
            clientId,
            type: 'SALE',
          },
        },
        orderBy: { transaction: { date: 'desc' } },
        include: { transaction: { select: { date: true } } },
      })
      result[pid] = last
        ? { unitPrice: last.unitPrice, date: last.transaction.date.toISOString() }
        : null
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('last-prices Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
