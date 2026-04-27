import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - 제품 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: '제품을 찾을 수 없습니다' }, { status: 404 })
    return NextResponse.json(product)
  } catch (error) {
    console.error('Product GET Error:', error)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}

/**
 * PUT - 제품 CFO 메타데이터 수정
 *
 * SHEETS 제품: purchasePrice, unit, category, description 만 수정 가능
 *              (name, sellingPrice, spec, alias 는 Sheets 원본 유지)
 * LOCAL  제품: 모든 필드 수정 가능
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: '제품을 찾을 수 없습니다' }, { status: 404 })

    if (product.source === 'SHEETS') {
      // Sheets 제품: CFO 전용 필드만 수정
      const updated = await prisma.product.update({
        where: { id },
        data: {
          purchasePrice: body.purchasePrice ?? product.purchasePrice,
          unit:          body.unit          ?? product.unit,
          category:      body.category      ?? product.category,
          description:   body.description   !== undefined ? body.description : product.description,
        },
      })
      return NextResponse.json(updated)
    }

    // LOCAL 제품: 모든 필드 수정 가능
    const updated = await prisma.product.update({
      where: { id },
      data: {
        name:          body.name,
        category:      body.category,
        unit:          body.unit,
        purchasePrice: body.purchasePrice,
        sellingPrice:  body.sellingPrice,
        description:   body.description,
        isActive:      body.isActive,
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Product PUT Error:', error)
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 })
  }
}

// DELETE - 제품 비활성화
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: '제품을 찾을 수 없습니다' }, { status: 404 })

    if (product.source === 'SHEETS') {
      return NextResponse.json(
        { error: 'Sheets 제품은 구글 시트에서 삭제해주세요' },
        { status: 400 }
      )
    }

    await prisma.product.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Product DELETE Error:', error)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
