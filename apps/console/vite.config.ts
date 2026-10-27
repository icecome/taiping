import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const resolvePath = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// 开发期：SPA 跑在 5173，JSON API 与媒体文件由 8787 的 Worker 提供，靠 proxy 抹平跨域。
const WORKER_ORIGIN = process.env.WORKER_ORIGIN ?? "http://127.0.0.1:8787";

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolvePath("./src"),
      "@shared": resolvePath("../server/src/shared"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: WORKER_ORIGIN, changeOrigin: true },
      "/media": { target: WORKER_ORIGIN, changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
