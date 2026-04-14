# Fases de migración — Tablas de sueldos

## Contexto

El módulo de sueldos fue creciendo en dos capas separadas que terminaron duplicando información:

- **Tablas `payroll_*`**: creadas en una etapa inicial con datos hardcodeados y lógica de configuración. Son las tablas "viejas".
- **Tablas `liquidacion_import_*`**: creadas posteriormente para importar datos reales de archivos LSD de AFIP. Son la fuente de verdad con información real de empleados, recibos y conceptos.

El objetivo de esta migración es **eliminar las tablas `payroll_*` que duplican información** (empleados, recibos, detalle de conceptos) y usar las tablas `liquidacion_import_*` como fuente de verdad única, extendidas con los campos necesarios para generar nuevos recibos.

---

## Tablas involucradas

### Tablas a eliminar (eventualmente)

| Tabla | Qué tenía |
|---|---|
| `payroll_employee` | Padrón activo de empleados por cliente |
| `payroll_liquidacion` | Cabecera de recibos generados (totales, fechas, forma de pago) |
| `payroll_liquidacion_detalle` | Detalle línea por línea de cada recibo generado |

### Tablas que se mantienen (configuración)

| Tabla | Qué tiene |
|---|---|
| `payroll_convenio` | Convenios colectivos de trabajo (CCT) por cliente |
| `payroll_convenio_categoria` | Categorías dentro de cada convenio |
| `payroll_escala` | Básicos vigentes por categoría y período |
| `payroll_concepto` | Conceptos salariales con fórmulas de cálculo |

### Tablas destino (fuente de verdad)

| Tabla | Qué tiene |
|---|---|
| `liquidacion_import_empleado` | Empleados del perfil que liquida sueldos |
| `liquidacion_import_recibo` | Recibos por empleado y período |
| `liquidacion_import_concepto_valor` | Detalle de conceptos por recibo |

---

## Fase 1 — Extender `liquidacion_import_empleado` ✓ Completada

### Qué se hizo

Se extendió la tabla `liquidacion_import_empleado` con todos los campos operativos que antes solo existían en `payroll_employee`.

**Campos agregados:**

| Campo | Tipo | Para qué sirve |
|---|---|---|
| `convenio_id` | FK → `payroll_convenio` | Convenio colectivo del empleado |
| `categoria_id` | FK → `payroll_convenio_categoria` | Categoría dentro del convenio |
| `tipo_jornada` | enum (full_time / part_time / reducida) | Tipo de jornada laboral |
| `tipo_empleador` | enum (dec814_inc_a / b / c) | Tipo de empleador para LSD |
| `tarea` | text | Descripción del puesto (sin tildes para LSD) |
| `horas_mensuales_normales` | integer | Base para calcular valor hora |
| `dias_mensuales_normales` | integer (default 30) | Base para cálculo proporcional |
| `valor_hora` | numeric | Override del básico del convenio |
| `valor_sueldo` | numeric | Override del básico del convenio |
| `porcentaje_aporte_adicional_ss` | numeric | Aporte adicional de Seguridad Social |
| `activo` | boolean | Si el empleado está activo |

También se agregaron a `liquidacion_import_concepto_valor` los campos del LSD importado que ya existían en la DB pero no estaban en el schema (Drizzle los quería borrar):

| Campo | Para qué sirve |
|---|---|
| `cantidad` | Días, horas o unidades tal como vienen en el LSD |
| `porcentaje` | Porcentaje del concepto según el LSD |
| `importe_concepto_numero` | Importe del concepto referenciado |
| `importe` | Importe base antes de aplicar mínimo/máximo |
| `importe_minimo` | Piso del concepto según el LSD |
| `importe_maximo` | Techo del concepto según el LSD |

### Por qué se hizo así

- `liquidacion_import_empleado` apunta a `profile` (no a `client`) porque no todos los clientes liquidan sueldos, y un cliente puede tener múltiples perfiles que sí liquidan.
- Los campos operativos son todos nullable para que los registros importados del LSD (que no tienen esta info) queden sin completar hasta que se vinculen manualmente.
- El campo `nombre` guarda el nombre completo (no separado en nombre/apellido) porque el LSD no distingue entre los dos.

### Errores encontrados durante `db:push`

| Error | Causa | Solución |
|---|---|---|
| `total_retenciones contains null values` | Columna NOT NULL con nulls en la DB | UPDATE payroll_liquidacion SET total_retenciones = 0 WHERE total_retenciones IS NULL |
| `numero_sos cannot be cast to integer` | Columna guardada como text en la DB | ALTER COLUMN numero_sos TYPE integer USING numero_sos::integer |
| `div_hs_norm cannot be cast to boolean` | Columna guardada como text en la DB | ALTER COLUMN div_hs_norm TYPE boolean USING div_hs_norm::boolean |

### Script de migración de datos

Se creó `src/scripts/migrate-payroll-employee-to-import.ts` que:
- Lee todos los registros de `payroll_employee`
- Si el CUIL ya existe en `liquidacion_import_empleado` (mismo profileId), actualiza los campos operativos
- Si no existe, inserta el registro con `origen = "manual"`
- Resuelve el `profileId` a partir del vínculo `importEmpleadoId` o del primer perfil del `clientId`

---

## Fase 2 — Extender `liquidacion_import_recibo` ✓ Completada

### Qué se hizo

Se extendió `liquidacion_import_recibo` con los campos que antes solo existían en `payroll_liquidacion`, para que pueda representar tanto los recibos históricos importados como los nuevos recibos generados.

**Campos a agregar:**

| Campo | Para qué sirve |
|---|---|
| `basico` | Básico del período |
| `quincena` | 0 = mes completo, 1 = primera quincena, 2 = segunda |
| `obra_social_id` | FK a obra_social |
| `fecha_pago` | Fecha de pago del recibo |
| `lugar_pago` | Lugar de pago |
| `forma_pago` | efectivo / cheque / acreditacion |
| `cbu`, `banco` | Datos bancarios |
| `periodo_cargas`, `fecha_deposito_cargas` | Período de cargas depositado |
| `situacion_revista` | Situación del empleado en el período |
| `observacion_interna`, `observacion_recibo` | Notas |
| `rem4y8_override`, `rem9_override` | Overrides de remuneración para LSD |
| `contribucion_tarea_diferencial` | Contribución SS para tareas diferenciales |
| `importe_a_detraer_ley27430` | Deducción por Ley 27430 |
| `contribucion_adicional_os` | Contribución adicional OS |
| `recibo_confirmado` | Si el recibo fue confirmado |
| `calculado_at` | Timestamp del último cálculo |

Los recibos nuevos generados por el sistema van a tener `origen = "generado"` para distinguirlos de los importados.

---

## Fase 3 — Extender `liquidacion_import_concepto_valor` ✓ Completada

### Qué se hizo

Se agregó el vínculo a `payroll_concepto` y los campos de inputs/auditoría del cálculo:

| Campo | Para qué sirve |
|---|---|
| `concepto_id` | FK nullable a payroll_concepto (los importados no lo tienen) |
| `cantidad` | Días, horas, unidades (ya existe) |
| `pct` | Porcentaje override |
| `importe_override` | Override manual del resultado |
| `activo_en_recibo` | Si el concepto está activo en este recibo |
| `memo` | Nota personalizada |
| `pct_usado` | Porcentaje efectivamente usado (auditoría) |
| `base_usada` | Base usada en el cálculo (auditoría) |

---

## Fase 4 — Actualizar el código ✓ Completada

Actualizar `src/actions/sueldos.ts` y los componentes para que lean y escriban en las tablas `liquidacion_import_*` en lugar de `payroll_employee`, `payroll_liquidacion` y `payroll_liquidacion_detalle`.

### Archivos afectados

- `src/actions/sueldos.ts` (40+ server functions)
- `src/components/sueldos/SueldosDashboard.tsx`
- `src/components/sueldos/SueldosRecibo.tsx`
- `src/components/sueldos/SueldosSimulador.tsx`
- `src/components/sueldos/SueldosEmpleados.tsx`
- `src/components/sueldos/ReciboFormulario.tsx`
- `src/scripts/map-import-empleados-a-convenios.ts`

### Cambios clave en `sueldos.ts`

- `empleadoId` ahora apunta a `liquidacion_import_empleado.id`
- `liquidacionId` renombrado a `reciboId` (apunta a `liquidacion_import_recibo.id`)
- Campos renombrados: `tipoRecibo→tipo`, `totalRemunerativo→haberes`, `totalDescuentos→descuentos`, `totalRetenciones→retenciones`, `pct→porcentaje`, `importeConceptoN→importeConceptoNumero`, `impMin→importeMinimo`, `impMax→importeMaximo`
- `deleteEmpleado` ahora hace soft-delete (`activo = false`) en vez de borrar físicamente
- `eliminarLiquidacionesDelPeriodo` solo borra recibos con `origen = 'generado'` (protege los importados)
- Autorización vía `liquidacion_import_empleado → profile WHERE profile.client = clientId`

---

## Fase 5 — Eliminar tablas payroll ✓ Completada

### Qué se hizo

1. Se removieron las definiciones de `payrollEmployee`, `payrollLiquidacion` y `payrollLiquidacionDetalle` de `drizzle/schema.ts`.
2. Se actualizó `src/scripts/map-import-empleados-a-convenios.ts` para operar directamente sobre `liquidacion_import_empleado` (ya no busca ni actualiza `payroll_employee`).
3. Se actualizó `src/scripts/report-unmatched-import-empleados.ts` para detectar empleados sin convenio chequeando `liquidacion_import_empleado.convenioId IS NULL` (ya no consulta `payroll_employee`).
4. Se eliminó el script `src/scripts/migrate-payroll-employee-to-import.ts` (ya cumplió su propósito).
5. Se corrió `bun run db:push` para que Drizzle emita los `DROP TABLE` en la base de datos.

### Tablas eliminadas de la base de datos

```sql
DROP TABLE payroll_liquidacion_detalle;
DROP TABLE payroll_liquidacion;
DROP TABLE payroll_employee;
```

### Por qué se pudo eliminar `payroll_employee`

Todos los empleados ya estaban migrados a `liquidacion_import_empleado` (con sus campos operativos: convenio, categoría, jornada, tarea, etc.). El campo `importEmpleadoId` en `payroll_employee` era el vínculo, pero ya no tiene razón de existir.

### Tablas que se mantienen

Las tablas `payroll_convenio`, `payroll_convenio_categoria`, `payroll_escala` y `payroll_concepto` se mantienen ya que no tienen equivalente en las tablas import — son configuración, no datos duplicados.
