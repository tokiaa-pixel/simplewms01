'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/store/AuthContext'
import { useTranslation } from '@/lib/i18n'
import { LogOut, ChevronRight, UserCircle2, Menu } from 'lucide-react'
import LanguageSwitcher from './LanguageSwitcher'

const PAGE_KEYS: Record<string, { titleKey: string; parentKey?: string }> = {
  '/dashboard':      { titleKey: 'nav.dashboard' },
  '/arrival':        { titleKey: 'nav.arrival',       parentKey: 'nav.groupInbound' },
  '/receiving':      { titleKey: 'nav.receiving',     parentKey: 'nav.groupInbound' },
  '/inventory':      { titleKey: 'nav.inventory',     parentKey: 'nav.groupInventory' },
  '/shipping':       { titleKey: 'nav.shipping',      parentKey: 'nav.groupOutbound' },
  '/shipping/input': { titleKey: 'nav.shippingInput', parentKey: 'nav.groupOutbound' },
  '/master':         { titleKey: 'nav.master',        parentKey: 'nav.groupSettings' },
}

const ROLE_STYLE: Record<string, string> = {
  admin:    'bg-brand-teal/10 text-brand-teal border border-brand-teal/30',
  manager:  'bg-purple-50 text-purple-700 border border-purple-200',
  operator: 'bg-slate-100 text-slate-600 border border-slate-200',
}

export default function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const router = useRouter()
  const { t: tn } = useTranslation('nav')
  const { t: th } = useTranslation('header')

  const meta = PAGE_KEYS[pathname]
  const pageTitle  = meta ? tn(meta.titleKey.replace('nav.', '') as Parameters<typeof tn>[0]) : 'SimpleWMS'
  const pageParent = meta?.parentKey
    ? tn(meta.parentKey.replace('nav.', '') as Parameters<typeof tn>[0])
    : undefined

  const roleLabel = user ? (
    user.role === 'admin'    ? th('roleAdmin')    :
    user.role === 'manager'  ? th('roleManager')  :
    user.role === 'operator' ? th('roleOperator') : null
  ) : null

  const handleLogout = () => {
    logout()
    router.replace('/login')
  }

  return (
    <header className="h-14 bg-white flex-shrink-0 flex flex-col">
      {/* ブランドカラーライン（上部） */}
      <div className="h-0.5 w-full" style={{ backgroundColor: '#00A0C8' }} />

      <div className="flex-1 flex items-center px-3 sm:px-6 gap-2 sm:gap-4 border-b border-slate-200">
        {/* ハンバーガーボタン（モバイルのみ） */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-2.5 rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
          aria-label={th('menuOpen')}
        >
          <Menu size={18} />
        </button>

        {/* パンくず + ページタイトル */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {pageParent && (
            <>
              <span className="text-xs text-slate-400 whitespace-nowrap">{pageParent}</span>
              <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />
            </>
          )}
          <h1 className="text-sm font-semibold text-slate-800 truncate">{pageTitle}</h1>
        </div>

        {/* 言語切替 */}
        <LanguageSwitcher />

        {/* ユーザー情報 */}
        {user && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#E6F3F9' }}
              >
                <UserCircle2 size={16} style={{ color: '#005B99' }} />
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-medium text-slate-700 leading-none">{user.name}</p>
              </div>
              {roleLabel && (
                <span className={`hidden sm:inline px-2 py-0.5 text-[10px] font-semibold rounded ${ROLE_STYLE[user.role] ?? ''}`}>
                  {roleLabel}
                </span>
              )}
            </div>

            <div className="w-px h-4 bg-slate-200" />

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 py-2 text-xs text-slate-500
                         hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              <LogOut size={12} />
              <span className="hidden sm:inline">{th('logout')}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
