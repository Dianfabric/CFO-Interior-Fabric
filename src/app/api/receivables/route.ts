import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { differenceInDays } from 'date-fns'
import { buildClientMap } from '@/lib/airtable'

export async function GET() {
  try {
    const [receivables, clientMap] = await Promise.all([
      prisma.accountsReceivable.findMany({
        where: { status: { in: ['OUTSTANDING', 'PARTIAL', 'OVERDUE'] } },
        include: {
          transaction: { select: { date: true, channel: true } },
          payments: { orderBy: { paymentDate: 'desc' } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      buildClientMap(),
    ])

    // 거래처별 집계
    const byClient: Record<string, {
      clientId: string; clientName: string; phone: string | null;
      totalAmount: number; count: number; oldestDays: number;
      items: typeof receivables
    }> = {}

    const now = new Date()
    receivables.forEach(ar => {
      const cid = ar.clientId
      const clientInfo = clientMap.get(cid)
      if (!byClient[cid]) {
        byClient[cid] = {
          clientId: cid,
          clientName: clientInfo?.name || cid,
          phone: clientInfo?.phone || null,
          totalAmount: 0, count: 0, oldestDays: 0, items: [],
        }
      }
      byClient[cid].totalAmount += ar.remainingAmount
      byClient[cid].count += 1
      const days = differenceInDays(now, ar.createdAt)
      if (days > byClient[cid].oldestDays) byClient[cid].oldestDays = days
      byClient[cid].items.push(ar)
    })

    const summary = Object.values(byClient).sort((a, b) => b.totalAmount - a.totalAmount)
    const totalAR = summary.reduce((s, c) => s + c.totalAmount, 0)
    const overdueTotal = receivables
      .filter(ar => ar.status === 'OVERDUE' || differenceInDays(now, ar.createdAt) > 30)
      .reduce((s, ar) => s + ar.remainingAmount, 0)

    return NextResponse.json({ summary, totalAR, overdueTotal, totalCount: receivables.length })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST - 미수금 회수 기록
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { receivableId, amount, paymentMethod, notes } = body

    const ar = await prisma.accountsReceivable.findUnique({ where: { id: receivableId } })
    if (!ar) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.arPayment.create({
      data: {
        receivableId,
        amount,
        paymentDate: new Date(),
        paymentMethod: paymentMethod || 'TRANSFER',
        notes: notes || null,
      },
    })

    const newRemaining = ar.remainingAmount - amount
    await prisma.accountsReceivable.update({
      where: { id: receivableId },
      data: {
        remainingAmount: Math.max(0, newRemaining),
        status: newRemaining <= 0 ? 'PAID' : 'PARTIAL',
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
