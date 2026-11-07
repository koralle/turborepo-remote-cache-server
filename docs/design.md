# 設計

最終更新: 2026-11-07。決定済みの内容と、その理由を残す。

## 1. 結論（推奨案）

1. DB は **Cloudflare D1**。
2. Turborepo CLI の公開経路は **API Worker を直接 HTTPS 公開**（`TURBO_API`）。Web はブラウザ向けの認証・管理 API だけを同一オリジンで受けて Service Binding 転送する。
3. 管理者ログインは **パスキーのみ**。公開サインアップは無効。初期登録と復旧は CLI が署名した一時トークン + `/setup`。
4. API キー 1 本 = 1 リポジトリ。権限は `cache:read` と `cache:read + cache:write` の 2 種。
5. コード生成ツール（Hey API など）は使わない。仕様は vendoring し、TypeScript の型と Valibot スキーマは仕様から手書きする。TypeScript は 7 系。
6. `teamId` / `slug` は「キーに紐付くリポジトリの別名」との一致確認だけに使い、R2 の保存先には使わない。

## 2. 全体構成

```text
Turborepo CLI (local / GitHub Actions)
  └─ HTTPS  https://cache.<domain>          … API Worker（公開）
       GET/HEAD/PUT /v8/artifacts/*         … Bearer API キー
       GET /v8/artifacts/status
       POST /v8/artifacts, /v8/artifacts/events

ブラウザ  https://admin.<domain>            … Web Worker（TanStack Start）
  ├─ /api/auth/*  ─┐
  ├─ /rpc/*       ─┴─ Service Binding ──▶ API Worker
  └─ 管理画面（キー発行・一覧・失効）

API Worker
  ├─ Better Auth（セッション / API キー）
  ├─ oRPC 管理 API（要セッション）
  ├─ Turborepo キャッシュ API
  ├─ D1 binding: DB
  └─ R2 binding: BUCKET
```

- Web は D1 / R2 の binding を持たない。
- API Worker だけが D1 / R2 を操作する。
- キャッシュ API と管理 API は同じ Worker 内でパスにより分離し、認証方式も分ける。

## 3. パッケージ構成

```text
apps/
  api/     Hono。Better Auth、oRPC、キャッシュ API。bindings: DB, BUCKET
  web/     TanStack Start。管理画面、同一オリジン転送。binding: API
packages/
  api-contract/  oRPC 契約（管理 API）、Turborepo 仕様から手書きした型と Valibot スキーマ、仕様の保管
  db/            Drizzle schema、接続、マイグレーション、admin CLI
  domain/        純粋ロジック（R2 キー、権限判定、ヘッダー検証、team/slug 照合）
  forge/         共有 tsconfig / oxlint / oxfmt / knip 設定
```

- 空パッケージ・将来用レイヤーは作らない。`domain` は実際に共有する関数だけを置く。
- 内部依存は `workspace:*`。
- 依存は用途別 named catalogs に集約（`react`, `cloudflare`, `api`, `db`, `ui`, `tooling`, `codegen`）。
- `pnpm-workspace.yaml` に `catalogMode: strict`、`saveExact: true`、`engineStrict: true`。`onlyBuiltDependencies` は `esbuild` / `workerd` など実際に必要なものだけ許可。

## 4. DB: D1 と Turso/libSQL の比較

| 観点 | D1（採用） | Turso/libSQL（不採用） |
| --- | --- | --- |
| Workers からの接続 | binding（`drizzle-orm/d1`）。認証情報を Worker に置かない | `@libsql/client`（HTTP）。URL とトークンを Secret で渡す |
| ローカル開発 | Miniflare のローカル D1。追加プロセス不要 | `turso dev`（Turso CLI）か Turso の実 DB が必要 |
| 統合テスト | `@cloudflare/vitest-plugin` の binding で完結 | libSQL サーバーを別途起動するか、テスト用のリモート DB が必要 |
| マイグレーション | `drizzle-kit generate` → `wrangler d1 migrations apply` | `drizzle-kit` の SQL を CLI / HTTP で適用 |
| 容量・性能 | 10 GB / DB、単一スレッド（1 クエリずつ）、30 秒 | 上限が大きく、読み取りレプリカ・マルチリージョンが可能 |
| 障害点 | Cloudflare 内で完結 | 外部サービス + ネットワーク + 認証情報 |
| この用途との相性 | 認証とリポジトリ台帳だけ。容量・同時実行は十分 | 大規模・多地域向け。今回の規模では過剰 |

### 選定理由: D1

理由:

1. 要件の「DB 決定前に Docker や Turso 用環境変数を必須化しない」を満たせる。D1 なら `pnpm install` 後すぐに dev / 統合テストが動く。
2. R2 / Workers と同じプラットフォームで、Worker に DB 認証情報を置かない。
3. Better Auth の Drizzle アダプタ（`provider: "sqlite"`）と `drizzle-orm/d1` の組み合わせが現行版で成立する。
4. 保存対象は利用者・セッション・API キー・リポジトリのみ。成果物は R2。10 GB / 単一スレッドで足りる。

受容する制約: 単一 DB は書き込みが直列。API キー検証は Better Auth の仕様上リクエストごとに 1 回更新が入るため、大規模同時実行では D1 がボトルネックになる。今回の想定（1 チーム・数十リポジトリ）では問題にしない。将来必要なら Turso か、キー検証結果のキャッシュに移行する。

Turso を選ぶ場合の構成（代替案）: `@libsql/client` の HTTP クライアント、本番 Turso、ローカルは `turso dev`。`drizzle-orm/libsql`。テストは libSQL サーバー起動を前提にし、`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` を必須にする。

## 5. 認証・API キー・権限

### 管理者ログイン（パスキー）

- `@better-auth/passkey` の `passkey()` を `registration.requireSession: false` で使う。`resolveUser` が署名済みトークンを検証し、`createSession: true` で登録後にセッションを張る。
- 公開サインアップは無い。`emailAndPassword` は無効。ログインは `signIn.passkey()` の 1 ボタン（ユーザー名なし）。
- 初期登録・復旧は `pnpm admin:setup`:
  1. メールアドレスを標準入力で受け取る（CLI 引数に秘密を渡さない）。
  2. `BETTER_AUTH_SECRET` で HMAC 署名した 10 分有効のトークンを作る（payload: `email`, `exp`, `reset`）。
  3. `https://<web>/setup#token=...` を表示する。トークンは URL フラグメントなのでサーバーログに残らない。
  4. `/setup` が `passkey.addPasskey({ context: token, createSession: true })` を呼ぶ。
- `resolveUser` は署名・期限を検証し、ユーザーが無ければ作る。`reset` 付きなら既存のパスキーとセッションを削除する。
- 復旧は `pnpm admin:setup -- --reset`。パスキーを失った管理者は新しいパスキーを登録し直す。
- Admin プラグインは採用しない。ユーザー管理・BAN・なりすまし API は不要。利用者は CLI で作る管理者 1 人だけで、管理 API は `user.role === "admin"` を要求する。

### API キー

- `@better-auth/api-key` の `apiKey()` を 1 設定で使用。
- `enableMetadata: true`、`rateLimit: { enabled: false }`、`keyExpiration: { defaultExpiresIn: 90日 }`（発行時に日数指定、1〜365 日）。
- キーは既定のハッシュ保存。原文は `createApiKey` の戻り値でのみ返し、DB・ログ・レスポンスの再取得では返さない。
- `permissions.defaultPermissions` は使わず、発行時に明示:
  - 読み取り専用: `{ cache: ["read"] }`
  - 読み書き: `{ cache: ["read", "write"] }`
- 1 キー 1 リポジトリ: `metadata.repositoryId` に保存し、発行時に必ず設定。検証後にこの値が無いキーは拒否。
- 失効: `auth.api.updateApiKey({ body: { keyId, enabled: false, userId } })`。削除ではなく無効化（一覧に残す）。

### キャッシュ API の認証

1. `Authorization: Bearer <token>` を読む。無ければ 401。
2. `auth.api.verifyApiKey({ body: { key, permissions } })` を呼ぶ。必要権限は操作別（読み取り系は `{cache:["read"]}`、PUT は `{cache:["write"]}`）。
3. `valid === false` は 401。`key.metadata.repositoryId` を取り出す。
4. リポジトリ行を引き、`teamId` / `slug` が指定されていれば一致確認。不一致は 403。
5. R2 キーは `repos/{repositoryId}/{hash}`。クエリの `teamId` / `slug` は保存先に使わない。
6. キー原文・署名鍵・成果物の中身はログに出さない。

## 6. 公開経路

- **本番（想定）**: API Worker を `cache.<domain>`（カスタムドメイン）または `<name>.<account>.workers.dev` に公開。`TURBO_API=https://cache.<domain>`、`TURBO_TOKEN=<API キー>`、`TURBO_TEAM=<リポジトリ slug>`。
- **ローカル**: Web は portless 経由で `https://<branch>.turbo-cache.localhost`（ポートは 4000-4999 から自動割当）。API は Vite の `auxiliaryWorkers` で同時起動する。Web が `/v8` と `/artifacts` も Service Binding で API に転送するため、`TURBO_API=https://turbo-cache.localhost` で CLI から到達できる。D1 は Vite の永続化先 `apps/web/.wrangler/state/v3` を使い、`pnpm dev` が起動前にマイグレーションする。API 単体や E2E は `apps/api/.wrangler/state/v3` を使う。`PORTLESS=0 pnpm dev` で port 3000 の従来動作に戻る。
- ブラウザからは Web の同一オリジンのみ。`/api/auth/*` と `/rpc/*` を Service Binding（`env.API.fetch`）で API に転送し、Cookie と `Set-Cookie` をそのまま通す。
- API Worker の `baseURL` は Web のオリジン。`trustedOrigins` も Web のオリジン。本番は `WEB_ORIGIN` に固定し、ローカルは `WEB_ORIGIN` を空にしてリクエストのオリジン（portless の URL）を都度使う。Cookie は `HttpOnly`、`SameSite=Lax`、本番は `Secure`。
- oRPC の変更系は `Origin` ヘッダー一致を追加で確認する。
- Turborepo CLI はブラウザではないので CORS は必須ではないが、プリフライトを送る構成でも動くようキャッシュ経路に OPTIONS を実装する。
- 公開経路の検証: `curl` で Authorization・`Content-Length`・`x-artifact-tag` が往復すること、実 Turborepo で保存・復元できることを確認する。

## 7. teamId / slug とリポジトリ

- `repositories`: `id`（UUID）、`slug`（一意、例 `acme/web`）、`teamId`（任意、Turbo の `TURBO_TEAM` に数値 ID を使う場合）、`createdAt`。
- キー発行時にリポジトリを選択（既存から選ぶ or slug を入力して作成）。
- リクエストの `teamId` / `slug` は「そのリポジトリの別名」との照合のみ。
  - 両方未指定: 許可（キーがリポジトリを決める）。
  - 指定あり: 一致しなければ 403。
  - 他リポジトリの slug を指定: 403。R2 キーは変わらない。
- `status` も同じ照合を行い、一致しなければ 403。

## 8. R2 と成果物

- 保存キー: `repos/{repositoryId}/{hash}`。ハッシュは `^[a-fA-F0-9]+$` のみ許可。
- メタデータは R2 の `customMetadata` に保存（別テーブルを作らない）:
  - `tag`（≤600）、`durationMs`、`sha`、`dirtyHash`。
  - サイズは R2 の `size` を使う。
- PUT:
  - `Content-Length` 必須（無ければ 411）。`X-Artifact-Max-Bytes` 相当の設定値（既定 100 MB）超過は 413。
  - `request.body` をそのまま `BUCKET.put(key, body, { customMetadata })` に渡す。全量をメモリに載せない。
  - バリデーション: ハッシュ形式、`x-artifact-duration` は 0 以上の整数、`x-artifact-tag` は 600 文字以内。
  - 成功は 202 + `{"urls":[]}`。上書きは許可（同一ハッシュは同一内容）。同時アップロードは後勝ちで、R2 の put は原子的なので部分的なオブジェクトは残らない。
  - 途中失敗: R2 にオブジェクトは残らない。クライアントは次回再アップロードする。
- GET: `BUCKET.get` の `body` をそのまま返す。`Content-Length`、`x-artifact-*` を付与。404 はミス。
- HEAD: `BUCKET.head` でサイズとメタデータを返す。404 は本文なし。
- 一括照会: 各ハッシュについて `head` を実行し、`{ [hash]: { taskDurationMs, sha, dirtyHash } | null }` を返す。件数上限（例 100）を設ける。
- events: 形式を Valibot で検証し、200 を返す。保存はしない（要件は対応範囲の明示）。件数だけログに残す。
- 保持期間: R2 のライフサイクルルール（`repos/` プレフィックス、既定 30 日）を README に記載し、`wrangler r2 bucket lifecycle` の設定例を用意する。アプリ側では削除しない。
- 署名: `x-artifact-tag` をそのまま保存・返却。サーバーは `TURBO_REMOTE_CACHE_SIGNATURE_KEY` を持たない。

## 9. 管理 API と管理 UI

### oRPC 契約（`packages/api-contract`）

- `repositories.list` → `{ id, slug, teamId }[]`
- `keys.list` → `{ id, name, repositorySlug, scope, expiresAt, enabled, lastRequest, createdAt }[]`
- `keys.create` → 入力 `{ repositorySlug, teamId?, scope: "read" | "read-write", expiresInDays }` → `{ id, key, expiresAt }`（`key` はこの応答だけ）
- `keys.revoke` → 入力 `{ id }` → `{ success: true }`
- すべて Valibot で入力・出力を検証。`oc` で契約し、`implement()` で実装。エラーは型付き。

### 管理 UI（`apps/web`）

- ログイン画面、キー一覧（リポジトリ・権限・期限・状態）、キー発行フォーム（リポジトリ、権限、期限）、失効ボタン、発行直後のみ表示するキー表示。
- TanStack Router / Query、Panda CSS、React Aria Components。日本語 UI、Noto Sans JP。
- Storybook に対象コンポーネントの story を置く（キー表、発行フォーム、キー表示）。

## 10. 開発・スクリプト・品質

ルート scripts（不要なものは作らない）:

| コマンド | 内容 |
| --- | --- |
| `dev` | Web（portless）+ API auxiliary Worker |
| `build` | API / Web |
| `test` | Vitest（node + workers） |
| `typecheck` | tsrs --noEmit |
| `check` | codegen → oxlint → oxfmt --check → typecheck → knip |
| `fix` | oxlint --fix → oxfmt |
| `knip` | knip |
| `generate` | Panda codegen（仕様の再取得は `spec:update`） |
| `deploy` | API → Web（承認後に使う想定） |
| `deploy:api` / `deploy:web` | 個別 |
| `db:generate` / `db:migrate` | Drizzle Kit / wrangler d1 |
| `storybook` / `storybook:build` | Storybook |
| `admin:setup` | 管理者パスキーの初期登録・復旧（`--reset`） |

- Panda codegen は Web の build / typecheck / Storybook build の前に実行。
- pre-commit: 修正 + 型検査。pre-push: Knip。
- 型: `@tsconfig/strictest` を継承。ESM。`import type`。
- `.dev.vars.example` はダミー値のみ。実値は Git に入れない。

## 11. テスト

- `packages/domain`: 純粋ロジック（ハッシュ検証、R2 キー、権限、team/slug 照合、ヘッダー変換）。
- `apps/api`: `@cloudflare/vitest-plugin` で D1 / R2 binding を使う統合テスト。
  - 未認証 / 不正 / 失効 / 期限切れキーの拒否
  - バイナリ往復、HEAD、各ヘッダー、404
  - 署名タグの保存・復元
  - リポジトリ間の読み出し・上書き不可
  - 読み取り専用キーの PUT 拒否
  - teamId / slug 偽装の拒否
  - 管理 API の未認証・キャッシュキー拒否
- `e2e/`: 実 Turborepo を一時リポジトリで実行。
  1. 初回はミス → アップロード
  2. ローカルキャッシュ無効 + 出力削除 → リモート復元
  3. ソース変更 → ミス
  4. `TURBO_REMOTE_CACHE_SIGNATURE_KEY` 有効で復元、成果物改ざんで不採用

## 12. CI・デプロイ

- CI: lint / format / typecheck / test / knip / build / storybook build、codegen 再生成差分、既存マイグレーション変更禁止。`pnpm install --frozen-lockfile`、`permissions: contents: read`、PR ではシークレットなし。
- デプロイ: `workflow_dispatch`（environment 承認）+ `concurrency`。migration → API → Web の順、失敗で後続停止。main push の自動本番デプロイは作らない。
- `compatibility_date` は 2026-11-07。`nodejs_compat` は必要になった場合だけ。
- binding 型は `wrangler types` で生成。
- ローカルと本番で D1 / R2 / Secret を分ける（`wrangler.jsonc` の env / `.dev.vars`）。

## 13. 明示する制約・未対応

- 1 API キー = 1 リポジトリ。複数リポジトリを 1 キーで共有する構成は提供しない。
- events は受け取るが永続化しない（分析 UI なし）。
- Turso/libSQL を選ばないため `@libsql/client` は導入しない。
- 管理者は 1 人（複数管理者・権限分割は未対応）。
- 保持期間は R2 ライフサイクルに依存し、アプリからの削除 API は作らない。
- 本番 Cloudflare リソースの作成とデプロイは、承認後に別途行う。
- OpenAPI のコード生成は行わない。仕様（`packages/api-contract/spec/`）を出典として、型と Valibot スキーマを手書きで維持する。

## 14. 決定の記録

- 2026-11-07: DB は D1（Turso/libSQL は不採用）。
- 2026-11-07: Turborepo CLI は API Worker の直接公開経路を使う。
- 2026-11-07: 管理者はパスキーのみ。初期登録・復旧は署名済みトークン + `/setup`。
- 2026-11-07: API キーの権限は read / read+write の 2 種。
- 2026-11-07: teamId / slug は一致確認のみ、未指定は許可。
- 2026-11-07: OpenAPI コード生成は不採用。TypeScript 7 を優先し、契約は手書き。
