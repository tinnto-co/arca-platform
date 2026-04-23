# Modificaciones módulo sueldos — 8/4/2026

## Contexto

El módulo de sueldos tenía dos tablas de empleados desconectadas:

| Tabla | Fuente | Campos |
|---|---|---|
| `liquidacion_import_empleado` | Excel LSD | cuil, legajo, nombre, fechaAlta, fechaBaja, modoContrato, categoria |
| `payroll_employee` | Manual (config liquidación) | convenioId, categoriaId, tipoJornada, fechaIngreso |

El problema: la pestaña Empleados y el Simulador apuntaban a tablas distintas.

## Decisión

`liquidacion_import_empleado` pasa a ser la **fuente única de empleados**. `payroll_employee` se convierte en la *configuración de liquidación* opcional de un empleado.

## Cambios de schema

### `liquidacion_import_empleado`
- Se agrega columna `origen text NOT NULL DEFAULT 'import'`: distingue empleados importados desde Excel (`'import'`) de los creados manualmente en el sistema (`'manual'`).

### `payroll_employee`
- Se agrega columna `import_empleado_id uuid FK → liquidacion_import_empleado(id) ON DELETE SET NULL`: vincula la configuración de liquidación (convenio, categoría) al empleado unificado.

## Cambios funcionales

### Pestaña Empleados
- Muestra empleados de `liquidacion_import_empleado` (importados + manuales).
- Nuevo botón **"Nuevo empleado"**: crea un registro con `origen = 'manual'`.
- Los empleados manuales tienen botón de eliminación.
- Dashboard cuenta empleados de esta misma tabla.

### Simulador
- El selector de empleados usa `liquidacion_import_empleado` (via `listImportEmpleadosConConfig`).
- Empleados con `payroll_employee` vinculado → pueden liquidarse.
- Empleados sin configuración → badge "Sin configurar", no pueden liquidarse.
- `calcularLiquidacion` recibe `importEmpleadoId` → resuelve el `payroll_employee` vinculado → corre la lógica existente.

## Flujo para liquidar un empleado nuevo

1. El empleado aparece en la pestaña Empleados (importado o creado a mano).
2. En el módulo Convenios/Simulador, se le asigna un `payroll_employee` con convenio y categoría.
3. El Simulador lo muestra como disponible para liquidación.
