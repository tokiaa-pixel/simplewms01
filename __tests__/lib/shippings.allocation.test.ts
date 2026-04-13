/**
 * shippings.allocation.test.ts
 *
 * computeFifoAllocation（純粋関数）のユニットテスト。
 * DB アクセスなし・副作用なしのため、Vitest 単体で実行可能。
 *
 * 実行方法:
 *   npm install   # vitest を初回インストール
 *   npm test      # または npx vitest run
 */

import { describe, it, expect } from 'vitest'
import {
  computeFifoAllocation,
} from '../../lib/supabase/queries/allocation'
import type { InventoryLine } from '../../lib/supabase/queries/allocation'

// ── テストヘルパー ──────────────────────────────────────────────
function makeLine(
  id: string,
  availableQty: number,
  receivedDate: string | null,
  overrides: Partial<InventoryLine> = {},
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

// ── テスト群 ────────────────────────────────────────────────────

describe('computeFifoAllocation', () => {
  // ─── 正常系 ─────────────────────────────────────────────────

  it('1行の在庫から requestedQty ぴったり引き当てる', () => {
    const lines = [makeLine('inv-1', 10, '2024-01-01')]
    const result = computeFifoAllocation(lines, 5)

    expect(result).toHaveLength(1)
    expect(result[0].inventoryId).toBe('inv-1')
    expect(result[0].allocatedQty).toBe(5)
  })

  it('1行の在庫を全量引き当てる', () => {
    const lines = [makeLine('inv-1', 10, '2024-01-01')]
    const result = computeFifoAllocation(lines, 10)

    expect(result).toHaveLength(1)
    expect(result[0].allocatedQty).toBe(10)
  })

  it('複数行から FIFO 順（先頭から貪欲）に引き当てる', () => {
    // fetchInventoryForProduct が received_date ASC でソート済みのリストを渡す前提
    const lines = [
      makeLine('inv-old', 3, '2023-06-01'),   // 古い → 先に消費
      makeLine('inv-new', 10, '2024-01-01'),  // 新しい → 後で消費
    ]
    const result = computeFifoAllocation(lines, 5)

    expect(result).toHaveLength(2)
    expect(result[0].inventoryId).toBe('inv-old')
    expect(result[0].allocatedQty).toBe(3)
    expect(result[1].inventoryId).toBe('inv-new')
    expect(result[1].allocatedQty).toBe(2)
  })

  it('2行目が不要なら2行目を含めない', () => {
    const lines = [
      makeLine('inv-a', 10, '2023-01-01'),
      makeLine('inv-b', 10, '2024-01-01'),
    ]
    const result = computeFifoAllocation(lines, 7)

    expect(result).toHaveLength(1)
    expect(result[0].inventoryId).toBe('inv-a')
    expect(result[0].allocatedQty).toBe(7)
  })

  it('receivedDate が null の行は末尾に並んでいる前提で正しく動作する', () => {
    // ソートは fetchInventoryForProduct が担当（null → 末尾）
    // ここでは呼び出し元が既にソートしたリストを渡してきた状態を想定
    const sortedLines = [
      makeLine('inv-dated', 5, '2024-01-01'),
      makeLine('inv-null',  10, null),          // null は末尾
    ]
    const result = computeFifoAllocation(sortedLines, 3)

    expect(result).toHaveLength(1)
    expect(result[0].inventoryId).toBe('inv-dated')
    expect(result[0].allocatedQty).toBe(3)
  })

  // ─── 在庫不足 ───────────────────────────────────────────────

  it('在庫不足: 可能な限り引き当てて不足分は含まれない（部分引当）', () => {
    const lines = [makeLine('inv-1', 5, '2024-01-01')]
    const result = computeFifoAllocation(lines, 10)

    // 引当可能な 5 だけ返す（10 要求したが 5 しか取れない）
    expect(result).toHaveLength(1)
    expect(result[0].allocatedQty).toBe(5)

    // 呼び出し元で不足を検知: totalAllocated(5) < requestedQty(10)
    const total = result.reduce((s, a) => s + a.allocatedQty, 0)
    expect(total).toBe(5)
    expect(total < 10).toBe(true)
  })

  it('在庫ゼロ: 空配列を返す', () => {
    const lines = [makeLine('inv-1', 0, '2024-01-01', { availableQty: 0 })]
    const result = computeFifoAllocation(lines, 5)
    expect(result).toHaveLength(0)
  })

  // ─── エッジケース ────────────────────────────────────────────

  it('lines が空配列: 空配列を返す', () => {
    const result = computeFifoAllocation([], 10)
    expect(result).toHaveLength(0)
  })

  it('requestedQty が 0: 空配列を返す', () => {
    const lines = [makeLine('inv-1', 10, '2024-01-01')]
    const result = computeFifoAllocation(lines, 0)
    expect(result).toHaveLength(0)
  })

  it('返された AllocationItem の allocatedQty は availableQty を超えない', () => {
    const lines = [
      makeLine('inv-a', 3, '2023-01-01'),
      makeLine('inv-b', 7, '2024-01-01'),
    ]
    const result = computeFifoAllocation(lines, 100)

    for (const item of result) {
      const original = lines.find((l) => l.inventoryId === item.inventoryId)!
      expect(item.allocatedQty).toBeLessThanOrEqual(original.availableQty)
    }
  })
})
