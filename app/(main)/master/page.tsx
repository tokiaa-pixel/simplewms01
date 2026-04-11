'use client'

import { useState, useMemo } from 'react'
import { Plus, Package, Building2, Users, MapPin, Power } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import { useWms } from '@/store/WmsContext'
import { useTranslation } from '@/lib/i18n'

// ─── 共通UI ──────────────────────────────────────────────────

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

// ─── タブ定義 ──────────────────────────────────────────────────

type TabKey = 'products' | 'suppliers' | 'customers' | 'locations'

const CATEGORIES = ['電子部品', '周辺機器', '事務用品', 'PCアクセサリ', 'ストレージ', 'その他'] as const
const UNITS = ['個', '本', '箱', 'セット', 'パック', 'kg'] as const

// ─── 商品マスタ ────────────────────────────────────────────────

function ProductForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('master')
  const { t: tc } = useTranslation('common')
  const { addProduct, state } = useWms()
  const [name, setName]           = useState('')
  const [category, setCategory]   = useState<string>(CATEGORIES[0])
  const [unit, setUnit]           = useState<string>(UNITS[0])
  const [unitPrice, setUnitPrice] = useState('')
  const [minStock, setMinStock]   = useState('')
  const [maxStock, setMaxStock]   = useState('')
  const [errors, setErrors]       = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = t('errProductName')
    if (unitPrice && isNaN(Number(unitPrice))) e.unitPrice = t('errUnitPrice')
    if (minStock && isNaN(Number(minStock)))   e.minStock  = t('errMinStock')
    if (maxStock && isNaN(Number(maxStock)))   e.maxStock  = t('errMaxStock')
    if (minStock && maxStock && Number(minStock) > Number(maxStock))
      e.maxStock = t('errMaxStockRange')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const generateCode = () => {
    const n = state.masterProducts.length + 1
    return `P-${String(n).padStart(4, '0')}`
  }

  const handleSubmit = () => {
    if (!validate()) return
    addProduct({
      code: generateCode(),
      name: name.trim(),
      category,
      unit,
      unitPrice:  unitPrice  ? Number(unitPrice)  : undefined,
      minStock:   minStock   ? Number(minStock)   : undefined,
      maxStock:   maxStock   ? Number(maxStock)   : undefined,
      isActive: true,
    })
    onClose()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="col-span-1 sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">
            {t('productName')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t('productNamePlaceholder')}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('category')} <span className="text-red-500">*</span></label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('unit')} <span className="text-red-500">*</span></label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white">
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('unitPrice')}</label>
          <input type="number" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="0"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          {errors.unitPrice && <p className="text-xs text-red-500 mt-1">{errors.unitPrice}</p>}
        </div>

        <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('minStock')}</label>
            <input type="number" min="0" value={minStock} onChange={(e) => setMinStock(e.target.value)}
              placeholder="0"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
            {errors.minStock && <p className="text-xs text-red-500 mt-1">{errors.minStock}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('maxStock')}</label>
            <input type="number" min="0" value={maxStock} onChange={(e) => setMaxStock(e.target.value)}
              placeholder="0"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
            {errors.maxStock && <p className="text-xs text-red-500 mt-1">{errors.maxStock}</p>}
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">{tc('cancel')}</button>
        <button onClick={handleSubmit} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium">{tc('register')}</button>
      </div>
    </div>
  )
}

function ProductTab() {
  const { t } = useTranslation('master')
  const { t: tc } = useTranslation('common')
  const { state, toggleProduct } = useWms()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return state.masterProducts.filter((p) =>
      !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    )
  }, [state.masterProducts, search])

  return (
    <>
      <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-2 sm:gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={t('searchProductsPlaceholder')} />
        <span className="text-xs text-slate-500 sm:ml-auto">
          {tc('total')} <strong className="text-slate-700">{filtered.length}</strong> {tc('countUnit')}
        </span>
        <button onClick={() => setShowModal(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2.5 sm:py-1.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors whitespace-nowrap">
          <Plus size={14} />{tc('newRecord')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {[t('colProductCode'), t('colProductName'), t('colCategory'), t('colUnit'), t('colUnitPrice'), t('colMinStock'), t('colMaxStock'), t('colStatus'), ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={99} className="py-14 text-center">
                  <p className="text-sm text-slate-400">{t('emptyProducts')}</p>
                </td>
              </tr>
            ) : filtered.map((p) => (
              <tr key={p.code} className={`hover:bg-slate-50/60 transition-colors ${!p.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-mono text-xs text-blue-600 whitespace-nowrap">{p.code}</td>
                <td className="px-4 py-3 text-slate-800 font-medium">{p.name}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">{p.category}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{p.unit}</td>
                <td className="px-4 py-3 text-xs text-slate-600 tabular-nums text-right">
                  {p.unitPrice != null ? `¥${p.unitPrice.toLocaleString()}` : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 tabular-nums text-right">
                  {p.minStock != null ? p.minStock : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 tabular-nums text-right">
                  {p.maxStock != null ? p.maxStock : '—'}
                </td>
                <td className="px-4 py-3"><ActiveBadge isActive={p.isActive} /></td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleProduct(p.code)}
                    title={p.isActive ? tc('disable') : tc('enable')}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                    <Power size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={t('modalProductTitle')} onClose={() => setShowModal(false)} size="md">
          <ProductForm onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </>
  )
}

// ─── 仕入先マスタ ──────────────────────────────────────────────

function SupplierForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('master')
  const { t: tc } = useTranslation('common')
  const { addSupplier, state } = useWms()
  const [name, setName]               = useState('')
  const [contact, setContact]         = useState('')
  const [phone, setPhone]             = useState('')
  const [email, setEmail]             = useState('')
  const [leadTimeDays, setLeadTime]   = useState('')
  const [errors, setErrors]           = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = t('errSupplierName')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = t('errEmail')
    if (leadTimeDays && (isNaN(Number(leadTimeDays)) || Number(leadTimeDays) < 0)) e.leadTimeDays = t('errLeadTime')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const generateCode = () => `S-${String(state.suppliers.length + 1).padStart(4, '0')}`

  const handleSubmit = () => {
    if (!validate()) return
    addSupplier({
      id: `sup-${Date.now()}`,
      code: generateCode(),
      name: name.trim(),
      contact:      contact.trim()  || undefined,
      phone:        phone.trim()    || undefined,
      email:        email.trim()    || undefined,
      leadTimeDays: leadTimeDays    ? Number(leadTimeDays) : undefined,
      isActive: true,
    })
    onClose()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t('supplierName')} <span className="text-red-500">*</span></label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('supplierNamePlaceholder')}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('contact')}</label>
          <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t('contactPlaceholder')}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('phone')}</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('phonePlaceholder')}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('email')}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('emailPlaceholder')}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('leadTime')}</label>
          <input type="number" min="0" value={leadTimeDays} onChange={(e) => setLeadTime(e.target.value)} placeholder={t('leadTimePlaceholder')}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          {errors.leadTimeDays && <p className="text-xs text-red-500 mt-1">{errors.leadTimeDays}</p>}
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">{tc('cancel')}</button>
        <button onClick={handleSubmit} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium">{tc('register')}</button>
      </div>
    </div>
  )
}

function SupplierTab() {
  const { t } = useTranslation('master')
  const { t: tc } = useTranslation('common')
  const { state, toggleSupplier } = useWms()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return state.suppliers.filter((s) =>
      !q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || (s.contact ?? '').toLowerCase().includes(q)
    )
  }, [state.suppliers, search])

  return (
    <>
      <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-2 sm:gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={t('searchSuppliersPlaceholder')} />
        <span className="text-xs text-slate-500 ml-auto">
          {tc('total')} <strong className="text-slate-700">{filtered.length}</strong> {tc('countUnit')}
        </span>
        <button onClick={() => setShowModal(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2.5 sm:py-1.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors whitespace-nowrap">
          <Plus size={14} />{tc('newRecord')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {[t('colSupplierCode'), t('colSupplierName'), t('colContact'), t('colPhone'), t('colEmail'), t('colLeadTime'), t('colStatus'), ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={99} className="py-14 text-center">
                  <p className="text-sm text-slate-400">{t('emptySuppliers')}</p>
                </td>
              </tr>
            ) : filtered.map((s) => (
              <tr key={s.id} className={`hover:bg-slate-50/60 transition-colors ${!s.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-mono text-xs text-blue-600 whitespace-nowrap">{s.code}</td>
                <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{s.name}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{s.contact ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{s.phone ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{s.email ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600 tabular-nums">
                  {s.leadTimeDays != null ? `${s.leadTimeDays} ${t('leadTimeUnit')}` : '—'}
                </td>
                <td className="px-4 py-3"><ActiveBadge isActive={s.isActive} /></td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleSupplier(s.id)} title={s.isActive ? tc('disable') : tc('enable')}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                    <Power size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={t('modalSupplierTitle')} onClose={() => setShowModal(false)} size="md">
          <SupplierForm onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </>
  )
}

// ─── 得意先マスタ ──────────────────────────────────────────────

function CustomerForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('master')
  const { t: tc } = useTranslation('common')
  const { addCustomer, state } = useWms()
  const [name, setName]       = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone]     = useState('')
  const [address, setAddress] = useState('')
  const [errors, setErrors]   = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = t('errCustomerName')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const generateCode = () => `C-${String(state.customers.length + 1).padStart(4, '0')}`

  const handleSubmit = () => {
    if (!validate()) return
    addCustomer({
      id: `cus-${Date.now()}`,
      code: generateCode(),
      name: name.trim(),
      contact: contact.trim() || undefined,
      phone:   phone.trim()   || undefined,
      address: address.trim() || undefined,
      isActive: true,
    })
    onClose()
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t('customerName')} <span className="text-red-500">*</span></label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('customerNamePlaceholder')}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('contact')}</label>
          <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t('contactPlaceholder')}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('phone')}</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('phonePlaceholder')}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t('address')}</label>
        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('addressPlaceholder')}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">{tc('cancel')}</button>
        <button onClick={handleSubmit} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium">{tc('register')}</button>
      </div>
    </div>
  )
}

function CustomerTab() {
  const { t } = useTranslation('master')
  const { t: tc } = useTranslation('common')
  const { state, toggleCustomer } = useWms()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return state.customers.filter((c) =>
      !q || c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (c.contact ?? '').toLowerCase().includes(q)
    )
  }, [state.customers, search])

  return (
    <>
      <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-2 sm:gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={t('searchCustomersPlaceholder')} />
        <span className="text-xs text-slate-500 ml-auto">
          {tc('total')} <strong className="text-slate-700">{filtered.length}</strong> {tc('countUnit')}
        </span>
        <button onClick={() => setShowModal(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2.5 sm:py-1.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors whitespace-nowrap">
          <Plus size={14} />{tc('newRecord')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {[t('colCustomerCode'), t('colCustomerName'), t('colContact'), t('colPhone'), t('colAddress'), t('colStatus'), ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={99} className="py-14 text-center">
                  <p className="text-sm text-slate-400">{t('emptyCustomers')}</p>
                </td>
              </tr>
            ) : filtered.map((c) => (
              <tr key={c.id} className={`hover:bg-slate-50/60 transition-colors ${!c.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-mono text-xs text-blue-600 whitespace-nowrap">{c.code}</td>
                <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{c.name}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{c.contact ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">{c.address ?? '—'}</td>
                <td className="px-4 py-3"><ActiveBadge isActive={c.isActive} /></td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleCustomer(c.id)} title={c.isActive ? tc('disable') : tc('enable')}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                    <Power size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={t('modalCustomerTitle')} onClose={() => setShowModal(false)} size="md">
          <CustomerForm onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </>
  )
}

// ─── 保管場所マスタ ────────────────────────────────────────────

function LocationForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('master')
  const { t: tc } = useTranslation('common')
  const { addLocation, state } = useWms()
  const [zone, setZone]           = useState('')
  const [row, setRow]             = useState('')
  const [shelf, setShelf]         = useState('')
  const [description, setDesc]    = useState('')
  const [errors, setErrors]       = useState<Record<string, string>>({})

  const code = zone && row && shelf
    ? `${zone.toUpperCase()}-${row.padStart(2, '0')}-${shelf.padStart(2, '0')}`
    : ''

  const validate = () => {
    const e: Record<string, string> = {}
    if (!zone.trim()) e.zone = t('errZone')
    else if (!/^[A-Za-z]$/.test(zone.trim())) e.zone = t('errZoneFormat')
    if (!row.trim()) e.row = t('errRow')
    else if (isNaN(Number(row)) || Number(row) <= 0) e.row = t('errRowNum')
    if (!shelf.trim()) e.shelf = t('errShelf')
    else if (isNaN(Number(shelf)) || Number(shelf) <= 0) e.shelf = t('errShelfNum')
    if (code && state.locations.some((l) => l.code === code))
      e.zone = `${code} ${t('errLocationDup')}`
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    addLocation({
      id: `loc-${Date.now()}`,
      code,
      zone: zone.toUpperCase(),
      row: row.padStart(2, '0'),
      shelf: shelf.padStart(2, '0'),
      description: description.trim() || undefined,
      isActive: true,
    })
    onClose()
  }

  return (
    <div className="space-y-4">
      {/* プレビュー */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3">
        <span className="text-xs text-slate-500">{t('locationPreview')}</span>
        <span className={`font-mono text-lg font-bold ${code ? 'text-slate-800' : 'text-slate-300'}`}>
          {code || 'X-00-00'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('zone')} <span className="text-red-500">*</span></label>
          <input type="text" value={zone} onChange={(e) => setZone(e.target.value.toUpperCase())} placeholder="A"
            maxLength={1}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          {errors.zone && <p className="text-xs text-red-500 mt-1">{errors.zone}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('row')} <span className="text-red-500">*</span></label>
          <input type="number" min="1" max="99" value={row} onChange={(e) => setRow(e.target.value)} placeholder="1"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          {errors.row && <p className="text-xs text-red-500 mt-1">{errors.row}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">{t('shelf')} <span className="text-red-500">*</span></label>
          <input type="number" min="1" max="99" value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="1"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          {errors.shelf && <p className="text-xs text-red-500 mt-1">{errors.shelf}</p>}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{t('locationDesc')}</label>
        <input type="text" value={description} onChange={(e) => setDesc(e.target.value)} placeholder={t('locationDescPlaceholder')}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">{tc('cancel')}</button>
        <button onClick={handleSubmit} className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium">{tc('register')}</button>
      </div>
    </div>
  )
}

function LocationTab() {
  const { t } = useTranslation('master')
  const { t: tc } = useTranslation('common')
  const { state, toggleLocation } = useWms()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return state.locations.filter((l) =>
      !q || l.code.toLowerCase().includes(q) || l.zone.toLowerCase().includes(q) || (l.description ?? '').toLowerCase().includes(q)
    )
  }, [state.locations, search])

  const zones = useMemo(
    () => [...new Set(state.locations.map((l) => l.zone))].sort(),
    [state.locations]
  )

  return (
    <>
      <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-100 flex flex-wrap items-center gap-2 sm:gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={t('searchLocationsPlaceholder')} />
        <div className="flex items-center gap-2 ml-2">
          {zones.map((z) => (
            <span key={z} className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">
              {z}{t('zoneUnit')}: {state.locations.filter((l) => l.zone === z).length}{t('shelfUnit')}
            </span>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-auto">
          {tc('total')} <strong className="text-slate-700">{filtered.length}</strong> {tc('countUnit')}
        </span>
        <button onClick={() => setShowModal(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2.5 sm:py-1.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors whitespace-nowrap">
          <Plus size={14} />{tc('newRecord')}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {[t('colLocationCode'), t('colZone'), t('colRow'), t('colShelf'), t('colDesc'), t('colStatus'), ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={99} className="py-14 text-center">
                  <p className="text-sm text-slate-400">{t('emptyLocations')}</p>
                </td>
              </tr>
            ) : filtered.map((l) => (
              <tr key={l.id} className={`hover:bg-slate-50/60 transition-colors ${!l.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <span className="font-mono text-sm font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {l.code}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-block w-7 h-7 rounded-md bg-amber-100 text-amber-700 text-xs font-bold text-center leading-7">
                    {l.zone}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 tabular-nums text-center">{l.row}</td>
                <td className="px-4 py-3 text-xs text-slate-600 tabular-nums text-center">{l.shelf}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{l.description ?? '—'}</td>
                <td className="px-4 py-3"><ActiveBadge isActive={l.isActive} /></td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleLocation(l.id)} title={l.isActive ? tc('disable') : tc('enable')}
                    className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                    <Power size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <Modal title={t('modalLocationTitle')} onClose={() => setShowModal(false)} size="sm">
          <LocationForm onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </>
  )
}

// ─── メインページ ─────────────────────────────────────────────

export default function MasterPage() {
  const { t } = useTranslation('master')
  const [activeTab, setActiveTab] = useState<TabKey>('products')
  const { state } = useWms()

  const TABS: { key: TabKey; label: string; icon: React.ElementType; color: string }[] = [
    { key: 'products',  label: t('tabProducts'),  icon: Package,   color: 'text-blue-600' },
    { key: 'suppliers', label: t('tabSuppliers'), icon: Building2, color: 'text-green-600' },
    { key: 'customers', label: t('tabCustomers'), icon: Users,     color: 'text-purple-600' },
    { key: 'locations', label: t('tabLocations'), icon: MapPin,    color: 'text-amber-600' },
  ]

  const TAB_COUNTS: Record<TabKey, number> = {
    products:  state.masterProducts.length,
    suppliers: state.suppliers.length,
    customers: state.customers.length,
    locations: state.locations.length,
  }

  return (
    <div className="max-w-screen-xl space-y-4">
      {/* ページヘッダー */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">{t('title')}</h2>
        <p className="text-sm text-slate-500 mt-1">{t('subtitle')}</p>
      </div>

      {/* カード */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* タブバー */}
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? 'border-brand-teal text-brand-teal bg-brand-light/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <tab.icon size={14} className={isActive ? tab.color : 'text-slate-400'} />
                {tab.label}
                <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  isActive ? 'bg-brand-light text-brand-blue' : 'bg-slate-100 text-slate-500'
                }`}>
                  {TAB_COUNTS[tab.key]}
                </span>
              </button>
            )
          })}
        </div>

        {/* タブコンテンツ */}
        {activeTab === 'products'  && <ProductTab />}
        {activeTab === 'suppliers' && <SupplierTab />}
        {activeTab === 'customers' && <CustomerTab />}
        {activeTab === 'locations' && <LocationTab />}
      </div>
    </div>
  )
}
