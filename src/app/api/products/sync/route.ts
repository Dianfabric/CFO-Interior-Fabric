import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listSheetProducts } from '@/lib/sheets'

/**
 * POST /api/products/sync
 * Google Sheets 쇼룸단가표 → SQLite Product 동기화
 *
 * 동작:
 *  - Sheets에 있는 원단: SQLite에 없으면 CREATE(source=SHEETS), 있으면 name·sellingPrice·spec·alias UPDATE
 *  - purchasePrice, category, unit 은 절대 덮어쓰지 않음 (CFO 전용 데이터 보존)
 *  - Sheets에 없는 SQLite 제품은 건드리지 않음
 *
 * Returns: { synced, created, updated }
 */
export async function POST() {
  try {
    // 병렬로 Sheets + 기존 DB 전체 조회
    const [sheetProducts, dbProducts] = await Promise.all([
      listSheetProducts(),
      prisma.product.findMany({ select: { id: true, name: true } }),
    ])

    // 이름→id 맵 (소문자 키)
    const dbByName = new Map(dbProducts.map(p => [p.name.toLowerCase(), p.id]))

    const toCreate: typeof sheetProducts = []
    const toUpdate: {
      id: string; name: string; sellingPrice: number; spec?: string; alias?: string
    }[] = []

    const seenNames = new Set<string>() // Sheets 내 중복 제거용

    for (const sp of sheetProducts) {
      const key = sp.name.toLowerCase()
      if (seenNames.has(key)) continue  // Sheets 내 중복 스킵
      seenNames.add(key)

      const existingId = dbByName.get(key)
      if (existingId) {
        toUpdate.push({ id: existingId, name: sp.name, sellingPrice: sp.sellingPrice, spec: sp.spec, alias: sp.alias })
      } else {
        toCreate.push(sp)
      }
    }

    // 트랜잭션으로 일괄 처리
    await prisma.$transaction([
      ...toCreate.map(sp =>
        prisma.product.create({
          data: {
            name:          sp.name,
            sellingPrice:  sp.sellingPrice,
            purchasePrice: 0,
            unit:          'YARD',
            category:      'OTHER',
            spec:          sp.spec  ?? null,
            alias:         sp.alias ?? null,
            source:        'SHEETS',
          },
        })
      ),
      ...toUpdate.map(({ id, name, sellingPrice, spec, alias }) =>
        prisma.product.update({
          where: { id },
          data: {
            name,
            sellingPrice,
            spec:   spec  ?? null,
            alias:  alias ?? null,
            source: 'SHEETS',  // 이미 LOCAL이었던 경우도 SHEETS로 갱신
          },
        })
      ),
    ])

    return NextResponse.json({
      synced:  sheetProducts.length,
      created: toCreate.length,
      updated: toUpdate.length,
    })
  } catch (error) {
    console.error('Products sync Error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
