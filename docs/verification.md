# 検証記録（2026-11-07）

実行環境: macOS / Node.js 26.9.0（要件は 24 以上）/ pnpm 12.14.0 / Chrome 156（headless, CDP）。

## ローカル開発（クリーン状態）

`apps/web/.wrangler` と `apps/api/.wrangler` を削除した状態から実行。

| 操作 | 結果 |
| --- | --- |
| `pnpm dev` | Vite が port 3000 で起動。起動時に `apps/web/.wrangler/state/v3` を migrate |
| `GET /api/auth/passkey/generate-authenticate-options` | 200（`rpId: "localhost"` と challenge） |
| `TURBO_API=http://localhost:3000` で `GET /v8/artifacts/status` | 200 |
| 同 `PUT /v8/artifacts/{hash}` | 202 |
| 同 `GET /v8/artifacts/{hash}` | 200 |
| `./e2e/dev-smoke.sh`（上記を自動化） | 成功（passkey options 200 / status 200 / PUT 202 / GET 200） |

Web の server entry が `/v8` と `/artifacts` を Service Binding で API に転送するため、ローカル CLI は port 3000 で接続できる。

## portless（追記）

443 と証明書を触らずに確認するため `PORTLESS_HTTPS=0 PORTLESS_PORT=8080` で実行した（`--name turbo-cache` は `apps/web/package.json` の `dev` と同じ）。

| 操作 | 結果 |
| --- | --- |
| 起動ログ | `PORT=4833 … PORTLESS_URL=http://implement-poc.turbo-cache.localhost:8080 vite --config vite.app.config.ts --port 4833 --strictPort --host 127.0.0.1`（url は worktree のブランチ名が前置される） |
| `GET /api/auth/passkey/generate-authenticate-options`（プロキシ経由） | 200（`rpId: "implement-poc.turbo-cache.localhost"`）。Service Binding 越しでもリクエストのオリジンが保たれる |
| 同（Vite 直 `127.0.0.1:4833`） | 200（`rpId: "127.0.0.1"`）。オリジンはリクエストから求まる |
| `GET /` | 200 |
| `ws://…/`（`vite-hmr`） | 接続成立（HMR の WebSocket もプロキシを通る） |
| `GET /v8/artifacts/status` / `PUT /v8/artifacts/abc123` / 同 `GET` | 200 / 202 / 200（seed 済み API キー） |
| `pnpm test` / `pnpm typecheck` / `pnpm run types` / Oxlint / Oxfmt / Knip | 成功（51 テスト） |

## ブラウザ（Chrome 仮想認証器）

Chrome DevTools Protocol の `WebAuthn.addVirtualAuthenticator`（ctap2 / internal / resident key）を使い、実ブラウザで次を確認した。

| 手順 | 結果 |
| --- | --- |
| `pnpm admin:setup` の URL を `/setup#token=...` で開き「パスキーを登録」 | `/keys` に遷移（登録成功） |
| 管理 API でキー発行 → そのキーで `/v8/artifacts/status` | 発行 200 / status 200 |
| サインアウト → 「パスキーでログイン」 | `/keys` に遷移（ログイン成功） |
| 管理 UI のフォームにリポジトリを入力して「API キーを発行」 | キーが一度だけ表示され、一覧にリポジトリが出る |
| 発行したキーで `/v8/artifacts/status` | 200 |
| 一覧の「失効」を押す | 同じキーで `/v8/artifacts/status` が 401 |

## 自動検証

| コマンド | 結果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 成功 |
| `pnpm run check`（wrangler types / Panda codegen / tsrs / Oxlint / Oxfmt / Knip） | 成功 |
| `pnpm test` | 6 ファイル / 51 テスト成功 |
| `pnpm run build` | 成功 |
| `pnpm run storybook:build` | 成功 |
| `./e2e/run.sh` | 成功（初回ミス→保存、出力削除から復元、ソース変更でミス、署名不一致の不採用） |
| `./scripts/check-migrations.sh HEAD` | 成功（既存 SQL の変更なし） |
| `pnpm spec:update` | 成功（sha256 `d6ec728d…` を再記録） |
| `wrangler deploy --dry-run`（API） | 成功（D1 / R2 / vars の binding を解決） |
| `wrangler deploy --dry-run`（Web） | 成功（API の Service Binding / vars を解決） |
| GitHub Actions（PR #1） | `verify` 59 秒 / `e2e` 22 秒で成功 |

## 未検証

- portless の既定構成（443 + ローカル CA）でのブラウザ操作とパスキーの登録・ログイン。
- `./e2e/dev-smoke.sh`（port 3000 が他プロセスで使用中だったため未実行）。
- GitHub Actions 上での実行（git remote が未設定）。
- 本番 Cloudflare へのデプロイ（有料リソース作成の承認待ち）。
- push / PR 作成（remote 未設定）。
