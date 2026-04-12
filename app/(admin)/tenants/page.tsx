'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Plus, Power, Building2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import { useTranslation } from '@/lib/i18n'
import type { Tenant } from '@/lib/types'
import {
  fetchAllTenants,
  createTenant,
  toggleTenantStatus,
  fetchWarehousesForTenant,
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

// ─── 荷主登録フォーム ────────────────────────────────────────

function TenantForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t }  = useTranslation('admin')
  const { t: tc } = useTranslation('common')
  const [code, setCode]     = useState('')
  const [name, setName]     = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!code.trim()) e.code = t('errTenantCode')
    else if (!/^[A-Za-z0-9\-]+$/.test(code.trim())) e.code = t('errTenantCodeFormat')
    if (!name.trim()) e.name = t('errTenantName')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    const { error } = await createTenant({ code: code.trim().toUpperCase(), name: name.trim() })
    setSaving(false)
    if (error) { setErrors({ code: error }); return }
    onSaved()
    onClose()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          {t('tenantCode')} <span className="text-red-500">*</span>
        </label>
        <input
          type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t('tenantCodePlaceholder')}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-teal"
        />
        {errors.code && <p className="text-xs text-red-500 mt-1">{errors.code}</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">
          {t('tenantName')} <span className="text-red-500">*</span>
        </label>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder={t('tenantNamePlaceholder')}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
        />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
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

export default function AdminTenantsPage() {
  const { t }     = useTranslation('admin')
  const { t: tc } = useTranslation('common')
  const [tenants, setTenants]         = useState<Tenant[]>([])
  const [warehouseCounts, setWarehouseCounts] = useState<Record<string, number>>({})
  const [search, setSearch]           = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [loading, setLoading]         = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await fetchAllTenants()
    setTenants(data)

    // 各荷主の倉庫数を並行取得
    const counts = await Promise.all(
      data.map(async (t) => {
        const { data: wh } = await fetchWarehousesForTenant(t.id)
        return [t.id, wh.length] as [string, number]
      })
    )
    setWarehouseCounts(Object.fromEntries(counts))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tenants.filter((t) =>
      !q || t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
    )
  }, [tenants, search])

  const handleToggle = async (tenant: Tenant) => {
    await toggleTenantStatus(tenant.id, tenant.status)
    await load()
  }

  return (
    <div className="max-w-screen-xl space-y-4">
      {/* ページヘッダー */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-navy flex items-center justify-center flex-shrink-0">
          <Building2 size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{t('tenantsTitle')}</h2>
          <p className="text-sm text-slate-500">{t('tenantsSubtitle')}</p>
        </div>
      </div>

      {/* カード */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* ツールバー */}
        <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-2 sm:gap-3">
          <SearchInput value={search} onChange={setSearch} placeholder={t('searchTenantsPlaceholder')} />
          <span className="text-xs text-slate-500 ml-auto">
            {tc('total')} <strong className="text-slate-700">{filtered.length}</strong> {tc('countUnit')}
          </span>
          <button onClick={() => setShowModal(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2.5 sm:py-1.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors whitespace-nowrap">
            <Plus size={14} />{tc('newRecord')}
          </button>
        </div>

        {/* テーブル */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                {[t('colTenantCode'), t('colTenantName'), t('colWarehouseCount'), t('colStatus'), ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={99} className="py-14 text-center">
                    <p className="text-sm text-slate-400">{tc('loading')}</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={99} className="py-14 text-center">
                    <p className="text-sm text-slate-400">{t('emptyTenants')}</p>
                  </td>
                </tr>
              ) : filtered.map((tenant) => (
                <tr key={tenant.id} className={`hover:bg-slate-50/60 transition-colors ${tenant.status !== 'active' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-blue-600 whitespace-nowrap">{tenant.code}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium">{tenant.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-semibold text-slate-700">{warehouseCounts[tenant.id] ?? '—'}</span>
                      <span className="text-slate-400">棟</span>
                    </span>
                  </td>
                  <td className="px-4 py-3"><ActiveBadge isActive={tenant.status === 'active'} /></td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggle(tenant)}
                      title={tenant.status === 'active' ? tc('disable') : tc('enable')}
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

      {showModal && (
        <Modal title={t('modalTenantTitle')} onClose={() => setShowModal(false)} size="sm">
          <TenantForm onClose={() => setShowModal(false)} onSaved={load} />
        </Modal>
      )}
    </div>
  )
}
