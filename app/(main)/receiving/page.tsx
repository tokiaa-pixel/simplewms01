'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { PackageCheck, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useTranslation } from '@/lib/i18n'
import {
  type ArrivalStatus,
  type InventoryStatus,
  ARRIVAL_STATUS_CONFIG,
  INVENTORY_STATUS_CONFIG,
} from '@/lib/types'
import {
  type ArrivalDisplay,
  fetchArrivals,
  confirmArrivalReceiving,
} from '@/lib/supabase/queries/receiving'

// =============================================================
// ユーティリティ
// =============================================================

function calcProgress(item: ArrivalDisplay) {
  const pct = item.plannedQty > 0
    ? Math.min((item.receivedQty / item.plannedQty) * 100, 100)
    : 0
  return { total: item.plannedQty, received: item.receivedQty, pct }
}

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
// 進捗バー
// =============================================================

function ProgressBar({
  received,
  total,
  pct,
  status,
}: {
  received: number
  total:    number
  pct:      number
  status:   ArrivalStatus
}) {
  const barColor =
    status === 'completed' ? 'bg-green-400' :
    status === 'partial'   ? 'bg-amber-400' : 'bg-slate-200'

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
        {received} / {total}
      </span>
    </div>
  )
}

// =============================================================
// 入庫処理モーダル
// =============================================================

function ReceivingModal({
  arrival,
  onClose,
  onConfirmed,
}: {
  arrival:     ArrivalDisplay
  onClose:     () => void
  onConfirmed: () => void   // 確定後に親一覧をバックグラウンド更新させるコールバック
}) {
  const { t }  = useTranslation('receiving')
  const { t: tc } = useTranslation('common')

  // ── ローカル state（楽観的更新で即時反映） ────────────────
  // arrival prop は初期値のみ使用。以降は currentArrival を参照する。
  const [currentArrival, setCurrentArrival] = useState<ArrivalDisplay>(arrival)
  const remaining  = currentArrival.plannedQty - currentArrival.receivedQty
  const isReadOnly = currentArrival.status === 'completed' || currentArrival.status === 'cancelled'

  const [inputQty,         setInputQty]         = useState('')
  const [inventoryStatus,  setInventoryStatus]   = useState<InventoryStatus>('available')
  const [submitting,       setSubmitting]        = useState(false)
  const [error,            setError]             = useState('')
  const [confirmed,        setConfirmed]         = useState(false)
  // 直前に確定した数量（一部入庫フラッシュ表示 & 完了画面で使用）
  const [lastConfirmedQty, setLastConfirmedQty]  = useState<number | null>(null)

  const handleConfirm = async () => {
    const qty = Math.floor(Number(inputQty))

    // ── バリデーション ──────────────────────────────────────
    if (!inputQty || isNaN(qty) || qty <= 0) {
      setError(t('errNoQty'))
      return
    }
    if (qty > remaining) {
      setError(`${t('errOverflow')} (${remaining})`)
      return
    }
    if (!currentArrival.locationId) {
      setError('ロケーションが設定されていません。入荷データを確認してください。')
      return
    }

    setSubmitting(true)
    setError('')

    const newTotalReceived = currentArrival.receivedQty + qty
    const isComplete       = newTotalReceived >= currentArrival.plannedQty

    const { error: err } = await confirmArrivalReceiving({
      lineId:           currentArrival.id,
      headerId:         currentArrival.headerId,
      productId:        currentArrival.productId,
      locationId:       currentArrival.locationId,
      addQty:           qty,
      totalPlannedQty:  currentArrival.plannedQty,
      totalReceivedQty: newTotalReceived,
      inventoryStatus,
      receivedDate:     currentArrival.arrivalDateRaw,
    })

    setSubmitting(false)

    if (err) {
      setError(err)
      return
    }

    // ── 楽観的更新：DB成功後に即時反映 ────────────────────
    const updated: ArrivalDisplay = {
      ...currentArrival,
      receivedQty: newTotalReceived,
      status:      isComplete ? 'completed' : 'partial',
    }
    setCurrentArrival(updated)
    setLastConfirmedQty(qty)
    setInputQty('')
    setInventoryStatus('available')

    // 全数入庫完了 → 完了画面へ
    if (isComplete) setConfirmed(true)

    // 親一覧をバックグラウンドで更新（ローダー表示なし）
    onConfirmed()
  }

  // ── 完了画面（全数入庫後） ───────────────────────────────
  if (confirmed) {
    return (
      <Modal
        title={`${t('modalTitle')} - ${currentArrival.arrivalNo}`}
        onClose={onClose}
        size="md"
        locked={false}
      >
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle size={40} className="text-green-500" />
          <p className="text-sm font-semibold text-slate-700">入庫確定しました ✓</p>
          <p className="text-xs text-slate-500">{currentArrival.arrivalNo}</p>
          <p className="text-xs text-slate-400">
            {currentArrival.productCode} — {lastConfirmedQty}{currentArrival.unit} を
            {currentArrival.locationCode} に入庫
          </p>
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

  // ── 入力画面 ─────────────────────────────────────────────
  return (
    <Modal
      title={`${t('modalTitle')} - ${currentArrival.arrivalNo}`}
      onClose={onClose}
      size="lg"
      locked={submitting}
    >
      {/* ── 送信中ローディングオーバーレイ ── */}
      {submitting && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-[2px] rounded-xl">
          <Loader2 size={32} className="animate-spin text-brand-navy" />
          <p className="text-sm font-medium text-slate-600">処理中...</p>
          <p className="text-xs text-slate-400">完了するまでお待ちください</p>
        </div>
      )}

      <div className="space-y-5">

        {/* ── 一部入庫完了フラッシュ（残数あり確定後に表示） ── */}
        {lastConfirmedQty !== null && (
          <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2 flex items-center gap-2 text-xs text-green-700">
            <CheckCircle size={14} className="flex-shrink-0 text-green-500" />
            <span>
              <strong>{lastConfirmedQty}{currentArrival.unit}</strong> を {currentArrival.locationCode} に入庫しました。
              残り <strong>{remaining}{currentArrival.unit}</strong> です。
            </span>
          </div>
        )}

        {/* 入荷情報サマリ */}
        <div className="bg-slate-50 rounded-lg px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {([
            [t('detailSupplier'), currentArrival.supplierName],
            [t('detailStatus'),   <ArrivalStatusBadge key="badge" status={currentArrival.status} />],
            [t('detailDate'),     currentArrival.arrivalDate],
            [t('detailProgress'), `${currentArrival.receivedQty} / ${currentArrival.plannedQty} ${currentArrival.unit}`],
          ] as [string, React.ReactNode][]).map(([label, value], i) => (
            <div key={i} className="flex items-center gap-2">
              <dt className="text-xs text-slate-500 w-20 flex-shrink-0">{label}</dt>
              <dd className="text-xs text-slate-800 font-medium">{value}</dd>
            </div>
          ))}
        </div>

        {currentArrival.memo && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
            {currentArrival.memo}
          </div>
        )}

        {/* 商品・ロケーション詳細 */}
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblProductCode')}</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblProductName')}</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">{t('tblLocation')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblScheduled')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblReceived')}</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-500">{t('tblRemaining')}</th>
                {!isReadOnly && (
                  <th className="px-4 py-2.5 text-right font-medium text-slate-500 whitespace-nowrap">
                    {t('tblThisReceiving')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              <tr className={remaining === 0 ? 'bg-green-50/30 opacity-70' : ''}>
                <td className="px-4 py-3 font-mono text-blue-600">{currentArrival.productCode}</td>
                <td className="px-4 py-3 text-slate-700">{currentArrival.productName}</td>
                <td className="px-4 py-3 font-mono text-slate-600">
                  {currentArrival.locationCode || (
                    <span className="text-red-400">未設定</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{currentArrival.plannedQty}</td>
                <td className="px-4 py-3 text-right tabular-nums text-green-700 font-medium">
                  {currentArrival.receivedQty}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-medium ${
                  remaining === 0 ? 'text-green-600' : 'text-amber-600'
                }`}>
                  {remaining === 0 ? '✓' : remaining}
                </td>
                {!isReadOnly && (
                  <td className="px-4 py-3 text-right">
                    {remaining === 0 ? (
                      <span className="text-green-500 text-xs">{t('qtyDone')}</span>
                    ) : (
                      <input
                        type="number"
                        min="1"
                        max={remaining}
                        value={inputQty}
                        onChange={(e) => {
                          setInputQty(e.target.value)
                          setError('')
                          if (lastConfirmedQty !== null) setLastConfirmedQty(null)
                        }}
                        placeholder="0"
                        className="w-20 border border-slate-300 rounded px-2 py-2 text-right focus:outline-none focus:ring-2 focus:ring-brand-teal"
                      />
                    )}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>

        {/* 在庫ステータス選択 */}
        {!isReadOnly && remaining > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-500 flex-shrink-0">在庫ステータス</label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(INVENTORY_STATUS_CONFIG) as InventoryStatus[]).map((key) => {
                const cfg     = INVENTORY_STATUS_CONFIG[key]
                const isActive = inventoryStatus === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setInventoryStatus(key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium ring-1 transition-all ${
                      isActive
                        ? cfg.badgeClass + ' ring-offset-1 shadow-sm'
                        : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300'
                    }`}
                  >
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${isActive ? cfg.dotClass : 'bg-slate-300'}`} />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 flex items-center gap-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            {error}
          </p>
        )}

        {/* フッターボタン */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {isReadOnly ? tc('close') : tc('cancel')}
          </button>
          {!isReadOnly && remaining > 0 && (
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <PackageCheck size={15} />
              )}
              {t('confirmBtn')}
            </button>
          )}
        </div>

      </div>
    </Modal>
  )
}

// =============================================================
// メインページ
// =============================================================

export default function ReceivingPage() {
  const { t }  = useTranslation('receiving')
  const { t: tc } = useTranslation('common')
  const { t: ts } = useTranslation('status')

  const [arrivals, setArrivals]       = useState<ArrivalDisplay[]>([])
  const [loading, setLoading]         = useState(true)
  const [fetchError, setFetchError]   = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<ArrivalStatus | 'all' | 'active'>('active')
  const [selected, setSelected]       = useState<ArrivalDisplay | null>(null)

  // ── データ取得 ─────────────────────────────────────────────
  const loadArrivals = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    const { data, error } = await fetchArrivals()
    if (error) setFetchError(error)
    else setArrivals(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadArrivals()
  }, [loadArrivals])

  // 確定後のバックグラウンド更新（ローダー表示なし・selected は維持）
  const handleConfirmed = useCallback(async () => {
    const { data, error } = await fetchArrivals()
    if (!error) setArrivals(data)
  }, [])

  const statusFilterOptions = [
    { value: 'all'       as const, label: t('filterAll') },
    { value: 'active'    as const, label: t('filterActive') },
    { value: 'pending'   as const, label: ts('arrival_pending') },
    { value: 'partial'   as const, label: ts('arrival_partial') },
    { value: 'completed' as const, label: ts('arrival_completed') },
  ]

  const filtered = useMemo(() => {
    return arrivals.filter((a) => {
      if (statusFilter === 'all')    return true
      if (statusFilter === 'active') return a.status === 'pending' || a.status === 'partial'
      return a.status === statusFilter
    })
  }, [arrivals, statusFilter])

  const counts = useMemo(() => ({
    pending: arrivals.filter((a) => a.status === 'pending').length,
    partial: arrivals.filter((a) => a.status === 'partial').length,
  }), [arrivals])

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
              onClick={loadArrivals}
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{t('title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>

        {/* 対応件数サマリ */}
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {counts.pending > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <span className="text-xs text-slate-600">
                {ts('arrival_pending')}: <strong>{counts.pending}</strong>{tc('countUnit')}
              </span>
            </div>
          )}
          {counts.partial > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs text-amber-700">
                {ts('arrival_partial')}: <strong>{counts.partial}</strong>{tc('countUnit')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* カード */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">

        {/* フィルタバー */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white text-slate-700"
          >
            {statusFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span className="text-xs text-slate-500 ml-auto">
            {tc('total')} <strong className="text-slate-700">{filtered.length}</strong> {tc('countUnit')}
          </span>
        </div>

        {/* モバイル：カード表示 */}
        <div className="sm:hidden divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-slate-400">
              <PackageCheck size={28} />
              <p className="text-sm">{t('empty')}</p>
            </div>
          ) : (
            filtered.map((arrival) => {
              const progress    = calcProgress(arrival)
              const isCompleted = arrival.status === 'completed'
              return (
                <div
                  key={arrival.id}
                  onClick={() => setSelected(arrival)}
                  className={`px-4 py-4 cursor-pointer active:bg-blue-50/70 ${isCompleted ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-mono text-xs text-blue-600 font-medium">{arrival.arrivalNo}</span>
                    <ArrivalStatusBadge status={arrival.status} />
                  </div>
                  <p className="text-sm font-medium text-slate-700 mb-0.5">{arrival.supplierName}</p>
                  <p className="text-xs text-slate-500 mb-2">
                    {arrival.productCode} {arrival.productName}
                  </p>
                  <div className="flex items-center justify-between">
                    <ProgressBar {...progress} status={arrival.status} />
                    <span className="text-xs text-slate-500">{arrival.arrivalDate}</span>
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
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colCode')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t('colSupplier')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">商品</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colDate')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colProgress')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <PackageCheck size={28} />
                      <p className="text-sm">{t('empty')}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((arrival) => {
                  const progress    = calcProgress(arrival)
                  const isCompleted = arrival.status === 'completed'
                  return (
                    <tr
                      key={arrival.id}
                      onClick={() => setSelected(arrival)}
                      className={`cursor-pointer transition-colors ${
                        isCompleted
                          ? 'hover:bg-slate-50/50 opacity-60'
                          : 'hover:bg-blue-50/50'
                      }`}
                    >
                      <td className="px-5 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs text-blue-600 font-medium">{arrival.arrivalNo}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{arrival.supplierName}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-slate-500">{arrival.productCode}</span>
                        <span className="ml-2 text-xs text-slate-700">{arrival.productName}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{arrival.arrivalDate}</td>
                      <td className="px-4 py-3">
                        <ProgressBar {...progress} status={arrival.status} />
                      </td>
                      <td className="px-4 py-3">
                        <ArrivalStatusBadge status={arrival.status} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 入庫処理モーダル */}
      {selected && (
        <ReceivingModal
          arrival={selected}
          onClose={() => setSelected(null)}
          onConfirmed={handleConfirmed}
        />
      )}
    </div>
  )
}
