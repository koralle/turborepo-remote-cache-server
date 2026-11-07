import type { KeySummary } from "@repo/api-contract";
import { Button } from "react-aria-components";

import { css } from "../../styled-system/css";

interface KeyTableProps {
  keys: KeySummary[];
  onRevoke: (id: string) => void;
  revoking: readonly string[];
}

const formatDate = (value: string | null): string =>
  value === null ? "—" : new Date(value).toLocaleString("ja-JP");

const cell = css({ borderBottom: "1px solid gray.200", padding: "0.5rem" });
const headCell = css({ borderBottom: "1px solid gray.300", padding: "0.5rem" });

export const KeyTable = ({ keys, onRevoke, revoking }: KeyTableProps) => {
  const revokingIds = new Set(revoking);

  if (keys.length === 0) {
    return (
      <p className={css({ color: "gray.600" })}>API キーはまだありません。</p>
    );
  }

  return (
    <table className={css({ borderCollapse: "collapse", width: "100%" })}>
      <thead>
        <tr className={css({ textAlign: "left" })}>
          <th className={headCell}>リポジトリ</th>
          <th className={headCell}>権限</th>
          <th className={headCell}>期限</th>
          <th className={headCell}>状態</th>
          <th className={headCell}>操作</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => {
          const isRevoking = revokingIds.has(key.id);

          return (
            <tr key={key.id}>
              <td className={cell}>{key.repositorySlug ?? "（不明）"}</td>
              <td className={cell}>
                {key.scope === "read" ? "読み取り専用" : "読み書き"}
              </td>
              <td className={cell}>{formatDate(key.expiresAt)}</td>
              <td className={cell}>{key.enabled ? "有効" : "失効"}</td>
              <td className={cell}>
                <Button
                  className={css({
                    color: "red.700",
                    textDecoration: "underline",
                  })}
                  isDisabled={!key.enabled || isRevoking}
                  onPress={() => {
                    onRevoke(key.id);
                  }}
                >
                  {isRevoking ? "失効中…" : "失効"}
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
