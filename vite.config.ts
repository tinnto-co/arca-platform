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
      "@react-pdf/renderer",
      "@copilotkit/react-core",
      "@copilotkit/react-ui",
      "@copilotkit/runtime-client-gql",
    ],
  },

  ssr: {
    // CopilotKit queda FUERA de esta lista a propósito. Arrastra
    // streamdown → mermaid + shiki + katex, y bundlearlo también para SSR
    // duplicaba ese árbol entero: era la mitad del pico de memoria del build.
    // Externalizado, Bun lo resuelve desde node_modules en runtime.
    // Las entradas de gridstack/katex/platejs/react-tweet se sacaron porque
    // esos paquetes no están instalados: apuntaban a nada.
    noExternal: ["lucide-react", "ai", "@ai-sdk/google", "@ai-sdk/react"],
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
