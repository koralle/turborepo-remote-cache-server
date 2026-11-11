/* oxlint-disable typescript/no-deprecated -- テスト用の env は cloudflare:test から取得する */
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, inject } from "vitest";

beforeAll(async () => {
  await applyD1Migrations(env.DB, inject("migrations"));
});
