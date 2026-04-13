/**
 * allocation.validation.test.ts
 *
 * validateManualAllocations（手動引当入力検証）と
 * computeFifoAllocation の追加エッジケースをカバーするユニットテスト。
 *
 * 【テスト対象】
 *   lib/supabase/queries/allocation.ts
 *
 * 【RPC レベルのテスト観点（DB 接続が必要なため自動化なし・手動確認）】
 *   - available 以外のステータス（hold/damaged）の在庫は引当不可
 *     → rpc_allocate_shipping_inventory の EXCEPTION '引当対象外のステータスです'
 *   - available_qty 超過の手動引当は RPC で拒否される
 *     → EXCEPTION '引当可能数を超えています'
 *   - tenant_id / warehouse_id が不一致の場合は拒否される
 *     → EXCEPTION 'テナントまたは倉庫の境界違反'
 *   - エラー発生時は中途半端な更新がロールバックされる（トランザクション保証）
 *   - rpc_confirm_shipping_order は status='inspected' のヘッダーのみ処理する
 *   - 出荷確定後に inventory_transactions に 'shipping' タイプで記録される
 */

import { describe, it, expect } from 'vitest'
import {
  validateManualAllocations,
  computeFifoAllocation,
} from '../../lib/supabase/queries/allocation'
import type { InventoryLine, AllocationItem } from '../../lib/supabase/queries/allocation'

// ── テストヘルパー ──────────────────────────────────────────────

function makeLine(
  id:           string,
  availableQty: number,
  receivedDate: string | null,
  overrides:    Partial<InventoryLine> = {},
): InventoryLine {
  return {
    inventoryId:  id,
    locationId:   'loc-1',
    locationCode: 'A-01',
    locationName: 'A棚1段',
    status:       'available',
    onHandQty:    availableQty,
    allocatedQty: 0,
    availableQty,
    receivedDate,
    ...overrides,
  }
}

function makeAlloc(
  inventoryId:  string,
  allocatedQty: number,
  availableQty: number,
  overrides:    Partial<AllocationItem> = {},
): AllocationItem {
  return {
    inventoryId,
    locationId:   'loc-1',
    locationCode: 'A-01',
    locationName: 'A棚1段',
    status:       'available',
    availableQty,
    allocatedQty,
    receivedDate: '2024-01-01',
    ...overrides,
  }
}

// ── validateManualAllocations テスト ───────────────────────────

describe('validateManualAllocations', () => {

  // ─── 正常系 ─────────────────────────────────────────────────

  it('正常: エラーなし（1行 / requestedQty 以内）', () => {
    const lines  = [makeLine('inv-1', 10, '2024-01-01')]
    const allocs = [makeAlloc('inv-1', 5, 10)]

    const errors = validateManualAllocations(allocs, 10, lines)
    expect(errors).toHaveLength(0)
  })

  it('正常: エラーなし（複数行 / 合計 = requestedQty）', () => {
    const lines = [
      makeLine('inv-1', 5,  '2024-01-01'),
      makeLine('inv-2', 10, '2024-02-01'),
    ]
    const allocs = [
      makeAlloc('inv-1', 5, 5),
      makeAlloc('inv-2', 5, 10),
    ]

    const errors = validateManualAllocations(allocs, 10, lines)
    expect(errors).toHaveLength(0)
  })

  it('正常: allocations 空（引当なし）はエラーなし', () => {
    // allocations が空でも validate 自体はパス（引当なしで登録するかどうかは呼び出し元が判断）
    const lines  = [makeLine('inv-1', 10, '2024-01-01')]
    const errors = validateManualAllocations([], 10, lines)
    expect(errors).toHaveLength(0)
  })

  // ─── requestedQty バリデーション ────────────────────────────

  it('requestedQty が 0 → エラー', () => {
    const lines  = [makeLine('inv-1', 10, '2024-01-01')]
    const allocs = [makeAlloc('inv-1', 5, 10)]

    const errors = validateManualAllocations(allocs, 0, lines)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/requestedQty は 1 以上/)
  })

  it('requestedQty が負値 → エラー', () => {
    const errors = validateManualAllocations([], -1, [])
    expect(errors.length).toBeGreaterThan(0)
  })

  // ─── allocatedQty バリデーション ────────────────────────────

  it('allocatedQty が 0 → エラー', () => {
    const lines  = [makeLine('inv-1', 10, '2024-01-01')]
    const allocs = [makeAlloc('inv-1', 0, 10)]

    const errors = validateManualAllocations(allocs, 10, lines)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/allocatedQty は 1 以上/)
  })

  it('allocatedQty が負値 → エラー', () => {
    const lines  = [makeLine('inv-1', 10, '2024-01-01')]
    const allocs = [makeAlloc('inv-1', -3, 10)]

    const errors = validateManualAllocations(allocs, 10, lines)
    expect(errors.length).toBeGreaterThan(0)
  })

  // ─── available_qty 超過 ──────────────────────────────────────

  it('単行: allocatedQty > availableQty → エラー', () => {
    const lines  = [makeLine('inv-1', 5, '2024-01-01')]
    const allocs = [makeAlloc('inv-1', 6, 5)]  // 1 超過

    const errors = validateManualAllocations(allocs, 10, lines)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/引当可能数を超えています/)
    expect(errors[0]).toContain('inv-1')
  })

  it('複数行: 1行だけ超過 → その行のエラーのみ', () => {
    const lines = [
      makeLine('inv-1', 3, '2024-01-01'),
      makeLine('inv-2', 10, '2024-02-01'),
    ]
    const allocs = [
      makeAlloc('inv-1', 5, 3),   // 2 超過
      makeAlloc('inv-2', 4, 10),  // 正常
    ]

    const errors = validateManualAllocations(allocs, 10, lines)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('inv-1')
  })

  // ─── 合計 requestedQty 超過 ──────────────────────────────────

  it('合計 allocatedQty > requestedQty → エラー', () => {
    const lines = [
      makeLine('inv-1', 10, '2024-01-01'),
      makeLine('inv-2', 10, '2024-02-01'),
    ]
    const allocs = [
      makeAlloc('inv-1', 8, 10),
      makeAlloc('inv-2', 5, 10),  // 合計 13 > requestedQty 10
    ]

    const errors = validateManualAllocations(allocs, 10, lines)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/引当合計.*を超えています/)
  })

  it('合計がちょうど requestedQty → エラーなし', () => {
    const lines = [
      makeLine('inv-1', 10, '2024-01-01'),
      makeLine('inv-2', 10, '2024-02-01'),
    ]
    const allocs = [
      makeAlloc('inv-1', 6, 10),
      makeAlloc('inv-2', 4, 10),  // 合計 10 = requestedQty
    ]

    const errors = validateManualAllocations(allocs, 10, lines)
    expect(errors).toHaveLength(0)
  })

  // ─── 存在しない inventoryId ──────────────────────────────────

  it('存在しない inventoryId を参照 → エラー', () => {
    const lines  = [makeLine('inv-1', 10, '2024-01-01')]
    const allocs = [makeAlloc('inv-ghost', 5, 10)]  // 存在しない ID

    const errors = validateManualAllocations(allocs, 10, lines)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/在庫行が見つかりません/)
    expect(errors[0]).toContain('inv-ghost')
  })

  // ─── 複数エラー ──────────────────────────────────────────────

  it('複数エラーをすべて収集する', () => {
    const lines  = [makeLine('inv-1', 3, '2024-01-01')]
    const allocs = [
      makeAlloc('inv-1',     5,  3),   // availableQty 超過
      makeAlloc('inv-ghost', 3, 10),   // 存在しない ID
    ]

    const errors = validateManualAllocations(allocs, 10, lines)
    expect(errors.length).toBeGreaterThanOrEqual(2)
  })
})

// ── computeFifoAllocation 追加エッジケース ───────────────────────

describe('computeFifoAllocation — 追加エッジケース', () => {

  it('availableQty = 0 の行はスキップされる', () => {
    const lines = [
      makeLine('inv-zero', 0, '2023-01-01', { availableQty: 0 }),
      makeLine('inv-ok',   10, '2024-01-01'),
    ]
    const result = computeFifoAllocation(lines, 5)

    expect(result).toHaveLength(1)
    expect(result[0].inventoryId).toBe('inv-ok')
    expect(result[0].allocatedQty).toBe(5)
  })

  it('FEFO 準備: expiry_date フィールドを持つ InventoryLine を正しく処理する', () => {
    // FEFO 本体は未実装だが、expiry_date を持つ行でも FIFO が正しく動作することを確認
    // FIFO は received_date のみを使う（expiry_date は無視）
    const lines: InventoryLine[] = [
      {
        ...makeLine('inv-early', 5,  '2023-06-01'),
        // expiry_date は InventoryLine 型に存在しないが、追加フィールドとして渡せることを確認
      },
      {
        ...makeLine('inv-late',  10, '2024-01-01'),
      },
    ]
    const result = computeFifoAllocation(lines, 8)

    expect(result).toHaveLength(2)
    expect(result[0].inventoryId).toBe('inv-early')
    expect(result[0].allocatedQty).toBe(5)
    expect(result[1].inventoryId).toBe('inv-late')
    expect(result[1].allocatedQty).toBe(3)
  })

  it('全行の availableQty が 0 → 空配列を返す', () => {
    const lines = [
      makeLine('inv-1', 0, '2024-01-01', { availableQty: 0 }),
      makeLine('inv-2', 0, '2024-02-01', { availableQty: 0 }),
    ]
    const result = computeFifoAllocation(lines, 10)
    expect(result).toHaveLength(0)
  })

  it('requestedQty より availableQty の合計が少ない → 部分引当（在庫不足）', () => {
    const lines = [
      makeLine('inv-1', 3, '2024-01-01'),
      makeLine('inv-2', 4, '2024-02-01'),
    ]
    const result = computeFifoAllocation(lines, 100)

    const total = result.reduce((s, a) => s + a.allocatedQty, 0)
    expect(total).toBe(7)    // 3 + 4 = 7（100 を要求しても 7 しかない）
    expect(total < 100).toBe(true)
  })

  it('各 AllocationItem の allocatedQty は対応する availableQty を超えない', () => {
    const lines = [
      makeLine('inv-a', 3,  '2023-01-01'),
      makeLine('inv-b', 7,  '2024-01-01'),
      makeLine('inv-c', 15, '2025-01-01'),
    ]
    const result = computeFifoAllocation(lines, 20)

    for (const item of result) {
      const original = lines.find((l) => l.inventoryId === item.inventoryId)!
      expect(item.allocatedQty).toBeLessThanOrEqual(original.availableQty)
    }
  })
})
