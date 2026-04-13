-- =============================================================================
-- migration_v4.sql  ― 手動引当サーバー化に伴うスキーマ変更
-- =============================================================================
-- 【目的】
--   フェーズ3-3: 手動引当処理を RPC で原子的に実行するための土台を整備する。
--
-- 【実行条件】
--   migration_v3.sql（lot_no/expiry_date）適用済みであること。
--
-- 【安全性】
--   ・ALTER TABLE は IF NOT EXISTS / IF EXISTS で冪等に実行できる。
--   ・CHECK 制約の差し替えは DROP → ADD のため既存データへの影響なし
--     （既存行の transaction_type に 'allocation'/'deallocation' は存在しない）。
--
-- 【適用順】
--   1. 本ファイルを実行（スキーマ変更）
--   2. rpc_functions.sql を実行（RPC 関数の更新）
-- =============================================================================


-- =============================================================================
-- 事前確認クエリ（実行前に手動で確認すること）
-- =============================================================================
-- inventory_transactions の列名を確認（qty か qty_delta かを確認する）:
--   SELECT column_name
--   FROM   information_schema.columns
--   WHERE  table_name = 'inventory_transactions'
--     AND  column_name IN ('qty', 'qty_delta');
--
-- 結果が 'qty_delta' のみ → rpc_functions.sql の修正は正しい
-- 結果が 'qty' のみ → rpc_functions.sql の修正方向を逆にする必要がある（要確認）
-- 両方存在 → qty のまま使えるか検討する
-- =============================================================================


-- =============================================================================
-- 1. shipping_lines に allocated_qty 列を追加
-- =============================================================================
-- 【目的】
--   各明細行に対して「現在引き当てられている数量」をキャッシュする。
--   rpc_allocate_shipping_inventory が引当確定時に同期して更新する。
--   N+1 を避けて UI で素早く表示するために使用。
--
-- 【整合性の維持】
--   allocated_qty は shipping_allocations の合計と常に一致するよう、
--   引当 RPC / 解除 RPC 内でのみ更新し、UI から直接変更しない。

ALTER TABLE shipping_lines
  ADD COLUMN IF NOT EXISTS allocated_qty integer NOT NULL DEFAULT 0
  CHECK (allocated_qty >= 0);

COMMENT ON COLUMN shipping_lines.allocated_qty
  IS '引当済み数量（shipping_allocations の合計）。RPC が原子的に同期する。UI から直接変更しないこと。';


-- =============================================================================
-- 2. inventory_transactions.transaction_type に 'allocation' / 'deallocation' 追加
-- =============================================================================
-- 引当確定・引当解除のイベントも在庫履歴として記録できるよう、
-- transaction_type の許容値を拡張する。
--
-- 【注意】
--   PostgreSQL の CHECK 制約はインライン値の追加ができないため、
--   DROP → ADD で差し替える。既存行の transaction_type は変更しない。

DO $$
BEGIN
  -- 自動命名された CHECK 制約を削除（存在しない場合は無視）
  ALTER TABLE inventory_transactions
    DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'receiving',       -- 入庫確定
    'shipping',        -- 出荷確定
    'allocation',      -- 引当確定（on_hand_qty 不変、allocated_qty 増加）
    'deallocation',    -- 引当解除（on_hand_qty 不変、allocated_qty 減少）
    'move',            -- ロケーション移動
    'adjust_increase', -- 数量増加調整
    'adjust_decrease', -- 数量減少調整
    'adjust_set',      -- 棚卸上書き
    'status_change'    -- ステータス変更
  ));

COMMENT ON COLUMN inventory_transactions.transaction_type
  IS '操作種別。receiving=入庫, shipping=出荷, allocation=引当確定, deallocation=引当解除, move=移動, adjust_*=調整, status_change=ステータス変更';


-- =============================================================================
-- 確認クエリ（適用後に実行して確認）
-- =============================================================================
-- 列が追加されたことを確認:
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM   information_schema.columns
--   WHERE  table_name = 'shipping_lines' AND column_name = 'allocated_qty';
--
-- CHECK 制約が更新されたことを確認:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM   pg_constraint
--   WHERE  conrelid = 'inventory_transactions'::regclass
--     AND  conname  = 'inventory_transactions_transaction_type_check';
