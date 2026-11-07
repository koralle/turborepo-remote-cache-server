import type { Meta, StoryObj } from "@storybook/react-vite";

import { IssueKeyForm } from "../components/issue-key-form";

const meta = {
  component: IssueKeyForm,
  title: "IssueKeyForm",
} satisfies Meta<typeof IssueKeyForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    error: null,
    onCreate: () => {
      /* ストーリーでは何もしない */
    },
    pending: false,
  },
};

export const ErrorState: Story = {
  args: {
    error: "そのリポジトリは既に別の teamId で登録されています",
    onCreate: () => {
      /* ストーリーでは何もしない */
    },
    pending: false,
  },
};
