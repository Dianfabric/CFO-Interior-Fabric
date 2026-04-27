'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, ChevronDown, User, X } from 'lucide-react'

export interface ClientOption {
  id: string
  name: string
  contactName?: string | null
  phone?: string | null
  email?: string | null
  businessNumber?: string | null
}

interface Props {
  clients: ClientOption[]
  value: string          // clientId
  onChange: (id: string, client: ClientOption | null) => void
  placeholder?: string
}

export default function ClientCombobox({ clients, value, onChange, placeholder = '거래처 검색 또는 선택' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = clients.find(c => c.id === value) || null

  const filtered = clients.filter(c => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      c.contactName?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.businessNumber?.includes(q)
    )
  })

  // 바깥 클릭시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (c: ClientOption) => {
    onChange(c.id, c)
    setOpen(false)
    setQuery('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('', null)
    setQuery('')
  }

  const handleOpen = () => {
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div ref={containerRef} className="relative">
      {/* 트리거 버튼 */}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between border rounded-md h-9 px-3 text-sm bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={selected ? 'text-slate-900' : 'text-slate-400'}>
          {selected ? (
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-medium">{selected.name}</span>
              {selected.contactName && (
                <span className="text-slate-400 text-xs">/ {selected.contactName}</span>
              )}
            </span>
          ) : placeholder}
        </span>
        <div className="flex items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleClear(e as any)}
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
          {/* 검색 인풋 */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="거래처명 · 담당자 · 전화 검색"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>

          {/* 목록 */}
          <ul className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <li className="text-center text-xs text-slate-400 py-6">검색 결과 없음</li>
            ) : (
              filtered.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(c)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-blue-50 flex items-start gap-2 transition
                      ${value === c.id ? 'bg-blue-50' : ''}`}
                  >
                    <User className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-slate-900 truncate">{c.name}</div>
                      <div className="text-xs text-slate-500 flex gap-2 mt-0.5 flex-wrap">
                        {c.contactName && <span>담당 {c.contactName}</span>}
                        {c.phone && <span>{c.phone}</span>}
                        {c.businessNumber && <span className="text-slate-400">{c.businessNumber}</span>}
                      </div>
                    </div>
                    {value === c.id && (
                      <span className="ml-auto text-blue-600 text-xs shrink-0">선택됨</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>

          {/* 직접 입력 옵션 */}
          {query.trim() && !filtered.find(c => c.name === query) && (
            <div className="border-t p-2">
              <button
                type="button"
                onClick={() => {
                  // Airtable에 없어도 입력한 이름으로 수신 거래처 설정
                  onChange('', { id: '', name: query, phone: null, email: null })
                  setOpen(false)
                  setQuery('')
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded font-medium"
              >
                + &ldquo;{query}&rdquo; 로 직접 입력
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
