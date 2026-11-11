import { defineConfig } from "react-doctor/api";

export default defineConfig({
  // ビルド成果物（gitignore 対象）を診断しない。ソースマップ内の
  // ライブラリ由来の文字列を artifact-secret-leak が拾うため。
  ignore: { files: ["dist/**"] },
  // 厳しめ: warning でも失敗させる（CLI / CI / pre-commit 共通）。
  blocking: "warning",
  // 既定 warn のルールを全カテゴリ error に引き上げる。
  categories: {
    Security: "error",
    Bugs: "error",
    Performance: "error",
    Accessibility: "error",
    Maintainability: "error",
  },
  rules: {
    // 既定で無効な pnpm ハードニング検査を有効化する。
    "react-doctor/require-pnpm-hardening": "error",
  },
  // 依存のサプライチェーン評価を既定の 50 から引き上げる。
  supplyChain: { minScore: 60 },
  // テスト / Story の指摘も CI ゲートに含める。
  surfaces: {
    ciFailure: { includeFileContexts: ["test", "story"] },
  },
});
