# Actualizacion - 2026-06-11

## 1) Objetivo general del dia

Setup operativo del módulo de sueldos para la empresa **Flor de Azar S.A.**, resolución de conflictos de categorías importadas, normalización de nombres de empleados y mejoras de UX en el formulario de recibos.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Asignación de categorías de convenio — Flor de Azar S.A. ✅ EJECUTADO

- **Contexto:** 8 empleados importados con categoría en texto libre (ej. "MOZO DE SALON (CAT B"). Ninguno tenía `categoriaId` vinculada al convenio Gastronomía 389/04, por lo que la liquidación no podía tomar el básico de escala automáticamente.
- **Análisis:** "CAT B" en los datos importados significa establecimiento 3 estrellas tipo B (`3EST_B` en la codificación del convenio). Se identificaron 5 empleados con conflicto (nombre del puesto sin equivalente directo en el CCT) y 3 sin conflicto.
- **Resolución de conflictos:**

  | Legajo | Empleado | Puesto importado | Categoría CCT asignada |
  |--------|----------|------------------|------------------------|
  | 1 | Barrera, Rufino Marcelo | Mozo de Salon | CAT6_3EST_B — Mozo de Salón y de Vinos |
  | 2 | Cordoba, Emiliano Rodrigo | Lavacopas | CAT1_3EST_B — Lavacopas |
  | 3 | Villalba, Rafael Gonzalo | Ayudante De Cocina | CAT3_3EST_B — Ayudante panadero |
  | 4 | Ramirez, Onofre Demetreo | Ayudante Parrillero | CAT3_3EST_B — Ayudante panadero |
  | 5 | Gonzalez Ochoa, Luis Alberto | Ayudante De Cocina | CAT3_3EST_B — Ayudante panadero |
  | 6 | Soria, Ramon Roberto | Ayudante Parrillerro | CAT3_3EST_B — Ayudante panadero |
  | 7 | Quispe, Ismael Camacho | Peon General | CAT1_3EST_B — Peón general |
  | 8 | Rojas, Juana Bautista | Peon General | CAT1_3EST_B — Peón general |

- **Escalas vigentes asignadas (Junio 2026):**
  - CAT1 (Lavacopas, Peón general): básico $1.038.120 + no rem $38.700
  - CAT3 (Ayudante panadero): básico $1.180.295 + no rem $44.000
  - CAT6 (Mozo de Salón y de Vinos): básico $1.384.689 + no rem $51.700

- **Limpieza de campo `categoria`:** Se removió el sufijo "(CAT B", "(CATEGORIA B" y variantes del campo `categoria` de los 8 empleados. También se actualizó el campo `tarea` (usado en LSD) con el nombre limpio.
- **Scripts ejecutados:** `_fix-flor-categorias.ts`, `_fix-flor-conflictos.ts` (eliminados tras ejecución).

---

### 2.2 Normalización de nombres de empleados — todos los clientes ✅ EJECUTADO

- **Cambio:** Se aplicó **title case** a los nombres de los 241 empleados de toda la base: primera letra de cada palabra en mayúscula, resto en minúscula. Aplica tanto al apellido como al nombre. Ej: `BARRERA, RUFINO MARCELO` → `Barrera, Rufino Marcelo`.
- **Método:** Script `_fix-nombres-empleados.ts` con base de datos del dump `dump.pgdump` (vía `pg_restore` en Docker con postgres:17) para obtener los nombres originales. Se aplicó title case y se actualizó por ID.
- **Nota de incidente:** Un primer script con bug (`.where(undefined)` actualizaba todos los registros) sobrescribió todos los nombres con el último valor procesado. Se restauró correctamente usando el dump como fuente de verdad.
- **Scripts ejecutados:** `_fix-nombres-empleados.ts` (eliminado tras ejecución).

---

### 2.3 Visualización del puesto limpiado en solapa empleados y recibo ✅

- **Cambio en tabla de empleados:** La columna de categoría ahora muestra `empleado.categoria` (el puesto limpiado importado, ej. "Mozo De Salon") como valor primario. Solo cae al nombre del CCT (`categoriaNombre`) en texto atenuado si `categoria` está vacío.
- **Cambio en detalle del empleado:** El campo que antes se llamaba "Categoría (importado)" se renombró a **"Puesto"**.
- **Cambio en recibo HTML y PDF:** El campo "Categoría" ahora muestra `empleado.categoria` (puesto limpiado en title case) en lugar del nombre del CCT. Fallback al nombre del CCT si el campo está vacío.
- **Archivos:** `src/components/sueldos/SueldosEmpleados.tsx`, `src/components/sueldos/SueldosRecibo.tsx`, `src/components/sueldos/recibo-pdf.tsx`.

---

### 2.4 Pre-llenado de situación de revista en formulario de recibo ✅

- **Cambio:** Al seleccionar un empleado en el formulario de nuevo recibo, si el empleado tiene `situacionId` configurado y el campo `situacionRevista1Id` está vacío, se copia automáticamente.
- **Comportamiento:** Solo actúa cuando el campo está vacío — no pisa valores ya seteados (ej. al editar un recibo existente pasado por `initialValues`). Las situaciones 2 y 3 siguen siendo manuales.
- **Archivo:** `src/components/sueldos/ReciboFormulario.tsx`.

---

### 2.5 Fechas automáticas en formulario de recibo ✅

- **Cambio:** Al cambiar el año o mes del período en el formulario de nuevo recibo, se actualizan automáticamente:
  - **Fecha de liquidación** → último día del mes seleccionado (ej. mayo → 31/05/2026).
  - **Fecha de pago** → último día del mes seleccionado (ej. mayo → 31/05/2026).
  - **Fecha de depósito de cargas** → día 10 del mes siguiente (ej. mayo → 10/06/2026).
- **Archivo:** `src/components/sueldos/ReciboFormulario.tsx`.

---

### 2.6 UX tabla de conceptos en recibo ✅

- **Tab solo entre celdas editables:** El tabulador ahora salta únicamente entre los `input` editables de la tabla. Los botones de eliminar fila (Trash2) y de "Agregar concepto" tienen `tabIndex={-1}` para que Tab los ignore.
- **Solo números en celdas editables:** `onKeyDown` bloquea cualquier tecla que no sea dígito (`0–9`), punto (`.`), coma (`,`), signo negativo (`-`) o tecla de control (Backspace, Delete, flechas, Ctrl+C/V, etc.). Los valores inválidos simplemente no se pueden tipear.
- **Archivo:** `src/components/sueldos/TablaReciboSos.tsx`.

---

## 3) Cambios técnicos (implementación)

### 3.1 `src/components/sueldos/SueldosEmpleados.tsx`

- Tabla de empleados: prioridad invertida en columna categoría — `e.categoria` primero, `r.categoriaNombre` como fallback atenuado.
- Detalle de empleado (view mode): label `"Categoría (importado)"` → `"Puesto"`.

### 3.2 `src/components/sueldos/SueldosRecibo.tsx`

- Campo "Categoría" en recibo HTML: `categoria?.nombre` → `empleado.categoria ? toTitleCase(empleado.categoria) : (categoria?.nombre ?? '—')`.

### 3.3 `src/components/sueldos/recibo-pdf.tsx`

- Campo "Categoría" en PDF: misma lógica que 3.2.

### 3.4 `src/components/sueldos/ReciboFormulario.tsx`

- Import: agregado `useEffect`, `endOfMonth`, `addMonths`.
- Nuevo `useEffect` para fechas: observa `ano` y `mes`, setea `fechaLiquidacion`, `fechaPago` y `fechaDepositoCargas`.
- Nuevo `useEffect` para situación de revista: observa `empleadoSel`, copia `situacionId` a `situacionRevista1Id` si está vacío.

### 3.5 `src/components/sueldos/TablaReciboSos.tsx`

- Nueva constante `ALLOWED_KEYS` con teclas de control permitidas (Backspace, Delete, Tab, Enter, flechas, Home, End).
- `EditableCell.onKeyDown`: bloquea teclas que no sean dígito, `.`, `,`, `-` ni estén en `ALLOWED_KEYS` ni usen Ctrl/Meta.
- Botón eliminar fila: agregado `tabIndex={-1}`.
- Botón "Agregar concepto" (PopoverTrigger): agregado `tabIndex={-1}`.

---

---

### 2.7 Corrección del motor de cálculo de retenciones (200–299) ✅

- **Problema:** Los conceptos 201 (jubilación 11%), 202 (PAMI 3%), 203 (OS 3%) calculaban sobre una base incorrecta. `sub1_199` acumulaba haberes + descuentos (1–199), pero la base correcta para retenciones es solo los haberes (1–99). Adicionalmente, conceptos inactivos de recibos anteriores se filtraban mal y engrosaban los subtotales.
- **Corrección 1 — base de retenciones:** Para conceptos 200–299 con base `sub1_199`, la cascada ahora calcula `haberes − descuentos`: `sub1_99 − (sub1_199 − sub1_99)`.
- **Corrección 2 — filtro de activos:** `applySubtotalCascade` recibe el set `activeCodigos` y omite completamente los conceptos no activos. Antes, conceptos inactivos con monto no nulo en `edits` inflaban los subtotales sin mostrarse en la tabla.
- **Ejemplo verificado:** haberes=1.917.164,47, descuentos=111.035,20 → jubilación 11%=198.674,22 ✓
- **Archivo:** `src/components/sueldos/TablaReciboSos.tsx` — función `applySubtotalCascade`.

---

### 2.8 Corrección del motor de cálculo para bases `sueldo` e `importe_fijo` ✅

- **Problema:** Los conceptos con `baseColumna: 'sueldo'` (ej. concepto 9 — Asignación Complementaria) o `baseColumna: 'importe_fijo'` (ej. conceptos 7, 8, 12) no se recalculaban al cambiar el sueldo básico. La cascada solo procesaba bases en `SUB_BASES`; `sueldo` e `importe_fijo` eran ignorados.
- **Corrección:**
  - **`sueldo` (n > 1):** base = monto actual del concepto 1 (sueldo básico). Cuando el concepto 1 cambia, los conceptos `sueldo`-based se recalculan automáticamente.
  - **`importe_fijo`:** base = monto del concepto referenciado en `importeConceptoNumero` (si está completado) o el campo `importe` propio del concepto.
  - Se agregó un mapa `conceptMontos` que registra el monto computado de cada concepto en orden, permitiendo que cualquier concepto posterior pueda referenciar a uno anterior.
- **Casos corregidos en Flor de Azar:**
  - Concepto 7: `15% × importe_propio (1.110.352)` = 166.552,80 ✓
  - Concepto 8: `10% × concepto_1.monto (1.332.989)` via `importeConceptoNumero=1` = 133.298,90 ✓
  - Concepto 9: `12% × concepto_1.monto (1.332.989)` via base `sueldo` = 159.958,68 ✓
  - Concepto 12: `100% × importe_propio (111.035,20)` = 111.035,20 ✓
- **Archivo:** `src/components/sueldos/TablaReciboSos.tsx` — función `applySubtotalCascade`.

---

### 2.9 Plantilla base para Flor de Azar S.A. ✅

- **Cambio:** Se configuró `payrollPlantillaEmpleadoId` en el `client` de Flor de Azar apuntando a **Barrera, Rufino Marcelo**. A partir de ahora, al crear un "Nuevo recibo" para cualquier empleado de esa empresa, la tabla de conceptos se pre-activa con los mismos conceptos que el último recibo de Barrera.
- **Conceptos pre-activados:** 1, 3, 7, 8, 9, 12, 103, 105, 201, 202, 203, 206 (2,5%), 209 (1%), 411.
- **Método:** Script `src/scripts/_setup-plantilla-flor-azar.ts` para asignar el empleado de referencia. Script `src/scripts/_add-conceptos-plantilla-flor-azar.ts` para agregar el concepto 103 (los demás ya estaban en el recibo de referencia).
- **UI alternativa:** Se agregó un botón de marcador (Bookmark/BookmarkCheck) en la tabla de empleados para cambiar el empleado de referencia desde la solapa Empleados, sin necesidad de scripts.
- **Archivos:** `src/scripts/_setup-plantilla-flor-azar.ts`, `src/scripts/_add-conceptos-plantilla-flor-azar.ts`, `src/components/sueldos/SueldosEmpleados.tsx`, `src/actions/sueldos.ts`.

---

## 3) Cambios técnicos (implementación)

### 3.1 `src/components/sueldos/TablaReciboSos.tsx`

- `applySubtotalCascade`: agregado parámetro `activeCodigos?: Set<string>` — conceptos inactivos se saltean completamente (no acumulan subtotales ni se recalculan).
- `applySubtotalCascade`: agregado acumulador `sub1_99` para separar haberes (1–99) de descuentos (100–199).
- `applySubtotalCascade`: para retenciones 200–299 con base `sub1_199`, se usa `sub1_99 − descuentos` como base efectiva.
- `applySubtotalCascade`: nuevos bloques `else if` para bases `sueldo` (usa monto de concepto 1) e `importe_fijo` (usa importe propio o referenciado por `importeConceptoNumero`).
- `applySubtotalCascade`: nuevo mapa `conceptMontos` y variable `sueldoBase` para tracking inter-concepto.
- `activeCodigosRef`: nuevo ref que mantiene el set de códigos activos actualizado para pasarlo al cascade desde `setField`.

### 3.2 `src/actions/sueldos.ts`

- `listConceptosPlantillaManualSos`: ahora devuelve los valores de `porcentaje`, `importe`, `cantidad`, `importeConceptoNumero`, `importeMinimo`, `importeMaximo` del último recibo del empleado de referencia.
- `getPayrollEmployerConfig`: extendido para devolver `plantillaEmpleadoId`.
- Nueva acción `setPlantillaEmpleado`: permite asignar/desasignar el empleado de referencia de plantilla para un profile.

### 3.3 `src/components/sueldos/SueldosEmpleados.tsx`

- Botón Bookmark/BookmarkCheck en cada fila de empleado para marcar/desmarcar como plantilla base.
- Query `payroll-employer-config` y mutation `setPlantillaEmpleado` integradas.

### 3.4 Scripts de datos

- `src/scripts/_setup-plantilla-flor-azar.ts` — asigna `payrollPlantillaEmpleadoId` para Flor de Azar buscando el empleado con el recibo más reciente.
- `src/scripts/_add-conceptos-plantilla-flor-azar.ts` — agrega los conceptos faltantes (103) al recibo de referencia de Barrera.

---

## 4) Documentación generada

- `Documentacion Tecnica/Motor de Calculo Cascada - Conceptos SOS.md` — documento nuevo que explica el motor de cálculo de la grilla de conceptos, las bases disponibles, el orden de evaluación y ejemplos verificados.

---

## 5) Checklist de cierre

- [x] 8 empleados de Flor de Azar con `categoriaId` vinculada al convenio Gastronomía 389/04.
- [x] Campo `categoria` y `tarea` limpiados (sin sufijo "(CAT B").
- [x] 241 empleados con nombre en title case en la BD.
- [x] Puesto limpiado visible en tabla, detalle y recibo.
- [x] Situación de revista pre-llenada desde el empleado al abrir formulario de recibo.
- [x] Fecha de liquidación auto-seteada al último día del mes seleccionado.
- [x] Fecha de pago auto-seteada al último día del mes seleccionado.
- [x] Fecha de depósito de cargas auto-seteada al día 10 del mes siguiente.
- [x] Tabla de conceptos: Tab navega solo entre celdas editables.
- [x] Tabla de conceptos: solo se pueden ingresar valores numéricos.
- [x] Retenciones 200–299 calculan sobre base correcta (haberes − descuentos).
- [x] Conceptos inactivos excluidos de subtotales en cascada.
- [x] Conceptos con base `sueldo` e `importe_fijo` se recalculan en cascada.
- [x] Plantilla base de Flor de Azar configurada (Barrera como empleado de referencia).
- [x] Conceptos 7, 8, 9, 12, 103, 105, 206, 209, 411 pre-activados en plantilla Flor de Azar.
