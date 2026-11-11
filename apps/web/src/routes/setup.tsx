import { createFileRoute } from "@tanstack/react-router";
import { useState, useSyncExternalStore } from "react";

import { authClient } from "../auth-client";
import { PagePending } from "../components/page-pending";
import { SetupPanel } from "../components/setup-panel";

// トークンは URL フラグメントにあり、サーバーには送られないためクライアントで読む。
const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);

  return () => {
    window.removeEventListener("hashchange", onChange);
  };
};

const readHash = (): string | null => window.location.hash;

const tokenFromHash = (hash: string | null): string | null | undefined => {
  if (hash === null) {
    return undefined;
  }

  return hash.startsWith("#token=") ? decodeURIComponent(hash.slice(7)) : null;
};

const SetupRoute = () => {
  // サーバー描画では null。ハッシュが読めるまで「トークンなし」と断定しない
  // （SSR した HTML に誤ったエラーを出さない）。
  const hash = useSyncExternalStore(subscribeHash, readHash, () => null);
  const token = tokenFromHash(hash);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = async () => {
    if (token === null || token === undefined || pending) {
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

      // better-auth は失敗を throw せず返す。早期 return せず必ず下で pending を戻す。
      if (result.error) {
        setError(result.error.message ?? "パスキーを登録できませんでした");
      } else {
        // セッション Cookie を確実に反映させるため、ここだけは全読み込みする。
        window.location.assign("/keys");
      }
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message
          : "パスキーを登録できませんでした"
      );
    }

    setPending(false);
  };

  if (token === undefined) {
    return <PagePending />;
  }

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
