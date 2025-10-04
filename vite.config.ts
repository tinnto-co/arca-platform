import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  server: {
    port: 3000,
    allowedHosts: [
      "familycapitalfunds.com",
      "app.familycapitalfunds.com",
      "localhost",
    ],
  },
  optimizeDeps: {
    include: ["gridstack"],
  },

  ssr: {
    noExternal: [
      "lucide-react",
      "gridstack",
      "katex",
      "@platejs/math",
      "platejs",
      "use-file-picker",
      "react-lite-youtube-embed",
      "react-tweet",
    ],
  },
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
