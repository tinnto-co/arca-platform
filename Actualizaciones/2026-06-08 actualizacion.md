# Actualizacion - 2026-06-08

## 1) Objetivo general del dia

Continuación del módulo de Cargas Sociales. El foco fue:
- Investigar la automatización del tope máximo imponible (descubrimiento: ANSES usa Incapsula WAF)
- Analizar si el ARCA Scrapper puede adaptarse para ANSES (conclusión: es un servicio externo separado, no accesible desde este repo)
- Cargar los topes de todos los meses de 2026 mediante un script hardcodeado con valores oficiales
- Corregir el bug de situación de revista en recibos importados desde SOS

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Carga de topes 2026 (hardcoded) ✅ EJECUTADO

- **Cambio:** Nuevo script `src/scripts/seed-topes-2026.ts` con los valores oficiales de los 6 meses de 2026 hardcodeados. Ejecutado exitosamente — los 6 períodos están cargados en `payroll_parametros_periodo`.
- **Motivo:** El cron automático (día 20) y el script original (`seed-topes-historicos.ts`) intentan scrapear la página de ANSES, pero está protegida por **Incapsula WAF** y retorna solo 212 bytes de challenge HTML, sin datos útiles. El ARCA Scrapper (que bypasea AFIP) es un servicio externo separado y no es adaptable desde este repo sin modificar ese servicio.
- **Solución:** Hardcodear los valores desde fuentes especializadas (ignacioonline.com.ar, siap.blogdelcontador.com.ar) que reproducen los datos oficiales de las resoluciones ANSES. Es más confiable que scraping para datos que solo cambian 1 vez por mes.
- **Valores cargados:**

  | Período | Tope | Resolución |
  |---------|------|-----------|
  | 2026-01 | $3.823.373 | Res. 381/2025 |
  | 2026-02 | $3.932.339 | BO 06-02-2026 |
  | 2026-03 | $4.045.590 | BO mar-2026 |
  | 2026-04 | $4.162.913 | BO abr-2026 |
  | 2026-05 | $4.303.619 | Res. 110/2026 |
  | 2026-06 | $4.414.652 | Res. 139/2026 |

- **Para meses futuros:** Agregar la entrada al array `TOPES_2026` en el script y re-ejecutar. O usar el widget manual en la solapa Cargas Sociales.
- **Archivos:** `src/scripts/seed-topes-2026.ts` (nuevo), `src/scripts/seed-topes-historicos.ts` (conservado como referencia)

### 2.2 Fix: situación de revista en recibos importados de SOS (completado ayer, documentado hoy)

- **Contexto:** Al probar la solapa Cargas Sociales en E-presis, todos los empleados aparecían con error "Sin situación de revista" aunque la tienen cargada.
- **Causa:** Para recibos importados desde SOS Contador, la situación de revista vive en el **empleado** (`liquidacionImportEmpleado.situacionId`), no en el recibo (`liquidacionImportRecibo.situacionRevista1Id`). Las funciones `validarLsd` y `generarArchivoLsd` solo miraban el campo del recibo.
- **Fix:**
  - `validarLsd`: ahora selecciona `empleado.situacionId` como campo adicional y solo dispara el error si **ambos** son null.
  - `generarArchivoLsd`: el join de `sit1Alias` usa `COALESCE(recibo.situacionRevista1Id, empleado.situacionId)`, igual que `previewLsd`.
- **Archivos:** `src/actions/sueldos.ts`

---

## 3) Cambios técnicos (implementación)

### 3.1 Script `seed-topes-2026.ts`

- Array `TOPES_2026` con 6 entradas: `{ periodo: 'YYYY-MM', tope: number }`.
- Upsert con `onConflictDoUpdate` — idempotente, pisando `topeMaximoImponible` y `fuente` en caso de conflicto.
- Marca `actualizadoPorCron = false`.
- Comentarios de resolución ANSES en cada entrada para trazabilidad.
- Exit code 0 si todo OK, 1 si hubo algún error.

### 3.2 Cron: migración a ignacioonline.com.ar

- El ARCA Scrapper es un servicio externo separado — no adaptable desde este repo para ANSES.
- **Solución adoptada:** migrar el cron a `ignacioonline.com.ar`, sitio especializado que publica los topes de cada mes basándose en las resoluciones oficiales de ANSES. No usa WAF — accesible con fetch simple.
- **Cambios en `payroll-cron.ts`:**
  - Nueva constante `IGNACIOONLINE_BASE` en lugar de la URL de ANSES.
  - Nuevo array `MESES_ES` y mapa `MESES_TYPOS` (ej: "febrero" → "febero" en el sitio).
  - Nueva función `buildTopeUrls(year, month)`: genera candidatos con/sin sufijo `-actualizacion`.
  - Nueva función `fetchTopePageText(year, month)`: prueba cada candidato hasta obtener 200 con >500 chars.
  - `syncTopeImponible()` usa `fetchTopePageText` en lugar de `fetchPageText(URL_fija)`.
- **Modelos Gemini actualizados:** `gemini-1.5-flash` → `gemini-2.5-flash` en `payroll-cron.ts` y `seed-topes-historicos.ts` (el modelo anterior fue deprecado).
- **Resultado del test:** Junio 2026 → $4.414.652 extraído y guardado correctamente desde `junio-2026-...-actualizacion/`.

### 3.2 `src/actions/sueldos.ts`

- `validarLsd`: agrega `situacionIdEmpleado: liquidacionImportEmpleado.situacionId` al select. La condición del error `SIN_SITUACION_REVISTA` cambia de `!row.situacionRevista1Id` a `!row.situacionRevista1Id && !row.situacionIdEmpleado`.
- `generarArchivoLsd`: el leftJoin de `sit1Alias` pasa de `eq(liquidacionImportRecibo.situacionRevista1Id, sit1Alias.id)` a `sql\`${sit1Alias.id} = COALESCE(...)\``.

---

## 4) Documentación y trazabilidad

### 4.1 Documentos creados o actualizados

- `Documentacion Tecnica/Cargas Sociales - LSD.md` — Sección del cron actualizada con fuente ignacioonline.com.ar, lógica de URLs candidatas y typo "febero". Script de backfill documentado con tabla de valores. Pendientes reorganizados en Alta/Media/Baja prioridad.
- `Actualizaciones/2026-06-08 actualizacion.md` — Este documento.

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Observaciones

- La página de ANSES muestra historial de los últimos 12 meses aproximadamente. Para períodos más antiguos (si se necesita generar LSD de hace más de un año), habría que cargar el tope manualmente desde el widget en la solapa Cargas Sociales.
- El script puede correrse varias veces sin problema — el upsert es idempotente.
- La distinción `actualizadoPorCron` permite saber en la UI si el valor fue subido automáticamente o de otra forma (útil para auditoría).

### 5.2 Pendiente inmediato

1. **~~Correr el script de backfill~~** — ✅ Completado: `seed-topes-2026.ts` ejecutado, 6 períodos cargados.
2. **Script de comparación del LSD generado vs referencia** — Verificar que el Record 04 generado para E-presis Mayo 2026 coincide con el archivo `30-71755486-4_2026-5_0__LSD.txt`.
3. **Probar la solapa Cargas Sociales en el browser** — Con los topes cargados, verificar que el panel de validación no muestra errores para E-presis Mayo 2026 y que el LSD se descarga correctamente.
4. **Meses futuros (julio 2026 en adelante):** cuando ANSES publique el tope, agregar al script y re-ejecutar, o ingresarlo desde el widget manual.

---

## 6) Archivos principales involucrados

- `src/lib/payroll-cron.ts` — Migración a ignacioonline.com.ar, modelo gemini-2.5-flash
- `src/scripts/seed-topes-2026.ts` — Script de backfill 2026 hardcodeado (nuevo, ejecutado)
- `src/scripts/seed-topes-historicos.ts` — Modelo gemini-2.5-flash (conservado como referencia)
- `src/actions/sueldos.ts` — Fix COALESCE situación de revista (`validarLsd` + `generarArchivoLsd`)
- `Documentacion Tecnica/Cargas Sociales - LSD.md`
- `Actualizaciones/2026-06-08 actualizacion.md`

---

## 7) Checklist de cierre

- [x] Cambios funcionales documentados.
- [x] Cambios técnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del día guardado con fecha correcta.
- [x] Script de backfill ejecutado — 6 períodos 2026 cargados en `payroll_parametros_periodo`.
- [x] Cron migrado a ignacioonline.com.ar — testeado y funcionando (extrae $4.414.652 para junio 2026).
- [x] Modelo Gemini actualizado a `gemini-2.5-flash` en todos los archivos.
- [ ] Verificación del Record 04 contra archivo de referencia (pendiente).
- [ ] Prueba en browser de la solapa Cargas Sociales con datos completos (pendiente).
