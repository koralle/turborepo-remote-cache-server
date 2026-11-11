import { Button } from "react-aria-components";

import { css } from "../../styled-system/css";

interface SetupPanelProps {
  error: string | null;
  hasToken: boolean;
  onRegister: () => Promise<void>;
  pending: boolean;
}

export const SetupPanel = ({
  error,
  hasToken,
  onRegister,
  pending,
}: SetupPanelProps) => (
  <main
    className={css({
      margin: "0 auto",
      maxWidth: "32rem",
      padding: "3rem 1.5rem",
    })}
  >
    <h1 className={css({ fontSize: "1.5rem", marginBottom: "0.5rem" })}>
      管理者パスキーの登録
    </h1>
    {hasToken ? (
      <>
        <p className={css({ color: "gray.600", marginBottom: "1.5rem" })}>
          この端末のパスキーを登録します。登録するとログインできます。
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
            onRegister();
          }}
        >
          {pending ? "登録中…" : "パスキーを登録"}
        </Button>
      </>
    ) : (
      <p className={css({ color: "red.600" })} role="alert">
        セットアップトークンが URL に含まれていません。`pnpm admin:setup`
        で発行した URL を開いてください。
      </p>
    )}
    {error === null ? null : (
      <p className={css({ color: "red.600", marginTop: "1rem" })} role="alert">
        {error}
      </p>
    )}
  </main>
);
