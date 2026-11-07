import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          environment: "node",
          include: ["packages/*/test/**/*.test.ts"],
          name: "unit",
        },
      },
      {
        test: {
          environment: "node",
          include: ["apps/api/test-node/**/*.test.ts"],
          name: "node",
        },
      },
      {
        plugins: [
          cloudflareTest({
            miniflare: {
              bindings: {
                BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
                BETTER_AUTH_URL: "http://localhost:3000",
                MAX_ARTIFACT_BYTES: "16",
                WEB_ORIGIN: "http://localhost:3000",
              },
            },
            wrangler: { configPath: "./apps/api/wrangler.jsonc" },
          }),
        ],
        test: {
          globalSetup: ["./apps/api/test/global-setup.ts"],
          include: ["apps/api/test/**/*.test.ts"],
          name: "workers",
          setupFiles: ["./apps/api/test/setup.ts"],
        },
      },
    ],
  },
});
