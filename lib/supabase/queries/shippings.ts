import { supabase } from '@/lib/supabase/client'
import type { InventoryStatus, ShippingStatus, QueryScope } from '@/lib/types'

// 純粋関数・型定義は allocation.ts に分離（Supabase 依存なし・ユニットテスト可能）
export type { InventoryLine, AllocationItem } from './allocation'
export {
  FIFO_ELIGIBLE_STATUSES,
  DEALLOC_ELIGIBLE_STATUSES,
  computeFifoAllocation,
  validateManualAllocations,
  isDeallocationAllowed,
} from './allocation'
import type { InventoryLine, AllocationItem } from './allocation'
import { FIFO_ELIGIBLE_STATUSES } from './allocation'

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
// rpc_allocate_shipping_inventory を呼び出し、単一トランザクションで実行する。
//
// 【フェーズ3-3 変更内容】
//   旧実装: shipping_headers → shipping_lines → shipping_allocations →
//           inventory.allocated_qty を逐次 Supabase 呼び出しで更新
//           → 非原子・TOCTOU 競合リスクあり
//   新実装: rpc_allocate_shipping_inventory を 1 回呼び出すだけ
//           → FOR UPDATE + 単一トランザクションで原子的に実行
//
// 【インターフェース】呼び出し元（shipping/input/page.tsx）への変更なし。
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
    /**
     * 引当戦略。
     * - 'fifo'  : RPC 側が received_date ASC で自動引当（allocations は空でよい）
     * - 'manual': フロント側で選択した allocations をそのまま使用
     */
    strategy:     'fifo' | 'manual'
    allocations:  Array<{             // strategy='fifo' の場合は空配列 [] を渡すこと
      inventoryId:  string
      allocatedQty: number
    }>
  }>
}): Promise<{ error: string | null }> {
  const { shippingNo, shippingDate, customerId, memo, scope, lines } = params

  // RPC に渡す lines を camelCase → RPC が期待するキー名に変換。
  // FIFO 行は allocations を空配列にすることで RPC 側に自動引当を委譲する。
  const rpcLines = lines.map((l) => ({
    lineNo:       l.lineNo,
    productId:    l.productId,
    requestedQty: l.requestedQty,
    strategy:     l.strategy,
    allocations:  l.strategy === 'fifo'
      ? []
      : l.allocations.map((a) => ({
          inventoryId:  a.inventoryId,
          allocatedQty: a.allocatedQty,
        })),
  }))

  // Supabase typed client はカスタム RPC 関数の型を持たないため any キャストで呼び出す。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('rpc_allocate_shipping_inventory', {
    p_shipping_no:   shippingNo,
    p_shipping_date: shippingDate,
    p_customer_id:   customerId,
    p_memo:          memo ?? null,
    p_tenant_id:     scope.tenantId,
    p_warehouse_id:  scope.warehouseId,
    p_lines:         rpcLines,
  })

  // PostgREST レベルのネットワーク/認証エラー
  if (error) return { error: (error as { message: string }).message }

  // RPC 内のビジネスエラー（EXCEPTION でキャッチされた場合）
  type RpcResult = { error: string | null }
  const result = data as RpcResult
  return { error: result?.error ?? null }
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
    id:            string    // shipping_allocations.id（引当解除に使用）
    allocated_qty: number
    inventory: {
      id:            string  // inventory.id（引当解除に使用）
      locations: { location_code: string } | null
    } | null
  }>
}

/** 棚別引当明細（PickingModal でのピッキングリスト表示に使用） */
export type ShippingLineAllocation = {
  id:           string   // shipping_allocations.id
  inventoryId:  string   // inventory.id
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
        id,
        allocated_qty,
        inventory ( id, locations ( location_code ) )
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
          id:           a.id,
          inventoryId:  a.inventory!.id,
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
 *
 * 【フェーズ3-5 変更内容】
 *   旧実装: shipping_lines / inventory を逐次 Supabase 呼び出しで更新
 *           → 非原子・inventory_transactions レコードなし・shipped_qty 配分バグあり
 *   新実装: rpc_confirm_shipping_order を 1 回呼び出すだけ
 *           → FOR UPDATE + 単一トランザクションで原子的に実行
 *           → inventory_transactions に 'shipping' タイプで記録
 *           → shipped_qty を v_remaining でデクリメント配分（バグ修正）
 *
 * @param headerId  shipping_headers.id
 * @param scope     tenant_id / warehouse_id（RPC でのスコープ検証に使用）
 */
export async function confirmShippingOrder(
  headerId: string,
  scope:    QueryScope,
): Promise<{ error: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('rpc_confirm_shipping_order', {
    p_header_id:    headerId,
    p_tenant_id:    scope.tenantId,
    p_warehouse_id: scope.warehouseId,
  })

  if (error) return { error: (error as { message: string }).message }

  type RpcResult = { error: string | null }
  return { error: (data as RpcResult)?.error ?? null }
}

// =============================================================
// 引当解除
// =============================================================

/**
 * 引当解除処理。pending / picking のヘッダーのみ実行可（RPC 側でチェック）。
 *
 * @param headerId     shipping_headers.id（ステータス検証に使用）
 * @param lineId       shipping_lines.id（解除対象の明細行）
 * @param allocationId shipping_allocations.id（省略 = lineId の全件解除）
 * @param scope        tenant_id / warehouse_id（スコープ検証に使用）
 */
export async function deallocateShippingInventory(params: {
  headerId:      string
  lineId:        string
  allocationId?: string   // undefined / null → line 全体解除
  scope:         QueryScope
}): Promise<{ error: string | null }> {
  const { headerId, lineId, allocationId, scope } = params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('rpc_deallocate_shipping_inventory', {
    p_header_id:     headerId,
    p_tenant_id:     scope.tenantId,
    p_warehouse_id:  scope.warehouseId,
    p_line_id:       lineId,
    p_allocation_id: allocationId ?? null,
  })

  if (error) return { error: (error as { message: string }).message }

  type RpcResult = { error: string | null }
  return { error: (data as RpcResult)?.error ?? null }
}
