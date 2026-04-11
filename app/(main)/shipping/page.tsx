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
import { useTranslation } from '@/lib/i18n'

// ─── ステータスバッジ ──────────────────────────────────────────

function ShippingStatusBadge({ status }: { status: ShippingStatus }) {
  const { t } = useTranslation('status')
  const cfg = SHIPPING_STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${cfg.badgeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
      {t(`shipping_${status}` as Parameters<typeof t>[0])}
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
  const { t } = useTranslation('shipping')
  const { t: tc } = useTranslation('common')
  const { startPicking } = useWms()
  const [done, setDone] = useState(false)

  const sortedItems = [...order.items].sort((a, b) =>
    a.locationCode.localeCompare(b.locationCode)
  )

  const handleStart = () => {
    startPicking(order.id)
    setDone(true)
  }

  if (done) {
    return (
      <Modal title={t('pickingModalTitle')} onClose={onClose} size="sm">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle size={40} className="text-blue-500" />
          <p className="text-sm font-semibold text-slate-700">
            {t('pickingStarted')}
          </p>
          <p className="text-xs text-slate-500">{order.code}</p>
          <button
            onClick={onClose}
            className="mt-3 px-6 py-2 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors"
          >
            {tc('close')}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`${t('pickingListTitle')} - ${order.code}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* ヘッダー情報 */}
        <div className="bg-slate-50 rounded-lg px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {[
            [t('detailCode'), <span key="code" className="font-mono font-medium">{order.code}</span>],
            [t('detailCustomer'), order.customerName],
            [t('detailScheduledDate'), order.requestedDate],
            [t('detailItemCount'), `${order.items.length} ${t('cardItemUnit')}`],
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

        {/* ピッキングリスト */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('pickingListTitle')}
          </p>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblShelf')}</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblProductCode')}</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblProductName')}</th>
                  <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblQtyOrdered')}</th>
                  <th className="px-4 py-2.5 text-center font-medium text-slate-500">{t('tblDone')}</th>
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
            {tc('cancel')}
          </button>
          <button
            onClick={handleStart}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium flex items-center justify-center gap-2"
          >
            <ScanLine size={15} />
            {t('pickingStartBtn')}
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
  const { t } = useTranslation('shipping')
  const { t: tc } = useTranslation('common')
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
          `${item.productName}: 0〜${item.orderedQuantity}`
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
      <Modal title={t('inspectionModalTitle')} onClose={onClose} size="sm">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle size={40} className="text-purple-500" />
          <p className="text-sm font-semibold text-slate-700">{t('inspectionDone')}</p>
          <p className="text-xs text-slate-500">{order.code}</p>
          <button
            onClick={onClose}
            className="mt-3 px-6 py-2 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors"
          >
            {tc('close')}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`${t('inspectionModalTitle')} - ${order.code}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* ヘッダー */}
        <div className="bg-slate-50 rounded-lg px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {[
            [t('detailCode'), <span key="code" className="font-mono font-medium">{order.code}</span>],
            [t('detailCustomer'), order.customerName],
          ].map(([label, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <dt className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-slate-800 font-medium">
                {value as React.ReactNode}
              </dd>
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-500">{t('inspectionNote')}</p>

        {/* 検品テーブル */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblShelf')}</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblProductName')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblQtyOrdered')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblQtyActual')}</th>
                <th className="px-4 py-2.5 text-center font-medium text-slate-500">{t('tblDiff')}</th>
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
            {tc('cancel')}
          </button>
          <button
            onClick={handleComplete}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-purple-600 rounded-md hover:bg-purple-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <CheckCircle size={15} />
            {t('inspectionCompleteBtn')}
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
  const { t } = useTranslation('shipping')
  const { t: tc } = useTranslation('common')
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
      <Modal title={t('confirmModalTitle')} onClose={onClose} size="sm">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle size={40} className="text-green-500" />
          <p className="text-sm font-semibold text-slate-700">{t('confirmDone')}</p>
          <p className="text-xs text-slate-500">{order.code}</p>
          <button
            onClick={onClose}
            className="mt-3 px-6 py-2 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors"
          >
            {tc('close')}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`${t('confirmModalTitle')} - ${order.code}`} onClose={onClose} size="md">
      <div className="space-y-5">
        {/* サマリ */}
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1.5">
          {[
            [t('detailCode'), order.code],
            [t('detailCustomer'), order.customerName],
            [t('detailScheduledDate'), order.requestedDate],
            [t('detailItemCount'), `${order.items.length} ${t('cardItemUnit')}`],
            [t('detailTotalOrdered'), `${totalOrdered} ${tc('pieces')}`],
            [t('detailTotalPicked'), `${totalPicked} ${tc('pieces')}`],
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
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblProductName')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblQtyInstr')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblQtyResult')}</th>
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
            {t('shipDate')} <span className="text-red-500">*</span>
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
            {tc('cancel')}
          </button>
          <button
            onClick={handleConfirm}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <Truck size={15} />
            {t('confirmBtn')}
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
  const { t } = useTranslation('shipping')

  return (
    <Modal title={`${t('detailModalTitle')} - ${order.code}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
          {[
            [t('detailCode'), <span key="code" className="font-mono">{order.code}</span>],
            [t('colStatus'), <ShippingStatusBadge key="status" status={order.status} />],
            [t('detailCustomer'), order.customerName],
            [t('detailScheduledDate'), order.requestedDate],
            ...(order.shippedDate
              ? [[t('detailShipDate'), order.shippedDate]]
              : []),
            [t('detailCreated'), order.createdAt],
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
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblShelf')}</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblProductName')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblQtyOrdered')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblQtyActual')}</th>
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
  const { t } = useTranslation('shipping')
  const { t: tc } = useTranslation('common')
  const { t: ts } = useTranslation('status')
  const { state } = useWms()
  const [activeTab, setActiveTab] = useState<'all' | ShippingStatus>('all')
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<ShippingOrder | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  const orders = state.shippingOrders

  const counts = useMemo(
    () => ({
      pending: orders.filter((o) => o.status === 'pending').length,
      picking: orders.filter((o) => o.status === 'picking').length,
      inspected: orders.filter((o) => o.status === 'inspected').length,
      shipped: orders.filter((o) => o.status === 'shipped').length,
    }),
    [orders]
  )

  const TABS = useMemo(() => [
    { value: 'all' as const,       label: t('tabAll') },
    { value: 'pending' as const,   label: t('tabPending') },
    { value: 'picking' as const,   label: t('tabPicking') },
    { value: 'inspected' as const, label: t('tabInspected') },
    { value: 'shipped' as const,   label: t('tabShipped') },
  ], [t])

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

  const handleOperationClick = (tab: 'all' | ShippingStatus) => {
    setActiveTab(tab)
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const summaryItems = [
    {
      status: 'pending' as ShippingStatus,
      label: t('summaryPending'),
      count: counts.pending,
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      countColor: 'text-slate-700',
    },
    {
      status: 'picking' as ShippingStatus,
      label: t('summaryPicking'),
      count: counts.picking,
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      countColor: 'text-blue-700',
    },
    {
      status: 'inspected' as ShippingStatus,
      label: t('summaryInspected'),
      count: counts.inspected,
      bg: 'bg-purple-50',
      border: 'border-purple-200',
      countColor: 'text-purple-700',
    },
    {
      status: 'shipped' as ShippingStatus,
      label: t('summaryShipped'),
      count: counts.shipped,
      bg: 'bg-green-50',
      border: 'border-green-200',
      countColor: 'text-green-700',
    },
  ]

  const actionLabels: Record<'picking' | 'inspection' | 'confirm' | 'detail', string> = {
    picking: t('actionPicking'),
    inspection: t('actionInspection'),
    confirm: t('actionConfirm'),
    detail: t('actionDetail'),
  }

  return (
    <div className="max-w-screen-xl space-y-5">
      {/* ページヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{t('title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <Link
          href="/shipping/input"
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors"
        >
          <PackageMinus size={15} />
          {t('toInput')}
        </Link>
      </div>

      {/* ステータスサマリバー */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summaryItems.map((item) => (
          <button
            key={item.status}
            onClick={() => handleOperationClick(item.status)}
            className={`${item.bg} border ${item.border} rounded-lg px-4 py-3 text-left hover:opacity-80 transition-opacity`}
          >
            <p className="text-xs text-slate-500 mb-1">{item.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${item.countColor}`}>
              {item.count}
              <span className="text-sm font-normal ml-1">{tc('countUnit')}</span>
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
              <p className="text-sm font-semibold text-slate-700">{t('menuPickingTitle')}</p>
              <p className="text-xs text-slate-400">{t('menuPickingSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-blue-600 tabular-nums">
              {counts.pending}
            </span>
            <span className="text-xs text-slate-500">{t('waitingUnit')}</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">{t('menuPickingDesc')}</p>
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
              <p className="text-sm font-semibold text-slate-700">{t('menuInspectionTitle')}</p>
              <p className="text-xs text-slate-400">{t('menuInspectionSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-purple-600 tabular-nums">
              {counts.picking}
            </span>
            <span className="text-xs text-slate-500">{t('waitingUnit')}</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">{t('menuInspectionDesc')}</p>
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
              <p className="text-sm font-semibold text-slate-700">{t('menuConfirmTitle')}</p>
              <p className="text-xs text-slate-400">{t('menuConfirmSubtitle')}</p>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-green-600 tabular-nums">
              {counts.inspected}
            </span>
            <span className="text-xs text-slate-500">{t('waitingUnit')}</span>
          </div>
          <p className="text-xs text-slate-400 mt-2">{t('menuConfirmDesc')}</p>
        </button>
      </div>

      {/* 出庫指示一覧テーブル */}
      <div ref={tableRef} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* ツールバー */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <ClipboardList size={15} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">{t('listTitle')}</span>
          </div>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('searchPlaceholder')}
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
              <p className="text-sm">{t('empty')}</p>
            </div>
          ) : (
            filtered.map((order) => {
              const modalType = getModalType(order.status)
              const nextActionLabel = actionLabels[modalType]
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
                    <span className="text-xs text-slate-500">
                      {order.requestedDate} / {order.items.length} {t('cardItemUnit')}
                    </span>
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
                  {t('colCode')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                  {t('colCustomer')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  {t('colDate')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">
                  {t('colItems')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  {t('colStatus')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  {t('colNextAction')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Truck size={28} />
                      <p className="text-sm">{t('empty')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((order) => {
                  const modalType = getModalType(order.status)
                  const nextActionLabel = actionLabels[modalType]
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
                        <span className="text-xs text-slate-400 ml-1">{t('cardItemUnit')}</span>
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
