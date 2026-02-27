## ARCA Platform

Plataforma web para gestionar clientes, credenciales y datos fiscales de ARCA/AFIP, apoyada en **PostgreSQL**, **Drizzle ORM** y el servicio de scraping **ARCA Scrapper**.  
Está construida con **React 19**, **TanStack Start (React Router + SSR)**, **React Query**, **Tailwind CSS 4** y se ejecuta sobre **Bun** en producción.

### Stack principal

- **Runtime**: **Bun** (scripts, servidor de producción con `server.ts`)
- **Bundler/Dev Server**: **Vite**
- **Framework de routing/SSR**: **@tanstack/react-start** + **@tanstack/react-router**
- **Estado remoto**: **@tanstack/react-query**
- **UI**: React 19, Tailwind CSS 4, componentes tipo shadcn basados en Radix (`src/components/ui`)
- **Autenticación**: **better-auth** (server + client)
- **Base de datos**: PostgreSQL + **drizzle-orm** (`lib/db.ts`, carpeta `drizzle/`)
- **Infra**: Dockerfile multi-stage para despliegue con Bun

### Arquitectura general

La app es una **SPA/SSR** servida por Bun que:

- Expone una UI autenticada (`/_authed/*`) para gestionar clientes, facturas, notificaciones, productos y flujos de escaneo de PDFs.
- Consume una base de datos PostgreSQL a través de Drizzle.
- Se integra con **ARCA Scrapper** vía HTTP para crear y seguir jobs de scraping de AFIP.
- Usa **server functions** de TanStack Start (`createServerFn`) en `src/actions/*` como capa de backend (auth, validaciones, acceso a DB, llamadas a APIs).

```text
Browser ──▶ TanStack Start (Vite/Bun, SSR)
             │
             ├─ UI React (routes + components)
             ├─ Server Functions (src/actions/*)
             │      ├─ Drizzle ORM (PostgreSQL)
             │      └─ ARCA Scrapper (HTTP jobs API)
             └─ Better Auth (auth + sesiones)
```

---

## Requisitos previos

- **Bun** 1.2.x o superior (`bun -v`)
- **Node.js** 18+ (opcional, solo si prefieres `npm`/`pnpm`, pero el proyecto está pensado para Bun)
- **PostgreSQL** accesible con la URL de conexión (`DATABASE_URL`)
- Opcional pero recomendado: instancia de **ARCA Scrapper** corriendo (ver `arca-scrapper/README.md`)

---

## Puesta en marcha rápida

### 1. Clonar el repositorio y posicionarse en la plataforma

```bash
git clone <repo-url>
cd ARCA/arca-platform
```

### 2. Instalar dependencias

Con **Bun** (recomendado):

```bash
bun install
```

Con **npm** (posible, aunque el `start` usa Bun):

```bash
npm install
```

### 3. Configurar variables de entorno

Crea un archivo `.env` en `arca-platform/` (si no existe) con al menos:

```env
# Base de datos
DATABASE_URL=postgres://user:pass@host:port/db

# URL base del servidor de auth (better-auth, lado servidor)
VITE_BETTER_AUTH_URL=http://localhost:3000/api/auth

# URL del servicio de jobs de scraping (ARCA Scrapper o backend)
SCRAPPER_JOBS_URL=http://localhost:3002
# Alternativa legacy si la usas:
# BACKEND_API_URL=http://localhost:3002

# Opcionales para el servidor de assets (ver server.ts)
# ASSET_PRELOAD_MAX_SIZE=5242880
# ASSET_PRELOAD_INCLUDE_PATTERNS=*.js,*.css,*.woff2
# ASSET_PRELOAD_EXCLUDE_PATTERNS=*.map
# ASSET_PRELOAD_VERBOSE_LOGGING=false
```

> **Nota**: Better Auth típicamente requiere variables adicionales en el servidor (por ejemplo `BETTER_AUTH_SECRET`, etc.). Revísalas en tu entorno de despliegue/backend de auth; del lado del cliente se usa `VITE_BETTER_AUTH_URL`.

### 4. Sincronizar la base de datos

Drizzle se configura en `lib/db.ts` y los esquemas están en `drizzle/`.

```bash
# Crea/actualiza tablas según los esquemas de Drizzle
bun run db:push
```

### 5. Ejecutar en desarrollo

```bash
# Dev server con Vite (puerto 3000)
bun run dev

# o con npm
npm run dev
```

Abre `http://localhost:3000` en el navegador.

---

## Scripts disponibles

Todos los scripts están definidos en `package.json`. Puedes ejecutarlos con `bun run <script>` o `npm run <script>`.

- **`dev`**: arranca Vite en modo desarrollo.
  - **Uso**: `bun run dev`
- **`build`**: compila la app para producción (genera `dist/`).
  - **Uso**: `bun run build`
- **`preview`**: sirve el build de Vite en modo preview.
  - **Uso**: `bun run preview`
- **`start`**: levanta el servidor de producción Bun con `server.ts` (usa el build ya generado).
  - **Uso**: `bun run start`
- **`lint`**: corre ESLint sobre el proyecto.
  - **Uso**: `bun run lint`
- **`lint:fix`**: corre ESLint con autofix.
  - **Uso**: `bun run lint:fix`
- **`format`**: formatea el código con Prettier.
  - **Uso**: `bun run format`
- **`format:check`**: verifica formato sin modificar archivos.
  - **Uso**: `bun run format:check`
- **`fix-inbound-recipient`**: script de mantenimiento sobre invoices (`src/scripts/fix-inbound-recipient-last-2-months.ts`).
  - **Uso**: `bun run fix-inbound-recipient`
- **`rebuild-client-invoices`**: reconstruye facturas de clientes (`src/scripts/rebuild-client-invoices.ts`).
  - **Uso**: `bun run rebuild-client-invoices`
- **`db:push`**: sincroniza esquemas Drizzle con la base de datos.
  - **Uso**: `bun run db:push`

---

## Estructura del proyecto

Resumen de las carpetas y archivos más importantes:

- **`src/router.tsx`**  
  - **Responsabilidad**: crea el router principal de TanStack (`createRouter`) a partir de `routeTree.gen.ts`.

- **`src/routes/`** (file-based routing de TanStack Start)
  - **`__root.tsx`**: root route, configura `<html>`, `<head>`, `<body>`, proveedores globales (`QueryClientProvider`, `Toaster`, `<Scripts />`).
  - **`login.tsx`**: pantalla de login (`/login`) con `LoginForm`.
  - **`_authed/route.tsx`**: layout protegido.  
    - Usa `beforeLoad` para verificar sesión con `getSession()` (si no hay sesión, redirige a `/login`).
    - Renderiza `AppSidebar` + `SidebarProvider` y un `<Outlet />` con el contenido autenticado.
  - **`_authed/index.tsx`**: dashboard principal autenticado (`/_authed/`), que renderiza `Dashboard`.
  - **`_authed/clients/*`**: vistas relacionadas a clientes:
    - `index.tsx`: listado de clientes con `ClientsTable` y `CreateClientDialog`.
    - `$clientId/index.tsx`, `$clientId/$profileId/index.tsx`: detalle de cliente y perfiles (ver `client-detail-page.tsx`, `profile-detail-page.tsx`).
  - **`_authed/invoices/index.tsx`**: listado de facturas con `InvoicesTable`.
  - **`_authed/notifications/index.tsx`**: vista de notificaciones (`NotificationsView`), integra React Query (`getNotifications`).
  - **`_authed/products/*`**: gestión de productos asociados.
  - **`_authed/scan_pdf/index.tsx`**: flujo de escaneo de PDFs, subida de archivos y asistencia de IA (usa `scannerAi` en `src/actions/scannerAi.tsx`).
  - **`api/auth/$.ts`**: endpoint de better-auth expuesto como route API (`/api/auth/*`).

- **`src/actions/`** (server functions backend-like)
  - **`client.tsx`**: operaciones sobre clientes (crear, actualizar, recuperar, sincronizar datos, disparar jobs de scrapper, etc.). Usa:
    - `db` de `lib/db`
    - esquemas de `drizzle/schema`
    - `auth` de `lib/auth`
    - Axios para llamar a `SCRAPPER_JOBS_URL` / `BACKEND_API_URL` (`/api/jobs` en ARCA Scrapper).
  - **`invoice.tsx`**: operaciones para facturas (listado, filtros, etc.).
  - **`notification.tsx`**: acceso a notificaciones y recuentos.
  - **`dashboard.tsx`**: consultas agregadas para el dashboard.
  - **`credential.tsx`**: gestión de credenciales de acceso (por ejemplo, credenciales de AFIP/ARCA por cliente).
  - **`user.tsx`, `profile.tsx`, `scannerAi.tsx`**: auth de usuario, perfiles y flujos auxiliares (scanner AI, etc.).

- **`src/components/`**
  - **Componentes de dominio**:
    - `dashboard.tsx`: widgets y KPIs principales.
    - `clients-table.tsx`, `client-detail-page.tsx`, `profile-detail-page.tsx`.
    - `invoices-table.tsx`: tabla de facturas.
    - `notifications-table.tsx`, `notifications-view.tsx`.
    - `credentials-table.tsx`, `create-credential-dialog.tsx`, `edit-credential-dialog.tsx`.
    - `create-client-dialog.tsx`, `edit-client-dialog.tsx`, `view-client-dialog.tsx`.
    - `render-iva-resume.tsx`, `render-pdf-info.tsx`, `drag-drop.tsx`.
    - `app-sidebar.tsx`: sidebar principal de navegación autenticada.
    - `login-form.tsx`: formulario de login.
  - **`components/ui/`**: librería de componentes base (botones, inputs, tablas, diálogos, tabs, etc.), construidos sobre Radix y Tailwind.  
    - Ejemplos: `button.tsx`, `input.tsx`, `dialog.tsx`, `table.tsx`, `tabs.tsx`, `calendar.tsx`, `popover.tsx`, etc.

- **`src/hooks/`**
  - **`use-toast.ts`**: helper para notificaciones tipo toast (`sonner`).
  - **`use-mobile.ts`**: utilidades relacionadas con layout en mobile.

- **`src/styles/app.css`**
  - Estilos globales de la aplicación. Se inyecta desde `__root.tsx`.

- **`lib/db.ts`**
  - Crea el cliente de Drizzle sobre PostgreSQL usando `postgres` y `DATABASE_URL`.
  - Mezcla esquemas de `drizzle/schema` y `drizzle/auth`.

- **`lib/auth.tsx`**
  - Configura `better-auth` en el servidor:
    - `trustedOrigins` (localhost + dominio de producción).
    - Email/password login.
    - Integración con Drizzle vía `drizzleAdapter`.
    - Hooks de base de datos para normalizar fechas de sesión.

- **`lib/auth-client.ts`**
  - Crea el cliente de auth para React (`createAuthClient`) y lee:
    - `VITE_BETTER_AUTH_URL` o fallback `https://contable.tinnto.co/api/auth`.

- **`drizzle/`**
  - `schema.ts`, `auth.ts`, `relations.ts`, `meta/*`, migraciones SQL.
  - Representan tablas como `client`, `profile`, `job`, `ivaScrape`, `notification`, usuarios, etc.

- **`src/scripts/`**
  - `import-and-scrap.ts`: scripts para importar datos y lanzar jobs de scraping de forma masiva.
  - `rebuild-client-invoices.ts`: herramienta para regenerar facturas de clientes.

- **`server.ts`**
  - Servidor de producción con **Bun**:
    - Pre-carga de assets estáticos desde `dist/client` con ETag + Gzip opcional.
    - Ruteo de estáticos y fallback a handler de TanStack Start (`dist/server/server.js`).
    - Personalización mediante variables `ASSET_PRELOAD_*`.

- **`vite.config.ts`**
  - Configuración de Vite:
    - Puerto 3000, `allowedHosts` para dominios de producción.
    - Plugins: `@tanstack/react-start`, `@vitejs/plugin-react`, `tailwindcss`, `vite-tsconfig-paths`.
    - `ssr.noExternal` para ciertos paquetes (lucide, gridstack, etc.).

- **`dockerfile`**
  - Imagen multi-stage basada en `oven/bun`:
    - `install`: instala dependencias (`bun install`).
    - `prerelease`: ejecuta `bun run build`.
    - `release`: copia `dist`, `server.ts`, `lib`, `src`, `drizzle` y arranca con `bun run start` en el puerto 3000.

---

## Integración con ARCA Scrapper

- **Objetivo**: la plataforma **no ejecuta scraping directamente**; delega el trabajo a **ARCA Scrapper**.
- **Punto de integración principal**: `src/actions/client.tsx`.

- **Variables de entorno relevantes**:
  - **`SCRAPPER_JOBS_URL`**: URL base del servicio de jobs de scraping (por ejemplo `http://localhost:3002`).
  - **`BACKEND_API_URL`**: alternativa secundaria, usada si `SCRAPPER_JOBS_URL` no está definida.

- **Ejemplo de uso** (simplificado):
  - Al crear un nuevo cliente, o cuando se fuerza una actualización, la app:
    - Valida que el cliente pertenece al usuario autenticado.
    - Llama a `POST /api/jobs` en ARCA Scrapper con `type` (`iva`, `comprobantes`, etc.) y `clientId`.
    - Luego guarda y muestra el estado del job en la UI.

> **Tip**: revisa el README de `arca-scrapper/` para ver en detalle los tipos de jobs (`iva`, `comprobantes`, `notificaciones`, `deuda`) y la API disponible.

---

## Autenticación y sesiones

- **Servidor**: `lib/auth.tsx` configura **better-auth** con:
  - Email/password habilitado.
  - Integra con Drizzle y la tabla `user` (`drizzle/auth`).
  - Plugins `anonymous` y `admin`, más `reactStartCookies` para integración con TanStack Start.
- **Cliente**: `lib/auth-client.ts` crea `authClient` con:
  - `baseURL` = `import.meta.env.VITE_BETTER_AUTH_URL || "https://contable.tinnto.co/api/auth"`.

- **Protección de rutas**:
  - `src/routes/_authed/route.tsx` usa `beforeLoad`:
    - Llama a `getSession()` desde `@/actions/user`.
    - Si no hay sesión, lanza un `redirect({ to: "/login" })`.
    - Todo lo bajo `/_authed/*` queda protegido.

Para añadir nuevas pantallas protegidas, crea archivos de ruta dentro de `src/routes/_authed/` (por ejemplo `reports/index.tsx`) usando `createFileRoute`.

---

## Flujo funcional principal

- **Login**:
  - Ruta `/login`, componente `login.tsx` + `LoginForm`.
  - Tras login exitoso, se establece la sesión de Better Auth y el usuario se redirige a `/_authed/`.

- **Dashboard**:
  - Ruta `/_authed/`, componente `Dashboard`.
  - Usa `src/actions/dashboard.tsx` para obtener KPIs y datos agregados.

- **Clientes**:
  - Ruta `/_authed/clients/`, componente `ClientsTable`.
  - Permite crear, ver, editar y sincronizar clientes con AFIP/ARCA.
  - Al crear un cliente, se pueden disparar jobs de scraping (`notifyBackendNewClient`, `updateOldClient`, etc.).

- **Facturas**:
  - Ruta `/_authed/invoices/`, componente `InvoicesTable`.
  - Muestra facturas emitidas/recibidas, con filtros y paginación.

- **Notificaciones**:
  - Ruta `/_authed/notifications/`.
  - Usa React Query (`useQuery`) y `getNotifications` para paginar y mostrar notificaciones ARCA.

- **Productos y otros módulos**:
  - `/_authed/products/*`, `/_authed/scan_pdf`, etc. siguen el mismo patrón:
    - Ruta file-based.
    - Componentes de UI específicos.
    - Server functions en `src/actions/*` para la lógica de negocio.

---

## Estilos y componentes UI

- **Tailwind CSS 4** se configura vía `tailwind.config.mjs` y se inyecta en `__root.tsx` con `appCss`.
- La tipografía principal se carga desde Google Fonts (`Poppins`).
- Componentes reutilizables basados en Radix se encuentran en `src/components/ui/*`:
  - Botones, formularios, diálogos, tablas, menús, tooltips, etc.
- Iconografía con **lucide-react**.
- Notificaciones tipo toast mediante `sonner` (`Toaster` en `__root.tsx` y hook `use-toast`).

Al crear nuevas vistas, reutiliza componentes de `ui/` para mantener consistencia visual.

---

## Desarrollo diario para un dev nuevo

- **Arrancar entorno**:
  - **Postgres** en marcha con la base configurada.
  - Opcional: **ARCA Scrapper** corriendo en `http://localhost:3002`.
  - `DATABASE_URL`, `VITE_BETTER_AUTH_URL` y `SCRAPPER_JOBS_URL` correctamente seteados en `.env`.

- **Flujo típico de trabajo**:
  - **1.** `bun run dev` en `arca-platform/`.
  - **2.** Abrir `http://localhost:3000`.
  - **3.** Crear/usar un usuario (según tu backend de auth).
  - **4.** Trabajar en:
    - Nuevas rutas → `src/routes/...`
    - Lógica de negocio/DB/API → `src/actions/...`
    - Componentes UI → `src/components/...`
  - **5.** Usar React Query para data fetching:
    - Llámate a server functions (`createServerFn`) desde el cliente y cachea los resultados con `useQuery` / `useMutation`.

- **Dónde tocar qué**:
  - **DB / modelos** → `drizzle/schema.ts`, `drizzle/auth.ts`, migraciones SQL.
  - **Auth** → `lib/auth.tsx` (server) y `lib/auth-client.ts` (cliente).
  - **Integración scrapper** → principalmente `src/actions/client.tsx` y scripts en `src/scripts/`.
  - **UX / diseño** → componentes en `src/components/` y `src/styles/app.css`.

---

## Build y despliegue

### Build de producción

```bash
# Compilar
bun run build

# Servir con Bun (usa server.ts, puerto 3000 o PORT)
PORT=3000 bun run start
```

### Despliegue con Docker

El `dockerfile` en la raíz de `arca-platform` ya está preparado:

```bash
docker build -t arca-platform .

docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL=postgres://user:pass@host:port/db \
  -e VITE_BETTER_AUTH_URL=https://<tu-dominio>/api/auth \
  -e SCRAPPER_JOBS_URL=https://<url-de-scrapper> \
  --name arca-platform \
  arca-platform
```

En producción, típicamente pondrás un reverse proxy (Nginx, Traefik, etc.) delante del contenedor.

---

## Troubleshooting rápido

- **La app muestra errores de DB / 500 al cargar dashboards**:
  - **Verifica** `DATABASE_URL` y que la base exista.
  - **Ejecuta** `bun run db:push` para asegurarte de que los esquemas están sincronizados.

- **No se crean jobs de scraping al crear/actualizar clientes**:
  - **Verifica** que `SCRAPPER_JOBS_URL` o `BACKEND_API_URL` apunten correctamente a ARCA Scrapper.
  - **Confirma** que el servicio de scrapper está corriendo y que `POST /api/jobs` responde.

- **Loop de login o redirección constante a `/login`**:
  - **Comprueba** `VITE_BETTER_AUTH_URL` (dominio, puerto, path `/api/auth`).
  - **Revisa** cookies de sesión en el navegador (dominio, `SameSite`, etc.).

- **Estáticos lentos o problemas de assets en producción**:
  - Ajusta las variables `ASSET_PRELOAD_*` para controlar qué ficheros se precargan y el peso máximo permitido.

Si algo no está claro para un dev nuevo, el lugar ideal para empezar a leer código es:

- `src/routes/__root.tsx`
- `src/routes/_authed/route.tsx`
- `src/actions/client.tsx`
- `lib/db.ts` y `lib/auth.tsx`

