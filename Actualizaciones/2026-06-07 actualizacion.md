# Actualizacion - 2026-06-07

## 1) Objetivo general del período (viernes 05 a hoy domingo 07)

Implementación completa del módulo de **Cargas Sociales — Generación del LSD**. El foco de estos tres días fue:
- Viernes 06-05: Reverse-engineering del Record 04 desde el archivo de referencia y la especificación oficial de AFIP.
- Sábado 06-06: Implementación del Record 04 en `generarArchivoLsd` con el layout exacto de 370 chars por línea.
- Domingo 06-07: Server functions de soporte (`validarLsd`, `getParametrosPeriodo`, `upsertParametrosPeriodo`) y documentación técnica completa.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Record 04 — Bases imponibles en el archivo LSD

- **Cambio:** El archivo LSD descargado desde la solapa "Cargas Sociales" ahora incluye el **Record 04** (bases imponibles) por cada empleado, además de los Records 01, 02 y 03 que ya existían.
- **Motivo:** El Record 04 es obligatorio en el archivo que se sube a AFIP. Sin él, el archivo es rechazado por el sistema de Simplificación Registral.
- **Qué contiene el Record 04:**
  - Header de 70 caracteres con datos del empleado: situación de revista, modalidad, condición, actividad, obra social, días trabajados, marcas de cónyuge/hijos/CCT/MiPyME.
  - Sección monetaria de 300 caracteres (20 bases imponibles × 15 chars): remuneración bruta, bases para jubilación, PAMI, OS, FNE/AAFF, ART, etc.
- **Cálculo de bases:**
  - `total_rem` = suma de conceptos SOS 001–399 con indicador C (remunerativos)
  - `total_nonrem` = suma de conceptos SOS 400–499 con indicador C (no remunerativos)
  - `remuneración bruta` = total_rem + total_nonrem
  - Bases con tope RIPTE: jubilación aporte (Base 1), OS aportes (Base 4), FNE/AAFF (Base 5)
  - Bases sin tope: jubilación contrib (Base 2), PAMI (Base 3), OS contrib (Base 8), ART (Base 9)
  - El tope se lee de `payroll_parametros_periodo` para el período. Si no está cargado, las bases se calculan sin techo.
- **Overrides disponibles en el recibo:** `rem4y8Override` (pisa la base de OS) y `rem9Override` (pisa la base de ART). También se usan `contribucionAdicionalOS`, `importeMaternidadArt13` e `importeADetraerLey27430`.
- **Archivos:** `src/actions/sueldos.ts`

### 2.2 Validación pre-descarga (`validarLsd`)

- **Cambio:** Nueva server function que verifica que el período está listo para generar el LSD. Devuelve una lista de errores y warnings con identificación por empleado.
- **Motivo:** Evitar que el contador descargue un archivo con datos faltantes que AFIP va a rechazar.
- **Errores bloqueantes:**
  - Empresa sin tipo de empleador configurado
  - Sin tope imponible cargado para el período
  - Sin recibos para el período
  - Empleado sin situación de revista en el recibo
  - Empleado sin modalidad de contratación
- **Warnings (no bloquean):**
  - Empleado sin obra social asignada
- **Estado:** Server function lista. La UI que la consume (panel de validación en la solapa Cargas Sociales) está pendiente.
- **Archivos:** `src/actions/sueldos.ts`

### 2.3 Gestión del tope imponible (`getParametrosPeriodo` / `upsertParametrosPeriodo`)

- **Cambio:** Dos nuevas server functions para leer y cargar el tope máximo imponible y el SMVM por período.
- **Motivo:** Cuando el cron automático falla (o el valor publicado por ANSES difiere del esperado), el contador necesita poder cargar el tope a mano. Hoy no había forma de hacerlo desde la app.
- **`getParametrosPeriodo`:** Devuelve la fila de `payroll_parametros_periodo` para el período, o `null` si no existe. Incluye si fue cargado por el cron o manualmente.
- **`upsertParametrosPeriodo`:** Crea o reemplaza los parámetros del período. Acepta `topeMaximoImponible` (obligatorio), `salarioMinimo` y `fuente` (opcionales). Siempre marca `actualizadoPorCron = false`.
- **Archivos:** `src/actions/sueldos.ts`

### 2.4 Widget de tope imponible en la UI

- **Cambio:** La solapa "Cargas Sociales" ahora muestra el tope imponible del período seleccionado. Si está cargado: muestra el valor formateado con opción "Editar". Si falta: muestra una alerta amarilla con formulario inline para ingresarlo.
- **Motivo:** Sin esta pantalla, el tope solo se podía cargar vía el cron automático. Si fallaba, no había forma de corregirlo.
- **Detalle UX:** Acepta entrada numérica (Enter confirma). Al guardar, invalida el cache de `lsd-validacion` para que el panel de errores se actualice inmediatamente. Distingue si el tope fue cargado automáticamente o manualmente.
- **Archivos:** `src/components/sueldos/SueldosCargas.tsx`

### 2.5 Panel de validación pre-descarga

- **Cambio:** Nuevo panel en la solapa "Cargas Sociales" que muestra todos los errores y warnings antes del botón de descarga.
- **Motivo:** Evitar que el contador genere un LSD con datos faltantes que AFIP rechazará.
- **Comportamiento:**
  - Se actualiza automáticamente al cambiar el período o al guardar el tope.
  - Los errores bloqueantes deshabilitan el botón "Descargar LSD" y lo reemplazan por un botón gris con mensaje explicativo.
  - Las filas de empleados con errores se destacan con fondo rojo en la tabla.
  - Los warnings se muestran pero no bloquean la descarga.
- **Archivos:** `src/components/sueldos/SueldosCargas.tsx`

---

## 3) Cambios técnicos (implementación)

### 3.1 Backend (`src/actions/sueldos.ts`)

- Función `generarArchivoLsd` extendida para generar Record 04. Ahora hace JOIN con 3 aliases de `payroll_situacion` (sit1/sit2/sit3), más `payroll_condicion`, `payroll_actividad`, `payroll_modalidad_contratacion`, `payroll_siniestrado`, `payroll_localidad` y `obra_social`. También consulta `payroll_parametros_periodo` para el tope.
- Nuevas funciones auxiliares privadas: `montoCentavos()` y `lsdMoney()` para el cálculo de campos monetarios.
- Nueva server function `validarLsd`: 3 queries independientes (empleador, tope, recibos) + loop de validación por empleado.
- Nueva server function `getParametrosPeriodo`: query simple a `payroll_parametros_periodo`.
- Nueva server function `upsertParametrosPeriodo`: insert con `onConflictDoUpdate` sobre la PK `periodo`.
- Se agregaron los imports de `payrollParametrosPeriodo`, `payrollLocalidad` y `aliasedTable` (drizzle-orm).

### 3.2 Frontend / UI (`src/components/sueldos/SueldosCargas.tsx`)

- Nuevo sub-componente `TopeImponibleWidget`: usa `useQuery` sobre `getParametrosPeriodo` y `useMutation` sobre `upsertParametrosPeriodo`. Estado local `editando` + `topeInput`. Al guardar hace `queryClient.invalidateQueries` de `lsd-validacion` para forzar revalidación inmediata.
- Nuevo sub-componente `ValidacionPanel`: usa `useQuery` sobre `validarLsd`. Renderiza condicionalmente solo si hay issues. Header con badge de cantidad de errores/warnings. Cada issue en un `IssueRow` con ícono rojo (error) o amarillo (warning) y nombre del empleado si aplica.
- `SueldosCargas` principal: agrega `useQuery` de `validarLsd`. El botón de descarga evalúa `validacion?.puedeDescargar !== false` para decidir si se muestra habilitado o reemplazado por botón deshabilitado con mensaje. Las filas de la tabla marcan con `bg-red-50/50` si el CUIL tiene algún error en `validacion.issues`.
- Nuevos imports: `useQueryClient`, `Input`, `Pencil`, `ShieldAlert`, `TrendingUp`, `validarLsd`, `getParametrosPeriodo`, `upsertParametrosPeriodo`.

### 3.3 Datos / DB

- No se requirieron migraciones nuevas. Las tablas `payroll_parametros_periodo` y `payroll_localidad` ya estaban en el schema.

---

## 4) Documentación y trazabilidad

### 4.1 Documentos creados o actualizados

- `Documentacion Tecnica/Cargas Sociales - LSD.md` — Actualizado con:
  - Record 04 movido a "Implementado" con layout completo (header campo por campo + tabla de las 20 bases monetarias)
  - Sección de pendientes reorganizada en Alta / Media / Baja prioridad con descripción en lenguaje simple
  - Notas técnicas de `validarLsd` y las server functions de parámetros de período
- `Actualizaciones/2026-06-07 actualizacion.md` — Este documento

---

## 5) Riesgos, observaciones y pendientes

### 2.6 Fix: situación de revista en recibos importados (SOS)

- **Bug:** `validarLsd` marcaba error `SIN_SITUACION_REVISTA` en todos los empleados de E-presis, aunque todos tienen situación de revista correctamente configurada.
- **Causa raíz:** Para los recibos importados desde SOS, la situación de revista vive en el **empleado** (`liquidacionImportEmpleado.situacionId`), no en el recibo (`liquidacionImportRecibo.situacionRevista1Id`). La validación solo chequeaba el campo del recibo. Además, `generarArchivoLsd` tampoco usaba el fallback al empleado al armar el Record 04, por lo que el campo `sit_revista_general` quedaba `'00'` (inválido) en lugar de tomar el código del empleado.
- **Fix aplicado en dos lugares:**
  1. `validarLsd`: ahora selecciona también `empleado.situacionId` y solo dispara el error si **ambos** son null (recibo y empleado).
  2. `generarArchivoLsd`: el join de `sit1Alias` usa `COALESCE(recibo.situacionRevista1Id, empleado.situacionId)`, igual que `previewLsd` — así el Record 04 resuelve la situación correctamente para recibos importados.
- **Archivos:** `src/actions/sueldos.ts`

---

### 5.1 Riesgos detectados

- **Record 04 sin verificación cruzada**: El layout fue validado contra la especificación oficial de AFIP (`LSDiseInterfazLiquidacion.pdf`) y contra un archivo de referencia real (`30-71755486-4_2026-5_0__LSD.txt`). Sin embargo, no se compararon los 9 registros generados por el nuevo código contra el archivo de referencia de forma programática. Conviene hacer esa comparación antes de usar el LSD en producción.
- **Tope no cargado = bases incorrectas**: Hasta que no exista la UI para cargar el tope, el contador puede descargar el LSD con el Record 04 incompleto sin darse cuenta. La server function `validarLsd` ya devuelve el error `SIN_TOPE_IMPONIBLE`, pero falta mostrarlo en la UI.

### 5.2 Pendiente inmediato (próximos pasos)

1. **Verificación del Record 04 generado** — Comparar el output de `generarArchivoLsd` contra el archivo de referencia real para confirmar que los valores de las bases coinciden empleado por empleado.
2. **Situación de revista null** — Flujo en la UI para completar la situación de revista en empleados importados que la tienen vacía (inline edit en la tabla de Cargas Sociales o link al legajo).
3. **Soporte para SMVM y fuente en el widget** — El widget del tope actualmente solo guarda `topeMaximoImponible`. Se podría extender para que el contador también ingrese el SMVM y la fuente (ej: URL de resolución ANSES).

---

## 6) Archivos principales involucrados

- `src/actions/sueldos.ts` — `generarArchivoLsd` (Record 04), `validarLsd`, `getParametrosPeriodo`, `upsertParametrosPeriodo`
- `src/components/sueldos/SueldosCargas.tsx` — `TopeImponibleWidget`, `ValidacionPanel`, botón de descarga condicional, filas con error marcadas
- `drizzle/schema.ts` — `payrollParametrosPeriodo`, `payrollLocalidad` (ya existían, ahora usados en el generador)
- `Documentacion Tecnica/Cargas Sociales - LSD.md`
- `Actualizaciones/2026-06-07 actualizacion.md`

---

## 7) Checklist de cierre

- [x] Cambios funcionales documentados.
- [x] Cambios técnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del día guardado con fecha correcta.
- [x] UI del tope imponible implementada.
- [x] Panel de validación pre-descarga implementado.
- [ ] Verificación cruzada del Record 04 contra archivo de referencia (pendiente).
