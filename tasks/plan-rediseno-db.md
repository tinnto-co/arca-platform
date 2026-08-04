# Plan de rediseño de base de datos — ARCA Platform

**Fecha:** 27/07/2026
**Estado:** Propuesta para revisión
**BD analizada:** producción (snapshot 27/07/2026, 81 tablas, 236.012 filas, ~174 MB)

---

## 1. Resumen ejecutivo

La base de datos actual **funciona pero no escala en mantenibilidad**. El problema principal
NO es el volumen de datos (174 MB y 80k facturas es trivial para PostgreSQL): es la
**deuda estructural** acumulada por crecer sin convenciones:

| Problema | Magnitud medida |
|---|---|
| FKs sin índice | **115 de 146** (cada JOIN por FK escanea la tabla) |
| Tablas sin `updated_at` | **37 de 81** (3 sin `created_at` tampoco) |
| Tablas con 0 filas | **28 de 81** (35% del schema es peso muerto o features abandonadas) |
| Tablas muertas (0 filas + 0 referencias en código) | 4 |
| Idiomas mezclados | inglés y castellano conviven en la misma tabla (`invoice.amountIVA21` vs `payroll_escala.vigenciaDesde`) |
| Períodos como `text` | 7+ tablas guardan `"MM/YYYY"` como texto → imposible indexar/ordenar/rangear bien |
| Tablas anchas | `liquidacion_import_empleado` 53 cols, `liquidacion_import_recibo` 41, `invoice` 38, `client` 36 |
| Conceptos triplicados | `concepto_sos`, `conceptos_completos_sos`, `payroll_concepto` se pisan entre sí |
| Typos en schema | `invoice.cureencyRate` (sic) |
| Sin scoping multi-tenant directo | 34 tablas no tienen columna de tenant (dependen de JOINs de 2-3 saltos para filtrar por org) |

**Recomendación:** rediseño **incremental en 5 fases**, NO big-bang. Un big-bang con la app
en producción, 6.700 líneas en `accounting.tsx` y sin tests es la receta para semanas de
regresiones. Cada fase deja la BD mejor y es deployable por sí sola.

---

## 2. Diagnóstico detallado

### 2.1 Inventario por dominio (81 tablas)

| Dominio | Tablas | Estado |
|---|---|---|
| Auth (Better Auth) | 7 | OK — nombres los fija la librería, no tocar |
| Entidades fiscales | 3 (`representative`, `client`, `fiscal_entity`) | Redundancia de campos entre representative y client |
| Facturación / AFIP | 12 (`invoice`, `iva_scrape`, `notification`, `debt`, `due_date`, `job`, `job_log`, ...) | `invoice` es la tabla más problemática |
| Payroll (sueldos) | 32 | El dominio más grande; nombres en castellano (bien), pero catálogos con formas inconsistentes |
| Contabilidad | 14 (`movements`, `journal_entry`, ...) | FKs débiles (`journal_entry.source_id` uuid sin `references`) |
| IA / agentes | 3 | `agent_run` sin timestamps |
| Bancos | 4 | poco uso |
| Scraping / config | 9 | OK en general |
| **Muertas** | **4** | `employee_event`, `payroll_period_novelty`, `payroll_receipt_template`, `financial_movement_classification` — 0 filas y 0 referencias en `src/` |

### 2.2 Problemas de integridad y performance

1. **115 FKs sin índice.** PostgreSQL no indexa FKs automáticamente. Consecuencias reales:
   - Cada `DELETE`/`UPDATE` en la tabla padre escanea secuencialmente la hija.
   - JOINs por FK (el 90% de las queries de la app) no usan índice del lado hijo.
   - Con 80k facturas ya se nota; con 500k va a doler en serio.
2. **FKs "blandas".** `journal_entry.source_id` es un `uuid` pelado sin `references` → se
   pueden crear asientos huérfanos que apuntan a nada.
3. **`ON DELETE` inconsistente:** mezcla de cascade / no action sin criterio documentado.
   Borrar un `client` hoy puede cascadear a facturas, o fallar, según la tabla.
4. **Sin `updated_at` en 37 tablas** → imposible auditar, debuggear syncs, o hacer
   invalidación incremental de caches.

### 2.3 Problemas de modelado

1. **`invoice` (38 columnas):** tiene 10 columnas de IVA hardcodeadas por alícuota
   (`amount_iva_21`, `amount_iva_105`, `amount_iva_27`, `amount_iva_5`, `amount_iva_25`,
   `iva_21`, `iva_105`, `iva_27`, ...). Cada alícuota nueva de AFIP = migración + tocar
   `iva-calc.ts` + tocar todas las queries. Es el anti-patrón clásico de "columnas repetidas
   que deberían ser filas".
2. **Períodos como texto** (`"07/2026"`) en `iva_scrape.periodo_fiscal` y 6+ tablas más:
   - No se puede ordenar cronológicamente (`"01/2026" > "12/2025"` es falso como string).
   - No se puede hacer range scan por índice.
   - Cada query que cruza con `invoice.emition_date` necesita `to_char()` (visto en
     `verify-iva-nc.ts`), que mata cualquier índice.
3. **Conceptos triplicados:** `conceptos_completos_sos` (catálogo global 1–620),
   `concepto_sos` (mapeo cliente) y `payroll_concepto` (conceptos configurables con fórmula)
   guardan solapadamente código, nombre y tipo. No hay una fuente única de verdad.
4. **Redundancia representative ↔ client:** `fiscalCondition`, `liquidaSueldos` y otros
   campos viven en ambas tablas. Cuando divergen, ¿cuál vale?
5. **`direction` capitalizado inconsistente** (`Inbound`/`Outbound` como text libre, no enum)
   → todo el código compara con `LOWER()` a la defensiva.

### 2.4 Problemas de nomenclatura

- **Idiomas mezclados sin criterio:** `invoice` (inglés) tiene `amountIVA21` (spanglish);
  payroll está en castellano; contabilidad en inglés. Peor: dentro de la misma tabla
  (`client.name` + `client.liquidaSueldos`).
- **camelCase y snake_case mezclados** a nivel columna física.
- **Typos consolidados:** `cureencyRate`.
- **`emition_date`** (sería `emission_date` en inglés o `fecha_emision` en castellano —
  hoy no es ninguna de las dos).

### 2.5 Impacto en el código

- `drizzle/schema.ts`: 2.249 líneas, un solo archivo.
- `src/actions/accounting.tsx`: 6.741 líneas — síntoma directo de que el modelo obliga a
  compensar en código lo que la BD no garantiza (signos de NC, direction case-insensitive,
  parseo de períodos, parseFloat de strings).
- Montos guardados como `text`/`numeric` que el código parsea con `parseFloat(v ?? '0')`
  en todos lados.

---

## 3. Principios de diseño propuestos

Estos son los estándares que todo el schema nuevo debe cumplir. La justificación de cada uno:

1. **Un idioma por dominio, castellano para el negocio.**
   El dominio es AFIP/contable argentino: `alicuota`, `comprobante`, `periodo_fiscal` no
   tienen traducción sin pérdida. Payroll ya está en castellano y es el dominio más sano.
   Infraestructura (auth, jobs, logs) queda en inglés porque Better Auth y BullMQ fijan sus
   nombres. **Regla: tablas de negocio en castellano, tablas de infra en inglés, nunca
   mezclado dentro de una tabla.**
2. **snake_case en la BD, camelCase solo en TypeScript** (Drizzle mapea). Sin excepciones.
3. **Toda tabla tiene:** `id uuid PK default gen_random_uuid()`, `created_at timestamptz
   default now()`, `updated_at timestamptz` (con trigger o manejado por Drizzle).
4. **Toda tabla de negocio tiene scoping de tenant directo** (`org_id` o FK a una tabla que
   lo tenga a 1 salto máximo). Hoy hay 34 tablas donde filtrar por org requiere 2-3 JOINs —
   es un riesgo de fuga de datos entre tenants además de lento.
5. **Toda FK tiene índice.** Regla mecánica, sin criterio caso a caso.
6. **`ON DELETE` explícito y documentado:** `restrict` por default; `cascade` solo en
   hijos puros (líneas de un comprobante, logs de un job).
7. **Estados como `pgEnum`, nunca text libre** (`direction`, `origen`, `status`).
8. **Períodos como `date`** normalizados al día 1 (`2026-07-01` = julio 2026). Ordenable,
   indexable, rangeable, y `to_char(periodo, 'MM/YYYY')` para display.
9. **Montos como `numeric(15,2)`** (o `(15,4)` para cotizaciones), nunca text.
10. **Una fuente de verdad por concepto.** Catálogos globales inmutables + tablas de
    override por tenant, no tres tablas paralelas.

---

## 4. Propuesta de schema objetivo (por dominio)

### 4.1 Entidades fiscales

```
organizacion (Better Auth: organization — no se toca)
└── representante          -- persona física con login AFIP (hoy: representative)
    └── empresa            -- entidad fiscal con CUIT (hoy: client)
        ├── credencial     -- credenciales AFIP cifradas
        └── ...
entidad_fiscal             -- catálogo CUIT/CUIL vistos en comprobantes (hoy: fiscal_entity)
```

- Los campos duplicados (`fiscal_condition`, `liquida_sueldos`, etc.) viven **solo en
  `empresa`**; `representante` queda con datos de login/persona.
- `empresa.org_id` directo (hoy se hereda vía client → orgId, mantener).

### 4.2 Comprobantes (la reforma insignia)

```sql
comprobante (
  id, empresa_id (idx), org_id (idx),
  direccion         comprobante_direccion enum('emitido','recibido'),
  tipo_afip         smallint,          -- 1, 6, 11, 201... (hoy text)
  punto_venta       int,
  numero            bigint,
  fecha_emision     date (idx),
  periodo_fiscal    date,              -- generado: date_trunc('month', fecha_emision)
  cuit_contraparte  → entidad_fiscal,
  moneda            char(3) default 'ARS',
  cotizacion        numeric(15,4),
  neto_gravado      numeric(15,2),
  neto_no_gravado   numeric(15,2),
  exento            numeric(15,2),
  total             numeric(15,2),
  created_at, updated_at
)

comprobante_alicuota (          -- reemplaza las 10 columnas de IVA
  id, comprobante_id (idx, on delete cascade),
  alicuota   numeric(5,2),      -- 21.00, 10.50, 27.00, 5.00, 2.50, 0.00
  neto       numeric(15,2),
  iva        numeric(15,2)
)
```

**Justificación:** alícuota nueva de AFIP = cero migraciones. `calcularIvaDesdeFacturas`
pasa de 25 acumuladores manuales a un `GROUP BY alicuota`. El signo de las NC lo resuelve
una vista o el cálculo (como hoy), pero sobre datos normalizados.

- `iva_scrape` → `iva_declaracion` con `periodo_fiscal date` (adiós `"MM/YYYY"` text).
- Los tipos de comprobante (`INVOICE_TYPES_A/B`, `CREDIT_NOTE_TYPES` hardcodeados en
  `iva-calc.ts`) pasan a tabla catálogo `comprobante_tipo (codigo, letra, es_nota_credito,
  discrimina_iva)` — hoy están duplicados entre `iva-calc.ts` e `invoice.tsx`.

### 4.3 Payroll

Es el dominio mejor modelado; los cambios son de forma, no de fondo:

- **Unificar conceptos:** `conceptos_completos_sos` queda como catálogo global inmutable;
  `payroll_concepto` referencia el catálogo con FK (`concepto_sos_id`) + campos propios
  (fórmula, base); **`concepto_sos` se elimina** (su rol lo absorbe la FK).
- **Partir `liquidacion_import_empleado` (53 cols)** en:
  - `empleado` — identidad y datos laborales estables (~20 cols)
  - `empleado_afiliacion` — obra social, sindicato, ART
  - `empleado_situacion_lsd` — los códigos LSD (situación, condición, modalidad, actividad, zona)
- Catálogos LSD (`payroll_situacion`, `payroll_condicion`, ...): forma única
  `(id, codigo, descripcion, vigente boolean)`.
- Renombrar prefijo redundante: dentro de un schema/dominio claro, `payroll_escala` →
  `escala_salarial`, etc. (opcional, ver fase 4).

### 4.4 Contabilidad

- `journal_entry.source_id` → FK polimórfica explícita: `origen_tipo enum + origen_id` con
  CHECK, o mejor: tablas de vínculo (`asiento_comprobante`, `asiento_movimiento`).
- `movements` → `movimiento` con enum de tipo, no text.

### 4.5 Eliminaciones

| Tabla | Motivo |
|---|---|
| `employee_event` | 0 filas, 0 referencias en código |
| `payroll_period_novelty` | idem |
| `payroll_receipt_template` | idem |
| `financial_movement_classification` | idem |

Y auditar las otras 24 tablas con 0 filas: si la feature está viva pero sin datos, quedan;
si es una feature abandonada, se van.

---

## 5. Estrategia de migración: 5 fases incrementales

**Por qué no big-bang:** app en producción, sin tests, `accounting.tsx` de 6.700 líneas
acoplado al schema actual, y la migración de servidor de BD todavía en cutover. Cada fase
de abajo es un PR + una migración deployable independiente, con rollback trivial.

> ⚠️ Regla operativa: **NUNCA `bun run db:push`** (rompe índices — incidente conocido).
> Cada fase genera SQL con `drizzle-kit generate` y se aplica manualmente con script bun
> (`postgres` package + `MIGRATION_URL`), previa confirmación.

### Fase 0 — Red de seguridad (sin tocar el schema)
- Script de "consistencia contable": correr `verify-iva-nc.ts` + counts por tabla y guardar
  baseline. Después de cada fase se re-corre y debe dar idéntico.
- Backup lógico (`pg_dump -Fc`) antes de cada fase (procedimiento Docker ya validado).

### Fase 1 — Higiene (riesgo ~cero, ganancia inmediata)
- Crear los **115 índices de FK** (`CREATE INDEX CONCURRENTLY`, no bloquea).
- Agregar `updated_at` (+ `created_at` donde falte) a las 37 tablas.
- Convertir `direction`, `status` y demás estados text → `pgEnum` (con normalización de
  datos previa: `UPDATE ... SET direction = lower(direction)`).
- `NOT NULL` + `DEFAULT` donde corresponda.
- **Cero renames** → cero cambios en el código de la app (salvo sacar los `.toLowerCase()`
  defensivos, opcional).

### Fase 2 — Limpieza (riesgo bajo)
- `DROP` de las 4 tablas muertas (previa doble verificación de referencias).
- Fix del typo `cureency_rate` → `cotizacion` (rename de columna + un find/replace acotado).
- Períodos text → `date`: agregar columna nueva `periodo` date, backfill, migrar queries,
  luego drop de la vieja. (Patrón expand/contract, dos migraciones.)
- Agregar `org_id` directo a las tablas de negocio que hoy dependen de JOINs (backfill
  desde la cadena de FKs).
  - ✅ **30/07: `client.organization_id` aplicado en NEW_DB** (FK a organization ON DELETE CASCADE,
    backfill 98/98 desde representative, NOT NULL, índice). Inserts de la app actualizados
    (`client.tsx`, `afip-profiles.tsx`).
  - ⚠️ **Puente para el scrapper:** la columna tiene `DEFAULT 'org_estudio_blakg'` porque
    arca-scrapper inserta en `client` sin org (3 lugares en `arca.ts` + 2 scripts) y su schema
    no tiene la columna. **TAREA DE CUTOVER:** agregar `organization_id` al schema del scrapper,
    completarlo desde el representative en sus inserts, y recién entonces sacar el DEFAULT.

### Fase 3 — Normalización de comprobantes (la fase grande)
- Crear `comprobante_alicuota`, backfill desde las 10 columnas de `invoice`.
- Período de doble escritura: el scrapper escribe en ambos formatos.
- Migrar `iva-calc.ts`, `render-iva-resume.tsx` y las queries de `invoice.tsx` al modelo
  nuevo; validar contra `iva_scrape` con el script de verificación (baseline conocido:
  166/244 débito, 121/244 crédito — el resultado post-migración debe ser idéntico).
- Drop de las 10 columnas viejas.
- **Coordinar con arca-scrapper** (escribe `invoice` directamente).

### Fase 4 — Nomenclatura (mecánica pero extensa)
- Renames tabla por tabla al estándar castellano/snake_case (`invoice` → `comprobante`,
  `client` → `empresa`, etc.), **un dominio por PR**.
- Técnica: `ALTER TABLE ... RENAME` + vista de compatibilidad con el nombre viejo durante
  la transición (`CREATE VIEW invoice AS SELECT ... FROM comprobante`) para no romper el
  scrapper hasta que se actualice.
- Partir `drizzle/schema.ts` en archivos por dominio (`drizzle/schema/comprobantes.ts`,
  `drizzle/schema/payroll.ts`, ...).

### Fase 5 — Consolidación de dominio
- Unificar las 3 tablas de conceptos.
- Partir `liquidacion_import_empleado` en las 3 tablas propuestas.
- Resolver redundancias representative/client.
- Auditoría final de las tablas con 0 filas restantes.

### Orden y dependencias

```
F0 ──► F1 ──► F2 ──► F3 ──► F4 ──► F5
       └─ deployable c/u por separado; F1 y F2 se pueden hacer esta semana
```

F1+F2 son ~90% del beneficio de performance/integridad con ~10% del riesgo.
F3 es el mayor beneficio de mantenibilidad. F4/F5 son calidad de vida a largo plazo.

---

## 6. Riesgos y qué NO hacer

| Riesgo | Mitigación |
|---|---|
| Big-bang rewrite | Prohibido — fases incrementales, cada una con baseline verificado |
| `db:push` rompe índices | Prohibido — SQL generado y aplicado manualmente |
| Scrapper escribe directo en `invoice` | Vistas de compatibilidad + doble escritura en F3/F4; coordinar deploy de ambos repos |
| Sin tests | El script de verificación IVA vs `iva_scrape` es el test de regresión de facto; extenderlo a payroll (totales de recibos por período) antes de F3 |
| Divergencia schema.ts vs BD real | ✅ **Auditada 30/07** (`src/scripts/audit-schema-vs-db.ts`): 0 divergencias de columnas en 80 tablas. Única diferencia: `empleados_categorias` (54 filas) vive solo en BD, excluida a propósito en `drizzle.config.ts` (`tablesFilter`), gestionada por scripts. Incorporarla al schema en F5. |
| Cutover de servidor en curso | No arrancar F1 hasta que el cutover a NEW_DB esté cerrado y estable |

---

## 7. Métricas de éxito

- FKs sin índice: 115 → **0**
- Tablas sin `updated_at`: 37 → **0**
- Tablas muertas: 4 → **0**; tablas con 0 filas: 28 → auditar → objetivo < 10
- Columnas de `invoice`: 38 → ~20 (+ tabla hija de alícuotas)
- Períodos como text: 7 tablas → **0**
- `schema.ts`: 1 archivo de 2.249 líneas → ~8 archivos por dominio
- Script de verificación IVA: resultado idéntico al baseline en cada fase
