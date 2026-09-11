import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "client",
  server: {
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true
      },
      "/health": "http://localhost:3001"
    }
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true
  }
});
