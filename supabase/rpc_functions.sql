-- =============================================================================
-- rpc_functions.sql  ― トランザクション安全な業務 RPC 関数群
-- =============================================================================
-- 【目的】
--   クライアントサイドの逐次 Supabase 呼び出しは TOCTOU 競合リスクがある。
--   本ファイルの RPC 関数はすべて単一トランザクション内で実行し、
--   SELECT … FOR UPDATE による行ロックで競合を防止する。
--
-- 【呼び出し方（TypeScript）】
--   const { data, error } = await supabase.rpc('rpc_confirm_arrival_receiving', { ... })
--   if (data?.error) { /* business error */ }
--   if (error)       { /* network/auth error */ }
--
-- 【戻り値の規約】
--   全関数は json を返す。正常時: {"error": null}、異常時: {"error": "メッセージ"}。
--   PostgreSQL 例外は EXCEPTION ブロックでキャッチして json に変換する（呼び出し元は
--   Supabase の .rpc() が返す error ではなく data.error を確認すること）。
-- =============================================================================


-- =============================================================================
-- 1. rpc_confirm_arrival_receiving
--    入庫確定：inventory 更新 + arrival_lines 更新 + arrival_headers ステータス再計算
-- =============================================================================
-- 【置き換え対象】
--   lib/supabase/queries/receiving.ts の confirmArrivalReceiving()
--
-- 【パラメータ】
--   p_line_id        : arrival_lines.id
--   p_header_id      : arrival_headers.id
--   p_product_id     : products.id
--   p_location_id    : locations.id
--   p_add_qty        : 今回入庫する数量
--   p_total_planned  : arrival_lines.planned_qty（完了判定に使用）
--   p_total_received : 今回分を含む累積 received_qty
--   p_inv_status     : inventory.status ('available' | 'hold' | 'damaged')
--   p_received_date  : 入庫確定日 (YYYY-MM-DD)
--   p_lot_no         : ロット番号（NULL = ロット管理なし）
--   p_tenant_id      : tenants.id
--   p_warehouse_id   : warehouses.id

DROP FUNCTION IF EXISTS rpc_confirm_arrival_receiving(uuid,uuid,uuid,uuid,integer,integer,integer,text,date,text,uuid,uuid);

CREATE OR REPLACE FUNCTION rpc_confirm_arrival_receiving(
  p_line_id        uuid,
  p_header_id      uuid,
  p_product_id     uuid,
  p_location_id    uuid,
  p_add_qty        integer,
  p_total_planned  integer,
  p_total_received integer,
  p_inv_status     text,
  p_received_date  date,
  p_lot_no         text    DEFAULT NULL,
  p_tenant_id      uuid    DEFAULT NULL,
  p_warehouse_id   uuid    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_id    uuid;
  v_on_hand        integer;
  v_line_status    text;
  v_new_hdr_status text;
  v_active_count   integer;
  v_done_count     integer;
  v_has_partial    boolean;
BEGIN
  -- ── 入力バリデーション ───────────────────────────────────────────────
  IF p_add_qty <= 0 THEN
    RETURN json_build_object('error', '入庫数量は1以上を指定してください');
  END IF;
  IF p_location_id IS NULL THEN
    RETURN json_build_object('error', 'ロケーションが設定されていません');
  END IF;

  -- ── Step 1: 既存在庫行を FOR UPDATE でロック ──────────────────────
  -- 検索キー: (product_id, location_id, status, COALESCE(lot_no,'')) + scope
  -- lot_no の NULL を '' として扱うことで、同一ロットの行を正しく特定する。
  SELECT id, on_hand_qty
  INTO   v_existing_id, v_on_hand
  FROM   inventory
  WHERE  product_id   = p_product_id
    AND  location_id  = p_location_id
    AND  status       = p_inv_status
    AND  COALESCE(lot_no, '') = COALESCE(p_lot_no, '')
    AND  (p_tenant_id    IS NULL OR tenant_id    = p_tenant_id)
    AND  (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
  FOR UPDATE;  -- 他のトランザクションによる同時更新をブロック

  -- ── Step 2: inventory を upsert ──────────────────────────────────
  IF FOUND THEN
    -- 既存行あり → on_hand_qty を加算（received_date は変更しない）
    UPDATE inventory
    SET    on_hand_qty = v_on_hand + p_add_qty
    WHERE  id = v_existing_id;
  ELSE
    -- 存在しない → 新規 INSERT（received_date = 入庫確定日）
    INSERT INTO inventory (
      product_id, location_id, on_hand_qty, allocated_qty,
      status, received_date, lot_no,
      tenant_id, warehouse_id
    ) VALUES (
      p_product_id, p_location_id, p_add_qty, 0,
      p_inv_status, p_received_date, p_lot_no,
      p_tenant_id, p_warehouse_id
    );
  END IF;

  -- ── Step 3: arrival_lines を更新 ────────────────────────────────
  v_line_status := CASE
    WHEN p_total_received >= p_total_planned THEN 'completed'
    ELSE 'receiving'
  END;

  UPDATE arrival_lines
  SET    received_qty       = p_total_received,
         status             = v_line_status,
         actual_location_id = p_location_id
  WHERE  id = p_line_id;

  -- ── Step 4: 同一ヘッダーの全明細を集計して header status を再計算 ─
  SELECT
    COUNT(*)          FILTER (WHERE status != 'cancelled'),
    COUNT(*)          FILTER (WHERE status = 'completed')
  INTO v_active_count, v_done_count
  FROM arrival_lines
  WHERE header_id = p_header_id;

  IF v_active_count = 0 THEN
    v_new_hdr_status := 'cancelled';
  ELSIF v_done_count = v_active_count THEN
    v_new_hdr_status := 'completed';
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM arrival_lines
      WHERE  header_id    = p_header_id
        AND  status       != 'cancelled'
        AND  received_qty  > 0
    ) INTO v_has_partial;
    v_new_hdr_status := CASE WHEN v_has_partial THEN 'receiving' ELSE 'planned' END;
  END IF;

  UPDATE arrival_headers
  SET    status = v_new_hdr_status
  WHERE  id = p_header_id;

  RETURN json_build_object('error', NULL::text);

EXCEPTION WHEN others THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION rpc_confirm_arrival_receiving IS
  '入庫確定。inventory upsert + arrival_lines 更新 + arrival_headers ステータス再計算を単一トランザクションで実行する。';


-- =============================================================================
-- 2. rpc_allocate_shipping_inventory
--    出庫指示登録：shipping_headers / lines / allocations INSERT
--    + inventory.allocated_qty 加算を単一トランザクションで実行
-- =============================================================================
-- 【置き換え対象】
--   lib/supabase/queries/shippings.ts の createShippingOrder()
--
-- 【パラメータ】
--   p_shipping_no   : 出庫指示番号（重複チェックは呼び出し元が事前に実施）
--   p_shipping_date : 出庫予定日 (YYYY-MM-DD)
--   p_customer_id   : customers.id
--   p_memo          : 備考（NULL 可）
--   p_tenant_id     : tenants.id
--   p_warehouse_id  : warehouses.id
--   p_lines         : JSON 配列。各要素:
--       { "lineNo": 1,
--         "productId": "uuid",
--         "requestedQty": 10,
--         "allocations": [
--           { "inventoryId": "uuid", "allocatedQty": 5 },
--           ...
--         ]
--       }

DROP FUNCTION IF EXISTS rpc_allocate_shipping_inventory(text,date,uuid,text,uuid,uuid,json);

CREATE OR REPLACE FUNCTION rpc_allocate_shipping_inventory(
  p_shipping_no   text,
  p_shipping_date date,
  p_customer_id   uuid,
  p_memo          text,
  p_tenant_id     uuid,
  p_warehouse_id  uuid,
  p_lines         json
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
-- =============================================================================
-- フェーズ3-3 強化内容:
--   1. テナント/倉庫境界チェック（他テナントの在庫への誤引当を防止）
--   2. status = 'available' のみ引当対象とする
--   3. inventory_transactions に 'allocation' レコードを挿入（監査ログ）
--   4. shipping_lines.allocated_qty を行ごとの合計で同期
-- =============================================================================
DECLARE
  v_header_id        uuid;
  v_line_id          uuid;
  v_line             json;
  v_alloc            json;
  v_inv              record;      -- inventory 行（FOR UPDATE でロック取得後の全フィールド）
  v_avail            integer;
  v_add_qty          integer;
  v_line_alloc_total integer;     -- 1明細行の引当合計（shipping_lines.allocated_qty 同期用）
  -- フェーズ3-4: FIFO 戦略用
  v_strategy         text;        -- 引当戦略: 'fifo' | 'manual'（デフォルト: 'manual'）
  v_fifo_inv         record;      -- FIFO 引当候補在庫行
  v_remaining        integer;     -- FIFO 残余引当数
BEGIN
  -- ── Step 1: shipping_headers を INSERT ──────────────────────────
  INSERT INTO shipping_headers (
    shipping_no, shipping_date, customer_id, status, memo,
    tenant_id, warehouse_id
  ) VALUES (
    p_shipping_no, p_shipping_date, p_customer_id, 'pending', p_memo,
    p_tenant_id, p_warehouse_id
  )
  RETURNING id INTO v_header_id;

  -- ── Step 2: 各明細を処理 ──────────────────────────────────────
  FOR v_line IN SELECT * FROM json_array_elements(p_lines)
  LOOP
    v_line_alloc_total := 0;

    -- shipping_lines を INSERT（allocated_qty は 0 で初期化し、後で同期）
    INSERT INTO shipping_lines (
      header_id, line_no, product_id, requested_qty, shipped_qty,
      allocated_qty, status,
      tenant_id, warehouse_id
    ) VALUES (
      v_header_id,
      (v_line->>'lineNo')::integer,
      (v_line->>'productId')::uuid,
      (v_line->>'requestedQty')::integer,
      0,
      0,
      'pending',
      p_tenant_id,
      p_warehouse_id
    )
    RETURNING id INTO v_line_id;

    -- ── 引当戦略に応じた処理 ──────────────────────────────────
    -- strategy: 'fifo'   → received_date ASC でサーバー側自動引当（フェーズ3-4）
    -- strategy: 'manual' → フロント側で選択した allocations をそのまま使用（フェーズ3-3）
    -- 未指定             → 'manual' にフォールバック（後方互換）
    v_strategy := COALESCE(v_line->>'strategy', 'manual');

    IF v_strategy = 'fifo' THEN
      -- ── FIFO 自動引当 ─────────────────────────────────────────
      -- available 在庫を received_date ASC NULLS LAST 順にロックしながら貪欲に引き当てる。
      -- 在庫不足の場合は引当可能な分だけ割り当てる（部分引当許容）。
      -- ORDER BY id ASC を追加してロック順を一定にし deadlock を防ぐ。
      v_remaining := (v_line->>'requestedQty')::integer;

      FOR v_fifo_inv IN
        SELECT id, tenant_id, warehouse_id, product_id,
               on_hand_qty, allocated_qty, status,
               received_date, lot_no, expiry_date   -- フェーズ3-5: FEFO トレーサビリティ用
        FROM   inventory
        WHERE  product_id   = (v_line->>'productId')::uuid
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

        -- ① shipping_allocations を INSERT
        INSERT INTO shipping_allocations (line_id, inventory_id, allocated_qty)
        VALUES (v_line_id, v_fifo_inv.id, v_add_qty);

        -- ② inventory.allocated_qty を加算
        UPDATE inventory
        SET    allocated_qty = v_fifo_inv.allocated_qty + v_add_qty
        WHERE  id = v_fifo_inv.id;

        -- ③ inventory_transactions に引当イベントを記録
        --    received_date / lot_no / expiry_date をスナップショットとして保持（FEFO 対応前準備）
        --    note に引当戦略を記録（監査・将来 FEFO 切り替え時の確認に使用）
        INSERT INTO inventory_transactions (
          tenant_id,    warehouse_id,    inventory_id,     product_id,
          transaction_type,
          qty_delta,
          before_on_hand_qty,   after_on_hand_qty,
          before_allocated_qty, after_allocated_qty,
          received_date,        lot_no,                   expiry_date,
          reference_type,       reference_id,
          note
        ) VALUES (
          p_tenant_id,   p_warehouse_id,  v_fifo_inv.id,    v_fifo_inv.product_id,
          'allocation',
          0,
          v_fifo_inv.on_hand_qty,    v_fifo_inv.on_hand_qty,
          v_fifo_inv.allocated_qty,  v_fifo_inv.allocated_qty + v_add_qty,
          v_fifo_inv.received_date,  v_fifo_inv.lot_no,        v_fifo_inv.expiry_date,
          'shipping_line',           v_line_id,
          'strategy:fifo'
        );

        v_remaining        := v_remaining - v_add_qty;
        v_line_alloc_total := v_line_alloc_total + v_add_qty;
      END LOOP;  -- FIFO 在庫スキャン

    ELSE
      -- ── 手動引当: フロント側で選択した allocations を使用 ────────
      FOR v_alloc IN SELECT * FROM json_array_elements(v_line->'allocations')
      LOOP
        v_add_qty := (v_alloc->>'allocatedQty')::integer;

        -- ① 在庫行を FOR UPDATE でロック（同時書き込み防止）
        --    received_date / lot_no / expiry_date も取得（FEFO トレーサビリティ用）
        SELECT id, tenant_id, warehouse_id, product_id,
               on_hand_qty, allocated_qty, status,
               received_date, lot_no, expiry_date
        INTO   v_inv
        FROM   inventory
        WHERE  id = (v_alloc->>'inventoryId')::uuid
        FOR UPDATE;

        -- ② 在庫行の存在チェック
        IF NOT FOUND THEN
          RAISE EXCEPTION '在庫行が見つかりません（inventory_id: %）',
            (v_alloc->>'inventoryId');
        END IF;

        -- ③ テナント/倉庫境界チェック（他テナントの在庫への誤引当を防止）
        IF v_inv.tenant_id != p_tenant_id OR v_inv.warehouse_id != p_warehouse_id THEN
          RAISE EXCEPTION 'テナントまたは倉庫の境界違反（inventory_id: %, expected tenant: %, warehouse: %）',
            v_inv.id, p_tenant_id, p_warehouse_id;
        END IF;

        -- ④ ステータスチェック（available のみ引当対象）
        IF v_inv.status != 'available' THEN
          RAISE EXCEPTION '引当対象外のステータスです（status: %, inventory_id: %）',
            v_inv.status, v_inv.id;
        END IF;

        -- ⑤ 引当可能数チェック
        v_avail := GREATEST(0, v_inv.on_hand_qty - v_inv.allocated_qty);
        IF v_add_qty > v_avail THEN
          RAISE EXCEPTION '引当可能数を超えています（在庫ID: %, 引当可能: %, 要求: %）',
            v_inv.id, v_avail, v_add_qty;
        END IF;

        -- ⑥ shipping_allocations を INSERT
        INSERT INTO shipping_allocations (line_id, inventory_id, allocated_qty)
        VALUES (v_line_id, v_inv.id, v_add_qty);

        -- ⑦ inventory.allocated_qty を加算
        UPDATE inventory
        SET    allocated_qty = v_inv.allocated_qty + v_add_qty
        WHERE  id = v_inv.id;

        -- ⑧ inventory_transactions に引当イベントを記録
        --    on_hand_qty は変化しない（qty_delta = 0）
        --    received_date / lot_no / expiry_date をスナップショットとして保持（FEFO 対応前準備）
        --    note に引当戦略を記録（監査・将来 FEFO 切り替え時の確認に使用）
        INSERT INTO inventory_transactions (
          tenant_id,    warehouse_id,    inventory_id,   product_id,
          transaction_type,
          qty_delta,
          before_on_hand_qty,   after_on_hand_qty,
          before_allocated_qty, after_allocated_qty,
          received_date,        lot_no,                 expiry_date,
          reference_type,       reference_id,
          note
        ) VALUES (
          p_tenant_id,   p_warehouse_id,  v_inv.id,       v_inv.product_id,
          'allocation',
          0,
          v_inv.on_hand_qty,    v_inv.on_hand_qty,
          v_inv.allocated_qty,  v_inv.allocated_qty + v_add_qty,
          v_inv.received_date,  v_inv.lot_no,           v_inv.expiry_date,
          'shipping_line',      v_line_id,
          'strategy:manual'
        );

        v_line_alloc_total := v_line_alloc_total + v_add_qty;
      END LOOP;  -- allocations
    END IF;  -- strategy

    -- ⑨ shipping_lines.allocated_qty を明細行ごとの合計で同期
    UPDATE shipping_lines
    SET    allocated_qty = v_line_alloc_total
    WHERE  id = v_line_id;

  END LOOP;  -- lines

  RETURN json_build_object('error', NULL::text);

EXCEPTION WHEN others THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION rpc_allocate_shipping_inventory IS
  '出庫指示登録（フェーズ3-4: FIFO strategy 対応）。'
  'line JSON の strategy フィールドで引当方式を切り替える: '
  '  fifo   → received_date ASC でサーバー側 FIFO 自動引当（部分引当許容）'
  '  manual → フロント選択の allocations を使用（テナント/境界/available チェックあり）'
  '  未指定 → manual にフォールバック（後方互換）'
  'すべて単一トランザクション。FEFO 追加時は strategy=fefo ブランチを追加する。';


-- =============================================================================
-- 3. rpc_confirm_shipping_order
--    出庫確定（inspected → shipped）
--    inventory の on_hand_qty / allocated_qty を減算し、
--    inventory_transactions に 'shipping' タイプで記録する。
--    単一トランザクションで全更新を実行する（フェーズ3-5）。
-- =============================================================================
-- 【置き換え対象】
--   lib/supabase/queries/shippings.ts の confirmShippingOrder()
--
-- 【パラメータ】
--   p_header_id    : shipping_headers.id
--   p_tenant_id    : tenants.id（スコープ検証用）
--   p_warehouse_id : warehouses.id（スコープ検証用）
--
-- 【shipped_qty の配分ロジック】
--   各明細の shipped_qty（検品確定値）を引当行に順番に配分する。
--   v_remaining をデクリメントすることで合計が shipped_qty を超えないよう制御。
--   allocated_qty は shipped_qty に関わらず全量解放する（予約済み分を常にクリア）。
--
-- 【テスト観点（DB 接続が必要なため自動化なし・手動確認）】
--   1. status = 'inspected' のヘッダーのみ処理可
--   2. tenant_id / warehouse_id 不一致時は EXCEPTION
--   3. 全明細完了後に header.status が 'shipped' になる
--   4. inventory.on_hand_qty / allocated_qty が正しく減算される
--   5. inventory_transactions に 'shipping' タイプで記録される
--   6. エラー発生時は中途半端な更新がロールバックされる（トランザクション保証）
--   7. shipped_qty が 0 の明細は inventory を変更しない

DROP FUNCTION IF EXISTS rpc_confirm_shipping_order(uuid,uuid,uuid);

CREATE OR REPLACE FUNCTION rpc_confirm_shipping_order(
  p_header_id    uuid,
  p_tenant_id    uuid,
  p_warehouse_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_line       record;
  v_alloc      record;
  v_inv        record;
  v_remaining  integer;  -- 明細ごとの残り出庫配分数
  v_deduct     integer;  -- 各引当行から実際に出庫する数量
BEGIN
  -- ── Step 1: ヘッダーの存在・スコープ・ステータスチェック ─────
  PERFORM id
  FROM    shipping_headers
  WHERE   id            = p_header_id
    AND   tenant_id     = p_tenant_id
    AND   warehouse_id  = p_warehouse_id
    AND   status        = 'inspected';

  IF NOT FOUND THEN
    RETURN json_build_object(
      'error',
      '出庫指示が見つかりません。スコープ違反か、inspected 状態ではない可能性があります。'
    );
  END IF;

  -- ── Step 2: 各明細を処理 ─────────────────────────────────────
  FOR v_line IN
    SELECT id, shipped_qty, product_id
    FROM   shipping_lines
    WHERE  header_id = p_header_id
    FOR UPDATE
  LOOP
    v_remaining := v_line.shipped_qty;

    -- ── Step 3: 各引当行を処理 ─────────────────────────────────
    -- ORDER BY id ASC でロック順を固定し deadlock を防ぐ
    FOR v_alloc IN
      SELECT sa.inventory_id, sa.allocated_qty
      FROM   shipping_allocations sa
      WHERE  sa.line_id = v_line.id
      ORDER BY sa.id ASC
    LOOP
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

      IF v_inv.tenant_id != p_tenant_id OR v_inv.warehouse_id != p_warehouse_id THEN
        RAISE EXCEPTION 'テナントまたは倉庫の境界違反（inventory_id: %）', v_inv.id;
      END IF;

      -- on_hand_qty から出庫する数量: shipped_qty 残余に制限
      v_deduct := LEAST(v_alloc.allocated_qty, GREATEST(0, v_remaining));

      -- on_hand_qty: 出庫した分だけ減算
      -- allocated_qty: 引当全量を解放（shipped_qty の過不足に関わらず予約をクリア）
      UPDATE inventory
      SET    on_hand_qty   = GREATEST(0, v_inv.on_hand_qty   - v_deduct),
             allocated_qty = GREATEST(0, v_inv.allocated_qty - v_alloc.allocated_qty)
      WHERE  id = v_inv.id;

      -- inventory_transactions に出庫イベントを記録（qty_delta は負値）
      -- shipped_qty=0 の場合も allocated_qty 解放のため deallocation 的に記録する
      INSERT INTO inventory_transactions (
        tenant_id,    warehouse_id,    inventory_id,   product_id,
        transaction_type,
        qty_delta,
        before_on_hand_qty,   after_on_hand_qty,
        before_allocated_qty, after_allocated_qty,
        received_date,        lot_no,                 expiry_date,
        reference_type,       reference_id
      ) VALUES (
        p_tenant_id,   p_warehouse_id,  v_inv.id,       v_inv.product_id,
        'shipping',
        -v_deduct,
        v_inv.on_hand_qty,    GREATEST(0, v_inv.on_hand_qty   - v_deduct),
        v_inv.allocated_qty,  GREATEST(0, v_inv.allocated_qty - v_alloc.allocated_qty),
        v_inv.received_date,  v_inv.lot_no,           v_inv.expiry_date,
        'shipping_line',      v_line.id
      );

      v_remaining := v_remaining - v_deduct;
    END LOOP;  -- allocations

    -- 明細ステータスを completed に更新
    UPDATE shipping_lines
    SET    status = 'completed'
    WHERE  id = v_line.id;

  END LOOP;  -- lines

  -- ── Step 4: ヘッダーを shipped に更新 ────────────────────────
  UPDATE shipping_headers
  SET    status = 'shipped'
  WHERE  id = p_header_id;

  RETURN json_build_object('error', NULL::text);

EXCEPTION WHEN others THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION rpc_confirm_shipping_order IS
  '出庫確定（フェーズ3-5）。inspected → shipped。'
  'inventory.on_hand_qty を shipped_qty ベースで減算し、allocated_qty を全量解放する。'
  'inventory_transactions に shipping タイプで記録し、単一トランザクションで実行する。';


-- =============================================================================
-- 既存 RPC 関数の補完（未作成の場合に備えて定義）
-- =============================================================================
-- rpc_move_inventory / rpc_adjust_inventory / rpc_change_inventory_status は
-- inventory.ts が既に呼び出しているため、未定義であれば本セクションで補完する。
-- すでに定義済みの場合は CREATE OR REPLACE で上書きされる（差分なし）。

-- =============================================================================
-- 3. rpc_move_inventory  ― ロケーション移動
-- =============================================================================
-- 移動元の available_qty（on_hand - allocated）の範囲でのみ移動可能。
-- 移動先に同一 (product/location/status/lot_no) が存在すれば加算、なければ INSERT。

DROP FUNCTION IF EXISTS rpc_move_inventory(uuid,uuid,integer,text,uuid);

CREATE OR REPLACE FUNCTION rpc_move_inventory(
  p_inventory_id            uuid,
  p_destination_location_id uuid,
  p_move_qty                integer,
  p_reason                  text    DEFAULT NULL,
  p_executed_by             uuid    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_src         record;
  v_avail       integer;
  v_dest_id     uuid;
  v_dest_qty    integer;
  v_tx_id       uuid;
BEGIN
  IF p_move_qty <= 0 THEN
    RETURN json_build_object('error', '移動数量は1以上を指定してください');
  END IF;

  -- 移動元をロック
  SELECT id, tenant_id, warehouse_id, product_id, location_id,
         on_hand_qty, allocated_qty, status, received_date, lot_no
  INTO   v_src
  FROM   inventory
  WHERE  id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', '移動元在庫が見つかりません');
  END IF;

  v_avail := GREATEST(0, v_src.on_hand_qty - v_src.allocated_qty);
  IF p_move_qty > v_avail THEN
    RETURN json_build_object(
      'error',
      format('引当可能数を超えています（移動可能: %s, 要求: %s）', v_avail, p_move_qty)
    );
  END IF;

  -- 移動先の既存行を確認・ロック
  SELECT id, on_hand_qty
  INTO   v_dest_id, v_dest_qty
  FROM   inventory
  WHERE  tenant_id    = v_src.tenant_id
    AND  warehouse_id = v_src.warehouse_id
    AND  product_id   = v_src.product_id
    AND  location_id  = p_destination_location_id
    AND  status       = v_src.status
    AND  COALESCE(lot_no, '') = COALESCE(v_src.lot_no, '')
  FOR UPDATE;

  IF FOUND THEN
    UPDATE inventory
    SET    on_hand_qty = v_dest_qty + p_move_qty
    WHERE  id = v_dest_id;
  ELSE
    INSERT INTO inventory (
      tenant_id, warehouse_id, product_id, location_id,
      on_hand_qty, allocated_qty, status, received_date, lot_no
    ) VALUES (
      v_src.tenant_id, v_src.warehouse_id, v_src.product_id, p_destination_location_id,
      p_move_qty, 0, v_src.status, v_src.received_date, v_src.lot_no
    );
  END IF;

  -- 移動元を減算
  UPDATE inventory
  SET    on_hand_qty = v_src.on_hand_qty - p_move_qty
  WHERE  id = p_inventory_id;

  -- 在庫操作履歴に記録
  INSERT INTO inventory_transactions (
    tenant_id, warehouse_id, inventory_id, product_id,
    transaction_type,
    from_location_id, to_location_id,
    qty_delta,
    before_on_hand_qty, after_on_hand_qty,
    reason, executed_by
  ) VALUES (
    v_src.tenant_id, v_src.warehouse_id, p_inventory_id, v_src.product_id,
    'move',
    v_src.location_id, p_destination_location_id,
    p_move_qty,
    v_src.on_hand_qty, v_src.on_hand_qty - p_move_qty,
    p_reason, p_executed_by
  );

  RETURN json_build_object('error', NULL::text);

EXCEPTION WHEN others THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION rpc_move_inventory IS
  'ロケーション移動。available_qty 範囲内でのみ移動可能。単一トランザクション。';


-- =============================================================================
-- 4. rpc_adjust_inventory  ― 数量調整（増加 / 減少 / 上書き）
-- =============================================================================

DROP FUNCTION IF EXISTS rpc_adjust_inventory(uuid,text,integer,text,text,uuid);

CREATE OR REPLACE FUNCTION rpc_adjust_inventory(
  p_inventory_id uuid,
  p_adjust_type  text,    -- 'increase' | 'decrease' | 'set'
  p_qty          integer,
  p_reason       text    DEFAULT NULL,
  p_note         text    DEFAULT NULL,
  p_executed_by  uuid    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_src       record;
  v_new_qty   integer;
  v_tx_type   text;
BEGIN
  IF p_qty < 0 THEN
    RETURN json_build_object('error', '数量は0以上を指定してください');
  END IF;

  SELECT id, tenant_id, warehouse_id, product_id,
         on_hand_qty, allocated_qty
  INTO   v_src
  FROM   inventory
  WHERE  id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', '在庫行が見つかりません');
  END IF;

  CASE p_adjust_type
    WHEN 'increase' THEN
      v_new_qty := v_src.on_hand_qty + p_qty;
      v_tx_type := 'adjust_increase';
    WHEN 'decrease' THEN
      v_new_qty := v_src.on_hand_qty - p_qty;
      v_tx_type := 'adjust_decrease';
    WHEN 'set' THEN
      v_new_qty := p_qty;
      v_tx_type := 'adjust_set';
    ELSE
      RETURN json_build_object('error', format('不正な adjust_type: %s', p_adjust_type));
  END CASE;

  IF v_new_qty < 0 THEN
    RETURN json_build_object('error', '結果数量が0を下回ります');
  END IF;
  IF v_new_qty < v_src.allocated_qty THEN
    RETURN json_build_object(
      'error',
      format('引当済み数量（%s）を下回る調整はできません', v_src.allocated_qty)
    );
  END IF;

  UPDATE inventory
  SET    on_hand_qty = v_new_qty
  WHERE  id = p_inventory_id;

  INSERT INTO inventory_transactions (
    tenant_id, warehouse_id, inventory_id, product_id,
    transaction_type,
    qty_delta,
    before_on_hand_qty, after_on_hand_qty,
    reason, note, executed_by
  ) VALUES (
    v_src.tenant_id, v_src.warehouse_id, p_inventory_id, v_src.product_id,
    v_tx_type,
    p_qty,
    v_src.on_hand_qty, v_new_qty,
    p_reason, p_note, p_executed_by
  );

  RETURN json_build_object('error', NULL::text);

EXCEPTION WHEN others THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION rpc_adjust_inventory IS
  '数量調整（increase/decrease/set）。allocated_qty を下回る減算は拒否。単一トランザクション。';


-- =============================================================================
-- 5. rpc_change_inventory_status  ― 在庫ステータス変更（数量分割）
-- =============================================================================

DROP FUNCTION IF EXISTS rpc_change_inventory_status(uuid,text,integer,text,uuid);

CREATE OR REPLACE FUNCTION rpc_change_inventory_status(
  p_inventory_id uuid,
  p_new_status   text,
  p_change_qty   integer,
  p_reason       text  DEFAULT NULL,
  p_executed_by  uuid  DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_src      record;
  v_avail    integer;
  v_dest_id  uuid;
  v_dest_qty integer;
BEGIN
  IF p_change_qty <= 0 THEN
    RETURN json_build_object('error', '変更数量は1以上を指定してください');
  END IF;

  IF p_new_status NOT IN ('available', 'hold', 'damaged') THEN
    RETURN json_build_object('error', format('不正なステータス: %s', p_new_status));
  END IF;

  SELECT id, tenant_id, warehouse_id, product_id, location_id,
         on_hand_qty, allocated_qty, status, received_date, lot_no
  INTO   v_src
  FROM   inventory
  WHERE  id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', '在庫行が見つかりません');
  END IF;

  v_avail := GREATEST(0, v_src.on_hand_qty - v_src.allocated_qty);
  IF p_change_qty > v_avail THEN
    RETURN json_build_object(
      'error',
      format('引当可能数を超えています（変更可能: %s, 要求: %s）', v_avail, p_change_qty)
    );
  END IF;

  -- 移動先ステータス行を確認・ロック
  SELECT id, on_hand_qty
  INTO   v_dest_id, v_dest_qty
  FROM   inventory
  WHERE  tenant_id    = v_src.tenant_id
    AND  warehouse_id = v_src.warehouse_id
    AND  product_id   = v_src.product_id
    AND  location_id  = v_src.location_id
    AND  status       = p_new_status
    AND  COALESCE(lot_no, '') = COALESCE(v_src.lot_no, '')
  FOR UPDATE;

  IF FOUND THEN
    UPDATE inventory
    SET    on_hand_qty = v_dest_qty + p_change_qty
    WHERE  id = v_dest_id;
  ELSE
    INSERT INTO inventory (
      tenant_id, warehouse_id, product_id, location_id,
      on_hand_qty, allocated_qty, status, received_date, lot_no
    ) VALUES (
      v_src.tenant_id, v_src.warehouse_id, v_src.product_id, v_src.location_id,
      p_change_qty, 0, p_new_status, v_src.received_date, v_src.lot_no
    );
  END IF;

  -- 移動元を減算
  UPDATE inventory
  SET    on_hand_qty = v_src.on_hand_qty - p_change_qty
  WHERE  id = p_inventory_id;

  INSERT INTO inventory_transactions (
    tenant_id, warehouse_id, inventory_id, product_id,
    transaction_type,
    from_status, to_status,
    qty_delta,
    before_on_hand_qty, after_on_hand_qty,
    reason, executed_by
  ) VALUES (
    v_src.tenant_id, v_src.warehouse_id, p_inventory_id, v_src.product_id,
    'status_change',
    v_src.status, p_new_status,
    p_change_qty,
    v_src.on_hand_qty, v_src.on_hand_qty - p_change_qty,
    p_reason, p_executed_by
  );

  RETURN json_build_object('error', NULL::text);

EXCEPTION WHEN others THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION rpc_change_inventory_status IS
  '在庫ステータス変更（数量分割）。available_qty 範囲内でのみ変更可能。単一トランザクション。';


-- =============================================================================
-- 実行後確認クエリ
-- =============================================================================
-- SELECT routine_name, routine_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name LIKE 'rpc_%'
-- ORDER BY routine_name;
