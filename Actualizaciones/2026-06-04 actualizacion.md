# Actualizacion - 2026-06-04

## 1) Objetivo general del dia

Mejoras al módulo de sueldos: redondeo del neto a entero (con visualización en recibo imprimible y en grilla de carga), plantilla base de conceptos al generar un nuevo recibo, corrección de fechas de alta de empleados importados desde SOS Contador, y fix de zona horaria en la visualización de fechas.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Redondeo del neto a entero (recibo imprimible — solapa "Recibo")

- **Cambio:** Si el neto calculado tiene centavos, se redondea al entero superior (ceil). La diferencia se muestra como una fila adicional con el texto "Redondeo ↑ entero" en la columna **No remunerativo** del cuerpo de la tabla, y también como resumen en el pie de tabla con fondo ámbar.
- **Motivo:** Los recibos en Argentina se liquidan en pesos enteros. El redondeo debe quedar trazable en el documento.
- **Impacto:** El recibo imprimible y la grilla de carga muestran el redondeo como concepto visible. El neto final refleja el valor redondeado.
- **Archivos:** `src/components/sueldos/SueldosRecibo.tsx`, `src/components/sueldos/TablaReciboSos.tsx`

### 2.2 Posición del redondeo en la grilla de carga (TablaReciboSos)

- **Cambio:** El monto de redondeo en el pie de la grilla de carga de conceptos ahora aparece bajo la columna **No Rem.** (última columna), en lugar de Haberes.
- **Motivo:** Consistencia con la columna que se usa para conceptos no remunerativos; el redondeo no es un haber remunerativo.
- **Archivos:** `src/components/sueldos/TablaReciboSos.tsx`

### 2.3 Plantilla base de conceptos al generar un nuevo recibo

- **Cambio:** Al generar un nuevo recibo en modo "Carga manual" (sin copiar del mes anterior), la grilla se pre-carga con los 16 conceptos del empleado de referencia de E-Presis (Azuaje Rojas, Edward Alejandro — CUIL 23960132769) como plantilla. Los conceptos aparecen activados pero sin valores; el usuario los completa manualmente.
- **Motivo:** Evitar cargar los conceptos desde cero en cada recibo nuevo. La plantilla representa los conceptos que deben estar siempre presentes en un recibo estándar.
- **Concepto de referencia configurado:** empleado `4a14ead8-52ea-4c36-ad0f-fd422a1ce779`, profile `53adfe1f-7142-4af4-b9cd-e80ddf21e66f`.
- **Archivos:** `drizzle/schema.ts`, `src/actions/sueldos.ts`, `src/components/sueldos/SueldosSimulador.tsx`, `src/scripts/apply-plantilla-column.ts`

### 2.4 Porcentajes predeterminados para conceptos fijos

- **Cambio:** Al agregar ciertos conceptos a la grilla, ya vienen con el `%` (y en algunos casos `cantidad`) pre-cargado:

  | Código | Concepto              | Cantidad | % |
  |--------|-----------------------|----------|------|
  | 3      | Antigüedad            | años de antigüedad | 1 |
  | 19     | SAC proporcional      | 1        | 8.33 |
  | 201    | Jubilación            | —        | 11   |
  | 202    | Ley 19032             | —        | 3    |
  | 203    | Obra social           | —        | 3    |
  | 206    | Cuota sindical        | —        | 2    |
  | 209    | Solidaridad           | —        | 0.5  |

- **Motivo:** Estos porcentajes son legalmente fijos o están establecidos por convenio; no deben cargarse manualmente en cada recibo.
- **Archivos:** `src/components/sueldos/SueldosSimulador.tsx`

### 2.5 Selección múltiple de conceptos al agregar

- **Cambio:** El botón "Agregar concepto" ahora permite seleccionar varios conceptos con checkboxes antes de confirmar, en lugar de agregar uno por uno.
- **Motivo:** Agilizar la carga de recibos con muchos conceptos.
- **Archivos:** `src/components/sueldos/TablaReciboSos.tsx`

### 2.6 Corrección de fechas de alta de empleados importados de SOS

- **Cambio:** Se corrigieron las fechas de alta (`fecha_alta`) de 157 empleados importados desde SOS Contador. El error era que SOS exporta fechas en formato US (`m/d/yy`) pero el sistema las interpretaba literalmente como día/mes invertido.
- **Causa raíz:** La librería XLSX con `cellDates: true` devuelve fechas UTC con el mes y día en orden norteamericano. La corrección aplica el swap `argDay = usM`, `argMonth = usD` para reinterpretar la fecha correctamente.
- **Ejemplo:** El Excel de E-Presis mostraba `01/05/2023` (1 de mayo) pero el sistema guardaba `05/01/2023` (5 de enero).
- **Archivos:** `src/scripts/fix-fecha-alta-empleados.ts` (nuevo), `src/scripts/import-legajos-sos.ts`

### 2.7 Campo "Sueldo básico override" editable en el editor de empleados

- **Cambio:** En la solapa **Laboral → Remuneración** del editor de empleado, el campo "Sueldo básico override" ahora es editable cuando se activa el modo edición. Muestra un `<Input type="number">` con placeholder explicativo. Si se deja vacío al guardar, el valor se borra (queda sin override). Fuera del modo edición sigue mostrando el valor en modo lectura como antes.
- **Motivo:** Permitir al usuario setear o limpiar el override de sueldo básico por empleado desde la UI, sin intervención técnica.
- **Archivos:** `src/components/sueldos/SueldosEmpleados.tsx`, `src/actions/sueldos.ts`

### 2.8 Fix de zona horaria en visualización de fechas de empleados

- **Cambio:** La función `formatDate` en `SueldosEmpleados.tsx` ahora extrae día/mes/año directamente del string ISO (`slice(0,10)`) sin conversión de zona horaria, evitando que las fechas almacenadas como medianoche UTC aparezcan un día antes en Argentina (UTC-3).
- **Archivos:** `src/components/sueldos/SueldosEmpleados.tsx`

---

## 3) Cambios tecnicos (implementacion)

### 3.1 Schema / DB

- Nueva columna `payroll_plantilla_empleado_id UUID` en tabla `client`, con FK a `liquidacion_import_empleado(id) ON DELETE SET NULL`.
- Referencia circular resuelta con `(): AnyPgColumn =>` en `drizzle/schema.ts`.
- Columna aplicada via script directo (`apply-plantilla-column.ts`) por limitación del `db:push` interactivo de drizzle-kit.

### 3.2 Backend (`src/actions/sueldos.ts`)

- `listConceptosPlantillaManualSos` acepta `profileId` opcional. Si el profile tiene `payrollPlantillaEmpleadoId` configurado, busca el último recibo de ese empleado y marca los conceptos correspondientes con `isPlantillaBase: true`.
- El server devuelve `cantidad`, `porcentaje`, `importe`, `importeConceptoNumero`, `importeMinimo`, `importeMaximo` mapeados desde el recibo de referencia (aunque actualmente los valores se devuelven vacíos — solo se usa `isPlantillaBase` para activar los conceptos).
- `getBasicoParaEmpleadoPeriodo`: prioridad cambiada: 1° override manual (`valorSueldo`), 2° escala del período exacto, 3° escala más reciente (fallback).
- `updateEmpleado`: agregado `valorSueldo` (string nullable) al schema Zod y al handler. Si llega vacío o `null`, se guarda como `NULL` en DB (borra el override).

### 3.3 Frontend

- `SueldosSimulador.tsx`: efecto que pre-activa los códigos `isPlantillaBase` al entrar en modo "Carga manual". El `handleAddConcepto` acepta array de códigos (`string[]`).
- `TablaReciboSos.tsx`: `AgregarConceptoButton` con multi-select (checkboxes); `onAddConcepto` tipado como `(codigos: string[]) => void`.
- `SueldosEmpleados.tsx`: solapa Laboral → Remuneración muestra `<Input>` editable para `valorSueldo` cuando `isEditing`; estado `valorSueldoOverride` inicializado desde `emp.valorSueldo` en `resetForm`.

### 3.4 Scripts de datos

- `src/scripts/fix-fecha-alta-empleados.ts` — corrige `fecha_alta` en DB leyendo XLS de `SOS_empresas_legajos`. Resultado: 157 actualizaciones.
- `src/scripts/apply-plantilla-column.ts` — agrega la columna `payroll_plantilla_empleado_id` y setea el empleado de referencia para E-Presis.
- `src/scripts/import-legajos-sos.ts` — corregido para usar `cellDates: true` y el swap de mes/día al parsear fechas.

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados

- `Actualizaciones/2026-06-04 actualizacion.md` (este documento)

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Observaciones

- El `db:push` de drizzle-kit sigue mostrando el prompt interactivo para el constraint `invoice_representative_auth_type_unique`. El constraint ya existe en la DB (confirmado via `pg_constraint`). drizzle-kit no lo detecta correctamente porque fue creado fuera de su flujo. No afecta el funcionamiento.
- La plantilla base está configurada solo para E-Presis. Para otras empresas, el comportamiento es la selección de conceptos por defecto (`1, 3, 201, 202, 203`). La extensión a otras empresas requiere configurar `payrollPlantillaEmpleadoId` en el `client` correspondiente.

### 5.2 Pendientes

- Considerar exponer en la UI la configuración del "empleado de referencia" por empresa, para que el usuario pueda cambiarla sin intervención técnica.
- Revisar si el `db:push` interactivo puede resolverse con una migración explícita (drizzle generate + migrate) en lugar del flujo push.
- El campo "Valor hora override" y otros de la sección Remuneración todavía son solo lectura; evaluar si también necesitan ser editables.

---

## 6) Archivos principales involucrados

- `drizzle/schema.ts` — columna `payrollPlantillaEmpleadoId` en `client`
- `src/actions/sueldos.ts` — `listConceptosPlantillaManualSos` con plantilla base; `getBasicoParaEmpleadoPeriodo` prioridad override; `updateEmpleado` acepta `valorSueldo`
- `src/components/sueldos/SueldosSimulador.tsx` — pre-activación de plantilla, porcentajes fijos, multi-select
- `src/components/sueldos/TablaReciboSos.tsx` — redondeo en columna No Rem., multi-select de conceptos
- `src/components/sueldos/SueldosRecibo.tsx` — fila de redondeo en tbody del recibo imprimible
- `src/components/sueldos/SueldosEmpleados.tsx` — fix zona horaria en `formatDate`; campo `valorSueldo` editable
- `src/scripts/fix-fecha-alta-empleados.ts`
- `src/scripts/apply-plantilla-column.ts`
- `src/scripts/import-legajos-sos.ts`
- `Actualizaciones/2026-06-04 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios tecnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
