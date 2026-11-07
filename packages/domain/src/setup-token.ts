import * as v from "valibot";

const payloadSchema = v.object({
  email: v.string(),
  exp: v.number(),
  reset: v.boolean(),
});

export type SetupTokenPayload = v.InferOutput<typeof payloadSchema>;

const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/[=]+$/u, "");

const fromBase64Url = (value: string): Uint8Array => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return Uint8Array.from(atob(padded), (char) => char.codePointAt(0) ?? 0);
};

const importKey = async (secret: string, usages: ("sign" | "verify")[]) =>
  await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );

const signatureOf = async (
  secret: string,
  body: string
): Promise<Uint8Array> => {
  const key = await importKey(secret, ["sign"]);
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(body))
  );
};

const readPayload = (value: unknown): SetupTokenPayload | null => {
  const parsed = v.safeParse(payloadSchema, value);
  return parsed.success ? parsed.output : null;
};

export const signSetupToken = async (
  secret: string,
  payload: SetupTokenPayload
): Promise<string> => {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${toBase64Url(await signatureOf(secret, body))}`;
};

export const verifySetupToken = async (
  secret: string,
  token: string,
  now: number
): Promise<SetupTokenPayload | null> => {
  const [body, signature] = token.split(".");
  if (
    body === undefined ||
    signature === undefined ||
    body === "" ||
    signature === ""
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
  } catch {
    return null;
  }

  const payload = readPayload(parsed);
  if (!payload || payload.exp <= now) {
    return null;
  }

  const key = await importKey(secret, ["verify"]);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    new Uint8Array(fromBase64Url(signature)),
    encoder.encode(body)
  );
  return valid ? payload : null;
};
