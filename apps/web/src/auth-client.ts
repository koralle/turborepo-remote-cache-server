import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

const baseURL =
  typeof window === "undefined"
    ? "http://localhost:3000"
    : window.location.origin;

export const authClient = createAuthClient({
  baseURL,
  plugins: [passkeyClient()],
});
