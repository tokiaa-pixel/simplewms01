-- =============================================================
-- SimpleWMS — 全テーブル サンプルデータ
-- Supabase SQL Editor に貼り付けてそのまま実行できます
-- =============================================================
-- 実行順序（外部キー制約を考慮）:
--   1. suppliers
--   2. customers
--   3. products
--   4. locations
--   5. users_profile   ← auth.users FK あり（下記の注意を読むこと）
--   6. arrivals        ← suppliers FK
--   7. inventory       ← products, locations FK
--   8. shippings       ← customers FK
-- =============================================================

-- ─── 既存データをクリア（再実行時の重複防止）──────────────────
TRUNCATE shippings    RESTART IDENTITY CASCADE;
TRUNCATE arrivals     RESTART IDENTITY CASCADE;
TRUNCATE inventory    RESTART IDENTITY CASCADE;
TRUNCATE locations    RESTART IDENTITY CASCADE;
TRUNCATE products     RESTART IDENTITY CASCADE;
TRUNCATE customers    RESTART IDENTITY CASCADE;
TRUNCATE suppliers    RESTART IDENTITY CASCADE;
-- users_profile は auth.users に依存するためここではクリアしない


-- =============================================================
-- 1. suppliers（仕入先マスタ）
--    確認済みカラム: supplier_code, supplier_name_ja, supplier_name_en,
--                   contact_name, phone, email, address, status
-- =============================================================
INSERT INTO suppliers (id, supplier_code, supplier_name_ja, supplier_name_en, contact_name, phone, email, address, status)
VALUES
  ('aaaaaaaa-0001-0000-0000-000000000000',
   'S-0001', '株式会社アルファ電子', 'Alpha Electronics Co., Ltd',
   '田中 誠', '03-1234-5678', 'tanaka@alpha-elec.co.jp',
   '東京都千代田区神田1-1-1', 'active'),

  ('aaaaaaaa-0002-0000-0000-000000000000',
   'S-0002', 'ベータ梱包資材株式会社', 'Beta Packaging Co., Ltd',
   '佐藤 花子', '06-2345-6789', 'sato@beta-packing.co.jp',
   '大阪府大阪市西区靭本町2-3-4', 'active'),

  ('aaaaaaaa-0003-0000-0000-000000000000',
   'S-0003', 'ガンマ工業株式会社', 'Gamma Industrial Co., Ltd',
   'ジョン・スミス', '+1-415-000-1234', 'jsmith@gamma-ind.com',
   '123 Industry Blvd, San Jose, CA 95110', 'active');


-- =============================================================
-- 2. customers（得意先マスタ）
--    確認済みカラム: customer_code, customer_name_ja, customer_name_en,
--                   contact_name, phone, email, address, status
-- =============================================================
INSERT INTO customers (id, customer_code, customer_name_ja, customer_name_en, contact_name, phone, email, address, status)
VALUES
  ('bbbbbbbb-0001-0000-0000-000000000000',
   'C-0001', '東京精機株式会社', 'Tokyo Seiki Co., Ltd',
   '山田 太郎', '03-3456-7890', 'yamada@tokyo-seiki.co.jp',
   '東京都品川区南品川1-2-3', 'active'),

  ('bbbbbbbb-0002-0000-0000-000000000000',
   'C-0002', '関西テクノ工業株式会社', 'Kansai Techno Industries',
   '中村 一郎', '06-4567-8901', 'nakamura@kansai-techno.co.jp',
   '大阪府大阪市北区梅田4-5-6', 'active'),

  ('bbbbbbbb-0003-0000-0000-000000000000',
   'C-0003', 'パシフィックテック株式会社', 'Pacific Tech Solutions Inc.',
   'エミリー・チェン', '+1-650-000-5678', 'echen@pacific-tech.com',
   '123 Innovation Dr, San Jose, CA 95110', 'active');


-- =============================================================
-- 3. products（商品マスタ）
--    確認済みカラム: product_code, product_name_ja, product_name_en,
--                   unit, category, status
--    依存なし
-- =============================================================
INSERT INTO products (id, product_code, product_name_ja, product_name_en, unit, category, status)
VALUES
  ('cccccccc-0001-0000-0000-000000000000',
   'P-1001', '基板用コネクタ 2P',    'PCB Connector 2P',      '個',    '電子部品', 'active'),

  ('cccccccc-0002-0000-0000-000000000000',
   'P-1002', '抵抗器アソートセット', 'Resistor Assortment Kit','セット', '電子部品', 'active'),

  ('cccccccc-0003-0000-0000-000000000000',
   'P-2001', '段ボール箱 M',         'Cardboard Box M',        '個',    '包装資材', 'active'),

  ('cccccccc-0004-0000-0000-000000000000',
   'P-2002', '緩衝材シート A4',      'Cushion Sheet A4',       '枚',    '包装資材', 'active'),

  ('cccccccc-0005-0000-0000-000000000000',
   'P-3001', '無水エタノール 500ml', 'Anhydrous Ethanol 500ml','本',    '消耗品',   'active');


-- =============================================================
-- 4. locations（保管場所マスタ）
--    確認済みカラム: location_code, location_name, zone, status
--    依存なし
-- =============================================================
INSERT INTO locations (id, location_code, location_name, zone, status)
VALUES
  ('dddddddd-0001-0000-0000-000000000000',
   'A-01-01', 'Aゾーン 01棚 01段（電子部品）', 'A', 'active'),

  ('dddddddd-0002-0000-0000-000000000000',
   'A-02-01', 'Aゾーン 02棚 01段（電子部品）', 'A', 'active'),

  ('dddddddd-0003-0000-0000-000000000000',
   'B-01-01', 'Bゾーン 01棚 01段（包装資材）', 'B', 'active'),

  ('dddddddd-0004-0000-0000-000000000000',
   'C-01-01', 'Cゾーン 01棚 01段（消耗品）',   'C', 'active');


-- =============================================================
-- 5. users_profile
-- ⚠️ 注意: id は auth.users.id と一致している必要があります。
--    Supabase Authentication でユーザーを作成してから、
--    そのユーザーの UUID に差し替えて実行してください。
--    ダッシュボード > Authentication > Users でUUIDを確認できます。
--
--    auth.users にユーザーが存在しない場合は外部キーエラーになるため、
--    このブロックだけコメントアウトして実行してください。
--    arrivals / shippings の created_by は NULL になります。
-- =============================================================
-- INSERT INTO users_profile (id, name, role, is_active)
-- VALUES
--   ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',  -- ← 実際のauth.users UUIDに変更
--    '田中 誠', 'manager', true),
--
--   ('yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy',  -- ← 実際のauth.users UUIDに変更
--    '佐藤 花子', 'operator', true);


-- =============================================================
-- 6. arrivals（入荷予定）
--    確認済みカラム: arrival_no, supplier_id, arrival_date, product_id,
--                   planned_qty, received_qty, planned_location_id,
--                   actual_location_id, status, memo, created_by
--    ※ 明細は別テーブルではなく arrivals 1行に product_id が直接入る構造
--    status: planned / receiving / completed
-- =============================================================
INSERT INTO arrivals (id, arrival_no, supplier_id, arrival_date, product_id,
                      planned_qty, received_qty,
                      planned_location_id, actual_location_id,
                      status, memo, created_by)
VALUES
  -- 完了済み：アルファ電子からコネクタ入荷
  ('eeeeeeee-0001-0000-0000-000000000000',
   'ARR-2026-0001',
   'aaaaaaaa-0001-0000-0000-000000000000',  -- アルファ電子
   '2026-04-04',
   'cccccccc-0001-0000-0000-000000000000',  -- P-1001 基板用コネクタ 2P
   500, 500,
   'dddddddd-0001-0000-0000-000000000000',  -- A-01-01（予定）
   'dddddddd-0001-0000-0000-000000000000',  -- A-01-01（実績）
   'completed', '電子部品 定期発注分', NULL),

  -- 完了済み：ベータ梱包から段ボール入荷
  ('eeeeeeee-0002-0000-0000-000000000000',
   'ARR-2026-0002',
   'aaaaaaaa-0002-0000-0000-000000000000',  -- ベータ梱包
   '2026-04-07',
   'cccccccc-0003-0000-0000-000000000000',  -- P-2001 段ボール箱 M
   1000, 1000,
   'dddddddd-0003-0000-0000-000000000000',  -- B-01-01（予定）
   'dddddddd-0003-0000-0000-000000000000',  -- B-01-01（実績）
   'completed', '包装資材 補充発注', NULL),

  -- 入荷中：アルファ電子からコネクタ追加（一部のみ入庫済み）
  ('eeeeeeee-0003-0000-0000-000000000000',
   'ARR-2026-0003',
   'aaaaaaaa-0001-0000-0000-000000000000',  -- アルファ電子
   '2026-04-11',
   'cccccccc-0001-0000-0000-000000000000',  -- P-1001 基板用コネクタ 2P
   200, 50,
   'dddddddd-0002-0000-0000-000000000000',  -- A-02-01（予定）
   NULL,                                    -- 実績未確定
   'receiving', 'コネクタ 追加発注 — 検品中', NULL),

  -- 予定：ガンマ工業から抵抗器（未着荷）
  ('eeeeeeee-0004-0000-0000-000000000000',
   'ARR-2026-0004',
   'aaaaaaaa-0003-0000-0000-000000000000',  -- ガンマ工業
   '2026-04-15',
   'cccccccc-0002-0000-0000-000000000000',  -- P-1002 抵抗器アソートセット
   30, 0,
   'dddddddd-0001-0000-0000-000000000000',  -- A-01-01（予定）
   NULL,
   'planned', 'Import order — overseas shipment', NULL),

  -- 予定：ベータ梱包から緩衝材（未着荷）
  ('eeeeeeee-0005-0000-0000-000000000000',
   'ARR-2026-0005',
   'aaaaaaaa-0002-0000-0000-000000000000',  -- ベータ梱包
   '2026-04-18',
   'cccccccc-0004-0000-0000-000000000000',  -- P-2002 緩衝材シート A4
   2000, 0,
   'dddddddd-0003-0000-0000-000000000000',  -- B-01-01（予定）
   NULL,
   'planned', '緩衝材 定期補充', NULL);


-- =============================================================
-- 7. inventory（在庫台帳）
--    確認済みカラム: qty, product_id, location_id, status, updated_by(uuid|null)
--    status: available / hold / damaged
--    product × location の組み合わせはユニーク
-- =============================================================
INSERT INTO inventory (id, qty, product_id, location_id, status, updated_by)
VALUES
  -- P-1001 基板用コネクタ 2P / A-01-01 ── 十分な在庫
  ('ffffffff-0001-0000-0000-000000000000',
   320,
   'cccccccc-0001-0000-0000-000000000000',
   'dddddddd-0001-0000-0000-000000000000',
   'available', NULL),

  -- P-1001 基板用コネクタ 2P / A-02-01 ── 検品中でホールド
  ('ffffffff-0002-0000-0000-000000000000',
   50,
   'cccccccc-0001-0000-0000-000000000000',
   'dddddddd-0002-0000-0000-000000000000',
   'hold', NULL),

  -- P-1002 抵抗器アソートセット / A-01-01 ── 通常在庫
  ('ffffffff-0003-0000-0000-000000000000',
   12,
   'cccccccc-0002-0000-0000-000000000000',
   'dddddddd-0001-0000-0000-000000000000',
   'available', NULL),

  -- P-2001 段ボール箱 M / B-01-01 ── 大量在庫
  ('ffffffff-0004-0000-0000-000000000000',
   850,
   'cccccccc-0003-0000-0000-000000000000',
   'dddddddd-0003-0000-0000-000000000000',
   'available', NULL),

  -- P-2002 緩衝材シート A4 / B-01-01 ── 破損品あり
  ('ffffffff-0005-0000-0000-000000000000',
   5,
   'cccccccc-0004-0000-0000-000000000000',
   'dddddddd-0003-0000-0000-000000000000',
   'damaged', NULL),

  -- P-3001 無水エタノール / C-01-01 ── 残少
  ('ffffffff-0006-0000-0000-000000000000',
   3,
   'cccccccc-0005-0000-0000-000000000000',
   'dddddddd-0004-0000-0000-000000000000',
   'available', NULL);


-- =============================================================
-- 8. shippings（出庫指示）
--    確認済みカラム: shipping_no, shipping_date, customer_id, product_id,
--                   requested_qty, shipped_qty, from_location_id,
--                   status, memo, created_by
--    status: planned / picking / completed
-- =============================================================
INSERT INTO shippings (id, shipping_no, shipping_date, customer_id, product_id,
                       requested_qty, shipped_qty,
                       from_location_id, status, memo, created_by)
VALUES
  -- 出庫完了：東京精機へコネクタ出荷
  ('a1b2c3d4-0001-0000-0000-000000000000',
   'SHP-2026-0001',
   '2026-04-07',
   'bbbbbbbb-0001-0000-0000-000000000000',  -- 東京精機
   'cccccccc-0001-0000-0000-000000000000',  -- P-1001 基板用コネクタ 2P
   100, 100,
   'dddddddd-0001-0000-0000-000000000000',  -- A-01-01
   'completed', 'コネクタ 定期出荷', NULL),

  -- 出庫完了：関西テクノへ段ボール出荷
  ('a1b2c3d4-0002-0000-0000-000000000000',
   'SHP-2026-0002',
   '2026-04-08',
   'bbbbbbbb-0002-0000-0000-000000000000',  -- 関西テクノ
   'cccccccc-0003-0000-0000-000000000000',  -- P-2001 段ボール箱 M
   200, 200,
   'dddddddd-0003-0000-0000-000000000000',  -- B-01-01
   'completed', '梱包資材 まとめ出荷', NULL),

  -- ピッキング中：東京精機へ緊急出荷
  ('a1b2c3d4-0003-0000-0000-000000000000',
   'SHP-2026-0003',
   '2026-04-11',
   'bbbbbbbb-0001-0000-0000-000000000000',  -- 東京精機
   'cccccccc-0002-0000-0000-000000000000',  -- P-1002 抵抗器アソートセット
   5, 0,
   'dddddddd-0001-0000-0000-000000000000',  -- A-01-01
   'picking', '緊急出荷依頼 — 本日中に対応', NULL),

  -- 予定：パシフィックテックへ輸出
  ('a1b2c3d4-0004-0000-0000-000000000000',
   'SHP-2026-0004',
   '2026-04-12',
   'bbbbbbbb-0003-0000-0000-000000000000',  -- パシフィックテック
   'cccccccc-0001-0000-0000-000000000000',  -- P-1001 基板用コネクタ 2P
   50, 0,
   'dddddddd-0001-0000-0000-000000000000',  -- A-01-01
   'planned', 'Export shipment to US', NULL),

  -- 予定：関西テクノへ定期出荷
  ('a1b2c3d4-0005-0000-0000-000000000000',
   'SHP-2026-0005',
   '2026-04-17',
   'bbbbbbbb-0002-0000-0000-000000000000',  -- 関西テクノ
   'cccccccc-0004-0000-0000-000000000000',  -- P-2002 緩衝材シート A4
   300, 0,
   'dddddddd-0003-0000-0000-000000000000',  -- B-01-01
   'planned', '4月第3週 定期出荷', NULL);
