import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { authClient } from "../auth-client";
import { LoginPanel } from "../components/login-panel";
import { PagePending } from "../components/page-pending";

const LoginRoute = () => {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // サインイン処理中は下の明示的な遷移に任せ、遷移元を二重に持たない。
    if (pending || isPending || session === null) {
      return;
    }

    void navigate({ replace: true, to: "/keys" });
  }, [isPending, navigate, pending, session]);

  const signIn = async () => {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const result = await authClient.signIn.passkey({ autoFill: false });

      // better-auth は失敗を throw せず返す。早期 return せず必ず下で pending を戻す。
      if (result.error) {
        setError(result.error.message ?? "パスキーでログインできませんでした");
      } else {
        await navigate({ replace: true, to: "/keys" });
      }
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message
          : "パスキーでログインできませんでした"
      );
    }

    setPending(false);
  };

  // セッションが判明している場合だけリダイレクト待ちとして中身を伏せる。
  // 未ログインの訪問者（この画面の主な利用者）に往復ぶんの待ちを見せない。
  if (session !== null) {
    return <PagePending />;
  }

  return <LoginPanel error={error} onSignIn={signIn} pending={pending} />;
};

export const Route = createFileRoute("/")({ component: LoginRoute });
