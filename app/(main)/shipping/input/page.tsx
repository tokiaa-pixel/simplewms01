'use client'

import { useState, useId } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ArrowLeft, CheckCircle } from 'lucide-react'
import { useWms } from '@/store/WmsContext'
import type { ShippingOrder, ShippingOrderItem } from '@/lib/types'
import { todayIso, toDisplayDate } from '@/lib/utils'

function generateCode(orders: ShippingOrder[]): string {
  const year = new Date().getFullYear()
  const count = orders.filter((o) => o.code.startsWith(`SHP-${year}-`)).length
  return `SHP-${year}-${String(count + 1).padStart(4, '0')}`
}

// ─── フォーム行の型 ────────────────────────────────────────────

interface FormItemRow {
  uid: string
  productCode: string
  orderedQuantity: string
  locationCode: string
}

type FormErrors = Partial<Record<string, string>>

function emptyRow(uid: string): FormItemRow {
  return { uid, productCode: '', orderedQuantity: '', locationCode: '' }
}

// ─── ページ ──────────────────────────────────────────────────

export default function ShippingInputPage() {
  const { addShipping, state } = useWms()
  const { customers, masterProducts } = state
  const router = useRouter()
  const uid = useId()

  const [customerId, setCustomerId] = useState('')
  const [requestedDate, setRequestedDate] = useState(todayIso())
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<FormItemRow[]>([emptyRow(`${uid}-0`)])
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [newCode, setNewCode] = useState('')

  // バリデーション
  const validate = (): boolean => {
    const errs: FormErrors = {}
    if (!customerId) errs.customerId = '出荷先を選択してください'
    if (!requestedDate) errs.requestedDate = '出庫予定日を入力してください'

    const validRows = rows.filter((r) => r.productCode)
    if (validRows.length === 0) errs.items = '商品を1件以上追加してください'

    validRows.forEach((r) => {
      const qty = Number(r.orderedQuantity)
      if (!r.orderedQuantity || isNaN(qty) || qty <= 0) {
        errs[`qty_${r.uid}`] = '1以上の数量を入力してください'
      }
      if (!r.locationCode.trim()) {
        errs[`loc_${r.uid}`] = '出庫元ロケーションを入力してください'
      }
    })

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return

    const customer = customers.find((c) => c.id === customerId)!
    const validRows = rows.filter((r) => r.productCode)

    const items: ShippingOrderItem[] = validRows.map((r, i) => {
      const product = masterProducts.find((p) => p.code === r.productCode)
      return {
        id: `${Date.now()}-${i}`,
        productCode: r.productCode,
        productName: product?.name ?? r.productCode,
        unit: product?.unit ?? '個',
        orderedQuantity: Number(r.orderedQuantity),
        pickedQuantity: 0,
        locationCode: r.locationCode.trim().toUpperCase(),
      }
    })

    const code = generateCode(state.shippingOrders)
    const newOrder: ShippingOrder = {
      id: `shp-${Date.now()}`,
      code,
      customerId,
      customerName: customer.name,
      requestedDate: toDisplayDate(requestedDate),
      status: 'pending',
      items,
      createdAt: toDisplayDate(todayIso()),
      note: note.trim() || undefined,
    }

    addShipping(newOrder)
    setNewCode(code)
    setSubmitted(true)
  }

  const addRow = () =>
    setRows((prev) => [...prev, emptyRow(`${uid}-${Date.now()}`)])

  const removeRow = (uid: string) =>
    setRows((prev) => prev.filter((r) => r.uid !== uid))

  const updateRow = (uid: string, field: keyof FormItemRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, [field]: value } : r))
    )
  }

  // ─── 登録完了画面 ─────────────────────────────────────────

  if (submitted) {
    return (
      <div className="max-w-screen-xl">
        <div className="bg-white rounded-lg border border-slate-200 p-12 flex flex-col items-center gap-4 text-center">
          <CheckCircle size={48} className="text-green-500" />
          <h3 className="text-base font-semibold text-slate-800">
            出庫指示を登録しました
          </h3>
          <p className="text-sm text-slate-500">
            出庫指示番号:{' '}
            <span className="font-mono font-bold text-slate-700">{newCode}</span>
          </p>
          <p className="text-xs text-slate-400">
            出庫処理メニューからピッキング処理を開始してください
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-3 w-full sm:w-auto">
            <button
              onClick={() => {
                setCustomerId('')
                setRequestedDate(todayIso())
                setNote('')
                setRows([emptyRow(`${uid}-reset`)])
                setErrors({})
                setSubmitted(false)
              }}
              className="px-4 py-2.5 text-sm border border-slate-300 text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
            >
              続けて登録
            </button>
            <button
              onClick={() => router.push('/shipping')}
              className="px-4 py-2.5 text-sm bg-brand-navy text-white rounded-md hover:bg-brand-navy-mid transition-colors font-medium"
            >
              出庫処理メニューへ
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── 登録フォーム ─────────────────────────────────────────

  return (
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
          <h2 className="text-lg font-semibold text-slate-800">出庫入力</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            得意先への出荷指示を新規登録します
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-6">
        {/* 出荷先 / 出庫予定日 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              出荷先 <span className="text-red-500">*</span>
            </label>
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value)
                setErrors((prev) => ({ ...prev, customerId: undefined }))
              }}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white"
            >
              <option value="">出荷先を選択...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.customerId && (
              <p className="text-xs text-red-500 mt-1">{errors.customerId}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              出庫予定日 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={requestedDate}
              onChange={(e) => {
                setRequestedDate(e.target.value)
                setErrors((prev) => ({ ...prev, requestedDate: undefined }))
              }}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
            />
            {errors.requestedDate && (
              <p className="text-xs text-red-500 mt-1">{errors.requestedDate}</p>
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
            <div className="min-w-[460px]">
            {/* テーブルヘッダー */}
            <div className="grid grid-cols-[1fr_110px_130px_32px] bg-slate-50 border-b border-slate-200 px-3 py-2 gap-0">
              <span className="text-xs font-medium text-slate-500">商品</span>
              <span className="text-xs font-medium text-slate-500 text-right pr-2">出庫数量</span>
              <span className="text-xs font-medium text-slate-500 pl-2">出庫元ロケーション</span>
              <span />
            </div>

            {/* 明細行 */}
            <div className="divide-y divide-slate-100">
              {rows.map((row) => {
                const product = masterProducts.find(
                  (p) => p.code === row.productCode
                )
                return (
                  <div
                    key={row.uid}
                    className="grid grid-cols-[1fr_110px_130px_32px] items-start gap-0 px-3 py-2.5"
                  >
                    {/* 商品選択 */}
                    <div className="pr-2 space-y-1">
                      <select
                        value={row.productCode}
                        onChange={(e) =>
                          updateRow(row.uid, 'productCode', e.target.value)
                        }
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

                    {/* 出庫数量 */}
                    <div className="pr-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          value={row.orderedQuantity}
                          onChange={(e) =>
                            updateRow(row.uid, 'orderedQuantity', e.target.value)
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

                    {/* 出庫元ロケーション */}
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
                    <div className="flex justify-center pt-1.5">
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

            {/* 行追加 */}
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
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            備考
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="梱包方法・配送上の注意事項など"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"
          />
        </div>

        {/* フッター */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-slate-100">
          <button
            onClick={() => router.push('/shipping')}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium"
          >
            出庫指示を登録
          </button>
        </div>
      </div>
    </div>
  )
}
