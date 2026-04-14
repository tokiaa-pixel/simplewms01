# 再引当設計ドキュメント

## 1. 再引当の目的

出庫指示登録後に引当先在庫を変更する操作。  
登録時に FIFO 引当した在庫を「別の棚のロット」に差し替えたい場合などに使用する。

---

## 2. 引当 / 引当解除 / 再引当の関係

```
引当（Allocation）
  └→ inventory.allocated_qty 増加（on_hand_qty は不変）
     shipping_allocations INSERT

引当解除（Deallocation）
  └→ inventory.allocated_qty 減少（on_hand_qty は不変）
     shipping_allocations DELETE

再引当（Re-allocation）
  └→ 解除 → 引当 を単一トランザクション内で原子実行
     inventory.allocated_qty: 旧在庫 - qty → 新在庫 + qty（正味の変化は引当先の差し替え）
     shipping_allocations: 旧行 DELETE → 新行 INSERT
```

再引当は「解除と引当をアトミックに行う操作」であり、  
解除後・引当前の「在庫が誰にも予約されていない瞬間」が存在しない。

---

## 3. ステータス制御

### 3-1. 再引当可否の判定軸

引当 / 引当解除 / 再引当のすべてのステータス制御は `shipping_headers.status` で行う。  
`shipping_lines.status` には `picking` 状態がなく、line 単体では現場の作業状態を判定できない。

### 3-2. 可否テーブル

| status | 引当 | 引当解除 | 再引当 | 備考 |
|--------|------|---------|--------|------|
| `pending` | ✅（登録時のみ） | ✅ | ✅ | 作業前のため変更可 |
| `picking` | — | ✅ | ❌ | 現場が出庫済みの可能性あり |
| `inspected` | — | ❌ | ❌ | 検品完了。物理配置確定 |
| `shipped` | — | ❌ | ❌ | on_hand_qty 減算済み |
| `cancelled` | — | ❌ | ❌ | 操作対象外 |

### 3-3. pending のみ再引当可能とした理由

`picking` で再引当を許可しない理由は以下の通り。

1. **現場作業との乖離リスク**  
   ピッキング担当者が棚 A から商品を取り出している最中に再引当が実行されると、  
   システム上は棚 B から取り出すことになっているが現物は棚 A から出ている状態になる。

2. **引当先変更の安全なタイミング**  
   `picking` 以降の在庫変更は `inspected` 後の `rpc_confirm_shipping_order` で処理する。  
   再引当が必要になった場合は「引当解除 → pending に戻す → 再登録」のフローを推奨する。

3. **シンプルなルール維持**  
   「未処理のみ変更可」という単純なルールにより、担当者が状態を誤解するリスクを下げる。

### 3-4. サーバー側チェックの実装場所

| チェック | 実装場所 |
|---------|---------|
| 再引当可能ステータス（pending のみ） | `rpc_reallocate_shipping_line` Step 1 |
| テナント / 倉庫スコープ | `rpc_reallocate_shipping_line` Step 1（ヘッダー検索条件）|
| 在庫不足 | `rpc_reallocate_shipping_line` Step 4後の残数チェック |
| allocated_qty 下限 | `rpc_reallocate_shipping_line` Step 3（解除ループ内） |

### 3-5. クライアント側チェック（補助的）

```typescript
// lib/supabase/queries/allocation.ts
export function isReallocationAllowed(status: string): boolean
// → pending のときのみ再引当ボタンを表示する
// 最終的な権限確認は RPC が行う
```

---

## 4. トランザクション設計

### 4-1. 単一トランザクション保証

`rpc_reallocate_shipping_line` は plpgsql の暗黙トランザクション内で実行される。  
`RAISE EXCEPTION` が発生した時点でその時点までの全操作が ROLLBACK される。

```
BEGIN（暗黙）
  Step 1: shipping_headers SELECT FOR UPDATE → pending チェック
  Step 2: shipping_lines   SELECT FOR UPDATE → product_id / requested_qty 取得
  Step 3: 旧引当の全解除（ループ）
            inventory.allocated_qty 減算
            inventory_transactions INSERT (type='deallocation')
            shipping_lines.allocated_qty 減算
            shipping_allocations DELETE
  Step 4: FIFO 新規引当（ループ）
            inventory.allocated_qty 加算
            inventory_transactions INSERT (type='allocation')
            shipping_allocations INSERT
          在庫不足時 → RAISE EXCEPTION → 全体 ROLLBACK
  Step 5: shipping_lines.allocated_qty を新合計で更新
COMMIT（暗黙）
```

### 4-2. ロック順序と deadlock 防止

```sql
-- Step 3: 解除ループ
FOR v_alloc IN
  SELECT ... FROM shipping_allocations
  WHERE line_id = p_line_id
  ORDER BY id ASC  ← ロック順を固定
LOOP
  SELECT ... FROM inventory WHERE id = v_alloc.inventory_id FOR UPDATE;
  ...

-- Step 4: FIFO 引当ループ
FOR v_fifo_inv IN
  SELECT ... FROM inventory
  ORDER BY received_date ASC NULLS LAST, id ASC  ← ロック順を固定
  FOR UPDATE
LOOP
  ...
```

`id ASC` でロック順を固定することで、複数トランザクションの競合時の deadlock を防止する。

### 4-3. 在庫不足時の安全な処理

在庫不足が検知された場合、`RAISE EXCEPTION` でトランザクション全体を ROLLBACK する。  
**旧引当が削除された状態でコミットされることはない**（部分引当後コミットは禁止）。

```sql
IF v_remaining > 0 THEN
  RAISE EXCEPTION '在庫不足のため再引当できません（不足数: %、商品ID: %）',
    v_remaining, v_product_id;
END IF;
```

呼び出し元 (`reallocateShippingLine`) は `data.error` を確認し、  
エラー時はユーザーに不足数を含むメッセージを表示する。

---

## 5. 更新対象一覧

| テーブル | 操作 | 内容 |
|---------|------|------|
| `shipping_headers` | SELECT FOR UPDATE | ステータスチェック・ロック |
| `shipping_lines` | SELECT FOR UPDATE → UPDATE | `allocated_qty` を新合計に更新 |
| `shipping_allocations` | DELETE → INSERT | 旧行削除 → 新行挿入 |
| `inventory` | UPDATE × 2（旧 + 新） | 旧在庫: `allocated_qty -= qty`、新在庫: `allocated_qty += qty` |
| `inventory_transactions` | INSERT × N（dealloc）+ M（alloc） | 旧引当数分の `deallocation` + 新引当数分の `allocation` |

---

## 6. inventory_transactions への記録

| フェーズ | transaction_type | qty / qty_delta | note |
|---------|-----------------|-----------------|------|
| 解除フェーズ | `deallocation` | 0 | `'strategy:reallocate-fifo'` |
| 引当フェーズ | `allocation` | 0 | `'strategy:reallocate-fifo'` |

`before/after_allocated_qty` により引当数の変化がトレース可能。  
`received_date / lot_no / expiry_date` がスナップショットとして記録される（FEFO トレーサビリティ準備）。

---

## 7. ファイル構成

```
lib/supabase/queries/
  allocation.ts           REALLOC_ELIGIBLE_STATUSES, isReallocationAllowed（純粋関数）
  shippings.ts            reallocateShippingLine（RPC wrapper）

supabase/
  rpc_functions.sql       rpc_reallocate_shipping_line

app/(main)/shipping/
  page.tsx                PickingModal に再引当ボタン（pending のみ表示）

__tests__/lib/
  reallocation.test.ts    isReallocationAllowed 単体テスト + RPC 手動テスト観点

docs/
  reallocation-design.md  本ドキュメント
  allocation-design.md    引当・解除の設計（再引当との関係を記載）
```

---

## 8. FEFO 拡張余地

現在の再引当は FIFO のみ対応。FEFO への拡張は以下の手順で追加できる。

### 8-1. RPC の拡張方針

```sql
-- 現在: rpc_reallocate_shipping_line は FIFO 固定
-- 拡張案: strategy パラメータを追加

CREATE OR REPLACE FUNCTION rpc_reallocate_shipping_line(
  p_header_id    uuid,
  p_tenant_id    uuid,
  p_warehouse_id uuid,
  p_line_id      uuid,
  p_strategy     text DEFAULT 'fifo'  -- 追加: 'fifo' | 'fefo'
)
```

FEFO 引当ループの `ORDER BY` を以下に変更する。

```sql
-- FIFO
ORDER BY received_date ASC NULLS LAST, id ASC

-- FEFO（products.use_fefo = true の場合に選択）
ORDER BY
  CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
  expiry_date ASC,
  received_date ASC,
  id ASC
```

### 8-2. フロント側の拡張

```typescript
// 将来: strategy パラメータを追加
export async function reallocateShippingLine(params: {
  headerId: string
  lineId:   string
  strategy: 'fifo' | 'fefo'  // 追加
  scope:    QueryScope
})
```

### 8-3. FEFO 実装の前提条件

- `products.use_fefo boolean DEFAULT false` フラグの追加（フェーズ4-A）
- `inventory.expiry_date` の運用（入庫時に確実に設定されていること）
- `REALLOC_ELIGIBLE_STATUSES` の変更不要（ステータス制御は FIFO と同じ）

---

## 9. 既知の制限と今後の対応

| 制限 | 対応フェーズ |
|------|------------|
| 手動再引当（在庫指定）未実装 | フェーズ4以降 |
| order 単位一括再引当未実装 | フェーズ4以降 |
| FEFO 再引当未実装 | フェーズ4-A と同時 |
| picking 以降の再引当不可（運用ワークアラウンド：解除→再登録） | 現状維持 |
