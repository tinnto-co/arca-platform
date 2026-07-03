# Sueldos — Conceptos SOS y Generación LSD

**Última actualización:** 2026-06-24
**Archivos de implementación principales:**
- `src/components/sueldos/TablaReciboSos.tsx` — motor de cálculo (`applySubtotalCascade`)
- `src/actions/sueldos.ts` — server functions LSD (`previewLsd`, `generarArchivoLsd`, `validarLsd`)
- `src/scripts/seed-conceptos-sos-catalog.ts` — catálogo `conceptos_completos_sos`

---

## 1. Siglas y definiciones

| Sigla | Significado |
|---|---|
| H | Haberes — conceptos que suman al trabajador |
| D | Descuentos — descuentos sobre haberes |
| R | Retenciones — aportes/retenciones que restan al neto |
| NR | No Remunerativo — suma al neto, no integra base estándar de aportes |
| CN | Concepto Número — referencia al monto de otro concepto |
| SAC | Sueldo Anual Complementario (aguinaldo) |
| HE | Horas Extras (recargo 50/100%) |
| OS | Obra Social |
| ART | Aseguradora de Riesgos del Trabajo |
| LSD | Libro de Sueldos Digital (archivo AFIP) |
| SOS | SOS Contador — sistema externo de referencia |
| RIPTE | Remuneración Imponible Promedio de los Trabajadores Estables |

**Regla de neto:**
```
Neto = H - D - R + NR
```

---

## 2. Flujo operativo resumido

1. Definir estructura laboral (convenio → categoría → escala salarial).
2. Asignar empleado a convenio y categoría.
3. Crear recibo por período y tipo.
4. Cargar conceptos (plantilla SOS o copia de período previo).
5. Motor de cálculo recorre conceptos en orden numérico y recalcula automáticos.
6. Totalizar en H, D, R, NR → Neto.
7. Confirmar recibo → generar LSD → subir a AFIP.

---

## 3. Motor de cálculo cascada (`applySubtotalCascade`)

### 3.1 Qué hace

Cuando el usuario edita cualquier celda de la tabla de conceptos (%, importe, cantidad), el motor recorre todos los conceptos activos **en orden numérico ascendente** y recalcula los que tienen fórmula automática. Produce un `EditsMap` actualizado que React usa para renderizar la tabla.

Se ejecuta en dos momentos:
- Cada vez que el usuario modifica un campo (`setField`).
- Cuando cambia el set de conceptos activos (se agrega o elimina una fila).

### 3.2 Bases de cálculo disponibles (`baseColumna`)

Definidas por concepto en la tabla `conceptos_completos_sos`:

| `baseColumna` | Qué usa como base | Quién la actualiza |
|---|---|---|
| `sueldo` | Monto del concepto 1 (Sueldo Básico) | Automático cuando concepto 1 cambia |
| `importe_fijo` | Campo `importe` propio, o monto del concepto en `importeConceptoNumero` | Manual o referencia automática |
| `sub1_9` | Suma de montos de conceptos 1–9 | Acumulado durante la pasada |
| `sub1_19` | Suma de montos de conceptos 1–19 | Acumulado durante la pasada |
| `sub1_26` | Suma de montos de conceptos 1–26 | Acumulado durante la pasada |
| `sub1_39` | Suma de montos de conceptos 1–39 | Acumulado durante la pasada |
| `sub1_199` | Suma de montos de conceptos 1–199 | Acumulado durante la pasada |
| `sub411_469` | Suma de montos de conceptos 411–469 (no remunerativos) | Acumulado durante la pasada |
| `sub1_199_plus_411_469` | `sub1_199 + sub411_469` | Calculado al momento de uso |
| `sub411_414_qty` | Auto-rellena el campo `cantidad` con la suma de 411–414 | Acumulado durante la pasada |
| `null` / vacío | Sin cálculo automático — monto ingresado manualmente | Manual |

### 3.3 Fórmula general

```
monto = base × (% / 100) × cantidad
```

- `base` = valor resuelto según `baseColumna`.
- `%` = porcentaje ingresado por el usuario (o `pctFijo` del catálogo).
- `cantidad` = campo cantidad (default 1 si el concepto no usa cantidad).

Restricciones opcionales:
- `importeMinimo`: `monto = max(monto, importeMinimo)`
- `importeMaximo`: `monto = min(monto, importeMaximo)`

**Prioridad de campos (comportamiento SOS verificado):**

1. Si `CN > 0`: `raw = importeConcepto[CN] × (%/100) × cantidad` — el campo `importe` se ignora.
2. Si `CN = 0` y `base = importe_fijo`: `raw = importe × cantidad × (%/100)`.
3. Si `CN = 0` y base > 1.00:
   - Si `importe = 0`: `raw = base × cantidad × (%/100)`.
   - Si `importe > 0`: `raw = base × (%/100) × importe` — **bug triple-campo** (evitar).
4. Aplicar clamp: `resultado = max(minimo, min(maximo, raw))`.

### 3.4 Caso especial — Retenciones (200–299)

Los conceptos de retenciones usan `baseColumna = 'sub1_199'`, pero la base correcta para aportes del trabajador **no es la suma bruta** — es el total de haberes menos descuentos:

```
base_retenciones = sub1_99 − (sub1_199 − sub1_99)
                 = haberes(1–99) − descuentos(100–199)
```

El motor mantiene un acumulador `sub1_99` separado. Cuando un concepto 200–299 tiene `baseColumna = 'sub1_199'`, la cascada aplica la fórmula de sustitución automáticamente.

**Ejemplo verificado (Flor de Azar, Mayo 2026):**

| Concepto | Tipo | Monto |
|---|---|---|
| Haberes 1–99 | Haber | $1.917.164,47 |
| Descuentos 100–199 | Descuento | $111.035,20 |
| **Base retenciones** | | **$1.806.129,27** |
| 201 — Jubilación 11% | Retención | $198.674,22 |
| 202 — PAMI 3% | Retención | $54.183,88 |
| 203 — Obra Social 3% | Retención | $54.183,88 |

### 3.5 Regla de conceptos activos

Solo los conceptos **activos** (visibles en la tabla) participan en el cálculo y acumulan subtotales. Los inactivos se ignoran completamente para evitar que distorsionen los cálculos de conceptos dependientes.

### 3.6 Orden de evaluación

El motor evalúa en **orden numérico ascendente**. Cada concepto evaluado registra su monto en `conceptMontos`, permitiendo que conceptos posteriores referencien montos anteriores via `importeConceptoNumero`.

### 3.7 Bug crítico de SOS y workaround

- **Bug**: base subtotal + porcentaje + importe puede multiplicar en forma destructiva.
- **Casos sensibles**: conceptos 511–520 y 551–562.
- **Workaround operativo**: usar `importe = 1` cuando corresponda calcular sobre base dinámica.

### 3.8 Un concepto NO se recalcula si

- `baseColumna` es `null` o vacío.
- `tienePct = false` y no hay base SUB que lo compute.
- Tiene base automática pero el porcentaje está vacío.
- Está inactivo (no está en `codigosActivosSet`).
- Para `sueldo`: el monto del concepto 1 es 0 o no está definido.
- Para `importe_fijo`: no hay importe propio ni referencia válida.

### 3.9 Troubleshooting de cálculos incorrectos

1. Verificar `baseColumna` en `conceptos_completos_sos` para el concepto.
2. Verificar que el concepto esté activo (visible en la grilla).
3. Verificar el orden: si A depende de B, B debe tener número menor que A.
4. Para `importe_fijo`: revisar si el campo `importe` tiene valor o si `importeConceptoNumero` apunta al correcto.
5. Para retenciones: verificar que los descuentos (100–199) estén activos; si no, `sub1_199 = sub1_99` y la base sale más alta de lo correcto.

---

## 4. Catálogo de conceptos SOS

### 4.1 Cómo se obtuvo

Se scrapeó el sistema SOS Contador posicionado en **Mr Factory Couch SA (CUIT: 30717679136)**, extrayendo los 25 TDs de cada fila de concepto via JavaScript sobre el DOM.

Los números SOS **no son consecutivos** — existen bloques reservados sin concepto asignado. Total: **231 conceptos** (218 originales + 13 nuevos).

### 4.2 Estructura de columnas ocultas en SOS (TD indices 3–14)

| TD índice | Nombre en SOS | Descripción |
|---|---|---|
| td3 | Val. Hora | Sueldo ÷ horasNormalesMes (pre-calculado) |
| td4 | Sueldo Legajo | Sueldo básico importado desde el legajo |
| td5 | Sueldo | Sueldo del período |
| td6 | Subtot. 1/9 | Acumulado conceptos 1–9 |
| td7 | Subtot. 1/19 | Acumulado conceptos 1–19 |
| td8 | Subtot. 1/26 | Acumulado conceptos 1–26 |
| td9 | Subtot. 1/39 | Acumulado conceptos 1–39 |
| td10 | Subtot. 1/199 | Acumulado conceptos 1–199 |
| td11 | Subtot. 411/469 | Acumulado conceptos 411–469 |
| td12 | Dividido hs. norm. | Divisor de horas (1 = sin división; 180 = ÷ horas normales) |
| td13 | Dividido cantidad | Divisor de días (1 = sin div; 25 = ÷días hábiles; 30 = ÷días corridos) |
| td14 | Subtotal calculado | Resultado parcial (output) |

**Fórmula completa SOS con divisores:**
```
monto = base × (cantidad / divHsNorm / divCantidad) × (pct / 100)
```

### 4.3 Campos de entrada visibles en SOS

| Campo | Descripción |
|---|---|
| **Cantidad** | Número de unidades (horas extras, días de falta, etc.) |
| **%** | Porcentaje a aplicar sobre la base |
| **Imp. Conc. N°** | Referencia a otro concepto: usa su monto como base |
| **Importe** | Monto fijo ingresado directamente |
| **Imp. Mínimo** | Piso del resultado calculado |
| **Imp. Máximo** | Techo del resultado calculado |
| **Memo** | Texto libre (ej: nombre del seguro, rubro) |

### 4.4 Tabla completa de conceptos (231 conceptos)

> **DivHs**: Divisor de horas normales (td12). **DivDías**: Divisor de días (td13).

| N° SOS | Nombre del Concepto | N° AFIP | Memo | Cantidad | % | Imp. Conc. N° | Importe | Imp. Mín | Imp. Máx | Base Cálculo | DivHs | DivDías |
|--------|---------------------|---------|------|----------|---|---------------|---------|----------|----------|--------------|-------|---------|
| 1 | Sueldo Basico | 110000 | SI | ✓ | ✓ |  |  |  |  | sueldo | 1 | 30 |
| 3 | Antiguedad (%) | 160001 | NO | ✓ | ✓ |  |  |  |  | sueldo | 1 | 1 |
| 4 | Antiguedad (Importe) | 160001 | NO | ✓ |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 5 | Premio | 170000 | NO |  | ✓ |  |  |  |  | importe_fijo | 1 | 1 |
| 6 | Licencias | 110005 | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 7 | Otros Haberes Remunerativos | 161000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 8 | Otros Haberes Remunerativos | 161000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 9 | Asignacion Complementaria (s/sueldo) | 170000 | SI | ✓ | ✓ |  |  |  |  | sueldo | 1 | 1 |
| 10 | Feriados | 110007 | NO | ✓ |  |  |  |  |  | sueldo | 1 | 25 |
| 11 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 12 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 13 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 14 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 15 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 16 | Plus por Zona Desfavorable | 140000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 17 | Horas extras 50% (s/valor hora) | 130001 | NO | ✓ | ✓ |  |  |  |  | valHora | 1 | 1 |
| 18 | Horas extras 100% (s/valor hora) | 130002 | NO | ✓ | ✓ |  |  |  |  | valHora | 1 | 1 |
| 19 | Asignacion Complementaria (s/conc. 1 a 9) | 170000 | SI | ✓ | ✓ |  |  |  |  | sub1_9 | 1 | 1 |
| 20 | Asignacion Complementaria (s/conc. 1 a 9) | 170000 | SI | ✓ | ✓ |  |  |  |  | sub1_9 | 1 | 1 |
| 21 | Horas extras 50% (s/sueldo) | 130001 | NO | ✓ | ✓ |  |  |  |  | sueldo | 180 | 1 |
| 22 | Horas extras 100% (s/sueldo) | 130002 | NO | ✓ | ✓ |  |  |  |  | sueldo | 180 | 1 |
| 23 | Horas extras 50% (s/conc. 1 a 9) | 130001 | NO | ✓ | ✓ |  |  |  |  | sub1_9 | 180 | 1 |
| 24 | Horas extras 100% (s/conc. 1 a 9) | 130002 | NO | ✓ | ✓ |  |  |  |  | sub1_9 | 180 | 1 |
| 25 | Horas extras 50% (s/conc. 1 a 19) | 130001 | NO | ✓ | ✓ |  |  |  |  | sub1_19 | 180 | 1 |
| 26 | Horas extras 100% (s/conc. 1 a 19) | 130002 | NO | ✓ | ✓ |  |  |  |  | sub1_19 | 180 | 1 |
| 27 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 28 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 29 | Asignacion Complementaria (s/conc. 1 a 19) | 170000 | SI | ✓ | ✓ |  |  |  |  | sub1_19 | 1 | 1 |
| 30 | Asignacion Complementaria (s/conc. 1 a 26) | 170000 | SI | ✓ | ✓ |  |  |  |  | sub1_26 | 1 | 1 |
| 31 | Ajustes de Haberes Remunerativos | 110000 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 32 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 33 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 34 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 35 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 36 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 37 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 38 | Incremento Solidario Dec.14/2020 | 110011 | SI |  |  |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 39 | Incr.Salarial Dto 14/2020 Rectif | 110011 | SI |  |  |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 40 | Premio | 170000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 41 | Sueldo Anual Complementario | 120000 | NO |  |  |  | ✓ |  |  | sueldo | 1 | 1 |
| 42 | Sueldo Anual Complementario Proporcional | 120003 | NO | ✓ |  |  |  | ✓ |  | sueldo | 1 | 1 |
| 43 | Asignacion Complementaria (s/conc. 1 a 39) | 170000 | SI | ✓ | ✓ |  |  |  |  | sub1_39 | 1 | 1 |
| 51 | Vacaciones Gozadas | 151000 | SI | ✓ |  |  | ✓ |  |  | sueldo | 1 | 1 |
| 61 | Comisiones | 170003 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 62 | Comisiones | 170003 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 63 | Viaticos | 170005 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 64 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 65 | Otros Haberes Remunerativos | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 71 | Anticipo de Haberes | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 72 | Feriados | 110007 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 81 | Prest. Dineraria Ley 24577 (primeros 10d) | 110008 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 82 | Prest. Dineraria Ley 24577 (a cargo de la ART) | 110009 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 90 | Rectificativa por remuneración Ley 27.742 | 180000 | NO | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 101 | Dias Enfermedad | 110000 | NO | ✓ |  |  |  |  |  | sueldo | 1 | 30 |
| 102 | Dias Accidente | 110008 | NO | ✓ |  |  |  |  |  | sueldo | 1 | 30 |
| 103 | Dias Faltas Injustificadas | 110000 | NO | ✓ |  |  |  |  |  | sueldo | 1 | 30 |
| 104 | Dias Feriados | 110007 | NO | ✓ |  |  |  |  |  | sueldo | 1 | 30 |
| 105 | Otros Descuentos de Haberes sobre sueldo | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 106 | Otros Descuentos de Haberes sobre sueldo | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 107 | Otros Descuentos de Haberes sobre sueldo | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 108 | Otros Descuentos de Haberes sobre sueldo | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 109 | Otros Descuentos de Haberes sobre sueldo | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 110 | Otros Descuentos de Haberes sobre sueldo | 110000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 111 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 112 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 113 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 114 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 115 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 116 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 117 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 118 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 119 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 120 | Otros Descuentos de haberes sobre adicionales | 160000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 121 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 122 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 123 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 124 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 125 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 126 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 127 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 128 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 129 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 130 | Otros Descuentos de haberes sobre premios | 170000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 201 | Jubilacion | 810000 | NO |  | ✓ |  |  | ✓ | ✓ | sub1_199 | 1 | 1 |
| 202 | Ley 19032 | 810001 | NO |  | ✓ |  |  | ✓ | ✓ | sub1_199 | 1 | 1 |
| 203 | Obra Social | 810002 | SI |  | ✓ |  |  | ✓ | ✓ | sub1_199 | 1 | 1 |
| 204 | Obra Social Adherente | 810009 | SI | ✓ | ✓ |  |  | ✓ | ✓ | sub1_199 | 1 | 1 |
| 205 | Anssal | 810003 | NO |  | ✓ |  |  | ✓ | ✓ | sub1_199 | 1 | 1 |
| 206 | Sindicato | 810004 | SI |  | ✓ |  |  | ✓ |  | sub1_199 | 1 | 1 |
| 207 | Federaciones y Otros | 821000 | SI |  | ✓ |  |  | ✓ |  | sub1_199 | 1 | 1 |
| 208 | Impuesto a las Ganancias | 810008 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 209 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | sub1_199 | 1 | 1 |
| 210 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | sub1_199 | 1 | 1 |
| 211 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 212 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 213 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 214 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 215 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 216 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | sub1_199 | 1 | 1 |
| 217 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | sub1_199 | 1 | 1 |
| 218 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | sub1_199 | 1 | 1 |
| 219 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | sub1_199 | 1 | 1 |
| 220 | Otros Conceptos de Retenciones | 821000 | SI | ✓ | ✓ |  | ✓ | ✓ |  | sub1_199 | 1 | 1 |
| 221 | Aporte Adicional OS | 810002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 222 | Aporte Adicional OS | 810002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub1_199 | 1 | 1 |
| 223 | Salario Complementario Dec 332/2020 | 810012 | SI | ✓ | ✓ |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 226 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | importe_fijo | 1 | 1 |
| 227 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | importe_fijo | 1 | 1 |
| 228 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | importe_fijo | 1 | 1 |
| 229 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | importe_fijo | 1 | 1 |
| 230 | Otros Conceptos de Retenciones | 821000 | SI |  | ✓ |  |  |  |  | importe_fijo | 1 | 1 |
| 231 | Adelantos de sueldo | 820000 | SI | ✓ | ✓ |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 232 | RENATEA | 810006 | SI |  | ✓ |  |  | ✓ | ✓ | importe_fijo | 1 | 1 |
| 233 | Seguro de Vida | 810005 | SI | ✓ | ✓ |  | ✓ | ✓ |  | importe_fijo | 1 | 1 |
| 234 | Pago a cuenta Asignacion Puente al Empleo | 810014 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 401 | Vacaciones no Gozadas | 520012 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 402 | S.A.C. s/ Vacaciones no Gozadas | 520018 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 403 | Preaviso | 520015 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 404 | Indemnizacion | 520011 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 405 | Gratificacion | 520010 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 406 | Indemnizacion por despido | 520014 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 407 | Integracion Mes Despido | 520016 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 408 | SAC s/ Integracion o Preaviso | 520017 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 411 | Otros Conceptos no Remunerativos c/Ap y Cont. OS | 540000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 412 | Otros Conceptos no Remunerativos c/Ap y Cont. OS | 541000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 413 | Otros Conceptos no Remunerativos c/Ap y Cont. OS | 540000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 414 | Otros Conceptos no Remunerativos c/Ap y Cont. OS | 541000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 415 | Asig. Complementaria no Rem. (s/conc. 411 a 414) | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_414_qty | 1 | 1 |
| 416 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 417 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 418 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 419 | Suspension per. parc art 223 bis LCT / Res.397/20 | 550000 | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 420 | Suspension art 223 bis LCT / Res. 397/20 MTEySS | 110000 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 421 | Rem. habitual Dec 792/2020 | 110000 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 422 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 423 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 424 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 425 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 426 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 427 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 428 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 429 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 | 551002 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 430 | SAC No Remunerativo (Rem 4 y 8) | 560001B | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 431 | SAC No Remunerativo Prop. (Rem 4 y 8) | 560002B | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 432 | Vacaciones No Remunerativo (Rem 4 y 8) | 560003B | SI | ✓ |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 433 | SAC No Remunerativo (Rem 1, 4, 5, 8, 9) | 560001C | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 434 | SAC No Remunerativo Prop. (Rem 1, 4, 5, 8 y 9) | 560002C | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 435 | Vacaciones No Remunerativo (Rem 1, 4, 5, 8 y 9) | 560003C | SI | ✓ |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 436 | SAC No Remunerativo (Rem 4, 8 y 9) | 560001D | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 437 | SAC No Remunerativo Prop. (Rem 4, 8 y 9) | 560002D | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 438 | Vacaciones No Remunerativo (Rem 4, 8 y 9) | 560003D | SI | ✓ |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 439 | Otros Conceptos no Remunerativos c/Ap y Cont. OS | 540000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 440 | Otros Conceptos no Remunerativos c/Ap y Cont. OS | 540000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 451 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 452 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 453 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 454 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 455 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 456 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 457 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 458 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 460 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 461 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 462 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 463 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 464 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 465 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 466 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 467 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 468 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 469 | Otros Conceptos no Rem. c/Ret OS y ART | 550000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 470 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 471 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 472 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 473 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 474 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 475 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 476 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 477 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 478 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 479 | Otros Conceptos no Rem. c/Ret ART | 551001 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 480 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 481 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 482 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 483 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 484 | Otros Conceptos no Rem. sin Retenciones | 551000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 491 | Asign. din. - Dec. 390/2021 | 560001 | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 492 | Asign. din. - Dec. 390/2021 | 560002 | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 493 | Asign. din. - Dec. 390/2021 | 560003 | SI | ✓ |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 494 | Asign. din. - Dec. 390/2021 | 560001 | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 495 | Asign. din. - Dec. 390/2021 | 560002 | SI |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 496 | Asign. din. - Dec. 390/2021 | 560003 | SI | ✓ |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 501 | Acuerdo Sindicato | 810004 | NO |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 502 | Acuerdos Obra Social | 810002 | NO |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 503 | Acuerdos Federaciones y Otros | 821001 | NO |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 504 | RENATEA s/ no Rem | 810006 | NO |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 511 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 512 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 513 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 514 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 515 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 516 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 517 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 520 | Ajuste SIPA Dec 792/2020 | 821000 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 551 | Jubilacion s/Rem | 810000 | SI |  | ✓ |  |  | ✓ | ✓ | sub411_469 | 1 | 1 |
| 552 | Ley 19032 s/Rem | 810001 | SI |  | ✓ |  |  | ✓ | ✓ | sub411_469 | 1 | 1 |
| 553 | Obra Social s/Rem | 810002 | SI |  | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 554 | Obra Social Adherente s/Rem | 810009 | SI | ✓ | ✓ | ✓ | ✓ |  |  | sub411_469 | 1 | 1 |
| 555 | Anssal s/Rem | 810003 | SI |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 556 | Sindicato s/Rem | 810004 | SI |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 557 | Federaciones y Otros s/Rem | 821000 | SI |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 558 | Otros conceptos de retenciones s/cptos.no remuner. | 821000 | SI |  |  |  | ✓ |  |  | sub411_469 | 1 | 1 |
| 559 | RENATEA s/Rem | 810006 | SI |  | ✓ |  |  | ✓ | ✓ | sub411_469 | 1 | 1 |
| 560 | Otros conceptos de retenciones s/Rem | 821000 | SI |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 561 | Otros conceptos de retenciones s/Rem | 821000 | SI |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 562 | Otros conceptos de retenciones s/Rem | 821000 | SI |  | ✓ |  |  |  |  | sub411_469 | 1 | 1 |
| 601 | Asign. no remunerativa Dec 841/2022 | 560005A | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 602 | Asign. no remunerativa Dec 841/2022 (con ART) | 560005B | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 603 | Asign. din. - Dec. 551/2022 (con ART) | 560004 | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 604 | Asignacion no Remunerativa Dcto 438/2023 | 560006A | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 605 | Asignacion no Remunerativa Dcto 438/2023 (con ART) | 560006B | SI | ✓ | ✓ | ✓ | ✓ |  |  | importe_fijo | 1 | 1 |
| 610 | Beneficios Sociales | 520000 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 611 | Servicio de Comedor | 520001 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 612 | Gastos Médicos | 520002 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 613 | Provisión de ropa de trabajo | 520003 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 614 | Guardería | 520004 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 615 | Provisión de útiles escolares | 520005 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 616 | Gastos de sepelio | 520006 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 617 | Cursos de capacitación | 520007 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 618 | Becas | 520008 | NO |  |  |  | ✓ |  |  | importe_fijo | 1 | 1 |
| 620 | ASIGNACIÓN POR HIJO/HIJO CON DISCAPACIDAD | 510002 | SI | ✓ | ✓ |  | ✓ |  |  | importe_fijo | 1 | 1 |

### 4.5 Rangos de N° SOS sin concepto asignado

| Rango sin asignar |
|---|
| 2 |
| 44–50 |
| 52–60 |
| 66–70 |
| 73–80 |
| 83–89 |
| 91–100 |
| 131–200 |
| 224–225 |
| 235–400 |
| 409–410 |
| 441–450 |
| 459 |
| 485–490 |
| 505–510 |
| 518–519 |
| 521–550 |
| 563–600 |
| 606–609 |
| 619 |

---

## 5. LSD — Libro de Sueldos Digital

### 5.1 Qué es

Archivo de texto plano (`.txt`), una línea por registro, con campos de ancho fijo. Reemplaza el libro de sueldos en papel y el formulario 931. Se sube mensualmente a **Simplificación Registral** de ARCA.

Nombre de ejemplo: `30-71755486-4_2026-5_0__LSD.txt`
- CUIT `30717554864` → `30-71755486-4`
- Año `2026`, Mes `5`, Quincena `0` (mes completo)

### 5.2 Estructura del archivo (Records 01–04)

| Record | Cantidad | Descripción |
|--------|----------|-------------|
| **01** | 1 por archivo | Encabezado: CUIT empleador, período AAAAMM, cantidad de empleados |
| **02** | 1 por empleado | Datos del trabajador: CUIL, legajo, situación de revista, fecha |
| **03** | N por empleado | Conceptos del recibo: SOS code, cantidad, importe, crédito/débito |
| **04** | 1 por empleado | Bases imponibles: jubilación, PAMI, OS, ART aplicando tope RIPTE |

**Indicador C/D en Record 03:**
- **C** (crédito): remunerativos y no remunerativos — suman al trabajador
- **D** (débito): descuentos/retenciones — aportes personales

Para registros `origen = 'import'` sin FK de tipo, se deriva del SOS code:
- SOS 200–399: D
- SOS >= 500: D
- Resto: C

### 5.3 Formato Record 03

**Format A** (SOS < 400):
```
03 + CUIL(11) + 0000000(7) + SOS(3) + qty(5) + $ + centavos(15) + C/D
```

**Format B** (SOS >= 400):
```
03 + CUIL(11) + 000000000(9) + SOS(3) + qty(6) + $ + centavos(15) + C/D
```

- `qty` = `Math.round(cantidad * 100)` padded
- `centavos` = `Math.round(importe * 100)` padded a 15 dígitos

### 5.4 Formato Record 04 (370 caracteres)

Fuente oficial: `LSDiseInterfazLiquidacion.pdf` (AFIP — RG 3396/2012).

#### Header (70 chars, posiciones 0-indexed)

| Pos | Largo | Campo | Valor / Fuente |
|-----|-------|-------|----------------|
| 0–1 | 2 | Tipo registro | `'04'` |
| 2–12 | 11 | CUIL | `empleado.cuil` sin guiones |
| 13 | 1 | Marca cónyuge | `'1'` si `empleado.conyuge > 0`, sino `'0'` |
| 14–15 | 2 | Cantidad hijos | `empleado.hijos` padStart 2 |
| 16 | 1 | Marca CCT | `'1'` si tiene `convenioId`, sino `'0'` |
| 17 | 1 | Marca seguro colectivo | `client.seguroColectivo` |
| 18 | 1 | Marca reducción alícuota | `client.mipyme` |
| 19 | 1 | Tipo empleador | Primer char de `payrollTipoEmpresa.codigoLsd` |
| 20 | 1 | Tipo operación | `'0'` (alta/modificación normal) |
| 21–22 | 2 | Situación revista general | `situacionRevista1.codigo` |
| 23–24 | 2 | Condición | `payrollCondicion.codigo` |
| 25–27 | 3 | Actividad | `payrollActividad.codigo` |
| 28–30 | 3 | Modalidad contratación | `payrollModalidadContratacion.codigo` |
| 31–32 | 2 | Siniestrado | `payrollSiniestrado.codigo` (default `'00'`) |
| 33–34 | 2 | Localidad | `payrollLocalidad.codigo` (default `'00'`) |
| 35–36 | 2 | Situación revista 1 | `recibo.situacionRevista1.codigo` |
| 37–38 | 2 | Día inicio situación 1 | `recibo.situacionRevista1DiaInicio` |
| 39–40 | 2 | Situación revista 2 | `recibo.situacionRevista2.codigo` o `'00'` |
| 41–42 | 2 | Día inicio situación 2 | `recibo.situacionRevista2DiaInicio` o `'00'` |
| 43–44 | 2 | Situación revista 3 | `recibo.situacionRevista3.codigo` o `'00'` |
| 45–46 | 2 | Día inicio situación 3 | `recibo.situacionRevista3DiaInicio` o `'00'` |
| 47–48 | 2 | Días trabajados | `recibo.diasTrabajados` (default `30`) |
| 49–51 | 3 | % aporte adicional SS | `'000'` |
| 52–56 | 5 | % contrib tarea diferencial | `'00000'` |
| 57–61 | 5 | Campo reservado | `'00000'` |
| 62–67 | 6 | Código obra social AFIP | `obraSocial.codigo` padEnd 6 |
| 68–69 | 2 | Adherentes | `empleado.adherentes` padStart 2 |

#### Sección monetaria R04 (300 chars = 20 campos × 15 chars en centavos)

**Definiciones de bases:**
- `total_rem` = suma de montos con SOS 001–399 e indicador C
- `total_nonrem` = suma de montos con SOS 400–499 e indicador C
- `bruta` = `total_rem + total_nonrem`
- `tope` = `payroll_parametros_periodo.topeMaximoImponible` para el período
- `rem4y8` = `recibo.rem4y8Override` si existe, sino `bruta`
- `rem9` = `recibo.rem9Override` si existe, sino `bruta`

| Pos (0-indexed) | Campo | Fórmula |
|---|---|---|
| 70–84 | Aporte adicional OS | `0` |
| 85–99 | Contrib adicional OS | `recibo.contribucionAdicionalOS` |
| 100–114 | Base dif aporte OS | `max(0, min(rem4y8, tope) - bruta)` |
| 115–129 | Base dif contrib OS | `max(0, rem4y8 - bruta)` |
| 130–144 | Base dif LRT | `max(0, bruta - min(total_rem, tope))` |
| 145–159 | Remuneración maternidad | `recibo.importeMaternidadArt13` |
| **160–174** | **Remuneración bruta** | `bruta` |
| **175–189** | **Base 1** — jubilación aporte | `min(total_rem, tope)` |
| **190–204** | **Base 2** — jubilación contrib | `total_rem` (sin tope) |
| **205–219** | **Base 3** — PAMI | `total_rem` (sin tope) |
| **220–234** | **Base 4** — OS aportes | `min(rem4y8, tope)` |
| **235–249** | **Base 5** — FNE / AAFF | `min(total_rem, tope)` |
| 250–264 | Base 6 — regímenes especiales | `0` |
| 265–279 | Base 7 — regímenes especiales | `0` |
| **280–294** | **Base 8** — OS contrib | `rem4y8` (sin tope) |
| **295–309** | **Base 9** — ART / LRT | `rem9` (sin tope) |
| 310–324 | Base dif SS aportes | `0` |
| 325–339 | Base dif SS contrib | `0` |
| 340–354 | Base 10 | `0` |
| 355–369 | Importe a detraer (Ley 27430) | `recibo.importeADetraerLey27430` |

> **Nota padding R04:** los campos alfanuméricos (situación, condición, modalidad, siniestrado, sit rev 1/2/3) van con `lsdAlpha(code, len)` — sin cero a la izquierda, space-padded a derecha.

### 5.5 Tope máximo imponible (RIPTE)

El tope es el techo sobre el cual se calculan aportes/contribuciones previsionales. **No aparece en el archivo LSD** — condiciona el cálculo de las bases del R04 (bases 1, 4 y 5 quedan capadas).

Se almacena en `payroll_parametros_periodo`. El cron (`payroll-cron.ts`) lo actualiza el día 20 de cada mes desde `ignacioonline.com.ar` (ANSES directo está bloqueado por Incapsula WAF).

**Topes cargados para 2026** (via `seed-topes-2026.ts`, ejecutado 2026-06-08):

| Período | Tope Máximo Imponible | Resolución |
|---|---|---|
| 2026-01 | $3.823.373 | Res. ANSES 381/2025 |
| 2026-02 | $3.932.339 | Res. ANSES (BO 06-02-2026) |
| 2026-03 | $4.045.590 | Res. ANSES (BO mar-2026) |
| 2026-04 | $4.162.913 | Res. ANSES (BO abr-2026) |
| 2026-05 | $4.303.619 | Res. ANSES 110/2026 |
| 2026-06 | $4.414.652 | Res. ANSES 139/2026 |

Para meses futuros: agregar la entrada en `TOPES_2026` del script y volver a correr.

### 5.6 Formato `conceptosLSD.txt` (catálogo de conceptos)

Archivo secundario que lista los conceptos configurados de la empresa con sus flags de cargas.

```
[NRO 6 chars]→[CODIGO_AFIP 16 chars][DESCRIPCION padded ~150 chars][FLAGS ~20 chars]
```

**Código AFIP (16 chars):**
- Posiciones 1–2: tipo de concepto

| Código | Tipo |
|---|---|
| `11` | Haber remunerativo habitual |
| `15` | Vacaciones |
| `16` | Antigüedad |
| `17` | Presentismo / otros rem |
| `54` | No remunerativo |
| `81` | Descuento del trabajador (aportes empleado) |
| `82` | Retención / descuento de terceros |

- Posiciones 3–12: código interno (índice de orden dentro del tipo).
- Posiciones 13–16: código SOS zero-padded a 4 dígitos.

**Flags de cargas sociales (bloque final):**

| Posición | Flag |
|---|---|
| 1 | Aportes SIPA |
| 2 | Contribuciones SIPA |
| 3 | Aportes INSSJyP |
| 4 | Contribuciones INSSJyP |
| 5 | Aportes Obra Social |
| 6 | Contribuciones Obra Social |
| 7 | Aportes FSR |
| 8 | Contribuciones FSR |
| 9 | Aportes RENATEA |
| 10 | Contribuciones RENATEA |
| 11 | Contribuciones AAFF |
| 13 | Contribuciones FNE |
| 15 | Contribuciones LRT |
| 17 | Aportes Diferenciales |
| 18 | Aportes Especiales |
| 20 | Marca Repetible |

> El archivo `conceptosLSD.txt` **no está implementado aún** en Arca — es de menor urgencia. El LSD de liquidación (`generarArchivoLsd`) está implementado y validado.

### 5.7 Validaciones pre-descarga (`validarLsd`)

Server function que retorna `{ puedeDescargar: boolean, issues: LsdIssue[] }`.

| Código | Tipo | Condición |
|---|---|---|
| `SIN_TIPO_EMPLEADOR` | error | `client.tipoEmpresaId` null |
| `SIN_TOPE_IMPONIBLE` | error | No hay fila en `payroll_parametros_periodo` para el período |
| `SIN_RECIBOS` | error | No hay ningún recibo para el período y empresa |
| `SIN_SITUACION_REVISTA` | error | `recibo.situacionRevista1Id` es null (por empleado) |
| `SIN_MODALIDAD_CONTRATACION` | error | `empleado.modalidadContratacionId` es null (por empleado) |
| `SIN_OBRA_SOCIAL` | warning | `empleado.obraSocialId` es null (por empleado) |

`puedeDescargar = true` solo si no hay issues de tipo `'error'`.

### 5.8 Tablas involucradas

| Tabla | Propósito en LSD |
|---|---|
| `liquidacion_import_recibo` | Recibos del período |
| `liquidacion_import_empleado` | Datos del trabajador |
| `liquidacion_import_concepto_valor` | Conceptos del recibo con SOS code e importe |
| `payroll_situacion` | Catálogo situaciones de revista AFIP |
| `payroll_modalidad_contratacion` | Catálogo modalidades AFIP |
| `payroll_parametros_periodo` | Tope imponible y SMVM por período |
| `payroll_tipo_empresa` | Tipo de empleador Dec. 814/01 |

### 5.9 Server functions LSD

```
previewLsd({ clientId, profileId, periodo })
  → employer: { nombre, cuit, codigoLsd, tipoEmpresaNombre }
  → empleados: [{ reciboId, cuil, legajo, nombre, situación, modalidad, diasTrabajados, cantidadConceptos, origen }]

generarArchivoLsd({ clientId, profileId, periodo })
  → { filename, contenido, empleados, conceptos }

validarLsd({ clientId, profileId, periodo })
  → { puedeDescargar, issues[] }

getParametrosPeriodo({ periodo })
  → fila de payroll_parametros_periodo o null

upsertParametrosPeriodo({ periodo, topeMaximoImponible, salarioMinimo?, fuente? })
  → crea o reemplaza los parámetros del período (marca actualizadoPorCron = false)
```

### 5.10 Estado de implementación y pendientes

**Implementado y validado (E-presis Mayo 2026):**
- [x] Records 01, 02, 03, 04 en formato fijo AFIP
- [x] Descarga de archivo `.txt` desde el browser
- [x] Validaciones pre-descarga con panel en UI
- [x] Widget de tope imponible con edición inline
- [x] Topes 2026 cargados via script backfill
- [x] Cron mensual para sincronizar tope imponible

**Pendientes:**
- [ ] Enviar LSD a AFIP y verificar aceptación en Simplificación Registral
- [ ] R01 pos 26-27: campo desconocido que vale `13` en referencia y `00` en generado (no bloqueante)
- [ ] `conceptosLSD.txt` (catálogo de conceptos) — no implementado, baja urgencia
- [ ] Múltiples situaciones de revista por período: campos existen en schema, faltan en UI del recibo
- [ ] Situación de revista null en empleados importados: flujo de completado desde UI

### 5.11 Estado de convenios por empresa (junio 2026)

| Empresa | CCT | Estado en DB |
|---|---|---|
| **E-presis** | Comercio 130/75 | Completo — convenio, categorías, escalas y empleados asignados |
| **Brique** | Construcción 76/75 | Convenio existe pero sin escalas |
| **Sabenumitubeja** | Pasteleros 272/96 | Configurado en sesión 2026-06-16 |
| **Admip SRL** | Sanidad 459/06 | Configurado en sesión 2026-06-16 |
| **Besorot Tovot** | Desconocido | Credenciales AFIP vencidas — no se puede scrapear |
| **PNR Trade** | Desconocido | Credenciales AFIP vencidas — no se puede scrapear |

Para confirmar CCT manualmente: AFIP > Clave Fiscal > Simplificación Registral - Empleadores > Convenios.
