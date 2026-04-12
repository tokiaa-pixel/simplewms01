-- =============================================================
-- fix_rls.sql
-- RLS (Row Level Security) の確認と修正
--
-- 管理者画面で荷主・倉庫一覧が空になる場合、
-- RLS が有効で SELECT ポリシーが未設定の可能性があります。
--
-- 【手順】
-- 1. まず現状確認クエリを実行して RLS の状態を確認
-- 2. 環境に合わせて修正クエリを選択して実行
-- =============================================================

-- ─── 1. 現状確認 ─────────────────────────────────────────────

-- RLS 有効/無効の確認
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('tenants', 'warehouses', 'products', 'locations', 'inventory', 'arrival_plans', 'shipping_orders');

-- 既存ポリシーの確認
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- =============================================================
-- ─── 2a. 開発環境向け：RLS を無効化（最もシンプル）─────────────
--
-- Supabase anon キーで全データを参照できるようになります。
-- 本番環境では使用しないでください。
-- =============================================================

ALTER TABLE tenants    DISABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses DISABLE ROW LEVEL SECURITY;


-- =============================================================
-- ─── 2b. 本番環境向け：全員 SELECT 可 ポリシーを追加 ───────────
--
-- RLS は維持しつつ、anon/authenticated どちらも参照可能にします。
-- INSERT / UPDATE / DELETE は別途制御してください。
-- =============================================================

-- (2a を実行した場合は不要。どちらか一方を実行してください)

-- ALTER TABLE tenants    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- DROP POLICY IF EXISTS "allow_select_tenants"    ON tenants;
-- DROP POLICY IF EXISTS "allow_select_warehouses" ON warehouses;

-- CREATE POLICY "allow_select_tenants"
--   ON tenants FOR SELECT
--   USING (true);

-- CREATE POLICY "allow_select_warehouses"
--   ON warehouses FOR SELECT
--   USING (true);
