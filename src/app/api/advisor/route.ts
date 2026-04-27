import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { chatWithAdvisor } from '@/lib/claude'
import { startOfMonth, endOfMonth, subMonths, differenceInDays } from 'date-fns'
import type { FinancialContext } from '@/lib/calculations'
import { buildClientMap } from '@/lib/airtable'

async function buildFinancialContext(): Promise<FinancialContext> {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const prevStart = startOfMonth(subMonths(now, 1))
  const prevEnd = endOfMonth(subMonths(now, 1))

  const [monthSales, monthExp, prevSales, totalAR, overdueAR, topProducts, productItems] = await Promise.all([
    prisma.transaction.aggregate({ where: { type: 'SALE', date: { gte: monthStart, lte: monthEnd } }, _sum: { totalAmount: true }, _count: true }),
    prisma.transaction.aggregate({ where: { type: { in: ['EXPENSE', 'PURCHASE'] }, date: { gte: monthStart, lte: monthEnd } }, _sum: { totalAmount: true } }),
    prisma.transaction.aggregate({ where: { type: 'SALE', date: { gte: prevStart, lte: prevEnd } }, _sum: { totalAmount: true } }),
    prisma.accountsReceivable.aggregate({ where: { status: { in: ['OUTSTANDING', 'PARTIAL', 'OVERDUE'] } }, _sum: { remainingAmount: true } }),
    prisma.accountsReceivable.aggregate({ where: { status: 'OVERDUE' }, _sum: { remainingAmount: true } }),
    prisma.transactionItem.groupBy({ by: ['productId'], where: { transaction: { type: 'SALE', date: { gte: monthStart } }, productId: { not: null } }, _sum: { amount: true, quantity: true }, orderBy: { _sum: { amount: 'desc' } }, take: 10 }),
    prisma.product.findMany(),
  ])

  const [receivables, clientMap] = await Promise.all([
    prisma.accountsReceivable.findMany({
      where: { status: { in: ['OUTSTANDING', 'PARTIAL', 'OVERDUE'] } },
      orderBy: { remainingAmount: 'desc' }, take: 5,
    }),
    buildClientMap(),
  ])

  const mSales = monthSales._sum.totalAmount || 0
  const mExp = monthExp._sum.totalAmount || 0
  const mProfit = mSales - mExp

  const costs = await prisma.recurringCost.findMany({ include: { costCategory: true } })
  const monthlyFixed = costs.reduce((s, c) => s + (c.frequency === 'MONTHLY' ? c.amount : c.frequency === 'QUARTERLY' ? Math.round(c.amount / 3) : Math.round(c.amount / 12)), 0)

  return {
    companyProfile: {
      industry: '인테리어 원단 제조+유통',
      products: ['소파원단', '커튼원단', '벽원단', '맞춤커튼', '소파제작'],
      channels: ['B2B', 'B2C 오프라인', 'B2C 온라인'],
    },
    currentPeriod: {
      period: `${now.getFullYear()}년 ${now.getMonth() + 1}월`,
      periodType: 'MONTHLY',
      totalSales: mSales,
      totalExpenses: mExp,
      totalPurchases: 0,
      grossProfit: mProfit,
      netProfit: mProfit,
      salesCount: monthSales._count || 0,
      avgTransactionAmount: monthSales._count ? Math.round(mSales / monthSales._count) : 0,
      topProducts: [],
      topClients: [],
      channelBreakdown: [],
      arCollected: 0,
      newAR: 0,
      previousPeriodSales: prevSales._sum.totalAmount || 0,
      growthRate: (prevSales._sum.totalAmount || 0) > 0 ? ((mSales - (prevSales._sum.totalAmount || 0)) / (prevSales._sum.totalAmount || 1)) * 100 : 0,
    },
    productAnalysis: topProducts.map(tp => {
      const prod = productItems.find(p => p.id === tp.productId)
      const rev = tp._sum.amount || 0
      const cost = (prod?.purchasePrice || 0) * (tp._sum.quantity || 0)
      return {
        productId: tp.productId || '', productName: prod?.name || '', category: prod?.category || '',
        totalRevenue: rev, totalCost: cost, totalProfit: rev - cost,
        marginRate: rev > 0 ? ((rev - cost) / rev) * 100 : 0,
        salesVolume: tp._sum.quantity || 0, avgPrice: 0, grade: 'A' as const,
        revenueShare: mSales > 0 ? (rev / mSales) * 100 : 0, profitShare: 0,
      }
    }),
    cashFlowHealth: {
      totalRevenue: mSales, totalCollected: mSales - (totalAR._sum.remainingAmount || 0),
      totalReceivable: totalAR._sum.remainingAmount || 0,
      collectionRate: mSales > 0 ? ((mSales - (totalAR._sum.remainingAmount || 0)) / mSales) * 100 : 100,
      avgCollectionDays: 30, overdueAmount: overdueAR._sum.remainingAmount || 0,
      overdueRate: (totalAR._sum.remainingAmount || 0) > 0 ? ((overdueAR._sum.remainingAmount || 0) / (totalAR._sum.remainingAmount || 1)) * 100 : 0,
      healthGrade: (overdueAR._sum.remainingAmount || 0) > mSales * 0.3 ? 'DANGER' : 'GOOD',
    },
    profitDrivers: {
      price: monthSales._count ? Math.round(mSales / monthSales._count) : 0,
      volume: monthSales._count || 0, revenue: mSales,
      variableCost: mExp, fixedCost: monthlyFixed,
      totalCost: mExp + monthlyFixed, profit: mProfit - monthlyFixed,
      marginRate: mSales > 0 ? ((mProfit - monthlyFixed) / mSales) * 100 : 0,
      contributionMargin: 0, breakEvenVolume: 0, breakEvenRevenue: 0,
    },
    topReceivables: receivables.map(ar => ({
      clientName: clientMap.get(ar.clientId)?.name || ar.clientId, amount: ar.remainingAmount,
      daysOverdue: differenceInDays(now, ar.createdAt),
    })),
  }
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json()
    const context = await buildFinancialContext()
    const response = await chatWithAdvisor(messages, context)
    return NextResponse.json({ response, context })
  } catch (error) {
    console.error('Advisor API Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
