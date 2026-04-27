import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startOfDay, endOfDay, subDays, startOfMonth, format } from 'date-fns'
import { getFabricPrices, findFabric } from '@/lib/googleSheets'

function getBusinessDaysInMonth(date: Date): number {
  const year = date.getFullYear()
  const month = date.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
}

function getBusinessDaysInRange(start: Date, end: Date): number {
  let count = 0
  const cur = new Date(start)
  cur.setHours(0, 0, 0, 0)
  const endNorm = new Date(end)
  endNorm.setHours(23, 59, 59, 999)
  while (cur <= endNorm) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date')
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')

    let rangeStart: Date, rangeEnd: Date

    if (startDateStr && endDateStr) {
      rangeStart = startOfDay(new Date(startDateStr + 'T12:00:00'))
      rangeEnd = endOfDay(new Date(endDateStr + 'T12:00:00'))
    } else {
      const targetDate = dateStr ? new Date(dateStr + 'T12:00:00') : new Date()
      rangeStart = startOfDay(targetDate)
      rangeEnd = endOfDay(targetDate)
    }

    const refDate = rangeStart
    const isSingleDay = format(rangeStart, 'yyyy-MM-dd') === format(rangeEnd, 'yyyy-MM-dd')

    const businessDaysInMonth = getBusinessDaysInMonth(refDate)
    const businessDaysInRange = Math.max(1, getBusinessDaysInRange(rangeStart, rangeEnd))
    const businessDayRatio = businessDaysInMonth > 0 ? businessDaysInRange / businessDaysInMonth : 1

    // === 1. 기간 거래 데이터 ===
    const periodTransactions = await prisma.transaction.findMany({
      where: { date: { gte: rangeStart, lte: rangeEnd } },
      include: {
        items: { include: { product: true } },
        client: { select: { name: true } },
      },
    })

    const sales = periodTransactions.filter(t => t.type === 'SALE')
    const expenses = periodTransactions.filter(t => t.type === 'EXPENSE')
    const purchases = periodTransactions.filter(t => t.type === 'PURCHASE')

    const totalSales = sales.reduce((s, t) => s + t.totalAmount, 0)
    const totalExpenses = expenses.reduce((s, t) => s + t.totalAmount, 0)
    const totalPurchases = purchases.reduce((s, t) => s + t.totalAmount, 0)

    // === 2. 공헌이익 계산 ===
    let fabricPrices: Awaited<ReturnType<typeof getFabricPrices>> = []
    try { fabricPrices = await getFabricPrices() } catch { /* 실패 시 브랜드 없이 진행 */ }

    // 원단 매입원가 PURCHASE 거래에서 제품별 원가 집계
    const costByProduct: Record<string, number> = {}
    purchases.forEach(tx => {
      if (!(tx.description ?? '').startsWith('원단 매입원가')) return
      tx.items.forEach(item => {
        const key = item.productName || ''
        if (key) costByProduct[key] = (costByProduct[key] ?? 0) + item.amount
      })
    })

    let totalVariableCost = 0
    const productContributions: Record<string, {
      productId: string; productName: string; category: string
      revenue: number; variableCost: number; quantity: number; unit: string; brand: string
    }> = {}

    sales.forEach(tx => {
      tx.items.forEach(item => {
        const key = item.productId || item.productName || 'etc'
        if (!productContributions[key]) {
          const fabricInfo = findFabric(item.productName, fabricPrices)
          productContributions[key] = {
            productId: key,
            productName: item.product?.name || item.productName || '기타',
            category: item.product?.category || '',
            revenue: 0, variableCost: 0, quantity: 0,
            unit: item.product?.unit || 'YARD',
            brand: fabricInfo?.brand ?? '',
          }
        }
        productContributions[key].revenue += item.amount
        productContributions[key].quantity += item.quantity
      })
    })

    Object.values(productContributions).forEach(p => {
      const cost = costByProduct[p.productName] ?? 0
      p.variableCost = cost
      totalVariableCost += cost
    })

    const totalContributionMargin = totalSales - totalVariableCost
    const contributionMarginRate = totalSales > 0 ? (totalContributionMargin / totalSales) * 100 : 0

    // 변동비 상세 내역 (원가 / 비용 / 원자재매입 구분)
    const fabricCostDetails = purchases
      .filter(tx => (tx.description ?? '').startsWith('원단 매입원가'))
      .map(tx => ({
        description: tx.description || '원단 매입원가',
        amount: tx.totalAmount,
        clientName: tx.client?.name || null,
      }))
    const expenseDetails = expenses.map(tx => ({
      description: tx.description || tx.items[0]?.productName || '비용',
      amount: tx.totalAmount,
      clientName: tx.client?.name || null,
    }))

    const productCM = Object.values(productContributions)
      .map(p => ({
        ...p,
        contributionMargin: p.revenue - p.variableCost,
        contributionMarginRate: p.revenue > 0 ? ((p.revenue - p.variableCost) / p.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)

    // === 3. 고정비 (기간 배분) ===
    const recurringCosts = await prisma.recurringCost.findMany({ include: { costCategory: true } })
    const monthlyFixedCost = recurringCosts.reduce((s, c) => {
      if (c.frequency === 'MONTHLY') return s + c.amount
      if (c.frequency === 'QUARTERLY') return s + Math.round(c.amount / 3)
      if (c.frequency === 'YEARLY') return s + Math.round(c.amount / 12)
      return s
    }, 0)

    const periodFixedCost = Math.round(monthlyFixedCost * businessDayRatio)

    // === 3-1. 해외운송비 (기간 배분) ===
    const yearMonth = format(refDate, 'yyyy-MM')
    const shippingCategory = await prisma.costCategory.findFirst({
      where: { name: { contains: '해외' } },
    })
    const monthlyCostRecord = shippingCategory
      ? await prisma.monthlyCost.findUnique({
          where: { costCategoryId_yearMonth: { costCategoryId: shippingCategory.id, yearMonth } },
        })
      : null
    const monthlyShippingCost = monthlyCostRecord?.amount ?? 0
    const periodShippingCost = Math.round(monthlyShippingCost * businessDayRatio)

    const adjustedContributionMargin = totalContributionMargin - periodShippingCost
    const adjustedContributionMarginRate = totalSales > 0 ? (adjustedContributionMargin / totalSales) * 100 : 0
    const adjustedOperatingProfit = adjustedContributionMargin - periodFixedCost
    const adjustedBEPRate = periodFixedCost > 0 ? (adjustedContributionMargin / periodFixedCost) * 100 : 0

    // === 월간 누적 BEP (월 시작 ~ 기간 끝) ===
    const monthStart = startOfMonth(refDate)
    const monthSales = await prisma.transaction.findMany({
      where: { type: 'SALE', date: { gte: monthStart, lte: rangeEnd } },
      include: { items: { include: { product: true } } },
    })

    let monthCumulativeCM = 0
    monthSales.forEach(tx => {
      tx.items.forEach(item => {
        const cost = (item.product?.purchasePrice || 0) * item.quantity
        monthCumulativeCM += (item.amount - cost)
      })
    })

    const monthlyBEPRate = monthlyFixedCost > 0 ? (monthCumulativeCM / monthlyFixedCost) * 100 : 0

    // === 4. 현금흐름 ===
    const cashIn = sales.filter(t => t.paymentStatus === 'PAID').reduce((s, t) => s + t.totalAmount, 0)
    const cashOut = [...expenses, ...purchases].filter(t => t.paymentStatus === 'PAID').reduce((s, t) => s + t.totalAmount, 0)
    const netCashFlow = cashIn - cashOut

    // === 5. 기간 미수금 ===
    const newReceivables = await prisma.accountsReceivable.findMany({
      where: { createdAt: { gte: rangeStart, lte: rangeEnd } },
      include: { client: { select: { name: true } } },
    })
    const newARTotal = newReceivables.reduce((s, ar) => s + ar.originalAmount, 0)

    // === 6. 전 기간 비교 ===
    const periodMs = rangeEnd.getTime() - rangeStart.getTime()
    const prevPeriodEnd = new Date(rangeStart.getTime() - 1)
    const prevPeriodStart = startOfDay(new Date(prevPeriodEnd.getTime() - periodMs))

    const prevSalesAgg = await prisma.transaction.aggregate({
      where: { type: 'SALE', date: { gte: prevPeriodStart, lte: prevPeriodEnd } },
      _sum: { totalAmount: true }, _count: true,
    })

    let prevCM = 0
    const prevTx = await prisma.transaction.findMany({
      where: { type: 'SALE', date: { gte: prevPeriodStart, lte: prevPeriodEnd } },
      include: { items: { include: { product: true } } },
    })
    prevTx.forEach(tx => {
      tx.items.forEach(item => {
        prevCM += item.amount - ((item.product?.purchasePrice || 0) * item.quantity)
      })
    })

    // 전주 동요일 (단일 날짜일 때만)
    let lwSalesTotal = 0
    let lwSalesCount = 0
    if (isSingleDay) {
      const lastWeekSameDay = subDays(rangeStart, 7)
      const lwAgg = await prisma.transaction.aggregate({
        where: { type: 'SALE', date: { gte: startOfDay(lastWeekSameDay), lte: endOfDay(lastWeekSameDay) } },
        _sum: { totalAmount: true }, _count: true,
      })
      lwSalesTotal = lwAgg._sum.totalAmount ?? 0
      lwSalesCount = lwAgg._count ?? 0
    }

    // === 7. 고정비 상세 (기간 배분) ===
    const fixedCostBreakdown = recurringCosts.map(c => {
      const monthlyAmt = c.frequency === 'MONTHLY' ? c.amount : c.frequency === 'QUARTERLY' ? Math.round(c.amount / 3) : Math.round(c.amount / 12)
      return {
        category: c.costCategory.name,
        type: c.costCategory.type,
        description: c.description,
        monthlyAmount: monthlyAmt,
        dailyAmount: Math.round(monthlyAmt * businessDayRatio),
      }
    })

    // === dateLabel ===
    const dateLabel = isSingleDay
      ? format(rangeStart, 'yyyy년 MM월 dd일')
      : `${format(rangeStart, 'MM월 dd일')} ~ ${format(rangeEnd, 'MM월 dd일')}`

    return NextResponse.json({
      date: format(rangeStart, 'yyyy-MM-dd'),
      dateLabel,
      periodDays: businessDaysInRange,
      isSingleDay,

      totalSales, totalExpenses, totalPurchases,
      salesCount: sales.length, expenseCount: expenses.length,

      totalVariableCost,
      totalContributionMargin: adjustedContributionMargin,
      contributionMarginRate: adjustedContributionMarginRate,

      monthlyShippingCost,
      dailyShippingCost: periodShippingCost,

      // 변동비 상세 (원단원가 / 비용 구분)
      variableCostBreakdown: {
        fabricCost: { label: '원단 매입원가', amount: totalVariableCost, details: fabricCostDetails },
        expenses: { label: '비용 (당일 지출)', amount: totalExpenses, details: expenseDetails },
      },

      productCM,

      monthlyFixedCost,
      dailyFixedCost: periodFixedCost,
      dailyOperatingProfit: adjustedOperatingProfit,
      dailyBEPRate: adjustedBEPRate,
      monthCumulativeCM,
      monthlyBEPRate,
      fixedCostBreakdown,

      cashIn, cashOut, netCashFlow,

      newReceivables: newReceivables.map(ar => ({
        clientName: ar.client.name, amount: ar.originalAmount,
      })),
      newARTotal,

      comparison: {
        yesterday: {
          sales: prevSalesAgg._sum.totalAmount ?? 0,
          count: prevSalesAgg._count ?? 0,
          contributionMargin: prevCM,
        },
        lastWeek: {
          sales: lwSalesTotal,
          count: lwSalesCount,
        },
      },

      transactions: periodTransactions.map(t => ({
        id: t.id, type: t.type, totalAmount: t.totalAmount,
        paymentMethod: t.paymentMethod, paymentStatus: t.paymentStatus,
        clientName: t.client?.name || '-', channel: t.channel,
        description: t.description,
        items: t.items.map(i => ({ name: i.product?.name || i.productName, quantity: i.quantity, amount: i.amount })),
      })),
    })
  } catch (error) {
    console.error('Settlement API Error:', error)
    return NextResponse.json({ error: 'Failed', detail: String(error) }, { status: 500 })
  }
}
