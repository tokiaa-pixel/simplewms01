'use client'

/**
 * 一覧データが 0 件のときに表示する空状態プレースホルダー。
 * アイコン・メッセージ・任意のリセットアクションを描画する。
 *
 * 使い方:
 *   // モバイルカード内（div コンテナに py-12 など付与）
 *   <div className="py-12"><EmptyState icon={<Pkg size={28}/>} message="..." /></div>
 *
 *   // テーブル tbody 内
 *   <tr><td colSpan={N} className="py-16 text-center">
 *     <EmptyState icon={<Pkg size={28}/>} message="..." />
 *   </td></tr>
 */
interface EmptyStateProps {
  icon:     React.ReactNode
  message:  string
  action?:  { label: string; onClick: () => void }
}

export default function EmptyState({ icon, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 text-slate-400">
      {icon}
      <p className="text-sm">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-xs text-blue-500 hover:underline mt-1"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
