import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFabricPrices, findFabricCost, getUSDtoKRW } from '@/lib/googleSheets'
import { startOfDay, endOfDay } from 'date-fns'

export const runtime = 'nodejs'

const SKIP_COST_ITEMS = ['할인', '화물', '택배', '방염', '배송', '운송', '해외운송']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { startDate?: string; endDate?: string; date?: string }

    // 날짜 범위 결정 (startDate/endDate 우선, 없으면 단일 date)
    const start = body.startDate ?? body.date
    const end = body.endDate ?? body.date
    if (!start || !end) {
      return NextResponse.json({ error: 'startDate, endDate 필요' }, { status: 400 })
    }

    const rangeStart = startOfDay(new Date(start + 'T12:00:00'))
    const rangeEnd = endOfDay(new Date(end + 'T12:00:00'))

    // Google Sheets 현재 원가 + 환율 조회
    const [fabricPrices, usdRate] = await Promise.all([
      getFabricPrices(),
      getUSDtoKRW(),
    ])

    if (fabricPrices.length === 0) {
      return NextResponse.json({ error: 'Google Sheets 원가 데이터를 불러올 수 없습니다.' }, { status: 500 })
    }

    // 기간 내 SALE 거래 + 아이템 조회
    const saleTxs = await prisma.transaction.findMany({
      where: { type: 'SALE', date: { gte: rangeStart, lte: rangeEnd } },
      include: { items: true, client: { select: { id: true, name: true } } },
    })

    if (saleTxs.length === 0) {
      return NextResponse.json({ error: '해당 기간에 매출 거래가 없습니다.' }, { status: 404 })
    }

    // 기존 "원단 매입원가" PURCHASE 거래 삭제 (items는 cascade)
    const existing = await prisma.transaction.findMany({
      where: {
        type: 'PURCHASE',
        date: { gte: rangeStart, lte: rangeEnd },
        description: { startsWith: '원단 매입원가' },
      },
      select: { id: true, totalAmount: true },
    })
    const totalOldCost = existing.reduce((s, t) => s + t.totalAmount, 0)

    if (existing.length > 0) {
      const ids = existing.map(t => t.id)
      await prisma.transactionItem.deleteMany({ where: { transactionId: { in: ids } } })
      await prisma.transaction.deleteMany({ where: { id: { in: ids } } })
    }

    // 각 SALE 거래마다 원가 재계산 후 새 PURCHASE 생성
    let createdCount = 0
    let totalNewCost = 0
    const results: { date: string; client: string; items: number; totalCost: number }[] = []

    for (const saleTx of saleTxs) {
      const costItems = saleTx.items
        .filter(i => !SKIP_COST_ITEMS.some(s => (i.productName ?? '').includes(s)) && i.quantity > 0)
        .map(i => {
          const dealerPriceUSD = findFabricCost(i.productName ?? '', fabricPrices)
          const dealerPriceKRW = Math.round(dealerPriceUSD * usdRate)
          return {
            productName: i.productName ?? '',
            quantity: i.quantity,
            dealerPriceUSD,
            dealerPriceKRW,
            costAmount: Math.round(dealerPriceKRW * i.quantity),
          }
        })
        .filter(i => i.dealerPriceUSD > 0)

      if (costItems.length === 0) continue

      const totalCost = costItems.reduce((s, i) => s + i.costAmount, 0)
      totalNewCost += totalCost

      const clientName = saleTx.client?.name
        ?? (saleTx.description ?? '').replace('경영박사 매출 - ', '').replace('원단 매출 - ', '')

      await prisma.transaction.create({
        data: {
          date: saleTx.date,
          type: 'PURCHASE',
          clientId: saleTx.clientId ?? undefined,
          description: `원단 매입원가 - ${clientName}`,
          totalAmount: totalCost,
          taxAmount: 0,
          paymentMethod: 'TRANSFER',
          paymentStatus: 'PAID',
          channel: 'B2B',
          notes: `원가 재계산 (Google Sheets 기준, 환율: ${usdRate}원/USD)`,
          items: {
            create: costItems.map(i => ({
              productName: i.productName,
              quantity: i.quantity,
              unitPrice: i.dealerPriceKRW,
              amount: i.costAmount,
              notes: `USD: $${i.dealerPriceUSD} × ${usdRate}원 = ${i.dealerPriceKRW.toLocaleString()}원 × ${i.quantity}`,
            })),
          },
        },
      })

      createdCount++
      results.push({
        date: saleTx.date.toISOString().slice(0, 10),
        client: clientName,
        items: costItems.length,
        totalCost,
      })
    }

    return NextResponse.json({
      success: true,
      startDate: start,
      endDate: end,
      usdRate,
      deletedCount: existing.length,
      totalOldCost,
      recalculatedCount: createdCount,
      totalNewCost,
      results,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Recalculate cost error:', msg)
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 })
  }
}
