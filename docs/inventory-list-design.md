# 在庫一覧画面 設計ドキュメント

## 概要

`app/(main)/inventory/page.tsx` は SimpleWMS の中核となる画面。  
ロケーション・ロット・ステータス別の在庫を一覧表示し、移動・調整・ステータス変更を操作できる。

---

## フラットリスト採用の理由

### 採用しなかった設計: 商品グルーピング表示

```
▼ 商品A（合計: 100個）
    棚A-01 / ロット001 / 2025-12-31 / 50個
    棚B-02 / ロット002 / 2026-06-30 / 50個
▶ 商品B（合計: 200個）
```

このツリー表示は見た目はわかりやすいが、以下の問題がある:
- フィルタ・検索との相性が悪い（グループ展開状態の管理が複雑）
- ロットや棚を起点に操作したいユースケースに対応しにくい
- ページネーションが「商品数」か「在庫行数」かが曖昧になる

### 採用した設計: フラットリスト

在庫の管理単位（= `tenant_id, warehouse_id, product_id, location_id, status, received_date, lot_no`）を1行として表示。

```
商品コード  商品名  ロケ  ステータス  ロットNo  賞味期限  入庫日   実在庫  引当  有効在庫
P001       商品A   A-01  有効        L001      2025/12   2024/01   50      10     40
P001       商品A   B-02  有効        L002      2026/06   2024/03   50       0     50
P002       商品B   A-03  保留        —         —         2024/02  200       0    200
```

**メリット**:
- FIFO/FEFO の粒度がそのままテーブル行になる → 引当操作との対応が直感的
- 行クリックで操作モーダルを開く UX と自然に対応
- フィルタ・検索・ソートが行単位で機能する

---

## フィルタ設計

### ステータスフィルタ

```typescript
const INVENTORY_FILTER_VALUES = ['all', 'available', 'hold', 'damaged'] as const
type InventoryFilterValue = typeof INVENTORY_FILTER_VALUES[number]
```

タブ形式で表示（ボタングループ）。デフォルトは `'all'`。

### テキスト検索

検索対象カラム:
- `productCode` — 商品コード
- `productName` — 商品名
- `locationCode` — ロケーションコード
- `lotNo` — ロットNo

```tsx
const filtered = useMemo(() =>
  inventory
    .filter(item => statusFilter === 'all' || item.status === statusFilter)
    .filter(item => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        item.productCode.toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q) ||
        item.locationCode.toLowerCase().includes(q) ||
        (item.lotNo ?? '').toLowerCase().includes(q)
      )
    }),
  [inventory, statusFilter, search]
)
```

### フィルタリセット

フィルタ解除ボタン（EmptyState の action または明示的なリセットリンク）で:
1. `setSearch('')`
2. `setStatusFilter('all')`
3. `pushParams('', 'all', 1, pageSize)` で URL もリセット

---

## ページネーション設計

### クライアントサイド実装の根拠

```
サーバーサイド（Supabase .range(from, to)）
  メリット: 大量データでもネットワーク転送量が少ない
  デメリット:
    - フィルタ変更のたびに往復が発生（UX 遅延）
    - フィルタ結果の全件数を別クエリで取得する必要がある
    - フィルタと組み合わせた実装が複雑になる

クライアントサイド（filtered.slice(start, end)）
  メリット: フィルタ変更が即時反映、実装がシンプル
  デメリット: 全件をメモリに保持（大量データでは非効率）
  前提: 1スコープあたり数千行以下（3PL 倉庫の現実的な在庫行数）
```

**判断**: 現状のデータ規模ではクライアントサイドで十分。1スコープで1万行を超える場合はサーバーサイドへ移行を検討。

### ページサイズオプション

```typescript
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const
type PageSizeOption = typeof PAGE_SIZE_OPTIONS[number]
const DEFAULT_PAGE_SIZE: PageSizeOption = 50
```

### ページ番号ウィンドウ（getPageWindow）

```
totalPages <= 7: すべてのページ番号を表示
totalPages > 7:
  - 先頭・末尾は常に表示
  - 現在ページの前後1ページを表示
  - 連続しない箇所に '…' を挿入

例 (totalPages=10, current=5):
  [1] … [4] [5] [6] … [10]

例 (totalPages=10, current=2):
  [1] [2] [3] … [10]

例 (totalPages=10, current=9):
  [1] … [8] [9] [10]
```

### 表示範囲サマリー

```tsx
全 {filtered.length} 件中 {startIdx + 1}-{endIdx} 件を表示
```

### ページアウトオブレンジ処理

フィルタ変更でページ数が減り、`page > totalPages` になりうる。

```tsx
// useMemo 内でクランプ（補正 useEffect は使わない）
const safePage = Math.min(Math.max(1, page), totalPages)
const startIdx = (safePage - 1) * pageSize
```

フィルタ・検索変更ハンドラでは `pushParams(..., 1, pageSize)` でページを1にリセット（先回り防止）。

---

## URL パラメータ

| パラメータ | 型 | デフォルト | 省略条件 |
|---|---|---|---|
| `q` | string | `''` | 空文字 |
| `status` | InventoryFilterValue | `'all'` | `=== 'all'` |
| `page` | number | `1` | `=== 1` |
| `pageSize` | PageSizeOption | `50` | `=== 50` |

**例**:
```
?status=available&page=3          // 有効在庫のみ、3ページ目
?q=A-01&pageSize=100              // "A-01" 検索、100件表示
?                                  // デフォルト（全件・1ページ目・50件）
```

---

## 操作モーダル

行クリックで詳細モーダルを開く。詳細モーダルから操作モーダルに遷移する設計（現在は直接表示）。

### 操作種別

| 操作 | RPC | 説明 |
|---|---|---|
| ロケーション移動 | `rpc_move_inventory` | 棚間の在庫移動 |
| 数量調整 | `rpc_adjust_inventory` | 棚卸差異・破損等の数量修正 |
| ステータス変更 | `rpc_change_inventory_status` | `available ↔ hold ↔ damaged` |

### 操作後の再取得

```tsx
async function handleOperationComplete() {
  closeModal()
  // バックグラウンドで再取得（ローディングスピナーを出さない）
  const data = await fetchInventory(scope)
  setInventory(data)
}
```

---

## モバイル対応

### デスクトップ: テーブル表示

```
商品コード | 商品名 | ロケ | ステータス | ロット | 賞味期限 | 入庫日 | 実在庫 | 引当 | 有効在庫
```

### モバイル: カード表示

各在庫行をカードとして縦並びに表示。  
主要情報（商品名・ロケ・ステータス・実在庫・有効在庫）のみ表示し、ロット詳細は省略。

```tsx
{/* デスクトップ */}
<div className="hidden md:block">
  <table>...</table>
</div>

{/* モバイル */}
<div className="md:hidden space-y-3">
  {paged.map(item => <MobileInventoryCard key={item.id} item={item} />)}
</div>
```

---

## 将来の改善候補

| 改善 | 優先度 | 概要 |
|---|---|---|
| サーバーサイドページネーション移行 | 低 | データが1万行超になった場合 |
| カラムソート | 中 | クリックで任意カラムソート |
| カラム表示/非表示 | 低 | ユーザー設定で列を非表示 |
| 選択一括操作 | 中 | チェックボックスで複数行選択 → 一括移動/ステータス変更 |
| エクスポート | 低 | CSV エクスポート（フィルタ後の全件） |
