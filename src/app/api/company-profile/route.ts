import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const SINGLETON_ID = 'singleton'

export async function GET() {
  try {
    const profile = await prisma.companyProfile.findUnique({
      where: { id: SINGLETON_ID },
    })
    if (!profile) {
      return NextResponse.json({
        id: SINGLETON_ID,
        name: '',
        businessNumber: '',
        representative: '',
        phone: '',
        fax: '',
        address: '',
        email: '',
        website: '',
        bankInfo: '',
        logoPath: '',
        sealPath: '',
      })
    }
    return NextResponse.json(profile)
  } catch (error) {
    console.error('CompanyProfile GET Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const data = {
      name: body.name ?? '',
      businessNumber: body.businessNumber || null,
      representative: body.representative || null,
      phone: body.phone || null,
      fax: body.fax || null,
      address: body.address || null,
      email: body.email || null,
      website: body.website || null,
      bankInfo: body.bankInfo || null,
      logoPath: body.logoPath || null,
      sealPath: body.sealPath || null,
    }
    const profile = await prisma.companyProfile.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    })
    return NextResponse.json(profile)
  } catch (error) {
    console.error('CompanyProfile PUT Error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
