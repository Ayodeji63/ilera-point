import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // ws: the live transcription socket at /api/speech/stream shares this prefix.
    proxy: { "/api": { target: "http://localhost:8787", ws: true } },
  },
});
