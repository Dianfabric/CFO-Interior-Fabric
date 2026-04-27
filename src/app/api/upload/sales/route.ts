import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { getFabricPrices, findFabricCost, getUSDtoKRW } from '@/lib/googleSheets'

// 일계표(리스트) 형식 업로드
// 계정: 외출=매출, 현비=경비, 외입=매입, 입금/출금=스킵

const SKIP_COST_ITEMS = ['할인', '화물', '택배', '방염', '배송', '운송', '해외운송']

function parseSheetDate(sheetName: string): Date | null {
  const m = sheetName.match(/^(\d{2})\.(\d{2})\.(\d{2})$/)
  if (!m) return null
  const [, yy, mm, dd] = m
  return new Date(2000 + parseInt(yy), parseInt(mm) - 1, parseInt(dd), 12, 0, 0)
}

function parseSigned(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const n = parseFloat(String(val).replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function parseNum(val: unknown): number {
  const n = parseSigned(val)
  return Math.abs(n)
}

interface TxRow {
  no: number; account: string; client: string
  productName: string; spec: string; memo: string
  qty: number; unitPrice: number; amount: number; vat: number
  voucherNo: string
}

function extractTxRows(rows: unknown[][]): TxRow[] {
  const result: TxRow[] = []
  for (const r of rows) {
    const no = parseFloat(String(r[0] ?? '').replace(/,/g, ''))
    if (!Number.isFinite(no) || no <= 0) continue
    result.push({
      no,
      account: String(r[1] ?? '').trim(),
      client: String(r[2] ?? '').trim(),
      productName: String(r[3] ?? '').trim(),
      spec: String(r[4] ?? '').trim(),
      memo: String(r[5] ?? '').trim(),
      qty: parseSigned(r[6]),
      unitPrice: parseNum(r[7]),
      amount: parseSigned(r[8]),
      vat: parseNum(r[9]),
      voucherNo: String(r[11] ?? '').trim(),
    })
  }
  return result
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    // 일계표 형식 확인 (첫 시트 첫 행에 "일계표" 포함)
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const firstRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as unknown[][]
    const titleText = String(firstRows[0]?.[0] ?? '')
    if (!titleText.includes('일계표')) {
      return NextResponse.json({ error: '일계표(리스트) 파일 형식이 아닙니다.' }, { status: 400 })
    }

    // Google Sheets 원단 단가표 + 환율
    let fabricPrices: Awaited<ReturnType<typeof getFabricPrices>> = []
    let usdRate = 1380
    let sheetsError = ''
    try {
      ;[fabricPrices, usdRate] = await Promise.all([getFabricPrices(), getUSDtoKRW()])
    } catch (e) {
      sheetsError = e instanceof Error ? e.message : '단가표 로드 실패'
    }

    const results: {
      date: string; skipped: boolean; skipReason?: string
      salesCount: number; totalSales: number
      expenseCount: number; totalExpenses: number
      purchaseCount: number; totalPurchases: number
    }[] = []

    for (const sheetName of workbook.SheetNames) {
      const txDate = parseSheetDate(sheetName)
      if (!txDate) continue

      const dateStr = txDate.toISOString().split('T')[0]
      const dayStart = new Date(txDate); dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(txDate); dayEnd.setHours(23, 59, 59, 999)

      // 중복 확인 — 해당 날짜 일계표 SALE이 이미 있으면 스킵
      const existing = await prisma.transaction.findFirst({
        where: { date: { gte: dayStart, lte: dayEnd }, type: 'SALE', description: { startsWith: '일계표' } }
      })
      if (existing) {
        results.push({ date: dateStr, skipped: true, skipReason: '이미 업로드된 날짜', salesCount: 0, totalSales: 0, expenseCount: 0, totalExpenses: 0, purchaseCount: 0, totalPurchases: 0 })
        continue
      }

      const ws = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
      const txRows = extractTxRows(rows)

      let salesCount = 0, totalSales = 0
      let expenseCount = 0, totalExpenses = 0
      let purchaseCount = 0, totalPurchases = 0

      // ── 외출 (SALE): 전표No 기준 그룹핑 ──────────────────
      const saleGroups = new Map<string, TxRow[]>()
      txRows.filter(r => r.account === '외출').forEach(r => {
        const key = `${r.voucherNo}__${r.client}`
        if (!saleGroups.has(key)) saleGroups.set(key, [])
        saleGroups.get(key)!.push(r)
      })

      for (const [, items] of saleGroups) {
        const clientName = items[0].client
        if (!clientName) continue
        const totalAmount = items.reduce((s, i) => s + i.amount, 0)
        if (totalAmount === 0) continue

        let client = await prisma.client.findFirst({ where: { name: clientName } })
        if (!client) client = await prisma.client.create({ data: { name: clientName, type: 'CUSTOMER' } })

        const saleTx = await prisma.transaction.create({
          data: {
            date: txDate,
            type: 'SALE',
            clientId: client.id,
            description: `일계표 매출 - ${clientName}`,
            totalAmount,
            taxAmount: items.reduce((s, i) => s + i.vat, 0),
            paymentMethod: 'CREDIT',
            paymentStatus: 'UNPAID',
            channel: 'B2B',
            items: {
              create: items.map(i => ({
                productName: i.productName + (i.spec ? ` [${i.spec}]` : ''),
                quantity: i.qty,
                unitPrice: i.unitPrice,
                amount: i.amount,
                notes: i.memo || null,
              }))
            }
          }
        })

        if (totalAmount > 0) {
          await prisma.accountsReceivable.create({
            data: {
              clientId: client.id,
              transactionId: saleTx.id,
              originalAmount: totalAmount,
              remainingAmount: totalAmount,
              status: 'OUTSTANDING',
            }
          })
        }

        salesCount++
        totalSales += totalAmount

        // 원단 원가 자동 계산
        if (fabricPrices.length > 0) {
          const costItems = items
            .filter(i => !SKIP_COST_ITEMS.some(s => i.productName.includes(s)) && i.qty > 0)
            .map(i => {
              const dealerPriceUSD = findFabricCost(i.productName, fabricPrices)
              const dealerPriceKRW = Math.round(dealerPriceUSD * usdRate)
              return { ...i, dealerPriceUSD, dealerPriceKRW, costAmount: Math.round(dealerPriceKRW * i.qty) }
            })
            .filter(i => i.dealerPriceUSD > 0)

          if (costItems.length > 0) {
            const totalCost = costItems.reduce((s, i) => s + i.costAmount, 0)
            await prisma.transaction.create({
              data: {
                date: txDate,
                type: 'PURCHASE',
                clientId: client.id,
                description: `원단 매입원가 - ${clientName}`,
                totalAmount: totalCost,
                taxAmount: 0,
                paymentMethod: 'TRANSFER',
                paymentStatus: 'PAID',
                channel: 'B2B',
                notes: `일계표 원가 자동 계산 (환율: ${usdRate}원/USD)`,
                items: {
                  create: costItems.map(i => ({
                    productName: i.productName + (i.spec ? ` [${i.spec}]` : ''),
                    quantity: i.qty,
                    unitPrice: i.dealerPriceKRW,
                    amount: i.costAmount,
                    notes: `USD단가: $${i.dealerPriceUSD} | 환율: ${usdRate}`,
                  }))
                }
              }
            })
          }
        }
      }

      // ── 현비 (EXPENSE): 행별 처리 ──────────────────────────
      const expenseRows = txRows.filter(r => r.account === '현비')
      for (const r of expenseRows) {
        const amount = parseNum(r.amount)
        if (amount === 0) continue
        await prisma.transaction.create({
          data: {
            date: txDate,
            type: 'EXPENSE',
            description: r.productName || r.memo || '경비',
            totalAmount: amount,
            taxAmount: r.vat,
            paymentMethod: 'CASH',
            paymentStatus: 'PAID',
            channel: 'B2B',
          }
        })
        expenseCount++
        totalExpenses += amount
      }

      // ── 외입 (PURCHASE): 전표No 기준 그룹핑 ──────────────
      const purchaseGroups = new Map<string, TxRow[]>()
      txRows.filter(r => r.account === '외입').forEach(r => {
        const key = `${r.voucherNo}__${r.client}`
        if (!purchaseGroups.has(key)) purchaseGroups.set(key, [])
        purchaseGroups.get(key)!.push(r)
      })

      for (const [, items] of purchaseGroups) {
        const clientName = items[0].client
        const totalAmount = items.reduce((s, i) => s + parseNum(i.amount), 0)
        if (totalAmount === 0) continue

        let client = await prisma.client.findFirst({ where: { name: clientName } })
        if (!client) client = await prisma.client.create({ data: { name: clientName, type: 'SUPPLIER' } })

        await prisma.transaction.create({
          data: {
            date: txDate,
            type: 'PURCHASE',
            clientId: client.id,
            description: `매입 - ${clientName}`,
            totalAmount,
            taxAmount: items.reduce((s, i) => s + i.vat, 0),
            paymentMethod: 'CREDIT',
            paymentStatus: 'UNPAID',
            channel: 'B2B',
            items: {
              create: items.map(i => ({
                productName: i.productName + (i.spec ? ` [${i.spec}]` : ''),
                quantity: i.qty,
                unitPrice: i.unitPrice,
                amount: parseNum(i.amount),
              }))
            }
          }
        })
        purchaseCount++
        totalPurchases += totalAmount
      }

      // 입금/출금은 AR 관리 페이지에서 처리 (스킵)

      results.push({ date: dateStr, skipped: false, salesCount, totalSales, expenseCount, totalExpenses, purchaseCount, totalPurchases })
    }

    const processed = results.filter(r => !r.skipped)
    return NextResponse.json({
      success: true,
      sheetsTotal: workbook.SheetNames.length,
      processedDays: processed.length,
      skippedDays: results.filter(r => r.skipped).length,
      totalSales: processed.reduce((s, r) => s + r.totalSales, 0),
      totalExpenses: processed.reduce((s, r) => s + r.totalExpenses, 0),
      totalPurchases: processed.reduce((s, r) => s + r.totalPurchases, 0),
      sheetsError: sheetsError || undefined,
      details: results,
    })
  } catch (error) {
    console.error('Sales upload error:', error)
    return NextResponse.json({ error: '파일 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
