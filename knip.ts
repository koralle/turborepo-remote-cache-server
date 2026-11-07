import { defineConfig } from "knip/config";

export default defineConfig({
  ignoreDependencies: ["@repo/forge", "@tsconfig/strictest", "turbo"],
  workspaces: {
    ".": {
      entry: [],
      project: [],
    },
  },
});
