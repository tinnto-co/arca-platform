# Funcionalidad módulo de sueldos — arca-platform

Este documento describe el funcionamiento actual del módulo de sueldos en `arca-platform`: arquitectura, tablas, flujo de cálculo, qué lógica se toma del sistema SOS Contador como referencia, qué está implementado y qué falta.

> **Referencia complementaria:** `Documentacion Tecnica/Formuleo Sueldos SOS CONTADOR.md` — documenta el sistema externo SOS Contador en detalle (conceptos, fórmulas, campos, LSD).

---

## 1. Mapa general del módulo

### Archivos principales

| Tipo | Archivo |
|---|---|
| Ruta UI | `src/routes/_authed/sueldos/index.tsx` |
| Backend / acciones | `src/actions/sueldos.ts` |
| Motor de fórmulas | `src/lib/payroll-formula.ts` |
| Totales SOS (recibo) | `src/lib/sos-recibo-totales.ts` |
| Esquema DB | `drizzle/schema.ts` (tablas `payroll_*`, `liquidacion_import_*`, `lsd_*`, `obra_social`, `conceptos_completos_sos`) |

### Componentes de UI

| Componente | Función |
|---|---|
| `SueldosDashboard.tsx` | Vista general: KPIs, liquidación masiva, filtro por período |
| `SueldosEmpleados.tsx` | ABM de empleados / legajos, asignación de convenio y categoría |
| `SueldosConvenios.tsx` | ABM de convenios, categorías y escalas salariales |
| `SueldosConceptos.tsx` | Catálogo de conceptos de nómina por cliente |
| `SueldosRecibo.tsx` | Listado, detalle e impresión de recibos |
| `SueldosFirmaDigital.tsx` | Gestión de firma digital del empleador |
| `ReciboFormulario.tsx` | Formulario de nuevo recibo (cabecera) |
| `SueldosSimulador.tsx` | Simulador de liquidación |
| `TablaReciboSos.tsx` | Grilla de conceptos estilo SOS (edición de líneas del recibo) |

### Importación histórica (proyecto externo)

El proyecto `arca-scrapper` contiene los scripts que alimentan las tablas `liquidacion_import_*` con datos históricos del LSD y SOS:

- `arca-scrapper/src/scripts/import-liquidaciones-excel.ts`
- `arca-scrapper/src/scripts/import-conceptos-lsd.ts`
- Migraciones: `arca-scrapper/drizzle/0009_liquidacion_import_tables.sql`, `0010_concepto_sos.sql`, etc.

---

## 2. Tablas utilizadas por sección

### 2.1 Tablas nucleares

| Tabla | Descripción | Columnas clave |
|---|---|---|
| `payroll_convenio` | Convenios por cliente | `id`, `client_id`, `nombre`, `cct_codigo`, `activo` |
| `payroll_convenio_categoria` | Categorías dentro de cada convenio | `id`, `convenio_id`, `codigo`, `nombre`, `orden` |
| `payroll_escala` | Escalas salariales por categoría y vigencia | `categoria_id`, `vigencia_desde`, `vigencia_hasta`, `monto_basico`, `monto_no_remunerativo`, `periodo_label`, `fuente` |
| `payroll_concepto` | Conceptos de nómina del cliente | `client_id`, `codigo`, `tipo`, `formula`, `numero_sos`, `codigo_arca`, `base_columna`, `div_cantidad`, `div_hs_norm`, `imp_min`, `imp_max`, `activo`, `orden` |
| `liquidacion_import_empleado` | Legajo unificado (fuente maestra) | `profile_id`, `cuil`, `legajo`, `convenio_id`, `categoria_id`, `valor_sueldo`, `lugar_pago`, `forma_pago`, `cbu`, `banco`, `activo`, `obra_social_id` |
| `liquidacion_import_recibo` | Cabecera del recibo | `empleado_id`, `periodo`, `tipo`, `basico`, `haberes`, `no_remunerativo`, `descuentos`, `retenciones`, `neto`, `origen`, `recibo_confirmado`, datos de pago/cargas/obs |
| `liquidacion_import_concepto_valor` | Líneas de detalle por recibo | `recibo_id`, `codigo`, `monto`, `concepto_id`, `tipo_liquidacion`, `importe_override`, `cantidad`, `porcentaje`, `importe_concepto_numero`, `importe`, `importe_minimo`, `importe_maximo`, `activo_en_recibo`, `memo`, `pct_usado`, `base_usada` |
| `obra_social` | Catálogo de obras sociales | `codigo`, `nombre` |
| `conceptos_completos_sos` | Catálogo global de conceptos SOS | `numero_sos`, `codigo_afip`, `nombre`, `tiene_memo`, `tiene_cantidad`, `tiene_pct`, `tiene_imp_concepto_nro`, `tiene_importe`, `tiene_imp_min`, `tiene_imp_max`, `base_columna`, `div_hs_norm`, `div_cantidad` |
| `profile` | Perfil de cliente | `liquida_sueldos`, `firma_digital_empleador` |
| `afip_empleadores_convenio` | CCT/convenios por perfil según AFIP | — |
| `lsd_concepto_afip` | Catálogo de conceptos AFIP | — |
| `lsd_perfil_concepto` | Habilitación de conceptos AFIP por perfil | — |
| `concepto_sos` | Plantilla de conceptos SOS por cliente | — |
| `concepto_sos_profile` | Asociación concepto SOS ↔ perfil | — |

### 2.2 Uso por sección de UI

| Sección | Lee de | Escribe en |
|---|---|---|
| Dashboard | `liquidacion_import_recibo`, `liquidacion_import_empleado`, `profile`, `payroll_convenio` | — |
| Empleados | `liquidacion_import_empleado`, `payroll_convenio`, `payroll_convenio_categoria`, `obra_social` | `liquidacion_import_empleado` |
| Convenios | `payroll_convenio`, `payroll_convenio_categoria`, `payroll_escala`, `afip_empleadores_convenio` | `payroll_convenio`, `payroll_convenio_categoria`, `payroll_escala` |
| Conceptos | `payroll_concepto`, `lsd_concepto_afip`, `lsd_perfil_concepto`, `concepto_sos`, `concepto_sos_profile` | `payroll_concepto` |
| Nuevo recibo | `liquidacion_import_empleado`, `liquidacion_import_recibo`, `liquidacion_import_concepto_valor`, `concepto_sos_profile`, `concepto_sos` | `liquidacion_import_recibo`, `liquidacion_import_concepto_valor` |
| Recibo (detalle) | Todas las tablas del módulo | `liquidacion_import_recibo` (confirmación) |

---

## 3. Lógica de cálculo — cómo funciona

### 3.1 Habilitación de clientes

Solo procesan liquidaciones los perfiles con `profile.liquida_sueldos = true`. Este flag se gestiona vía el script `src/scripts/seed-liquida-sueldos.ts`.

---

### 3.2 Datos maestros necesarios para calcular

Para calcular un recibo se necesitan estos datos resueltos de antemano:

| Dato | Fuente |
|---|---|
| Sueldo básico del período | `payroll_escala` (por `categoria_id` + rango de vigencia) |
| Antigüedad | Calculada desde `liquidacion_import_empleado.fecha_alta` y el período |
| Categoría y convenio | `liquidacion_import_empleado` → `payroll_convenio_categoria` |
| Conceptos activos y su fórmula | `payroll_concepto` (ordenados por `orden`) |
| Valores manuales del recibo | `liquidacion_import_concepto_valor` (cantidad, porcentaje, importe, etc.) |

---

### 3.3 Flujo de creación de recibo

1. Validar que el período sea liquidable (regla actual: mes anterior)
2. Validar que el empleado tenga convenio y categoría asignados
3. Crear/actualizar cabecera en `liquidacion_import_recibo`
4. Cargar conceptos iniciales por uno de dos modos:
   - **Copiar último recibo:** recupera `liquidacion_import_concepto_valor` del período anterior
   - **Plantilla SOS:** usa `concepto_sos_profile` → `concepto_sos`

---

### 3.4 Cálculo de cada concepto (`calcularUnaLiquidacion`)

Para cada concepto habilitado, en orden de `payroll_concepto.orden`:

```
1. Determinar la base:
   - baseColumna = 'sueldo'       → valor del sueldo del período
   - baseColumna = 'valHora'      → sueldo ÷ horasNormalesMes
   - baseColumna = 'sub1_9'       → acumulado conceptos 1–9 ya calculados
   - baseColumna = 'sub1_19'      → acumulado conceptos 1–19
   - baseColumna = 'sub1_26'      → acumulado conceptos 1–26
   - baseColumna = 'sub1_39'      → acumulado conceptos 1–39
   - baseColumna = 'sub1_199'     → total remunerativo (base de retenciones)
   - baseColumna = 'sub411_469'   → total no remunerativo (base de reten. s/no-rem)
   - baseColumna = 'importe_fijo' → importe ingresado manualmente
   - baseColumna = 'ref_concepto' → monto calculado de otro concepto (refConceptoId)

2. Aplicar fórmula (evaluatePayrollFormula):
   resultado = base ÷ divHsNorm ÷ divCantidad × cantidad × (pct / 100)

3. Aplicar override manual si existe (importe_override en la línea)

4. Aplicar piso/techo:
   si resultado < impMin → resultado = impMin
   si resultado > impMax → resultado = impMax

5. Acumular al subtotal running correspondiente (sub1_9, sub1_199, etc.)

6. Clasificar en columna destino según número SOS del concepto
```

**Motor de fórmulas:** `src/lib/payroll-formula.ts` — evalúa expresiones seguras con variables numéricas. Variables disponibles: `basico`, `antiguedad`, `bruto`, `totalRemunerativo`, `totalNoRemunerativo`, `totalDescuentos`, `neto`, `horasExtra`, `presentismo`, `comisiones`, `bonos`, `cantidad`, `valor`.

---

### 3.5 Clasificación en columnas del recibo

La columna destino de cada concepto se determina por el **rango del número SOS**:

| Rango N° SOS | Columna | Acumula en |
|---|---|---|
| 1 – 99 | Haberes | `sub1_9` → `sub1_19` → `sub1_26` → `sub1_39` → `sub1_199` |
| 100 – 199 | Descuentos | Resta del total remunerativo |
| 200 – 299 | Retenciones | Total retenciones |
| 300 – 399 | *(sin asignar en SOS)* | — |
| 400 – 408 | Egresos / indemnizatorios | Sección aparte (no integran bruto mensual) |
| 411 – 562 | No Remunerativo / Reten. s/no-rem | `sub411_469` |
| 601 – 620 | No Remunerativo (decretos recientes) | `sub411_469` |

> Rangos efectivamente usados en SOS: ver `Documentacion Tecnica/Formuleo Sueldos SOS CONTADOR.md` sección 7.0.

Cuando un concepto no tiene `numero_sos`, la clasificación cae en cascada:
1. `numero_sos` → rango
2. `codigo_arca` (ej: `81xxxx`/`82xxxx` → retenciones)
3. `tipo_liquidacion` / `payroll_concepto.tipo` como último recurso

---

### 3.6 Guardado del recibo (grilla SOS)

Al guardar desde la grilla `TablaReciboSos`:

1. Se recalculan totales con `totalesReciboSosDesdeMontos`: `basico`, `haberes`, `no_remunerativo`, `descuentos`, `retenciones`, `neto`
2. Upsert de cabecera en `liquidacion_import_recibo`
3. Delete + insert de líneas en `liquidacion_import_concepto_valor`

---

### 3.7 Liquidación masiva

`calcularLiquidacionMasiva` recorre los empleados activos del perfil y llama a `calcularUnaLiquidacion` por cada uno. Persiste en `liquidacion_import_recibo` y `liquidacion_import_concepto_valor`.

---

### 3.8 Confirmación e impresión

- `confirmarReciboLiquidacion` → `recibo_confirmado = true` en cabecera
- `getReciboDetalle` compone la vista final uniendo todas las tablas del módulo
- Firma digital: controlada por flag `profile.firma_digital_empleador`

---

## 4. Qué se toma de la lógica de SOS Contador

El sistema SOS Contador es la fuente de verdad para la estructura de conceptos y fórmulas. Nuestro sistema replica su lógica. Los puntos de contacto son:

### 4.1 Catálogo de conceptos

La tabla `conceptos_completos_sos` (231 filas, seeded en 2026-04-16) es el catálogo global de todos los conceptos SOS con:
- `numero_sos` — número interno SOS (clave de mapping)
- `codigo_afip` — código AFIP/SIJP para el LSD
- `base_columna` — qué columna oculta usa como base (`sueldo`, `sub1_199`, etc.)
- `div_hs_norm` — divisor de horas (1 o 180)
- `div_cantidad` — divisor de días (1, 25 o 30)
- Flags de campos visibles: `tiene_cantidad`, `tiene_pct`, `tiene_importe`, etc.

Este catálogo es la referencia para configurar correctamente cada `payroll_concepto` del cliente.

### 4.2 Fórmula base de cada concepto

Cada concepto SOS tiene una fórmula definida por su `base_columna` + `div_hs_norm` + `div_cantidad`. Al crear o configurar un `payroll_concepto`, esos valores deben tomarse de `conceptos_completos_sos`:

```
baseUnitaria = base ÷ divHsNorm ÷ divCantidad
resultado    = baseUnitaria × cantidad × (pct / 100)
resultado    = clamp(resultado, impMin, impMax)
```

### 4.3 Subtotales acumulados (orden crítico)

SOS calcula los subtotales `sub1_9`, `sub1_19`, `sub1_26`, `sub1_39`, `sub1_199`, `sub411_469` de forma acumulativa, en orden de número de concepto. Conceptos que usan un subtotal como base deben calcularse **después** de que todos los conceptos de ese rango estén resueltos. El campo `payroll_concepto.orden` debe respetar este orden.

### 4.4 Clasificación de columnas por rango

La asignación Haberes/Descuentos/Retenciones/No Remunerativo se hace por rango de `numero_sos`, no por configuración libre. Ver sección 3.5.

### 4.5 Campos de entrada del recibo

Los 6 campos de escritura de SOS mapean directamente a columnas de `liquidacion_import_concepto_valor`:

| Campo SOS | Columna en nuestra tabla |
|---|---|
| Cantidad | `cantidad` |
| % | `porcentaje` |
| Imp. Conc. N° | `importe_concepto_numero` |
| Importe | `importe` |
| Imp. Mínimo | `importe_minimo` |
| Imp. Máximo | `importe_maximo` |

---

## 5. Historial de lo que se fue construyendo

### Fase 1 — Importación histórica de datos SOS
- Tablas `liquidacion_import_*` creadas para recibir datos importados desde LSD y excels SOS
- Scripts de importación en `arca-scrapper`
- Catálogo `concepto_sos` y `concepto_sos_profile` para plantillas de recibo por cliente

### Fase 2 — Convenios y escalas salariales
- Tablas `payroll_convenio`, `payroll_convenio_categoria`, `payroll_escala`
- UI `SueldosConvenios` para ABM y carga de escalas
- Seed de escalas para CCT 130/75 (Comercio): `src/scripts/seed-comercio-mar2026.ts`, `seed-comercio-abr2026.ts`
- Seed del concepto 411 (suma fija no remunerativa $100.000) incluido en esos scripts

### Fase 3 — Motor de fórmulas y conceptos de nómina
- `src/lib/payroll-formula.ts` — evaluador seguro de expresiones sin `eval()`
- `src/lib/payroll-period-rules.ts` — reglas de período liquidable
- Tabla `payroll_concepto` con campos `base_columna`, `div_cantidad`, `div_hs_norm`, `imp_min`, `imp_max`, `ref_concepto_id`
- `calcularUnaLiquidacion` y `calcularLiquidacionMasiva` en `src/actions/sueldos.ts`

### Fase 4 — Legajos y empleados
- `liquidacion_import_empleado` como fuente maestra de legajos
- Backfill de datos personales desde Excels SOS: `src/scripts/backfill-empleado-legajo-desde-excels.ts`
- Parser dedicado para formato SOS: `src/lib/parse-sos-legajos-sheet.ts`
- Normalización de nombres a Title Case: `src/scripts/normalizar-nombres-empleados-title-case.ts`
- Columnas adicionales de legajo: `src/scripts/ensure-empleado-legajo-extra-columns.ts`
- Campo `obra_social_id` en empleado: `src/scripts/ensure-empleado-obra-social-column.ts`
- Flag `liquida_sueldos` por perfil: `src/scripts/seed-liquida-sueldos.ts`
- UI `SueldosEmpleados` con filtros por período, checkbox activo, selector de obra social
- UI `SueldosDashboard` con filtro por período

### Fase 5 — Recibo con datos SOS
- `SueldosRecibo.tsx` actualizado con columnas `tipo_liquidacion` y totales desde la grilla SOS
- Campos de firma digital: `SueldosFirmaDigital.tsx`
- Datos de pago por legajo (CBU, banco, forma de pago) en el recibo

### Fase 6 — Catálogo global de conceptos SOS (2026-04-16)
- Tabla `conceptos_completos_sos` creada en DB con los 231 conceptos SOS
- Seed: `src/scripts/seed-conceptos-sos-catalog.ts` (idempotente, soporta `--dry-run`)
- Incluye: base de cálculo, div_hs_norm, div_cantidad, campos de entrada visibles, código AFIP
- Cubre los 13 conceptos nuevos detectados en la última revisión (430–438, 601–605)

---

## 6. Qué falta implementar

### 6.1 Crítico — afecta corrección del cálculo

**Subtotales acumulados en el motor de fórmulas**
- El motor `evaluatePayrollFormula` recibe un contexto estático (`basico`, `bruto`, etc.) pero **no tiene las variables de subtotales** `sub1_9`, `sub1_19`, `sub1_26`, `sub1_39`, `sub1_199`, `sub411_469`.
- Los conceptos que usan esas bases (antigüedad comp., retenciones, etc.) no pueden calcularse correctamente sin esos valores en contexto.
- **Solución:** el motor de cálculo debe mantener un acumulado running por rango y pasarlo como contexto a cada concepto en su turno.

**`divHsNorm` y `divCantidad` no totalmente integrados**
- Los campos existen en `payroll_concepto` pero el flujo de `calcularUnaLiquidacion` no los aplica consistentemente al evaluar la fórmula.
- La fórmula actual en texto (campo `formula`) a veces hardcodea el divisor en lugar de leerlo del campo.
- **Solución:** separar la fórmula de los divisores: calcular `baseUnitaria = base ÷ divHsNorm ÷ divCantidad` antes de pasar al evaluador, no codificarlo en el string de fórmula.

**Concepto de referencia (`ref_concepto_id`)**
- El campo existe en schema pero no está implementado en el motor de cálculo.
- Conceptos que usan "Imp. Conc. N°" (referencia a otro concepto como base) no funcionan.
- **Solución:** antes de calcular un concepto con `baseColumna = 'ref_concepto'`, resolver primero el concepto referenciado y pasar su monto como base.

### 6.2 Alto — afecta consistencia de datos

**Cálculo no transaccional**
- `calcularUnaLiquidacion` hace delete + múltiples inserts sin transacción explícita.
- Un error a mitad del proceso deja el recibo en estado inconsistente.
- **Solución:** envolver en `db.transaction(...)`.

**Borrado de recibos demasiado amplio al crear cabecera**
- La creación elimina por `empleado_id + periodo` sin discriminar `tipo` de recibo.
- Puede borrar un SAC o vacaciones del mismo mes al crear el recibo de sueldo.
- **Solución:** filtrar el delete por `tipo` además de `empleado_id + periodo`.

**Tipo `retencion` no soportado en la UI de conceptos**
- El enum de DB tiene `retencion` pero los validadores de creación/edición de `payroll_concepto` solo permiten `remunerativo`, `no_remunerativo`, `descuento`.
- Los conceptos 201–234 y 501–562 no se pueden crear desde la UI.
- **Solución:** alinear validadores y formularios con todos los tipos del schema.

### 6.3 Medio — afecta usabilidad y escalabilidad

**Restricción rígida al mes anterior**
- No se pueden reliquidar meses históricos ni hacer pruebas de períodos pasados.
- **Solución:** permitir excepciones por permiso o flag de entorno.

**Clasificación de columnas hardcodeada en múltiples lugares**
- Las reglas de rango (qué N° SOS va a qué columna) están repetidas en distintas funciones.
- `conceptos_completos_sos` debería ser la fuente única de verdad para esto.
- **Solución:** centralizar en una función que consulte el catálogo o use las constantes de rangos en un solo lugar.

**N+1 en procesos masivos**
- La liquidación masiva y la sincronización de convenios operan fila a fila.
- Con muchos empleados la latencia se acumula.
- **Solución:** operaciones bulk/batch donde sea posible.

### 6.4 Deuda técnica

| Ítem | Descripción |
|---|---|
| Referencias obsoletas a `payroll_liquidacion` | Existen comentarios/nombres del modelo anterior. Limpiar y documentar el modelo vigente `liquidacion_import_*` como estándar. |
| Campos de auditoría incompletos | `pct_usado` y `base_usada` en `liquidacion_import_concepto_valor` quedan nulos. Completarlos mejoraría la trazabilidad de cada monto. |
| Normalización de período | `YYYY-MM` vs `YYYY-M` aparece inconsistente en distintas funciones. Extraer helper `parsePeriodo()`. |
| Desacople import histórico / reglas actuales | El pipeline `arca-scrapper` puede cargar datos que no cumplan las validaciones del módulo principal. |

---

## 7. Próximos pasos recomendados

En orden de impacto:

1. **Implementar subtotales acumulados en el motor** — sin esto, el cálculo de retenciones y adicionales sobre subtotales es incorrecto.
2. **Separar `divHsNorm` / `divCantidad` de las fórmulas** — aplicarlos como pre-proceso antes del evaluador.
3. **Implementar `ref_concepto`** — necesario para SAC, vacaciones proporcionales y conceptos en cascada.
4. **Wrappear cálculo en transacción** — evitar estados inconsistentes.
5. **Corregir borrado de cabecera** — filtrar por `tipo` para no perder otros recibos del mes.
6. **Habilitar tipo `retencion` en UI de conceptos** — para poder cargar jubilación, OS, sindicato desde la interfaz.
7. **Centralizar clasificación por rangos SOS** — usar `conceptos_completos_sos` como fuente única.
8. **Habilitar reliquidaciones históricas** — con control de permisos.
