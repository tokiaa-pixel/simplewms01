'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** true のとき × ボタン・背景クリック・Escキーを無効化する */
  locked?: boolean
}

const SIZE_CLASS = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
}

export default function Modal({
  title,
  onClose,
  children,
  size = 'md',
  locked = false,
}: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, locked])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:px-4"
      onClick={locked ? undefined : onClose}
    >
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-slate-900/50" />

      {/* モーダル本体 */}
      <div
        className={`
          relative z-10 bg-white w-full
          rounded-t-2xl sm:rounded-xl
          shadow-2xl flex flex-col
          max-h-[92vh] sm:max-h-[85vh]
          ${SIZE_CLASS[size]}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 flex-shrink-0">
          {/* モバイル用ドラッグインジケーター */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-slate-300 rounded-full sm:hidden" />
          <h2 className="text-sm font-semibold text-slate-800 mt-1 sm:mt-0">{title}</h2>
          <button
            onClick={locked ? undefined : onClose}
            disabled={locked}
            className="p-2 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="閉じる"
          >
            <X size={15} />
          </button>
        </div>

        {/* ボディ（スクロール可） */}
        <div className="relative flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  )
}
