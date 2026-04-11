'use client'

import { useState, useMemo } from 'react'
import { Package } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import { inventoryData } from '@/lib/data/inventory'
import { useTranslation } from '@/lib/i18n'
import {
  type InventoryItem,
  type InventoryStatus,
  INVENTORY_STATUS_CONFIG,
} from '@/lib/types'

// ─── ステータスバッジ ──────────────────────────────────────────

function StatusBadge({ status }: { status: InventoryStatus }) {
  const { t } = useTranslation('status')
  const cfg = INVENTORY_STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${cfg.badgeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
      {t(`inventory_${status}` as Parameters<typeof t>[0])}
    </span>
  )
}

// ─── 在庫レベルバー ────────────────────────────────────────────

function StockLevelBar({ item }: { item: InventoryItem }) {
  const pct = item.maxStock > 0
    ? Math.min((item.quantity / item.maxStock) * 100, 100)
    : 0
  const barColor =
    item.status === 'out_of_stock' ? 'bg-red-400' :
    item.status === 'low'         ? 'bg-amber-400' :
    item.status === 'excess'      ? 'bg-blue-400' :
    'bg-green-400'

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{item.minStock}</span>
        <span>{item.maxStock}</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── 詳細モーダル ─────────────────────────────────────────────

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
        {label}
      </p>
      {children}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start py-2 border-b border-slate-50 last:border-0">
      <dt className="w-32 flex-shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="flex-1 text-xs text-slate-800 font-medium">{value}</dd>
    </div>
  )
}

function InventoryDetailModal({
  item,
  onClose,
}: {
  item: InventoryItem
  onClose: () => void
}) {
  const { t } = useTranslation('inventory')

  return (
    <Modal title={t('modalTitle')} onClose={onClose} size="md">
      <div className="space-y-6">
        {/* 商品情報 */}
        <DetailSection label={t('detailCode')}>
          <dl>
            <DetailRow label={t('detailCode')} value={
              <span className="font-mono">{item.productCode}</span>
            } />
            <DetailRow label={t('detailName')}     value={item.productName} />
            <DetailRow label={t('detailCategory')} value={item.category} />
            {item.supplierName && (
              <DetailRow label={t('detailSupplier')} value={item.supplierName} />
            )}
          </dl>
        </DetailSection>

        {/* 在庫情報 */}
        <DetailSection label={t('detailQty')}>
          <dl>
            <DetailRow
              label={t('detailQty')}
              value={
                <span className={`text-base font-bold ${
                  item.status === 'out_of_stock' ? 'text-red-600' :
                  item.status === 'low'          ? 'text-amber-600' :
                  'text-slate-800'
                }`}>
                  {item.quantity.toLocaleString()}
                  <span className="text-xs font-normal text-slate-500 ml-1">{item.unit}</span>
                </span>
              }
            />
            <DetailRow label={t('colStatus')}     value={<StatusBadge status={item.status} />} />
            <DetailRow label={t('detailLocation')} value={<span className="font-mono">{item.locationCode}</span>} />
            {item.lotNumber && (
              <DetailRow label={t('detailLot')} value={<span className="font-mono">{item.lotNumber}</span>} />
            )}
          </dl>
        </DetailSection>

        {/* 在庫レベル */}
        <DetailSection label={`${t('detailMin')} / ${t('detailMax')}`}>
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex justify-between items-end mb-3">
              <span className="text-xs text-slate-500">
                {t('detailQty')}: <strong className="text-slate-700">{item.quantity} {item.unit}</strong>
              </span>
              <span className="text-xs text-slate-400">
                {item.maxStock > 0 ? `${Math.round((item.quantity / item.maxStock) * 100)}%` : '–'}
              </span>
            </div>
            <StockLevelBar item={item} />
          </div>
        </DetailSection>

        {/* 備考・更新情報 */}
        {(item.note || item.updatedAt) && (
          <DetailSection label={t('detailUpdated')}>
            <dl>
              <DetailRow label={t('detailUpdated')} value={item.updatedAt} />
              {item.note && (
                <DetailRow
                  label={t('detailNote')}
                  value={<span className="text-slate-600 whitespace-pre-wrap">{item.note}</span>}
                />
              )}
            </dl>
          </DetailSection>
        )}
      </div>
    </Modal>
  )
}

// ─── サマリカウント ────────────────────────────────────────────

function SummaryBar({ items }: { items: InventoryItem[] }) {
  const { t } = useTranslation('status')

  const counts = useMemo(() => {
    return (Object.keys(INVENTORY_STATUS_CONFIG) as InventoryStatus[]).map(
      (status) => ({
        status,
        count: items.filter((i) => i.status === status).length,
      })
    )
  }, [items])

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-slate-500">
      {counts.map(({ status, count }) => {
        const cfg = INVENTORY_STATUS_CONFIG[status]
        return (
          <span key={status} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${cfg.dotClass}`} />
            {t(`inventory_${status}` as Parameters<typeof t>[0])}: <strong className="text-slate-700">{count}</strong>
          </span>
        )
      })}
    </div>
  )
}

// ─── メインページ ─────────────────────────────────────────────

export default function InventoryPage() {
  const { t } = useTranslation('inventory')
  const { t: ts } = useTranslation('status')
  const { t: tc } = useTranslation('common')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InventoryStatus | 'all'>('all')
  const [selected, setSelected] = useState<InventoryItem | null>(null)

  const statusOptions: { value: InventoryStatus | 'all'; label: string }[] = [
    { value: 'all',         label: tc('all') },
    { value: 'normal',      label: ts('inventory_normal') },
    { value: 'low',         label: ts('inventory_low') },
    { value: 'out_of_stock',label: ts('inventory_out_of_stock') },
    { value: 'excess',      label: ts('inventory_excess') },
  ]

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return inventoryData.filter((item) => {
      const matchSearch =
        !q ||
        item.productCode.toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q) ||
        item.locationCode.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      const matchStatus = statusFilter === 'all' || item.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [search, statusFilter])

  return (
    <div className="max-w-screen-xl space-y-4">
      {/* ページヘッダー */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">{t('title')}</h2>
        <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
      </div>

      {/* カード */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* フィルタバー */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('searchPlaceholder')}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InventoryStatus | 'all')}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white text-slate-700"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <span className="text-xs text-slate-500 w-full sm:w-auto sm:ml-auto">
            {filtered.length !== inventoryData.length ? (
              <>
                <strong className="text-slate-700">{filtered.length}</strong> {tc('countUnit')}
                <span className="text-slate-400"> / {tc('total')}{inventoryData.length}{tc('countUnit')}</span>
              </>
            ) : (
              <>{tc('total')} <strong className="text-slate-700">{filtered.length}</strong> {tc('countUnit')}</>
            )}
          </span>
        </div>

        {/* サマリ */}
        <div className="px-5 py-2.5 bg-slate-50/60 border-b border-slate-100">
          <SummaryBar items={inventoryData} />
        </div>

        {/* モバイル：カード表示 */}
        <div className="sm:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
              <Package size={28} />
              <p className="text-sm">{t('empty')}</p>
              {(search || statusFilter !== 'all') && (
                <button
                  onClick={() => { setSearch(''); setStatusFilter('all') }}
                  className="text-xs text-blue-500 hover:underline mt-1"
                >
                  {t('resetFilter')}
                </button>
              )}
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelected(item)}
                className="px-4 py-4 cursor-pointer active:bg-blue-50/50"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs text-blue-600">{item.productCode}</span>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-sm font-medium text-slate-800 mb-1.5">{item.productName}</p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-mono bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                    {item.locationCode}
                  </span>
                  <span className={`font-semibold tabular-nums ${
                    item.status === 'out_of_stock' ? 'text-red-600' :
                    item.status === 'low' ? 'text-amber-600' : 'text-slate-800'
                  }`}>
                    {item.quantity.toLocaleString()}
                    <span className="font-normal text-slate-400 ml-0.5">{item.unit}</span>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* デスクトップ：テーブル表示 */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colProductCode')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t('colProductName')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colCategory')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colQty')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colUnit')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colLocation')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colStatus')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colUpdated')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Package size={28} />
                      <p className="text-sm">{t('empty')}</p>
                      {(search || statusFilter !== 'all') && (
                        <button
                          onClick={() => { setSearch(''); setStatusFilter('all') }}
                          className="text-xs text-blue-500 hover:underline mt-1"
                        >
                          {t('resetFilter')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-blue-600 font-medium">{item.productCode}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{item.productName}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">{item.category}</span>
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${
                      item.status === 'out_of_stock' ? 'text-red-600' :
                      item.status === 'low'          ? 'text-amber-600' :
                      'text-slate-800'
                    }`}>
                      {item.quantity.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.unit}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                        {item.locationCode}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{item.updatedAt}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <InventoryDetailModal item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
