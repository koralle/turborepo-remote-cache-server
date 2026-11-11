import { Button } from "react-aria-components";

import { css } from "../../styled-system/css";

interface LoginPanelProps {
  error: string | null;
  onSignIn: () => Promise<void>;
  pending: boolean;
}

export const LoginPanel = ({ error, onSignIn, pending }: LoginPanelProps) => (
  <main
    className={css({
      margin: "0 auto",
      maxWidth: "32rem",
      padding: "3rem 1.5rem",
    })}
  >
    <h1 className={css({ fontSize: "1.5rem", marginBottom: "0.5rem" })}>
      Turborepo Remote Cache
    </h1>
    <p className={css({ color: "gray.600", marginBottom: "1.5rem" })}>
      管理者パスキーでログインしてください。
    </p>
    <Button
      className={css({
        background: "gray.900",
        borderRadius: "0.375rem",
        color: "white",
        padding: "0.5rem 1rem",
      })}
      isDisabled={pending}
      onPress={() => {
        // ルート側でエラーを処理するため、ここでは結果を待たない。
        // oxlint-disable-next-line typescript/no-floating-promises
        onSignIn();
      }}
    >
      {pending ? "確認中…" : "パスキーでログイン"}
    </Button>
    {error === null ? null : (
      <p className={css({ color: "red.600", marginTop: "1rem" })} role="alert">
        {error}
      </p>
    )}
  </main>
);
