# Decisiones del port staging → v3 (Fase 0 del cutover)

Registro vivo. Cada decisión que tomé portando el módulo de Contabilidad/Balances
de `staging` al modelo ideal, para revisar juntas al final del proceso.
Las marco por peso: ⚖️ = decisión de criterio (revisar), 🔧 = mecánica (traducción directa).

Contexto fijado por Gaston: lo que viene de `staging` manda; el modelo de datos
ideal de contabilidad (dominio 4) está bien y no se rediseña; `accounting.tsx` y
`accounting/index.tsx` se portan al final.

---

## Estrategia general

### ⚖️ D1 — No se mergea la rama; se porta archivo por archivo
`git merge origin/staging` auto-resolvería hunks que referencian tablas que ya no
existen (`journal_entry`, `fiscal_year`, `financial_statement`): staging y v2
reescribieron los mismos archivos contra modelos de datos distintos. El merge-tree
dio 37 archivos en conflicto y los "auto-mergeados" eran los peligrosos.
**Consecuencia**: la historia de git de staging no viaja; el port queda en commits
nuevos sobre `v3`.

### ⚖️ D2 — Diccionario de traducción del contrato de posting
v2 ya había traducido `accounting-invoice-posting` al castellano/modelo ideal, y
el motor de sueldos comparte contrato con él. Mapeo aplicado en todo el port:
`RuleLike`→`ReglaLike`, `BuiltEntry`→`AsientoArmado`, `BuiltLine`→`LineaArmada`,
`accountId`→`cuentaId`, `debit|credit`→`debe|haber`, `side`→`lado`,
`concept_value|fixed`→`valor_concepto|fijo`, `accounting_log`→`evento`,
`auto_inflation`→`ajuste_inflacion`, `sourceModule: invoice|payroll`→
`modulo: comprobante|recibo|movimiento_bancario`.

---

## Schema (dominio 8)

### 🔧 D3 — Lo nuevo va en `schema-dominio8.sql`, el dominio 4 no se toca
Tablas: `indice_inflacion`, `ajuste_inflacion`, `ajuste_inflacion_linea`,
`plantilla_informe_auditor`, `cierre_sueldos`. Columnas por `alter table`:
`cuenta.cuenta_ajuste_id`, `ejercicio.solo_referencia|estados_ajustados`,
`eecc.informe_auditor|layout|etiquetas_seccion`.

### ⚖️ D4 — `ajuste_inflacion` lleva `unique (ejercicio_id)`; staging no lo tenía
Todo el código de staging asume uno por ejercicio (`.where(eq(fiscalYearId)).limit(1)`,
y al anular borra entero). La restricción hace explícito el invariante. Si algún
día se quisieran corridas históricas múltiples, esto hay que levantarlo.

### ⚖️ D5 — `asiento_origen_tipo += 'ajuste_inflacion'`
Con `'cierre'` el asiento del ajuste sería indistinguible del asiento de cierre
del ejercicio, y `origen_id` no podría apuntar a la corrida que lo generó.

### ⚖️ D6 — `cuenta_naturaleza_inflacion` pasa de 2 a 5 valores
El motor RT 6 distingue `monetaria | no_monetaria_costo |
no_monetaria_valor_corriente | resultado_por_diferencia`. El valor viejo
`no_monetaria` queda en el enum como heredado y el código lo lee como
`no_monetaria_costo`. No se migran datos: en BD_IDEAL ninguna cuenta tiene
naturaleza cargada todavía (0 de 91).

### ⚖️ D7 — `cierre_sueldos.periodo` es `date` (primer día del mes), no text
Consistente con `recibo.periodo` y `periodo_contable.periodo` del modelo ideal.
El viejo `payroll_liquidacion_cierre.periodo` era text "YYYY-MM".

### 🔧 D8 — `indice_inflacion` es catálogo global, sin RLS
Como los códigos AFIP: la serie FACPCE no pertenece a ninguna org. Las otras 4
tablas nuevas sí llevan RLS (3 por `org_id`, la línea hereda del padre).

### ⚖️ D9 — `apply-dominio8.ts` aparte de `apply-schema.ts`
`apply-schema.ts` dropea el schema entero — sirve para construir de cero, no para
una base con 342k filas. El incremental es aditivo e idempotente. `apply-schema.ts`
igual quedó actualizado (dominio8 en la lista) para reconstrucciones desde cero.

---

## Bugs preexistentes que el port destapó

### ⚖️ D10 — `job.credencialId` era `notNull()` en drizzle y es nullable en la base
Regenerar `drizzle/schema.ts` por introspección lo destapó (y también que faltaba
`cct_fuente`). Hay 3 jobs de `escalas` con credencial null — no usan cuenta de
AFIP. Corregí los consumidores (`job.tsx`, `alert.tsx`): un job sin credencial no
agrupa por credencial y no entra al dedupe de reintentos.

### ⚖️ D11 — SIN RESOLVER: los jobs de `escalas` no aparecen en el panel de jobs
`getJobs` hace `innerJoin` con `credencialAfip` (`job.tsx:173`), así que los jobs
sin credencial quedan afuera de la lista. Un `leftJoin` lo arregla, pero cambia el
comportamiento del panel de fuentes de datos (último commit de v2). **Decisión de
Gaston pendiente.**

---

## inflation.tsx

### 🔧 D12 — Fechas `date` se convierten en el borde, en UTC
Drizzle devuelve las columnas `date` como string "YYYY-MM-DD". Helper `aFecha`
con `T00:00:00Z`: en zona local el día se correría y el mes decide el coeficiente.

### 🔧 D13 — El ajuste se inserta ANTES que el asiento
El check `asiento_origen_coherente` exige `origen_id` para un origen no manual:
`ajuste_inflacion` en borrador → asiento apuntándole → update a aplicado. En el
modelo viejo el orden era el inverso porque no había check.

### 🔧 D14 — Helpers duplicados a propósito
`ensureClientBelongsToOrg` y `loadFiscalYearForOrg` existen privados en
`accounting.tsx` (intocable por ahora). Los repetí en `inflation.tsx` con nota;
cuando se unifique van a `helpers.ts`.

### 🔧 D15 — `.inputValidator(` → `.validator(`
Convención de v2 (61 usos contra 0).

---

## Crons

### ⚖️ D16 — `payroll-cron.ts` NO se porta
Su función principal (scrapear CCT con Gemini y pisar `escala_salarial`) es lo
que hoy hace el job `escalas` del scrapper vía `cct_fuente`. Portarlo duplicaría
escrituras desde dos lados. Además en staging está definido pero nadie lo arranca.

### ⚖️ D17 — HUECO ABIERTO: el tope imponible no se actualiza en ningún lado
`syncTopeImponible` (la otra mitad de `payroll-cron.ts`) alimentaba
`parametro_periodo`, que está cortado en **2026-06**. Nada en v2 ni en el scrapper
lo actualiza. Para liquidar julio hace falta el tope de julio. Opciones: cron acá /
job en el scrapper (más consistente con D16) / carga manual. **Decisión de Gaston
pendiente.**

### 🔧 D18 — Cron de índices FACPCE enganchado en `server.ts`
Mismo patrón y guard que el cron de facturas que v2 ya tenía. Se apaga con
`INFLATION_INDEX_CRON_DISABLED=1`.

---

## accounting-posting-db

### 🔧 D19 — Replica exacta de los helpers privados de `accounting.tsx`
Mismo comportamiento y mismos mensajes de error, para que portar `accounting.tsx`
sea sólo cambiar imports. `loadActiveMappingRules` generaliza por el enum real
(`comprobante | recibo | movimiento_bancario`).

### 🔧 D20 — `resolvePeriodForDate` compara fechas como strings
Las columnas `date` llegan como string; el período se busca por
`eq(periodo, 'YYYY-MM-01')` en vez de year/month (el modelo ideal guarda el
primer día del mes).

---

## ETL

### 🔧 D21 — `etl-dominio8.ts` hace upsert, no truncate
A diferencia de D1–D7: la serie de índices es un catálogo global re-descargable y
el upsert por (fuente, año, mes) lo hace re-ejecutable sin riesgo. Verificado:
402 filas (1993-01 → 2026-06), coeficiente 1.0000 en el mes de cierre.

---

## accounting-payroll-close y bucket B

### ⚖️ D22 — El cierre de sueldos lee `recibo`/`recibo_concepto`, no las tablas de import
Staging cerraba sobre `liquidacion_import_recibo` + `liquidacion_import_concepto_valor`.
En el modelo ideal el recibo vivo es `recibo` (con `confirmado` y `periodo` date), y
los conceptos son `recibo_concepto` → `concepto`. El código SOS sale de
`concepto.numero` y el tipo del renglón (`recibo_concepto.tipo`) con fallback a
`concepto.tipo`, que es NOT NULL — así el fallback por rango SOS casi no juega.
En los datos reales, 2214 de 2229 renglones tienen tipo null en la línea: el
catálogo es el que decide.

### ⚖️ D23 — Bug corregido en mi propio D7: unique parcial en `cierre_sueldos`
El flujo cerrar → reabrir → volver a cerrar deja varias filas por (cliente,
periodo): las reabiertas son historial. El `unique (cliente_id, periodo)` que
había puesto rompía el re-cierre. Ahora es un índice único **parcial**
(`where reabierto_at is null`): un solo cierre vigente, historial ilimitado.
Aplicado también sobre la BD local (drop constraint + create index).

### 🔧 D24 — El asiento del cierre usa `origen_tipo='recibo'`
El enum ya lo tenía previsto (a diferencia del ajuste, que necesitó valor nuevo).
`origen_id` apunta a la fila de `cierre_sueldos`. `variantesPeriodoParaBusqueda`
del modelo viejo desaparece: `recibo.periodo` es date, no hay variantes de texto.

### 🔧 D25 — `normalizarPeriodoYYYYMM` se suma a `payroll-period-rules`
La UI y las server functions siguen hablando "YYYY-MM"; la función normaliza
cualquier "YYYY-M(-D)" a eso. Vino de staging tal cual.

### ⚖️ D26 — `cliente.marco_contable` (rt54 | rt6), default rt54
Staging cita la norma del ajuste según `client.accounting_framework` y el
modelo ideal no tenía dónde guardarlo. Columna nueva en el dominio 8 con el
mismo default de staging (el estudio prepara casi todo bajo RT 54).

### ⚖️ D27 — El flujo de efectivo se traduce en el borde, no en el módulo puro
`accounting-cashflow.ts` (portado sin tocar, con sus tests) habla
`operating | investing | financing`; el enum `cuenta_flujo_efectivo` habla
`operativa | inversion | financiacion`. El mapeo vive en `accounting-labels`
(`CASH_FLOW_ACTIVITY_TO_DB` / `_FROM_DB`) y se usa al escribir el seed.
Alternativa descartada: renombrar los valores del módulo puro — habría
bifurcado el archivo de su test y del resto del código de staging que lo usa.

### 🔧 D28 — Base-chart y seed: delta de staging traducido
Moneda extranjera → `no_monetaria_valor_corriente` (ya está a TC de cierre),
Capital social → `inflationTargetCode: '3.1.002'` (Ajuste de capital),
RECPAM → `resultado_por_diferencia`. El seed gana el backfill: completa
naturaleza/flujo/destino SOLO donde están en null — nunca pisa una
clasificación cambiada a mano.

### 🔧 D29 — `accounting-invoice-batch` refactorizado a los helpers compartidos
El mismo refactor que hizo staging: sus 4 helpers privados se reemplazan por
los de `accounting-posting-db`. Sus códigos de error cambian
(`no_ejercicio`/`no_periodo` → `no_fy`/`no_period`) — el único caller los
atrapa con un catch genérico, así que no hay impacto.

---

## Componentes UI y wiring del cierre

### ⚖️ D30 — El wiring del cierre pierde `profileId`: un solo `clientId`
Staging separaba `clientId` (representante/agrupador) de `profileId` (empresa
con CUIT). En el modelo ideal esa dualidad no existe: `cliente` ES la empresa
fiscal. Las cuatro server functions (`getCierreLiquidacion`,
`previewAsientoLiquidacion`, `cerrarLiquidacionPeriodo`,
`reabrirLiquidacionPeriodo`) y el componente toman un solo `clientId`, scopeado
con `ensureClientBelongsToOrg` como el resto de `sueldos.ts`. Es la misma
decisión de fondo que va a resolver el conflicto `profile.tsx` cuando toque
`accounting.tsx`.

### ⚖️ D31 — Tres componentes esperan a `accounting.tsx`
`InformeAuditor`, `OrdenDocumento` y `SaldosReferencia` importan exports que
solo existen en el `accounting.tsx` de staging (plantillas del auditor,
`FsNote`, saldos de referencia). Van con ese port. `AjustePorInflacion`,
`IndicesInflacion` y `SueldosCierreContable` entraron ahora — pero **los dos
primeros todavía no se montan en ninguna ruta**: su punto de montaje es
`accounting/index.tsx` (solapas nuevas), que también espera. Compilan y sus
actions funcionan; la pantalla llega con el port final.

### 🔧 D32 — El Link «Ver en el diario» va sin search params
Staging linkeaba `/accounting?clientId=…&tab=asientos`; la ruta de v2 no tiene
`validateSearch` (las solapas son estado interno). Queda el link pelado a
`/accounting`; el deep-link a la solapa se restituye al portar
`accounting/index.tsx`.

### 🔧 D33 — `normalizarPeriodoYYYYMM`: se elimina la copia privada de `sueldos.ts`
v2 tenía la función duplicada localmente; ahora importa la de
`payroll-period-rules` (D25). `variantesPeriodoParaBusqueda` sigue local: la
usan las tablas de import, que sí guardan el período como texto.

Verificación de la tanda: dry-run del cierre contra BD_IDEAL con RLS —
encuentra los 9 recibos confirmados de E-presis S.A. (2026-05), agrega
conceptos, carga reglas, y corta con el error esperado: no hay ejercicio
contable cargado. El cierre completo se prueba cuando el estudio cargue uno.

---

## Pendientes que este port deja explícitos

- D11 (jobs de escalas invisibles en el panel) — decisión de Gaston.
- D17 (tope imponible sin actualizador) — decisión de Gaston.
- `mayor-export.tsx` + `anexo-i-widths.test.ts` esperan a `accounting.tsx`
  (dependen de `EepnResult`/`EfeResult` que exporta la versión de staging).
- `resetPortalUserPassword` sigue roto (preexistente, fase 4 del cutover).

---

## accounting.tsx y el route (el port final)

### ⚖️ D34 — Bug latente de v2: cierre/apertura sin `origen_id`
`approveClosingStage` insertaba los asientos de cierre y apertura sin
`origen_id`; el check `asiento_origen_coherente` los rechaza en runtime
(verificado contra la base). Nadie lo pisó porque no hay ejercicios cargados.
Regla adoptada: el origen de un cierre/apertura es el ejercicio que se cierra.
`saveReferenceBalances` sigue la misma regla.

### ⚖️ D35 — La apertura del saldo cuenta (cambio semántico)
La base excluía `auto_opening` de `computeEspBalances` y v2 lo tradujo fiel.
Staging lo corrigió: sin apertura, un ejercicio transcripto como referencia da
patrimonio cero. Se adoptó la semántica de staging ("staging manda").

### ⚖️ D36 — El route se portó por merge parcial, no a mano
Estrategia: el delta de v2 sobre el route era 100% renombres mecánicos de
valores de enum (95 hunks). Se tomó el route de staging entero y se le aplicó
ese diff como patch: 82 hunks aplicaron solos, 13 se resolvieron a mano
(zonas que staging había reescrito: RuleEditorDialog, Ejercicios con la
etiqueta «Referencia», EstadosContables). Los estados locales de UI
(`mode.kind === 'custom'`, columnas debit/credit del editor de asientos)
quedan en inglés a propósito: son de la UI, no del modelo.

### 🔧 D37 — `buildClosingEntries` local → lib testeada
La copia privada de accounting.tsx era byte a byte idéntica a la de
`accounting-closing.ts` (verificado sin espacios/comentarios). Se reemplazó
por el import, con re-export de los tipos que el route consume.

### ⚖️ D38 — Eventos del ajuste en el log de auditoría vía `accion`
`getAuditLog` de v2 filtra por `evento.detalle->>'accion'`. Los eventos que
escribía inflation.tsx no la traían: quedaban invisibles en el log. Se agregó
`accion` a los dos eventos y los dos tipos a AUDIT_EVENT_TYPES.

### 🔧 D39 — D31/D32 cerradas
Los 5 componentes quedaron montados en sus solapas y el deep-link
«Ver en el diario» recuperó `search={{ clientId, tab: 'asientos' }}`
(el route de staging trae validateSearch).

---

## Resolución del conflicto `profile` (cerrado)

### ⚖️ D40 — El cluster `profile` NO se porta: eran tres gaps, no un módulo
El análisis lo desinfló. De los 7 archivos del cluster, 5 eran código de la
base que v2 ya reemplazó con su rebuild sobre el modelo ideal
(`client-detail-page.tsx` absorbe facturas-tab, view-client-dialog,
convenio-multilateral-tab e invoice.tsx; la ruta `$clientId/$profileId` es la
vista credencial→empresas que v2 ya tiene). El delta REAL de staging era
+39/+1 líneas: el selector RT 54/RT 6 en la ficha fiscal. La dualidad
representante/perfil del modelo viejo ES `credencial_afip`/`cliente` en el
ideal — no había conflicto de diseño que resolver, solo tres funcionalidades
sueltas sin equivalente:

1. **Ficha de datos fiscales** (norma RT 54/RT 6, actividad, inscripción):
   `updateClientFiscalData` existía sin UI. → `fiscal-data-card.tsx` nuevo,
   montado en la solapa Resumen del detalle del cliente, leyendo de
   `getMembreteData`.
2. **Baja/pausa del cliente** (el `managedByStudy` viejo): no había setter de
   `cliente.estado`. → `updateClienteEstado` (activo|pausado|baja +
   `baja_motivo`, la baja no borra nada) + radio en el diálogo de edición,
   con el motivo visible solo en baja.
3. **Toggle liquida sueldos**: v2 filtraba por
   `cliente_empleador_config.liquida_sueldos` pero nada lo seteaba (solo el
   ETL). → entra en `updateEmpleadorConfig` y como switch en el
   EmpleadorConfigDialog, al lado de mipyme/seguro colectivo.

Con esto el cluster queda retirado: los archivos de staging no viajan.
