'use client'

import { useState, useMemo } from 'react'
import { PackageCheck, CheckCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useWms } from '@/store/WmsContext'
import {
  type ArrivalSchedule,
  type ArrivalStatus,
  ARRIVAL_STATUS_CONFIG,
} from '@/lib/types'

// ─── ユーティリティ ────────────────────────────────────────────

function calcProgress(schedule: ArrivalSchedule) {
  const total = schedule.items.reduce((s, i) => s + i.scheduledQuantity, 0)
  const received = schedule.items.reduce((s, i) => s + i.receivedQuantity, 0)
  return { total, received, pct: total > 0 ? (received / total) * 100 : 0 }
}

// ─── ステータスバッジ ──────────────────────────────────────────

function ArrivalStatusBadge({ status }: { status: ArrivalStatus }) {
  const cfg = ARRIVAL_STATUS_CONFIG[status]
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cfg.badgeClass}`}>
      {cfg.label}
    </span>
  )
}

// ─── 進捗バー ─────────────────────────────────────────────────

function ProgressBar({
  received,
  total,
  pct,
  status,
}: {
  received: number
  total: number
  pct: number
  status: ArrivalStatus
}) {
  const barColor =
    status === 'completed'
      ? 'bg-green-400'
      : status === 'partial'
      ? 'bg-amber-400'
      : 'bg-slate-200'

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
        {received} / {total}
      </span>
    </div>
  )
}

// ─── 入庫処理モーダル ─────────────────────────────────────────

function ReceivingModal({
  schedule,
  onClose,
}: {
  schedule: ArrivalSchedule
  onClose: () => void
}) {
  const { confirmReceiving } = useWms()

  // 今回入庫数量の入力値 (itemId → 入力文字列)
  const [inputQty, setInputQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(schedule.items.map((i) => [i.id, '']))
  )
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const isReadOnly =
    schedule.status === 'completed' || schedule.status === 'cancelled'

  const { total, received } = calcProgress(schedule)

  const handleConfirm = () => {
    const results = schedule.items
      .map((item) => ({
        itemId: item.id,
        qty: Math.max(0, parseInt(inputQty[item.id] ?? '0') || 0),
      }))
      .filter((r) => r.qty > 0)

    if (results.length === 0) {
      setError('1件以上の入庫数量を入力してください')
      return
    }

    // 上限チェック
    for (const item of schedule.items) {
      const qty = parseInt(inputQty[item.id] ?? '0') || 0
      const remaining = item.scheduledQuantity - item.receivedQuantity
      if (qty > remaining) {
        setError(
          `${item.productName}の入庫数量が残り数量（${remaining}）を超えています`
        )
        return
      }
    }

    confirmReceiving(schedule.id, results)
    setConfirmed(true)
  }

  // 入庫確定後の完了表示
  if (confirmed) {
    return (
      <Modal title={`入庫処理 - ${schedule.code}`} onClose={onClose} size="md">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle size={40} className="text-green-500" />
          <p className="text-sm font-semibold text-slate-700">入庫処理が完了しました</p>
          <p className="text-xs text-slate-500">{schedule.code} の入庫を確定しました</p>
          <button
            onClick={onClose}
            className="mt-3 px-6 py-2 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors"
          >
            閉じる
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`入庫処理 - ${schedule.code}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* スケジュール情報 */}
        <div className="bg-slate-50 rounded-lg px-4 py-3 grid grid-cols-2 gap-x-8 gap-y-1.5">
          {[
            ['仕入先', schedule.supplierName],
            ['ステータス', <ArrivalStatusBadge status={schedule.status} />],
            ['入荷予定日', schedule.scheduledDate],
            ['入庫進捗', `${received} / ${total} 個`],
          ].map(([label, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <dt className="text-xs text-slate-500 w-20 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-slate-800 font-medium">
                {value as React.ReactNode}
              </dd>
            </div>
          ))}
        </div>

        {schedule.note && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
            {schedule.note}
          </div>
        )}

        {/* 明細テーブル */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">商品コード</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">商品名</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">保管場所</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">予定数量</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">入庫済み</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">残り</th>
                {!isReadOnly && (
                  <th className="px-4 py-2.5 text-right font-medium text-slate-500">
                    今回入庫数量
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedule.items.map((item) => {
                const remaining = item.scheduledQuantity - item.receivedQuantity
                const isDone = remaining === 0
                return (
                  <tr
                    key={item.id}
                    className={isDone ? 'bg-green-50/30 opacity-70' : ''}
                  >
                    <td className="px-4 py-3 font-mono text-blue-600">{item.productCode}</td>
                    <td className="px-4 py-3 text-slate-700">{item.productName}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{item.locationCode}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.scheduledQuantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-700 font-medium">
                      {item.receivedQuantity}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${
                      isDone ? 'text-green-600' : 'text-amber-600'
                    }`}>
                      {isDone ? '完了' : remaining}
                    </td>
                    {!isReadOnly && (
                      <td className="px-4 py-3 text-right">
                        {isDone ? (
                          <span className="text-green-500 text-xs">入庫済み</span>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            value={inputQty[item.id] ?? ''}
                            onChange={(e) => {
                              setInputQty((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                              setError('')
                            }}
                            placeholder="0"
                            className="w-20 border border-slate-300 rounded px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-brand-teal"
                          />
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* エラー */}
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {/* フッターボタン */}
        <div className="flex justify-end gap-3 pt-1 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
          >
            {isReadOnly ? '閉じる' : 'キャンセル'}
          </button>
          {!isReadOnly && (
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium flex items-center gap-2"
            >
              <PackageCheck size={15} />
              入庫確定
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── フィルタ設定 ─────────────────────────────────────────────

const STATUS_FILTER_OPTIONS: { value: ArrivalStatus | 'all' | 'active'; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'active', label: '処理対象（未着荷・一部入庫）' },
  { value: 'pending', label: '未着荷' },
  { value: 'partial', label: '一部入庫' },
  { value: 'completed', label: '入庫完了' },
]

// ─── メインページ ─────────────────────────────────────────────

export default function ReceivingPage() {
  const { state } = useWms()
  const [statusFilter, setStatusFilter] = useState<
    ArrivalStatus | 'all' | 'active'
  >('active')
  const [selectedSchedule, setSelectedSchedule] =
    useState<ArrivalSchedule | null>(null)

  const filtered = useMemo(() => {
    return state.arrivalSchedules.filter((s) => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'active')
        return s.status === 'pending' || s.status === 'partial'
      return s.status === statusFilter
    })
  }, [state.arrivalSchedules, statusFilter])

  // ステータスごとの件数（バッジ表示用）
  const counts = useMemo(() => {
    const pending = state.arrivalSchedules.filter(
      (s) => s.status === 'pending'
    ).length
    const partial = state.arrivalSchedules.filter(
      (s) => s.status === 'partial'
    ).length
    return { pending, partial }
  }, [state.arrivalSchedules])

  return (
    <div className="max-w-screen-xl space-y-4">
      {/* ページヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">入庫処理</h2>
          <p className="text-sm text-slate-500 mt-1">
            入荷予定に基づき、実際の入庫数量を記録・確定します
          </p>
        </div>

        {/* 対応件数サマリ */}
        <div className="flex gap-3">
          {counts.pending > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-xs text-slate-600">
                未着荷: <strong>{counts.pending}</strong>件
              </span>
            </div>
          )}
          {counts.partial > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs text-amber-700">
                一部入庫: <strong>{counts.partial}</strong>件
              </span>
            </div>
          )}
        </div>
      </div>

      {/* カード */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* フィルタバー */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as typeof statusFilter)
            }
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white text-slate-700"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500 ml-auto">
            全 <strong className="text-slate-700">{filtered.length}</strong> 件
          </span>
        </div>

        {/* テーブル */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  入荷予定番号
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                  仕入先
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  入荷予定日
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">
                  品目数
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  入庫進捗
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  ステータス
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <PackageCheck size={28} />
                      <p className="text-sm">入庫待ちの入荷予定がありません</p>
                      <p className="text-xs">
                        すべての入荷予定が入庫完了しています
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((schedule) => {
                  const progress = calcProgress(schedule)
                  const isCompleted = schedule.status === 'completed'
                  return (
                    <tr
                      key={schedule.id}
                      onClick={() => setSelectedSchedule(schedule)}
                      className={`cursor-pointer transition-colors ${
                        isCompleted
                          ? 'hover:bg-slate-50/50 opacity-60'
                          : 'hover:bg-blue-50/50'
                      }`}
                    >
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs text-blue-600 font-medium">
                          {schedule.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {schedule.supplierName}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {schedule.scheduledDate}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {schedule.items.length}
                        <span className="text-xs text-slate-400 ml-1">品目</span>
                      </td>
                      <td className="px-4 py-3">
                        <ProgressBar {...progress} status={schedule.status} />
                      </td>
                      <td className="px-4 py-3">
                        <ArrivalStatusBadge status={schedule.status} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 入庫処理モーダル */}
      {selectedSchedule && (
        <ReceivingModal
          schedule={selectedSchedule}
          onClose={() => setSelectedSchedule(null)}
        />
      )}
    </div>
  )
}
