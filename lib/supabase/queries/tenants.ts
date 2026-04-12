import { supabase } from '@/lib/supabase/client'
import type { Tenant, Warehouse } from '@/lib/types'

// =============================================================
// ヘルパー：DB行 → TypeScript型
// ※ migration_v2.sql 実行前後どちらでも動くよう
//   tenant_name_ja が無ければ tenant_name にフォールバック
// =============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTenant(r: Record<string, any>): Tenant {
  return {
    id:        String(r.id        ?? ''),
    code:      String(r.tenant_code ?? ''),
    nameJa:    String(r.tenant_name_ja ?? r.tenant_name ?? ''),
    nameEn:    String(r.tenant_name_en ?? ''),
    status:    (r.status ?? 'active') as Tenant['status'],
    memo:      r.memo  ?? undefined,
    updatedAt: r.updated_at ?? '',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToWarehouse(r: Record<string, any>): Warehouse {
  return {
    id:        String(r.id           ?? ''),
    tenantId:  String(r.tenant_id    ?? ''),
    code:      String(r.warehouse_code ?? ''),
    nameJa:    String(r.warehouse_name_ja ?? r.warehouse_name ?? ''),
    nameEn:    String(r.warehouse_name_en ?? ''),
    status:    (r.status ?? 'active') as Warehouse['status'],
    memo:      r.memo  ?? undefined,
    updatedAt: r.updated_at ?? '',
  }
}

// =============================================================
// 荷主一覧取得（アクティブのみ、サイドバー用）
// select('*') で全列取得し、フォールバックマッピングを適用
// =============================================================

export async function fetchTenantsForUser(): Promise<{
  data:  Tenant[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('status', 'active')
    .order('tenant_code')

  if (error) return { data: [], error: error.message }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data as any[]).map(rowToTenant), error: null }
}

// =============================================================
// 荷主一覧取得（全ステータス、管理者用）
// =============================================================

export async function fetchAllTenants(): Promise<{
  data:  Tenant[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .order('tenant_code')

  if (error) return { data: [], error: error.message }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data as any[]).map(rowToTenant), error: null }
}

// =============================================================
// 荷主新規登録（管理者用）
// =============================================================

export async function createTenant(params: {
  code:   string
  nameJa: string
  nameEn: string
  memo?:  string
}): Promise<{ data: Tenant | null; error: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('tenants') as any)
    .insert({
      tenant_code:    params.code.trim(),
      tenant_name:    params.nameJa.trim(),   // 旧列との互換
      tenant_name_ja: params.nameJa.trim(),
      tenant_name_en: params.nameEn.trim() || null,
      memo:           params.memo?.trim() || null,
      status:         'active',
    })
    .select('*')
    .single()

  if (error) return { data: null, error: error.message }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: rowToTenant(data as any), error: null }
}

// =============================================================
// 荷主更新（管理者用）
// =============================================================

export async function updateTenant(
  id:     string,
  params: { nameJa: string; nameEn: string; memo?: string },
): Promise<{ error: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('tenants') as any)
    .update({
      tenant_name:    params.nameJa.trim(),
      tenant_name_ja: params.nameJa.trim(),
      tenant_name_en: params.nameEn.trim() || null,
      memo:           params.memo?.trim() || null,
    })
    .eq('id', id)

  return { error: error?.message ?? null }
}

// =============================================================
// 荷主ステータス切替（active ↔ inactive）
// =============================================================

export async function toggleTenantStatus(
  id:            string,
  currentStatus: string,
): Promise<{ error: string | null }> {
  const next = currentStatus === 'active' ? 'inactive' : 'active'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('tenants') as any)
    .update({ status: next })
    .eq('id', id)

  return { error: error?.message ?? null }
}

// =============================================================
// 倉庫一覧取得（アクティブのみ、サイドバー用）
// =============================================================

export async function fetchWarehousesForTenant(tenantId: string): Promise<{
  data:  Warehouse[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('warehouse_code')

  if (error) return { data: [], error: error.message }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data as any[]).map(rowToWarehouse), error: null }
}

// =============================================================
// 倉庫一覧取得（全ステータス、管理者用）
// =============================================================

export async function fetchAllWarehousesForTenant(tenantId: string): Promise<{
  data:  Warehouse[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('warehouse_code')

  if (error) return { data: [], error: error.message }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data as any[]).map(rowToWarehouse), error: null }
}

// =============================================================
// 倉庫新規登録
// =============================================================

export async function createWarehouse(params: {
  tenantId: string
  nameJa:   string
  nameEn?:  string
  memo?:    string
}): Promise<{ data: Warehouse | null; error: string | null }> {
  // 連番コードを生成
  const { data: existing } = await supabase
    .from('warehouses')
    .select('warehouse_code')
    .eq('tenant_id', params.tenantId)
    .order('warehouse_code', { ascending: false })
    .limit(1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastCode = (existing as any)?.[0]?.warehouse_code ?? 'W-0000'
  const lastNum  = parseInt(String(lastCode).replace('W-', ''), 10) || 0
  const newCode  = `W-${String(lastNum + 1).padStart(4, '0')}`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('warehouses') as any)
    .insert({
      tenant_id:          params.tenantId,
      warehouse_code:     newCode,
      warehouse_name:     params.nameJa.trim(),   // 旧列との互換
      warehouse_name_ja:  params.nameJa.trim(),
      warehouse_name_en:  params.nameEn?.trim() || null,
      memo:               params.memo?.trim() || null,
      status:             'active',
    })
    .select('*')
    .single()

  if (error) return { data: null, error: error.message }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: rowToWarehouse(data as any), error: null }
}

// =============================================================
// 倉庫更新（管理者用）
// =============================================================

export async function updateWarehouse(
  id:     string,
  params: { nameJa: string; nameEn?: string; memo?: string },
): Promise<{ error: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('warehouses') as any)
    .update({
      warehouse_name:    params.nameJa.trim(),
      warehouse_name_ja: params.nameJa.trim(),
      warehouse_name_en: params.nameEn?.trim() || null,
      memo:              params.memo?.trim() || null,
    })
    .eq('id', id)

  return { error: error?.message ?? null }
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
