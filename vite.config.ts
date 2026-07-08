import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: {
      "/api": "http://127.0.0.1:5173",
      "/healthz": "http://127.0.0.1:5173",
      "/metrics": "http://127.0.0.1:5173"
    }
  }
});
