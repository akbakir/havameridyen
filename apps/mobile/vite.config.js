// havameridyen mobil uygulaması (sunucu madde 5, Ekim 2026) — Vite + React, Capacitor ile Android.
// Kurallar web ile ortak: kök klasördeki lib/ (agreement.js, consensus.js, terms.js) "@lib" adıyla kullanılır.
// Geliştirmede (npm run dev) /api istekleri yerel Next sunucusuna (kökte npm run dev, :3000) aktarılır;
// canlı siteyle denemek için: API_TARGET=https://www.havameridyen.com npm run dev.
// Uygulamanın içinde ise doğrudan https://www.havameridyen.com çağrılır (src/api.js).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = (p) => fileURLToPath(new URL(p, import.meta.url));
const API_TARGET = process.env.API_TARGET || "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@lib": root("../../lib") } },
  server: {
    fs: { allow: [root("../..")] },
    proxy: { "/api": { target: API_TARGET, changeOrigin: true } },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
