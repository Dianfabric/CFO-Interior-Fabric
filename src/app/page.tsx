'use client'

import { useEffect, useState } from 'react'
import KPICards from '@/components/dashboard/KPICards'
import SalesChart from '@/components/dashboard/SalesChart'
import ProductChart from '@/components/dashboard/ProductChart'
import ARSummaryChart from '@/components/dashboard/ARSummaryChart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatKRW, formatDate, formatPercent, getTransactionTypeName, getPaymentMethodName, getPaymentStatusName, getCategoryName } from '@/lib/formatters'
import { Bot, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'

interface DashboardData {
  kpi: {
    todaySales: number
    monthSales: number
    monthExpenses: number
    monthProfit: number
    monthMarginRate: number
    totalReceivable: number
    salesCount: number
    previousMonthSales: number
  }
  dailySales: { label: string; sales: number; expenses: number; profit: number }[]
  arAging: { period: string; amount: number; count: number }[]
  productData: { name: string; revenue: number; margin: number; grade: string }[]
  recentTransactions: {
    id: string
    date: string
    type: string
    clientName: string
    totalAmount: number
    paymentMethod: string
    paymentStatus: string
    channel: string
    description: string
  }[]
  yearlyAnalysis: {
    monthlyBreakdown: { month: string; label: string; sales: number; expenses: number; profit: number }[]
    quarterlyBreakdown: { quarter: string; sales: number; expenses: number; profit: number }[]
    channelBreakdown: { channel: string; sales: number; cost: number; profit: number; count: number }[]
    productBreakdown: { name: string; category: string; sales: number; cost: number; profit: number; marginRate: number; quantity: number }[]
  }
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dashboard')
      const json = await res.json()
      setData(json)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-slate-500">
        데이터를 불러올 수 없습니다.
      </div>
    )
  }

  const paymentStatusVariant = (status: string) => {
    if (status === 'PAID') return 'secondary' as const
    if (status === 'PARTIAL') return 'outline' as const
    return 'destructive' as const
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">경영 대시보드</h1>
          <p className="text-sm text-slate-500">실시간 경영 현황을 한눈에 확인하세요</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} className="gap-1">
          <RefreshCw className="w-4 h-4" />
          새로고침
        </Button>
      </div>

      {/* KPI 카드 */}
      <KPICards data={data.kpi} />

      {/* 차트 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SalesChart data={data.dailySales} title="최근 7일 매출 추이" />
        <ProductChart data={data.productData} />
      </div>

      {/* 미수금 + AI 인사이트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ARSummaryChart
          data={data.arAging}
          totalAR={data.kpi.totalReceivable}
        />
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-600" />
              AI CFO 인사이트
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 leading-relaxed">
              {data.kpi.monthSales === 0 ? (
                '아직 거래 데이터가 없습니다. 첫 거래를 입력하면 AI가 경영 인사이트를 제공합니다.'
              ) : data.kpi.totalReceivable > data.kpi.monthSales * 0.5 ? (
                '⚠️ 미수금이 월 매출의 50%를 초과하고 있습니다. 현금흐름 관리에 주의가 필요합니다. AI CFO 자문 메뉴에서 상세 분석을 받아보세요.'
              ) : data.kpi.monthMarginRate < 15 ? (
                '📊 이익률이 15% 미만입니다. 가격 전략 재검토가 필요할 수 있습니다. 분석/시뮬레이션 메뉴에서 가격 시뮬레이션을 해보세요.'
              ) : (
                `✅ 이번 달 이익률 ${data.kpi.monthMarginRate.toFixed(1)}%로 양호합니다. AI CFO 자문에서 더 자세한 전략 분석을 받아보세요.`
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 최근 거래 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 거래 내역</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentTransactions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              거래 내역이 없습니다. &quot;새 거래&quot; 버튼을 눌러 첫 거래를 입력하세요.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="pb-2 font-medium">날짜</th>
                    <th className="pb-2 font-medium">구분</th>
                    <th className="pb-2 font-medium">거래처</th>
                    <th className="pb-2 font-medium text-right">금액</th>
                    <th className="pb-2 font-medium">결제</th>
                    <th className="pb-2 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTransactions.map((t) => (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2.5">{formatDate(t.date)}</td>
                      <td>
                        <Badge variant={t.type === 'SALE' ? 'default' : 'secondary'}>
                          {getTransactionTypeName(t.type)}
                        </Badge>
                      </td>
                      <td className="text-slate-700">{t.clientName}</td>
                      <td className="text-right font-medium">{formatKRW(t.totalAmount)}</td>
                      <td className="text-slate-600">{getPaymentMethodName(t.paymentMethod)}</td>
                      <td>
                        <Badge variant={paymentStatusVariant(t.paymentStatus)}>
                          {getPaymentStatusName(t.paymentStatus)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== 금년도 종합 분석 ===== */}
      {data.yearlyAnalysis && (
        <>
          <div className="pt-4">
            <h2 className="text-xl font-bold text-slate-900 mb-1">{new Date().getFullYear()}년 종합 분석</h2>
            <p className="text-sm text-slate-500 mb-4">분기별·월별·채널별·제품별 매출과 순이익을 확인합니다</p>
          </div>

          {/* 분기별 매출/순이익 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">분기별 매출 / 순이익</CardTitle></CardHeader>
              <CardContent>
                {data.yearlyAnalysis.quarterlyBreakdown.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">데이터 없음</p>
                ) : (
                  <>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.yearlyAnalysis.quarterlyBreakdown}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="quarter" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
                          <Tooltip formatter={(v: number) => formatKRW(v)} />
                          <Legend />
                          <Bar dataKey="sales" name="매출" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="profit" name="순이익" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-slate-500"><th className="pb-2 text-left">분기</th><th className="pb-2 text-right">매출</th><th className="pb-2 text-right">비용</th><th className="pb-2 text-right">순이익</th><th className="pb-2 text-right">이익률</th></tr></thead>
                        <tbody>
                          {data.yearlyAnalysis.quarterlyBreakdown.map((q) => (
                            <tr key={q.quarter} className="border-b last:border-0">
                              <td className="py-2 font-medium">{q.quarter}</td>
                              <td className="py-2 text-right">{formatKRW(q.sales)}</td>
                              <td className="py-2 text-right text-red-600">{formatKRW(q.expenses)}</td>
                              <td className="py-2 text-right font-bold text-green-700">{formatKRW(q.profit)}</td>
                              <td className="py-2 text-right">{q.sales > 0 ? formatPercent((q.profit / q.sales) * 100) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 월별 매출/순이익 */}
            <Card>
              <CardHeader><CardTitle className="text-base">월별 매출 / 순이익</CardTitle></CardHeader>
              <CardContent>
                {data.yearlyAnalysis.monthlyBreakdown.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">데이터 없음</p>
                ) : (
                  <>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.yearlyAnalysis.monthlyBreakdown}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
                          <Tooltip formatter={(v: number) => formatKRW(v)} />
                          <Legend />
                          <Bar dataKey="sales" name="매출" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="profit" name="순이익" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-slate-500"><th className="pb-2 text-left">월</th><th className="pb-2 text-right">매출</th><th className="pb-2 text-right">비용</th><th className="pb-2 text-right">순이익</th><th className="pb-2 text-right">이익률</th></tr></thead>
                        <tbody>
                          {data.yearlyAnalysis.monthlyBreakdown.map((m) => (
                            <tr key={m.month} className="border-b last:border-0">
                              <td className="py-2 font-medium">{m.month}</td>
                              <td className="py-2 text-right">{formatKRW(m.sales)}</td>
                              <td className="py-2 text-right text-red-600">{formatKRW(m.expenses)}</td>
                              <td className="py-2 text-right font-bold text-green-700">{formatKRW(m.profit)}</td>
                              <td className="py-2 text-right">{m.sales > 0 ? formatPercent((m.profit / m.sales) * 100) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 채널별 + 제품별 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 채널(직군)별 매출/순이익 */}
            <Card>
              <CardHeader><CardTitle className="text-base">채널별 매출 / 순이익</CardTitle></CardHeader>
              <CardContent>
                {data.yearlyAnalysis.channelBreakdown.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">데이터 없음</p>
                ) : (
                  <>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.yearlyAnalysis.channelBreakdown} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
                          <YAxis type="category" dataKey="channel" tick={{ fontSize: 12 }} width={90} />
                          <Tooltip formatter={(v: number) => formatKRW(v)} />
                          <Legend />
                          <Bar dataKey="sales" name="매출" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                          <Bar dataKey="profit" name="순이익" fill="#22c55e" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-slate-500"><th className="pb-2 text-left">채널</th><th className="pb-2 text-right">매출</th><th className="pb-2 text-right">원가</th><th className="pb-2 text-right">순이익</th><th className="pb-2 text-right">건수</th></tr></thead>
                        <tbody>
                          {data.yearlyAnalysis.channelBreakdown.map((ch) => (
                            <tr key={ch.channel} className="border-b last:border-0">
                              <td className="py-2 font-medium">{ch.channel}</td>
                              <td className="py-2 text-right">{formatKRW(ch.sales)}</td>
                              <td className="py-2 text-right text-red-600">{formatKRW(ch.cost)}</td>
                              <td className="py-2 text-right font-bold text-green-700">{formatKRW(ch.profit)}</td>
                              <td className="py-2 text-right text-slate-500">{ch.count}건</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* 제품별 매출/순이익 */}
            <Card>
              <CardHeader><CardTitle className="text-base">제품별 매출 / 순이익</CardTitle></CardHeader>
              <CardContent>
                {data.yearlyAnalysis.productBreakdown.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">데이터 없음</p>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white"><tr className="border-b text-slate-500"><th className="pb-2 text-left">제품</th><th className="pb-2 text-left">카테고리</th><th className="pb-2 text-right">매출</th><th className="pb-2 text-right">순이익</th><th className="pb-2 text-right">마진율</th></tr></thead>
                      <tbody>
                        {data.yearlyAnalysis.productBreakdown.map((p, i) => (
                          <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                            <td className="py-2 font-medium">{p.name}</td>
                            <td className="py-2"><Badge variant="secondary">{getCategoryName(p.category)}</Badge></td>
                            <td className="py-2 text-right">{formatKRW(p.sales)}</td>
                            <td className="py-2 text-right font-bold text-green-700">{formatKRW(p.profit)}</td>
                            <td className={`py-2 text-right font-bold ${p.marginRate >= 40 ? 'text-green-600' : p.marginRate >= 20 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {formatPercent(p.marginRate)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-bold">
                          <td className="py-2" colSpan={2}>합계</td>
                          <td className="py-2 text-right">{formatKRW(data.yearlyAnalysis.productBreakdown.reduce((s, p) => s + p.sales, 0))}</td>
                          <td className="py-2 text-right text-green-700">{formatKRW(data.yearlyAnalysis.productBreakdown.reduce((s, p) => s + p.profit, 0))}</td>
                          <td className="py-2 text-right">
                            {(() => {
                              const ts = data.yearlyAnalysis.productBreakdown.reduce((s, p) => s + p.sales, 0)
                              const tp = data.yearlyAnalysis.productBreakdown.reduce((s, p) => s + p.profit, 0)
                              return ts > 0 ? formatPercent((tp / ts) * 100) : '-'
                            })()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
