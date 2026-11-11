import { execFileSync } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import { signSetupToken } from "@repo/domain/setup-token";

const appName = "turbo-cache";
const tokenLifetimeMs = 10 * 60 * 1000;

const git = (args: string[]): string =>
  execFileSync("git", args, { encoding: "utf-8" }).trim();

// portless と同じ規則（アプリ名、リンクされた worktree ではブランチ名の最終セグメント）で
// 開発中の URL を求める。本番や別のオリジンは WEB_ORIGIN で上書きする。
const devOrigin = (): string => {
  const plain = `https://${appName}.localhost`;

  try {
    const [gitDir = "", commonDir = ""] = git([
      "rev-parse",
      "--git-dir",
      "--git-common-dir",
    ]).split("\n");

    if (gitDir === "" || path.resolve(gitDir) === path.resolve(commonDir)) {
      return plain;
    }

    const label = git(["rev-parse", "--abbrev-ref", "HEAD"]).split("/").at(-1);

    return label === undefined || label === "" || label === "HEAD"
      ? plain
      : `https://${label}.${appName}.localhost`;
  } catch {
    return plain;
  }
};

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

  if (secret === undefined || secret === "") {
    throw new Error("BETTER_AUTH_SECRET が必要（環境変数か .dev.vars）");
  }

  const configured = process.env["WEB_ORIGIN"];

  const webOrigin =
    configured === undefined || configured === "" ? devOrigin() : configured;

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
