'use client'

import { useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Upload, FileSpreadsheet, FileText, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { formatKRW } from '@/lib/formatters'

type UploadState = 'idle' | 'loading' | 'success' | 'error'

interface UploadResult {
  state: UploadState
  message: string
  detail?: string
}

interface SalesResult {
  success: boolean; date: string; imported: number; totalSales: number
  results: { clientName: string; salesAmount: number; received: number; currBalance: number }[]
}

interface PurchaseResult {
  success: boolean; type: 'customs' | 'freight'
  date: string; totalBilled?: number; totalAmount?: number
  blNo?: string; supplier?: string; invoiceNo?: string
  breakdown?: { customs: number; vat: number; warehouse: number; clearanceFee: number }
}

function UploadCard({
  title, icon, accept, endpoint, onSuccess
}: {
  title: string
  icon: React.ReactNode
  accept: string
  endpoint: string
  onSuccess?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<UploadResult>({ state: 'idle', message: '' })

  const handleFile = async (file: File) => {
    setResult({ state: 'loading', message: '분석 중...' })
    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch(endpoint, { method: 'POST', body: form })
      const json = await res.json()

      if (!res.ok) {
        setResult({ state: 'error', message: json.error ?? '오류가 발생했습니다.' })
        return
      }

      // 일계표 결과 포맷
      if (json.sheetsTotal !== undefined) {
        const skippedMsg = json.skippedDays > 0 ? ` (${json.skippedDays}일 중복 스킵)` : ''
        setResult({
          state: 'success',
          message: `${json.processedDays}일치 업로드 완료${skippedMsg}`,
          detail: `매출 ${formatKRW(json.totalSales)} | 경비 ${formatKRW(json.totalExpenses)} | 매입 ${formatKRW(json.totalPurchases)}${json.sheetsError ? ' (원가조회 실패)' : ''}`,
        })
      } else {
        // 매입 결과 포맷
        const r = json as PurchaseResult
        if (r.type === 'customs') {
          setResult({
            state: 'success',
            message: `관세 청구서 업로드 완료 (${r.date})`,
            detail: `청구금액 ${formatKRW(r.totalBilled ?? 0)} | ${r.blNo ?? ''}`,
          })
        } else {
          setResult({
            state: 'success',
            message: `로드썬 운임 업로드 완료 (${r.date})`,
            detail: `총 운임 ${formatKRW(r.totalAmount ?? 0)}`,
          })
        }
      }

      onSuccess?.()
    } catch {
      setResult({ state: 'error', message: '네트워크 오류가 발생했습니다.' })
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-sm font-medium text-slate-700">{title}</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        disabled={result.state === 'loading'}
        onClick={() => fileRef.current?.click()}
      >
        {result.state === 'loading'
          ? <><Loader2 className="w-4 h-4 animate-spin" /> 처리 중...</>
          : <><Upload className="w-4 h-4" /> 파일 선택</>}
      </Button>

      {result.state === 'success' && (
        <div className="mt-2 text-xs text-green-700 bg-green-50 rounded p-2">
          <div className="flex items-center gap-1 font-medium">
            <CheckCircle className="w-3 h-3" /> {result.message}
          </div>
          {result.detail && <div className="mt-0.5 text-green-600">{result.detail}</div>}
        </div>
      )}

      {result.state === 'error' && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 rounded p-2 flex items-start gap-1">
          <XCircle className="w-3 h-3 mt-0.5 shrink-0" /> {result.message}
        </div>
      )}
    </div>
  )
}

function RecalculateButton({ onSuccess }: { onSuccess?: () => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [detail, setDetail] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)

  const handleRecalculate = async () => {
    if (!confirm(`${startDate} ~ ${endDate} 기간의 원가를 Google Sheets 현재 가격으로 재계산합니다.\n기존 원가 데이터는 삭제됩니다. 계속하시겠습니까?`)) return
    setState('loading')
    setMsg('')
    setDetail('')
    try {
      const res = await fetch('/api/upload/sales/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      })
      const json = await res.json()
      if (!res.ok) { setState('error'); setMsg(json.error ?? '오류'); return }
      setState('success')
      setMsg(`재계산 완료 | 환율 ${json.usdRate.toLocaleString()}원/USD | ${json.recalculatedCount}건`)
      setDetail(`신규 원가 ${formatKRW(json.totalNewCost)} (기존 ${formatKRW(json.totalOldCost)} → 차이 ${formatKRW(json.totalNewCost - json.totalOldCost)})`)
      onSuccess?.()
    } catch {
      setState('error')
      setMsg('네트워크 오류')
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center gap-2 mb-3">
        <RefreshCw className="w-4 h-4 text-purple-600" />
        <span className="text-sm font-medium text-slate-700">원가 재계산 (Google Sheets)</span>
      </div>
      <div className="space-y-1.5 mb-2">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <span>시작</span>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="flex-1 text-xs border rounded px-2 py-1"
          />
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <span>종료</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={e => setEndDate(e.target.value)}
            className="flex-1 text-xs border rounded px-2 py-1"
          />
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        disabled={state === 'loading'}
        onClick={handleRecalculate}
      >
        {state === 'loading'
          ? <><Loader2 className="w-4 h-4 animate-spin" /> 재계산 중...</>
          : <><RefreshCw className="w-4 h-4" /> 원가 재계산</>}
      </Button>
      {state === 'success' && (
        <div className="mt-2 text-xs text-green-700 bg-green-50 rounded p-2">
          <div className="flex items-start gap-1 font-medium">
            <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" /> {msg}
          </div>
          {detail && <div className="mt-0.5 text-green-600">{detail}</div>}
        </div>
      )}
      {state === 'error' && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 rounded p-2 flex items-start gap-1">
          <XCircle className="w-3 h-3 mt-0.5 shrink-0" /> {msg}
        </div>
      )}
    </div>
  )
}

export default function UploadSection({ onUploadSuccess }: { onUploadSuccess?: () => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-600" />
          일일 마감 업로드
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <UploadCard
            title="일계표(리스트) (.xls)"
            icon={<FileSpreadsheet className="w-4 h-4 text-green-600" />}
            accept=".xls,.xlsx"
            endpoint="/api/upload/sales"
            onSuccess={onUploadSuccess}
          />
          <UploadCard
            title="관세 청구서 (.pdf)"
            icon={<FileText className="w-4 h-4 text-orange-600" />}
            accept=".pdf"
            endpoint="/api/upload/purchase"
            onSuccess={onUploadSuccess}
          />
          <UploadCard
            title="로드썬 운임 인보이스 (.pdf)"
            icon={<FileText className="w-4 h-4 text-blue-600" />}
            accept=".pdf"
            endpoint="/api/upload/purchase"
            onSuccess={onUploadSuccess}
          />
          <RecalculateButton onSuccess={onUploadSuccess} />
        </div>
      </CardContent>
    </Card>
  )
}
