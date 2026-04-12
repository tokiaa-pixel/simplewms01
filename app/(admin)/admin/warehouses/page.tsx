'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Plus, Pencil, Power, Warehouse as WarehouseIcon } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import { useTranslation } from '@/lib/i18n'
import type { Tenant, Warehouse } from '@/lib/types'
import {
  fetchAllTenants,
  fetchAllWarehousesForTenant,
  createWarehouse,
  updateWarehouse,
  toggleWarehouseStatus,
} from '@/lib/supabase/queries/tenants'

// ─── バッジ ──────────────────────────────────────────────────

function ActiveBadge({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation('common')
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
      isActive
        ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
        : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-slate-400'}`} />
      {isActive ? t('active') : t('inactive')}
    </span>
  )
}

// ─── フォーム ────────────────────────────────────────────────

interface WarehouseFormProps {
  mode:       'create' | 'edit'
  tenants:    Tenant[]
  initial?:   Warehouse
  fixTenantId?: string    // createモード時：テナントを固定
  onClose:    () => void
  onSaved:    () => void
}

function WarehouseForm({ mode, tenants, initial, fixTenantId, onClose, onSaved }: WarehouseFormProps) {
  const { t }     = useTranslation('admin')
  const { t: tc } = useTranslation('common')

  const [tenantId, setTenantId] = useState(
    initial?.tenantId ?? fixTenantId ?? (tenants[0]?.id ?? '')
  )
  const [nameJa, setNameJa] = useState(initial?.nameJa ?? '')
  const [nameEn, setNameEn] = useState(initial?.nameEn ?? '')
  const [memo,   setMemo]   = useState(initial?.memo   ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!tenantId) e.tenantId = t('selectTenantLabel')
    if (!nameJa.trim()) e.nameJa = t('errWarehouseNameJa')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    let error: string | null = null
    if (mode === 'create') {
      ;({ error } = await createWarehouse({
        tenantId,
        nameJa: nameJa.trim(),
        nameEn: nameEn.trim() || undefined,
        memo:   memo.trim()   || undefined,
      }))
    } else if (initial) {
      ;({ error } = await updateWarehouse(initial.id, {
        nameJa: nameJa.trim(),
        nameEn: nameEn.trim() || undefined,
        memo:   memo.trim()   || undefined,
      }))
    }
    setSaving(false)
    if (error) { setErrors({ nameJa: error }); return }
    onSaved()
    onClose()
  }

  const selectedTenant = tenants.find((t) => t.id === tenantId)

  return (
    <div className="space-y-4">
      {/* 荷主 */}
      {mode === 'create' ? (
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            {t('selectTenantLabel')} <span className="text-red-500">*</span>
          </label>
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} — {t.nameJa}
              </option>
            ))}
          </select>
          {errors.tenantId && <p className="text-xs text-red-500 mt-1">{errors.tenantId}</p>}
        </div>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-md border border-slate-200">
          <span className="text-xs text-slate-500">{t('colTenantRef')}</span>
          <span className="font-mono text-xs text-blue-600">{selectedTenant?.code}</span>
          <span className="text-sm text-slate-700 font-medium">{selectedTenant?.nameJa}</span>
        </div>
      )}

      {/* 倉庫名（日本語） */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          {t('warehouseNameJa')} <span className="text-red-500">*</span>
        </label>
        <input
          type="text" value={nameJa} onChange={(e) => setNameJa(e.target.value)}
          placeholder={t('warehouseNameJaPlaceholder')}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
        />
        {errors.nameJa && <p className="text-xs text-red-500 mt-1">{errors.nameJa}</p>}
      </div>

      {/* 倉庫名（英語） */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">
          {t('warehouseNameEn')}
        </label>
        <input
          type="text" value={nameEn} onChange={(e) => setNameEn(e.target.value)}
          placeholder={t('warehouseNameEnPlaceholder')}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
        />
      </div>

      {/* メモ */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">{t('memo')}</label>
        <textarea
          value={memo} onChange={(e) => setMemo(e.target.value)}
          placeholder={t('memoPlaceholder')} rows={2}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal resize-none"
        />
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onClose}
          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">
          {tc('cancel')}
        </button>
        <button onClick={handleSubmit} disabled={saving}
          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium disabled:opacity-50">
          {mode === 'create' ? tc('register') : tc('save')}
        </button>
      </div>
    </div>
  )
}

// ─── メインページ ─────────────────────────────────────────────

export default function AdminWarehousesPage() {
  const { t }     = useTranslation('admin')
  const { t: tc } = useTranslation('common')

  const [tenants, setTenants]                   = useState<Tenant[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState<string>('')
  const [warehouses, setWarehouses]             = useState<Warehouse[]>([])
  const [search, setSearch]                     = useState('')
  const [loadingTenants, setLoadingTenants]     = useState(true)
  const [loadingWH, setLoadingWH]               = useState(false)
  const [loadError, setLoadError]               = useState<string | null>(null)
  const [modalMode, setModalMode]               = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget]             = useState<Warehouse | null>(null)

  // 荷主一覧取得
  useEffect(() => {
    fetchAllTenants().then(({ data, error }) => {
      if (error) {
        setLoadError(error)
      } else {
        setTenants(data)
        if (data.length > 0) setSelectedTenantId(data[0].id)
      }
      setLoadingTenants(false)
    })
  }, [])

  // 選択荷主の倉庫一覧取得
  const loadWarehouses = useCallback(async () => {
    if (!selectedTenantId) { setWarehouses([]); return }
    setLoadingWH(true)
    setLoadError(null)
    const { data, error } = await fetchAllWarehousesForTenant(selectedTenantId)
    if (error) {
      setLoadError(error)
    } else {
      setWarehouses(data)
    }
    setLoadingWH(false)
  }, [selectedTenantId])

  useEffect(() => { loadWarehouses() }, [loadWarehouses])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return warehouses
    const selectedTenant = tenants.find((t) => t.id === selectedTenantId)
    return warehouses.filter((w) =>
      w.code.toLowerCase().includes(q) ||
      w.nameJa.toLowerCase().includes(q) ||
      w.nameEn.toLowerCase().includes(q) ||
      (selectedTenant?.nameJa ?? '').toLowerCase().includes(q)
    )
  }, [warehouses, search, tenants, selectedTenantId])

  const openCreate = () => { setEditTarget(null); setModalMode('create') }
  const openEdit   = (w: Warehouse) => { setEditTarget(w); setModalMode('edit') }
  const closeModal = () => { setModalMode(null); setEditTarget(null) }

  const handleToggle = async (w: Warehouse) => {
    await toggleWarehouseStatus(w.id, w.status)
    await loadWarehouses()
  }

  const formatDate = (iso: string) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId)

  return (
    <div className="max-w-screen-xl space-y-4">
      {/* ページヘッダー */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-navy flex items-center justify-center flex-shrink-0">
          <WarehouseIcon size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{t('warehousesTitle')}</h2>
          <p className="text-sm text-slate-500">{t('warehousesSubtitle')}</p>
        </div>
      </div>

      {/* 荷主セレクター */}
      <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
          {t('selectTenantLabel')}
        </label>
        {loadingTenants ? (
          <span className="text-xs text-slate-400">{tc('loading')}</span>
        ) : (
          <select
            value={selectedTenantId}
            onChange={(e) => { setSelectedTenantId(e.target.value); setSearch('') }}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal min-w-[240px]"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.code} — {tenant.nameJa}
                {tenant.status !== 'active' ? ' (無効)' : ''}
              </option>
            ))}
          </select>
        )}
        {selectedTenant && (
          <>
            <ActiveBadge isActive={selectedTenant.status === 'active'} />
            {selectedTenant.nameEn && (
              <span className="text-xs text-slate-400">{selectedTenant.nameEn}</span>
            )}
          </>
        )}
      </div>

      {/* 倉庫テーブル */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-2 sm:gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('searchWarehousesPlaceholder')}
          />
          <span className="text-xs text-slate-500 ml-auto">
            {tc('total')} <strong className="text-slate-700">{filtered.length}</strong> {tc('countUnit')}
          </span>
          <button
            onClick={openCreate}
            disabled={!selectedTenantId}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2.5 sm:py-1.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} />{tc('newRecord')}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                {[
                  t('colWarehouseCode'),
                  t('colWarehouseNameJa'),
                  '',             // 英語名
                  t('colTenantRef'),
                  t('colStatus'),
                  t('colUpdatedAt'),
                  '',             // 操作
                ].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingWH ? (
                <tr><td colSpan={99} className="py-14 text-center text-sm text-slate-400">{tc('loading')}</td></tr>
              ) : loadError ? (
                <tr><td colSpan={99} className="py-14 text-center text-sm text-red-500">
                  エラー: {loadError}
                </td></tr>
              ) : !selectedTenantId ? (
                <tr><td colSpan={99} className="py-14 text-center text-sm text-slate-400">{t('noTenantSelected')}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={99} className="py-14 text-center text-sm text-slate-400">{tc('noResults')}</td></tr>
              ) : filtered.map((w) => (
                <tr key={w.id}
                  className={`hover:bg-slate-50/60 transition-colors ${w.status !== 'active' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-blue-600 whitespace-nowrap">{w.code}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{w.nameJa}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{w.nameEn || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-blue-600">{selectedTenant?.code}</span>
                      <span>{selectedTenant?.nameJa}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3"><ActiveBadge isActive={w.status === 'active'} /></td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(w.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(w)}
                        title={tc('edit')}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-brand-navy transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleToggle(w)}
                        title={w.status === 'active' ? tc('disable') : tc('enable')}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                        <Power size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 登録 / 編集モーダル */}
      {modalMode && (
        <Modal
          title={modalMode === 'create' ? t('modalCreateWarehouseTitle') : t('modalEditWarehouseTitle')}
          onClose={closeModal}
          size="md"
        >
          <WarehouseForm
            mode={modalMode}
            tenants={tenants}
            initial={editTarget ?? undefined}
            fixTenantId={selectedTenantId}
            onClose={closeModal}
            onSaved={loadWarehouses}
          />
        </Modal>
      )}
    </div>
  )
}
