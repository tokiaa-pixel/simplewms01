'use client'

import { Loader2, AlertCircle } from 'lucide-react'

/**
 * ページ全体の loading / error 状態を吸収するシェル。
 *
 * - loading=true  : スピナーを表示して children を描画しない
 * - error 非 null : エラーカードを表示して children を描画しない
 * - それ以外      : children をそのまま描画（ラッパーなし）
 *
 * title / subtitle を渡すと loading / error 状態でもページ見出しが表示される。
 * 渡さない場合（shipping など）は loading 時に中央スピナーのみ表示する。
 *
 * onRetry を渡すとエラーカードに「再試行」ボタンを表示する。
 */
interface PageShellProps {
  loading:     boolean
  error:       string | null
  onRetry?:    () => void
  title?:      string
  subtitle?:   string
  children:    React.ReactNode
}

export default function PageShell({
  loading,
  error,
  onRetry,
  title,
  subtitle,
  children,
}: PageShellProps) {
  // ページ見出し（loading / error 時に使用）
  const header = title ? (
    <div>
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
    </div>
  ) : null

  // ─── ローディング ────────────────────────────────────────────────
  if (loading) {
    const spinner = (
      <div className="bg-white rounded-lg border border-slate-200 flex items-center justify-center py-24 gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">読み込み中...</span>
      </div>
    )
    if (header) {
      return (
        <div className="max-w-screen-xl space-y-4">
          {header}
          {spinner}
        </div>
      )
    }
    // title なし（shipping など）: 中央スピナーのみ
    return (
      <div className="max-w-screen-xl flex items-center justify-center py-24 gap-3 text-slate-400">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">読み込み中...</span>
      </div>
    )
  }

  // ─── エラー ──────────────────────────────────────────────────────
  if (error) {
    const errorCard = (
      <div className="bg-white rounded-lg border border-red-200 flex items-start gap-3 px-6 py-8 text-red-600">
        <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">データの取得に失敗しました</p>
          <p className="text-xs mt-1 text-red-400 font-mono">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 text-xs text-red-600 underline hover:no-underline"
            >
              再試行
            </button>
          )}
        </div>
      </div>
    )
    if (header) {
      return (
        <div className="max-w-screen-xl space-y-4">
          {header}
          {errorCard}
        </div>
      )
    }
    return <div className="max-w-screen-xl">{errorCard}</div>
  }

  // ─── 正常描画 ────────────────────────────────────────────────────
  return <>{children}</>
}
