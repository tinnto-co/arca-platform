# Actualizacion - 2026-06-26

## 1) Objetivo general del dia

Mejoras profundas en el módulo de sueldos: tabla de recibos enriquecida con columnas financieras y filtros avanzados (quincena, semestre, tipo); corrección de bugs en la edición de recibos (tabla vacía, recibo incorrecto cargado); refactor del motor de cálculo OS en `TablaReciboSos` para que la base de obra social siempre refleje jornada completa mediante subtotales paralelos; pre-cálculo automático de `rem4y8` y `rem9` sugeridos en la generación masiva de SAC; y pre-población de porcentajes de retención desde el último sueldo del semestre.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Columnas financieras en la tabla de recibos

- **Cambio:** La tabla de recibos en la solapa "Recibo" ahora muestra: Haberes, Descuentos, Retenciones, No Rem., Neto (sin redondear), Redondeado (ceiling del neto) y Rem + No Rem (haberes + noRemunerativo).
- **Motivo:** La tabla anterior solo mostraba empleado y período; el contador debía abrir cada recibo para verificar importes.
- **Impacto:** Verificación de liquidaciones de un vistazo sin necesidad de abrir cada recibo.
- **Archivos:** `src/components/sueldos/SueldosRecibo.tsx`

### 2.2 Filtros avanzados en la solapa Recibo

- **Cambio:** Se agregaron tres filtros adicionales:
  - **Período unificado**: select único con semestres (1er / 2do) y meses (01–12).
  - **Quincena**: Primera / Segunda quincena (filtro client-side).
  - **Tipo de recibo**: Sueldo, SAC, Vacaciones, Anticipo, Liquidación final, Comisiones, Fondo de desempleo, Varios (filtro client-side).
- **Motivo:** Los filtros anteriores no cubrían recibos quincenales, revisión semestral ni separación por tipo.
- **Impacto:** El listado se puede acotar con mayor precisión, combinando filtros libremente.
- **Archivos:** `src/components/sueldos/SueldosRecibo.tsx`, `src/actions/sueldos.ts`

### 2.3 Corrección: recibo incorrecto al editar

- **Cambio:** Al hacer clic en "Editar" desde la solapa Recibo, el simulador ahora carga exactamente el recibo seleccionado, no el último del empleado.
- **Motivo:** `getUltimoReciboImportado` siempre cargaba el recibo más reciente por fecha; al editar un recibo anterior se mostraban los conceptos del más nuevo.
- **Impacto:** La edición de cualquier recibo histórico es correcta.
- **Archivos:** `src/actions/sueldos.ts`, `src/components/sueldos/SueldosSimulador.tsx`

### 2.4 Corrección: tabla de conceptos vacía al reeditar el mismo recibo (primera capa)

- **Cambio:** Eliminada la guardia `lastInitialDataRef` con `JSON.stringify` que bloqueaba el re-inicio del simulador.
- **Motivo:** La guardia impedía que el efecto de inicialización se re-ejecutara cuando `sosEmpleadoId` había sido reseteado a `null` por `onFormSuccess`, dejando la query `ultimoRecibo` deshabilitada y la tabla vacía.
- **Impacto:** Primera corrección del flujo de edición. Cubrió la mayoría de los casos pero dejó un caso edge sin resolver (ver 2.8).
- **Archivos:** `src/components/sueldos/SueldosSimulador.tsx`

### 2.8 Corrección: tabla vacía al abrir el mismo recibo dos veces (segunda capa)

- **Cambio:** Se corrigió un bug de orden de efectos React que causaba que la tabla de conceptos apareciera vacía al abrir para editar un recibo que ya había sido editado antes en la misma sesión.
- **Motivo:** Radix UI `Presence` puede mantener el componente montado durante transiciones de tab. En ese escenario, si el mismo `reciboId` y el mismo `ultimoRecibo` (referencia de cache) se volvían a usar, el Effect 3 (que carga los códigos activos) no se disparaba porque sus deps no cambiaban. Adicionalmente, Effect 4 (declarado después de Effect 3) llamaba a `setActiveCodigos(new Set())`, sobreescribiendo cualquier valor que Effect 3 hubiera seteado antes — React aplica el último `setState` de un batch.
- **Solución:**
  1. Se agregó `initialData` como dependencia de Effect 3, forzando que se re-ejecute cada vez que el usuario abre un nuevo recibo para editar.
  2. Se eliminó `setActiveCodigos(new Set())` de Effect 4: ya no es necesario porque Effect 2 resetea a vacío cuando `copiarUltimoRecibo` cambia a `true`, y Effect 3 (declarado antes) luego carga los códigos correctos.
  3. Se corrigió el filtro de conceptos activos: las comparaciones `c.cantidad !== ''` pasaron a `c.cantidad !== null`, ya que Drizzle devuelve `null` para valores NULL del DB (nunca `''`).
- **Impacto:** El cuadro de conceptos ahora muestra siempre los valores guardados al hacer clic en "Editar", independientemente de cuántas veces se haya editado el recibo en la sesión.
- **Archivos:** `src/components/sueldos/SueldosSimulador.tsx`

### 2.5 Calculo OS correcto para empleados de jornada reducida

- **Cambio:** La base de obra social (conceptos 203, 204, 221, 222, 502, etc.) siempre se calcula sobre el básico de escala al 100%, independientemente del porcentaje real liquidado en concepto 1 o 411.
- **Motivo:** Para empleados part-time o jornada reducida, el concepto 1 se liquida al porcentaje de la jornada (ej. 50%), pero las contribuciones de OS deben calcularse sobre el 100% del básico de escala.
- **Impacto:** Las retenciones y contribuciones de OS quedan correctas para toda modalidad de jornada.
- **Archivos:** `src/components/sueldos/TablaReciboSos.tsx`

### 2.6 Pre-calculo de rem4y8 y rem9 sugeridos en generacion SAC

- **Cambio:** Al generar recibos SAC en la solapa Cargas, los campos `rem4y8` y `rem9` se pre-poblan automáticamente con valores sugeridos calculados en el servidor.
  - `rem9Sugerido` = haberes + noRemunerativo del recibo fuente.
  - `rem4y8Sugerido` = básico de escala vigente para empleados part-time; igual a rem9 para full-time.
- **Motivo:** El contador debía ingresar estos valores manualmente; con la escala disponible en el servidor pueden pre-calcularse.
- **Impacto:** La generación SAC requiere menos intervención manual y reduce errores de tipeo.
- **Archivos:** `src/components/sueldos/SueldosCargas.tsx`, `src/actions/sueldos.ts`

### 2.7 Pre-poblado de porcentajes de retencion en SAC

- **Cambio:** Al generar el SAC, el sistema carga automáticamente los porcentajes de retención (conceptos 201, 202, 203, 206, 207) desde el último recibo de sueldo del semestre vigente.
- **Motivo:** Cada empleado puede tener alícuotas individuales; copiarlas del sueldo previo evita errores y ahorra tiempo.
- **Impacto:** Los porcentajes de retención del SAC son correctos por defecto, sin necesidad de ingresarlos manualmente.
- **Archivos:** `src/actions/sueldos.ts`

---

## 3) Cambios tecnicos (implementacion)

### 3.1 Backend / motor

- **`getUltimoReciboImportado`**: Acepta parámetro opcional `liquidacionId: string (UUID)`. Cuando se provee, carga ese recibo específico en lugar del más reciente. Query condicional (ternario) con la misma estructura de JOINs y filtro de seguridad por `clientId`.
- **`listLiquidacionesByFiltros`**: Extendido para aceptar `ano` + `semestre` (filtro server-side via `inArray`). También devuelve `haberes`, `noRemunerativo`, `tipoJornada`, `categoriaId` por recibo para calcular los valores sugeridos de rem4y8/rem9.
- **Cálculo rem4y8/rem9 sugerido**: Para empleados part-time, se resuelve `getBasicoVigenteInternal` por categoría+período en paralelo (`Promise.all`). Los valores se inyectan como `rem4y8Sugerido` y `rem9Sugerido` en cada fila del resultado.
- **Pre-población de retenciones SAC**: Se determinan los meses del semestre actual, se busca el recibo de sueldo más reciente de cada empleado en ese rango, se leen sus conceptos 201/202/203/206/207 y se usan como porcentajes por defecto (fallback: 11/3/3/2/0.5).

### 3.2 Frontend / UI

- **`SueldosRecibo.tsx`**: Lista convertida de `<div>` a `<table>`. Estado `mes` reemplazado por `periodoSeleccion` unificado. Filtros `quincenaFiltro` y `tipoFiltro` client-side via `useMemo`. Select de Período incluye opciones de semestre al tope antes de los meses.
- **`SueldosSimulador.tsx`**:
  - Agregado `reciboId` al tipo de `initialData`. Nuevo estado `reciboIdToLoad`.
  - Al cambiar `initialData`, se setea `reciboIdToLoad = initialData.reciboId ?? null`.
  - La query de `getUltimoReciboImportado` incluye `liquidacionId: reciboIdToLoad` cuando está presente.
  - `basicoJornadaCompleta = basicoEscala` siempre (no condicional por `tipoJornada`).
  - Concepto 1 pre-rellena `porcentaje: '100'` y `cantidad: '30'` si no tienen valor.
  - Key del simulador incluye `ultimoRecibo.recibo.id` para forzar remount al cambiar de recibo.
  - Eliminados `useRef`, `lastInitialDataRef` y guardia `JSON.stringify`.
  - **Fix tabla vacía (segunda capa)**: `initialData` agregado como dep de Effect 3; eliminado `setActiveCodigos(new Set())` de Effect 4 (que sobreescribía el set de Effect 3 por orden de declaración); filtro de conceptos activos corregido a `!== null` en lugar de `!== ''`.
- **`SueldosCargas.tsx`**: Estado `rem4y8` y `rem9` inicializa con `rem4y8Override ?? rem4y8Sugerido ?? ''` y equivalente para rem9. Tipo de fila extendido con `rem4y8Sugerido` y `rem9Sugerido`.

### 3.3 Motor de calculo OS — TablaReciboSos.tsx

Refactor profundo de cómo se acumula la base de obra social:

- **Nuevo sub-base `os_norem_base`**: base OS para conceptos de no remunerativo (concepto 502), calculada como subtotal 411–469 con concepto 411 back-calculado al 100% de su porcentaje efectivo.
- **Subtotales paralelos OS**: `sub1_9_os`, `sub1_19_os`, `sub1_26_os`, `sub1_39_os`, `sub1_99_os`, `sub411_469_os`. Replican los subtotales reales pero con concepto 1 anclado a `osBase` (básico escala 100%) y el cascade de conceptos derivados reescalado en proporción.
- **Cascade correcto para antigüedad, presentismo, etc.**: conceptos que derivan del básico (baseColumna = 'sueldo') o de un sub-rango (baseColumna = 'sub1_9', etc.) acumulan su versión OS usando el subtotal paralelo correspondiente.
- **Prioridad de `ownImporte`**: Si un concepto tiene `tieneImporte` o `tieneImpConceptoNro` y el usuario completó el campo importe, ese valor tiene prioridad sobre el subtotal dinámico como base de cálculo.
- **Auto-cálculo al cargar basicoEscala**: efecto que dispara cuando `basicoEscala` llega por primera vez y rellena montos vacíos en conceptos con base implícita (recibos nuevos desde cero).

### 3.4 Datos / DB / scripts

- No hubo cambios de schema ni scripts de migración. Todos los campos usados (`haberes`, `descuentos`, `retenciones`, `noRemunerativo`, `neto`, `tipoJornada`, `categoriaId`) ya existían en la DB.

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados o actualizados

- `Actualizaciones/2026-06-26 actualizacion.md` — Este documento.
- `Documentacion Tecnica/IIBB - Liquidacion y Presentacion.md` — Nuevo documento de dominio: regímenes local vs. multilateral, proceso de liquidación (3 fases: liquidar → presentar DJ → pagar), organismos de presentación (ARBA/AGIP/DGR/API para local; SIFERE Web para multilateral), implicancias para el módulo IIBB.

---

## 4.2 Módulo IIBB — Nuevo route y server function

- **`src/routes/_authed/iibb/index.tsx`** — Nuevo módulo "IIBB / Convenio Multilateral" en la barra lateral. Dos solapas con layout idéntico: selector de empresa → selector de perfil (si hay más de uno) → mes/año → tabla de desglose por provincia (base imponible e IVA). Régiemen Local muestra empresas con `regimenLocal = true`; Convenio Multilateral muestra las que tienen `convenioMultilateral = true`. Reutiliza `getClientMultilateralSummary` de `src/actions/invoice.tsx`.
- **`src/actions/client.tsx`** — Nueva función `getRepresentativesForIIBB()`: filtra `representative` por `convenioMultilateral = true OR regimenLocal = true`, agrupa con sus `client` para el selector de perfil.
- **`src/components/app-sidebar.tsx`** — Nuevo ítem de navegación "IIBB" con ícono Globe, entre Sueldos y Vencimientos.

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Riesgos detectados

- El filtro de quincena depende del campo `quincena` en los recibos. Si un recibo fue importado sin ese campo, no aparecerá con ninguna de las opciones de quincena.
- El filtro de tipo trata `null` como `'sueldo'`; consistente con el resto del módulo pero conviene validarlo si se agregan nuevos tipos.
- La lógica de cascade OS de subtotales paralelos es compleja. Si se agregan nuevos rangos de conceptos en el futuro, verificar que acumulen en el subtotal OS correcto.

### 5.2 Pendiente inmediato (proximas sesiones)

- Verificar que los valores `haberes`, `descuentos`, etc. de recibos manuales nuevos (no importados) se calculen y persistan correctamente al guardar.
- Evaluar agregar fila de totales al pie de la tabla de recibos (suma de columnas para el filtro activo).
- Validar el cálculo OS en casos edge: empleado part-time con antigüedad, presentismo y plus de productividad en cascada.
- **IIBB — Paso 6 pendiente:** condicionar el tab "Convenio Multilateral" en la ficha del cliente según los flags (`client-detail-page.tsx`).
- **IIBB — 12 empresas pendientes:** asignar manualmente régimen a las 4 empresas de baja confianza y las 8 sin datos (ver `Regimen Fiscal Provincial - Convenio Multilateral y Regimen Local.md`).
- **IIBB — Liquidación efectiva:** calcular alícuotas por provincia, aplicar retenciones/percepciones, generar DJ, integrar con SIFERE (ver `IIBB - Liquidacion y Presentacion.md`).

---

## 6) Archivos principales involucrados

- `src/components/sueldos/SueldosRecibo.tsx`
- `src/components/sueldos/SueldosSimulador.tsx`
- `src/components/sueldos/TablaReciboSos.tsx`
- `src/components/sueldos/SueldosCargas.tsx`
- `src/actions/sueldos.ts`
- `src/routes/_authed/sueldos/index.tsx`
- `src/routes/_authed/iibb/index.tsx`
- `src/components/app-sidebar.tsx`
- `Actualizaciones/2026-06-26 actualizacion.md`
- `Documentacion Tecnica/IIBB - Liquidacion y Presentacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios tecnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
