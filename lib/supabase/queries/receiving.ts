import { supabase } from '@/lib/supabase/client'
import type { ArrivalStatus } from '@/lib/types'

// Helper: bypass typed-client generics for DML (Insert/Update resolve as never with self-referential types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (table: string) => (supabase as any).from(table)

// =============================================================
// 型定義
// =============================================================

/** Supabase から返ってくる arrivals + JOIN の生データ */
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
  suppliers: { supplier_name_ja: string } | null
  products:  { product_code: string; product_name_ja: string; unit: string } | null
}

/** locations 一括取得の生データ */
type LocationRow = { id: string; location_code: string }

/** inventory SELECT の生データ */
type InventoryRow = { id: string; qty: number }

/** UI で使う整形済み入荷データ */
export type ArrivalDisplay = {
  id:           string
  arrivalNo:    string
  arrivalDate:  string
  supplierName: string
  productId:    string
  productCode:  string
  productName:  string
  unit:         string
  plannedQty:   number
  receivedQty:  number
  locationId:   string
  locationCode: string
  status:       ArrivalStatus
  memo:         string | null
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

  const rows = data as unknown as ArrivalRow[]

  // planned_location_id / actual_location_id を location_code に変換（一括取得）
  const locationIds = Array.from(
    new Set(
      rows.flatMap((r) =>
        [r.actual_location_id, r.planned_location_id].filter((v): v is string => v !== null)
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
      locationMap = Object.fromEntries(
        (locs as unknown as LocationRow[]).map((l) => [l.id, l.location_code])
      )
    }
  }

  const items: ArrivalDisplay[] = rows.map((row) => {
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
  arrivalId:        string
  productId:        string
  locationId:       string
  addQty:           number   // 今回入庫する数量
  totalPlannedQty:  number
  totalReceivedQty: number   // 今回分を加えた後の累積値
}): Promise<{ error: string | null }> {
  const { arrivalId, productId, locationId, addQty, totalPlannedQty, totalReceivedQty } = params

  if (addQty <= 0)   return { error: '入庫数量は1以上を指定してください' }
  if (!locationId)   return { error: 'ロケーションが設定されていません' }

  try {
    // ── Step 1: 在庫の既存レコードを確認 ──────────────────────
    const { data: existingRaw, error: selectErr } = await supabase
      .from('inventory')
      .select('id, qty')
      .eq('product_id', productId)
      .eq('location_id', locationId)
      .maybeSingle()

    if (selectErr) throw new Error(`在庫検索エラー: ${selectErr.message}`)

    const existing = existingRaw as unknown as InventoryRow | null

    // ── Step 2: inventory を upsert（加算 or 新規） ───────────
    if (existing) {
      // 既存レコードあり → qty を加算
      const { error: updateErr } = await from('inventory')
        .update({ qty: Math.max(0, existing.qty + addQty) })
        .eq('id', existing.id)

      if (updateErr) throw new Error(`在庫更新エラー: ${updateErr.message}`)
    } else {
      // 既存レコードなし → 新規 INSERT
      const { error: insertErr } = await from('inventory')
        .insert({
          product_id:  productId,
          location_id: locationId,
          qty:         addQty,
          status:      'available',
        })

      if (insertErr) throw new Error(`在庫登録エラー: ${insertErr.message}`)
    }

    // ── Step 3: arrivals を更新 ────────────────────────────────
    const { error: arrivalErr } = await from('arrivals')
      .update({
        received_qty: totalReceivedQty,
        status:       totalReceivedQty >= totalPlannedQty ? 'completed' : 'receiving',
      })
      .eq('id', arrivalId)

    if (arrivalErr) throw new Error(`入荷状態更新エラー: ${arrivalErr.message}`)

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '不明なエラーが発生しました' }
  }
}
