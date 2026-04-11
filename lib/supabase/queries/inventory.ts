import { supabase } from '@/lib/supabase/client'
import type { InventoryItem, InventoryStatus } from '@/lib/types'

// ─── Supabase SELECT の結合結果型 ─────────────────────────────

type InventoryRow = {
  id:         string
  qty:        number
  status:     string
  updated_at: string
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
// DB には 'available' | 'damaged' | 'hold' のみ入る想定。
// 移行前の旧値や予期しない値が来てもクラッシュしない。

function toInventoryStatus(raw: string): InventoryStatus {
  if (raw === 'available' || raw === 'damaged' || raw === 'hold') return raw
  return 'available'   // 未知値は available として扱う
}

// ─── Supabase Row → アプリ内 InventoryItem ────────────────────

function toInventoryItem(row: InventoryRow): InventoryItem {
  const p = row.products
  const l = row.locations
  return {
    id:           row.id,
    productCode:  p?.product_code    ?? '',
    productName:  p?.product_name_ja ?? '',
    category:     p?.category        ?? '',
    quantity:     row.qty,
    unit:         p?.unit            ?? '',
    locationCode: l?.location_code   ?? '',
    status:       toInventoryStatus(row.status),
    minStock:     0,
    maxStock:     0,
    updatedAt:    row.updated_at
      ? new Date(row.updated_at).toLocaleDateString('ja-JP', {
          year: 'numeric', month: '2-digit', day: '2-digit',
        })
      : '',
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
      id, qty, status, updated_at,
      products  ( product_code, product_name_ja, category, unit ),
      locations ( location_code )
    `)
    .order('updated_at', { ascending: false })

  if (error) return { data: [], error: error.message }

  return {
    data:  (data as unknown as InventoryRow[]).map(toInventoryItem),
    error: null,
  }
}
