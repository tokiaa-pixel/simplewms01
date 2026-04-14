-- =============================================================================
-- migration_v5.sql  ― rpc_reallocate_shipping_line を FIFO / 手動引当対応に更新
-- =============================================================================
-- 【目的】
--   フェーズ3-F: 再引当 RPC に手動引当（p_strategy='manual', p_allocations）を追加。
--   旧 4 引数シグネチャを破棄し、新 6 引数版に置き換える。
--
-- 【実行条件】
--   migration_v4.sql（rpc_allocate / deallocate 実装）適用済みであること。
--
-- 【安全性】
--   ・DROP FUNCTION IF EXISTS で冪等。
--   ・p_strategy DEFAULT 'fifo', p_allocations DEFAULT '[]' のため、
--     旧 4 引数での呼び出しも互換動作する（ただし旧シグネチャは削除）。
--   ・スキーマ変更（ALTER TABLE）なし。Function のみ差し替え。
--
-- 【適用手順】
--   Supabase ダッシュボード > SQL Editor > 本ファイルの内容を貼り付けて実行。
-- =============================================================================

-- 旧シグネチャを削除（どちらか一方だけ残っていても安全に落とせる）
DROP FUNCTION IF EXISTS rpc_reallocate_shipping_line(uuid,uuid,uuid,uuid);
DROP FUNCTION IF EXISTS rpc_reallocate_shipping_line(uuid,uuid,uuid,uuid,text,json);

-- 新 6 引数版を作成
CREATE OR REPLACE FUNCTION rpc_reallocate_shipping_line(
  p_header_id    uuid,
  p_tenant_id    uuid,
  p_warehouse_id uuid,
  p_line_id      uuid,
  p_strategy     text DEFAULT 'fifo',
  p_allocations  json DEFAULT '[]'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status           text;
  v_product_id       uuid;
  v_requested_qty    integer;
  v_alloc            record;      -- 既存 shipping_allocations 行（解除ループ用）
  v_inv              record;
  v_qty              integer;
  v_fifo_inv         record;
  v_manual_item      json;        -- 手動引当 JSON 要素
  v_remaining        integer;
  v_avail            integer;
  v_add_qty          integer;
  v_line_alloc_total integer;
  v_note             text;        -- inventory_transactions の note 値
BEGIN
  -- ── Step 1: ヘッダーの存在・スコープ・ステータスチェック ─────
  SELECT status
  INTO   v_status
  FROM   shipping_headers
  WHERE  id           = p_header_id
    AND  tenant_id    = p_tenant_id
    AND  warehouse_id = p_warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'error',
      '出庫指示が見つかりません。スコープ違反の可能性があります。'
    );
  END IF;

  IF v_status != 'pending' THEN
    RETURN json_build_object(
      'error',
      '再引当不可のステータスです: ' || v_status || '（未処理のみ再引当できます）'
    );
  END IF;

  -- strategy の検証
  IF p_strategy NOT IN ('fifo', 'manual') THEN
    RETURN json_build_object('error', '無効な引当戦略です: ' || p_strategy);
  END IF;

  -- ── Step 2: 対象明細行を SELECT FOR UPDATE ────────────────────
  SELECT product_id, requested_qty
  INTO   v_product_id, v_requested_qty
  FROM   shipping_lines
  WHERE  id           = p_line_id
    AND  header_id    = p_header_id
    AND  tenant_id    = p_tenant_id
    AND  warehouse_id = p_warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'error',
      '対象の明細行が見つかりません（line_id: ' || p_line_id || '）'
    );
  END IF;

  -- note 文字列を strategy から決定
  v_note := 'strategy:reallocate-' || p_strategy;

  -- ── Step 3: 既存引当を全解除 ──────────────────────────────────
  FOR v_alloc IN
    SELECT id, inventory_id, allocated_qty
    FROM   shipping_allocations
    WHERE  line_id = p_line_id
    ORDER BY id ASC
  LOOP
    v_qty := v_alloc.allocated_qty;

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

    IF v_inv.tenant_id != p_tenant_id OR v_inv.warehouse_id != p_warehouse_id THEN
      RAISE EXCEPTION 'テナントまたは倉庫の境界違反（inventory_id: %）', v_inv.id;
    END IF;

    IF v_inv.allocated_qty < v_qty THEN
      RAISE EXCEPTION '在庫整合エラー: allocated_qty が不足しています（inventory_id: %, allocated: %, dealloc: %）',
        v_inv.id, v_inv.allocated_qty, v_qty;
    END IF;

    UPDATE inventory
    SET    allocated_qty = v_inv.allocated_qty - v_qty
    WHERE  id = v_inv.id;

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
      'shipping_line',      p_line_id,
      v_note
    );

    UPDATE shipping_lines
    SET    allocated_qty = GREATEST(0, allocated_qty - v_qty)
    WHERE  id = p_line_id;

    DELETE FROM shipping_allocations WHERE id = v_alloc.id;

  END LOOP;  -- 既存引当の解除

  -- ── Step 4: 引当戦略に応じた新規引当 ─────────────────────────
  v_line_alloc_total := 0;

  IF p_strategy = 'fifo' THEN
    -- ── FIFO 引当 ────────────────────────────────────────────────
    v_remaining := v_requested_qty;

    FOR v_fifo_inv IN
      SELECT id, tenant_id, warehouse_id, product_id,
             on_hand_qty, allocated_qty, status,
             received_date, lot_no, expiry_date
      FROM   inventory
      WHERE  product_id   = v_product_id
        AND  tenant_id    = p_tenant_id
        AND  warehouse_id = p_warehouse_id
        AND  status       = 'available'
        AND  on_hand_qty - allocated_qty > 0
      ORDER BY received_date ASC NULLS LAST, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_avail   := GREATEST(0, v_fifo_inv.on_hand_qty - v_fifo_inv.allocated_qty);
      v_add_qty := LEAST(v_avail, v_remaining);
      IF v_add_qty <= 0 THEN CONTINUE; END IF;

      INSERT INTO shipping_allocations (line_id, inventory_id, allocated_qty)
      VALUES (p_line_id, v_fifo_inv.id, v_add_qty);

      UPDATE inventory
      SET    allocated_qty = v_fifo_inv.allocated_qty + v_add_qty
      WHERE  id = v_fifo_inv.id;

      INSERT INTO inventory_transactions (
        tenant_id,    warehouse_id,    inventory_id,     product_id,
        transaction_type,
        qty,          qty_delta,
        before_on_hand_qty,   after_on_hand_qty,
        before_allocated_qty, after_allocated_qty,
        received_date,        lot_no,                   expiry_date,
        reference_type,       reference_id,
        note
      ) VALUES (
        p_tenant_id,   p_warehouse_id,  v_fifo_inv.id,    v_fifo_inv.product_id,
        'allocation',
        0,             0,
        v_fifo_inv.on_hand_qty,    v_fifo_inv.on_hand_qty,
        v_fifo_inv.allocated_qty,  v_fifo_inv.allocated_qty + v_add_qty,
        v_fifo_inv.received_date,  v_fifo_inv.lot_no,        v_fifo_inv.expiry_date,
        'shipping_line',           p_line_id,
        v_note
      );

      v_remaining        := v_remaining - v_add_qty;
      v_line_alloc_total := v_line_alloc_total + v_add_qty;
    END LOOP;

    -- FIFO: 在庫不足時は全体ロールバック（旧引当も復元される）
    IF v_remaining > 0 THEN
      RAISE EXCEPTION '在庫不足のため再引当できません（不足数: %、商品ID: %）',
        v_remaining, v_product_id;
    END IF;

  ELSE
    -- ── 手動引当 ─────────────────────────────────────────────────
    -- p_allocations の各要素を処理。部分引当を許容（在庫不足チェックなし）。
    -- 各在庫行の available_qty 超過は EXCEPTION。
    FOR v_manual_item IN SELECT * FROM json_array_elements(p_allocations)
    LOOP
      v_add_qty := (v_manual_item->>'allocatedQty')::integer;

      SELECT id, tenant_id, warehouse_id, product_id,
             on_hand_qty, allocated_qty, status,
             received_date, lot_no, expiry_date
      INTO   v_inv
      FROM   inventory
      WHERE  id = (v_manual_item->>'inventoryId')::uuid
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION '在庫行が見つかりません（inventory_id: %）', (v_manual_item->>'inventoryId');
      END IF;

      IF v_inv.tenant_id != p_tenant_id OR v_inv.warehouse_id != p_warehouse_id THEN
        RAISE EXCEPTION 'テナントまたは倉庫の境界違反（inventory_id: %）', v_inv.id;
      END IF;

      IF v_inv.status != 'available' THEN
        RAISE EXCEPTION '引当対象外のステータスです（status: %, inventory_id: %）',
          v_inv.status, v_inv.id;
      END IF;

      v_avail := GREATEST(0, v_inv.on_hand_qty - v_inv.allocated_qty);
      IF v_add_qty > v_avail THEN
        RAISE EXCEPTION '引当可能数を超えています（在庫ID: %, 引当可能: %, 要求: %）',
          v_inv.id, v_avail, v_add_qty;
      END IF;

      INSERT INTO shipping_allocations (line_id, inventory_id, allocated_qty)
      VALUES (p_line_id, v_inv.id, v_add_qty);

      UPDATE inventory
      SET    allocated_qty = v_inv.allocated_qty + v_add_qty
      WHERE  id = v_inv.id;

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
        'allocation',
        0,             0,
        v_inv.on_hand_qty,    v_inv.on_hand_qty,
        v_inv.allocated_qty,  v_inv.allocated_qty + v_add_qty,
        v_inv.received_date,  v_inv.lot_no,           v_inv.expiry_date,
        'shipping_line',      p_line_id,
        v_note
      );

      v_line_alloc_total := v_line_alloc_total + v_add_qty;
    END LOOP;
  END IF;  -- strategy

  -- ── Step 5: shipping_lines.allocated_qty を新合計で更新 ────────
  UPDATE shipping_lines
  SET    allocated_qty = v_line_alloc_total
  WHERE  id = p_line_id;

  RETURN json_build_object('error', NULL::text);

EXCEPTION WHEN others THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION rpc_reallocate_shipping_line IS
  '再引当（FIFO / 手動）。pending ステータスのみ実行可（サーバー側で強制チェック）。'
  'p_strategy=fifo: 既存解除後 FIFO で全量引当。不足時は ROLLBACK で旧引当復元。'
  'p_strategy=manual: p_allocations 指定分のみ引当。部分引当許容（在庫不足チェックなし）。'
  'inventory_transactions に deallocation + allocation を記録（note=strategy:reallocate-fifo|manual）。';
