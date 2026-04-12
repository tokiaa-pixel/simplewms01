-- =============================================================
-- ダミー荷主・倉庫データ (seed_tenants.sql)
-- 用途: /admin/tenants・/admin/warehouses の動作確認
-- 実行方法: Supabase SQL Editor に貼り付けて実行
--
-- ※ tenant_code に UNIQUE 制約がある場合は ON CONFLICT を使用。
--   ない場合は先に dummy_multitenant.sql の STEP 1 を実行してください。
-- =============================================================

-- -------------------------------------------------------------
-- STEP 1: テナント（荷主）3社を登録
-- -------------------------------------------------------------
INSERT INTO tenants (tenant_code, tenant_name, status)
VALUES
  ('T-001', '田中食品株式会社',   'active'),
  ('T-002', '鈴木商事株式会社',   'active'),
  ('T-003', '山田物産有限会社',   'active')
ON CONFLICT (tenant_code) DO UPDATE
  SET tenant_name = EXCLUDED.tenant_name,
      status      = EXCLUDED.status;

-- -------------------------------------------------------------
-- STEP 2: 各荷主に倉庫を登録
-- -------------------------------------------------------------

-- T-001 田中食品 ── 東京・大阪の2拠点
INSERT INTO warehouses (tenant_id, warehouse_code, warehouse_name, address, status)
SELECT t.id, 'W-0001', '東京第一倉庫', '東京都江東区有明1-1-1', 'active'
FROM tenants t WHERE t.tenant_code = 'T-001'
ON CONFLICT (tenant_id, warehouse_code) DO UPDATE
  SET warehouse_name = EXCLUDED.warehouse_name,
      address        = EXCLUDED.address,
      status         = EXCLUDED.status;

INSERT INTO warehouses (tenant_id, warehouse_code, warehouse_name, address, status)
SELECT t.id, 'W-0002', '大阪第一倉庫', '大阪府大阪市住之江区南港北1-2-3', 'active'
FROM tenants t WHERE t.tenant_code = 'T-001'
ON CONFLICT (tenant_id, warehouse_code) DO UPDATE
  SET warehouse_name = EXCLUDED.warehouse_name,
      address        = EXCLUDED.address,
      status         = EXCLUDED.status;

-- T-002 鈴木商事 ── 横浜・名古屋の2拠点
INSERT INTO warehouses (tenant_id, warehouse_code, warehouse_name, address, status)
SELECT t.id, 'W-0001', '横浜物流センター', '神奈川県横浜市鶴見区大黒ふ頭3-1', 'active'
FROM tenants t WHERE t.tenant_code = 'T-002'
ON CONFLICT (tenant_id, warehouse_code) DO UPDATE
  SET warehouse_name = EXCLUDED.warehouse_name,
      address        = EXCLUDED.address,
      status         = EXCLUDED.status;

INSERT INTO warehouses (tenant_id, warehouse_code, warehouse_name, address, status)
SELECT t.id, 'W-0002', '名古屋倉庫', '愛知県名古屋市港区金城ふ頭2-4-1', 'active'
FROM tenants t WHERE t.tenant_code = 'T-002'
ON CONFLICT (tenant_id, warehouse_code) DO UPDATE
  SET warehouse_name = EXCLUDED.warehouse_name,
      address        = EXCLUDED.address,
      status         = EXCLUDED.status;

-- T-003 山田物産 ── 福岡の1拠点（追加予定分はadminページから登録）
INSERT INTO warehouses (tenant_id, warehouse_code, warehouse_name, address, status)
SELECT t.id, 'W-0001', '福岡倉庫', '福岡県福岡市博多区博多駅東2-1-1', 'active'
FROM tenants t WHERE t.tenant_code = 'T-003'
ON CONFLICT (tenant_id, warehouse_code) DO UPDATE
  SET warehouse_name = EXCLUDED.warehouse_name,
      address        = EXCLUDED.address,
      status         = EXCLUDED.status;

-- -------------------------------------------------------------
-- 確認クエリ（実行後の確認用）
-- -------------------------------------------------------------
SELECT
  t.tenant_code,
  t.tenant_name,
  t.status AS tenant_status,
  COUNT(w.id) AS warehouse_count
FROM tenants t
LEFT JOIN warehouses w ON w.tenant_id = t.id
GROUP BY t.id, t.tenant_code, t.tenant_name, t.status
ORDER BY t.tenant_code;
