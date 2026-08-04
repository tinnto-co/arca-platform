# Handoff — levantar el entorno en una máquina nueva

Estado al 2026-08-04. Rama `v2` en los dos repos, pusheada a GitHub.

- App: `git@github.com:tinnto-co/arca-platform.git` rama `v2` (56 commits sobre `main`).
- Scrapper: `git@github.com:tinnto-co/arca-scrapper.git` rama `v2` (10 commits sobre `staging`).
  **El clon bueno es este** (en local se llamaba `arca-scrapper-3`); `arca-scrapper` y
  `arca-scrpper-2` son clones viejos de GitLab, no se tocan.

Todo lo que sigue es lo que **no viaja en git**.

## 1. Lo que hay que traer a mano

| Qué | Dónde estaba | Para qué |
|---|---|---|
| `.env` de arca-platform | raíz del repo | conexiones, R2, auth, Gemini |
| `.env` de arca-scrapper-3 | raíz del repo | AFIP, proxy, Redis, R2, WSAA |
| Cert y key de WSAA | `~/Downloads/arca-scrapper_*.crt`, `~/afip-wsaa.key` | padrón AFIP (provincia). También están en R2: `config/afip/afip.crt|.key` |
| Backups | `~/Desktop/tinnto/ARCA/backups/` | documentos base64 y clientes espejo |
| Planilla del estudio | `~/Downloads/Arca - 0-1 (1).csv` | auditoría de clientes |

Variables del `.env` de la app: `DATABASE_URL`, `DATABASE_READONLY_URL`, `DATABASE_PORTAL_URL`,
`IDEAL_DATABASE_URL`, `IDEAL_MIGRATION_URL`, `MIGRATION_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `VITE_BETTER_AUTH_URL`, `GEMINI_API_KEY`, `CREDENTIAL_ENCRYPTION_KEY`,
`REDIS_URL`, `SCRAPPER_CONCURRENCY`, `R2_*`.

Del scrapper, además: `PROXY_URL`, `USE_PROXY`, `QUEUE_NAME`, `WORKER_CONCURRENCY`,
`REDIS_HOST/PORT`, `AFIP_WS_CUIT`, `AFIP_WS_CERT_PATH`, `AFIP_WS_KEY_PATH`, `RESEND_API_KEY`.

`CREDENTIAL_ENCRYPTION_KEY` tiene que ser **la misma** en los dos repos y la misma de siempre:
si cambia, las claves de AFIP guardadas no se pueden desencriptar.

## 2. Herramientas

Bun, Docker, Redis local (`redis-server`) y Chrome. No hace falta `psql`: todo lo que consulta
la base son scripts bun con el paquete `postgres`.

## 3. Levantar BD_IDEAL (esto es lo más importante)

**BD_IDEAL vive sólo en un Postgres local en Docker.** No hay backup remoto: en la máquina nueva
se reconstruye corriendo el ETL contra NEW_DB, que sí es remota (`77.42.70.84:5559`) y sigue
siendo la fuente.

```bash
docker compose -f docker-compose.ideal.yml up -d      # postgres:17 en localhost:5460
bun src/scripts/ideal/apply-schema.ts                 # 76 tablas + RLS + roles
for n in 1 2 3 4 5 6 7; do
  DATABASE_URL="$(grep -m1 '^MIGRATION_URL=' .env | cut -d= -f2- | tr -d '"')" \
    bun src/scripts/ideal/etl-dominio$n.ts
done
DATABASE_URL="$(grep -m1 '^MIGRATION_URL=' .env | cut -d= -f2- | tr -d '"')" \
  bun src/scripts/ideal/subir-documentos-r2.ts --apply
bun src/scripts/ideal/dedupe-deuda-vencimiento.ts --apply
```

Detalles que muerden:

- El ETL tiene que correr con **NEW_DB como origen** (`MIGRATION_URL`), nunca con BD_IDEAL en
  `DATABASE_URL`: usaría la misma base como origen y destino y la vaciaría. Hay un guard que
  aborta si `DATABASE_URL` es localhost, pero mejor no probarlo.
- El orden 1→7 es obligatorio: D6 carga las alertas con `origen_id` null y D7 las religa al job.
- **Cada re-run del ETL D6 pisa `documento.storage_key` a null** → el subidor a R2 se vuelve a
  correr después (es idempotente).
- Roles y contraseñas de RLS están en `schema-rls.sql` (`arca_app`, `arca_agent`, `arca_portal`,
  `arca_scrapper`, password `arca_local`). El `DATABASE_URL` de la app **no** puede ser el
  usuario `arca` (es dueño y bypassea el RLS).

## 4. Correr la app y el scrapper

```bash
bun install && bun run dev        # ¡ojo! el script es "bun --bun vite", no "vite"
```

R2 usa el `S3Client` nativo de Bun: si el SSR arranca bajo Node, toda subida o descarga de
archivos falla. Por eso el `dev` fuerza el runtime de Bun.

Scrapper (cwd en el clon del scrapper, que carga su propio `.env`):

```bash
redis-server &
CRON_ENABLED=false bun run src/api/index.ts     # API en :3002
bun run src/worker/index.ts                     # worker
```

`CRON_ENABLED` es `true` por defecto: sin ese `false` el scheduler encola jobs de **todas** las
credenciales apenas levanta la API.

Verificación del scrapper: `bun src/verificacion/verificar-modelo-ideal.ts` (read-only, con
guard de localhost; `--snapshot` / `--comparar` para chequear idempotencia).

## 5. Qué está terminado

- App entera migrada a BD_IDEAL; `bunx tsc --noEmit` limpio salvo `src/scripts/**` (legacy, la
  app no los importa).
- Scrapper escribiendo el modelo ideal, verificado end-to-end contra AFIP con proxy.
- Portal del cliente: rediseño, permisos por cliente, subida y previsualización de documentos.
- RLS por organización, por cliente (portal) y por scrapper.
- Los 531+ documentos migrados de base64 a R2.

## 6. Qué queda pendiente

**Cutover** (lo más grande, nada de esto está hecho):

1. Sync incremental ORIGINAL_DB → NEW_DB de las filas nuevas desde el dump del 30/07. No puede
   ser drop+restore: NEW_DB tiene correcciones propias que un restore pisaría.
2. Re-correr el ETL completo y el subidor de documentos con la base congelada.
3. Coolify: apuntar `DATABASE_URL` de app y scrapper a la base nueva, cargar las `R2_*` en la
   app, y **arreglar el `PROXY_URL` de producción, que no tiene `session-<id>`** — sin eso la IP
   rota a mitad del scrapeo y AFIP corta la sesión.
4. Sacar el guard de sólo-localhost del `db.ts` del scrapper.
5. Sacar el `DEFAULT 'org_estudio_blakg'` de `cliente.organization_id`.
6. Decidir qué pasa con `src/scripts/**` de la app (~197 errores de TS, apuntan al modelo viejo):
   migrarlos o borrarlos.

**Bugs y deudas conocidas:**

- `resetPortalUserPassword` no funciona: el `setUserPassword` de Better Auth exige
  `adminMiddleware`.
- El portal manda el archivo en base64 dentro del request del server fn (+33% de peso) y no tiene
  límite de tamaño.
- Queda un documento con el mime viejo `application/octet-stream`
  (`F8000-0750002026034279407.pdf`).
- 22 clientes en la base que no figuran en la planilla del estudio y 5 logins que no son de
  planilla — los tiene que revisar el estudio.
- Los conceptos 420/421 (art. 223 bis) no tienen código LSD correcto: hay que buscarlo en las
  Guías de ARCA, no inventarlo.

## 7. Trampas que ya costaron caro

- `bun run db:push` rompe índices. El SQL de la migración se aplica a mano con un script bun.
- Nunca editar `src/routes/**` con `bun run dev` corriendo: el plugin del router puede
  sobreescribir el archivo con un stub.
- `bun run lint` se muere por OOM sobre todo el repo. Usar
  `bunx tsc --noEmit` + `bunx prettier --write <archivos>`.
- Un agregado SQL crudo (`max(...)`) vuelve como **string**, no como `Date` — tiparlo como `Date`
  compila y explota en runtime dejando la pantalla en blanco sin error.
- El contexto de RLS lo abre el helper de sesión: cualquier lectura anterior devuelve 0 filas
  **en silencio**.

Los documentos de referencia son `tasks/modelo-ideal-db.md` (el modelo y el porqué),
`tasks/migracion-nueva-db.md` (mapeo columna a columna) y `tasks/plan-rediseno-db.md` (las fases).
