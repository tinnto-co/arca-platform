# Staging del modelo ideal — para que el estudio pruebe sueldos

Objetivo: la rama `v2` (app + scrapper) corriendo contra una copia de BD_IDEAL en Coolify,
para que el estudio pruebe el módulo de sueldos con datos reales antes del cutover.

Decidido: Postgres nuevo en Coolify · datos por dump de BD_IDEAL local · scrapper completo.

## 0. Antes de empezar

- **Las contraseñas de los roles de RLS están en el repo** (`schema-rls.sql` usa `arca_local`).
  En staging van contraseñas nuevas: la base va a ser alcanzable desde afuera.
- Staging tiene **datos reales**: CUITs, sueldos y credenciales de AFIP cifradas. No es una demo.
- El corte del dato es el **30/07** (la última sync de NEW_DB). Producción siguió escribiendo en
  ORIGINAL_DB, así que lo cargado después no está. Para sueldos no molesta; para comprobantes sí
  se va a notar.
- Con el scrapper de staging en modo completo, **dos workers se loguean en las mismas cuentas de
  AFIP en paralelo** (el de prod sigue vivo). Si aparecen sesiones cortadas o "usuario no
  logueado", es esto. Se apaga con `CRON_ENABLED=false`.

## 1. Postgres en Coolify — HECHO 04/08

Servicio Postgres **17** (la base local es 17; un restore a 16 falla). Anotar host, puerto y las
credenciales del superusuario, y dejarlo alcanzable desde tu IP para poder restaurar.

Vivo en `77.42.70.84:6001`, base **`arca_staging`** (no `postgres`: así se puede tirar y rehacer
sin arrastrar el catálogo del servicio). Postgres 17.10. Los passwords de los cuatro roles se
generaron nuevos y **no van en el repo** — están en las env de Coolify.

Crear los roles **antes** del restore: el dump trae las políticas de RLS y los GRANT, que
referencian los roles por nombre, y el restore falla si no existen. `pg_dump` no dumpea roles.

```sql
create role arca_app     login password '<pass-app>';
create role arca_agent   login password '<pass-agent>';
create role arca_portal  login password '<pass-portal>';
create role arca_scrapper login password '<pass-scrapper>';
```

## 2. Dump y restore

Desde la máquina con BD_IDEAL corriendo (docker en `localhost:5460`). Con `--no-owner` los
objetos quedan del superusuario de Coolify; **sin** `--no-privileges`, para que los GRANT a los
cuatro roles viajen en el dump.

```bash
mkdir -p /tmp/arca-staging

# En Mac el contenedor no ve "localhost": va host.docker.internal.
docker run --rm -v /tmp/arca-staging:/dump postgres:17 \
  pg_dump "postgres://arca:arca@host.docker.internal:5460/arca_ideal" \
  -Fc --no-owner -f /dump/bd_ideal.dump

docker run --rm -v /tmp/arca-staging:/dump postgres:17 \
  pg_restore --no-owner -d "postgres://<super>:<pass>@<host>:<puerto>/<db>" /dump/bd_ideal.dump
```

Verificado 04/08 (78 tablas, 52 con RLS, 67 políticas, counts idénticos al local):

- `cliente` 97, `comprobante` 74.063, `recibo` 175, `concepto` 233, `job` 17.897,
  `documento` 535 (los 535 con `storage_key`).
- `arca_app` **sin** `app.org_id` → 0 clientes; con `set local app.org_id = 'org_estudio_blakg'`
  → 97. `arca_agent` no puede borrar. `arca_scrapper` lee `comprobante` pero `concepto` le da
  `permission denied`. `arca_portal` sin `app.cliente_id` → 0, con el id → 1, y `credencial_afip`
  le da `permission denied`.
- El `DATABASE_URL` de la app **no** puede ser el superusuario ni `arca`: son dueños y bypassean
  el RLS, con lo cual el aislamiento por organización deja de existir.

## 3. App en Coolify

Rama `v2`. El Dockerfile ya arranca con `bun run start`, así que R2 funciona (usa el `S3Client`
de Bun).

| Var | Valor |
|---|---|
| `DATABASE_URL` | `postgres://arca_app:…@<host>/<db>` |
| `DATABASE_READONLY_URL` | igual con `arca_agent` |
| `DATABASE_PORTAL_URL` | igual con `arca_portal` |
| `BETTER_AUTH_URL` / `VITE_BETTER_AUTH_URL` | dominio de staging (`VITE_*` es build arg) |
| `BETTER_AUTH_SECRET` | el mismo de prod |
| `CREDENTIAL_ENCRYPTION_KEY` | **el mismo de prod**, si no las claves de AFIP no se desencriptan |
| `GEMINI_API_KEY` | el de siempre |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` | los de siempre (`R2_ACCOUNT_ID` no lo lee la app, sólo el scrapper) |
| `R2_BUCKET` | `arca`, el mismo de prod |

**El bucket es compartido con producción, a propósito.** Los documentos no viajan en el dump: en
la BD sólo está la `storage_key`, y los 535 archivos viven en `arca`. Un bucket aparte obligaría
a copiarlos, y cualquiera que se escape aparece como un 502 en la cara del estudio.

Compartir es seguro hoy porque **nada borra objetos de R2**: `r2.remove` (`src/lib/r2.ts:138`) no
tiene callers y el `R2StorageService` del scrapper no tiene método de borrado. El precio es que
staging deja objetos huérfanos en el bucket de prod. El día que se agregue un borrado de
documentos hay que revisar esta decisión: las `storage_key` son las mismas en las dos bases, así
que staging podría borrar un archivo que prod referencia.

El estudio entra con **su mail y contraseña de siempre**: el ETL copió las tablas de auth.

## 4. Scrapper en Coolify

Rama `v2` del repo `arca-scrapper`. Necesita su propio Redis.

- `DATABASE_URL` con el rol **`arca_scrapper`** (tiene grants sobre 18 tablas; lo que no está
  enumerado le da `permission denied`, y eso es a propósito).
- `PROXY_URL` **tal cual está en el `.env` local**, sin `session-<id>`: el id lo inserta el código
  (`conSesion`, `proxy-config.ts:97`) generando uno nuevo por browser. Hardcodearlo sería peor —
  todos los jobs saldrían por la misma IP para siempre.
- `R2_BUCKET=arca`, `QUEUE_NAME` distinto al de prod (`brian-queue`) si comparten Redis: si no, se
  roban jobs.
- `CREDENTIAL_ENCRYPTION_KEY` igual que la app.

## 5. Qué probaría el estudio (sueldos)

El motor de liquidación se reescribió entero: las fórmulas de SOS se reemplazaron por
`modo_calculo` + canastas (`base_calculo`). Es lo que menos cobertura automática tiene.

1. Liquidar un mes de un cliente conocido y comparar el recibo contra el de SOS, línea por línea.
2. Antigüedad, presentismo y aportes: son los que dependen de las canastas nuevas.
3. Conceptos propios del cliente (`cliente_concepto`) e importes fijos.
4. Escalas por convenio y categoría.
5. Exportar el LSD y validarlo en el aplicativo de ARCA.

En el replay contra los 113 recibos importados, 85,5% de las líneas quedó explicado; el resto son
rarezas del import de SOS (lotes de feb-2026 con porcentajes codificados distinto, bases pisadas
a mano). Si el estudio encuentra diferencias, eso es exactamente lo que hay que mirar.

## 6. Lo que este staging NO prueba

- El cutover en sí: sigue faltando la sync incremental ORIGINAL→NEW y el ETL final.
- Datos posteriores al 30/07.
- `resetPortalUserPassword`, que está roto (el `setUserPassword` de Better Auth exige
  `adminMiddleware`).
