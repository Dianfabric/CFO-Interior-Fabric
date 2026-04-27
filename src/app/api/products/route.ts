import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * 제품 목록 — SQLite만 읽음 (빠름)
 *
 * 원단명·판매가는 "Sheets 동기화" 버튼(POST /api/products/sync)으로 갱신.
 * source = "SHEETS"  → dian-quote 구글 시트에서 동기화된 원단
 * source = "LOCAL"   → CFO 전용 로컬 제품
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search      = searchParams.get('search')
    const category    = searchParams.get('category')
    const activeParam = searchParams.get('active')

    const where: Record<string, unknown> = {}
    if (category) where.category = category
    if (activeParam !== null) where.isActive = activeParam !== 'false'
    if (search) where.name = { contains: search }

    const products = await prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(products)
  } catch (error) {
    console.error('Products GET Error:', error)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

/**
 * POST — CFO 전용 제품 등록 (Sheets에 없는 로컬 전용 제품)
 * Sheets 제품의 매입가·카테고리 수정은 PUT /api/products/[id] 사용
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, category, unit, purchasePrice, sellingPrice, description } = body

    if (!name || !category || !unit) {
      return NextResponse.json({ error: '필수 항목을 입력해주세요' }, { status: 400 })
    }

    const product = await prisma.product.create({
      data: {
        name,
        category,
        unit,
        purchasePrice: purchasePrice || 0,
        sellingPrice:  sellingPrice  || 0,
        description:   description   || null,
        source:        'LOCAL',
      },
    })

    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    console.error('Products POST Error:', error)
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
  }
}
