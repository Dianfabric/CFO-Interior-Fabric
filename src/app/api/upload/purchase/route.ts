import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

async function upsertMonthlyCost(amount: number, yearMonth: string, source: string, notes: string) {
  const category = await prisma.costCategory.findFirst({
    where: { name: { contains: '해외' } },
  })
  if (!category) return

  const existing = await prisma.monthlyCost.findUnique({
    where: { costCategoryId_yearMonth: { costCategoryId: category.id, yearMonth } },
  })

  if (existing) {
    await prisma.monthlyCost.update({
      where: { id: existing.id },
      data: { amount: existing.amount + amount, notes, source: 'PDF_UPLOAD' },
    })
  } else {
    await prisma.monthlyCost.create({
      data: { costCategoryId: category.id, yearMonth, amount, source: 'PDF_UPLOAD', notes },
    })
  }
}

export const runtime = 'nodejs'

async function getPdfParse() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('pdf-parse/lib/pdf-parse.js')
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const pdfParse = await getPdfParse()
    const data = await pdfParse(buffer)
    const text = data.text as string

    // 어떤 PDF인지 판별
    if (text.includes('관세법인') || text.includes('자금요청서') || text.includes('GLOBAL TEXTILE') && text.includes('관세')) {
      return handleCustomsPDF(text)
    } else if (text.includes('ROADSUN') || text.includes('로드썬') || text.includes('INVOICE') && text.includes('AIR EXPRESS')) {
      return handleFreightPDF(text)
    } else {
      return NextResponse.json({ error: '알 수 없는 PDF 형식입니다. 관세 청구서 또는 로드썬 인보이스를 업로드해주세요.' }, { status: 400 })
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Purchase upload error:', msg)
    try {
      return NextResponse.json({ error: '파일 처리 중 오류가 발생했습니다.', detail: msg.slice(0, 300) }, { status: 500 })
    } catch {
      return new Response(JSON.stringify({ error: msg.slice(0, 200) }), { status: 500, headers: { 'content-type': 'application/json' } })
    }
  }
}

// 관세법인 앤에스 자금요청서 파싱
async function handleCustomsPDF(text: string): Promise<NextResponse> {
  const extractNum = (pattern: RegExp): number => {
    const m = text.match(pattern)
    if (!m) return 0
    return parseInt(m[1].replace(/,/g, ''), 10) || 0
  }
  const extractStr = (pattern: RegExp): string => {
    const m = text.match(pattern)
    return m ? m[1].trim() : ''
  }

  const dateStr = extractStr(/\n\s*(\d{4}-\d{2}-\d{2})\s*\n/)
  const blNo = extractStr(/(RSE\d+)/)
  const supplier = extractStr(/GLOBAL\s+([\w\s.,()]+)\n/)
  const customs = extractNum(/관세\s*([\d,]+)/)
  const vat = extractNum(/부가세\s*([\d,]+)/)
  const warehouse = extractNum(/창고료\s*([\d,]+)/)
  const clearanceFee = extractNum(/통관수수료\s*([\d,]+)/)
  const totalBilled = extractNum(/\n\s*([\d,]+)\s*\n미\s*수\s*금/)

  if (totalBilled === 0) {
    return NextResponse.json({ error: '청구금액을 파싱할 수 없습니다.' }, { status: 400 })
  }

  const txDate = dateStr ? new Date(dateStr + 'T12:00:00') : new Date()
  const yearMonth = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`

  await upsertMonthlyCost(
    totalBilled,
    yearMonth,
    'PDF_UPLOAD',
    `관세 ${customs.toLocaleString()} | 부가세 ${vat.toLocaleString()}${blNo ? ` | B/L: ${blNo}` : ''}`,
  )

  const tx = await prisma.transaction.create({
    data: {
      date: txDate,
      type: 'EXPENSE',
      description: '관세/통관비용',
      totalAmount: totalBilled,
      taxAmount: vat,
      paymentMethod: 'TRANSFER',
      paymentStatus: 'PAID',
      channel: 'B2B',
      notes: [
        blNo ? `B/L: ${blNo}` : '',
        supplier ? `공급자: ${supplier}` : '',
        `관세: ${customs.toLocaleString()}원`,
        `부가세: ${vat.toLocaleString()}원`,
        warehouse > 0 ? `창고료: ${warehouse.toLocaleString()}원` : '',
        clearanceFee > 0 ? `통관수수료: ${clearanceFee.toLocaleString()}원` : '',
      ].filter(Boolean).join(' | '),
      items: {
        create: [
          customs > 0 && { productName: '관세', quantity: 1, unitPrice: customs, amount: customs },
          vat > 0 && { productName: '부가세', quantity: 1, unitPrice: vat, amount: vat },
          warehouse > 0 && { productName: '창고료', quantity: 1, unitPrice: warehouse, amount: warehouse },
          clearanceFee > 0 && { productName: '통관수수료', quantity: 1, unitPrice: clearanceFee, amount: clearanceFee },
        ].filter(Boolean) as { productName: string; quantity: number; unitPrice: number; amount: number }[],
      }
    }
  })

  return NextResponse.json({
    success: true,
    type: 'customs',
    date: dateStr,
    blNo,
    supplier,
    breakdown: { customs, vat, warehouse, clearanceFee },
    totalBilled,
    transactionId: tx.id,
  })
}

// 로드썬 운임 인보이스 파싱
async function handleFreightPDF(text: string): Promise<NextResponse> {
  const extractNum = (pattern: RegExp): number => {
    const m = text.match(pattern)
    if (!m) return 0
    return parseInt(m[1].replace(/,/g, ''), 10) || 0
  }
  const extractStr = (pattern: RegExp): string => {
    const m = text.match(pattern)
    return m ? m[1].trim() : ''
  }

  // PDF에서 날짜는 "2026-03-31 / 01-GAR260402-00077" 형식으로 INVOICE DATE/NO 레이블과 별도 추출
  const dateStr = extractStr(/(\d{4}-\d{2}-\d{2})\s*\//)
  const invoiceNo = extractStr(/\d{4}-\d{2}-\d{2}\s*\/\s*([^\s\n]+)/)

  // "TOTAL AMOUNT : (KRW) 13,633,300"
  const totalAmount = extractNum(/TOTAL\s*AMOUNT\s*:\s*\(KRW\)\s*([\d,]+)/)

  // 운임 소계
  const freight = extractNum(/SUB TOTAL[\s\S]*?KRW\s+([\d,]+)/)

  if (totalAmount === 0) {
    return NextResponse.json({ error: 'TOTAL AMOUNT를 파싱할 수 없습니다.' }, { status: 400 })
  }

  const txDate = dateStr ? new Date(dateStr + 'T12:00:00') : new Date()
  const yearMonth = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`

  await upsertMonthlyCost(
    totalAmount,
    yearMonth,
    'PDF_UPLOAD',
    `로드썬 운임${invoiceNo ? ` | Invoice: ${invoiceNo}` : ''}`,
  )

  const tx = await prisma.transaction.create({
    data: {
      date: txDate,
      type: 'EXPENSE',
      description: '국제운송비 (로드썬)',
      totalAmount,
      taxAmount: 0,
      paymentMethod: 'TRANSFER',
      paymentStatus: 'UNPAID',
      channel: 'B2B',
      notes: [
        invoiceNo ? `Invoice: ${invoiceNo}` : '',
        freight > 0 ? `운임합계: ${freight.toLocaleString()}원` : '',
      ].filter(Boolean).join(' | '),
      items: {
        create: [{
          productName: '국제항공운송비',
          quantity: 1,
          unitPrice: totalAmount,
          amount: totalAmount,
          notes: invoiceNo || null,
        }]
      }
    }
  })

  return NextResponse.json({
    success: true,
    type: 'freight',
    date: dateStr,
    invoiceNo,
    freight,
    totalAmount,
    transactionId: tx.id,
  })
}
