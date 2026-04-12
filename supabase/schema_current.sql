-- =============================================================================
-- SimpleWMS — 現行スキーマ定義（実 DB の状態を反映した正規ドキュメント）
-- =============================================================================
-- ⚠️ このファイルは「現在の Supabase DB に何があるか」を記録したものです。
--    新規に DB を構築する場合も、再実行する場合も、このファイルを使ってください。
--    CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS で冪等に実行可能です。
--    schema.sql（旧構造）は参照のみで実行しないでください。
--
-- 実行順序:
--   1. 本ファイル（schema_current.sql）を全て実行
--   2. migration_v2.sql を実行（tenants/warehouses 多言語化）
--   3. migration_v3.sql を実行（lot_no/expiry_date、UNIQUE/CHECK 追加）
--   4. fix_rls.sql を実行（開発用 anon ポリシー）
--   5. dummy_multitenant.sql を実行（テストデータ投入）
-- =============================================================================


-- =============================================================================
-- 共通トリガー関数
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 1. tenants（荷主マスタ）
-- =============================================================================
-- 3PL が管理する荷主（委託者）。1 荷主が複数倉庫を持てる。

CREATE TABLE IF NOT EXISTS tenants (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_code     text        NOT NULL,
  tenant_name     text        NOT NULL,                  -- 旧列（後方互換維持）
  tenant_name_ja  text        NOT NULL,                  -- migration_v2 で追加
  tenant_name_en  text,
  memo            text,
  status          text        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'inactive')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenants_code_key UNIQUE (tenant_code)
);

DROP TRIGGER IF EXISTS tenants_set_updated_at ON tenants;
CREATE TRIGGER tenants_set_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 2. warehouses（倉庫マスタ）
-- =============================================================================

CREATE TABLE IF NOT EXISTS warehouses (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  warehouse_code    text        NOT NULL,
  warehouse_name    text        NOT NULL,                -- 旧列（後方互換維持）
  warehouse_name_ja text        NOT NULL,                -- migration_v2 で追加
  warehouse_name_en text,
  memo              text,
  status            text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'inactive')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT warehouses_tenant_code_key UNIQUE (tenant_id, warehouse_code)
);

CREATE INDEX IF NOT EXISTS idx_warehouses_tenant ON warehouses (tenant_id);

DROP TRIGGER IF EXISTS warehouses_set_updated_at ON warehouses;
CREATE TRIGGER warehouses_set_updated_at
  BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 3. products（商品マスタ）
-- =============================================================================

CREATE TABLE IF NOT EXISTS products (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  product_code    text        NOT NULL,
  product_name_ja text        NOT NULL,
  product_name_en text,
  unit            text        NOT NULL DEFAULT '個',
  category        text        NOT NULL DEFAULT '',
  status          text        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'inactive')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT products_tenant_code_key UNIQUE (tenant_id, product_code)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant  ON products (tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_status  ON products (status);

DROP TRIGGER IF EXISTS set_updated_at_products ON products;
CREATE TRIGGER set_updated_at_products
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 4. suppliers（仕入先マスタ）
-- =============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  supplier_code    text        NOT NULL,
  supplier_name_ja text        NOT NULL,
  supplier_name_en text,
  status           text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'inactive')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT suppliers_tenant_code_key UNIQUE (tenant_id, supplier_code)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers (tenant_id);

DROP TRIGGER IF EXISTS set_updated_at_suppliers ON suppliers;
CREATE TRIGGER set_updated_at_suppliers
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 5. customers（得意先マスタ）
-- =============================================================================

CREATE TABLE IF NOT EXISTS customers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  customer_code    text        NOT NULL,
  customer_name_ja text        NOT NULL,
  customer_name_en text,
  status           text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'inactive')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT customers_tenant_code_key UNIQUE (tenant_id, customer_code)
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers (tenant_id);

DROP TRIGGER IF EXISTS set_updated_at_customers ON customers;
CREATE TRIGGER set_updated_at_customers
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 6. locations（ロケーションマスタ）
-- =============================================================================
-- 倉庫内の棚番。warehouse_id で倉庫に所属する。

CREATE TABLE IF NOT EXISTS locations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id  uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  location_code text        NOT NULL,
  location_name text,
  zone          text,
  status        text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'inactive')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- 同一倉庫内でロケーションコードは一意
  CONSTRAINT locations_warehouse_code_key UNIQUE (warehouse_id, location_code)
);

CREATE INDEX IF NOT EXISTS idx_locations_warehouse ON locations (warehouse_id);

DROP TRIGGER IF EXISTS set_updated_at_locations ON locations;
CREATE TRIGGER set_updated_at_locations
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 7. inventory（在庫台帳）
-- =============================================================================
-- 【責務】現在庫の集約。1行 = 1つの在庫粒度の現在量。
--
-- 在庫粒度 = (tenant_id, warehouse_id, product_id, location_id, status, received_date, lot_no)
--
-- on_hand_qty  : 倉庫に物理的に存在する数量
-- allocated_qty: 出庫指示で引き当て済みの数量（まだ出庫前）
-- available_qty: on_hand_qty - allocated_qty（アプリ層で計算、物理列不要）
--
-- received_date: FIFO 引当の基準日（入庫確定日）
-- lot_no       : ロット番号（NULL 許容。将来 FEFO 対応時に使用）
-- expiry_date  : 有効期限（NULL 許容。FEFO 引当順序のキー）

CREATE TABLE IF NOT EXISTS inventory (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
  warehouse_id  uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  product_id    uuid        NOT NULL REFERENCES products(id)   ON DELETE RESTRICT,
  location_id   uuid        NOT NULL REFERENCES locations(id)  ON DELETE RESTRICT,

  on_hand_qty   integer     NOT NULL DEFAULT 0 CHECK (on_hand_qty >= 0),
  allocated_qty integer     NOT NULL DEFAULT 0 CHECK (allocated_qty >= 0),

  -- available_qty は物理列を持たない。アプリ層で on_hand_qty - allocated_qty として計算。
  -- 物理列にすると更新漏れによる不整合が生じるため意図的に排除している。

  status        text        NOT NULL DEFAULT 'available'
                            CHECK (status IN ('available', 'hold', 'damaged')),

  -- FIFO / FEFO 引当の基準となる日付・ロット・期限
  received_date date,           -- 入庫確定日（FIFO ソートキー）
  lot_no        text,           -- ロット番号（NULL = ロット管理なし）
  expiry_date   date,           -- 有効期限（NULL = 期限管理なし。FEFO のキー）

  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- 在庫粒度を一意に定める複合制約
  -- lot_no は NULL 許容のため COALESCE で '' 扱い
  CONSTRAINT uq_inventory_grain
    UNIQUE (tenant_id, warehouse_id, product_id, location_id, status, received_date, lot_no),

  -- 引当済みが実在庫を超えないこと
  CONSTRAINT chk_inventory_allocated
    CHECK (allocated_qty <= on_hand_qty)
);

-- 既存テーブルに列が不足している場合に備えて追加（冪等）
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS lot_no      text,
  ADD COLUMN IF NOT EXISTS expiry_date date;

CREATE INDEX IF NOT EXISTS idx_inventory_tenant_wh  ON inventory (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inventory_product    ON inventory (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location   ON inventory (location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_fifo       ON inventory (received_date ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_inventory_fefo       ON inventory (expiry_date   ASC NULLS LAST);

DROP TRIGGER IF EXISTS set_updated_at_inventory ON inventory;
CREATE TRIGGER set_updated_at_inventory
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 8. inventory_transactions（在庫操作履歴）
-- =============================================================================
-- 【責務】在庫の変動を全て記録する監査ログ（追記のみ・変更・削除しない）。
--
-- transaction_type: 操作種別
--   'receiving'      : 入庫確定
--   'shipping'       : 出庫確定
--   'move'           : ロケーション移動
--   'adjust_increase': 数量増加調整
--   'adjust_decrease': 数量減少調整
--   'adjust_set'     : 棚卸上書き
--   'status_change'  : ステータス変更（available ↔ hold ↔ damaged）
--
-- reference_type / reference_id: この操作を引き起こした伝票への逆引きキー

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id)   ON DELETE RESTRICT,
  warehouse_id     uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  inventory_id     uuid        REFERENCES inventory(id) ON DELETE SET NULL,  -- 行削除時は NULL
  product_id       uuid        NOT NULL REFERENCES products(id)   ON DELETE RESTRICT,

  transaction_type text        NOT NULL
                   CHECK (transaction_type IN (
                     'receiving', 'shipping',
                     'move', 'adjust_increase', 'adjust_decrease', 'adjust_set',
                     'status_change'
                   )),

  -- 操作前後の数量スナップショット（監査用）
  before_on_hand_qty   integer,
  after_on_hand_qty    integer,
  before_allocated_qty integer,
  after_allocated_qty  integer,
  qty_delta            integer NOT NULL DEFAULT 0,  -- 変化量（正=増加、負=減少）

  from_location_id  uuid REFERENCES locations(id) ON DELETE SET NULL,
  to_location_id    uuid REFERENCES locations(id) ON DELETE SET NULL,
  from_status       text CHECK (from_status IN ('available', 'hold', 'damaged')),
  to_status         text CHECK (to_status   IN ('available', 'hold', 'damaged')),

  -- FIFO/FEFO トレーサビリティ
  received_date     date,
  lot_no            text,
  expiry_date       date,

  -- 逆引きキー（どの伝票操作によって発生したか）
  reference_type    text CHECK (reference_type IN (
                      'arrival_line', 'shipping_line', 'manual'
                    )),
  reference_id      uuid,  -- arrival_lines.id または shipping_lines.id

  reason            text,
  note              text,
  executed_by       uuid,  -- 将来 auth.users.id と紐付ける
  created_at        timestamptz NOT NULL DEFAULT now()

  -- transactions は不変レコードのため updated_at は不要
);

-- 既存テーブルに列が不足している場合に備えて追加（冪等）
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS before_on_hand_qty   integer,
  ADD COLUMN IF NOT EXISTS after_on_hand_qty    integer,
  ADD COLUMN IF NOT EXISTS before_allocated_qty integer,
  ADD COLUMN IF NOT EXISTS after_allocated_qty  integer,
  ADD COLUMN IF NOT EXISTS qty_delta            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS from_location_id     uuid REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_location_id       uuid REFERENCES locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS from_status          text,
  ADD COLUMN IF NOT EXISTS to_status            text,
  ADD COLUMN IF NOT EXISTS received_date        date,
  ADD COLUMN IF NOT EXISTS lot_no               text,
  ADD COLUMN IF NOT EXISTS expiry_date          date,
  ADD COLUMN IF NOT EXISTS reference_type       text,
  ADD COLUMN IF NOT EXISTS reference_id         uuid,
  ADD COLUMN IF NOT EXISTS reason               text,
  ADD COLUMN IF NOT EXISTS note                 text,
  ADD COLUMN IF NOT EXISTS executed_by          uuid;

CREATE INDEX IF NOT EXISTS idx_inv_tx_tenant_wh    ON inventory_transactions (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_product      ON inventory_transactions (product_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_inventory    ON inventory_transactions (inventory_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_reference    ON inventory_transactions (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created      ON inventory_transactions (created_at DESC);


-- =============================================================================
-- 9. arrival_headers（入荷予定ヘッダー）
-- =============================================================================

CREATE TABLE IF NOT EXISTS arrival_headers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id)    ON DELETE RESTRICT,
  warehouse_id uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  arrival_no   text        NOT NULL,
  supplier_id  uuid        NOT NULL REFERENCES suppliers(id)  ON DELETE RESTRICT,
  arrival_date date        NOT NULL,
  status       text        NOT NULL DEFAULT 'planned'
                           CHECK (status IN ('planned', 'receiving', 'completed', 'cancelled')),
  memo         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- 同一テナント内で入荷番号は一意
  CONSTRAINT arrival_headers_tenant_no_key UNIQUE (tenant_id, arrival_no)
);

CREATE INDEX IF NOT EXISTS idx_arrival_headers_tenant_wh ON arrival_headers (tenant_id, warehouse_id);

DROP TRIGGER IF EXISTS set_updated_at_arrival_headers ON arrival_headers;
CREATE TRIGGER set_updated_at_arrival_headers
  BEFORE UPDATE ON arrival_headers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 10. arrival_lines（入荷予定明細）
-- =============================================================================
-- 【将来対応】lot_no / expiry_date を持ち、入庫確定時に inventory に伝播する。

CREATE TABLE IF NOT EXISTS arrival_lines (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id)          ON DELETE RESTRICT,
  warehouse_id        uuid        NOT NULL REFERENCES warehouses(id)        ON DELETE RESTRICT,
  header_id           uuid        NOT NULL REFERENCES arrival_headers(id)   ON DELETE CASCADE,
  line_no             integer     NOT NULL CHECK (line_no > 0),
  product_id          uuid        NOT NULL REFERENCES products(id)          ON DELETE RESTRICT,
  planned_qty         integer     NOT NULL CHECK (planned_qty > 0),
  received_qty        integer     NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  planned_location_id uuid        REFERENCES locations(id) ON DELETE SET NULL,
  actual_location_id  uuid        REFERENCES locations(id) ON DELETE SET NULL,

  -- FEFO 対応：入庫時にロット番号・有効期限を捕捉する
  lot_no              text,   -- NULL = ロット管理なし
  expiry_date         date,   -- NULL = 期限管理なし

  status              text    NOT NULL DEFAULT 'planned'
                              CHECK (status IN ('planned', 'receiving', 'completed', 'cancelled')),
  memo                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_arrival_lines_received CHECK (received_qty <= planned_qty),
  CONSTRAINT uq_arrival_lines_header_lineno UNIQUE (header_id, line_no)
);

-- 既存テーブルに列が不足している場合に備えて追加（冪等）
ALTER TABLE arrival_lines
  ADD COLUMN IF NOT EXISTS lot_no      text,
  ADD COLUMN IF NOT EXISTS expiry_date date;

CREATE INDEX IF NOT EXISTS idx_arrival_lines_header   ON arrival_lines (header_id);
CREATE INDEX IF NOT EXISTS idx_arrival_lines_tenant   ON arrival_lines (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_arrival_lines_product  ON arrival_lines (product_id);

DROP TRIGGER IF EXISTS set_updated_at_arrival_lines ON arrival_lines;
CREATE TRIGGER set_updated_at_arrival_lines
  BEFORE UPDATE ON arrival_lines
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 11. shipping_headers（出庫指示ヘッダー）
-- =============================================================================

CREATE TABLE IF NOT EXISTS shipping_headers (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id)    ON DELETE RESTRICT,
  warehouse_id  uuid        NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  shipping_no   text        NOT NULL,
  customer_id   uuid        NOT NULL REFERENCES customers(id)  ON DELETE RESTRICT,
  shipping_date date        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'picking', 'inspected', 'shipped', 'cancelled')),
  memo          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT shipping_headers_tenant_no_key UNIQUE (tenant_id, shipping_no)
);

CREATE INDEX IF NOT EXISTS idx_shipping_headers_tenant_wh ON shipping_headers (tenant_id, warehouse_id);

DROP TRIGGER IF EXISTS set_updated_at_shipping_headers ON shipping_headers;
CREATE TRIGGER set_updated_at_shipping_headers
  BEFORE UPDATE ON shipping_headers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 12. shipping_lines（出庫指示明細）
-- =============================================================================
-- requested_qty: 出庫指示数量
-- shipped_qty  : 検品後に確定した実出庫数量
-- ※ allocated_qty は shipping_allocations の集計値として扱う（物理列なし）

CREATE TABLE IF NOT EXISTS shipping_lines (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id)          ON DELETE RESTRICT,
  warehouse_id  uuid        NOT NULL REFERENCES warehouses(id)        ON DELETE RESTRICT,
  header_id     uuid        NOT NULL REFERENCES shipping_headers(id)  ON DELETE CASCADE,
  line_no       integer     NOT NULL CHECK (line_no > 0),
  product_id    uuid        NOT NULL REFERENCES products(id)          ON DELETE RESTRICT,
  requested_qty integer     NOT NULL CHECK (requested_qty > 0),
  shipped_qty   integer     NOT NULL DEFAULT 0 CHECK (shipped_qty >= 0),
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_shipping_lines_header_lineno UNIQUE (header_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_shipping_lines_header  ON shipping_lines (header_id);
CREATE INDEX IF NOT EXISTS idx_shipping_lines_tenant  ON shipping_lines (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_shipping_lines_product ON shipping_lines (product_id);

DROP TRIGGER IF EXISTS set_updated_at_shipping_lines ON shipping_lines;
CREATE TRIGGER set_updated_at_shipping_lines
  BEFORE UPDATE ON shipping_lines
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- =============================================================================
-- 13. shipping_allocations（引当の実体）
-- =============================================================================
-- 【責務】「どの出庫明細が、どの在庫行から何個を引き当てているか」を表す。
-- 1つの shipping_line が複数の inventory 行にまたがることを許容（FIFO 分割引当）。
-- 出庫確定時はこのテーブルを読んで inventory を減算する。

CREATE TABLE IF NOT EXISTS shipping_allocations (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id       uuid    NOT NULL REFERENCES shipping_lines(id)  ON DELETE CASCADE,
  inventory_id  uuid    NOT NULL REFERENCES inventory(id)        ON DELETE RESTRICT,
  allocated_qty integer NOT NULL CHECK (allocated_qty > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_shipping_allocations_line_inv UNIQUE (line_id, inventory_id)
);

CREATE INDEX IF NOT EXISTS idx_shipping_alloc_line  ON shipping_allocations (line_id);
CREATE INDEX IF NOT EXISTS idx_shipping_alloc_inv   ON shipping_allocations (inventory_id);


-- =============================================================================
-- Row Level Security（開発時は fix_rls.sql で anon を開放する）
-- =============================================================================

ALTER TABLE tenants                ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory              ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrival_headers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrival_lines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_headers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_allocations   ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザー向け基本ポリシー（本番での最低ライン）
-- 将来: ユーザーの tenant_id に基づくフィルタに置き換える
DO $$ BEGIN
  CREATE POLICY "auth read tenants"    ON tenants    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth read warehouses" ON warehouses FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth read products"   ON products   FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth read suppliers"  ON suppliers  FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth read customers"  ON customers  FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth read locations"  ON locations  FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth all inventory"   ON inventory  FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth all inv_tx"      ON inventory_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth all arr_h"       ON arrival_headers   FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth all arr_l"       ON arrival_lines     FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth all shp_h"       ON shipping_headers  FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth all shp_l"       ON shipping_lines    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth all shp_a"       ON shipping_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
