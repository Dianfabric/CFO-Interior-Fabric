'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { FileText, Plus, TrendingUp, TrendingDown, CalendarOff, Wallet, ListChecks, Search } from 'lucide-react'

interface DocRow {
  id: string
  documentNumber: string
  type: string
  title: string
  recipientName: string
  createdAt: string
}

const TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  PRICE_CHANGE: { label: '단가 변경', icon: TrendingUp, color: 'text-rose-600' },
  HOLIDAY: { label: '휴무 안내', icon: CalendarOff, color: 'text-amber-600' },
  PAYMENT_REQUEST: { label: '결제 요청', icon: Wallet, color: 'text-blue-600' },
  PRICE_INFO: { label: '단가 안내', icon: ListChecks, color: 'text-emerald-600' },
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = async (q?: string) => {
    setLoading(true)
    try {
      const url = q ? `/api/documents?search=${encodeURIComponent(q)}` : '/api/documents'
      const res = await fetch(url)
      const data = await res.json()
      setDocs(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6" /> 공문 작성
          </h1>
          <p className="text-sm text-slate-500">거래처 대상 공식 서한을 작성하고 PDF/JPG로 발행합니다</p>
        </div>
      </div>

      {/* 새 공문 작성 카드 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4" /> 새 공문 작성
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Link href="/documents/new/price-change?direction=UP" className="group">
              <div className="border rounded-lg p-4 bg-white hover:border-rose-400 hover:shadow-sm transition">
                <TrendingUp className="w-5 h-5 text-rose-600 mb-2" />
                <div className="font-semibold text-sm">단가 인상</div>
                <div className="text-xs text-slate-500 mt-1">% 또는 정액으로 인상</div>
              </div>
            </Link>
            <Link href="/documents/new/price-change?direction=DOWN" className="group">
              <div className="border rounded-lg p-4 bg-white hover:border-emerald-400 hover:shadow-sm transition">
                <TrendingDown className="w-5 h-5 text-emerald-600 mb-2" />
                <div className="font-semibold text-sm">단가 인하</div>
                <div className="text-xs text-slate-500 mt-1">% 또는 정액으로 인하</div>
              </div>
            </Link>
            <Link href="/documents/new/price-info">
              <div className="border rounded-lg p-4 bg-white hover:border-emerald-400 hover:shadow-sm transition">
                <ListChecks className="w-5 h-5 text-emerald-600 mb-2" />
                <div className="font-semibold text-sm">단가 안내</div>
                <div className="text-xs text-slate-500 mt-1">품목별 현행 단가 안내</div>
              </div>
            </Link>
            <div className="border rounded-lg p-4 bg-slate-50 opacity-60 cursor-not-allowed">
              <Wallet className="w-5 h-5 text-blue-600 mb-2" />
              <div className="font-semibold text-sm">결제 요청</div>
              <div className="text-xs text-slate-500 mt-1">곧 추가 예정</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 발행 이력 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>발행 이력</span>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-7 h-8 w-56 text-sm"
                  placeholder="문서번호 / 수신 / 제목"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && load(search)}
                />
              </div>
              <Button size="sm" variant="outline" onClick={() => load(search)}>검색</Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-slate-400 py-8">불러오는 중...</p>
          ) : docs.length === 0 ? (
            <p className="text-center text-slate-400 py-8">아직 발행된 공문이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="pb-2 font-medium">문서번호</th>
                    <th className="pb-2 font-medium">유형</th>
                    <th className="pb-2 font-medium">제목</th>
                    <th className="pb-2 font-medium">수신</th>
                    <th className="pb-2 font-medium">발행일</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map(d => {
                    const meta = TYPE_META[d.type] || { label: d.type, icon: FileText, color: 'text-slate-600' }
                    const Icon = meta.icon
                    return (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-2.5 font-mono text-xs text-slate-700">{d.documentNumber}</td>
                        <td>
                          <Badge variant="secondary" className="gap-1">
                            <Icon className={`w-3 h-3 ${meta.color}`} />
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="text-slate-700 max-w-xs truncate">{d.title}</td>
                        <td className="text-slate-600">{d.recipientName}</td>
                        <td className="text-slate-500 text-xs">{new Date(d.createdAt).toLocaleString('ko-KR')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
