# 次フェーズ ロードマップ

## 現在地

フェーズ1（設計安定化）とフェーズ2（UI構造整理・一覧共通化）が完了。  
現在の実装は以下を満たしている:

- 入荷予定の登録・入庫確定（`rpc_confirm_arrival_receiving`）
- 在庫の参照・フィルタ・ページネーション
- 出庫指示の登録・引当・ピッキング（UI完備、RPC実装途中）
- ロット・賞味期限管理の基本設計
- マルチテナント（テナント + 倉庫スコープ）

---

## フェーズ3: 引当強化・トランザクション・排他制御

### 3-A: 引当 RPC の完成

**目的**: `rpc_allocate_shipping_inventory` を FIFO/FEFO 対応で完成させる。

**実装内容**:
```sql
-- FEFO: expiry_date が NULL でなければ期限昇順、NULLなら最後
-- FIFO: expiry_date が NULL の場合は received_date 昇順
-- 利用可能数 = on_hand_qty - allocated_qty > 0 の行のみ対象
-- SELECT ... FOR UPDATE SKIP LOCKED で楽観的排他制御
```

**完了条件**:
- `shipping_allocations` に正しく INSERT される
- `inventory.allocated_qty` が加算される
- 在庫不足時はエラーを返す（partial 引当は行わない、or 行う）
- 同時リクエストで二重引当が発生しない

### 3-B: 引当解除 RPC

**目的**: 出庫キャンセル・引当変更時に引当を解除する。

```sql
-- rpc_deallocate_shipping_inventory(shipping_line_id)
--   shipping_allocations を DELETE
--   inventory.allocated_qty を減算
--   shipping_lines のステータスを pending に戻す
```

### 3-C: 出荷確定 RPC

**目的**: `inspected` → `shipped` の確定処理。

```sql
-- rpc_confirm_shipping_dispatch(shipping_header_id)
--   inventory.on_hand_qty -= allocated_qty（各 allocation）
--   inventory.allocated_qty -= allocated_qty
--   shipping_headers.status = 'shipped'
--   inventory_transactions に記録
```

### 3-D: inventory_transactions の実装

**目的**: 全在庫変動操作の監査ログを記録する。

対象操作:
- 入庫確定（`arrival_receiving`）
- 出荷確定（`shipping_dispatch`）
- ロケーション移動（`inventory_move`）
- 数量調整（`inventory_adjust`）
- ステータス変更（`status_change`）

**実装方針**: RPC 関数内で明示的 INSERT（トリガーよりも可読性・制御しやすさを優先）。

### 3-E: 在庫移動・調整・ステータス変更 RPC の強化

現在は簡易実装。`inventory_transactions` との連携を追加する。

---

## フェーズ4: FEFO・賞味期限管理

### 4-A: FEFO 引当の実装

`expiry_date IS NOT NULL` の商品に対して、期限昇順（FEFO）で引き当てる。

```sql
ORDER BY
  CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
  expiry_date ASC,
  received_date ASC
```

商品マスタに `use_fefo boolean DEFAULT false` フラグを追加し、FEFO 商品のみに適用。

### 4-B: 賞味期限アラート

`expiry_date <= CURRENT_DATE + interval '30 days'` の在庫を強調表示。  
在庫一覧画面で「期限切れ間近」フィルタを追加。

### 4-C: 賞味期限切れ在庫の自動ステータス変更

`expiry_date < CURRENT_DATE` の有効在庫を自動的に `damaged` に変更する定期処理。  
Supabase Edge Function + Cron、または PostgreSQL `pg_cron` で実装。

---

## フェーズ5: DataTable 統一化

### 5-A: 共通 DataTable コンポーネント設計

各ページが独自実装しているテーブルを共通 `DataTable<T>` に統一する。

```tsx
<DataTable<InventoryItem>
  data={paged}
  columns={inventoryColumns}
  loading={loading}
  empty={<EmptyState ... />}
/>
```

**移行の条件**: フェーズ2で確立したパターン（URL params、ページネーション）を DataTable に統合できる設計になってから。

### 5-B: TanStack Table の評価・導入

DataTable 統一化のタイミングで TanStack Table の導入を再評価する。

導入判断基準:
- [ ] カラムソートが複数ページで必要になった
- [ ] カラム表示/非表示が必要になった
- [ ] 仮想スクロールが必要な行数になった（5,000行以上）

### 5-C: カラム設定の永続化

ユーザーごとのカラム表示設定を `localStorage` または Supabase に保存。

---

## 優先順位サマリー

| フェーズ | 内容 | 優先度 | 理由 |
|---|---|---|---|
| 3-A | FIFO/FEFO 引当 RPC | **最高** | 出庫フローの根幹、未完成 |
| 3-C | 出荷確定 RPC | **最高** | shipping → shipped の完成 |
| 3-D | inventory_transactions | 高 | 運用時の追跡・デバッグに必須 |
| 3-B | 引当解除 RPC | 高 | キャンセルフローに必要 |
| 3-E | 移動・調整・変更 RPC 強化 | 中 | transactions 連携 |
| 4-A | FEFO 引当 | 中 | 食品・医薬品テナントに必要 |
| 4-B | 賞味期限アラート | 中 | UX 向上 |
| 4-C | 期限切れ自動変更 | 低 | 運用自動化 |
| 5-A | DataTable 統一 | 低 | tech debt、機能影響なし |
| 5-B | TanStack Table | 低 | 現状不要 |

---

## 既知の技術的負債

| 項目 | 影響 | 対処方針 |
|---|---|---|
| Supabase Auth がダミー認証 | セキュリティ | 本番前に必ず RLS + 正規認証に切り替え |
| `allocated_qty` CHECK 制約が NOT VALID | データ整合性 | 既存データ検証後 `VALIDATE CONSTRAINT` |
| ピッキング画面の実績数量入力が未実装 | 運用 | フェーズ3-C と並行実装 |
| inventory_transactions が未記録 | 監査ログなし | フェーズ3-D で対応 |
| モバイル対応が部分的（shipping 未対応） | UX | フェーズ3 完了後に対応 |

---

## 非機能要件（将来対応）

| 要件 | 現状 | 目標 |
|---|---|---|
| 同時接続数 | 未検証 | Supabase の接続プール設定で対応 |
| レスポンスタイム | 未計測 | 一覧取得 < 500ms |
| エラーハンドリング | 最小限 | Sentry 等の導入 |
| CI/CD | なし | `tsc --noEmit` + Supabase migration を GitHub Actions に追加 |
| E2Eテスト | なし | Playwright で主要フローをカバー |
