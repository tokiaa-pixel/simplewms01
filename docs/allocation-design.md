# 引当設計ドキュメント

## 概要

SimpleWMS の引当（Allocation）は「在庫を特定の出庫指示に予約する操作」を指す。  
引当・引当解除・再引当の3つの操作が1サイクルを構成する。

---

## 1. 引当（Allocation）

### 1-1. 定義

在庫の `allocated_qty` を増やし、`available_qty`（= `on_hand_qty - allocated_qty`）を減らすことで、  
その在庫を特定の出庫指示向けに「論理的に確保」する操作。

`on_hand_qty` は変化しない。物理的な在庫移動は出荷確定時に発生する。

### 1-2. 引当戦略

| 戦略 | strategy 値 | ロジック |
|------|------------|---------|
| FIFO 自動引当 | `'fifo'` | `received_date ASC NULLS LAST` 順でサーバーが自動選択 |
| 手動引当 | `'manual'` | フロントエンドで選択した在庫行を使用 |
| FEFO（将来） | `'fefo'` | `expiry_date ASC NULLS LAST, received_date ASC` 順（未実装） |

FIFO / manual の選択は出庫指示登録画面（`/shipping/input`）で行単位に決定する。

### 1-3. 実行ポイント

- **RPC**: `rpc_allocate_shipping_inventory`
- **呼び出し元**: `lib/supabase/queries/shippings.ts` → `createShippingOrder()`
- **タイミング**: 出庫指示登録時（`shipping_headers.status = 'pending'` で作成される）

### 1-4. 更新対象

```
shipping_headers   → INSERT (status='pending')
shipping_lines     → INSERT (allocated_qty は引当合計で設定)
shipping_allocations → INSERT (line_id, inventory_id, allocated_qty)
inventory          → UPDATE allocated_qty += qty
inventory_transactions → INSERT (type='allocation', note='strategy:fifo|manual')
```

### 1-5. 制約

- `status = 'available'` の在庫のみ FIFO の対象。手動引当は全ステータス選択可だが RPC で `available` 限定にしている。
- `available_qty = on_hand_qty - allocated_qty > 0` の行のみ対象
- テナント / 倉庫スコープチェック（他テナントへの誤引当を防止）
- FOR UPDATE による行ロックで TOCTOU 競合を防止

---

## 2. 引当解除（Deallocation）

### 2-1. 定義

`shipping_allocations` を削除し、`inventory.allocated_qty` を元に戻す操作。  
`on_hand_qty` は変化しない。

### 2-2. 実行ポイント

- **RPC**: `rpc_deallocate_shipping_inventory`
- **呼び出し元**: `lib/supabase/queries/shippings.ts` → `deallocateShippingInventory()`
- **UI 起動元**: PickingModal（pending）の引当行 `Trash2` ボタン / InspectionModal（picking）の明細行 `Trash2` ボタン

### 2-3. 解除粒度

| パラメータ | 粒度 | 用途 |
|-----------|------|------|
| `p_allocation_id` 指定 | 1 allocation 行のみ | 特定棚の引当だけ差し替えたい場合 |
| `p_allocation_id = NULL` | `p_line_id` の全行 | 明細全体を再引当したい場合 |

### 2-4. 更新対象

```
shipping_allocations → DELETE
inventory            → UPDATE allocated_qty -= qty
shipping_lines       → UPDATE allocated_qty -= qty (GREATEST(0,...) でガード)
inventory_transactions → INSERT (type='deallocation')
```

### 2-5. 制約

- `status ∈ {pending, picking}` のみ解除可（RPC でサーバー側チェック必須）
- UI のボタン表示も `isDeallocationAllowed(status)` で制御するが、**最終的な判定は RPC のみ権威**
- `inventory.allocated_qty < dealloc_qty` の場合は EXCEPTION（整合性保護）
- FOR UPDATE によるヘッダー・在庫行のロックで並行変更を防止

---

## 3. 再引当（Re-allocation）

### 3-1. 定義

引当解除の後に再度引当を行うことで、引当先在庫を変更する操作。  
現時点では UI 上で「解除 → 再登録」の2ステップで実現する（原子的な差し替え RPC は未実装）。

### 3-2. フロー

```
1. 解除: deallocateShippingInventory({ headerId, lineId, allocationId, scope })
   └→ shipping_allocations 削除 + inventory.allocated_qty 減算

2. 再引当: ※出庫指示の再登録 or 引当追加 RPC（将来実装）
   └→ 現状は出庫指示を一度キャンセルして再作成するワークアラウンドが必要
```

### 3-3. 注意事項

- 解除と再引当の間に他トランザクションが同じ在庫を確保する可能性がある（非原子）
- 再引当 UI（引当追加 RPC）は Phase 4 以降の実装対象

---

## 4. ステータス制御ルール

### 4-1. 出庫指示ステータス遷移

```
pending ──[ピッキング開始]──> picking ──[検品完了]──> inspected ──[出荷確定]──> shipped
   │                              │
   └──[引当解除]──> pending       └──[引当解除]──> picking
                  （再引当可）             （再引当可）
```

※ cancelled は手動キャンセル操作（未実装）で遷移する。

### 4-2. ステータスごとの引当・解除・出荷可否

| status | 引当 | 解除 | ピッキング開始 | 検品完了 | 出荷確定 |
|--------|------|------|--------------|---------|---------|
| `pending` | ✅（登録時のみ） | ✅ | ✅ | — | — |
| `picking` | — | ✅ | — | ✅ | — |
| `inspected` | — | ❌ | — | — | ✅ |
| `shipped` | — | ❌ | — | — | — |
| `cancelled` | — | ❌ | — | — | — |

### 4-3. サーバー側チェックの実装場所

| チェック | 実装場所 |
|---------|---------|
| 解除可能ステータス | `rpc_deallocate_shipping_inventory` の Step 1 |
| テナント / 倉庫スコープ | 各 RPC の WHERE 句 + EXCEPTION |
| `allocated_qty` 下限 | `rpc_deallocate_shipping_inventory` の v_inv.allocated_qty チェック |
| 引当対象ステータス（available のみ） | `rpc_allocate_shipping_inventory` の ④ |
| 出荷確定対象ステータス（inspected のみ） | `rpc_confirm_shipping_order` の Step 1 |

### 4-4. クライアント側チェック（補助的）

```typescript
// lib/supabase/queries/allocation.ts
export function isDeallocationAllowed(status: string): boolean
// → UI ボタン表示の ON/OFF に使用。最終的な権限確認は RPC が行う。
```

---

## 5. inventory_transactions への記録

引当・解除・出荷の全操作は `inventory_transactions` テーブルに記録される。

| 操作 | transaction_type | qty_delta | 備考 |
|------|-----------------|-----------|------|
| 引当（FIFO） | `allocation` | 0 | `note = 'strategy:fifo'` |
| 引当（手動） | `allocation` | 0 | `note = 'strategy:manual'` |
| 引当解除 | `deallocation` | 0 | `reference_type = 'shipping_line'` |
| 出荷確定 | `shipping` | `-shipped_qty` | `on_hand_qty` が減少 |

`before/after_allocated_qty` により引当数の変化が追跡可能。  
`received_date, lot_no, expiry_date` がスナップショットとして保存される（FEFO トレーサビリティ）。

---

## 6. ファイル構成

```
lib/supabase/queries/
  allocation.ts         純粋関数・型定義（Supabase 依存なし・単体テスト可能）
  shippings.ts          RPC wrapper・DB クエリ（allocation.ts を re-export）

supabase/
  rpc_functions.sql     rpc_allocate_shipping_inventory
                        rpc_deallocate_shipping_inventory
                        rpc_confirm_shipping_order
  schema_current.sql    テーブル定義・制約

__tests__/lib/
  shippings.allocation.test.ts   computeFifoAllocation 単体テスト
  allocation.validation.test.ts  validateManualAllocations 単体テスト
  deallocation.test.ts           isDeallocationAllowed + RPC 手動テスト観点

app/(main)/shipping/
  page.tsx              出庫指示一覧・PickingModal・InspectionModal（解除ボタン含む）
  input/page.tsx        出庫指示登録・引当入力
```
