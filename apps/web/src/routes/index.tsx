import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { authClient } from "../auth-client";
import { LoginPanel } from "../components/login-panel";

const LoginRoute = () => {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending && session !== null) {
      void navigate({ to: "/keys" });
    }
  }, [isPending, navigate, session]);

  const signIn = async () => {
    setPending(true);
    setError(null);

    try {
      const result = await authClient.signIn.passkey({ autoFill: false });

      if (result.error) {
        setError(result.error.message ?? "パスキーでログインできませんでした");

        return;
      }

      await navigate({ to: "/keys" });
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message
          : "パスキーでログインできませんでした"
      );
    }

    setPending(false);
  };

  return <LoginPanel error={error} onSignIn={signIn} pending={pending} />;
};

export const Route = createFileRoute("/")({ component: LoginRoute });
