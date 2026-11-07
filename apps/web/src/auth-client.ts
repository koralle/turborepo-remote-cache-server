import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

// baseURL を渡さない場合、ブラウザでは現在のオリジンの /api/auth を使う。
export const authClient = createAuthClient({ plugins: [passkeyClient()] });
