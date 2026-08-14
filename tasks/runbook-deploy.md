# Runbook: desplegar la app sobre `contable` (12/08)

Estado al escribir esto: **la base ya está** — `contable` en `77.42.70.84:6001`
poblada, verificada y con el delta del estudio migrado. Producción vieja
congelada en sólo-lectura desde las 07:42 UTC. El merge `v3`→`staging` está
hecho **en local** (commit `d42abe0`, árbol idéntico a v3, tsc/tests/build
verificados). Falta lo de este runbook.

El deploy es **in-place**: la app productiva ya trackea la rama `staging`, así
que no hay deploy nuevo ni cambio de DNS — se actualizan las envs y se pushea.

---

## Paso 0 — Antes de tocar Coolify

Verificar que nadie del estudio esté trabajando (la ventana sigue abierta: la
base vieja está en sólo-lectura, así que como mucho están leyendo).

## Paso 1 — Envs de la app en Coolify (SIN redeployar todavía)

En el servicio de la app productiva (`contable.tinnto.ai`), cambiar:

| Variable | Valor nuevo |
|---|---|
| `DATABASE_URL` | `postgres://arca_app:<pass>@77.42.70.84:6001/contable` |
| `DATABASE_READONLY_URL` | `postgres://arca_agent:<pass>@77.42.70.84:6001/contable` |
| `DATABASE_PORTAL_URL` | `postgres://arca_portal:<pass>@77.42.70.84:6001/contable` |
| `BETTER_AUTH_URL` | `https://contable.tinnto.ai/api/auth` |
| `VITE_BETTER_AUTH_URL` | ídem (es **build arg**: tiene que estar antes del build) |

- Los `<pass>` son los de los roles que ya están en las envs del deploy de
  `arca_staging` (mismo cluster, mismos roles, mismas claves).
- ⚠️ Las tres URLs terminan en **`/contable`** — ni `/postgres` (vacía) ni
  `/arca_staging` (el entorno de staging).
- **No tocar**: `BETTER_AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY` (si cambia,
  las claves de AFIP mueren), `GEMINI_API_KEY`, `R2_*`.
- Guardar las envs sin disparar el deploy (el deploy lo dispara el push).

## Paso 2 — Push de `staging`

Desde `~/Desktop/tinnto/arca-platform` (la rama local ya está lista):

```bash
git checkout staging
git push origin staging
```

Esto dispara el build en Coolify con el código nuevo y las envs nuevas.
Mientras buildea, el contenedor viejo sigue sirviendo (lecturas contra la base
congelada); la ventana de corte real es el swap del contenedor.

> **El primer intento (14/08 10:31) falló acá** con
> `could not find patch file patches/eventsource@3.0.7.patch`. El `package.json`
> declara `patchedDependencies` desde el commit `70ceb45`, pero el `Dockerfile`
> copiaba a la etapa `install` sólo `package.json` y `bun.lock` — sin el
> directorio `patches/`, `bun install --frozen-lockfile` aborta. Arreglado
> agregando `COPY patches ./patches`. Un deploy fallido no rompe nada: Coolify
> descarta la imagen nueva y el contenedor viejo sigue sirviendo.
>
> Moraleja para cualquier cambio de dependencias: el `Dockerfile` copia a la
> etapa `install` una lista **explícita** de archivos. Cualquier cosa nueva que
> `bun install` necesite hay que agregarla ahí a mano, y se verifica en local
> con `docker build --target install .` antes de pushear.

> **El segundo intento (14/08 10:49) también falló**, ya con `bun install` en
> verde: el log se corta mudo en medio de `vite build` y Coolify reporta exit
> 255. Sin mensaje de error porque al proceso lo mataron, no falló. Medido en
> local: el build pide **5,1 GB de RSS pico** (`/usr/bin/time -l bun run build`),
> más de lo que el servidor tiene libre. Postgres sobrevivió — 9 días de uptime
> sin reinicio — porque el OOM killer eligió al más gordo.
>
> Esto ya estaba resuelto para v2 (commit `f0eaf2a`, *"buildear la imagen en CI,
> no en el servidor"*): el workflow `build-image-v2.yml` compila en un runner de
> GitHub de 16 GB y publica en GHCR, y Coolify sólo hace `pull`. Lo que faltaba
> era el equivalente para esta rama → `build-image-staging.yml`.
>
> **El flujo de deploy cambia**: el push ya no deploya solo. Push a `staging` →
> GitHub Actions publica la imagen → apretar *Deploy* en Coolify. Igual que v2.

## Paso 3 — Mirar el arranque

En los logs del contenedor nuevo tienen que aparecer:

- `[accounting-batch] cron activo`
- `[inflation-index] cron activo`
- Ningún error de conexión a Postgres.

Si el arranque loguea errores de tablas inexistentes → las envs quedaron
apuntando a la base equivocada (ver Paso 1).

## Paso 4 — Smoke test (entrar con tu usuario de siempre)

1. Login (el ETL copió las tablas de auth: mismas contraseñas).
2. Listar clientes → tienen que ser ~140, incluidos los 9 del 30/07
   (`RR SLOT DISEÑO SRL`, `ALIFLOR S.A.`, …).
3. Abrir un cliente → solapa Resumen → **abrir un documento** (valida R2).
4. Sueldos → un recibo de E-presis de mayo (los del estudio del 05/08 tienen
   que estar, incluido el empleado `CARBALLO, MATIAS ALEJANDRO`).
5. Contabilidad → que abra la solapa (plan de cuentas con 91+ cuentas).
6. Jobs → el log tiene que mostrar los de `escalas` y `tope_imponible`.

> **Resultado del 14/08 (entorno `contable.staging.tinnto.ai`)** — 5 de 5:
> login OK (`estudioblakg@gmail.com`, 11:21:43) · 140 clientes · **PDF de una
> notificación renderizado inline desde R2** (el punto más frágil: las cuatro
> `R2_*` no existían en la config vieja) · recibo de E-presis de mayo presente ·
> Plan de cuentas con las 6 raíces `alcance base` y las 91 imputables colgando.
> Cero jobs fallidos.
>
> Detalle que confundió durante la prueba: `contable.tinnto.ai` (producción,
> modelo viejo, 98 clientes en la tabla `client`) y `contable.staging.tinnto.ai`
> (modelo ideal, 140 en `cliente`) son entornos distintos. El conteo de clientes
> es la forma más rápida de saber en cuál estás parado.
>
> **Arquitectura del deploy, cambiada**: la app de este entorno dejó de ser un
> recurso de Git con build pack Dockerfile y pasó a ser un recurso de tipo
> **Docker Image** (`ghcr.io/tinnto-co/arca-platform:staging`), porque el
> servidor no puede compilar. En Coolify "Docker Image" no es un build pack: es
> un tipo de recurso y se elige al crearlo, no se puede cambiar después. El ciclo
> ahora es: push a `staging` → GitHub Actions publica la imagen → *Deploy* a mano.

## Paso 5 — Scrapper

En el servicio del scrapper productivo:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `postgres://arca_scrapper:<pass>@77.42.70.84:6001/contable` |
| `CRON_ENABLED` | `false` (por ahora) |
| `QUEUE_NAME` | distinto al del scrapper de staging si comparten Redis |
| `PROXY_URL` | **no tocar** |
| `CREDENTIAL_ENCRYPTION_KEY` | la misma de siempre |

Rama: la que tenga el job de `tope_imponible` (hoy `v2` de arca-scrapper; si
el deploy trackea `staging` de ese repo, mergear primero — mismo criterio que
acá).

## Paso 6 — Prender el cron (el punto de no retorno)

Con el smoke del Paso 4 OK y el scrapper arriba:

```
CRON_ENABLED=true   # y redeploy del scrapper
```

⚠️ A partir de acá `contable` empieza a recibir escrituras nuevas y el
rollback deja de ser gratis. Hasta este punto, volver atrás es: revertir las
envs del Paso 1 + redeploy de la rama anterior + descongelar la base vieja
(un comando, lo tiene Claude).

## Paso 7 — Avisar al estudio

Entran por la misma URL con las mismas contraseñas. Las dos cosas que van a
notar: los datos están al día de hoy 07:42, y su entorno de pruebas
(`arca_staging` vía el deploy v2) sigue existiendo aparte.

---

## Después (sin apuro)

- **Dos semanas de redes**: base vieja congelada + `arca_staging` intacta +
  los dumps en `ARCA/backups/cutover-final/`. Ninguna se toca.
- El deploy v2 (entorno del estudio) puede pasarse a trackear `staging`
  cuando convenga, apuntando a `arca_staging`.
- Pendientes conocidos: `resetPortalUserPassword` (roto de antes), limpiar
  `src/scripts/**` del modelo viejo, las 23 empresas de
  `clientes-fuera-de-planilla.md` con el estudio, y el paso 18 formal
  (liquidación contra SOS) si se quiere el cierre prolijo.
- Cuando se decida no volver: descongelar la base vieja es
  `alter database postgres set default_transaction_read_only = off`
  — pero recién ahí.
