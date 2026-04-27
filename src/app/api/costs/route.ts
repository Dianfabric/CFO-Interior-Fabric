import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const yearMonth = searchParams.get('yearMonth') || new Date().toISOString().slice(0, 7)

    const categories = await prisma.costCategory.findMany({
      where: { isActive: true },
      include: {
        recurringCosts: true,
        monthlyCosts: { where: { yearMonth } },
      },
      orderBy: { name: 'asc' },
    })

    let monthlyFixedTotal = 0
    categories.forEach(cat => {
      cat.recurringCosts.forEach(rc => {
        if (rc.frequency === 'MONTHLY') monthlyFixedTotal += rc.amount
        else if (rc.frequency === 'QUARTERLY') monthlyFixedTotal += Math.round(rc.amount / 3)
        else if (rc.frequency === 'YEARLY') monthlyFixedTotal += Math.round(rc.amount / 12)
      })
    })

    const monthlyActualTotal = categories.reduce(
      (s, c) => s + (c.monthlyCosts[0]?.amount ?? 0), 0
    )

    return NextResponse.json({ categories, monthlyFixedTotal, monthlyActualTotal, yearMonth })
  } catch (error) {
    console.error('Costs GET Error:', error)
    return NextResponse.json({ error: 'Failed to fetch costs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.action === 'category') {
      const category = await prisma.costCategory.create({
        data: { name: body.name, type: body.type },
      })
      return NextResponse.json(category, { status: 201 })
    }

    if (body.action === 'recurring') {
      const recurringCost = await prisma.recurringCost.create({
        data: {
          costCategoryId: body.costCategoryId,
          description: body.description,
          amount: body.amount,
          frequency: body.frequency || 'MONTHLY',
          notes: body.notes || null,
        },
      })
      return NextResponse.json(recurringCost, { status: 201 })
    }

    if (body.action === 'monthly') {
      // 해당 월 MonthlyCost upsert (수동 입력)
      const existing = await prisma.monthlyCost.findUnique({
        where: { costCategoryId_yearMonth: { costCategoryId: body.costCategoryId, yearMonth: body.yearMonth } },
      })
      if (existing) {
        const updated = await prisma.monthlyCost.update({
          where: { id: existing.id },
          data: { amount: body.amount, notes: body.notes || null, source: 'MANUAL' },
        })
        return NextResponse.json(updated)
      } else {
        const created = await prisma.monthlyCost.create({
          data: {
            costCategoryId: body.costCategoryId,
            yearMonth: body.yearMonth,
            amount: body.amount,
            source: 'MANUAL',
            notes: body.notes || null,
          },
        })
        return NextResponse.json(created, { status: 201 })
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Costs POST Error:', error)
    return NextResponse.json({ error: 'Failed to create cost' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    if (type === 'recurring') {
      await prisma.recurringCost.delete({ where: { id } })
    } else if (type === 'monthly') {
      await prisma.monthlyCost.delete({ where: { id } })
    } else if (type === 'category') {
      await prisma.recurringCost.deleteMany({ where: { costCategoryId: id } })
      await prisma.monthlyCost.deleteMany({ where: { costCategoryId: id } })
      await prisma.costCategory.delete({ where: { id } })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Costs DELETE Error:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
