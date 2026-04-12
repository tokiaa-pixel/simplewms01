import { supabase } from '@/lib/supabase/client'
import type { InventoryItem, InventoryStatus } from '@/lib/types'

// INSERT / UPDATE は typed client が never を返すため any キャストで回避
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dml = (table: string) => (supabase as any).from(table)

// ─── Supabase SELECT の結合結果型 ─────────────────────────────

type InventoryRow = {
  id:            string
  product_id:    string        // 在庫操作（移動・ステータス変更）のキー
  location_id:   string        // 在庫操作（移動フィルタ）のキー
  on_hand_qty:   number
  allocated_qty: number
  status:        string
  received_date: string | null
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

/** 在庫操作（move/adjust/status）で DB から取得する最小情報 */
type InventoryOpRow = {
  id:            string
  product_id:    string
  location_id:   string
  on_hand_qty:   number
  allocated_qty: number
  status:        string
  received_date: string | null
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
    updatedAt:     formatDate(row.updated_at),
  }
}

// ─── 在庫一覧を全件取得 ───────────────────────────────────────

export async function fetchInventory(): Promise<{
  data:  InventoryItem[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('inventory')
    .select(`
      id, product_id, location_id, on_hand_qty, allocated_qty, status, received_date, updated_at,
      products  ( product_code, product_name_ja, category, unit ),
      locations ( location_code )
    `)
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

export async function fetchLocationOptions(): Promise<{
  data:  LocationOption[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('locations')
    .select('id, location_code, location_name')
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
}): Promise<{ error: string | null }> {
  const { inventoryId, destinationLocationId, moveQty } = params

  if (moveQty <= 0) return { error: '移動数量は1以上を指定してください' }

  try {
    // ── Step 1: 移動元を取得 ─────────────────────────────────────
    const { data: srcRaw, error: srcErr } = await supabase
      .from('inventory')
      .select('id, product_id, location_id, on_hand_qty, allocated_qty, status, received_date')
      .eq('id', inventoryId)
      .single()

    if (srcErr) throw new Error(`在庫取得エラー: ${srcErr.message}`)
    const src = srcRaw as unknown as InventoryOpRow

    if (src.location_id === destinationLocationId) {
      return { error: '移動元と移動先のロケーションが同じです' }
    }

    const availableQty = Math.max(0, (src.on_hand_qty ?? 0) - (src.allocated_qty ?? 0))
    if (moveQty > availableQty) {
      return { error: `引当可能数（${availableQty}）を超える移動はできません` }
    }

    // ── Step 2: 移動元の on_hand_qty を減算 ─────────────────────
    const { error: srcUpdateErr } = await dml('inventory')
      .update({ on_hand_qty: src.on_hand_qty - moveQty })
      .eq('id', inventoryId)

    if (srcUpdateErr) throw new Error(`移動元更新エラー: ${srcUpdateErr.message}`)

    // ── Step 3: 移動先を検索（同一 product×location×status×received_date）────
    const baseQuery = supabase
      .from('inventory')
      .select('id, on_hand_qty')
      .eq('product_id',  src.product_id)
      .eq('location_id', destinationLocationId)
      .eq('status',      src.status)

    const destQuery = src.received_date === null
      ? baseQuery.is('received_date', null)
      : baseQuery.eq('received_date', src.received_date)

    const { data: dstRaw } = await destQuery.maybeSingle()
    type DstRow = { id: string; on_hand_qty: number }
    const dst = dstRaw as unknown as DstRow | null

    // ── Step 4: 移動先 upsert ────────────────────────────────────
    if (dst) {
      const { error: dstUpdateErr } = await dml('inventory')
        .update({ on_hand_qty: (dst.on_hand_qty ?? 0) + moveQty })
        .eq('id', dst.id)
      if (dstUpdateErr) throw new Error(`移動先更新エラー: ${dstUpdateErr.message}`)
    } else {
      const { error: dstInsertErr } = await dml('inventory')
        .insert({
          product_id:    src.product_id,
          location_id:   destinationLocationId,
          on_hand_qty:   moveQty,
          allocated_qty: 0,
          status:        src.status,
          received_date: src.received_date ?? null,
        })
      if (dstInsertErr) throw new Error(`移動先登録エラー: ${dstInsertErr.message}`)
    }

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '不明なエラーが発生しました' }
  }
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
  reason:      string   // TODO: inventory_transactions に記録予定
}): Promise<{ error: string | null }> {
  const { inventoryId, adjustType, qty } = params

  if (qty < 0) return { error: '数量は0以上を指定してください' }

  try {
    const { data: srcRaw, error: srcErr } = await supabase
      .from('inventory')
      .select('id, on_hand_qty, allocated_qty')
      .eq('id', inventoryId)
      .single()

    if (srcErr) throw new Error(`在庫取得エラー: ${srcErr.message}`)
    type SrcRow = { id: string; on_hand_qty: number; allocated_qty: number }
    const src = srcRaw as unknown as SrcRow

    const newQty = adjustType === 'increase' ? (src.on_hand_qty + qty)
                 : adjustType === 'decrease' ? (src.on_hand_qty - qty)
                 : qty  // 'set'

    if (newQty < 0) {
      return { error: `調整後の在庫数が負数になります（現在: ${src.on_hand_qty}、調整後: ${newQty}）` }
    }
    if (newQty < (src.allocated_qty ?? 0)) {
      return {
        error: `引当済み数量（${src.allocated_qty}）を下回ります。引当を解除してから調整してください。`,
      }
    }

    const { error: updateErr } = await dml('inventory')
      .update({ on_hand_qty: newQty })
      .eq('id', inventoryId)

    if (updateErr) throw new Error(`数量更新エラー: ${updateErr.message}`)

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '不明なエラーが発生しました' }
  }
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
}): Promise<{ error: string | null }> {
  const { inventoryId, newStatus, changeQty } = params

  if (changeQty <= 0) return { error: '変更数量は1以上を指定してください' }

  try {
    // ── Step 1: 元在庫を取得 ─────────────────────────────────────
    const { data: srcRaw, error: srcErr } = await supabase
      .from('inventory')
      .select('id, product_id, location_id, on_hand_qty, allocated_qty, status, received_date')
      .eq('id', inventoryId)
      .single()

    if (srcErr) throw new Error(`在庫取得エラー: ${srcErr.message}`)
    const src = srcRaw as unknown as InventoryOpRow

    if (src.status === newStatus) return { error: '変更先ステータスが現在と同じです' }

    const availableQty = Math.max(0, (src.on_hand_qty ?? 0) - (src.allocated_qty ?? 0))
    if (changeQty > availableQty) {
      return { error: `引当可能数（${availableQty}）を超えるステータス変更はできません` }
    }

    // ── Step 2: 元在庫の on_hand_qty を減算 ─────────────────────
    const { error: srcUpdateErr } = await dml('inventory')
      .update({ on_hand_qty: src.on_hand_qty - changeQty })
      .eq('id', inventoryId)

    if (srcUpdateErr) throw new Error(`元在庫更新エラー: ${srcUpdateErr.message}`)

    // ── Step 3: 変更先を検索（同一 product×location×received_date + newStatus）
    const baseQuery = supabase
      .from('inventory')
      .select('id, on_hand_qty')
      .eq('product_id',  src.product_id)
      .eq('location_id', src.location_id)
      .eq('status',      newStatus)

    const dstQuery = src.received_date === null
      ? baseQuery.is('received_date', null)
      : baseQuery.eq('received_date', src.received_date)

    const { data: dstRaw } = await dstQuery.maybeSingle()
    type DstRow = { id: string; on_hand_qty: number }
    const dst = dstRaw as unknown as DstRow | null

    // ── Step 4: 変更先 upsert ────────────────────────────────────
    if (dst) {
      const { error: dstUpdateErr } = await dml('inventory')
        .update({ on_hand_qty: (dst.on_hand_qty ?? 0) + changeQty })
        .eq('id', dst.id)
      if (dstUpdateErr) throw new Error(`変更先更新エラー: ${dstUpdateErr.message}`)
    } else {
      const { error: dstInsertErr } = await dml('inventory')
        .insert({
          product_id:    src.product_id,
          location_id:   src.location_id,
          on_hand_qty:   changeQty,
          allocated_qty: 0,
          status:        newStatus,
          received_date: src.received_date ?? null,
        })
      if (dstInsertErr) throw new Error(`変更先登録エラー: ${dstInsertErr.message}`)
    }

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '不明なエラーが発生しました' }
  }
}
