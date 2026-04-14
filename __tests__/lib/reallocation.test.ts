/**
 * reallocation.test.ts
 *
 * 再引当機能のテスト。
 *
 * 【テスト対象】
 *   lib/supabase/queries/allocation.ts
 *     - isReallocationAllowed（ステータス判定・純粋関数）
 *     - REALLOC_ELIGIBLE_STATUSES（定数）
 *     - isReallocationAllowed と isDeallocationAllowed の関係
 *
 * 【設計原則】
 *   再引当は「解除 → FIFO 引当」を単一トランザクションで原子的に実行する。
 *   クライアント側の isReallocationAllowed はボタン表示の制御に使い、
 *   最終的な権限チェックは必ず rpc_reallocate_shipping_line（サーバー側）で行う。
 *
 * 【RPC レベルのテスト観点（DB 接続が必要なため自動化なし・手動確認）】
 *
 *   ─ ステータス制御 ─────────────────────────────────────────────────────
 *   [RPC-01] pending の出庫指示 → 再引当成功
 *             shipping_allocations が新しい行に差し替えられる
 *             inventory.allocated_qty が整合する
 *
 *   [RPC-02] picking の出庫指示 → RETURN { error: '再引当不可のステータスです: picking（未処理のみ再引当できます）' }
 *             DB は一切変更されない
 *
 *   [RPC-03] inspected の出庫指示 → RETURN { error: '再引当不可のステータスです: inspected...' }
 *
 *   [RPC-04] shipped の出庫指示 → RETURN { error: '再引当不可のステータスです: shipped...' }
 *
 *   [RPC-05] cancelled の出庫指示 → RETURN { error: '再引当不可のステータスです: cancelled...' }
 *
 *   ─ 既存引当の解除確認 ────────────────────────────────────────────────
 *   [RPC-06] 再引当前後で旧 shipping_allocations が全削除されること
 *             SELECT COUNT(*) FROM shipping_allocations WHERE line_id = :line_id
 *             → 再引当前の行は全件なくなる
 *
 *   [RPC-07] 旧引当分の inventory.allocated_qty が解除されること
 *             旧在庫: allocated_qty が解除数分だけ減算されている
 *
 *   [RPC-08] 旧引当ごとに inventory_transactions (type='deallocation') が記録されること
 *             note = 'strategy:reallocate-fifo'
 *             reference_type = 'shipping_line', reference_id = line_id
 *
 *   ─ 新規引当の確認 ────────────────────────────────────────────────────
 *   [RPC-09] 新しい shipping_allocations が FIFO 順で作成されること
 *             received_date が古い在庫から優先的に引き当てられる
 *
 *   [RPC-10] 新引当分の inventory.allocated_qty が加算されること
 *             新在庫: allocated_qty += 引当数
 *
 *   [RPC-11] 新引当ごとに inventory_transactions (type='allocation') が記録されること
 *             note = 'strategy:reallocate-fifo'
 *             reference_type = 'shipping_line', reference_id = line_id
 *
 *   ─ shipping_lines の整合性 ──────────────────────────────────────────
 *   [RPC-12] shipping_lines.allocated_qty が新引当合計と一致すること
 *             再引当後: SUM(shipping_allocations.allocated_qty WHERE line_id=:id)
 *                     = shipping_lines.allocated_qty
 *
 *   ─ 在庫不足時の挙動 ────────────────────────────────────────────────
 *   [RPC-13] 再引当で在庫不足（available_qty < requested_qty）→
 *             RETURN { error: '在庫不足のため再引当できません（不足数: N、商品ID: uuid）' }
 *             旧引当が復元されること（ロールバック）
 *             shipping_allocations / inventory.allocated_qty が再引当前と同じ状態に戻る
 *
 *   ─ トランザクション保証 ──────────────────────────────────────────────
 *   [RPC-14] 新規引当フェーズで途中エラーが発生した場合、
 *             旧引当の解除も含めて全変更がロールバックされる
 *             → shipping_allocations の旧行が残っている
 *             → 旧在庫の allocated_qty が元に戻っている
 *
 *   ─ テナント / 倉庫制約 ───────────────────────────────────────────────
 *   [RPC-15] p_tenant_id が一致しない → RETURN { error: '出庫指示が見つかりません。スコープ違反の可能性があります。' }
 *
 *   [RPC-16] p_warehouse_id が一致しない → RETURN { error: '出庫指示が見つかりません。スコープ違反の可能性があります。' }
 */

import { describe, it, expect } from 'vitest'
import {
  isReallocationAllowed,
  REALLOC_ELIGIBLE_STATUSES,
  isDeallocationAllowed,
  DEALLOC_ELIGIBLE_STATUSES,
} from '../../lib/supabase/queries/allocation'

// ── isReallocationAllowed テスト ────────────────────────────────

describe('isReallocationAllowed', () => {

  // ─── 再引当可能なステータス ─────────────────────────────────

  it('pending → 再引当可（true）', () => {
    expect(isReallocationAllowed('pending')).toBe(true)
  })

  // ─── 再引当不可なステータス ─────────────────────────────────

  it('picking → 再引当不可（false）', () => {
    // ピッキング中は現場が在庫を持ち出している可能性があるため
    expect(isReallocationAllowed('picking')).toBe(false)
  })

  it('inspected → 再引当不可（false）', () => {
    // 検品完了後は在庫の物理配置が確定しているため
    expect(isReallocationAllowed('inspected')).toBe(false)
  })

  it('shipped → 再引当不可（false）', () => {
    // 出荷確定後は on_hand_qty が既に減算されているため
    expect(isReallocationAllowed('shipped')).toBe(false)
  })

  it('cancelled → 再引当不可（false）', () => {
    expect(isReallocationAllowed('cancelled')).toBe(false)
  })

  it('未知のステータス文字列 → 再引当不可（false）', () => {
    expect(isReallocationAllowed('unknown')).toBe(false)
  })

  it('空文字 → 再引当不可（false）', () => {
    expect(isReallocationAllowed('')).toBe(false)
  })

  // ─── REALLOC_ELIGIBLE_STATUSES との整合性 ────────────────────

  it('REALLOC_ELIGIBLE_STATUSES の全要素が isReallocationAllowed で true を返す', () => {
    for (const status of REALLOC_ELIGIBLE_STATUSES) {
      expect(isReallocationAllowed(status)).toBe(true)
    }
  })

  it('REALLOC_ELIGIBLE_STATUSES は pending の 1 値のみ', () => {
    expect(REALLOC_ELIGIBLE_STATUSES).toHaveLength(1)
    expect(REALLOC_ELIGIBLE_STATUSES).toContain('pending')
  })

  it('pending は再引当可かつ引当解除も可', () => {
    // pending では引当の変更（解除・再引当）が両方許容される
    expect(isReallocationAllowed('pending')).toBe(true)
    expect(isDeallocationAllowed('pending')).toBe(true)
  })

  it('picking は引当解除は可だが再引当は不可', () => {
    // ピッキング中: 現場の混乱を防ぐため引当先の変更は禁止
    // ただし「戻し解除」（picking → pending 相当の操作）は可能
    expect(isReallocationAllowed('picking')).toBe(false)
    expect(isDeallocationAllowed('picking')).toBe(true)
  })

  it('shipped は引当解除も再引当も不可', () => {
    // 出荷確定後は inventory.on_hand_qty が減算済み
    // この状態で allocated_qty を単独で変更すると整合性が崩れる
    expect(isReallocationAllowed('shipped')).toBe(false)
    expect(isDeallocationAllowed('shipped')).toBe(false)
  })
})

// ── REALLOC_ELIGIBLE_STATUSES の設計意図確認 ──────────────────────

describe('REALLOC_ELIGIBLE_STATUSES の設計', () => {

  it('REALLOC_ELIGIBLE_STATUSES は DEALLOC_ELIGIBLE_STATUSES の真部分集合', () => {
    // 再引当可能なステータスは引当解除可能なステータスのサブセットであること
    // （再引当の第1フェーズは解除であるため）
    for (const status of REALLOC_ELIGIBLE_STATUSES) {
      expect(
        (DEALLOC_ELIGIBLE_STATUSES as string[]).includes(status),
      ).toBe(true)
    }
  })

  it('picking は解除可で再引当不可 → REALLOC の方が制限が厳しい', () => {
    // 再引当は解除より制限が厳しい（picking では解除のみ許可）
    const dealloc = new Set(DEALLOC_ELIGIBLE_STATUSES as string[])
    const realloc = new Set(REALLOC_ELIGIBLE_STATUSES as string[])

    // realloc は dealloc の真部分集合
    for (const s of realloc) {
      expect(dealloc.has(s)).toBe(true)
    }
    // dealloc の方がサイズが大きい（picking が追加要素）
    expect(dealloc.size).toBeGreaterThan(realloc.size)
  })
})

// ── reallocateShippingLine 関数シグネチャの型確認 ─────────────────

describe('reallocateShippingLine パラメータ構造（型チェック補完）', () => {

  it('期待するパラメータ構造でオブジェクトが構築できること', () => {
    // tsc --noEmit で実際の型チェックは担保する。
    // ここでは期待するパラメータ形状を仕様として明示する。
    const params = {
      headerId: 'header-uuid-001',  // shipping_headers.id
      lineId:   'line-uuid-001',    // shipping_lines.id
      scope: {
        tenantId:    'tenant-uuid-001',
        warehouseId: 'warehouse-uuid-001',
      },
    }

    expect(params.headerId).toBe('header-uuid-001')
    expect(params.lineId).toBe('line-uuid-001')
    expect(params.scope.tenantId).toBe('tenant-uuid-001')
    expect(params.scope.warehouseId).toBe('warehouse-uuid-001')
  })

  it('戻り値は { error: string | null } 形式であること', () => {
    // 成功時
    const successResult: { error: string | null } = { error: null }
    expect(successResult.error).toBeNull()

    // 失敗時
    const failResult: { error: string | null } = {
      error: '再引当不可のステータスです: picking（未処理のみ再引当できます）',
    }
    expect(typeof failResult.error).toBe('string')
  })
})
