import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { authClient } from "../auth-client";
import { SetupPanel } from "../components/setup-panel";

const SetupRoute = () => {
  const [token, setToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // トークンは URL フラグメントにあり、サーバーには送られないためクライアントで読む。
    const { hash } = window.location;
    // oxlint-disable-next-line react/set-state-in-effect
    setToken(
      hash.startsWith("#token=") ? decodeURIComponent(hash.slice(7)) : null
    );
  }, []);

  const register = async () => {
    if (token === null) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const result = await authClient.passkey.addPasskey({
        context: token,
        createSession: true,
        name: "管理者パスキー",
      });

      if (result.error) {
        setError(result.error.message ?? "パスキーを登録できませんでした");

        return;
      }

      window.location.assign("/keys");
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message
          : "パスキーを登録できませんでした"
      );
    }

    setPending(false);
  };

  return (
    <SetupPanel
      error={error}
      hasToken={token !== null}
      onRegister={register}
      pending={pending}
    />
  );
};

export const Route = createFileRoute("/setup")({ component: SetupRoute });
