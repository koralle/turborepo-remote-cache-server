# OpenAPI 生成の対応範囲

生成コマンド: `pnpm generate`（`packages/api-contract`）。仕様の再取得は `pnpm spec:update`。
生成物 `src/turborepo/` は手で編集しない。

## 生成できているもの

- 全パス・メソッドの操作型（`GetArtifactStatusData` など）と応答型
- 定義スキーマ（`CachingStatus`、`ArtifactInfo`、`CacheEvent`、`Error` など）
- リクエスト層の Valibot スキーマ（path / query / headers / body）と応答スキーマ
  - 例: `vUploadArtifactHeaders`（`x-artifact-tag` の 600 文字上限を含む）、`vDownloadArtifactPath`（16 進数のみ）

## 生成できない、または補完が必要なもの

| 仕様要素 | 生成結果 | 補完 |
| --- | --- | --- |
| `ArtifactQueryResponse`（`additionalProperties` + `oneOf` + `nullable`） | `v.object({})`（型は正しい） | `src/supplemental.ts` の `vArtifactQueryMap` |
| バイナリ本文（`application/octet-stream`、`format: binary`） | `v.string()` | 使用しない。`request.body` / `R2ObjectBody.body` をストリームとして扱う |
| ヘッダーの数値（`Content-Length`、`x-artifact-duration`） | `v.number()` | HTTP ヘッダーは文字列で届くため、境界で変換してから検証する |
| `HEAD /artifacts/{hash}` の応答 | 本文なしの 200 とヘッダーのみ | 生成スキーマは使わず、R2 の `head` から直接組み立てる |
| 403 の本文形式 | 仕様は `{ code, message }` | 実クライアントは `{ error: { code, message } }` を読む。両方を含めて返す（`docs/research-notes.md` 参照） |
| 一括照会の `sha` / `dirtyHash` | 仕様に無い | クライアントが読むため応答に追加する（`vArtifactQueryEntry`） |

## 生成設定

`openapi-ts.config.ts`: `plugins: ["@hey-api/typescript", "valibot"]`。SDK・API クライアントは生成しない（サーバー実装のみが必要なため）。
