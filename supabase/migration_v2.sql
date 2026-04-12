-- =============================================================
-- migration_v2.sql
-- 荷主・倉庫テーブルへの多言語対応カラム追加
-- Supabase SQL Editor で実行してください
-- =============================================================

-- -------------------------------------------------------------
-- STEP 1: tenants テーブルにカラム追加
-- -------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tenant_name_ja  TEXT,
  ADD COLUMN IF NOT EXISTS tenant_name_en  TEXT,
  ADD COLUMN IF NOT EXISTS memo            TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

-- 既存データを tenant_name → tenant_name_ja へコピー
UPDATE tenants
SET tenant_name_ja = tenant_name
WHERE tenant_name_ja IS NULL AND tenant_name IS NOT NULL;

-- NOT NULL 制約を付与（既存データへのバックフィル後）
ALTER TABLE tenants ALTER COLUMN tenant_name_ja SET NOT NULL;

-- -------------------------------------------------------------
-- STEP 2: warehouses テーブルにカラム追加
-- -------------------------------------------------------------
ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS warehouse_name_ja TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_name_en TEXT,
  ADD COLUMN IF NOT EXISTS memo              TEXT,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- 既存データを warehouse_name → warehouse_name_ja へコピー
UPDATE warehouses
SET warehouse_name_ja = warehouse_name
WHERE warehouse_name_ja IS NULL AND warehouse_name IS NOT NULL;

ALTER TABLE warehouses ALTER COLUMN warehouse_name_ja SET NOT NULL;

-- -------------------------------------------------------------
-- STEP 3: updated_at 自動更新トリガー
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenants_set_updated_at ON tenants;
CREATE TRIGGER tenants_set_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS warehouses_set_updated_at ON warehouses;
CREATE TRIGGER warehouses_set_updated_at
  BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------------
-- STEP 4: 確認クエリ
-- -------------------------------------------------------------
SELECT
  t.tenant_code,
  t.tenant_name_ja,
  t.tenant_name_en,
  t.status,
  COUNT(w.id) AS warehouse_count
FROM tenants t
LEFT JOIN warehouses w ON w.tenant_id = t.id
GROUP BY t.id, t.tenant_code, t.tenant_name_ja, t.tenant_name_en, t.status
ORDER BY t.tenant_code;
