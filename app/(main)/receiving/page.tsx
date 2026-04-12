'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { PackageCheck, CheckCircle, Loader2, ChevronRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import StatusBadge from '@/components/ui/StatusBadge'
import PageShell from '@/components/ui/PageShell'
import EmptyState from '@/components/ui/EmptyState'
import { useTranslation } from '@/lib/i18n'
import {
  type ArrivalStatus,
  type InventoryStatus,
  ARRIVAL_STATUS_CONFIG,
  INVENTORY_STATUS_CONFIG,
} from '@/lib/types'
import {
  type ArrivalGroup,
  type ArrivalLineItem,
  type LocationOption,
  fetchArrivalGroups,
  fetchLocationOptions,
} from '@/lib/supabase/queries/arrivals'
import { confirmArrivalReceiving } from '@/lib/supabase/queries/receiving'
import { useTenant } from '@/store/TenantContext'
import ScopeRequired from '@/components/ui/ScopeRequired'

// =============================================================
// ユーティリティ
// =============================================================

/** lines から header ステータスを算出 */
function deriveGroupStatus(lines: ArrivalLineItem[]): ArrivalStatus {
  const active = lines.filter((l) => l.status !== 'cancelled')
  if (active.length === 0) return 'cancelled'
  if (active.every((l) => l.status === 'completed')) return 'completed'
  if (active.some((l) => l.status === 'completed' || l.receivedQty > 0)) return 'partial'
  return 'pending'
}

/** lines から全体進捗を算出 */
function calcGroupProgress(lines: ArrivalLineItem[]) {
  const total    = lines.reduce((s, l) => s + l.scheduledQty, 0)
  const received = lines.reduce((s, l) => s + l.receivedQty,  0)
  const pct = total > 0 ? Math.min((received / total) * 100, 100) : 0
  return { total, received, pct }
}

// =============================================================
// ステータスバッジ（StatusBadge の入庫専用アダプタ）
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
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">
        {received} / {total}
      </span>
    </div>
  )
}

// =============================================================
// 入庫処理モーダル（ヘッダー単位・全明細表示）
// =============================================================

type LineInput = {
  qty:               string
  locationId:        string
  inventoryStatus:   InventoryStatus
  submitting:        boolean
  error:             string
  locationError:     string
  lastConfirmedQty:  number | null
  confirmedLocation: string
}

function initLineInputs(lines: ArrivalLineItem[]): Record<string, LineInput> {
  return Object.fromEntries(
    lines.map((l) => [l.id, {
      qty:               '',
      locationId:        l.locationId ?? '',
      inventoryStatus:   'available' as InventoryStatus,
      submitting:        false,
      error:             '',
      locationError:     '',
      lastConfirmedQty:  null,
      confirmedLocation: '',
    }])
  )
}

function ReceivingGroupModal({
  group,
  locations,
  onClose,
  onGroupUpdated,
}: {
  group:          ArrivalGroup
  locations:      LocationOption[]
  onClose:        () => void
  onGroupUpdated: (updated: ArrivalGroup) => void
}) {
  const { t }      = useTranslation('receiving')
  const { t: tc }  = useTranslation('common')
  const { scope }  = useTenant()

  const [localLines, setLocalLines] = useState<ArrivalLineItem[]>(group.lines)
  const [lineInputs, setLineInputs] = useState<Record<string, LineInput>>(() =>
    initLineInputs(group.lines)
  )

  const localStatus = deriveGroupStatus(localLines)
  const progress    = calcGroupProgress(localLines)

  const updateInput = useCallback(<K extends keyof LineInput>(
    lineId: string,
    key: K,
    value: LineInput[K],
  ) => {
    setLineInputs((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], [key]: value },
    }))
  }, [])

  const handleConfirmLine = useCallback(async (line: ArrivalLineItem) => {
    const input = lineInputs[line.id]
    if (!input || !scope) return

    const qty       = Math.floor(Number(input.qty))
    const remaining = line.scheduledQty - line.receivedQty

    // バリデーション
    let hasError = false
    if (!input.qty || isNaN(qty) || qty <= 0) {
      updateInput(line.id, 'error', t('errNoQty'))
      hasError = true
    } else if (qty > remaining) {
      updateInput(line.id, 'error', `${t('errOverflow')} (${remaining})`)
      hasError = true
    }
    if (!input.locationId) {
      updateInput(line.id, 'locationError', '保管場所を選択してください')
      hasError = true
    }
    if (hasError) return

    updateInput(line.id, 'submitting', true)
    updateInput(line.id, 'error', '')
    updateInput(line.id, 'locationError', '')

    const newTotalReceived = line.receivedQty + qty
    const today = new Date()
    const receivedDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-')

    const { error: err } = await confirmArrivalReceiving({
      lineId:           line.id,
      headerId:         group.id,
      productId:        line.productId,
      locationId:       input.locationId,
      addQty:           qty,
      totalPlannedQty:  line.scheduledQty,
      totalReceivedQty: newTotalReceived,
      inventoryStatus:  input.inventoryStatus,
      receivedDate,
      scope,
    })

    if (err) {
      setLineInputs((prev) => ({
        ...prev,
        [line.id]: { ...prev[line.id], submitting: false, error: err },
      }))
      return
    }

    // 楽観的更新
    const isLineComplete      = newTotalReceived >= line.scheduledQty
    const confirmedLocationCode = locations.find((l) => l.id === input.locationId)?.code ?? ''

    const updatedLines = localLines.map((l) =>
      l.id === line.id
        ? {
            ...l,
            receivedQty: newTotalReceived,
            status: isLineComplete ? ('completed' as ArrivalStatus) : ('partial' as ArrivalStatus),
          }
        : l
    )
    setLocalLines(updatedLines)

    setLineInputs((prev) => ({
      ...prev,
      [line.id]: {
        ...prev[line.id],
        submitting:        false,
        qty:               '',
        lastConfirmedQty:  qty,
        confirmedLocation: confirmedLocationCode,
        error:             '',
        locationError:     '',
      },
    }))

    // 親リストを即時更新
    onGroupUpdated({
      ...group,
      lines:  updatedLines,
      status: deriveGroupStatus(updatedLines),
    })
  }, [lineInputs, localLines, scope, group, locations, t, updateInput, onGroupUpdated])

  return (
    <Modal
      title={`入庫処理 — ${group.arrivalNo}`}
      onClose={onClose}
      size="xl"
    >
      <div className="space-y-4">

        {/* ヘッダー情報 */}
        <div className="bg-slate-50 rounded-lg px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
          {([
            ['仕入先',     group.supplierName],
            ['入荷予定日', group.arrivalDate],
            ['明細件数',   `${localLines.length} 件`],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</dt>
              <dd className="text-xs font-medium text-slate-800">{value}</dd>
            </div>
          ))}
          <div className="flex flex-col gap-0.5">
            <dt className="text-[10px] text-slate-400 uppercase tracking-wide">ステータス</dt>
            <dd><ArrivalStatusBadge status={localStatus} /></dd>
          </div>
        </div>

        {/* 全体進捗 */}
        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-slate-500 flex-shrink-0 w-16">全体進捗</span>
          <ProgressBar {...progress} status={localStatus} />
        </div>

        {/* メモ */}
        {group.memo && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-700">
            {group.memo}
          </div>
        )}

        {/* 入庫済みフラッシュ */}
        {Object.entries(lineInputs).some(([, v]) => v.lastConfirmedQty !== null) && (
          <div className="space-y-1">
            {Object.entries(lineInputs)
              .filter(([, v]) => v.lastConfirmedQty !== null)
              .map(([lineId, v]) => {
                const line = localLines.find((l) => l.id === lineId)
                if (!line) return null
                return (
                  <div key={lineId} className="bg-green-50 border border-green-200 rounded-md px-3 py-2 flex items-center gap-2 text-xs text-green-700">
                    <CheckCircle size={12} className="flex-shrink-0 text-green-500" />
                    <span>
                      <strong>{line.productCode}</strong> — {v.lastConfirmedQty}{line.unit} を
                      {v.confirmedLocation} に入庫しました
                    </span>
                  </div>
                )
              })}
          </div>
        )}

        {/* 明細テーブル */}
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="px-3 py-2.5 text-left font-semibold">商品コード</th>
                <th className="px-3 py-2.5 text-left font-semibold">商品名</th>
                <th className="px-3 py-2.5 text-right font-semibold">予定数</th>
                <th className="px-3 py-2.5 text-right font-semibold">入庫済</th>
                <th className="px-3 py-2.5 text-right font-semibold">残り</th>
                <th className="px-3 py-2.5 text-left font-semibold min-w-[150px]">保管場所</th>
                <th className="px-3 py-2.5 text-left font-semibold min-w-[160px]">在庫ステータス</th>
                <th className="px-3 py-2.5 text-right font-semibold min-w-[72px]">今回数量</th>
                <th className="px-3 py-2.5 text-center font-semibold min-w-[72px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {localLines.map((line) => {
                const input      = lineInputs[line.id]
                if (!input) return null
                const remaining  = line.scheduledQty - line.receivedQty
                const isReadOnly = line.status === 'completed' || line.status === 'cancelled'

                return (
                  <tr
                    key={line.id}
                    className={isReadOnly ? 'bg-slate-50/60 opacity-70' : ''}
                  >
                    {/* 商品コード */}
                    <td className="px-3 py-2.5 font-mono text-blue-600 whitespace-nowrap">
                      {line.productCode}
                    </td>
                    {/* 商品名 */}
                    <td className="px-3 py-2.5 text-slate-700">{line.productName}</td>
                    {/* 予定数 */}
                    <td className="px-3 py-2.5 text-right tabular-nums">{line.scheduledQty}</td>
                    {/* 入庫済 */}
                    <td className="px-3 py-2.5 text-right tabular-nums text-green-700 font-medium">
                      {line.receivedQty}
                    </td>
                    {/* 残り */}
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${
                      remaining === 0 ? 'text-green-600' : 'text-amber-600'
                    }`}>
                      {remaining === 0 ? '✓' : remaining}
                    </td>

                    {isReadOnly ? (
                      <>
                        <td className="px-3 py-2.5 text-slate-400">{line.locationCode || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-400">—</td>
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5 text-center">
                          {line.status === 'completed' && (
                            <CheckCircle size={14} className="text-green-500 mx-auto" />
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        {/* 保管場所 */}
                        <td className="px-2 py-2">
                          <select
                            value={input.locationId}
                            onChange={(e) => {
                              updateInput(line.id, 'locationId', e.target.value)
                              updateInput(line.id, 'locationError', '')
                            }}
                            className={`w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal bg-white ${
                              input.locationError   ? 'border-red-400 bg-red-50' :
                              !input.locationId     ? 'border-amber-300 bg-amber-50' :
                                                      'border-slate-300'
                            }`}
                          >
                            <option value="">— 選択 —</option>
                            {locations.map((l) => (
                              <option key={l.id} value={l.id}>{l.code}　{l.name}</option>
                            ))}
                          </select>
                          {input.locationError && (
                            <p className="text-[10px] text-red-600 mt-0.5 whitespace-nowrap">
                              {input.locationError}
                            </p>
                          )}
                        </td>

                        {/* 在庫ステータス */}
                        <td className="px-2 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {(Object.keys(INVENTORY_STATUS_CONFIG) as InventoryStatus[]).map((key) => {
                              const cfg      = INVENTORY_STATUS_CONFIG[key]
                              const isActive = input.inventoryStatus === key
                              return (
                                <button
                                  key={key}
                                  type="button"
                                  onClick={() => updateInput(line.id, 'inventoryStatus', key)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 transition-all ${
                                    isActive
                                      ? cfg.badgeClass + ' ring-offset-1'
                                      : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300'
                                  }`}
                                >
                                  {cfg.label}
                                </button>
                              )
                            })}
                          </div>
                        </td>

                        {/* 今回数量 */}
                        <td className="px-2 py-2">
                          {remaining === 0 ? (
                            <span className="text-green-600 text-[10px] block text-right">完了</span>
                          ) : (
                            <div>
                              <input
                                type="number"
                                min="1"
                                max={remaining}
                                value={input.qty}
                                onChange={(e) => {
                                  updateInput(line.id, 'qty', e.target.value)
                                  updateInput(line.id, 'error', '')
                                }}
                                placeholder="0"
                                className="w-16 border border-slate-300 rounded px-2 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal"
                              />
                              {input.error && (
                                <p className="text-[10px] text-red-600 mt-0.5 whitespace-nowrap">
                                  {input.error}
                                </p>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 入庫確定ボタン */}
                        <td className="px-2 py-2 text-center">
                          {remaining > 0 && (
                            <button
                              onClick={() => handleConfirmLine(line)}
                              disabled={input.submitting}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-navy text-white text-[10px] font-medium rounded hover:bg-brand-navy-mid transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              {input.submitting
                                ? <Loader2 size={10} className="animate-spin" />
                                : <PackageCheck size={10} />
                              }
                              入庫確定
                            </button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* フッター */}
        <div className="flex justify-end pt-1 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
          >
            {tc('close')}
          </button>
        </div>

      </div>
    </Modal>
  )
}

// =============================================================
// メインページ
// =============================================================

// receiving の有効な statusFilter 値（active は pending + partial の複合フィルタ）
const RECEIVING_FILTER_VALUES = ['all', 'active', 'pending', 'partial', 'completed'] as const
type ReceivingFilterValue = typeof RECEIVING_FILTER_VALUES[number]

export default function ReceivingPage() {
  const { t }      = useTranslation('receiving')
  const { t: tc }  = useTranslation('common')
  const { t: ts }  = useTranslation('status')
  const { scope }  = useTenant()

  // ── URL params ─────────────────────────────────────────────
  const searchParams = useSearchParams()
  const router = useRouter()

  const [groups,       setGroups]       = useState<ArrivalGroup[]>([])
  const [locations,    setLocations]    = useState<LocationOption[]>([])
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  // URL params から初期値を読む。'active' がデフォルト（省略時も 'active' に戻す）
  const [statusFilter, setStatusFilter] = useState<ReceivingFilterValue>(() => {
    const raw = searchParams.get('status')
    return (RECEIVING_FILTER_VALUES as readonly string[]).includes(raw ?? '') ? raw as ReceivingFilterValue : 'active'
  })
  const [search,       setSearch]       = useState(() => searchParams.get('q') ?? '')
  const [selected,     setSelected]     = useState<ArrivalGroup | null>(null)

  // ── URL 更新ヘルパー（history を積まない replace）──────────
  const pushParams = useCallback((q: string, status: ReceivingFilterValue) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (status !== 'active') p.set('status', status)   // 'active' はデフォルトなので省略
    const qs = p.toString()
    router.replace(`/receiving${qs ? `?${qs}` : ''}`)
  }, [router])

  const handleStatusChange = useCallback((val: ReceivingFilterValue) => {
    setStatusFilter(val)
    pushParams(search, val)
  }, [search, pushParams])

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val)
    pushParams(val, statusFilter)
  }, [statusFilter, pushParams])

  // ── データ取得 ──────────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    if (!scope) { setLoading(false); return }
    setLoading(true)
    setFetchError(null)
    const [groupsRes, locationsRes] = await Promise.all([
      fetchArrivalGroups(scope),
      fetchLocationOptions(scope.warehouseId),
    ])
    if (groupsRes.error) setFetchError(groupsRes.error)
    else setGroups(groupsRes.data)
    setLocations(locationsRes.data)
    setLoading(false)
  }, [scope])

  useEffect(() => { loadGroups() }, [loadGroups])

  // ── 入庫確定後の即時反映（モーダルから呼ばれる） ──────────
  const handleGroupUpdated = useCallback((updated: ArrivalGroup) => {
    setGroups((prev) => prev.map((g) => g.id === updated.id ? updated : g))
    // 開いているモーダルの group 参照も更新（ステータス表示のため）
    setSelected((prev) => prev?.id === updated.id ? { ...prev, ...updated } : prev)
  }, [])

  // ── フィルタ ─────────────────────────────────────────────
  const statusFilterOptions: { value: ReceivingFilterValue; label: string }[] = [
    { value: 'all',       label: t('filterAll') },
    { value: 'active',    label: t('filterActive') },
    { value: 'pending',   label: ts('arrival_pending') },
    { value: 'partial',   label: ts('arrival_partial') },
    { value: 'completed', label: ts('arrival_completed') },
  ]

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return groups.filter((g) => {
      const matchSearch =
        !q ||
        g.arrivalNo.toLowerCase().includes(q) ||
        g.supplierName.toLowerCase().includes(q)
      if (!matchSearch) return false
      if (statusFilter === 'all')    return true
      if (statusFilter === 'active') return g.status === 'pending' || g.status === 'partial'
      return g.status === statusFilter
    })
  }, [groups, statusFilter, search])

  const counts = useMemo(() => ({
    pending: groups.filter((g) => g.status === 'pending').length,
    partial: groups.filter((g) => g.status === 'partial').length,
  }), [groups])

  // ── スコープ未選択 ───────────────────────────────────────
  if (!scope) return <ScopeRequired />

  // ── メイン描画 ────────────────────────────────────────────
  return (
  <PageShell
    loading={loading}
    error={fetchError}
    onRetry={loadGroups}
    title={t('title')}
    subtitle={t('subtitle')}
  >
    <div className="max-w-screen-xl space-y-4">

      {/* ページヘッダー */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{t('title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
        </div>
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
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={handleSearchChange}
            placeholder={t('searchPlaceholder')}
          />
          <select
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value as ReceivingFilterValue)}
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
            <div className="py-12">
              <EmptyState icon={<PackageCheck size={28} />} message={t('empty')} />
            </div>
          ) : filtered.map((group) => {
            const progress    = calcGroupProgress(group.lines)
            const isCompleted = group.status === 'completed'
            return (
              <div
                key={group.id}
                onClick={() => setSelected(group)}
                className={`px-4 py-4 cursor-pointer active:bg-blue-50/70 ${isCompleted ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs text-blue-600 font-medium">{group.arrivalNo}</span>
                  <ArrivalStatusBadge status={group.status} />
                </div>
                <p className="text-sm font-medium text-slate-700 mb-0.5">{group.supplierName}</p>
                <p className="text-xs text-slate-500 mb-2">
                  {group.lines.length} 件 · {group.arrivalDate}
                </p>
                <ProgressBar {...progress} status={group.status} />
              </div>
            )
          })}
        </div>

        {/* デスクトップ：テーブル表示 */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  {t('colCode')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">
                  {t('colSupplier')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  {t('colDate')}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 whitespace-nowrap">
                  明細件数
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  {t('colProgress')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">
                  {t('colStatus')}
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <EmptyState icon={<PackageCheck size={28} />} message={t('empty')} />
                  </td>
                </tr>
              ) : filtered.map((group) => {
                const progress    = calcGroupProgress(group.lines)
                const isCompleted = group.status === 'completed'
                return (
                  <tr
                    key={group.id}
                    onClick={() => setSelected(group)}
                    className={`cursor-pointer transition-colors ${
                      isCompleted
                        ? 'hover:bg-slate-50/50 opacity-60'
                        : 'hover:bg-blue-50/50'
                    }`}
                  >
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-blue-600 font-medium">{group.arrivalNo}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{group.supplierName}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {group.arrivalDate}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {group.lines.length}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <ProgressBar {...progress} status={group.status} />
                    </td>
                    <td className="px-4 py-3">
                      <ArrivalStatusBadge status={group.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      <ChevronRight size={14} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 入庫処理モーダル */}
      {selected && (
        <ReceivingGroupModal
          group={selected}
          locations={locations}
          onClose={() => setSelected(null)}
          onGroupUpdated={handleGroupUpdated}
        />
      )}

    </div>
  </PageShell>
  )
}
