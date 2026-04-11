'use client'

import { useState, useMemo, useEffect, useCallback, useId } from 'react'
import { Plus, Trash2, ClipboardList, Loader2, AlertCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import { useTranslation } from '@/lib/i18n'
import {
  type ArrivalStatus,
  ARRIVAL_STATUS_CONFIG,
} from '@/lib/types'
import {
  type ArrivalGroup,
  type ArrivalLineItem,
  type SupplierOption,
  type ProductOption,
  type LocationOption,
  fetchArrivalGroups,
  fetchSupplierOptions,
  fetchProductOptions,
  fetchLocationOptions,
  generateArrivalNo,
  createArrivalBatch,
} from '@/lib/supabase/queries/arrivals'
import { todayIso } from '@/lib/utils'

// =============================================================
// ステータスバッジ
// =============================================================

const FALLBACK_ARRIVAL_CFG = {
  badgeClass: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
}

function ArrivalStatusBadge({ status }: { status: ArrivalStatus }) {
  const { t } = useTranslation('status')
  const cfg = ARRIVAL_STATUS_CONFIG[status] ?? FALLBACK_ARRIVAL_CFG
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cfg.badgeClass}`}>
      {t(`arrival_${status}` as Parameters<typeof t>[0])}
    </span>
  )
}

// =============================================================
// 入荷予定登録フォーム（モーダル内）
// =============================================================

interface FormItemRow {
  uid:         string
  productId:   string
  scheduledQty: string
  locationId:  string
}

type FormErrors = Partial<Record<string, string>>

function emptyRow(uid: string): FormItemRow {
  return { uid, productId: '', scheduledQty: '', locationId: '' }
}

function ArrivalCreateModal({
  suppliers,
  products,
  locations,
  onClose,
  onCreated,
}: {
  suppliers: SupplierOption[]
  products:  ProductOption[]
  locations: LocationOption[]
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
      if (!r.locationId) {
        errs[`loc_${r.uid}`] = t('errLocation')
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
      const arrivalNo = await generateArrivalNo()
      const validRows = rows.filter((r) => r.productId)

      const { error } = await createArrivalBatch({
        arrivalNo,
        supplierId,
        arrivalDate: scheduledDate,  // YYYY-MM-DD のまま渡す
        memo:        note.trim() || undefined,
        items: validRows.map((r) => ({
          productId:         r.productId,
          plannedQty:        Number(r.scheduledQty),
          plannedLocationId: r.locationId || null,
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
              <div className="grid grid-cols-[1fr_100px_140px_32px] gap-0 bg-slate-50 border-b border-slate-200 px-3 py-2">
                <span className="text-xs font-medium text-slate-500">{t('product')}</span>
                <span className="text-xs font-medium text-slate-500 text-right pr-2">{t('scheduledQty')}</span>
                <span className="text-xs font-medium text-slate-500 pl-2">{t('location')}</span>
                <span />
              </div>

              {/* 明細行 */}
              <div className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const product = selectedProduct(row.productId)
                  return (
                    <div
                      key={row.uid}
                      className="grid grid-cols-[1fr_100px_140px_32px] gap-0 items-start px-3 py-2.5"
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

                      {/* 保管予定場所（ドロップダウン） */}
                      <div className="pl-2">
                        <select
                          value={row.locationId}
                          onChange={(e) => updateRow(row.uid, 'locationId', e.target.value)}
                          className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                        >
                          <option value="">-- 選択 --</option>
                          {locations.map((l) => (
                            <option key={l.id} value={l.id}>{l.code}</option>
                          ))}
                        </select>
                        {errors[`loc_${row.uid}`] && (
                          <p className="text-[10px] text-red-500 mt-0.5">
                            {errors[`loc_${row.uid}`]}
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
}: {
  group:   ArrivalGroup
  onClose: () => void
}) {
  const { t }  = useTranslation('arrival')
  const { t: tc } = useTranslation('common')

  const totalScheduled = group.lines.reduce((s, i) => s + i.scheduledQty, 0)
  const totalReceived  = group.lines.reduce((s, i) => s + i.receivedQty,  0)

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
                      {item.locationCode || <span className="text-red-400">未設定</span>}
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
      </div>
    </Modal>
  )
}

// =============================================================
// メインページ
// =============================================================

export default function ArrivalPage() {
  const { t }  = useTranslation('arrival')
  const { t: tc } = useTranslation('common')

  const [groups,       setGroups]       = useState<ArrivalGroup[]>([])
  const [suppliers,    setSuppliers]    = useState<SupplierOption[]>([])
  const [products,     setProducts]     = useState<ProductOption[]>([])
  const [locations,    setLocations]    = useState<LocationOption[]>([])
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState<string | null>(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [detailGroup,     setDetailGroup]     = useState<ArrivalGroup | null>(null)
  const [search,          setSearch]          = useState('')
  const [statusFilter,    setStatusFilter]    = useState<ArrivalStatus | 'all'>('all')

  // ── データ取得 ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    setFetchError(null)

    const [arrivals, suppliersRes, productsRes, locationsRes] = await Promise.all([
      fetchArrivalGroups(),
      fetchSupplierOptions(),
      fetchProductOptions(),
      fetchLocationOptions(),
    ])

    if (arrivals.error) {
      setFetchError(arrivals.error)
    } else {
      setGroups(arrivals.data)
    }
    setSuppliers(suppliersRes.data)
    setProducts(productsRes.data)
    setLocations(locationsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // 登録後は一覧をバックグラウンド再取得（ローダー表示なし）
  const handleCreated = useCallback(async () => {
    const { data, error } = await fetchArrivalGroups()
    if (!error) setGroups(data)
  }, [])

  const statusFilterOptions: { value: ArrivalStatus | 'all'; label: string }[] = [
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

  // ── ローディング ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-screen-xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{t('title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 flex items-center justify-center py-24 gap-3 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">{tc('loading')}</span>
        </div>
      </div>
    )
  }

  // ── フェッチエラー ────────────────────────────────────────
  if (fetchError) {
    return (
      <div className="max-w-screen-xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{t('title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="bg-white rounded-lg border border-red-200 flex items-start gap-3 px-6 py-8 text-red-600">
          <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">データの取得に失敗しました</p>
            <p className="text-xs mt-1 text-red-400 font-mono">{fetchError}</p>
            <button
              onClick={loadAll}
              className="mt-3 text-xs text-red-600 underline hover:no-underline"
            >
              再試行
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── メイン描画 ────────────────────────────────────────────
  return (
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
            onChange={setSearch}
            placeholder={t('searchPlaceholder')}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ArrivalStatus | 'all')}
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
            <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
              <ClipboardList size={28} />
              <p className="text-sm">{t('empty')}</p>
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
                  <ArrivalStatusBadge status={group.status} />
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <ClipboardList size={28} />
                      <p className="text-sm">{t('empty')}</p>
                    </div>
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
          locations={locations}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
      {detailGroup && (
        <ArrivalDetailModal
          group={detailGroup}
          onClose={() => setDetailGroup(null)}
        />
      )}
    </div>
  )
}
