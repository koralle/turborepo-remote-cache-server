import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { productionHostname, productionWebOrigin } from "./production.ts";

const apiConfigPath = "apps/api/wrangler.jsonc";

export const applyProductionConfig = async (
  file: string,
  databaseId: string,
  origin: string
): Promise<void> => {
  if (databaseId === "") {
    throw new Error("CLOUDFLARE_DATABASE_ID が必要");
  }

  if (origin !== productionWebOrigin) {
    throw new Error(
      `PRODUCTION_WEB_ORIGIN は ${productionWebOrigin} である必要がある（パスキー RP ID と routes がこのホストに固定）`
    );
  }

  const original = await readFile(file, "utf-8");

  if (
    !original.includes(`"${productionHostname}/v8/*"`) ||
    !original.includes(`"${productionHostname}/artifacts/*"`) ||
    !original.includes(`"${productionHostname}/health"`)
  ) {
    throw new Error(
      `${file} の routes が ${productionHostname} のパス分割と一致しない`
    );
  }

  const replacements: [from: string, to: string][] = [
    [
      '"database_id": "00000000-0000-0000-0000-000000000000"',
      `"database_id": "${databaseId}"`,
    ],
    ['"WEB_ORIGIN": ""', `"WEB_ORIGIN": "${origin}"`],
  ];

  let config = original;

  // 置換対象が消えたまま本番へ出るのを防ぐ。
  for (const [from, to] of replacements) {
    if (!config.includes(from)) {
      throw new Error(`${file} に置換対象が無い: ${from}`);
    }

    config = config.replaceAll(from, to);
  }

  await writeFile(file, config);
};

const applyFromEnv = async (): Promise<void> => {
  const { CLOUDFLARE_DATABASE_ID: databaseId, PRODUCTION_WEB_ORIGIN: origin } =
    process.env;

  if (databaseId === undefined) {
    throw new Error("CLOUDFLARE_DATABASE_ID が必要");
  }

  if (origin === undefined) {
    throw new Error("PRODUCTION_WEB_ORIGIN は https:// で始まる必要がある");
  }

  await applyProductionConfig(apiConfigPath, databaseId, origin);
};

const isExecutedDirectly = (): boolean => {
  const [, entry] = process.argv;

  if (entry === undefined) {
    return false;
  }

  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
};

if (isExecutedDirectly()) {
  try {
    await applyFromEnv();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
