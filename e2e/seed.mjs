import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

const key = `e2e_${randomUUID().replaceAll("-", "")}`;
const hashed = createHash("sha256").update(key).digest("base64url");
const now = Date.now();
const repositoryId = "e2e-repository";
const userId = "e2e-user";
const keyId = "e2e-key";

const sql = `DELETE FROM apikey WHERE id = '${keyId}';
DELETE FROM repositories WHERE id = '${repositoryId}';
DELETE FROM user WHERE id = '${userId}';
INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
  VALUES ('${userId}', 'e2e', 'e2e@example.com', 1, ${now}, ${now});
INSERT INTO repositories (id, slug, team_id, created_at)
  VALUES ('${repositoryId}', 'e2e/repo', NULL, ${now});
INSERT INTO apikey (id, config_id, name, start, prefix, key, reference_id, enabled, rate_limit_enabled, request_count, created_at, updated_at, expires_at, permissions, metadata)
  VALUES ('${keyId}', 'default', 'e2e', '${key.slice(0, 8)}', NULL, '${hashed}', '${userId}', 1, 0, 0, ${now}, ${now}, ${now + 86_400_000}, '{"cache":["read","write"]}', '{"repositoryId":"${repositoryId}","scope":"read-write"}');
`;

await writeFile(new URL(".seed.sql", import.meta.url), sql);
console.log(key);
