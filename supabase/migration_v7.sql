-- =============================================================================
-- migration_v7.sql  ― rpc_update_arrival の追加
-- =============================================================================
-- 【目的】
--   入荷予定編集機能の実装。arrival_headers を更新し、
--   arrival_lines を全削除 + 再挿入で再構築する RPC を追加する。
--
-- 【実行条件】
--   migration_v6.sql（rpc_cancel_shipping_order）適用済みであること。
--
-- 【安全性】
--   ・スキーマ変更（ALTER TABLE）なし。Function の追加のみ。
--   ・arrival_lines の DELETE + INSERT は status='planned' かつ
--     received_qty=0 が保証された後にのみ実行される。
--   ・(header_id, line_no) UNIQUE 制約に対応するため、
--     UPDATE 個別追跡ではなく DELETE ALL → INSERT ALL を採用。
--   ・楽観的ロック: p_expected_updated_at と DB の updated_at を照合する。
--   ・DROP FUNCTION IF EXISTS で冪等に実行可能。
--
-- 【適用手順】
--   Supabase ダッシュボード > SQL Editor > 本ファイルの内容を貼り付けて実行。
-- =============================================================================

DROP FUNCTION IF EXISTS rpc_update_arrival(uuid, uuid, uuid, date, text, timestamptz, json);

CREATE OR REPLACE FUNCTION rpc_update_arrival(
  p_header_id           uuid,
  p_tenant_id           uuid,
  p_warehouse_id        uuid,
  p_arrival_date        date,
  p_memo                text        DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_lines               json        DEFAULT '[]'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_header  record;
  v_line    json;
  v_idx     integer := 0;
BEGIN
  -- ── Step 1: ヘッダーの取得・ロック ───────────────────────────
  SELECT id, status, updated_at
  INTO   v_header
  FROM   arrival_headers
  WHERE  id           = p_header_id
    AND  tenant_id    = p_tenant_id
    AND  warehouse_id = p_warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'error', '入荷予定が見つかりません。スコープ違反の可能性があります。'
    );
  END IF;

  -- ── Step 2: ステータスチェック（planned のみ編集可）───────────
  IF v_header.status != 'planned' THEN
    RETURN json_build_object(
      'error', '編集できないステータスです: ' || v_header.status
    );
  END IF;

  -- ── Step 3: 楽観的ロック（p_expected_updated_at が指定された場合）──
  IF p_expected_updated_at IS NOT NULL
     AND v_header.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN json_build_object(
      'error', '他の操作で更新されています。画面を再読み込みしてください。'
    );
  END IF;

  -- ── Step 4: 入庫済み明細の存在チェック ────────────────────────
  IF EXISTS (
    SELECT 1
    FROM   arrival_lines
    WHERE  header_id    = p_header_id
      AND  received_qty > 0
  ) THEN
    RETURN json_build_object(
      'error', '入庫済みの明細があるため編集できません。'
    );
  END IF;

  -- ── Step 5: 既存明細を全削除 ──────────────────────────────────
  -- (header_id, line_no) UNIQUE 制約の衝突を避けるため
  -- UPDATE ではなく DELETE + INSERT で再構築する。
  DELETE FROM arrival_lines
  WHERE  header_id    = p_header_id
    AND  tenant_id    = p_tenant_id
    AND  warehouse_id = p_warehouse_id;

  -- ── Step 6: 明細を INSERT ─────────────────────────────────────
  FOR v_line IN
    SELECT value FROM json_array_elements(p_lines)
  LOOP
    v_idx := v_idx + 1;

    INSERT INTO arrival_lines (
      header_id,    tenant_id,    warehouse_id,
      line_no,      product_id,   planned_qty,
      lot_no,       expiry_date,  memo,
      received_qty, status
    ) VALUES (
      p_header_id,
      p_tenant_id,
      p_warehouse_id,
      COALESCE((v_line->>'line_no')::integer, v_idx),
      (v_line->>'product_id')::uuid,
      (v_line->>'planned_qty')::integer,
      NULLIF(TRIM(v_line->>'lot_no'),      ''),
      CASE
        WHEN v_line->>'expiry_date' IS NOT NULL
             AND TRIM(v_line->>'expiry_date') != ''
        THEN (v_line->>'expiry_date')::date
        ELSE NULL
      END,
      NULLIF(TRIM(v_line->>'memo'), ''),
      0,
      'planned'
    );
  END LOOP;

  -- ── Step 7: ヘッダーを更新 ───────────────────────────────────
  -- updated_at は trigger_set_updated_at トリガーが自動更新する
  UPDATE arrival_headers
  SET    arrival_date = p_arrival_date,
         memo        = NULLIF(TRIM(p_memo), '')
  WHERE  id = p_header_id;

  RETURN json_build_object('error', NULL::text);

EXCEPTION WHEN others THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION rpc_update_arrival IS
  '入荷予定の編集。status=planned のヘッダーのみ実行可。'
  'received_qty > 0 の明細が存在する場合はエラー。'
  '明細は全削除 + 全挿入で再構築（line_no 重複を回避）。'
  'p_expected_updated_at を指定すると楽観的ロックが有効になる。';
