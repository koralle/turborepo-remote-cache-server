import { pandacss } from "@pandacss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  framework: { name: "@storybook/react-vite", options: {} },
  stories: ["../src/stories/**/*.stories.tsx"],
  viteFinal: (viteConfig) => {
    viteConfig.plugins = [...(viteConfig.plugins ?? []), pandacss()];
    return viteConfig;
  },
};

export default config;
