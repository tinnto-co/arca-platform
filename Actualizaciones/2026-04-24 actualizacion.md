# Actualizacion - 2026-04-24

## 1) Objetivo general del dia

Consolidación y limpieza del módulo de convenios colectivos: se ejecutó la asignación de convenios a empleadores y empleados basada en datos scrapeados de AFIP, se normalizaron los nombres y descripciones de `payroll_convenio`, se eliminaron todos los datos hardcodeados ("plantilla base") de escalas y categorías, y se reemplazó la descripción por texto proveniente de fuentes externas (`convenios_de_trabajo.signatarios`).

---

## 2) Cambios funcionales (impacto en operación)

### 2.1 Asignación de convenios a empleadores y empleados

- **Cambio:** Se ejecutó el script `asignar-convenios-empleadores.ts` en ambas bases de datos (`/dump` y `/postgres`).
- **Resultado:**
  - Paso 1: 5 `payroll_convenio` actualizados con `cct_codigo` por match de nombre (todos Comercio 130/75).
  - Paso 2: 29–30 `payroll_convenio` nuevos creados para combinaciones cliente+CCT sin registro previo.
  - Paso 3: 139 empleados con `convenio_id` asignado; 86 saltados (sin CCT scrapeado o con múltiples CCTs reales).
  - Cobertura final: 155/241 empleados con convenio asignado (64%). Los restantes pertenecen a clientes sin scraping AFIP aún.
- **Archivos:** `src/scripts/asignar-convenios-empleadores.ts`

### 2.2 Normalización de nombres en payroll_convenio

- **Cambio:** Registros cuyo `nombre` era el código CCT crudo (ej. `"130/75"`, `"0076/75"`) fueron renombrados al nombre legible del convenio. Luego se actualizaron todos los nombres al formato `"Nombre CCT"` (ej. `"Comercio 130/75"`).
- **Motivo:** Inconsistencia entre registros creados manualmente (nombre = código) y registros nuevos (nombre = texto). La nueva convención es `"Nombre CCT/año"`.
- **Resultado:** 16 registros renombrados; 1 duplicado fusionado (Gmontajes SA, CCT 76/75); 82 registros con nombre estandarizado.
- **Archivos:** `src/scripts/fix-payroll-convenio-nombres.ts`

### 2.3 Eliminación de datos hardcodeados ("plantilla base")

- **Cambio:** Se eliminaron todas las escalas, categorías y entradas de fuente MANUAL que provenían del sistema anterior hardcodeado.
- **Detalle:**
  - 12 escalas con `fuente IS NULL` eliminadas (montos redondos $350k/$400k/$450k de dic-2025 para Alderete Oscar, Sfintzi Gustavo y Gmontajes SA). Se conservaron las 3 escalas de "Gerente" de E-Presis SA (caso real sin categoría estándar).
  - 15 categorías sin escalas resultantes eliminadas (incluyendo "Gerente" vacío de Khiro SA, Sigana SA y GB Metal).
  - 4 entradas `MANUAL` en `payroll_convenio_fuente` eliminadas.
  - 33 `payroll_convenio` con `cct_codigo IS NULL` actualizados con el código correcto según nombre.
  - 1 duplicado adicional fusionado (Zahrarh SA, CCT 389/04).
- **Estado final:** 82 registros en `payroll_convenio`, ninguno con `cct_codigo IS NULL`.
- **Archivos:** `src/scripts/limpiar-convenios-hardcodeados.ts`

### 2.4 Descripción del convenio desde fuente externa

- **Cambio:** La columna `payroll_convenio.descripcion` ahora almacena los signatarios del CCT tomados de `convenios_de_trabajo.signatarios` en lugar de texto hardcodeado o generado desde AFIP.
- **Motivo:** La descripción es un atributo del CCT (fuente de verdad: `convenios_de_trabajo`), no del vínculo cliente-convenio. Toda la lógica apunta ahora a fuentes externas.
- **Resultado:** 82 registros actualizados con signatarios reales en ambas bases.
- **Archivos:** `src/actions/sueldos.ts`, `src/components/sueldos/SueldosConvenios.tsx`

---

## 3) Cambios técnicos (implementación)

### 3.1 Backend / motor

- `listConvenios` en `sueldos.ts`: reemplazado `db.select()` genérico por select explícito con `leftJoin` a `convenios_de_trabajo`. Devuelve `signatarios` en lugar de `descripcion`. El JOIN normaliza ceros a la izquierda del CCT con `REGEXP_REPLACE`.
- `agregarConvenioDesdeAfipEmpleadores`: eliminada la construcción del bloque de texto AFIP en `descripcion` (ese dato ya vive en `convenios_de_trabajo`).
- Línea de filtro en `getConvenioParaLiquidacion`: eliminado el fallback a `extractCct(conv.descripcion)`.

### 3.2 Frontend / UI

- `SueldosConvenios.tsx`:
  - Tipo `ConvenioCardProps`: reemplazado `descripcion: string | null` por `signatarios: string | null`.
  - `convenioYaTieneCct`: la detección de duplicados ahora compara `cctCodigo` directamente en lugar de buscar en `descripcion`.
  - `ConvenioCard`: muestra `convenio.signatarios` en lugar de `convenio.descripcion`.
  - `createConvenio`: eliminado el parámetro `descripcion: undefined`.

### 3.3 Datos / DB / scripts

- **`fix-payroll-convenio-nombres.ts`** (nuevo): renombra registros con nombre = código CCT y fusiona duplicados resultantes.
- **`limpiar-convenios-hardcodeados.ts`** (nuevo): limpieza en 5 pasos (escalas null, categorías vacías, fuentes MANUAL, asignación de cct_codigo, fusión de duplicados). Corre en ambas bases.
- **`check-payroll-convenio.ts`** (nuevo, auxiliar): lista todos los registros con nombre y cliente para auditoría.
- Todos los scripts de esta sesión se ejecutaron en `/dump` y `/postgres`.

---

## 2b) Módulo de sueldos — Conceptos y Empleados

### 2b.1 Conceptos: acceso al catálogo completo SOS

- **Cambio:** La pestaña "Conceptos" ya no filtra por los conceptos importados del LSD de cada empresa. Ahora muestra el catálogo completo de `conceptos_completos_sos` (códigos 1–699), disponible para todas las empresas.
- **Detalle técnico:**
  - Nueva server function `listTodosConceptosSos`: consulta directamente `conceptos_completos_sos` sin join a `concepto_sos_profile`.
  - `listConceptosPlantillaManualSos` reescrita: elimina el join a `conceptoSosProfile` y devuelve los 699 conceptos mapeados al shape `ConceptoImportado`.
- **Archivos:** `src/actions/sueldos.ts`, `src/components/sueldos/SueldosConceptos.tsx`

### 2b.2 Conceptos: paginador y buscador

- **Cambio:** La pestaña "Conceptos" incorpora paginación (10 items/página) y un buscador que filtra por nombre del concepto y código AFIP.
- **Archivos:** `src/components/sueldos/SueldosConceptos.tsx`

### 2b.3 Simulador (Nuevo recibo): todos los conceptos SOS visibles

- **Cambio:** En "Nuevo recibo" — tanto modo copia del último recibo como modo manual — se muestran los 699 conceptos SOS. Antes solo aparecían los conceptos con actividad en el perfil.
- **Modo copia:** Se carga la plantilla completa y se solapan los valores del último recibo del empleado. Conceptos fuera del catálogo (código > 699) se agregan al final como extras.
- **Modo manual:** Se pre-calculan montos con el básico de escala del empleado/período.
- **Filtro al guardar:** `buildConceptosParaGuardar` excluye filas sin ningún dato (monto cero y todos los campos vacíos) para no persistir cientos de conceptos vacíos.
- **Archivos:** `src/components/sueldos/SueldosSimulador.tsx`, `src/components/sueldos/ReciboFormulario.tsx`

### 2b.4 Empleados: paginador, buscador y dialog de detalle

- **Cambio:** La pestaña "Empleados" incorpora:
  - Paginación (10 items/página).
  - Buscador por nombre, CUIL o legajo.
  - Click en cualquier fila abre un dialog con todos los datos del empleado importados del Excel LSD.
- **Dialog de detalle:** organizado en 4 pestañas:
  - **Personal:** CUIL, sexo, fecha nacimiento, estado, domicilio, localidad, código postal, cónyuge, hijos, adherentes.
  - **Laboral:** fecha alta/baja, tipo jornada, modo contrato, tarea, tipo empleador, convenio, categoría, remuneración.
  - **Pago:** obra social, forma de pago, lugar de pago, banco, CBU.
  - **Códigos:** modalidad contratación, situación, zona, condición, actividad, siniestrado, observaciones.
- **Archivos:** `src/components/sueldos/SueldosEmpleados.tsx`

### 2b.5 Empleados: edición desde el dialog

- **Cambio:** Botón "Editar" en el header del dialog habilita edición de campos. Al confirmar, "Guardar" persiste los cambios; "Cancelar" revierte.
- **Campos editables:**
  - Personal: nombre, CUIL, estado (activo/inactivo).
  - Laboral: legajo, fecha de alta, tipo jornada, convenio, categoría.
  - Pago: lugar de pago, forma de pago, banco, CBU, obra social.
  - Códigos: los 6 códigos auxiliares y observaciones.
  - Domicilio y familia: domicilio, localidad, código postal, cónyuge, hijos, adherentes.
- **Backend:** `updateEmpleado` extendido para aceptar domicilio, localidad, codigoPostal, conyuge, hijos, adherentes, obraSocialId, los 6 códigos auxiliares y observaciones.
- **Archivos:** `src/actions/sueldos.ts`, `src/components/sueldos/SueldosEmpleados.tsx`

### 2b.6 Empleados: eliminación del botón "Legajo" de la tabla

- **Cambio:** El botón independiente "Legajo" (que abría un dialog separado para editar datos de pago) fue eliminado de la tabla. Esa funcionalidad quedó integrada dentro del dialog de detalle del empleado, en la pestaña "Pago".
- **Archivos:** `src/components/sueldos/SueldosEmpleados.tsx`

### 2b.7 Backend: obra social en listado de empleados

- **Cambio:** `listImportEmpleados` ahora hace join con `obra_social` y devuelve `obraSocialNombre` y `obraSocialCodigo` junto a cada empleado.
- **Archivos:** `src/actions/sueldos.ts`

---

## 4) Documentación y trazabilidad

### 4.1 Documentos creados o actualizados

- `Actualizaciones/2026-04-24 actualizacion.md` (este archivo)

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Riesgos detectados

- 86 empleados sin `convenio_id` porque su empleador no tiene CCT scrapeado aún. Se resolverán automáticamente cuando corra el scraper para esos profiles.
- 5 empleados de Sabenumitubeja SA tienen múltiples CCTs reales (0167/91 y 0272/96 — dos CCTs de Pasteleros). Requieren asignación manual según categoría del empleado.
- El JOIN en `listConvenios` normaliza ceros con `REGEXP_REPLACE` en SQL crudo. Si se migra a otra DB habría que revisar esta expresión.
- `payroll_convenio.descripcion` se popula desde `convenios_de_trabajo.signatarios` manualmente. Si cambian los signatarios en el catálogo, hay que re-ejecutar el UPDATE.

### 5.2 Pendiente inmediato (próximo paso)

- Conectar los catálogos de legajo al formulario de empleados (selects tipados con descripción + código).
- Scrapear los CCTs de los clientes pendientes (Ngvs, BESOROT TOVOT, Smart Solution, etc.) para completar la cobertura de `convenio_id` en empleados.
- Evaluar sincronización automática de `payroll_convenio.descripcion` cuando se actualice `convenios_de_trabajo`.
- Validar que los campos de edición del dialog de empleados (domicilio, familia, códigos) estén correctamente migrados en todas las bases con la columna `obra_social_id`.

---

## 6) Archivos principales involucrados

- `src/actions/sueldos.ts`
- `src/components/sueldos/SueldosConvenios.tsx`
- `src/components/sueldos/SueldosConceptos.tsx`
- `src/components/sueldos/SueldosSimulador.tsx`
- `src/components/sueldos/SueldosEmpleados.tsx`
- `src/components/sueldos/ReciboFormulario.tsx`
- `src/scripts/asignar-convenios-empleadores.ts`
- `src/scripts/fix-payroll-convenio-nombres.ts`
- `src/scripts/limpiar-convenios-hardcodeados.ts`
- `src/scripts/check-payroll-convenio.ts`
- `Actualizaciones/2026-04-24 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios técnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del día guardado con fecha correcta.
