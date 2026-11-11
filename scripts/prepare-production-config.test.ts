import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { applyProductionConfig } from "./prepare-production-config.ts";
import {
  productionHostname,
  productionWebOrigin,
  productionZoneName,
} from "./production.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const readRepo = async (relative: string): Promise<string> =>
  await readFile(path.join(repoRoot, relative), "utf-8");

describe("prepare-production-config", () => {
  it("database_id と WEB_ORIGIN を本番値へ置換する", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "prepare-production-"));

    try {
      const file = path.join(dir, "wrangler.jsonc");
      await writeFile(file, await readRepo("apps/api/wrangler.jsonc"));

      await applyProductionConfig(
        file,
        "11111111-1111-1111-1111-111111111111",
        productionWebOrigin
      );

      const written = await readFile(file, "utf-8");
      expect(written).toContain(
        '"database_id": "11111111-1111-1111-1111-111111111111"'
      );
      expect(written).toContain(`"WEB_ORIGIN": "${productionWebOrigin}"`);
      expect(written).not.toContain(
        '"database_id": "00000000-0000-0000-0000-000000000000"'
      );
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("PRODUCTION_WEB_ORIGIN が本番ホストと違うと失敗する", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "prepare-production-"));

    try {
      const file = path.join(dir, "wrangler.jsonc");
      await writeFile(file, await readRepo("apps/api/wrangler.jsonc"));

      await expect(
        applyProductionConfig(
          file,
          "11111111-1111-1111-1111-111111111111",
          "https://admin.example.com"
        )
      ).rejects.toThrow(productionWebOrigin);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("置換対象が無いと失敗する", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "prepare-production-"));

    try {
      const file = path.join(dir, "wrangler.jsonc");
      await writeFile(
        file,
        `{
  "routes": [
    { "pattern": "${productionHostname}/v8/*" },
    { "pattern": "${productionHostname}/artifacts/*" },
    { "pattern": "${productionHostname}/health" }
  ],
  "vars": { "WEB_ORIGIN": "https://already-set.example" }
}`
      );

      await expect(
        applyProductionConfig(
          file,
          "11111111-1111-1111-1111-111111111111",
          productionWebOrigin
        )
      ).rejects.toThrow("置換対象が無い");
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});

describe("本番 routes", () => {
  it("API はより具体的なパスを同じゾーンに付ける", async () => {
    const api = await readRepo("apps/api/wrangler.jsonc");

    expect(api).toContain(`"pattern": "${productionHostname}/v8/*"`);
    expect(api).toContain(`"pattern": "${productionHostname}/artifacts/*"`);
    expect(api).toContain(`"pattern": "${productionHostname}/health"`);
    expect(api).toContain(`"zone_name": "${productionZoneName}"`);
  });

  it("Web は catch-all を同じゾーンに付ける", async () => {
    const web = await readRepo("apps/web/wrangler.jsonc");

    expect(web).toContain(`"pattern": "${productionHostname}/*"`);
    expect(web).toContain(`"zone_name": "${productionZoneName}"`);
  });
});
