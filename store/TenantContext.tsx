'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import type { Tenant, Warehouse, QueryScope } from '@/lib/types'
import {
  fetchTenantsForUser,
  fetchWarehousesForTenant,
} from '@/lib/supabase/queries/tenants'

// ─── ストレージキー ────────────────────────────────────────────
const STORAGE_TENANT    = 'wms_tenant_id'
const STORAGE_WAREHOUSE = 'wms_warehouse_id'

// ─── Context 型 ───────────────────────────────────────────────

interface TenantContextType {
  /** 選択中の荷主 */
  currentTenant:      Tenant    | null
  /** 選択中の倉庫 */
  currentWarehouse:   Warehouse | null
  /** 利用可能な荷主一覧 */
  availableTenants:   Tenant[]
  /** 利用可能な倉庫一覧（currentTenant に紐づく） */
  availableWarehouses: Warehouse[]
  /**
   * クエリ関数に渡すスコープ。
   * 荷主・倉庫が両方選択されていれば非 null。
   */
  scope:              QueryScope | null
  isLoading:          boolean
  setTenant:    (tenant:    Tenant)    => void
  setWarehouse: (warehouse: Warehouse) => void
}

const TenantContext = createContext<TenantContextType | null>(null)

// ─── Provider ────────────────────────────────────────────────

export function TenantProvider({ children }: { children: ReactNode }) {
  const [availableTenants,   setAvailableTenants]   = useState<Tenant[]>([])
  const [availableWarehouses, setAvailableWarehouses] = useState<Warehouse[]>([])
  const [currentTenant,      setCurrentTenant]      = useState<Tenant    | null>(null)
  const [currentWarehouse,   setCurrentWarehouse]   = useState<Warehouse | null>(null)
  const [isLoading,          setIsLoading]          = useState(true)

  // ── 起動時：荷主一覧を取得し、前回選択を復元 ───────────────
  useEffect(() => {
    let cancelled = false

    fetchTenantsForUser().then(({ data: tenants }) => {
      if (cancelled) return
      setAvailableTenants(tenants)
      if (tenants.length === 0) { setIsLoading(false); return }

      // localStorage から前回の選択を復元（なければ先頭を選択）
      const storedTenantId = localStorage.getItem(STORAGE_TENANT)
      const restoredTenant =
        tenants.find((t) => t.id === storedTenantId) ?? tenants[0]

      setCurrentTenant(restoredTenant)

      // 倉庫一覧を取得
      fetchWarehousesForTenant(restoredTenant.id).then(({ data: warehouses }) => {
        if (cancelled) return
        setAvailableWarehouses(warehouses)
        if (warehouses.length === 0) { setIsLoading(false); return }

        const storedWarehouseId = localStorage.getItem(STORAGE_WAREHOUSE)
        const restoredWarehouse =
          warehouses.find((w) => w.id === storedWarehouseId) ?? warehouses[0]

        setCurrentWarehouse(restoredWarehouse)
        setIsLoading(false)
      })
    })

    return () => { cancelled = true }
  }, [])

  // ── 荷主変更 ─────────────────────────────────────────────────
  const setTenant = useCallback((tenant: Tenant) => {
    setCurrentTenant(tenant)
    setCurrentWarehouse(null)
    setAvailableWarehouses([])
    localStorage.setItem(STORAGE_TENANT, tenant.id)
    localStorage.removeItem(STORAGE_WAREHOUSE)

    fetchWarehousesForTenant(tenant.id).then(({ data: warehouses }) => {
      setAvailableWarehouses(warehouses)
      if (warehouses.length > 0) {
        setCurrentWarehouse(warehouses[0])
        localStorage.setItem(STORAGE_WAREHOUSE, warehouses[0].id)
      }
    })
  }, [])

  // ── 倉庫変更 ─────────────────────────────────────────────────
  const setWarehouse = useCallback((warehouse: Warehouse) => {
    setCurrentWarehouse(warehouse)
    localStorage.setItem(STORAGE_WAREHOUSE, warehouse.id)
  }, [])

  const scope: QueryScope | null =
    currentTenant && currentWarehouse
      ? { tenantId: currentTenant.id, warehouseId: currentWarehouse.id }
      : null

  return (
    <TenantContext.Provider value={{
      currentTenant,
      currentWarehouse,
      availableTenants,
      availableWarehouses,
      scope,
      isLoading,
      setTenant,
      setWarehouse,
    }}>
      {children}
    </TenantContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant must be used within TenantProvider')
  return ctx
}
