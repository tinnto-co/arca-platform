# Mejoras módulo de sueldos — 2026-06-23

Documento de seguimiento de bugs y mejoras detectadas en el módulo de sueldos.
Incluye análisis técnico y estado de cada ítem.

---

## Ítems resueltos anteriormente (referencia)

Estos ítems ya fueron corregidos antes de esta sesión.

- [x] **Orden numérico de conceptos en el recibo** — Las queries usaban `ORDER BY codigo` sobre texto (orden lexicográfico: 1, 10, 19, 2...). Se corrigió a `ORDER BY codigo::int`. Commit `69a6e1e`.
- [x] **Corrección de tipo de empleador/empleado en LSD/F.931** — Los catálogos AFIP en producción usaban IDs de SOS Contador como código primario en lugar de los códigos AFIP oficiales, causando que el LSD generara valores inválidos (ej. "1070" en lugar de "01"). Se migró la base de producción con `migrate-catalogos-prod.ts`. Sesión 2026-06-23.
- [x] **Concepto 211: importe directo** — Cuando el usuario ingresaba solo un importe fijo (sin porcentaje ni cantidad), `montoLiquidadoDesdeEditsSos` calculaba `0 × 0 × base = 0`. Se agregó detección del caso `cant=0, pct=0` con importe presente y se devuelve el importe directamente. Commit `69a6e1e`. | Notion: `[SUELDOS] Bug: corrección del concepto 211`

---

## Ítems nuevos — sesión 2026-06-23

### 1. Concepto 415: cálculo automático sobre no remunerativos

**Notion:** `[SUELDOS] Concepto 415: cálculo automático sobre no remunerativos`

**Descripción:** Crear el concepto 415 (presentismo / asignación complementaria no remunerativa) que calcule automáticamente un porcentaje configurable (ej: 8,33%) sobre la suma de los conceptos no remunerativos 411 al 414. Replicar la lógica de la asignación complementaria remunerativa. El monto resultante debe poder editarse manualmente.

**Implementación:**
- Nuevo subtotal `sub411_414` acumulado en el cascade de `TablaReciboSos.tsx` (códigos 411–414).
- Nuevo tipo de base `sub411_414_qty`: auto-rellena el campo `cantidad` con la suma de 411–414. El resultado es `cantidad × (pct/100)`. Si el usuario cambia 411–414, `cantidad` se recalcula automáticamente.
- Catálogo SOS actualizado: concepto 415 renombrado a "Asig. Complementaria no Rem. (s/conc. 411 a 414)", `baseColumna: 'sub411_414_qty'`, `tieneImporte: false`, `tieneImpConceptoNro: false`.
- `sos-formula-display.ts` actualizado con label `S411-414` y fórmula `cant (auto: S411-414) × pct/100`.
- BD actualizada vía seed.

**Archivos modificados:** `src/components/sueldos/TablaReciboSos.tsx`, `src/lib/sos-formula-display.ts`, `src/scripts/seed-conceptos-sos-catalog.ts`.

- [x] Resuelto — sesión 2026-06-23

---

### 2. Obra social en media jornada: calcular sobre base de jornada completa

**Notion:** `[SUELDOS] Obra social en media jornada: calcular sobre base de jornada completa`

**Descripción:** Los aportes de obra social deben calcularse siempre sobre la base de jornada completa, independientemente de si el empleado trabaja media jornada o jornada reducida. Si el sueldo básico se liquida al 50%, la obra social igualmente debe descontarse como si la base fuera el 100%.

**Análisis técnico:**
- El campo `tipoJornada` ya existe en `liquidacion_import_empleado` con valores `full_time`, `part_time`, `reducida`.
- En el LSD, las bases de OS se informan en `rem4y8Override` (base 4 y 8) y `rem9Override` (base 9). Hoy ambos campos son override manual; si no se cargan, se toma `brutaCentavos` como default.
- La solución es: al generar/validar el recibo de un empleado `part_time` o `reducida`, auto-calcular `rem4y8Override` con el básico de escala al 100% en lugar del liquidado.
- **Punto a clarificar antes de implementar:** ¿cómo se determina el básico a jornada completa? ¿Es siempre la escala de la categoría sin ajuste de jornada? ¿`reducida` tiene el mismo tratamiento que `part_time`?

**Análisis técnico (sesión 2026-06-23):**
- `tipoJornada` está guardado en `liquidacionImportEmpleado` pero nunca se usa en ningún cálculo — es solo metadata.
- El cascade client-side de la tabla del recibo usa `sub1_199_plus_411_469` como base para OS, que es la suma de haberes reales liquidados. Para part_time al 50%, esa base sale al 50%.
- Para corregir el recibo: habría que inyectar el básico de jornada completa (desde `payrollEscala`) al cargar la plantilla, y usarlo como base para los conceptos OS en lugar del subtotal de haberes.

**Contexto operativo:**
- Actualmente no hay empleados `part_time` ni `reducida` cargados en el sistema.
- Se planea cargarlos en producción próximamente → implementar antes de ese momento.

**Archivos involucrados:** `src/actions/sueldos.ts` (generación LSD y validación), `src/components/sueldos/SueldosCargas.tsx`, `src/components/sueldos/TablaReciboSos.tsx`.

**Implementación (sesión 2026-06-24):**
- `getBasicoParaEmpleadoPeriodo` devuelve `tipoJornada`.
- `SueldosSimulador` calcula `basicoJornadaCompleta = tipoJornada !== 'full_time' ? basicoEscala : 0` y lo pasa a `TablaReciboSos`.
- `TablaReciboSos`: nueva prop `basicoJornadaCompleta` y nuevo `baseColumna: 'os_base'` en el cascade. Cuando `osBase > 0`, los conceptos OS usan el básico de escala 100% como base.
- Conceptos SOS 203, 204, 221, 222 actualizados a `baseColumna: 'os_base'` en seed y DB.

- [x] Resuelto — sesión 2026-06-24

---

### 3. SAC proporcional: cálculo por días trabajados en el semestre

**Notion:** `[SUELDOS] SAC proporcional: cálculo por días trabajados en el semestre`

**Descripción:** Para empleados que no trabajaron todo el semestre: tomar la mejor remuneración del período trabajado, dividirla por 360 y multiplicarla por los días trabajados. Primera iteración: el usuario ingresa la cantidad de días y el sistema calcula el monto. Etapa futura: calcular los días automáticamente.

**Análisis técnico:**
- Reutiliza la misma lógica de búsqueda del mejor sueldo del semestre (ver ítem 5).
- La fórmula es: `mejor_remuneración / 360 × días_trabajados`.
- Primera iteración: campo de entrada de días en la UI del recibo; el sistema hace el cálculo.
- Dependencia: el ítem 5 (SAC normal) define cómo se determina la mejor remuneración.

**Implementación (sesión 2026-06-24):**
- `getSacPreview` devuelve `fechaIngreso` del empleado (ya existía en schema).
- `sugerirDiasSemestre(fechaIngreso, periodo)`: si el empleado ingresó dentro del semestre, calcula los días desde el ingreso hasta el último día del semestre (cap 180). Si ingresó antes, devuelve 180.
- `GenerarSacDialog` extendido con columna "Días" editable por empleado (default auto-sugerido). Badge "prop." en naranja cuando días < 180.
- Fórmula: `SAC = mejorMes / 360 × días`. Con días=180 equivale al SAC completo (÷2).
- Sin cambios en `generarSacsMasivo` — la UI ya manda el `sacBase` ajustado.

**Archivos modificados:** `src/actions/sueldos.ts`, `src/components/sueldos/SueldosRecibo.tsx`.

- [x] Resuelto — sesión 2026-06-24

---

### 4. Cálculo automático de vacaciones y SAC sobre vacaciones

**Notion:** `[SUELDOS] Cálculo automático de vacaciones y SAC sobre vacaciones`

**Descripción:** Vacaciones normales: tomar sueldo básico de escala mensual, dividir por 25 y multiplicar por los días según antigüedad. El sistema determina los días automáticamente por rangos. SAC sobre vacaciones: monto de vacaciones dividido 12. Incluye vacaciones no gozadas con la misma lógica base.

**Análisis técnico:**
- Requiere calcular días de vacaciones por antigüedad. La ley 20.744 define: hasta 5 años → 14 días, 5–10 años → 21 días, 10–20 años → 28 días, más de 20 años → 35 días.
- La antigüedad ya se calcula en el sistema (campo `antiguedad` disponible en el contexto de fórmulas).
- La fórmula de vacaciones: `básico_escala / 25 × días_según_antigüedad`.
- SAC sobre vacaciones: `monto_vacaciones / 12`.
- **Punto a clarificar:** ¿algún CCT del sistema tiene rangos de días distintos a los de ley 20.744? Si sí, los rangos deberían ser configurables por convenio.
- Es el ítem más complejo del lote.

**Archivos involucrados:** `src/lib/payroll-formula.ts`, `src/actions/sueldos.ts`, `src/components/sueldos/SueldosSimulador.tsx`.

**Puntos a clarificar antes de implementar:**

1. **CCTs activos y tabla de días** — ¿Todos los convenios del sistema usan la tabla estándar de ley 20.744 (hasta 5 años → 14 días, 5–10 → 21, 10–20 → 28, más de 20 → 35)? ¿Algún CCT tiene tabla propia?

2. **Flujo actual de carga** — ¿Hoy el usuario abre un recibo de tipo `vacaciones` manualmente y carga el monto a mano? ¿O hay algún flujo de generación asistida (similar al diálogo del SAC)?

3. **Vacaciones no gozadas** — ¿El sistema también necesita calcular vacaciones no gozadas (típicamente al liquidar una desvinculación)? ¿Es el mismo cálculo base o tiene diferencias?

4. **SAC sobre vacaciones** — ¿Va como un concepto dentro del mismo recibo de vacaciones, o se genera como un recibo separado de tipo `SAC`?

5. **Base de cálculo** — ¿La base es siempre el básico de escala del período / 25? ¿O puede ser el mejor sueldo del semestre u otra referencia según el convenio o la situación?

- [ ] Pendiente — clarificar los puntos anteriores antes de implementar

---

### 5. Automatización del SAC normal (mejor sueldo semestre / 2)

**Notion:** `[SUELDOS] Automatización del SAC normal (mejor sueldo semestre / 2)`

**Descripción:** El sistema debe calcular automáticamente el SAC normal buscando el mejor recibo de los últimos seis meses (suma de haberes remunerativos y no remunerativos) y dividiéndolo por dos. El monto calculado debe poder editarse manualmente.

**Análisis técnico:**
- El SAC es `tipoRecibo = 'SAC'`, un recibo separado del mensual (igual que `vacaciones`, `despido`, etc.).
- Los totales `haberes` y `noRemunerativo` ya están guardados por recibo en `liquidacionImportRecibo`.
- El cálculo base: `max(haberes + noRemunerativo de los meses del semestre) / 2`.
- El semestre se determina por el período del SAC: mes 06 → enero–junio, mes 12 → julio–diciembre.
- La nueva server function `getSacBase(importEmpleadoId, clientId, periodo)` haría la query y devolvería `{ mejorMes, mejorMonto, sacCalculado }`.

**Objetivo de largo plazo (definido en sesión 2026-06-23):**
El SAC no se crea manualmente — se genera automáticamente cuando el usuario guarda el recibo de sueldo del mes 06 o 12. El recibo SAC se crea en ese momento con el monto pre-calculado.

**Respuestas (sesión 2026-06-24):**
1. Es una acción separada — el usuario genera el SAC manualmente con un botón "Generar SAC" (no se dispara al guardar el recibo mensual).
2. Aplica a todos los empleados activos. Los que ingresaron durante el semestre requieren SAC proporcional (ver ítem 3).
3. Solo SOS 41 (importe fijo = SAC base). Sin conceptos 430–437. Las retenciones se calculan en cascada al abrir y guardar el recibo.

**Análisis de SOS Contador (sesión 2026-06-24):**
- SAC = mejor mes del semestre (max haberes + no remunerativos liquidados) / 2
- SOS usa el mejor mes entre los recibos tipo 'sueldo' disponibles en `liquidacionImportRecibo`
- Estructura real: SOS 41 (importe fijo) + retenciones 201 (11%), 202 (3%), 203 (3%), 206 (2%), 209 (0.5%)
- Sin conceptos no remunerativos 430–437 para CCT Comercio

**Implementación (sesión 2026-06-24):**
- `getSacPreview(clientId, profileId, periodo)`: nueva server function GET que devuelve por empleado el mejor mes, monto, SAC calculado y si ya tiene SAC en el período.
- `generarSacsMasivo(clientId, profileId, periodo, items[])`: nueva server function POST que crea los recibos SAC con SOS 41. Omite empleados que ya tienen SAC.
- `GenerarSacDialog` en `SueldosRecibo.tsx`: dialog con tabla de preview + checkbox por empleado + confirmación. Se activa con botón "Generar SAC" visible solo en meses 06 y 12.
- Las retenciones se calculan en cascada cuando el usuario abre y guarda cada recibo SAC desde `SueldosSimulador`.

**Archivos modificados:** `src/actions/sueldos.ts`, `src/components/sueldos/SueldosRecibo.tsx`.

- [x] Resuelto — sesión 2026-06-24

---

### 6. Campos calculados siempre editables manualmente

**Notion:** `[SUELDOS] Campos calculados siempre editables manualmente`

**Descripción:** Todos los conceptos calculados automáticamente (antigüedad, SAC, obra social, etc.) deben permitir ser sobreescritos manualmente. Garantizar que ningún campo quede bloqueado solo por tener un cálculo automático asociado.

**Análisis técnico:**
- La arquitectura ya soporta override: en `montoLiquidadoDesdeEditsSos`, si `row.monto` tiene valor, se usa directamente y se descarta el cálculo automático.
- El problema es la UI: la columna de resultado final en `TablaReciboSos.tsx` (líneas 598–617) es solo display, no hay `EditableCell` ahí. El usuario puede ajustar los parámetros (cantidad, %, importe) pero no pisar el resultado directamente.
- Caso adicional: `pctFijo` (ej. presentismo 8,33%) se muestra como texto estático no editable. Si el convenio usa un porcentaje distinto, no hay forma de cambiarlo.
- La solución sería agregar una celda "Override" editable en la columna de resultado, que cuando tiene valor prevalece sobre el cálculo automático.

**Implementación (sesión 2026-06-24):**
- `EditsMap` extendida con campo `montoFijo: string` (session-only, no persiste en DB).
- `applySubtotalCascade`: cuando `montoFijo` está seteado, el cascade usa ese valor directamente y no recalcula la fórmula. El monto override se acumula igual en subtotales.
- `ResultOverrideCell`: nuevo componente en `TablaReciboSos.tsx`. En estado normal muestra el valor calculado con ícono lápiz en hover. Al hacer click: input editable en ámbar. Cuando hay override activo: valor en naranja con botón X para limpiar.
- Columnas de resultado (haberes/descuentos/retenciones/noRemunerativo) usan `ResultOverrideCell` en lugar de texto estático.
- `pctFijo`: cambiado de `<span>` estático a `<EditableCell>`. El cascade ya usa `row.porcentaje`, por lo que el cambio de % se propaga automáticamente.

**Archivos modificados:** `src/components/sueldos/TablaReciboSos.tsx`.

- [x] Resuelto — sesión 2026-06-24

---

### 7. LSD/F.931: remuneraciones 4, 8 y 9 diferenciadas para media jornada

**Notion:** `[SUELDOS] LSD/F.931: remuneraciones 4, 8 y 9 diferenciadas para media jornada`

**Descripción:** En jornada completa, las remuneraciones 4, 8 y 9 del F.931 coinciden con la suma de haberes. En media jornada, las remuneraciones 4 y 8 deben informarse con la base al 100% (jornada completa), mientras que la 9 debe reflejar la remuneración real liquidada.

**Análisis técnico:**
- Directamente relacionado con el ítem 2. Ambos son el mismo problema: media jornada implica bases distintas para OS (4/8) vs ART (9).
- En el LSD actual (`src/actions/sueldos.ts`), `rem4y8Base` y `rem9Base` se toman desde el mismo `brutaCentavos` a menos que haya un override manual (`rem4y8Override`, `rem9Override`).
- La solución: en `generarArchivoLsd`, para empleados con `tipoJornada !== 'full_time'`, hacer JOIN a `payrollEscala` para obtener el básico de escala del período, y usarlo como `rem4y8Base` en lugar de `brutaCentavos`. `rem9Base` sigue usando el bruto real liquidado.
- Se implementa junto con el ítem 2.

**Archivos involucrados:** `src/actions/sueldos.ts` (función `generarArchivoLsd`).

**Implementación (sesión 2026-06-24):**
- `generarArchivoLsd`: nuevo paso 4.5 que busca el básico de escala (en paralelo, con cache) para empleados `part_time`/`reducida`.
- `rem4y8Base` (bases 4 y 8 del F.931 = OS) usa ese básico en centavos. `rem9Base` (base 9 = ART) sigue usando bruta real.
- `rem4y8Override` manual sigue teniendo prioridad cuando está seteado.

- [x] Resuelto — sesión 2026-06-24 (junto con ítem 2)

---

## Resumen y orden de ejecución sugerido

| # | Ítem | Complejidad | Estado | Depende de |
|---|------|-------------|--------|------------|
| 1 | Concepto 415 | Baja | **Resuelto** | — |
| 5 | SAC normal automático | Media | **Resuelto** | — |
| 2 + 7 | Media jornada (OS + LSD) | Alta | **Resuelto** | — |
| 3 | SAC proporcional | Media | **Resuelto** | Ítem 5 |
| 4 | Vacaciones + SAC vacaciones | Alta | Pendiente | Clarificar rangos CCT |
| 6 | Campos calculados editables | Baja-Media | **Resuelto** | — |

---

## Preguntas pendientes

### Ítem 4 — Cálculo automático de vacaciones y SAC sobre vacaciones

Antes de implementar este ítem se necesitan respuestas a los siguientes puntos:

**4.1 — Tabla de días por CCT**
¿Todos los convenios del sistema usan la tabla estándar de la ley 20.744?

| Antigüedad | Días ley 20.744 |
|------------|-----------------|
| Hasta 5 años | 14 días |
| 5 a 10 años | 21 días |
| 10 a 20 años | 28 días |
| Más de 20 años | 35 días |

¿Algún CCT activo en el sistema tiene una tabla distinta? Si es así, ¿cuál es y qué días corresponden?

> Respuesta: ___

---

**4.2 — Flujo actual de carga**
¿Cómo se carga hoy un recibo de vacaciones? ¿El usuario abre un recibo de tipo `vacaciones` manualmente y carga el monto a mano? ¿O existe algún flujo asistido (como el diálogo del SAC)?

> Respuesta: ___

---

**4.3 — Vacaciones no gozadas**
¿El sistema necesita calcular también vacaciones no gozadas (típicamente al liquidar una desvinculación)? ¿Es el mismo cálculo base (básico / 25 × días) o tiene diferencias?

> Respuesta: ___

---

**4.4 — SAC sobre vacaciones: mismo recibo o recibo separado**
¿El SAC sobre vacaciones va como un concepto dentro del mismo recibo de vacaciones, o se genera como un recibo separado de tipo `SAC`?

> Respuesta: ___

---

**4.5 — Base de cálculo**
¿La base es siempre el básico de escala del período / 25, o puede ser el mejor sueldo del semestre u otra referencia dependiendo del convenio o la situación?

> Respuesta: ___
