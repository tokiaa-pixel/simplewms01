# 次フェーズ ロードマップ

## 現在地

フェーズ1（設計安定化）、フェーズ2（UI構造整理・一覧共通化）、フェーズ3（引当強化・トランザクション）が完了。  
現在の実装は以下を満たしている:

- 入荷予定の登録・入庫確定（`rpc_confirm_arrival_receiving`）
- 在庫の参照・フィルタ・ページネーション
- 出庫指示の登録・FIFO/手動引当（`rpc_allocate_shipping_inventory`）
- 引当解除（`rpc_deallocate_shipping_inventory`）✅ 2026-04-13 完了
- 再引当 FIFO（`rpc_reallocate_shipping_line`）✅ 2026-04-14 完了
- 出荷確定（`rpc_confirm_shipping_order`）
- 出荷キャンセル（`rpc_cancel_shipping_order`）✅ 2026-04-14 完了
- inventory_transactions への全操作記録（allocation / deallocation / reallocation / shipping / cancel）
- ロット・賞味期限管理の基本設計
- マルチテナント（テナント + 倉庫スコープ）

---

## フェーズ3: 引当強化・トランザクション・排他制御 ✅ 完了

### 3-A: 引当 RPC ✅ 完了

`rpc_allocate_shipping_inventory`（FIFO / 手動 strategy 対応）実装済み。

- FIFO: `received_date ASC NULLS LAST` でサーバー側自動引当
- 手動: フロント選択の allocations を使用
- FOR UPDATE による行ロックで TOCTOU 競合を防止
- テナント / 倉庫境界チェック、available ステータスチェック
- inventory_transactions に `allocation` タイプで記録（strategy 情報付き）

### 3-B: 引当解除 RPC ✅ 完了（2026-04-13）

`rpc_deallocate_shipping_inventory` 実装済み。

- `pending` / `picking` のみ解除可（サーバー側で強制チェック）
- `p_allocation_id` 指定: 1件解除 / `NULL`: line 全件解除
- `inventory.allocated_qty` / `shipping_lines.allocated_qty` を原子的に減算
- inventory_transactions に `deallocation` タイプで記録
- UI: PickingModal（pending）・InspectionModal（picking）に `Trash2` ボタン追加
- 純粋関数 `isDeallocationAllowed(status)` をテスト可能な形で実装

### 3-F: 再引当 RPC（FIFO）✅ 完了（2026-04-14）

`rpc_reallocate_shipping_line` 実装済み。

- `pending` のみ再引当可（picking 以降は不可。サーバー側で強制チェック）
- 既存引当の全解除 → FIFO 新規引当を**単一トランザクション**で原子実行
- 在庫不足時は全体 ROLLBACK（旧引当が復元される）
- inventory_transactions に `deallocation` + `allocation`（`strategy:reallocate-fifo`）で記録
- UI: PickingModal（pending）に `RefreshCw` 再引当ボタン追加
- 純粋関数 `isReallocationAllowed(status)` + `REALLOC_ELIGIBLE_STATUSES` 追加
- 設計ドキュメント: `docs/reallocation-design.md`

### 3-G: 出荷キャンセル RPC ✅ 完了（2026-04-14）

`rpc_cancel_shipping_order` 実装済み。

- `pending` / `picking` / `inspected` → `cancelled`（サーバー側で強制チェック）
- `shipped` はキャンセル不可（`on_hand_qty` 減算済み）
- `cancelled` 済みは冪等: 即 `{ error: null }` を返す
- 全 shipping_allocations を削除し `inventory.allocated_qty` を原子的に戻す
- `on_hand_qty` は変化なし（物品は倉庫に留まる）
- inventory_transactions に `deallocation` タイプ・`note=reason:cancel[:<p_reason>]` で記録
- `FOR UPDATE` + `ORDER BY id ASC` で TOCTOU・デッドロック両方を防止
- UI: `XCircle` ボタン + `CancelModal`（`picking`/`inspected` に警告表示）
- 純粋関数 `isCancellationAllowed(status)` + `CANCEL_ELIGIBLE_STATUSES` 追加
- 設計ドキュメント: `docs/shipping-cancel-design.md`

### 3-C: 出荷確定 RPC ✅ 完了

`rpc_confirm_shipping_order` 実装済み。

- `inspected` → `shipped`
- `v_remaining` デクリメントで shipped_qty の正確な配分を保証
- `on_hand_qty` 減算 + `allocated_qty` 全量解放
- inventory_transactions に `shipping` タイプで記録

### 3-D: inventory_transactions の実装 ✅ 完了

全操作（allocation / deallocation / shipping）が `inventory_transactions` に記録される。  
`received_date / lot_no / expiry_date` をスナップショットとして保持（FEFO トレーサビリティ準備）。

### 3-E: 在庫移動・調整・ステータス変更 RPC

現在は簡易実装。`inventory_transactions` との連携は部分的のみ。

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

| フェーズ | 内容 | 優先度 | 状態 |
|---|---|---|---|
| 3-A | FIFO/手動引当 RPC | ~~最高~~ | ✅ 完了 |
| 3-B | 引当解除 RPC | ~~高~~ | ✅ 完了（2026-04-13） |
| 3-C | 出荷確定 RPC | ~~最高~~ | ✅ 完了 |
| 3-D | inventory_transactions | ~~高~~ | ✅ 完了 |
| 3-E | 移動・調整・変更 RPC 強化 | 中 | 部分実装 |
| 3-F | 再引当 RPC（FIFO） | ~~高~~ | ✅ 完了（2026-04-14） |
| 3-G | 出荷キャンセル RPC | ~~高~~ | ✅ 完了（2026-04-14） |
| 4-A | FEFO 引当 | 中 | 未実装 |
| 4-B | 賞味期限アラート | 中 | 未実装 |
| 4-C | 期限切れ自動変更 | 低 | 未実装 |
| 4-D | 手動再引当（在庫指定） | 中 | 未実装 |
| 5-A | DataTable 統一 | 低 | 未実装 |
| 5-B | TanStack Table | 低 | 未実装 |

---

## 既知の技術的負債

| 項目 | 影響 | 対処方針 |
|---|---|---|
| Supabase Auth がダミー認証 | セキュリティ | 本番前に必ず RLS + 正規認証に切り替え |
| `allocated_qty` CHECK 制約が NOT VALID | データ整合性 | 既存データ検証後 `VALIDATE CONSTRAINT` |
| 手動再引当（在庫指定）が未実装（現状は FIFO のみ） | UX | 4-D で手動再引当 RPC を実装 |
| キャンセルが header 単位のみ（line 単位不可） | UX | 将来 `rpc_cancel_shipping_line` を追加（部分キャンセル設計が必要） |
| `shipped` 済みのキャンセル（返品）が未実装 | UX | 返品入庫フロー（`transaction_type='return'`）として別途設計 |
| 移動・調整 RPC の inventory_transactions 記録が不完全 | 監査ログ | 3-E 対応 |
| モバイル対応が部分的（shipping 未対応） | UX | フェーズ4 完了後に対応 |

---

## 非機能要件（将来対応）

| 要件 | 現状 | 目標 |
|---|---|---|
| 同時接続数 | 未検証 | Supabase の接続プール設定で対応 |
| レスポンスタイム | 未計測 | 一覧取得 < 500ms |
| エラーハンドリング | 最小限 | Sentry 等の導入 |
| CI/CD | なし | `tsc --noEmit` + Supabase migration を GitHub Actions に追加 |
| E2Eテスト | なし | Playwright で主要フローをカバー |
