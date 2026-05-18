# CLAUDE.md

このリポジトリで Claude Code（または他のAIアシスタント）が作業するときの文脈・規約・落とし穴をまとめたメモ。新しいセッションを始めたら最初に読むこと。

## プロジェクト概要

「旅館DX診断アプリ」 — **旅館名から実口コミ（Google Maps Places API 等）を取り「魅力ベクトル」を AI が抽出し、その旅館固有の文脈でヒアリング・損失試算・改善策提案する**Webアプリ。改善策は「DX効果 × 魅力影響」の2軸で評価され、同じ施策でも旅館によって優先度が変わるのが他のDX診断ツールとの差別化ポイント。詳細仕様は `requirements.md` を参照（`instructions.md` は未作成）。

## 構成

```
ryokan-dx-app/
├── frontend/                React + TS + Tailwind v4 (Cloudflare Pages)
│   └── src/
│       ├── App.tsx          view orchestrator (chat | analyzing | report | error)
│       ├── Chat.tsx         チャット画面 + ストリーミング読み取り
│       ├── Report.tsx       レポート画面（損失 / DXマップ / 改善策）
│       └── types.ts         worker と共有の型定義
├── worker/                  Cloudflare Workers + Hono
│   ├── src/
│   │   ├── index.ts         エンドポイント (/api/chat, /api/analyze, /api/health)
│   │   ├── presets.ts       業界平均値プリセット（時給 / オペレーション / 改善策）
│   │   └── analyze.ts       損失計算 + 改善策スコアリング（純粋関数）
│   ├── migrations/
│   │   └── 0001_init.sql    facilities + sessions テーブル
│   ├── wrangler.toml
│   ├── .dev.vars            OPENAI_API_KEY（git管理外）
│   └── .dev.vars.example    テンプレ
├── requirements.md          要件定義書（仕様の正本）
├── instructions.md          作業指示書（フェーズ分け）
└── README.md                セットアップ + 進捗
```

## 技術スタック

- **AI**: OpenAI `gpt-4o-mini`（Chat Completions API、streaming + JSON Schema structured outputs）
- **Worker**: Cloudflare Workers + Hono（`@cloudflare/workers-types`）
- **DB**: Cloudflare D1（SQLite）— ネストフィールドは JSON 文字列列で保存
- **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite` プラグイン方式、PostCSS不要)
- **Dev**: Vite proxy で `/api/*` を `127.0.0.1:8787` に転送（同一オリジン、CORS不要）

## 歴史的経緯と「やってはいけない」リスト

### AI プロバイダ選定の経緯
1. 最初は Claude API 想定で `requirements.md` 設計（モデル名 `claude-sonnet-4-...`）
2. **Geminiに切替**（ユーザ要望）→ `gemini-2.5-flash` + `@google/genai` で完走
3. Gemini 無料枠 (20 RPD) を使い切り、AI Studio prepay の最低 ¥2,000 がネックに
4. GCP Free Credit ¥47,867 はあるが、AI Studio prepay モードがそれを見ない仕様で詰む
5. **OpenAI gpt-4o-mini に切替**（$5デポジット最小、現状）

→ **特に指示がない限り `@google/genai` や `@anthropic-ai/sdk` に戻さない**。OpenAI構成でPhaseB structured outputs まで動作確認済み。

### ストリーミング応答
- worker は plain text streaming（`Content-Type: text/plain`）を返す
- SSE じゃない。フロント側は `res.body.getReader()` でバイト読みしている
- ここを変えるなら両側同時に変える

### 構造化JSON（`/api/analyze`）
- OpenAI `response_format.type = 'json_schema'` + `strict: true`
- 厳格モードの制約: 全プロパティを `required` に列挙、`additionalProperties: false`、optional は `type: ['T', 'null']` で表現
- profile の全フィールドは `null` を許容、operations_in_use と zones の全フィールドは必須

## 開発フロー

### 基本コマンド
```bash
# 型チェック（worker）
cd worker && npm run typecheck

# ビルド（frontend、TS型エラーもここで出る）
cd frontend && npm run build

# Worker dev
cd worker && npx wrangler dev      # http://127.0.0.1:8787

# Frontend dev
cd frontend && npm run dev          # http://localhost:5173

# D1 マイグレーション
cd worker && npx wrangler d1 migrations apply ryokan-dx-db --local
cd worker && npx wrangler d1 migrations apply ryokan-dx-db --remote
```

### コミットメッセージ規約
`feat(scope):` `fix(scope):` `chore(scope):` 形式。scope は `worker` / `frontend` / なし。本文は何をなぜどう変えたかを具体的に。動作確認結果も書く。

### 動作確認の流れ
1. 型チェック / ビルドが通る
2. wrangler dev を起動して curl で API直叩き
3. ブラウザでの目視確認はユーザに依頼（私はブラウザ操作できない）

## Windows特有の落とし穴

### 1. curl出力を Python に渡すと文字化け
`curl ... | python -m json.tool` は Windows Python の stdin が CP932 デフォルトで、UTF-8をShift-JISとして誤読する。**使うな**。

代替:
- ファイルに保存して `grep`: `curl -o /tmp/x.json ... && grep -oE '"name":"[^"]*"' /tmp/x.json`
- `node -e` で読む（ただし `/tmp/` は Git Bash 専用パスで Node から見えない、Windows実パス `C:\Users\.../AppData/Local/Temp/` を使う）
- `PYTHONIOENCODING=utf-8` を設定する

### 2. PowerShell の `2>&1` で native exe の stderr が ErrorRecord 化
PowerShell 5.1 で `npm ... 2>&1` すると stderr 各行が NativeCommandError でラップされて `$?` が false になる。stderr はもう Bash tool で見えてるので、PowerShell では `2>&1` を使わない。

### 3. wrangler dev の子プロセス（workerd）が残ることがある
`TaskStop` してもポート8787に LISTENING が残るケースあり。再起動前に:
```powershell
Get-NetTCPConnection -LocalPort 8787 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### 4. `.dev.vars` を変更したら wrangler dev は再起動が必要
ソースコードはホットリロードされるが、`.dev.vars` は起動時のみ読み込み。

## 進捗（2026-05-16 時点）

- ✅ セットアップ・Phase A・B・C 完了
- ⏳ Phase D (D1永続化)、Phase E (仕上げ)、本番デプロイは未着手
- D1のテーブルは作成済み（local + remote）、まだ書き込みコードなし

## API契約まとめ

### POST /api/chat
- Request: `{ messages: [{role: 'user'|'assistant', content: string}, ...] }`
- Response: `text/plain` chunked stream（assistant の返答テキスト）
- Errors: 400 (invalid JSON / messages required), 500 (OpenAI失敗)

### POST /api/analyze
- Request: 同上
- Response: `application/json` で `AnalyzeResponse`（`frontend/src/types.ts` 参照）
- Errors: 400, 500

### GET /api/health
- Response: `{ ok: true, has_openai_key: bool, db_ok: bool }`
- スモークテスト用

## 既知の課題 / TODO

- チャット完了の自動検知が未実装（手動「診断結果を見る」ボタンのみ）
- セッション永続化が未実装（リロードで消える）
- 「上司に共有」（URL/印刷）が未実装
- 本番デプロイ未実施
- D1 への書き込みは `/api/analyze` の後にやるべきだがまだ
