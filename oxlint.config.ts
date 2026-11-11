import { defineConfig } from "oxlint";
import {
  RECOMMENDED_RULES,
  TANSTACK_QUERY_RULES,
  TANSTACK_START_RULES,
} from "oxlint-plugin-react-doctor";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import drizzle from "ultracite/oxlint/drizzle";
import react from "ultracite/oxlint/react";
import storybook from "ultracite/oxlint/storybook";
import tanstack from "ultracite/oxlint/tanstack";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, antiSlop, tanstack, react, drizzle, storybook, vitest],
  // React Doctor のルールを oxlint 側でも有効にする（CLI とは別経路）。
  jsPlugins: [
    { name: "react-doctor", specifier: "oxlint-plugin-react-doctor" },
  ],
  rules: {
    ...RECOMMENDED_RULES,
    ...TANSTACK_START_RULES,
    ...TANSTACK_QUERY_RULES,
    // スタンドアロンでは memo() 判定ができず誤検知する（実体は
    // react-doctor/no-inline-prop-on-memo-component が担う）。
    "react-doctor/jsx-no-new-function-as-prop": "off",
    "react-doctor/jsx-no-new-array-as-prop": "off",
  },
  overrides: [
    {
      // TanStack Router のルートファイルは Route だけを export する規約。
      files: ["apps/web/src/routes/**"],
      rules: { "react-doctor/only-export-components": "off" },
    },
  ],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "**/*.gen.ts",
    "**/worker-configuration.d.ts",
    "packages/api-contract/src/turborepo",
    "packages/web/styled-system",
  ],
});
