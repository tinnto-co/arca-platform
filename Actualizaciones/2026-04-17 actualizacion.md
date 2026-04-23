# Actualizacion - 2026-04-17

## Objetivo general del dia

Se trabajaron mejoras criticas al motor de calculo de liquidaciones de sueldos (`calcularUnaLiquidacion`), corrigiendo problemas de exactitud en el calculo de conceptos que usan subtotales acumulados, divisores de horas/dias y referencias a otros conceptos. Tambien se introdujo seguridad transaccional en el proceso de persistencia.

---

## 1) Motor de calculo de liquidaciones — mejoras criticas

### Archivos modificados
- `src/lib/payroll-formula.ts`
- `src/actions/sueldos.ts`

---

### 1.1 Subtotales acumulados por rango SOS

**Problema anterior:** el motor solo tenia variables estaticas en el contexto (`basico`, `bruto`, `totalRemunerativo`, etc.). Los conceptos que usaban bases como `sub1_9`, `sub1_199` o `sub411_469` no tenian esos valores disponibles, lo que producía calculos incorrectos para retenciones, adicionales y conceptos no remunerativos.

**Solucion implementada:**
- Se agregaron `sub1_9`, `sub1_19`, `sub1_26`, `sub1_39`, `sub1_199`, `sub411_469` al tipo `PayrollFormulaContext` y a `ALLOWED_VARS` en `payroll-formula.ts`.
- En `calcularUnaLiquidacion`, los subtotales se inicializan en `0` y se actualizan de forma acumulada despues de calcular cada concepto, segun el rango de `numeroSos`:

| Rango `numeroSos` | Acumula en |
|---|---|
| 1 – 9 | sub1_9, sub1_19, sub1_26, sub1_39, sub1_199 |
| 10 – 19 | sub1_19, sub1_26, sub1_39, sub1_199 |
| 20 – 26 | sub1_26, sub1_39, sub1_199 |
| 27 – 39 | sub1_39, sub1_199 |
| 40 – 199 | sub1_199 |
| 411–469 / 601–620 | sub411_469 |

- El contexto del evaluador legacy (formula como string) tambien tiene acceso a estos subtotales actualizados en cada iteracion.

---

### 1.2 `baseColumna` + `divHsNorm` / `divCantidad` como pre-proceso separado

**Problema anterior:** los campos `baseColumna`, `divHsNorm` y `divCantidad` existian en el schema de `payroll_concepto` pero no se aplicaban en el calculo. Los divisores a veces estaban hardcodeados en el string de formula, en lugar de leerse de los campos del concepto.

**Solucion implementada:**
- Si el concepto tiene `baseColumna` seteado, el calculo usa la formula estandar SOS:

```
base = resolver(baseColumna)            // subtotal, sueldo, importe_fijo, etc.
monto = (base / divHsNorm / divCantidad) × cantidad × (pct / 100)
```

- `divHsNorm`: si es `true`, divide por `HORAS_NORMALES_MES = 200`. No aplica cuando `baseColumna = 'valHora'` (ya lleva la division incluida).
- `divCantidad`: divisor de dias (ej. 30 para sueldo diario, 25 para feriados).
- `cantidad` y `pct` se leen del input del recibo.
- Si no hay `baseColumna`, cae al evaluador legacy de formula-string (sin cambios).

Bases resueltas por `baseColumna`:

| Valor | Base resuelta |
|---|---|
| `sueldo` / `sueldoLegajo` | `basico` del periodo |
| `valHora` | `basico / 200` |
| `sub1_9` … `sub1_199` | subtotal acumulado correspondiente |
| `sub411_469` | subtotal no remunerativo |
| `importe_fijo` | campo `importe` del input del recibo |
| `ref_concepto` | monto ya calculado del concepto referenciado |

---

### 1.3 Soporte de `ref_concepto` (referencia a otro concepto como base)

**Problema anterior:** el campo `refConceptoId` en `payroll_concepto` existia en el schema pero no se usaba en el motor. Conceptos que dependen del monto calculado de otro (SAC, vacaciones proporcionales, conceptos en cascada) no podian calcularse correctamente.

**Solucion implementada:**
- Se mantiene un mapa `montoByConceptoId` (conceptoId → monto calculado) que se va poblando a medida que se procesa cada concepto en orden.
- Cuando `baseColumna = 'ref_concepto'`, la base se toma de `montoByConceptoId.get(con.refConceptoId)`.
- El orden de `payroll_concepto.orden` garantiza que el concepto referenciado ya fue calculado antes del que lo usa.

---

### 1.4 Persistencia transaccional

**Problema anterior:** `calcularUnaLiquidacion` hacia delete + multiples inserts sin transaccion explicita. Un error a mitad del proceso podia dejar el recibo con conceptos parciales o sin cabecera.

**Solucion implementada:**
- Se reemplazo la funcion `persistDetalles` por `persistirConTransaccion`, que envuelve todo el proceso de persistencia en `db.transaction()`:
  - Delete de detalles viejos
  - Insert de todos los nuevos detalles
  - Update de la cabecera con los nuevos totales
- Aplica tanto para recibos existentes (update) como para nuevos (insert de cabecera + detalles).

---

### 1.5 Trazabilidad: `pctUsado` y `baseUsada`

**Problema anterior:** los campos `pct_usado` y `base_usada` en `liquidacion_import_concepto_valor` siempre se grababan como `null`.

**Solucion implementada:**
- Para conceptos calculados por el branch SOS (`baseColumna` seteado), se registra:
  - `pctUsado`: el porcentaje efectivamente aplicado (del input del recibo, o `100` por defecto).
  - `baseUsada`: el valor de base antes de aplicar divisores.
- Permite auditar de donde salio cada monto sin necesidad de recalcular.

---

### 1.6 Campo `importe` en inputs del recibo

- Se agrego `importe` a `InputRow` y a la query de lectura de `liquidacion_import_concepto_valor`.
- Es necesario para la base `importe_fijo` (concepto 411, sumas fijas no remunerativas, etc.).

---

## 2) Resumen de cambios por archivo

| Archivo | Cambio |
|---|---|
| `src/lib/payroll-formula.ts` | Agregados subtotales a `PayrollFormulaContext` y `ALLOWED_VARS` |
| `src/actions/sueldos.ts` | Motor de calculo: subtotales acumulados, baseColumna, ref_concepto, transaccion, pctUsado/baseUsada |

---

## 3) Items del backlog resueltos hoy

Del documento `Funcionalidad Sueldos.md` seccion 6 y 7:

| # | Item | Estado |
|---|---|---|
| 6.1 | Subtotales acumulados en el motor | ✅ Resuelto |
| 6.1 | `divHsNorm` y `divCantidad` no integrados | ✅ Resuelto |
| 6.1 | `ref_concepto` no implementado | ✅ Resuelto |
| 6.2 | Calculo no transaccional | ✅ Resuelto |
| 6.4 | `pctUsado` / `baseUsada` quedaban nulos | ✅ Resuelto |

Items pendientes para proximas sesiones:

| # | Item | Prioridad |
|---|---|---|
| 6.2 | Tipo `retencion` no soportado en UI de conceptos | Alto |
| 6.3 | Restriccion rigida al mes anterior | Medio |
| 6.3 | Clasificacion de columnas hardcodeada en multiples lugares | Medio |
| 6.3 | N+1 en procesos masivos | Medio |
| 6.4 | Normalizacion de periodo YYYY-MM vs YYYY-M | Deuda tecnica |

---

## 2) Pre-calculo de grilla en modo "cargar manualmente" (Nuevo Recibo)

### Problema

En el flujo "Nuevo Recibo → cargar datos manualmente", la grilla llegaba con todos los conceptos vacios. Al ingresar un porcentaje (ej. 11% para jubilacion), el calculo de la grilla hacia `cantidad × pct/100 × base` pero `base` era 0 porque el campo "Importe" estaba vacio. Resultado: ningun concepto calculaba. Solo funcionaba "copiar ultimo recibo" porque ya tenia el `importe` pre-cargado del recibo anterior.

### Solucion implementada

**Backend (`src/actions/sueldos.ts`):**

1. Se agrego `preview?: boolean` a los opts de `calcularUnaLiquidacion`. Si es `true`, corre todo el motor de calculos y devuelve `liquidacion: null` sin tocar la base de datos.
2. Se agrego `numeroSos` a `DetalleResult` para que el frontend pueda mapear cada resultado al codigo de fila de la grilla.
3. Nueva server function `previewLiquidacion`: llama al motor en modo preview, sin restriccion de periodo, sin persistir. Si el empleado no tiene convenio/escala configurada devuelve detalles vacios (no lanza error).

**Frontend (`src/components/sueldos/SueldosSimulador.tsx`):**

1. Se agrega query `preview-liquidacion` que se dispara cuando el modo es manual y hay empleado + periodo seleccionados.
2. Se computa `plantillaConPreview`: merge de `plantillaManual` (lista de conceptos del perfil) con los resultados del motor, matcheando por `concepto_sos.codigo` ↔ `detalle.numeroSos`. Para cada concepto que tiene resultado del motor se pre-cargan:
   - `monto`: monto calculado por la formula
   - `importe`: base usada en el calculo (`baseUsada`) — permite que el usuario ajuste `%` y la grilla recalcule
   - `porcentaje`: porcentaje efectivamente aplicado (`pctUsado`)
3. La grilla recibe `plantillaConPreview` en lugar de `plantillaManual`.
4. El titulo del card cambio a "Los montos estan pre-calculados por el motor de formulas. Podes ajustar cualquier valor directamente en la grilla antes de guardar."
5. El spinner muestra "Calculando formulas..." mientras carga el preview.

### Resultado

La grilla en modo manual ahora se comporta igual que "copiar ultimo recibo": llega con valores calculados, el usuario puede ajustar cualquier campo y los totales se recalculan dinamicamente.

---

## 3) Fix calculo dinamico en grilla sin importe (cantidad + % → Haberes)

### Problema

Al ingresar `cantidad=30, %=100` en la grilla manual (sin importe cargado), la columna de sumatoria (ej. Haberes) mostraba 0. La formula SOS es `cantidad × (pct/100) × base`, y `base` era 0 cuando el campo importe estaba vacio.

### Causa raiz

Dos bugs encadenados en la logica de la grilla:

1. **`canApplyFormula` muy restrictiva** (`src/components/sueldos/TablaReciboSos.tsx`):
   Devolvía `false` cuando `imp === null || imp === 0`, bloqueando el recalculo para filas sin importe. El reducer entonces caía al branch de "escalar monto proporcionalmente", que no funciona cuando el monto previo es 0.

2. **Default `pct = 0` y `base = 0`** (`src/lib/sos-recibo-totales.ts`):
   Con porcentaje vacio, la formula aplicaba 0% en lugar de 100%. Con importe vacio, la base era 0 en lugar de 1 (neutro multiplicativo).

### Solucion

**`src/lib/sos-recibo-totales.ts` — `montoLiquidadoDesdeEditsSos`:**
- `pct` default: `?? 0` → `?? 100` (sin porcentaje explicito, se aplica 100%)
- `base` default: `impNro ?? imp ?? 0` → `impNro ?? imp ?? 1` (sin base explicita, la formula reduce a `cantidad × (pct/100)`)

**`src/components/sueldos/TablaReciboSos.tsx` — `canApplyFormula`:**
- Eliminada condicion `if (imp === null || imp === 0) return false`
- Nueva logica: retorna `false` solo si no hay ningun valor util (sin importe, sin importeConceptoNumero, sin cantidad, sin porcentaje)
- La deteccion de "fallback importe==monto" solo se activa cuando hay importe explicito

### Resultado

Con `cantidad=30, %=100` y sin importe: la grilla muestra `30 × 1.0 × 1 = 30.00` en la columna Haberes (o la seccion que corresponda al numero de concepto).

---

## 4) Base de calculo desde escala salarial en grilla manual

### Problema

La grilla manual calculaba con base=1 cuando no habia importe, pero la base correcta para todos los recibos es el basico de la escala salarial del convenio del empleado para el periodo a liquidar.

### Solucion implementada

**Backend (`src/actions/sueldos.ts`):**

Nueva server function `getBasicoParaEmpleadoPeriodo`:
- Input: `importEmpleadoId` + `periodo` + `clientId`
- Cadena de resolucion: `valorSueldo` (override en legajo) → escala por `categoriaId` directo → escala por match de texto de categoria en convenio
- Devuelve `{ basico: number }`, nunca lanza error (devuelve 0 si no hay escala configurada)

**Frontend (`src/components/sueldos/SueldosSimulador.tsx`):**

1. Nueva query `basico-empleado-periodo` que se dispara cuando hay empleado + periodo en modo manual
2. `plantillaConBasico`: merge de `plantillaManual` con el basico, seteando `importe = String(basico)` en cada fila cuando `basico > 0`
3. La grilla recibe `plantillaConBasico` en lugar de `plantillaManual`
4. `conceptosFilas` también usa `plantillaConBasico` para que al guardar se preserve el importe correcto
5. Loading state diferenciado: "Cargando escala salarial…" mientras carga el basico

### Primer intento (corregido en iteracion siguiente)

Al abrir la grilla manual, inyectaba `importe = basico` (mensual completo). Formula resultante: `30 × 1 × basico = 30 × basico` — incorrecto, ya que el divisor de dias no estaba contemplado.

---

## 5) Correccion del importe inyectado: tasa unitaria desde catálogo SOS

### Problema

El `importe` que se inyecta en la grilla manual debe ser la **tasa unitaria** (por dia o por hora), no el basico mensual completo. De lo contrario la formula `cantidad × (%/100) × importe` da un resultado 30x mayor.

La formula correcta del sistema SOS es: `(base / divCantidad) × cantidad × (pct/100)`. Para Sueldo Basico: `(basico / 30) × 30 × 1 = basico`.

### Causa raiz

- `payroll_concepto` para este cliente no tenia `base_columna` ni `div_cantidad` configurados (usa formulas string legacy).
- La tabla global `conceptos_completos_sos` SI tenia `base_columna = 'sueldo'` y `div_cantidad = 30` para el concepto 1.
- El join previo apuntaba a `payroll_concepto` (por cliente), que no aportaba datos.

### Solucion

**`drizzle/schema.ts`:**
- Agregada la tabla `conceptosCompletosSos` al schema de Drizzle (la tabla ya existia en DB pero no estaba tipada).

**`src/actions/sueldos.ts` — `listConceptosPlantillaManualSos`:**
- Cambiado el left join de `payroll_concepto` → `conceptos_completos_sos` (catalogo global, join por `numero_sos = codigo::int`).
- Ahora cada fila retorna `baseColumna` y `divCantidad` del catalogo universal.

**`src/components/sueldos/SueldosSimulador.tsx` — `plantillaConBasico`:**
- Formula de inyeccion corregida:
  - `base_columna = 'sueldo'` / `'sueldoLegajo'`: `importe = basico / divCantidad`
  - `base_columna = 'valHora'`: `importe = basico / (divHsNorm ? 200 : 1) / divCantidad`
  - Otros (sub1_9, importe_fijo, etc.): sin importe (no se puede calcular en frontend)

### Resultado

Para Gabriel Lerman (Gerente, escala $1.000.000), Sueldo Basico (SOS 1, divCantidad=30):
- `importe inyectado = 1.000.000 / 30 = 33.333,33` (tasa diaria)
- `cantidad=30, %=100` → `30 × 1 × 33.333,33 = 1.000.000` ✓
- `cantidad=15, %=100` → `15 × 1 × 33.333,33 = 500.000` (15 dias) ✓
- `cantidad=30, %=50`  → `30 × 0.5 × 33.333,33 = 500.000` (jornada parcial) ✓
