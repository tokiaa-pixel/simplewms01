'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ClipboardList,
  PackageCheck,
  Boxes,
  PackageMinus,
  Truck,
  Settings,
  Package,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

interface NavGroup {
  label?: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    items: [
      { href: '/dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
    ],
  },
  {
    label: '入荷・入庫',
    items: [
      { href: '/arrival',   label: '入荷予定登録', icon: ClipboardList },
      { href: '/receiving', label: '入庫処理',     icon: PackageCheck },
    ],
  },
  {
    label: '在庫',
    items: [
      { href: '/inventory', label: '在庫一覧', icon: Boxes },
    ],
  },
  {
    label: '出庫',
    items: [
      { href: '/shipping',       label: '出庫処理メニュー', icon: Truck },
      { href: '/shipping/input', label: '出庫入力',         icon: PackageMinus },
    ],
  },
  {
    label: '設定',
    items: [
      { href: '/master', label: 'マスタ管理', icon: Settings },
    ],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/shipping') return false
  return pathname.startsWith(href + '/')
}

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="w-[220px] flex-shrink-0 flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: '#002B5C' }}
    >
      {/* ─── ロゴ ─────────────────────────────────────────── */}
      <div
        className="h-14 flex items-center gap-3 px-5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* ティール四角アイコン */}
        <div
          className="w-7 h-7 flex items-center justify-center rounded flex-shrink-0"
          style={{ backgroundColor: '#00A0C8' }}
        >
          <Package size={14} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-bold text-sm leading-tight tracking-wide truncate">
            SimpleWMS
          </p>
          <p className="text-[10px] leading-tight truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
            在庫管理システム
          </p>
        </div>
      </div>

      {/* ─── ナビゲーション ───────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
            {group.label && (
              <p
                className="px-5 pb-1.5 text-[9px] font-bold uppercase tracking-widest"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-all"
                      style={
                        active
                          ? {
                              backgroundColor: '#00A0C8',
                              color: '#ffffff',
                              fontWeight: 600,
                            }
                          : {
                              color: 'rgba(255,255,255,0.6)',
                            }
                      }
                      onMouseEnter={(e) => {
                        if (!active)
                          (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                            'rgba(255,255,255,0.08)'
                      }}
                      onMouseLeave={(e) => {
                        if (!active)
                          (e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                            'transparent'
                      }}
                    >
                      <span style={{ opacity: active ? 1 : 0.7 }} className="flex-shrink-0 flex items-center">
                        <item.icon size={14} className="" />
                      </span>
                      <span className="truncate text-[13px]">{item.label}</span>
                      {active && (
                        <span
                          className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: 'rgba(255,255,255,0.7)' }}
                        />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ─── フッター ─────────────────────────────────────── */}
      <div
        className="flex items-center px-5 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
      >
        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          v0.1.0
        </span>
      </div>
    </aside>
  )
}
