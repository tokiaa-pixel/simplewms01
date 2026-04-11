'use client'

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import {
  ClipboardList,
  PackageMinus,
  Search as SearchIcon,
  CheckCircle,
  Truck,
  ScanLine,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import { useWms } from '@/store/WmsContext'
import {
  type ShippingOrder,
  type ShippingStatus,
  SHIPPING_STATUS_CONFIG,
} from '@/lib/types'
import { todayIso } from '@/lib/utils'

// ─── ステータスバッジ ──────────────────────────────────────────

function ShippingStatusBadge({ status }: { status: ShippingStatus }) {
  const cfg = SHIPPING_STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${cfg.badgeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
      {cfg.label}
    </span>
  )
}

// ─── ① ピッキングモーダル（pending → picking） ────────────────

function PickingModal({
  order,
  onClose,
}: {
  order: ShippingOrder
  onClose: () => void
}) {
  const { startPicking } = useWms()
  const [done, setDone] = useState(false)

  // ロケーション順にソート（倉庫内の動線効率化）
  const sortedItems = [...order.items].sort((a, b) =>
    a.locationCode.localeCompare(b.locationCode)
  )

  const handleStart = () => {
    startPicking(order.id)
    setDone(true)
  }

  if (done) {
    return (
      <Modal title="ピッキング開始" onClose={onClose} size="sm">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle size={40} className="text-blue-500" />
          <p className="text-sm font-semibold text-slate-700">
            ピッキングを開始しました
          </p>
          <p className="text-xs text-slate-500">{order.code}</p>
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
    <Modal title={`ピッキングリスト - ${order.code}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* ヘッダー情報 */}
        <div className="bg-slate-50 rounded-lg px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {[
            ['出庫指示番号', <span className="font-mono font-medium">{order.code}</span>],
            ['出荷先', order.customerName],
            ['出庫予定日', order.requestedDate],
            ['品目数', `${order.items.length} 品目`],
          ].map(([label, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <dt className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-slate-800 font-medium">
                {value as React.ReactNode}
              </dd>
            </div>
          ))}
        </div>

        {order.note && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
            {order.note}
          </div>
        )}

        {/* ピッキングリスト（ロケーション順） */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            ピッキングリスト（棚番順）
          </p>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">棚番</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">商品コード</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">商品名</th>
                  <th className="px-4 py-2.5 text-right font-medium text-slate-500">指示数量</th>
                  <th className="px-4 py-2.5 text-center font-medium text-slate-500">完了</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {item.locationCode}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-blue-600">{item.productCode}</td>
                    <td className="px-4 py-3 text-slate-700">{item.productName}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {item.orderedQuantity}
                      <span className="text-slate-400 font-normal ml-1">{item.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <input type="checkbox" className="w-4 h-4 accent-blue-600" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* フッター */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleStart}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium flex items-center justify-center gap-2"
          >
            <ScanLine size={15} />
            ピッキング開始
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── ② 検品モーダル（picking → inspected） ───────────────────

function InspectionModal({
  order,
  onClose,
}: {
  order: ShippingOrder
  onClose: () => void
}) {
  const { completeInspection } = useWms()
  const [pickedQty, setPickedQty] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        order.items.map((i) => [i.id, String(i.orderedQuantity)])
      )
  )
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleComplete = () => {
    for (const item of order.items) {
      const qty = parseInt(pickedQty[item.id] ?? '0') || 0
      if (qty < 0 || qty > item.orderedQuantity) {
        setError(
          `${item.productName}: 数量は 0〜${item.orderedQuantity} の範囲で入力してください`
        )
        return
      }
    }

    const pickedItems = order.items.map((item) => ({
      itemId: item.id,
      pickedQuantity: parseInt(pickedQty[item.id] ?? '0') || 0,
    }))
    completeInspection(order.id, pickedItems)
    setDone(true)
  }

  if (done) {
    return (
      <Modal title="検品完了" onClose={onClose} size="sm">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle size={40} className="text-purple-500" />
          <p className="text-sm font-semibold text-slate-700">検品が完了しました</p>
          <p className="text-xs text-slate-500">{order.code}</p>
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
    <Modal title={`検品 - ${order.code}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* ヘッダー */}
        <div className="bg-slate-50 rounded-lg px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {[
            ['出庫指示番号', <span className="font-mono font-medium">{order.code}</span>],
            ['出荷先', order.customerName],
          ].map(([label, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <dt className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-slate-800 font-medium">
                {value as React.ReactNode}
              </dd>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-500">
          ピッキングした実際の数量を入力してください。指示数量と異なる場合のみ修正します。
        </p>

        {/* 検品テーブル */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">棚番</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">商品名</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">指示数量</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">実績数量</th>
                <th className="px-4 py-2.5 text-center font-medium text-slate-500">差異</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items.map((item) => {
                const picked = parseInt(pickedQty[item.id] ?? '0') || 0
                const diff = picked - item.orderedQuantity
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-mono text-slate-600">{item.locationCode}</td>
                    <td className="px-4 py-3 text-slate-700">{item.productName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.orderedQuantity}
                      <span className="text-slate-400 ml-1">{item.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min="0"
                        max={item.orderedQuantity}
                        value={pickedQty[item.id] ?? ''}
                        onChange={(e) => {
                          setPickedQty((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                          setError('')
                        }}
                        className="w-20 border border-slate-300 rounded px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-brand-teal"
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {diff === 0 ? (
                        <span className="text-green-500 font-bold">✓</span>
                      ) : (
                        <span className={`font-medium ${diff < 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {diff > 0 ? '+' : ''}{diff}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleComplete}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <CheckCircle size={15} />
            検品完了
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── ③ 出庫確定モーダル（inspected → shipped） ───────────────

function ConfirmShippingModal({
  order,
  onClose,
}: {
  order: ShippingOrder
  onClose: () => void
}) {
  const { confirmShipping } = useWms()
  const [shippedDate, setShippedDate] = useState(todayIso())
  const [done, setDone] = useState(false)

  const totalOrdered = order.items.reduce((s, i) => s + i.orderedQuantity, 0)
  const totalPicked = order.items.reduce((s, i) => s + i.pickedQuantity, 0)

  const handleConfirm = () => {
    confirmShipping(order.id, shippedDate.replace(/-/g, '/'))
    setDone(true)
  }

  if (done) {
    return (
      <Modal title="出庫確定完了" onClose={onClose} size="sm">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle size={40} className="text-green-500" />
          <p className="text-sm font-semibold text-slate-700">出庫が確定しました</p>
          <p className="text-xs text-slate-500">{order.code}</p>
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
    <Modal title={`出庫確定 - ${order.code}`} onClose={onClose} size="md">
      <div className="space-y-5">
        {/* サマリ */}
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1.5">
          {[
            ['出庫指示番号', order.code],
            ['出荷先', order.customerName],
            ['出庫予定日', order.requestedDate],
            ['品目数', `${order.items.length} 品目`],
            ['指示数量合計', `${totalOrdered} 個`],
            ['実績数量合計', `${totalPicked} 個`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center gap-2">
              <dt className="text-xs text-green-700 w-28 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-green-900 font-medium">{value}</dd>
            </div>
          ))}
        </div>

        {/* 品目サマリ */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">商品名</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">指示</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">実績</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5 text-slate-700">{item.productName}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {item.orderedQuantity} {item.unit}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                    item.pickedQuantity < item.orderedQuantity
                      ? 'text-amber-600'
                      : 'text-green-700'
                  }`}>
                    {item.pickedQuantity} {item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 出荷日 */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            出荷日 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={shippedDate}
            onChange={(e) => setShippedDate(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <Truck size={15} />
            出庫確定
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── ④ 詳細モーダル（shipped / cancelled） ────────────────────

function DetailModal({
  order,
  onClose,
}: {
  order: ShippingOrder
  onClose: () => void
}) {
  return (
    <Modal title={`出庫詳細 - ${order.code}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
          {[
            ['出庫指示番号', <span className="font-mono">{order.code}</span>],
            ['ステータス', <ShippingStatusBadge status={order.status} />],
            ['出荷先', order.customerName],
            ['出庫予定日', order.requestedDate],
            ...(order.shippedDate
              ? [['実際の出荷日', order.shippedDate]]
              : []),
            ['登録日', order.createdAt],
          ].map(([label, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <dt className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-slate-800 font-medium">
                {value as React.ReactNode}
              </dd>
            </div>
          ))}
        </div>

        {order.note && (
          <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-700">
            {order.note}
          </div>
        )}

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">棚番</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">商品名</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">指示数量</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">実績数量</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 font-mono text-slate-600">{item.locationCode}</td>
                  <td className="px-4 py-3 text-slate-700">{item.productName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.orderedQuantity} {item.unit}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${
                    item.pickedQuantity < item.orderedQuantity
                      ? 'text-amber-600'
                      : 'text-green-700'
                  }`}>
                    {item.pickedQuantity} {item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}

// ─── タブフィルタ ──────────────────────────────────────────────

type TabValue = 'all' | ShippingStatus

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'pending', label: '未処理' },
  { value: 'picking', label: 'ピッキング中' },
  { value: 'inspected', label: '検品済み' },
  { value: 'shipped', label: '出庫完了' },
]

// ─── モーダルの種類を判定 ─────────────────────────────────────

function getModalType(
  status: ShippingStatus
): 'picking' | 'inspection' | 'confirm' | 'detail' {
  switch (status) {
    case 'pending': return 'picking'
    case 'picking': return 'inspection'
    case 'inspected': return 'confirm'
    default: return 'detail'
  }
}

// ─── メインページ ─────────────────────────────────────────────

export default function ShippingMenuPage() {
  const { state } = useWms()
  const [activeTab, setActiveTab] = useState<TabValue>('all')
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<ShippingOrder | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  const orders = state.shippingOrders

  // ステータス別件数
  const counts = useMemo(
    () => ({
      pending: orders.filter((o) => o.status === 'pending').length,
      picking: orders.filter((o) => o.status === 'picking').length,
      inspected: orders.filter((o) => o.status === 'inspected').length,
      shipped: orders.filter((o) => o.status === 'shipped').length,
    }),
    [orders]
  )

  // フィルタ済みリスト
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      const matchTab = activeTab === 'all' || o.status === activeTab
      const matchSearch =
        !q ||
        o.code.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q)
      return matchTab && matchSearch
    })
  }, [orders, activeTab, search])

  const handleOperationClick = (tab: TabValue) => {
    setActiveTab(tab)
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  return (
    <div className="max-w-screen-xl space-y-5">
      {/* ページヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">出庫処理メニュー</h2>
          <p className="text-sm text-slate-500 mt-1">
            出庫指示の登録から出荷確定まで一元管理します
          </p>
        </div>
        <Link
          href="/shipping/input"
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors"
        >
          <PackageMinus size={15} />
          出庫入力
        </Link>
      </div>

      {/* ステータスサマリバー */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            status: 'pending' as ShippingStatus,
            label: '未処理',
            count: counts.pending,
            bg: 'bg-slate-50',
            border: 'border-slate-200',
            countColor: 'text-slate-700',
          },
          {
            status: 'picking' as ShippingStatus,
            label: 'ピッキング中',
            count: counts.picking,
            bg: 'bg-blue-50',
            border: 'border-blue-200',
            countColor: 'text-blue-700',
          },
          {
            status: 'inspected' as ShippingStatus,
            label: '検品済み',
            count: counts.inspected,
            bg: 'bg-purple-50',
            border: 'border-purple-200',
            countColor: 'text-purple-700',
          },
          {
            status: 'shipped' as ShippingStatus,
            label: '出庫完了',
            count: counts.shipped,
            bg: 'bg-green-50',
            border: 'border-green-200',
            countColor: 'text-green-700',
          },
        ].map((item) => (
          <button
            key={item.status}
            onClick={() => handleOperationClick(item.status)}
            className={`${item.bg} border ${item.border} rounded-lg px-4 py-3 text-left hover:opacity-80 transition-opacity`}
          >
            <p className="text-xs text-slate-500 mb-1">{item.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${item.countColor}`}>
              {item.count}
              <span className="text-sm font-normal ml-1">件</span>
            </p>
          </button>
        ))}
      </div>

      {/* 操作メニューカード */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* ピッキング */}
        <button
          onClick={() => handleOperationClick('pending')}
          className="bg-white rounded-lg border border-slate-200 p-5 text-left hover:border-blue-400 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
              <ScanLine size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">ピッキング</p>
              <p className="text-xs text-slate-400">未処理 → ピッキング中</p>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-blue-600 tabular-nums">
              {counts.pending}
            </span>
            <span className="text-xs text-slate-500">件待ち</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            倉庫内でピッキングリストに沿って商品を集めます
          </p>
        </button>

        {/* 検品 */}
        <button
          onClick={() => handleOperationClick('picking')}
          className="bg-white rounded-lg border border-slate-200 p-5 text-left hover:border-purple-400 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors">
              <SearchIcon size={18} className="text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">検品</p>
              <p className="text-xs text-slate-400">ピッキング中 → 検品済み</p>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-purple-600 tabular-nums">
              {counts.picking}
            </span>
            <span className="text-xs text-slate-500">件待ち</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            ピッキングした商品の数量・品目を確認します
          </p>
        </button>

        {/* 出庫確定 */}
        <button
          onClick={() => handleOperationClick('inspected')}
          className="bg-white rounded-lg border border-slate-200 p-5 text-left hover:border-green-400 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-green-50 rounded-lg group-hover:bg-green-100 transition-colors">
              <Truck size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">出庫確定</p>
              <p className="text-xs text-slate-400">検品済み → 出庫完了</p>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-green-600 tabular-nums">
              {counts.inspected}
            </span>
            <span className="text-xs text-slate-500">件待ち</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            出荷日を確定し、在庫から出庫処理を行います
          </p>
        </button>
      </div>

      {/* 出庫指示一覧テーブル */}
      <div ref={tableRef} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* ツールバー */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <ClipboardList size={15} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">出庫指示一覧</span>
          </div>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="番号・出荷先で検索"
            className="ml-2"
          />
        </div>

        {/* タブ */}
        <div className="flex border-b border-slate-200 bg-slate-50/60 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.value
            const count =
              tab.value === 'all'
                ? orders.length
                : orders.filter((o) => o.status === tab.value).length
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-brand-teal text-brand-teal bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                <span
                  className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    isActive ? 'bg-brand-light text-brand-blue' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* モバイル：カード表示 */}
        <div className="sm:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
              <Truck size={28} />
              <p className="text-sm">該当する出庫指示がありません</p>
            </div>
          ) : (
            filtered.map((order) => {
              const modalType = getModalType(order.status)
              const nextActionLabel = {
                picking: 'ピッキング開始',
                inspection: '検品',
                confirm: '出庫確定',
                detail: '詳細確認',
              }[modalType]
              const nextActionStyle = {
                picking: 'text-blue-600 bg-blue-50',
                inspection: 'text-purple-600 bg-purple-50',
                confirm: 'text-green-600 bg-green-50',
                detail: 'text-slate-500 bg-slate-100',
              }[modalType]

              return (
                <div key={order.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-mono text-xs text-blue-600 font-medium">{order.code}</span>
                    <ShippingStatusBadge status={order.status} />
                  </div>
                  <p className="text-sm font-medium text-slate-700 mb-2">{order.customerName}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{order.requestedDate} / {order.items.length}品目</span>
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${nextActionStyle}`}
                    >
                      {nextActionLabel}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* デスクトップ：テーブル表示 */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  出庫指示番号
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                  出荷先
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  出庫予定日
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">
                  品目数
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  ステータス
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  次の操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Truck size={28} />
                      <p className="text-sm">該当する出庫指示がありません</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((order) => {
                  const modalType = getModalType(order.status)
                  const nextActionLabel = {
                    picking: 'ピッキング開始',
                    inspection: '検品',
                    confirm: '出庫確定',
                    detail: '詳細確認',
                  }[modalType]
                  const nextActionStyle = {
                    picking: 'text-blue-600 bg-blue-50 hover:bg-blue-100',
                    inspection: 'text-purple-600 bg-purple-50 hover:bg-purple-100',
                    confirm: 'text-green-600 bg-green-50 hover:bg-green-100',
                    detail: 'text-slate-500 bg-slate-100 hover:bg-slate-200',
                  }[modalType]

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-5 py-3 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="font-mono text-xs text-blue-600 font-medium hover:underline"
                        >
                          {order.code}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{order.customerName}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {order.requestedDate}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {order.items.length}
                        <span className="text-xs text-slate-400 ml-1">品目</span>
                      </td>
                      <td className="px-4 py-3">
                        <ShippingStatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${nextActionStyle}`}
                        >
                          {nextActionLabel}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* モーダル切替 */}
      {selectedOrder && (() => {
        const modalType = getModalType(selectedOrder.status)
        if (modalType === 'picking') {
          return (
            <PickingModal
              order={selectedOrder}
              onClose={() => setSelectedOrder(null)}
            />
          )
        }
        if (modalType === 'inspection') {
          return (
            <InspectionModal
              order={selectedOrder}
              onClose={() => setSelectedOrder(null)}
            />
          )
        }
        if (modalType === 'confirm') {
          return (
            <ConfirmShippingModal
              order={selectedOrder}
              onClose={() => setSelectedOrder(null)}
            />
          )
        }
        return (
          <DetailModal
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
          />
        )
      })()}
    </div>
  )
}
