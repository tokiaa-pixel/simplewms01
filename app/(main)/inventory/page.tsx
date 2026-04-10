'use client'

import { useState, useMemo } from 'react'
import { Package } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import { inventoryData } from '@/lib/data/inventory'
import {
  type InventoryItem,
  type InventoryStatus,
  INVENTORY_STATUS_CONFIG,
} from '@/lib/types'

// ─── ステータスバッジ ──────────────────────────────────────────

function StatusBadge({ status }: { status: InventoryStatus }) {
  const cfg = INVENTORY_STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${cfg.badgeClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
      {cfg.label}
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
        <span>最小 {item.minStock}</span>
        <span>最大 {item.maxStock}</span>
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

function DetailSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
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
  return (
    <Modal title="在庫詳細" onClose={onClose} size="md">
      <div className="space-y-6">
        {/* 商品情報 */}
        <DetailSection label="商品情報">
          <dl>
            <DetailRow label="商品コード" value={
              <span className="font-mono">{item.productCode}</span>
            } />
            <DetailRow label="商品名" value={item.productName} />
            <DetailRow label="カテゴリ" value={item.category} />
            {item.supplierName && (
              <DetailRow label="仕入先" value={item.supplierName} />
            )}
          </dl>
        </DetailSection>

        {/* 在庫情報 */}
        <DetailSection label="在庫情報">
          <dl>
            <DetailRow
              label="現在庫数"
              value={
                <span className={`text-base font-bold ${
                  item.status === 'out_of_stock' ? 'text-red-600' :
                  item.status === 'low'          ? 'text-amber-600' :
                  'text-slate-800'
                }`}>
                  {item.quantity.toLocaleString()}
                  <span className="text-xs font-normal text-slate-500 ml-1">
                    {item.unit}
                  </span>
                </span>
              }
            />
            <DetailRow
              label="ステータス"
              value={<StatusBadge status={item.status} />}
            />
            <DetailRow
              label="保管場所"
              value={<span className="font-mono">{item.locationCode}</span>}
            />
            {item.lotNumber && (
              <DetailRow
                label="ロット番号"
                value={<span className="font-mono">{item.lotNumber}</span>}
              />
            )}
          </dl>
        </DetailSection>

        {/* 在庫レベル */}
        <DetailSection label="在庫レベル">
          <div className="bg-slate-50 rounded-lg p-4">
            <div className="flex justify-between items-end mb-3">
              <span className="text-xs text-slate-500">
                現在庫: <strong className="text-slate-700">{item.quantity} {item.unit}</strong>
              </span>
              <span className="text-xs text-slate-400">
                {item.maxStock > 0
                  ? `${Math.round((item.quantity / item.maxStock) * 100)}%`
                  : '–'}
              </span>
            </div>
            <StockLevelBar item={item} />
          </div>
        </DetailSection>

        {/* 備考・更新情報 */}
        {(item.note || item.updatedAt) && (
          <DetailSection label="その他">
            <dl>
              <DetailRow label="最終更新日" value={item.updatedAt} />
              {item.note && (
                <DetailRow
                  label="備考"
                  value={
                    <span className="text-slate-600 whitespace-pre-wrap">
                      {item.note}
                    </span>
                  }
                />
              )}
            </dl>
          </DetailSection>
        )}
      </div>
    </Modal>
  )
}

// ─── フィルタバー ─────────────────────────────────────────────

const STATUS_OPTIONS: { value: InventoryStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'normal', label: '適正' },
  { value: 'low', label: '残少' },
  { value: 'out_of_stock', label: '在庫なし' },
  { value: 'excess', label: '過剰' },
]

// ─── サマリカウント ────────────────────────────────────────────

function SummaryBar({ items }: { items: InventoryItem[] }) {
  const counts = useMemo(() => {
    return (Object.keys(INVENTORY_STATUS_CONFIG) as InventoryStatus[]).map(
      (status) => ({
        status,
        count: items.filter((i) => i.status === status).length,
      })
    )
  }, [items])

  return (
    <div className="flex items-center gap-4 text-xs text-slate-500">
      {counts.map(({ status, count }) => {
        const cfg = INVENTORY_STATUS_CONFIG[status]
        return (
          <span key={status} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${cfg.dotClass}`} />
            {cfg.label}: <strong className="text-slate-700">{count}</strong>
          </span>
        )
      })}
    </div>
  )
}

// ─── メインページ ─────────────────────────────────────────────

export default function InventoryPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InventoryStatus | 'all'>('all')
  const [selected, setSelected] = useState<InventoryItem | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return inventoryData.filter((item) => {
      const matchSearch =
        !q ||
        item.productCode.toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q) ||
        item.locationCode.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)

      const matchStatus =
        statusFilter === 'all' || item.status === statusFilter

      return matchSearch && matchStatus
    })
  }, [search, statusFilter])

  return (
    <div className="max-w-screen-xl space-y-4">
      {/* ページヘッダー */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">在庫一覧</h2>
        <p className="text-sm text-slate-500 mt-1">
          商品・ロケーション別の現在庫を確認します
        </p>
      </div>

      {/* カード */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* フィルタバー */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-3">
          {/* 検索 */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="商品コード・商品名・保管場所で検索"
          />

          {/* ステータス絞り込み */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as InventoryStatus | 'all')
            }
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white text-slate-700"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* 件数 */}
          <span className="text-xs text-slate-500 ml-auto">
            {filtered.length !== inventoryData.length ? (
              <>
                <strong className="text-slate-700">{filtered.length}</strong> 件
                <span className="text-slate-400"> / 全{inventoryData.length}件</span>
              </>
            ) : (
              <>全 <strong className="text-slate-700">{filtered.length}</strong> 件</>
            )}
          </span>
        </div>

        {/* サマリ */}
        <div className="px-5 py-2.5 bg-slate-50/60 border-b border-slate-100">
          <SummaryBar items={inventoryData} />
        </div>

        {/* テーブル */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  商品コード
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                  商品名
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  カテゴリ
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">
                  在庫数
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  保管場所
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  ステータス
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  最終更新日
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Package size={28} />
                      <p className="text-sm">該当する在庫データがありません</p>
                      {(search || statusFilter !== 'all') && (
                        <button
                          onClick={() => {
                            setSearch('')
                            setStatusFilter('all')
                          }}
                          className="text-xs text-blue-500 hover:underline mt-1"
                        >
                          フィルタをリセット
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
                    className="hover:bg-blue-50/50 cursor-pointer transition-colors group"
                  >
                    {/* 商品コード */}
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-blue-600 group-hover:text-blue-700">
                        {item.productCode}
                      </span>
                    </td>

                    {/* 商品名 */}
                    <td className="px-4 py-3">
                      <span className="text-slate-800 font-medium">
                        {item.productName}
                      </span>
                    </td>

                    {/* カテゴリ */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                        {item.category}
                      </span>
                    </td>

                    {/* 在庫数 */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span
                        className={`font-semibold tabular-nums ${
                          item.status === 'out_of_stock'
                            ? 'text-red-600'
                            : item.status === 'low'
                            ? 'text-amber-600'
                            : 'text-slate-800'
                        }`}
                      >
                        {item.quantity.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">
                        {item.unit}
                      </span>
                    </td>

                    {/* 保管場所 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                        {item.locationCode}
                      </span>
                    </td>

                    {/* ステータス */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={item.status} />
                    </td>

                    {/* 最終更新日 */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-slate-500">
                        {item.updatedAt}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 詳細モーダル */}
      {selected && (
        <InventoryDetailModal
          item={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
