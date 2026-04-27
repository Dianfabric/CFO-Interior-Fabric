'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Wallet, Trash2, ChevronLeft, ChevronRight, PackageOpen } from 'lucide-react'
import { formatKRW } from '@/lib/formatters'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

interface MonthlyCost {
  id: string
  yearMonth: string
  amount: number
  source: string
  notes: string | null
}

interface RecurringCost {
  id: string
  costCategoryId: string
  description: string
  amount: number
  frequency: string
  notes: string | null
}

interface CostCategory {
  id: string
  name: string
  type: string
  recurringCosts: RecurringCost[]
  monthlyCosts: MonthlyCost[]
}

const COST_TYPES = [
  { value: 'RAW_MATERIAL', label: '원자재' },
  { value: 'LABOR', label: '인건비' },
  { value: 'RENT', label: '임대료' },
  { value: 'LOGISTICS', label: '물류/배송' },
  { value: 'UTILITIES', label: '공과금' },
  { value: 'MARKETING', label: '마케팅' },
  { value: 'OTHER', label: '기타' },
]
const FREQUENCIES = [
  { value: 'MONTHLY', label: '매월' },
  { value: 'QUARTERLY', label: '분기' },
  { value: 'YEARLY', label: '연간' },
]
const TYPE_COLORS: Record<string, string> = {
  RAW_MATERIAL: '#3b82f6', LABOR: '#ef4444', RENT: '#f59e0b',
  LOGISTICS: '#22c55e', UTILITIES: '#8b5cf6', MARKETING: '#ec4899', OTHER: '#94a3b8',
}
const getTypeName = (type: string) => COST_TYPES.find(t => t.value === type)?.label || type
const getFreqName = (freq: string) => FREQUENCIES.find(f => f.value === freq)?.label || freq
const toMonthly = (amount: number, frequency: string) => {
  if (frequency === 'QUARTERLY') return Math.round(amount / 3)
  if (frequency === 'YEARLY') return Math.round(amount / 12)
  return amount
}

function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getYearMonth(offset = 0) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return toYearMonth(d)
}

function formatYearMonth(ym: string) {
  const [y, m] = ym.split('-')
  return `${y}년 ${parseInt(m)}월`
}

export default function CostsPage() {
  const [categories, setCategories] = useState<CostCategory[]>([])
  const [monthlyFixedTotal, setMonthlyFixedTotal] = useState(0)
  const [monthlyActualTotal, setMonthlyActualTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [yearMonth, setYearMonth] = useState(getYearMonth(0))
  const [catDialogOpen, setCatDialogOpen] = useState(false)
  const [costDialogOpen, setCostDialogOpen] = useState(false)
  const [monthlyDialogCat, setMonthlyDialogCat] = useState<CostCategory | null>(null)
  const [catForm, setCatForm] = useState({ name: '', type: 'RAW_MATERIAL' })
  const [costForm, setCostForm] = useState({ costCategoryId: '', description: '', amount: 0, frequency: 'MONTHLY', notes: '' })
  const [monthlyForm, setMonthlyForm] = useState({ amount: 0, notes: '' })

  const fetchCosts = async (ym = yearMonth) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/costs?yearMonth=${ym}`)
      const data = await res.json()
      setCategories(data.categories ?? [])
      setMonthlyFixedTotal(data.monthlyFixedTotal ?? 0)
      setMonthlyActualTotal(data.monthlyActualTotal ?? 0)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchCosts(yearMonth) }, [yearMonth])

  const moveMonth = (delta: number) => {
    const [y, m] = yearMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setYearMonth(toYearMonth(d))
  }

  const handleAddCategory = async () => {
    if (!catForm.name) return
    await fetch('/api/costs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'category', ...catForm }) })
    setCatDialogOpen(false); setCatForm({ name: '', type: 'RAW_MATERIAL' }); fetchCosts()
  }

  const handleAddCost = async () => {
    if (!costForm.costCategoryId || !costForm.description || !costForm.amount) return
    await fetch('/api/costs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'recurring', ...costForm }) })
    setCostDialogOpen(false); setCostForm({ costCategoryId: '', description: '', amount: 0, frequency: 'MONTHLY', notes: '' }); fetchCosts()
  }

  const handleSaveMonthly = async () => {
    if (!monthlyDialogCat || !monthlyForm.amount) return
    await fetch('/api/costs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'monthly', costCategoryId: monthlyDialogCat.id, yearMonth, amount: monthlyForm.amount, notes: monthlyForm.notes }),
    })
    setMonthlyDialogCat(null); setMonthlyForm({ amount: 0, notes: '' }); fetchCosts()
  }

  const handleDelete = async (type: string, id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch(`/api/costs?type=${type}&id=${id}`, { method: 'DELETE' })
    fetchCosts()
  }

  const pieData = categories
    .filter(c => c.recurringCosts.length > 0)
    .map(c => ({
      name: c.name,
      value: c.recurringCosts.reduce((s, rc) => s + toMonthly(rc.amount, rc.frequency), 0),
      type: c.type,
    }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">비용 관리</h1>
          <p className="text-sm text-slate-500">고정비·변동비를 관리하고 비용 구조를 분석합니다</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-1"><Plus className="w-4 h-4" />카테고리 추가</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>비용 카테고리 추가</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>카테고리명</Label><Input value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} placeholder="예: 사무실 관리비" /></div>
                <div>
                  <Label>유형</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={catForm.type} onChange={e => setCatForm({ ...catForm, type: e.target.value })}>
                    {COST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <Button onClick={handleAddCategory} className="w-full">추가</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={costDialogOpen} onOpenChange={setCostDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1"><Plus className="w-4 h-4" />비용 항목 추가</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>고정 비용 항목 추가</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>카테고리</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={costForm.costCategoryId} onChange={e => setCostForm({ ...costForm, costCategoryId: e.target.value })}>
                    <option value="">선택...</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><Label>항목 설명</Label><Input value={costForm.description} onChange={e => setCostForm({ ...costForm, description: e.target.value })} placeholder="예: 공장 월 임대료" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>금액 (원)</Label><Input type="number" value={costForm.amount} onChange={e => setCostForm({ ...costForm, amount: parseInt(e.target.value) || 0 })} /></div>
                  <div>
                    <Label>주기</Label>
                    <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={costForm.frequency} onChange={e => setCostForm({ ...costForm, frequency: e.target.value })}>
                      {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                </div>
                <div><Label>메모 (선택)</Label><Input value={costForm.notes} onChange={e => setCostForm({ ...costForm, notes: e.target.value })} /></div>
                <Button onClick={handleAddCost} className="w-full">추가</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 월 선택기 */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => moveMonth(-1)}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="text-base font-semibold text-slate-700 min-w-[120px] text-center">{formatYearMonth(yearMonth)}</span>
        <Button variant="ghost" size="sm" onClick={() => moveMonth(1)}><ChevronRight className="w-4 h-4" /></Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">월간 고정비 합계</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatKRW(monthlyFixedTotal)}</p>
            <p className="text-xs text-slate-400 mt-1">연간 {formatKRW(monthlyFixedTotal * 12)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">{formatYearMonth(yearMonth)} 월별 실적 비용</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatKRW(monthlyActualTotal)}</p>
            <p className="text-xs text-slate-400 mt-1">해외운송비 등 실적 합계</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">비용 카테고리</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{categories.length}개</p>
            <p className="text-xs text-slate-400 mt-1">항목 {categories.reduce((s, c) => s + c.recurringCosts.length, 0)}개</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 비용 구조 파이차트 */}
        <Card>
          <CardHeader><CardTitle className="text-base">고정비 구조 (월간 환산)</CardTitle></CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-center text-slate-400 py-12">비용 데이터를 입력하면 차트가 표시됩니다</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" nameKey="name"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((entry, i) => <Cell key={i} fill={TYPE_COLORS[entry.type] || '#94a3b8'} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatKRW(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 카테고리별 상세 */}
        <Card>
          <CardHeader><CardTitle className="text-base">카테고리별 상세</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
            ) : categories.length === 0 ? (
              <div className="text-center py-12">
                <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">비용 카테고리를 먼저 추가해주세요</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {categories.map(cat => {
                  const fixedMonthly = cat.recurringCosts.reduce((s, r) => s + toMonthly(r.amount, r.frequency), 0)
                  const actualCost = cat.monthlyCosts[0]
                  return (
                    <div key={cat.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TYPE_COLORS[cat.type] || '#94a3b8' }} />
                          <span className="font-medium text-sm">{cat.name}</span>
                          <Badge variant="secondary" className="text-xs">{getTypeName(cat.type)}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{formatKRW(fixedMonthly)}/월</span>
                          <button onClick={() => handleDelete('category', cat.id)} className="text-slate-300 hover:text-red-400">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* 고정비 항목 */}
                      {cat.recurringCosts.length === 0 ? (
                        <p className="text-xs text-slate-400 ml-5">항목 없음</p>
                      ) : (
                        <div className="space-y-1 ml-5">
                          {cat.recurringCosts.map(rc => (
                            <div key={rc.id} className="flex justify-between text-xs text-slate-600">
                              <span>{rc.description}</span>
                              <div className="flex items-center gap-2">
                                <span>{formatKRW(rc.amount)} ({getFreqName(rc.frequency)})</span>
                                <button onClick={() => handleDelete('recurring', rc.id)} className="text-slate-300 hover:text-red-400">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 월별 실적 비용 */}
                      <div className="mt-2 ml-5 pt-2 border-t border-dashed">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <PackageOpen className="w-3 h-3 text-orange-400" />
                            <span className="text-xs text-orange-600 font-medium">{formatYearMonth(yearMonth)} 실적</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {actualCost ? (
                              <>
                                <span className="text-xs font-bold text-orange-700">{formatKRW(actualCost.amount)}</span>
                                <Badge variant="outline" className="text-xs py-0">
                                  {actualCost.source === 'PDF_UPLOAD' ? 'PDF' : '수동'}
                                </Badge>
                                <button onClick={() => handleDelete('monthly', actualCost.id)} className="text-slate-300 hover:text-red-400">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400">미입력</span>
                            )}
                            <button
                              onClick={() => { setMonthlyDialogCat(cat); setMonthlyForm({ amount: actualCost?.amount ?? 0, notes: actualCost?.notes ?? '' }) }}
                              className="text-xs text-blue-500 hover:text-blue-700 underline"
                            >
                              {actualCost ? '수정' : '입력'}
                            </button>
                          </div>
                        </div>
                        {actualCost?.notes && (
                          <p className="text-xs text-slate-400 mt-0.5">{actualCost.notes}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 월별 실적 입력 다이얼로그 */}
      <Dialog open={!!monthlyDialogCat} onOpenChange={open => { if (!open) setMonthlyDialogCat(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{monthlyDialogCat?.name} — {formatYearMonth(yearMonth)} 실적 입력</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>금액 (원)</Label><Input type="number" value={monthlyForm.amount} onChange={e => setMonthlyForm({ ...monthlyForm, amount: parseInt(e.target.value) || 0 })} /></div>
            <div><Label>메모 (선택)</Label><Input value={monthlyForm.notes} onChange={e => setMonthlyForm({ ...monthlyForm, notes: e.target.value })} placeholder="예: 관세 300만 + 로드썬 500만" /></div>
            <Button onClick={handleSaveMonthly} className="w-full">저장</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
