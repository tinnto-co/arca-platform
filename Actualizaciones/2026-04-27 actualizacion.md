# Actualizacion - 2026-04-27

## 1) Objetivo general del dia

Refactor del flujo "Nuevo recibo" en el módulo de sueldos: se rediseñó el formulario como un wizard de 3 pasos, se eliminaron campos editables redundantes reemplazándolos por datos ya cargados en el legajo del empleado, se amplió la restricción de período liquidable para incluir el mes en curso, se corrigió un bug de auto-submit en la navegación entre pasos, y se implementaron valores fijos automáticos para cuatro conceptos SOS clave (antigüedad, jubilación, Ley 19032 y obra social).

---

## 2) Cambios funcionales (impacto en operación)

### 2.1 Formulario "Nuevo recibo" convertido en wizard de 3 pasos

- **Cambio:** El formulario de cabecera del recibo (antes una sola pantalla larga con sección colapsable) fue reemplazado por un wizard de 3 pasos con indicador visual de progreso.
- **Paso 1 — Empleado y período:** selección de empleado, tipo de recibo, año/mes/quincena, fecha de liquidación.
- **Paso 2 — Datos del empleado:** muestra en modo lectura los datos de pago cargados en el legajo (obra social, forma de pago, banco, CBU, lugar de pago), más los campos editables propios del recibo (fecha de pago, período de cargas, fecha de depósito, observaciones).
- **Paso 3 — Conceptos:** selector de origen (carga manual o copia del último recibo). El botón "Agregar" solo aparece en este paso.
- **Navegación:** botones "Anterior" / "Siguiente" con validación por paso antes de avanzar.
- **Archivos:** `src/components/sueldos/ReciboFormulario.tsx`

### 2.2 Datos de pago tomados del legajo (read-only en el recibo)

- **Cambio:** Los campos de obra social, forma de pago, banco, CBU y lugar de pago ya no son editables en el formulario de nuevo recibo. Se muestran como información de solo lectura tomada del legajo del empleado. Si un campo no tiene datos, se muestra "—".
- **Motivo:** Esa información ya debe estar cargada en la pestaña "Empleados". Duplicarla en el formulario del recibo generaba confusión y posibles inconsistencias.
- **Al enviar:** los valores se toman del empleado seleccionado y se pasan directamente a `createReciboHeader`.
- **Archivos:** `src/components/sueldos/ReciboFormulario.tsx`, `src/actions/sueldos.ts`

### 2.3 Filtro de empleados activos en el selector del recibo

- **Cambio:** El desplegable de empleados en el paso 1 solo muestra empleados con `activo = true`. Los empleados dados de baja ya no aparecen.
- **Archivos:** `src/actions/sueldos.ts` (`listImportEmpleadosConConfig`)

### 2.4 Restricción de período liquidable ampliada al mes en curso

- **Cambio anterior:** Solo se podía liquidar el mes inmediatamente anterior al en curso (ej. si hoy es abril, solo marzo).
- **Cambio nuevo:** Se puede liquidar cualquier período hasta el mes en curso inclusive (ej. si hoy es abril, se pueden liquidar enero, febrero, marzo y abril).
- **Períodos futuros:** siguen bloqueados tanto en frontend como en backend.
- **Archivos:** `src/lib/payroll-period-rules.ts`, `src/actions/sueldos.ts`, `src/components/sueldos/SueldosDashboard.tsx`, `src/components/sueldos/SueldosSimulador.tsx`

### 2.5 Cuadro de conceptos separado del formulario

- **Cambio:** Antes el cuadro de conceptos (tabla SOS) aparecía debajo del formulario en la misma pantalla. Ahora el formulario desaparece al presionar "Agregar" y en su lugar aparece un banner de resumen más la tabla.
- **Banner:** muestra el nombre del empleado, el período y un desplegable para cambiar el origen de conceptos (carga manual / copiar último recibo) sin necesidad de volver a completar el formulario.
- **Botón "Nuevo recibo":** en el banner permite resetear el flujo y volver al formulario desde el paso 1.
- **Archivos:** `src/components/sueldos/SueldosSimulador.tsx`

### 2.6 Valores fijos automáticos para conceptos SOS clave

- **Cambio:** Al cargar la tabla de conceptos, cuatro conceptos tienen sus columnas pre-completadas automáticamente con valores fijos, en ambos modos (manual y copia):

| SOS | Concepto      | Columna    | Valor                                          |
|-----|---------------|------------|------------------------------------------------|
| 3   | Antigüedad %  | %          | 1 (siempre)                                    |
| 3   | Antigüedad %  | Cantidad   | Años completos desde fecha de ingreso a hoy    |
| 201 | Jubilación    | %          | 11 (siempre)                                   |
| 202 | Ley 19032     | %          | 3 (siempre)                                    |
| 203 | Obra social   | %          | 3 (siempre)                                    |

- **Cálculo de antigüedad:** se computa en el cliente al seleccionar el empleado usando `differenceInYears(hoy, fechaAlta)`. Ejemplo: ingresó el 1/2/2022 y hoy es 27/4/2026 → se muestra `4`. Si el empleado no tiene fecha de ingreso cargada, la columna queda vacía.
- **Estos valores pueden editarse** en la tabla antes de guardar el recibo.
- **Archivos:** `src/components/sueldos/ReciboFormulario.tsx`, `src/components/sueldos/SueldosSimulador.tsx`

---

## 3) Cambios técnicos (implementación)

### 3.1 `src/lib/payroll-period-rules.ts`

- `puedeLiquidarPeriodo`: cambiado de `periodo === getPeriodoMesAnterior()` a `periodo <= getPeriodoMesActual()`. Ahora devuelve `true` para cualquier período hasta el mes en curso inclusive.
- Comentario de `getPeriodoMesAnterior` actualizado: ya no dice "único período liquidable" sino "período inicial por defecto en el dashboard".

### 3.2 `src/actions/sueldos.ts`

- `listImportEmpleadosConConfig`: agregado filtro `eq(liquidacionImportEmpleado.activo, true)` en el WHERE, y `leftJoin` con `obraSocial` para devolver `obraSocialNombre` y `obraSocialCodigo` junto a cada empleado.
- Los 4 handlers que lanzaban `'Solo se puede liquidar el mes anterior al en curso.'` (`createReciboHeader`, `calcularLiquidacion`, `calcularLiquidacionMasiva` y otro handler) fueron actualizados al mensaje `'No se puede liquidar períodos futuros.'`.

### 3.3 `src/components/sueldos/ReciboFormulario.tsx`

- **Schema Zod:** eliminados `obraSocialId`, `formaPago`, `cbu`, `banco`, `lugarPago` (ahora vienen del empleado). Agregado `copiarUltimoRecibo: z.enum(['no', 'si'])` como parte del paso 3.
- **STEPS:** constante con 3 pasos: `['Empleado y período', 'Datos del empleado', 'Conceptos']`.
- **Validación por paso:** `STEP1_FIELDS` y `STEP2_FIELDS` definen qué campos se validan con `form.trigger()` antes de avanzar.
- **Datos de pago:** derivados del empleado seleccionado (`empleadoSel`) en `onSubmit` en lugar de campos del form.
- **Antigüedad:** `useMemo` que computa `differenceInYears(now, fechaAlta)` al cambiar el empleado seleccionado. Se expone como `antiguedadAnios: number | null` en `ReciboFormularioSuccess`.
- **Bug fix — auto-submit:** el botón "Agregar" cambió de `type="submit"` a `type="button"` con `onClick={() => void form.handleSubmit(onSubmit)()}`. Esto evita que el `mouseup` del click en "Siguiente" aterrice sobre el nuevo botón "Agregar" (mismo nodo DOM tras el re-render de React) y dispare el submit sin interacción del usuario.
- **`ReciboFormularioSuccess`:** agregados `empleadoNombre` y `antiguedadAnios`.
- **Importaciones:** eliminados `BANCOS`, `listObrasSociales`, `Collapsible`, `Popover`, `Command`, `ChevronsUpDown`, `cn`. Agregados `ChevronLeft`, `ChevronRight`, `differenceInYears`.
- **ANOS:** corregido de `getFullYear() - i + 2` (incluía 2 años futuros) a `getFullYear() - i` (solo años pasados y el actual).

### 3.4 `src/components/sueldos/SueldosSimulador.tsx`

- **`FlowHeader`:** agregados `empleadoNombre: string` y `antiguedadAnios: number | null`.
- **`onFormSuccess`:** almacena `empleadoNombre` y `antiguedadAnios` recibidos del formulario.
- **`resetFlow`:** nueva función `useCallback` que resetea `flowHeader`, `sosEmpleadoId` y `tablaEdits` a sus valores iniciales. Disparada por el botón "Nuevo recibo" del banner.
- **Render condicional:** `ReciboFormulario` solo se muestra cuando `flowHeader === null`. Cuando `flowHeader !== null` se muestra el banner de resumen en su lugar.
- **Banner:** muestra nombre del empleado, período, y un `Select` con el origen de conceptos (valor del paso 3, editable en cualquier momento). Cambiar el origen actualiza `flowHeader.copiarUltimoRecibo` y `sosEmpleadoId`, y limpia `tablaEdits`.
- **`conceptosFilas`:** refactorizado para construir primero `filas` (copy o manual) y luego aplicar una pasada final con los valores fijos de SOS 3, 201, 202 y 203.
- **Mensaje de restricción:** actualizado de `'Solo se puede guardar el mes anterior al en curso.'` a `'No se puede guardar períodos futuros.'`.
- **Importaciones:** agregados `FilePlus2` (Lucide) y componentes `Select` de shadcn.

### 3.5 `src/components/sueldos/SueldosDashboard.tsx`

- Mensaje del aviso de restricción actualizado de `'Solo se puede liquidar el mes anterior al en curso.'` a `'No se puede liquidar meses futuros.'`.

---

## 4) Bug fixes

### 4.1 Auto-submit del formulario al navegar entre pasos

- **Síntoma:** Al hacer click en "Siguiente" del paso 2, el formulario se enviaba automáticamente sin que el usuario presionara "Agregar".
- **Causa:** El click en "Siguiente" (`type="button"`) disparaba el re-render que reemplazaba ese botón por "Agregar" (`type="submit"`) en el mismo nodo del DOM. El evento `mouseup` del click original aterrizaba sobre el nuevo botón submit, enviando el form.
- **Fix:** Cambiado "Agregar" a `type="button"` con handler `onClick={() => void form.handleSubmit(onSubmit)()}`.

---

## 5) Documentación y trazabilidad

- `Actualizaciones/2026-04-27 actualizacion.md` (este archivo)

---

## 6) Riesgos y observaciones

- Los valores fijos de SOS 3, 201, 202 y 203 se aplican sobre cualquier dato preexistente (incluyendo copias del último recibo). Si en algún caso excepcional un empleado tuviera un % diferente, debe editarse manualmente en la tabla antes de guardar.
- El cálculo de antigüedad usa `differenceInYears` de `date-fns`, que devuelve años completos (no parciales). Si el empleado no tiene `fechaAlta` cargado en el legajo, la columna queda vacía y debe completarse manualmente.
- La fecha de ingreso usada para la antigüedad es la del momento en que se crea la cabecera del recibo (`now` en el cliente), no la fecha del período liquidado. Para la mayoría de los casos esto es equivalente, pero podría diferir si se liquidan períodos históricos.

---

## 7) Pendientes

- Revisar si hay otros conceptos SOS con reglas fijas similares a las de hoy (porcentajes o cantidades siempre constantes) para agregarlos al mismo mecanismo.
- Evaluar si la antigüedad debe calcularse en base a la fecha del período liquidado en lugar de la fecha actual, para liquidaciones históricas.
- Validar en producción que `fechaAlta` esté cargada correctamente en todos los empleados activos.

---

## 8) Archivos principales involucrados

- `src/lib/payroll-period-rules.ts`
- `src/actions/sueldos.ts`
- `src/components/sueldos/ReciboFormulario.tsx`
- `src/components/sueldos/SueldosSimulador.tsx`
- `src/components/sueldos/SueldosDashboard.tsx`
- `Actualizaciones/2026-04-27 actualizacion.md`

---

## 9) Checklist de cierre diario

- [x] Cambios funcionales documentados.
- [x] Cambios técnicos documentados.
- [x] Bug fix documentado con causa y solución.
- [x] Pendientes definidos para el siguiente paso.
- [x] Archivos clave listados.
- [x] Documento del día guardado con fecha correcta.
