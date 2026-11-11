# 調査メモ（2026-11-07）

実装前に確認した現行仕様と、互換性の注意点。出典 URL と確認日を併記する。

## 0. 作業環境

| 項目 | 実測値 |
| --- | --- |
| 作業ディレクトリ | `.herdr/worktrees/turborepo-remote-cache-server/feat-implement-poc` |
| Git | 初期コミット 1 件のみ（既存コード・設定なし） |
| Node.js | v26.9.0（要件は 24 以上） |
| pnpm | 12.14.0 |
| 既存規約 | なし（`.pi/` のみ。リポジトリ固有の lint / tsconfig なし） |

## 1. Turborepo リモートキャッシュ API

- 公式ページ: https://turborepo.dev/docs/openapi
- 機械可読仕様: https://turborepo.dev/api/remote-cache-spec （OpenAPI 3.0.3、`info.version` 1.0.0、取得時 16,029 bytes）
- 概念: https://turborepo.dev/docs/core-concepts/remote-caching
- クライアント実装（一次資料）: https://github.com/vercel/turborepo
  - `crates/turborepo-api-client/src/lib.rs`
  - `crates/turborepo-api-client/src/analytics.rs`
  - `crates/turborepo-cache/src/http.rs`
  - `crates/turborepo-cache/src/signature_authentication.rs`
- 確認した Turbo CLI のバージョン: 2.11.10（npm `turbo`）

### 1.1 仕様とクライアントで異なる点（重要）

| 項目 | 公式 OpenAPI | 実際のクライアント |
| --- | --- | --- |
| パスの版接頭辞 | `/artifacts/...`（接頭辞なし） | `/v8/artifacts/...` を固定で付与（`make_url("/v8/artifacts/{hash}")`） |
| 403 の本文 | `{ code, message }` | `{ "error": { "code", "message" } }` をデシリアライズ。`code` が `remote_caching_*` なら「キャッシュ無効」として扱う |
| 一括照会の値 | `{ size, taskDurationMs, tag }`、無い場合は `null` | `{ taskDurationMs, sha?, dirtyHash? }` を読む（未知フィールドは無視） |

結論: ルーティングは `/v8/artifacts/*` を正とし、接頭辞なしの `/artifacts/*` も同じ実装に割り当てる。403 の本文はクライアント形式（`error` で包む）を優先し、仕様の `code`/`message` も同居させて両立させる。

### 1.2 エンドポイントごとの要求

| メソッド | パス | 必須の応答 |
| --- | --- | --- |
| GET | `/artifacts/status` | 200 JSON `{ "status": "enabled" \| "disabled" \| "over_limit" \| "paused" }` |
| HEAD | `/artifacts/{hash}` | 200 + `Content-Length`、`x-artifact-duration`、`x-artifact-sha`、`x-artifact-dirty-hash`。404 は本文不要（クライアントは 404 をミスとして扱う） |
| GET | `/artifacts/{hash}` | 200 `application/octet-stream` + `Content-Length`、`x-artifact-tag`、`x-artifact-duration`、`x-artifact-sha`、`x-artifact-dirty-hash`。404 はミス |
| PUT | `/artifacts/{hash}` | リクエストヘッダー `Content-Length` 必須。任意で `x-artifact-duration`（整数 ≥0）、`x-artifact-tag`（≤600 文字）、`x-artifact-sha`、`x-artifact-dirty-hash`、`x-artifact-client-ci`、`x-artifact-client-interactive`。成功は 200 または 202 JSON `{ "urls": [...] }` |
| POST | `/artifacts` | 本文 `{ "hashes": string[] }` → 200 で hash をキーにした map。値は情報オブジェクトか `null` |
| POST | `/artifacts/events` | 本文はイベント配列（`sessionId` UUID、`source` LOCAL/REMOTE、`event` HIT/MISS、`hash`、任意 `duration`）。200 で本文なし |
| 共通 | 全エンドポイント | `Authorization: Bearer <token>`。任意のクエリ `teamId` / `slug`。任意ヘッダー `x-artifact-client-ci`、`x-artifact-client-interactive` |

### 1.3 署名（`x-artifact-tag`）

クライアント側の HMAC-SHA256。サーバーは鍵を持たない。

- メッセージ: `"artifact-signature:v2"`、`hash`、`teamId`、`body_len`（u64 little-endian）、本体。各フィールドは u64 LE の長さ接頭辞付き。
- 出力は Base64 標準。
- アップロード時に `x-artifact-tag` として送られ、ダウンロード時に同じヘッダーで返す。検証はクライアントが行う。
- `TURBO_REMOTE_CACHE_SIGNATURE_KEY` はクライアント環境変数で、HTTP では送られない。
- 実装方針: タグは保存してそのまま返す。サーバー側で再計算・改変をしない。

### 1.4 サイズ・ストリーム

- Workers の受信リクエスト本文上限はゾーンのプラン依存: Free/Pro 100 MB、Business 200 MB（https://developers.cloudflare.com/workers/platform/limits/）。
- R2 の `put()` に `ReadableStream` を渡す場合、長さが既知であること。リクエスト本文（`Content-Length` あり）か `FixedLengthStream` の readable 側のみ可。チャンク転送は `TypeError`（https://developers.cloudflare.com/r2/api/workers/workers-api-reference/）。
- したがって PUT は `Content-Length` 必須。欠落は 411、上限超過は 413 とし、本体は `request.body` をそのまま R2 へ渡す。

## 2. Better Auth 1.7.18

- 公式: https://www.better-auth.com/docs/plugins/api-key
- パッケージ構成が分割されている（`better-auth@1.7.18` の `package.json` exports を確認）。
  - API キー: `@better-auth/api-key@1.7.18`（`better-auth/plugins` には含まれない）
  - パスキー: `@better-auth/passkey@1.7.18`
  - Drizzle アダプタ: `better-auth/adapters/drizzle` → `@better-auth/drizzle-adapter`
  - Admin プラグイン: 引き続き `better-auth/plugins/admin`
  - パスワードハッシュ: `better-auth/crypto` の `hashPassword` / `verifyPassword`
- 検証 API: `auth.api.verifyApiKey({ body: { key, permissions } })`。server-only エンドポイントで、戻り値は `{ valid, error, key }`（例外を投げずに `valid: false` を返す）。
- キーは既定でハッシュ保存（`defaultKeyHasher`）。`disableKeyHashing` は使わない。
- 設定項目（型定義で確認）: `permissions.defaultPermissions`、`enableMetadata`、`keyExpiration`（既定・最小・最大、日単位）、`rateLimit`、`references`（user / organization）、`storage`。
- 検証時の挙動: `enabled === false`、`expiresAt` 超過、`remaining === 0` を拒否。`permissions` を渡すと `role(...).authorize()` で照合。**検証のたびに `updatedAt` を更新し、レート制限・残回数を消費する**。
- 既定のレート制限は 10 リクエスト/日で有効。キャッシュ API では毎リクエスト検証するため、既定のままでは実用にならない。`rateLimit: { enabled: false }` とし、残回数は使わない。
- API キーの作成・一覧・削除はセッション必須（`auth.api.createApiKey` はサーバー側で `userId` を渡せる）。失効は `updateApiKey({ enabled: false })` を使う。

## 3. Drizzle / DB

- Drizzle ORM 0.45.4、Drizzle Kit 0.31.11。Better Auth 1.7.18 の peer は `drizzle-orm ^0.45.2`、`drizzle-kit >=0.31.4`。
- D1: `drizzle-orm/d1` に `drizzle(env.DB)`。`wrangler.jsonc` の `d1_databases` に `migrations_dir` を指定し、`wrangler d1 migrations apply` で適用（https://orm.drizzle.team/docs/get-started/d1-new）。
- D1 の制約: DB サイズ 10 GB（Paid）/ 500 MB（Free）、1 DB は単一スレッドで 1 クエリずつ、SQL 実行 30 秒、結果 50 MB、Worker 呼び出しあたり 1,000 クエリ（https://developers.cloudflare.com/d1/platform/limits/）。
- Turso（2026 年時点）: ローカルは `@tursodatabase/database`（プロセス内）または `turso dev`（libSQL サーバー）。Workers からは `@tursodatabase/serverless` もしくは互換の `@libsql/client`（HTTP）でリモート接続（https://docs.turso.tech/local-development, https://docs.turso.tech/sdk/ts/quickstart）。
- libSQL / Turso は Workers からは常に HTTP 越し。ローカル開発・統合テストには libSQL サーバー（`turso dev`）か Turso の実 DB が必要。
- R2 ライフサイクル: プレフィックス指定の削除ルール、`Expiration.Days`。削除は 24 時間以内に反映。不完全なマルチパートは既定 7 日で中断（https://developers.cloudflare.com/r2/buckets/object-lifecycles/）。

## 4. Cloudflare Workers / テスト

- 現行推奨のテスト環境は `@cloudflare/vitest-plugin@1.6.0`（Vitest 統合）。peer は `vitest ^4.1.0 || ^5.0.0`。`@cloudflare/vitest-pool-workers` からの移行が案内されている（https://developers.cloudflare.com/workers/testing/vitest-integration/）。
- Vitest 最新は 5.1.0（`V4` タグは 4.1.12）。
- `@cloudflare/vite-plugin@1.67.0` の `auxiliaryWorkers` で追加 Worker を同時起動できる。ビルド時は `dist/<worker>/wrangler.json` ごとに個別デプロイ（https://developers.cloudflare.com/workers/vite-plugin/reference/api/）。
- TanStack Start の Cloudflare 構成: `cloudflare({ viteEnvironment: { name: "ssr" } })` + `tanstackStart()` + `react()`、`main: "@tanstack/react-start/server-entry"`、binding は `import { env } from "cloudflare:workers"`、型は `wrangler types`（https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/）。
- サービスバインディングは Fetch API。ストリーミング本文とヘッダーはそのまま転送される。

## 5. コード生成・型

- Hey API 0.99.0 は不採用（ユーザー指示）。同種の OpenAPI コード生成も使わない。
- 不採用の理由の一つ: Hey API は TypeScript の JS コンパイラ API を要求し、TypeScript 7 では動作しない（`ts.SyntaxKind` が undefined）。TypeScript 7 を優先するため、契約は仕様から手書きする。
- 生成物は `valibot.gen.ts` 等。型は `@hey-api/typescript` プラグインが生成する。Valibot スキーマから `v.InferOutput` で型を導出できる。
- type-fest 5.10.0。readme に「TypeScript >= 5.9、ESM、`strict: true` が必要」。`Tagged`、`ReadonlyDeep`、`OverrideProperties`、`Merge`、`Simplify` を利用候補とする。
- TypeScript は 7.0.2（npm latest）。tsrs は `0.23.0-ts7.1.0-beta` で、TypeScript 7.1 beta の Rust 実装。`tsrs --noEmit --fast` で型検査。
- 7.0.2 は `tsc` が動く。JS コンパイラ API に依存するツール（コード生成など）は使わない方針にした。

## 6. その他のバージョン（npm 確認）

| パッケージ | 最新 |
| --- | --- |
| hono | 4.13.17 |
| @orpc/server, @orpc/contract | 1.16.2 |
| valibot | 1.5.0 |
| react / react-dom | 19.3.1 |
| @tanstack/react-start | 1.169.4 |
| @tanstack/react-router | 1.170.46 |
| @tanstack/react-query | 5.107.1 |
| @pandacss/dev | 2.5.0（Vite は `@pandacss/vite`） |
| react-aria-components | 1.22.1 |
| storybook / @storybook/react-vite | 10.6.6 |
| vite | 8.3.6 |
| wrangler | 4.158.0 |
| knip | 6.44.2 |
| lefthook | 2.2.2 |
| ultracite | 8.1.1（peer: oxlint ^1.90, oxfmt >=0.71） |
| oxlint / oxfmt | 1.92.0 / 0.77.0 |
| @tsconfig/strictest | 2.0.8 |

## 7. 実装中に検証するリスク

1. TypeScript 7.0.2 と tsrs（7.1 beta 固定）の診断差。差が出た場合は tsrs の該当箇所を記録し、`tsc` との二重確認で切り分ける。
2. 仕様の `additionalProperties` + `oneOf` + `nullable`（一括照会の応答）を手書きの Valibot スキーマで正しく表せるか。テストで確認する。
3. Storybook 10.6 と Vite 8、TanStack Start 1.169 と `@cloudflare/vite-plugin` 1.67 の組み合わせ。
4. Better Auth の D1 アダプタ経路（`provider: "sqlite"`）と、検証ごとの書き込みが D1 の単一スレッド性能に与える影響。
5. pnpm 12 の `catalogMode` / `saveExact` / `engineStrict` / ビルドスクリプト許可の設定キー。
