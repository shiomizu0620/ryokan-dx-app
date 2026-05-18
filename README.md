# 旅館DX診断アプリ

チャットで話すだけで、旅館のオペレーションの無駄を金額・時間で可視化し、雰囲気を守りながら改善策を優先度付きで提案するWebアプリ。

## 解決する課題

- 現場のスタッフは無駄に気づいているが、上の人や経営者に伝わらない
- 「DXすべき場所」と「雰囲気を守るべき場所」の区別が曖昧
- ITやDXに対する心理的ハードルが高い
- データが取れていない・見えていない・活かせていない

## 主な機能

- AIチャットによる施設・オペレーションのヒアリング
- 業界平均値プリセットによる損失（時間・金額）の自動試算
- 「雰囲気優先ゾーン」の自動検出（DXすべきでない場所の区別）
- 損失額・難易度・期間を含む改善策の優先度付き提案
- 損失サマリーとDXマップを含むレポート出力
- D1永続化による文脈引き継ぎ（2回目以降は前回の診断データを参照）

## 本番URL

- フロントエンド: <https://ryokan-dx-app.pages.dev>
- Worker API: <https://ryokan-dx-worker.ryokan-dx.workers.dev>

## 技術スタック

| レイヤ | 採用技術 |
|--------|----------|
| フロントエンド | Cloudflare Pages / React + TypeScript / Tailwind CSS v4 / Vite |
| サーバーレス | Cloudflare Workers / Hono |
| データベース | Cloudflare D1（SQLite） |
| AI | OpenAI `gpt-4o-mini`（Chat Completions API、streaming + JSON Schema） |

## ディレクトリ構成

```
ryokan-dx-app/
├── frontend/              # React + TypeScript（Cloudflare Pages）
│   ├── src/
│   │   ├── App.tsx        # 画面遷移オーケストレータ
│   │   ├── Chat.tsx       # チャット画面
│   │   ├── Report.tsx     # レポート画面
│   │   └── types.ts       # 型定義
│   ├── public/
│   │   └── _redirects     # 不要（API は直接 Worker URL を叩く）
│   └── .env.production    # VITE_API_BASE（本番 Worker URL）
├── worker/                # Cloudflare Workers + Hono
│   ├── src/
│   │   ├── index.ts       # エンドポイント（/api/chat, /api/analyze, /api/health）
│   │   ├── presets.ts     # 業界平均値プリセット
│   │   └── analyze.ts     # 損失計算 + 改善策スコアリング
│   ├── migrations/
│   │   └── 0001_init.sql  # facilities + sessions テーブル
│   └── wrangler.toml
└── README.md
```

---

## ローカル開発

### 必要なもの

- Node.js 18 以上
- Cloudflare アカウント + `npx wrangler login`
- OpenAI API キー（<https://platform.openai.com/api-keys>）

### 1. 依存関係インストール

```bash
cd frontend && npm install
cd ../worker && npm install
```

### 2. Worker の環境変数

```bash
cd worker
cp .dev.vars.example .dev.vars
# .dev.vars の OPENAI_API_KEY を実際のキーに書き換える
```

### 3. D1 ローカルマイグレーション

```bash
cd worker
npx wrangler d1 migrations apply ryokan-dx-db --local
```

### 4. 起動（ターミナル2つ）

```bash
# ターミナル①: Worker（http://127.0.0.1:8787）
cd worker && npx wrangler dev

# ターミナル②: フロントエンド（http://localhost:5173）
cd frontend && npm run dev
```

疎通確認:

```bash
curl http://127.0.0.1:8787/api/health
# => {"ok":true,"has_openai_key":true,"db_ok":true}
```

---

## 本番デプロイ

### Worker

```bash
cd worker

# 初回のみ: 本番シークレット登録
npx wrangler secret put OPENAI_API_KEY

# 初回のみ: D1 リモートマイグレーション
npx wrangler d1 migrations apply ryokan-dx-db --remote

# デプロイ
npx wrangler deploy
```

### フロントエンド（Cloudflare Pages）

```bash
cd frontend
npm run build
npx wrangler pages deploy dist
```

> `frontend/.env.production` に `VITE_API_BASE` が設定されているので、本番ビルドは自動的に本番 Worker URL を参照します。

---

## 進捗

| フェーズ | 内容 | 状態 |
| --- | --- | --- |
| セットアップ | プロジェクト初期化 / Vite+React+TS / Hono Worker / D1 / OpenAI | ✅ 完了 |
| Phase A | チャット機能（streaming、システムプロンプト、フロントUI） | ✅ 完了 |
| Phase B | 損失計算エンジン + 雰囲気優先ゾーン検出 | ✅ 完了 |
| Phase C | レポート画面（損失サマリー / DXマップ / 改善策カード） | ✅ 完了 |
| Phase D | D1永続化（セッション保存、2回目以降の文脈引き継ぎ） | ✅ 完了 |
| Phase E | 仕上げ（完了検知、ローディング演出、エラー日本語化） | ✅ 完了 |
| 本番デプロイ | Cloudflare Workers + Pages へデプロイ | ✅ 完了 |

## ライセンス

未定。
