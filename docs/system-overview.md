# SimpleWMS システム概要

## 目的

SimpleWMS は **3PL（Third-Party Logistics）向けの倉庫管理システム**。
複数の荷主（テナント）の在庫を、複数の倉庫で独立して管理できる SaaS 型の WMS。

主要業務フロー:
1. **入荷**: 入荷予定を登録し、実際の入庫を確定する
2. **在庫管理**: ロケーション・ロット・ステータス別に在庫を可視化・操作する
3. **出庫**: 出庫指示の登録から引当、ピッキング、検品、出荷確定までを管理する

---

## 技術スタック

| 層 | 技術 |
|----|------|
| フロントエンド | Next.js 15 App Router（`'use client'` コンポーネント） |
| 言語 | TypeScript（型安全を優先、`tsc --noEmit` をCIの基準に） |
| スタイリング | Tailwind CSS v3 |
| バックエンド / DB | Supabase（PostgreSQL + RLS + PostgREST）|
| 認証 | Supabase Auth（現在はダミー認証で運用、将来本格化） |
| RPC | Supabase RPC（排他制御を要する処理は PL/pgSQL 関数に委譲） |
| 国際化 | カスタム i18n（`lib/i18n`、日本語/英語対応） |
| 状態管理 | React `useState` + URL search params（永続化） |

---

## システム全体像

```
┌─────────────────────────────────────────────────────┐
│  Next.js App Router （'use client' ページ群）         │
│                                                     │
│  /arrival      入荷予定一覧 + 登録                   │
│  /receiving    入庫処理（入荷予定 → 在庫）            │
│  /inventory    在庫一覧（移動・調整・ステータス変更）  │
│  /shipping     出庫処理（ピッキング → 検品 → 出荷）   │
│  /shipping/input  出庫指示登録                       │
└───────────────┬─────────────────────────────────────┘
                │  Supabase Client（anon key + RLS）
┌───────────────▼─────────────────────────────────────┐
│  lib/supabase/queries/  （データアクセス層）          │
│  arrivals.ts  inventory.ts  shippings.ts             │
└───────────────┬─────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────┐
│  Supabase / PostgreSQL                               │
│                                                     │
│  テーブル: tenants, warehouses, products, customers  │
│            locations, arrival_headers, arrival_lines │
│            inventory, shipping_headers, shipping_lines│
│            shipping_allocations, inventory_transactions│
│                                                     │
│  RPC: rpc_confirm_arrival_receiving                  │
│       rpc_allocate_shipping_inventory                │
│       rpc_move_inventory                             │
│       rpc_adjust_inventory                           │
│       rpc_change_inventory_status                    │
└─────────────────────────────────────────────────────┘
```

---

## ドメイン構造

### inventory（在庫集約テーブル）

現在庫の「今の状態」を保持する集約テーブル。
行の一意性 = `(tenant_id, warehouse_id, product_id, location_id, status, received_date, COALESCE(lot_no, ''))` — FIFO/FEFO の粒度で管理。

主要カラム: `on_hand_qty`（実在庫）/ `allocated_qty`（引当済）/ `lot_no` / `expiry_date` / `received_date`

### arrival_headers / arrival_lines（入荷）

- **arrival_headers**: 入荷予定のヘッダー（仕入先、入荷予定日、全体ステータス）
- **arrival_lines**: 明細（商品、予定数量、入庫済数量、lot_no、expiry_date）
- ステータス遷移: `pending` → `partial` → `completed` / `cancelled`

### shipping_headers / shipping_lines（出庫）

- **shipping_headers**: 出庫指示のヘッダー（出荷先、出庫予定日、全体ステータス）
- **shipping_lines**: 明細（商品、指示数量、実績数量）
- ステータス遷移: `pending` → `picking` → `inspected` → `shipped` / `cancelled`

### shipping_allocations（引当）

出庫指示に対して「どの在庫行から何個引き当てるか」を記録。
`shipping_lines` と `inventory` の中間テーブル。
登録時に `inventory.allocated_qty` を加算し、出荷確定時に `on_hand_qty` と `allocated_qty` を同時に減算する。

### inventory_transactions（在庫履歴）

在庫数量変動の監査ログ。現在は移動・調整・ステータス変更の際に記録する予定（実装途中）。
`transaction_type` + `reference_id` で操作の種類と参照元を特定できる設計。

---

## マルチテナント構造

### 階層

```
tenants（荷主）
  └─ warehouses（倉庫）
       └─ 全データ（inventory, arrivals, shippings, ...）
```

### スコープ設計

全クエリは `QueryScope = { tenantId: string; warehouseId: string }` を受け取る。
全テーブルの `WHERE` 句に `tenant_id = :tenantId AND warehouse_id = :warehouseId` を必ず付与。

```typescript
export type QueryScope = {
  tenantId:    string
  warehouseId: string
}
```

Supabase RLS でも `tenant_id` / `warehouse_id` によるアクセス制御を重ねる（二重防御）。

### スコープ切り替え

`TenantContext`（`store/TenantContext.tsx`）がアクティブな `scope` を保持。
ヘッダーから荷主・倉庫を切り替えると `scope` が変わり、各ページが自動的に再取得する（`loadXxx` が `scope` を依存関係に持つため）。

---

## UI構造

### 一覧画面（list view）

各業務ページのメイン表示。フラットなテーブル or カードリスト。
フィルタ / 検索 / ページネーション（inventory）を URL search params で管理し、リロード・バック時に復元できる。

### 詳細（ドリルダウン）

一覧行クリックで詳細モーダルを開く。別ページへ遷移させない。
出庫指示の明細は遅延ロード（行クリック時に `fetchShippingOrderLines` を呼ぶ）。

### モーダル操作

状態遷移・数量入力などの業務操作はすべてモーダル内で完結させる。
完了後は一覧データをバックグラウンドで再取得（ローディング表示を最小化）。

---

## ファイル構造（主要部分）

```
app/(main)/
  arrival/page.tsx      入荷予定一覧
  receiving/page.tsx    入庫処理
  inventory/page.tsx    在庫一覧
  shipping/page.tsx     出庫処理
  shipping/input/page.tsx  出庫指示登録

components/ui/
  StatusBadge.tsx   ステータスバッジ（共通）
  PageShell.tsx     ページ loading/error ラッパー
  EmptyState.tsx    空状態プレースホルダー
  Modal.tsx         モーダルコンテナ
  SearchInput.tsx   検索入力
  ScopeRequired.tsx スコープ未選択プレースホルダー

lib/
  types/index.ts        アプリ共通型定義
  i18n/                 日本語/英語翻訳辞書
  supabase/
    client.ts           Supabase クライアント
    queries/
      arrivals.ts       入荷クエリ
      inventory.ts      在庫クエリ
      receiving.ts      入庫クエリ（RPC呼び出し）
      shippings.ts      出庫クエリ

supabase/
  migration_v3.sql      lot_no/expiry_date追加・UNIQUE制約修正
  rpc_functions.sql     PL/pgSQL RPC 関数定義

store/
  TenantContext.tsx     テナント・倉庫スコープのグローバル状態
```
