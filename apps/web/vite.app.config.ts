import { cloudflare } from "@cloudflare/vite-plugin";
import { pandacss } from "@pandacss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    pandacss(),
    cloudflare({
      auxiliaryWorkers: [{ configPath: "../api/wrangler.jsonc" }],
      viteEnvironment: { name: "ssr" },
    }),
    tanstackStart(),
    react(),
  ],
  server: { port: 3000, strictPort: true },
});
