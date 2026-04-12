import { supabase } from '@/lib/supabase/client'
import type { ArrivalStatus, QueryScope } from '@/lib/types'

// Supabase typed client が DML の Insert/Update 型を never に解決するため、
// INSERT / UPDATE のみ any キャストで回避する。SELECT は typed client を使用。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dml = (table: string) => (supabase as any).from(table)

// =============================================================
// Raw DB 型（SELECT の JOIN 結果）
// =============================================================

/** arrival_headers + nested joins の生データ */
type HeaderRaw = {
  id:           string
  arrival_no:   string
  supplier_id:  string
  arrival_date: string
  status:       string
  memo:         string | null
  created_at:   string
  suppliers: { supplier_name_ja: string } | null
  arrival_lines: LineRaw[]
}

/** arrival_lines + nested joins の生データ */
type LineRaw = {
  id:                  string
  line_no:             number
  product_id:          string
  planned_qty:         number
  received_qty:        number
  planned_location_id: string | null
  status:              string
  lot_no:              string | null   // migration_v3 で追加
  expiry_date:         string | null   // migration_v3 で追加（YYYY-MM-DD）
  products: { product_code: string; product_name_ja: string; unit: string } | null
}

type LocationRow = { id: string; location_code: string; location_name: string }

// =============================================================
// エクスポート型
// =============================================================

/** 入荷予定の1明細（arrival_lines 1行に対応） */
export type ArrivalLineItem = {
  id:          string   // arrival_lines.id
  lineNo:      number
  productId:   string
  productCode: string
  productName: string
  unit:        string
  scheduledQty: number
  receivedQty:  number
  locationId:   string
  locationCode: string
  status:       ArrivalStatus
  lotNo?:       string   // ロット番号（DB: lot_no。migration_v3 で追加）
  expiryDate?:  string   // 有効期限 YYYY-MM-DD（DB: expiry_date。FEFO のキー）
}

/** arrival_no 単位のグループ（arrival_headers 1行に対応） */
export type ArrivalGroup = {
  id:           string   // arrival_headers.id
  arrivalNo:    string
  supplierId:   string
  supplierName: string
  arrivalDate:  string
  status:       ArrivalStatus  // lines から導出
  lines:        ArrivalLineItem[]
  createdAt:    string
  memo:         string | null
}

/** フォーム用選択肢 */
export type SupplierOption = { id: string; code: string; name: string }
export type ProductOption  = { id: string; code: string; name: string; unit: string }
export type LocationOption = { id: string; code: string; name: string }

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

/**
 * lines の集計から header ステータスを導出
 *  - アクティブ line なし           → 'cancelled'
 *  - 全 active line が completed    → 'completed'
 *  - いずれかが received_qty > 0    → 'receiving'
 *  - それ以外                       → 'planned'
 */
export function deriveHeaderStatus(
  lines: Array<{ status: string; received_qty: number }>
): string {
  const active = lines.filter((l) => l.status !== 'cancelled')
  if (active.length === 0) return 'cancelled'
  if (active.every((l) => l.status === 'completed')) return 'completed'
  if (active.some((l) => (l.received_qty ?? 0) > 0)) return 'receiving'
  return 'planned'
}

function formatDate(raw: string): string {
  if (!raw) return ''
  return new Date(raw).toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
}

// =============================================================
// 入荷予定グループ一覧取得
// =============================================================

export async function fetchArrivalGroups(scope: QueryScope): Promise<{
  data:  ArrivalGroup[]
  error: string | null
}> {
  // arrival_headers + arrival_lines の入れ子 JOIN
  const { data, error } = await supabase
    .from('arrival_headers')
    .select(`
      id, arrival_no, supplier_id, arrival_date, status, memo, created_at,
      suppliers ( supplier_name_ja ),
      arrival_lines (
        id, line_no, product_id, planned_qty, received_qty,
        planned_location_id, status, lot_no, expiry_date,
        products ( product_code, product_name_ja, unit )
      )
    `)
    .eq('tenant_id',    scope.tenantId)
    .eq('warehouse_id', scope.warehouseId)
    .order('arrival_date', { ascending: false })

  if (error) return { data: [], error: error.message }

  const headers = data as unknown as HeaderRaw[]

  // すべての planned_location_id を一括で location_code に変換
  const locationIds = [
    ...new Set(
      headers.flatMap((h) =>
        h.arrival_lines.map((l) => l.planned_location_id).filter((v): v is string => v !== null)
      )
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

  const groups: ArrivalGroup[] = headers.map((h) => {
    const lines: ArrivalLineItem[] = h.arrival_lines.map((l) => {
      const locationId = l.planned_location_id ?? ''
      return {
        id:           l.id,
        lineNo:       l.line_no,
        productId:    l.product_id,
        productCode:  l.products?.product_code    ?? '',
        productName:  l.products?.product_name_ja ?? '',
        unit:         l.products?.unit            ?? '',
        scheduledQty: Number(l.planned_qty),
        receivedQty:  Number(l.received_qty),
        locationId,
        locationCode: locationId ? (locationMap[locationId] ?? '') : '',
        status:       toArrivalStatus(l.status),
        lotNo:        l.lot_no      ?? undefined,
        expiryDate:   l.expiry_date ?? undefined,
      }
    })

    // DB の header status は lines 集計で上書き（整合性保証）
    const rawStatus = deriveHeaderStatus(
      h.arrival_lines.map((l) => ({ status: l.status, received_qty: l.received_qty }))
    )

    return {
      id:           h.id,
      arrivalNo:    h.arrival_no,
      supplierId:   h.supplier_id,
      supplierName: h.suppliers?.supplier_name_ja ?? '',
      arrivalDate:  formatDate(h.arrival_date),
      status:       toArrivalStatus(rawStatus),
      lines,
      createdAt:    formatDate(h.created_at),
      memo:         h.memo,
    }
  })

  return { data: groups, error: null }
}

// =============================================================
// フォーム用マスタ選択肢取得
// =============================================================

export async function fetchSupplierOptions(tenantId: string): Promise<{
  data:  SupplierOption[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, supplier_code, supplier_name_ja')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('supplier_code')

  if (error) return { data: [], error: error.message }
  type Row = { id: string; supplier_code: string; supplier_name_ja: string }
  return {
    data: (data as unknown as Row[]).map((r) => ({
      id:   r.id,
      code: r.supplier_code,
      name: r.supplier_name_ja,
    })),
    error: null,
  }
}

export async function fetchProductOptions(tenantId: string): Promise<{
  data:  ProductOption[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('products')
    .select('id, product_code, product_name_ja, unit')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('product_code')

  if (error) return { data: [], error: error.message }
  type Row = { id: string; product_code: string; product_name_ja: string; unit: string }
  return {
    data: (data as unknown as Row[]).map((r) => ({
      id:   r.id,
      code: r.product_code,
      name: r.product_name_ja,
      unit: r.unit,
    })),
    error: null,
  }
}

export async function fetchLocationOptions(warehouseId: string): Promise<{
  data:  LocationOption[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('locations')
    .select('id, location_code, location_name')
    .eq('warehouse_id', warehouseId)
    .eq('status', 'active')
    .order('location_code')

  if (error) return { data: [], error: error.message }
  return {
    data: (data as unknown as LocationRow[]).map((l) => ({
      id:   l.id,
      code: l.location_code,
      name: l.location_name,
    })),
    error: null,
  }
}

// =============================================================
// 入荷予定番号の自動採番（arrival_headers から最新を取得）
// =============================================================

export async function generateArrivalNo(scope: QueryScope): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `ARR-${year}-`

  const { data } = await supabase
    .from('arrival_headers')
    .select('arrival_no')
    .eq('tenant_id', scope.tenantId)
    .like('arrival_no', `${prefix}%`)
    .order('arrival_no', { ascending: false })
    .limit(1)

  type Row = { arrival_no: string }
  const rows    = data as unknown as Row[] | null
  const last    = rows?.[0]?.arrival_no
  const lastNum = last ? parseInt(last.replace(prefix, ''), 10) : 0
  return `${prefix}${String(lastNum + 1).padStart(4, '0')}`
}

// =============================================================
// 入荷予定登録（header 1件 + lines N件）
// =============================================================

export async function createArrivalBatch(params: {
  arrivalNo:   string
  supplierId:  string
  arrivalDate: string  // YYYY-MM-DD
  memo?:       string
  scope:       QueryScope
  items: Array<{
    productId:          string
    plannedQty:         number
    plannedLocationId?: string | null   // 入庫処理時に選択するため省略可
  }>
}): Promise<{ error: string | null }> {
  const { arrivalNo, supplierId, arrivalDate, memo, scope, items } = params

  // ── Step 1: arrival_headers を INSERT して id を取得 ──────
  const { data: headerData, error: headerErr } = await dml('arrival_headers')
    .insert({
      arrival_no:   arrivalNo,
      supplier_id:  supplierId,
      arrival_date: arrivalDate,
      status:       'planned',
      memo:         memo ?? null,
      tenant_id:    scope.tenantId,
      warehouse_id: scope.warehouseId,
    })
    .select('id')
    .single()

  if (headerErr) return { error: `ヘッダー登録エラー: ${headerErr.message}` }

  const headerId = (headerData as unknown as { id: string }).id

  // ── Step 2: arrival_lines を一括 INSERT ──────────────────
  const lines = items.map((item, idx) => ({
    header_id:            headerId,
    line_no:              idx + 1,
    product_id:           item.productId,
    planned_qty:          item.plannedQty,
    received_qty:         0,
    planned_location_id:  item.plannedLocationId ?? null,
    status:               'planned',
    tenant_id:            scope.tenantId,
    warehouse_id:         scope.warehouseId,
  }))

  const { error: linesErr } = await dml('arrival_lines').insert(lines)

  if (linesErr) return { error: `明細登録エラー: ${linesErr.message}` }

  return { error: null }
}
