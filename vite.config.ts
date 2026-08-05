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

  build: {
    // Rollup abre hasta 1000 archivos EN PARALELO por defecto, y cada uno
    // queda en memoria a la vez. Con ~14.000 módulos eso es lo que hace
    // explotar el pico y mata el deploy con SIGKILL en el servidor.
    // Bajarlo cambia memoria por tiempo: el build tarda más pero entra.
    rollupOptions: {
      maxParallelFileOps: 2,
    },
    // Los sourcemaps de producción duplican el pico y acá no se usan.
    sourcemap: false,
  },

  ssr: {
    // CopilotKit queda FUERA de esta lista a propósito. Arrastra
    // streamdown → mermaid + shiki + katex, y bundlearlo también para SSR
    // duplicaba ese árbol entero para el server build. Externalizado, Bun lo
    // resuelve desde node_modules en runtime (el Dockerfile los copia a la
    // imagen release). Reduce la etapa SSR de 3.916 a 2.285 módulos; NO
    // reduce el pico de memoria, que lo marca la etapa de cliente.
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
