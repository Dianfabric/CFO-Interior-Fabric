import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function todayPrefix() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export async function GET() {
  try {
    const prefix = todayPrefix()
    const last = await prisma.officialDocument.findFirst({
      where: { documentNumber: { startsWith: prefix } },
      orderBy: { documentNumber: 'desc' },
    })
    let seq = 1
    if (last) {
      const tail = last.documentNumber.slice(prefix.length)
      const n = parseInt(tail, 10)
      if (!isNaN(n)) seq = n + 1
    }
    const documentNumber = `${prefix}${String(seq).padStart(2, '0')}`
    return NextResponse.json({ documentNumber })
  } catch (error) {
    console.error('next-number Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
