import { NextRequest, NextResponse } from 'next/server'
import { listClients, createClient } from '@/lib/airtable'

// GET - 거래처 목록 (Airtable)
export async function GET() {
  try {
    const clients = await listClients()
    return NextResponse.json(clients)
  } catch (error) {
    console.error('Clients GET Error:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }
}

// POST - 거래처 등록 (Airtable)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, phone, email } = body
    if (!name) return NextResponse.json({ error: '거래처명을 입력해주세요' }, { status: 400 })
    const client = await createClient({ name, phone, email })
    return NextResponse.json(client, { status: 201 })
  } catch (error) {
    console.error('Clients POST Error:', error)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }
}
