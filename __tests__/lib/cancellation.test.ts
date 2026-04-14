/**
 * cancellation.test.ts — 出荷キャンセル ステータス制御のユニットテスト
 *
 * ────────────────────────────────────────────────────────────────
 * 【自動テスト対象】
 *   lib/supabase/queries/allocation.ts
 *     - CANCEL_ELIGIBLE_STATUSES
 *     - isCancellationAllowed()
 *   lib/supabase/queries/shippings.ts
 *     - cancelShippingOrder（関数の存在・型）
 *
 * 【設計原則】
 *   - Supabase / DB アクセスなし。純粋関数・定数のみ対象。
 *   - 他の操作（dealloc / realloc）との関係を整合確認する。
 *   - RPC 本体（DB 挙動）は手動テスト観点としてコメントに記載。
 * ────────────────────────────────────────────────────────────────
 *
 * ────────────────────────────────────────────────────────────────
 * 【RPC 手動テスト観点】（DB 接続が必要なため自動化対象外）
 *
 * ── ステータス制御 ─────────────────────────────────────────────
 * [RPC-01] pending ヘッダーをキャンセル
 *            → { error: null }
 *            → shipping_headers.status = 'cancelled'
 * [RPC-02] picking ヘッダーをキャンセル
 *            → { error: null }
 *            → shipping_headers.status = 'cancelled'
 * [RPC-03] inspected ヘッダーをキャンセル
 *            → { error: null }
 *            → shipping_headers.status = 'cancelled'
 * [RPC-04] shipped ヘッダーをキャンセル
 *            → { error: 'キャンセル不可のステータスです: shipped（出荷済みはキャンセルできません）' }
 *            → shipping_headers.status は変化なし
 * [RPC-05] cancelled 済みヘッダーを再度キャンセル（二重キャンセル）
 *            → { error: null }（冪等: 何も変化しない）
 *
 * ── allocation 解除確認 ─────────────────────────────────────────
 * [RPC-06] キャンセル後、shipping_allocations に対象 header 配下の行が 0 件
 * [RPC-07] キャンセル後、inventory.allocated_qty が引当前の値に戻る
 *            例: before_allocated_qty=10 で 5 引き当て → キャンセル後 10 に戻る
 * [RPC-08] キャンセル後、shipping_lines.allocated_qty = 0（全明細）
 * [RPC-09] allocation なし（引当前）の pending をキャンセル
 *            → { error: null }（allocation ループが 0 件で正常完了）
 *            → inventory に変化なし、inventory_transactions に記録なし
 * [RPC-10] 複数 line × 複数 allocation を持つヘッダーを一括キャンセル
 *            → 全 line の全 allocation が解除される
 *            → 各 inventory.allocated_qty が対応分だけ戻る
 *
 * ── shipping_lines 状態確認 ────────────────────────────────────
 * [RPC-11] キャンセル後、shipping_lines.status = 'cancelled'（全明細）
 * [RPC-12] キャンセル後、shipping_lines.allocated_qty = 0（全明細）
 *
 * ── inventory_transactions 履歴確認 ───────────────────────────
 * [RPC-13] キャンセル後、inventory_transactions に以下が記録される
 *            - transaction_type = 'deallocation'
 *            - reference_type = 'shipping_line'
 *            - reference_id = shipping_lines.id
 *            - before_allocated_qty > after_allocated_qty
 *            - qty_delta = 0（on_hand_qty は不変）
 * [RPC-14] p_reason 指定なし（NULL）
 *            → inventory_transactions.note = 'reason:cancel'
 * [RPC-15] p_reason = '顧客都合' と指定
 *            → inventory_transactions.note = 'reason:cancel:顧客都合'
 * [RPC-16] allocation が N 件あれば inventory_transactions も N 件 INSERT される
 *
 * ── tenant / warehouse 制約 ────────────────────────────────────
 * [RPC-17] p_tenant_id が実際の tenant_id と異なる
 *            → { error: '出庫指示が見つかりません。スコープ違反の可能性があります。' }
 *            → 変更なし
 * [RPC-18] p_warehouse_id が実際の warehouse_id と異なる
 *            → 同上
 * [RPC-19] 在庫行の tenant_id がヘッダーの tenant_id と異なる（データ不整合）
 *            → RAISE EXCEPTION 'テナントまたは倉庫の境界違反' → ROLLBACK
 *
 * ── rollback 確認 ──────────────────────────────────────────────
 * [RPC-20] 複数 allocation のうち1件で境界違反が発生した場合
 *            → 全件の変更（inventory, inventory_transactions,
 *               shipping_allocations, shipping_lines, shipping_headers）が ROLLBACK
 *            → DB は操作前の状態に戻る
 * [RPC-21] allocated_qty 整合エラー（allocated_qty < dealloc 量）
 *            → RAISE EXCEPTION '在庫整合エラー' → ROLLBACK
 *
 * ── 並走保護 ───────────────────────────────────────────────────
 * [RPC-22] rpc_cancel と rpc_deallocate が同時実行された場合
 *            → FOR UPDATE により後発が待機。先発完了後に後発はステータスチェックで弾かれる。
 * [RPC-23] rpc_cancel と rpc_confirm_shipping_order が同時実行された場合
 *            → 同上。shipping_headers の FOR UPDATE で排他制御される。
 * ────────────────────────────────────────────────────────────────
 */

import { describe, it, expect } from 'vitest'
import {
  CANCEL_ELIGIBLE_STATUSES,
  isCancellationAllowed,
  DEALLOC_ELIGIBLE_STATUSES,
  isDeallocationAllowed,
  REALLOC_ELIGIBLE_STATUSES,
  isReallocationAllowed,
} from '@/lib/supabase/queries/allocation'
import { cancelShippingOrder } from '@/lib/supabase/queries/shippings'

// =============================================================
// CANCEL_ELIGIBLE_STATUSES の内容
// =============================================================

describe('CANCEL_ELIGIBLE_STATUSES', () => {
  it('配列長が 3 であること', () => {
    expect(CANCEL_ELIGIBLE_STATUSES).toHaveLength(3)
  })

  it("'pending' を含むこと（未処理はキャンセル可）", () => {
    expect(CANCEL_ELIGIBLE_STATUSES).toContain('pending')
  })

  it("'picking' を含むこと（ピッキング中はキャンセル可）", () => {
    expect(CANCEL_ELIGIBLE_STATUSES).toContain('picking')
  })

  it("'inspected' を含むこと（検品済みはキャンセル可）", () => {
    expect(CANCEL_ELIGIBLE_STATUSES).toContain('inspected')
  })

  it("'shipped' を含まないこと（on_hand_qty 減算済みのため不可）", () => {
    expect(CANCEL_ELIGIBLE_STATUSES).not.toContain('shipped')
  })

  it("'cancelled' を含まないこと（冪等処理は RPC 側で行うため UI 表示不要）", () => {
    expect(CANCEL_ELIGIBLE_STATUSES).not.toContain('cancelled')
  })
})

// =============================================================
// isCancellationAllowed — 全ステータスの判定
// =============================================================

describe('isCancellationAllowed', () => {
  it("pending → true（未処理はキャンセル可）", () => {
    expect(isCancellationAllowed('pending')).toBe(true)
  })

  it("picking → true（ピッキング中はキャンセル可）", () => {
    expect(isCancellationAllowed('picking')).toBe(true)
  })

  it("inspected → true（検品済みはキャンセル可）", () => {
    expect(isCancellationAllowed('inspected')).toBe(true)
  })

  it("shipped → false（出荷済みはキャンセル不可: on_hand_qty 減算済み）", () => {
    expect(isCancellationAllowed('shipped')).toBe(false)
  })

  it("cancelled → false（キャンセル済みはボタン非表示: 冪等処理は RPC 側）", () => {
    expect(isCancellationAllowed('cancelled')).toBe(false)
  })

  it("空文字 → false", () => {
    expect(isCancellationAllowed('')).toBe(false)
  })

  it("不明なステータス文字列 → false", () => {
    expect(isCancellationAllowed('unknown')).toBe(false)
  })

  it("数値型ライクな文字列 → false", () => {
    expect(isCancellationAllowed('0')).toBe(false)
  })
})

// =============================================================
// CANCEL vs DEALLOC vs REALLOC — 包含関係・整合性
// =============================================================

describe('ステータス操作可否マトリクス（cancel / dealloc / realloc）', () => {

  // ── pending ─────────────────────────────────────────────────
  it('pending: cancel 可・dealloc 可・realloc 可', () => {
    expect(isCancellationAllowed('pending')).toBe(true)
    expect(isDeallocationAllowed('pending')).toBe(true)
    expect(isReallocationAllowed('pending')).toBe(true)
  })

  // ── picking ─────────────────────────────────────────────────
  it('picking: cancel 可・dealloc 可・realloc 不可（現場作業中のため）', () => {
    expect(isCancellationAllowed('picking')).toBe(true)
    expect(isDeallocationAllowed('picking')).toBe(true)
    expect(isReallocationAllowed('picking')).toBe(false)
  })

  // ── inspected ───────────────────────────────────────────────
  it('inspected: cancel 可・dealloc 不可・realloc 不可（検品完了）', () => {
    expect(isCancellationAllowed('inspected')).toBe(true)
    expect(isDeallocationAllowed('inspected')).toBe(false)
    expect(isReallocationAllowed('inspected')).toBe(false)
  })

  // ── shipped ─────────────────────────────────────────────────
  it('shipped: cancel 不可・dealloc 不可・realloc 不可（出荷済み）', () => {
    expect(isCancellationAllowed('shipped')).toBe(false)
    expect(isDeallocationAllowed('shipped')).toBe(false)
    expect(isReallocationAllowed('shipped')).toBe(false)
  })

  // ── cancelled ───────────────────────────────────────────────
  it('cancelled: cancel 不可・dealloc 不可・realloc 不可（操作対象外）', () => {
    expect(isCancellationAllowed('cancelled')).toBe(false)
    expect(isDeallocationAllowed('cancelled')).toBe(false)
    expect(isReallocationAllowed('cancelled')).toBe(false)
  })
})

// =============================================================
// 包含関係の定量チェック
// =============================================================

describe('CANCEL_ELIGIBLE は DEALLOC_ELIGIBLE を完全包含する', () => {
  it('DEALLOC_ELIGIBLE の全要素が CANCEL_ELIGIBLE に含まれる', () => {
    for (const s of DEALLOC_ELIGIBLE_STATUSES) {
      expect(CANCEL_ELIGIBLE_STATUSES).toContain(s)
    }
  })

  it('CANCEL_ELIGIBLE は DEALLOC_ELIGIBLE より要素数が多い（inspected を追加）', () => {
    expect(CANCEL_ELIGIBLE_STATUSES.length).toBeGreaterThan(DEALLOC_ELIGIBLE_STATUSES.length)
  })

  it("CANCEL_ELIGIBLE にのみ 'inspected' が含まれる", () => {
    expect(CANCEL_ELIGIBLE_STATUSES).toContain('inspected')
    expect(DEALLOC_ELIGIBLE_STATUSES).not.toContain('inspected')
  })
})

describe('CANCEL_ELIGIBLE と REALLOC_ELIGIBLE の包含関係', () => {
  it('REALLOC_ELIGIBLE（pending のみ）は CANCEL_ELIGIBLE の部分集合', () => {
    for (const s of REALLOC_ELIGIBLE_STATUSES) {
      expect(CANCEL_ELIGIBLE_STATUSES).toContain(s)
    }
  })

  it('CANCEL_ELIGIBLE は REALLOC_ELIGIBLE より広い（picking/inspected を追加）', () => {
    expect(CANCEL_ELIGIBLE_STATUSES.length).toBeGreaterThan(REALLOC_ELIGIBLE_STATUSES.length)
  })
})

// =============================================================
// キャンセルが最も広いステータス範囲を持つことを確認
// =============================================================

describe('キャンセルは最も広いステータス範囲を持つ', () => {
  const allStatuses = ['pending', 'picking', 'inspected', 'shipped', 'cancelled'] as const

  it('キャンセル可能なステータス数は引当解除可能なステータス数以上', () => {
    const cancelCount = allStatuses.filter(isCancellationAllowed).length
    const deallocCount = allStatuses.filter(isDeallocationAllowed).length
    expect(cancelCount).toBeGreaterThanOrEqual(deallocCount)
  })

  it('キャンセル可能なステータス数は再引当可能なステータス数より多い', () => {
    const cancelCount = allStatuses.filter(isCancellationAllowed).length
    const reallocCount = allStatuses.filter(isReallocationAllowed).length
    expect(cancelCount).toBeGreaterThan(reallocCount)
  })
})

// =============================================================
// cancelShippingOrder の関数インターフェース確認
// （DB アクセスは行わない。関数として呼び出し可能かのみ確認）
// =============================================================

describe('cancelShippingOrder の型・エクスポート確認', () => {
  it('cancelShippingOrder が関数としてエクスポートされていること', () => {
    expect(typeof cancelShippingOrder).toBe('function')
  })

  it('cancelShippingOrder は非同期関数（Promise を返す）', () => {
    // 実際の DB 呼び出しはしない。戻り値の型（Promise）を確認するため、
    // 無効な UUID を渡して即 reject / error になることを確認する。
    // ネットワーク接続がなければ Supabase client エラーになる（テスト目的を達成）
    const result = cancelShippingOrder({
      headerId: '00000000-0000-0000-0000-000000000000',
      scope:    { tenantId: 'dummy', warehouseId: 'dummy' },
    })
    expect(result).toBeInstanceOf(Promise)
    // Promise を解決させずに破棄する（接続エラーは無視）
    result.catch(() => {})
  })
})

// =============================================================
// 戻り値の型確認（純粋関数の型安全性）
// =============================================================

describe('isCancellationAllowed の戻り値の型', () => {
  it('boolean を返すこと（pending）', () => {
    expect(typeof isCancellationAllowed('pending')).toBe('boolean')
  })

  it('boolean を返すこと（shipped）', () => {
    expect(typeof isCancellationAllowed('shipped')).toBe('boolean')
  })
})
