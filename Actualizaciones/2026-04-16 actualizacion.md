# Actualizacion - 2026-04-16

## Objetivo general del dia

Se consolidaron mejoras del modulo de Sueldos para unificar la gestion de empleados, corregir cruces por perfil, normalizar datos y resolver el backfill de legajos desde archivos SOS (`.xls/.xlsx`) hacia la tabla maestra de empleados.

---

## 1) Cambios funcionales en UI y logica de empleados

### 1.1 Empleados (solapa Sueldos)
- Legajo mostrado sin ceros a la izquierda.
- Categoria mostrada solo por nombre (sin codigo).
- Se incorporo/ajusto checkbox **Activo**:
  - persiste estado activo/inactivo;
  - cuando esta inactivo, se atenua/deshabilita la fecha de baja.

### 1.2 Formulario de empleado
- Se alineo la misma logica de categorias y visualizacion en `EmpleadoFormDialog`.
- Se incorporo selector de obra social para la edicion del empleado.

### 1.3 Dashboard Sueldos
- Se agrego filtro por periodo de liquidacion.
- Se habilito visualizacion de empleados liquidados por periodo.
- Se corrigio aislamiento de datos por perfil: se usa `profileId` en lugar de solo `clientId` para evitar mezclas entre perfiles del mismo cliente.

---

## 2) Cambios de datos y esquema (DB)

### 2.1 Tabla maestra de empleados
Se uso y consolido `liquidacion_import_empleado` como fuente maestra para legajos/datos personales.

### 2.2 Nuevos/ajustados campos en empleado
Se agrego y habilito en flujo de datos:
- `obra_social_id` (referencia a `obra_social`).
- columnas complementarias para backfill de legajos (nacionalidad, fecha nacimiento, situacion, zona, condicion, actividad, siniestrado, observaciones, etc.).

### 2.3 Scripts de soporte de esquema
- `src/scripts/ensure-empleado-obra-social-column.ts`
- `src/scripts/ensure-empleado-legajo-extra-columns.ts`

---

## 3) Scripts y procesos ejecutados hoy

### 3.1 Normalizaciones y mantenimiento
- Activacion masiva de empleados (estado activo) a nivel base.
- Normalizacion de nombres a formato con iniciales en mayuscula.

### 3.2 Backfill y verificacion de legajos SOS vs BD
Scripts involucrados:
- `src/scripts/revisar-legajos-sos-vs-bd.ts`
- `src/scripts/reporte-backfill-legajos-por-empresa.ts`
- `src/scripts/backfill-empleado-legajo-desde-excels.ts`
- `src/scripts/debug-admip-legajos-excel.ts` (diagnostico puntual)

---

## 4) Causa raiz detectada en los Excel SOS y correccion tecnica

### Problema detectado
Los archivos SOS no siempre traian encabezados en la primera fila util:
- habia fila de titulo previa;
- la fila de encabezado podia venir con columna A vacia;
- las filas de datos si traian CUIT en la primera columna.

Esto generaba desfasaje de columnas al parsear con `sheet_to_json` directo, produciendo falsos "sin match" aun con CUIL correctos en BD.

### Solucion implementada
Se creo parser dedicado:
- `src/lib/parse-sos-legajos-sheet.ts`

Funciones clave:
- `parseSosLegajosRows`
- `getCuilFromLegajoRow`
- `getLegajoFromLegajoRow`
- `normalizeCuilValue`
- `normalizeHeaderKey`

Logica aplicada:
- deteccion de fila real de encabezados (buscando columna CUIL);
- parseo por matriz (`header: 1`);
- compensacion de corrimiento con `leadSkip = 1` cuando el primer header esta vacio.

---

## 5) Datos efectivamente backfilleados desde Excel

Tabla destino: **`liquidacion_import_empleado`**

Campos actualizados:
- `nacionalidad`
- `fechaNacimiento`
- `conyuge`
- `hijos`
- `adherentes`
- `sexo`
- `domicilio`
- `localidad`
- `codigoPostal`
- `provincia`
- `codigoModalidadContratacion`
- `situacion`
- `codigoSituacion`
- `zona`
- `codigoZona`
- `condicion`
- `codigoCondicion`
- `actividad`
- `codigoActividad`
- `siniestrado`
- `codigoSiniestrado`
- `observaciones`
- `obraSocialId`
- `updatedAt`

---

## 6) Obra social por empleado (correccion adicional)

Se detecto inicialmente que `obraSocialId` no quedaba poblado por diferencias de codigos entre Excel y catalogo existente.

Se ajusto el backfill para:
- resolver por `cod obra social`;
- intentar resolver por codigo al inicio del texto de "obra social";
- si no existe en catalogo, crear registro en `obra_social` (upsert por `codigo`) y asociarlo al empleado.

Resultado validado post-correccion:
- empleados con obra social en `liquidacion_import_empleado`: **82/82**.

---

## 7) Resultados consolidados de ejecucion (hoy)

- Perfiles procesados: **27**
- Filas actualizadas (match por CUIL/legajo): **86**
- Filas sin match por CUIL/legajo: **151**

### Empresas con sin match total (0 match)
- KASUR LIPAT (`30717679136`) - sin empleados en tabla maestra.
- Mugiwaras (`33718399799`) - sin empleados en tabla maestra.
- Termomecanica Valtri (`30716025752`) - empresa/perfil existe, pero sin empleados en tabla maestra.
- Zahrarh SA (`30718084209`) - sin empleados en tabla maestra.

---

## 8) Archivos relevantes tocados/creados hoy (principal)

- `src/components/sueldos/SueldosEmpleados.tsx`
- `src/components/sueldos/EmpleadoFormDialog.tsx`
- `src/components/sueldos/SueldosDashboard.tsx`
- `src/actions/sueldos.ts`
- `drizzle/schema.ts`
- `src/lib/parse-sos-legajos-sheet.ts`
- `src/scripts/backfill-empleado-legajo-desde-excels.ts`
- `src/scripts/reporte-backfill-legajos-por-empresa.ts`
- `src/scripts/revisar-legajos-sos-vs-bd.ts`
- `src/scripts/ensure-empleado-obra-social-column.ts`
- `src/scripts/ensure-empleado-legajo-extra-columns.ts`
- `Documentacion Tecnica/Reporte Backfill Legajos - Ejemplo Zahrah.md`
- `Documentacion Tecnica/Reporte Backfill Legajos - Empresas sin match.md`

---

## 9) Catálogo global de conceptos SOS

### Objetivo
Crear una tabla de referencia global (`conceptos_completos_sos`) que contenga todos los conceptos del sistema SOS Contador con su metadata completa: código AFIP, campos de entrada visibles, base de cálculo y divisores.

### Fuente de datos
Extraída del DOM del recibo de edición de SOS Contador (empresa Mr Factory Couch, CUIL 30717679136) mediante JavaScript, capturando los 25 TDs ocultos por fila. Documentada en `Documentacion Tecnica/Todos los conceptos SOS.md`.

### Tabla creada en DB
**`conceptos_completos_sos`** — catálogo global, no es por cliente.

Columnas:
- `numero_sos` (integer, unique) — número interno SOS
- `codigo_afip` (text) — código AFIP/SIJP para el LSD
- `nombre` (text) — descripción del concepto
- `tiene_memo` / `tiene_cantidad` / `tiene_pct` / `tiene_imp_concepto_nro` / `tiene_importe` / `tiene_imp_min` / `tiene_imp_max` (boolean) — campos de entrada visibles en el recibo
- `base_columna` (enum `payroll_base_columna`) — base de cálculo pre-computada por SOS
- `div_hs_norm` (integer) — divisor de horas normales (1 o 180)
- `div_cantidad` (integer) — divisor de días (1, 25 o 30)
- timestamps

### Resultado del seed
- **231 conceptos insertados** (todos los conceptos del sistema SOS)

### Archivos creados
- `drizzle/schema.ts` — tabla `payrollConceptosSosCatalog` agregada al final
- `src/scripts/seed-conceptos-sos-catalog.ts` — seed idempotente (soporta `--dry-run`)
- `Documentacion Tecnica/Todos los conceptos SOS.md` — documentación completa con tabla de los 231 conceptos, lógica de fórmulas y estructura de TDs ocultos

