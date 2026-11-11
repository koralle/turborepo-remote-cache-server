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

公開経路はホスト 1 つ（`https://turborepo.koralle-mgmg.com`）。Cloudflare の Workers route で Worker を分ける。

- Turborepo CLI → `https://turborepo.koralle-mgmg.com/v8/*` と `/artifacts/*`（API Worker。Bearer API キー。Web を経由しない）
- ブラウザ → それ以外のパス（Web Worker）。`/api/auth/*` と `/rpc/*` は同一オリジンで受け、Service Binding で API へ転送
- `GET /health` も API Worker のより具体的な route（デプロイ後のスモーク用）

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
pnpm dev                # ローカル D1 を migrate し、Web を portless 経由で起動する
pnpm admin:setup        # パスキー登録 URL を表示
```

`pnpm dev` は Vite（`apps/web`）を [portless](https://portless.sh/) 経由で起動し、`apps/api` の Worker を同時に起動する。
URL は `https://turbo-cache.localhost`（git worktree では `https://<ブランチ名最終セグメント>.turbo-cache.localhost`）。ポートは固定せず 4000-4999 から自動で割り当てるので、複数 worktree を同時に起動しても衝突しない。実際の URL は起動ログの `PORTLESS_URL` に出る。
初回起動時のみ 443 のバインド（sudo）とローカル CA の信頼が入る。`PORTLESS=0 pnpm dev` で portless を迂回し、port 3000 で起動できる（`e2e/dev-smoke.sh` はこちら）。
D1 は `apps/web/.wrangler/state/v3` に保存し、`pnpm dev` が起動前にマイグレーションする。
`pnpm db:migrate` は API 単体（`wrangler dev`）と E2E 用で、`apps/api/.wrangler` 側を使う。ブラウザで `<URL>/setup#token=...` を開き、パスキーを登録してログインする。
ローカルの Turborepo は `TURBO_API=https://turbo-cache.localhost`（Web が `/v8` を Service Binding で転送）で接続できる。

パスキーはオリジン（ホスト名）に紐づくため、worktree ごとに登録し直す。

## 環境変数と Secret

| 名前 | 用途 |
| --- | --- |
| `BETTER_AUTH_SECRET` | Better Auth の署名鍵。Secret（`.dev.vars` / `wrangler secret`）。CLI は環境変数から読む |
| `WEB_ORIGIN` | Web のオリジン。Cookie / WebAuthn / Origin 検査に使う。本番のみ固定値（`prepare-production-config` が書き込む）。ローカルは空で、リクエストのオリジン（portless の URL）を都度使う。`pnpm admin:setup` は未設定なら portless と同じ規則で開発中の URL を作る |
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
| `TURBO_API` | `https://turborepo.koralle-mgmg.com` | 単一ホスト。CLI は `/v8` を付けて API Worker の route に届く |
| `TURBO_TOKEN` | `trc_...` | API キー（Bearer） |
| `TURBO_TEAM` | `acme/web` | キーに紐付くリポジトリの `slug`（または `teamId`） |

```sh
# ローカル（pnpm dev 中）
TURBO_API=https://turbo-cache.localhost \
TURBO_TOKEN=trc_xxx \
TURBO_TEAM=acme/web \
pnpm turbo run build

# 本番（/v8 は API Worker の zone route）
TURBO_API=https://turborepo.koralle-mgmg.com TURBO_TOKEN=trc_xxx TURBO_TEAM=acme/web pnpm turbo run build
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

- `.github/workflows/ci.yaml`: lint / format / typecheck / knip、Panda codegen 再生成の差分（`apps/web/styled-system.sha256`）、マイグレーション変更禁止、test、build、Storybook build、実 Turborepo E2E。`permissions: contents: read`、PR にシークレットを渡さない。
- `.github/workflows/deploy.yaml`: 手動実行 + environment 承認。`concurrency` で直列化し、migration → API → Web の順に実行。失敗すると後続は実行されない。main push の自動本番デプロイは無い。
- `.github/workflows/react-doctor.yaml`: `doctor.config.ts` の厳しめ設定（全カテゴリ error / `blocking: warning`）で PR の新規指摘と main のスコア推移を出す。

CI では `pnpm install --frozen-lockfile` を使う。

## 本番デプロイ（`turborepo.koralle-mgmg.com`）

ゾーン `koralle-mgmg.com` はユーザーの Cloudflare アカウントにある前提。ホストは 1 つだけ使う。

| パス | Worker | 備考 |
| --- | --- | --- |
| `/v8/*` | `turbo-remote-cache-api` | Turborepo CLI。Web を経由しない |
| `/artifacts/*` | 同上 | 接頭辞なしキャッシュ API |
| `/health` | 同上 | `{ "ok": true }`。認証なし |
| それ以外 | `turbo-remote-cache-web` | 管理 UI。`/api/auth` と `/rpc` は Service Binding |

Custom Domain（`custom_domain: true`）は使わない。ホスト名の全パスが 1 Worker に付くため、同一ホストで `/v8` を分けられない。zone route ならより具体的なパターンが勝つ。route の追加にはそのホストのプロキシ済み DNS が必要なので、初回はプレースホルダレコードを置く。

デプロイそのものは GitHub Actions の **Deploy** ワークフローが行う。このリポジトリから `wrangler deploy`（dry-run 以外）は実行しない。

### 1. Cloudflare リソース（初回）

```sh
npx wrangler login

npx wrangler d1 create turbo-remote-cache
# 出力の database_id を控える

npx wrangler r2 bucket create turbo-remote-cache

npx wrangler r2 bucket lifecycle add turbo-remote-cache \
  --prefix repos/ --expire-days 30
# 保持期間。アプリ側に削除 API は無い

npx wrangler secret put BETTER_AUTH_SECRET -c apps/api/wrangler.jsonc
# 値は openssl rand -base64 32 など。ローカルの .dev.vars とは別の値にする
```

DNS（ダッシュボード → ゾーン `koralle-mgmg.com` → DNS → Records）:

| 項目  | 値                    |
| ----- | --------------------- |
| Type  | `AAAA`                |
| Name  | `turborepo`           |
| IPv6  | `100::`               |
| Proxy | Proxied（オレンジ雲） |

実オリジンは無い。プレースホルダが Cloudflare にリクエストを渡し、Workers route が処理する。既存の CNAME がある場合は消す（route 用の AAAA と衝突する）。

### 2. GitHub の設定（初回）

Settings → Secrets and variables → Actions。Environment は Settings → Environments。

| 種類 | 名前 | 値 |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | 下表の権限を持つトークン |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | アカウント ID |
| Secret | `CLOUDFLARE_DATABASE_ID` | `wrangler d1 create` の `database_id` |
| Variable | `PRODUCTION_WEB_ORIGIN` | `https://turborepo.koralle-mgmg.com` |
| Environment | `production` / `staging` | Required reviewers を設定（承認するまで実行されない） |

`PRODUCTION_WEB_ORIGIN` は Web のホスト名と完全一致させる。Cookie・WebAuthn・Origin 検査・パスキーの RP ID（`turborepo.koralle-mgmg.com`）がすべてこの値に揃う。`prepare-production-config` はこれ以外の値を拒否する。

`staging` を選んでも Worker 名・route・D1 / R2 は本番と同じ。初回は `production` を使う。

#### `CLOUDFLARE_API_TOKEN` の権限

User API Token（My Profile → API Tokens）。Account は対象アカウント、Zone は `koralle-mgmg.com`。

| スコープ | 権限 | 用途 |
| --- | --- | --- |
| Account | Workers Scripts: Edit | Worker の新規作成とデプロイ（初回は未作成のため Edit が必要） |
| Account | D1: Edit | `d1 migrations apply --remote` |
| Account | Workers R2 Storage: Edit | R2 binding 付きのデプロイ |
| Account | Account Settings: Read | `zone_name` からゾーンを引く |
| Zone（`koralle-mgmg.com`） | Workers Routes: Edit | `wrangler.jsonc` の routes を追加・更新 |

DNS レコードはダッシュボードで置くため、トークンに Zone DNS Edit は不要。シークレットの `BETTER_AUTH_SECRET` はローカルの `wrangler secret put` で入れ、トークンでは触らない。

### 3. デプロイ実行

GitHub Actions → **Deploy** → Run workflow → environment を `production` にする → 承認。

順序は固定で、失敗すると後続は実行されない:

1. `scripts/prepare-production-config.ts` — `database_id` と `WEB_ORIGIN` を本番値へ置換（置換対象が無ければ throw。`PRODUCTION_WEB_ORIGIN` がホストと違っても throw）
2. `pnpm db:migrate:remote` — `packages/db/drizzle` を追記適用
3. `pnpm deploy:api` — Service Binding の対象を先に作る
4. `pnpm deploy:web`

ローカルから同じことをする場合（このエージェントは実行しない）:

```sh
CLOUDFLARE_DATABASE_ID=<id> PRODUCTION_WEB_ORIGIN=https://turborepo.koralle-mgmg.com \
  node scripts/prepare-production-config.ts
pnpm db:migrate:remote
pnpm deploy:api
pnpm deploy:web
git checkout -- apps/api/wrangler.jsonc   # 置換結果はコミットしない
```

### 4. 管理者パスキーの登録（初回）

```sh
BETTER_AUTH_SECRET=<本番の値> WEB_ORIGIN=https://turborepo.koralle-mgmg.com pnpm admin:setup
# 表示された https://turborepo.koralle-mgmg.com/setup#token=... を 10 分以内に開き、パスキーを登録する
```

環境変数はコマンドラインで渡す（`.dev.vars` があっても既存の環境変数は上書きされない）。復旧は `pnpm admin:setup -- --reset`。

### 5. API キーと Turborepo の接続

1. `https://turborepo.koralle-mgmg.com` にパスキーでログイン
2. `/keys` でリポジトリ slug（例 `acme/web`）・権限・期限を指定してキーを発行（原文はこの 1 回だけ表示）
3. 利用側リポジトリの CI に設定:

```sh
TURBO_API=https://turborepo.koralle-mgmg.com
TURBO_TOKEN=trc_xxx
TURBO_TEAM=acme/web
```

### 6. デプロイ後の確認

```sh
curl -s https://turborepo.koralle-mgmg.com/health
# {"ok":true}

curl -s -H "Authorization: Bearer $TURBO_TOKEN" \
  https://turborepo.koralle-mgmg.com/v8/artifacts/status
# {"status":"enabled"}

curl -s -o /dev/null -w '%{http_code}\n' https://turborepo.koralle-mgmg.com/
# 200（管理 UI）
```

- パスキーでログインでき、`/keys` で発行・失効できる
- 実リポジトリで `pnpm turbo run build` を 2 回実行し、2 回目がリモート HIT になる（`--force` でミス時に PUT、出力削除で復元）
- 失効したキーが 401、読み取り専用キーでの PUT が 403 になる
- `/health` が Web の HTML ではなく `{"ok":true}` なら、API 側のより具体的な route が当たっている

### 7. ロールバック

```sh
npx wrangler rollback -c apps/api/wrangler.jsonc   # 直前のバージョンに戻す
npx wrangler rollback -c apps/web/wrangler.jsonc
```

DB は追記型マイグレーションのみなので巻き戻さない。アプリを戻しても旧スキーマで動く変更だけを入れる。route は Worker バージョンとは別に残る。

### 注意点

- `wrangler.jsonc` の `database_id` はリポジトリ上ダミー値。`prepare-production-config` を通さずにデプロイすると失敗する（意図したフェイルセーフ）
- `BETTER_AUTH_SECRET` を変更すると既存セッションとパスキー登録用トークンが無効になる。`admin:setup` で再登録が必要
- 本番では `WEB_ORIGIN` を固定する。空のままだとリクエストのオリジンを使うため、公衆経由で任意オリジンが通ってしまう
- 初回デプロイ前に `turborepo` のプロキシ済み DNS が無いと、`wrangler deploy` の route 追加が失敗する
- `compatibility_date` は 2026-11-07。`nodejs_compat` は不要だったため付けていない

## コマンド

| コマンド | 内容 |
| --- | --- |
| `pnpm dev` | Web（portless）+ API を同時起動 |
| `PORTLESS=0 pnpm dev` | portless を迂回し、Web を port 3000 で起動 |
| `pnpm build` | Web のビルド |
| `pnpm test` | Vitest（pure / Workers 統合） |
| `pnpm typecheck` | tsrs |
| `pnpm check` | types / generate / typecheck / lint / format / Knip / React Doctor |
| `pnpm fix` | lint 自動修正 + format |
| `pnpm knip` | 未使用の依存・export・catalog |
| `pnpm run doctor` | React Doctor（React 静的診断）。pre-commit では `--staged` で実行。同じルールは `oxlint.config.ts` の `jsPlugins` で oxlint からも走る。`pnpm doctor` は pnpm 組み込みコマンドなので `run` が必要 |
| `pnpm generate` | Panda codegen と再生成ハッシュの更新 |
| `pnpm spec:update` | Turborepo OpenAPI の再取得 |
| `pnpm storybook` / `pnpm storybook:build` | Storybook |
| `pnpm e2e` | 実 Turborepo の E2E |
| `./e2e/dev-smoke.sh` | `pnpm dev` の D1 migrate と `/v8` 転送を確認（dev 起動中は不可） |
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
- Turborepo の公開経路は同一ホストの zone route。大きいバイナリを Web に通さない。
- 詳細と比較表は `docs/design.md`。
