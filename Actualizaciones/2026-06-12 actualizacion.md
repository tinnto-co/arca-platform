# Actualizacion - 2026-06-12

## 1) Objetivo general del dia

Rediseño de la solapa **Cargas Sociales** del módulo de sueldos para gestionar presentaciones LSD con historial, número de presentación secuencial correcto y descarga del archivo `conceptosLSD.txt`. Además, rediseño de la UX de baja de empleados para soportar fecha de baja con dialog dedicado.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Solapa Cargas Sociales — rediseño completo ✅

- **Problema previo:** La solapa mostraba datos planos sin historial. El campo `nroPresentacion` en el R01 no se calculaba correctamente.
- **Investigación del campo R01 pos 23-27:** Comparando dos archivos LSD reales (`000013` y `000023`) se determinó el formato: posiciones 23-27 = `nroPresentacion` (5 dígitos, secuencial por período/empleador), posición 28 = carácter fijo `3`, posiciones 29-35 = cantidad de empleados.
- **Nuevo layout:**
  - Selector de período (arriba).
  - Tarjeta **Historial de presentaciones**: tabla con columnas nro, tipo (Original/Rectificativa badge), fecha de generación, empleados, conceptos, botón de re-descarga.
  - Panel colapsable **Nueva presentación**: tope, validación, tabla de empleados, dos botones: "Descargar conceptos LSD" (outline) y "Generar presentación nro X" (primary).
- **Número secuencial:** La primera presentación del período es nro 1 (Original), las siguientes son Rectificativas (nro 2, 3...).
- **Re-descarga:** Las presentaciones generadas quedan guardadas en BD y pueden re-descargarse sin regenerar.

---

### 2.2 Historial de presentaciones LSD — nueva tabla en DB ✅

- **Tabla nueva `payroll_lsd_presentacion`:** Guarda cada presentación generada con su contenido completo.
  - Campos: `id`, `profileId`, `periodo`, `nroPresentacion`, `filename`, `empleados`, `conceptos`, `contenido`, `generadoEn`.
  - Constraint único: `(profileId, periodo, nroPresentacion)`.
- **Creación:** Directamente via SQL con `bun -e` + pg driver (el `db:push` tenía un prompt interactivo bloqueante por una constraint no relacionada en la tabla `invoice`).

---

### 2.3 Descarga del archivo `conceptosLSD.txt` ✅

- **Nueva funcionalidad:** Botón "Descargar conceptos LSD" en el panel de nueva presentación.
- **Formato del archivo:** 195 caracteres por línea + CRLF. Estructura:
  - `codigoAfip` (6 chars) — código del concepto AFIP (ej. `110000`, `540000`).
  - `zeros` (6 chars) — siempre `000000`.
  - `codigoSos` (4 chars) — código SOS del concepto.
  - `nombre` (150 chars) — nombre del concepto, paddeado con espacios.
  - `flags` (29 chars) — flags AFIP según tipo de concepto.
- **Normalización de nombres:** Los nombres con acentos o caracteres no ASCII se normalizan a ASCII puro (NFD decomposition + strip combining marks) para respetar el formato Latin-1 del LSD.
- **Flags por tipo:**
  - Remunerativos (prefijo 11/12): `11111111111 1 1 10 0         `
  - No remunerativos (prefijo 54/52/55/56): `10000111100 0 0 00 0         `
  - Descuentos/retenciones (prefijo 81/82): `10000000000 0 0 00 0         `
- **Fuente de datos:** Conceptos activos del período → `payrollConcepto` → `conceptoSos` → `lsdConceptoAfip`.

---

### 2.4 Baja de empleados — rediseño UX ✅

- **Problema previo:** Existían dos controles separados para el estado del empleado: un badge "Activo/Inactivo" (campo `activo`) y un botón de baja por fecha (campo `fechaBaja`). Esto era redundante y confuso.
- **Nuevo comportamiento — badge único clickeable:**
  - Si el empleado está **activo** (`fechaBaja == null`): muestra badge "Activo" (verde). Click → abre dialog para ingresar fecha de baja.
  - Si el empleado está **de baja** (`fechaBaja != null`): muestra badge "Baja dd/mm/aaaa" (gris). Click → reactiva directamente (setea `fechaBaja = null`).
- **Dialog de baja:** Pre-rellena la fecha con hoy (`yyyy-MM-dd`). El usuario puede cambiarla antes de confirmar. Botón "Registrar baja" (destructivo).
- **Se eliminó:** La mutation `toggleActivo` y el badge de activo/inactivo redundante que operaba sobre el campo `activo`.

---

## 3) Cambios técnicos (implementación)

### 3.1 `drizzle/schema.ts`

- Nueva tabla `payrollLsdPresentacion` al final del schema.

### 3.2 `src/actions/sueldos.ts`

- **Imports:** agregados `payrollLsdPresentacion` y `max` (de drizzle-orm).
- **`generarArchivoLsd`:** calcula `nroPresentacion` secuencial con `max()` sobre la tabla de historial, construye R01 como `${nroStr}3${cantEmpleados}` (5 dígitos + fijo `3` + 7 dígitos), guarda presentación en `payrollLsdPresentacion`, devuelve `nroPresentacion` en el resultado.
- **Nueva acción `listLsdPresentaciones`:** devuelve historial de presentaciones para un `profileId` + `periodo`.
- **Nueva acción `getLsdPresentacionContenido`:** devuelve el contenido guardado de una presentación por ID (para re-descarga).
- **Nueva acción `generarConceptosLsd`:** genera el archivo `conceptosLSD.txt` con líneas de 195 chars. Helpers internos:
  - `normalizarNombreLsd(nombre)` — NFD + strip combining marks + strip non-ASCII.
  - `flagsConceptoLsd(tipoPrefijo)` — devuelve los 29 chars de flags según prefijo AFIP.
- **`updateEmpleado`:** validator extendido con `fechaBaja: z.string().optional().nullable()`. Handler: `if (fechaBaja !== undefined) set.fechaBaja = fechaBaja ? new Date(fechaBaja) : null`.

### 3.3 `src/components/sueldos/SueldosCargas.tsx`

- Reescrito completo. Nuevo layout:
  - `HistorialPresentaciones` (card con tabla de historial).
  - `NuevaPresentacionPanel` (collapsible, contiene tope, validación, tabla de empleados y botones de descarga).
  - Helper `triggerDownload(contenido, filename)` para generar Blob y disparar descarga en el browser.
  - Query `listLsdPresentaciones` para cargar historial.
  - `nroPresentacionSiguiente` calculado como `max(nroPresentacion) + 1` del historial (o `1` si no hay).

### 3.4 `src/components/sueldos/SueldosEmpleados.tsx`

- **Eliminado:** mutation `toggleActivo`, badge "Activo/Inactivo" con botón de toggle.
- **Agregado:** state `dialogBaja: { id, nombre } | null` + `fechaBajaInput: string`.
- **Nueva mutation `darDeBaja`:** llama `updateEmpleado` con `fechaBaja` (string ISO). Invalida `['import-empleados', clientId, profileId]`.
- **Nueva mutation `reactivar`:** llama `updateEmpleado` con `fechaBaja: null`. Invalida el mismo query key.
- **Columna estado:** badge único clickeable — "Activo" abre dialog, "Baja dd/mm/aaaa" reactiva directamente.
- **Dialog "Dar de baja":** date input pre-llenado con hoy, botón "Registrar baja" (destructivo), botón "Cancelar".

---

## 4) Checklist de cierre

- [x] Campo `nroPresentacion` en R01 con formato correcto (5 dígitos + `3` fijo + 7 dígitos empleados).
- [x] Historial de presentaciones LSD guardado en BD (`payroll_lsd_presentacion`).
- [x] Tabla `payroll_lsd_presentacion` creada en producción via SQL directo.
- [x] Presentaciones re-descargables desde el historial sin regenerar.
- [x] Número de presentación secuencial (Original = 1, Rectificativa = 2+).
- [x] Botón "Descargar conceptos LSD" genera archivo de 195 chars/línea.
- [x] Nombres con acentos normalizados a ASCII en `conceptosLSD.txt`.
- [x] Flags AFIP correctos por tipo de concepto (remunerativo / no rem / descuento).
- [x] Badge de baja unificado — un solo control por empleado.
- [x] Dialog de baja con fecha pre-llenada (hoy) y posibilidad de editar.
- [x] Click en badge "Baja" reactiva directamente (sin dialog).
- [x] `updateEmpleado` acepta `fechaBaja` nullable.
- [x] Invalidación de query `import-empleados` en `darDeBaja` y `reactivar`.

---

## 5) Trabajo adicional — Convenios CCT y empleados (2026-06-12)

### 5.1 Limpieza de convenios sin respaldo AFIP
- Eliminados convenios `payroll_convenio` sin respaldo en `afip_empleadores_convenio` para todas las empresas que liquidan sueldos.
- Se conservaron los `9999/99` (Excluido de Convenio) y el de Sanidad 459/06 (pendiente de re-scrapeo).
- Eliminados específicamente: Pahue Technologies SA — Comercio 130/75 y Gastronomía 389/04 (sin respaldo y sin empleados).
- NGVS: eliminado Gastronomía 389/04 (sobrante sin respaldo ni empleados). Conservado Comercio 130/75.

### 5.2 CCT 76/75 UOCRA — carga completa
- Creados convenios UOCRA para GMONTAJES SA y Deze Construcciones Srl (faltaban en sistema).
- Cargadas **categorías por zona** en los 5 convenios UOCRA (Brique, CONSTRUCTORA ARK-FA, Deze, GMONTAJES, GONZALEZ GUSTAVO RAMON):
  - 4 zonas: Zona A, Zona B, Zona C, Zona C Austral.
  - 5 categorías por zona: Oficial Especializado, Oficial, Medio Oficial, Ayudante, Sereno.
  - 6 períodos de escalas: Marzo–Agosto 2026.
  - Total: 100 categorías y 600 escalas por convenio.
- Script: `src/scripts/seed-uocra-escalas.ts`

### 5.3 NGVS — convenio UOCRA + asignación de empleados
- Creado convenio UOCRA 76/75 para NGVS (no figuraba en AFIP pero corresponde).
- Cargadas las mismas categorías/escalas por zona (20 categorías, 120 escalas).
- Script: `src/scripts/seed-ngvs-uocra.ts`
- Asignados 19 empleados de construcción a UOCRA Zona A según campo `categoria` (texto libre):
  - Ayudante (12), Medio Oficial (2), Oficial (3), Oficial Especializado (1).
- Asignados 2 empleados administrativos a Comercio 130/75:
  - Hernandez Gomez — Administrativo A (ya tenia asignacion).
  - Gramajo y Seybold — nueva categoria **Jefe** (monto a definir manualmente).

### 5.4 Bajas de empleados NGVS
- Dados de baja 4 empleados activos solicitados: Galvan, Lopez, Queirolo, Cano.
- Los 19 restantes de la lista ya estaban inactivos previamente.
- NGVS quedó con 23 empleados activos.

### 5.5 Pendientes UOCRA
- [ ] Definir monto de la categoría **Jefe** en Comercio NGVS (manualmente desde la UI).
- [ ] Asignar categorías a empleados de CONSTRUCTORA ARK-FA, Deze, GMONTAJES y GONZALEZ GUSTAVO RAMON cuando se incorporen empleados.
- [ ] Confirmar que NGVS figure correctamente con dos convenios (Comercio + UOCRA) en el scrapeo AFIP.
