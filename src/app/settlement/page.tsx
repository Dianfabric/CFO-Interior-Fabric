'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatKRW, formatPercent, getCategoryName, getUnitName } from '@/lib/formatters'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import {
  CalendarCheck, TrendingUp, TrendingDown, ArrowRight, DollarSign, Target,
  Banknote, AlertTriangle, ChevronLeft, ChevronRight, Minus,
} from 'lucide-react'

interface SettlementData {
  date: string; dateLabel: string
  totalSales: number; totalExpenses: number; totalPurchases: number
  salesCount: number; expenseCount: number
  totalVariableCost: number; totalCOGS: number; totalContributionMargin: number; contributionMarginRate: number
  variableCostBreakdown: {
    cogs: { label: string; amount: number }
    expenses: { label: string; amount: number; details: { description: string; amount: number; clientName: string | null }[] }
    purchases: { label: string; amount: number; details: { description: string; amount: number; clientName: string | null }[] }
  }
  productCM: {
    productId: string; productName: string; category: string; unit: string
    revenue: number; cogs: number; quantity: number
    contributionMargin: number; contributionMarginRate: number
  }[]
  monthlyFixedCost: number; dailyFixedCost: number
  dailyOperatingProfit: number; dailyBEPRate: number
  monthCumulativeCM: number; monthlyBEPRate: number
  fixedCostBreakdown: { category: string; type: string; description: string; monthlyAmount: number; dailyAmount: number }[]
  cashIn: number; cashOut: number; netCashFlow: number
  newReceivables: { clientName: string; amount: number }[]
  newARTotal: number
  comparison: {
    yesterday: { sales: number; count: number; contributionMargin: number }
    lastWeek: { sales: number; count: number }
  }
  transactions: {
    id: string; type: string; totalAmount: number; paymentMethod: string
    paymentStatus: string; clientName: string; channel: string; description: string | null
    items: { name: string; quantity: number; amount: number }[]
  }[]
}

const TrendIcon = ({ current, previous }: { current: number; previous: number }) => {
  if (current > previous) return <TrendingUp className="w-4 h-4 text-green-500" />
  if (current < previous) return <TrendingDown className="w-4 h-4 text-red-500" />
  return <Minus className="w-4 h-4 text-slate-400" />
}

const changeRate = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? '+100%' : '0%'
  const rate = ((current - previous) / previous) * 100
  return `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`
}

export default function SettlementPage() {
  const [data, setData] = useState<SettlementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])

  const fetchData = async (date: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/settlement/daily?date=${date}`)
      setData(await res.json())
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData(selectedDate) }, [selectedDate])

  const moveDate = (days: number) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + days)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
  if (!data) return <div className="text-center py-20 text-slate-500">데이터를 불러올 수 없습니다</div>

  const bepColor = (rate: number) => rate >= 100 ? 'text-green-600' : rate >= 70 ? 'text-yellow-600' : 'text-red-600'
  const bepBg = (rate: number) => rate >= 100 ? 'bg-green-50 border-green-200' : rate >= 70 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'

  const vcb = data.variableCostBreakdown

  // 워터폴 차트 데이터 (변동비를 매출원가/비용/매입으로 분리)
  const waterfallData = [
    { name: '매출', value: data.totalSales, fill: '#3b82f6' },
    { name: '매출원가', value: -vcb.cogs.amount, fill: '#ef4444' },
    ...(vcb.expenses.amount > 0 ? [{ name: '비용', value: -vcb.expenses.amount, fill: '#f97316' }] : []),
    ...(vcb.purchases.amount > 0 ? [{ name: '매입', value: -vcb.purchases.amount, fill: '#e11d48' }] : []),
    { name: '공헌이익', value: data.totalContributionMargin, fill: '#22c55e' },
    { name: '일일고정비', value: -data.dailyFixedCost, fill: '#f59e0b' },
    { name: '영업이익', value: data.dailyOperatingProfit, fill: data.dailyOperatingProfit >= 0 ? '#22c55e' : '#ef4444' },
  ]

  return (
    <div className="space-y-6">
      {/* 헤더 + 날짜 선택 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-blue-600" /> 일일 결산
          </h1>
          <p className="text-sm text-slate-500">공헌이익 기반 일일 경영 성과 분석</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => moveDate(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-40" />
          <Button variant="outline" size="icon" onClick={() => moveDate(1)}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}>오늘</Button>
        </div>
      </div>

      <p className="text-lg font-semibold text-slate-700">{data.dateLabel} 결산</p>

      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">일 매출</p>
            <p className="text-xl font-bold">{formatKRW(data.totalSales)}</p>
            <div className="flex items-center gap-1 mt-1 text-xs">
              <TrendIcon current={data.totalSales} previous={data.comparison.yesterday.sales} />
              <span className="text-slate-500">전일 대비 {changeRate(data.totalSales, data.comparison.yesterday.sales)}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">공헌이익</p>
            <p className="text-xl font-bold text-green-700">{formatKRW(data.totalContributionMargin)}</p>
            <p className="text-xs text-slate-400 mt-1">공헌이익률 {formatPercent(data.contributionMarginRate)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">영업이익 (고정비 차감)</p>
            <p className={`text-xl font-bold ${data.dailyOperatingProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatKRW(data.dailyOperatingProfit)}
            </p>
            <p className="text-xs text-slate-400 mt-1">일일 고정비 {formatKRW(data.dailyFixedCost)}</p>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${data.dailyBEPRate >= 100 ? 'border-l-green-500' : 'border-l-red-500'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-xs text-slate-500">일일 BEP 달성률</p>
            </div>
            <p className={`text-xl font-bold ${bepColor(data.dailyBEPRate)}`}>{formatPercent(data.dailyBEPRate)}</p>
            <p className="text-xs text-slate-400 mt-1">월 누적 {formatPercent(data.monthlyBEPRate)}</p>
          </CardContent>
        </Card>
      </div>

      {/* 공헌이익 구조 + BEP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 공헌이익 워터폴 */}
        <Card>
          <CardHeader><CardTitle className="text-base">공헌이익 구조 (일일)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${(Math.abs(v) / 10000).toFixed(0)}만`} />
                  <Tooltip formatter={(v: number) => formatKRW(Math.abs(v))} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {waterfallData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm space-y-1">
              <div className="flex justify-between"><span>매출</span><span className="font-medium">{formatKRW(data.totalSales)}</span></div>
              <div className="flex justify-between text-red-600"><span>(-) 매출원가 (제품원가×수량)</span><span>{formatKRW(vcb.cogs.amount)}</span></div>
              {vcb.expenses.amount > 0 && (
                <div>
                  <div className="flex justify-between text-orange-600"><span>(-) 비용 (당일 지출)</span><span>{formatKRW(vcb.expenses.amount)}</span></div>
                  {vcb.expenses.details.map((d, i) => (
                    <div key={i} className="flex justify-between text-xs text-orange-400 pl-4"><span>{d.description}</span><span>{formatKRW(d.amount)}</span></div>
                  ))}
                </div>
              )}
              {vcb.purchases.amount > 0 && (
                <div>
                  <div className="flex justify-between text-rose-600"><span>(-) 원자재 매입</span><span>{formatKRW(vcb.purchases.amount)}</span></div>
                  {vcb.purchases.details.map((d, i) => (
                    <div key={i} className="flex justify-between text-xs text-rose-400 pl-4"><span>{d.description}{d.clientName ? ` (${d.clientName})` : ''}</span><span>{formatKRW(d.amount)}</span></div>
                  ))}
                </div>
              )}
              <div className="flex justify-between text-xs text-slate-400 border-t pt-1"><span>변동비 합계</span><span>{formatKRW(data.totalVariableCost)}</span></div>
              <div className="flex justify-between font-bold text-green-700 border-t pt-1"><span>= 공헌이익</span><span>{formatKRW(data.totalContributionMargin)}</span></div>
              <div className="flex justify-between text-yellow-600"><span>(-) 일일 고정비 배분</span><span>{formatKRW(data.dailyFixedCost)}</span></div>
              <div className="flex justify-between font-bold border-t pt-1">
                <span>= 영업이익</span>
                <span className={data.dailyOperatingProfit >= 0 ? 'text-green-700' : 'text-red-600'}>{formatKRW(data.dailyOperatingProfit)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* BEP 달성 현황 */}
        <Card className={bepBg(data.dailyBEPRate)}>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="w-5 h-5" />손익분기(BEP) 달성 현황</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* 일일 BEP */}
            <div>
              <p className="text-sm font-semibold mb-2">오늘의 BEP</p>
              <div className="w-full bg-white/60 rounded-full h-6 relative overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${Math.min(data.dailyBEPRate, 100)}%`,
                  backgroundColor: data.dailyBEPRate >= 100 ? '#22c55e' : data.dailyBEPRate >= 70 ? '#f59e0b' : '#ef4444',
                }} />
                <div className="absolute left-1/2 top-0 h-full w-0.5 bg-slate-800" title="BEP 100%" />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{formatPercent(data.dailyBEPRate)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>공헌이익: {formatKRW(data.totalContributionMargin)}</span>
                <span>일일 고정비: {formatKRW(data.dailyFixedCost)}</span>
              </div>
            </div>
            {/* 월간 BEP */}
            <div>
              <p className="text-sm font-semibold mb-2">이번 달 누적 BEP</p>
              <div className="w-full bg-white/60 rounded-full h-6 relative overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${Math.min(data.monthlyBEPRate, 100)}%`,
                  backgroundColor: data.monthlyBEPRate >= 100 ? '#22c55e' : data.monthlyBEPRate >= 70 ? '#f59e0b' : '#ef4444',
                }} />
                <div className="absolute left-1/2 top-0 h-full w-0.5 bg-slate-800" title="BEP 100%" />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{formatPercent(data.monthlyBEPRate)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>누적 공헌이익: {formatKRW(data.monthCumulativeCM)}</span>
                <span>월 고정비: {formatKRW(data.monthlyFixedCost)}</span>
              </div>
            </div>
            {/* 고정비 상세 */}
            <div className="pt-2 border-t">
              <p className="text-xs font-semibold mb-2 text-slate-600">고정비 내역 (일일 배분)</p>
              <div className="space-y-1">
                {data.fixedCostBreakdown.map((fc, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-slate-600">{fc.description}</span>
                    <span className="font-medium">{formatKRW(fc.dailyAmount)}/일</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs font-bold border-t pt-1">
                  <span>합계</span>
                  <span>{formatKRW(data.dailyFixedCost)}/일</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 제품별 공헌이익 */}
      <Card>
        <CardHeader><CardTitle className="text-base">제품별 공헌이익 분석</CardTitle></CardHeader>
        <CardContent>
          {data.productCM.length === 0 ? (
            <p className="text-center text-slate-400 py-8">오늘 매출 데이터가 없습니다</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500 bg-slate-50">
                    <th className="p-2 font-medium">제품명</th>
                    <th className="p-2 font-medium">카테고리</th>
                    <th className="p-2 font-medium text-right">수량</th>
                    <th className="p-2 font-medium text-right">매출</th>
                    <th className="p-2 font-medium text-right">매출원가</th>
                    <th className="p-2 font-medium text-right">공헌이익</th>
                    <th className="p-2 font-medium text-right">공헌이익률</th>
                  </tr>
                </thead>
                <tbody>
                  {data.productCM.map((p, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="p-2 font-medium">{p.productName}</td>
                      <td className="p-2"><Badge variant="secondary">{getCategoryName(p.category)}</Badge></td>
                      <td className="p-2 text-right">{p.quantity} {getUnitName(p.unit)}</td>
                      <td className="p-2 text-right">{formatKRW(p.revenue)}</td>
                      <td className="p-2 text-right text-red-600">{formatKRW(p.cogs)}</td>
                      <td className="p-2 text-right font-bold text-green-700">{formatKRW(p.contributionMargin)}</td>
                      <td className="p-2 text-right">
                        <span className={p.contributionMarginRate >= 40 ? 'text-green-600 font-bold' : p.contributionMarginRate >= 20 ? 'text-yellow-600' : 'text-red-600'}>
                          {formatPercent(p.contributionMarginRate)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td className="p-2" colSpan={3}>합계</td>
                    <td className="p-2 text-right">{formatKRW(data.totalSales)}</td>
                    <td className="p-2 text-right text-red-600">{formatKRW(data.totalCOGS)}</td>
                    <td className="p-2 text-right text-green-700">{formatKRW(data.totalContributionMargin)}</td>
                    <td className="p-2 text-right">{formatPercent(data.contributionMarginRate)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 현금흐름 + 미수금 + 비교 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 현금흐름 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Banknote className="w-4 h-4 text-green-600" />현금흐름</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-slate-600">입금 (현금 매출)</span><span className="font-bold text-green-600">+{formatKRW(data.cashIn)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-slate-600">출금 (비용+매입)</span><span className="font-bold text-red-600">-{formatKRW(data.cashOut)}</span></div>
            <div className="flex justify-between text-sm font-bold border-t pt-2">
              <span>순현금흐름</span>
              <span className={data.netCashFlow >= 0 ? 'text-green-700' : 'text-red-600'}>{formatKRW(data.netCashFlow)}</span>
            </div>
          </CardContent>
        </Card>

        {/* 신규 미수금 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-500" />오늘 발생 미수금</CardTitle></CardHeader>
          <CardContent>
            {data.newReceivables.length === 0 ? (
              <p className="text-sm text-green-600 font-medium">오늘 신규 미수금 없음</p>
            ) : (
              <div className="space-y-1">
                {data.newReceivables.map((ar, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-600">{ar.clientName}</span>
                    <span className="font-medium text-red-600">{formatKRW(ar.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold border-t pt-1">
                  <span>합계</span><span className="text-red-600">{formatKRW(data.newARTotal)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 비교 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">전일/전주 비교</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-slate-400 mb-1">vs 전일</p>
              <div className="flex items-center gap-2">
                <TrendIcon current={data.totalSales} previous={data.comparison.yesterday.sales} />
                <span className="text-sm">매출 {changeRate(data.totalSales, data.comparison.yesterday.sales)}</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendIcon current={data.totalContributionMargin} previous={data.comparison.yesterday.contributionMargin} />
                <span className="text-sm">공헌이익 {changeRate(data.totalContributionMargin, data.comparison.yesterday.contributionMargin)}</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">vs 전주 동요일</p>
              <div className="flex items-center gap-2">
                <TrendIcon current={data.totalSales} previous={data.comparison.lastWeek.sales} />
                <span className="text-sm">매출 {changeRate(data.totalSales, data.comparison.lastWeek.sales)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
