'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Search, Users, Pencil, Phone, Mail, ExternalLink, Trash2 } from 'lucide-react'
import { formatKRW } from '@/lib/formatters'

interface Client {
  id: string
  name: string
  phone?: string | null
  email?: string | null
  type?: string | null   // 직군 (Airtable)
}

const emptyForm = { name: '', phone: '', email: '' }

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState<{ clientId: string; stats: { totalSales: number; salesCount: number; totalReceivable: number } } | null>(null)

  const fetchClients = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/clients')
      setClients(await res.json())
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchClients() }, [])

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const url = editingId ? `/api/clients/${editingId}` : '/api/clients'
      const method = editingId ? 'PUT' : 'POST'
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      setDialogOpen(false); setEditingId(null); setForm(emptyForm)
      fetchClients()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 거래처를 Airtable에서 삭제하시겠습니까?\n이 작업은 dian-quote에도 영향을 줍니다.`)) return
    await fetch(`/api/clients/${id}`, { method: 'DELETE' })
    fetchClients()
  }

  const openEdit = (c: Client) => {
    setEditingId(c.id)
    setForm({ name: c.name, phone: c.phone || '', email: c.email || '' })
    setDialogOpen(true)
  }

  const openNew = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true) }

  const viewDetail = async (clientId: string) => {
    if (detail?.clientId === clientId) { setDetail(null); return }
    const res = await fetch(`/api/clients/${clientId}`)
    const data = await res.json()
    setDetail({ clientId, stats: data.stats })
  }

  const filtered = clients.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">거래처 관리</h1>
          <p className="text-sm text-slate-500 flex items-center gap-1">
            dian-quote Airtable과 연동됩니다
            <a
              href="https://airtable.com/appcr2VDa4y17bcwm/tblSCHwKL8RQXSJKS"
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-blue-500 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />Airtable 열기
            </a>
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="gap-1"><Plus className="w-4 h-4" />거래처 등록</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{editingId ? '거래처 수정' : '새 거래처 등록'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              <div>
                <Label>거래처명 *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="예: (주)하나인테리어"
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
              </div>
              <div>
                <Label>전화번호</Label>
                <Input
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="010-0000-0000"
                />
              </div>
              <div>
                <Label>이메일</Label>
                <Input
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="example@email.com"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                * 등록 내용은 dian-quote Airtable에 즉시 반영됩니다
              </p>
              <Button onClick={handleSave} disabled={saving || !form.name} className="w-full">
                {saving ? '저장 중...' : editingId ? '수정 완료' : '등록'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 검색 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="거래처명 · 전화 · 이메일 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="text-sm text-slate-500">{filtered.length}개</div>
        <Button variant="ghost" size="sm" onClick={fetchClients} className="text-xs text-slate-400">
          새로고침
        </Button>
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">
              {search ? '검색 결과가 없습니다' : 'Airtable에 거래처가 없습니다'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <Card
              key={c.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => viewDetail(c.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-900 truncate">{c.name}</h3>
                    {c.type && (
                      <Badge variant="outline" className="text-[10px] mt-0.5">{c.type}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 ml-2">
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 w-7 p-0"
                      onClick={e => { e.stopPropagation(); openEdit(c) }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                      onClick={e => { e.stopPropagation(); handleDelete(c.id, c.name) }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 text-xs text-slate-500 flex-wrap">
                  {c.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />{c.phone}
                    </span>
                  )}
                  {c.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />{c.email}
                    </span>
                  )}
                </div>

                {/* 거래 통계 (클릭 시 펼침) */}
                {detail?.clientId === c.id && (
                  <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-slate-400">총매출</p>
                      <p className="text-sm font-bold">{formatKRW(detail.stats.totalSales)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">거래수</p>
                      <p className="text-sm font-bold">{detail.stats.salesCount}건</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">미수금</p>
                      <p className="text-sm font-bold text-red-600">{formatKRW(detail.stats.totalReceivable)}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
