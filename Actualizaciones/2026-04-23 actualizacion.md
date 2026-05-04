# Actualizacion - 2026-04-23

## 1) Objetivo general del dia

Tres frentes principales: (1) se incorporo soporte de multiples fuentes por convenio colectivo (`payroll_convenio_fuente`) para rastrear si un convenio viene de AFIP, de escalas manuales o fue cargado a mano; (2) se crearon los 8 catalogos de referencia del legajo de empleados extraidos directamente de SOS-Contador, cubriendo situacion, condicion, actividad, modalidad de contratacion, siniestrado, provincia, nacionalidad y zona; y (3) se normalizo la columna `codigo` de `obra_social` para que almacene el codigo AFIP/RNOS real (extraido del inicio del campo `nombre`) en lugar del ID interno de SOS.

---

## 1b) Objetivo general - sesion continuada (misma fecha)

Se continuaron cuatro frentes adicionales: (1) importacion masiva de legajos desde Excel SOS — 159 empleados nuevos insertados y 83 existentes completados, con fechas de alta/baja y estado activo corregido; (2) refactor de relaciones en `liquidacion_import_empleado` para reemplazar campos de texto libre por FKs a tablas catalogo (Opcion A); (3) creacion del catalogo global `convenios_de_trabajo` con los CCT scrapeados de AFIP; (4) normalizacion de `afip_empleadores_convenio` para que los datos del convenio se nutran de `convenios_de_trabajo` via FK y trigger automatico.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Fuentes por convenio colectivo
- **Cambio:** Se agrego la tabla `payroll_convenio_fuente` que registra de donde proviene la informacion de cada convenio (AFIP, fuente de escala, o MANUAL como fallback).
- **Motivo:** Dar trazabilidad sobre el origen de cada convenio y facilitar sincronizaciones futuras por fuente.
- **Impacto:** Los convenios quedan clasificados por origen, lo que permite filtrar y priorizar actualizaciones segun la fuente.
- **Archivos:** `drizzle/0018_payroll_convenio_fuentes.sql`, `drizzle/schema.ts`, `src/components/sueldos/SueldosConvenios.tsx`, `src/actions/sueldos.ts`

### 2.3 Normalizacion de codigos AFIP en obra_social
- **Cambio:** Se normalizo la columna `codigo` de la tabla `obra_social` para que contenga el codigo AFIP/RNOS real (6 digitos) en lugar del ID interno de SOS que tenia antes.
- **Motivo:** El campo `nombre` ya contenia el codigo AFIP al inicio (ej. "905008 - SWISS MEDICAL SA"), pero la columna `codigo` almacenaba el ID interno de SOS (ej. `10199`). Esto generaba inconsistencia con los registros cargados manualmente que si usaban el codigo AFIP.
- **Impacto:** 563 de 564 filas actualizadas. 1 fila omitida por conflicto de codigo duplicado. El campo `nombre` no fue modificado.
- **Archivos:** `src/scripts/fix-obra-social-codigos.ts`

### 2.2 Catalogos de referencia del legajo de empleados
- **Cambio:** Se crearon 8 nuevas tablas de catalogo con todos los valores posibles de los campos del legajo: `payroll_situacion` (34), `payroll_condicion` (14), `payroll_actividad` (158), `payroll_modalidad_contratacion` (159), `payroll_siniestrado` (14), `payroll_provincia` (24), `payroll_nacionalidad` (136), `payroll_zona` (362).
- **Motivo:** El sistema almacenaba estos valores como texto libre sin validacion ni referencia centralizada. Se necesita poder mostrar nombres legibles, validar contra valores SOS, y en el futuro reemplazar los campos de texto por FKs.
- **Impacto:** Se dispone de 901 registros de referencia que permiten mostrar descripciones completas en el legajo, validar codigos al importar y preparar el terreno para selects tipados en el formulario de empleados.
- **Archivos:** `drizzle/schema.ts`, `drizzle/0019_payroll_catalogos_legajo.sql`

### 2.4 Importacion de legajos desde Excel SOS
- **Cambio:** Se procesaron los 50 archivos Excel de la carpeta `SOS_empresas_legajos`. Se insertaron 159 empleados nuevos en `liquidacion_import_empleado` y se completaron campos NULL de 83 empleados existentes.
- **Motivo:** Los empleados estaban en SOS pero sin fila en la tabla de liquidacion.
- **Impacto:** 166 empleados con `fecha_alta` completada; 100 empleados con `fecha_baja` y `activo = false` donde el Excel indicaba egreso. 19 empleados con `provincia_id` y 15 con `nacionalidad_id`.
- **Archivos:** `src/scripts/insert-empleados-desde-excel.ts`, `src/scripts/import-legajos-desde-excel.ts`, `src/scripts/fix-fechas-empleados.ts`

### 2.5 FKs a tablas catalogo en liquidacion_import_empleado (Opcion A)
- **Cambio:** Se eliminaron los campos de texto redundante (`situacion`, `condicion`, `actividad`, `siniestrado`, `zona`, `provincia`, `nacionalidad`) y se agregaron 8 FKs nullable hacia los catalogos correspondientes: `situacion_id`, `condicion_id`, `actividad_id`, `modalidad_contratacion_id`, `siniestrado_id`, `zona_id`, `provincia_id`, `nacionalidad_id`.
- **Motivo:** Reemplazar texto libre sin integridad referencial por relaciones reales con los catalogos. Los codigos `codigo_*` se conservan por ahora para trazabilidad.
- **Impacto:** 6 catalogos al 100% (241/241), `obra_social` al 95%, `provincia`/`nacionalidad` al 8%/6% (limitado por datos disponibles en Excel). Match por codigo para actividad/modalidad, por nombre normalizado para situacion/condicion/siniestrado/zona, con decodificacion de HTML entities del Excel.
- **Archivos:** `drizzle/schema.ts`, `drizzle/0019_empleado_catalog_fks.sql`, `src/scripts/populate-empleado-fks.ts`

### 2.6 Catalogo global convenios_de_trabajo
- **Cambio:** Se creo la tabla `convenios_de_trabajo` como catalogo unico de convenios colectivos conocidos (1 fila por CCT). Se poblo con los 10 CCT existentes en `afip_empleadores_convenio`.
- **Motivo:** `afip_empleadores_convenio` almacenaba `cct`, `actividad` y `signatarios` de forma redundante por empleador. Se necesita una fuente de verdad unica por convenio.
- **Impacto:** Catalogo disponible para lookup, con campo `descripcion` libre para notas del equipo.
- **Archivos:** `drizzle/schema.ts`, `drizzle/0020_convenios_de_trabajo.sql`

### 2.7 Vinculacion afip_empleadores_convenio → convenios_de_trabajo
- **Cambio:** Se agrego `convenio_id` FK en `afip_empleadores_convenio`. Se creo el trigger `trg_sync_convenio_de_trabajo` que se dispara en cada INSERT/UPDATE del scraper: si el CCT no existe en `convenios_de_trabajo` lo inserta, y siempre setea el FK automaticamente. Las queries de `sueldos.ts` ahora leen `cct`, `actividad` y `signatarios` via JOIN a `convenios_de_trabajo`.
- **Motivo:** El scraper escribe directamente en la BD sin pasar por el app, por lo que el trigger es el unico punto de sincronizacion viable sin modificar el servicio externo.
- **Impacto:** 83/83 filas de `afip_empleadores_convenio` vinculadas. Nuevos clientes quedan automaticamente enlazados al catalogo al primer scraping.
- **Archivos:** `drizzle/schema.ts`, `drizzle/0021_afip_empleadores_convenio_fk.sql`, `src/actions/sueldos.ts`

---

## 3) Cambios tecnicos (implementacion)

### 3.1 Backend / motor
- Se agrego `payrollConvenioFuente` al schema con constraint unica `(convenio_id, fuente)`.
- La migracion 0018 realiza backfill automatico de fuentes desde: (a) coincidencia de CCT con `afip_empleadores_convenio`, (b) campo `fuente` de `payroll_escala`, y (c) fallback MANUAL para convenios sin fuente previa.
- Cambios en `src/actions/sueldos.ts` vinculados al nuevo modelo de fuentes por convenio.

### 3.2 Frontend / UI
- Ajustes en `SueldosConvenios.tsx` para reflejar informacion de fuentes por convenio.
- Ajustes menores en `SueldosDashboard.tsx`.

### 3.3 Datos / DB / scripts
- **Migration 0018** (`payroll_convenio_fuentes.sql`): crea `payroll_convenio_fuente` + backfill de fuentes AFIP/escala/MANUAL.
- **Migration 0019** (`payroll_catalogos_legajo.sql`, 983 lineas): crea 8 tablas de catalogo e inserta todos los registros extraidos de SOS-Contador (`sueldos_legajoAM.asp`).
- Los codigos almacenados en cada tabla son los codigos internos de SOS (campo `value` del select), que son los mismos que se guardan hoy en los campos `codigoSituacion`, `codigoActividad`, etc. de `liquidacion_import_empleado`.
- Nota sobre `payroll_zona`: los 362 registros cubren codigos historicos con rango de periodo y porcentaje de reduccion de cargas patronales (decretos de los '90 + codigos 2004 de Mendoza, Salta, Catamarca, Jujuy y Tierra del Fuego). Se incluyen porque algunos empleados activos los tienen asignados.
- **Script `fix-obra-social-codigos.ts`**: ejecutado exitosamente. Extrae el codigo AFIP del campo `nombre` con regex `/^(\d{4,6})\s*[-\s]/` y lo escribe en `codigo`. Es idempotente y detecta conflictos antes de actualizar.

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados o actualizados
- `Actualizaciones/2026-04-23 actualizacion.md` (este archivo)

### 4.2 Documentos depurados (si aplica)
- No aplica en este corte.

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Riesgos detectados
- Los campos `codigo_*` en `liquidacion_import_empleado` son ahora redundantes (el codigo esta en el catalogo via FK), pero se conservan para trazabilidad. Se pueden eliminar en una migracion futura.
- `provincia_id` y `nacionalidad_id` tienen cobertura baja (8%/6%) porque la mayoria de empleados no tenia estos campos en el Excel. Se completaran a medida que entren nuevos Excels con esa informacion.
- El match de `condicion` por nombre normalizado depende de que el texto del Excel coincida con el del catalogo. Si SOS cambia sus labels, el match fallara silenciosamente (quedara NULL).
- El trigger `trg_sync_convenio_de_trabajo` no actualiza `convenios_de_trabajo` si el CCT ya existe (ON CONFLICT DO NOTHING). Si el scraper trae un nombre/signatarios distinto para un CCT existente, el catalogo conserva el valor original — esto es intencional (catalogo es fuente de verdad), pero requiere edicion manual si el dato de AFIP cambio.
- Algunos registros de `payroll_actividad` y `payroll_modalidad_contratacion` tienen codigos AFIP duplicados con distintos codigos SOS (ej. codigo AFIP "032" tiene 3 entradas). Esto es fiel al comportamiento de SOS pero puede generar confusion al mostrar descripcion por codigo AFIP.

### 5.2 Pendiente inmediato (proximo paso)
- Conectar los catalogos al formulario de legajo (selects tipados con descripcion + codigo).
- Evaluar eliminar los campos `codigo_*` redundantes de `liquidacion_import_empleado` una vez validada la cobertura de FKs.
- Verificar que el backfill de fuentes de convenio (0018) no genere duplicados en entornos con datos distintos.

---

## 6) Archivos principales involucrados

- `drizzle/schema.ts`
- `drizzle/0018_payroll_convenio_fuentes.sql`
- `drizzle/0019_payroll_catalogos_legajo.sql`
- `drizzle/0019_empleado_catalog_fks.sql`
- `drizzle/0020_convenios_de_trabajo.sql`
- `drizzle/0021_afip_empleadores_convenio_fk.sql`
- `src/actions/sueldos.ts`
- `src/components/sueldos/SueldosConvenios.tsx`
- `src/components/sueldos/SueldosDashboard.tsx`
- `src/scripts/fix-obra-social-codigos.ts`
- `src/scripts/fix-obra-social-codigos-migration.ts`
- `src/scripts/fix-obra-social-duplicate.ts`
- `src/scripts/import-legajos-desde-excel.ts`
- `src/scripts/insert-empleados-desde-excel.ts`
- `src/scripts/fix-fechas-empleados.ts`
- `src/scripts/listado-pendientes-legajos.ts`
- `src/scripts/populate-empleado-fks.ts`
- `src/scripts/run-migration-sql.ts`
- `Actualizaciones/2026-04-23 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios tecnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
