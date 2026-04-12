'use client'

/**
 * 汎用ステータスバッジ。
 * ラベルと CSS クラスを外から受け取るプリミティブ。
 * 翻訳・config lookup は呼び出し側のアダプタが行う。
 *
 * dotClass を渡すと左側に小さな色付きドットを表示する（在庫・出庫バッジ用）。
 * 渡さない場合はシンプルなテキストバッジになる（入荷バッジ用）。
 */
interface StatusBadgeProps {
  label:      string
  badgeClass: string
  dotClass?:  string  // 省略時はドット非表示
}

export default function StatusBadge({ label, badgeClass, dotClass }: StatusBadgeProps) {
  if (dotClass) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${badgeClass}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
        {label}
      </span>
    )
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badgeClass}`}>
      {label}
    </span>
  )
}
