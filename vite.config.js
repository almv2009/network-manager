var _a, _b;
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
var buildRuntime = ((_b = (_a = globalThis.process) === null || _a === void 0 ? void 0 : _a.env) === null || _b === void 0 ? void 0 : _b.VITE_APP_RUNTIME) || "enterprise";
var runtimeEntry = buildRuntime === "standalone"
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
