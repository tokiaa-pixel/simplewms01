'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Package, Loader2, AlertCircle, ArrowLeftRight, SlidersHorizontal, Tag, ChevronLeft, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import StatusBadge from '@/components/ui/StatusBadge'
import PageShell from '@/components/ui/PageShell'
import EmptyState from '@/components/ui/EmptyState'
import {
  fetchInventory,
  fetchLocationOptions,
  moveInventory,
  adjustInventory,
  changeInventoryStatus,
  type LocationOption,
} from '@/lib/supabase/queries/inventory'
import { useTenant } from '@/store/TenantContext'
import ScopeRequired from '@/components/ui/ScopeRequired'
import { useTranslation } from '@/lib/i18n'
import {
  type InventoryItem,
  type InventoryStatus,
  INVENTORY_STATUS_CONFIG,
} from '@/lib/types'

// ─── ステータスバッジ（StatusBadge の在庫専用アダプタ） ────────

const FALLBACK_STATUS_CFG = {
  badgeClass: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  dotClass:   'bg-slate-400',
}

function InventoryStatusBadge({ status }: { status: InventoryStatus }) {
  const { t } = useTranslation('status')
  const cfg = INVENTORY_STATUS_CONFIG[status] ?? FALLBACK_STATUS_CFG
  return (
    <StatusBadge
      label={t(`inventory_${status}` as Parameters<typeof t>[0]) ?? status}
      badgeClass={cfg.badgeClass}
      dotClass={cfg.dotClass}
    />
  )
}

// ─── 数量セル（3段表示）────────────────────────────────────────

function QtyCell({ item }: { item: InventoryItem }) {
  const available = item.availableQty
  const allocated = item.allocatedQty
  return (
    <div className="text-right tabular-nums space-y-0.5">
      {/* 引当可能数：最も重要なので大きく */}
      <div className={`font-semibold ${
        item.status === 'damaged' ? 'text-red-600' :
        item.status === 'hold'    ? 'text-amber-600' :
        available === 0           ? 'text-slate-400' :
        'text-slate-800'
      }`}>
        {available.toLocaleString()}
      </div>
      {/* 引当済みがある場合のみ補足表示 */}
      {allocated > 0 && (
        <div className="text-[10px] text-amber-600">
          引当済 {allocated.toLocaleString()}
        </div>
      )}
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
      <dt className="w-36 flex-shrink-0 text-xs text-slate-500">{label}</dt>
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
        <DetailSection label={t('detailOnHandQty')}>
          <dl>
            {/* 総在庫数 */}
            <DetailRow
              label={t('detailOnHandQty')}
              value={
                <span className="text-base font-bold text-slate-800 tabular-nums">
                  {item.onHandQty.toLocaleString()}
                  <span className="text-xs font-normal text-slate-500 ml-1">{item.unit}</span>
                </span>
              }
            />
            {/* 引当済み数量 */}
            <DetailRow
              label={t('detailAllocatedQty')}
              value={
                <span className={`text-base font-bold tabular-nums ${item.allocatedQty > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                  {item.allocatedQty.toLocaleString()}
                  <span className="text-xs font-normal text-slate-500 ml-1">{item.unit}</span>
                </span>
              }
            />
            {/* 引当可能数 */}
            <DetailRow
              label={t('detailAvailableQty')}
              value={
                <span className={`text-base font-bold tabular-nums ${
                  item.status === 'damaged' ? 'text-red-600' :
                  item.status === 'hold'    ? 'text-amber-600' :
                  item.availableQty === 0   ? 'text-slate-400' :
                  'text-green-700'
                }`}>
                  {item.availableQty.toLocaleString()}
                  <span className="text-xs font-normal text-slate-500 ml-1">{item.unit}</span>
                </span>
              }
            />
            <DetailRow label={t('colStatus')}      value={<InventoryStatusBadge status={item.status} />} />
            <DetailRow label={t('detailLocation')} value={<span className="font-mono">{item.locationCode}</span>} />
            {item.receivedDate && (
              <DetailRow label={t('detailReceivedDate')} value={
                <span className="tabular-nums">{item.receivedDate}</span>
              } />
            )}
            {item.lotNumber && (
              <DetailRow label={t('detailLot')} value={<span className="font-mono">{item.lotNumber}</span>} />
            )}
          </dl>
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

// ─── 在庫操作モーダル共通 ──────────────────────────────────────

interface OperationModalProps {
  item:      InventoryItem
  onSuccess: () => void
  onClose:   () => void
}

/** 操作モーダル内で対象在庫の情報を表示する共通カード */
function InventoryInfoCard({ item }: { item: InventoryItem }) {
  return (
    <div className="bg-slate-50 rounded-lg px-4 py-3 text-xs space-y-1.5 border border-slate-200">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-blue-600 font-medium">{item.productCode}</span>
        <InventoryStatusBadge status={item.status} />
      </div>
      <p className="font-medium text-slate-800 text-sm">{item.productName}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 pt-0.5">
        <span>場所: <span className="font-mono text-slate-700">{item.locationCode}</span></span>
        {item.receivedDate && (
          <span>入庫日: <span className="tabular-nums">{item.receivedDate}</span></span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 border-t border-slate-200">
        <span className="text-slate-600">総数: <strong className="text-slate-800 tabular-nums">{item.onHandQty.toLocaleString()}</strong></span>
        {item.allocatedQty > 0 && (
          <span className="text-amber-600">引当済: <strong className="tabular-nums">{item.allocatedQty.toLocaleString()}</strong></span>
        )}
        <span className="text-teal-600">引当可能: <strong className="tabular-nums">{item.availableQty.toLocaleString()}</strong></span>
        <span className="text-slate-400">{item.unit}</span>
      </div>
    </div>
  )
}

// ─── 在庫移動モーダル ──────────────────────────────────────────

function MoveInventoryModal({ item, onSuccess, onClose }: OperationModalProps) {
  const { scope } = useTenant()
  const [locations,   setLocations]   = useState<LocationOption[]>([])
  const [locLoading,  setLocLoading]  = useState(true)
  const [destLocId,   setDestLocId]   = useState('')
  const [moveQtyStr,  setMoveQtyStr]  = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  useEffect(() => {
    if (!scope) { setLocLoading(false); return }
    fetchLocationOptions(scope.warehouseId).then(({ data }) => {
      setLocations(data)
      setLocLoading(false)
    })
  }, [scope])

  // 移動元ロケーションを除外
  const destOptions = locations.filter((l) => l.id !== item.locationId)

  const moveQty    = parseInt(moveQtyStr) || 0
  const isOverflow = moveQty > item.availableQty
  const canSubmit  = destLocId && moveQty > 0 && !isOverflow && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError('')
    const { error: err } = await moveInventory({
      inventoryId:           item.id,
      destinationLocationId: destLocId,
      moveQty,
    })
    setLoading(false)
    if (err) { setError(err); return }
    onSuccess()
  }

  return (
    <Modal title="在庫移動" onClose={onClose} size="md">
      <div className="space-y-4">
        <InventoryInfoCard item={item} />

        <div className="space-y-3">
          {/* 移動先 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              移動先ロケーション <span className="text-red-500">*</span>
            </label>
            {locLoading ? (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> 読み込み中...
              </p>
            ) : destOptions.length === 0 ? (
              <p className="text-xs text-slate-400">移動可能なロケーションがありません</p>
            ) : (
              <select
                value={destLocId}
                onChange={(e) => setDestLocId(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal"
              >
                <option value="">ロケーションを選択...</option>
                {destOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}{l.name ? `　${l.name}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 移動数量 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              移動数量 <span className="text-red-500">*</span>
              <span className="ml-1 font-normal text-slate-400">
                （最大 {item.availableQty.toLocaleString()} {item.unit}）
              </span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" max={item.availableQty}
                value={moveQtyStr}
                onChange={(e) => setMoveQtyStr(e.target.value)}
                placeholder="0"
                className={`w-28 border rounded-md px-3 py-2 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-teal ${
                  isOverflow ? 'border-red-400 bg-red-50' : 'border-slate-300'
                }`}
              />
              <span className="text-xs text-slate-400">{item.unit}</span>
            </div>
            {isOverflow && (
              <p className="text-xs text-red-500 mt-0.5">
                引当可能数（{item.availableQty}）を超えています
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            <AlertCircle size={11} /> {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="px-4 py-2 text-sm bg-brand-navy text-white rounded-md hover:bg-brand-navy-mid disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 font-medium">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <ArrowLeftRight size={13} />}
            移動を確定
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── 在庫数量調整モーダル ──────────────────────────────────────

const ADJUST_REASONS = ['棚卸差異', '破損', '紛失', '誤登録修正', 'その他'] as const
type AdjustReason = (typeof ADJUST_REASONS)[number]
type AdjustType   = 'increase' | 'decrease' | 'set'

const ADJUST_TYPE_CONFIG: { type: AdjustType; label: string; color: string }[] = [
  { type: 'increase', label: '増加', color: 'text-green-600' },
  { type: 'decrease', label: '減少', color: 'text-red-600'   },
  { type: 'set',      label: '実棚で上書き', color: 'text-blue-600' },
]

function AdjustInventoryModal({ item, onSuccess, onClose }: OperationModalProps) {
  const [adjustType, setAdjustType] = useState<AdjustType>('increase')
  const [qtyStr,     setQtyStr]     = useState('')
  const [reason,     setReason]     = useState<AdjustReason>('棚卸差異')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  const qty = parseInt(qtyStr) || 0

  const newQty =
    adjustType === 'increase' ? item.onHandQty + qty :
    adjustType === 'decrease' ? item.onHandQty - qty :
    qty  // 'set'

  const isNegative       = newQty < 0
  const isUnderAllocated = newQty < item.allocatedQty
  const hasError         = isNegative || isUnderAllocated
  const canSubmit        = qtyStr !== '' && qty >= 0 && !hasError && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError('')
    const { error: err } = await adjustInventory({
      inventoryId: item.id,
      adjustType,
      qty,
      reason,
    })
    setLoading(false)
    if (err) { setError(err); return }
    onSuccess()
  }

  return (
    <Modal title="在庫数量調整" onClose={onClose} size="md">
      <div className="space-y-4">
        <InventoryInfoCard item={item} />

        <div className="space-y-3">
          {/* 調整方式 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              調整方式 <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-4">
              {ADJUST_TYPE_CONFIG.map(({ type, label, color }) => (
                <label key={type}
                  className={`flex items-center gap-1.5 text-sm cursor-pointer ${
                    adjustType === type ? `${color} font-medium` : 'text-slate-500'
                  }`}>
                  <input type="radio" name="adjustType" value={type}
                    checked={adjustType === type}
                    onChange={() => { setAdjustType(type); setQtyStr('') }}
                    className="accent-brand-teal"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* 数量 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {adjustType === 'set' ? '実棚数量' : '調整数量'} <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number" min="0"
                value={qtyStr}
                onChange={(e) => setQtyStr(e.target.value)}
                placeholder="0"
                className={`w-28 border rounded-md px-3 py-2 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-teal ${
                  hasError ? 'border-red-400 bg-red-50' : 'border-slate-300'
                }`}
              />
              <span className="text-xs text-slate-400">{item.unit}</span>
              {qtyStr !== '' && (
                <span className={`text-xs font-medium tabular-nums ${hasError ? 'text-red-600' : 'text-slate-600'}`}>
                  → {newQty.toLocaleString()} {item.unit}
                </span>
              )}
            </div>
            {isNegative && (
              <p className="text-xs text-red-500 mt-0.5">在庫数が負数になります</p>
            )}
            {isUnderAllocated && !isNegative && (
              <p className="text-xs text-red-500 mt-0.5">
                引当済み数量（{item.allocatedQty}）を下回ります。引当を解除してから調整してください。
              </p>
            )}
          </div>

          {/* 調整理由 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              調整理由 <span className="text-red-500">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as AdjustReason)}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal"
            >
              {ADJUST_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            <AlertCircle size={11} /> {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="px-4 py-2 text-sm bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 font-medium">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <SlidersHorizontal size={13} />}
            調整を確定
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── 在庫ステータス変更モーダル ────────────────────────────────

const STATUS_LABELS: Record<InventoryStatus, string> = {
  available: '通常',
  hold:      '保留',
  damaged:   '破損',
}

function ChangeStatusModal({ item, onSuccess, onClose }: OperationModalProps) {
  const targetStatuses = (Object.keys(INVENTORY_STATUS_CONFIG) as InventoryStatus[])
    .filter((s) => s !== item.status)

  const [newStatus, setNewStatus] = useState<InventoryStatus>(targetStatuses[0] ?? 'available')
  const [qtyStr,    setQtyStr]    = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')

  const qty        = parseInt(qtyStr) || 0
  const isOverflow = qty > item.availableQty
  const canSubmit  = qtyStr !== '' && qty > 0 && !isOverflow && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return
    setLoading(true)
    setError('')
    const { error: err } = await changeInventoryStatus({
      inventoryId: item.id,
      newStatus,
      changeQty: qty,
    })
    setLoading(false)
    if (err) { setError(err); return }
    onSuccess()
  }

  return (
    <Modal title="在庫ステータス変更" onClose={onClose} size="md">
      <div className="space-y-4">
        <InventoryInfoCard item={item} />

        <div className="space-y-3">
          {/* 変更先ステータス */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              変更先ステータス <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-4">
              {targetStatuses.map((s) => {
                const cfg = INVENTORY_STATUS_CONFIG[s]
                return (
                  <label key={s}
                    className={`flex items-center gap-1.5 text-sm cursor-pointer font-medium`}>
                    <input type="radio" name="newStatus" value={s}
                      checked={newStatus === s}
                      onChange={() => setNewStatus(s)}
                      className="accent-brand-teal"
                    />
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${cfg.badgeClass}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
                      {STATUS_LABELS[s]}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* 変更数量 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              変更数量 <span className="text-red-500">*</span>
              <span className="ml-1 font-normal text-slate-400">
                （最大 {item.availableQty.toLocaleString()} {item.unit}）
              </span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="1" max={item.availableQty}
                value={qtyStr}
                onChange={(e) => setQtyStr(e.target.value)}
                placeholder="0"
                className={`w-28 border rounded-md px-3 py-2 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-teal ${
                  isOverflow ? 'border-red-400 bg-red-50' : 'border-slate-300'
                }`}
              />
              <span className="text-xs text-slate-400">{item.unit}</span>
            </div>
            {isOverflow && (
              <p className="text-xs text-red-500 mt-0.5">
                引当可能数（{item.availableQty}）を超えています
              </p>
            )}
          </div>
        </div>

        {/* 変更後プレビュー */}
        {qtyStr !== '' && qty > 0 && !isOverflow && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs">
            <p className="font-medium text-blue-700 mb-1.5">変更後のイメージ</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-blue-600">
              <span>
                {STATUS_LABELS[item.status]} (現在):&nbsp;
                <strong className="tabular-nums">{item.onHandQty}</strong>
                &nbsp;→&nbsp;
                <strong className="tabular-nums">{item.onHandQty - qty}</strong>
              </span>
              <span>
                {STATUS_LABELS[newStatus]} (+):&nbsp;
                <strong className="tabular-nums">+{qty}</strong>
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            <AlertCircle size={11} /> {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 font-medium">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Tag size={13} />}
            変更を確定
          </button>
        </div>
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
        const cfg = INVENTORY_STATUS_CONFIG[status] ?? FALLBACK_STATUS_CFG
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

// 在庫の有効な statusFilter 値
const INVENTORY_FILTER_VALUES = ['all', 'available', 'damaged', 'hold'] as const
type InventoryFilterValue = typeof INVENTORY_FILTER_VALUES[number]

// ─── ページネーション定数 ─────────────────────────────────────

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const
type PageSizeOption     = typeof PAGE_SIZE_OPTIONS[number]
const DEFAULT_PAGE_SIZE: PageSizeOption = 50

/**
 * ページ番号ウィンドウを生成する。
 * total <= 7 なら全ページ表示。それ以上は current ±1 の周辺と両端を残し中間を '…' で省略。
 */
function getPageWindow(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3)           pages.push('…')
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) pages.push(p)
  if (current < total - 2)   pages.push('…')
  pages.push(total)
  return pages
}

export default function InventoryPage() {
  const { t } = useTranslation('inventory')
  const { t: ts } = useTranslation('status')
  const { t: tc } = useTranslation('common')
  const { scope } = useTenant()

  // ── URL params ─────────────────────────────────────────────
  const searchParams = useSearchParams()
  const router = useRouter()

  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([])
  const [loading, setLoading]             = useState(true)
  const [fetchError, setFetchError]       = useState<string | null>(null)

  // URL params から初期値を読む
  const [search, setSearch]             = useState(() => searchParams.get('q') ?? '')
  const [statusFilter, setStatusFilter] = useState<InventoryFilterValue>(() => {
    const raw = searchParams.get('status')
    return (INVENTORY_FILTER_VALUES as readonly string[]).includes(raw ?? '') ? raw as InventoryFilterValue : 'all'
  })
  const [page, setPage]         = useState(() => {
    const raw = parseInt(searchParams.get('page') ?? '1', 10)
    return Number.isFinite(raw) && raw >= 1 ? raw : 1
  })
  const [pageSize, setPageSize] = useState<PageSizeOption>(() => {
    const raw = parseInt(searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10)
    return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw as PageSizeOption : DEFAULT_PAGE_SIZE
  })
  const [selected, setSelected]         = useState<InventoryItem | null>(null)

  const [actionItem, setActionItem]   = useState<InventoryItem | null>(null)
  const [actionType, setActionType]   = useState<'move' | 'adjust' | 'status' | null>(null)

  const loadInventory = useCallback(async () => {
    if (!scope) { setLoading(false); return }
    setLoading(true)
    setFetchError(null)
    const { data, error } = await fetchInventory(scope)
    if (error) setFetchError(error)
    else setInventoryData(data)
    setLoading(false)
  }, [scope])

  const handleOperationSuccess = useCallback(() => {
    setActionItem(null)
    setActionType(null)
    if (!scope) return
    fetchInventory(scope).then(({ data, error }) => {
      if (!error) setInventoryData(data)
    })
  }, [scope])

  const handleOperationClose = useCallback(() => {
    setActionItem(null)
    setActionType(null)
  }, [])

  useEffect(() => { loadInventory() }, [loadInventory])

  // ── URL 更新ヘルパー（history を積まない replace）──────────
  // page=1 / pageSize=DEFAULT は省略してURLを汚さない
  const pushParams = useCallback((q: string, status: InventoryFilterValue, pg: number, ps: PageSizeOption) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (status !== 'all')       p.set('status',   status)
    if (pg > 1)                 p.set('page',     String(pg))
    if (ps !== DEFAULT_PAGE_SIZE) p.set('pageSize', String(ps))
    const qs = p.toString()
    router.replace(`/inventory${qs ? `?${qs}` : ''}`)
  }, [router])

  // filter / search 変更時はページを 1 にリセット
  const handleSearchChange = useCallback((val: string) => {
    setSearch(val)
    setPage(1)
    pushParams(val, statusFilter, 1, pageSize)
  }, [statusFilter, pageSize, pushParams])

  const handleStatusChange = useCallback((val: InventoryFilterValue) => {
    setStatusFilter(val)
    setPage(1)
    pushParams(search, val, 1, pageSize)
  }, [search, pageSize, pushParams])

  // フィルタリセット（EmptyState の action からも呼ばれる）
  const resetFilter = useCallback(() => {
    setSearch('')
    setStatusFilter('all')
    setPage(1)
    pushParams('', 'all', 1, pageSize)
  }, [pageSize, pushParams])

  const handlePageChange = useCallback((pg: number) => {
    setPage(pg)
    pushParams(search, statusFilter, pg, pageSize)
  }, [search, statusFilter, pageSize, pushParams])

  const handlePageSizeChange = useCallback((ps: PageSizeOption) => {
    setPageSize(ps)
    setPage(1)
    pushParams(search, statusFilter, 1, ps)
  }, [search, statusFilter, pushParams])

  const statusOptions: { value: InventoryFilterValue; label: string }[] = [
    { value: 'all',       label: tc('all') },
    { value: 'available', label: ts('inventory_available') },
    { value: 'damaged',   label: ts('inventory_damaged') },
    { value: 'hold',      label: ts('inventory_hold') },
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
  }, [inventoryData, search, statusFilter])

  // ── ページング（filtered を pageSize で切り出す） ──────────
  const { paged, totalPages, safePage, startIdx, endIdx } = useMemo(() => {
    const total = Math.max(1, Math.ceil(filtered.length / pageSize))
    const safe  = Math.min(Math.max(1, page), total)
    const start = (safe - 1) * pageSize
    const end   = Math.min(start + pageSize, filtered.length)
    return { paged: filtered.slice(start, end), totalPages: total, safePage: safe, startIdx: start, endIdx: end }
  }, [filtered, page, pageSize])

  if (!scope) return <ScopeRequired />

  return (
  <PageShell
    loading={loading}
    error={fetchError}
    onRetry={loadInventory}
    title={t('title')}
    subtitle={t('subtitle')}
  >
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
            onChange={handleSearchChange}
            placeholder={t('searchPlaceholder')}
          />

          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value as InventoryFilterValue)}
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
            <div className="py-12">
              <EmptyState
                icon={<Package size={28} />}
                message={t('empty')}
                action={(search || statusFilter !== 'all') ? { label: t('resetFilter'), onClick: resetFilter } : undefined}
              />
            </div>
          ) : (
            paged.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelected(item)}
                className="px-4 py-4 cursor-pointer active:bg-blue-50/50"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs text-blue-600">{item.productCode}</span>
                  <InventoryStatusBadge status={item.status} />
                </div>
                <p className="text-sm font-medium text-slate-800 mb-1.5">{item.productName}</p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-mono bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                    {item.locationCode}
                  </span>
                  <div className="text-right">
                    <span className={`font-semibold tabular-nums ${
                      item.status === 'damaged' ? 'text-red-600' :
                      item.status === 'hold'    ? 'text-amber-600' :
                      item.availableQty === 0   ? 'text-slate-400' :
                      'text-slate-800'
                    }`}>
                      {item.availableQty.toLocaleString()}
                      <span className="font-normal text-slate-400 ml-0.5">{item.unit}</span>
                    </span>
                    {item.allocatedQty > 0 && (
                      <p className="text-[10px] text-amber-600">引当済 {item.allocatedQty}</p>
                    )}
                  </div>
                </div>
                {/* モバイル操作ボタン */}
                <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { setActionItem(item); setActionType('move') }}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-slate-200 text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <ArrowLeftRight size={11} /> 移動
                  </button>
                  <button
                    onClick={() => { setActionItem(item); setActionType('adjust') }}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-slate-200 text-amber-600 hover:bg-amber-50 transition-colors"
                  >
                    <SlidersHorizontal size={11} /> 調整
                  </button>
                  <button
                    onClick={() => { setActionItem(item); setActionType('status') }}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-slate-200 text-purple-600 hover:bg-purple-50 transition-colors"
                  >
                    <Tag size={11} /> ステータス
                  </button>
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
                {/* 数量 3カラム */}
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colOnHandQty')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-amber-600 whitespace-nowrap">{t('colAllocatedQty')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-green-700 whitespace-nowrap">{t('colAvailableQty')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colUnit')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colLocation')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colStatus')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colReceivedDate')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colUpdated')}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center">
                    <EmptyState
                      icon={<Package size={28} />}
                      message={t('empty')}
                      action={(search || statusFilter !== 'all') ? { label: t('resetFilter'), onClick: resetFilter } : undefined}
                    />
                  </td>
                </tr>
              ) : (
                paged.map((item) => (
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
                    {/* 総在庫 */}
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {item.onHandQty.toLocaleString()}
                    </td>
                    {/* 引当済み */}
                    <td className={`px-4 py-3 text-right tabular-nums ${item.allocatedQty > 0 ? 'text-amber-600 font-medium' : 'text-slate-300'}`}>
                      {item.allocatedQty > 0 ? item.allocatedQty.toLocaleString() : '—'}
                    </td>
                    {/* 引当可能 */}
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${
                      item.status === 'damaged' ? 'text-red-600' :
                      item.status === 'hold'    ? 'text-amber-600' :
                      item.availableQty === 0   ? 'text-slate-400' :
                      'text-green-700'
                    }`}>
                      {item.availableQty.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.unit}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-slate-50 border border-slate-200 px-2 py-0.5 rounded">
                        {item.locationCode}
                      </span>
                    </td>
                    <td className="px-4 py-3"><InventoryStatusBadge status={item.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap tabular-nums">
                      {item.receivedDate ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{item.updatedAt}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          title="在庫移動"
                          onClick={(e) => { e.stopPropagation(); setActionItem(item); setActionType('move') }}
                          className="p-1.5 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          <ArrowLeftRight size={14} />
                        </button>
                        <button
                          title="数量調整"
                          onClick={(e) => { e.stopPropagation(); setActionItem(item); setActionType('adjust') }}
                          className="p-1.5 rounded hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                        >
                          <SlidersHorizontal size={14} />
                        </button>
                        <button
                          title="ステータス変更"
                          onClick={(e) => { e.stopPropagation(); setActionItem(item); setActionType('status') }}
                          className="p-1.5 rounded hover:bg-purple-50 text-slate-400 hover:text-purple-600 transition-colors"
                        >
                          <Tag size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ページネーションフッター */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* 表示範囲サマリ */}
            <span className="text-xs text-slate-500">
              全 <strong className="text-slate-700">{filtered.length.toLocaleString()}</strong> 件中{' '}
              <strong className="text-slate-700">{(startIdx + 1).toLocaleString()}</strong>–<strong className="text-slate-700">{endIdx.toLocaleString()}</strong> 件を表示
            </span>

            {/* ページ番号ナビゲーション */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(safePage - 1)}
                  disabled={safePage === 1}
                  aria-label="前のページ"
                  className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                {getPageWindow(safePage, totalPages).map((p, i) =>
                  p === '…' ? (
                    <span key={`e${i}`} className="px-1 text-xs text-slate-400 select-none">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => handlePageChange(p as number)}
                      className={`min-w-[28px] h-7 px-1.5 text-xs rounded border transition-colors ${
                        p === safePage
                          ? 'bg-brand-navy text-white border-brand-navy font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  onClick={() => handlePageChange(safePage + 1)}
                  disabled={safePage === totalPages}
                  aria-label="次のページ"
                  className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {/* 表示件数選択 */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-slate-500">{t('pageSizeLabel')}</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value) as PageSizeOption)}
                className="px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal bg-white text-slate-700"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}{tc('countUnit')}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <InventoryDetailModal item={selected} onClose={() => setSelected(null)} />
      )}

      {actionItem && actionType === 'move' && (
        <MoveInventoryModal item={actionItem} onSuccess={handleOperationSuccess} onClose={handleOperationClose} />
      )}
      {actionItem && actionType === 'adjust' && (
        <AdjustInventoryModal item={actionItem} onSuccess={handleOperationSuccess} onClose={handleOperationClose} />
      )}
      {actionItem && actionType === 'status' && (
        <ChangeStatusModal item={actionItem} onSuccess={handleOperationSuccess} onClose={handleOperationClose} />
      )}
    </div>
  </PageShell>
  )
}
