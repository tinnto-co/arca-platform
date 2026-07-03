# Actualizacion - 2026-06-05

## 1) Objetivo general del dia

Mejoras al módulo de sueldos: campo "Sueldo básico override" editable en el editor de empleados, reestructuración del pie de tabla en recibos (vista previa e impresión PDF) para mostrar el desglose de redondeo, y corrección de la vista previa de impresión que solo traía el primer empleado.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Campo "Sueldo básico override" editable

- **Cambio:** En la solapa **Laboral → Remuneración** del editor de empleado, el campo "Sueldo básico override" ahora es editable al activar el modo edición. Muestra un `<Input type="number">` con placeholder explicativo. Si se deja vacío al guardar, el valor se borra (queda sin override).
- **Motivo:** Permitir setear o limpiar el override de sueldo básico por empleado desde la UI.
- **Prioridad de cálculo:** 1° override manual → 2° escala del convenio para el período → 3° escala más reciente (fallback).
- **Archivos:** `src/components/sueldos/SueldosEmpleados.tsx`, `src/actions/sueldos.ts`

### 2.2 Reestructuración del pie de tabla en recibos

- **Cambio:** El pie de la tabla de conceptos (tanto en la vista previa HTML como en el PDF imprimible) ahora muestra tres filas adicionales debajo de **Totales** cuando existe un redondeo:
  1. **Neto sin redondeo** — suma bruta de conceptos antes de aplicar el ceil
  2. **Redondeo** — diferencia hasta el entero superior (`+X.XX`)
  3. **Total neto** — neto final redondeado (entero)
- **Condición:** las tres filas solo aparecen cuando `redondeo > 0`. Cuando el neto ya es entero, solo se muestra la fila de Totales y el neto de siempre.
- **Columna del redondeo:** el monto aparece bajo la columna **No Remunerativo** (última columna), tanto en el HTML como en el PDF.
- **Archivos:** `src/components/sueldos/SueldosRecibo.tsx`, `src/components/sueldos/recibo-pdf.tsx`

### 2.3 Redondeo agregado al PDF imprimible

- **Cambio:** El PDF generado para impresión no tenía ninguna lógica de redondeo. Ahora calcula `netoRaw`, `redondeo` y `neto = Math.ceil(netoRaw)`, y muestra las tres filas de desglose (igual que la vista previa HTML).
- **Motivo:** El PDF debía reflejar el mismo cálculo que la vista previa. Antes el neto del PDF podía diferir del neto mostrado en pantalla.
- **Archivos:** `src/components/sueldos/recibo-pdf.tsx`

### 2.4 Etiqueta y estilo del redondeo

- **Cambio:** La fila de redondeo pasó de llamarse `"Redondeo ↑ entero"` a `"Redondeo"`. Se eliminó el color amarillo/ámbar tanto en la vista previa como en el PDF.
- **Archivos:** `src/components/sueldos/SueldosRecibo.tsx`, `src/components/sueldos/recibo-pdf.tsx`

### 2.5 Fix vista previa de impresión PDF (todos los empleados)

- **Cambio:** El botón "Vista previa" en el diálogo de impresión PDF solo mostraba el primer empleado de la selección. Ahora genera un PDF con todos los empleados y períodos seleccionados por el filtro.
- **Causa raíz:** `handlePreview` usaba `agrupados[0]!.recibos` en lugar de aplanar todos los agrupados.
- **Fix:** `agrupados.flatMap((a) => a.recibos)` para incluir todos los recibos en el PDF de vista previa.
- **Archivos:** `src/components/sueldos/ImprimirRecibosDialog.tsx`

---

## 3) Cambios tecnicos (implementacion)

### 3.1 Backend (`src/actions/sueldos.ts`)

- `updateEmpleado`: agregado `valorSueldo` (string nullable) al schema Zod y al handler. Si llega vacío o `null`, guarda `NULL` en DB (borra el override).

### 3.2 Frontend

- `SueldosEmpleados.tsx`: nuevo estado `valorSueldoOverride`, inicializado desde `emp.valorSueldo` en `resetForm`. Sección Remuneración muestra `<Input>` editable cuando `isEditing`.
- `SueldosRecibo.tsx`:
  - Eliminado el row de redondeo del `<tbody>` (era el diseño anterior).
  - El `<tfoot>` ahora tiene la estructura: Totales → (condicional) Neto sin redondeo → Redondeo → Total neto.
- `recibo-pdf.tsx`:
  - `netoRaw`, `redondeo` y `neto` calculados con la misma lógica que el HTML.
  - Fila de redondeo desplazada de antes del `totalsRow` a después (orden correcto).
  - Tres filas condicionales agregadas: `NETO SIN REDONDEO`, `REDONDEO`, `TOTAL NETO`.
- `ImprimirRecibosDialog.tsx`: `handlePreview` usa `agrupados.flatMap(a => a.recibos)`. Eliminado texto "solo primer empleado seleccionado".

---

## 4) Riesgos, observaciones y pendientes

### 4.1 Observaciones

- El desglose de redondeo (3 filas) solo aparece cuando hay centavos en el neto. Si todos los conceptos suman un entero exacto, el pie de tabla sigue siendo la fila de Totales sola.
- La vista previa del PDF ahora carga todos los recibos del filtro en un solo documento; para períodos con muchos empleados puede tardar más.

### 4.2 Pendientes

- El campo "Valor hora override" y otros de la sección Remuneración siguen siendo solo lectura; evaluar si también necesitan ser editables.
- Considerar exponer en la UI la configuración del "empleado de referencia" por empresa (plantilla base de conceptos).

---

## 5) Archivos principales involucrados

- `src/actions/sueldos.ts` — `updateEmpleado` acepta `valorSueldo`
- `src/components/sueldos/SueldosEmpleados.tsx` — campo `valorSueldo` editable
- `src/components/sueldos/SueldosRecibo.tsx` — reestructuración del tfoot con desglose de redondeo
- `src/components/sueldos/recibo-pdf.tsx` — lógica de redondeo y desglose en el PDF
- `src/components/sueldos/ImprimirRecibosDialog.tsx` — fix vista previa con todos los empleados
- `Actualizaciones/2026-06-05 actualizacion.md`

---

## 6) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios tecnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
