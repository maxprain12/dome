import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { visualStudioExport } from "./scripts/visual-studio/export-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), visualStudioExport()],
  resolve: {
    alias: [
      {
        find: /^@dome\/i18n$/,
        replacement: path.resolve(__dirname, "packages/i18n/src/index.ts"),
      },
      { find: "@", replacement: path.resolve(__dirname, "app") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5188,
    strictPort: true,
    open: "/visual-studio.html",
  },
  build: {
    outDir: "dist-visual-studio",
    rollupOptions: { input: "visual-studio.html" },
  },
});
