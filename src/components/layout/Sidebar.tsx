'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Receipt,
  Users,
  AlertCircle,
  Package,
  Wallet,
  BarChart3,
  Bot,
  Settings,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const menuItems = [
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  { href: '/settlement', label: '일일 결산', icon: CalendarCheck },
  { href: '/transactions', label: '거래 관리', icon: Receipt },
  { href: '/clients', label: '거래처 관리', icon: Users },
  { href: '/receivables', label: '미수금 관리', icon: AlertCircle },
  { href: '/products', label: '제품 관리', icon: Package },
  { href: '/costs', label: '비용 관리', icon: Wallet },
  { href: '/analysis', label: '분석/시뮬레이션', icon: BarChart3 },
  { href: '/advisor', label: 'AI CFO 자문', icon: Bot },
  { href: '/documents', label: '공문 작성', icon: FileText },
  { href: '/settings', label: '설정', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'h-screen bg-slate-900 text-white flex flex-col transition-all duration-300 sticky top-0',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-400" />
            <span className="font-bold text-lg">CFO</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-slate-700 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {menuItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)
            const Icon = item.icon

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="p-4 border-t border-slate-700">
          <p className="text-xs text-slate-400 text-center">
            인테리어 원단 CFO v1.0
          </p>
        </div>
      )}
    </aside>
  )
}
