import { supabase } from '@/lib/supabase/client'
import type { InventoryItem, InventoryStatus, QueryScope } from '@/lib/types'

// INSERT / UPDATE は typed client が never を返すため any キャストで回避
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as any).rpc(fn, args) as Promise<{ data: { error: string | null } | null; error: unknown }>

/** 現在のログインユーザー ID を取得（未ログインなら null） */
async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

// ─── Supabase SELECT の結合結果型 ─────────────────────────────

type InventoryRow = {
  id:            string
  product_id:    string        // 在庫操作（移動・ステータス変更）のキー
  location_id:   string        // 在庫操作（移動フィルタ）のキー
  on_hand_qty:   number
  allocated_qty: number
  status:        string
  received_date: string | null
  lot_no:        string | null  // migration_v3 で追加
  expiry_date:   string | null  // migration_v3 で追加（FEFO のキー）
  updated_at:    string
  products: {
    product_code:    string
    product_name_ja: string
    category:        string
    unit:            string
  } | null
  locations: {
    location_code: string
  } | null
}

// ─── DB status → InventoryStatus（未知値はフォールバック） ────

function toInventoryStatus(raw: string): InventoryStatus {
  if (raw === 'available' || raw === 'damaged' || raw === 'hold') return raw
  return 'available'
}

// ─── 日付フォーマット ──────────────────────────────────────────

function formatDate(raw: string | null): string {
  if (!raw) return ''
  return new Date(raw).toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
}

// ─── Supabase Row → アプリ内 InventoryItem ────────────────────

function toInventoryItem(row: InventoryRow): InventoryItem {
  const p = row.products
  const l = row.locations
  const onHandQty    = row.on_hand_qty   ?? 0
  const allocatedQty = row.allocated_qty ?? 0
  return {
    id:            row.id,
    productCode:   p?.product_code    ?? '',
    productName:   p?.product_name_ja ?? '',
    category:      p?.category        ?? '',
    onHandQty,
    allocatedQty,
    availableQty:  Math.max(0, onHandQty - allocatedQty),
    unit:          p?.unit            ?? '',
    locationCode:  l?.location_code   ?? '',
    locationId:    row.location_id,   // 在庫操作（移動先フィルタ）用
    status:        toInventoryStatus(row.status),
    minStock:      0,
    maxStock:      0,
    receivedDate:  row.received_date ? formatDate(row.received_date) : undefined,
    lotNumber:     row.lot_no      ?? undefined,
    expiryDate:    row.expiry_date ? formatDate(row.expiry_date) : undefined,
    updatedAt:     formatDate(row.updated_at),
  }
}

// ─── 在庫一覧を全件取得 ───────────────────────────────────────

export async function fetchInventory(scope: QueryScope): Promise<{
  data:  InventoryItem[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('inventory')
    .select(`
      id, product_id, location_id, on_hand_qty, allocated_qty, status, received_date, lot_no, expiry_date, updated_at,
      products  ( product_code, product_name_ja, category, unit ),
      locations ( location_code )
    `)
    .eq('tenant_id',    scope.tenantId)
    .eq('warehouse_id', scope.warehouseId)
    // 入庫日昇順（古い在庫が先頭＝FIFO 視点での表示順）。nulls last
    .order('received_date', { ascending: true, nullsFirst: false })
    .order('updated_at',    { ascending: false })

  if (error) return { data: [], error: error.message }

  return {
    data:  (data as unknown as InventoryRow[]).map(toInventoryItem),
    error: null,
  }
}

// =============================================================
// ロケーション選択肢（在庫移動モーダル用）
// =============================================================

export type LocationOption = { id: string; code: string; name: string }

type LocationRaw = { id: string; location_code: string; location_name: string | null }

export async function fetchLocationOptions(warehouseId: string): Promise<{
  data:  LocationOption[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('locations')
    .select('id, location_code, location_name')
    .eq('warehouse_id', warehouseId)
    .order('location_code')

  if (error) return { data: [], error: error.message }

  return {
    data: (data as unknown as LocationRaw[]).map((l) => ({
      id:   l.id,
      code: l.location_code,
      name: l.location_name ?? '',
    })),
    error: null,
  }
}

// =============================================================
// 在庫移動
// 移動元の available_qty 範囲のみ移動可能（allocated_qty は変更しない）
// 移動先に同一 (product_id, location_id, status, received_date) が存在すれば加算、
// なければ新規 INSERT する。
// =============================================================

export async function moveInventory(params: {
  inventoryId:           string
  destinationLocationId: string
  moveQty:               number
  reason?:               string
}): Promise<{ error: string | null }> {
  const { inventoryId, destinationLocationId, moveQty, reason } = params

  if (moveQty <= 0) return { error: '移動数量は1以上を指定してください' }

  const executedBy = await getCurrentUserId()

  const { data, error } = await rpc('rpc_move_inventory', {
    p_inventory_id:            inventoryId,
    p_destination_location_id: destinationLocationId,
    p_move_qty:                moveQty,
    p_reason:                  reason ?? null,
    p_executed_by:             executedBy,
  })

  if (error) return { error: String(error) }
  return { error: data?.error ?? null }
}

// =============================================================
// 在庫数量調整
// adjustType:
//   'increase' → on_hand_qty += qty
//   'decrease' → on_hand_qty -= qty
//   'set'      → on_hand_qty = qty（実棚上書き）
// ルール: 結果 >= 0 かつ 結果 >= allocated_qty
// reason は将来の inventory_transactions テーブル用（現時点は記録なし）
// =============================================================

export async function adjustInventory(params: {
  inventoryId: string
  adjustType:  'increase' | 'decrease' | 'set'
  qty:         number
  reason:      string
  note?:       string
}): Promise<{ error: string | null }> {
  const { inventoryId, adjustType, qty, reason, note } = params

  if (qty < 0) return { error: '数量は0以上を指定してください' }

  const executedBy = await getCurrentUserId()

  const { data, error } = await rpc('rpc_adjust_inventory', {
    p_inventory_id: inventoryId,
    p_adjust_type:  adjustType,
    p_qty:          qty,
    p_reason:       reason ?? null,
    p_note:         note   ?? null,
    p_executed_by:  executedBy,
  })

  if (error) return { error: String(error) }
  return { error: data?.error ?? null }
}

// =============================================================
// 在庫ステータス変更（数量分割）
// 移動元の available_qty 範囲で changeQty 分を newStatus へ移す。
// 移動先に同一 (product_id, location_id, received_date) + newStatus が存在すれば加算、
// なければ新規 INSERT する。
// =============================================================

export async function changeInventoryStatus(params: {
  inventoryId: string
  newStatus:   InventoryStatus
  changeQty:   number
  reason?:     string
}): Promise<{ error: string | null }> {
  const { inventoryId, newStatus, changeQty, reason } = params

  if (changeQty <= 0) return { error: '変更数量は1以上を指定してください' }

  const executedBy = await getCurrentUserId()

  const { data, error } = await rpc('rpc_change_inventory_status', {
    p_inventory_id: inventoryId,
    p_new_status:   newStatus,
    p_change_qty:   changeQty,
    p_reason:       reason ?? null,
    p_executed_by:  executedBy,
  })

  if (error) return { error: String(error) }
  return { error: data?.error ?? null }
}
