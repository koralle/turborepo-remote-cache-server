import type { Meta, StoryObj } from "@storybook/react-vite";

import { KeyTable } from "../components/key-table";

const meta = {
  component: KeyTable,
  title: "KeyTable",
} satisfies Meta<typeof KeyTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const keys = [
  {
    createdAt: new Date().toISOString(),
    enabled: true,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    id: "1",
    lastRequest: null,
    name: "acme/web (read)",
    repositorySlug: "acme/web",
    scope: "read" as const,
    start: "trc_abc",
  },
  {
    createdAt: new Date().toISOString(),
    enabled: false,
    expiresAt: null,
    id: "2",
    lastRequest: null,
    name: "acme/api (read-write)",
    repositorySlug: "acme/api",
    scope: "read-write" as const,
    start: "trc_def",
  },
];

export const Default: Story = {
  args: {
    keys,
    onRevoke: () => {
      /* ストーリーでは何もしない */
    },
    revoking: null,
  },
};

export const Empty: Story = {
  args: {
    keys: [],
    onRevoke: () => {
      /* ストーリーでは何もしない */
    },
    revoking: null,
  },
};
