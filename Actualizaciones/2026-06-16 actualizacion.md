# Actualizacion - 2026-06-16

## 1) Objetivo general del dia

Completar la carga de escalas salariales de los convenios CCT pendientes (272/96 Pastelería y 459/06 Sanidad), asignar empleados a sus categorías correctas, y desestimar el CCT 167/91 (información incorrecta). Se actualizó el documento de investigación con el estado final de los 4 convenios trabajados.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 CCT 272/96 Pastelería — carga completa ✅

- **Cambio:** Creación del convenio 272/96 para Sabenumitubeja S.A. y carga de 30 categorías (3 jornadas × 10 categorías) con escala Marzo 2026.
- **Motivo:** Pastelería tiene 3 variantes de básico según jornada contractual (7hs, 8hs, 9h36). Las categorías se nombran con prefijo de jornada: `7hs - Ayudante Pastelero`, `8hs - Oficial de Sección`, etc.
- **Impacto:** 5 empleados de Sabenumitubeja asignados a su categoría y jornada correcta según campo `categoria` y `horas_mensuales_normales`:
  - Eguia, Benitez → 8hs - Ayudante Pastelero / Sandwichero
  - Cruzado → 8hs - Oficial de Sección
  - Melgarejo → 7hs - Oficial de Sección
  - Toloza → 7hs - Peón de Limpieza
- **Archivos:** `src/scripts/seed-pasteleria-272-escalas.ts`

### 2.2 CCT 272/96 — aclaración sobre CCT 167/91 ✅

- **Cambio:** Sabenumitubeja confirmada como empresa exclusivamente de CCT 272/96. El CCT 167/91 (STARP Mar del Plata) que figuraba en AFIP para esta empresa era información incorrecta — fue desestimado.
- **Motivo:** Al comparar los puestos de los empleados importados contra ambas planillas, todos matchearon exactamente con 272/96 y ninguno con 167/91.
- **Impacto:** Se elimina 167/91 del scope de trabajo. No afecta ninguna empresa activa.

### 2.3 CCT 459/06 Sanidad — escalas cargadas y empleados asignados ✅

- **Cambio:** Carga de 8 categorías (I-A a VI) con escalas Febrero, Marzo y Abril 2026 para el convenio 459/06 de Admip SRL.
- **Motivo:** Convenio tenía las categorías vacías. Las escalas quedan disponibles para futuros clientes de Sanidad/Emergencias Médicas.
- **Impacto:** Los 2 empleados activos de Admip (Bravo Antonio y Briones Nancy) son jefes — asignados a `9999/99 Excluido de Convenio` con categoría **Jefe** (sin monto, a completar manualmente en UI).
- **Archivos:** `src/scripts/seed-sanidad-459-escalas.ts`

### 2.4 Solapa Empleados — mejoras de edición ✅

- **Espaciado de campos:** El dialog de edición de empleado tenía los campos demasiado juntos. Se aumentó el `gap-y` del grid de secciones de `3` a `5` (de 12px a 20px), aplicando a todas las pestañas del formulario.
- **Puesto sincronizado con categoría del sistema:** Al cambiar la categoría CCT de un empleado en modo edición, el campo "Puesto" (texto libre) ahora se actualiza automáticamente con el nombre de la categoría seleccionada. El campo Puesto también es editable manualmente para ajustar el nombre si difiere del CCT. El valor se persiste correctamente en `liquidacion_import_empleado.categoria` y se refleja en la tabla de empleados al guardar.

### 2.5 Desplegables — texto truncado en trigger, completo al abrir ✅

- **Problema:** Los `Select` de la app crecían sin límite con textos largos (ej. modalidades de contratación, categorías de convenio), rompiendo el layout del formulario.
- **Fix en `src/components/ui/select.tsx`:**
  - `SelectTrigger`: `w-fit` → `w-full min-w-0` + `truncate` en el valor — el trigger llena su contenedor y corta el texto seleccionado si es largo.
  - `SelectContent`: removido `overflow-x-hidden` — el panel puede ser más ancho que el trigger.
  - Viewport: `w-full` → `w-max` — el dropdown se expande al ancho necesario para mostrar el texto completo de cada opción.
- **Alcance:** Aplica a todos los Select de la aplicación.

---

## 3) Cambios técnicos (implementación)

### 3.1 Backend / motor
- Sin cambios en `src/actions/` ni lógica de negocio.

### 3.2 Frontend / UI
- Sin cambios en componentes.

### 3.3 Datos / DB / scripts

- **`src/scripts/seed-pasteleria-272-escalas.ts`** (nuevo):
  - Crea convenio 272/96 para empresas que lo tienen en AFIP y no en sistema.
  - Crea 30 categorías por convenio: 3 jornadas (`7H`, `8H`, `9H`) × 10 categorías del CCT.
  - Carga escala Marzo 2026 para cada categoría (fuente: pasteleros.org).
  - Asigna empleados mapeando `categoria` (texto libre) + `horas_mensuales_normales` a la categoría correcta.
  - Rangos de horas: 7H = 170–224hs, 8H = 225–264hs, 9H = 265+hs.

- **`src/scripts/seed-sanidad-459-escalas.ts`** (nuevo):
  - Crea categorías I-A a VI para todos los convenios 459/06 del sistema.
  - Carga escalas Feb–Abr 2026 (acuerdo 01/02/2026–31/01/2027).
  - Fuente: sanidad.org.ar.

- **DB — datos cargados:**
  - `payroll_convenio`: 1 nuevo (272/96 Sabenumitubeja)
  - `payroll_convenio_categoria`: 30 nuevas (272/96) + 8 nuevas (459/06) = 38 total
  - `payroll_escala`: 30 nuevas (272/96 marzo) + 24 nuevas (459/06 feb/mar/abr) = 54 total
  - `payroll_convenio` 9999/99 Admip: categoría Jefe creada (sin monto)
  - `liquidacion_import_empleado`: 5 empleados Sabenumitubeja + 2 empleados Admip asignados

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados o actualizados
- `Documentacion Tecnica/Escalas Salariales CCT - Investigacion.md` — actualizado con estado final de los 4 convenios, checklist completado, 167/91 desestimado, pendientes menores documentados.
- `Actualizaciones/2026-06-16 actualizacion.md` — este documento.

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Observaciones
- Las escalas CCT 272/96 solo cubren Marzo 2026. Las ANR de Abril–Septiembre 2026 deben cargarse como **concepto no remunerativo separado** (no como escala base).
- Las escalas CCT 459/06 solo cubren hasta Abril 2026. Las de Mayo en adelante no estaban publicadas al momento de este trabajo.

### 5.3 Aclaración: tope máximo imponible y el archivo LSD

Se revisó y documentó el comportamiento del tope máximo imponible en relación al archivo LSD:
- El tope **no aparece como campo en el TXT** — no hay ninguna línea ni posición del archivo que lo contenga explícitamente.
- Es un parámetro interno que condiciona el cálculo de las bases imponibles en el Record 04: cuando el salario supera el tope, las bases 1 (jubilación aporte), 4 (OS aportes) y 5 (FNE/AAFF) quedan capadas al valor del tope.
- Con los sueldos actuales de las empresas liquidadas, ningún empleado supera el tope (~$4M), por lo que el efecto es invisible en la práctica.
- Verificado contra el archivo de referencia de SOS Contador (`30-71755486-4_2026-5_0__LSD.txt`): el tope no aparece en ningún campo del TXT.
- Documentado en `Documentacion Tecnica/Cargas Sociales - LSD.md`, sección "El tope NO aparece en el archivo LSD".

### 5.2 Pendiente inmediato
- [ ] Cargar ANR mensual CCT 272/96 (abr–sep 2026) como concepto NR en Sabenumitubeja.
- [ ] Definir monto del puesto Jefe en Admip (9999/99) — completar en UI manualmente.
- [ ] Buscar y cargar escalas CCT 459/06 mayo–agosto 2026 cuando se publiquen.
- [ ] Asignar categorías UOCRA a empleados de CONSTRUCTORA ARK-FA, Deze Construcciones, GMONTAJES y GONZALEZ GUSTAVO RAMON cuando se incorporen.

---

## 5bis) Concepto memo — descripción libre en recibo ✅

### Funcionalidad
- Los conceptos SOS con `tiene_memo = true` en `conceptos_completos_sos` ahora muestran un campo de texto libre en la grilla de edición del recibo.
- El texto ingresado se guarda en `liquidacion_import_concepto_valor.memo` y aparece **en lugar del nombre del concepto** en el recibo (HTML y PDF).
- Si no hay texto, el recibo sigue mostrando el nombre estándar del concepto.
- La lógica evita mostrar metadata interna (`source=...`, `calc_error=...`) en el recibo.

### Casos de uso
- Conceptos como "Otros descuentos", "Otros haberes", etc. donde el nombre genérico no es suficiente para el recibo.
- El operador escribe la descripción específica (ej. "Descuento por anticipos de quincena") directamente en la grilla.

### Cambios técnicos

**`src/actions/sueldos.ts`**
- `getUltimoReciboImportado`: añadido `memo` al select de conceptos.
- `listConceptosPlantillaManualSos`: añadido `tieneMemo` al objeto retornado.
- `conceptoEditsSosSchema`: añadido `memo: z.string().optional().nullable()`.
- `guardarReciboDesdeTabla`: reemplazado hardcode `'source=manual_sos'` por `c.memo?.trim() || null`.

**`src/components/sueldos/TablaReciboSos.tsx`**
- `ConceptoImportado`: añadidos `tieneMemo?: boolean | null` y `memo?: string | null`.
- `EditsMap`: añadido `memo: string`.
- `EMPTY_EDIT_ROW` e `initialEdits`: inicializan `memo`.
- Render de fila: cuando `c.tieneMemo === true`, muestra `<input type="text">` debajo del nombre con placeholder "Descripción en recibo...".

**`src/components/sueldos/SueldosSimulador.tsx`**
- `buildConceptosParaGuardar`: propaga `memo` al guardar.
- Modo copia: copia `memo` del recibo anterior.

**`src/components/sueldos/SueldosRecibo.tsx`** y **`recibo-pdf.tsx`**
- Añadido `memo?: string | null` al tipo `DetalleRow` del PDF.
- Nombre del concepto en tabla: muestra `det.memo` si tiene texto útil, sino el nombre estándar.

---

## 5ter) Montos redondeados en Dashboard y listado de Recibo ✅

- **Problema:** Los montos en el Dashboard (total bruto, total neto, neto por recibo) y en la lista de recibos de la solapa Recibo mostraban el valor crudo almacenado en DB, con decimales (ej. `$1.234.567,45`). El recibo de sueldo ya aplica redondeo hacia arriba (`Math.ceil`) sobre el neto calculado — ese valor redondeado es el correcto a mostrar.
- **Fix:** Se aplica `Math.ceil(Number(neto)).toLocaleString('es-AR')` en todos los puntos de display. Así `$1.234.567,45` → `$1.234.568`, igual que en el recibo impreso.
- **Archivos:** `src/components/sueldos/SueldosDashboard.tsx`, `src/components/sueldos/SueldosRecibo.tsx`.

---

### 2.6 Cargas Sociales — rediseño UI y filtro por empleado ✅

- **Problema:** El panel de generación de presentaciones saturaba la vista principal de la solapa.
- **Fix:** Se reemplazó el panel colapsable `NuevaPresentacionPanel` por un botón **"Generar presentación"** que abre un `Dialog` (`GenerarPresentacionDialog`). La vista principal ahora solo muestra el historial de presentaciones y el botón.
- **Filtro por empleado:** Dentro del dialog, se puede seleccionar/deseleccionar empleados con checkboxes antes de generar. Útil para rectificativas parciales (ej. corregir solo un empleado). Los no seleccionados quedan con `opacity-40`. Si hay un subconjunto seleccionado, aparece el badge **"Rectificativa parcial"** y el botón de generar indica cuántos empleados se incluyen.
- **Dialog ancho:** El dialog usa `w-[95vw] sm:max-w-[95vw]` para ocupar casi toda la pantalla — necesario ya que la tabla de empleados tiene varias columnas. La columna "Situación revista" trunca el texto largo con tooltip al hacer hover.
- **Título y botón sin número:** Se quitó el número de presentación del título y del botón de generar. Solo se muestra `(rectificativa)` en el título cuando corresponde.

---

## 6) Archivos principales involucrados

- `src/scripts/seed-pasteleria-272-escalas.ts`
- `src/scripts/seed-sanidad-459-escalas.ts`
- `src/components/sueldos/SueldosEmpleados.tsx`
- `src/components/ui/select.tsx`
- `src/components/sueldos/TablaReciboSos.tsx`
- `src/components/sueldos/SueldosSimulador.tsx`
- `src/components/sueldos/SueldosRecibo.tsx`
- `src/components/sueldos/recibo-pdf.tsx`
- `src/components/sueldos/SueldosCargas.tsx`
- `Documentacion Tecnica/Escalas Salariales CCT - Investigacion.md`
- `Documentacion Tecnica/Cargas Sociales - LSD.md`
- `Actualizaciones/2026-06-16 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios técnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
