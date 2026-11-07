import { createInterface } from "node:readline/promises";

import { signSetupToken } from "@repo/domain/setup-token";

const tokenLifetimeMs = 10 * 60 * 1000;

const ask = async (question: string): Promise<string> => {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await terminal.question(question);
  } finally {
    terminal.close();
  }
};

const main = async (): Promise<void> => {
  const secret = process.env["BETTER_AUTH_SECRET"];
  const webOrigin = process.env["WEB_ORIGIN"];
  if (secret === undefined || secret === "") {
    throw new Error("BETTER_AUTH_SECRET が必要（環境変数か .dev.vars）");
  }
  if (webOrigin === undefined || webOrigin === "") {
    throw new Error("WEB_ORIGIN が必要（例: https://admin.example.com）");
  }

  const answer = await ask("管理者のメールアドレス: ");
  const email = answer.trim();
  if (!/^[^@\s]+@[^@\s]+$/u.test(email)) {
    throw new Error("メールアドレスの形式が不正");
  }

  const reset = process.argv.includes("--reset");
  const token = await signSetupToken(secret, {
    email,
    exp: Date.now() + tokenLifetimeMs,
    reset,
  });
  console.log(
    `\n10 分以内に次の URL を開き、パスキーを登録する:\n\n${webOrigin}/setup#token=${token}\n`
  );
};

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
