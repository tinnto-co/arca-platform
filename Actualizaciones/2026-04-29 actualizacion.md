# Actualizacion - 2026-04-29

## 1) Objetivo general del dia

Continuación del refactor de la solapa Sueldos, con foco en tres mejoras de UX en el flujo de recibos: (1) soporte para eliminar conceptos individuales de la tabla de liquidación, (2) botón "Editar" en la solapa Recibo que navega al simulador con los datos del recibo pre-cargados, y (3) correcciones menores de datos: sincronización de categorías de empleados desde archivos SOS, enlace de gerentes al convenio 9999/99, y fix del contador de empleados activos en el dashboard.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Eliminar conceptos individuales en el simulador de recibos

- **Cambio:** En la tabla de conceptos del simulador (modo manual y modo copia), cada fila muestra un ícono de papelera al hacer hover. Al hacer click, el concepto se elimina de la tabla activa.
- **Motivo:** El usuario podía agregar conceptos con el botón "+" pero no tenía forma de quitarlos una vez agregados.
- **Impacto:** El operador puede armar y corregir la lista de conceptos libremente antes de guardar el recibo.
- **Archivos:** `src/components/sueldos/TablaReciboSos.tsx`, `src/components/sueldos/SueldosSimulador.tsx`

### 2.2 Boton "Editar" en la solapa Recibo

- **Cambio:** En la lista de recibos guardados (solapa Recibo), cada fila tiene un botón con ícono de lápiz. Al hacer click, el sistema navega a la solapa "Nuevo recibo" con el empleado y período pre-seleccionados, en modo "Copiar último recibo".
- **Motivo:** El operador necesitaba poder re-abrir un recibo ya guardado para corregirlo o re-liquidarlo desde el simulador.
- **Impacto:** Flujo de corrección de recibos sin necesidad de reingresar el empleado y período manualmente. Si el recibo a editar es el último del empleado, los conceptos quedan pre-cargados automáticamente.
- **Archivos:** `src/components/sueldos/SueldosRecibo.tsx`, `src/components/sueldos/SueldosSimulador.tsx`, `src/routes/_authed/sueldos/index.tsx`

### 2.3 Fix: contador de empleados activos en el dashboard

- **Cambio:** La card "Empleados activos" del dashboard ahora filtra por `activo = true` antes de contar.
- **Motivo:** El contador mostraba el total de empleados (incluyendo bajas), no solo los activos.
- **Impacto:** El número en el dashboard refleja correctamente la nómina activa de cada empresa.
- **Archivos:** `src/components/sueldos/SueldosDashboard.tsx`

### 2.4 Filtro "Ocultar bajas" en solapa Empleados

- **Cambio:** Se agrega un checkbox "Ocultar bajas" junto al buscador en la solapa Empleados. Por defecto está activado (oculta bajas). Al desmarcarlo se muestran todos los empleados incluyendo los dados de baja.
- **Motivo:** La lista de empleados mostraba bajas mezcladas con activos, generando confusión al buscar.
- **Impacto:** Vista más limpia por defecto; las bajas siguen accesibles cuando se necesitan.
- **Archivos:** `src/components/sueldos/SueldosEmpleados.tsx`

### 2.5 Sincronizacion de categorias desde archivos SOS (legajos)

- **Cambio:** Se ejecutó el script Python `sync-categorias-desde-sos.py` que lee los archivos de legajos SOS (HTML disfrazado de .xls), compara el campo `categoria` en la DB vs SOS, y completa los valores nulos. Se actualizaron 45 empleados.
- **Motivo:** Muchos empleados tenían `categoria = NULL` en la DB aunque SOS Contador tenía el dato. Sin texto de categoría no era posible enlazar `categoria_id` para el cálculo automático de básico.
- **Impacto:** Mayor cobertura de empleados con `categoria_id` enlazado → más recibos con básico calculado automáticamente desde la escala.
- **Archivos:** `src/scripts/sync-categorias-desde-sos.py`

### 2.6 Enlace de gerentes al convenio 9999/99 (Excluido de Convenio)

- **Cambio:** Se ejecutaron los scripts `setup-fuera-convenio-gerentes.ts` (inicial, creó convenios FUERA) y `fix-gerentes-convenio.ts` (corrección, eliminó los FUERA y re-enlazó a los convenios existentes 9999/99). 16 empleados con `categoria = 'Gerente'` quedaron enlazados a `9999/99 / GERENTE` con su `valor_sueldo` individual como override.
- **Motivo:** Los gerentes están fuera de escala CCT; necesitan un convenio especial con override manual por empleado.
- **Impacto:** Los recibos de gerentes usan el `valor_sueldo` del empleado como básico, en lugar de intentar buscar una escala inexistente.
- **Archivos:** `src/scripts/setup-fuera-convenio-gerentes.ts`, `src/scripts/fix-gerentes-convenio.ts`

---

## 3) Cambios tecnicos (implementacion)

### 3.1 Frontend / UI

- **`TablaReciboSos.tsx`:**
  - Nuevo prop `onRemoveConcepto?: (codigo: string) => void` en `TablaReciboSosProps` y `TableSectionProps`.
  - Ícono `Trash2` (Lucide) dentro de la celda del nombre de cada concepto, visible solo en hover (`opacity-0 group-hover/row:opacity-100`).
  - El prop se pasa en cadena desde `TablaReciboSos` → `TableSection` → cada fila.

- **`SueldosSimulador.tsx`:**
  - Nuevo callback `handleRemoveConcepto`: elimina el código de `activeCodigos` via `Set.delete`.
  - Nuevo prop `initialData?: { importEmpleadoId, empleadoNombre, periodo, tipoRecibo }`.
  - `useEffect` con ref guard (`lastInitialDataRef`) que aplica `initialData` una sola vez: setea `flowHeader`, `sosEmpleadoId`, limpia edits y activa modo `copiarUltimoRecibo = true`.
  - Se agrega `useRef` al import de React.

- **`SueldosRecibo.tsx`:**
  - Nuevo prop `onEditRecibo?: (data) => void` en `SueldosReciboProps`.
  - Botón con ícono `Pencil` (Lucide) en cada fila de la lista de recibos.
  - `e.stopPropagation()` para no disparar el toggle de selección del recibo al hacer click en el botón.
  - Pasa `r.empleado.id` como `importEmpleadoId`, `r.liquidacion.periodo`, `r.liquidacion.tipo`.

- **`src/routes/_authed/sueldos/index.tsx`:**
  - Nuevo estado `editReciboData` (tipo inline, inicialmente `undefined`).
  - `SueldosRecibo` recibe callback `onEditRecibo` que setea `editReciboData` y cambia `activeTab` a `'simulador'`.
  - `SueldosSimulador` recibe `initialData={editReciboData}`.

- **`SueldosDashboard.tsx`:**
  - `importEmpleados.length` → `importEmpleados.filter((e) => e.empleado.activo).length` en la card "Empleados activos".

- **`SueldosEmpleados.tsx`:**
  - Nuevo estado `ocultarBajas` (default `true`).
  - `filtrados` useMemo: si `ocultarBajas && e.fechaBaja != null` → excluir.
  - Checkbox en la barra de búsqueda.

### 3.2 Scripts ejecutados (one-off)

| Script | Resultado |
|--------|-----------|
| `src/scripts/sync-categorias-desde-sos.py` | 45 empleados con `categoria` actualizada desde SOS |
| `src/scripts/setup-fuera-convenio-gerentes.ts` | Creó convenios FUERA (luego revertidos) |
| `src/scripts/fix-gerentes-convenio.ts` | 16 gerentes enlazados a 9999/99, convenios FUERA eliminados |

### 3.3 Datos / DB

- 16 empleados con `categoria = 'Gerente'` ahora tienen `convenio_id` → 9999/99 y `categoria_id` → GERENTE.
- 45 empleados con `categoria` texto actualizado desde SOS (habilitando enlace posterior de `categoria_id`).
- No hay cambios de schema Drizzle.

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados

- `Actualizaciones/2026-04-29 actualizacion.md` (este archivo)

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Riesgos detectados

- **Editar recibo ≠ último recibo:** El botón "Editar" carga en modo "Copiar último recibo". Si el recibo que se quiere editar no es el último guardado para ese empleado, los conceptos pre-cargados serán los del recibo más reciente, no el seleccionado. Para edición exacta de un recibo específico se requeriría una acción `getReciboImportadoById` (pendiente).
- **Gerentes con `antiguedadAnios = null`:** Al navegar al simulador desde "Editar", `antiguedadAnios` se pasa como `null`. El concepto 3 (Antigüedad) no se auto-calcula; el operador debe completarlo manualmente.

### 5.2 Pendiente inmediato

- Evaluar si el "Editar recibo" debe cargar el recibo específico (no el último) via nueva acción backend.
- Cargar escalas para CCT Gastronómico (389/04) cuando estén disponibles.
- Evaluar exposición de `empleados_categorias` en la UI para gestión sin scripts.

---

## 6) Archivos principales involucrados

- `src/components/sueldos/TablaReciboSos.tsx`
- `src/components/sueldos/SueldosSimulador.tsx`
- `src/components/sueldos/SueldosRecibo.tsx`
- `src/components/sueldos/SueldosDashboard.tsx`
- `src/components/sueldos/SueldosEmpleados.tsx`
- `src/routes/_authed/sueldos/index.tsx`
- `src/scripts/sync-categorias-desde-sos.py`
- `src/scripts/setup-fuera-convenio-gerentes.ts`
- `src/scripts/fix-gerentes-convenio.ts`
- `Actualizaciones/2026-04-29 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios tecnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
