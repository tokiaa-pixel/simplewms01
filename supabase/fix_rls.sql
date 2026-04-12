-- =============================================================
-- fix_rls.sql  ― anon ロール向け SELECT ポリシー追加
-- =============================================================
-- 【問題】
--   このアプリは Supabase Auth を使わずダミー認証を使っているため、
--   Supabase クライアントは常に "anon" ロールでリクエストを送信します。
--   すべてのテーブルのポリシーは "authenticated" ロール向けのみのため、
--   anon からのリクエストはデータが返らず空配列になります。
--
-- 【対応】
--   全業務テーブルに anon ロール向けの SELECT ポリシーを追加します。
--   既存の authenticated ポリシーはそのまま残します。
--
-- 【実行方法】
--   Supabase Dashboard → SQL Editor に貼り付けてそのまま実行してください。
--   既存ポリシーがある場合はスキップされます（冪等）。
-- =============================================================


-- ─── マスタ系テーブル ──────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "anon read tenants" ON tenants FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon read warehouses" ON warehouses FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon read products" ON products FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon read suppliers" ON suppliers FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon read customers" ON customers FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon read locations" ON locations FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─── 入庫系テーブル ────────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "anon read arrival_headers" ON arrival_headers FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon read arrival_lines" ON arrival_lines FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─── 在庫テーブル ──────────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "anon read inventory" ON inventory FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon read inventory_transactions" ON inventory_transactions FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─── 出庫系テーブル ────────────────────────────────────────────

DO $$ BEGIN
  CREATE POLICY "anon read shipping_headers" ON shipping_headers FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon read shipping_lines" ON shipping_lines FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon read shipping_allocations" ON shipping_allocations FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─── 書き込み系ポリシー（INSERT / UPDATE） ────────────────────
-- SELECT だけでなく書き込みも必要なテーブルに追加します。

DO $$ BEGIN
  CREATE POLICY "anon write arrival_headers" ON arrival_headers FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write arrival_lines" ON arrival_lines FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write inventory" ON inventory FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write inventory_transactions" ON inventory_transactions FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write shipping_headers" ON shipping_headers FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write shipping_lines" ON shipping_lines FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write shipping_allocations" ON shipping_allocations FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write products" ON products FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write suppliers" ON suppliers FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write customers" ON customers FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "anon write locations" ON locations FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================
-- 確認クエリ（実行後にポリシーが追加されたことを確認）
-- =============================================================
-- SELECT schemaname, tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
