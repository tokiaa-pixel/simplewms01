'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
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

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true
  if (href === '/shipping') return false
  return pathname.startsWith(href + '/')
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { t } = useTranslation('nav')

  // ルート変遷時にモバイルメニューを閉じる
  useEffect(() => {
    onClose()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // ナビグループ定義（翻訳キーを使用）
  const navGroups = [
    {
      items: [
        { href: '/dashboard', label: t('dashboard'), icon: LayoutDashboard },
      ],
    },
    {
      label: t('groupInbound'),
      items: [
        { href: '/arrival',   label: t('arrival'),   icon: ClipboardList },
        { href: '/receiving', label: t('receiving'), icon: PackageCheck },
      ],
    },
    {
      label: t('groupInventory'),
      items: [
        { href: '/inventory', label: t('inventory'), icon: Boxes },
      ],
    },
    {
      label: t('groupOutbound'),
      items: [
        { href: '/shipping',       label: t('shipping'),      icon: Truck },
        { href: '/shipping/input', label: t('shippingInput'), icon: PackageMinus },
      ],
    },
    {
      label: t('groupSettings'),
      items: [
        { href: '/master', label: t('master'), icon: Settings },
      ],
    },
  ]

  return (
    <>
      {/* モバイル用オーバーレイ */}
      <div
        className={`
          fixed inset-0 z-30 bg-slate-900/50
          transition-opacity duration-200 md:hidden
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* サイドバー本体 */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40
          md:static md:inset-auto md:z-auto
          w-[220px] flex-shrink-0 flex flex-col h-full overflow-hidden
          transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{ backgroundColor: '#002B5C' }}
      >
        {/* ─── ロゴ ─────────────────────────────────────────── */}
        <div
          className="h-14 flex items-center gap-3 px-5 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        >
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
              WMS
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
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded text-sm transition-all"
                        style={
                          active
                            ? { backgroundColor: '#00A0C8', color: '#ffffff', fontWeight: 600 }
                            : { color: 'rgba(255,255,255,0.6)' }
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
                          <item.icon size={14} />
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
    </>
  )
}
