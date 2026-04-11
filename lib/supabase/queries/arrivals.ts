import { supabase } from '@/lib/supabase/client'
import type { ArrivalStatus } from '@/lib/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (table: string) => (supabase as any).from(table)

// =============================================================
// Raw DB 型
// =============================================================

type ArrivalRow = {
  id:                  string
  arrival_no:          string
  arrival_date:        string
  planned_qty:         number
  received_qty:        number
  product_id:          string
  planned_location_id: string | null
  status:              string
  memo:                string | null
  created_at:          string
  suppliers: { id: string; supplier_name_ja: string } | null
  products:  { product_code: string; product_name_ja: string; unit: string } | null
}
type LocationRow = { id: string; location_code: string }

// =============================================================
// エクスポート型
// =============================================================

/** 入荷予定グループ内の1明細 */
export type ArrivalGroupItem = {
  id:          string
  productId:   string
  productCode: string
  productName: string
  unit:        string
  scheduledQty: number
  receivedQty:  number
  locationId:   string
  locationCode: string
  status:       ArrivalStatus
}

/** arrival_no 単位でまとめた入荷予定 */
export type ArrivalGroup = {
  arrivalNo:    string
  supplierId:   string
  supplierName: string
  arrivalDate:  string
  status:       ArrivalStatus  // items から導出
  items:        ArrivalGroupItem[]
  createdAt:    string
  memo:         string | null
}

/** フォーム用マスタ選択肢 */
export type SupplierOption = { id: string; code: string; name: string }
export type ProductOption  = { id: string; code: string; name: string; unit: string }
export type LocationOption = { id: string; code: string }

// =============================================================
// ステータスマッピング（receiving.ts と共通ロジック）
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

/** グループ全体のステータスを items から導出 */
function deriveGroupStatus(items: ArrivalGroupItem[]): ArrivalStatus {
  const active = items.filter((i) => i.status !== 'cancelled')
  if (active.length === 0) return 'cancelled'
  if (active.every((i) => i.status === 'completed')) return 'completed'
  if (active.some((i) => i.status === 'completed' || i.status === 'partial')) return 'partial'
  return 'pending'
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

export async function fetchArrivalGroups(): Promise<{
  data:  ArrivalGroup[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('arrivals')
    .select(`
      id, arrival_no, arrival_date, planned_qty, received_qty,
      product_id, planned_location_id, status, memo, created_at,
      suppliers ( id, supplier_name_ja ),
      products  ( product_code, product_name_ja, unit )
    `)
    .order('arrival_no', { ascending: false })

  if (error) return { data: [], error: error.message }

  const rows = data as unknown as ArrivalRow[]

  // location_id → location_code 一括解決
  const locationIds = [
    ...new Set(
      rows.map((r) => r.planned_location_id).filter((v): v is string => v !== null)
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

  // arrival_no でグループ化
  const groupMap = new Map<string, ArrivalGroup>()
  for (const row of rows) {
    const locationId = row.planned_location_id ?? ''
    const item: ArrivalGroupItem = {
      id:           row.id,
      productId:    row.product_id,
      productCode:  row.products?.product_code    ?? '',
      productName:  row.products?.product_name_ja ?? '',
      unit:         row.products?.unit            ?? '',
      scheduledQty: Number(row.planned_qty),
      receivedQty:  Number(row.received_qty),
      locationId,
      locationCode: locationId ? (locationMap[locationId] ?? '') : '',
      status:       toArrivalStatus(row.status),
    }

    if (!groupMap.has(row.arrival_no)) {
      groupMap.set(row.arrival_no, {
        arrivalNo:    row.arrival_no,
        supplierId:   row.suppliers?.id              ?? '',
        supplierName: row.suppliers?.supplier_name_ja ?? '',
        arrivalDate:  formatDate(row.arrival_date),
        status:       'pending',   // 後で導出
        items:        [],
        createdAt:    formatDate(row.created_at),
        memo:         row.memo,
      })
    }
    groupMap.get(row.arrival_no)!.items.push(item)
  }

  const groups: ArrivalGroup[] = Array.from(groupMap.values()).map((g) => ({
    ...g,
    status: deriveGroupStatus(g.items),
  }))

  return { data: groups, error: null }
}

// =============================================================
// フォーム用マスタ選択肢取得
// =============================================================

export async function fetchSupplierOptions(): Promise<{
  data:  SupplierOption[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, supplier_code, supplier_name_ja')
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

export async function fetchProductOptions(): Promise<{
  data:  ProductOption[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('products')
    .select('id, product_code, product_name_ja, unit')
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

export async function fetchLocationOptions(): Promise<{
  data:  LocationOption[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('locations')
    .select('id, location_code')
    .eq('status', 'active')
    .order('location_code')

  if (error) return { data: [], error: error.message }
  return {
    data: (data as unknown as LocationRow[]).map((l) => ({
      id:   l.id,
      code: l.location_code,
    })),
    error: null,
  }
}

// =============================================================
// 入荷予定番号の自動採番
// =============================================================

export async function generateArrivalNo(): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `ARR-${year}-`

  const { data } = await supabase
    .from('arrivals')
    .select('arrival_no')
    .like('arrival_no', `${prefix}%`)
    .order('arrival_no', { ascending: false })
    .limit(1)

  const rows   = data as unknown as Array<{ arrival_no: string }> | null
  const last   = rows?.[0]?.arrival_no
  const lastNum = last ? parseInt(last.replace(prefix, ''), 10) : 0
  return `${prefix}${String(lastNum + 1).padStart(4, '0')}`
}

// =============================================================
// 入荷予定登録（1バッチ = 同じ arrival_no で複数行 INSERT）
// =============================================================

export async function createArrivalBatch(params: {
  arrivalNo:   string
  supplierId:  string
  arrivalDate: string   // YYYY-MM-DD
  memo?:       string
  items: Array<{
    productId:         string
    plannedQty:        number
    plannedLocationId: string | null
  }>
}): Promise<{ error: string | null }> {
  const { arrivalNo, supplierId, arrivalDate, memo, items } = params

  const rows = items.map((item) => ({
    arrival_no:          arrivalNo,
    supplier_id:         supplierId,
    arrival_date:        arrivalDate,
    product_id:          item.productId,
    planned_qty:         item.plannedQty,
    received_qty:        0,
    planned_location_id: item.plannedLocationId ?? null,
    status:              'planned',
    memo:                memo ?? null,
  }))

  const { error } = await from('arrivals').insert(rows)
  if (error) return { error: error.message }
  return { error: null }
}
