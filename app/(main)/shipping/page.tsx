'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ClipboardList,
  PackageMinus,
  CheckCircle,
  Truck,
  ScanLine,
  Loader2,
  AlertCircle,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import StatusBadge from '@/components/ui/StatusBadge'
import PageShell from '@/components/ui/PageShell'
import EmptyState from '@/components/ui/EmptyState'
import {
  type ShippingStatus,
  SHIPPING_STATUS_CONFIG,
} from '@/lib/types'
import { todayIso } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import {
  type ShippingOrderSummary,
  type ShippingLineItem,
  type ShippingLineAllocation,
  fetchShippingOrders,
  fetchShippingOrderLines,
  startPickingShipping,
  completeShippingInspection,
  confirmShippingOrder,
  deallocateShippingInventory,
  reallocateShippingLine,
  isReallocationAllowed,
} from '@/lib/supabase/queries/shippings'
import type { QueryScope } from '@/lib/types'
import { useTenant } from '@/store/TenantContext'
import ScopeRequired from '@/components/ui/ScopeRequired'

// =============================================================
// ローカル型（モーダル用）
// =============================================================

/** モーダルに渡す出庫指示データ（サマリ + 明細） */
type ShippingOrderDetail = ShippingOrderSummary & {
  items: ShippingLineItem[]
  itemsLoaded: boolean
}

// =============================================================
// ステータスバッジ
// =============================================================

function ShippingStatusBadge({ status }: { status: ShippingStatus }) {
  const { t } = useTranslation('status')
  const cfg = SHIPPING_STATUS_CONFIG[status]
  return (
    <StatusBadge
      label={t(`shipping_${status}` as Parameters<typeof t>[0])}
      badgeClass={cfg.badgeClass}
      dotClass={cfg.dotClass}
    />
  )
}

// =============================================================
// ① ピッキングモーダル（pending → picking）
// =============================================================

function PickingModal({
  order,
  scope,
  onClose,
  onUpdated,
  onItemsReloaded,
}: {
  order:           ShippingOrderDetail
  scope:           QueryScope
  onClose:         () => void
  onUpdated:       (id: string, status: ShippingStatus) => void
  onItemsReloaded: (id: string) => Promise<void>
}) {
  const { t }  = useTranslation('shipping')
  const { t: tc } = useTranslation('common')
  const [done,    setDone]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [deallocatingId,  setDeallocatingId]  = useState<string | null>(null)
  const [reallocatingLineId, setReallocatingLineId] = useState<string | null>(null)

  // pending のときのみ再引当ボタンを表示する
  const canReallocate = isReallocationAllowed(order.status)

  // 引当行を棚番順に1行ずつ展開（ピッキングルート順）
  // allocations が存在しない item はピッキング対象外のため行を生成しない。
  // 引当解除後に allocations が空になった item は自動的に一覧から消える。
  type PickRow = {
    key:          string
    allocationId: string           // shipping_allocations.id（解除ボタンに使用）
    lineId:       string           // shipping_lines.id
    locationCode: string
    productCode:  string
    productName:  string
    unit:         string
    qty:          number
  }
  const pickingRows: PickRow[] = order.items
    .flatMap((item): PickRow[] => {
      // allocations が空の場合は行を生成しない（引当なし = ピッキング対象外）
      if (item.allocations.length === 0) return []
      return item.allocations.map((alloc: ShippingLineAllocation) => ({
        key:          `${item.id}-${alloc.locationCode}`,
        allocationId: alloc.id,
        lineId:       item.id,
        locationCode: alloc.locationCode,
        productCode:  item.productCode,
        productName:  item.productName,
        unit:         item.unit,
        qty:          alloc.allocatedQty,
      }))
    })
    .sort((a, b) => a.locationCode.localeCompare(b.locationCode))

  // 有効な引当行が1件でもあるかどうか（ボタン活性・empty state の判定）
  const hasPickingRows = pickingRows.length > 0

  const handleDealloc = async (row: PickRow) => {
    if (!row.allocationId) return
    setDeallocatingId(row.allocationId)
    setError('')
    const { error: err } = await deallocateShippingInventory({
      headerId:     order.id,
      lineId:       row.lineId,
      allocationId: row.allocationId,
      scope,
    })
    setDeallocatingId(null)
    if (err) { setError(err); return }
    await onItemsReloaded(order.id)
  }

  // 明細単位の再引当（FIFO）。pending のときのみ呼び出し可。
  const handleReallocLine = async (lineId: string) => {
    setReallocatingLineId(lineId)
    setError('')
    const { error: err } = await reallocateShippingLine({
      headerId: order.id,
      lineId,
      scope,
    })
    setReallocatingLineId(null)
    if (err) { setError(err); return }
    await onItemsReloaded(order.id)
  }

  const handleStart = async () => {
    setLoading(true)
    const { error: err } = await startPickingShipping(order.id)
    setLoading(false)
    if (err) { setError(err); return }
    onUpdated(order.id, 'picking')
    setDone(true)
  }

  if (done) {
    return (
      <Modal title={t('pickingModalTitle')} onClose={onClose} size="sm">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle size={40} className="text-blue-500" />
          <p className="text-sm font-semibold text-slate-700">{t('pickingStarted')}</p>
          <p className="text-xs text-slate-500">{order.code}</p>
          <button onClick={onClose}
            className="mt-3 px-6 py-2 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors">
            {tc('close')}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`${t('pickingListTitle')} - ${order.code}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="bg-slate-50 rounded-lg px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {([
            [t('detailCode'),         <span key="c" className="font-mono font-medium">{order.code}</span>],
            [t('detailCustomer'),     order.customerName],
            [t('detailScheduledDate'), order.requestedDate],
            [t('detailItemCount'),    `${order.lineCount} ${t('cardItemUnit')}`],
          ] as [string, React.ReactNode][]).map(([label, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <dt className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-slate-800 font-medium">{value}</dd>
            </div>
          ))}
        </div>

        {order.memo && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
            {order.memo}
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('pickingListTitle')}
          </p>
          {hasPickingRows ? (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblShelf')}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblProductCode')}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblProductName')}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblQtyOrdered')}</th>
                    <th className="px-4 py-2.5 text-center font-medium text-slate-500">{t('tblDone')}</th>
                    <th className="px-4 py-2.5 text-center font-medium text-slate-500"></th>
                    {canReallocate && (
                      <th className="px-4 py-2.5 text-center font-medium text-slate-500"></th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pickingRows.map((row) => (
                    <tr key={row.key}>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {row.locationCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-blue-600">{row.productCode}</td>
                      <td className="px-4 py-3 text-slate-700">{row.productName}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {row.qty}
                        <span className="text-slate-400 font-normal ml-1">{row.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input type="checkbox" className="w-4 h-4 accent-blue-600" />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDealloc(row)}
                          disabled={deallocatingId !== null || reallocatingLineId !== null}
                          title="引当解除"
                          className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-40 transition-colors"
                        >
                          {deallocatingId === row.allocationId
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />
                          }
                        </button>
                      </td>
                      {canReallocate && (
                        <td className="px-4 py-3 text-center">
                          {/* 再引当ボタンは同一 lineId の最初の行にのみ表示（1クリックで line 全体を再引当） */}
                          {pickingRows.findIndex((r) => r.lineId === row.lineId) ===
                            pickingRows.indexOf(row) && (
                            <button
                              onClick={() => handleReallocLine(row.lineId)}
                              disabled={deallocatingId !== null || reallocatingLineId !== null}
                              title="FIFO 再引当"
                              className="p-1 text-slate-400 hover:text-blue-500 disabled:opacity-40 transition-colors"
                            >
                              {reallocatingLineId === row.lineId
                                ? <Loader2 size={13} className="animate-spin" />
                                : <RefreshCw size={13} />
                              }
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border border-amber-200 bg-amber-50 rounded-lg px-4 py-6 text-center">
              <p className="text-sm font-medium text-amber-700">引当がないためピッキング対象がありません</p>
              <p className="text-xs text-amber-600 mt-1">先に出庫指示の引当を設定してください</p>
            </div>
          )}
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1 border-t border-slate-100">
          <button onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">
            {tc('cancel')}
          </button>
          <button onClick={handleStart} disabled={loading || !hasPickingRows}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid disabled:opacity-50 transition-colors font-medium flex items-center justify-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={15} />}
            {t('pickingStartBtn')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// =============================================================
// ② 検品モーダル（picking → inspected）
// =============================================================

function InspectionModal({
  order,
  scope,
  onClose,
  onUpdated,
  onItemsReloaded,
}: {
  order:           ShippingOrderDetail
  scope:           QueryScope
  onClose:         () => void
  onUpdated:       (id: string, status: ShippingStatus, updatedItems: ShippingLineItem[]) => void
  onItemsReloaded: (id: string) => Promise<void>
}) {
  const { t }  = useTranslation('shipping')
  const { t: tc } = useTranslation('common')
  const [pickedQty, setPickedQty] = useState<Record<string, string>>(
    () => Object.fromEntries(order.items.map((i) => [i.id, String(i.orderedQuantity)]))
  )
  const [error,         setError]         = useState('')
  const [loading,       setLoading]       = useState(false)
  const [done,          setDone]          = useState(false)
  const [deallocatingLineId, setDeallocatingLineId] = useState<string | null>(null)

  const handleDeallocLine = async (lineId: string) => {
    setDeallocatingLineId(lineId)
    setError('')
    const { error: err } = await deallocateShippingInventory({
      headerId: order.id,
      lineId,
      scope,    // allocationId 省略 → line 全件解除
    })
    setDeallocatingLineId(null)
    if (err) { setError(err); return }
    await onItemsReloaded(order.id)
  }

  const handleComplete = async () => {
    for (const item of order.items) {
      const qty = parseInt(pickedQty[item.id] ?? '0') || 0
      if (qty < 0 || qty > item.orderedQuantity) {
        setError(`${item.productName}: 0〜${item.orderedQuantity}`)
        return
      }
    }

    setLoading(true)
    const pickedItems = order.items.map((item) => ({
      lineId:   item.id,
      pickedQty: parseInt(pickedQty[item.id] ?? '0') || 0,
    }))

    const { error: err } = await completeShippingInspection(order.id, pickedItems)
    setLoading(false)
    if (err) { setError(err); return }

    const updatedItems: ShippingLineItem[] = order.items.map((item) => ({
      ...item,
      pickedQuantity: parseInt(pickedQty[item.id] ?? '0') || 0,
    }))
    onUpdated(order.id, 'inspected', updatedItems)
    setDone(true)
  }

  if (done) {
    return (
      <Modal title={t('inspectionModalTitle')} onClose={onClose} size="sm">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle size={40} className="text-purple-500" />
          <p className="text-sm font-semibold text-slate-700">{t('inspectionDone')}</p>
          <p className="text-xs text-slate-500">{order.code}</p>
          <button onClick={onClose}
            className="mt-3 px-6 py-2 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors">
            {tc('close')}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`${t('inspectionModalTitle')} - ${order.code}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="bg-slate-50 rounded-lg px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {([
            [t('detailCode'),     <span key="c" className="font-mono font-medium">{order.code}</span>],
            [t('detailCustomer'), order.customerName],
          ] as [string, React.ReactNode][]).map(([label, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <dt className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-slate-800 font-medium">{value}</dd>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">{t('inspectionNote')}</p>

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblShelf')}</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblProductName')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblQtyOrdered')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblQtyActual')}</th>
                <th className="px-4 py-2.5 text-center font-medium text-slate-500">{t('tblDiff')}</th>
                <th className="px-4 py-2.5 text-center font-medium text-slate-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items.map((item) => {
                const picked = parseInt(pickedQty[item.id] ?? '0') || 0
                const diff   = picked - item.orderedQuantity
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-mono text-slate-600">{item.locationCode || '—'}</td>
                    <td className="px-4 py-3 text-slate-700">{item.productName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {item.orderedQuantity}<span className="text-slate-400 ml-1">{item.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input type="number" min="0" max={item.orderedQuantity}
                        value={pickedQty[item.id] ?? ''}
                        onChange={(e) => { setPickedQty((p) => ({ ...p, [item.id]: e.target.value })); setError('') }}
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
                    <td className="px-4 py-3 text-center">
                      {item.allocations.length > 0 && (
                        <button
                          onClick={() => handleDeallocLine(item.id)}
                          disabled={deallocatingLineId !== null}
                          title="この明細の引当を全解除"
                          className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-40 transition-colors"
                        >
                          {deallocatingLineId === item.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />
                          }
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1 border-t border-slate-100">
          <button onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">
            {tc('cancel')}
          </button>
          <button onClick={handleComplete} disabled={loading}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors font-medium flex items-center justify-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={15} />}
            {t('inspectionCompleteBtn')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// =============================================================
// ③ 出庫確定モーダル（inspected → shipped）
// =============================================================

function ConfirmShippingModal({
  order,
  scope,
  onClose,
  onUpdated,
}: {
  order:     ShippingOrderDetail
  scope:     QueryScope
  onClose:   () => void
  onUpdated: (id: string, status: ShippingStatus) => void
}) {
  const { t }  = useTranslation('shipping')
  const { t: tc } = useTranslation('common')
  const [shippedDate, setShippedDate] = useState(todayIso())
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [done,    setDone]    = useState(false)

  const totalOrdered = order.items.reduce((s, i) => s + i.orderedQuantity, 0)
  const totalPicked  = order.items.reduce((s, i) => s + i.pickedQuantity,  0)

  const handleConfirm = async () => {
    setLoading(true)
    const { error: err } = await confirmShippingOrder(order.id, scope)
    setLoading(false)
    if (err) { setError(err); return }
    onUpdated(order.id, 'shipped')
    setDone(true)
  }

  if (done) {
    return (
      <Modal title={t('confirmModalTitle')} onClose={onClose} size="sm">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle size={40} className="text-green-500" />
          <p className="text-sm font-semibold text-slate-700">{t('confirmDone')}</p>
          <p className="text-xs text-slate-500">{order.code}</p>
          <button onClick={onClose}
            className="mt-3 px-6 py-2 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors">
            {tc('close')}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`${t('confirmModalTitle')} - ${order.code}`} onClose={onClose} size="md">
      <div className="space-y-5">
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1.5">
          {([
            [t('detailCode'),          order.code],
            [t('detailCustomer'),      order.customerName],
            [t('detailScheduledDate'), order.requestedDate],
            [t('detailItemCount'),     `${order.lineCount} ${t('cardItemUnit')}`],
            [t('detailTotalOrdered'),  `${totalOrdered} ${tc('pieces')}`],
            [t('detailTotalPicked'),   `${totalPicked} ${tc('pieces')}`],
          ] as [string, React.ReactNode][]).map(([label, value]) => (
            <div key={String(label)} className="flex items-center gap-2">
              <dt className="text-xs text-green-700 w-28 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-green-900 font-medium">{value}</dd>
            </div>
          ))}
        </div>

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
                    item.pickedQuantity < item.orderedQuantity ? 'text-amber-600' : 'text-green-700'
                  }`}>
                    {item.pickedQuantity} {item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {t('shipDate')} <span className="text-red-500">*</span>
          </label>
          <input type="date" value={shippedDate} onChange={(e) => setShippedDate(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            <AlertCircle size={12} /> {error}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1 border-t border-slate-100">
          <button onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">
            {tc('cancel')}
          </button>
          <button onClick={handleConfirm} disabled={loading}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors font-medium flex items-center justify-center gap-2">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Truck size={15} />}
            {t('confirmBtn')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// =============================================================
// ④ 詳細モーダル（shipped / cancelled）
// =============================================================

function DetailModal({
  order,
  onClose,
}: {
  order: ShippingOrderDetail
  onClose: () => void
}) {
  const { t } = useTranslation('shipping')
  return (
    <Modal title={`${t('detailModalTitle')} - ${order.code}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
          {([
            [t('detailCode'),          <span key="c" className="font-mono">{order.code}</span>],
            [t('colStatus'),           <ShippingStatusBadge key="s" status={order.status} />],
            [t('detailCustomer'),      order.customerName],
            [t('detailScheduledDate'), order.requestedDate],
            [t('detailCreated'),       order.createdAt],
          ] as [string, React.ReactNode][]).map(([label, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <dt className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-slate-800 font-medium">{value}</dd>
            </div>
          ))}
        </div>

        {order.memo && (
          <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-700">
            {order.memo}
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
                  <td className="px-4 py-3 font-mono text-slate-600">{item.locationCode || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{item.productName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.orderedQuantity} {item.unit}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${
                    item.pickedQuantity < item.orderedQuantity ? 'text-amber-600' : 'text-green-700'
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

// =============================================================
// モーダル種別判定
// =============================================================

function getModalType(status: ShippingStatus): 'picking' | 'inspection' | 'confirm' | 'detail' {
  switch (status) {
    case 'pending':   return 'picking'
    case 'picking':   return 'inspection'
    case 'inspected': return 'confirm'
    default:          return 'detail'
  }
}

// =============================================================
// メインページ
// =============================================================

// 出庫の有効な tab 値
const SHIPPING_TAB_VALUES = ['all', 'pending', 'picking', 'inspected', 'shipped', 'cancelled'] as const
type ShippingTabValue = typeof SHIPPING_TAB_VALUES[number]

export default function ShippingPage() {
  const { t }  = useTranslation('shipping')
  const { t: tc } = useTranslation('common')
  const { t: ts } = useTranslation('status')
  const { scope } = useTenant()

  // ── URL params ─────────────────────────────────────────────
  const searchParams = useSearchParams()
  const router = useRouter()

  // ── データ ───────────────────────────────────────────────────
  const [orders,     setOrders]     = useState<ShippingOrderDetail[]>([])
  const [loading,    setLoading]    = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // ── UI 状態（URL params から初期値を読む）───────────────────
  const [activeTab, setActiveTab] = useState<ShippingTabValue>(() => {
    const raw = searchParams.get('tab')
    return (SHIPPING_TAB_VALUES as readonly string[]).includes(raw ?? '') ? raw as ShippingTabValue : 'all'
  })
  const [search,          setSearch]          = useState(() => searchParams.get('q') ?? '')
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [modalLoading,    setModalLoading]    = useState(false)

  // ── URL 更新ヘルパー（history を積まない replace）──────────
  const pushParams = useCallback((q: string, tab: ShippingTabValue) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (tab !== 'all') p.set('tab', tab)
    const qs = p.toString()
    router.replace(`/shipping${qs ? `?${qs}` : ''}`)
  }, [router])

  const handleTabChange = useCallback((val: ShippingTabValue) => {
    setActiveTab(val)
    pushParams(search, val)
  }, [search, pushParams])

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val)
    pushParams(val, activeTab)
  }, [activeTab, pushParams])

  // ── 一覧取得 ─────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    if (!scope) { setLoading(false); return }
    const { data, error } = await fetchShippingOrders(scope)
    if (error) { setFetchError(error); return }
    // ShippingOrderSummary → ShippingOrderDetail（items 未ロード）
    setOrders(
      data.map((s) => ({ ...s, items: [], itemsLoaded: false }))
    )
  }, [scope])

  useEffect(() => {
    setLoading(true)
    loadOrders().finally(() => setLoading(false))
  }, [loadOrders])

  // ── 行クリック：明細を遅延ロード ─────────────────────────────
  const handleSelectOrder = useCallback(async (id: string) => {
    setSelectedId(id)
    const order = orders.find((o) => o.id === id)
    if (!order || order.itemsLoaded) return

    setModalLoading(true)
    const { data } = await fetchShippingOrderLines(id)
    if (data) {
      setOrders((prev) =>
        prev.map((o) => o.id === id ? { ...o, items: data, itemsLoaded: true } : o)
      )
    }
    setModalLoading(false)
  }, [orders])

  // ── ステータス更新（モーダルからのコールバック） ─────────────
  const handleOrderUpdated = useCallback((
    id: string,
    status: ShippingStatus,
    updatedItems?: ShippingLineItem[],
  ) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o
        return {
          ...o,
          status,
          ...(updatedItems ? { items: updatedItems } : {}),
        }
      })
    )
  }, [])

  // ── モーダルを閉じる ─────────────────────────────────────────
  const handleClose = () => setSelectedId(null)

  // ── 引当解除後に明細を再ロード ───────────────────────────────
  const handleReloadItems = useCallback(async (id: string) => {
    const { data } = await fetchShippingOrderLines(id)
    if (data) {
      setOrders((prev) =>
        prev.map((o) => o.id === id ? { ...o, items: data, itemsLoaded: true } : o)
      )
    }
  }, [])

  // ── 集計 ─────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    pending:   orders.filter((o) => o.status === 'pending').length,
    picking:   orders.filter((o) => o.status === 'picking').length,
    inspected: orders.filter((o) => o.status === 'inspected').length,
    shipped:   orders.filter((o) => o.status === 'shipped').length,
  }), [orders])

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
      const matchTab    = activeTab === 'all' || o.status === activeTab
      const matchSearch = !q || o.code.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)
      return matchTab && matchSearch
    })
  }, [orders, activeTab, search])

  const actionLabels: Record<'picking' | 'inspection' | 'confirm' | 'detail', string> = {
    picking:    t('actionPicking'),
    inspection: t('actionInspection'),
    confirm:    t('actionConfirm'),
    detail:     t('actionDetail'),
  }

  const selectedOrder = selectedId ? orders.find((o) => o.id === selectedId) ?? null : null

  // ── スコープ未選択 ───────────────────────────────────────────
  if (!scope) return <ScopeRequired />

  return (
    <PageShell loading={loading} error={fetchError} onRetry={loadOrders}>
    <div className="max-w-screen-xl space-y-5">
      {/* ページヘッダー */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{t('title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <Link href="/shipping/input"
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors">
          <PackageMinus size={15} />
          {t('toInput')}
        </Link>
      </div>

      {/* ステータスサマリ（コンパクト pills）*/}
      <div className="flex flex-wrap gap-2">
        {(([
          { status: 'pending'   as ShippingStatus, label: t('summaryPending'),   count: counts.pending   },
          { status: 'picking'   as ShippingStatus, label: t('summaryPicking'),   count: counts.picking   },
          { status: 'inspected' as ShippingStatus, label: t('summaryInspected'), count: counts.inspected },
          { status: 'shipped'   as ShippingStatus, label: t('summaryShipped'),   count: counts.shipped   },
        ]) as { status: ShippingStatus; label: string; count: number }[]).map(({ status, label, count }) => {
          const cfg = SHIPPING_STATUS_CONFIG[status]
          return (
            <button
              key={status}
              onClick={() => handleTabChange(status)}
              disabled={count === 0}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-opacity ${
                count > 0
                  ? `${cfg.badgeClass} hover:opacity-75`
                  : 'bg-slate-50 text-slate-300 cursor-default'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${count > 0 ? cfg.dotClass : 'bg-slate-200'}`} />
              {label}
              <span className="tabular-nums font-bold">{count}</span>
            </button>
          )
        })}
      </div>

      {/* 出庫指示一覧テーブル */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* ツールバー */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <ClipboardList size={15} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">{t('listTitle')}</span>
          </div>
          <SearchInput value={search} onChange={handleSearchChange} placeholder={t('searchPlaceholder')} className="ml-2" />
        </div>

        {/* タブ */}
        <div className="flex border-b border-slate-200 bg-slate-50/60 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.value
            const count = tab.value === 'all'
              ? orders.length
              : orders.filter((o) => o.status === tab.value).length
            return (
              <button key={tab.value} onClick={() => handleTabChange(tab.value)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-brand-teal text-brand-teal bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  isActive ? 'bg-brand-light text-brand-blue' : 'bg-slate-200 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* モバイル：カード */}
        <div className="sm:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12">
              <EmptyState icon={<Truck size={28} />} message={t('empty')} />
            </div>
          ) : (
            filtered.map((order) => {
              const modalType = getModalType(order.status)
              const nextActionStyle = {
                picking:    'text-blue-600 bg-blue-50',
                inspection: 'text-purple-600 bg-purple-50',
                confirm:    'text-green-600 bg-green-50',
                detail:     'text-slate-500 bg-slate-100',
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
                      {order.requestedDate} / {order.lineCount} {t('cardItemUnit')}
                    </span>
                    <button onClick={() => handleSelectOrder(order.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${nextActionStyle}`}>
                      {actionLabels[modalType]}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* デスクトップ：テーブル */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colCode')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t('colCustomer')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colDate')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colItems')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colStatus')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colNextAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <EmptyState icon={<Truck size={28} />} message={t('empty')} />
                  </td>
                </tr>
              ) : (
                filtered.map((order) => {
                  const modalType = getModalType(order.status)
                  const btnStyle = {
                    picking:    'text-blue-600 bg-blue-50 hover:bg-blue-100',
                    inspection: 'text-purple-600 bg-purple-50 hover:bg-purple-100',
                    confirm:    'text-green-700 bg-green-50 hover:bg-green-100',
                    detail:     'text-slate-600 bg-slate-100 hover:bg-slate-200',
                  }[modalType]
                  return (
                    <tr key={order.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs text-blue-600 font-medium">{order.code}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{order.customerName}</td>
                      <td className="px-4 py-3 text-slate-500 text-sm whitespace-nowrap">{order.requestedDate}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {order.lineCount} {t('cardItemUnit')}
                      </td>
                      <td className="px-4 py-3"><ShippingStatusBadge status={order.status} /></td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleSelectOrder(order.id)}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${btnStyle}`}>
                          {actionLabels[modalType]}
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

      {/* モーダルローディング */}
      {modalLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg px-6 py-4 flex items-center gap-3 text-sm text-slate-600">
            <Loader2 size={16} className="animate-spin text-brand-teal" />
            明細データを取得中...
          </div>
        </div>
      )}

      {/* モーダル */}
      {selectedOrder && !modalLoading && (() => {
        const type = getModalType(selectedOrder.status)
        if (type === 'picking')    return <PickingModal    order={selectedOrder} scope={scope!} onClose={handleClose} onUpdated={handleOrderUpdated} onItemsReloaded={handleReloadItems} />
        if (type === 'inspection') return <InspectionModal order={selectedOrder} scope={scope!} onClose={handleClose} onUpdated={handleOrderUpdated} onItemsReloaded={handleReloadItems} />
        if (type === 'confirm')    return <ConfirmShippingModal order={selectedOrder} scope={scope!} onClose={handleClose} onUpdated={handleOrderUpdated} />
        return <DetailModal order={selectedOrder} onClose={handleClose} />
      })()}

      {/* ts unused var suppression */}
      <span className="hidden">{ts('shipping_pending')}</span>
    </div>
    </PageShell>
  )
}
