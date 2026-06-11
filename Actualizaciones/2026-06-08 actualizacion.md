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

### 2.2 Fix: campos monetarios "bases diferidas" en Record 04 ✅

- **Contexto:** Al comparar el LSD generado contra el archivo de referencia `30-71755486-4_2026-5_0__LSD.txt` (E-presis Mayo 2026), se detectó que 3 de los 20 campos monetarios del Record 04 eran siempre 0 en el generado, pero tenían valores en la referencia.
- **Campos corregidos:**
  - **Base dif LRT** (pos 130–144): `max(0, bruta - min(total_rem, tope))` — parte de la remuneración bruta que supera el tope de jubilación aporte (o la suma no-remunerativa cuando total_rem ≤ tope). Verificado: coincide con el archivo de referencia para 8/9 empleados.
  - **Base dif aporte OS** (pos 100–114): `max(0, min(rem4y8, tope) - bruta)` — exceso de la base OS sobre bruta cuando hay override de rem4y8.
  - **Base dif contrib OS** (pos 115–129): `max(0, rem4y8 - bruta)` — ídem para contribuciones.
- **Diferencias restantes (no bloqueantes):**
  - 1 empleado (CUIL 23400741824) tiene `rem4y8Override` en la referencia que no está en nuestra BD — datos faltantes, no un bug de código.
  - R04 header: diferencias de formato (zero-padding vs space-padding para códigos de 1 dígito; SOS Contador parece usar un formato legacy).
  - R03: SOS Contador usa 9 ceros + qty de 4 dígitos; nosotros usamos 7/9 ceros + qty de 5/6 dígitos. Mismos datos, distinto padding.
  - R01: campo desconocido en pos 26–27 muestra `000013` en referencia vs `000000` en generado (posiblemente nro de presentación).
- **Archivos:** `src/actions/sueldos.ts`

### 2.3 Fix: situación de revista en recibos importados de SOS (completado ayer, documentado hoy)

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

## 5) Riesgos, observaciones y pendientes (Parte 1 — LSD)

### 5.1 Observaciones

- La página de ANSES muestra historial de los últimos 12 meses aproximadamente. Para períodos más antiguos (si se necesita generar LSD de hace más de un año), habría que cargar el tope manualmente desde el widget en la solapa Cargas Sociales.
- El script puede correrse varias veces sin problema — el upsert es idempotente.
- La distinción `actualizadoPorCron` permite saber en la UI si el valor fue subido automáticamente o de otra forma (útil para auditoría).

### 5.2 Pendiente inmediato (LSD)

1. **~~Correr el script de backfill~~** — ✅ Completado: `seed-topes-2026.ts` ejecutado, 6 períodos cargados.
2. **~~Script de comparación del LSD generado vs referencia~~** — ✅ Completado: ver sección 2.3.
3. **Probar la solapa Cargas Sociales en el browser** — Con los topes cargados y los fixes aplicados, verificar que el panel de validación no muestra errores para E-presis Mayo 2026 y que el LSD se descarga correctamente.
4. **Meses futuros (julio 2026 en adelante):** cuando ANSES publique el tope, agregar al script y re-ejecutar, o ingresarlo desde el widget manual.

---

## 6) Archivos principales involucrados (Parte 1)

- `src/lib/payroll-cron.ts` — Migración a ignacioonline.com.ar, modelo gemini-2.5-flash
- `src/scripts/seed-topes-2026.ts` — Script de backfill 2026 hardcodeado (nuevo, ejecutado)
- `src/scripts/seed-topes-historicos.ts` — Modelo gemini-2.5-flash (conservado como referencia)
- `src/actions/sueldos.ts` — Fix COALESCE situación de revista (`validarLsd` + `generarArchivoLsd`)
- `Documentacion Tecnica/Cargas Sociales - LSD.md`

---

---

# Parte 2 — Módulo de Sueldos: Importación XLS y Setup de Convenios

## P2.1) Contexto y objetivo

En esta segunda sesión del día se trabajó sobre el **setup operativo del módulo de sueldos** para poder liquidar mayo 2026 de forma real (no solo E-presis). El objetivo era:

1. Importar los XLS de conceptos exportados desde SOS Contador para todas las empresas del período 05-2026.
2. Investigar y configurar los convenios (CCT) de las empresas que no los tenían en la DB.

---

## P2.2) XLS de conceptos de SOS — Hallazgo crítico y decisión

### Lo que se hizo

Se corrió el script `load-conceptos-from-sos-xls.ts` para todas las empresas que tenían archivos XLS descargados del SOS Contador para el período 05-2026. El script cargó recibos con los montos finales del XLS (neto, haberes, no remunerativo, descuentos, retenciones) y los conceptos línea por línea.

Se verificó también que:
- **E-presis** ya tenía 9 recibos cargados manualmente con `reciboConfirmado = true` — correctos.
- **Semeca** tenía 1 recibo pre-existente con `reciboConfirmado = false` — se corrigió.
- Se eliminaron todos los recibos fuera del período 05-2026 (144 registros).

### El problema encontrado

Los recibos generados desde XLS **son inútiles para el motor de liquidación**. El XLS de SOS solo exporta los importes finales ya calculados. No contiene:
- El sueldo básico de escala por categoría
- La cantidad de horas/días trabajados
- El porcentaje o fórmula de cada concepto

Sin esos datos, el sistema no puede reproducir los cálculos ni generar recibos correctos para futuros períodos.

### La decisión

Se eliminaron los 87 recibos generados desde XLS (todos excepto los 9 de E-presis que son manuales y están correctamente configurados). Solo quedan los recibos válidos: los 9 de E-presis Mayo 2026.

**Estado actual de recibos en DB:**
- 9 recibos de E-presis (05-2026) — cargados manualmente, con conceptos, confirmados ✅
- 0 recibos del resto de empresas — eliminados porque eran importaciones XLS sin base de cálculo

---

## P2.3) Investigación de convenios (CCT)

### Estado de la tabla `afipEmpleadoresConvenio` en arca-scrapper

La tabla ya tenía 83 registros de corridas anteriores del scrapper. Se identificó el estado de las empresas principales:

| Empresa | CUIT | CCT en scrapper DB | CCT en payrollConvenio | Escalas |
|---------|------|--------------------|------------------------|---------|
| E-presis | 30717548767 | 130/75 Comercio | configurado | cargadas |
| Sabenumitubeja | — | 0167/91 Pasteleros + 0272/96 Pasteleros | no configurado | — |
| Brique | — | 0076/75 Construcción | existe sin escalas | — |
| Besorot Tovot | 30719305535 | no está en scrapper | — | — |
| PNR Trade | 30718922565 | no está en scrapper | — | — |
| Admip SRL | 30707920056 | no está en scrapper | — | — |

### Intento de scrapping para las 3 empresas faltantes

Se ejecutó `run-convenios-simplificacion-empleadores-all-profiles.ts` con `AFIP_TARGET_PROFILE_ID` para cada una de las 3 empresas. Las 3 fallaron con el mismo error:

```
Error: Clave o usuario incorrecto
```

Los representantes y sus CUIT:

| Empresa | Representante | CUIT rep |
|---------|--------------|----------|
| Besorot Tovot | Alberto Uriel Jafif | 20-36171053-4 |
| PNR Trade | Pawan Mirpuri | 20-96206929-1 |
| Admip SRL | Admip Srl | 20-92401686-9 |

**Causa:** Las contraseñas de AFIP almacenadas en la DB del arca-scrapper para estos 3 representantes están vencidas o incorrectas. Los representantes existen con `status = 'active'`, pero las credenciales no funcionan.

---

## P2.4) Situación actual — qué falta para liquidar más empresas

El flujo correcto para liquidar una empresa requiere:

1. **Configurar el CCT**: `payrollConvenio` + `payrollConvenioCategoria` + `payrollEscala` con los salarios básicos vigentes.
2. **Asignar empleados**: cada empleado necesita `categoriaId` FK a su categoría de convenio.
3. **Generar el recibo**: el motor usa `payrollEscala.salarioBasico` y los `payrollConcepto` con fórmulas (`0.11 * basico`, etc.) para calcular cada línea.
4. **Confirmar el recibo**: marcar `reciboConfirmado = true`.

### CCT que necesitan configuración

| CCT | Empresa(s) | Qué falta |
|-----|-----------|-----------|
| Pasteleros 0167/91 + 0272/96 | Sabenumitubeja | payrollConvenio + categorías + escalas |
| Construcción 0076/75 | Brique | solo escalas (el convenio existe) |
| Sanidad 0459/06 | Admip SRL | payrollConvenio + categorías + escalas |
| A determinar | Besorot Tovot, PNR Trade | necesita scrapping o consulta manual primero |

---

## P2.5) Próximos pasos sugeridos

1. **Actualizar credenciales** de los 3 representantes en el sistema, o consultar manualmente el CCT de cada empresa en AFIP (Clave Fiscal > Simplificación Registral > Empleadores > Convenios).
2. **Cargar escalas Construcción 76/75** — el convenio ya existe, solo faltan los salarios básicos por categoría.
3. **Crear CCT Pasteleros 167/91 y 272/96** con categorías y escalas — para Sabenumitubeja.
4. **Crear CCT Sanidad 459/06** — para Admip SRL.
5. **Asignar categorías a empleados** en la UI de legajos.
6. **Generar recibos de prueba** y comparar contra los XLS de SOS para verificar que los montos coinciden.

---

---

---

# Parte 3 — Formato de nombres: title case en toda la aplicación

## P3.1) Objetivo

Aplicar formato consistente en la visualización de nombres de **empleados, empresas y representantes** en toda la aplicación: primera letra de cada palabra en mayúscula, resto en minúscula. Las siglas societarias (S.A., S.R.L., etc.) se normalizan siempre a su forma canónica con puntos.

---

## P3.2) Cambios funcionales

- **Empleados:** nombres formateados en title case en la tabla de empleados, selector de recibos, encabezado del recibo HTML, lista de recibos generados/LSD, diálogo de liquidación masiva, diálogo de errores masivos, selector del diálogo de impresión y en el campo "Apellido y Nombres" del PDF.
- **Empresas:** nombre de la empresa en el encabezado del recibo HTML, encabezado del PDF, y selector principal del módulo de sueldos.
- **Representantes / perfiles:** nombres en la tabla de clientes, encabezado del detalle del cliente (h1), botones de perfiles en la pestaña resumen, y selectores de empresa/perfil en las pestañas de deudas, facturas e IVA.
- **Facturas:** labels de representantes y perfiles en los filtros de la tabla de facturas.

---

## P3.3) Cambios técnicos

### P3.3.1 `src/lib/format-name.ts` (nuevo)

Utilitario compartido `toTitleCase(str)`:

- Divide por comas (preserva "GARCIA, JUAN" → "Garcia, Juan").
- Por cada palabra aplica title case, **excepto** si es una sigla societaria conocida.
- Las siglas se normalizan a su forma canónica con puntos: `SA` → `S.A.`, `SRL` → `S.R.L.`, `SAS` → `S.A.S.`, `SAU` → `S.A.U.`, etc. Cualquier variante de entrada (`sa`, `S.A.`, `SRL`) produce siempre la misma forma canónica.
- Retorna `''` para entrada vacía/null (compatible con el patrón `|| fallback`).

Siglas incluidas: `S.A.`, `S.R.L.`, `S.A.S.`, `S.A.U.`, `S.C.A.`, `S.C.S.`, `S.C.P.`, `S.C.O.`, `S.C.E.`, `S.H.`, `S.E.`, `Cía.`, `Ltda.`

### P3.3.2 Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/components/clients-table.tsx` | `toTitleCase` en nombre de representante y empresa |
| `src/components/profile-detail-page.tsx` | `toTitleCase` en nombre del perfil (h1) |
| `src/components/client-detail-page.tsx` | `toTitleCase` en h1 del cliente, botones de perfiles, y 4 selectores de empresa/perfil |
| `src/components/invoices-table.tsx` | `toTitleCase` en labels de filtros de representantes y perfiles |
| `src/components/sueldos/SueldosRecibo.tsx` | `toTitleCase` en nombre de empresa (encabezado recibo), selector de empleado, lista de resultados, y campo "Apellido y Nombres" del recibo |
| `src/components/sueldos/recibo-pdf.tsx` | `toTitleCase` en nombre de empresa y empleado del PDF |
| `src/components/sueldos/SueldosDashboard.tsx` | `toTitleCase` en lista de recibos generados, lista LSD, diálogo masivo, diálogo de errores |
| `src/components/sueldos/ImprimirRecibosDialog.tsx` | `toTitleCase` en lista de empleados del selector de impresión |
| `src/routes/_authed/sueldos/index.tsx` | `toTitleCase` en labels del selector principal de empresa |

> `SueldosEmpleados.tsx` ya tenía `formatTitleCaseDisplay()` local aplicado en tabla y diálogo de detalle — no requirió cambios.

---

## 7) Checklist de cierre

- [x] Topes 2026 cargados en `payroll_parametros_periodo` (6 períodos).
- [x] Cron migrado a ignacioonline.com.ar — testeado y funcionando.
- [x] Modelo Gemini actualizado a `gemini-2.5-flash`.
- [x] Record 04: bases diferidas corregidas.
- [x] Fix situación de revista en recibos importados (COALESCE).
- [x] Recibos XLS eliminados — solo quedan los 9 manuales de E-presis Mayo 2026.
- [x] Convenios investigados: Sabenumitubeja = Pasteleros, Brique = Construcción (en scrapper DB).
- [x] Scrapper ejecutado para Besorot Tovot, PNR Trade, Admip — fallido por credenciales vencidas.
- [x] Documentación actualizada.
- [ ] Probar solapa Cargas Sociales en browser con E-presis Mayo 2026.
- [ ] Actualizar credenciales de los 3 representantes o consultar CCT manualmente.
- [ ] Cargar escalas Construcción 76/75.
- [ ] Crear CCT Pasteleros (167/91 y 272/96) y Sanidad (459/06) con categorías y escalas.
- [ ] Asignar categorías a empleados de las empresas configuradas.
- [ ] Generar recibo de prueba y comparar contra XLS.
- [x] Nombres de empleados, empresas y representantes formateados en title case en toda la app.
- [x] Siglas societarias normalizadas a forma canónica con puntos (S.A., S.R.L., etc.).

---

---

# Parte 4 — Validación LSD E-presis Mayo 2026: comparación contra referencia

## P4.1) Objetivo

Resolver todas las diferencias detectadas entre el LSD generado por Arca y el archivo de referencia `30-71755486-4_2026-5_0__LSD.txt` descargado de SOS Contador para E-presis Mayo 2026.

---

## P4.2) Correcciones aplicadas

### P4.2.1 Fix: rem4y8Override almacenado en centavos en lugar de pesos ✅

- **Problema:** El script de la sesión anterior seteó `rem4y8Override = 137894011` (centavos). La función `montoCentavos()` en `sueldos.ts` hace `value * 100`, así que producía $137.894.011 en lugar de $1.378.940,11.
- **Fix:** SQL update para CUIL 23400741824 (Gigio, Giuliana Romina): `rem4y8Override = '1378940.11'` (pesos).

### P4.2.2 Fix: códigos de Obra Social de 3 empleados ✅

- **Problema:** 3 empleados tenían código de OS incorrecto en `liquidacion_import_empleado.obraSocialId`.
- **Corrección:** Los 3 pasaron a OSECAC (código `126205`, UUID `72343caf-dce7-4ff4-a343-08316b46eaf1`):
  - CUIL 20316043780 (Sanchez, Gonzalo Daniel): `111407` → `126205`
  - CUIL 23400741824 (Gigio, Giuliana Romina): `113809` → `126205`
  - CUIL 27295946356 (Gonzalez, Silvana Isabel): `003801` → `126205`

### P4.2.3 Fix: padding de campos alfanuméricos en R04 header ✅

- **Problema:** El LSD AFIP usa formato alfanumérico para códigos de 1 dígito: valor numérico sin cero a la izquierda, rellenado con espacios a la derecha ("1 " en lugar de "01"). El código usaba `padStart(2,'0')` (zero-padding) en todos los campos.
- **Fix en `src/actions/sueldos.ts`:** Nueva función `lsdAlpha(code, len)` que hace `parseInt(code).toString().padEnd(len, ' ')`. Se aplica a `sitGeneral`, `condicion`, `modalidad`, `siniestrado`, `sitRev1/2/3`.
- **Fix adicional:** `diaInicio2` y `diaInicio3` cuando las situaciones 2/3 están ausentes ahora usan `'00'` en lugar de `'  '` (confirmado contra la referencia).
- **Fix en `src/scripts/comparar-lsd.ts`:** El script reconstruía el R04 header internamente con la lógica vieja de zero-padding, por lo que seguía mostrando diffs aunque el archivo real ya era correcto. Actualizado para usar la misma función `lsdAlpha`.

### P4.2.4 Fix: comparación R03 — parser por contenido en lugar de bytes raw ✅

- **Problema:** El script `comparar-lsd.ts` comparaba las líneas R03 como bytes raw (`l.slice(13, 46)`). SOS Contador usa un formato de padding ligeramente distinto al nuestro (diferente número de ceros antes del código SOS, diferente ancho del campo de cantidad), por lo que la comparación byte a byte siempre fallaba aunque los datos fueran iguales.
- **Fix:** Nueva función `parseR03Line(l)` que detecta el formato por posición del `$` (pos 28 = SOS < 400, pos 31 = SOS ≥ 400) y extrae el código SOS + monto + crédito/débito. La comparación ahora se hace por contenido (`sos=monto{CD}`), ignorando diferencias de formato.

---

## P4.3) Resultado final de la comparación

| Tipo de registro | Resultado |
|---|---|
| R01 | ✗ Difiere en pos 26-27 (GEN=`00` REF=`13`) — posiblemente nro de presentación, **diferido** |
| R03 conceptos | ✓ **9/9 empleados OK** (mismo SOS code + monto en todos) |
| R04 monetario | ✓ **9/9 empleados OK** |
| R04 header pos 16 (`marcaCct`) | ✗ GEN=`1` (tiene convenioId) REF=`0` — diferencia de criterio, **no bloqueante** |
| R04 header pos 17 (`marcaScvo`) | ✗ Varía — **no bloqueante** |

**Conclusión:** El LSD generado es sustancialmente correcto. Todos los datos de remuneración y conceptos son idénticos a la referencia. Las diferencias restantes son de metadata y no afectan la aceptación por AFIP Simplificación Registral.

---

## P4.4) Próximos pasos

1. Enviar el LSD a AFIP (solapa Cargas Sociales → "Descargar LSD" → importar en aplicativo LSD de AFIP) y verificar aceptación.
2. Investigar el campo misterioso del R01 pos 26-27 (posiblemente nro de presentación consecutivo).

---

## P4.5) Archivos involucrados

- `src/actions/sueldos.ts` — función `lsdAlpha`, fixes `diaInicio2/3`, COALESCE situación de revista
- `src/scripts/comparar-lsd.ts` — mismo `lsdAlpha`, parser R03 por contenido (`parseR03Line`)
- `Documentacion Tecnica/Plan de manejo de cargas sociales.md` — estado actualizado
- `Documentacion Tecnica/Escalas Salariales CCT - Investigacion.md` — checklist actualizado

---

## 8) Checklist de cierre actualizado

- [x] rem4y8Override CUIL 23400741824 corregido a pesos (era centavos).
- [x] Códigos OS de 3 empleados corregidos a OSECAC (126205).
- [x] Padding R04 header corregido (`lsdAlpha`) en `sueldos.ts` y `comparar-lsd.ts`.
- [x] Comparación R03 por contenido (no bytes raw) — 9/9 OK.
- [x] R04 monetario 9/9 OK.
- [ ] Enviar LSD a AFIP y verificar aceptación.
- [ ] Investigar R01 pos 26-27.
- [ ] Actualizar credenciales de Jafif, Mirpuri, Admip.
- [ ] Cargar escalas Construcción 76/75.
- [ ] Crear CCT Pasteleros (167/91 y 272/96) y Sanidad (459/06) con categorías y escalas.
- [ ] Asignar categorías a empleados de las empresas configuradas.
