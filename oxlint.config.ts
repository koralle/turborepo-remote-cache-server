import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import drizzle from "ultracite/oxlint/drizzle";
import react from "ultracite/oxlint/react";
import storybook from "ultracite/oxlint/storybook";
import tanstack from "ultracite/oxlint/tanstack";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, antiSlop, tanstack, react, drizzle, storybook, vitest],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    "**/*.gen.ts",
    "**/worker-configuration.d.ts",
    "packages/api-contract/src/turborepo",
    "packages/web/styled-system",
  ],
});
