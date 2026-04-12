-- =============================================================================
-- migration_v3.sql  ― lot_no / expiry_date 追加、UNIQUE 粒度修正、CHECK 制約追加
-- =============================================================================
-- 【目的】
--   inventory と arrival_lines に FIFO/FEFO の土台となる列を追加し、
--   inventory の UNIQUE 制約を「在庫粒度」に合わせて修正する。
--
-- 【実行条件】
--   migration_v2.sql（tenant/warehouse 多言語化）適用済みであること。
--
-- 【安全性】
--   ・全ての ALTER TABLE は IF NOT EXISTS / IF EXISTS で冪等に実行できる。
--   ・新規列は NULL 許容（既存行に影響なし）。
--   ・UNIQUE 制約の差し替えは旧制約を DROP してから ADD するため、
--     既存データが null lot_no で重複している場合は事前にデータを確認すること。
--   ・CHECK 制約は NOT VALID で追加するため既存データの検証をスキップする。
--     既存データを含めて検証したい場合は後から VALIDATE CONSTRAINT を実行。
-- =============================================================================


-- =============================================================================
-- 1. arrival_lines に lot_no / expiry_date 列を追加
-- =============================================================================
-- 入荷予定登録時にロット番号・有効期限を記録しておくための列。
-- 入庫確定時に inventory.lot_no / expiry_date へ引き継ぐ。

ALTER TABLE arrival_lines
  ADD COLUMN IF NOT EXISTS lot_no      text,
  ADD COLUMN IF NOT EXISTS expiry_date date;

COMMENT ON COLUMN arrival_lines.lot_no      IS 'ロット番号（NULL = ロット管理なし）';
COMMENT ON COLUMN arrival_lines.expiry_date IS '有効期限（NULL = 期限管理なし。FEFO のソートキー）';


-- =============================================================================
-- 2. inventory に lot_no / expiry_date 列を追加
-- =============================================================================
-- lot_no  : UNIQUE 粒度キーの一部。NULL 許容（管理なし品目は NULL）。
-- expiry_date: FEFO 引当のソートキー。NULL 許容。

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS lot_no      text,
  ADD COLUMN IF NOT EXISTS expiry_date date;

COMMENT ON COLUMN inventory.lot_no      IS 'ロット番号（NULL = ロット管理なし。UNIQUE 制約では COALESCE で空文字扱い）';
COMMENT ON COLUMN inventory.expiry_date IS '有効期限（NULL = 期限管理なし。FEFO のソートキー）';


-- =============================================================================
-- 3. inventory の UNIQUE 制約を在庫粒度に合わせて修正
-- =============================================================================
-- 旧制約: (tenant_id, warehouse_id, product_id, location_id, status)
--   → 同一 product/location/status に received_date・lot_no の違う行を持てない
--
-- 新制約: (tenant_id, warehouse_id, product_id, location_id, status, received_date, COALESCE(lot_no,''))
--   → ロット番号・入庫日ごとに別行として管理でき、FIFO/FEFO 引当の基盤になる
--
-- ⚠️ UNIQUE INDEX（制約でなくインデックス）を使う理由:
--    lot_no が NULL 許容のため、通常の CONSTRAINT UNIQUE では NULL を同一視できない。
--    関数ベースの UNIQUE INDEX なら COALESCE(lot_no, '') で NULL を '' として扱える。
--
-- ⚠️ 既存データに同一 (product/location/status/received_date) 行が複数ある場合、
--    インデックス作成は失敗する。その場合は重複行を手動でマージしてから再実行する。

-- 旧制約を削除（存在しない場合は無視）
DO $$
BEGIN
  -- よく使われる自動命名パターンを順に試みる
  ALTER TABLE inventory DROP CONSTRAINT IF EXISTS uq_inventory_grain;
  ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_tenant_id_warehouse_id_product_id_location_id_status_key;
  ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_unique;
  ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_product_location_status_key;
EXCEPTION WHEN others THEN
  -- 何らかの予期しないエラーは無視して続行
  NULL;
END;
$$;

-- 旧 UNIQUE INDEX が存在する場合も削除
DROP INDEX IF EXISTS uq_inventory_grain;
DROP INDEX IF EXISTS idx_inventory_unique;

-- 新しい UNIQUE INDEX を作成（関数ベース：lot_no の NULL を空文字として扱う）
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_grain
  ON inventory (
    tenant_id,
    warehouse_id,
    product_id,
    location_id,
    status,
    received_date,
    COALESCE(lot_no, '')
  );

COMMENT ON INDEX uq_inventory_grain
  IS '在庫粒度を一意に定める複合インデックス。lot_no NULL は空文字として扱う。';


-- =============================================================================
-- 4. inventory の CHECK 制約：引当済みが実在庫を超えないこと
-- =============================================================================
-- NOT VALID: 既存データへの検証をスキップし、以降の INSERT/UPDATE のみに適用する。
-- 既存データを含めて検証したい場合: ALTER TABLE inventory VALIDATE CONSTRAINT chk_inventory_allocated;

ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS chk_inventory_allocated;

ALTER TABLE inventory
  ADD CONSTRAINT chk_inventory_allocated
    CHECK (allocated_qty <= on_hand_qty) NOT VALID;

COMMENT ON CONSTRAINT chk_inventory_allocated ON inventory
  IS '引当済み数量が実在庫数量を超えないことを保証する。NOT VALID で追加済み（既存データ検証は VALIDATE CONSTRAINT を別途実行）。';


-- =============================================================================
-- 5. FEFO / FIFO 用インデックス追加
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_inventory_fefo
  ON inventory (expiry_date ASC NULLS LAST);

COMMENT ON INDEX idx_inventory_fefo
  IS 'FEFO（先入先出期限順）引当用インデックス。有効期限の昇順、NULL は末尾。';

-- FIFO インデックスが未作成の場合に備えて追加
CREATE INDEX IF NOT EXISTS idx_inventory_fifo
  ON inventory (received_date ASC NULLS LAST);

COMMENT ON INDEX idx_inventory_fifo
  IS 'FIFO（先入先出入庫日順）引当用インデックス。入庫日の昇順、NULL は末尾。';


-- =============================================================================
-- 確認クエリ（実行後にカラムが追加されたことを確認）
-- =============================================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name IN ('inventory', 'arrival_lines')
--   AND column_name IN ('lot_no', 'expiry_date')
-- ORDER BY table_name, column_name;
--
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'inventory' AND indexname LIKE '%grain%';
--
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'inventory'::regclass AND conname = 'chk_inventory_allocated';
