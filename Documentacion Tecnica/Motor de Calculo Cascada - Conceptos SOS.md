# Motor de Cálculo — Grilla de Conceptos SOS

**Última actualización:** 2026-06-11
**Archivo de implementación:** `src/components/sueldos/TablaReciboSos.tsx` — función `applySubtotalCascade`

---

## 1) Qué hace el motor

Cuando el usuario edita cualquier celda de la tabla de conceptos (%, importe, cantidad), el motor recorre todos los conceptos activos **en orden numérico ascendente** y recalcula los montos de los que tienen una fórmula automática. El resultado es un `EditsMap` actualizado que React usa para renderizar la tabla.

El motor se llama en dos momentos:
- Cada vez que el usuario modifica un campo (`setField`).
- Cuando cambia el set de conceptos activos (se agrega o elimina una fila).

---

## 2) Bases de cálculo disponibles (`baseColumna`)

El catálogo de conceptos (`conceptos_completos_sos`) define para cada código SOS qué base usa. Las bases posibles son:

| `baseColumna` | Qué usa como base | Quién la actualiza |
|---|---|---|
| `sueldo` | Monto del concepto 1 (Sueldo Básico) | Automático cuando concepto 1 cambia |
| `importe_fijo` | Campo `importe` propio del concepto, o monto del concepto referenciado en `importeConceptoNumero` | Manual (usuario ingresa importe) o referencia automática |
| `sub1_9` | Suma de montos de conceptos 1–9 | Acumulado durante la pasada de cascada |
| `sub1_19` | Suma de montos de conceptos 1–19 | Acumulado durante la pasada de cascada |
| `sub1_26` | Suma de montos de conceptos 1–26 | Acumulado durante la pasada de cascada |
| `sub1_39` | Suma de montos de conceptos 1–39 | Acumulado durante la pasada de cascada |
| `sub1_199` | Suma de montos de conceptos 1–199 (haberes + descuentos) | Acumulado durante la pasada de cascada |
| `sub411_469` | Suma de montos de conceptos 411–469 (no remunerativos) | Acumulado durante la pasada de cascada |
| `sub1_199_plus_411_469` | `sub1_199 + sub411_469` | Calculado al momento de uso |
| `null` / vacío | Sin cálculo automático — monto ingresado manualmente | Manual |

---

## 3) Fórmula general

Para todo concepto con base automática y porcentaje (`%`) definido:

```
monto = base × (% / 100) × cantidad
```

Donde:
- `base` = valor resuelto según `baseColumna` (ver tabla anterior).
- `%` = porcentaje ingresado por el usuario (o fijo del catálogo si `pctFijo` está definido).
- `cantidad` = campo cantidad del concepto (default 1 si el concepto no usa cantidad).

Restricciones opcionales:
- Si hay `importeMinimo`: `monto = max(monto, importeMinimo)`.
- Si hay `importeMaximo`: `monto = min(monto, importeMaximo)`.

---

## 4) Caso especial — Retenciones (200–299) con base `sub1_199`

Los conceptos de retenciones (jubilación 201, PAMI 202, obra social 203, sindicato 206, etc.) usan `base = sub1_199`, pero la base correcta para aportes del trabajador **no es la suma bruta de haberes + descuentos** — es el **total de haberes menos el total de descuentos**:

```
base_retenciones = haberes (1–99) − descuentos (100–199)
                 = sub1_99 − (sub1_199 − sub1_99)
```

El motor mantiene un acumulador `sub1_99` separado (suma de conceptos 1–99 solamente). Cuando un concepto 200–299 tiene `baseColumna = 'sub1_199'`, la cascada sustituye automáticamente por la fórmula anterior.

**Ejemplo verificado (Flor de Azar, Mayo 2026):**

| Concepto | Tipo | Monto |
|---|---|---|
| Haberes 1–99 | Haber | 1.917.164,47 |
| Descuentos 100–199 | Descuento | 111.035,20 |
| **Base retenciones** | | **1.806.129,27** |
| 201 — Jubilación 11% | Retención | 198.674,22 |
| 202 — PAMI 3% | Retención | 54.183,88 |
| 203 — Obra Social 3% | Retención | 54.183,88 |

---

## 5) Regla de conceptos activos

Solo los conceptos **activos** (visibles en la tabla) participan en el cálculo y acumulación de subtotales. Los conceptos inactivos —presentes en `edits` por haber estado en un recibo anterior cargado como referencia— se ignoran completamente.

Esto evita que un concepto eliminado de la tabla siga inflando los subtotales y distorsione los cálculos de conceptos dependientes.

---

## 6) Orden de evaluación y tracking inter-concepto

El motor evalúa los conceptos en **orden numérico ascendente**. Cada concepto evaluado registra su monto en un mapa interno (`conceptMontos`). Esto permite que conceptos posteriores referencien el monto de conceptos anteriores.

Flujo de una pasada completa:

```
Concepto 1 → monto calculado → guardado como sueldoBase + conceptMontos['1']
Concepto 3 → monto calculado → conceptMontos['3']
Concepto 7 → base = importe_propio → monto calculado → conceptMontos['7']
Concepto 8 → base = conceptMontos['1'] (via importeConceptoNumero='1') → monto calculado
Concepto 9 → base = sueldoBase (concepto 1) → monto calculado
Concepto 12 → base = importe_propio → monto calculado
...acumulación de sub1_9, sub1_19, sub1_99, sub1_199...
Concepto 201 → base = sub1_99 − descuentos → monto calculado
Concepto 202 → idem
Concepto 203 → idem
Concepto 206 → base = sub1_199 (retención, usa fórmula especial) → monto calculado
Concepto 209 → idem
...acumulación de sub411_469...
Concepto 411 → base = importe_propio → monto calculado
```

---

## 7) Conceptos que NO se recalculan automáticamente

Un concepto NO se toca si:
- `baseColumna` es `null` o vacío.
- `tienePct = false` y no hay base SUB_BASES que lo compute con 100%.
- Tiene base automática pero el porcentaje está vacío.
- Está marcado como inactivo (no está en `codigosActivosSet`).
- Para `sueldo`: el monto del concepto 1 es 0 o no está definido.
- Para `importe_fijo`: no hay importe propio ni referencia válida.

---

## 8) Conceptos de Flor de Azar S.A. — referencia

| Cód | Nombre | `baseColumna` | Fuente de la base | % usado |
|-----|--------|---------------|-------------------|---------|
| 1 | Sueldo Básico | `sueldo` | Manual (monto de escala CCT) | 100% (30 días) |
| 3 | Antigüedad | `sub1_9` | Suma conceptos 1–9 | varía por empleado |
| 7 | Otros Haberes Rem. | `importe_fijo` | Campo `importe` propio | 15% |
| 8 | Otros Haberes Rem. | `importe_fijo` | `importeConceptoNumero=1` → concepto 1 | 10% |
| 9 | Asignación Complementaria | `sueldo` | Concepto 1 | 12% |
| 12 | Otros Haberes Rem. | `importe_fijo` | Campo `importe` propio | 100% |
| 103 | Días Faltas Injustificadas | `sueldo` | Concepto 1 | manual |
| 105 | Otros Descuentos | `importe_fijo` | Campo `importe` propio | 100% |
| 201 | Jubilación | `sub1_199`* | haberes − descuentos | 11% |
| 202 | PAMI | `sub1_199`* | haberes − descuentos | 3% |
| 203 | Obra Social | `sub1_199`* | haberes − descuentos | 3% |
| 206 | Sindicato | `sub1_199`* | haberes − descuentos | 2,5% |
| 209 | Otros Retenciones | `sub1_199`* | haberes − descuentos | 1% |
| 411 | NR c/Aporte | `importe_fijo` | Campo `importe` propio | 100% |

*Para conceptos 200–299, `sub1_199` se interpreta como `sub1_99 − (sub1_199 − sub1_99)`.

---

## 9) Dónde mirar si el cálculo da mal

1. **Verificar `baseColumna`** en la tabla `conceptos_completos_sos` para el concepto en cuestión.
2. **Verificar que el concepto esté activo** en la tabla (visible en la grilla). Si está inactivo, no se calcula.
3. **Verificar el orden**: si el concepto A depende del monto del concepto B, B debe tener número menor que A.
4. **Para `importe_fijo`**: revisar si el campo `importe` de la fila tiene valor, o si `importeConceptoNumero` apunta al concepto correcto.
5. **Para retenciones**: verificar que los descuentos (100–199) estén marcados como activos; si no, `sub1_199 = sub1_99` y la base da más alta de lo correcto.
