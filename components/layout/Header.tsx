'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/store/AuthContext'
import { LogOut, ChevronRight, UserCircle2 } from 'lucide-react'

const PAGE_META: Record<string, { title: string; parent?: string }> = {
  '/dashboard':     { title: 'ダッシュボード' },
  '/arrival':       { title: '入荷予定登録',    parent: '入荷・入庫' },
  '/receiving':     { title: '入庫処理',        parent: '入荷・入庫' },
  '/inventory':     { title: '在庫一覧',        parent: '在庫' },
  '/shipping':      { title: '出庫処理メニュー', parent: '出庫' },
  '/shipping/input':{ title: '出庫入力',        parent: '出庫' },
  '/master':        { title: 'マスタ管理',      parent: '設定' },
}

const ROLE_CONFIG: Record<string, { label: string; style: string }> = {
  admin:    { label: '管理者',       style: 'bg-brand-teal/10 text-brand-teal border border-brand-teal/30' },
  manager:  { label: 'マネージャー', style: 'bg-purple-50 text-purple-700 border border-purple-200' },
  operator: { label: '担当者',       style: 'bg-slate-100 text-slate-600 border border-slate-200' },
}

export default function Header() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const router = useRouter()

  const meta = PAGE_META[pathname] ?? { title: 'SimpleWMS' }

  const handleLogout = () => {
    logout()
    router.replace('/login')
  }

  return (
    <header className="h-14 bg-white flex-shrink-0 flex flex-col">
      {/* ブランドカラーライン（上部） */}
      <div className="h-0.5 w-full" style={{ backgroundColor: '#00A0C8' }} />

      <div className="flex-1 flex items-center px-6 gap-4 border-b border-slate-200">
        {/* パンくず + ページタイトル */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {meta.parent && (
            <>
              <span className="text-xs text-slate-400 whitespace-nowrap">{meta.parent}</span>
              <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />
            </>
          )}
          <h1 className="text-sm font-semibold text-slate-800 truncate">{meta.title}</h1>
        </div>

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
              {(() => {
                const role = ROLE_CONFIG[user.role]
                return role ? (
                  <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${role.style}`}>
                    {role.label}
                  </span>
                ) : null
              })()}
            </div>

            <div className="w-px h-4 bg-slate-200" />

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500
                         hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              <LogOut size={12} />
              <span className="hidden sm:inline">ログアウト</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
