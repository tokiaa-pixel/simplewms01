'use client'

import { useState, useMemo, useEffect, useCallback, useId } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Plus, Trash2, ClipboardList, Loader2, AlertCircle, Pencil } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import StatusBadge from '@/components/ui/StatusBadge'
import PageShell from '@/components/ui/PageShell'
import EmptyState from '@/components/ui/EmptyState'
import { useTranslation } from '@/lib/i18n'
import {
  type ArrivalStatus,
  type QueryScope,
  ARRIVAL_STATUS_CONFIG,
} from '@/lib/types'
import {
  type ArrivalGroup,
  type ArrivalLineItem,
  type SupplierOption,
  type ProductOption,
  type EditLineInput,
  fetchArrivalGroups,
  fetchSupplierOptions,
  fetchProductOptions,
  generateArrivalNo,
  createArrivalBatch,
  updateArrival,
} from '@/lib/supabase/queries/arrivals'
import { useTenant } from '@/store/TenantContext'
import ScopeRequired from '@/components/ui/ScopeRequired'
import { todayIso } from '@/lib/utils'

// =============================================================
// ステータスバッジ（StatusBadge の入荷専用アダプタ）
// =============================================================

const FALLBACK_ARRIVAL_CFG = { badgeClass: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' }

function ArrivalStatusBadge({ status }: { status: ArrivalStatus }) {
  const { t } = useTranslation('status')
  const cfg = ARRIVAL_STATUS_CONFIG[status] ?? FALLBACK_ARRIVAL_CFG
  return (
    <StatusBadge
      label={t(`arrival_${status}` as Parameters<typeof t>[0])}
      badgeClass={cfg.badgeClass}
    />
  )
}

// =============================================================
// 入荷予定登録フォーム（モーダル内）
// =============================================================

interface FormItemRow {
  uid:          string
  productId:    string
  scheduledQty: string
}

type FormErrors = Partial<Record<string, string>>

function emptyRow(uid: string): FormItemRow {
  return { uid, productId: '', scheduledQty: '' }
}

function ArrivalCreateModal({
  suppliers,
  products,
  onClose,
  onCreated,
}: {
  suppliers: SupplierOption[]
  products:  ProductOption[]
  onClose:   () => void
  onCreated: () => void
}) {
  const uid = useId()
  const { t }  = useTranslation('arrival')
  const { t: tc } = useTranslation('common')

  const [supplierId,     setSupplierId]     = useState('')
  const [scheduledDate,  setScheduledDate]  = useState(todayIso())
  const [note,           setNote]           = useState('')
  const [rows,           setRows]           = useState<FormItemRow[]>([emptyRow(`${uid}-0`)])
  const [errors,         setErrors]         = useState<FormErrors>({})
  const [submitting,     setSubmitting]     = useState(false)
  const [submitError,    setSubmitError]    = useState('')
  const { scope } = useTenant()

  const validate = (): boolean => {
    const errs: FormErrors = {}
    if (!supplierId)    errs.supplierId    = t('errSupplier')
    if (!scheduledDate) errs.scheduledDate = t('errDate')

    const validRows = rows.filter((r) => r.productId)
    if (validRows.length === 0) errs.items = t('errItems')

    validRows.forEach((r) => {
      const qty = Number(r.scheduledQty)
      if (!r.scheduledQty || isNaN(qty) || qty <= 0) {
        errs[`qty_${r.uid}`] = t('errQty')
      }
    })

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return

    setSubmitting(true)
    setSubmitError('')

    try {
      if (!scope) { setSubmitError('荷主・倉庫が選択されていません'); setSubmitting(false); return }
      const arrivalNo = await generateArrivalNo(scope)
      const validRows = rows.filter((r) => r.productId)

      const { error } = await createArrivalBatch({
        arrivalNo,
        supplierId,
        arrivalDate: scheduledDate,  // YYYY-MM-DD のまま渡す
        memo:        note.trim() || undefined,
        scope,
        items: validRows.map((r) => ({
          productId:  r.productId,
          plannedQty: Number(r.scheduledQty),
          // 保管場所は入庫処理時に選択するため、ここでは設定しない
        })),
      })

      if (error) {
        setSubmitError(error)
        setSubmitting(false)
        return
      }

      onCreated()
      onClose()
    } catch {
      setSubmitError('登録に失敗しました。もう一度お試しください。')
      setSubmitting(false)
    }
  }

  const addRow = () =>
    setRows((prev) => [...prev, emptyRow(`${uid}-${Date.now()}`)])

  const removeRow = (uid: string) =>
    setRows((prev) => prev.filter((r) => r.uid !== uid))

  const updateRow = (uid: string, field: keyof FormItemRow, value: string) =>
    setRows((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, [field]: value } : r))
    )

  const selectedProduct = (id: string) => products.find((p) => p.id === id)

  return (
    <Modal title={t('modalCreateTitle')} onClose={onClose} size="lg" locked={submitting}>
      <div className="space-y-5">

        {/* 仕入先 / 入荷予定日 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {t('supplier')} <span className="text-red-500">*</span>
            </label>
            <select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value)
                setErrors((prev) => ({ ...prev, supplierId: undefined }))
              }}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
            >
              <option value="">{t('supplierPlaceholder')}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
              ))}
            </select>
            {errors.supplierId && (
              <p className="text-xs text-red-500 mt-1">{errors.supplierId}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {t('scheduledDate')} <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => {
                setScheduledDate(e.target.value)
                setErrors((prev) => ({ ...prev, scheduledDate: undefined }))
              }}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
            />
            {errors.scheduledDate && (
              <p className="text-xs text-red-500 mt-1">{errors.scheduledDate}</p>
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

          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <div className="min-w-[480px]">
              {/* テーブルヘッダー */}
              <div className="grid grid-cols-[1fr_120px_32px] gap-0 bg-slate-50 border-b border-slate-200 px-3 py-2">
                <span className="text-xs font-medium text-slate-500">{t('product')}</span>
                <span className="text-xs font-medium text-slate-500 text-right pr-2">{t('scheduledQty')}</span>
                <span />
              </div>

              {/* 明細行 */}
              <div className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const product = selectedProduct(row.productId)
                  return (
                    <div
                      key={row.uid}
                      className="grid grid-cols-[1fr_120px_32px] gap-0 items-start px-3 py-2.5"
                    >
                      {/* 商品選択 */}
                      <div className="pr-2 space-y-1">
                        <select
                          value={row.productId}
                          onChange={(e) => updateRow(row.uid, 'productId', e.target.value)}
                          className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                        >
                          <option value="">{t('productPlaceholder')}</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} - {p.name}
                            </option>
                          ))}
                        </select>
                        {product && (
                          <p className="text-[10px] text-slate-400 pl-1">
                            {product.unit}
                          </p>
                        )}
                      </div>

                      {/* 予定数量 */}
                      <div className="pr-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={row.scheduledQty}
                            onChange={(e) =>
                              updateRow(row.uid, 'scheduledQty', e.target.value)
                            }
                            placeholder="0"
                            className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-brand-teal"
                          />
                          {product && (
                            <span className="text-[10px] text-slate-400 whitespace-nowrap">
                              {product.unit}
                            </span>
                          )}
                        </div>
                        {errors[`qty_${row.uid}`] && (
                          <p className="text-[10px] text-red-500 mt-0.5">
                            {errors[`qty_${row.uid}`]}
                          </p>
                        )}
                      </div>

                      {/* 削除ボタン */}
                      <div className="flex justify-center pt-1">
                        <button
                          onClick={() => removeRow(row.uid)}
                          disabled={rows.length === 1}
                          className="p-1 text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          aria-label="Delete row"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 行追加ボタン */}
              <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/50">
                <button
                  onClick={addRow}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus size={13} />
                  {tc('addProduct')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 備考 */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
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
        {submitError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 flex items-center gap-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            {submitError}
          </p>
        )}

        {/* フッターボタン */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {tc('cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {tc('save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// =============================================================
// 入荷予定詳細モーダル
// =============================================================

function ArrivalDetailModal({
  group,
  onClose,
  onEdit,
}: {
  group:   ArrivalGroup
  onClose: () => void
  onEdit?: () => void
}) {
  const { t }  = useTranslation('arrival')
  const { t: tc } = useTranslation('common')

  const totalScheduled = group.lines.reduce((s, i) => s + i.scheduledQty, 0)
  const totalReceived  = group.lines.reduce((s, i) => s + i.receivedQty,  0)
  const canEdit = group.status === 'pending' && onEdit != null

  return (
    <Modal title={`${t('modalDetailTitle')} - ${group.arrivalNo}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* ヘッダー情報 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {([
            [t('detailCode'),     <span key="code" className="font-mono font-medium">{group.arrivalNo}</span>],
            [t('detailStatus'),   <ArrivalStatusBadge key="badge" status={group.status} />],
            [t('detailSupplier'), group.supplierName],
            [t('detailDate'),     group.arrivalDate],
            [t('detailCreated'),  group.createdAt],
            [t('detailProgress'), `${totalReceived} / ${totalScheduled} ${tc('pieces')}`],
          ] as [string, React.ReactNode][]).map(([label, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <dt className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-slate-800">{value}</dd>
            </div>
          ))}
        </div>

        {group.memo && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
            {group.memo}
          </div>
        )}

        {/* 明細テーブル */}
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[460px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblProductCode')}</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblProductName')}</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblLocation')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblScheduled')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblReceived')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblRemaining')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {group.lines.map((item: ArrivalLineItem) => {
                const remaining = item.scheduledQty - item.receivedQty
                const isDone    = remaining <= 0
                return (
                  <tr key={item.id} className={isDone ? 'bg-green-50/30' : ''}>
                    <td className="px-4 py-3 font-mono text-blue-600">{item.productCode}</td>
                    <td className="px-4 py-3 text-slate-700">{item.productName}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 bg-slate-50">
                      {item.locationCode || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.scheduledQty}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-700 font-medium">
                      {item.receivedQty}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${
                      isDone
                        ? 'text-green-600'
                        : remaining <= 5
                        ? 'text-amber-600'
                        : 'text-slate-700'
                    }`}>
                      {isDone ? '✓' : remaining}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 編集ボタン（未着荷のみ表示） */}
        {canEdit && (
          <div className="flex justify-end pt-2 border-t border-slate-100 mt-2">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-brand-navy border border-brand-navy rounded-md hover:bg-brand-navy hover:text-white transition-colors"
            >
              <Pencil size={12} />
              {tc('edit')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

// =============================================================
// ArrivalEditModal（入荷予定編集）
// =============================================================

interface EditLineRow {
  uid:        string
  productId:  string
  plannedQty: string
  lotNo:      string
  expiryDate: string
  memo:       string
}

function emptyEditRow(uid: string): EditLineRow {
  return { uid, productId: '', plannedQty: '', lotNo: '', expiryDate: '', memo: '' }
}

function ArrivalEditModal({
  group,
  products,
  scope,
  onClose,
  onEdited,
}: {
  group:    ArrivalGroup
  products: ProductOption[]
  scope:    QueryScope
  onClose:  () => void
  onEdited: () => void
}) {
  const uid = useId()
  const { t }  = useTranslation('arrival')
  const { t: tc } = useTranslation('common')

  // ── フォーム初期値：既存データで初期化 ─────────────────────
  const [arrivalDate,  setArrivalDate]  = useState(group.arrivalDateRaw)
  const [note,         setNote]         = useState(group.memo ?? '')
  const [rows,         setRows]         = useState<EditLineRow[]>(() =>
    group.lines.length > 0
      ? group.lines.map((l, i) => ({
          uid:        `${uid}-init-${i}`,
          productId:  l.productId,
          plannedQty: String(l.scheduledQty),
          lotNo:      l.lotNo      ?? '',
          expiryDate: l.expiryDate ?? '',
          memo:       '',
        }))
      : [emptyEditRow(`${uid}-0`)]
  )

  const [errors,      setErrors]      = useState<Record<string, string>>({})
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState('')

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!arrivalDate) errs.arrivalDate = t('errDate')

    const validRows = rows.filter((r) => r.productId)
    if (validRows.length === 0) errs.items = t('errItems')

    validRows.forEach((r) => {
      const qty = Number(r.plannedQty)
      if (!r.plannedQty || isNaN(qty) || qty <= 0) {
        errs[`qty_${r.uid}`] = t('errQty')
      }
      if (r.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(r.expiryDate)) {
        errs[`exp_${r.uid}`] = '有効期限は YYYY-MM-DD 形式で入力してください'
      }
    })

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return

    setSubmitting(true)
    setSubmitError('')

    const validRows = rows.filter((r) => r.productId)
    const lines: EditLineInput[] = validRows.map((r) => ({
      productId:   r.productId,
      plannedQty:  Number(r.plannedQty),
      lotNo:       r.lotNo.trim()      || null,
      expiryDate:  r.expiryDate.trim() || null,
      memo:        r.memo.trim()       || null,
    }))

    const { error } = await updateArrival({
      headerId:          group.id,
      arrivalDate,
      memo:              note.trim() || null,
      expectedUpdatedAt: group.updatedAt,
      lines,
      scope,
    })

    setSubmitting(false)
    if (error) { setSubmitError(error); return }
    onEdited()
    onClose()
  }

  const addRow = () =>
    setRows((prev) => [...prev, emptyEditRow(`${uid}-${Date.now()}`)])

  const removeRow = (uid: string) =>
    setRows((prev) => prev.filter((r) => r.uid !== uid))

  const updateRow = (uid: string, field: keyof EditLineRow, value: string) =>
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, [field]: value } : r)))

  const selectedProduct = (id: string) => products.find((p) => p.id === id)

  return (
    <Modal title={`${t('modalEditTitle')} - ${group.arrivalNo}`} onClose={onClose} size="lg" locked={submitting}>
      <div className="space-y-5">

        {/* 入荷予定番号（読み取り専用） */}
        <div className="text-xs text-slate-500 bg-slate-50 rounded-md px-3 py-2 border border-slate-200">
          <span className="text-slate-400">入荷予定番号: </span>
          <span className="font-mono font-medium text-slate-700">{group.arrivalNo}</span>
          <span className="ml-4 text-slate-400">仕入先: </span>
          <span className="text-slate-700">{group.supplierName}</span>
        </div>

        {/* 入荷予定日 */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {t('scheduledDate')} <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={arrivalDate}
            onChange={(e) => {
              setArrivalDate(e.target.value)
              setErrors((prev) => ({ ...prev, arrivalDate: undefined as unknown as string }))
            }}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
          {errors.arrivalDate && (
            <p className="text-xs text-red-500 mt-1">{errors.arrivalDate}</p>
          )}
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

          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <div className="min-w-[520px]">
              {/* テーブルヘッダー */}
              <div className="grid grid-cols-[1fr_88px_32px] bg-slate-50 border-b border-slate-200 px-3 py-2 gap-0">
                <span className="text-xs font-medium text-slate-500">{t('product')}</span>
                <span className="text-xs font-medium text-slate-500 text-right pr-2">{t('scheduledQty')}</span>
                <span />
              </div>

              {/* 明細行 */}
              <div className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const product = selectedProduct(row.productId)
                  return (
                    <div key={row.uid} className="px-3 py-2.5 space-y-1.5">
                      {/* 1段目: 商品 + 数量 + 削除 */}
                      <div className="grid grid-cols-[1fr_88px_32px] items-start gap-0">
                        <div className="pr-2 space-y-0.5">
                          <select
                            value={row.productId}
                            onChange={(e) => updateRow(row.uid, 'productId', e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                          >
                            <option value="">{t('productPlaceholder')}</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.code} - {p.name}
                              </option>
                            ))}
                          </select>
                          {product && (
                            <p className="text-[10px] text-slate-400 pl-1">{product.unit}</p>
                          )}
                        </div>
                        <div className="pr-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="1"
                              value={row.plannedQty}
                              onChange={(e) => updateRow(row.uid, 'plannedQty', e.target.value)}
                              placeholder="0"
                              className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-brand-teal"
                            />
                            {product && (
                              <span className="text-[10px] text-slate-400 whitespace-nowrap">{product.unit}</span>
                            )}
                          </div>
                          {errors[`qty_${row.uid}`] && (
                            <p className="text-[10px] text-red-500 mt-0.5">{errors[`qty_${row.uid}`]}</p>
                          )}
                        </div>
                        <div className="flex justify-center pt-1">
                          <button
                            onClick={() => removeRow(row.uid)}
                            disabled={rows.length === 1}
                            className="p-1 text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            aria-label="Delete row"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* 2段目: ロット番号・有効期限（任意項目） */}
                      <div className="grid grid-cols-2 gap-2 pl-0 pr-8">
                        <div>
                          <input
                            type="text"
                            value={row.lotNo}
                            onChange={(e) => updateRow(row.uid, 'lotNo', e.target.value)}
                            placeholder={t('lotNoPlaceholder')}
                            className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal text-slate-600 placeholder:text-slate-300"
                          />
                        </div>
                        <div>
                          <input
                            type="date"
                            value={row.expiryDate}
                            onChange={(e) => updateRow(row.uid, 'expiryDate', e.target.value)}
                            placeholder={t('expiryDatePlaceholder')}
                            className="w-full border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal text-slate-600"
                          />
                          {errors[`exp_${row.uid}`] && (
                            <p className="text-[10px] text-red-500 mt-0.5">{errors[`exp_${row.uid}`]}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 行追加ボタン */}
              <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/50">
                <button
                  onClick={addRow}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus size={13} />
                  {tc('addProduct')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 備考 */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
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
        {submitError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 flex items-center gap-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            {submitError}
          </p>
        )}

        {/* フッターボタン */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {tc('cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {tc('save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// =============================================================
// メインページ
// =============================================================

// arrival の有効な status 値
const ARRIVAL_FILTER_VALUES = ['all', 'pending', 'partial', 'completed', 'cancelled'] as const
type ArrivalFilterValue = typeof ARRIVAL_FILTER_VALUES[number]

export default function ArrivalPage() {
  const { t }  = useTranslation('arrival')
  const { t: tc } = useTranslation('common')
  const { scope } = useTenant()

  // ── URL params ─────────────────────────────────────────────
  const searchParams = useSearchParams()
  const router = useRouter()

  const [groups,       setGroups]       = useState<ArrivalGroup[]>([])
  const [suppliers,    setSuppliers]    = useState<SupplierOption[]>([])
  const [products,     setProducts]     = useState<ProductOption[]>([])
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState<string | null>(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [detailGroup,     setDetailGroup]     = useState<ArrivalGroup | null>(null)
  const [editTarget,      setEditTarget]      = useState<ArrivalGroup | null>(null)
  // URL params から初期値を読む（不正値はデフォルトにフォールバック）
  const [search,       setSearch]       = useState(() => searchParams.get('q') ?? '')
  const [statusFilter, setStatusFilter] = useState<ArrivalFilterValue>(() => {
    const raw = searchParams.get('status')
    return (ARRIVAL_FILTER_VALUES as readonly string[]).includes(raw ?? '') ? raw as ArrivalFilterValue : 'all'
  })

  // ── URL 更新ヘルパー（history を積まない replace）──────────
  const pushParams = useCallback((q: string, status: ArrivalFilterValue) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (status !== 'all') p.set('status', status)
    const qs = p.toString()
    router.replace(`/arrival${qs ? `?${qs}` : ''}`)
  }, [router])

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val)
    pushParams(val, statusFilter)
  }, [statusFilter, pushParams])

  const handleStatusChange = useCallback((val: ArrivalFilterValue) => {
    setStatusFilter(val)
    pushParams(search, val)
  }, [search, pushParams])

  // ── データ取得 ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!scope) { setLoading(false); return }
    setLoading(true)
    setFetchError(null)

    const [arrivals, suppliersRes, productsRes] = await Promise.all([
      fetchArrivalGroups(scope),
      fetchSupplierOptions(scope.tenantId),
      fetchProductOptions(scope.tenantId),
    ])

    if (arrivals.error) {
      setFetchError(arrivals.error)
    } else {
      setGroups(arrivals.data)
    }
    setSuppliers(suppliersRes.data)
    setProducts(productsRes.data)
    setLoading(false)
  }, [scope])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 登録後は一覧をバックグラウンド再取得（ローダー表示なし）
  const handleCreated = useCallback(async () => {
    if (!scope) return
    const { data, error } = await fetchArrivalGroups(scope)
    if (!error) setGroups(data)
  }, [scope])

  // 編集後: 詳細モーダルも閉じてから再取得
  const handleEdited = useCallback(async () => {
    setEditTarget(null)
    setDetailGroup(null)
    if (!scope) return
    const { data, error } = await fetchArrivalGroups(scope)
    if (!error) setGroups(data)
  }, [scope])

  const statusFilterOptions: { value: ArrivalFilterValue; label: string }[] = [
    { value: 'all',       label: t('filterAll') },
    { value: 'pending',   label: t('filterPending') },
    { value: 'partial',   label: t('filterPartial') },
    { value: 'completed', label: t('filterCompleted') },
    { value: 'cancelled', label: t('filterCancelled') },
  ]

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups.filter((g) => {
      const matchSearch =
        !q ||
        g.arrivalNo.toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q)
      const matchStatus = statusFilter === 'all' || g.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [groups, search, statusFilter])

  if (!scope) return <ScopeRequired />

  // ── メイン描画 ────────────────────────────────────────────
  return (
  <PageShell
    loading={loading}
    error={fetchError}
    onRetry={loadAll}
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
        {/* アクションバー */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={handleSearchChange}
            placeholder={t('searchPlaceholder')}
          />

          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value as ArrivalFilterValue)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white text-slate-700"
          >
            {statusFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <span className="text-xs text-slate-500">
            {tc('total')} <strong className="text-slate-700">{filtered.length}</strong> {tc('countUnit')}
          </span>

          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-2 px-4 py-2.5 sm:py-1.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors"
          >
            <Plus size={15} />
            {tc('newRecord')}
          </button>
        </div>

        {/* モバイル：カード表示 */}
        <div className="sm:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12">
              <EmptyState icon={<ClipboardList size={28} />} message={t('empty')} />
            </div>
          ) : (
            filtered.map((group) => (
              <div
                key={group.arrivalNo}
                onClick={() => setDetailGroup(group)}
                className="px-4 py-4 active:bg-blue-50/70 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs text-blue-600 font-medium">{group.arrivalNo}</span>
                  <div className="flex items-center gap-2">
                    {group.status === 'pending' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditTarget(group) }}
                        className="p-1 text-slate-400 hover:text-brand-navy transition-colors"
                        title={t('modalEditTitle')}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    <ArrivalStatusBadge status={group.status} />
                  </div>
                </div>
                <p className="text-sm font-medium text-slate-700 mb-1">{group.supplierName}</p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{group.arrivalDate}</span>
                  <span>{group.lines.length} {tc('itemUnit')}</span>
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
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colCode')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t('colSupplier')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colDate')}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colItems')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colStatus')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('detailCreated')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colAction')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <EmptyState icon={<ClipboardList size={28} />} message={t('empty')} />
                  </td>
                </tr>
              ) : (
                filtered.map((group) => (
                  <tr
                    key={group.arrivalNo}
                    onClick={() => setDetailGroup(group)}
                    className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-blue-600 font-medium">{group.arrivalNo}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{group.supplierName}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">{group.arrivalDate}</td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                      {group.lines.length}
                      <span className="text-xs text-slate-400 ml-1">{tc('itemUnit')}</span>
                    </td>
                    <td className="px-4 py-3">
                      <ArrivalStatusBadge status={group.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{group.createdAt}</td>
                    <td className="px-4 py-3">
                      {group.status === 'pending' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditTarget(group) }}
                          title={t('modalEditTitle')}
                          className="p-1 text-slate-400 hover:text-brand-navy transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* モーダル */}
      {showCreateModal && (
        <ArrivalCreateModal
          suppliers={suppliers}
          products={products}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
      {detailGroup && !editTarget && (
        <ArrivalDetailModal
          group={detailGroup}
          onClose={() => setDetailGroup(null)}
          onEdit={() => { setEditTarget(detailGroup) }}
        />
      )}
      {editTarget && scope && (
        <ArrivalEditModal
          group={editTarget}
          products={products}
          scope={scope}
          onClose={() => setEditTarget(null)}
          onEdited={handleEdited}
        />
      )}
    </div>
  </PageShell>
  )
}
