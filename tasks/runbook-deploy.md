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
