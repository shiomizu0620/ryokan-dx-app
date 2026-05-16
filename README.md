# 旅館DX診断アプリ

チャットで話すだけで、旅館のオペレーションの無駄を金額・時間で可視化し、雰囲気を守りながら改善策を優先度付きで提案するWebアプリ。

## 解決する課題

- 現場のスタッフは無駄に気づいているが、上の人や経営者に伝わらない
- 「DXすべき場所」と「雰囲気を守るべき場所」の区別が曖昧
- ITやDXに対する心理的ハードルが高い
- データが取れていない・見えていない・活かせていない

## 主な機能（MVP）

- AIチャットによる施設・オペレーションのヒアリング
- 業界平均値プリセットによる損失（時間・金額）の自動試算
- 「雰囲気優先ゾーン」の自動検出（DXすべきでない場所の区別）
- 損失額・難易度・期間を含む改善策の優先度付き提案
- 損失サマリーとDXマップを含むレポート出力
- 構造化JSONによる学習機能（次回診断に文脈を引き継ぎ）

## 技術スタック

| レイヤ | 採用技術 |
|--------|----------|
| フロントエンド | Cloudflare Pages / React + TypeScript / Tailwind CSS / Vite |
| サーバーレス | Cloudflare Workers / Hono |
| データベース | Cloudflare D1 |
| AI | Claude API (`claude-sonnet-4-20250514`) |

## ディレクトリ構成（予定）

```
ryokan-dx-app/
├── frontend/   # React + TypeScript（Cloudflare Pages）
├── worker/     # Cloudflare Workers + Hono
└── README.md
```

## セットアップ

### 必要なもの

- Node.js 18以上
- Git
- Cloudflareアカウント / Wrangler CLI（`npx wrangler login`）
- Anthropic APIキー（`sk-ant-...`）

### 1. 依存関係インストール

```bash
cd frontend && npm install
cd ../worker && npm install
```

### 2. 環境変数（worker）

`worker/.dev.vars.example` をコピーして実際のキーを入れます。`.dev.vars` 自体は git 管理外です。

```bash
cd worker
cp .dev.vars.example .dev.vars
# .dev.vars の ANTHROPIC_API_KEY を本物のキーに書き換える
```

本番環境のシークレットは Wrangler に登録します（ローカルの `.dev.vars` とは別物）。

```bash
cd worker
npx wrangler secret put ANTHROPIC_API_KEY
```

### 3. D1（Cloudflare のSQLite）

新しいCloudflareアカウントでセットアップし直す場合のみ:

```bash
cd worker
npx wrangler d1 create ryokan-dx-db
# 出力された database_id を wrangler.toml の [[d1_databases]] に貼る
```

マイグレーション適用:

```bash
cd worker
npx wrangler d1 migrations apply ryokan-dx-db --local    # ローカル開発用 SQLite
npx wrangler d1 migrations apply ryokan-dx-db --remote   # 本番用リモート D1
```

### 4. ローカル起動

```bash
# フロントエンド（http://localhost:5173）
cd frontend && npm run dev

# Worker（別ターミナル / http://127.0.0.1:8787）
cd worker && npx wrangler dev
```

疎通確認: `curl http://127.0.0.1:8787/api/health` で `{"ok":true,"has_api_key":true,"db_ok":true}` が返れば `.dev.vars` と D1 binding が両方読めています。

## デプロイ

```bash
# Workers
cd worker
npx wrangler deploy

# Pages
cd frontend
npm run build
npx wrangler pages deploy dist
```

## ライセンス

未定。
