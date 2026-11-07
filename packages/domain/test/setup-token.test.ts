import { describe, expect, it } from "vitest";

import { signSetupToken, verifySetupToken } from "../src/setup-token.ts";

const secret = "test-secret-test-secret-test-secret";

describe("setup token", () => {
  it("署名した内容を検証できる", async () => {
    const exp = Date.now() + 60_000;
    const token = await signSetupToken(secret, {
      email: "a@example.com",
      exp,
      reset: false,
    });
    await expect(
      verifySetupToken(secret, token, Date.now())
    ).resolves.toStrictEqual({
      email: "a@example.com",
      exp,
      reset: false,
    });
  });

  it("期限切れを拒否する", async () => {
    const exp = Date.now() - 1;
    const token = await signSetupToken(secret, {
      email: "a@example.com",
      exp,
      reset: false,
    });
    await expect(
      verifySetupToken(secret, token, Date.now())
    ).resolves.toBeNull();
  });

  it("改ざんと別の鍵を拒否する", async () => {
    const token = await signSetupToken(secret, {
      email: "a@example.com",
      exp: Date.now() + 60_000,
      reset: false,
    });
    await expect(
      verifySetupToken(secret, `${token}x`, Date.now())
    ).resolves.toBeNull();
    await expect(
      verifySetupToken("another-secret-another-secret", token, Date.now())
    ).resolves.toBeNull();
  });
});
