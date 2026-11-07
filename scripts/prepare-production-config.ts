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
  let config = await readFile(file, "utf-8");
  config = config.replaceAll(
    '"database_id": "00000000-0000-0000-0000-000000000000"',
    `"database_id": "${databaseId}"`
  );
  config = config.replaceAll('"WEB_ORIGIN": ""', `"WEB_ORIGIN": "${origin}"`);
  await writeFile(file, config);
};

await rewrite("apps/api/wrangler.jsonc");
