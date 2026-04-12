# フェーズ2 UI アーキテクチャ

## フェーズ2の目的

フェーズ2は「UI 構造整理・一覧共通化」フェーズ。  
各ページが独自実装していたローディング・エラー・空状態・フィルタ・ページネーションを共通化し、一貫した UX と保守性を確保する。

---

## フェーズ2-A: 共通コンポーネント整理

### 解決した問題

- 各ページが独自の loading/error 表示を持ち、UIが不統一
- 空状態（データなし）の表示が場当たり的
- ステータスバッジのスタイルが各ページに分散

### 導入した共通コンポーネント

| コンポーネント | 役割 |
|---|---|
| `PageShell` | ページ全体の loading / error ラッパー |
| `EmptyState` | データなし状態の統一表示 |
| `StatusBadge` | ステータスバッジ（汎用） |

#### PageShell

```tsx
<PageShell loading={loading} error={error} title="ページタイトル（省略可）">
  {/* コンテンツ */}
</PageShell>
```

- `title` あり: ヘッダー + カード形式（arrival/receiving/inventory）
- `title` なし: 中央スピナーのみ（shipping — 独自ヘッダーを持つため）
- loading 中はスピナー表示、error 時はエラーメッセージカード表示

#### EmptyState

```tsx
<EmptyState
  icon={<Package />}
  message={t.inventory.emptyState}
  action={{ label: 'フィルタをリセット', onClick: resetFilter }}
/>
```

- `action` は省略可能（「新規登録へ」「フィルタをリセット」などのCTA）

#### StatusBadge

```tsx
<StatusBadge
  label={t.status[item.status]}
  badgeClass="bg-green-100 text-green-700"
  dotClass="bg-green-500"  // 省略可
/>
```

- ドメインごとに独自の色設定を持つアダプター関数をページ内に定義（`getInventoryStatusBadgeProps` 等）
- バッジ自体はドメイン知識を持たない

### 命名衝突の解決

`inventory/page.tsx` でローカル定義の `StatusBadge` 関数が共通コンポーネントと衝突。  
ローカル関数を `InventoryStatusBadge` にリネーム（`replace_all` で全参照を更新）。

---

## フェーズ2-B: フィルタ状態の URL search params 化

### 解決した問題

- フィルタ・検索・タブ状態が `useState` のみで管理されていたため、ページリロードや前後ナビゲーションで状態が失われる
- ブックマーク・URL共有ができない

### 実装方針

```
useSearchParams()  読み取り（初期値として使用）
router.replace()   書き込み（履歴を汚さない）
useState 初期化関数  URL からの読み取りをコンポーネント初期化時に1回だけ実行
```

**履歴汚染を防ぐ**: `router.push` ではなく `router.replace` を使用。フィルタ変更のたびに「戻る」履歴が積まれることを防ぐ。

### URL パラメータ設計

デフォルト値は URL に含めない（clean URL）:

| ページ | パラメータ | デフォルト省略条件 |
|---|---|---|
| arrival | `q`, `status` | `q=''`, `status='all'` |
| receiving | `q`, `status` | `q=''`, `status='active'` |
| inventory | `q`, `status`, `page`, `pageSize` | `q=''`, `status='all'`, `page=1`, `pageSize=50` |
| shipping | `q`, `tab` | `q=''`, `tab='pending'` |

### pushParams パターン

各ページに `pushParams` 関数を定義し、URLを一括更新:

```tsx
// inventory の例（4-tuple）
function pushParams(q: string, status: InventoryFilterValue, pg: number, ps: PageSizeOption) {
  const p = new URLSearchParams()
  if (q)             p.set('q', q)
  if (status !== 'all') p.set('status', status)
  if (pg !== 1)      p.set('page', String(pg))
  if (ps !== DEFAULT_PAGE_SIZE) p.set('pageSize', String(ps))
  router.replace(`?${p.toString()}`)
}
```

### receiving ページの検索追加

receiving ページには元々 search 状態がなかった。フェーズ2-B で追加:
- `searchPlaceholder` 翻訳キーは `ja.ts` / `en.ts` に既存だったため、新規追加不要
- `filtered` の useMemo に text search 条件を追加

---

## フェーズ2-C: inventory 一覧のページネーション

### クライアントサイド vs サーバーサイドの選択

**クライアントサイドを選択した理由**:
- すでに全スコープのデータを1回のクエリで取得している
- フィルタ変更に即座に反応する必要がある（サーバーサイドだと往復遅延）
- 倉庫ごとの在庫数は数千行以下の想定（メモリ上での slice が現実的）

**サーバーサイドへの移行基準**: 1スコープで1万行を超えるようになったら検討。

### 実装

```tsx
const { paged, totalPages, safePage, startIdx, endIdx } = useMemo(() => {
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const startIdx = (safePage - 1) * pageSize
  const endIdx = Math.min(startIdx + pageSize, total)
  return { paged: filtered.slice(startIdx, endIdx), totalPages, safePage, startIdx, endIdx }
}, [filtered, page, pageSize])
```

### ページ番号ウィンドウ（getPageWindow）

最大7ボタン表示、`…` エリプシス付き:

```
1 … 4 [5] 6 … 10   (totalPages=10, current=5)
[1] 2 3 4 5 … 10   (totalPages=10, current=2)
1 … 6 7 8 9 [10]   (totalPages=10, current=9)
```

### ページアウトオブレンジの処理

フィルタ変更でページ数が減少したとき `page > totalPages` になりうる。  
`safePage = Math.min(Math.max(1, page), totalPages)` で useMemo 内でクランプ。  
補正 useEffect は使わない（循環依存の回避）。  
フィルタ・検索変更時はハンドラ内で `pushParams(..., 1, pageSize)` してページを1にリセット。

---

## フェーズ2-D: shipping UI 整理

### 解決した問題

- 4枚のサマリーカード＋3枚のメニューカードが冗長（タブのカウントバッジと情報が重複）
- PickingModal がロケーション単位の引当情報を表示できていない（複数棚対応なし）

### サマリー/メニューカード廃止 → コンパクトピルバー

```tsx
{/* Before: 7枚のカード */}
{/* After: 1行のステータスピルバー */}
<div className="flex flex-wrap gap-2 mb-4">
  {TAB_VALUES.map(tab => (
    <button
      key={tab}
      onClick={() => handleTabChange(tab)}
      disabled={counts[tab] === 0}
      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
        activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 ...'
      }`}
    >
      {t.shipping.tabs[tab]} {counts[tab] > 0 && `(${counts[tab]})`}
    </button>
  ))}
</div>
```

### PickingModal のアロケーション展開

`shipping_allocations` から構築した `allocations[]` を使い、棚ごとに1行表示:

```tsx
const pickingRows = order.items
  .flatMap(item =>
    item.allocations.length > 0
      ? item.allocations.map(alloc => ({
          key: `${item.id}-${alloc.locationCode}`,
          locationCode: alloc.locationCode,
          productCode: item.productCode,
          ...
          qty: alloc.allocatedQty,
        }))
      : [{ key: item.id, locationCode: item.locationCode || '—', ...qty: item.orderedQuantity }]
  )
  .sort((a, b) => a.locationCode.localeCompare(b.locationCode))
```

- `allocations` が空の場合は従来の `locationCode` 文字列にフォールバック（後方互換）
- 棚コード昇順ソートでピッキング動線を最適化

---

## UI 設計原則

### 1. 状態管理の層分離

```
URL search params  ← フィルタ・タブ・ページ（永続化・共有可能）
useState           ← UI ローカル状態（モーダル開閉・入力中の値）
Supabase           ← サーバーデータ（スコープ変更で再取得）
```

### 2. ページ遷移なし・モーダル完結

詳細操作はすべてモーダル内で完結。完了後はバックグラウンドで一覧を再取得（UX ちらつき最小化）。

### 3. スコープドリブン再取得

`scope`（tenantId + warehouseId）を useEffect の依存関係に含め、スコープ切り替え時に自動再取得。ページ内でのフィルタ状態はスコープ変更時にリセット。

### 4. Clean URL

デフォルト値は URL に含めない。フィルタを全解除すると URL が `?` のないクリーンな状態に戻る。

---

## フェーズ2で解決した問題の一覧

| 問題 | 解決策 |
|---|---|
| loading/error 表示が各ページで異なる | PageShell で統一 |
| 空状態のデザインが散在 | EmptyState コンポーネント |
| フィルタ状態がリロードで消える | URL search params 永続化 |
| inventory の全件表示による表示遅延 | クライアントサイドページネーション |
| shipping のカード UI 冗長 | コンパクトピルバーに置換 |
| PickingModal が複数棚対応未対応 | allocations[] 展開で棚別1行表示 |
| 命名衝突（StatusBadge） | ローカル関数を InventoryStatusBadge にリネーム |
