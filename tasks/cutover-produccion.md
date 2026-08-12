# Cutover a producción — BD_IDEAL detrás de contable.tinnto.ai

> **ESTADO 12/08 ~08:00 UTC: EJECUTADO hasta el paso 28.** Producción congelada
> (sólo-lectura) desde las 07:42; dump final x2 en `ARCA/backups/cutover-final/`;
> `contable` creada en :6001, restaurada y verificada (84 tablas, 71 políticas,
> RLS por rol OK, delta de arca_staging migrado, topes al día, 532 documentos).
> Falta el lado Coolify/DNS (pasos 29–33, Gaston) y el merge eventual v3→staging.

Relevamiento del 2026-08-11, medido contra las bases vivas. Corrige varias cosas que
`handoff-maquina-nueva.md` y `staging-modelo-ideal.md` daban por ciertas y ya no lo son.

Decisiones tomadas para este plan:

1. **Lo que viene de `staging` manda.** El módulo de Contabilidad/Balances es correcto y no se
   pierde: hay que portarlo al modelo ideal antes del cutover.
2. **Producción va al server `77.42.70.84:6001`**, en una base nueva llamada **`contable`**.
   `arca_staging` —el ensayo del 04/08— no se renombra ni se pisa: queda viva como red de rollback.
3. **La fuente del ETL final es producción directo** (`5.78.132.83:5438`), no NEW_DB.

## 1. Las cuatro bases, hoy

Nombres que se usan en todo este documento. La palabra "staging" está sobrecargada en los docs
viejos —designa tanto a NEW_DB como a la base ideal remota—, así que acá cada base se nombra por su
rol:

| Nombre | Variable | Host | Modelo |
|---|---|---|---|
| **ORIGINAL_DB** | *(comentada en `.env`)* | `5.78.132.83:5438/postgres` | viejo |
| **NEW_DB** | `STAGING_DATABASE_URL` | `77.42.70.84:5559/postgres` | viejo |
| **IDEAL_REMOTE** | `IDEAL_DATABASE_REMOTE` | `77.42.70.84:6001/**arca_staging**` → en el cutover, **`contable`** | ideal |
| **IDEAL_LOCAL** | `IDEAL_DATABASE_URL` | `localhost:5460/arca_ideal` | ideal |

| Rol | PG | Tablas | RLS | Tamaño | Última escritura |
|---|---|---:|---|---:|---|
| **ORIGINAL_DB** — producción viva | 17.6 | 81 | no | 175 MB | 10/08 21:11 |
| **NEW_DB** — sirve el deploy de `staging` | 17.10 | 82 | no | 146 MB | 11/08 14:00 |
| **IDEAL_REMOTE** — sirve el deploy de `v2` | 17.10 | **78** | 52 tablas / 67 políticas | 121 MB | 11/08 18:14 |
| **IDEAL_LOCAL** — destino del ETL | 17.10 | 79 | 52 tablas / 67 políticas | 129 MB | 07/08 12:38 |

### IDEAL_REMOTE: el connection string de Coolify apunta a la base equivocada

En `77.42.70.84:6001` hay **dos** bases:

| Base | Tablas | Tamaño |
|---|---:|---:|
| `arca_staging` | 78 (52 con RLS, 67 políticas) | **121 MB** |
| `postgres` | **0** | 7,5 MB |

Coolify muestra `postgres://postgres:…@77.42.70.84:6001/**postgres**`, que es la base **vacía**.
El restore del 04/08 fue a `arca_staging`, como decía `staging-modelo-ideal.md`. Deployar con el
string que Coolify muestra levanta la app contra una base sin tablas — y el síntoma es "no hay
clientes", no un error.

Los cuatro roles están bien: `arca_app`, `arca_agent`, `arca_portal` y `arca_scrapper` existen, los
cuatro con `login`, ninguno con `bypassrls`, y los grants son 78 / 78 / 17 / 18 tablas — idénticos a
la verificación del 04/08. Los roles son **del cluster**, no de una base: sirven igual para la base
nueva sin recrearlos. Los GRANT sí son por base, y viajan en el dump de IDEAL_LOCAL.

### La base de producción se va a llamar `contable`

`arca_staging` es un nombre heredado del ensayo del 04/08 y no describe lo que va a ser. En el
cutover **no se renombra**: se crea `contable` limpia y se restaura ahí (paso 25). Renombrar exigiría
matar las 12 conexiones vivas del deploy de v2 y dejaría al estudio sin entorno hasta actualizar
Coolify; crear una base nueva no interrumpe nada.

El efecto lateral es la mejor parte del cambio: **`arca_staging` sobrevive intacta** durante todo el
cutover. Deja de haber un `drop schema public cascade`, el delta de R10 no corre riesgo de
destruirse, y queda una segunda red de rollback además del dump de producción. Se tira recién en la
Fase 4, cuando ya no se vuelve atrás.

### IDEAL_REMOTE está en uso, y tiene trabajo que no existe en ningún otro lado

No es una base congelada esperando el cutover: el estudio la sigue usando. Todas las horas que
siguen son **UTC**, que es la zona del server.

**Delta a rescatar antes de cualquier restore** — nada de esto existe en IDEAL_LOCAL, ni en NEW_DB,
ni en producción:

| Cuándo | Qué | Recuperable de otro lado |
|---|---|---|
| 05/08 17:12 | **14 recibos** + **157 `recibo_concepto`** en 11 combinaciones cliente/período: `Carballo Fabian Alberto` (10 recibos, 2026-01 a 2026-08), `Artzeinu x2 S.A.`, `Gb Metal SA`, `Sabenumitubeja S.A.` | no |
| 05/08 16:54 | **1 empleado**: `CARBALLO, MATIAS ALEJANDRO` (de `Carballo Fabian Alberto`) | no |
| 11/08 15:17 | `RR SLOT DISEÑO SRL` → `iibb_regimen = 'local'` (estaba en null) | sí, se vuelve a tildar |
| 11/08 15:17 | **`credencial_afip` de `Rodrigo Ernesto Cella`** (CUIT 20221096399): `clave` reescrita y `ultimo_login_ok` reseteado a null | **no** |

La credencial es la más crítica: la clave en texto plano sólo la tiene el estudio. Un matiz — no se
puede afirmar que la contraseña *cambió*, sólo que el ciphertext difiere del de IDEAL_LOCAL, y el
cifrado es AES-256-GCM con IV aleatorio (la misma clave guardada dos veces da bytes distintos). Lo
concluyente es que la fila se reescribió y que `ultimo_login_ok` pasó a null: el patrón de "se
re-cargó la credencial y todavía no se validó contra AFIP".

Sesiones: 6 desde el restore, la última de `estudioblakg@gmail.com` el 11/08 a las 18:14.

Como el restore va a una base nueva (`contable`), **nada de esto se destruye**: `arca_staging` queda
en pie y el delta se puede leer de ahí cuando haga falta. Igual hay que **migrarlo a `contable`**, o
el estudio abre producción y no encuentra su trabajo. Ver R10.

Y el delta crece: mientras se planifica el cutover el estudio sigue trabajando sobre esa base, así
que este inventario hay que **volver a sacarlo el día del cutover**, no confiar en esta tabla.

Además a IDEAL_REMOTE le falta **`cct_fuente`** (78 tablas contra las 79 de IDEAL_LOCAL): la tabla
que controla el scrape automático de escalas se creó en local después del restore del 04/08. Un
restore desde IDEAL_LOCAL la trae sola.

Cuatro cosas que los documentos viejos dicen mal:

- **NEW_DB no está congelada.** El scrapper de staging le escribió **696 jobs en los últimos 7
  días**, la última sesión es de hoy 20:35. Cualquier plan que la trate como snapshot inmutable
  arranca con una premisa falsa.
- **BD_IDEAL tampoco es un derivado puro del ETL.** El scrapper local le escribió hasta el 07/08:
  tiene 81.341 comprobantes contra los 73.431 de NEW_DB, y 708 documentos contra 531. Re-correr el
  ETL borra todo eso (los `truncate` de D1–D6). No es pérdida real: producción tiene esos datos.
- **Producción está casi ociosa.** 1 job en 7 días. La ventana de cutover es cómoda; el riesgo no
  es el downtime, es el ETL.
- **`main` y `staging` son el mismo código salvo el `Dockerfile`.** No hay que reconciliar dos
  ramas de producción, sólo una.

## 2. Diff de schemas

### 2.1 Producción vs NEW_DB — las dos en modelo viejo, ya divergentes

**Tablas sólo en producción** (las cuatro con 0 filas, así que no bloquean):
`employee_event`, `financial_movement_classification`, `payroll_period_novelty`,
`payroll_receipt_template`.

**Tablas sólo en NEW_DB** — el módulo de Contabilidad de la rama `staging`:
`inflation_index` (**402 filas**), `inflation_adjustment` (0), `inflation_adjustment_line` (0),
`audit_report_template` (0), `payroll_liquidacion_cierre` (0).

**Columnas sólo en NEW_DB**: las que agregó `tasks/fase1-higiene.sql` el 30/07 — `updated_at` en 22
tablas, `periodo` en `debt`/`due_date`/`iva_scrape`, `periodo_fecha` en `liquidacion_import_recibo`
/`payroll_parametros_periodo`/`payroll_lsd_presentacion`/`iibb_liquidacion`,
`client.organization_id`, `client.accounting_framework` — más las del módulo contable:
`accounting_account.inflation_target_id`, `financial_statement.audit_report|layout|section_labels`,
`fiscal_year.reference_only|statements_adjusted`.

**Datos que producción tiene y NEW_DB no:**

| Tabla | Producción | NEW_DB | Δ |
|---|---:|---:|---:|
| `invoice` | 80.817 | 73.431 | **+7.386** |
| `debt` | 2.785 | 519 | **+2.266** |
| `payroll_escala` | 7.420 | 6.550 | +870 |
| `lsd_perfil_concepto` | 716 | 349 | +367 |
| `payroll_convenio_categoria` | 1.880 | 1.714 | +166 |
| `notification` | 897 | 796 | +101 |
| `invoice_attachment` | 532 | 494 | +38 |
| `client` | 132 | 98 | +34 |
| `afip_empleadores_convenio` | 83 | 59 | +24 |
| `payroll_convenio` | 67 | 59 | +8 |

**Datos que NEW_DB tiene y producción no:** 830 jobs (del scrapper de staging), 2 `representative`,
1 `payroll_lsd_presentacion`, las 402 filas de `inflation_index`, y **9 clientes cargados a mano el
30/07 durante la limpieza de espejos** (ver §3.4).

### 2.2 Modelo viejo vs modelo ideal

El salto está documentado columna a columna en `tasks/migracion-nueva-db.md`. Los tres cambios que
importan para el cutover:

- `client` (132 filas, entidad fiscal + login AFIP en la misma tabla) se parte en `cliente` (97) +
  `credencial_afip` (63). Los "34 clientes que faltan" no faltan: son logins.
- El motor de liquidación cambió de fórmulas SOS a `modo_calculo` + canastas (`base_calculo`).
- Aparece RLS: 52 tablas, 67 políticas, cuatro roles (`arca_app`, `arca_agent`, `arca_portal`,
  `arca_scrapper`).

**El schema ideal no tiene drift**: las 79 tablas de `src/scripts/ideal/schema-dominio*.sql`
coinciden exactamente con las 79 de la base local. Nadie tocó la base a mano.

### 2.3 Lo que el modelo ideal NO cubre

El modelo ideal se diseñó antes del módulo de Contabilidad y no tiene dónde poner:

| Viejo (`staging`) | Ideal — hay que crearlo | Filas a migrar |
|---|---|---:|
| `inflation_index` | `indice_inflacion` (catálogo global, sin `org_id`) | **402** |
| `inflation_adjustment` | `ajuste_inflacion` | 0 |
| `inflation_adjustment_line` | `ajuste_inflacion_linea` | 0 |
| `audit_report_template` | `plantilla_informe_auditor` | 0 |
| `payroll_liquidacion_cierre` | `liquidacion_cierre` | 0 |
| `accounting_account.inflation_target_id` | `cuenta.cuenta_ajuste_id` | — |
| `financial_statement.audit_report\|layout\|section_labels` | 3 columnas en `eecc` | — |
| `fiscal_year.reference_only\|statements_adjusted` | 2 columnas en `ejercicio` | — |

Más dos enums: `inflation_index_source` (`facpce_rt6, indec_ipc, manual`) y
`inflation_adjustment_status` (`draft, applied`).

**La buena noticia**: el modelo ideal ya anticipó la mitad del trabajo. `cuenta` ya tiene
`naturaleza_inflacion`, `flujo_efectivo`, `rubro` y `funcion_gasto`; `ejercicio` y `eecc` ya
existen con estados y firma. Y de datos hay que mover **una sola tabla de 402 filas**, que además
es un catálogo que el cron de FACPCE regenera solo.

El costo real no es el schema: son los **42 archivos de aplicación** que `staging` tiene y `v2` no.

## 3. Puntos críticos

### 3.1 `v2` no tiene el módulo de Contabilidad — BLOQUEANTE

42 archivos viven sólo en `staging`: el motor de ajuste por inflación RT 6
(`accounting-inflation.ts`), EEPN, Flujo de Efectivo, Anexo I, informe del auditor, Libro
Inventarios, el cron de índices FACPCE, `accounting-payroll-posting.ts`, `alert-generator.ts`,
`payroll-cron.ts`, y las acciones `inflation.tsx` / `invoice.tsx` / `profile.tsx`.

Deployar `v2` hoy borra la solapa de Contabilidad de contable.tinnto.ai. Hay que portar antes.

**Ojo con `profile.tsx` / `profile-detail-page.tsx`**: `staging` resolvió el problema de "un cliente
con varias entidades fiscales" con un `profile`; el modelo ideal lo resolvió con
`cliente` + `credencial_afip`. Son dos soluciones al mismo problema y **no se mergean solas**. Es
el único conflicto semántico real del port.

### 3.2 El ETL es destructivo y sólo escribe a localhost

`etl-dominio1.ts:20` aborta si el destino **no** es localhost, y la línea 15 aborta si el origen
**sí** lo es. D1–D6 hacen `truncate ... cascade`; D7 hace `delete from` (no puede usar cascade sin
vaciar media base). El orden 1→7 es obligatorio: D6 carga alertas con `origen_id` null y D7 las
religa.

Consecuencia para el plan: **la base remota no se puebla corriendo el ETL contra ella**. Se puebla
con `pg_dump`/`pg_restore` desde la BD_IDEAL local, como se hizo el 04/08.

Y cada re-run de D6 pisa `documento.storage_key` a null — el subidor a R2 se corre **después**,
siempre.

### 3.3 Producción no tiene las columnas que el ETL lee

El ETL lee `organization_id` (13 veces), `periodo` (31) y `periodo_fecha` (2) del origen. Producción
no tiene ninguna: las agregó `fase1-higiene.sql` sólo en NEW_DB. Correr el ETL contra un restore
crudo de producción falla.

`fase1-higiene.sql` es idempotente (154 `if not exists`, cero `drop`/`delete`/`truncate`) pero
incluye 115 `create index concurrently`, que no corren dentro de una transacción. Su encabezado dice
**"NUNCA en ORIGINAL_DB"** — y se respeta: se aplica sobre el **restore descartable**, nunca sobre
producción viva.

### 3.4 Yendo directo contra producción se pierden las correcciones del 30/07

Estos 9 clientes existen en NEW_DB y en BD_IDEAL, y **en producción no están** — ni como `client`
ni como `representative`. Se cargaron a mano el 30/07 al desarmar los espejos. Los 9 tienen 0
comprobantes:

`RR SLOT DISEÑO SRL` (30714955930) · `ALIFLOR S.A.` (30707001190) · `Hexacom SA` (30643202812) ·
`NickTime SA` (30707795022) · `Javmar Srl` (30708771356) · `Toloki SA` (30716787407) ·
`Yinrai SA` (30719001994) · `La Iriel SA` (33716869089) · `Charm Home SA` (30718922549)

Hay que re-aplicarlos después del ETL con un script explícito. Lo mismo con los 2 `representative` y
la `payroll_lsd_presentacion` que sólo están en NEW_DB.

En el otro sentido: **3 clientes de producción no están en BD_IDEAL** (por CUIT, contra `cliente` y
`credencial_afip`) — `Gaabriel Sekzer` (20178994930, 08/06), `Alan Sfintzi` (20443663534, 24/07) y
`Eco Prs Community` (30719459591, **10/08**). El ETL desde producción los trae solo; la que hay que
mirar es la última, cargada ayer, porque confirma que el estudio sigue dando altas.

### 3.5 Usuarios de prueba que se filtrarían a producción

BD_IDEAL tiene **6 usuarios**; producción tiene 4. Los dos de más son
`gas.balatti@gmail.com` y `gaston.balatti@gmail.com`, creados probando el portal. Un
`pg_dump`/`pg_restore` los lleva a producción junto con sus filas de `acceso_usuario_cliente`.
Borrarlos antes del dump, o filtrarlos después.

### 3.6 El resto de la lista

- **`CREDENTIAL_ENCRYPTION_KEY` tiene que ser la misma de siempre**, en la app y en el scrapper. Si
  cambia, las 63 credenciales de AFIP quedan inservibles y no hay forma de recuperarlas.
- **`DATABASE_URL` no puede ser `arca` ni el superusuario**: son dueños, bypassean RLS y el
  aislamiento por organización desaparece en silencio. Van `arca_app` / `arca_agent` /
  `arca_portal` / `arca_scrapper`.
- **Las contraseñas de RLS del repo (`arca_local`, en `schema-rls.sql`) no van a producción.** Las
  de `arca_staging` ya se generaron nuevas el 04/08 y viven en Coolify.
- **Los roles se crean antes del restore.** El dump trae políticas y GRANT que los referencian por
  nombre; `pg_dump` no dumpea roles y el restore falla.
- **Postgres 17 en las dos puntas.** Un restore a 16 falla.
- **BD_IDEAL no tiene `drizzle.__drizzle_migrations`.** El schema se aplica con
  `src/scripts/ideal/apply-schema.ts`, no con drizzle-kit. `bun run db:push` rompe índices — el SQL
  se aplica a mano con un script bun.
- **R2 es el mismo bucket que producción**, a propósito: en la base sólo va la `storage_key`. Hoy es
  seguro porque nada borra objetos (`r2.remove` no tiene callers). El día que se agregue un borrado
  de documentos, revisar.
- **Dos scrappers contra las mismas cuentas de AFIP** se pisan las sesiones. Antes del cutover hay
  que apagar el de staging (`CRON_ENABLED=false`), y `QUEUE_NAME` distinto si comparten Redis.
- **`resetPortalUserPassword` está roto** (el `setUserPassword` de Better Auth exige
  `adminMiddleware`). No bloquea el cutover, pero el estudio se lo va a encontrar.
- **194 errores de TS en `src/scripts/**`** (apuntan al modelo viejo). La app compila limpia: 0
  errores fuera de `src/scripts`. Hay que migrarlos o borrarlos antes de que alguien los corra
  contra la base nueva.
- **El connection string de Coolify apunta a `postgres`, que está vacía.** La base con datos es
  `arca_staging` (§1). Es un cambio de una palabra en la env, y sin él la app arranca contra 0
  tablas.

### 3.7 El cutover pisa el entorno donde el estudio está trabajando — R10

Promover IDEAL_REMOTE a producción tiene dos consecuencias que no estaban en el plan original:

1. **El delta acumulado no llega a producción.** Restaurando en `contable` ya no hay riesgo de
   *perderlo* —`arca_staging` queda intacta—, pero sí de **olvidarlo**: los 14 recibos, 157 conceptos
   y 1 empleado del 05/08, más las dos ediciones del 11/08 (el `iibb_regimen` de
   `RR SLOT DISEÑO SRL` y la `credencial_afip` de `Rodrigo Ernesto Cella`). Si no se migran, el
   estudio abre producción y su trabajo no está. El delta **crece cada día** entre este relevamiento
   y el cutover, así que el inventario se vuelve a sacar el día que se ejecuta.
2. **El estudio se queda sin entorno de prueba.** Hoy `arca_staging` *es* donde prueban sueldos. Con
   el esquema de base nueva esto se suaviza: `arca_staging` puede quedar viva como ambiente de
   ensayo en el mismo server, apuntada por un deploy aparte. Si en cambio se la tira en la Fase 4,
   hay que decidir dónde ensayan el próximo cambio antes de hacerlo.

Y hay un detalle operativo: el estudio entró hoy a las 18:14. El cutover sobre esa base los saca de
la sesión sin aviso. Hay que coordinarlo, no sólo anunciarlo.

## 4. Plan

### Fase 0 — cerrar el gap de código

1. Rama `v3` desde `v2`. Mergear `origin/staging` y resolver a mano: quedarse con el módulo de
   Contabilidad de `staging` y con el modelo ideal de `v2`.
2. Resolver el conflicto `profile` vs `cliente`+`credencial_afip` (§3.1). Es la decisión de diseño
   del merge, no un conflicto de texto.
3. Reescribir las queries del módulo contable contra el modelo ideal: `accounting_account`→`cuenta`,
   `journal_entry`→`asiento`, `fiscal_year`→`ejercicio`, `financial_statement`→`eecc`,
   `fixed_asset`→`bien_de_uso`, `client_id`→`cliente_id`.
4. `bunx tsc --noEmit` limpio fuera de `src/scripts`. (`bun run lint` se muere por OOM sobre todo el
   repo; usar `bunx prettier --write` sobre los archivos tocados.)

**Criterio de salida:** los tests de `accounting-*.test.ts` que vienen de `staging` pasan contra el
modelo ideal.

### Fase 1 — extender el modelo ideal

5. `src/scripts/ideal/schema-dominio8.sql`: los 2 enums, las 5 tablas nuevas y las 6 columnas de
   §2.3, con RLS por `org_id` igual que el resto del dominio 4.
6. Extender `apply-schema.ts` y `schema-rls.sql` (grants a los cuatro roles).
7. `etl-dominio8.ts`: sólo `inflation_index` → `indice_inflacion`, 402 filas. Alternativa: correr el
   seed de FACPCE y no migrar nada.
8. Aplicar sobre la BD_IDEAL local y verificar que las 84 tablas quedan sin drift contra los `.sql`.

### Fase 2 — ensayo completo, en seco

Todo esto sin tocar producción ni el `arca_staging` de :6001.

9. `pg_dump -Fc` de producción a un archivo con fecha. **Este dump es el rollback.** Guardarlo en
   dos lugares.
10. Restaurar en una base descartable local (`arca_prod_frozen`, otro puerto).
11. Aplicar `tasks/fase1-higiene.sql` sentencia por sentencia (`simple: true`, sin transacción) y
    `fase1b-trigger-updated-at.sql` — ojo: fase1b lleva un bloque `DO $$`, va entero, no spliteado.
12. Aplicar las 5 tablas del módulo contable sobre esa copia (con sus dos enums: `pg_dump -t` no
    los arrastra), `inflation_index` **con datos** desde NEW_DB, y **las dos columnas de `client`
    que la higiene NO cubre** (hallazgo del ensayo del 11/08 — sin esto el ETL D1 aborta):

    ```sql
    alter table client add column organization_id text not null default 'org_estudio_blakg';
    alter table client add column accounting_framework text not null default 'rt54';
    ```
13. Re-crear BD_IDEAL desde cero: `apply-schema.ts` + ETL D1→D8 con
    `DATABASE_URL=<arca_prod_frozen>`. **Nunca con BD_IDEAL como origen.**
14. `subir-documentos-r2.ts --apply` (después del ETL, siempre) y
    `dedupe-deuda-vencimiento.ts --apply`.
15. Re-aplicar las correcciones del 30/07 con
    `src/scripts/ideal/aplicar-correcciones-newdb.ts` (escrito y ensayado el 12/08): detecta el
    delta por CUIT dinámicamente — 9 clientes, **6** credenciales (no 2: la comparación por CUIT
    es más fina que la de counts) y 1 LSD de E-presis —, es idempotente y solo inserta. Dry-run
    por defecto, `--apply` para escribir.
    `DATABASE_URL="$STAGING_DATABASE_URL" IDEAL_DATABASE_URL=<destino> bun src/scripts/ideal/aplicar-correcciones-newdb.ts --apply`
16. Borrar los 2 usuarios de prueba de §3.5.
17. **Verificación**, con los números anotados: 132 CUITs de producción presentes entre `cliente` y
    `credencial_afip`; `comprobante` ≈ 80.817; `credencial_afip` = 63; `documento` con
    `storage_key` no null = 100%; los 4 roles de RLS responden como el 04/08 (sin `app.org_id` → 0
    filas; con → todo; `arca_scrapper` con `permission denied` sobre `concepto`;
    `arca_portal` con `permission denied` sobre `credencial_afip`).
18. Levantar `v3` contra esa base y que el estudio liquide un mes conocido y compare el recibo
    contra el de SOS, línea por línea.

**Criterio de salida:** el paso 17 pasa entero y el estudio firma el paso 18. Si el ensayo falla, se
repite; el cutover no arranca hasta que el ensayo salga limpio de punta a punta.

### Fase 3 — cutover

19. Anunciar la ventana. Apagar el scrapper de staging y el de producción (`CRON_ENABLED=false`) y
    esperar a que drenen los jobs en vuelo.
20. **Poner producción en sólo lectura** (`alter database ... set default_transaction_read_only`, o
    bajar la app). Sin esto el dump sale inconsistente contra lo que el estudio siga cargando.
21. `pg_dump -Fc` final de producción. Este es el dump del cutover, y el rollback.
22. Repetir 10→17 con el dump final. Los pasos ya están ensayados; acá se ejecutan, no se
    improvisan.
23. Los cuatro roles **ya existen** en el cluster con los grants correctos (§1) — son del cluster, no
    de la base, así que sirven para `contable` sin recrearlos. Verificar nomás que siguen ahí.
24. **Inventariar el delta de `arca_staging`** (R10). La tabla de §1 es del 11/08 y el estudio sigue
    escribiendo: hay que **re-generarla contra la base viva**. Como mínimo va a incluir los 14
    recibos + 157 `recibo_concepto` + el empleado `CARBALLO, MATIAS ALEJANDRO` (05/08), el
    `iibb_regimen` de `RR SLOT DISEÑO SRL` y la `credencial_afip` de `Rodrigo Ernesto Cella`
    (20221096399). Exportarlo a un script de re-inserción — o confirmar con el estudio que es
    descartable.
25. `create database contable` en `77.42.70.84:6001` (mismo encoding y locale que `arca_staging`).
    **No se renombra ni se borra nada**: `arca_staging` queda intacta.
26. `pg_dump -Fc --no-owner` de IDEAL_LOCAL (sin `--no-privileges`: los GRANT tienen que viajar) y
    `pg_restore --no-owner` sobre **`contable`**. El restore trae `cct_fuente`, que hoy falta en la
    remota.
27. Aplicar el script del paso 24 sobre `contable`, si se decidió conservar el delta.
28. Correr la verificación del paso 17 **contra `contable`**.
29. Coolify — app: `DATABASE_URL`=`arca_app`, `DATABASE_READONLY_URL`=`arca_agent`,
    `DATABASE_PORTAL_URL`=`arca_portal`, **las tres contra `/contable`** — ni `/arca_staging` ni
    `/postgres`; `BETTER_AUTH_URL`/`VITE_BETTER_AUTH_URL` con el dominio de producción (`VITE_*` es
    build arg), `BETTER_AUTH_SECRET` y `CREDENTIAL_ENCRYPTION_KEY` los de siempre, `R2_*`,
    `GEMINI_API_KEY`. Rama `v3`.
30. Coolify — scrapper: rama `v3`, `DATABASE_URL` con `arca_scrapper` (también `/contable`),
    `CREDENTIAL_ENCRYPTION_KEY` igual, `R2_BUCKET=arca`, `QUEUE_NAME` propio, `PROXY_URL` **sin**
    `session-<id>` (lo inyecta `conSesion` en `proxy-config.ts:97`). Levantar con
    `CRON_ENABLED=false`.
31. Apuntar `contable.tinnto.ai` al deploy nuevo. Login del estudio con su mail y contraseña de
    siempre (el ETL copia las tablas de auth).
32. Smoke test con un usuario real: listar clientes, abrir un comprobante, abrir un documento
    (valida R2), liquidar un recibo, exportar el LSD.
33. Recién ahí, `CRON_ENABLED=true` en el scrapper nuevo. Un solo scrapper vivo.

### Fase 4 — después

34. Dejar producción vieja **encendida y en sólo lectura** dos semanas. Es el rollback caliente.
35. Dejar **`arca_staging` en pie** el mismo tiempo: es la segunda red, y de ahí sale cualquier cosa
    del delta que se haya pasado por alto.
36. Sacar el `default_transaction_read_only` recién cuando se decida no volver.
37. Decidir el destino de `arca_staging` (R10.2): o se la convierte en el ambiente de prueba del
    estudio con un deploy aparte, o se la tira — pero no antes de tener dónde ensayen.
38. Migrar o borrar los `src/scripts/**` viejos (194 errores de TS) antes de que alguien los corra
    contra la base nueva.
39. Arreglar `resetPortalUserPassword`.
40. Revisar las 23 empresas de `tasks/clientes-fuera-de-planilla.md` con el estudio.

## 5. Rollback

Mientras `contable.tinnto.ai` no haya escrito nada nuevo en `contable`: apuntar el DNS de vuelta al
deploy viejo y sacar el sólo-lectura de producción. Segundos.

Una vez que hay escrituras nuevas no hay vuelta atrás automática — hay que decidir entre perderlas o
migrarlas a mano al modelo viejo. Por eso el smoke test del paso 32 va **antes** de prender el cron
y antes de avisarle al estudio.

Hay tres redes, en orden de cercanía:

1. **`arca_staging`**, intacta en el mismo server — nada del cutover la toca.
2. **Producción vieja**, encendida y en sólo lectura dos semanas.
3. **El dump del paso 21.** Sin él, no se arranca.

## 6. Decisiones abiertas

Ya resueltas: IDEAL_REMOTE es accesible, la base buena es `arca_staging`, y los cuatro roles de RLS
están creados con los grants correctos.

Queda por decidir:

- **El delta de `arca_staging`** (R10.1): ¿prueba descartable, o trabajo a migrar a `contable`? Ya no
  hay riesgo de perderlo —`arca_staging` sobrevive— pero sí de que el estudio abra producción y no
  encuentre lo suyo.
- **Qué pasa con `arca_staging` después** (R10.2): puede quedar como ambiente de prueba con un
  deploy aparte, o tirarse. No se tira antes de tener dónde ensayen.
- **El conflicto `profile` vs `cliente`+`credencial_afip`** (§3.1). Es lo único del plan que no se
  resuelve leyendo código.
- Confirmar en Coolify que `contable.tinnto.ai` hoy sirve `main`/`staging` contra
  `5.78.132.83:5438` — el plan lo asume por los datos, no está verificado.
