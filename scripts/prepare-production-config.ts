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
  config = config.replaceAll(
    '"BETTER_AUTH_URL": "http://localhost:3000"',
    `"BETTER_AUTH_URL": "${origin}"`
  );
  config = config.replaceAll(
    '"WEB_ORIGIN": "http://localhost:3000"',
    `"WEB_ORIGIN": "${origin}"`
  );
  await writeFile(file, config);
};

await Promise.all(
  ["apps/api/wrangler.jsonc", "apps/web/wrangler.jsonc"].map(rewrite)
);
