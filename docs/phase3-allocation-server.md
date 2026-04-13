# フェーズ3 引当サーバー化・トランザクション強化

## フェーズ3の目的

フェーズ3は「引当ロジックのサーバー移行と整合性強化」フェーズ。  
フェーズ2まではフロント側の逐次 Supabase 呼び出しで引当を処理していたため、
TOCTOU 競合リスクと監査ログの欠如が課題だった。

本フェーズの成果物:
- 手動引当・FIFO 引当をサーバー側 RPC（単一トランザクション）に移行
- `inventory_transactions` へのフル記録（allocation / shipping 含む）
- `shipping_lines.allocated_qty` の RPC 内同期
- FEFO 拡張に向けたトレーサビリティフィールドの整備
- 純粋関数の `allocation.ts` への分離とユニットテスト追加

---

## フェーズ3-1: 現状調査

### 発見した問題点

| 問題 | 影響 |
|------|------|
| `createShippingOrder` が逐次 Supabase 呼び出し | TOCTOU: SELECT → UPDATE の間に別トランザクションが割り込める |
| `allocated_qty` の二重引当リスク | 同じ在庫行に対して並行して引当が実行されると超過引当が発生 |
| `inventory_transactions` が未記録（allocation/shipping） | 監査ログなし。引当の経緯を追えない |
| `shipping_lines.allocated_qty` 列が存在しない | 引当合計を N+1 なしに表示できない |
| RPC 内で `qty` と `qty_delta` のカラム名が混在 | 既存 RPC（move/adjust/status_change）が INSERT エラーになる |

### 用語整理

```
on_hand_qty   : 倉庫に物理的に存在する数量
allocated_qty : 出庫指示で押さえている数量（まだ出庫前）
available_qty : on_hand_qty - allocated_qty（アプリ層で計算、DB 列なし）
```

---

## フェーズ3-2: 責務設計

### 7ユースケースの責務分担

| ユースケース | 判断 | 理由 |
|------------|------|------|
| 手動引当登録 | RPC | 在庫ロック + allocation + inventory + transactions を原子的に実行 |
| FIFO 自動引当 | RPC | FIFO 計算自体もサーバー側で行い、プレビューと確定を分離 |
| 引当解除 | RPC（将来対応） | allocated_qty の減算と transactions 記録が必要 |
| 出荷確定 | RPC | inventory 減算 + transactions 記録 + atomic 性 |
| 出庫キャンセル | RPC（将来対応） | 引当解除 + ステータス変更を原子的に |
| inventory_transactions 記録 | RPC 内 | クライアントから別途 INSERT すると原子性が失われる |
| shipping_lines.allocated_qty 同期 | RPC 内 | 引当処理と同一トランザクションで維持 |

### 採用した原則

- **クライアントは意図を送る。RPC が検証・実行する**
- RPC が失敗しても中途半端な更新は残らない（トランザクション保証）
- `SELECT ... FOR UPDATE` で行ロックを取得してから更新

---

## フェーズ3-3: 手動引当のサーバー化

### スキーマ変更（migration_v4.sql）

```sql
-- shipping_lines に引当合計キャッシュ列を追加
ALTER TABLE shipping_lines
  ADD COLUMN IF NOT EXISTS allocated_qty integer NOT NULL DEFAULT 0
  CHECK (allocated_qty >= 0);

-- inventory_transactions の transaction_type を拡張
-- DROP + ADD で既存の CHECK 制約を差し替える
ALTER TABLE inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;
ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'receiving', 'shipping',
    'allocation', 'deallocation',
    'move', 'adjust_increase', 'adjust_decrease', 'adjust_set',
    'status_change'
  ));
```

### `rpc_allocate_shipping_inventory` の強化

フェーズ3-3で追加した保護:

| チェック | 内容 |
|--------|------|
| テナント/倉庫境界 | `v_inv.tenant_id != p_tenant_id` → EXCEPTION |
| ステータス | `v_inv.status != 'available'` → EXCEPTION |
| 引当可能数 | `v_add_qty > available_qty` → EXCEPTION |
| `inventory_transactions` INSERT | `'allocation'` タイプ、qty_delta=0 |
| `shipping_lines.allocated_qty` 同期 | 明細ごとの合計で UPDATE |

### `createShippingOrder` の変更

旧実装（130行の逐次呼び出し）を廃止し、1回の RPC 呼び出しに置き換え:

```typescript
// 旧: shipping_headers → shipping_lines → shipping_allocations →
//     inventory.allocated_qty を逐次呼び出し（非原子）
// 新:
const { data, error } = await (supabase as any).rpc(
  'rpc_allocate_shipping_inventory',
  { p_shipping_no, p_lines: rpcLines, ... }
)
```

### 純粋関数の分離（allocation.ts）

`computeFifoAllocation` と型定義を `shippings.ts` から `allocation.ts` に分離。

**理由**: `shippings.ts` は Supabase クライアントを import するため、
テスト実行時に環境変数エラーが発生する。純粋関数を分離することで
DB 接続なしのユニットテストが可能になる。

```
lib/supabase/queries/
  allocation.ts   ← 純粋関数・型定義のみ（Supabase 依存なし）
  shippings.ts    ← allocation.ts を import して re-export
```

---

## フェーズ3-4: FIFO 引当のサーバー化

### Strategy パターンの採用

`rpc_allocate_shipping_inventory` に `strategy` フィールドを追加し、
1つの RPC で FIFO / 手動を切り替えられる設計にした。

```json
// 各 line JSON の形式
{
  "lineNo": 1,
  "productId": "uuid",
  "requestedQty": 10,
  "strategy": "fifo",    // "fifo" | "manual"（未指定は "manual" にフォールバック）
  "allocations": []      // strategy="fifo" の場合は空配列
}
```

| strategy | 動作 |
|----------|------|
| `"fifo"` | RPC が `received_date ASC NULLS LAST` 順に在庫をスキャンして自動引当 |
| `"manual"` | フロントが指定した `allocations` をそのまま使用（フェーズ3-3ロジック） |
| 未指定 | `"manual"` にフォールバック（後方互換） |

将来 FEFO を追加する場合は `strategy: "fefo"` ブランチを追加するだけ。

### FIFO 在庫スキャンの安全設計

```sql
FOR v_fifo_inv IN
  SELECT id, ..., received_date, lot_no, expiry_date
  FROM   inventory
  WHERE  product_id   = (v_line->>'productId')::uuid
    AND  tenant_id    = p_tenant_id
    AND  warehouse_id = p_warehouse_id
    AND  status       = 'available'
    AND  on_hand_qty - allocated_qty > 0
  ORDER BY received_date ASC NULLS LAST, id ASC  -- id ASC でロック順固定・deadlock 防止
  FOR UPDATE
LOOP
  EXIT WHEN v_remaining <= 0;
  -- 貪欲に引当。在庫不足は部分引当として許容。
END LOOP;
```

### 在庫不足時の判断

**部分引当を許容する**（在庫不足でもエラーなしで登録）。

理由:
- 現行 UI がプレビューで不足警告を表示して登録を通していたため、UX と一致させる
- 出庫指示の登録 ≠ 出庫確定。不足分は後続の手動引当追加で対処できる
- `shipping_lines.allocated_qty < requested_qty` で不足を判別可能

### フロント側の変更

```typescript
// submit 時: FIFO 行は allocations を空で送り、サーバーに再計算を委ねる
strategy:    l.allocationMode === 'fifo' ? 'fifo' : 'manual',
allocations: l.allocationMode === 'fifo' ? [] : l.allocations.map(...)
```

FIFO プレビュー（`handleRunFifo`）は変更なし。プレビューは「予告」として残し、
コミット時はサーバーが最新在庫で再計算する設計（TOCTOU の解消）。

---

## フェーズ3-5: 履歴・整合性・テスト強化

### 修正した整合性問題

#### 1. 出荷確定に inventory_transactions が存在しなかった

旧 `confirmShippingOrder` は在庫数量を更新していたが、`inventory_transactions`
への記録が一切なかった。新 RPC `rpc_confirm_shipping_order` で修正。

#### 2. shipped_qty 配分バグの修正

旧実装:
```typescript
// 問題: 各引当行が独立して MIN を計算するため、合計が shipped_qty を超える
const deduct = Math.min(a.allocated_qty, line.shipped_qty)
```

新 RPC:
```sql
-- v_remaining をデクリメントして合計が shipped_qty を超えないよう制御
v_remaining := v_line.shipped_qty;
FOR v_alloc IN ... LOOP
  v_deduct := LEAST(v_alloc.allocated_qty, GREATEST(0, v_remaining));
  -- on_hand_qty: 出庫した分だけ減算
  -- allocated_qty: 引当全量を解放（予約クリア）
  v_remaining := v_remaining - v_deduct;
END LOOP;
```

#### 3. FEFO トレーサビリティフィールドの追加

全引当・出荷の `inventory_transactions` に以下を追加:

| フィールド | 用途 |
|----------|------|
| `received_date` | FIFO 計算の基準日スナップショット |
| `lot_no` | ロット追跡（将来 FEFO 対応時に検索キーになる） |
| `expiry_date` | 賞味期限スナップショット（FEFO 計算基準） |
| `note` | 引当戦略記録（`'strategy:fifo'` / `'strategy:manual'`） |

### 新 RPC: `rpc_confirm_shipping_order`

```sql
CREATE OR REPLACE FUNCTION rpc_confirm_shipping_order(
  p_header_id    uuid,
  p_tenant_id    uuid,
  p_warehouse_id uuid
) RETURNS json ...
```

処理順序:
1. ヘッダーの存在 + tenant/warehouse スコープ + `status='inspected'` を検証
2. 各明細を `FOR UPDATE` でロック
3. 各引当行の在庫を `FOR UPDATE` でロック
4. `on_hand_qty` を shipped_qty ベースで減算（`v_remaining` 配分）
5. `allocated_qty` を引当全量解放
6. `inventory_transactions` に `'shipping'` タイプで記録
7. `shipping_lines.status = 'completed'`
8. `shipping_headers.status = 'shipped'`

### 新純粋関数: `validateManualAllocations`

```typescript
// lib/supabase/queries/allocation.ts
export function validateManualAllocations(
  allocations:    AllocationItem[],
  requestedQty:   number,
  availableLines: InventoryLine[],
): string[]
```

検証内容:
1. `requestedQty >= 1`
2. 各 `allocatedQty >= 1`
3. 各 `allocatedQty <= availableQty`（行単位の超過チェック）
4. 合計 `allocatedQty <= requestedQty`（全体の超過チェック）
5. 存在しない `inventoryId` の参照

---

## ファイル変更一覧

### SQL

| ファイル | 変更内容 |
|--------|---------|
| `supabase/migration_v4.sql` | `shipping_lines.allocated_qty` 追加、`transaction_type` CHECK 拡張 |
| `supabase/rpc_functions.sql` | `rpc_allocate_shipping_inventory` 強化（テナント境界チェック・FIFO strategy・FEFO フィールド追加）、新規 `rpc_confirm_shipping_order` |
| `supabase/schema_current.sql` | 実行順序コメントに migration_v4 / rpc_functions を追記 |

### TypeScript

| ファイル | 変更内容 |
|--------|---------|
| `lib/types/index.ts` | `InventoryTransactionType` に `'allocation'` / `'deallocation'` 追加 |
| `lib/supabase/queries/allocation.ts` | **新規** — 純粋関数・型定義（Supabase 依存なし） |
| `lib/supabase/queries/shippings.ts` | `createShippingOrder` → RPC 化（strategy 対応）、`confirmShippingOrder` → RPC 化（scope 追加）、`validateManualAllocations` re-export |
| `app/(main)/shipping/input/page.tsx` | `handleSubmit` で FIFO 行を `strategy:'fifo', allocations:[]` で送信 |
| `app/(main)/shipping/page.tsx` | `ConfirmShippingModal` に `scope: QueryScope` prop 追加 |

### テスト

| ファイル | 内容 |
|--------|-----|
| `__tests__/lib/shippings.allocation.test.ts` | `computeFifoAllocation` — 10テスト（フェーズ3-3で追加） |
| `__tests__/lib/allocation.validation.test.ts` | `validateManualAllocations` 13テスト + `computeFifoAllocation` 追加エッジケース 5テスト |

---

## `inventory_transactions` 記録設計

フェーズ3完了時点での記録状況:

| transaction_type | 記録タイミング | RPC | note |
|----------------|------------|-----|------|
| `receiving` | 入庫確定 | `rpc_confirm_arrival_receiving` | — |
| `allocation` | 引当作成（FIFO/手動） | `rpc_allocate_shipping_inventory` | `strategy:fifo` / `strategy:manual` |
| `shipping` | 出荷確定 | `rpc_confirm_shipping_order` | — |
| `move` | ロケーション移動 | `rpc_move_inventory` | — |
| `adjust_increase` | 数量増加調整 | `rpc_adjust_inventory` | — |
| `adjust_decrease` | 数量減少調整 | `rpc_adjust_inventory` | — |
| `adjust_set` | 棚卸上書き | `rpc_adjust_inventory` | — |
| `status_change` | ステータス変更 | `rpc_change_inventory_status` | — |
| `deallocation` | 引当解除 | 未実装（フェーズ4で対応） | — |

### 各レコードの共通フィールド

```
tenant_id / warehouse_id   : マルチテナントスコープ
inventory_id               : 対象在庫行（削除時は NULL）
product_id                 : 商品
transaction_type           : 操作種別
qty_delta                  : 変化量（正=増加、負=減少、0=引当）
before/after_on_hand_qty   : 変化前後スナップショット
before/after_allocated_qty : 変化前後スナップショット
received_date / lot_no / expiry_date : FEFO トレーサビリティ
reference_type / reference_id        : 伝票への逆引き
note                       : 補足（引当戦略など）
```

---

## テスト観点まとめ

### 自動テスト（ユニット）

| テストファイル | テスト数 | 対象 |
|-------------|--------|------|
| `shippings.allocation.test.ts` | 10 | `computeFifoAllocation` |
| `allocation.validation.test.ts` | 18 | `validateManualAllocations` / `computeFifoAllocation` 追加エッジケース |
| **合計** | **28** | |

### 手動確認が必要な観点（DB 接続必要）

| 観点 | 検証方法 |
|------|---------|
| `available` 以外のステータスは引当不可 | `status='hold'` の inventory で手動引当を試みる → EXCEPTION |
| `available_qty` 超過引当不可 | 在庫 5 に対して 6 を引当 → EXCEPTION |
| tenant/warehouse 不一致引当不可 | 異なる tenant の inventory_id を指定 → EXCEPTION |
| FIFO 順が `received_date` ベースで守られる | 古い日付の在庫から先に引き当てられることを確認 |
| エラー時に中途半端な更新が残らない | 2行目でエラー発生させ、1行目の変更がロールバックされることを確認 |
| 出荷確定後に transactions が記録される | `inventory_transactions` を SELECT して `'shipping'` レコードを確認 |
| `shipped_qty=0` の明細は在庫変更なし | shipped_qty=0 で確定 → `on_hand_qty` が変化しないことを確認 |

---

## フェーズ4 への申し送り

### 残存する課題

| 項目 | 優先度 | 概要 |
|------|--------|------|
| 引当解除 RPC | 高 | `rpc_deallocate_shipping_line(line_id)` — shipping_allocations 削除 + allocated_qty 解放 + transactions('deallocation') |
| 出庫キャンセル RPC | 高 | `rpc_cancel_shipping_order(header_id)` — 引当解除 + status='cancelled' |
| FEFO 引当 | 中 | `strategy:'fefo'` ブランチを `rpc_allocate_shipping_inventory` に追加。`ORDER BY expiry_date ASC NULLS LAST, received_date ASC` |
| 賞味期限アラート | 中 | `expiry_date <= today + 30days` の在庫を在庫一覧で強調表示 |

### FEFO 拡張の準備状況

フェーズ3完了時点で以下が整備済み:

- `inventory.expiry_date` カラム — スキーマ存在
- `inventory_transactions.expiry_date` — トランザクション記録済み
- `allocation.ts` の `computeFifoAllocation` — strategy 切り替えコメント付き
- `rpc_allocate_shipping_inventory` の `strategy` 分岐 — `'fefo'` ブランチ追加箇所が明確

FEFO 実装時の追加作業:
1. `allocation.ts` に `computeFefoAllocation(lines, qty)` 追加（`expiry_date ASC NULLS LAST, received_date ASC` でソート）
2. `rpc_allocate_shipping_inventory` に `ELSIF v_strategy = 'fefo' THEN` ブランチ追加
3. フロント側の「FEFO ボタン」追加と `strategy:'fefo'` 送信
