# Actualizacion - 2026-04-28

## 1) Objetivo general del dia

Reconstrucción completa de la infraestructura de escalas salariales para Comercio (CCT 130/75) y enlace de categorías a los 49 empleados de comercio activos en la plataforma. Se eliminaron filas corruptas (códigos alfabéticos mezclados con numéricos), se recrearon las categorías y escalas de cinco períodos (Marzo 2026 – Julio 2026 en adelante), se creó la tabla canónica `empleados_categorias`, y se asignó `categoria_id` a cada empleado para que el sistema pueda actualizar automáticamente su básico desde la escala publicada por estudiovilaplana.

---

## 2) Cambios funcionales (impacto en operacion)

### 2.1 Eliminacion de filas con codigos alfabeticos corruptos

- **Cambio:** Se borraron todas las filas de `payroll_convenio_categoria`, `payroll_escala`, `payroll_concepto` y `liquidacion_import_concepto_valor` que tenían códigos alfabéticos (ej. `MA_A`, `ADM_C`, etc.) mezclados con los registros numéricos originales del sistema.
- **Motivo:** Esos registros eran residuo de importaciones previas mal integradas. Convivían con conceptos numéricos del módulo SOS y generaban ambigüedad en las consultas de escala.
- **Impacto:** Queda una única fuente de verdad por empleado: la escala vigente del convenio, accedida por `categoria_id`.
- **Archivos:** DB directa (no hay archivo de migración; operación one-off).

### 2.2 Recreacion de categorias y escalas CCT 130/75 (5 periodos)

- **Cambio:** Se crearon 777 filas en `payroll_convenio_categoria` (37 convenios × 21 categorías) y 3.885 filas en `payroll_escala` (37 convenios × 21 categorías × 5 períodos).
- **Períodos cubiertos:**
  - Marzo 2026 (resumen) — con No Remunerativo $100.000
  - Abril 2026 — NR $120.000
  - Mayo 2026 — NR $120.000
  - Junio 2026 — NR $120.000
  - Julio 2026 – Marzo 2031 (absorción NR) — sin NR
- **Fuente:** estudiovilaplana.com.ar/escala-salarial-empleados-comercio/
- **Archivos:** `src/scripts/seed-comercio-categorias.ts`, `src/scripts/seed-comercio-escalas-bulk.ts`

### 2.3 Creacion de tabla canonica `empleados_categorias`

- **Cambio:** Nueva tabla permanente con 21 filas (una por categoría Comercio). Columnas: `codigo`, `nombre`, `cct_codigo`, `fuente`. Constraint UNIQUE `(codigo, cct_codigo)`.
- **Motivo:** Provee el mapeo estable texto → código independientemente del `convenio_id`. Permite agregar futuros CCTs (ej. Gastronomico 389/04) con sus propias categorías.
- **Archivos:** `src/scripts/setup-empleados-categorias.ts`

### 2.4 Enlace de categoria_id a 49 empleados de Comercio

- **Cambio:** Se recorrieron todos los empleados de `liquidacion_import_empleado` con convenio CCT 130/75 y se asignó `categoria_id` apuntando al registro correcto de `payroll_convenio_categoria`. Adicionalmente, cuando el `valor_sueldo` almacenado era idéntico al básico de Marzo 2026 de esa categoría, se limpió (`NULL`) para que el sistema use la escala automáticamente.
- **Resultado:**
  - 49 empleados con `categoria_id` correctamente enlazado
  - 0 empleados con `valor_sueldo` override activo (todos usan escala)
- **Texto-a-código:** normalización NFD + minúsculas + colapso de espacios, más tabla de aliases (ej. `"Auxiliar A"` → `AUX_A`, `"Vendedor Categoria A"` → `VEN_A`).
- **Archivos:** `src/scripts/setup-empleados-categorias.ts`, `src/scripts/link-empleados-categorias.ts`

### 2.5 Eliminacion del override manual de Piccini, Matias Jorge

- **Cambio:** Se limpió el `valor_sueldo = $1.500.000` que tenía seteado manualmente el empleado Piccini, Matias Jorge (E-Presis, categoría AUESP_B). Ahora usa la escala automática de su categoría.
- **Motivo:** El override era incorrecto; el empleado debe seguir la escala CCT como el resto.
- **Archivos:** DB directa.

---

## 3) Cambios tecnicos (implementacion)

### 3.1 Scripts creados

| Script | Descripcion |
|--------|-------------|
| `src/scripts/seed-comercio-categorias.ts` | Crea 21 categorías Comercio en `payroll_convenio_categoria` para todos los convenios CCT 130/75. Usa bulk insert para evitar timeout en conexión remota. |
| `src/scripts/seed-comercio-escalas-bulk.ts` | Elimina escalas existentes de CCT 130/75 e inserta 3.885 filas de `payroll_escala` para 5 períodos. Reemplaza a `seed-comercio-mar2026.ts` y `seed-comercio-abr2026.ts`. |
| `src/scripts/setup-empleados-categorias.ts` | Crea tabla `empleados_categorias`, carga 21 categorías Comercio, asigna `convenio_id` a empleados que no lo tenían, y enlaza `categoria_id` + limpia overrides equivalentes a la escala. |
| `src/scripts/link-empleados-categorias.ts` | Re-enlace idempotente de `categoria_id` para todos los empleados CCT 130/75 con texto en `categoria`. Útil para correr después de modificar aliases o agregar empleados. |
| `src/scripts/reporte-categorias-enlazadas.ts` | Muestra en consola el estado de los empleados CCT 130/75 con `categoria_id` enlazado: empresa, empleado, texto original, código, categoría y override. |
| `src/scripts/reporte-categorias-tabla.ts` | Misma info que el anterior pero formateada como tabla ASCII alineada. |

### 3.2 Problemas encontrados y soluciones

- **FK `ON DELETE RESTRICT`:** `liquidacion_import_empleado.categoria_id` bloqueaba borrar `payroll_convenio_categoria`. Solución: nullificar `categoria_id` en los 16 empleados afectados antes del DELETE.
- **Timeout en inserts remotos:** Los inserts row-by-row (777 + 3.108 queries) cortaban la conexión remota. Solución: reescribir a un único `INSERT ... VALUES (...)` con todos los registros.
- **Empleados sin `convenio_id`:** 7 empleados del Grupo B tenían `convenio_id = NULL`. El JOIN los excluía. Solución: UPDATE previo que asigna `convenio_id` a empleados cuya empresa tiene exactamente un convenio CCT 130/75.
- **Asignación incorrecta de `convenio_id`:** El UPDATE inicial asignó convenio a 21 empleados incluyendo 14 de categorías no-Comercio (AYUDANTE, OFICIAL DE SECCION — probablemente Gastronomico). Solución: revertir `convenio_id = NULL` para los 14 que no tuvieron match de categoría.
- **Typo `c = codigo` en catMap.get:** asignación en lugar de referencia de variable. Corregido a `${codigo}`.

### 3.3 Base de datos

- Tabla nueva: `empleados_categorias` (`id uuid PK`, `codigo text`, `nombre text`, `cct_codigo text`, `fuente text`, `created_at timestamp`, UNIQUE `(codigo, cct_codigo)`)
- Sin cambios de schema en Drizzle (tabla gestionada directamente con `postgres.js`).

---

## 4) Documentacion y trazabilidad

### 4.1 Documentos creados

- `Actualizaciones/2026-04-28 actualizacion.md` (este archivo)

---

## 5) Riesgos, observaciones y pendientes

### 5.1 Riesgos detectados

- **Gastronomico (CCT 389/04):** 26 empresas con este convenio, sin categorías ni escalas cargadas aún. Los empleados con categorías como AYUDANTE, OFICIAL DE SECCION, SANGUCHERO, PEON LIMPIEZA, AYUDANTE PASTELERO pertenecen a este CCT y no tienen `categoria_id`. Por ahora siguen con `valor_sueldo` manual o sin básico.
- **Empleados sin texto de categoría:** Existen empleados con `categoria IS NULL` y `convenio_id` asignado. Si tampoco tienen `valor_sueldo`, el recibo no puede calcular el básico. Requieren revisión manual.
- **Escalas futuras:** El período "Julio 2026 – Marzo 2031" usa los mismos básicos de Junio 2026. Cuando se publiquen nuevas paritarias habrá que correr el seed nuevamente o agregar un período adicional.

### 5.2 Pendiente inmediato

- Cargar escalas para Gastronomico (CCT 389/04) cuando estén disponibles y aplicar la misma lógica de enlace de categorías.
- Revisar los ~36 empleados con `valor_sueldo` no estándar (ej. $1.500.000 intencionales, montos fraccionarios) para decidir si se mantienen como override o se depuran.
- Evaluar si `empleados_categorias` debe exponerse en la UI para que el operador pueda ver/editar el enlace de categoría de cada empleado sin correr scripts.

---

## 6) Archivos principales involucrados

- `src/scripts/seed-comercio-categorias.ts`
- `src/scripts/seed-comercio-escalas-bulk.ts`
- `src/scripts/setup-empleados-categorias.ts`
- `src/scripts/link-empleados-categorias.ts`
- `src/scripts/reporte-categorias-enlazadas.ts`
- `src/scripts/reporte-categorias-tabla.ts`
- `Actualizaciones/2026-04-28 actualizacion.md`

---

## 7) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios tecnicos documentados.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del dia guardado con fecha correcta.
