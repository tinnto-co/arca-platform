import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  server: {
    // port: 3000, // rollback: cambiar a 3000
    port: 3000,
    allowedHosts: [
      "familycapitalfunds.com",
      "app.familycapitalfunds.com",
      "localhost",
    ],
    watch: {
      usePolling: true,
      interval: 300,
      ignored: ["**/src/routeTree.gen.ts"],
    },
  },
  optimizeDeps: {
    include: [
      "gridstack",
      "@react-pdf/renderer",
      "@copilotkit/react-core",
      "@copilotkit/react-ui",
      "@copilotkit/runtime-client-gql",
    ],
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
      "ai",
      "@ai-sdk/google",
      "@ai-sdk/react",
      "@copilotkit/react-core",
      "@copilotkit/react-ui",
      "@copilotkit/runtime-client-gql",
    ],
  },
  plugins: [
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart({
      server: { entry: "entry-server" },
    }),
    viteReact(),
  ],
});
