'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Plus, Power, Warehouse as WarehouseIcon } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import { useTranslation } from '@/lib/i18n'
import type { Tenant, Warehouse } from '@/lib/types'
import {
  fetchAllTenants,
  fetchAllWarehousesForTenant,
  createWarehouse,
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

// ─── 倉庫登録フォーム ────────────────────────────────────────

function WarehouseForm({
  tenantId,
  onClose,
  onSaved,
}: {
  tenantId: string
  onClose:  () => void
  onSaved:  () => void
}) {
  const { t }     = useTranslation('master')
  const { t: tc } = useTranslation('common')
  const [name, setName]       = useState('')
  const [address, setAddress] = useState('')
  const [errors, setErrors]   = useState<Record<string, string>>({})
  const [saving, setSaving]   = useState(false)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = t('errWarehouseName')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    const { error } = await createWarehouse({
      tenantId,
      name:    name.trim(),
      address: address.trim() || undefined,
    })
    setSaving(false)
    if (error) { setErrors({ name: error }); return }
    onSaved()
    onClose()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          {t('warehouseName')} <span className="text-red-500">*</span>
        </label>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t('warehouseNamePlaceholder')}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
        />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t('address')}</label>
        <input
          type="text" value={address} onChange={(e) => setAddress(e.target.value)}
          placeholder={t('addressPlaceholder')}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
        />
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onClose}
          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">
          {tc('cancel')}
        </button>
        <button onClick={handleSubmit} disabled={saving}
          className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium disabled:opacity-50">
          {tc('register')}
        </button>
      </div>
    </div>
  )
}

// ─── メインページ ─────────────────────────────────────────────

export default function AdminWarehousesPage() {
  const { t }     = useTranslation('admin')
  const { t: tm } = useTranslation('master')
  const { t: tc } = useTranslation('common')

  const [tenants, setTenants]           = useState<Tenant[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState<string>('')
  const [warehouses, setWarehouses]     = useState<Warehouse[]>([])
  const [search, setSearch]             = useState('')
  const [showModal, setShowModal]       = useState(false)
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)

  // 荷主一覧を取得
  useEffect(() => {
    fetchAllTenants().then(({ data }) => {
      setTenants(data)
      if (data.length > 0) setSelectedTenantId(data[0].id)
      setLoadingTenants(false)
    })
  }, [])

  // 選択荷主の倉庫一覧を取得
  const loadWarehouses = useCallback(async () => {
    if (!selectedTenantId) { setWarehouses([]); return }
    setLoadingWarehouses(true)
    const { data } = await fetchAllWarehousesForTenant(selectedTenantId)
    setWarehouses(data)
    setLoadingWarehouses(false)
  }, [selectedTenantId])

  useEffect(() => { loadWarehouses() }, [loadWarehouses])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return warehouses.filter((w) =>
      !q ||
      w.code.toLowerCase().includes(q) ||
      w.name.toLowerCase().includes(q) ||
      (w.address ?? '').toLowerCase().includes(q)
    )
  }, [warehouses, search])

  const handleToggle = async (w: Warehouse) => {
    await toggleWarehouseStatus(w.id, w.status)
    await loadWarehouses()
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
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal min-w-[220px]"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.code} — {tenant.name}
                {tenant.status !== 'active' ? ' (無効)' : ''}
              </option>
            ))}
          </select>
        )}
        {selectedTenant && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
            selectedTenant.status === 'active'
              ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
              : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${selectedTenant.status === 'active' ? 'bg-green-500' : 'bg-slate-400'}`} />
            {selectedTenant.status === 'active' ? tc('active') : tc('inactive')}
          </span>
        )}
      </div>

      {/* 倉庫テーブル */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-2 sm:gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={tm('searchWarehousesPlaceholder')}
          />
          <span className="text-xs text-slate-500 ml-auto">
            {tc('total')} <strong className="text-slate-700">{filtered.length}</strong> {tc('countUnit')}
          </span>
          <button
            onClick={() => setShowModal(true)}
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
                {[tm('colWarehouseCode'), tm('colWarehouseName'), tm('colAddress'), tm('colStatus'), ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingWarehouses ? (
                <tr>
                  <td colSpan={99} className="py-14 text-center">
                    <p className="text-sm text-slate-400">{tc('loading')}</p>
                  </td>
                </tr>
              ) : !selectedTenantId ? (
                <tr>
                  <td colSpan={99} className="py-14 text-center">
                    <p className="text-sm text-slate-400">{t('noTenantSelected')}</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={99} className="py-14 text-center">
                    <p className="text-sm text-slate-400">{tm('emptyWarehouses')}</p>
                  </td>
                </tr>
              ) : filtered.map((w) => (
                <tr key={w.id} className={`hover:bg-slate-50/60 transition-colors ${w.status !== 'active' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-blue-600 whitespace-nowrap">{w.code}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{w.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[240px] truncate">{w.address ?? '—'}</td>
                  <td className="px-4 py-3"><ActiveBadge isActive={w.status === 'active'} /></td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggle(w)}
                      title={w.status === 'active' ? tc('disable') : tc('enable')}
                      className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                      <Power size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && selectedTenantId && (
        <Modal title={tm('modalWarehouseTitle')} onClose={() => setShowModal(false)} size="md">
          <WarehouseForm
            tenantId={selectedTenantId}
            onClose={() => setShowModal(false)}
            onSaved={loadWarehouses}
          />
        </Modal>
      )}
    </div>
  )
}
