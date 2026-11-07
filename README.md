# Turborepo Remote Cache（セルフホスト）

ローカルと GitHub Actions でビルド成果物を共有する、Cloudflare Workers 上のリモートキャッシュサーバー。
1 つのサーバーを複数リポジトリで使い、リポジトリ単位でキャッシュとアクセス権を分離する。

設計の詳細と決定理由は [docs/design.md](docs/design.md)、仕様調査は [docs/research-notes.md](docs/research-notes.md) を参照。

## 構成

| パッケージ | 役割 |
| --- | --- |
| `apps/api` | Hono。Better Auth、oRPC 管理 API、Turborepo キャッシュ API。D1 と R2 を操作する唯一の Worker |
| `apps/web` | TanStack Start の管理 UI。DB / R2 へ直接アクセスせず、Service Binding で API を呼ぶ |
| `packages/api-contract` | 管理 API の oRPC 契約と Valibot スキーマ、Turborepo 仕様の型 |
| `packages/db` | Drizzle スキーマ、D1 接続、マイグレーション |
| `packages/domain` | 純粋ロジック（R2 キー、権限、ヘッダー検証、team/slug 照合、セットアップトークン） |
| `packages/forge` | 共有 tsconfig / lint / format 設定 |

公開経路は 2 つ。

- Turborepo CLI → `https://<api-host>`（API Worker を直接公開。Bearer API キー）
- ブラウザ → `https://<web-host>`（`/api/auth/*` と `/rpc/*` を同一オリジンで受け、Service Binding で API へ転送）

## 前提

- Node.js 24 以上（`.nvmrc` は 24）
- pnpm 12（`packageManager` で固定）
- デプロイ時のみ Cloudflare アカウントと `wrangler` の認証

## セットアップ

```sh
pnpm install --frozen-lockfile
pnpm run types          # wrangler types（binding 型）
cp apps/api/.dev.vars.example apps/api/.dev.vars
# BETTER_AUTH_SECRET を openssl rand -base64 32 などで設定
pnpm dev                # ローカル D1 を migrate し、Web (3000) + API auxiliary Worker を起動
pnpm admin:setup        # 管理者のメールアドレスを入力し、パスキー登録 URL を表示
```

`pnpm dev` は Vite の port 3000（`strictPort`）で Web を起動し、`apps/api` の Worker を同時に起動する。
D1 は `apps/web/.wrangler/state/v3` に保存し、`pnpm dev` が起動前にマイグレーションする。
`pnpm db:migrate` は API 単体（`wrangler dev`）と E2E 用で、`apps/api/.wrangler` 側を使う。ブラウザで `http://localhost:3000/setup#token=...` を開き、パスキーを登録してログインする。
ローカルの Turborepo は `TURBO_API=http://localhost:3000`（Web が `/v8` を Service Binding で転送）で接続できる。

## 環境変数と Secret

| 名前 | 用途 |
| --- | --- |
| `BETTER_AUTH_SECRET` | Better Auth の署名鍵。Secret（`.dev.vars` / `wrangler secret`）。CLI は環境変数から読む |
| `BETTER_AUTH_URL` | ブラウザから見た Web のオリジン（例 `https://admin.example.com`） |
| `WEB_ORIGIN` | Web のオリジン。Cookie / WebAuthn / Origin 検査に使う |
| `MAX_ARTIFACT_BYTES` | PUT を受け付ける最大バイト数（既定 104857600 = 100 MB） |

`.dev.vars.example` はダミー値のみ。実値を Git に入れない。

## DB

D1 を使う（Turso/libSQL は不採用。理由は `docs/design.md`）。

```sh
pnpm db:generate        # packages/db/drizzle に SQL を追加（既存ファイルは変更しない）
pnpm db:migrate         # ローカル
pnpm db:migrate:remote  # 本番（Cloudflare の認証情報が必要）
```

- マイグレーションは追記のみ。CI が既存ファイルの変更・改名・削除を検出する。
- 認証・API キー・リポジトリ台帳を同じ D1 に置く。成果物は R2。

## 管理者（パスキーのみ）

- 公開サインアップ・パスワードは無い。ログインはパスキーのみ。
- 初期登録: `pnpm admin:setup` がメールアドレスを受け取り、10 分有効の署名トークンを発行する。表示された `/setup#token=...` を開いてパスキーを登録する。
- 復旧: `pnpm admin:setup -- --reset`。既存のパスキーとセッションを削除して新しい登録 URL を発行する。
- 秘密情報は CLI 引数で渡さない。`BETTER_AUTH_SECRET` は環境変数（ローカルは `.dev.vars`）から読む。

## API キー

管理 UI（`/keys`）で発行・一覧・失効する。

- 1 キー = 1 リポジトリ。リポジトリ slug（例 `acme/web`）と任意の `teamId` を指定する。
- 権限は「読み取り専用（`cache:read`）」と「読み書き（`cache:read` + `cache:write`）」。
- 有効期限は 1〜365 日。原文は発行時の 1 回だけ表示し、DB・ログには残さない（Better Auth がハッシュ保存）。
- 失効は無効化。管理 API はセッション必須で、キャッシュ用キーでは操作できない。

## Turborepo の設定

サーバー側の値との対応:

| クライアント | 例 | サーバー側 |
| --- | --- | --- |
| `TURBO_API` | `https://cache.example.com` | API Worker の公開 URL |
| `TURBO_TOKEN` | `trc_...` | API キー（Bearer） |
| `TURBO_TEAM` | `acme/web` | キーに紐付くリポジトリの `slug`（または `teamId`） |

```sh
# ローカル（pnpm dev 中）
TURBO_API=http://localhost:3000 \
TURBO_TOKEN=trc_xxx \
TURBO_TEAM=acme/web \
pnpm turbo run build

# 本番（API Worker を直接公開）
TURBO_API=https://cache.example.com TURBO_TOKEN=trc_xxx TURBO_TEAM=acme/web pnpm turbo run build
```

- 実装パスは `/v8/artifacts/*`（Turbo CLI の実挙動）と接頭辞なしの `/artifacts/*` の両方。
- `teamId` / `slug` クエリは「キーのリポジトリとの一致確認」だけに使う。未指定は許可、不一致は 403。R2 の保存先は常にキー側のリポジトリ ID から決める。
- status / HEAD / GET / PUT / 一括照会 / events を実装。events は検証して 200 を返すが永続化しない。

## 署名

- `TURBO_REMOTE_CACHE_SIGNATURE_KEY` はクライアントだけが持ち、HTTP では送られない。
- アップロード時の `x-artifact-tag` をそのまま保存し、ダウンロード時に返す。サーバーは署名の生成・検証をしない。
- 改ざんされた成果物は Turbo クライアントが拒否する（E2E で確認）。

## R2 と保持期間

- 保存キー: `repos/{repositoryId}/{hash}`。ハッシュは小文字に正規化。
- メタデータは R2 の custom metadata（`tag`, `durationMs`, `sha`, `dirtyHash`）。
- PUT は `Content-Length` 必須（無ければ 411）。`MAX_ARTIFACT_BYTES` 超過は 413。本体は `request.body` をそのまま R2 へ渡す。
- 成果物は全量メモリに載せない。上限は Workers のリクエスト上限（Free/Pro 100 MB）に従う。
- 保持期間は R2 のライフサイクルで削除する（アプリからは削除しない）。例:

```sh
npx wrangler r2 bucket lifecycle add turbo-remote-cache \
  --prefix repos/ --expire-days 30
```

## GitHub Actions

- `.github/workflows/ci.yml`: lint / format / typecheck / knip、Panda codegen 再生成の差分（`apps/web/styled-system.sha256`）、マイグレーション変更禁止、test、build、Storybook build、実 Turborepo E2E。`permissions: contents: read`、PR にシークレットを渡さない。
- `.github/workflows/deploy.yml`: 手動実行 + environment 承認。`concurrency` で直列化し、migration → API → Web の順に実行。失敗すると後続は実行されない。main push の自動本番デプロイは無い。

CI では `pnpm install --frozen-lockfile` を使う。

## デプロイ

```sh
npx wrangler login
npx wrangler d1 create turbo-remote-cache
npx wrangler r2 bucket create turbo-remote-cache
npx wrangler secret put BETTER_AUTH_SECRET -c apps/api/wrangler.jsonc
# GitHub Secrets: CLOUDFLARE_DATABASE_ID / CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
# GitHub Variables: PRODUCTION_WEB_ORIGIN（例 https://admin.example.com）
# deploy ワークフローが wrangler.jsonc の database_id と URL を本番値に置き換える
pnpm db:migrate:remote
pnpm deploy:api
pnpm deploy:web
```

- 本番とローカルで D1 / R2 / Secret を分ける。`database_id` は `wrangler d1 create` の値に置き換える。
- 管理 UI と API は別ホスト名で公開する。ブラウザの Cookie と WebAuthn は Web のオリジンに揃える。
- `compatibility_date` は 2026-11-07。`nodejs_compat` は不要だったため付けていない。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | Web + API を同時起動 |
| `pnpm build` | Web のビルド |
| `pnpm test` | Vitest（pure / Workers 統合） |
| `pnpm typecheck` | tsrs |
| `pnpm check` | types / generate / typecheck / lint / format / Knip |
| `pnpm fix` | lint 自動修正 + format |
| `pnpm knip` | 未使用の依存・export・catalog |
| `pnpm generate` | Panda codegen と再生成ハッシュの更新 |
| `pnpm spec:update` | Turborepo OpenAPI の再取得 |
| `pnpm storybook` / `pnpm storybook:build` | Storybook |
| `pnpm e2e` | 実 Turborepo の E2E |
| `pnpm admin:setup` | 管理者パスキーの初期登録・復旧 |
| `pnpm deploy` / `deploy:api` / `deploy:web` | デプロイ |

## 制約・未対応

- 管理者は 1 人。複数管理者・権限分割は無い。
- 1 API キー = 1 リポジトリ。複数リポジトリを 1 キーで共有できない。
- events は受け取るが保存しない（分析 UI なし）。
- 成果物の削除 API は無い。保持期間は R2 ライフサイクルで管理する。
- D1 は DB あたり 10 GB・単一スレッド。API キー検証はリクエストごとに 1 回更新が入る。
- Better Auth のレート制限は無効化している（キャッシュ API のため）。

## 設計判断

- OpenAPI のコード生成は使わない。仕様を `packages/api-contract/spec/` に保存し、型と Valibot スキーマを手書きする（TypeScript 7 を優先するため）。
- DB は D1。ローカルと統合テストが追加サービス無しで完結する。
- 管理者はパスキーのみ。初期登録・復旧は署名トークン + `/setup`。
- Turborepo の公開経路は API Worker の直接公開。大きいバイナリを Web に通さない。
- 詳細と比較表は `docs/design.md`。
