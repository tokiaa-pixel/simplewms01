# 出荷キャンセル設計

## 1. 目的

出庫指示（`shipping_headers`）を `cancelled` 状態に変更し、引き当て済みの在庫を解放する。  
対象は **未出荷の指示すべて**（`pending` / `picking` / `inspected`）。  
`shipped` 済みは取り消し不可（`on_hand_qty` が既に減算済みのため）。

---

## 2. 引当解除（dealloc）との違い

| 観点 | 引当解除（dealloc） | 出荷キャンセル（cancel） |
|---|---|---|
| 操作単位 | 1 allocation または 1 line | ヘッダー全体 |
| 対象ステータス | `pending` / `picking` | `pending` / `picking` / `inspected` |
| ヘッダーのステータス変更 | なし | `cancelled` に変更 |
| line のステータス変更 | なし | 全 line を `cancelled` に変更 |
| 冪等性 | なし（再実行でエラー） | `cancelled` 済みは即 `{ error: null }` |
| RPC | `rpc_deallocate_shipping_inventory` | `rpc_cancel_shipping_order` |

キャンセルは「引当解除」の上位操作。`inspected` のみキャンセルに固有（dealloc 不可）。

---

## 3. ステータス制御ルール

```
pending   → cancelled  ✅ 可
picking   → cancelled  ✅ 可（現場作業が中断されることをユーザーに警告）
inspected → cancelled  ✅ 可（on_hand_qty は未変更のため安全）
shipped   → cancelled  ❌ 不可（on_hand_qty 減算済み。返品入庫で対処）
cancelled → cancelled  ✅ 冪等（RPC は何もせず success を返す）
```

UI のボタン表示制御は `isCancellationAllowed(status)` で判断。  
最終チェックは必ず RPC（サーバー側）が行う。

### ステータス操作可否マトリクス

| ステータス | cancel | dealloc | realloc |
|---|---|---|---|
| `pending` | ✅ | ✅ | ✅ |
| `picking` | ✅ | ✅ | ❌ |
| `inspected` | ✅ | ❌ | ❌ |
| `shipped` | ❌ | ❌ | ❌ |
| `cancelled` | ❌ | ❌ | ❌ |

---

## 4. 更新対象（1トランザクション）

`rpc_cancel_shipping_order` は以下を単一トランザクションで実行する。

```
shipping_headers.status              → 'cancelled'
shipping_lines.status                → 'cancelled'（全明細）
shipping_lines.allocated_qty         → 0（全明細）
inventory.allocated_qty              -= allocated_qty（allocation ごと）
shipping_allocations                 → 削除（全行）
inventory_transactions               → INSERT（deallocation、1 allocation につき 1 行）
```

`inventory.on_hand_qty` は **変化しない**（物品は倉庫に留まっている）。

---

## 5. transaction 設計（inventory_transactions レコード）

キャンセル時に `shipping_allocations` の各行につき 1 件 INSERT される。

| カラム | 値 |
|---|---|
| `transaction_type` | `'deallocation'` |
| `reference_type` | `'shipping_line'` |
| `reference_id` | `shipping_lines.id` |
| `qty` | `0`（on_hand_qty の変化なし） |
| `qty_delta` | `0` |
| `before_on_hand_qty` | `inventory.on_hand_qty`（変化前） |
| `after_on_hand_qty` | 同上（変化なし） |
| `before_allocated_qty` | `inventory.allocated_qty`（解除前） |
| `after_allocated_qty` | `inventory.allocated_qty - v_qty` |
| `note` | `'reason:cancel'` または `'reason:cancel:<p_reason>'` |

---

## 6. 排他制御・ROLLBACK

- `shipping_headers` を `SELECT ... FOR UPDATE` で先にロック
- `shipping_lines` を `ORDER BY id ASC` + `FOR UPDATE` でロック（デッドロック防止）
- `inventory` を `ORDER BY id ASC` + `FOR UPDATE` でロック
- `RAISE EXCEPTION` 発生時は全変更が自動 ROLLBACK（plpgsql の暗黙トランザクション）
- RPC 本体の `EXCEPTION WHEN others THEN` で外部エラーも JSON でラップ返却

---

## 7. RPC シグネチャ

```sql
rpc_cancel_shipping_order(
  p_header_id    uuid,
  p_tenant_id    uuid,
  p_warehouse_id uuid,
  p_reason       text DEFAULT NULL   -- キャンセル理由（note に付与）
) RETURNS json
```

戻り値: `{ "error": null }` または `{ "error": "<メッセージ>" }`

---

## 8. TypeScript インターフェース

```typescript
// lib/supabase/queries/allocation.ts
export const CANCEL_ELIGIBLE_STATUSES: ShippingStatus[] = ['pending', 'picking', 'inspected']
export function isCancellationAllowed(status: string): boolean

// lib/supabase/queries/shippings.ts
export async function cancelShippingOrder(params: {
  headerId: string
  reason?: string
  scope: QueryScope
}): Promise<{ error: string | null }>
```

---

## 9. UI 実装

- **キャンセルボタン:** `isCancellationAllowed(order.status)` が `true` のときのみ表示（`XCircle` アイコン）
- **`CancelModal`:** 確認モーダル。`picking` / `inspected` の場合は「現場作業が中断されます」警告を表示
- **成功後:** `order.status` をローカルステートで `'cancelled'` に更新（再フェッチなし）
- **ボタン配置:** デスクトップ: アクション列。モバイル: カード右上

---

## 10. 今後の拡張

### 10-A: line 単位キャンセル

現状は header 全体のキャンセルのみ。将来的に特定明細のみキャンセルする場合は  
`rpc_cancel_shipping_line(p_line_id uuid, ...)` を別途実装する。  
ヘッダーの部分キャンセル状態（`partial_cancel`）をどう扱うかを先に設計すること。

### 10-B: 返品・逆入庫

`shipped` 済み指示のキャンセルは「返品入庫」として別フローで対応する。  
`inventory_transactions.transaction_type = 'return'` を追加し、`on_hand_qty` を増算。

### 10-C: キャンセル理由の分類

現状は自由テキスト（`p_reason`）。将来的にプルダウン選択（顧客都合 / 在庫不足 / 入力ミスなど）  
に変更し、`inventory_transactions.note` を `reason:cancel:<category>:<free_text>` に正規化することを検討。
