# Actualizacion - 2026-05-06

## 1) Objetivo general del dia

Foco en el módulo de Sueldos: corrección de bugs visuales, mejoras de filtros y la implementación completa del sistema de impresión de recibos en PDF. Se crearon dos archivos nuevos (`recibo-pdf.tsx`, `ImprimirRecibosDialog.tsx`), se incorporó vista previa interactiva del documento antes de descargar, y se resolvió un bug crítico de superposición de celdas en el layout PDF causado por el uso incorrecto del shorthand `flex: 0` en Yoga (react-pdf).

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Filtro de empleados activos en solapa Recibo
- **Cambio:** El selector de empleados en la solapa Recibo y el dialog de impresión PDF ahora solo muestran empleados con `activo = true`.
- **Motivo:** Los empleados dados de baja estaban apareciendo en los selectores y en los PDFs generados.
- **Impacto:** Los recibos PDF y los filtros ya no incluyen empleados inactivos.
- **Archivos:** `src/components/sueldos/SueldosRecibo.tsx`, `src/actions/sueldos.ts`

### 2.2 Filtros por defecto al periodo actual en solapa Recibo
- **Cambio:** Los selectores de Año y Mes en la solapa Recibo se inicializan con el año y mes actual en lugar de estar vacíos.
- **Motivo:** Mejorar la experiencia del usuario evitando que tenga que seleccionar el periodo manualmente cada vez.
- **Impacto:** Al abrir la solapa Recibo ya aparecen los recibos del mes en curso.
- **Archivos:** `src/components/sueldos/SueldosRecibo.tsx`

### 2.3 Conceptos obligatorios pre-activos en Nuevo Recibo
- **Cambio:** Al abrir el simulador en modo manual, los conceptos 1 (Sueldo Básico), 3 (Antigüedad), 201 (Jubilación), 202 (Ley 19032) y 203 (Obra Social) aparecen pre-activados en la tabla.
- **Motivo:** Estos conceptos son obligatorios en todos los recibos y el usuario siempre los necesita.
- **Impacto:** Se reduce la fricción al cargar un recibo manual.
- **Archivos:** `src/components/sueldos/SueldosSimulador.tsx`

### 2.4 Corrección de firma digital duplicada
- **Cambio:** Se eliminó un bloque `<TabsContent value="firma-digital">` duplicado en la ruta de sueldos.
- **Motivo:** Se estaban renderizando dos instancias del componente `SueldosFirmaDigital` para la misma empresa.
- **Impacto:** La sección de firma digital ahora muestra una sola tarjeta por empresa.
- **Archivos:** `src/routes/_authed/sueldos/index.tsx`

### 2.5 Botón "Imprimir PDF" con modal de configuración y descarga
- **Cambio:** Se agregó un botón "Imprimir PDF" en la solapa Recibo que abre un dialog para configurar año, mes y empleados, y genera un PDF descargable (o ZIP para múltiples empleados).
- **Motivo:** Los usuarios necesitan imprimir recibos en formato PDF con copia empleado y copia empleador.
- **Impacto:** Desde la solapa Recibo se puede generar cualquier recibo en PDF, filtrado por período y empleado. Cada recibo ocupa una página A4, con dos hojas por recibo (copia empleado + copia empleador). Múltiples empleados generan un ZIP.
- **Archivos:** `src/components/sueldos/ImprimirRecibosDialog.tsx` (nuevo), `src/components/sueldos/recibo-pdf.tsx` (nuevo), `src/components/sueldos/SueldosRecibo.tsx`, `src/actions/sueldos.ts`

### 2.6 Vista previa del PDF antes de descargar
- **Cambio:** El dialog de impresión incluye un botón "Vista previa" que genera el PDF del primer empleado y lo muestra en un iframe dentro del mismo modal (expandido a 95% del viewport).
- **Motivo:** Permitir verificar el diseño y los márgenes del documento antes de generar todos los PDFs.
- **Impacto:** El usuario puede ver exactamente cómo quedará el recibo impreso antes de descargarlo.
- **Archivos:** `src/components/sueldos/ImprimirRecibosDialog.tsx`, `src/components/sueldos/recibo-pdf.tsx`

---

## 3) Cambios tecnicos (implementacion)

### 3.1 Backend / motor

- **`listRecibosDetalleParaPDF`** (nueva server function en `src/actions/sueldos.ts`): consulta masiva en 2 queries + `Promise.all` paralelo para obtener todos los recibos de un período, evitando N consultas individuales. Incluye filtro `eq(liquidacionImportEmpleado.activo, true)` para excluir empleados dados de baja.
- **Filtro de activos server-side**: agregado `eq(liquidacionImportEmpleado.activo, true)` al array `conditions` de `listRecibosDetalleParaPDF`.

### 3.2 Frontend / UI

- **`recibo-pdf.tsx`** (nuevo): componente cliente que usa `@react-pdf/renderer` para generar PDFs. Incluye layout A4 portrait con header de empresa, grilla de datos del empleado, tabla de conceptos con 4 columnas (haberes, descuentos, retenciones, no remunerativo), totales, neto en letras y sección de firmas. Exporta `generarYDescargar` (para descarga directa) y `generarPdfBlobEmpleado` (para vista previa).

- **Bug crítico resuelto — superposición de celdas en fila del empleado**: El uso de `flex: 0` como shorthand en Yoga (motor de layout de react-pdf) establece `flexBasis: 0`, lo que hace que las celdas fijas no "reclamen" espacio en el algoritmo flex. Las celdas adyacentes recibían el ancho total disponible, produciendo superposición visual. **Solución:** reemplazar `{ flex: 0, width: X }` por `{ flexBasis: X, flexGrow: 0, flexShrink: 0 }` usando el helper `FIXED_CELL`.

- **`textAlign: 'right'`** movido de `View` a `Text` en las celdas de montos: en react-pdf, `textAlign` en un `View` no siempre se propaga a los hijos, causando que los importes se mostraran alineados a la izquierda.

- **Header del recibo**: corregido de 38%/62% a `flex: 1` / `flex: 1` (50/50) para respetar el `grid-cols-2` del diseño HTML. Eliminado `flex: 1` de `headerPayRow` y `headerPayRowSep` que causaba alturas incorrectas en react-pdf.

- **`ImprimirRecibosDialog.tsx`** (nuevo): dialog con selección de año (obligatorio), mes (opcional) y empleados (todos o selección individual con checkboxes). Panel lateral de vista previa con iframe que carga el PDF a `#zoom=100`. Lógica de limpieza de blob URLs al cerrar.

- **`vite.config.ts`**: agregado `@react-pdf/renderer` a `optimizeDeps.include` para pre-bundling y evitar problemas de SSR.

- **Carga dinámica**: `recibo-pdf.tsx` se importa con `await import('./recibo-pdf')` desde el dialog para evitar que `@react-pdf/renderer` (solo cliente) se procese durante SSR.

### 3.3 Datos / DB / scripts

- Sin migraciones. No se modificó el schema de Drizzle.

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados o actualizados
- `Actualizaciones/2026-05-06 actualizacion.md` (este archivo)

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Riesgos detectados
- El layout PDF en react-pdf es sensible a las propiedades flex de Yoga. Cualquier celda con ancho fijo debe usar `flexBasis` + `flexGrow: 0` + `flexShrink: 0` (nunca `flex: 0` + `width`).
- La vista previa usa el PDF viewer nativo del browser (Chrome/Edge). En Firefox puede no renderizar el iframe correctamente.

### 5.2 Pendiente inmediato
- Ajustar visualmente el diseño del PDF si el usuario detecta más diferencias con el recibo en pantalla (espaciados, tamaños de fuente, proporciones de columnas).
- Evaluar si se necesita soporte para recibos con muchos conceptos (>35 filas) que podrían no entrar en una sola página A4.

---

## 6) Archivos principales involucrados

- `src/routes/_authed/sueldos/index.tsx`
- `src/actions/sueldos.ts`
- `src/components/sueldos/SueldosRecibo.tsx`
- `src/components/sueldos/SueldosSimulador.tsx`
- `src/components/sueldos/recibo-pdf.tsx` ← nuevo
- `src/components/sueldos/ImprimirRecibosDialog.tsx` ← nuevo
- `vite.config.ts`
- `Actualizaciones/2026-05-06 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios tecnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
