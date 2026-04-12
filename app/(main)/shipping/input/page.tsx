'use client'

import { useState, useEffect, useId, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, ArrowLeft, CheckCircle, Zap, Hand,
  RotateCcw, AlertTriangle, X, AlertCircle,
} from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { Translations } from '@/lib/i18n/types'
import { INVENTORY_STATUS_CONFIG } from '@/lib/types'
import { useTenant } from '@/store/TenantContext'
import ScopeRequired from '@/components/ui/ScopeRequired'

type TShipping = (key: keyof Translations['shippingInput']) => string
type TCommon   = (key: keyof Translations['common'])         => string
import type { AllocationItem, InventoryLine, CustomerOption, ShipProductOption } from '@/lib/supabase/queries/shippings'
import {
  fetchCustomerOptions,
  fetchShipProductOptions,
  fetchInventoryForProduct,
  fetchInventoryForManualAllocation,
  computeFifoAllocation,
  generateShippingNo,
  checkShippingNoExists,
  createShippingOrder,
} from '@/lib/supabase/queries/shippings'

// =============================================================
// 型定義
// =============================================================

interface LineState {
  uid:            string
  productId:      string
  productCode:    string
  productName:    string
  unit:           string
  requestedQty:   string    // フォーム用文字列
  allocations:    AllocationItem[]
  allocationMode: 'none' | 'fifo' | 'manual'
}

type FormErrors = Partial<Record<string, string>>

function emptyLine(uid: string): LineState {
  return {
    uid, productId: '', productCode: '', productName: '', unit: '',
    requestedQty: '', allocations: [], allocationMode: 'none',
  }
}

// =============================================================
// 手動引当モーダル
// =============================================================

interface ManualModalProps {
  productName:   string
  requestedQty:  number
  inventoryLines: InventoryLine[]
  initial:       AllocationItem[]
  onConfirm:     (items: AllocationItem[]) => void
  onClose:       () => void
  t:             TShipping
}

function ManualAllocationModal({
  productName, requestedQty, inventoryLines, initial, onConfirm, onClose, t,
}: ManualModalProps) {
  // qtys: inventoryId → 入力数量文字列
  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    initial.forEach((a) => { m[a.inventoryId] = String(a.allocatedQty) })
    return m
  })

  // 各行の入力値を数値に安全変換（NaN → 0）
  const parseQty = (id: string) => {
    const v = Number(qtys[id] ?? 0)
    return isNaN(v) ? 0 : Math.max(0, v)
  }

  // 行ごとの超過フラグ（available_qty を超えているか）
  const isRowOverflow = (line: InventoryLine) => parseQty(line.inventoryId) > line.availableQty

  // 超過している行が1行でもあるか
  const hasRowOverflow = inventoryLines.some(isRowOverflow)

  // 合計引当数
  const totalAllocated = inventoryLines.reduce(
    (sum, l) => sum + parseQty(l.inventoryId), 0,
  )

  // 合計超過（出庫数量を超えているか）
  const isTotalOver = totalAllocated > requestedQty

  // 確定ボタン無効条件
  const canConfirm = totalAllocated > 0 && !isTotalOver && !hasRowOverflow

  const handleConfirm = () => {
    const items: AllocationItem[] = inventoryLines
      .filter((l) => parseQty(l.inventoryId) > 0)
      .map((l) => ({
        inventoryId:  l.inventoryId,
        locationId:   l.locationId,
        locationCode: l.locationCode,
        locationName: l.locationName,
        status:       l.status,
        availableQty: l.availableQty,
        // 安全ガード：available_qty を絶対に超えない
        allocatedQty: Math.min(parseQty(l.inventoryId), l.availableQty),
        receivedDate: l.receivedDate,
      }))
    onConfirm(items)
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{t('manualModalTitle')}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{productName}　出庫数量: <span className="font-semibold text-slate-700">{requestedQty}</span></p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* 在庫テーブル */}
        <div className="overflow-auto flex-1">
          {inventoryLines.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">{t('noInventory')}</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-500 min-w-[100px]">{t('colLocation')}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-500">ステータス</th>
                  {/* 数量3列 */}
                  <th className="px-3 py-2.5 text-right font-medium text-slate-500">{t('colOnHandQty')}</th>
                  <th className="px-3 py-2.5 text-right font-medium text-amber-600">{t('colAllocatedQty')}</th>
                  <th className="px-3 py-2.5 text-right font-medium text-teal-600">{t('colAvailableQty')}</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-500">{t('colReceivedDate')}</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-500 w-28">{t('colAllocateQty')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventoryLines.map((line) => {
                  const cfg      = INVENTORY_STATUS_CONFIG[line.status]
                  const inputQty = parseQty(line.inventoryId)
                  const overflow = isRowOverflow(line)

                  return (
                    <tr
                      key={line.inventoryId}
                      className={`transition-colors ${overflow ? 'bg-red-50' : 'hover:bg-slate-50/60'}`}
                    >
                      {/* 保管場所 */}
                      <td className="px-3 py-2.5">
                        <span className="font-mono font-medium text-slate-800">{line.locationCode}</span>
                        {line.locationName && (
                          <span className="text-slate-400 ml-1.5 text-[10px]">{line.locationName}</span>
                        )}
                      </td>

                      {/* ステータス */}
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.badgeClass}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
                          {cfg.label}
                        </span>
                      </td>

                      {/* 総数 */}
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600">
                        {line.onHandQty ?? 0}
                      </td>

                      {/* 引当済 */}
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <span className={line.allocatedQty > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}>
                          {line.allocatedQty ?? 0}
                        </span>
                      </td>

                      {/* 引当可能 */}
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <span className="text-teal-600 font-semibold">{line.availableQty}</span>
                      </td>

                      {/* 入庫日 */}
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                        {formatDate(line.receivedDate)}
                      </td>

                      {/* 引当数入力 */}
                      <td className="px-3 py-2.5">
                        <div>
                          <input
                            type="number"
                            min="0"
                            max={line.availableQty}
                            value={qtys[line.inventoryId] ?? ''}
                            onChange={(e) =>
                              setQtys((prev) => ({ ...prev, [line.inventoryId]: e.target.value }))
                            }
                            placeholder="0"
                            className={`w-full border rounded px-2 py-1 text-right font-mono focus:outline-none focus:ring-2 ${
                              overflow
                                ? 'border-red-400 bg-red-50 focus:ring-red-300 text-red-700'
                                : 'border-slate-300 focus:ring-brand-teal'
                            }`}
                          />
                          {overflow && (
                            <p className="text-[10px] text-red-500 mt-0.5 text-right">
                              {t('errOverAvailable')} (max {line.availableQty})
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* フッター */}
        <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-between gap-4">
          {/* 合計サマリ */}
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span>
              {t('allocatedTotal')}:&nbsp;
              <span className={`font-semibold tabular-nums ${isTotalOver ? 'text-red-600' : 'text-slate-800'}`}>
                {totalAllocated}
              </span>
              <span className="text-slate-400"> / {requestedQty}</span>
            </span>
            {isTotalOver && (
              <span className="flex items-center gap-0.5 text-red-600">
                <AlertCircle size={11} />
                出庫数量を超えています
              </span>
            )}
            {hasRowOverflow && !isTotalOver && (
              <span className="flex items-center gap-0.5 text-red-600">
                <AlertCircle size={11} />
                引当可能数を超えている行があります
              </span>
            )}
          </div>

          {/* ボタン */}
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="px-3 py-1.5 text-xs bg-brand-navy text-white rounded-md hover:bg-brand-navy-mid disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {t('manualConfirmBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================
// 引当結果表示
// =============================================================

interface AllocationResultProps {
  allocations:  AllocationItem[]
  requestedQty: number
  mode:         'fifo' | 'manual'
  onReset:      () => void
  t:            TShipping
}

function AllocationResult({ allocations, requestedQty, mode, onReset, t }: AllocationResultProps) {
  const totalAllocated = allocations.reduce((s, a) => s + a.allocatedQty, 0)
  const shortage = requestedQty - totalAllocated

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  return (
    <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-slate-50 px-3 py-1.5 border-b border-slate-200">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          {mode === 'fifo' ? (
            <><Zap size={11} className="text-brand-teal" /><span className="font-medium">FIFO</span></>
          ) : (
            <><Hand size={11} className="text-blue-500" /><span className="font-medium">手動</span></>
          )}
          <span className="text-slate-400">｜</span>
          <span>{t('allocatedTotal')}:&nbsp;<span className="font-semibold tabular-nums">{totalAllocated}</span>&nbsp;/&nbsp;{requestedQty}</span>
          {shortage > 0 && (
            <span className="flex items-center gap-0.5 text-amber-600 ml-1">
              <AlertTriangle size={10} />
              {t('shortage')} {shortage}
            </span>
          )}
          {shortage > 0 && mode === 'fifo' && (
            <span className="text-[10px] text-amber-500 ml-1">（available 在庫が不足。hold / damaged は自動引当対象外）</span>
          )}
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
        >
          <RotateCcw size={9} /> {t('resetAllocation')}
        </button>
      </div>

      <div className="divide-y divide-slate-100">
        {allocations.map((a, i) => {
          const cfg = INVENTORY_STATUS_CONFIG[a.status]
          return (
            <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-xs text-slate-700">
              <span className="font-mono text-slate-800">{a.locationCode}</span>
              {a.locationName && <span className="text-slate-400 text-[10px]">{a.locationName}</span>}
              <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] ${cfg.badgeClass}`}>
                <span className={`w-1 h-1 rounded-full ${cfg.dotClass}`} />
                {cfg.label}
              </span>
              <span className="ml-auto font-semibold tabular-nums">{a.allocatedQty}</span>
              {a.receivedDate && (
                <span className="text-slate-400 tabular-nums">{formatDate(a.receivedDate)}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =============================================================
// 明細行コンポーネント
// =============================================================

interface LineRowProps {
  line:        LineState
  products:    ShipProductOption[]
  errors:      FormErrors
  onUpdate:    (uid: string, patch: Partial<LineState>) => void
  onRemove:    (uid: string) => void
  canRemove:   boolean
  onOpenManual:(uid: string) => void
  onRunFifo:   (uid: string) => void
  t:           TShipping
  tc:          TCommon
}

function LineRow({
  line, products, errors, onUpdate, onRemove, canRemove,
  onOpenManual, onRunFifo, t, tc,
}: LineRowProps) {
  const qtyError  = errors[`qty_${line.uid}`]
  const allocError = errors[`alloc_${line.uid}`]

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2.5">
      {/* 商品 + 数量 + 削除 */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <select
            value={line.productId}
            onChange={(e) => {
              const p = products.find((p) => p.id === e.target.value)
              onUpdate(line.uid, {
                productId:   p?.id   ?? '',
                productCode: p?.code ?? '',
                productName: p?.name ?? '',
                unit:        p?.unit ?? '',
                allocations: [],
                allocationMode: 'none',
              })
            }}
            className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
          >
            <option value="">{t('productPlaceholder')}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}　{p.name}
              </option>
            ))}
          </select>
        </div>

        {/* 数量 */}
        <div className="w-24 flex-shrink-0">
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="1"
              value={line.requestedQty}
              onChange={(e) =>
                onUpdate(line.uid, {
                  requestedQty: e.target.value,
                  allocations: [],
                  allocationMode: 'none',
                })
              }
              placeholder="0"
              className={`w-full border rounded px-2 py-1.5 text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-brand-teal ${qtyError ? 'border-red-400' : 'border-slate-300'}`}
            />
            {line.unit && (
              <span className="text-[10px] text-slate-400 whitespace-nowrap">{line.unit}</span>
            )}
          </div>
          {qtyError && <p className="text-[10px] text-red-500 mt-0.5">{qtyError}</p>}
        </div>

        {/* 削除ボタン */}
        <button
          onClick={() => onRemove(line.uid)}
          disabled={!canRemove}
          className="p-1.5 mt-0.5 text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          aria-label="削除"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* 引当セクション */}
      {line.productId && (
        <div className="pl-1">
          <p className="text-[10px] font-medium text-slate-500 mb-1.5">{t('allocationSection')}</p>

          {line.allocationMode === 'none' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onRunFifo(line.uid)}
                disabled={!line.requestedQty || Number(line.requestedQty) <= 0}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-brand-teal text-white rounded-md hover:bg-brand-teal/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
              >
                <Zap size={11} /> {t('fifoBtn')}
              </button>
              <button
                onClick={() => onOpenManual(line.uid)}
                disabled={!line.requestedQty || Number(line.requestedQty) <= 0}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Hand size={11} /> {t('manualBtn')}
              </button>
            </div>
          ) : (
            <AllocationResult
              allocations={line.allocations}
              requestedQty={Number(line.requestedQty)}
              mode={line.allocationMode}
              onReset={() => onUpdate(line.uid, { allocations: [], allocationMode: 'none' })}
              t={t}
            />
          )}

          {allocError && (
            <p className="flex items-center gap-1 text-[10px] text-red-500 mt-1">
              <AlertCircle size={10} /> {allocError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================
// ページ本体
// =============================================================

export default function ShippingInputPage() {
  const { t }  = useTranslation('shippingInput')
  const { t: tc } = useTranslation('common')
  const router = useRouter()
  const uid    = useId()
  const { scope } = useTenant()

  // ── マスタデータ ──────────────────────────────────────────
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [products,  setProducts]  = useState<ShipProductOption[]>([])
  const [loading, setLoading] = useState(true)

  // ── フォーム状態 ──────────────────────────────────────────
  const [shippingNo,       setShippingNo]       = useState('')
  const [shippingNoChecking, setShippingNoChecking] = useState(false)
  const [customerId,    setCustomerId]    = useState('')
  const [shippingDate,  setShippingDate]  = useState(() => {
    const d = new Date()
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
  })
  const [note,    setNote]    = useState('')
  const [lines,   setLines]   = useState<LineState[]>([emptyLine(`${uid}-0`)])
  const [errors,  setErrors]  = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [newCode,    setNewCode]    = useState('')

  // ── 手動引当モーダル ──────────────────────────────────────
  const [manualUid,        setManualUid]        = useState<string | null>(null)
  const [manualInventory,  setManualInventory]  = useState<InventoryLine[]>([])
  const [manualLoading,    setManualLoading]    = useState(false)

  // ── 初期データ読み込み（出庫指示番号の採番も並列で実行） ──────
  useEffect(() => {
    if (!scope) { setLoading(false); return }
    Promise.all([
      fetchCustomerOptions(scope.tenantId),
      fetchShipProductOptions(scope.tenantId),
      generateShippingNo(scope),
    ]).then(([cust, prod, no]) => {
      if (cust.data) setCustomers(cust.data)
      if (prod.data) setProducts(prod.data)
      setShippingNo(no)
      setLoading(false)
    })
  }, [scope])

  // ── ライン操作 ────────────────────────────────────────────
  const updateLine = useCallback((uid: string, patch: Partial<LineState>) => {
    setLines((prev) => prev.map((l) => l.uid === uid ? { ...l, ...patch } : l))
    // 更新されたフィールドに関するエラーをクリア
    setErrors((prev) => {
      const next = { ...prev }
      if (patch.requestedQty !== undefined) delete next[`qty_${uid}`]
      if (patch.allocations  !== undefined) delete next[`alloc_${uid}`]
      return next
    })
  }, [])

  const removeLine = useCallback((uid: string) => {
    setLines((prev) => prev.filter((l) => l.uid !== uid))
  }, [])

  const addLine = () =>
    setLines((prev) => [...prev, emptyLine(`${uid}-${Date.now()}`)])

  // ── FIFO 自動引当 ─────────────────────────────────────────
  const handleRunFifo = useCallback(async (uid: string) => {
    const line = lines.find((l) => l.uid === uid)
    if (!line) return
    const qty = Number(line.requestedQty)
    if (!qty || qty <= 0) return

    if (!scope) return
    const { data, error } = await fetchInventoryForProduct(line.productId, scope)
    if (error || !data) return

    // available 在庫がゼロの場合（hold / damaged は除外済みのため在庫なし扱い）
    if (data.length === 0) {
      updateLine(uid, { allocations: [], allocationMode: 'fifo' })
      return
    }

    const allocs = computeFifoAllocation(data, qty)
    updateLine(uid, { allocations: allocs, allocationMode: 'fifo' })
  }, [lines, updateLine])

  // ── 手動引当モーダルを開く ────────────────────────────────
  // 手動引当は hold / damaged も表示（担当者が意図的に選択できる）
  const handleOpenManual = useCallback(async (uid: string) => {
    const line = lines.find((l) => l.uid === uid)
    if (!line) return

    setManualUid(uid)
    setManualLoading(true)
    const { data } = await fetchInventoryForManualAllocation(line.productId, scope ?? { tenantId: '', warehouseId: '' })
    setManualInventory(data ?? [])
    setManualLoading(false)
  }, [lines])

  const handleManualConfirm = (items: AllocationItem[]) => {
    if (manualUid) {
      updateLine(manualUid, { allocations: items, allocationMode: 'manual' })
    }
    setManualUid(null)
    setManualInventory([])
  }

  // ── 出庫指示番号の重複チェック（blur時） ─────────────────────
  const handleShippingNoBlur = async () => {
    const no = shippingNo.trim()
    if (!no || !scope) return
    setShippingNoChecking(true)
    const exists = await checkShippingNoExists(no, scope.tenantId)
    setShippingNoChecking(false)
    if (exists) {
      setErrors((prev) => ({ ...prev, shippingNo: t('errShippingNoDup') }))
    } else {
      setErrors((prev) => { const next = { ...prev }; delete next.shippingNo; return next })
    }
  }

  // ── バリデーション ────────────────────────────────────────
  const validate = (): boolean => {
    const errs: FormErrors = {}

    // 出庫指示番号
    if (!shippingNo.trim()) errs.shippingNo = t('errShippingNo')
    // 重複エラーが既にセットされていれば引き継ぐ
    else if (errors.shippingNo) errs.shippingNo = errors.shippingNo

    if (!customerId)    errs.customerId    = t('errCustomer')
    if (!shippingDate)  errs.shippingDate  = t('errDate')

    const validLines = lines.filter((l) => l.productId)
    if (validLines.length === 0) errs.items = t('errItems')

    validLines.forEach((l) => {
      const qty = Number(l.requestedQty)
      if (!l.requestedQty || isNaN(qty) || qty <= 0) {
        errs[`qty_${l.uid}`] = t('errQty')
      }
      if (l.allocationMode === 'none') {
        errs[`alloc_${l.uid}`] = t('errNoAllocation')
      }
    })

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── 登録 ─────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate() || !scope) return
    setSubmitting(true)

    // submit 直前にも重複チェック（フォームを離れずに送信した場合の安全網）
    const dupExists = await checkShippingNoExists(shippingNo.trim(), scope.tenantId)
    if (dupExists) {
      setErrors((prev) => ({ ...prev, shippingNo: t('errShippingNoDup') }))
      setSubmitting(false)
      return
    }

    const validLines = lines.filter((l) => l.productId)

    const { error } = await createShippingOrder({
      shippingNo: shippingNo.trim(),
      shippingDate,
      customerId,
      memo: note.trim() || undefined,
      lines: validLines.map((l, i) => ({
        lineNo:       i + 1,
        productId:    l.productId,
        requestedQty: Number(l.requestedQty),
        allocations:  l.allocations.map((a) => ({
          inventoryId:  a.inventoryId,
          allocatedQty: a.allocatedQty,
        })),
      })),
      scope,
    })

    setSubmitting(false)

    if (error) {
      setErrors({ _submit: error })
      return
    }

    setNewCode(shippingNo)
    setSubmitted(true)
  }

  // ── スコープ未選択 ───────────────────────────────────────
  if (!scope) return <ScopeRequired />

  // ── 登録完了画面 ─────────────────────────────────────────
  if (submitted) {
    return (
      <div className="max-w-screen-xl">
        <div className="bg-white rounded-lg border border-slate-200 p-12 flex flex-col items-center gap-4 text-center">
          <CheckCircle size={48} className="text-green-500" />
          <h3 className="text-base font-semibold text-slate-800">{t('successTitle')}</h3>
          <p className="text-sm text-slate-500">
            {t('successSubtitle')}{' '}
            <span className="font-mono font-bold text-slate-700">{newCode}</span>
          </p>
          <p className="text-xs text-slate-400">{t('successNote')}</p>
          <div className="flex flex-col sm:flex-row gap-3 mt-3 w-full sm:w-auto">
            <button
              onClick={async () => {
                const d = new Date()
                setCustomerId('')
                setShippingDate([d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'))
                setNote('')
                setLines([emptyLine(`${uid}-reset`)])
                setErrors({})
                setSubmitted(false)
                // 次の出庫指示番号を採番して自動セット
                if (scope) {
                  const nextNo = await generateShippingNo(scope)
                  setShippingNo(nextNo)
                }
              }}
              className="px-4 py-2.5 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
            >
              {t('continueBtn')}
            </button>
            <button
              onClick={() => router.push('/shipping')}
              className="px-4 py-2.5 text-sm bg-brand-navy text-white rounded-md hover:bg-brand-navy-mid transition-colors font-medium"
            >
              {t('toMenuBtn')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-slate-400">
        読み込み中...
      </div>
    )
  }

  const currentManualLine = manualUid ? lines.find((l) => l.uid === manualUid) : null

  // ── 登録フォーム ─────────────────────────────────────────
  return (
    <>
      <div className="max-w-screen-xl space-y-5">
        {/* ページヘッダー */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/shipping')}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{t('title')}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{t('subtitle')}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-6">
          {/* 出庫指示番号 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {t('shippingNoLabel')} <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={shippingNo}
                onChange={(e) => {
                  setShippingNo(e.target.value)
                  setErrors((prev) => { const next = { ...prev }; delete next.shippingNo; return next })
                }}
                onBlur={handleShippingNoBlur}
                placeholder={t('shippingNoPlaceholder')}
                className={`w-full sm:w-72 border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-teal ${
                  errors.shippingNo ? 'border-red-400 bg-red-50' : 'border-slate-300'
                }`}
              />
              {shippingNoChecking && (
                <span className="text-xs text-slate-400 whitespace-nowrap">確認中...</span>
              )}
            </div>
            {errors.shippingNo && (
              <p className="flex items-center gap-1 text-xs text-red-500 mt-1">
                <AlertCircle size={11} /> {errors.shippingNo}
              </p>
            )}
          </div>

          {/* 出荷先 / 出庫予定日 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {t('customer')} <span className="text-red-500">*</span>
              </label>
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value)
                  setErrors((prev) => ({ ...prev, customerId: undefined }))
                }}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
              >
                <option value="">{t('customerPlaceholder')}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}　{c.name}
                  </option>
                ))}
              </select>
              {errors.customerId && (
                <p className="text-xs text-red-500 mt-1">{errors.customerId}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                {t('requestedDate')} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={shippingDate}
                onChange={(e) => {
                  setShippingDate(e.target.value)
                  setErrors((prev) => ({ ...prev, shippingDate: undefined }))
                }}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              />
              {errors.shippingDate && (
                <p className="text-xs text-red-500 mt-1">{errors.shippingDate}</p>
              )}
            </div>
          </div>

          {/* 商品明細 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">
                {t('itemsLabel')} <span className="text-red-500">*</span>
              </label>
              {errors.items && (
                <p className="text-xs text-red-500">{errors.items}</p>
              )}
            </div>

            <div className="space-y-3">
              {lines.map((line) => (
                <LineRow
                  key={line.uid}
                  line={line}
                  products={products}
                  errors={errors}
                  onUpdate={updateLine}
                  onRemove={removeLine}
                  canRemove={lines.length > 1}
                  onOpenManual={handleOpenManual}
                  onRunFifo={handleRunFifo}
                  t={t}
                  tc={tc}
                />
              ))}
            </div>

            <button
              onClick={addLine}
              className="mt-3 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus size={13} /> {tc('addProduct')}
            </button>
          </div>

          {/* 備考 */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              {tc('note')}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={t('notePlaceholder')}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"
            />
          </div>

          {/* 送信エラー */}
          {errors._submit && (
            <p className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <AlertCircle size={14} /> {errors._submit}
            </p>
          )}

          {/* フッター */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              onClick={() => router.push('/shipping')}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              {tc('cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid disabled:opacity-50 transition-colors font-medium"
            >
              {submitting ? '登録中...' : t('submitBtn')}
            </button>
          </div>
        </div>
      </div>

      {/* 手動引当モーダル */}
      {manualUid && currentManualLine && !manualLoading && (
        <ManualAllocationModal
          productName={currentManualLine.productName}
          requestedQty={Number(currentManualLine.requestedQty)}
          inventoryLines={manualInventory}
          initial={currentManualLine.allocations}
          onConfirm={handleManualConfirm}
          onClose={() => { setManualUid(null); setManualInventory([]) }}
          t={t}
        />
      )}
      {manualLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg px-6 py-4 text-sm text-slate-600">在庫データを取得中...</div>
        </div>
      )}
    </>
  )
}
