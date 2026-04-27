'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Plus, Pencil, Search, Package, RefreshCw,
  ExternalLink, TableProperties, ShieldCheck,
} from 'lucide-react'
import { formatKRW, formatPercent, calcMarginRate, getCategoryName, getUnitName } from '@/lib/formatters'

const SHEETS_URL = `https://docs.google.com/spreadsheets/d/${process.env.NEXT_PUBLIC_SHEETS_ID}/edit`

interface Product {
  id: string
  name: string
  category: string
  unit: string
  purchasePrice: number
  sellingPrice: number
  description: string | null
  isActive: boolean
  spec?: string
  alias?: string
  source: 'SHEETS' | 'LOCAL'
}

const CATEGORIES = [
  { value: 'SOFA_FABRIC',    label: '소파원단' },
  { value: 'CURTAIN_FABRIC', label: '커튼원단' },
  { value: 'WALL_FABRIC',    label: '벽원단' },
  { value: 'CURTAIN',        label: '커튼(완제품)' },
  { value: 'SOFA',           label: '소파(완제품)' },
  { value: 'OTHER',          label: '기타' },
]

const UNITS = [
  { value: 'METER', label: '미터' },
  { value: 'YARD',  label: '야드' },
  { value: 'PIECE', label: '개' },
  { value: 'ROLL',  label: '롤' },
]

const emptyLocalForm = {
  name: '', category: 'OTHER', unit: 'METER',
  purchasePrice: 0, sellingPrice: 0, description: '',
}

const emptyMetaForm = {
  purchasePrice: 0, unit: 'METER', category: 'OTHER', description: '',
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterSource, setFilterSource] = useState('')

  // 다이얼로그 상태
  const [localDialogOpen, setLocalDialogOpen] = useState(false)  // 로컬 제품 등록
  const [metaDialogOpen, setMetaDialogOpen] = useState(false)    // Sheets 제품 매입가 편집
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [localForm, setLocalForm] = useState(emptyLocalForm)
  const [metaForm, setMetaForm] = useState(emptyMetaForm)

  const fetchProducts = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/products')
      const data = await res.json()
      setProducts(Array.isArray(data) ? data : [])
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchProducts() }, [])

  // ── Sheets 동기화 ────────────────────────────────────────────────
  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/products/sync', { method: 'POST' })
      const { synced, created, updated } = await res.json()
      alert(`동기화 완료!\n총 ${synced}개 원단\n신규: ${created}개 / 업데이트: ${updated}개`)
      await fetchProducts()
    } catch {
      alert('동기화 실패')
    } finally {
      setSyncing(false)
    }
  }

  // ── 로컬 제품 등록 ────────────────────────────────────────────────
  const handleLocalSave = async () => {
    const url = '/api/products'
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localForm),
      })
      if (res.ok) {
        setLocalDialogOpen(false)
        setLocalForm(emptyLocalForm)
        fetchProducts()
      } else {
        const err = await res.json()
        alert('저장 실패: ' + err.error)
      }
    } catch { alert('저장 실패') }
  }

  // ── Sheets 제품 매입가 편집 ───────────────────────────────────────
  const openMetaEdit = (p: Product) => {
    setEditingProduct(p)
    setMetaForm({
      purchasePrice: p.purchasePrice,
      unit:          p.unit,
      category:      p.category,
      description:   p.description || '',
    })
    setMetaDialogOpen(true)
  }

  const handleMetaSave = async () => {
    if (!editingProduct) return
    try {
      const res = await fetch(`/api/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metaForm),
      })
      if (res.ok) {
        setMetaDialogOpen(false)
        setEditingProduct(null)
        fetchProducts()
      } else {
        const err = await res.json()
        alert('저장 실패: ' + err.error)
      }
    } catch { alert('저장 실패') }
  }

  // ── 로컬 제품 편집 (기존 동작 유지) ─────────────────────────────
  const openLocalEdit = (p: Product) => {
    setEditingProduct(p)
    setLocalForm({
      name:          p.name,
      category:      p.category,
      unit:          p.unit,
      purchasePrice: p.purchasePrice,
      sellingPrice:  p.sellingPrice,
      description:   p.description || '',
    })
    setLocalDialogOpen(true)
  }

  const handleLocalEditSave = async () => {
    if (!editingProduct) return
    try {
      const res = await fetch(`/api/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localForm),
      })
      if (res.ok) {
        setLocalDialogOpen(false)
        setEditingProduct(null)
        setLocalForm(emptyLocalForm)
        fetchProducts()
      } else {
        const err = await res.json()
        alert('저장 실패: ' + err.error)
      }
    } catch { alert('저장 실패') }
  }

  // ── 필터 ─────────────────────────────────────────────────────────
  const filtered = products.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterCategory && p.category !== filterCategory) return false
    if (filterSource && p.source !== filterSource) return false
    return true
  })

  const sheetsCount = products.filter(p => p.source === 'SHEETS').length
  const localCount  = products.filter(p => p.source === 'LOCAL').length

  const marginColor = (rate: number) =>
    rate >= 40 ? 'text-green-600' : rate >= 20 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">제품 관리</h1>
          <p className="text-sm text-slate-500">
            원단명·판매가는 구글 시트에서 관리 &mdash; 매입가는 여기서 입력
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* 구글 시트 열기 */}
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <a href={SHEETS_URL} target="_blank" rel="noopener noreferrer">
              <TableProperties className="w-3.5 h-3.5 text-emerald-600" />
              구글 시트 열기
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          </Button>

          {/* Sheets 동기화 */}
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? '동기화 중...' : 'Sheets 동기화'}
          </Button>

          {/* 로컬 제품 등록 */}
          <Button size="sm" className="gap-1.5"
            onClick={() => { setEditingProduct(null); setLocalForm(emptyLocalForm); setLocalDialogOpen(true) }}>
            <Plus className="w-3.5 h-3.5" />
            기타 제품 등록
          </Button>
        </div>
      </div>

      {/* Sheets 연동 안내 배너 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
        <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
        <div className="text-sm text-emerald-800">
          <span className="font-semibold">구글 시트 연동 중</span>
          {' — '}
          원단명·판매가(단가)는{' '}
          <a href={SHEETS_URL} target="_blank" rel="noopener noreferrer"
            className="underline font-medium">쇼룸단가표</a>
          에서 자동으로 불러옵니다.
          가격 변경은 시트에서 수정 후 <strong>Sheets 동기화</strong> 버튼을 눌러주세요.
          매입가는 이 페이지에서 직접 입력하세요.
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="py-3">
          <CardContent className="text-center p-0">
            <div className="text-2xl font-bold text-slate-900">{products.length}</div>
            <div className="text-xs text-slate-500 mt-0.5">전체 제품</div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="text-center p-0">
            <div className="text-2xl font-bold text-emerald-600">{sheetsCount}</div>
            <div className="text-xs text-slate-500 mt-0.5">Sheets 연동</div>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="text-center p-0">
            <div className="text-2xl font-bold text-blue-600">{localCount}</div>
            <div className="text-xs text-slate-500 mt-0.5">로컬 전용</div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <Input className="pl-9" placeholder="원단명 검색..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">전체 카테고리</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterSource} onChange={e => setFilterSource(e.target.value)}>
          <option value="">전체 출처</option>
          <option value="SHEETS">Sheets 연동</option>
          <option value="LOCAL">로컬 전용</option>
        </select>
      </div>

      {/* 제품 목록 */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 mb-3">
              {products.length === 0
                ? 'Sheets 동기화 버튼을 눌러 원단 목록을 불러오세요.'
                : '검색 결과가 없습니다.'}
            </p>
            {products.length === 0 && (
              <Button variant="outline" onClick={handleSync} disabled={syncing} className="gap-1">
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                Sheets 동기화
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">제품 목록 ({filtered.length}개)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="pb-2 font-medium">원단명</th>
                    <th className="pb-2 font-medium">규격</th>
                    <th className="pb-2 font-medium">카테고리</th>
                    <th className="pb-2 font-medium">단위</th>
                    <th className="pb-2 font-medium text-right">매입가</th>
                    <th className="pb-2 font-medium text-right">
                      판매가
                      <span className="ml-1 text-emerald-600 text-[10px] font-normal">(Sheets)</span>
                    </th>
                    <th className="pb-2 font-medium text-right">마진율</th>
                    <th className="pb-2 font-medium text-right">마진액</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const margin = calcMarginRate(p.sellingPrice, p.purchasePrice)
                    return (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-2.5">
                          <div className="font-medium text-slate-900">{p.name}</div>
                          {p.alias && <div className="text-[11px] text-slate-400">{p.alias}</div>}
                        </td>
                        <td className="text-slate-500 text-xs">{p.spec || '—'}</td>
                        <td>
                          <Badge variant="secondary" className="text-[11px]">
                            {getCategoryName(p.category)}
                          </Badge>
                        </td>
                        <td className="text-slate-600">{getUnitName(p.unit)}</td>
                        <td className="text-right">
                          {p.purchasePrice > 0
                            ? <span className="text-slate-700">{formatKRW(p.purchasePrice)}</span>
                            : <span className="text-slate-300 text-xs">미입력</span>}
                        </td>
                        <td className="text-right font-medium text-emerald-700">
                          {formatKRW(p.sellingPrice)}
                        </td>
                        <td className={`text-right font-bold ${p.purchasePrice > 0 ? marginColor(margin) : 'text-slate-300'}`}>
                          {p.purchasePrice > 0 ? formatPercent(margin) : '—'}
                        </td>
                        <td className="text-right text-slate-600">
                          {p.purchasePrice > 0 ? formatKRW(p.sellingPrice - p.purchasePrice) : '—'}
                        </td>
                        <td className="text-right">
                          <Button variant="ghost" size="sm"
                            onClick={() => p.source === 'SHEETS' ? openMetaEdit(p) : openLocalEdit(p)}
                            title={p.source === 'SHEETS' ? '매입가·카테고리 편집' : '제품 수정'}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Sheets 제품 매입가 편집 다이얼로그 ── */}
      <Dialog open={metaDialogOpen} onOpenChange={setMetaDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TableProperties className="w-4 h-4 text-emerald-600" />
              매입가 · 분류 입력
            </DialogTitle>
          </DialogHeader>

          {editingProduct && (
            <div className="space-y-4">
              {/* 원단명 (읽기전용) */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{editingProduct.name}</span>
                  <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Sheets</Badge>
                </div>
                {editingProduct.spec && (
                  <div className="text-xs text-slate-500 mt-0.5">규격: {editingProduct.spec}</div>
                )}
                <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-500">
                  <span>판매가:</span>
                  <span className="font-semibold text-emerald-700">{formatKRW(editingProduct.sellingPrice)}</span>
                  <span className="ml-1 text-slate-400">(구글 시트에서 관리)</span>
                </div>
              </div>

              {/* 매입가 */}
              <div>
                <Label className="text-xs mb-1 block">매입가 (원) <span className="text-slate-400 font-normal">— CFO 전용, Sheets에 반영 안 됨</span></Label>
                <Input
                  type="number"
                  value={metaForm.purchasePrice}
                  onChange={e => setMetaForm(f => ({ ...f, purchasePrice: parseInt(e.target.value) || 0 }))}
                  min={0}
                />
                {metaForm.purchasePrice > 0 && (
                  <div className="mt-1.5 text-xs text-slate-500">
                    마진율:{' '}
                    <span className={`font-bold ${marginColor(calcMarginRate(editingProduct.sellingPrice, metaForm.purchasePrice))}`}>
                      {formatPercent(calcMarginRate(editingProduct.sellingPrice, metaForm.purchasePrice))}
                    </span>
                    {'  '}마진액:{' '}
                    <span className="font-medium">{formatKRW(editingProduct.sellingPrice - metaForm.purchasePrice)}</span>
                  </div>
                )}
              </div>

              {/* 카테고리 + 단위 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">카테고리</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={metaForm.category}
                    onChange={e => setMetaForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">단위</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={metaForm.unit}
                    onChange={e => setMetaForm(f => ({ ...f, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
              </div>

              {/* 메모 */}
              <div>
                <Label className="text-xs mb-1 block">메모 (선택)</Label>
                <Input
                  value={metaForm.description}
                  onChange={e => setMetaForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="색상, 소재, 특이사항 등"
                />
              </div>

              <Button onClick={handleMetaSave} className="w-full">저장</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── 로컬 제품 등록/편집 다이얼로그 ── */}
      <Dialog open={localDialogOpen} onOpenChange={v => { setLocalDialogOpen(v); if (!v) setEditingProduct(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? '제품 수정' : '기타 제품 등록'}
              {!editingProduct && (
                <span className="text-xs font-normal text-slate-400 ml-2">구글 시트에 없는 CFO 전용 제품</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>제품명 *</Label>
              <Input
                value={localForm.name}
                onChange={e => setLocalForm(f => ({ ...f, name: e.target.value }))}
                placeholder="예: 배송비, 설치비 등"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>카테고리 *</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={localForm.category}
                  onChange={e => setLocalForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <Label>단위 *</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={localForm.unit}
                  onChange={e => setLocalForm(f => ({ ...f, unit: e.target.value }))}>
                  {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>매입가 (원)</Label>
                <Input type="number" value={localForm.purchasePrice} min={0}
                  onChange={e => setLocalForm(f => ({ ...f, purchasePrice: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <Label>판매가 (원)</Label>
                <Input type="number" value={localForm.sellingPrice} min={0}
                  onChange={e => setLocalForm(f => ({ ...f, sellingPrice: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            {localForm.sellingPrice > 0 && (
              <div className="p-3 bg-slate-50 rounded-lg text-sm">
                마진:{' '}
                <span className={`font-bold ${marginColor(calcMarginRate(localForm.sellingPrice, localForm.purchasePrice))}`}>
                  {formatPercent(calcMarginRate(localForm.sellingPrice, localForm.purchasePrice))}
                </span>
                <span className="text-slate-500 ml-2">
                  ({formatKRW(localForm.sellingPrice - localForm.purchasePrice)}/단위)
                </span>
              </div>
            )}
            <div>
              <Label>설명 (선택)</Label>
              <Input
                value={localForm.description}
                onChange={e => setLocalForm(f => ({ ...f, description: e.target.value }))}
                placeholder="메모"
              />
            </div>
            <Button
              onClick={editingProduct ? handleLocalEditSave : handleLocalSave}
              className="w-full">
              {editingProduct ? '수정 완료' : '등록'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
