import { supabase } from '@/lib/supabase/client'
import type { InventoryItem, InventoryStatus } from '@/lib/types'

// Supabase の status 値 → アプリ内 InventoryStatus へのマッピング
// DB: 'available' | 'hold' | 'damaged'
// App: 'normal'   | 'low'  | 'out_of_stock' | 'excess'
function toInventoryStatus(raw: string): InventoryStatus {
  switch (raw) {
    case 'available':    return 'normal'
    case 'hold':         return 'low'          // 保留中 → 残少扱い
    case 'damaged':      return 'out_of_stock' // 破損品 → 在庫なし扱い
    // 旧値との後方互換
    case 'in_stock':     return 'normal'
    case 'low_stock':    return 'low'
    case 'out_of_stock': return 'out_of_stock'
    case 'excess':       return 'excess'
    // 未知の値でも落とさない
    default:             return 'normal'
  }
}

// ─── Supabase から返ってくる結合レスポンスの型 ────────────────
// 実際のテーブル構造に合わせた型定義

type InventoryRow = {
  id:          string
  qty:         number
  status:      string
  updated_at:  string
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

// ─── Supabase Row → アプリ内 InventoryItem に変換 ─────────────

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
        }).replace(/\//g, '/')
      : '',
  }
}

// ─── 在庫一覧を全件取得 ───────────────────────────────────────

export async function fetchInventory(): Promise<{
  data: InventoryItem[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('inventory')
    .select(`
      id,
      qty,
      status,
      updated_at,
      products (
        product_code,
        product_name_ja,
        category,
        unit
      ),
      locations (
        location_code
      )
    `)
    .order('updated_at', { ascending: false })

  if (error) {
    return { data: [], error: error.message }
  }

  const items = (data as InventoryRow[]).map(toInventoryItem)
  return { data: items, error: null }
}
