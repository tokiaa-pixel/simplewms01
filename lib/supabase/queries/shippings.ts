import { supabase } from '@/lib/supabase/client'
import type { InventoryStatus, ShippingStatus, QueryScope } from '@/lib/types'

// Supabase typed client が DML の Insert/Update 型を never に解決するため、
// INSERT / UPDATE のみ any キャストで回避する。SELECT は typed client を使用。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dml = (table: string) => (supabase as any).from(table)

// =============================================================
// Raw DB 型
// =============================================================

type CustomerRow = { id: string; customer_code: string; customer_name_ja: string }
type ProductRow  = {
  id:              string
  product_code:    string
  product_name_ja: string
  unit:            string
  category:        string
}
type InventoryRaw = {
  id:            string
  on_hand_qty:   number
  allocated_qty: number
  status:        string
  received_date: string | null
  locations: { id: string; location_code: string; location_name: string } | null
}

// =============================================================
// エクスポート型
// =============================================================

export type CustomerOption = { id: string; code: string; name: string }
export type ShipProductOption = {
  id:       string
  code:     string
  name:     string
  unit:     string
  category: string
}

/** 在庫1行（引当候補） */
export type InventoryLine = {
  inventoryId:  string
  locationId:   string
  locationCode: string
  locationName: string
  status:       InventoryStatus
  onHandQty:    number         // 実在庫（表示用）
  allocatedQty: number         // 引当済み（表示用）
  availableQty: number         // 引当可能 = onHandQty - allocatedQty
  receivedDate: string | null  // FIFO ソートキー（YYYY-MM-DD）
}

/** 引当の1フラグメント（1つの在庫行から何個引き当てるか） */
export type AllocationItem = {
  inventoryId:  string
  locationId:   string
  locationCode: string
  locationName: string
  status:       InventoryStatus
  availableQty: number         // その行の引当可能数（表示用）
  allocatedQty: number         // 今回引き当てる数
  receivedDate: string | null
}

// =============================================================
// 引当ステータス定数
// =============================================================

/**
 * FIFO 自動引当の対象とする在庫ステータス。
 * hold / damaged は自動引当の対象外。
 * 将来新しいステータスを追加する場合はこの配列を修正する。
 */
export const FIFO_ELIGIBLE_STATUSES: InventoryStatus[] = ['available']

// =============================================================
// 内部ユーティリティ
// =============================================================

function toInventoryStatus(raw: string): InventoryStatus {
  if (raw === 'available' || raw === 'damaged' || raw === 'hold') return raw
  return 'available'
}

// =============================================================
// マスタ選択肢取得
// =============================================================

export async function fetchCustomerOptions(tenantId: string): Promise<{
  data:  CustomerOption[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('customers')
    .select('id, customer_code, customer_name_ja')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('customer_code')

  if (error) return { data: [], error: error.message }
  return {
    data: (data as unknown as CustomerRow[]).map((r) => ({
      id:   r.id,
      code: r.customer_code,
      name: r.customer_name_ja,
    })),
    error: null,
  }
}

export async function fetchShipProductOptions(tenantId: string): Promise<{
  data:  ShipProductOption[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('products')
    .select('id, product_code, product_name_ja, unit, category')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('product_code')

  if (error) return { data: [], error: error.message }
  return {
    data: (data as unknown as ProductRow[]).map((r) => ({
      id:       r.id,
      code:     r.product_code,
      name:     r.product_name_ja,
      unit:     r.unit,
      category: r.category,
    })),
    error: null,
  }
}

// =============================================================
// FIFO 自動引当用：引当可能在庫一覧取得
// 対象：FIFO_ELIGIBLE_STATUSES（現在は 'available' のみ）
//       hold / damaged は除外される
// =============================================================

export async function fetchInventoryForProduct(
  productId: string,
  scope: QueryScope,
): Promise<{
  data:  InventoryLine[]
  error: string | null
}> {
  // FIFO_ELIGIBLE_STATUSES に含まれるステータスのみ取得（available のみ）
  // hold / damaged の在庫はここで DB 側から除外する
  const { data, error } = await supabase
    .from('inventory')
    .select(`
      id, on_hand_qty, allocated_qty, status, received_date,
      locations ( id, location_code, location_name )
    `)
    .eq('product_id',   productId)
    .eq('tenant_id',    scope.tenantId)
    .eq('warehouse_id', scope.warehouseId)
    .in('status', FIFO_ELIGIBLE_STATUSES)
    .gt('on_hand_qty', 0)

  if (error) return { data: [], error: error.message }

  const rows = data as unknown as InventoryRaw[]

  // available_qty = on_hand_qty - allocated_qty が正のものだけ残す
  const eligible = rows
    .map((r) => ({
      ...r,
      _availableQty: Math.max(0, (r.on_hand_qty ?? 0) - (r.allocated_qty ?? 0)),
    }))
    .filter((r) => r._availableQty > 0)

  // FIFO 順（received_date ASC、null は末尾）
  eligible.sort((a, b) => {
    if (!a.received_date && !b.received_date) return 0
    if (!a.received_date) return 1
    if (!b.received_date) return -1
    return a.received_date.localeCompare(b.received_date)
  })

  return {
    data: eligible.map((r) => ({
      inventoryId:  r.id,
      locationId:   r.locations?.id           ?? '',
      locationCode: r.locations?.location_code ?? '',
      locationName: r.locations?.location_name ?? '',
      status:       toInventoryStatus(r.status),
      onHandQty:    r.on_hand_qty   ?? 0,
      allocatedQty: r.allocated_qty ?? 0,
      availableQty: r._availableQty,
      receivedDate: r.received_date,
    })),
    error: null,
  }
}

// =============================================================
// 手動引当用：引当可能在庫一覧取得（全ステータス表示）
// FIFO と異なり hold / damaged も表示する（担当者が意図的に選択可能）
// available_qty > 0 の行のみ表示（引当不可行は非表示）
// =============================================================

export async function fetchInventoryForManualAllocation(
  productId: string,
  scope: QueryScope,
): Promise<{
  data:  InventoryLine[]
  error: string | null
}> {
  // ステータスでの絞り込みを行わず、全ステータスの在庫を返す
  // （hold / damaged も担当者が確認・選択できるよう表示する）
  const { data, error } = await supabase
    .from('inventory')
    .select(`
      id, on_hand_qty, allocated_qty, status, received_date,
      locations ( id, location_code, location_name )
    `)
    .eq('product_id',   productId)
    .eq('tenant_id',    scope.tenantId)
    .eq('warehouse_id', scope.warehouseId)
    .gt('on_hand_qty', 0)

  if (error) return { data: [], error: error.message }

  const rows = data as unknown as InventoryRaw[]

  // available_qty > 0 の行のみ（引当できない在庫は非表示）
  const withQty = rows
    .map((r) => ({
      ...r,
      _availableQty: Math.max(0, (r.on_hand_qty ?? 0) - (r.allocated_qty ?? 0)),
    }))
    .filter((r) => r._availableQty > 0)

  // 表示順：received_date ASC（ステータスによらず FIFO 順で並べる）
  withQty.sort((a, b) => {
    if (!a.received_date && !b.received_date) return 0
    if (!a.received_date) return 1
    if (!b.received_date) return -1
    return a.received_date.localeCompare(b.received_date)
  })

  return {
    data: withQty.map((r) => ({
      inventoryId:  r.id,
      locationId:   r.locations?.id           ?? '',
      locationCode: r.locations?.location_code ?? '',
      locationName: r.locations?.location_name ?? '',
      status:       toInventoryStatus(r.status),
      onHandQty:    r.on_hand_qty   ?? 0,
      allocatedQty: r.allocated_qty ?? 0,
      availableQty: r._availableQty,
      receivedDate: r.received_date,
    })),
    error: null,
  }
}

// =============================================================
// FIFO 自動引当計算（純粋関数・DB アクセスなし）
// =============================================================

/**
 * FIFO 自動引当の計算（純粋関数・DB アクセスなし）。
 * 呼び出し元は fetchInventoryForProduct（FIFO_ELIGIBLE_STATUSES でフィルタ済み）から
 * 取得した lines を渡すこと。hold / damaged の行はここに渡されない前提。
 *
 * - received_date ASC でソート済みの lines を先頭から順に引き当てる
 * - available_qty を超えた引当は行わない
 * - 在庫不足の場合は可能な限り引当て、不足分は呼び出し元が検知する
 */
export function computeFifoAllocation(
  lines: InventoryLine[],
  requestedQty: number,
): AllocationItem[] {
  const result: AllocationItem[] = []
  let remaining = requestedQty

  for (const line of lines) {
    if (remaining <= 0) break
    const take = Math.min(line.availableQty, remaining)
    if (take <= 0) continue
    result.push({
      inventoryId:  line.inventoryId,
      locationId:   line.locationId,
      locationCode: line.locationCode,
      locationName: line.locationName,
      status:       line.status,
      availableQty: line.availableQty,
      allocatedQty: take,
      receivedDate: line.receivedDate,
    })
    remaining -= take
  }

  return result
}

// =============================================================
// 出庫指示番号の重複チェック
// =============================================================

/**
 * 指定した出庫指示番号が既に存在するかチェックする。
 * true = 重複あり（登録不可）、false = 未使用（登録可能）
 */
export async function checkShippingNoExists(
  shippingNo: string,
  tenantId:   string,
): Promise<boolean> {
  const { data } = await supabase
    .from('shipping_headers')
    .select('id')
    .eq('shipping_no', shippingNo)
    .eq('tenant_id',   tenantId)
    .maybeSingle()
  return data !== null
}

// =============================================================
// 出庫指示番号の自動採番
// =============================================================

export async function generateShippingNo(scope: QueryScope): Promise<string> {
  const year   = new Date().getFullYear()
  const prefix = `SHP-${year}-`

  const { data } = await supabase
    .from('shipping_headers')
    .select('shipping_no')
    .eq('tenant_id', scope.tenantId)
    .like('shipping_no', `${prefix}%`)
    .order('shipping_no', { ascending: false })
    .limit(1)

  type Row = { shipping_no: string }
  const rows    = data as unknown as Row[] | null
  const last    = rows?.[0]?.shipping_no
  const lastNum = last ? parseInt(last.replace(prefix, ''), 10) : 0
  return `${prefix}${String(lastNum + 1).padStart(4, '0')}`
}

// =============================================================
// 出庫指示登録（header + lines + allocations）
// 引当確定と同時に inventory.allocated_qty を加算する
// =============================================================

export async function createShippingOrder(params: {
  shippingNo:   string
  shippingDate: string   // YYYY-MM-DD
  customerId:   string
  memo?:        string
  scope:        QueryScope
  lines: Array<{
    lineNo:       number
    productId:    string
    requestedQty: number
    allocations:  Array<{
      inventoryId:  string
      allocatedQty: number
    }>
  }>
}): Promise<{ error: string | null }> {
  const { shippingNo, shippingDate, customerId, memo, scope, lines } = params

  try {
    // ── Step 1: shipping_headers を INSERT ───────────────────
    const { data: headerData, error: headerErr } = await dml('shipping_headers')
      .insert({
        shipping_no:   shippingNo,
        shipping_date: shippingDate,
        customer_id:   customerId,
        status:        'pending',
        memo:          memo ?? null,
        tenant_id:     scope.tenantId,
        warehouse_id:  scope.warehouseId,
      })
      .select('id')
      .single()

    if (headerErr) throw new Error(`ヘッダー登録エラー: ${headerErr.message}`)

    const headerId = (headerData as unknown as { id: string }).id

    // ── Step 2: shipping_lines を一括 INSERT ──────────────────
    const lineRecords = lines.map((l) => ({
      header_id:     headerId,
      line_no:       l.lineNo,
      product_id:    l.productId,
      requested_qty: l.requestedQty,
      shipped_qty:   0,
      status:        'pending',
      tenant_id:     scope.tenantId,
      warehouse_id:  scope.warehouseId,
    }))

    const { data: lineData, error: linesErr } = await dml('shipping_lines')
      .insert(lineRecords)
      .select('id, line_no')

    if (linesErr) throw new Error(`明細登録エラー: ${linesErr.message}`)

    type LineResult = { id: string; line_no: number }
    const lineResults = lineData as unknown as LineResult[]

    // ── Step 3: shipping_allocations を一括 INSERT ────���────────
    const allAllocs = lines.flatMap((l) => {
      const lineResult = lineResults.find((r) => r.line_no === l.lineNo)
      if (!lineResult) return []
      return l.allocations.map((a) => ({
        line_id:       lineResult.id,
        inventory_id:  a.inventoryId,
        allocated_qty: a.allocatedQty,
      }))
    })

    if (allAllocs.length > 0) {
      const { error: allocErr } = await dml('shipping_allocations')
        .insert(allAllocs)
      if (allocErr) throw new Error(`引当登録エラー: ${allocErr.message}`)
    }

    // ── Step 4: inventory.allocated_qty を加算 ────────────────
    // 同一 inventory_id への引当を集約してから更新する
    const allocByInventory = new Map<string, number>()
    for (const l of lines) {
      for (const a of l.allocations) {
        allocByInventory.set(
          a.inventoryId,
          (allocByInventory.get(a.inventoryId) ?? 0) + a.allocatedQty,
        )
      }
    }

    for (const [inventoryId, addQty] of allocByInventory) {
      // 現在の on_hand_qty / allocated_qty を取得して available_qty を確認
      const { data: invRaw, error: invSelectErr } = await supabase
        .from('inventory')
        .select('on_hand_qty, allocated_qty')
        .eq('id', inventoryId)
        .single()

      if (invSelectErr) throw new Error(`在庫取得エラー: ${invSelectErr.message}`)

      type InvRow = { on_hand_qty: number; allocated_qty: number }
      const inv = invRaw as unknown as InvRow
      const available = Math.max(0, (inv.on_hand_qty ?? 0) - (inv.allocated_qty ?? 0))

      if (addQty > available) {
        throw new Error(
          `引当可能数を超えています（在庫ID: ${inventoryId}, 引当可能: ${available}, 要求: ${addQty}）`
        )
      }

      const { error: invUpdateErr } = await dml('inventory')
        .update({ allocated_qty: (inv.allocated_qty ?? 0) + addQty })
        .eq('id', inventoryId)

      if (invUpdateErr) throw new Error(`在庫引当更新エラー: ${invUpdateErr.message}`)
    }

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '不明なエラーが発生しました' }
  }
}

// =============================================================
// 出庫確定：on_hand_qty と allocated_qty を同時に減算
// =============================================================

/**
 * 出庫確定処理。shipping_allocations に従って
 * inventory.on_hand_qty と inventory.allocated_qty を減算する。
 * shipping_lines.shipped_qty と shipping_headers.status も更新する。
 */
export async function confirmShipping(params: {
  headerId:   string
  lineId:     string
  shippedQty: number
  allocations: Array<{
    inventoryId:  string
    allocatedQty: number  // 実際に出庫する数量（引当済み数量と一致する想定）
  }>
}): Promise<{ error: string | null }> {
  const { headerId, lineId, shippedQty, allocations } = params

  try {
    // ── Step 1: 各 inventory の on_hand_qty / allocated_qty を減算 ─
    for (const a of allocations) {
      const { data: invRaw, error: invSelectErr } = await supabase
        .from('inventory')
        .select('on_hand_qty, allocated_qty')
        .eq('id', a.inventoryId)
        .single()

      if (invSelectErr) throw new Error(`在庫取得エラー: ${invSelectErr.message}`)

      type InvRow = { on_hand_qty: number; allocated_qty: number }
      const inv = invRaw as unknown as InvRow

      const newOnHand    = Math.max(0, (inv.on_hand_qty   ?? 0) - a.allocatedQty)
      const newAllocated = Math.max(0, (inv.allocated_qty ?? 0) - a.allocatedQty)

      const { error: invUpdateErr } = await dml('inventory')
        .update({ on_hand_qty: newOnHand, allocated_qty: newAllocated })
        .eq('id', a.inventoryId)

      if (invUpdateErr) throw new Error(`在庫減算エラー: ${invUpdateErr.message}`)
    }

    // ── Step 2: shipping_lines を更新 ─────────────────────────
    const { error: lineErr } = await dml('shipping_lines')
      .update({ shipped_qty: shippedQty, status: 'completed' })
      .eq('id', lineId)

    if (lineErr) throw new Error(`明細更新エラー: ${lineErr.message}`)

    // ── Step 3: 全明細が完了なら shipping_headers を shipped に ─
    const { data: siblingsRaw, error: siblingsErr } = await supabase
      .from('shipping_lines')
      .select('status')
      .eq('header_id', headerId)

    if (siblingsErr) throw new Error(`明細取得エラー: ${siblingsErr.message}`)

    type StatusRow = { status: string }
    const siblings  = siblingsRaw as unknown as StatusRow[]
    const allDone   = siblings.every((s) => s.status === 'completed' || s.status === 'cancelled')
    const newStatus = allDone ? 'shipped' : 'picking'

    const { error: headerErr } = await dml('shipping_headers')
      .update({ status: newStatus })
      .eq('id', headerId)

    if (headerErr) throw new Error(`ヘッダー更新エラー: ${headerErr.message}`)

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '不明なエラーが発生しました' }
  }
}

// =============================================================
// 出庫指示一覧取得（shipping/page.tsx 用）
// =============================================================

// ─── Raw DB 型（一覧用） ──────────────────────────────────────

type ShippingHeaderListRaw = {
  id:           string
  shipping_no:  string
  shipping_date: string
  status:       string
  memo:         string | null
  created_at:   string
  customers:    { customer_name_ja: string } | null
  shipping_lines: Array<{ id: string }>
}

/** 出庫指示一覧1行 */
export type ShippingOrderSummary = {
  id:           string
  code:         string   // shipping_no
  customerId:   string   // customer_id（詳細遷移用）
  customerName: string
  requestedDate: string  // 表示用フォーマット
  status:       ShippingStatus
  memo:         string | null
  lineCount:    number
  createdAt:    string
}

// ─── Raw DB 型（明細用） ──────────────────────────────────────

type ShippingLineDetailRaw = {
  id:            string
  line_no:       number
  requested_qty: number
  shipped_qty:   number
  products: {
    product_code:    string
    product_name_ja: string
    unit:            string
  } | null
  shipping_allocations: Array<{
    allocated_qty: number
    inventory: {
      locations: { location_code: string } | null
    } | null
  }>
}

/** 棚別引当明細（PickingModal でのピッキングリスト表示に使用） */
export type ShippingLineAllocation = {
  locationCode: string
  allocatedQty: number
}

/** 出庫指示明細1行 */
export type ShippingLineItem = {
  id:             string   // shipping_lines.id
  lineNo:         number
  productCode:    string
  productName:    string
  unit:           string
  orderedQuantity: number  // requested_qty
  pickedQuantity:  number  // shipped_qty（検品後に更新）
  locationCode:    string  // 引当先ロケーション（複数の場合はカンマ区切り / 後方互換）
  allocations:     ShippingLineAllocation[]  // 棚別引当明細（棚番順）
}

// ─── ユーティリティ ───────────────────────────────────────────

function toShippingStatus(raw: string): ShippingStatus {
  if (
    raw === 'pending' || raw === 'picking' ||
    raw === 'inspected' || raw === 'shipped' || raw === 'cancelled'
  ) return raw
  return 'pending'
}

function formatDateDisplay(raw: string): string {
  if (!raw) return ''
  return new Date(raw).toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
}

// =============================================================
// 出庫指示一覧取得
// =============================================================

export async function fetchShippingOrders(scope: QueryScope): Promise<{
  data:  ShippingOrderSummary[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('shipping_headers')
    .select(`
      id, shipping_no, shipping_date, status, memo, created_at,
      customers ( customer_name_ja ),
      shipping_lines ( id )
    `)
    .eq('tenant_id',    scope.tenantId)
    .eq('warehouse_id', scope.warehouseId)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }

  const rows = data as unknown as ShippingHeaderListRaw[]

  return {
    data: rows.map((r) => ({
      id:           r.id,
      code:         r.shipping_no,
      customerId:   '',   // header に customer_id は含まれていないが一覧では不要
      customerName: r.customers?.customer_name_ja ?? '',
      requestedDate: formatDateDisplay(r.shipping_date),
      status:       toShippingStatus(r.status),
      memo:         r.memo,
      lineCount:    r.shipping_lines.length,
      createdAt:    formatDateDisplay(r.created_at),
    })),
    error: null,
  }
}

// =============================================================
// 出庫指示明細取得（モーダル表示用）
// =============================================================

export async function fetchShippingOrderLines(headerId: string): Promise<{
  data:  ShippingLineItem[]
  error: string | null
}> {
  const { data, error } = await supabase
    .from('shipping_lines')
    .select(`
      id, line_no, requested_qty, shipped_qty,
      products ( product_code, product_name_ja, unit ),
      shipping_allocations (
        allocated_qty,
        inventory ( locations ( location_code ) )
      )
    `)
    .eq('header_id', headerId)
    .order('line_no')

  if (error) return { data: [], error: error.message }

  const rows = data as unknown as ShippingLineDetailRaw[]

  return {
    data: rows.map((r) => {
      // 棚別引当明細を構築（棚番順ソート）
      const allocations: ShippingLineAllocation[] = r.shipping_allocations
        .filter((a) => a.inventory?.locations?.location_code)
        .map((a) => ({
          locationCode: a.inventory!.locations!.location_code,
          allocatedQty: Number(a.allocated_qty),
        }))
        .sort((a, b) => a.locationCode.localeCompare(b.locationCode))

      // 後方互換用のカンマ区切りロケーション文字列
      const locationCode = [...new Set(allocations.map((a) => a.locationCode))].join(', ')

      return {
        id:             r.id,
        lineNo:         r.line_no,
        productCode:    r.products?.product_code    ?? '',
        productName:    r.products?.product_name_ja ?? '',
        unit:           r.products?.unit            ?? '',
        orderedQuantity: Number(r.requested_qty),
        pickedQuantity:  Number(r.shipped_qty),
        locationCode,
        allocations,
      }
    }),
    error: null,
  }
}

// =============================================================
// ステータス遷移
// =============================================================

/** pending → picking */
export async function startPickingShipping(headerId: string): Promise<{ error: string | null }> {
  const { error } = await dml('shipping_headers')
    .update({ status: 'picking' })
    .eq('id', headerId)
  return { error: error ? error.message : null }
}

/** picking → inspected（各明細の shipped_qty を更新してからステータス変更） */
export async function completeShippingInspection(
  headerId: string,
  pickedItems: Array<{ lineId: string; pickedQty: number }>,
): Promise<{ error: string | null }> {
  try {
    for (const item of pickedItems) {
      const { error: lineErr } = await dml('shipping_lines')
        .update({ shipped_qty: item.pickedQty })
        .eq('id', item.lineId)
      if (lineErr) throw new Error(`明細更新エラー: ${lineErr.message}`)
    }
    const { error: headerErr } = await dml('shipping_headers')
      .update({ status: 'inspected' })
      .eq('id', headerId)
    if (headerErr) throw new Error(`ヘッダー更新エラー: ${headerErr.message}`)
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '不明なエラーが発生しました' }
  }
}

/**
 * inspected → shipped
 * 在庫の on_hand_qty / allocated_qty を減算し、ヘッダーを shipped に更新する。
 */
export async function confirmShippingOrder(headerId: string): Promise<{ error: string | null }> {
  try {
    // ── Step 1: 全明細 + 引当を取得 ──────────────────────────────
    const { data: linesRaw, error: linesErr } = await supabase
      .from('shipping_lines')
      .select(`
        id, shipped_qty,
        shipping_allocations ( inventory_id, allocated_qty )
      `)
      .eq('header_id', headerId)

    if (linesErr) throw new Error(`明細取得エラー: ${linesErr.message}`)

    type LineWithAlloc = {
      id: string
      shipped_qty: number
      shipping_allocations: Array<{ inventory_id: string; allocated_qty: number }>
    }
    const lines = linesRaw as unknown as LineWithAlloc[]

    // ── Step 2: 在庫を減算 ────────────────────────────────────────
    const allocByInventory = new Map<string, number>()
    for (const line of lines) {
      for (const a of line.shipping_allocations) {
        // 引当数と実績数の小さい方を減算（過剰引当を防ぐ）
        const deduct = Math.min(a.allocated_qty, line.shipped_qty)
        allocByInventory.set(
          a.inventory_id,
          (allocByInventory.get(a.inventory_id) ?? 0) + deduct,
        )
      }
    }

    for (const [inventoryId, deductQty] of allocByInventory) {
      const { data: invRaw, error: invSelectErr } = await supabase
        .from('inventory')
        .select('on_hand_qty, allocated_qty')
        .eq('id', inventoryId)
        .single()

      if (invSelectErr) throw new Error(`在庫取得エラー: ${invSelectErr.message}`)

      type InvRow = { on_hand_qty: number; allocated_qty: number }
      const inv = invRaw as unknown as InvRow

      const { error: invUpdateErr } = await dml('inventory')
        .update({
          on_hand_qty:   Math.max(0, (inv.on_hand_qty   ?? 0) - deductQty),
          allocated_qty: Math.max(0, (inv.allocated_qty ?? 0) - deductQty),
        })
        .eq('id', inventoryId)

      if (invUpdateErr) throw new Error(`在庫減算エラー: ${invUpdateErr.message}`)
    }

    // ── Step 3: 全明細を completed に ────────────────────────────
    const { error: linesUpdateErr } = await dml('shipping_lines')
      .update({ status: 'completed' })
      .eq('header_id', headerId)

    if (linesUpdateErr) throw new Error(`明細ステータス更新エラー: ${linesUpdateErr.message}`)

    // ── Step 4: ヘッダーを shipped に ────────────────────────────
    const { error: headerErr } = await dml('shipping_headers')
      .update({ status: 'shipped' })
      .eq('id', headerId)

    if (headerErr) throw new Error(`ヘッダー更新エラー: ${headerErr.message}`)

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '不明なエラーが発生しました' }
  }
}
