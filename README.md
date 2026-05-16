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

> 詳細はセットアップ完了後に追記します。

### 必要なもの

- Node.js 18以上
- Git
- Cloudflareアカウント / Wrangler CLI
- Anthropic APIキー（`sk-ant-...`）

### ローカル開発

```bash
# フロントエンド
cd frontend
npm install
npm run dev

# Worker（別ターミナル）
cd worker
npm install
npx wrangler dev
```

### 環境変数 / シークレット

開発時は `worker/.dev.vars` に以下を設定します（このファイルは Git 管理外）。

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
```

本番環境への登録は以下のコマンドで行います。

```bash
cd worker
npx wrangler secret put ANTHROPIC_API_KEY
```

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
