/**
 * allocation.ts — 引当計算の純粋関数・型定義
 *
 * 【設計方針】
 *   このファイルは Supabase や環境変数への依存を一切持たない。
 *   - Unit テストをサーバー接続なしで実行できる
 *   - FIFO / FEFO など引当ストラテジーをここに追加・切り替えしやすい
 *
 * 【FEFO 追加時の拡張ポイント】
 *   1. AllocationStrategy 型に 'fefo' を追加
 *   2. computeFefoAllocation() を実装（expiry_date ASC NULLS LAST, received_date ASC）
 *   3. computeAllocation() の switch 分岐に 'fefo' を追加
 */

import type { InventoryStatus, ShippingStatus } from '@/lib/types'

// =============================================================
// 型定義
// =============================================================

/** 在庫1行（引当候補）。fetchInventory* 関数が返すフロント向けデータ */
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
// 定数
// =============================================================

/**
 * FIFO 自動引当の対象とする在庫ステータス。
 * hold / damaged は自動引当の対象外。
 * 将来新しいステータスを追加する場合はこの配列を修正する。
 */
export const FIFO_ELIGIBLE_STATUSES: InventoryStatus[] = ['available']

/**
 * 引当解除が許可される出庫指示ステータス。
 * inspected / shipped / cancelled は解除不可。
 * RPC（rpc_deallocate_shipping_inventory）でも同じルールをサーバー側で強制する。
 */
export const DEALLOC_ELIGIBLE_STATUSES: ShippingStatus[] = ['pending', 'picking']

/**
 * 引当解除が許可されるステータスかどうかを返す（純粋関数・DB アクセスなし）。
 *
 * 【使用場所】
 *   - UI での解除ボタン表示制御（pending / picking のみ表示）
 *   - フォーム submit 前の事前チェック
 *   最終的なチェックは必ず RPC（サーバー側）で行うこと。
 *
 * @param status  shipping_headers.status の値
 * @returns       true = 解除可、false = 解除不可
 */
export function isDeallocationAllowed(status: string): boolean {
  return (DEALLOC_ELIGIBLE_STATUSES as string[]).includes(status)
}

/**
 * 再引当が許可される出庫指示ステータス。
 * pending のみ許可。picking 以降は不可（現場作業と乖離するため）。
 * RPC（rpc_reallocate_shipping_line）でも同じルールをサーバー側で強制する。
 */
export const REALLOC_ELIGIBLE_STATUSES: ShippingStatus[] = ['pending']

/**
 * 再引当が許可されるステータスかどうかを返す（純粋関数・DB アクセスなし）。
 *
 * 【使用場所】
 *   - UI での再引当ボタン表示制御（pending のみ表示）
 *   最終的なチェックは必ず RPC（サーバー側）で行うこと。
 *
 * @param status  shipping_headers.status の値
 * @returns       true = 再引当可、false = 再引当不可
 */
export function isReallocationAllowed(status: string): boolean {
  return (REALLOC_ELIGIBLE_STATUSES as string[]).includes(status)
}

// =============================================================
// 純粋関数: FIFO 引当計算
// =============================================================

// =============================================================
// 純粋関数: 手動引当入力の検証
// =============================================================

/**
 * 手動引当入力の検証（純粋関数・DB アクセスなし）。
 *
 * 【検証内容】
 *   1. requestedQty が 1 以上
 *   2. 各 alloc の allocatedQty が 1 以上
 *   3. 各 alloc の allocatedQty が対応 InventoryLine の availableQty 以下
 *   4. 合計 allocatedQty が requestedQty 以下
 *   5. 存在しない inventoryId を参照していないこと
 *
 * 【使用場所】
 *   フロント側の submit 前バリデーション（二重チェック）。
 *   最終的な制約チェックは RPC（rpc_allocate_shipping_inventory）が行う。
 *
 * @returns エラーメッセージの配列。空配列 = 有効。
 */
export function validateManualAllocations(
  allocations:    AllocationItem[],
  requestedQty:   number,
  availableLines: InventoryLine[],
): string[] {
  const errors: string[] = []

  if (requestedQty <= 0) {
    errors.push('requestedQty は 1 以上を指定してください')
    return errors  // 以降のチェックは無意味なので早期リターン
  }

  const lineMap = new Map(availableLines.map((l) => [l.inventoryId, l]))
  let totalAllocated = 0

  for (const alloc of allocations) {
    if (alloc.allocatedQty <= 0) {
      errors.push(
        `allocatedQty は 1 以上を指定してください（inventoryId: ${alloc.inventoryId}）`,
      )
      continue
    }

    const line = lineMap.get(alloc.inventoryId)
    if (!line) {
      errors.push(`在庫行が見つかりません（inventoryId: ${alloc.inventoryId}）`)
      continue
    }

    if (alloc.allocatedQty > line.availableQty) {
      errors.push(
        `引当可能数を超えています（inventoryId: ${alloc.inventoryId}, ` +
        `引当可能: ${line.availableQty}, 要求: ${alloc.allocatedQty}）`,
      )
    }

    totalAllocated += alloc.allocatedQty
  }

  if (totalAllocated > requestedQty) {
    errors.push(
      `引当合計（${totalAllocated}）が出庫数量（${requestedQty}）を超えています`,
    )
  }

  return errors
}

// =============================================================
// 純粋関数: FIFO 引当計算
// =============================================================

/**
 * FIFO 自動引当の計算（純粋関数・DB アクセスなし）。
 *
 * 【前提】
 *   - 呼び出し元は received_date ASC NULLS LAST でソート済みのリストを渡すこと
 *     （fetchInventoryForProduct がこの順序を保証する）
 *   - hold / damaged の行はここに渡されない前提（fetchInventoryForProduct でフィルタ済み）
 *
 * 【動作】
 *   - lines を先頭から順に貪欲に引き当てる
 *   - 在庫不足の場合は可能な限り引き当て、不足分は呼び出し元で検知する
 *     （total < requestedQty になる）
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
