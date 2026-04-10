# SimpleWMS — 在庫管理システム（モック）

倉庫業務の入荷・在庫・出庫をひと通り操作できる、フロントエンド専用のモックアプリです。  
バックエンド・DBは不要で、ダミーデータで動作します。Vercel への静的デプロイに対応しています。

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| フレームワーク | Next.js 15（App Router） |
| 言語 | TypeScript |
| スタイル | Tailwind CSS 3 |
| 状態管理 | React Context + useReducer |
| アイコン | lucide-react |
| デプロイ | Vercel |

---

## 画面一覧

| URL | 画面名 | 概要 |
|-----|--------|------|
| `/login` | ログイン | メール・パスワードで認証（ダミーユーザーあり） |
| `/dashboard` | ダッシュボード | KPI・入庫実績・未処理出庫を一覧表示 |
| `/arrival` | 入荷予定登録 | 仕入先・商品・数量を指定して入荷予定を登録 |
| `/receiving` | 入庫処理 | 入荷予定に対して実績数量を入力・確定 |
| `/inventory` | 在庫一覧 | 商品・保管場所別の在庫状況を検索・確認 |
| `/shipping` | 出庫処理メニュー | ピッキング → 検品 → 出庫確定のワークフロー |
| `/shipping/input` | 出庫入力 | 得意先・商品・数量を指定して出庫指示を登録 |
| `/master` | マスタ管理 | 商品・仕入先・得意先・保管場所の4タブ管理 |

### テストアカウント

| ロール | メールアドレス | パスワード |
|--------|--------------|-----------|
| 管理者 | admin@wms.local | password123 |
| 担当者 | operator@wms.local | password123 |

> ログイン画面の「テスト用アカウント」ボタンをクリックすると自動入力されます。

---

## ディレクトリ構成

```
simplewms01/
├── app/
│   ├── (main)/               # 認証後の業務画面
│   │   ├── layout.tsx        # 認証ガード + グローバル状態 + レイアウト
│   │   ├── dashboard/
│   │   ├── arrival/
│   │   ├── receiving/
│   │   ├── inventory/
│   │   ├── shipping/
│   │   │   └── input/
│   │   └── master/
│   ├── login/
│   ├── layout.tsx            # ルートレイアウト（AuthProvider）
│   └── globals.css
├── components/
│   ├── layout/               # Header, Sidebar
│   └── ui/                   # Modal, SearchInput
├── lib/
│   ├── types/index.ts        # 全型定義
│   ├── utils.ts              # 日付ユーティリティ
│   └── data/                 # ダミーデータ（7ファイル）
└── store/
    ├── AuthContext.tsx        # 認証状態（localStorage永続化）
    └── WmsContext.tsx         # 業務データ状態（useReducer）
```

---

## ローカル起動手順

```bash
# 1. 依存パッケージのインストール
npm install

# 2. 開発サーバー起動
npm run dev
```

起動後、[http://localhost:3000](http://localhost:3000) を開くと `/login` にリダイレクトされます。

### ビルド確認

```bash
npm run build
```

---

## Vercel デプロイ手順

### 1. GitHubにプッシュ

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/<あなたのユーザー名>/<リポジトリ名>.git
git push -u origin main
```

### 2. Vercel でデプロイ

1. [vercel.com](https://vercel.com) にログイン
2. **Add New Project** → GitHubリポジトリをインポート
3. 設定はデフォルトのまま（Framework: Next.js、Build Command: `next build`）
4. **Deploy** をクリック

完了後、`https://<プロジェクト名>.vercel.app` で即公開されます。

> **環境変数は不要です。** ダミーデータのみで動作するため、設定なしでデプロイできます。

---

## 注意事項

- **データはリロードでリセットされます。** 業務データはメモリ管理のため、ページを再読み込みすると初期状態に戻ります（ログイン状態のみ `localStorage` で保持）。
- **在庫一覧は静的データです。** 入出庫操作の結果が在庫数に反映されない仕様です（モック）。
- 実運用に使用する場合は、バックエンドとデータベースの別途実装が必要です。
