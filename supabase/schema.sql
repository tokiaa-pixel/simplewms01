-- =============================================================================
-- SimpleWMS — Supabase スキーマ定義
-- =============================================================================
-- 実行順序: このファイルを Supabase SQL Editor でそのまま実行できます
-- 前提: Supabase プロジェクト作成済み（auth.users が存在すること）
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 共通: updated_at 自動更新トリガー関数
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 1. users_profile
--    Supabase の auth.users を拡張するプロフィールテーブル。
--    認証は Supabase Auth に委任し、業務上の属性（氏名・権限）をここで管理する。
-- =============================================================================

CREATE TABLE users_profile (
  -- Supabase Auth の UUID と 1:1 紐付け
  id          uuid        PRIMARY KEY
                          REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  role        text        NOT NULL DEFAULT 'operator'
                          CHECK (role IN ('admin', 'manager', 'operator')),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  users_profile          IS 'Supabase Auth ユーザーの業務情報（氏名・権限）';
COMMENT ON COLUMN users_profile.role     IS 'admin | manager | operator';
COMMENT ON COLUMN users_profile.is_active IS '無効化フラグ（物理削除せずアクセス制限）';

CREATE TRIGGER set_updated_at_users_profile
  BEFORE UPDATE ON users_profile
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 2. products（商品マスタ）
--    扱う商品の基本情報。name_ja / name_en で多言語対応。
--    在庫の min_stock / max_stock はここで定義し、inventory の status 判定に使う。
-- =============================================================================

CREATE TABLE products (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        NOT NULL UNIQUE,       -- 例: P-0001（UI 表示用コード）
  name_ja     text        NOT NULL,              -- 商品名（日本語）
  name_en     text,                              -- 商品名（英語）
  category    text        NOT NULL,              -- 電子部品 / 周辺機器 / 事務用品 etc.
  unit        text        NOT NULL DEFAULT '個', -- 在庫単位（個/本/箱/セット etc.）
  unit_price  integer     CHECK (unit_price >= 0),  -- 単価（円）
  min_stock   integer     NOT NULL DEFAULT 0
                          CHECK (min_stock >= 0),
  max_stock   integer     NOT NULL DEFAULT 0
                          CHECK (max_stock >= 0),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_products_stock_range
    CHECK (max_stock = 0 OR max_stock >= min_stock)
);

COMMENT ON TABLE  products            IS '商品マスタ：取り扱い商品の基本情報';
COMMENT ON COLUMN products.code       IS 'P-0001 形式の表示用コード（UNIQUE）';
COMMENT ON COLUMN products.name_ja    IS '商品名（日本語）';
COMMENT ON COLUMN products.name_en    IS '商品名（英語）—多言語表示に使用';
COMMENT ON COLUMN products.min_stock  IS '最小在庫数：これを下回ると inventory.status = low';
COMMENT ON COLUMN products.max_stock  IS '最大在庫数：これを超えると inventory.status = excess';

CREATE INDEX idx_products_code     ON products (code);
CREATE INDEX idx_products_category ON products (category);
CREATE INDEX idx_products_active   ON products (is_active);

CREATE TRIGGER set_updated_at_products
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 3. suppliers（仕入先マスタ）
--    商品の仕入先。入荷予定と紐付く。
-- =============================================================================

CREATE TABLE suppliers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        NOT NULL UNIQUE,   -- 例: S-0001
  name            text        NOT NULL,
  contact_name    text,                          -- 担当者名
  phone           text,
  email           text
                  CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  lead_time_days  integer     CHECK (lead_time_days >= 0),  -- 発注リードタイム（日）
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  suppliers                IS '仕入先マスタ';
COMMENT ON COLUMN suppliers.code           IS 'S-0001 形式の表示用コード';
COMMENT ON COLUMN suppliers.lead_time_days IS '発注してから入荷までの標準日数';

CREATE INDEX idx_suppliers_code   ON suppliers (code);
CREATE INDEX idx_suppliers_active ON suppliers (is_active);

CREATE TRIGGER set_updated_at_suppliers
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 4. customers（得意先マスタ）
--    出庫先となる顧客情報。
-- =============================================================================

CREATE TABLE customers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        NOT NULL UNIQUE,   -- 例: C-0001
  name            text        NOT NULL,
  contact_name    text,
  phone           text,
  address         text,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE customers IS '得意先マスタ（出庫先）';

CREATE INDEX idx_customers_code   ON customers (code);
CREATE INDEX idx_customers_active ON customers (is_active);

CREATE TRIGGER set_updated_at_customers
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 5. locations（保管場所マスタ）
--    倉庫内の棚番（ロケーション）。ゾーン・列・段の3階層で構成。
-- =============================================================================

CREATE TABLE locations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        NOT NULL UNIQUE,       -- 例: A-01-03（ゾーン-列-段）
  zone        char(1)     NOT NULL,              -- A / B / C etc.
  row_no      text        NOT NULL,              -- 01 / 02 ... （"row" は予約語回避）
  shelf_no    text        NOT NULL,              -- 01 / 02 ...
  description text,                             -- 用途メモ（例: 電子部品ケーブル類）
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- ゾーン＋列＋段の組み合わせは一意
  CONSTRAINT uq_locations_zone_row_shelf UNIQUE (zone, row_no, shelf_no)
);

COMMENT ON TABLE  locations      IS '保管場所マスタ（棚番ロケーション）';
COMMENT ON COLUMN locations.code IS 'A-01-03 形式の棚番コード（自動生成）';
COMMENT ON COLUMN locations.zone IS 'ゾーン（倉庫の区画）: 英大文字1文字';

CREATE INDEX idx_locations_zone   ON locations (zone);
CREATE INDEX idx_locations_active ON locations (is_active);

CREATE TRIGGER set_updated_at_locations
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 6. arrivals（入荷予定）+ arrival_items（入荷予定明細）
--    仕入先からの入荷予定を管理。明細は arrival_items に正規化。
--    入庫処理（receiving）も同テーブルで管理し、received_quantity を更新する。
-- =============================================================================

CREATE TABLE arrivals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        NOT NULL UNIQUE,   -- 例: ARR-2024-0001
  supplier_id     uuid        NOT NULL REFERENCES suppliers(id),
  scheduled_date  date        NOT NULL,          -- 入荷予定日
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN (
                                'pending',    -- 未着荷
                                'partial',    -- 一部入庫
                                'completed',  -- 入庫完了
                                'cancelled'   -- キャンセル
                              )),
  note            text,
  created_by      uuid        REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  arrivals               IS '入荷予定ヘッダー';
COMMENT ON COLUMN arrivals.code          IS 'ARR-YYYY-NNNN 形式の入荷予定番号';
COMMENT ON COLUMN arrivals.status        IS 'pending→partial→completed / cancelled';
COMMENT ON COLUMN arrivals.created_by    IS '登録したユーザー（users_profile.id）';

CREATE INDEX idx_arrivals_supplier    ON arrivals (supplier_id);
CREATE INDEX idx_arrivals_status      ON arrivals (status);
CREATE INDEX idx_arrivals_scheduled   ON arrivals (scheduled_date);

CREATE TRIGGER set_updated_at_arrivals
  BEFORE UPDATE ON arrivals
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- 入荷予定明細（1入荷予定に対して複数商品）
CREATE TABLE arrival_items (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  arrival_id          uuid        NOT NULL REFERENCES arrivals(id) ON DELETE CASCADE,
  product_id          uuid        NOT NULL REFERENCES products(id),
  location_id         uuid        NOT NULL REFERENCES locations(id),
  scheduled_quantity  integer     NOT NULL CHECK (scheduled_quantity > 0),
  received_quantity   integer     NOT NULL DEFAULT 0
                                  CHECK (received_quantity >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- 受け取り済みが予定数量を超えないこと
  CONSTRAINT chk_arrival_items_qty
    CHECK (received_quantity <= scheduled_quantity)
);

COMMENT ON TABLE  arrival_items                    IS '入荷予定明細（商品・数量・保管場所）';
COMMENT ON COLUMN arrival_items.scheduled_quantity IS '予定入庫数量';
COMMENT ON COLUMN arrival_items.received_quantity  IS '実際の入庫済み数量（入庫処理で更新）';

CREATE INDEX idx_arrival_items_arrival  ON arrival_items (arrival_id);
CREATE INDEX idx_arrival_items_product  ON arrival_items (product_id);

CREATE TRIGGER set_updated_at_arrival_items
  BEFORE UPDATE ON arrival_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 7. inventory（在庫台帳）
--    商品×ロケーション単位の現在庫。入庫・出庫のたびに quantity を更新する。
--    status は quantity / products.min_stock / max_stock から自動判定するトリガーを用意。
-- =============================================================================

CREATE TABLE inventory (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid        NOT NULL REFERENCES products(id),
  location_id uuid        NOT NULL REFERENCES locations(id),
  quantity    integer     NOT NULL DEFAULT 0
                          CHECK (quantity >= 0),
  lot_number  text,                              -- ロット番号（任意）
  status      text        NOT NULL DEFAULT 'normal'
                          CHECK (status IN (
                            'normal',        -- 適正
                            'low',           -- 残少（min_stock 未満）
                            'out_of_stock',  -- 在庫なし（quantity = 0）
                            'excess'         -- 過剰（max_stock 超過）
                          )),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- 同じ商品×ロケーションは1レコードに集約
  CONSTRAINT uq_inventory_product_location UNIQUE (product_id, location_id)
);

COMMENT ON TABLE  inventory             IS '在庫台帳：商品×ロケーション単位の現在庫';
COMMENT ON COLUMN inventory.quantity    IS '現在庫数（0 以上）';
COMMENT ON COLUMN inventory.status      IS 'quantity と products.min/max_stock から自動更新';
COMMENT ON COLUMN inventory.lot_number  IS 'ロット番号（任意。トレーサビリティが必要な場合に使用）';

CREATE INDEX idx_inventory_product  ON inventory (product_id);
CREATE INDEX idx_inventory_location ON inventory (location_id);
CREATE INDEX idx_inventory_status   ON inventory (status);

-- 在庫ステータスを quantity と products の基準値から自動更新するトリガー
CREATE OR REPLACE FUNCTION trigger_update_inventory_status()
RETURNS TRIGGER AS $$
DECLARE
  v_min_stock integer;
  v_max_stock integer;
BEGIN
  SELECT min_stock, max_stock
    INTO v_min_stock, v_max_stock
    FROM products
   WHERE id = NEW.product_id;

  NEW.status :=
    CASE
      WHEN NEW.quantity = 0                             THEN 'out_of_stock'
      WHEN NEW.quantity < v_min_stock                   THEN 'low'
      WHEN v_max_stock > 0 AND NEW.quantity > v_max_stock THEN 'excess'
      ELSE 'normal'
    END;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_inventory_status
  BEFORE INSERT OR UPDATE OF quantity ON inventory
  FOR EACH ROW EXECUTE FUNCTION trigger_update_inventory_status();


-- =============================================================================
-- 8. shippings（出庫指示）+ shipping_items（出庫明細）
--    出庫指示の登録から出荷確定までのワークフローを管理。
--    ピッキング → 検品 → 出庫確定の各ステップで status が遷移する。
-- =============================================================================

CREATE TABLE shippings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        NOT NULL UNIQUE,   -- 例: SHP-2024-0001
  customer_id     uuid        NOT NULL REFERENCES customers(id),
  requested_date  date        NOT NULL,          -- 出庫予定日
  shipped_date    date,                          -- 実際の出荷日（出庫確定時に設定）
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN (
                                'pending',    -- 未処理
                                'picking',    -- ピッキング中
                                'inspected',  -- 検品済み
                                'shipped',    -- 出庫完了
                                'cancelled'   -- キャンセル
                              )),
  note            text,
  created_by      uuid        REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- shipped_date は shipped ステータスの時のみ設定可
  CONSTRAINT chk_shippings_shipped_date
    CHECK (shipped_date IS NULL OR status IN ('shipped', 'cancelled'))
);

COMMENT ON TABLE  shippings              IS '出庫指示ヘッダー';
COMMENT ON COLUMN shippings.code         IS 'SHP-YYYY-NNNN 形式の出庫指示番号';
COMMENT ON COLUMN shippings.status       IS 'pending→picking→inspected→shipped / cancelled';
COMMENT ON COLUMN shippings.shipped_date IS '出庫確定時に記録する実際の出荷日';
COMMENT ON COLUMN shippings.created_by   IS '登録したユーザー（users_profile.id）';

CREATE INDEX idx_shippings_customer  ON shippings (customer_id);
CREATE INDEX idx_shippings_status    ON shippings (status);
CREATE INDEX idx_shippings_requested ON shippings (requested_date);

CREATE TRIGGER set_updated_at_shippings
  BEFORE UPDATE ON shippings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- 出庫明細（1出庫指示に対して複数商品）
CREATE TABLE shipping_items (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_id       uuid        NOT NULL REFERENCES shippings(id) ON DELETE CASCADE,
  product_id        uuid        NOT NULL REFERENCES products(id),
  location_id       uuid        NOT NULL REFERENCES locations(id),  -- 出庫元ロケーション
  ordered_quantity  integer     NOT NULL CHECK (ordered_quantity > 0),   -- 指示数量
  picked_quantity   integer     NOT NULL DEFAULT 0
                                CHECK (picked_quantity >= 0),            -- 検品時の実績数量
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  shipping_items                    IS '出庫明細（商品・数量・出庫元ロケーション）';
COMMENT ON COLUMN shipping_items.ordered_quantity   IS '出庫指示数量';
COMMENT ON COLUMN shipping_items.picked_quantity    IS '実際のピッキング数量（検品時に確定）';

CREATE INDEX idx_shipping_items_shipping ON shipping_items (shipping_id);
CREATE INDEX idx_shipping_items_product  ON shipping_items (product_id);

CREATE TRIGGER set_updated_at_shipping_items
  BEFORE UPDATE ON shipping_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- Row Level Security (RLS) — 基本設定
-- =============================================================================
-- 全テーブルで RLS を有効化し、認証済みユーザーのみアクセス可能にする基本ポリシー。
-- より細かい権限制御（role ベース）はアプリ要件に合わせて追加する。
-- =============================================================================

ALTER TABLE users_profile  ENABLE ROW LEVEL SECURITY;
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrivals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrival_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shippings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_items ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは全データを参照・操作できる（基本ポリシー）
-- 本番では role に応じた制限ポリシーに置き換えること
CREATE POLICY "authenticated users can select"
  ON users_profile FOR SELECT TO authenticated USING (true);
CREATE POLICY "users can update own profile"
  ON users_profile FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "authenticated read products"  ON products  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write products" ON products  FOR ALL    TO authenticated USING (true);

CREATE POLICY "authenticated read suppliers"  ON suppliers  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write suppliers" ON suppliers  FOR ALL    TO authenticated USING (true);

CREATE POLICY "authenticated read customers"  ON customers  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write customers" ON customers  FOR ALL    TO authenticated USING (true);

CREATE POLICY "authenticated read locations"  ON locations  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write locations" ON locations  FOR ALL    TO authenticated USING (true);

CREATE POLICY "authenticated read arrivals"  ON arrivals  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write arrivals" ON arrivals  FOR ALL    TO authenticated USING (true);

CREATE POLICY "authenticated read arrival_items"  ON arrival_items  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write arrival_items" ON arrival_items  FOR ALL    TO authenticated USING (true);

CREATE POLICY "authenticated read inventory"  ON inventory  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write inventory" ON inventory  FOR ALL    TO authenticated USING (true);

CREATE POLICY "authenticated read shippings"  ON shippings  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write shippings" ON shippings  FOR ALL    TO authenticated USING (true);

CREATE POLICY "authenticated read shipping_items"  ON shipping_items  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write shipping_items" ON shipping_items  FOR ALL    TO authenticated USING (true);


-- =============================================================================
-- Supabase Auth フック — 新規ユーザー登録時に users_profile を自動作成
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO users_profile (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'operator')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
