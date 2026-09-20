import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: at("./tests/browser"),
  server: { host: "127.0.0.1", port: 3219, strictPort: true },
  resolve: { alias: {
    "@": at("./"), "@convex-dev/auth/react": at("./tests/browser/auth.ts"), "next/navigation": at("./tests/browser/navigation.ts"), "next/link": at("./tests/browser/link.tsx"),
  } },
  css: { postcss: at("./") },
  oxc: { jsx: { runtime: "automatic" } },
});
