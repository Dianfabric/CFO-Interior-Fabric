'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Settings, Building, Key, Database, Download, Upload, Image as ImageIcon, X } from 'lucide-react'

interface CompanyProfile {
  name: string
  businessNumber: string
  representative: string
  phone: string
  fax: string
  address: string
  email: string
  website: string
  bankInfo: string
  logoPath: string
  sealPath: string
}

const EMPTY_PROFILE: CompanyProfile = {
  name: '', businessNumber: '', representative: '', phone: '', fax: '',
  address: '', email: '', website: '', bankInfo: '', logoPath: '', sealPath: '',
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const sealInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/company-profile')
        const json = await res.json()
        // null 값을 빈 문자열로 정규화 (controlled input 오류 방지)
        const normalized: CompanyProfile = { ...EMPTY_PROFILE }
        for (const k of Object.keys(EMPTY_PROFILE) as (keyof CompanyProfile)[]) {
          normalized[k] = json[k] ?? ''
        }
        setProfile(normalized)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSave = async () => {
    try {
      await fetch('/api/company-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error(err)
    }
  }

  const handleUpload = async (kind: 'logo' | 'seal', file: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', kind)
    const res = await fetch('/api/company-profile/upload', { method: 'POST', body: form })
    const json = await res.json()
    if (json.path) {
      const next = { ...profile, [kind === 'logo' ? 'logoPath' : 'sealPath']: json.path }
      setProfile(next)
      // 즉시 저장
      await fetch('/api/company-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
    }
  }

  const handleExport = async (type: string) => {
    try {
      let data
      if (type === 'transactions') {
        const res = await fetch('/api/transactions?limit=9999')
        data = await res.json()
      } else if (type === 'products') {
        const res = await fetch('/api/products')
        data = await res.json()
      } else if (type === 'clients') {
        const res = await fetch('/api/clients')
        data = await res.json()
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${type}_${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96 text-slate-400">불러오는 중...</div>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-6 h-6" /> 설정
        </h1>
        <p className="text-sm text-slate-500">회사 정보, 직인/로고, API 키, 데이터 관리를 설정합니다</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Building className="w-4 h-4" />회사 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>회사명</Label><Input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} placeholder="다이안패브릭" /></div>
            <div><Label>사업자번호</Label><Input value={profile.businessNumber} onChange={e => setProfile({ ...profile, businessNumber: e.target.value })} placeholder="000-00-00000" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>대표자명</Label><Input value={profile.representative} onChange={e => setProfile({ ...profile, representative: e.target.value })} /></div>
            <div><Label>전화번호</Label><Input value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>팩스</Label><Input value={profile.fax} onChange={e => setProfile({ ...profile, fax: e.target.value })} /></div>
            <div><Label>이메일</Label><Input value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} /></div>
          </div>
          <div><Label>주소</Label><Input value={profile.address} onChange={e => setProfile({ ...profile, address: e.target.value })} /></div>
          <div><Label>홈페이지</Label><Input value={profile.website} onChange={e => setProfile({ ...profile, website: e.target.value })} placeholder="https://..." /></div>
          <div><Label>거래은행 / 계좌</Label><Textarea rows={2} value={profile.bankInfo} onChange={e => setProfile({ ...profile, bankInfo: e.target.value })} placeholder="국민은행 000-00-0000-000 (예금주)" /></div>
          <Button onClick={handleSave}>{saved ? '저장 완료!' : '저장'}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ImageIcon className="w-4 h-4" />로고 / 직인</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="mb-2 block">회사 로고</Label>
              <div className="border rounded-lg p-3 bg-white flex items-center justify-center h-32">
                {profile.logoPath ? (
                  <img src={profile.logoPath} alt="logo" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-400">로고 없음</span>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleUpload('logo', e.target.files[0])}
                />
                <Button size="sm" variant="outline" onClick={() => logoInputRef.current?.click()} className="gap-1">
                  <Upload className="w-3.5 h-3.5" />업로드
                </Button>
                {profile.logoPath && (
                  <Button size="sm" variant="ghost" onClick={() => setProfile({ ...profile, logoPath: '' })} className="gap-1">
                    <X className="w-3.5 h-3.5" />제거
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">직인 (도장)</Label>
              <div className="border rounded-lg p-3 bg-white flex items-center justify-center h-32">
                {profile.sealPath ? (
                  <img src={profile.sealPath} alt="seal" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-400">직인 없음</span>
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  ref={sealInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleUpload('seal', e.target.files[0])}
                />
                <Button size="sm" variant="outline" onClick={() => sealInputRef.current?.click()} className="gap-1">
                  <Upload className="w-3.5 h-3.5" />업로드
                </Button>
                {profile.sealPath && (
                  <Button size="sm" variant="ghost" onClick={() => setProfile({ ...profile, sealPath: '' })} className="gap-1">
                    <X className="w-3.5 h-3.5" />제거
                  </Button>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">PNG / JPG / WEBP. 직인은 배경 투명 PNG가 가장 깔끔하게 합성됩니다.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Key className="w-4 h-4" />AI / 구글 드라이브 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">.env 파일에 다음 키를 설정하세요:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><code>ANTHROPIC_API_KEY</code> — AI 자문 / 공문 초안 작성</li>
              <li><code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> — 구글 드라이브 저장</li>
              <li><code>NEXT_PUBLIC_GOOGLE_DRIVE_ROOT_FOLDER_ID</code> — 저장 위치 폴더 ID</li>
            </ul>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">상태</Badge>
            <span className="text-sm text-slate-600">서버 환경변수에서 관리됨</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Database className="w-4 h-4" />데이터 관리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">데이터를 JSON 형식으로 내보낼 수 있습니다.</p>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => handleExport('transactions')} className="gap-1"><Download className="w-3.5 h-3.5" />거래 내역</Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('products')} className="gap-1"><Download className="w-3.5 h-3.5" />제품 목록</Button>
            <Button variant="outline" size="sm" onClick={() => handleExport('clients')} className="gap-1"><Download className="w-3.5 h-3.5" />거래처 목록</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>인테리어 원단 CFO v1.0</span>
            <span>Next.js 15 + Prisma + SQLite + Claude API</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
