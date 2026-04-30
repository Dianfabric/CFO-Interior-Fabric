'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Copy, Check, FileText, TrendingUp, TrendingDown, CalendarOff, Wallet, ListChecks, Image as ImageIcon, FilePlus2 } from 'lucide-react'
import { PriceRow } from './PriceChangeTable'
import { PriceInfoRow, DisplayUnit } from './PriceInfoTable'
import SavedDocumentRender, { CompanyProfileLite } from './SavedDocumentRender'
import { buildMessengerText, copyToClipboard } from '@/lib/document-text'
import { downloadJPG } from '@/lib/document-export'

export interface DocFull {
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

const TYPE_META: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  PRICE_CHANGE: { label: '단가 변경', icon: TrendingUp, color: 'text-rose-600' },
  HOLIDAY: { label: '휴무 안내', icon: CalendarOff, color: 'text-amber-600' },
  PAYMENT_REQUEST: { label: '결제 요청', icon: Wallet, color: 'text-blue-600' },
  PRICE_INFO: { label: '단가 안내', icon: ListChecks, color: 'text-emerald-600' },
}

type CompanyProfile = CompanyProfileLite

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  doc: DocFull | null
}

function safeJSON<T>(s: string | null): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

export default function DocumentPreviewDialog({ open, onOpenChange, doc }: Props) {
  const router = useRouter()
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (open && !profile) {
      fetch('/api/company-profile')
        .then((r) => r.json())
        .then(setProfile)
        .catch(() => {})
    }
  }, [open, profile])

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  if (!doc) return null

  const meta = TYPE_META[doc.type] || { label: doc.type, icon: FileText, color: 'text-slate-600' }
  const Icon = meta.icon

  const tableData = safeJSON<unknown[]>(doc.tableJson)
  const metaData = safeJSON<Record<string, unknown>>(doc.metaJson) ?? {}

  const issueDateRaw = (metaData.issueDate as string) || ''

  const handleCopy = async () => {
    // tableJson을 메신저 텍스트용 rows로 변환
    let rowsForText: Parameters<typeof buildMessengerText>[0]['rows']
    if (doc.type === 'PRICE_CHANGE' && Array.isArray(tableData)) {
      rowsForText = (tableData as PriceRow[]).map((r) => ({
        productName: r.productName,
        unit: r.unit,
        oldPrice: r.oldPrice,
        newPrice: r.newPrice,
        discount: r.discount,
      }))
    } else if (doc.type === 'PRICE_INFO' && Array.isArray(tableData)) {
      const unit = (metaData.displayUnit as DisplayUnit) || 'YARD'
      const unitLabel = unit === 'YARD' ? '야드' : unit === 'METER' ? '미터' : '헤베'
      rowsForText = (tableData as PriceInfoRow[]).map((r) => {
        // 야드기준가 → 표시단위 변환
        const yardPrice = r.yardPrice
        let unitPrice = yardPrice
        if (unit === 'METER') unitPrice = Math.round(yardPrice / 0.9144)
        else if (unit === 'HEBE') unitPrice = Math.round(yardPrice / ((0.9144 * (r.width ?? 110)) / 100))
        return {
          productName: r.productName,
          unit: unitLabel,
          unitPrice,
        }
      })
    }

    const text = buildMessengerText({
      documentNumber: doc.documentNumber,
      title: doc.title,
      recipientName: doc.recipientName,
      ccLine: doc.ccLine || undefined,
      senderLine: doc.senderLine,
      bodyText: doc.bodyText,
      issueDate: issueDateRaw || undefined,
      effectiveDate: (metaData.effectiveDate as string) || undefined,
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

  const handleEditCreate = () => {
    if (!doc) return
    if (doc.type === 'PRICE_CHANGE') {
      const direction = (metaData.direction as 'UP' | 'DOWN') || 'UP'
      router.push(`/documents/new/price-change?direction=${direction}&from=${doc.id}`)
    } else if (doc.type === 'PRICE_INFO') {
      router.push(`/documents/new/price-info?from=${doc.id}`)
    } else {
      alert('이 유형은 수정 생성을 지원하지 않습니다.')
      return
    }
    onOpenChange(false)
  }

  const handleDownloadJPG = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const filename = `${doc.documentNumber}_${doc.title || '공문'}`
        .replace(/[\/\\?%*:|"<>]/g, '_')
        .replace(/\s+/g, '')
      await downloadJPG(filename)
    } catch (e) {
      console.error('JPG 다운로드 실패:', e)
      alert('JPG 다운로드 실패: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-5xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0"
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <FileText className="w-4 h-4" />
            <span className="font-mono text-sm">{doc.documentNumber}</span>
            <Badge variant="secondary" className="gap-1">
              <Icon className={`w-3 h-3 ${meta.color}`} />
              {meta.label}
            </Badge>
            <span className="text-sm text-slate-700 truncate">{doc.title}</span>
          </DialogTitle>
          <div className="flex items-center justify-between gap-2 mt-2">
            <p className="text-xs text-slate-500">
              {doc.recipientName} · {new Date(doc.createdAt).toLocaleString('ko-KR')}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadJPG}
                disabled={downloading}
                className="gap-1.5"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {downloading ? '생성 중...' : 'JPG 다운'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleEditCreate}
                title="이 공문을 기반으로 새 공문 작성 (원본은 그대로 유지)"
                className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                수정 생성
              </Button>
              <Button
                size="sm"
                variant={copied ? 'outline' : 'default'}
                onClick={handleCopy}
                className={`gap-1.5 ${copied ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : ''}`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    복사됨
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    메신저용 복사
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-slate-200 px-6 py-6 flex justify-center">
          <div
            style={{
              transform: 'scale(0.78)',
              transformOrigin: 'top center',
              boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
            }}
          >
            <SavedDocumentRender doc={doc} profile={profile} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
