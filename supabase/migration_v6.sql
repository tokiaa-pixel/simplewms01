-- =============================================================================
-- migration_v6.sql  ― rpc_cancel_shipping_order の追加
-- =============================================================================
-- 【目的】
--   出荷キャンセル機能の実装。shipping_header を cancelled に更新し、
--   全 allocation を解除して inventory.allocated_qty を戻す RPC を追加する。
--
-- 【実行条件】
--   migration_v5.sql（rpc_reallocate_shipping_line 更新）適用済みであること。
--
-- 【安全性】
--   ・スキーマ変更（ALTER TABLE）なし。Function の追加のみ。
--   ・shipping_headers.status / shipping_lines.status の 'cancelled' 値は
--     schema_current.sql の CHECK 制約に既に含まれている。
--   ・inventory_transactions.transaction_type の 'deallocation' は
--     migration_v4.sql で追加済み。
--   ・DROP FUNCTION IF EXISTS で冪等に実行可能。
--
-- 【適用手順】
--   Supabase ダッシュボード > SQL Editor > 本ファイルの内容を貼り付けて実行。
-- =============================================================================

DROP FUNCTION IF EXISTS rpc_cancel_shipping_order(uuid,uuid,uuid,text);

CREATE OR REPLACE FUNCTION rpc_cancel_shipping_order(
  p_header_id    uuid,
  p_tenant_id    uuid,
  p_warehouse_id uuid,
  p_reason       text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_line   record;
  v_alloc  record;
  v_inv    record;
  v_qty    integer;
  v_note   text;
BEGIN
  -- note 文字列を構築（理由あり / なしで切り替え）
  v_note := CASE
    WHEN p_reason IS NOT NULL AND p_reason <> ''
      THEN 'reason:cancel:' || p_reason
    ELSE 'reason:cancel'
  END;

  -- ── Step 1: ヘッダーの取得・ロック・ステータスチェック ─────
  SELECT status
  INTO   v_status
  FROM   shipping_headers
  WHERE  id           = p_header_id
    AND  tenant_id    = p_tenant_id
    AND  warehouse_id = p_warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'error', '出庫指示が見つかりません。スコープ違反の可能性があります。'
    );
  END IF;

  -- shipped はキャンセル不可（on_hand_qty 減算済み）
  IF v_status = 'shipped' THEN
    RETURN json_build_object(
      'error', 'キャンセル不可のステータスです: shipped（出荷済みはキャンセルできません）'
    );
  END IF;

  -- 既にキャンセル済み → 冪等: success を返す
  IF v_status = 'cancelled' THEN
    RETURN json_build_object('error', NULL::text);
  END IF;

  -- ── Step 2: 全 shipping_lines を FOR UPDATE でロック ──────
  FOR v_line IN
    SELECT id, allocated_qty
    FROM   shipping_lines
    WHERE  header_id    = p_header_id
      AND  tenant_id    = p_tenant_id
      AND  warehouse_id = p_warehouse_id
    ORDER BY id ASC
    FOR UPDATE
  LOOP

    -- ── Step 3: 各明細の allocation を全解除 ───────────────
    -- ORDER BY id ASC でロック順を固定し deadlock を防ぐ
    FOR v_alloc IN
      SELECT id, inventory_id, allocated_qty
      FROM   shipping_allocations
      WHERE  line_id = v_line.id
      ORDER BY id ASC
    LOOP
      v_qty := v_alloc.allocated_qty;

      -- 在庫行を FOR UPDATE でロック
      SELECT id, tenant_id, warehouse_id, product_id,
             on_hand_qty, allocated_qty,
             received_date, lot_no, expiry_date
      INTO   v_inv
      FROM   inventory
      WHERE  id = v_alloc.inventory_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION '在庫行が見つかりません（inventory_id: %）', v_alloc.inventory_id;
      END IF;

      -- テナント/倉庫境界チェック
      IF v_inv.tenant_id != p_tenant_id OR v_inv.warehouse_id != p_warehouse_id THEN
        RAISE EXCEPTION 'テナントまたは倉庫の境界違反（inventory_id: %）', v_inv.id;
      END IF;

      -- allocated_qty 下限チェック（マイナス防止）
      IF v_inv.allocated_qty < v_qty THEN
        RAISE EXCEPTION '在庫整合エラー: allocated_qty が不足しています（inventory_id: %, allocated: %, dealloc: %）',
          v_inv.id, v_inv.allocated_qty, v_qty;
      END IF;

      -- ① inventory.allocated_qty を戻す（on_hand_qty は変化なし）
      UPDATE inventory
      SET    allocated_qty = v_inv.allocated_qty - v_qty
      WHERE  id = v_inv.id;

      -- ② inventory_transactions に解除イベントを記録
      --    transaction_type='deallocation'、note にキャンセル理由を付与
      INSERT INTO inventory_transactions (
        tenant_id,    warehouse_id,    inventory_id,   product_id,
        transaction_type,
        qty,          qty_delta,
        before_on_hand_qty,   after_on_hand_qty,
        before_allocated_qty, after_allocated_qty,
        received_date,        lot_no,                 expiry_date,
        reference_type,       reference_id,
        note
      ) VALUES (
        p_tenant_id,   p_warehouse_id,  v_inv.id,       v_inv.product_id,
        'deallocation',
        0,             0,
        v_inv.on_hand_qty,    v_inv.on_hand_qty,
        v_inv.allocated_qty,  v_inv.allocated_qty - v_qty,
        v_inv.received_date,  v_inv.lot_no,           v_inv.expiry_date,
        'shipping_line',      v_line.id,
        v_note
      );

      -- ③ shipping_allocations を削除
      DELETE FROM shipping_allocations WHERE id = v_alloc.id;

    END LOOP;  -- allocations

    -- ④ shipping_lines をキャンセル状態に更新
    UPDATE shipping_lines
    SET    status        = 'cancelled',
           allocated_qty = 0
    WHERE  id = v_line.id;

  END LOOP;  -- lines

  -- ── Step 4: ヘッダーをキャンセルに更新 ──────────────────────
  UPDATE shipping_headers
  SET    status = 'cancelled'
  WHERE  id = p_header_id;

  RETURN json_build_object('error', NULL::text);

EXCEPTION WHEN others THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION rpc_cancel_shipping_order IS
  '出荷キャンセル。pending / picking / inspected のみ実行可（サーバー側で強制チェック）。'
  'shipped は不可（on_hand_qty 減算済みのため）。cancelled 済みは冪等に success を返す。'
  '全 allocation を解除し inventory.allocated_qty を戻す（on_hand_qty は変化なし）。'
  'inventory_transactions に deallocation タイプで記録（note=reason:cancel[:<p_reason>]）。'
  '解除 → line キャンセル → header キャンセルを単一トランザクションで実行。';
