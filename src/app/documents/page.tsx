'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { FileText, Plus, TrendingUp, TrendingDown, CalendarOff, Wallet, ListChecks, Search, Copy, Check, Eye, Image as ImageIcon } from 'lucide-react'
import DocumentPreviewDialog, { DocFull } from '@/components/documents/DocumentPreviewDialog'
import SavedDocumentRender, { CompanyProfileLite } from '@/components/documents/SavedDocumentRender'
import { buildMessengerText, copyToClipboard } from '@/lib/document-text'
import { downloadJPG } from '@/lib/document-export'

interface DocRow {
  id: string
  documentNumber: string
  type: string
  title: string
  recipientName: string
  ccLine: string | null
  senderLine: string
  bodyText: string
  tableJson: string | null
  metaJson: string | null
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
  const [previewDoc, setPreviewDoc] = useState<DocFull | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [profile, setProfile] = useState<CompanyProfileLite | null>(null)
  const [downloadingDoc, setDownloadingDoc] = useState<DocRow | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // 회사 프로필 1회 로드 (다운로드 시 footer에 사용)
  useEffect(() => {
    fetch('/api/company-profile')
      .then((r) => r.json())
      .then(setProfile)
      .catch(() => {})
  }, [])

  // downloadingDoc이 set되면 hidden 영역에 렌더 → 다음 프레임에 캡처/다운로드
  useEffect(() => {
    if (!downloadingDoc) return
    let cancelled = false
    ;(async () => {
      // 2 프레임 + 짧은 지연 (이미지 로드 대기)
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      await new Promise((r) => setTimeout(r, 50))
      if (cancelled) return
      try {
        const filename = `${downloadingDoc.documentNumber}_${downloadingDoc.title || '공문'}`
          .replace(/[\/\\?%*:|"<>]/g, '_')
          .replace(/\s+/g, '')
        await downloadJPG(filename)
      } catch (e) {
        console.error('JPG 다운로드 실패:', e)
        alert('JPG 다운로드 실패: ' + (e instanceof Error ? e.message : String(e)))
      } finally {
        if (!cancelled) {
          setDownloadingDoc(null)
          setDownloadingId(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [downloadingDoc])

  const handleRowDownload = (d: DocRow) => {
    if (downloadingId) return
    setDownloadingId(d.id)
    setDownloadingDoc(d)
  }

  const handleRowCopy = async (d: DocRow) => {
    // 메타·표 JSON 파싱
    let tableData: unknown[] | null = null
    let metaData: Record<string, unknown> = {}
    try {
      if (d.tableJson) tableData = JSON.parse(d.tableJson)
    } catch {}
    try {
      if (d.metaJson) metaData = JSON.parse(d.metaJson)
    } catch {}

    let rowsForText: Parameters<typeof buildMessengerText>[0]['rows']
    if (d.type === 'PRICE_CHANGE' && Array.isArray(tableData)) {
      rowsForText = tableData.map((r: any) => ({
        productName: r.productName,
        unit: r.unit,
        oldPrice: r.oldPrice,
        newPrice: r.newPrice,
        discount: r.discount,
      }))
    } else if (d.type === 'PRICE_INFO' && Array.isArray(tableData)) {
      const unit = (metaData.displayUnit as string) || 'YARD'
      const unitLabel = unit === 'YARD' ? '야드' : unit === 'METER' ? '미터' : '헤베'
      rowsForText = tableData.map((r: any) => {
        const yardPrice = r.yardPrice
        let unitPrice = yardPrice
        if (unit === 'METER') unitPrice = Math.round(yardPrice / 0.9144)
        else if (unit === 'HEBE')
          unitPrice = Math.round(yardPrice / ((0.9144 * (r.width ?? 110)) / 100))
        return { productName: r.productName, unit: unitLabel, unitPrice }
      })
    }

    // 회사 연락처
    let contact: { phone?: string; email?: string; website?: string } = {}
    try {
      const p = await fetch('/api/company-profile').then((r) => r.json())
      contact = { phone: p?.phone, email: p?.email, website: p?.website }
    } catch {}

    const text = buildMessengerText({
      documentNumber: d.documentNumber,
      title: d.title,
      recipientName: d.recipientName,
      ccLine: d.ccLine || undefined,
      senderLine: d.senderLine,
      bodyText: d.bodyText,
      issueDate: (metaData.issueDate as string) || undefined,
      effectiveDate: (metaData.effectiveDate as string) || undefined,
      rows: rowsForText,
      contact,
    })
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopiedId(d.id)
      setTimeout(() => setCopiedId(null), 1800)
    } else {
      alert('복사에 실패했습니다.')
    }
  }

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
                    <th className="pb-2 font-medium text-right pr-2">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map(d => {
                    const meta = TYPE_META[d.type] || { label: d.type, icon: FileText, color: 'text-slate-600' }
                    const Icon = meta.icon
                    const isCopied = copiedId === d.id
                    return (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-2.5">
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(d as unknown as DocFull)}
                            title="클릭하여 미리보기"
                            className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            {d.documentNumber}
                          </button>
                        </td>
                        <td>
                          <Badge variant="secondary" className="gap-1">
                            <Icon className={`w-3 h-3 ${meta.color}`} />
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="text-slate-700 max-w-xs truncate">{d.title}</td>
                        <td className="text-slate-600">{d.recipientName}</td>
                        <td className="text-slate-500 text-xs">{new Date(d.createdAt).toLocaleString('ko-KR')}</td>
                        <td className="text-right pr-2">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleRowCopy(d)}
                              title="이 공문 내용을 메신저용 텍스트로 복사"
                              className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition whitespace-nowrap ${
                                isCopied
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600'
                              }`}
                            >
                              {isCopied ? (
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
                            <button
                              type="button"
                              onClick={() => handleRowDownload(d)}
                              disabled={!!downloadingId}
                              title="JPG 파일로 다운로드"
                              className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition whitespace-nowrap ${
                                downloadingId === d.id
                                  ? 'border-blue-300 bg-blue-50 text-blue-700'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed'
                              }`}
                            >
                              <ImageIcon className="w-3 h-3" />
                              {downloadingId === d.id ? '생성 중...' : '다운'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <DocumentPreviewDialog
        open={!!previewDoc}
        onOpenChange={(o) => !o && setPreviewDoc(null)}
        doc={previewDoc}
      />

      {/* JPG 다운로드용 화면 밖 렌더 — downloadingDoc set되면 일시적으로 마운트 */}
      {downloadingDoc && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: 0,
            left: '-99999px',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        >
          <SavedDocumentRender doc={downloadingDoc} profile={profile} />
        </div>
      )}
    </div>
  )
}
