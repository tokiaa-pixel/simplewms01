import { supabase } from '@/lib/supabase/client'
import type { Tenant, Warehouse } from '@/lib/types'

// =============================================================
// 荷主一覧取得
// NOTE: Supabase Auth が本番接続されたら user_tenant_permissions で絞り込む。
//       現時点（ダミー認証）はアクティブな全荷主を返す。
// =============================================================

export async function fetchTenantsForUser(): Promise<{
  data:  Tenant[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, tenant_code, tenant_name, status')
    .eq('status', 'active')
    .order('tenant_code')

  if (error) return { data: [], error: error.message }

  type Row = { id: string; tenant_code: string; tenant_name: string; status: string }
  return {
    data: (data as unknown as Row[]).map((r) => ({
      id:     r.id,
      code:   r.tenant_code,
      name:   r.tenant_name,
      status: r.status as Tenant['status'],
    })),
    error: null,
  }
}

// =============================================================
// 倉庫一覧取得（荷主でフィルタ）
// NOTE: Supabase Auth が本番接続されたら user_warehouse_permissions で絞り込む。
// =============================================================

export async function fetchWarehousesForTenant(tenantId: string): Promise<{
  data:  Warehouse[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, tenant_id, warehouse_code, warehouse_name, address, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('warehouse_code')

  if (error) return { data: [], error: error.message }

  type Row = {
    id: string; tenant_id: string; warehouse_code: string
    warehouse_name: string; address: string | null; status: string
  }
  return {
    data: (data as unknown as Row[]).map((r) => ({
      id:       r.id,
      tenantId: r.tenant_id,
      code:     r.warehouse_code,
      name:     r.warehouse_name,
      address:  r.address ?? undefined,
      status:   r.status as Warehouse['status'],
    })),
    error: null,
  }
}

// =============================================================
// 倉庫一覧取得（全ステータス、マスタ管理用）
// =============================================================

export async function fetchAllWarehousesForTenant(tenantId: string): Promise<{
  data:  Warehouse[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('id, tenant_id, warehouse_code, warehouse_name, address, status')
    .eq('tenant_id', tenantId)
    .order('warehouse_code')

  if (error) return { data: [], error: error.message }

  type Row = {
    id: string; tenant_id: string; warehouse_code: string
    warehouse_name: string; address: string | null; status: string
  }
  return {
    data: (data as unknown as Row[]).map((r) => ({
      id:       r.id,
      tenantId: r.tenant_id,
      code:     r.warehouse_code,
      name:     r.warehouse_name,
      address:  r.address ?? undefined,
      status:   r.status as Warehouse['status'],
    })),
    error: null,
  }
}

// =============================================================
// 倉庫新規登録
// =============================================================

export async function createWarehouse(params: {
  tenantId: string
  name:     string
  address?: string
}): Promise<{ data: Warehouse | null; error: string | null }> {
  // 連番コードを生成（既存最大番号 + 1）
  const { data: existing } = await supabase
    .from('warehouses')
    .select('warehouse_code')
    .eq('tenant_id', params.tenantId)
    .order('warehouse_code', { ascending: false })
    .limit(1)

  type CodeRow = { warehouse_code: string }
  const lastCode = (existing as unknown as CodeRow[] | null)?.[0]?.warehouse_code ?? 'W-0000'
  const lastNum  = parseInt(lastCode.replace('W-', ''), 10) || 0
  const newCode  = `W-${String(lastNum + 1).padStart(4, '0')}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('warehouses') as any)
    .insert({
      tenant_id:      params.tenantId,
      warehouse_code: newCode,
      warehouse_name: params.name,
      address:        params.address ?? null,
      status:         'active',
    })
    .select('id, tenant_id, warehouse_code, warehouse_name, address, status')
    .single()

  if (error) return { data: null, error: error.message }

  type Row = {
    id: string; tenant_id: string; warehouse_code: string
    warehouse_name: string; address: string | null; status: string
  }
  const r = data as unknown as Row
  return {
    data: {
      id:       r.id,
      tenantId: r.tenant_id,
      code:     r.warehouse_code,
      name:     r.warehouse_name,
      address:  r.address ?? undefined,
      status:   r.status as Warehouse['status'],
    },
    error: null,
  }
}

// =============================================================
// 倉庫ステータス切替（active ↔ inactive）
// =============================================================

export async function toggleWarehouseStatus(
  id:            string,
  currentStatus: string,
): Promise<{ error: string | null }> {
  const next = currentStatus === 'active' ? 'inactive' : 'active'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('warehouses') as any)
    .update({ status: next })
    .eq('id', id)

  return { error: error?.message ?? null }
}
