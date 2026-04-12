import { supabase } from '@/lib/supabase/client'
import type { ArrivalStatus, InventoryStatus, QueryScope } from '@/lib/types'
import { deriveHeaderStatus } from './arrivals'

// Supabase typed client が DML の Insert/Update 型を never に解決するため、
// INSERT / UPDATE のみ any キャストで回避する。SELECT は typed client を使用。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dml = (table: string) => (supabase as any).from(table)

// =============================================================
// Raw DB 型
// =============================================================

/**
 * arrival_lines に arrival_headers・products を JOIN した生データ
 * （FROM arrival_lines の視点）
 */
type LineRaw = {
  id:                  string
  line_no:             number
  product_id:          string
  planned_qty:         number
  received_qty:        number
  planned_location_id: string | null
  actual_location_id:  string | null
  status:              string
  memo:                string | null
  products: { product_code: string; product_name_ja: string; unit: string } | null
  arrival_headers: {
    id:           string
    arrival_no:   string
    arrival_date: string
    suppliers: { supplier_name_ja: string } | null
  } | null
}

type LocationRow   = { id: string; location_code: string }
type InventoryRow  = { id: string; on_hand_qty: number; allocated_qty: number }
type SiblingRow    = { status: string; received_qty: number }

// =============================================================
// 型定義
// =============================================================

/** UI で使う整形済み入庫明細データ（arrival_lines 1行に対応） */
export type ArrivalDisplay = {
  id:              string   // arrival_lines.id
  headerId:        string   // arrival_headers.id（header status 再計算に使用）
  arrivalNo:       string
  arrivalDate:     string   // 表示用フォーマット済み
  arrivalDateRaw:  string   // DB 生値 (YYYY-MM-DD)。入荷予定日の表示用（inventory.received_date には使わない）
  supplierName:    string
  productId:       string
  productCode:     string
  productName:     string
  unit:            string
  plannedQty:      number
  receivedQty:     number
  locationId:      string
  locationCode:    string
  status:          ArrivalStatus   // line の status を変換
  memo:            string | null
}

// =============================================================
// 内部ユーティリティ
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

function formatDate(raw: string): string {
  if (!raw) return ''
  return new Date(raw).toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
}

// =============================================================
// 入庫対象明細一覧取得（arrival_lines ベース）
// =============================================================

export async function fetchArrivals(scope: QueryScope): Promise<{
  data:  ArrivalDisplay[]
  error: string | null
}> {
  // arrival_lines から、arrival_headers・suppliers・products を JOIN
  const { data, error } = await supabase
    .from('arrival_lines')
    .select(`
      id, line_no, product_id, planned_qty, received_qty,
      planned_location_id, actual_location_id, status, memo,
      products ( product_code, product_name_ja, unit ),
      arrival_headers (
        id, arrival_no, arrival_date,
        suppliers ( supplier_name_ja )
      )
    `)
    .eq('tenant_id',    scope.tenantId)
    .eq('warehouse_id', scope.warehouseId)
    .neq('status', 'cancelled')

  if (error) return { data: [], error: error.message }

  const rows = data as unknown as LineRaw[]

  // planned_location_id を一括で location_code に変換
  const locationIds = [
    ...new Set(
      rows
        .map((r) => r.planned_location_id)
        .filter((v): v is string => v !== null)
    ),
  ]
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

  // 入荷日降順でソート（クライアントサイド）
  rows.sort((a, b) => {
    const da = a.arrival_headers?.arrival_date ?? ''
    const db = b.arrival_headers?.arrival_date ?? ''
    return db.localeCompare(da)
  })

  const items: ArrivalDisplay[] = rows.map((row) => {
    const locationId   = row.planned_location_id ?? ''
    const rawDate      = row.arrival_headers?.arrival_date ?? ''
    return {
      id:             row.id,
      headerId:       row.arrival_headers?.id          ?? '',
      arrivalNo:      row.arrival_headers?.arrival_no  ?? '',
      arrivalDate:    formatDate(rawDate),
      arrivalDateRaw: rawDate,   // YYYY-MM-DD のまま保持
      supplierName:   row.arrival_headers?.suppliers?.supplier_name_ja ?? '',
      productId:      row.product_id,
      productCode:    row.products?.product_code    ?? '',
      productName:    row.products?.product_name_ja ?? '',
      unit:           row.products?.unit            ?? '',
      plannedQty:     Number(row.planned_qty),
      receivedQty:    Number(row.received_qty),
      locationId,
      locationCode:   locationId ? (locationMap[locationId] ?? '') : '',
      status:         toArrivalStatus(row.status),
      memo:           row.memo,
    }
  })

  return { data: items, error: null }
}

// =============================================================
// 入庫確定：inventory 更新 + line 更新 + header status 再計算
// =============================================================

export async function confirmArrivalReceiving(params: {
  lineId:           string   // arrival_lines.id
  headerId:         string   // arrival_headers.id
  productId:        string
  locationId:       string
  addQty:           number   // 今回入庫する数量
  totalPlannedQty:  number
  totalReceivedQty: number   // 今回分を加えた後の累積値
  inventoryStatus:  InventoryStatus  // 入庫確定時の在庫ステータス
  receivedDate:     string   // 入庫確定日 YYYY-MM-DD（入庫処理を実行した日。arrival_date ではない）
  scope:            QueryScope
}): Promise<{ error: string | null }> {
  const { lineId, headerId, productId, locationId, addQty, totalPlannedQty, totalReceivedQty, inventoryStatus, receivedDate, scope } = params

  if (addQty <= 0)  return { error: '入庫数量は1以上を指定してください' }
  if (!locationId)  return { error: 'ロケーションが設定されていません' }

  try {
    // ── Step 1: 在庫の既存レコードを確認 ──────────────────────────
    // 検索キーは DB の一意制約 (product_id, location_id, status) に合わせる。
    // received_date を条件に含めると「日付違いの既存レコード」を見つけられず、
    // INSERT に流れて duplicate key エラーになるため含めない。
    const { data: existingRaw, error: selectErr } = await supabase
      .from('inventory')
      .select('id, on_hand_qty, allocated_qty')
      .eq('product_id',  productId)
      .eq('location_id', locationId)
      .eq('status',      inventoryStatus)
      .maybeSingle()

    if (selectErr) throw new Error(`在庫検索エラー: ${selectErr.message}`)

    const existing = existingRaw as unknown as InventoryRow | null

    // ── Step 2: inventory を upsert（加算 or 新規） ───────────
    if (existing) {
      // 同一 (product_id, location_id, status) のレコードが存在 → on_hand_qty を加算
      // received_date は最初に入庫した日付を保持し続ける（上書きしない）
      const { error: updateErr } = await dml('inventory')
        .update({ on_hand_qty: Math.max(0, existing.on_hand_qty + addQty) })
        .eq('id', existing.id)

      if (updateErr) throw new Error(`在庫更新エラー: ${updateErr.message}`)
    } else {
      // 存在しない → 新規 INSERT。received_date = 入庫確定日
      const { error: insertErr } = await dml('inventory')
        .insert({
          product_id:    productId,
          location_id:   locationId,
          on_hand_qty:   addQty,
          allocated_qty: 0,
          status:        inventoryStatus,
          received_date: receivedDate || null,
          tenant_id:     scope.tenantId,
          warehouse_id:  scope.warehouseId,
        })

      if (insertErr) throw new Error(`在庫登録エラー: ${insertErr.message}`)
    }

    // ── Step 3: arrival_lines を更新 ─────────────────────────
    const isLineComplete = totalReceivedQty >= totalPlannedQty

    const { error: lineErr } = await dml('arrival_lines')
      .update({
        received_qty:       totalReceivedQty,
        status:             isLineComplete ? 'completed' : 'receiving',
        actual_location_id: locationId,   // 入庫処理画面で選択した保管場所
      })
      .eq('id', lineId)

    if (lineErr) throw new Error(`明細更新エラー: ${lineErr.message}`)

    // ── Step 4: 同一ヘッダーの全明細を取得して header status を再計算 ──
    const { data: siblingsRaw, error: siblingsErr } = await supabase
      .from('arrival_lines')
      .select('status, received_qty')
      .eq('header_id', headerId)

    if (siblingsErr) throw new Error(`明細取得エラー: ${siblingsErr.message}`)

    const siblings  = siblingsRaw as unknown as SiblingRow[]
    const newStatus = deriveHeaderStatus(siblings)

    const { error: headerErr } = await dml('arrival_headers')
      .update({ status: newStatus })
      .eq('id', headerId)

    if (headerErr) throw new Error(`ヘッダー更新エラー: ${headerErr.message}`)

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '不明なエラーが発生しました' }
  }
}
