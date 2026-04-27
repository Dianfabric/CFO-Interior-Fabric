'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Sparkles, FileDown, Image as ImageIcon,
  Save, Plus, X, TrendingUp, TrendingDown, RefreshCw, CloudUpload,
} from 'lucide-react'
import DocumentLayout from '@/components/documents/DocumentLayout'
import PriceChangeTable, { PriceRow } from '@/components/documents/PriceChangeTable'
import PriceChangeRangeTable from '@/components/documents/PriceChangeRangeTable'
import ClientCombobox, { ClientOption } from '@/components/documents/ClientCombobox'
import { downloadPDF, downloadJPG, getCanvasBlob, getPDFBlob } from '@/lib/document-export'
import { useGoogleDrive } from '@/hooks/useGoogleDrive'
import { getOrCreateFolder, uploadToDrive } from '@/lib/google-drive'

const ROOT_FOLDER_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_ROOT_FOLDER_ID ?? ''

type AdjustMode = 'PERCENT' | 'AMOUNT' | 'MANUAL'
type DocMode = 'ITEM' | 'WHOLE'

interface Product { id: string; name: string; unit: string; sellingPrice: number }

interface RowData extends PriceRow { _productId?: string }

interface FormState {
  recipientClientId: string
  recipientName: string
  ccLine: string
  title: string
  issueDate: string   // YYYY-MM-DD (비어있으면 오늘 날짜 자동)
  effectiveDate: string
  docMode: DocMode      // 품목별 | 전체 단가
  showDiscount: boolean // 특별할인 컬럼 표시
  adjustMode: AdjustMode
  adjustValue: number
  rangeUnit: 'PERCENT' | 'AMOUNT'
  rangeMin: number
  rangeMax: number
  bodyText: string
  rows: RowData[]
  aiKeywords: string
}

const DEFAULT_BODY = `1. 귀사의 무궁한 발전을 기원합니다.

2. 평소 저희 제품에 대한 변함없는 신뢰와 거래에 진심으로 감사드립니다.

3. 원자재 가격, 물류비, 인건비 상승으로 생산 원가가 지속적으로 상승해 왔습니다.

4. 자체 흡수 노력에도 더 이상 가격 동결을 유지하기 어려운 상황에 이르렀습니다.

5. 부득이하게 아래와 같이 단가를 조정하게 되었습니다.

6. 변함없는 품질과 서비스로 보답하겠습니다. 너그러운 양해를 부탁드립니다.

7. 감사합니다. 문의사항은 언제든 연락 주시기 바랍니다.`

function krw(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원'
}
function applyAdjust(old: number, mode: AdjustMode, val: number, dir: 'UP' | 'DOWN') {
  if (mode === 'MANUAL') return old
  const sign = dir === 'UP' ? 1 : -1
  if (mode === 'PERCENT') return Math.round(old * (1 + (sign * val) / 100))
  return Math.max(0, Math.round(old + sign * val))
}

export default function PriceChangeForm() {
  const router = useRouter()
  const sp = useSearchParams()
  const direction = (sp.get('direction') === 'DOWN' ? 'DOWN' : 'UP') as 'UP' | 'DOWN'

  const [clients, setClients] = useState<ClientOption[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [profile, setProfile] = useState<Record<string, string> | null>(null)
  const [docNumber, setDocNumber] = useState('')

  const [form, setForm] = useState<FormState>({
    recipientClientId: '',
    recipientName: '',
    ccLine: '',
    title: direction === 'UP' ? '원단 단가 인상 안내의 건' : '원단 단가 인하 안내의 건',
    issueDate: '',
    effectiveDate: '',
    docMode: 'ITEM',
    showDiscount: false,
    adjustMode: 'PERCENT',
    rangeUnit: 'PERCENT',
    rangeMin: 10,
    rangeMax: 20,
    adjustValue: 10,
    bodyText: DEFAULT_BODY,
    rows: [],
    aiKeywords: '',
  })

  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savePhase, setSavePhase] = useState<'' | 'db' | 'drive'>('')
  const [downloading, setDownloading] = useState<'' | 'pdf' | 'jpg'>('')

  const { getToken } = useGoogleDrive()

  const [productSearchLoading, setProductSearchLoading] = useState(false)

  // ── 초기 로드 ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients).catch(() => {})
    fetch('/api/company-profile').then(r => r.json()).then(setProfile).catch(() => {})
    fetch('/api/documents/next-number')
      .then(r => r.json()).then(j => setDocNumber(j.documentNumber || '')).catch(() => {})
  }, [])

  // ── 품목 검색 (서버사이드, 디바운스 300ms) ──────────────────────
  useEffect(() => {
    if (!productSearch.trim()) { setProducts([]); return }
    const timer = setTimeout(async () => {
      setProductSearchLoading(true)
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&active=true`)
        setProducts(await res.json())
      } catch { setProducts([]) }
      finally { setProductSearchLoading(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch])

  // ── 거래처 선택 → 수신 표시 자동 채움 ──────────────────────────
  const handleClientChange = (id: string, client: ClientOption | null) => {
    setForm(s => ({
      ...s,
      recipientClientId: id,
      recipientName: client
        ? `${client.name}${client.contactName ? ' / ' + client.contactName : ''} 귀하`
        : '',
    }))

    // 이미 추가된 품목에 마지막 단가 반영
    if (id && form.rows.length > 0) {
      const pids = form.rows.map(r => r._productId).filter(Boolean) as string[]
      if (pids.length === 0) return
      fetch(`/api/documents/last-prices?clientId=${id}&productIds=${pids.join(',')}`)
        .then(r => r.json())
        .then(map => {
          setForm(s => ({
            ...s,
            rows: s.rows.map(r => {
              if (!r._productId || !map[r._productId]) return r
              const lastPrice: number = map[r._productId].unitPrice
              return {
                ...r,
                oldPrice: lastPrice,
                newPrice: applyAdjust(lastPrice, s.adjustMode, s.adjustValue, direction),
              }
            }),
          }))
        })
        .catch(() => {})
    }
  }

  // ── 발신 문자열 ──────────────────────────────────────────────────
  const senderLine = useMemo(() => {
    if (!profile?.name) return '－'
    return `${profile.name}${profile.representative ? ' / 대표 ' + profile.representative : ''}`
  }, [profile])

  // filteredProducts = 서버에서 이미 필터된 결과
  const filteredProducts = products

  // ── 본문 줄간격 자동 계산 ─────────────────────────────────────
  // 품목 수가 많을수록 줄간격을 줄여 A4 한 장에 맞춤
  // ITEM: 품목 행 수 기준 / WHOLE: 항상 1행으로 취급
  const bodyLineHeight = useMemo(() => {
    const rowCount = form.docMode === 'ITEM' ? form.rows.length : 1
    // 0행 → 1.95, 행마다 0.045씩 감소, 최소 1.35
    return Math.max(1.35, 1.95 - rowCount * 0.045)
  }, [form.docMode, form.rows.length])

  // ── 품목 행 추가 ──────────────────────────────────────────────
  const addProductRow = async (p: Product) => {
    let oldPrice = p.sellingPrice
    if (form.recipientClientId) {
      try {
        const r = await fetch(
          `/api/documents/last-prices?clientId=${form.recipientClientId}&productIds=${p.id}`
        )
        const map = await r.json()
        if (map[p.id]) oldPrice = map[p.id].unitPrice
      } catch {}
    }
    const newPrice = applyAdjust(oldPrice, form.adjustMode, form.adjustValue, direction)
    setForm(s => ({
      ...s,
      rows: [...s.rows, { _productId: p.id, productName: p.name, unit: p.unit, oldPrice, newPrice }],
    }))
  }
  const updateRow = (i: number, patch: Partial<PriceRow>) =>
    setForm(s => ({ ...s, rows: s.rows.map((r, idx) => idx === i ? { ...r, ...patch } : r) }))
  const removeRow = (i: number) =>
    setForm(s => ({ ...s, rows: s.rows.filter((_, idx) => idx !== i) }))

  // ── 일괄 재계산 ────────────────────────────────────────────────
  const recalcAll = () =>
    setForm(s => ({
      ...s,
      rows: s.rows.map(r => ({
        ...r,
        newPrice: applyAdjust(r.oldPrice, s.adjustMode, s.adjustValue, direction),
      })),
    }))

  // ── AI 초안 ───────────────────────────────────────────────────
  const handleAiDraft = async () => {
    setAiLoading(true)
    try {
      const res = await fetch('/api/documents/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PRICE_CHANGE',
          recipientName: form.recipientName,
          keywords:
            form.aiKeywords +
            `\n방향: ${direction === 'UP' ? '인상' : '인하'}` +
            (form.effectiveDate ? `\n적용일: ${form.effectiveDate}` : ''),
          currentBody: form.bodyText !== DEFAULT_BODY ? form.bodyText : '',
        }),
      })
      const json = await res.json()
      if (json.text) setForm(s => ({ ...s, bodyText: json.text }))
    } catch {}
    setAiLoading(false)
  }

  // ── 파일명 ────────────────────────────────────────────────────
  const filenameBase = useMemo(() => {
    const name = clients.find(c => c.id === form.recipientClientId)?.name || '거래처'
    const dir = direction === 'UP' ? '단가인상' : '단가인하'
    return `${docNumber}_${dir}_${name}`.replace(/\s+/g, '')
  }, [form.recipientClientId, clients, docNumber, direction])

  const handleDownloadPDF = async () => {
    setDownloading('pdf')
    try { await downloadPDF(filenameBase) } catch { alert('PDF 생성 실패') }
    setDownloading('')
  }
  const handleDownloadJPG = async () => {
    setDownloading('jpg')
    try { await downloadJPG(filenameBase) } catch { alert('JPG 생성 실패') }
    setDownloading('')
  }

  // ── 저장 (DB → 구글 드라이브) ────────────────────────────────
  const handleSave = async () => {
    if (!form.recipientName) { alert('수신 정보를 입력해주세요.'); return }
    setSaving(true)
    setSavePhase('db')
    let savedId: string | null = null
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PRICE_CHANGE',
          title: form.title,
          recipientClientId: form.recipientClientId || null,
          recipientName: form.recipientName,
          ccLine: form.ccLine,
          senderLine,
          bodyText: form.bodyText,
          tableJson: form.rows.map(({ _productId: _p, ...r }) => r),
          metaJson: { direction, adjustMode: form.adjustMode, adjustValue: form.adjustValue, issueDate: form.issueDate, effectiveDate: form.effectiveDate },
          documentNumber: docNumber,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert('저장 실패: ' + (err.error || res.status))
        setSaving(false); setSavePhase('')
        return
      }
      const saved = await res.json()
      savedId = saved.id
    } catch {
      alert('저장 실패')
      setSaving(false); setSavePhase('')
      return
    }

    // ── 구글 드라이브 업로드 ────────────────────────────────────
    if (ROOT_FOLDER_ID && savedId) {
      setSavePhase('drive')
      try {
        const token = await getToken()

        // 폴더 확보: 공문 모음
        const folderId = await getOrCreateFolder('공문 모음', ROOT_FOLDER_ID, token)

        // PDF + JPG 병렬 생성
        const [pdfBlob, jpgBlob] = await Promise.all([
          getPDFBlob('document-print-area'),
          getCanvasBlob('document-print-area', 'image/jpeg', 0.95),
        ])

        // 병렬 업로드
        const [driveFileId, driveJpgId] = await Promise.all([
          uploadToDrive(pdfBlob, `${filenameBase}.pdf`, 'application/pdf', folderId, token),
          uploadToDrive(jpgBlob, `${filenameBase}.jpg`, 'image/jpeg', folderId, token),
        ])

        // DB 업데이트
        await fetch(`/api/documents/${savedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveFileId, driveJpgId }),
        })


      } catch (driveErr) {
        console.error('Drive upload failed:', driveErr)
        // 드라이브 실패는 경고만 — DB 저장은 성공했으므로 이동 계속
        alert(`구글 드라이브 저장 실패: ${driveErr instanceof Error ? driveErr.message : '알 수 없는 오류'}\n\n공문은 DB에 저장되었습니다.`)
      }
    }

    setSaving(false)
    setSavePhase('')
    router.push('/documents')
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/documents" className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> 공문 목록
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mt-1">
            {direction === 'UP'
              ? <TrendingUp className="w-6 h-6 text-rose-600" />
              : <TrendingDown className="w-6 h-6 text-emerald-600" />}
            {direction === 'UP' ? '단가 인상' : '단가 인하'} 공문 작성
          </h1>
          <p className="text-sm text-slate-500">왼쪽에서 입력 → 오른쪽 미리보기에 즉시 반영</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleDownloadJPG}
            disabled={!!downloading} className="gap-1">
            <ImageIcon className="w-3.5 h-3.5" />
            {downloading === 'jpg' ? '생성 중...' : 'JPG'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadPDF}
            disabled={!!downloading} className="gap-1">
            <FileDown className="w-3.5 h-3.5" />
            {downloading === 'pdf' ? '생성 중...' : 'PDF'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
            {savePhase === 'drive'
              ? <CloudUpload className="w-3.5 h-3.5 animate-pulse" />
              : <Save className="w-3.5 h-3.5" />}
            {savePhase === 'db' ? 'DB 저장 중...'
              : savePhase === 'drive' ? '드라이브 저장 중...'
              : '발행 및 저장'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[440px_1fr] gap-4 items-start">
        {/* ───── 좌측: 폼 ───── */}
        <div className="space-y-3">
          {/* 기본 정보 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                기본 정보
                <span className="font-mono text-xs text-slate-500 font-normal">{docNumber || '...'}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">

              {/* ★ 수신 거래처 — 검색 가능한 컴포넌트 */}
              <div>
                <Label className="text-xs mb-1 block">수신 거래처</Label>
                <ClientCombobox
                  clients={clients}
                  value={form.recipientClientId}
                  onChange={handleClientChange}
                />
                {clients.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    거래처가 없습니다.{' '}
                    <Link href="/clients" className="underline">거래처 관리</Link>에서 먼저 추가하세요.
                  </p>
                )}
              </div>

              {/* 수신 표시 — 자동 채움 후 수동 수정 가능 */}
              <div>
                <Label className="text-xs mb-1 block">
                  수신 표시
                  <span className="text-slate-400 font-normal ml-1">(공문에 표시될 텍스트)</span>
                </Label>
                <Input
                  value={form.recipientName}
                  onChange={e => setForm(s => ({ ...s, recipientName: e.target.value }))}
                  placeholder="○○인테리어 / 김○○ 귀하"
                />
              </div>

              <div>
                <Label className="text-xs mb-1 block">참조 <span className="text-slate-400 font-normal">(선택)</span></Label>
                <Input
                  value={form.ccLine}
                  onChange={e => setForm(s => ({ ...s, ccLine: e.target.value }))}
                  placeholder="담당자명 등"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">제목</Label>
                <Input
                  value={form.title}
                  onChange={e => setForm(s => ({ ...s, title: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs mb-1 block">
                    발행일자
                    <span className="text-slate-400 font-normal ml-1">(비우면 오늘)</span>
                  </Label>
                  <Input
                    type="date"
                    value={form.issueDate}
                    onChange={e => setForm(s => ({ ...s, issueDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">적용 시점</Label>
                  <Input
                    type="date"
                    value={form.effectiveDate}
                    onChange={e => setForm(s => ({ ...s, effectiveDate: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 공문 방식 + 가격 변경 방식 / 전체 단가 범위 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">공문 방식</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 모드 토글 */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['ITEM', 'WHOLE'] as DocMode[]).map(m => (
                  <button key={m}
                    onClick={() => setForm(s => ({ ...s, docMode: m }))}
                    className={`text-xs py-2 rounded-md transition font-medium
                      ${form.docMode === m ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {m === 'ITEM' ? '📋 품목별 인상' : '📊 전체 단가 범위'}
                  </button>
                ))}
              </div>

              {/* ── ITEM 모드: 가격 변경 방식 ── */}
              {form.docMode === 'ITEM' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">가격 변경 방식</span>
                    <Button size="sm" variant="ghost" onClick={recalcAll} className="h-7 gap-1 text-xs">
                      <RefreshCw className="w-3 h-3" />일괄 적용
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                    {(['PERCENT', 'AMOUNT', 'MANUAL'] as AdjustMode[]).map(m => (
                      <button key={m}
                        onClick={() => setForm(s => ({
                          ...s,
                          adjustMode: m,
                          adjustValue: m === 'AMOUNT' ? 1000 : m === 'PERCENT' ? 10 : s.adjustValue,
                        }))}
                        className={`text-xs py-1.5 rounded-md transition
                          ${form.adjustMode === m ? 'bg-white shadow font-semibold text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {m === 'PERCENT' ? '퍼센트 (%)' : m === 'AMOUNT' ? '정액 (원)' : '직접 입력'}
                      </button>
                    ))}
                  </div>
                  {form.adjustMode !== 'MANUAL' && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={form.adjustValue}
                        onChange={e => setForm(s => ({ ...s, adjustValue: Number(e.target.value) || 0 }))}
                        className="w-28"
                        min={form.adjustMode === 'AMOUNT' ? 500 : 0}
                        step={form.adjustMode === 'AMOUNT' ? 500 : 1}
                      />
                      <span className="text-sm text-slate-600">{form.adjustMode === 'PERCENT' ? '%' : '원'}</span>
                      <Badge variant="outline" className={`ml-auto ${direction === 'UP' ? 'text-rose-600 border-rose-200' : 'text-emerald-600 border-emerald-200'}`}>
                        {direction === 'UP' ? '인상' : '인하'}
                      </Badge>
                    </div>
                  )}
                  {form.adjustMode === 'MANUAL' && (
                    <p className="text-xs text-slate-500">아래 표에서 각 품목의 신가격을 직접 입력하세요.</p>
                  )}
                </>
              )}

              {/* ── WHOLE 모드: 범위 입력 ── */}
              {form.docMode === 'WHOLE' && (
                <>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                    {(['PERCENT', 'AMOUNT'] as const).map(u => (
                      <button key={u}
                        onClick={() => setForm(s => ({ ...s, rangeUnit: u }))}
                        className={`text-xs py-1.5 rounded-md transition
                          ${form.rangeUnit === u ? 'bg-white shadow font-semibold text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {u === 'PERCENT' ? '퍼센트 (%)' : '정액 (원)'}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs mb-1 block">
                        최소 <span className="text-slate-400">{form.rangeUnit === 'PERCENT' ? '(%)' : '(원)'}</span>
                      </Label>
                      <Input
                        type="number"
                        value={form.rangeMin}
                        onChange={e => setForm(s => ({ ...s, rangeMin: Number(e.target.value) || 0 }))}
                        min={0}
                        step={form.rangeUnit === 'AMOUNT' ? 500 : 1}
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">
                        최대 <span className="text-slate-400">{form.rangeUnit === 'PERCENT' ? '(%)' : '(원)'}</span>
                      </Label>
                      <Input
                        type="number"
                        value={form.rangeMax}
                        onChange={e => setForm(s => ({ ...s, rangeMax: Number(e.target.value) || 0 }))}
                        min={0}
                        step={form.rangeUnit === 'AMOUNT' ? 500 : 1}
                      />
                    </div>
                  </div>
                  <div className={`text-xs rounded-lg p-2.5 text-center font-semibold
                    ${direction === 'UP' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    전 품목 {direction === 'UP' ? '인상' : '인하'} 폭 :{' '}
                    약{' '}
                    {form.rangeUnit === 'PERCENT'
                      ? `${form.rangeMin}% ~ ${form.rangeMax}%`
                      : `${form.rangeMin.toLocaleString()}원 ~ ${form.rangeMax.toLocaleString()}원`}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* 품목 — ITEM 모드에서만 표시 */}
          {form.docMode === 'ITEM' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>품목 <span className="text-slate-400 font-normal text-xs">({form.rows.length}개)</span></span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setForm(s => ({ ...s, showDiscount: !s.showDiscount }))}
                    className={`h-7 px-2.5 text-xs rounded-md border transition
                      ${form.showDiscount
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600'}`}
                  >
                    특별할인
                  </button>
                  <Button size="sm" variant="outline" onClick={() => setProductPickerOpen(v => !v)} className="h-7 gap-1 text-xs">
                    <Plus className="w-3 h-3" />품목 추가
                  </Button>
                </div>
              </CardTitle>
              {form.showDiscount && (
                <p className="text-[11px] text-blue-600 bg-blue-50 rounded-md px-2.5 py-1.5 mt-1 leading-relaxed">
                  특별할인 ON — 각 품목에 할인 금액을 입력하면 공문 표에 <strong>인상가 → 특별할인 → 최종단가</strong> 컬럼이 표시됩니다.
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {productPickerOpen && (
                <div className="border rounded-lg p-2 bg-slate-50 max-h-64 overflow-y-auto">
                  <Input
                    placeholder="원단명 검색 (예: HALO, 바론, 극세사...)"
                    className="h-8 text-sm mb-2"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    autoFocus
                  />
                  {productSearchLoading ? (
                    <p className="text-xs text-slate-400 text-center py-3">검색 중...</p>
                  ) : !productSearch.trim() ? (
                    <p className="text-xs text-slate-400 text-center py-3">원단명을 입력하면 검색됩니다</p>
                  ) : filteredProducts.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">결과 없음</p>
                  ) : filteredProducts.map(p => (
                    <button key={p.id}
                      onClick={() => { addProductRow(p); setProductSearch('') }}
                      className="w-full text-left px-2.5 py-2 rounded-md hover:bg-white text-sm flex justify-between items-center"
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-slate-500">{krw(p.sellingPrice)}/{p.unit}</span>
                    </button>
                  ))}
                </div>
              )}

              {form.rows.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-5">품목을 추가해 주세요</p>
              ) : (
                <div className="space-y-2">
                  {form.rows.map((r, i) => (
                    <div key={i} className="border rounded-lg p-2.5 bg-white">
                      <div className="flex items-center justify-between mb-2">
                        <input
                          className="text-sm font-medium bg-transparent flex-1 outline-none min-w-0"
                          value={r.productName}
                          onChange={e => updateRow(i, { productName: e.target.value })}
                        />
                        <button onClick={() => removeRow(i)} className="text-slate-400 hover:text-rose-500 ml-2">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className={`grid gap-2 ${form.showDiscount ? 'grid-cols-4' : 'grid-cols-3'}`}>
                        <div>
                          <p className="text-[10px] text-slate-500 mb-0.5">단위</p>
                          <Input className="h-7 text-xs" value={r.unit || ''} onChange={e => updateRow(i, { unit: e.target.value })} />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 mb-0.5">기존 가격</p>
                          <Input type="number" className="h-7 text-xs" value={r.oldPrice}
                            onChange={e => updateRow(i, { oldPrice: Number(e.target.value) || 0 })} />
                        </div>
                        <div>
                          <p className={`text-[10px] mb-0.5 ${direction === 'UP' ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {direction === 'UP' ? '인상 가격' : '인하 가격'}
                          </p>
                          <Input type="number" className="h-7 text-xs" value={r.newPrice}
                            onChange={e => updateRow(i, { newPrice: Number(e.target.value) || 0 })} />
                        </div>
                        {form.showDiscount && (
                          <div>
                            <p className="text-[10px] text-blue-600 mb-0.5 font-medium">특별할인 (−)</p>
                            <Input
                              type="number"
                              className="h-7 text-xs border-blue-200 focus:border-blue-400"
                              value={r.discount ?? 0}
                              min={0}
                              step={100}
                              onChange={e => updateRow(i, { discount: Number(e.target.value) || 0 })}
                              placeholder="0"
                            />
                          </div>
                        )}
                      </div>
                      {form.showDiscount && (r.discount ?? 0) > 0 && (
                        <div className="mt-1.5 text-[11px] text-blue-700 bg-blue-50 rounded px-2 py-1">
                          최종단가 : <strong>{krw(r.newPrice - (r.discount ?? 0))}</strong>
                          <span className="text-slate-400 ml-2">
                            ({r.oldPrice > 0 ? `기존 대비 ${(((r.newPrice - (r.discount ?? 0)) - r.oldPrice) / r.oldPrice * 100).toFixed(1)}%` : ''})
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* 본문 + AI */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                본문
                <Badge variant="secondary" className="text-[10px]">제목과 표 사이에 표시</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* AI 초안 패널 */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-medium text-blue-900 flex items-center gap-1 mb-1.5">
                  <Sparkles className="w-3 h-3" />AI 문구 초안 작성 / 다듬기
                </p>
                <Textarea
                  rows={2}
                  className="text-xs bg-white"
                  placeholder="키워드로 상황 설명 (예: 4년 동결, 원자재 30% 상승, 재고 소진 후 적용, 5월 1일부터)"
                  value={form.aiKeywords}
                  onChange={e => setForm(s => ({ ...s, aiKeywords: e.target.value }))}
                />
                <Button size="sm" onClick={handleAiDraft} disabled={aiLoading} className="mt-2 h-7 gap-1 text-xs">
                  <Sparkles className="w-3 h-3" />
                  {aiLoading ? '작성 중...' : (form.bodyText !== DEFAULT_BODY ? '본문 다듬기' : 'AI 초안 생성')}
                </Button>
              </div>
              {/* 직접 편집 */}
              <Textarea
                rows={14}
                className="text-xs leading-relaxed"
                value={form.bodyText}
                onChange={e => setForm(s => ({ ...s, bodyText: e.target.value }))}
              />
            </CardContent>
          </Card>
        </div>

        {/* ───── 우측: 미리보기 ───── */}
        <div className="overflow-auto sticky top-6">
          <p className="text-xs text-slate-500 mb-2 text-center">미리보기 (A4 실제 비율)</p>
          <div className="inline-block bg-slate-300 p-6 rounded-xl shadow-inner">
            <div style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.12)' }}>
              <DocumentLayout
                bodyLineHeight={bodyLineHeight}
                header={{
                  documentNumber: docNumber || '──────────',
                  recipient: form.recipientName || '○○○ 귀하',
                  ccLine: form.ccLine || undefined,
                  sender: senderLine,
                  title: form.title,
                  issueDate: form.issueDate
                    ? form.issueDate.replace(/-/g, '. ') + '.'
                    : undefined,
                }}
                body={form.bodyText}
                table={
                  form.docMode === 'WHOLE'
                    ? <PriceChangeRangeTable
                        min={form.rangeMin} max={form.rangeMax}
                        unit={form.rangeUnit} direction={direction}
                        effectiveDate={form.effectiveDate || undefined}
                      />
                    : <PriceChangeTable rows={form.rows} direction={direction} effectiveDate={form.effectiveDate || undefined} />
                }
                footer={{
                  name: profile?.name || '회사명을 설정에서 입력하세요',
                  representative: profile?.representative,
                  businessNumber: profile?.businessNumber,
                  address: profile?.address,
                  phone: profile?.phone,
                  fax: profile?.fax,
                  email: profile?.email,
                  website: profile?.website,
                  logoPath: profile?.logoPath,
                  sealPath: profile?.sealPath,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
