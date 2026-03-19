# Módulo de liquidación de sueldos – Arquitectura y diseño

## Resumen

Sistema de liquidación de sueldos para empresas en Argentina: **por cliente** (cada cliente de la base tiene su propio módulo de sueldos). Incluye convenios colectivos, categorías, escalas salariales con vigencia, conceptos configurables por fórmula y motor de cálculo sin cambiar código.

---

## Arquitectura del sistema

- **Frontend**: Rutas bajo `/_authed/sueldos/`, componentes en `src/components/sueldos/`, UI con Tabs (Dashboard, Empleados, Convenios, Conceptos, Novedades, Simulador, Recibo).
- **Backend**: Server functions en `src/actions/sueldos.ts` (TanStack Start). Autorización: el usuario solo accede a datos del **cliente** seleccionado; se valida que el cliente pertenezca al usuario (`ensureClientBelongsToUser`).
- **Motor de fórmulas**: `src/lib/payroll-formula.ts` — parser seguro (solo números, operadores y variables permitidas), sin `eval()` arbitrario.
- **Persistencia**: PostgreSQL vía Drizzle ORM; schema en `drizzle/schema.ts` (tablas `payroll_*`).

Flujo típico: el usuario **elige un cliente** en la pantalla de Sueldos → **Empleados** (convenio + categoría) → **Escalas** (básico por vigencia) → **Conceptos** (fórmulas) → **Novedades** (por período) → **Cálculo** → **Liquidación** y **Recibo**. Todo queda scoped a ese cliente.

---

## Modelo de base de datos

### Tablas

| Tabla | Descripción |
|-------|-------------|
| `payroll_convenio` | Convenios colectivos (nombre, descripción). `client_id` (FK a `client`) para scope por cliente. |
| `payroll_convenio_categoria` | Categorías dentro de cada convenio (código, nombre, orden). |
| `payroll_escala` | Escalas salariales: categoría + vigencia desde/hasta + monto básico. Histórico por fechas. |
| `payroll_concepto` | Conceptos salariales: código, nombre, tipo (remunerativo / no remunerativo / descuento), base de cálculo, **fórmula**, es porcentaje, orden. `client_id` para scope por cliente. |
| `payroll_employee` | Empleados: nombre, apellido, CUIT/CUIL, fecha ingreso, convenio, categoría, tipo jornada. `client_id` para scope por cliente. |
| `payroll_empleado_concepto` | Conceptos asignados por empleado (ej. comisión individual). Opcional. |
| `payroll_novedad` | Novedades mensuales: empleado, concepto, período (YYYY-MM), valor, cantidad, detalle. |
| `payroll_liquidacion` | Cabecera: empleado, período, básico, total remunerativo, total no remunerativo, total descuentos, neto. |
| `payroll_liquidacion_detalle` | Detalle por concepto: liquidación, concepto, monto, cantidad. |

### Relaciones

- Convenio → Categorías (1:N).
- Categoría → Escalas (1:N, por vigencia).
- Empleado → Convenio, Categoría (N:1).
- Liquidación → Empleado (N:1), Detalles (1:N).
- Novedad → Empleado, Concepto (N:1).

---

## Motor de fórmulas configurable

- **Ubicación**: `src/lib/payroll-formula.ts`.
- **Función**: `evaluatePayrollFormula(formula: string, context: PayrollFormulaContext): number`.
- **Variables permitidas**: `basico`, `antiguedad`, `bruto`, `totalRemunerativo`, `totalNoRemunerativo`, `totalDescuentos`, `neto`, `horasExtra`, `presentismo`, `comisiones`, `bonos`, `valor`, `cantidad`.
- **Sintaxis**: números, `+ - * /`, paréntesis, nombres de variables. Sin `eval()` de código arbitrario.

### Ejemplos de fórmulas

| Concepto      | Fórmula              | Uso |
|--------------|----------------------|-----|
| Básico       | `basico`             | Solo referencia (el básico viene de la escala). |
| Antigüedad   | `0.01 * basico * antiguedad` | 1% del básico por año. |
| Presentismo  | `0.0833 * basico`    | ~8,33% del básico. |
| Jubilación   | `0.11 * totalRemunerativo` | 11% sobre total remunerativo. |
| Obra social  | `0.03 * totalRemunerativo` | 3%. |
| Monto fijo   | `1000` o `valor`     | Fijo o valor de novedad. |
| Horas extra  | `valor`              | Novedad con valor = monto. |

Los conceptos se ordenan por `orden`; el motor actualiza `totalRemunerativo`, `totalNoRemunerativo`, `totalDescuentos` y `bruto`/`neto` en el contexto a medida que calcula, para que fórmulas posteriores puedan usar esos totales.

---

## Ejemplos de cálculo (flujo)

1. **Básico**: escala vigente para la categoría del empleado en el mes (ej. marzo 2025).
2. **Antigüedad**: `0.01 * basico * años_desde_fecha_ingreso`.
3. **Presentismo**: `0.0833 * basico`.
4. **Total remunerativo**: básico + antigüedad + presentismo + otros remunerativos (incl. novedades).
5. **Jubilación**: `0.11 * totalRemunerativo`.
6. **Obra social**: `0.03 * totalRemunerativo`.
7. **Total descuentos**: suma de todos los conceptos tipo descuento.
8. **Neto**: total remunerativo + total no remunerativo - total descuentos.

Cambios mensuales: nuevas filas en `payroll_escala` (vigencia desde/hasta), nuevos conceptos o fórmulas; el motor usa siempre la configuración vigente en el período.

---

## Aplicar cambios en la base de datos

Después de agregar las tablas al schema, ejecutar:

```bash
bun run db:push
```

(Desde la raíz del proyecto, con `DATABASE_URL` configurado.)

---

## Pantallas del módulo (rutas /sueldos)

- **Dashboard**: Resumen por período (empleados, liquidaciones, total bruto/neto), selector de período, botón “Liquidación masiva”.
- **Empleados**: Alta/edición, datos básicos, convenio, categoría, tipo de jornada.
- **Convenios**: Alta de convenios; por convenio: categorías y escalas con vigencia.
- **Conceptos**: Alta de conceptos (código, nombre, tipo, fórmula, orden).
- **Novedades**: Carga por período (empleado, concepto, valor/cantidad).
- **Simulador**: Empleado + período → calcular/recalcular liquidación y ver totales.
- **Recibo**: Selección período + empleado → vista de recibo (detalle de conceptos y neto).

El diseño es escalable: nuevos convenios, categorías, conceptos y fórmulas se agregan por datos y configuración, manteniendo histórico de escalas y liquidaciones.
