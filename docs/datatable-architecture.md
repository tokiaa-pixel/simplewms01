# DataTable アーキテクチャ

## 概要

SimpleWMS の一覧表示は、現在カスタム実装のテーブル + 共通 UI コンポーネントで構成されている。  
将来的には TanStack Table への移行を視野に入れつつ、現時点では最小限の共通化にとどめている。

---

## 共通 UI コンポーネント

### PageShell

`components/ui/PageShell.tsx`

ページ全体の loading / error 状態をラップするコンポーネント。

```tsx
interface PageShellProps {
  loading: boolean
  error: string | null
  title?: string          // あり: ヘッダー+カード形式 / なし: 中央スピナー
  children: React.ReactNode
}
```

**2つの表示モード**:

```
title あり（arrival/receiving/inventory）:
┌─────────────────────────┐
│  タイトル                │  ← h1
├─────────────────────────┤
│  loading: スピナー       │
│  error: エラーカード     │  ← 白背景カード内
│  normal: children        │
└─────────────────────────┘

title なし（shipping）:
  loading → 画面中央スピナー
  error   → 画面中央エラーメッセージ
  normal  → children をそのまま render
```

**使用例**:
```tsx
// arrival/receiving/inventory — タイトル付き
<PageShell loading={loading} error={error} title={t.arrival.title}>
  <FilterBar />
  <Table />
</PageShell>

// shipping — 独自ヘッダーを持つため title なし
<PageShell loading={loading} error={error}>
  <ShippingContent />
</PageShell>
```

---

### EmptyState

`components/ui/EmptyState.tsx`

データが0件のときに表示するプレースホルダー。

```tsx
interface EmptyStateProps {
  icon: React.ReactNode       // lucide-react アイコン
  message: string             // 表示メッセージ
  action?: {
    label: string
    onClick: () => void
  }
}
```

**使用例**:
```tsx
// フィルタ結果が空
<EmptyState
  icon={<Package className="w-12 h-12 text-gray-300" />}
  message={t.inventory.emptyState}
  action={{ label: t.inventory.resetFilter, onClick: resetFilter }}
/>

// データ自体が存在しない（action なし）
<EmptyState
  icon={<Inbox className="w-12 h-12 text-gray-300" />}
  message={t.arrival.emptyState}
/>
```

---

### StatusBadge

`components/ui/StatusBadge.tsx`

ステータス表示の汎用バッジコンポーネント。ドメイン知識を持たない。

```tsx
interface StatusBadgeProps {
  label: string               // 表示テキスト
  badgeClass: string          // バッジ全体の Tailwind クラス
  dotClass?: string           // 左側ドットの色（省略時はドットなし）
}
```

**ドメイン別アダプター関数**（各ページ内に定義）:

```tsx
// inventory/page.tsx
function getInventoryStatusBadgeProps(status: InventoryStatus): StatusBadgeProps {
  switch (status) {
    case 'available': return { label: t.status.available, badgeClass: 'bg-green-100 text-green-700', dotClass: 'bg-green-500' }
    case 'hold':      return { label: t.status.hold,      badgeClass: 'bg-yellow-100 text-yellow-700', dotClass: 'bg-yellow-500' }
    case 'damaged':   return { label: t.status.damaged,   badgeClass: 'bg-red-100 text-red-700',    dotClass: 'bg-red-500' }
  }
}

// 使用
<StatusBadge {...getInventoryStatusBadgeProps(item.status)} />
```

---

## 責務の分離

```
┌─────────────────────────────────────────────┐
│  ページコンポーネント（page.tsx）             │
│                                             │
│  ・データ取得（Supabase クエリ）             │
│  ・フィルタ・検索ロジック                    │
│  ・URL search params との同期               │
│  ・ドメイン固有の型・定数                    │
│  ・ステータスバッジアダプター関数            │
│  ・モーダルの開閉・操作ハンドラ              │
└──────────────┬──────────────────────────────┘
               │ props / children
┌──────────────▼──────────────────────────────┐
│  共通 UI コンポーネント                       │
│                                             │
│  PageShell   loading/error ラッパー          │
│  EmptyState  空状態プレースホルダー          │
│  StatusBadge ステータスバッジ                │
│  Modal       モーダルコンテナ               │
│  SearchInput 検索入力                       │
│  ScopeRequired スコープ未選択               │
└─────────────────────────────────────────────┘
```

**共通コンポーネントが持たないもの**:
- ドメイン知識（`available` = 緑、など）
- データ取得ロジック
- URL 操作

---

## URL ベースの状態管理

### 管理する状態の種類

| 状態 | 管理場所 | 理由 |
|---|---|---|
| フィルタ値 | URL search params | リロード・ブックマーク・共有で復元 |
| 検索文字列 | URL search params | 同上 |
| タブ選択 | URL search params | 同上 |
| ページ番号 | URL search params | 同上 |
| ページサイズ | URL search params | ユーザー設定として保持 |
| モーダル開閉 | useState | 共有不要・ローカル操作 |
| 入力中の値 | useState | フォームローカル状態 |
| フェッチデータ | useState | サーバー由来、URL 管理不要 |

### 実装パターン

```tsx
// 初期値を URL から読み取る（コンポーネント初期化時に1回だけ）
const searchParams = useSearchParams()
const router = useRouter()

const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
const [statusFilter, setStatusFilter] = useState<FilterValue>(() => {
  const raw = searchParams.get('status')
  return FILTER_VALUES.includes(raw as FilterValue) ? raw as FilterValue : 'all'
})

// URL を一括更新（router.replace で履歴汚染なし）
function pushParams(q: string, status: FilterValue) {
  const p = new URLSearchParams()
  if (q)              p.set('q', q)
  if (status !== 'all') p.set('status', status)
  router.replace(`?${p.toString()}`)
}
```

### Clean URL ルール

- デフォルト値は URL に含めない
- `page=1` → 省略、`pageSize=50` → 省略、`status=all` → 省略、`q=''` → 省略
- 全デフォルト = URL は `?` なし（クリーン）

---

## ページネーション設計

詳細は `docs/inventory-list-design.md` を参照。

### コンポーネント構成（inventory）

```
┌── フィルタバー ──────────────────────────────┐
│  SearchInput  StatusFilterTabs              │
└─────────────────────────────────────────────┘
┌── テーブル ──────────────────────────────────┐
│  ヘッダー行                                  │
│  データ行 × pageSize                         │
└─────────────────────────────────────────────┘
┌── ページネーションフッター ──────────────────┐
│  全 X 件中 Y-Z 件を表示     [20▼] 表示件数   │
│  [<] [1] [2] … [5] [>]                     │
└─────────────────────────────────────────────┘
```

---

## 将来拡張: TanStack Table への移行

### 移行するメリット

- カラムの表示/非表示切り替え
- カラムのソート（クリックでソート順変更）
- カラムのリサイズ
- 仮想スクロール（大量行のパフォーマンス対応）
- 型安全な列定義

### 現在の実装との差分

| 機能 | 現在 | TanStack Table |
|---|---|---|
| フィルタ | useMemo で手動 | `columnFilters` state |
| ソート | なし | `sorting` state（`getSortedRowModel`） |
| ページネーション | 手動 slice | `getPaginationRowModel` |
| カラム定義 | JSX に直書き | `ColumnDef<T>[]` 配列 |

### 移行の前提条件

- 各ページのテーブルが同じ `DataTable<T>` コンポーネントを使うよう統一（フェーズ5 の課題）
- URL search params との統合（TanStack Table の state を URL に反映するアダプター層が必要）

### 移行しないメリット

- 依存追加なし（バンドルサイズへの影響なし）
- 現在の要件（フィルタ・ページネーションのみ）には over-spec にならない
- TanStack Table の学習コスト・型設定の複雑さを避けられる

**現時点の判断**: 移行は行わない。フェーズ5 でテーブル統一の必要性が高まった時点で再評価。
