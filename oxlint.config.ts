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
  },
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "**/*.gen.ts",
    "**/worker-configuration.d.ts",
    "packages/api-contract/src/turborepo",
    "packages/web/styled-system",
  ],
});
