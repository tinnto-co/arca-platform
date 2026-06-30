# Actualizacion - 2026-06-23

## 1) Objetivo general del dia

Dos sesiones de trabajo:

1. **Sincronización local ↔ producción:** Se detectaron y corrigieron diferencias arquitectónicas en catálogos AFIP, se migraron datos faltantes (recibos Feb–Abr 2026, convenios/escalas de Pahue y Ngvs) y se aplicó schema faltante en prod (`fecha_ingreso`). Al cierre, local y prod están en paridad operativa.
2. **Planificación y ejecución de mejoras al módulo de sueldos:** Relevamiento de 7 ítems de mejora, análisis técnico de cada uno, e implementación del ítem 1 (concepto 415 con cálculo automático sobre no remunerativos 411–414).

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Catálogos AFIP de producción corregidos

- **Cambio:** Las 5 tablas de catálogo AFIP en producción (`payroll_situacion`, `payroll_condicion`, `payroll_actividad`, `payroll_modalidad_contratacion`, `payroll_siniestrado`) tenían un esquema incorrecto: usaban IDs de SOS Contador como `codigo` primario en lugar de los códigos AFIP oficiales.
- **Motivo:** Esto impedía la generación correcta de archivos LSD para AFIP desde producción (los campos de código saldrían como "1070" en lugar de "01").
- **Impacto:** Producción ahora puede generar LSD correctamente. Los catálogos de prod y local son idénticos (mismos AFIP codes + mismo `codigo_sos`).
- **Archivos:** `src/scripts/migrate-catalogos-prod.ts` (script ejecutado y eliminado)

### 2.2 Recibos Feb–Abr 2026 disponibles en local

- **Cambio:** Se importaron a local 145 recibos y 1.914 conceptos de los períodos 2026-02, 2026-03 y 2026-04, que solo existían en producción.
- **Motivo:** Eran recibos reales generados en producción (60 importados desde SOS, 75 generados en el sistema), no pruebas. Los recibos de prueba previos habían sido borrados de local.
- **Impacto:** Local ahora refleja el estado real de liquidaciones de producción para esos períodos.
- **Archivos:** `src/scripts/import-recibos-prod.ts` (script ejecutado y eliminado)

### 2.3 Convenios y escalas de Pahue y Ngvs sincronizados

- **Cambio:** Se copiaron a local los convenios, categorías y escalas faltantes para Pahue Technologies SA (CCT 389/04 + 130/75 completos) y Ngvs (CCT 76/75, más categorías de 389/04 y 130/75).
- **Motivo:** Producción tenía instancias de esos CCTs con datos más completos que local (33 categorías y 204 escalas extra para Pahue, 33 categorías y 99 escalas extra para Ngvs).
- **Archivos:** `src/scripts/import-clientes-prod.ts` (script ejecutado y eliminado)

### 2.4 Concepto 415: cálculo automático sobre no remunerativos 411–414

- **Cambio:** El concepto 415 ("Asig. Complementaria no Rem.") ahora calcula automáticamente su monto a partir de la suma de los conceptos 411 a 414 presentes en el recibo. La columna `cantidad` se auto-rellena con esa suma y el usuario ingresa el porcentaje (ej. 8,33%). El resultado es `cantidad × (pct/100)`. Ambos campos son editables.
- **Motivo:** Antes el 415 era un concepto de importe fijo manual, sin vínculo automático con 411–414.
- **Implementación:** Nuevo subtotal `sub411_414` en el cascade de `TablaReciboSos.tsx`. Nuevo tipo de base `sub411_414_qty` que auto-rellena `cantidad`. Catálogo SOS actualizado y BD actualizada vía seed.
- **Archivos:** `src/components/sueldos/TablaReciboSos.tsx`, `src/lib/sos-formula-display.ts`, `src/scripts/seed-conceptos-sos-catalog.ts`.

### 2.5 Fecha de ingreso (legajo) sincronizada desde SOS Contador

- **Cambio:** Se pobló el campo `fecha_ingreso` en `liquidacion_import_empleado` para 240 empleados (35 empresas), extrayendo el valor de `txfechaingreso_legajo` de SOS Contador (que corresponde a la "Fecha de ingreso (legajo)", distinta de la "Fecha de ingreso (cálculo antigüedad)").
- **Motivo:** El campo ya existía en el schema pero estaba sin datos (se inicializaba igual a `fecha_alta` al crear el empleado). Se requería el valor correcto de SOS para mostrar en el recibo y usar en el LSD.
- **Resultado:** 240 actualizados, 17 no encontrados en nuestro DB (empleados en SOS sin registro importado aún), 0 errores.
- **Archivos:** `src/scripts/fecha-ingreso-sos.csv` (datos scrapeados), `src/scripts/update-fecha-ingreso.ts` (script de carga).

---

## 3) Cambios técnicos (implementación)

### 3.1 Backend / motor

- Sin cambios de lógica de negocio en el backend principal.

### 3.2 Frontend / UI

- `TablaReciboSos.tsx`: nuevo subtotal `sub411_414`, nuevo branch `sub411_414_qty` en el cascade de cálculo, corrección de bug preexistente (`memo` faltante en inicialización de edits).
- `sos-formula-display.ts`: label `S411-414`, leyenda y fórmula para el nuevo tipo de base.

### 3.3 Datos / DB / scripts

**Scripts ejecutados (y eliminados tras su uso):**

- `migrate-catalogos-prod.ts` — Migración catálogos AFIP en prod: UPSERT de filas locales (AFIP codes) + remap FKs de empleados/recibos/clients + eliminación de filas viejas (SOS-ID-coded). Resultado: 5 tablas en paridad (26/12/129/78/14 filas c/u).
- `import-recibos-prod.ts` — Importó 145 recibos + 1.914 concepto_valores desde prod a local, con remap de FKs de catálogos (distintos UUIDs entre DBs).
- `import-clientes-prod.ts` — Copió convenios/categorías/escalas faltantes de Pahue y Ngvs desde prod a local.

**Scripts ejecutados (y conservados para referencia):**

- `fecha-ingreso-sos.csv` + `update-fecha-ingreso.ts` — Scraping de `txfechaingreso_legajo` desde SOS Contador (35 empresas, 257 registros scrapeados) y carga en `liquidacion_import_empleado.fecha_ingreso`. Verificado contra SOS para Artzeinu x2 (Garay, Espindola) y Green Safety (Ramirez).

**Schema aplicado en prod:**
- `ALTER TABLE liquidacion_import_empleado ADD COLUMN IF NOT EXISTS fecha_ingreso date` — columna que existía en local pero faltaba en prod.

**Estado final de paridad local ↔ prod (tablas clave):**

| Tabla | Local | Prod |
|-------|-------|------|
| `payroll_situacion` | 26 | 26 ✓ |
| `payroll_condicion` | 12 | 12 ✓ |
| `payroll_actividad` | 129 | 129 ✓ |
| `payroll_modalidad_contratacion` | 78 | 78 ✓ |
| `payroll_siniestrado` | 14 | 14 ✓ |
| `liquidacion_import_empleado` | 241 | 241 ✓ |
| `liquidacion_import_recibo` | 164 | 166 (~) |
| `payroll_convenio` | 67 | 67 ✓ |
| `payroll_convenio_categoria` | 1.880 | 1.880 ✓ |
| `payroll_escala` | 7.420 | 7.420 ✓ |

Diferencias menores restantes: prod tiene 1 client extra (Gaabriel Sekzer, vacío) y 2 recibos extra de Abril.

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados o actualizados

- `Actualizaciones/2026-06-23 actualizacion.md` — este documento.
- `Documentacion Tecnica/Mejoras modulo de sueldos 23-6.md` — nuevo documento de seguimiento con análisis técnico y checklist de 7 ítems de mejora al módulo de sueldos.

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Observaciones

- Los catálogos de prod estaban en un estado **mixto** (parte con AFIP codes, parte con SOS IDs) por la migración manual de la sesión 2026-06-16. La migración de hoy limpió esa deuda técnica.
- Los FKs de empleados en prod ya apuntaban a las filas "canónicas" (AFIP-coded), por lo que el remap fue 0 en todos los casos — no hubo riesgo de pérdida de datos.

### 5.2 Pendiente inmediato

Del módulo de sueldos (ver `Documentacion Tecnica/Mejoras modulo de sueldos 23-6.md`):
- [ ] **Ítems 2+7 — Media jornada:** Implementar antes de cargar empleados `part_time`/`reducida` en producción.
- [ ] **Ítem 5 — SAC normal automático:** Requiere respuesta a 3 preguntas de negocio (trigger, alcance, conceptos del recibo SAC).
- [ ] **Ítems 3 y 4 — SAC proporcional y Vacaciones:** Pendientes de definición y dependencias.

De ayer (`2026-06-22 actualizacion.md`):
- [ ] **Scripts sin commitear:** `src/scripts/seed-ngvs-uocra.ts` y `src/scripts/seed-uocra-escalas.ts` — decidir si se incluyen o descartan.
- [ ] **Portal del Cliente:** Guard del módulo `portal_cliente` para ocultar el tab "Portal" cuando el módulo está desactivado en `organizationModule`.

De `Documentacion Tecnica/Pasos a seguir - Carga masiva recibos.md`:
- [ ] **Asignar categorías a empleados sin categoría** — Ngvs tiene 49 empleados sin categoría (prioridad alta), Termomecanica 16, Master Kids 4.
- [ ] **Cargar recibos Mayo 2026** para el resto de las empresas de Comercio 130/75 y Gastronómica 389/04 (Opción A: re-importar desde XLS de SOS, o Opción B: generar desde escala).
- [ ] **CCT sin escalas:** Construcción 76/75 (Brique, Constructora Ark-Fa, González Gustavo), Pasteleros 167/91+272/96 (Sabenumitubeja), Sanidad 459/06 (Admip SRL).
- [ ] **CCT desconocido:** Besorot Tovot, PNR Trade, Admip SRL — credenciales AFIP vencidas, no se pudo detectar el CCT automáticamente.

---

## 6) Archivos principales involucrados

- `src/scripts/migrate-catalogos-prod.ts` (ejecutado y eliminado)
- `src/scripts/import-recibos-prod.ts` (ejecutado y eliminado)
- `src/scripts/import-clientes-prod.ts` (ejecutado y eliminado)
- `src/scripts/fecha-ingreso-sos.csv`
- `src/scripts/update-fecha-ingreso.ts`
- `src/components/sueldos/TablaReciboSos.tsx` (concepto 415 / sub411_414_qty)
- `src/lib/sos-formula-display.ts` (label y fórmula sub411_414_qty)
- `src/scripts/seed-conceptos-sos-catalog.ts` (concepto 415 actualizado)
- `Documentacion Tecnica/Mejoras modulo de sueldos 23-6.md`
- `Actualizaciones/2026-06-23 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios técnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
