'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Search, FileText, TrendingUp, TrendingDown, CalendarOff,
  Wallet, ListChecks, ChevronDown, ChevronRight,
} from 'lucide-react'

interface DocFull {
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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentDocumentNumber?: string
  /** 행 선택 시 호출 (예: "다시 사용하기") - 미지정 시 버튼 미표시 */
  onReuse?: (doc: DocFull) => void
}

export default function DocumentHistoryDialog({
  open,
  onOpenChange,
  currentDocumentNumber,
  onReuse,
}: Props) {
  const [docs, setDocs] = useState<DocFull[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = async (q?: string) => {
    setLoading(true)
    try {
      const url = q ? `/api/documents?search=${encodeURIComponent(q)}` : '/api/documents'
      const res = await fetch(url)
      const data = await res.json()
      setDocs(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error(err)
      setDocs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      load()
      setExpandedId(null)
      setSearch('')
    }
  }, [open])

  const renderTableSummary = (doc: DocFull): string => {
    if (!doc.tableJson) return ''
    try {
      const t = JSON.parse(doc.tableJson)
      if (Array.isArray(t)) {
        return t
          .map((r) => {
            if (r.productName && r.oldPrice != null && r.newPrice != null) {
              return `• ${r.productName}: ${r.oldPrice.toLocaleString('ko-KR')}원 → ${r.newPrice.toLocaleString('ko-KR')}원`
            }
            if (r.productName && r.unitPrice != null) {
              return `• ${r.productName}: ${r.unitPrice.toLocaleString('ko-KR')}원`
            }
            return ''
          })
          .filter(Boolean)
          .join('\n')
      }
    } catch {}
    return ''
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-3xl w-[calc(100vw-2rem)] max-h-[85vh] overflow-hidden flex flex-col p-0"
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            발행 이력
          </DialogTitle>
          <div className="relative mt-2">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              className="pl-8 h-9 text-sm"
              placeholder="문서번호 / 수신 / 제목으로 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(search)}
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-5 py-3">
          {loading ? (
            <p className="text-center text-slate-400 py-12 text-sm">불러오는 중...</p>
          ) : docs.length === 0 ? (
            <p className="text-center text-slate-400 py-12 text-sm">발행된 공문이 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {docs.map((d) => {
                const meta = TYPE_META[d.type] || { label: d.type, icon: FileText, color: 'text-slate-600' }
                const Icon = meta.icon
                const isCurrent = currentDocumentNumber && d.documentNumber === currentDocumentNumber
                const isOpenRow = expandedId === d.id
                const tableSummary = isOpenRow ? renderTableSummary(d) : ''

                return (
                  <div
                    key={d.id}
                    className={`border rounded-md transition ${
                      isCurrent ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpenRow ? null : d.id)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 cursor-pointer"
                    >
                      {isOpenRow ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="font-mono text-xs text-slate-700 shrink-0">{d.documentNumber}</span>
                      <Badge variant="secondary" className="gap-1 text-[10px] py-0 px-1.5 shrink-0">
                        <Icon className={`w-3 h-3 ${meta.color}`} />
                        {meta.label}
                      </Badge>
                      <span className="text-sm text-slate-700 truncate flex-1">{d.title}</span>
                      <span className="text-xs text-slate-500 shrink-0 hidden sm:inline">{d.recipientName}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {new Date(d.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                      {isCurrent && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0">현재</Badge>
                      )}
                    </button>

                    {isOpenRow && (
                      <div className="border-t bg-slate-50/60 px-3 py-3 space-y-2.5 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                          <div><span className="text-slate-400">수신:</span> {d.recipientName}</div>
                          <div><span className="text-slate-400">발신:</span> {d.senderLine}</div>
                          {d.ccLine && (
                            <div className="sm:col-span-2"><span className="text-slate-400">참조:</span> {d.ccLine}</div>
                          )}
                        </div>

                        <div>
                          <div className="text-slate-400 mb-1">본문</div>
                          <pre className="whitespace-pre-wrap font-sans text-slate-700 bg-white border rounded p-2 max-h-40 overflow-auto leading-relaxed">
                            {d.bodyText || '(없음)'}
                          </pre>
                        </div>

                        {tableSummary && (
                          <div>
                            <div className="text-slate-400 mb-1">표 요약</div>
                            <pre className="whitespace-pre-wrap font-sans text-slate-700 bg-white border rounded p-2 max-h-40 overflow-auto">
                              {tableSummary}
                            </pre>
                          </div>
                        )}

                        {onReuse && (
                          <div className="pt-1 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation()
                                onReuse(d)
                                onOpenChange(false)
                              }}
                            >
                              본문 가져오기
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
