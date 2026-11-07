import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const { PATH: pathEnv } = process.env;

const run = (env: Record<string, string>) =>
  spawnSync(process.execPath, ["scripts/admin-setup.ts"], {
    cwd,
    encoding: "utf-8",
    env: { PATH: pathEnv ?? "", ...env },
    input: "admin@example.com\n",
  });

describe("admin:setup", () => {
  it("メールアドレスからセットアップ URL を出力する", () => {
    const result = run({
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
      WEB_ORIGIN: "http://localhost:3000",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("http://localhost:3000/setup#token=");
  });

  it("WEB_ORIGIN が無ければ失敗する", () => {
    const result = run({
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("WEB_ORIGIN");
  });
});
