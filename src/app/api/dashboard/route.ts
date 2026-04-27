import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { buildClientMap } from '@/lib/airtable'
import {
  startOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
  subDays,
  format,
  differenceInDays,
} from 'date-fns'

export async function GET() {
  try {
    const now = new Date()
    const todayStart = startOfDay(now)
    const monthStart = startOfMonth(now)
    const monthEnd = endOfMonth(now)
    const prevMonthStart = startOfMonth(subMonths(now, 1))
    const prevMonthEnd = endOfMonth(subMonths(now, 1))

    // 오늘 매출
    const todaySales = await prisma.transaction.aggregate({
      where: { type: 'SALE', date: { gte: todayStart } },
      _sum: { totalAmount: true },
      _count: true,
    })

    // 이번 달 매출
    const monthSales = await prisma.transaction.aggregate({
      where: { type: 'SALE', date: { gte: monthStart, lte: monthEnd } },
      _sum: { totalAmount: true },
    })

    // 이번 달 비용 (EXPENSE + PURCHASE)
    const monthExpenses = await prisma.transaction.aggregate({
      where: {
        type: { in: ['EXPENSE', 'PURCHASE'] },
        date: { gte: monthStart, lte: monthEnd },
      },
      _sum: { totalAmount: true },
    })

    // 전월 매출
    const prevMonthSales = await prisma.transaction.aggregate({
      where: { type: 'SALE', date: { gte: prevMonthStart, lte: prevMonthEnd } },
      _sum: { totalAmount: true },
    })

    // 미수금 총액
    const totalReceivable = await prisma.accountsReceivable.aggregate({
      where: { status: { in: ['OUTSTANDING', 'PARTIAL', 'OVERDUE'] } },
      _sum: { remainingAmount: true },
    })

    // 미수금 경과 분석
    const receivables = await prisma.accountsReceivable.findMany({
      where: { status: { in: ['OUTSTANDING', 'PARTIAL', 'OVERDUE'] } },
    })

    const arAging = [
      { period: '30일 이내', amount: 0, count: 0 },
      { period: '30~60일', amount: 0, count: 0 },
      { period: '60~90일', amount: 0, count: 0 },
      { period: '90일 초과', amount: 0, count: 0 },
    ]

    receivables.forEach((ar) => {
      const days = differenceInDays(now, ar.createdAt)
      const bucket = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3
      arAging[bucket].amount += ar.remainingAmount
      arAging[bucket].count += 1
    })

    // 최근 7일 매출 추이
    const dailySales: { label: string; sales: number; expenses: number; profit: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = startOfDay(subDays(now, i))
      const dayEnd = new Date(dayStart)
      dayEnd.setHours(23, 59, 59, 999)

      const sales = await prisma.transaction.aggregate({
        where: { type: 'SALE', date: { gte: dayStart, lte: dayEnd } },
        _sum: { totalAmount: true },
      })
      const expenses = await prisma.transaction.aggregate({
        where: { type: { in: ['EXPENSE', 'PURCHASE'] }, date: { gte: dayStart, lte: dayEnd } },
        _sum: { totalAmount: true },
      })

      const salesAmt = sales._sum.totalAmount || 0
      const expAmt = expenses._sum.totalAmount || 0

      dailySales.push({
        label: format(dayStart, 'MM/dd'),
        sales: salesAmt,
        expenses: expAmt,
        profit: salesAmt - expAmt,
      })
    }

    // 제품별 매출 TOP 10
    const productSales = await prisma.transactionItem.groupBy({
      by: ['productId'],
      where: {
        transaction: { type: 'SALE', date: { gte: monthStart, lte: monthEnd } },
        productId: { not: null },
      },
      _sum: { amount: true, quantity: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    })

    const productData = await Promise.all(
      productSales.map(async (ps) => {
        const product = await prisma.product.findUnique({ where: { id: ps.productId! } })
        const revenue = ps._sum.amount || 0
        const cost = (product?.purchasePrice || 0) * (ps._sum.quantity || 0)
        const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0
        return {
          name: product?.name || '알 수 없음',
          revenue,
          margin,
          grade: margin >= 30 && revenue >= (monthSales._sum.totalAmount || 1) * 0.1 ? 'A'
            : margin >= 30 ? 'B'
            : revenue >= (monthSales._sum.totalAmount || 1) * 0.1 ? 'C' : 'D',
        }
      })
    )

    // 최근 거래 10건
    const [recentTransactions, clientMap] = await Promise.all([
      prisma.transaction.findMany({
        orderBy: { date: 'desc' },
        take: 10,
        include: { items: { include: { product: true } } },
      }),
      buildClientMap(),
    ])

    const monthSalesAmt = monthSales._sum.totalAmount || 0
    const monthExpAmt = monthExpenses._sum.totalAmount || 0
    const monthProfit = monthSalesAmt - monthExpAmt

    // ===== 금년도 월별 매출/순이익 =====
    const yearStart = startOfYear(now)
    const yearEnd = endOfYear(now)
    const monthlyBreakdown: { month: string; label: string; sales: number; expenses: number; profit: number }[] = []
    for (let m = 0; m < 12; m++) {
      const mStart = new Date(now.getFullYear(), m, 1)
      const mEnd = endOfMonth(mStart)
      if (mStart > now) break
      const [mSales, mExp] = await Promise.all([
        prisma.transaction.aggregate({ where: { type: 'SALE', date: { gte: mStart, lte: mEnd } }, _sum: { totalAmount: true } }),
        prisma.transaction.aggregate({ where: { type: { in: ['EXPENSE', 'PURCHASE'] }, date: { gte: mStart, lte: mEnd } }, _sum: { totalAmount: true } }),
      ])
      const s = mSales._sum.totalAmount || 0
      const e = mExp._sum.totalAmount || 0
      monthlyBreakdown.push({ month: `${m + 1}월`, label: `${m + 1}월`, sales: s, expenses: e, profit: s - e })
    }

    // ===== 금년도 분기별 매출/순이익 =====
    const quarterlyBreakdown: { quarter: string; sales: number; expenses: number; profit: number }[] = []
    for (let q = 0; q < 4; q++) {
      const qStart = new Date(now.getFullYear(), q * 3, 1)
      const qEnd = endOfMonth(new Date(now.getFullYear(), q * 3 + 2, 1))
      if (qStart > now) break
      const [qSales, qExp] = await Promise.all([
        prisma.transaction.aggregate({ where: { type: 'SALE', date: { gte: qStart, lte: qEnd } }, _sum: { totalAmount: true } }),
        prisma.transaction.aggregate({ where: { type: { in: ['EXPENSE', 'PURCHASE'] }, date: { gte: qStart, lte: qEnd } }, _sum: { totalAmount: true } }),
      ])
      const s = qSales._sum.totalAmount || 0
      const e = qExp._sum.totalAmount || 0
      quarterlyBreakdown.push({ quarter: `Q${q + 1}`, sales: s, expenses: e, profit: s - e })
    }

    // ===== 채널(직군)별 매출/순이익 =====
    const channelSalesRaw = await prisma.transaction.groupBy({
      by: ['channel'],
      where: { type: 'SALE', date: { gte: yearStart, lte: yearEnd } },
      _sum: { totalAmount: true }, _count: true,
    })
    // 채널별 비용은 매출원가로 근사 (items에서 product purchasePrice 기반)
    const channelBreakdown = await Promise.all(
      channelSalesRaw.map(async (ch) => {
        const items = await prisma.transactionItem.findMany({
          where: { transaction: { type: 'SALE', channel: ch.channel, date: { gte: yearStart, lte: yearEnd } } },
          include: { product: true },
        })
        const cost = items.reduce((s, it) => s + ((it.product?.purchasePrice || 0) * it.quantity), 0)
        const sales = ch._sum.totalAmount || 0
        return {
          channel: ch.channel === 'B2B' ? 'B2B' : ch.channel === 'B2C_OFFLINE' ? 'B2C 오프라인' : 'B2C 온라인',
          sales, cost, profit: sales - cost, count: ch._count,
        }
      })
    )

    // ===== 제품별 연간 매출/순이익 =====
    const yearProductSales = await prisma.transactionItem.groupBy({
      by: ['productId'],
      where: { transaction: { type: 'SALE', date: { gte: yearStart, lte: yearEnd } }, productId: { not: null } },
      _sum: { amount: true, quantity: true },
      orderBy: { _sum: { amount: 'desc' } },
    })
    const products = await prisma.product.findMany()
    const productBreakdown = yearProductSales.map((ps) => {
      const prod = products.find(p => p.id === ps.productId)
      const revenue = ps._sum.amount || 0
      const cost = (prod?.purchasePrice || 0) * (ps._sum.quantity || 0)
      return {
        name: prod?.name || '알 수 없음',
        category: prod?.category || '',
        sales: revenue, cost, profit: revenue - cost,
        marginRate: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
        quantity: ps._sum.quantity || 0,
      }
    })

    return NextResponse.json({
      kpi: {
        todaySales: todaySales._sum.totalAmount || 0,
        monthSales: monthSalesAmt,
        monthExpenses: monthExpAmt,
        monthProfit,
        monthMarginRate: monthSalesAmt > 0 ? (monthProfit / monthSalesAmt) * 100 : 0,
        totalReceivable: totalReceivable._sum.remainingAmount || 0,
        salesCount: todaySales._count || 0,
        previousMonthSales: prevMonthSales._sum.totalAmount || 0,
      },
      dailySales,
      arAging,
      productData,
      recentTransactions: recentTransactions.map((t) => ({
        id: t.id,
        date: t.date,
        type: t.type,
        clientName: (t.clientId ? clientMap.get(t.clientId)?.name : null) || (t.channel === 'B2B' ? '-' : 'B2C 현금'),
        totalAmount: t.totalAmount,
        paymentMethod: t.paymentMethod,
        paymentStatus: t.paymentStatus,
        channel: t.channel,
        description: t.description,
      })),
      // 금년도 분석
      yearlyAnalysis: {
        monthlyBreakdown,
        quarterlyBreakdown,
        channelBreakdown,
        productBreakdown,
      },
    })
  } catch (error) {
    console.error('Dashboard API Error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 })
  }
}
