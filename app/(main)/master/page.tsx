'use client'

import { useState, useMemo } from 'react'
import { Plus, Package, Building2, Users, MapPin, Power } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import { useWms } from '@/store/WmsContext'
import type { MasterProduct } from '@/lib/types'

// ─── 共通UI ──────────────────────────────────────────────────

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
      isActive
        ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
        : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-slate-400'}`} />
      {isActive ? '有効' : '無効'}
    </span>
  )
}

function TableEmpty({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={99} className="py-14 text-center">
        <p className="text-sm text-slate-400">{label}がありません</p>
      </td>
    </tr>
  )
}

// ─── タブ定義 ──────────────────────────────────────────────────

type TabKey = 'products' | 'suppliers' | 'customers' | 'locations'

const TABS: { key: TabKey; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'products',  label: '商品マスタ',       icon: Package,   color: 'text-blue-600' },
  { key: 'suppliers', label: '仕入先マスタ',      icon: Building2, color: 'text-green-600' },
  { key: 'customers', label: '得意先マスタ',      icon: Users,     color: 'text-purple-600' },
  { key: 'locations', label: '保管場所マスタ',    icon: MapPin,    color: 'text-amber-600' },
]

const CATEGORIES = ['電子部品', '周辺機器', '事務用品', 'PCアクセサリ', 'ストレージ', 'その他'] as const
const UNITS = ['個', '本', '箱', 'セット', 'パック', 'kg'] as const

// ─── 商品マスタ ────────────────────────────────────────────────

function ProductForm({ onClose }: { onClose: () => void }) {
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
    if (!name.trim()) e.name = '商品名を入力してください'
    if (unitPrice && isNaN(Number(unitPrice))) e.unitPrice = '数値を入力してください'
    if (minStock && isNaN(Number(minStock)))   e.minStock  = '数値を入力してください'
    if (maxStock && isNaN(Number(maxStock)))   e.maxStock  = '数値を入力してください'
    if (minStock && maxStock && Number(minStock) > Number(maxStock))
      e.maxStock = '最大在庫は最小在庫以上にしてください'
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
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">
            商品名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="例: USBケーブル Type-C 2m"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">カテゴリ <span className="text-red-500">*</span></label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">単位 <span className="text-red-500">*</span></label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal bg-white">
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">単価（円）</label>
          <input type="number" min="0" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="0"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          {errors.unitPrice && <p className="text-xs text-red-500 mt-1">{errors.unitPrice}</p>}
        </div>

        <div className="col-span-2 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">最小在庫数</label>
            <input type="number" min="0" value={minStock} onChange={(e) => setMinStock(e.target.value)}
              placeholder="0"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
            {errors.minStock && <p className="text-xs text-red-500 mt-1">{errors.minStock}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">最大在庫数</label>
            <input type="number" min="0" value={maxStock} onChange={(e) => setMaxStock(e.target.value)}
              placeholder="0"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
            {errors.maxStock && <p className="text-xs text-red-500 mt-1">{errors.maxStock}</p>}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">キャンセル</button>
        <button onClick={handleSubmit} className="px-4 py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium">登録</button>
      </div>
    </div>
  )
}

function ProductTab() {
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
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="商品コード・商品名・カテゴリで検索" />
        <span className="text-xs text-slate-500 ml-auto">全 <strong className="text-slate-700">{filtered.length}</strong> 件</span>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors whitespace-nowrap">
          <Plus size={14} />新規登録
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {['商品コード', '商品名', 'カテゴリ', '単位', '単価', '最小在庫', '最大在庫', '状態', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <TableEmpty label="商品" />
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
                    title={p.isActive ? '無効にする' : '有効にする'}
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
        <Modal title="商品マスタ登録" onClose={() => setShowModal(false)} size="md">
          <ProductForm onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </>
  )
}

// ─── 仕入先マスタ ──────────────────────────────────────────────

function SupplierForm({ onClose }: { onClose: () => void }) {
  const { addSupplier, state } = useWms()
  const [name, setName]               = useState('')
  const [contact, setContact]         = useState('')
  const [phone, setPhone]             = useState('')
  const [email, setEmail]             = useState('')
  const [leadTimeDays, setLeadTime]   = useState('')
  const [errors, setErrors]           = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = '仕入先名を入力してください'
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = '正しいメールアドレスを入力してください'
    if (leadTimeDays && (isNaN(Number(leadTimeDays)) || Number(leadTimeDays) < 0)) e.leadTimeDays = '0以上の数値を入力してください'
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
        <label className="block text-xs font-medium text-slate-600 mb-1">仕入先名 <span className="text-red-500">*</span></label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 株式会社○○商事"
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">担当者名</label>
          <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="例: 山田 太郎"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">電話番号</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="例: 03-1234-5678"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">メールアドレス</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="例: info@example.co.jp"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">リードタイム（日）</label>
          <input type="number" min="0" value={leadTimeDays} onChange={(e) => setLeadTime(e.target.value)} placeholder="例: 7"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          {errors.leadTimeDays && <p className="text-xs text-red-500 mt-1">{errors.leadTimeDays}</p>}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">キャンセル</button>
        <button onClick={handleSubmit} className="px-4 py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium">登録</button>
      </div>
    </div>
  )
}

function SupplierTab() {
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
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="コード・仕入先名・担当者で検索" />
        <span className="text-xs text-slate-500 ml-auto">全 <strong className="text-slate-700">{filtered.length}</strong> 件</span>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors whitespace-nowrap">
          <Plus size={14} />新規登録
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {['仕入先コード', '仕入先名', '担当者', '電話番号', 'メール', 'リードタイム', '状態', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <TableEmpty label="仕入先" />
            ) : filtered.map((s) => (
              <tr key={s.id} className={`hover:bg-slate-50/60 transition-colors ${!s.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-mono text-xs text-blue-600 whitespace-nowrap">{s.code}</td>
                <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{s.name}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{s.contact ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{s.phone ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{s.email ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600 tabular-nums">
                  {s.leadTimeDays != null ? `${s.leadTimeDays} 日` : '—'}
                </td>
                <td className="px-4 py-3"><ActiveBadge isActive={s.isActive} /></td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleSupplier(s.id)} title={s.isActive ? '無効にする' : '有効にする'}
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
        <Modal title="仕入先マスタ登録" onClose={() => setShowModal(false)} size="md">
          <SupplierForm onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </>
  )
}

// ─── 得意先マスタ ──────────────────────────────────────────────

function CustomerForm({ onClose }: { onClose: () => void }) {
  const { addCustomer, state } = useWms()
  const [name, setName]       = useState('')
  const [contact, setContact] = useState('')
  const [phone, setPhone]     = useState('')
  const [address, setAddress] = useState('')
  const [errors, setErrors]   = useState<Record<string, string>>({})

  const validate = () => {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = '得意先名を入力してください'
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
        <label className="block text-xs font-medium text-slate-600 mb-1">得意先名 <span className="text-red-500">*</span></label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 株式会社○○商会"
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">担当者名</label>
          <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="例: 佐藤 次郎"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">電話番号</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="例: 06-1234-5678"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">住所</label>
        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="例: 大阪府大阪市中央区本町1-1-1"
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">キャンセル</button>
        <button onClick={handleSubmit} className="px-4 py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium">登録</button>
      </div>
    </div>
  )
}

function CustomerTab() {
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
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="コード・得意先名・担当者で検索" />
        <span className="text-xs text-slate-500 ml-auto">全 <strong className="text-slate-700">{filtered.length}</strong> 件</span>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors whitespace-nowrap">
          <Plus size={14} />新規登録
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {['得意先コード', '得意先名', '担当者', '電話番号', '住所', '状態', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <TableEmpty label="得意先" />
            ) : filtered.map((c) => (
              <tr key={c.id} className={`hover:bg-slate-50/60 transition-colors ${!c.isActive ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 font-mono text-xs text-blue-600 whitespace-nowrap">{c.code}</td>
                <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{c.name}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{c.contact ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">{c.address ?? '—'}</td>
                <td className="px-4 py-3"><ActiveBadge isActive={c.isActive} /></td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleCustomer(c.id)} title={c.isActive ? '無効にする' : '有効にする'}
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
        <Modal title="得意先マスタ登録" onClose={() => setShowModal(false)} size="md">
          <CustomerForm onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </>
  )
}

// ─── 保管場所マスタ ────────────────────────────────────────────

function LocationForm({ onClose }: { onClose: () => void }) {
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
    if (!zone.trim()) e.zone = 'ゾーンを入力してください'
    else if (!/^[A-Za-z]$/.test(zone.trim())) e.zone = '英大文字1文字で入力してください'
    if (!row.trim()) e.row = '列番号を入力してください'
    else if (isNaN(Number(row)) || Number(row) <= 0) e.row = '1以上の数値を入力してください'
    if (!shelf.trim()) e.shelf = '段番号を入力してください'
    else if (isNaN(Number(shelf)) || Number(shelf) <= 0) e.shelf = '1以上の数値を入力してください'
    if (code && state.locations.some((l) => l.code === code)) e.zone = `棚番 ${code} はすでに登録されています`
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
        <span className="text-xs text-slate-500">棚番プレビュー：</span>
        <span className={`font-mono text-lg font-bold ${code ? 'text-slate-800' : 'text-slate-300'}`}>
          {code || 'X-00-00'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">ゾーン <span className="text-red-500">*</span></label>
          <input type="text" value={zone} onChange={(e) => setZone(e.target.value.toUpperCase())} placeholder="A"
            maxLength={1}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          {errors.zone && <p className="text-xs text-red-500 mt-1">{errors.zone}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">列番号 <span className="text-red-500">*</span></label>
          <input type="number" min="1" max="99" value={row} onChange={(e) => setRow(e.target.value)} placeholder="1"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          {errors.row && <p className="text-xs text-red-500 mt-1">{errors.row}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">段番号 <span className="text-red-500">*</span></label>
          <input type="number" min="1" max="99" value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="1"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
          {errors.shelf && <p className="text-xs text-red-500 mt-1">{errors.shelf}</p>}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">説明・用途</label>
        <input type="text" value={description} onChange={(e) => setDesc(e.target.value)} placeholder="例: 電子部品（ケーブル類）"
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal" />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">キャンセル</button>
        <button onClick={handleSubmit} className="px-4 py-2 text-sm text-white bg-brand-navy rounded-md hover:bg-brand-navy-mid transition-colors font-medium">登録</button>
      </div>
    </div>
  )
}

function LocationTab() {
  const { state, toggleLocation } = useWms()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return state.locations.filter((l) =>
      !q || l.code.toLowerCase().includes(q) || l.zone.toLowerCase().includes(q) || (l.description ?? '').toLowerCase().includes(q)
    )
  }, [state.locations, search])

  // ゾーン別グループ
  const zones = useMemo(
    () => [...new Set(state.locations.map((l) => l.zone))].sort(),
    [state.locations]
  )

  return (
    <>
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="棚番・ゾーン・説明で検索" />
        {/* ゾーン別件数 */}
        <div className="flex items-center gap-2 ml-2">
          {zones.map((z) => (
            <span key={z} className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">
              {z}ゾーン: {state.locations.filter((l) => l.zone === z).length}棚
            </span>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-auto">全 <strong className="text-slate-700">{filtered.length}</strong> 件</span>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-navy text-white text-sm font-medium rounded-md hover:bg-brand-navy-mid transition-colors whitespace-nowrap">
          <Plus size={14} />新規登録
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              {['棚番コード', 'ゾーン', '列', '段', '説明・用途', '状態', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <TableEmpty label="保管場所" />
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
                  <button onClick={() => toggleLocation(l.id)} title={l.isActive ? '無効にする' : '有効にする'}
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
        <Modal title="保管場所マスタ登録" onClose={() => setShowModal(false)} size="sm">
          <LocationForm onClose={() => setShowModal(false)} />
        </Modal>
      )}
    </>
  )
}

// ─── メインページ ─────────────────────────────────────────────

export default function MasterPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('products')
  const { state } = useWms()

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
        <h2 className="text-lg font-semibold text-slate-800">マスタ管理</h2>
        <p className="text-sm text-slate-500 mt-1">
          システム全体で使用するマスタデータを管理します
        </p>
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
