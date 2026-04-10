'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/store/AuthContext'
import { AlertCircle, Package } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { user, isLoading, login } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && user) router.replace('/dashboard')
  }, [user, isLoading, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const ok = await login(email, password)
    if (ok) {
      router.replace('/dashboard')
    } else {
      setError('メールアドレスまたはパスワードが正しくありません')
      setSubmitting(false)
    }
  }

  if (isLoading) return null

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: '#F0F7FB' }}
    >
      {/* ─── 左: ブランドパネル ───────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[380px] flex-shrink-0 px-10 py-12"
        style={{ backgroundColor: '#002B5C' }}
      >
        {/* ロゴ */}
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div
              className="w-9 h-9 rounded flex items-center justify-center"
              style={{ backgroundColor: '#00A0C8' }}
            >
              <Package size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">SimpleWMS</p>
              <p className="text-[11px] leading-tight" style={{ color: 'rgba(255,255,255,0.5)' }}>
                在庫管理システム
              </p>
            </div>
          </div>

          {/* キャッチコピー */}
          <h2 className="text-2xl font-bold text-white leading-snug mb-4">
            倉庫業務を、<br />
            シンプルに。
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
            入荷・入庫から在庫管理、出庫まで<br />
            一元管理できる業務システムです。
          </p>
        </div>

        {/* ティールのアクセントライン */}
        <div>
          <div className="h-px w-16 mb-4" style={{ backgroundColor: '#00A0C8' }} />
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            © 2024 SimpleWMS. All rights reserved.
          </p>
        </div>
      </div>

      {/* ─── 右: ログインフォーム ─────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">

          {/* モバイル用ロゴ */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div
              className="w-8 h-8 rounded flex items-center justify-center"
              style={{ backgroundColor: '#002B5C' }}
            >
              <Package size={16} className="text-white" />
            </div>
            <p className="font-bold text-slate-800 text-sm">SimpleWMS</p>
          </div>

          <div className="mb-8">
            <h1 className="text-xl font-bold text-slate-800">ログイン</h1>
            <p className="text-sm text-slate-500 mt-1">アカウント情報を入力してください</p>
          </div>

          {/* フォームカード */}
          <div className="bg-white rounded-xl shadow-card border border-slate-200 p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* メールアドレス */}
              <div>
                <label htmlFor="email" className="wms-label">
                  メールアドレス
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@wms.local"
                  required
                  className="wms-input"
                />
              </div>

              {/* パスワード */}
              <div>
                <label htmlFor="password" className="wms-label">
                  パスワード
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="wms-input"
                />
              </div>

              {/* エラー */}
              {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2.5">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span className="text-xs">{error}</span>
                </div>
              )}

              {/* ログインボタン */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded text-sm font-semibold text-white transition-colors
                           disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: submitting ? '#1A4070' : '#002B5C',
                }}
                onMouseEnter={(e) => {
                  if (!submitting)
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1A4070'
                }}
                onMouseLeave={(e) => {
                  if (!submitting)
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#002B5C'
                }}
              >
                {submitting ? 'ログイン中...' : 'ログイン'}
              </button>
            </form>
          </div>

          {/* テスト用アカウント */}
          <div className="mt-5 bg-white border border-slate-200 rounded-lg p-4 shadow-card">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">
              テスト用アカウント
            </p>
            <div className="space-y-2">
              {[
                { role: '管理者', email: 'admin@wms.local',    pw: 'password123' },
                { role: '担当者', email: 'operator@wms.local', pw: 'password123' },
              ].map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => { setEmail(a.email); setPassword(a.pw) }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded border border-slate-200
                             hover:border-brand-teal hover:bg-brand-light transition-colors text-left"
                >
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: '#E6F3F9', color: '#005B99' }}
                  >
                    {a.role}
                  </span>
                  <span className="text-xs text-slate-600 font-mono">{a.email}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2.5">
              ※ クリックするとフォームに自動入力されます
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
