import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const SERVER = process.env.INFINITY_SERVER ?? "http://localhost:2567";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/ws": { target: SERVER.replace(/^http/, "ws"), ws: true },
      "/api": SERVER,
      "/health": SERVER,
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
