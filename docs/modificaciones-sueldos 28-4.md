# Modificaciones módulo sueldos — 28/4/2026

## 1. Concepto Presentismo (SOS #19)

### Problema
Faltaba el concepto "Presentismo" (número SOS 19) en el catálogo. Además, el porcentaje de este concepto es siempre fijo en 8,33 y no debe ser editable por el usuario.

### Cambios de schema

**`drizzle/schema.ts`** — tabla `conceptos_completos_sos`:
- Se agrega columna `pctFijo: numeric("pct_fijo")` (nullable): almacena el porcentaje fijo no editable de un concepto.

```sql
ALTER TABLE conceptos_completos_sos ADD COLUMN IF NOT EXISTS pct_fijo numeric;
```

> **Importante**: `drizzle.config.ts` usa `MIGRATION_URL` para `db:push`, pero la app corre contra `DATABASE_URL`. Son bases distintas. La migración se aplicó manualmente contra `DATABASE_URL` con `ALTER TABLE` directo.

### Cambios en seed

**`src/scripts/seed-conceptos-sos-catalog.ts`**:
- Concepto 19: renombrado a `'Presentismo'`, agregado `pctFijo: 8.33`.
- Se agregó `pctFijo?: number` al tipo `ConceptoSos`.

### Cambios en servidor

**`src/actions/sueldos.ts`** — handler `listConceptosPlantillaManualSos`:
- `porcentaje` del concepto se pre-carga con `pctFijo` si está definido.
- Se agrega `pctFijo` al objeto retornado.

### Cambios en UI

**`src/components/sueldos/TablaReciboSos.tsx`**:
- Se agrega `pctFijo?: number | null` a la interfaz `ConceptoImportado`.
- `initialEdits`: el campo `porcentaje` se inicializa con `pctFijo` si está definido.
- Celda `%`: cuando `pctFijo != null`, se muestra un `<span>` de solo lectura con el valor (gris); de lo contrario se muestra el `EditableCell` habitual.

---

## 2. Carga de conceptos por sección con botón "+"

### Problema
La tabla del Simulador ("Nuevo recibo") mostraba los 231+ conceptos SOS todos juntos desde el inicio, lo que hacía el formulario muy difícil de usar. Se necesitaba mostrar la tabla vacía y permitir agregar conceptos de a uno por sección.

### Arquitectura de la solución

- **`SueldosSimulador`** mantiene un estado `activeCodigos: Set<string>` con los códigos SOS actualmente visibles en la tabla.
- `conceptosActivos` es un memo que filtra `conceptosFilas` por `activeCodigos`.
- La tabla recibe `conceptosActivos` (solo los activos) más `catalogoCompleto={conceptosFilas}` (el catálogo entero, para el popover de búsqueda).
- Al guardar, se usan solo los `conceptosActivos`.

### Inicialización de `activeCodigos`

| Modo | Inicialización |
|---|---|
| Carga manual | Vacío — el usuario agrega conceptos uno a uno |
| Copiar último recibo | Pre-cargado con los códigos del último recibo que tienen al menos un campo con valor |

Se resetea automáticamente al cambiar empleado, período, modo o plantilla.

### Componente `AgregarConceptoButton`

Popover con campo de búsqueda por nombre o número, listando los conceptos de la sección que aún no están activos. Al hacer clic en un concepto, se llama `onAddConcepto(codigo)` y se cierra el popover.

- Filtra por `rangoMin`/`rangoMax` de la sección.
- Excluye los conceptos ya activos.
- Muestra mensaje "Sin resultados" si la búsqueda no encuentra nada, o "Todos los conceptos ya están agregados" si no quedan disponibles.

### Cambios en `TablaReciboSos`

**Nuevas props:**
- `catalogoCompleto?: ConceptoImportado[]` — catálogo completo para el popover.
- `onAddConcepto?: (codigo: string) => void` — callback para activar un concepto.

**Nuevas props en `TableSectionProps`:**
- Las mismas dos, más `codigosActivos?: Set<string>` (derivado de `conceptos` en el componente padre).

**Lógica de secciones visibles:**
- Con `onAddConcepto`: se muestran TODAS las secciones (incluso vacías), para que el "+" siempre esté disponible.
- Sin `onAddConcepto`: comportamiento anterior (solo secciones con datos).

**`useEffect` para nuevos conceptos:**
Cuando `conceptos` cambia (nuevo concepto activado), inicializa los edits del nuevo concepto sin sobreescribir los existentes.

### Archivos modificados

| Archivo | Cambios |
|---|---|
| `drizzle/schema.ts` | Columna `pct_fijo` en `conceptos_completos_sos` |
| `src/scripts/seed-conceptos-sos-catalog.ts` | Concepto 19 = Presentismo con `pctFijo: 8.33` |
| `src/actions/sueldos.ts` | `listConceptosPlantillaManualSos` retorna `pctFijo`, pre-carga `porcentaje` |
| `src/components/sueldos/TablaReciboSos.tsx` | `pctFijo` readonly, `AgregarConceptoButton`, props `catalogoCompleto`/`onAddConcepto`, secciones siempre visibles en modo manual |
| `src/components/sueldos/SueldosSimulador.tsx` | Estado `activeCodigos`, `conceptosActivos`, `handleAddConcepto`, efectos de reset e inicialización para modo copia |

---

## 3. Solapa "Recibo" — filtros y lista de resultados

### Problema
La solapa Recibo solo permitía buscar por período (mes + año) y luego seleccionar el recibo de un dropdown. No había forma de ver todos los recibos de un empleado sin conocer el período exacto.

### Cambios en servidor

**`src/actions/sueldos.ts`** — nueva función `listLiquidacionesByFiltros`:
- Acepta `periodo?: string` y/o `importEmpleadoId?: string` (al menos uno requerido, validado con Zod `.refine`).
- Filtra por `origen = 'generado'` para excluir recibos importados del SOS; solo muestra los generados desde este sistema.
- Ordena por período descendente, luego por legajo/nombre del empleado.
- Límite de 300 resultados.

### Cambios en UI

**`src/components/sueldos/SueldosRecibo.tsx`** — componente rediseñado:

**Filtros:**
- **Año** (opcional): desplegable con "Todos los años" + últimos 8 años.
- **Mes** (opcional): habilitado solo cuando hay un año seleccionado; "Todos los meses" + 12 meses.
- **Empleado** (opcional): desplegable con todos los empleados del perfil (cargado con `listImportEmpleados`, staleTime 5 min).
- Botón "Limpiar filtros" visible cuando hay algún filtro activo.
- Período activo = año **y** mes juntos. El empleado es independiente.

**Lista de resultados:**
- Aparece debajo de los filtros cuando hay al menos un filtro activo.
- Muestra nombre del empleado, legajo, período, tipo de recibo y neto de cada resultado.
- Clic en un ítem lo selecciona (ícono `>` rota 90°); clic nuevamente lo deselecciona.

**Recibo detalle:**
- El componente `ReciboDocumento` se muestra debajo de la lista al seleccionar un recibo.

### Archivos modificados

| Archivo | Cambios |
|---|---|
| `src/actions/sueldos.ts` | Nueva función `listLiquidacionesByFiltros` |
| `src/components/sueldos/SueldosRecibo.tsx` | Filtros de año/mes/empleado, lista de resultados, imports de `listLiquidacionesByFiltros` y `listImportEmpleados` |
