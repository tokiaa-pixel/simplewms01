'use client'

import { useState, useMemo, useId } from 'react'
import { Plus, Trash2, ClipboardList } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import { useWms } from '@/store/WmsContext'
import {
  type ArrivalSchedule,
  type ArrivalScheduleItem,
  type ArrivalStatus,
  ARRIVAL_STATUS_CONFIG,
} from '@/lib/types'
import { todayIso, toDisplayDate } from '@/lib/utils'

// ─── ユーティリティ ────────────────────────────────────────────

/** 次の入荷予定番号を生成 */
function generateCode(schedules: ArrivalSchedule[]): string {
  const year = new Date().getFullYear()
  const count = schedules.filter((s) =>
    s.code.startsWith(`ARR-${year}-`)
  ).length
  return `ARR-${year}-${String(count + 1).padStart(4, '0')}`
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

// ─── 入荷予定登録フォーム（モーダル内） ──────────────────────

interface FormItemRow {
  uid: string
  productCode: string
  scheduledQuantity: string
  locationCode: string
}

type FormErrors = Partial<Record<string, string>>

function emptyRow(uid: string): FormItemRow {
  return { uid, productCode: '', scheduledQuantity: '', locationCode: '' }
}

function ArrivalCreateModal({ onClose }: { onClose: () => void }) {
  const { addArrival, state } = useWms()
  const { suppliers, masterProducts } = state
  const uid = useId()

  const [supplierId, setSupplierId] = useState('')
  const [scheduledDate, setScheduledDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<FormItemRow[]>([emptyRow(`${uid}-0`)])
  const [errors, setErrors] = useState<FormErrors>({})

  // バリデーション
  const validate = (): boolean => {
    const errs: FormErrors = {}
    if (!supplierId) errs.supplierId = '仕入先を選択してください'
    if (!scheduledDate) errs.scheduledDate = '入荷予定日を入力してください'

    const validRows = rows.filter((r) => r.productCode)
    if (validRows.length === 0) errs.items = '商品を1件以上追加してください'

    validRows.forEach((r) => {
      const qty = Number(r.scheduledQuantity)
      if (!r.scheduledQuantity || isNaN(qty) || qty <= 0) {
        errs[`qty_${r.uid}`] = '1以上の数量を入力してください'
      }
      if (!r.locationCode.trim()) {
        errs[`loc_${r.uid}`] = '保管予定場所を入力してください'
      }
    })

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return

    const supplier = suppliers.find((s) => s.id === supplierId)!
    const validRows = rows.filter((r) => r.productCode)

    const items: ArrivalScheduleItem[] = validRows.map((r, i) => {
      const product = masterProducts.find((p) => p.code === r.productCode)
      return {
        id: `${Date.now()}-${i}`,
        productCode: r.productCode,
        productName: product?.name ?? r.productCode,
        scheduledQuantity: Number(r.scheduledQuantity),
        receivedQuantity: 0,
        locationCode: r.locationCode.trim().toUpperCase(),
      }
    })

    const now = toDisplayDate(todayIso())
    const newSchedule: ArrivalSchedule = {
      id: `arr-${Date.now()}`,
      code: generateCode(state.arrivalSchedules),
      supplierId,
      supplierName: supplier.name,
      scheduledDate: toDisplayDate(scheduledDate),
      status: 'pending',
      items,
      createdAt: now,
      note: note.trim() || undefined,
    }

    addArrival(newSchedule)
    onClose()
  }

  const addRow = () =>
    setRows((prev) => [...prev, emptyRow(`${uid}-${Date.now()}`)])

  const removeRow = (uid: string) =>
    setRows((prev) => prev.filter((r) => r.uid !== uid))

  const updateRow = (uid: string, field: keyof FormItemRow, value: string) =>
    setRows((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, [field]: value } : r))
    )

  const selectedProduct = (code: string) =>
    masterProducts.find((p) => p.code === code)

  return (
    <Modal title="入荷予定登録" onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* 仕入先 / 入荷予定日 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              仕入先 <span className="text-red-500">*</span>
            </label>
            <select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value)
                setErrors((prev) => ({ ...prev, supplierId: undefined }))
              }}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
            >
              <option value="">仕入先を選択...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.supplierId && (
              <p className="text-xs text-red-500 mt-1">{errors.supplierId}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              入荷予定日 <span className="text-red-500">*</span>
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
              商品明細 <span className="text-red-500">*</span>
            </label>
            {errors.items && (
              <p className="text-xs text-red-500">{errors.items}</p>
            )}
          </div>

          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <div className="min-w-[440px]">
            {/* テーブルヘッダー */}
            <div className="grid grid-cols-[1fr_100px_120px_32px] gap-0 bg-slate-50 border-b border-slate-200 px-3 py-2">
              <span className="text-xs font-medium text-slate-500">商品</span>
              <span className="text-xs font-medium text-slate-500 text-right pr-2">予定数量</span>
              <span className="text-xs font-medium text-slate-500 pl-2">保管予定場所</span>
              <span />
            </div>

            {/* 明細行 */}
            <div className="divide-y divide-slate-100">
              {rows.map((row) => {
                const product = selectedProduct(row.productCode)
                return (
                  <div
                    key={row.uid}
                    className="grid grid-cols-[1fr_100px_120px_32px] gap-0 items-start px-3 py-2.5"
                  >
                    {/* 商品選択 */}
                    <div className="pr-2 space-y-1">
                      <select
                        value={row.productCode}
                        onChange={(e) => updateRow(row.uid, 'productCode', e.target.value)}
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                      >
                        <option value="">商品を選択...</option>
                        {masterProducts.map((p) => (
                          <option key={p.code} value={p.code}>
                            {p.code} - {p.name}
                          </option>
                        ))}
                      </select>
                      {product && (
                        <p className="text-[10px] text-slate-400 pl-1">
                          単位: {product.unit} / {product.category}
                        </p>
                      )}
                    </div>

                    {/* 予定数量 */}
                    <div className="pr-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          value={row.scheduledQuantity}
                          onChange={(e) =>
                            updateRow(row.uid, 'scheduledQuantity', e.target.value)
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

                    {/* 保管予定場所 */}
                    <div className="pl-2">
                      <input
                        type="text"
                        value={row.locationCode}
                        onChange={(e) =>
                          updateRow(row.uid, 'locationCode', e.target.value)
                        }
                        placeholder="A-01-01"
                        className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-teal"
                      />
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
                        aria-label="行を削除"
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
                商品を追加
              </button>
            </div>
            </div>{/* min-w end */}
          </div>
        </div>

        {/* 備考 */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            備考
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="特記事項があれば入力..."
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"
          />
        </div>

        {/* フッターボタン */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium"
          >
            登録
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── 入荷予定詳細モーダル ─────────────────────────────────────

function ArrivalDetailModal({
  schedule,
  onClose,
}: {
  schedule: ArrivalSchedule
  onClose: () => void
}) {
  const totalScheduled = schedule.items.reduce(
    (s, i) => s + i.scheduledQuantity,
    0
  )
  const totalReceived = schedule.items.reduce(
    (s, i) => s + i.receivedQuantity,
    0
  )

  return (
    <Modal title={`入荷予定詳細 - ${schedule.code}`} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* ヘッダー情報 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          {[
            ['入荷予定番号', <span className="font-mono font-medium">{schedule.code}</span>],
            ['ステータス', <ArrivalStatusBadge status={schedule.status} />],
            ['仕入先', schedule.supplierName],
            ['入荷予定日', schedule.scheduledDate],
            ['登録日', schedule.createdAt],
            ['進捗', `${totalReceived} / ${totalScheduled} 個`],
          ].map(([label, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <dt className="text-xs text-slate-500 w-24 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-slate-800">{value as React.ReactNode}</dd>
            </div>
          ))}
        </div>

        {schedule.note && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
            {schedule.note}
          </div>
        )}

        {/* 明細テーブル */}
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[460px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">商品コード</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">商品名</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">保管場所</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">予定数量</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">入庫済み</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">残り</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedule.items.map((item) => {
                const remaining = item.scheduledQuantity - item.receivedQuantity
                const isDone = remaining === 0
                return (
                  <tr key={item.id} className={isDone ? 'bg-green-50/30' : ''}>
                    <td className="px-4 py-3 font-mono text-blue-600">{item.productCode}</td>
                    <td className="px-4 py-3 text-slate-700">{item.productName}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 bg-slate-50">
                      {item.locationCode}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.scheduledQuantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-700 font-medium">
                      {item.receivedQuantity}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${
                      isDone ? 'text-green-600' : remaining <= 5 ? 'text-amber-600' : 'text-slate-700'
                    }`}>
                      {isDone ? '完了' : remaining}
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

// ─── フィルタ設定 ─────────────────────────────────────────────

const STATUS_FILTER_OPTIONS: { value: ArrivalStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'pending', label: '未着荷' },
  { value: 'partial', label: '一部入庫' },
  { value: 'completed', label: '入庫完了' },
  { value: 'cancelled', label: 'キャンセル' },
]

// ─── メインページ ─────────────────────────────────────────────

export default function ArrivalPage() {
  const { state } = useWms()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [detailSchedule, setDetailSchedule] = useState<ArrivalSchedule | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ArrivalStatus | 'all'>('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return state.arrivalSchedules.filter((s) => {
      const matchSearch =
        !q ||
        s.code.toLowerCase().includes(q) ||
        s.supplierName.toLowerCase().includes(q)
      const matchStatus = statusFilter === 'all' || s.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [state.arrivalSchedules, search, statusFilter])

  return (
    <div className="max-w-screen-xl space-y-4">
      {/* ページヘッダー */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">入荷予定登録</h2>
        <p className="text-sm text-slate-500 mt-1">
          仕入先からの入荷予定を登録・管理します
        </p>
      </div>

      {/* カード */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* アクションバー */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-3">
          {/* 検索 */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="入荷予定番号・仕入先で検索"
          />

          {/* ステータスフィルタ */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ArrivalStatus | 'all')
            }
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white text-slate-700"
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* 件数 */}
          <span className="text-xs text-slate-500">
            全 <strong className="text-slate-700">{filtered.length}</strong> 件
          </span>

          {/* 新規登録ボタン */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full sm:w-auto sm:ml-auto flex items-center justify-center gap-2 px-4 py-2.5 sm:py-1.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors"
          >
            <Plus size={15} />
            新規登録
          </button>
        </div>

        {/* モバイル：カード表示 */}
        <div className="sm:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
              <ClipboardList size={28} />
              <p className="text-sm">該当する入荷予定がありません</p>
            </div>
          ) : (
            filtered.map((schedule) => (
              <div
                key={schedule.id}
                onClick={() => setDetailSchedule(schedule)}
                className="px-4 py-4 active:bg-blue-50/70 cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs text-blue-600 font-medium">{schedule.code}</span>
                  <ArrivalStatusBadge status={schedule.status} />
                </div>
                <p className="text-sm font-medium text-slate-700 mb-1">{schedule.supplierName}</p>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{schedule.scheduledDate}</span>
                  <span>{schedule.items.length} 品目</span>
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
                  ステータス
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  登録日
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <ClipboardList size={28} />
                      <p className="text-sm">該当する入荷予定がありません</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((schedule) => (
                  <tr
                    key={schedule.id}
                    onClick={() => setDetailSchedule(schedule)}
                    className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-blue-600 font-medium">
                        {schedule.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{schedule.supplierName}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                      {schedule.scheduledDate}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                      {schedule.items.length}
                      <span className="text-xs text-slate-400 ml-1">品目</span>
                    </td>
                    <td className="px-4 py-3">
                      <ArrivalStatusBadge status={schedule.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {schedule.createdAt}
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
        <ArrivalCreateModal onClose={() => setShowCreateModal(false)} />
      )}
      {detailSchedule && (
        <ArrivalDetailModal
          schedule={detailSchedule}
          onClose={() => setDetailSchedule(null)}
        />
      )}
    </div>
  )
}
