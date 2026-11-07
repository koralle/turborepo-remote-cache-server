import { useState } from "react";
import {
  Button,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  TextField,
} from "react-aria-components";

import { css } from "../../styled-system/css";

export interface CreateKeyInput {
  expiresInDays: number;
  repositorySlug: string;
  scope: "read" | "read-write";
  teamId?: string;
}

interface IssueKeyFormProps {
  error: string | null;
  onCreate: (input: CreateKeyInput) => void;
  pending: boolean;
}

const fieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
});

const inputStyle = css({
  border: "1px solid gray.300",
  borderRadius: "0.375rem",
  padding: "0.5rem",
});

export const IssueKeyForm = ({
  error,
  onCreate,
  pending,
}: IssueKeyFormProps) => {
  const [repositorySlug, setRepositorySlug] = useState("");
  const [teamId, setTeamId] = useState("");
  const [scope, setScope] = useState<"read" | "read-write">("read");
  const [expiresInDays, setExpiresInDays] = useState("90");

  return (
    <form
      className={css({ display: "flex", flexDirection: "column", gap: "1rem" })}
      onSubmit={(event) => {
        event.preventDefault();

        const input = {
          expiresInDays: Number(expiresInDays),
          repositorySlug,
          scope,
        };

        const trimmedTeamId = teamId.trim();

        onCreate(
          trimmedTeamId === "" ? input : { ...input, teamId: trimmedTeamId }
        );
      }}
    >
      <TextField
        className={fieldStyle}
        isRequired
        value={repositorySlug}
        onChange={setRepositorySlug}
      >
        <Label htmlFor="repository-slug">リポジトリ slug（例: acme/web）</Label>
        <Input className={inputStyle} id="repository-slug" />
      </TextField>

      <TextField className={fieldStyle} value={teamId} onChange={setTeamId}>
        <Label htmlFor="team-id">teamId（任意）</Label>
        <Input className={inputStyle} id="team-id" />
      </TextField>

      <Select
        className={fieldStyle}
        value={scope}
        onChange={(key) => {
          setScope(key === "read-write" ? "read-write" : "read");
        }}
      >
        <Label htmlFor="scope">権限</Label>
        <Button className={inputStyle} id="scope">
          <SelectValue />
        </Button>
        <Popover>
          <ListBox
            className={css({
              background: "white",
              border: "1px solid gray.300",
            })}
          >
            <ListBoxItem id="read">読み取り専用</ListBoxItem>
            <ListBoxItem id="read-write">読み書き</ListBoxItem>
          </ListBox>
        </Popover>
      </Select>

      <TextField
        className={fieldStyle}
        value={expiresInDays}
        onChange={setExpiresInDays}
      >
        <Label htmlFor="expires-in-days">有効期限（日）</Label>
        <Input
          className={inputStyle}
          id="expires-in-days"
          inputMode="numeric"
        />
      </TextField>

      <Button
        className={css({
          background: "gray.900",
          borderRadius: "0.375rem",
          color: "white",
          padding: "0.5rem 1rem",
          width: "fit-content",
        })}
        isDisabled={pending}
        type="submit"
      >
        {pending ? "発行中…" : "API キーを発行"}
      </Button>

      {error === null ? null : (
        <p className={css({ color: "red.600" })} role="alert">
          {error}
        </p>
      )}
    </form>
  );
};
