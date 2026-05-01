import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const buildRuntime =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VITE_APP_RUNTIME || "enterprise";
const runtimeEntry =
  buildRuntime === "standalone"
    ? new URL("./src/runtime-entry-standalone.tsx", import.meta.url).pathname
    : new URL("./src/runtime-entry-enterprise.tsx", import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "./runtime-entry-enterprise": runtimeEntry,
    },
  },
  build: {
    sourcemap: false,
  },
});
