# フェーズ1 ドメイン設計

## フェーズ1の目的

フェーズ1は「設計安定化」フェーズ。  
入出荷・在庫・引当の中核となるデータモデルを確定し、後続フェーズの実装基盤を整える。

主な成果物:
- `lot_no` / `expiry_date` カラム追加と NULL-safe UNIQUE 制約の設計
- 在庫粒度（FIFO/FEFO の最小管理単位）の確定
- 引当テーブル（`shipping_allocations`）の設計
- 在庫トランザクション履歴（`inventory_transactions`）の設計方針
- マルチテナント QueryScope の型定義

---

## 在庫設計（inventory テーブル）

### テーブル定義（主要カラム）

| カラム | 型 | 説明 |
|---|---|---|
| `id` | uuid | PK |
| `tenant_id` | uuid | FK → tenants |
| `warehouse_id` | uuid | FK → warehouses |
| `product_id` | uuid | FK → products |
| `location_id` | uuid | FK → locations |
| `status` | text | `available` / `hold` / `damaged` |
| `lot_no` | text \| NULL | ロット番号（NULL = ロット管理なし） |
| `expiry_date` | date \| NULL | 賞味期限（FEFO に使用） |
| `received_date` | date | 入庫日（FIFO に使用） |
| `on_hand_qty` | integer | 実在庫数量 |
| `allocated_qty` | integer | 引当済数量（0 以上） |

### 在庫行の一意性（UNIQUE 制約）

```sql
CREATE UNIQUE INDEX uq_inventory_grain ON inventory (
  tenant_id,
  warehouse_id,
  product_id,
  location_id,
  status,
  received_date,
  COALESCE(lot_no, '')
);
```

**設計判断**: PostgreSQL の `CONSTRAINT UNIQUE` は `NULL ≠ NULL` 扱いのため、`lot_no IS NULL` の行が複数作られてしまう。`COALESCE(lot_no, '')` で NULL を空文字に正規化した関数インデックスにより、NULL-safe な一意性を保証。

### 在庫数量設計

```
on_hand_qty    実際に棚にある数量
allocated_qty  出庫指示に引き当てられた数量（まだ出荷していない）
available_qty  = on_hand_qty - allocated_qty（計算値、カラムなし）
```

- `allocated_qty` は `shipping_allocations` 登録時に加算、出荷確定時に `on_hand_qty` と同時減算
- `CHECK (allocated_qty >= 0 AND allocated_qty <= on_hand_qty)` 制約（NOT VALID で既存行は除外）

---

## 入出荷設計

### arrival_headers / arrival_lines（入荷予定）

```
arrival_headers
  id, tenant_id, warehouse_id
  supplier_id          仕入先
  scheduled_date       入荷予定日
  status               pending → partial → completed / cancelled

arrival_lines
  id, arrival_header_id
  product_id
  lot_no, expiry_date  フェーズ1で追加
  ordered_qty          予定数量
  received_qty         入庫済数量（初期値 0）
  status               pending → partial → completed / cancelled
```

ステータス遷移:
- `pending` → 入庫操作開始で `partial`（一部入庫）
- `partial` → 全数入庫で `completed`
- 任意タイミングで `cancelled`（未入庫分を破棄）

ヘッダーステータスは明細の集計で自動更新（RPC 内で処理）。

### shipping_headers / shipping_lines（出庫指示）

```
shipping_headers
  id, tenant_id, warehouse_id
  customer_id          出荷先
  scheduled_date       出庫予定日
  status               pending → picking → inspected → shipped / cancelled

shipping_lines
  id, shipping_header_id
  product_id
  ordered_qty          指示数量
  actual_qty           実績数量（初期値 0）
```

ステータス遷移:
- `pending` → 引当実行で `picking`
- `picking` → 検品完了で `inspected`
- `inspected` → 出荷確定で `shipped`

---

## 引当設計（shipping_allocations）

### テーブル定義

```
shipping_allocations
  id
  shipping_line_id     FK → shipping_lines
  inventory_id         FK → inventory
  allocated_qty        引き当てた数量
  location_code        ロケーションコード（ピッキング指示用）
```

### 引当の役割

`shipping_lines`（何を何個出す）と `inventory`（どの在庫行から）の対応を記録する中間テーブル。  
1 つの出庫明細に対して複数の在庫行から引き当てる場合（複数ロケーション・複数ロット）に自然に対応できる。

### 引当フロー

```
1. rpc_allocate_shipping_inventory 呼び出し
   ├─ FIFO/FEFO 順で inventory 行を選択
   ├─ shipping_allocations に INSERT
   └─ inventory.allocated_qty += allocated_qty

2. 出荷確定（rpc_confirm_shipping など）
   ├─ inventory.on_hand_qty -= allocated_qty
   ├─ inventory.allocated_qty -= allocated_qty
   └─ shipping_allocations のレコードは保持（履歴）
```

### FIFO/FEFO インデックス

```sql
-- FIFO: received_date 昇順
CREATE INDEX idx_inventory_fifo ON inventory (
  tenant_id, warehouse_id, product_id, status, received_date
) WHERE on_hand_qty > allocated_qty;

-- FEFO: expiry_date 昇順（NULL最後）
CREATE INDEX idx_inventory_fefo ON inventory (
  tenant_id, warehouse_id, product_id, status, expiry_date NULLS LAST, received_date
) WHERE on_hand_qty > allocated_qty;
```

部分インデックス（`WHERE on_hand_qty > allocated_qty`）により、利用可能在庫のみをスキャン対象にする。

---

## 在庫トランザクション履歴（inventory_transactions）

### 設計方針

在庫数量が変動するすべての操作を監査ログとして記録する。現在は設計確定済みで実装途中。

```
inventory_transactions
  id
  tenant_id, warehouse_id
  inventory_id         対象在庫行（NULL 可：削除済み行への参照用に）
  transaction_type     操作種別（下記）
  reference_id         参照元 ID（入庫ID・出庫IDなど）
  qty_delta            数量変化（正=増加, 負=減少）
  before_qty           操作前 on_hand_qty
  after_qty            操作後 on_hand_qty
  created_at
  created_by           操作者
```

`transaction_type` 値:
- `arrival_receiving` — 入庫確定
- `shipping_dispatch` — 出荷確定
- `inventory_move` — ロケーション移動
- `inventory_adjust` — 数量調整
- `status_change` — ステータス変更

---

## マルチテナント設計

### QueryScope 型

```typescript
export type QueryScope = {
  tenantId:    string
  warehouseId: string
}
```

全クエリ関数の第一引数として受け取り、必ず `WHERE tenant_id = ? AND warehouse_id = ?` を付与。  
アプリ層での制御に加え、Supabase RLS でも同条件でアクセス制御（二重防御）。

### スコープ切り替え

`TenantContext`（`store/TenantContext.tsx`）がアクティブな scope を保持。  
ヘッダーのセレクターで荷主・倉庫を切り替えると scope が変わり、各ページの `loadXxx` がそれを依存関係に持つため自動再取得される。

---

## フェーズ1での重要な設計判断

### 1. lot_no の NULL 許容

**判断**: `lot_no` は `NOT NULL` にしない。ロット管理が不要な商品は NULL。  
**理由**: 現実の倉庫では商品によってロット管理有無が混在する。`NOT NULL DEFAULT ''` にすると「空文字ロット」という意味不明な値が生まれる。  
**トレードオフ**: UNIQUE 制約に `COALESCE` が必要になる複雑さを受け入れた。

### 2. available_qty を計算カラムにしない

**判断**: `available_qty` = `on_hand_qty - allocated_qty` はカラムに持たず、アプリ層で計算。  
**理由**: `allocated_qty` と同時に更新する必要があるため、Generated Column にすると柔軟性が下がる。RPC で `on_hand_qty` と `allocated_qty` を同時に更新する操作が基本単位のため、計算式は常に整合する。

### 3. shipping_allocations を独立テーブルにする

**判断**: 引当情報を `shipping_lines` の配列カラムではなく、正規化された独立テーブルにする。  
**理由**: 1 出庫明細に対して複数ロケーション・複数ロットから引き当てる FIFO/FEFO 対応が必要。配列カラムでは `inventory.allocated_qty` との整合維持が困難で、RPC での排他制御も複雑化する。

### 4. RPC による排他制御

**判断**: 引当・入庫確定・移動・調整はすべて PL/pgSQL RPC 関数に委譲。  
**理由**: 在庫数量の増減は複数テーブルにまたがる複合更新（inventory + allocations + transactions）。アプリ層でトランザクション管理をするよりも、DB 側の RPC に閉じ込める方が排他制御・整合性・エラーハンドリングが明確。

---

## 残課題

| 課題 | 優先度 | 備考 |
|---|---|---|
| `inventory_transactions` 記録の実装 | 中 | RPC 内でのトリガー or 明示的 INSERT |
| `rpc_allocate_shipping_inventory` の FEFO 対応 | 高 | `expiry_date IS NOT NULL` の場合は FEFO を優先 |
| `allocated_qty` CHECK 制約の有効化 | 低 | 現在 `NOT VALID`。既存データ検証後に `VALIDATE CONSTRAINT` |
| 引当解除（deallocation）RPC | 中 | キャンセル時・引当変更時に必要 |
| 在庫マイナス防止のロック設計 | 高 | `SELECT ... FOR UPDATE` の適切な粒度設計 |
