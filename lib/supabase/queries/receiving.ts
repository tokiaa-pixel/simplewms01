import { supabase } from '@/lib/supabase/client'
import type { ArrivalStatus } from '@/lib/types'

// =============================================================
// 型定義
// =============================================================

/** Supabase から返ってくる生データ */
type ArrivalRow = {
  id:                  string
  arrival_no:          string
  arrival_date:        string
  planned_qty:         number
  received_qty:        number
  product_id:          string
  planned_location_id: string | null
  actual_location_id:  string | null
  status:              string
  memo:                string | null
  suppliers: {
    supplier_name_ja: string
  } | null
  products: {
    product_code:    string
    product_name_ja: string
    unit:            string
  } | null
  // planned_location の JOIN（エイリアスは Supabase では使えないので別途解決）
  planned_location:  { location_code: string } | null
  actual_location:   { location_code: string } | null
}

/** UI で使う整形済み入荷データ */
export type ArrivalDisplay = {
  id:              string   // arrivals.id（UUID）
  arrivalNo:       string   // ARR-YYYY-NNNN
  arrivalDate:     string   // YYYY/MM/DD
  supplierName:    string
  productId:       string   // UUID（inventory upsert 用）
  productCode:     string
  productName:     string
  unit:            string
  plannedQty:      number
  receivedQty:     number   // 累積入庫済み数量
  locationId:      string   // actual_location_id ?? planned_location_id
  locationCode:    string
  status:          ArrivalStatus
  memo:            string | null
}

// =============================================================
// DB status → アプリ status マッピング
// =============================================================

function toArrivalStatus(raw: string): ArrivalStatus {
  switch (raw) {
    case 'planned':   return 'pending'
    case 'receiving': return 'partial'
    case 'completed': return 'completed'
    case 'cancelled': return 'cancelled'
    default:          return 'pending'
  }
}

// =============================================================
// 入荷一覧取得
// =============================================================

export async function fetchArrivals(): Promise<{
  data: ArrivalDisplay[]
  error: string | null
}> {
  // Supabase では同じテーブルを別FK で2回 JOIN できないため
  // planned_location_id / actual_location_id は別クエリで解決する
  const { data, error } = await supabase
    .from('arrivals')
    .select(`
      id,
      arrival_no,
      arrival_date,
      planned_qty,
      received_qty,
      product_id,
      planned_location_id,
      actual_location_id,
      status,
      memo,
      suppliers ( supplier_name_ja ),
      products  ( product_code, product_name_ja, unit )
    `)
    .order('arrival_date', { ascending: false })

  if (error) return { data: [], error: error.message }

  // location_code を取得するため、使われる location_id を一括クエリ
  const locationIds = Array.from(
    new Set(
      (data as ArrivalRow[]).flatMap((r) =>
        [r.actual_location_id, r.planned_location_id].filter(Boolean) as string[]
      )
    )
  )

  let locationMap: Record<string, string> = {}
  if (locationIds.length > 0) {
    const { data: locs } = await supabase
      .from('locations')
      .select('id, location_code')
      .in('id', locationIds)
    if (locs) {
      locationMap = Object.fromEntries(locs.map((l) => [l.id, l.location_code]))
    }
  }

  const items: ArrivalDisplay[] = (data as ArrivalRow[]).map((row) => {
    const locationId = row.actual_location_id ?? row.planned_location_id ?? ''
    return {
      id:           row.id,
      arrivalNo:    row.arrival_no,
      arrivalDate:  row.arrival_date
        ? new Date(row.arrival_date).toLocaleDateString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit',
          })
        : '',
      supplierName: row.suppliers?.supplier_name_ja ?? '',
      productId:    row.product_id,
      productCode:  row.products?.product_code    ?? '',
      productName:  row.products?.product_name_ja ?? '',
      unit:         row.products?.unit            ?? '',
      plannedQty:   Number(row.planned_qty),
      receivedQty:  Number(row.received_qty),
      locationId,
      locationCode: locationId ? (locationMap[locationId] ?? '') : '',
      status:       toArrivalStatus(row.status),
      memo:         row.memo,
    }
  })

  return { data: items, error: null }
}

// =============================================================
// 入庫確定：inventory 更新 + arrivals.status 更新
// =============================================================

export async function confirmArrivalReceiving(params: {
  arrivalId:   string
  productId:   string
  locationId:  string
  addQty:      number   // 今回入庫する数量
  totalPlannedQty:  number
  totalReceivedQty: number  // 今回分を足した後の累積値
}): Promise<{ error: string | null }> {
  const { arrivalId, productId, locationId, addQty, totalPlannedQty, totalReceivedQty } = params

  if (addQty <= 0) return { error: '入庫数量は1以上を指定してください' }
  if (!locationId)  return { error: 'ロケーションが設定されていません' }

  try {
    // ── Step 1: 在庫の既存レコードを確認 ──────────────────────
    const { data: existing, error: selectErr } = await supabase
      .from('inventory')
      .select('id, qty')
      .eq('product_id', productId)
      .eq('location_id', locationId)
      .maybeSingle()

    if (selectErr) throw new Error(`在庫検索エラー: ${selectErr.message}`)

    // ── Step 2: inventory を upsert（加算 or 新規） ───────────
    if (existing) {
      // 既存レコードあり → qty を加算
      const newQty = Math.max(0, existing.qty + addQty)
      const { error: updateErr } = await supabase
        .from('inventory')
        .update({ qty: newQty, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      if (updateErr) throw new Error(`在庫更新エラー: ${updateErr.message}`)
    } else {
      // 既存レコードなし → 新規 INSERT
      const { error: insertErr } = await supabase
        .from('inventory')
        .insert({
          product_id:  productId,
          location_id: locationId,
          qty:         addQty,
          status:      'available',
        })

      if (insertErr) throw new Error(`在庫登録エラー: ${insertErr.message}`)
    }

    // ── Step 3: arrivals を更新 ────────────────────────────────
    const isCompleted = totalReceivedQty >= totalPlannedQty
    const newStatus   = isCompleted ? 'completed' : 'receiving'

    const { error: arrivalErr } = await supabase
      .from('arrivals')
      .update({
        received_qty: totalReceivedQty,
        status:       newStatus,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', arrivalId)

    if (arrivalErr) throw new Error(`入荷状態更新エラー: ${arrivalErr.message}`)

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '不明なエラーが発生しました' }
  }
}
