'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Sparkles, FileDown, Image as ImageIcon,
  Save, Plus, X, List, CloudUpload,
  History, Copy, Check, RotateCcw,
} from 'lucide-react'
import DocumentLayout from '@/components/documents/DocumentLayout'
import PriceInfoTable, { PriceInfoRow, DisplayUnit, OptionMode } from '@/components/documents/PriceInfoTable'
import ClientCombobox, { ClientOption } from '@/components/documents/ClientCombobox'
import DocumentHistoryDialog from '@/components/documents/DocumentHistoryDialog'
import { downloadPDF, downloadJPG, getCanvasBlob, getPDFBlob } from '@/lib/document-export'
import { buildMessengerText, copyToClipboard } from '@/lib/document-text'
import { useGoogleDrive } from '@/hooks/useGoogleDrive'
import { getOrCreateFolder, uploadToDrive } from '@/lib/google-drive'

const ROOT_FOLDER_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_ROOT_FOLDER_ID ?? ''

interface Product { id: string; name: string; unit: string; sellingPrice: number; spec?: string }

interface RowData extends PriceInfoRow { _productId?: string }

interface FormState {
  recipientClientId: string
  recipientName: string
  ccLine: string
  title: string
  issueDate: string
  effectiveDate: string
  displayUnit: DisplayUnit
  optionMode: OptionMode    // 대리점·롤·벌크 할인 단위: % or 원
  showDiscount: boolean
  showDealer: boolean
  showRoll: boolean
  showBulk1: boolean
  showBulk2: boolean
  bodyText: string
  tableNote: string  // 표 하단 비고 (자유 작성)
  rows: RowData[]
  aiKeywords: string
}

const DEFAULT_BODY = `1. 귀사의 무궁한 발전을 기원합니다.

2. 평소 저희 제품에 대한 변함없는 신뢰와 거래에 진심으로 감사드립니다.

3. 문의하신 원단의 단가를 아래와 같이 안내해 드립니다.

4. 기재된 납기일은 예상 일정으로, 원자재 수급 및 생산 상황에 따라 다소 변동될 수 있는 점 양해 부탁드립니다.

5. 추가 문의사항은 언제든지 연락 주시기 바랍니다. 감사합니다.`

function krw(n: number) {
  return new Intl.NumberFormat('ko-KR').format(n) + '원'
}

function parseWidth(spec?: string): number | undefined {
  if (!spec) return undefined
  const m = spec.match(/(\d+)/)
  if (!m) return undefined
  const n = Number(m[1])
  if (n >= 50 && n <= 500) return n
  return undefined
}

export default function PriceInfoForm() {
  const router = useRouter()
  const sp = useSearchParams()

  const [clients, setClients] = useState<ClientOption[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [profile, setProfile] = useState<Record<string, string> | null>(null)
  const [docNumber, setDocNumber] = useState('')

  const [form, setForm] = useState<FormState>({
    recipientClientId: '',
    recipientName: '',
    ccLine: '',
    title: '원단 단가 안내의 건',
    issueDate: '',
    effectiveDate: '',
    displayUnit: 'YARD',
    optionMode: 'PERCENT',
    showDiscount: false,
    showDealer: false,
    showRoll: false,
    showBulk1: false,
    showBulk2: false,
    bodyText: DEFAULT_BODY,
    tableNote: '',
    rows: [],
    aiKeywords: '',
  })

  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [productSearchLoading, setProductSearchLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savePhase, setSavePhase] = useState<'' | 'db' | 'drive'>('')
  const [downloading, setDownloading] = useState<'' | 'pdf' | 'jpg'>('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const { getToken } = useGoogleDrive()

  // ── 초기 로드 ──────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients).catch(() => {})
    fetch('/api/company-profile').then(r => r.json()).then(setProfile).catch(() => {})
    fetch('/api/documents/next-number')
      .then(r => r.json()).then(j => setDocNumber(j.documentNumber || '')).catch(() => {})
  }, [])

  // ── 수정 생성: ?from=<id>로 진입 시 기존 공문 데이터로 폼 채움 ────
  const fromId = sp.get('from')
  useEffect(() => {
    if (!fromId) return
    let cancelled = false
    fetch(`/api/documents/${fromId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Not found'))))
      .then((d) => {
        if (cancelled || !d) return
        if (d.type !== 'PRICE_INFO') {
          alert('단가 안내 공문이 아닙니다.')
          return
        }
        let rows: RowData[] = []
        let meta: Record<string, unknown> = {}
        try { rows = d.tableJson ? JSON.parse(d.tableJson) : [] } catch {}
        try { meta = d.metaJson ? JSON.parse(d.metaJson) : {} } catch {}
        setForm((s) => ({
          ...s,
          recipientClientId: d.recipientClientId || '',
          recipientName: d.recipientName || '',
          ccLine: d.ccLine || '',
          title: d.title || s.title,
          issueDate: '',
          effectiveDate: (meta.effectiveDate as string) || '',
          displayUnit: (meta.displayUnit as DisplayUnit) || s.displayUnit,
          optionMode: (meta.optionMode as OptionMode) || s.optionMode,
          showDiscount: !!meta.showDiscount,
          showDealer: !!meta.showDealer,
          showRoll: !!meta.showRoll,
          showBulk1: !!meta.showBulk1,
          showBulk2: !!meta.showBulk2,
          bodyText: d.bodyText || s.bodyText,
          tableNote: (meta.tableNote as string) || '',
          rows,
          aiKeywords: '',
        }))
      })
      .catch((err) => {
        console.error('수정 생성 데이터 로드 실패:', err)
        alert('공문 데이터를 불러오지 못했습니다.')
      })
    return () => { cancelled = true }
  }, [fromId])

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
  }

  // ── 발신 문자열 (회사명만 표시) ──────────────────────────────
  const senderLine = useMemo(() => {
    if (!profile?.name) return '－'
    return profile.name
  }, [profile])

  // ── 본문 줄간격 자동 계산 ─────────────────────────────────────
  const bodyLineHeight = useMemo(
    () => Math.max(1.35, 1.95 - form.rows.length * 0.045),
    [form.rows.length]
  )

  // ── 품목 행 추가 ──────────────────────────────────────────────
  const addProductRow = (p: Product) => {
    const widthCm = parseWidth(p.spec)
    setForm(s => ({
      ...s,
      rows: [
        ...s.rows,
        {
          _productId: p.id,
          productName: p.name,
          spec: p.spec || '',
          yardPrice: p.sellingPrice,
          width: widthCm,
        },
      ],
    }))
  }

  const updateRow = (i: number, patch: Partial<RowData>) =>
    setForm(s => ({ ...s, rows: s.rows.map((r, idx) => idx === i ? { ...r, ...patch } : r) }))

  const removeRow = (i: number) =>
    setForm(s => ({ ...s, rows: s.rows.filter((_, idx) => idx !== i) }))

  // ── AI 초안 ───────────────────────────────────────────────────
  const handleAiDraft = async () => {
    setAiLoading(true)
    try {
      const res = await fetch('/api/documents/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PRICE_INFO',
          recipientName: form.recipientName,
          keywords: form.aiKeywords,
          currentBody: form.bodyText !== DEFAULT_BODY ? form.bodyText : '',
        }),
      })
      const json = await res.json()
      if (json.text) setForm(s => ({ ...s, bodyText: json.text }))
    } catch {}
    setAiLoading(false)
  }

  // ── 파일명 ────────────────────────────────────────────────────
  // 수신 표시(form.recipientName) 에서 업체명만 추출 — 우선순위:
  //  1) 수신 표시 텍스트 ("회사명 / 담당자 귀하" 형태에서 회사명)
  //  2) dropdown 거래처명
  //  3) '거래처' 기본값
  const filenameBase = useMemo(() => {
    let name = (form.recipientName || '')
      .replace(/\s*귀하\s*$/, '')
      .split(/\s*\/\s*/)[0]
      .trim()
    if (!name) {
      name = clients.find((c) => c.id === form.recipientClientId)?.name || '거래처'
    }
    name = name.replace(/[\\/:*?"<>|]/g, '_').trim() || '거래처'
    return `${docNumber}_단가안내_${name}`.replace(/\s+/g, '')
  }, [form.recipientName, form.recipientClientId, clients, docNumber])

  const handleDownloadPDF = async () => {
    setDownloading('pdf')
    try {
      await downloadPDF(filenameBase)
    } catch (e) {
      console.error('[PDF 생성 실패]', e)
      alert('PDF 생성 실패\n' + (e instanceof Error ? e.name + ': ' + e.message : String(e)))
    }
    setDownloading('')
  }

  const handleDownloadJPG = async () => {
    setDownloading('jpg')
    try {
      await downloadJPG(filenameBase)
    } catch (e) {
      console.error('[JPG 생성 실패]', e)
      alert('JPG 생성 실패\n' + (e instanceof Error ? e.name + ': ' + e.message : String(e)))
    }
    setDownloading('')
  }

  // ── 저장 (DB → 구글 드라이브) ────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    setSavePhase('db')
    let savedId: string | null = null
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PRICE_INFO',
          title: form.title,
          recipientClientId: form.recipientClientId || null,
          recipientName: form.recipientName || '(수신자 미입력)',
          ccLine: form.ccLine,
          senderLine,
          bodyText: form.bodyText,
          tableJson: form.rows.map(({ _productId: _, ...r }) => r),
          metaJson: {
            displayUnit: form.displayUnit,
            optionMode: form.optionMode,
            showDiscount: form.showDiscount,
            showDealer: form.showDealer,
            showRoll: form.showRoll,
            showBulk1: form.showBulk1,
            showBulk2: form.showBulk2,
            issueDate: form.issueDate,
            effectiveDate: form.effectiveDate,
            tableNote: form.tableNote,
          },
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
    } catch (e) {
      console.error('DB 저장 실패:', e)
      alert('저장 실패: ' + (e instanceof Error ? e.message : String(e)))
      setSaving(false); setSavePhase('')
      return
    }

    // ── 구글 드라이브 업로드 (팝업 차단 대비 15초 타임아웃) ────
    if (ROOT_FOLDER_ID && savedId) {
      setSavePhase('drive')
      try {
        const driveToken = await Promise.race([
          getToken(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('DRIVE_TIMEOUT')), 15000)
          ),
        ])
        const folderId = await getOrCreateFolder('공문 모음', ROOT_FOLDER_ID, driveToken)
        const [pdfBlob, jpgBlob] = await Promise.all([
          getPDFBlob('document-print-area'),
          getCanvasBlob('document-print-area', 'image/jpeg', 0.95),
        ])
        const [driveFileId, driveJpgId] = await Promise.all([
          uploadToDrive(pdfBlob, `${filenameBase}.pdf`, 'application/pdf', folderId, driveToken),
          uploadToDrive(jpgBlob, `${filenameBase}.jpg`, 'image/jpeg', folderId, driveToken),
        ])
        await fetch(`/api/documents/${savedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveFileId, driveJpgId }),
        })
      } catch (driveErr) {
        const msg = driveErr instanceof Error ? driveErr.message : ''
        if (msg === 'DRIVE_TIMEOUT') {
          console.warn('Drive upload skipped (no auth / popup blocked)')
        } else {
          console.error('Drive upload failed:', driveErr)
          alert(`구글 드라이브 저장 실패: ${msg || '알 수 없는 오류'}\n\n공문은 DB에 저장되었습니다.`)
        }
      }
    }

    setSaving(false)
    setSavePhase('')

    // 저장 성공 표시 + 새 문서번호 (폼 데이터는 유지)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 3000)
    try {
      const r = await fetch('/api/documents/next-number')
      const j = await r.json()
      if (j.documentNumber) setDocNumber(j.documentNumber)
    } catch {}
  }

  // ── 폼 초기화 (리셋 버튼) ─────────────────────────────────────
  const handleReset = async () => {
    if (!confirm('작성한 내용을 모두 초기화할까요?\n저장된 공문은 영향받지 않습니다.')) return
    setForm({
      recipientClientId: '',
      recipientName: '',
      ccLine: '',
      title: '원단 단가 안내의 건',
      issueDate: '',
      effectiveDate: '',
      displayUnit: 'YARD',
      optionMode: 'PERCENT',
      showDiscount: false,
      showDealer: false,
      showRoll: false,
      showBulk1: false,
      showBulk2: false,
      bodyText: DEFAULT_BODY,
      tableNote: '',
      rows: [],
      aiKeywords: '',
    })
    try {
      const r = await fetch('/api/documents/next-number')
      const j = await r.json()
      if (j.documentNumber) setDocNumber(j.documentNumber)
    } catch {}
    setSavedFlash(false)
  }


  // ── 메신저용 텍스트 복사 ──────────────────────────────────────
  const handleCopyText = async () => {
    const unitLabel =
      form.displayUnit === 'YARD' ? '야드' : form.displayUnit === 'METER' ? '미터' : '헤베'
    const rowsForText = form.rows.map((r) => ({
      productName: r.productName,
      unit: unitLabel,
      unitPrice: convertedPrice(r),
    }))
    const text = buildMessengerText({
      documentNumber: docNumber,
      title: form.title,
      recipientName: form.recipientName || '○○○ 귀하',
      ccLine: form.ccLine || undefined,
      senderLine,
      bodyText: form.bodyText,
      issueDate: form.issueDate || undefined,
      effectiveDate: form.effectiveDate || undefined,
      rows: rowsForText,
      contact: {
        phone: profile?.phone,
        email: profile?.email,
        website: profile?.website,
      },
    })
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } else {
      alert('복사에 실패했습니다. 브라우저 권한을 확인해주세요.')
    }
  }

  // ── 단위별 변환 단가 표시 ─────────────────────────────────────
  function convertedPrice(row: RowData): number {
    const { yardPrice, width, _productId: _p, ..._ } = row
    if (form.displayUnit === 'YARD') return yardPrice
    if (form.displayUnit === 'METER') return Math.round(yardPrice / 0.9144)
    return Math.round(yardPrice / (0.9144 * (width ?? 110) / 100))
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
            <List className="w-6 h-6 text-emerald-600" />
            단가 안내 공문 작성
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
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="gap-1"
            title="DB + 구글 드라이브에 저장"
          >
            {savePhase === 'drive'
              ? <CloudUpload className="w-3.5 h-3.5 animate-pulse" />
              : <Save className="w-3.5 h-3.5" />}
            {savePhase === 'db' ? 'DB 저장 중...'
              : savePhase === 'drive' ? '드라이브 저장 중...'
              : savedFlash ? '저장됨 ✓'
              : '저장'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReset}
            disabled={saving}
            className="gap-1"
            title="작성한 내용을 모두 초기화 (저장된 공문은 영향 없음)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            리셋
          </Button>
        </div>
      </div>

      {savedFlash && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md px-3 py-2 text-sm flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>
            저장 완료. 메신저로 보내려면 <strong>JPG</strong> 버튼으로 다운로드 후 카톡 등에 드래그하세요.
            거래처/내용을 바꿔 계속 작성할 수 있고, 새로 시작하려면 <strong>리셋</strong> 버튼을 누르세요.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[440px_1fr] gap-4 items-start">
        {/* ───── 좌측: 폼 ───── */}
        <div className="space-y-3">
          {/* 기본 정보 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                기본 정보
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  title="클릭하여 발행 이력 보기"
                  className="font-mono text-xs text-slate-500 font-normal inline-flex items-center gap-1 hover:text-blue-600 hover:underline cursor-pointer transition"
                >
                  <History className="w-3 h-3" />
                  {docNumber || '...'}
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                  <Label className="text-xs mb-1 block flex items-center justify-between">
                    <span>
                      발행일자
                      <span className="text-slate-400 font-normal ml-1">(비우면 오늘)</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyText}
                      title="공문 내용을 메신저용 텍스트로 복사"
                      className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border transition ${
                        copied
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600'
                      }`}
                    >
                      {copied ? (
                        <>
                          <Check className="w-3 h-3" />
                          복사됨
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          복사
                        </>
                      )}
                    </button>
                  </Label>
                  <Input
                    type="date"
                    value={form.issueDate}
                    onChange={e => setForm(s => ({ ...s, issueDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">단가 기준일</Label>
                  <Input
                    type="date"
                    value={form.effectiveDate}
                    onChange={e => setForm(s => ({ ...s, effectiveDate: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 단가 단위 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">단가 단위</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                {(['YARD', 'METER', 'HEBE'] as DisplayUnit[]).map(u => (
                  <button key={u}
                    onClick={() => setForm(s => ({ ...s, displayUnit: u }))}
                    className={`text-xs py-2 rounded-md transition
                      ${form.displayUnit === u
                        ? 'bg-white shadow font-semibold text-slate-900'
                        : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {u === 'YARD' ? '야드' : u === 'METER' ? '미터' : '헤베'}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-slate-500 text-center">
                {form.displayUnit === 'METER' && '(×1.09, /야드→m 환산)'}
                {form.displayUnit === 'HEBE' && '(폭×길이 ㎡ 환산, 기본 폭 110cm)'}
                {form.displayUnit === 'YARD' && '야드 기준 단가'}
              </div>
            </CardContent>
          </Card>

          {/* 추가 단가 옵션 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">추가 단가 옵션</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 옵션 토글 */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setForm(s => ({ ...s, showDiscount: !s.showDiscount }))}
                  className={`h-8 px-3 text-xs rounded-md border transition font-medium
                    ${form.showDiscount ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600'}`}
                >특별할인</button>
                <button
                  onClick={() => setForm(s => ({ ...s, showDealer: !s.showDealer }))}
                  className={`h-8 px-3 text-xs rounded-md border transition font-medium
                    ${form.showDealer ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-purple-400 hover:text-purple-600'}`}
                >대리점단가</button>
                <button
                  onClick={() => setForm(s => ({ ...s, showRoll: !s.showRoll }))}
                  className={`h-8 px-3 text-xs rounded-md border transition font-medium
                    ${form.showRoll ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-amber-400 hover:text-amber-600'}`}
                >롤단가</button>
                <button
                  onClick={() => setForm(s => ({ ...s, showBulk1: !s.showBulk1 }))}
                  className={`h-8 px-3 text-xs rounded-md border transition font-medium
                    ${form.showBulk1 ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400 hover:text-teal-600'}`}
                >벌크1</button>
                <button
                  onClick={() => setForm(s => ({ ...s, showBulk2: !s.showBulk2 }))}
                  className={`h-8 px-3 text-xs rounded-md border transition font-medium
                    ${form.showBulk2 ? 'bg-cyan-600 text-white border-cyan-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-cyan-400 hover:text-cyan-600'}`}
                >벌크2</button>
              </div>

              {/* 대리점·롤·벌크 할인 단위 (해당 옵션이 하나라도 켜져 있을 때만) */}
              {(form.showDealer || form.showRoll || form.showBulk1 || form.showBulk2) && (
                <div>
                  <p className="text-[11px] text-slate-500 mb-1">대리점 · 롤 · 벌크 할인 입력 단위</p>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                    {(['PERCENT', 'AMOUNT'] as OptionMode[]).map(m => (
                      <button key={m}
                        onClick={() => setForm(s => ({ ...s, optionMode: m }))}
                        className={`text-xs py-1.5 rounded-md transition font-medium
                          ${form.optionMode === m
                            ? 'bg-white shadow text-slate-900'
                            : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {m === 'PERCENT' ? '% 퍼센트' : '원 정액'}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 text-center">
                    {form.optionMode === 'PERCENT'
                      ? '기본 단가에서 입력한 %만큼 할인'
                      : '기본 단가에서 입력한 금액만큼 차감'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 품목 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>품목 <span className="text-slate-400 font-normal text-xs">({form.rows.length}개)</span></span>
                <Button size="sm" variant="outline" onClick={() => setProductPickerOpen(v => !v)} className="h-7 gap-1 text-xs">
                  <Plus className="w-3 h-3" />품목 추가
                </Button>
              </CardTitle>
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
                  ) : products.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">결과 없음</p>
                  ) : products.map(p => (
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
                  {form.rows.map((r, i) => {
                    const cPrice = convertedPrice(r)
                    return (
                      <div key={i} className="border rounded-lg p-2.5 bg-white">
                        <div className="flex items-center gap-1.5 mb-2">
                          <input
                            className="text-sm font-medium bg-transparent flex-1 outline-none min-w-0"
                            value={r.productName}
                            onChange={e => updateRow(i, { productName: e.target.value })}
                            placeholder="품목명"
                          />
                          <input
                            className="text-xs bg-transparent outline-none border-b border-dashed border-slate-300 w-20 text-center text-slate-500 placeholder:text-slate-300 shrink-0"
                            value={r.itemCode ?? ''}
                            onChange={e => updateRow(i, { itemCode: e.target.value || undefined })}
                            placeholder="품번"
                          />
                          <button onClick={() => removeRow(i)} className="text-slate-400 hover:text-rose-500 shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-[1fr_120px] gap-2 mb-2">
                          <div>
                            <p className="text-[10px] text-slate-500 mb-0.5">
                              규격 <span className="text-slate-400">(선택)</span>
                            </p>
                            <Input
                              className="h-7 text-xs"
                              value={r.spec ?? ''}
                              onChange={e => updateRow(i, { spec: e.target.value })}
                              placeholder="예: 1400mm, 자카드 등"
                            />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 mb-0.5">
                              Lead time <span className="text-slate-400">(day)</span>
                            </p>
                            <Input
                              type="number"
                              className="h-7 text-xs"
                              value={r.leadTimeDays ?? ''}
                              onChange={e => updateRow(i, { leadTimeDays: Math.max(0, Number(e.target.value) || 0) })}
                              min={0}
                              step={1}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <div className={`grid gap-2 ${
                          [form.showDiscount, form.showDealer, form.showRoll, form.showBulk1, form.showBulk2, form.displayUnit === 'HEBE'].filter(Boolean).length >= 3
                            ? 'grid-cols-3'
                            : 'grid-cols-2'
                        }`}>
                          {form.displayUnit === 'HEBE' && (
                            <div>
                              <p className="text-[10px] text-slate-500 mb-0.5">폭(cm)</p>
                              <Input
                                type="number"
                                className="h-7 text-xs"
                                value={r.width ?? 110}
                                onChange={e => updateRow(i, { width: Number(e.target.value) || 110 })}
                                min={50}
                                max={500}
                              />
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] text-slate-500 mb-0.5">야드 기준가</p>
                            <Input
                              type="number"
                              className="h-7 text-xs"
                              value={r.yardPrice}
                              onChange={e => updateRow(i, { yardPrice: Number(e.target.value) || 0 })}
                              min={0}
                              step={100}
                            />
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
                              />
                            </div>
                          )}
                          {form.showDealer && (
                            <div>
                              <p className="text-[10px] mb-0.5 font-medium" style={{ color: '#7c3aed' }}>
                                대리점 할인 (−{form.optionMode === 'PERCENT' ? '%' : '원'})
                              </p>
                              <Input
                                type="number"
                                className="h-7 text-xs"
                                value={r.dealerDiscount ?? ''}
                                min={0}
                                step={form.optionMode === 'AMOUNT' ? 100 : 1}
                                placeholder="0"
                                onChange={e => updateRow(i, { dealerDiscount: e.target.value ? Number(e.target.value) : undefined })}
                              />
                            </div>
                          )}
                          {form.showRoll && (
                            <div>
                              <p className="text-[10px] mb-0.5 font-medium" style={{ color: '#b45309' }}>
                                롤 할인 (−{form.optionMode === 'PERCENT' ? '%' : '원'})
                              </p>
                              <Input
                                type="number"
                                className="h-7 text-xs"
                                value={r.rollDiscount ?? ''}
                                min={0}
                                step={form.optionMode === 'AMOUNT' ? 100 : 1}
                                placeholder="0"
                                onChange={e => updateRow(i, { rollDiscount: e.target.value ? Number(e.target.value) : undefined })}
                              />
                            </div>
                          )}
                          {form.showBulk1 && (
                            <div>
                              <p className="text-[10px] mb-0.5 font-medium" style={{ color: '#0f766e' }}>
                                대량1 할인 (−{form.optionMode === 'PERCENT' ? '%' : '원'})
                              </p>
                              <Input
                                type="number"
                                className="h-7 text-xs"
                                value={r.bulk1Discount ?? ''}
                                min={0}
                                step={form.optionMode === 'AMOUNT' ? 100 : 1}
                                placeholder="0"
                                onChange={e => updateRow(i, { bulk1Discount: e.target.value ? Number(e.target.value) : undefined })}
                              />
                            </div>
                          )}
                          {form.showBulk2 && (
                            <div>
                              <p className="text-[10px] mb-0.5 font-medium" style={{ color: '#0d7490' }}>
                                대량2 할인 (−{form.optionMode === 'PERCENT' ? '%' : '원'})
                              </p>
                              <Input
                                type="number"
                                className="h-7 text-xs"
                                value={r.bulk2Discount ?? ''}
                                min={0}
                                step={form.optionMode === 'AMOUNT' ? 100 : 1}
                                placeholder="0"
                                onChange={e => updateRow(i, { bulk2Discount: e.target.value ? Number(e.target.value) : undefined })}
                              />
                            </div>
                          )}
                        </div>
                        {/* 행 미리보기: 단위 변환 + 옵션 최종가 */}
                        {(form.displayUnit !== 'YARD' || form.showDiscount || form.showDealer || form.showRoll || form.showBulk1 || form.showBulk2) && (
                          <div className="mt-1.5 text-[11px] text-slate-500 bg-slate-50 rounded px-2 py-1 space-y-0.5">
                            {form.displayUnit !== 'YARD' && (
                              <div>표시 단가 ({form.displayUnit === 'METER' ? '미터' : '헤베'}) : <strong>{krw(cPrice)}</strong></div>
                            )}
                            {form.showDiscount && (r.discount ?? 0) > 0 && (
                              <div style={{ color: '#1a5fa0' }}>
                                특별할인가 : <strong>{krw(Math.max(0, cPrice - (r.discount ?? 0)))}</strong>
                                {' '}(−{krw(r.discount ?? 0)}
                                {cPrice > 0 && `, ${(((r.discount ?? 0) / cPrice) * 100).toFixed(1)}%`})
                              </div>
                            )}
                            {form.showDealer && (r.dealerDiscount ?? 0) > 0 && (
                              <div style={{ color: '#7c3aed' }}>
                                대리점단가 : <strong>{krw(form.optionMode === 'PERCENT'
                                  ? Math.round(cPrice * (1 - (r.dealerDiscount ?? 0) / 100))
                                  : Math.max(0, cPrice - (r.dealerDiscount ?? 0)))}</strong>
                                {' '}(−{form.optionMode === 'PERCENT' ? `${r.dealerDiscount}%` : krw(r.dealerDiscount ?? 0)})
                              </div>
                            )}
                            {form.showRoll && (r.rollDiscount ?? 0) > 0 && (
                              <div style={{ color: '#b45309' }}>
                                롤단가 : <strong>{krw(form.optionMode === 'PERCENT'
                                  ? Math.round(cPrice * (1 - (r.rollDiscount ?? 0) / 100))
                                  : Math.max(0, cPrice - (r.rollDiscount ?? 0)))}</strong>
                                {' '}(−{form.optionMode === 'PERCENT' ? `${r.rollDiscount}%` : krw(r.rollDiscount ?? 0)})
                              </div>
                            )}
                            {form.showBulk1 && (r.bulk1Discount ?? 0) > 0 && (
                              <div style={{ color: '#0f766e' }}>
                                벌크1 : <strong>{krw(form.optionMode === 'PERCENT'
                                  ? Math.round(cPrice * (1 - (r.bulk1Discount ?? 0) / 100))
                                  : Math.max(0, cPrice - (r.bulk1Discount ?? 0)))}</strong>
                                {' '}(−{form.optionMode === 'PERCENT' ? `${r.bulk1Discount}%` : krw(r.bulk1Discount ?? 0)})
                              </div>
                            )}
                            {form.showBulk2 && (r.bulk2Discount ?? 0) > 0 && (
                              <div style={{ color: '#0d7490' }}>
                                벌크2 : <strong>{krw(form.optionMode === 'PERCENT'
                                  ? Math.round(cPrice * (1 - (r.bulk2Discount ?? 0) / 100))
                                  : Math.max(0, cPrice - (r.bulk2Discount ?? 0)))}</strong>
                                {' '}(−{form.optionMode === 'PERCENT' ? `${r.bulk2Discount}%` : krw(r.bulk2Discount ?? 0)})
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 본문 + AI */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                본문
                <Badge variant="secondary" className="text-[10px]">제목과 표 사이에 표시</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-medium text-blue-900 flex items-center gap-1 mb-1.5">
                  <Sparkles className="w-3 h-3" />AI 문구 초안 작성 / 다듬기
                </p>
                <Textarea
                  rows={2}
                  className="text-xs bg-white"
                  placeholder="키워드로 상황 설명 (예: 신규 거래처, 대량 구매 문의, 시즌 특가)"
                  value={form.aiKeywords}
                  onChange={e => setForm(s => ({ ...s, aiKeywords: e.target.value }))}
                />
                <Button size="sm" onClick={handleAiDraft} disabled={aiLoading} className="mt-2 h-7 gap-1 text-xs">
                  <Sparkles className="w-3 h-3" />
                  {aiLoading ? '작성 중...' : (form.bodyText !== DEFAULT_BODY ? '본문 다듬기' : 'AI 초안 생성')}
                </Button>
              </div>
              <Textarea
                rows={14}
                className="text-xs leading-relaxed"
                value={form.bodyText}
                onChange={e => setForm(s => ({ ...s, bodyText: e.target.value }))}
              />
            </CardContent>
          </Card>

          {/* 비고 — 표 아래 자유 작성 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                비고 <span className="text-slate-400 font-normal text-xs">(표 하단에 표시 · 비우면 미표시)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={3}
                className="text-xs leading-relaxed"
                placeholder="예: 시즌 특가 적용 / 일부 품목 단종 예정 / 결제 조건 변경 등 그때그때 안내사항"
                value={form.tableNote}
                onChange={e => setForm(s => ({ ...s, tableNote: e.target.value }))}
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
                  <PriceInfoTable
                    rows={form.rows}
                    unit={form.displayUnit}
                    optionMode={form.optionMode}
                    showDiscount={form.showDiscount}
                    showDealer={form.showDealer}
                    showRoll={form.showRoll}
                    showBulk1={form.showBulk1}
                    showBulk2={form.showBulk2}
                    effectiveDate={form.effectiveDate || undefined}
                    issueDate={form.issueDate || undefined}
                    note={form.tableNote || undefined}
                    recipientName={form.recipientName || undefined}
                  />
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
          {/* 미리보기 하단 버튼 */}
          <div className="flex gap-2 justify-center mt-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleDownloadJPG} disabled={!!downloading} className="gap-1">
              <ImageIcon className="w-3.5 h-3.5" />
              {downloading === 'jpg' ? '생성 중...' : 'JPG'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={!!downloading} className="gap-1">
              <FileDown className="w-3.5 h-3.5" />
              {downloading === 'pdf' ? '생성 중...' : 'PDF'}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-1"
              title="DB + 구글 드라이브에 저장"
            >
              {savePhase === 'drive'
                ? <CloudUpload className="w-3.5 h-3.5 animate-pulse" />
                : <Save className="w-3.5 h-3.5" />}
              {savePhase === 'db' ? 'DB 저장 중...'
                : savePhase === 'drive' ? '드라이브 저장 중...'
                : savedFlash ? '저장됨 ✓'
                : '저장'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={saving}
              className="gap-1"
              title="작성한 내용을 모두 초기화"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              리셋
            </Button>
          </div>
        </div>
      </div>

      <DocumentHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        currentDocumentNumber={docNumber}
        onReuse={(doc) => {
          if (doc.bodyText) setForm((s) => ({ ...s, bodyText: doc.bodyText }))
        }}
      />

    </div>
  )
}
