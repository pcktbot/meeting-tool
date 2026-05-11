import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (
            id.includes("@tiptap/") ||
            id.includes("prosemirror") ||
            id.includes("/orderedmap/")
          ) {
            return "editor";
          }

          if (id.includes("react-router")) {
            return "router";
          }

          if (id.includes("react") || id.includes("scheduler")) {
            return "react-vendor";
          }

          if (id.includes("drizzle-orm")) {
            return "db";
          }

          if (id.includes("@tauri-apps/")) {
            return "tauri";
          }

          if (id.includes("@anthropic-ai/sdk")) {
            return "ai";
          }

          if (id.includes("marked")) {
            return "markdown";
          }

          return "vendor";
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
