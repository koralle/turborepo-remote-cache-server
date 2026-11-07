export default {
  exclude: [],
  include: ["./src/**/*.{js,jsx,ts,tsx}", "./.storybook/**/*.{ts,tsx}"],
  jsxFramework: "react",
  outdir: "styled-system",
  preflight: true,
  presets: ["@pandacss/preset-base", "@pandacss/preset-panda"],
  theme: {
    extend: {
      tokens: {
        fonts: {
          body: { value: "'Noto Sans JP Variable', sans-serif" },
        },
      },
    },
  },
};
