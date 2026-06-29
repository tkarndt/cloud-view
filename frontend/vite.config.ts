import { defineConfig } from "vite";

export default defineConfig({
    build: {
        outDir: "dist",
        sourcemap: true,
    },
    server: {
        // In dev mode, proxy /ws to the running backend so we don't need nginx
        proxy: {
            "/ws": {
                target: "ws://localhost:8000",
                ws: true,
            },
        },
    },
});
