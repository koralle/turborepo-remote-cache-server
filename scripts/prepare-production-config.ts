import { readFile, writeFile } from "node:fs/promises";

const { CLOUDFLARE_DATABASE_ID: databaseId, PRODUCTION_WEB_ORIGIN: origin } =
  process.env;

if (databaseId === undefined || databaseId === "") {
  throw new Error("CLOUDFLARE_DATABASE_ID が必要");
}

if (origin === undefined || !origin.startsWith("https://")) {
  throw new Error("PRODUCTION_WEB_ORIGIN は https:// で始まる必要がある");
}

const rewrite = async (file: string): Promise<void> => {
  const original = await readFile(file, "utf-8");

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

await rewrite("apps/api/wrangler.jsonc");
