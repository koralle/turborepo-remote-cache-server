import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: { path: "./spec/turborepo-remote-cache.openapi.json" },
  output: { path: "src/turborepo", clean: true },
  plugins: ["@hey-api/typescript", "valibot"],
});
