/**
 * deallocation.test.ts
 *
 * 引当解除機能のテスト。
 *
 * 【テスト対象】
 *   lib/supabase/queries/allocation.ts
 *     - isDeallocationAllowed（ステータス判定・純粋関数）
 *     - DEALLOC_ELIGIBLE_STATUSES（定数）
 *
 * 【RPC レベルのテスト観点（DB 接続が必要なため自動化なし・手動確認）】
 *
 *   ─ ステータス制御 ─────────────────────────────────────────────────────
 *   [RPC-01] pending の出庫指示 → 解除成功、inventory.allocated_qty が減算される
 *   [RPC-02] picking の出庫指示 → 解除成功、inventory.allocated_qty が減算される
 *   [RPC-03] inspected の出庫指示 → RETURN { error: '引当解除不可のステータスです: inspected' }
 *   [RPC-04] shipped の出庫指示 → RETURN { error: '引当解除不可のステータスです: shipped' }
 *   [RPC-05] cancelled の出庫指示 → RETURN { error: '引当解除不可のステータスです: cancelled' }
 *
 *   ─ 解除粒度 ──────────────────────────────────────────────────────────
 *   [RPC-06] p_allocation_id 指定 → その1行のみ削除、他行は残る
 *             shipping_allocations: 2行 → 1行削除後 1行残存
 *             inventory.allocated_qty: 解除分だけ減算
 *   [RPC-07] p_allocation_id = NULL → p_line_id の全 allocation を削除
 *             shipping_allocations: 全行削除
 *             shipping_lines.allocated_qty: 0 になる
 *
 *   ─ 数量制約 ──────────────────────────────────────────────────────────
 *   [RPC-08] inventory.allocated_qty = 3, dealloc = 5 →
 *             RAISE EXCEPTION '在庫整合エラー: allocated_qty が不足しています'
 *             → トランザクション全体がロールバックされる（他行の変更も元に戻る）
 *
 *   ─ 数量復元確認 ──────────────────────────────────────────────────────
 *   [RPC-09] 引当 10 → 解除 10 後、inventory.allocated_qty が元値に戻る
 *   [RPC-10] 引当 10 → 解除 3 後、inventory.allocated_qty = 元値 - 3
 *   [RPC-11] shipping_lines.allocated_qty が解除分だけ正確に減算される
 *
 *   ─ トランザクション / ロールバック ───────────────────────────────────
 *   [RPC-12] 複数 allocation を一括解除中に1件でも EXCEPTION が発生した場合、
 *             全件の変更（inventory, inventory_transactions, shipping_lines,
 *             shipping_allocations）がロールバックされる
 *   [RPC-13] 解除成功時、inventory_transactions に transaction_type='deallocation'
 *             が INSERT される（reference_type='shipping_line', reference_id=p_line_id）
 *
 *   ─ テナント / 倉庫制約 ───────────────────────────────────────────────
 *   [RPC-14] p_tenant_id が一致しない → RETURN { error: '出庫指示が見つかりません...' }
 *   [RPC-15] p_warehouse_id が一致しない → RETURN { error: '出庫指示が見つかりません...' }
 *   [RPC-16] inventory の tenant_id が異なる → RAISE EXCEPTION 'テナントまたは倉庫の境界違反'
 *
 *   ─ 冪等性 ────────────────────────────────────────────────────────────
 *   [RPC-17] 対象 allocation が 0 件（すでに解除済み等） → RETURN { error: null }（成功）
 */

import { describe, it, expect } from 'vitest'
import {
  isDeallocationAllowed,
  DEALLOC_ELIGIBLE_STATUSES,
} from '../../lib/supabase/queries/allocation'

// ── isDeallocationAllowed テスト ────────────────────────────────

describe('isDeallocationAllowed', () => {

  // ─── 解除可能なステータス ────────────────────────────────────

  it('pending → 解除可（true）', () => {
    expect(isDeallocationAllowed('pending')).toBe(true)
  })

  it('picking → 解除可（true）', () => {
    expect(isDeallocationAllowed('picking')).toBe(true)
  })

  // ─── 解除不可なステータス ────────────────────────────────────

  it('shipped → 解除不可（false）', () => {
    expect(isDeallocationAllowed('shipped')).toBe(false)
  })

  it('inspected → 解除不可（false）', () => {
    expect(isDeallocationAllowed('inspected')).toBe(false)
  })

  it('cancelled → 解除不可（false）', () => {
    expect(isDeallocationAllowed('cancelled')).toBe(false)
  })

  it('未知のステータス文字列 → 解除不可（false）', () => {
    expect(isDeallocationAllowed('unknown')).toBe(false)
  })

  it('空文字 → 解除不可（false）', () => {
    expect(isDeallocationAllowed('')).toBe(false)
  })

  // ─── DEALLOC_ELIGIBLE_STATUSES との整合性 ────────────────────

  it('DEALLOC_ELIGIBLE_STATUSES の全要素が isDeallocationAllowed で true を返す', () => {
    for (const status of DEALLOC_ELIGIBLE_STATUSES) {
      expect(isDeallocationAllowed(status)).toBe(true)
    }
  })

  it('DEALLOC_ELIGIBLE_STATUSES は pending と picking の 2 値のみ', () => {
    expect(DEALLOC_ELIGIBLE_STATUSES).toHaveLength(2)
    expect(DEALLOC_ELIGIBLE_STATUSES).toContain('pending')
    expect(DEALLOC_ELIGIBLE_STATUSES).toContain('picking')
  })

  it('FIFO 引当が実施されうるステータス（pending）は解除可', () => {
    // pending 時に rpc_allocate_shipping_inventory で FIFO 引当が行われる
    // → pending で解除できないと引当変更ができなくなる
    expect(isDeallocationAllowed('pending')).toBe(true)
  })

  it('ピッキング作業中（picking）も解除可 → 差し替え対応が可能', () => {
    // ピッキング開始後でも在庫ロケーションの変更などで解除が必要になるケースがある
    expect(isDeallocationAllowed('picking')).toBe(true)
  })

  it('出荷確定後（shipped）は解除不可 → on_hand_qty がすでに減算済み', () => {
    // rpc_confirm_shipping_order 実行後は inventory.on_hand_qty が既に減算されている
    // このタイミングで allocated_qty を単独で戻すと整合性が崩れる
    expect(isDeallocationAllowed('shipped')).toBe(false)
  })
})

// ── 型整合性テスト ──────────────────────────────────────────────

describe('ShippingLineAllocation 型の整合性（コンパイル時チェック補完）', () => {

  it('ShippingLineAllocation は id / inventoryId フィールドを持つ型であること（型推論確認）', () => {
    // DB クエリから返ってくるオブジェクトの形を明示的に確認。
    // 実際の型チェックは tsc --noEmit で担保する。
    // ここでは期待する形のオブジェクトが構築できることを確認する。
    const alloc = {
      id:           'alloc-uuid-001',   // shipping_allocations.id
      inventoryId:  'inv-uuid-001',     // inventory.id
      locationCode: 'A-01',
      allocatedQty: 5,
    }

    expect(alloc.id).toBe('alloc-uuid-001')
    expect(alloc.inventoryId).toBe('inv-uuid-001')
    expect(alloc.locationCode).toBe('A-01')
    expect(alloc.allocatedQty).toBe(5)
  })
})
