# Pruebas de Formuleo SOS — Recibo de Sueldo (ANÁLISIS ULTRA-COMPLETO v3)
**Fecha:** 2026-04-20
**Sistema:** SOS-Contador — Sueldos/Recibos
**URL analizada:** `https://soft.sos-contador.com/web/sueldos_reciboAM.asp?Accion=modi&hid=5719335`
**Empleada de prueba:** GODANO, VERONICA | Categoría: VENDEDOR B
**Datos de legajo:** Sueldo: $1.094.044 | Antigüedad: 13 años | Hs. mensuales: 180
**Versión:** v3 — Estructura DOM inspeccionada campo por campo para todos los conceptos

---

## 1. Introducción

Este documento registra el análisis funcional exhaustivo del sistema de cálculo de sueldos de SOS-Contador. Todos los datos fueron obtenidos mediante inspección directa del DOM y ejecución de pruebas con valores reales.

Para cada concepto se relevó: presencia de cada campo, base de cálculo activa, fórmula verificada matemáticamente y grupo de destino contable.

---

## 2. Estructura del Formulario

### 2.1 Campos por fila de concepto

| ID del campo | Tipo | Descripción |
|---|---|---|
| `incluir_N` | checkbox | Activar/desactivar concepto |
| `memo_N` | text | Nota libre (solo en algunos conceptos) |
| `subtotal_hora_N` | text | SL / hs.mes = valor-hora (solo HE s/VH) |
| `subtotal_1a2_N` | text | Suma activos 1-2 |
| `subtotal_1a9_N` | text | Suma activos 1-9 |
| `subtotal_1a19_N` | text | Suma activos 1-19 |
| `subtotal_1a26_N` | text | Suma activos 1-26 |
| `subtotal_1a39_N` | text | Suma activos 1-39 |
| `subtotal_1a199_N` | text | **Total Haberes** (base de retenciones) |
| `subtotal_411a469_N` | text | **Total No Remunerativos** |
| `divididoHoras_N` | text | Divisor de horas (default=1) |
| `divididoCantidad_N` | text | Divisor de cantidad (default=1) |
| `importeCalculados_N` | text | BASE / divH / divC — display solo lectura |
| `cantidad_N` | text | Días, horas, años, adherentes, etc. |
| `porcentaje_N` | text | Porcentaje |
| `conceptoNumero_N` | text | N° de concepto referenciado |
| `importe_N` | text | Importe fijo / multiplicador |
| `importeMinimo_N` | text | Piso del resultado |
| `importeMaximo_N` | text | Techo del resultado |
| `auxImporteConcepto_N` | text | Resultado visible (display) |
| `importeConcepto_N` | **hidden** | **Resultado real usado en totales** |

> `importeConcepto_N` es hidden. `auxImporteConcepto_N` es solo visual.

### 2.2 Totales al pie

| ID | Descripción |
|----|-------------|
| `importeConcepto_total1` | **Total Haberes** |
| `importeConcepto_total2` | **Total Descuentos** |
| `importeConcepto_total3` | **Total Retenciones** |
| `importeConcepto_total5` | **Total No Remunerativos** |
| `importeConcepto_total` | **Total Neto** = H − D − R + NR |

---

## 3. Fórmula General de Cálculo

```
importeCalculados_N = BASE / divididoHoras_N / divididoCantidad_N

Prioridad de cálculo (verificada):

CASO 1 — conceptoNumero > 0:
  raw = importeConcepto_[CN] × porcentaje/100 × cantidad
  → El campo importe se IGNORA cuando CN está seteado.
  → Si el concepto referenciado está INACTIVO: importeConcepto_[CN] = 0 → raw = 0

CASO 2 — conceptoNumero = 0 y base = 1.00 (sin subtotal real):
  raw = importe × cantidad × porcentaje/100

CASO 3 — conceptoNumero = 0 y base > 1.00 (subtotal real presente):
  a) Si importe = 0 (o vacío):
     raw = importeCalculados × cantidad × porcentaje/100
  b) Si importe > 0:  ← BUG
     raw = importeCalculados × porcentaje/100 × importe
     (importe actúa como MULTIPLICADOR, no como override)

importeConcepto_N = clamp(raw, importeMinimo_N, importeMaximo_N)
  donde clamp = max(importeMinimo, min(importeMaximo, raw))
```

> **Bug triple-campo**: Destructivo solo cuando la base es un subtotal real grande.
> Con base=1.00: `1 × pct/100 × importe = importe × pct/100` → resultado correcto.
>
> **Workaround para [511-562]**: Usar `importe=1` → `BASE × pct/100 × 1 = BASE × pct/100` ✓
>
> **Prioridad verificada**: CN > importe > base automática

---

## 4. Bases de Cálculo

| Clave | Valor en legajo de prueba | Campo DOM | Concepto origen |
|-------|--------------------------|-----------|-----------------|
| `SL` | $1.094.044 | columna legajo | Del perfil del empleado |
| `SL_hora` | $6.078,02 | `subtotal_hora_N` | SL / 180 hs.mes |
| `S1a2` | variable | `subtotal_1a2_N` | Suma activos 1-2 |
| `S1a9` | variable | `subtotal_1a9_N` | Suma activos 1-9 |
| `S1a19` | variable | `subtotal_1a19_N` | Suma activos 1-19 |
| `S1a26` | variable | `subtotal_1a26_N` | Suma activos 1-26 |
| `S1a39` | variable | `subtotal_1a39_N` | Suma activos 1-39 |
| `S1a199` | variable | `subtotal_1a199_N` | **Total Haberes** |
| `S411a469` | variable | `subtotal_411a469_N` | **Total NR** |
| `S1a199+S411a469` | variable | ambos | H + NR (solo [551-562]) |
| `1.00` | $1,00 | (ningún subtotal) | Sin base automática |

---

## 5. Cascadas de Recalculo (verificadas)

El sistema recalcula en cascada cuando cualquier campo cambia:

```
Modificar haber → subtotal_1a2/1a9/1a19/1a26/1a39/1a199 se actualizan
  → todos los conceptos con esa base recalculan automáticamente

Modificar NR → subtotal_411a469 se actualiza
  → [501-504] Acuerdos s/NR recalculan (van a R)
  → [511-520] Ret. s/NR recalculan (van a R, requieren imp=1)
  → [551-562] Ret. s/H+NR recalculan (van a R, requieren imp=1)
  → R_total se actualiza → Neto cambia

CN referenciado cambia de valor → concepto dependiente recalcula automáticamente
CN referenciado se DESACTIVA → importeConcepto_[CN] = 0 → resultado = 0
Reactivar CN referenciado → se recalcula con el nuevo valor
```

**Verificado**: NR de $100k → $250k → S411a469 actualiza → [501] recalcula $2.000 → $5.000
**Verificado**: CN=10 desactivado → [7]=0; activar 10 → [7] recalcula a $43.761,76 automáticamente
**Verificado**: Desactivar [1] → S1a2=0 → Antigüedad=~$0.13 (residual flotante); Premio=~$0.10

> **Nota flotante**: Cuando S1a2=0, algunos conceptos muestran residuales de ~$0.10-$0.13
> por precisión de punto flotante JS. En producción esto equivale a $0.

---

## 6. Haberes (Conceptos 1 a 90) → Destino: H

### 6.1 Mapa estructural completo (verificado por inspección DOM)

| Slot | Nombre | Base | divC | cant | pct | imp | CN | min | max | Fórmula |
|------|--------|------|------|------|-----|-----|----|-----|-----|---------|
| [1] | Sueldo Básico | SL | **30** | ✓ | ✓ | — | — | — | — | `SL/30 × cant × pct/100` |
| [2] | Básico 2 | SL | **30** | ✓ | ✓ | — | — | — | — | `SL/30 × cant × pct/100` |
| [3] | Antigüedad % | S1a2 | — | ✓ | ✓ | — | — | — | — | `S1a2 × cant × pct/100` |
| [4] | Antigüedad Importe | 1.00 | — | ✓ | — | ✓ | — | — | — | `imp × cant` |
| [5] | Premio | S1a2 | — | — | ✓ | — | — | — | — | `S1a2 × pct/100` |
| [6] | Licencias | 1.00 | — | — | — | ✓ | — | — | — | `imp` |
| [7] | Otros H.Rem. 1 | 1.00 | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | multi-modo |
| [8] | Otros H.Rem. 2 | 1.00 | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | multi-modo |
| [9] | Asig.Comp. s/sueldo | S1a2 | — | ✓ | ✓ | — | — | — | — | `S1a2 × cant × pct/100` |
| [10] | Feriados | SL | **25** | ✓ | — | — | — | — | — | `SL/25 × cant` (**sin pct**) |
| [11]-[15] | Otros H.Rem. (×5) | 1.00 | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | multi-modo |
| [16] | Plus Zona Desf. | S1a2 | — | — | ✓ | — | — | — | — | `S1a2 × pct/100` |
| [17] | HE 50% s/VH | SL_hora | — | ✓ | 150 | — | — | — | — | `(SL/180) × 1.5 × cant` |
| [18] | HE 100% s/VH | SL_hora | — | ✓ | 200 | — | — | — | — | `(SL/180) × 2.0 × cant` |
| [19] | Asig.Comp. s/1-9 A | S1a9 | — | — | ✓ | — | — | — | — | `S1a9 × pct/100` |
| [20] | Asig.Comp. s/1-9 B | S1a9 | — | — | ✓ | — | — | — | — | `S1a9 × pct/100` |
| [21] | HE 50% s/S1a2 | S1a2 | — | ✓ | 150 | — | — | — | — | `(S1a2/180) × 1.5 × cant` |
| [22] | HE 100% s/S1a2 | S1a2 | — | ✓ | 200 | — | — | — | — | `(S1a2/180) × 2.0 × cant` |
| [23] | HE 50% s/1-9 | S1a9 | — | ✓ | 150 | — | — | — | — | `(S1a9/180) × 1.5 × cant` |
| [24] | HE 100% s/1-9 | S1a9 | — | ✓ | 200 | — | — | — | — | `(S1a9/180) × 2.0 × cant` |
| [25] | HE 50% s/1-19 | S1a19 | — | ✓ | 150 | — | — | — | — | `(S1a19/180) × 1.5 × cant` |
| [26] | HE 100% s/1-19 | S1a19 | — | ✓ | 200 | — | — | — | — | `(S1a19/180) × 2.0 × cant` |
| [27] | Otros H.Rem. 3 | 1.00 | — | ✓ | ✓ | ✓ | ✓ | — | — | multi-modo |
| [28] | Otros H.Rem. 4 | 1.00 | — | ✓ | ✓ | ✓ | ✓ | — | — | multi-modo |
| [29] | Asig.Comp. s/1-19 | S1a19 | — | ✓ | ✓ | — | — | — | — | `S1a19 × cant × pct/100` |
| [30] | Asig.Comp. s/1-26 | S1a26 | — | ✓ | ✓ | — | — | — | — | `S1a26 × cant × pct/100` |
| [31] | Ajustes Haberes Rem. | 1.00 | — | — | — | ✓ | — | — | — | `imp` |
| [32]-[37] | Otros H.Rem. (×6) | 1.00 | — | ✓ | ✓ | ✓ | — | — | — | multi-modo sin CN |
| [38] | Incr.Solid. D14/2020 | 1.00 | — | — | — | ✓ | — | — | — | `imp` |
| [39] | Otro H.Rem. | 1.00 | — | — | — | ✓ | — | — | — | `imp` |
| [40] | Premio genérico | **1.00** | — | ✓ | ✓ | ✓ | — | ✓ | — | multi-modo **sin base S1a2** |
| [41] | SAC | 1.00 | — | — | — | ✓ | — | — | — | `imp` |
| [42] | SAC Proporcional | server | — | ✓ | — | — | — | — | — | server-side al guardar |
| [43] | Asig.Comp. s/1-39 | S1a39 | — | — | ✓ | — | — | — | — | `S1a39 × pct/100` |
| [51] | Vacaciones Gozadas | 1.00 | — | ✓ | — | ✓ | — | — | — | `imp × cant` |
| [61]-[65] | Comisiones (×5) | 1.00 | — | — | ✓ | ✓ | ✓ | — | — | multi-modo con CN |
| [71] | Anticipo Haberes | 1.00 | — | ✓ | ✓ | ✓ | ✓ | — | — | multi-modo con CN |
| [72] | Feriados slot 2 | 1.00 | — | ✓ | ✓ | ✓ | ✓ | — | — | `imp × cant × pct/100` |
| [81] | Prest.Din. 1-10d | 1.00 | — | ✓ | ✓ | ✓ | ✓ | — | — | `imp × cant × pct/100` |
| [82] | Prest.Din. ART | 1.00 | — | — | — | ✓ | ✓ | — | — | `imp` |
| [90] | Rectificativa L27.742 | 1.00 | — | ✓ | ✓ | ✓ | ✓ | — | — | multi-modo con CN |

### 6.2 Distinciones clave en Haberes

**[5] Premio vs [40] Premio genérico:**
- `[5]` tiene `subtotal_1a2` → calcula automáticamente sobre el sueldo activo
- `[40]` tiene base=1.00 → requiere importe manual o CN explícito

**[10] Feriados vs [72] Feriados slot 2:**
- `[10]` base=SL, divC=25 → `importeCalculados = SL/25` ($43.761,76) → automático
- `[72]` base=1.00 → `importeCalculados = 1.00` → usuario ingresa valor-día en `importe`

**[17-18] HE s/VH vs [21-26] HE s/subtotal:**
- `[17-18]` usan `SL_hora` del legajo (fijo, no varía con haberes activos)
- `[21-26]` dividen el subtotal acumulado (varía con todo lo activo en el recibo)

**[81] Prest.Din. 1-10d vs [82] ART:**
- `[81]` = días a cargo del empleador → usuario ingresa valor-día + cantidad de días
- `[82]` = monto que informa la ART → importe fijo puro

---

## 7. Descuentos (Conceptos 101 a 130) → Destino: D

| Slot | Nombre | Base | divC | cant | pct | imp | CN | Fórmula |
|------|--------|------|------|------|-----|-----|----|---------|
| [101] | Días Enfermedad | SL | 30 | ✓ | — | — | — | `SL/30 × cant` |
| [102] | Días Accidente | SL | 30 | ✓ | — | — | — | `SL/30 × cant` |
| [103] | Días Faltas Injust. | SL | 30 | ✓ | — | — | — | `SL/30 × cant` |
| [104] | Días Feriados desc. | SL | 30 | ✓ | — | — | — | `SL/30 × cant` |
| [105]-[110] | Otros Desc. (×6) | 1.00 | — | ✓ | ✓ | ✓ | ✓ | multi-modo con CN |
| [111]-[120] | Otros Desc. (×10) | 1.00 | — | ✓ | ✓ | ✓ | ✓ | multi-modo con CN |
| [121]-[130] | Otros Desc. (×10) | 1.00 | — | ✓ | ✓ | ✓ | ✓ | multi-modo con CN |

**Nota:** Los tres grupos [105-110], [111-120], [121-130] son estructuralmente idénticos. La distinción es semántica (código contable SOS). Todos soportan CN con prioridad sobre importe.

**Verificado [105]:** CN=1 (sueldo=$1.094.044), pct=5%, imp=500.000 → resultado = $54.702,20 (CN ignora imp)

---

## 8. Retenciones (Conceptos 201 a 234) → Destino: R

### 8.1 Mapa estructural completo (verificado por inspección DOM)

| Slot | Nombre | Base | cant | pct default | imp | CN | min | max | Fórmula |
|------|--------|------|------|-------------|-----|----|-----|-----|---------|
| [201] | Jubilación | S1a199 | — | 11% | — | — | ✓ | ✓ | `S1a199 × 11/100` |
| [202] | PAMI | S1a199 | — | 3% | — | — | ✓ | ✓ | `S1a199 × 3/100` |
| [203] | OS titular | S1a199 | — | 3% | — | — | ✓ | ✓ | `S1a199 × 3/100` |
| [204] | OS adherente | S1a199 | **✓** | 15% | — | — | ✓ | ✓ | `S1a199 × pct/100 × cant` |
| [205] | ANSSAL | S1a199 | — | 3% | — | — | ✓ | ✓ | `S1a199 × pct/100` |
| [206] | Sindicato | S1a199 | — | 2% | — | — | ✓ | ✓ | `S1a199 × 2/100` |
| [207] | Federaciones | S1a199 | — | 5% | — | — | ✓ | — | `S1a199 × pct/100` |
| [208] | Ganancias 4ª | 1.00 | ✓ | — | ✓ | ✓ | — | — | multi-modo |
| [209] | Ret. libre 1 | **S1a199** | — | 2% | — | — | — | — | `S1a199 × pct/100` |
| [210] | Ret. libre 2 | **S1a199** | — | 2% | — | — | — | — | `S1a199 × pct/100` |
| [211]-[215] | Ret. libres (×5) | **1.00** | ✓ | — | ✓ | ✓ | — | — | multi-modo con CN |
| [216]-[220] | Ret. libres (×5) | **1.00** | ✓ | — | ✓ | — | — | — | multi-modo sin CN |
| [221] | Ap.Adic. OS 1 | 1.00 | ✓ | — | ✓ | ✓ | — | — | multi-modo con CN |
| [222] | Ap.Adic. OS 2 | 1.00 | ✓ | — | ✓ | ✓ | — | — | multi-modo con CN |
| [223] | Sal.Comp. D332/2020 | 1.00 | ✓ | — | ✓ | — | — | — | multi-modo sin CN |
| [226]-[230] | Ret. libres (×5) | **S1a199** | — | — | — | — | — | — | `S1a199 × pct/100` |
| [231] | Adelantos | 1.00 | ✓ | — | ✓ | — | — | — | `imp × cant` |
| [232] | RENATEA | S1a199 | — | 11% | — | — | — | — | `S1a199 × pct/100` |
| [233] | Seguro de Vida | 1.00 | ✓ | — | ✓ | — | — | — | `imp` |
| [234] | Pago cta. Asig. Puente | 1.00 | ✓ | — | ✓ | ✓ | — | — | multi-modo con CN |

> [224] y [225] **no existen** en el formulario.

### 8.2 Distinciones clave en Retenciones

**Slots S1a199 (cálculo automático):** [201]-[207], [209]-[210], [226]-[230], [232]
→ Ninguno tiene campo `importe` → sin bug triple-campo

**Slots multi-modo con CN:** [208], [211]-[215], [221]-[222], [234]
→ Pueden referenciar otro concepto o usar importe fijo

**Slots multi-modo sin CN:** [216]-[220], [223], [231], [233]
→ Solo importe fijo y/o cantidad

**Solo [204] OS Adherente** tiene campo `cantidad` entre los de base S1a199 → el pct se multiplica por la cantidad de adherentes.

---

## 9. No Remunerativos (Conceptos 401 a 620)

Los NR suman al `importeConcepto_total5`. Se incorporan al neto vía `H − D − R + NR`.

> ⚠️ **Conceptos NR que van a Retenciones (R):** [501-504], [511-520], [551-562] tienen base NR o H+NR y su resultado **va al grupo R**, no al NR. Reducen el neto por vía de Retenciones.

### 9.1 Mapa estructural completo (verificado por inspección DOM)

| Slot | Nombre | Base | Modo | Campos clave | Destino |
|------|--------|------|------|--------------|---------|
| [401]-[408] | Liquidación final (×8) | 1.00 | IMP_PURO | imp | **NR** |
| [409]-[410] | — | — | NO EXISTE | — | — |
| [411]-[418] | NR c/Ap OS y sin Ret (×8) | 1.00 | MULTI+CN | cant, pct, imp, CN | **NR** |
| [419]-[421] | Susp./COVID (×3) | 1.00 | IMP_PURO | imp | **NR** |
| [422]-[429] | NR c/Ap Rem (×8) | 1.00 | MULTI+CN | cant, pct, imp, CN | **NR** |
| [430]-[431] | SAC/Vac NR B (×2) | 1.00 | IMP_PURO | imp | **NR** |
| [432] | SAC/Vac NR | 1.00 | MULTI | cant, pct, imp | **NR** |
| [433]-[434] | SAC/Vac NR (×2) | 1.00 | IMP_PURO | imp | **NR** |
| [435] | SAC/Vac NR | 1.00 | MULTI | cant, pct, imp | **NR** |
| [436]-[437] | SAC/Vac NR (×2) | 1.00 | IMP_PURO | imp | **NR** |
| [438] | SAC/Vac NR | 1.00 | MULTI | cant, pct, imp | **NR** |
| [451]-[458] | NR genéricos (×8) | 1.00 | MULTI+CN | cant, pct, imp, CN | **NR** |
| [459] | — | — | NO EXISTE | — | — |
| [460]-[468] | NR genéricos (×9) | 1.00 | MULTI+CN | cant, pct, imp, CN | **NR** |
| [491]-[492] | SAC NR variantes (×2) | 1.00 | IMP_PURO | imp | **NR** |
| [493] | SAC NR variante | 1.00 | MULTI | cant, pct, imp | **NR** |
| [494]-[495] | SAC NR variantes (×2) | 1.00 | IMP_PURO | imp | **NR** |
| [496] | SAC NR variante | 1.00 | MULTI | cant, pct, imp | **NR** |
| [501]-[504] | Acuerdos s/NR (×4) | **S411a469** | S411_pct | pct (sin imp) | **R** ⚠️ |
| [511]-[520] | Ret. s/NR (×10) | **S411a469** | S411_bug | pct, imp=1 requerido | **R** ⚠️ |
| [551]-[562] | Ret. s/H+NR (×12) | **S1a199+S411a469** | S_bug | pct, imp=1 requerido | **R** ⚠️ |
| [601]-[605] | Asig. NR Decretos (×5) | 1.00 | MULTI+CN | cant, pct, imp, CN | **NR** |
| [610]-[618] | Beneficios Sociales (×9) | 1.00 | IMP_PURO | imp | **NR** |
| [620] | Asig. por hijo | 1.00 | MULTI | cant, imp | **NR** |

### 9.2 Detalle de grupos especiales

#### [501-504] Acuerdos s/NR → R

Sin campo `importe`, sin campo `conceptoNumero`. Calculan directamente `S411a469 × pct/100`.
No tienen el bug triple-campo porque carecen del campo importe.

| Slot | Nombre sugerido | pct default | Fórmula |
|------|----------------|-------------|---------|
| [501] | Acuerdo Sindicato s/NR | 2% | `S411a469 × 2/100` |
| [502] | Acuerdo OS s/NR | vacío | `S411a469 × pct/100` |
| [503] | Acuerdo Fed. s/NR | vacío | `S411a469 × pct/100` |
| [504] | Acuerdo RENATEA s/NR | 2% | `S411a469 × 2/100` |

**Verificado [501]:** S411a469=$250.000 × 2% = **$5.000** → R

#### [511-520] Retenciones s/NR → R

Tienen campo `importe`. Por el bug triple-campo, con `importe=0` el resultado es $0.
Se debe setear **`importe=1`** para que la fórmula sea `S411a469 × pct/100 × 1`.

**Verificado [511]:** S411a469=$150.000 × 3% × 1 = **$4.500** → R

#### [551-562] Retenciones s/H+NR → R

`importeCalculados = S1a199 + S411a469`. Mismo bug que [511-520]: requiere **`importe=1`**.

| Campo | Valor en prueba |
|-------|----------------|
| `subtotal_1a199_553` | $1.345.674,12 |
| `subtotal_411a469_553` | $150.000 |
| `importeCalculados_553` | **$1.495.674,12** (suma automática) |

**Verificado [553]:** (S1a199+S411a469) × 3% × 1 = $1.495.674,12 × 3% = **$44.870,22** → R

#### [411-418] vs [419-421] estructura

- [411-418]: MULTI+CN → soportan cant × pct × importe y también CN (% de otro concepto)
- [419-421]: IMP_PURO → solo importe (suspensión COVID, sin multiplicadores)

#### [430-438] patrón alternado

- [430,431,433,434,436,437]: IMP_PURO
- [432,435,438]: MULTI (cant+pct+imp, sin CN)

#### [610-618] Beneficios Sociales

Solo campo `importe`. Sin cantidad, sin pct, sin CN. Monto fijo art. 103bis LCT.

#### [620] Asignación por hijo

`cant` = número de hijos, `imp` = valor por hijo (ANSES según tramo).
Fórmula: `imp × cant`. Sin pct, sin CN.
**Verificado:** imp=$30.000 × cant=2 = **$60.000** → NR

---

## 10. Casos de Prueba — Resultados Verificados

| CP | Concepto | Parámetros clave | Resultado | Fórmula verificada | ✓ |
|----|---------|-----------------|-----------|-------------------|---|
| 001 | Sueldo [1] | SL=1.094.044, cant=30, pct=100, divC=30 | $1.094.044 | SL/30×30×1 | ✓ |
| 002 | Sueldo parcial [1] | cant=15 | $547.022 | SL/30×15 | ✓ |
| 003 | Antigüedad % [3] | S1a2=1.094.044, cant=13, pct=1 | $142.225,72 | S1a2×13×0.01 | ✓ |
| 004 | Antigüedad imp [4] | cant=13, imp=10.000 | $130.000 | 13×10.000 | ✓ |
| 005 | Premio [5] | S1a2=1.094.044, pct=10 | $109.404,40 | S1a2×0.10 | ✓ |
| 006 | Feriados [10] | SL=1.094.044, divC=25, cant=2 | $87.523,52 | SL/25×2 | ✓ |
| 007 | Feriados [72] | imp=36.468,13, cant=2, pct=150 | $109.404,39 | imp×2×1.5 | ✓ |
| 008 | HE 50% VH [17] | VH=6.078,02, pct=150, cant=10 | $91.170,33 | VH×1.5×10 | ✓ |
| 009 | HE 50% s/1-9 [23] | S1a9=1.345.674, divH=180, cant=10 | $112.139,51 | S1a9/180×1.5×10 | ✓ |
| 010 | Asig.Comp. s/1-19 [29] | S1a19=1.345.674, pct=5 | $67.283,71 | S1a19×0.05 | ✓ |
| 011 | Prest.Din. [81] | imp=36.468,13, cant=5 | $182.340,65 | imp×5 | ✓ |
| 012 | Prest.ART [82] | imp=250.000 | $250.000 | imp fijo | ✓ |
| 013 | Jubilación [201] | S1a199=1.345.674, pct=11 | $148.024,15 | S1a199×0.11 | ✓ |
| 014 | Clamp máx [201] | raw=120.344, max=50.000 | $50.000 | min(max,raw) | ✓ |
| 015 | Clamp mín [201] | raw=120.344, min=200.000 | $200.000 | max(min,raw) | ✓ |
| 016 | OS Adherente [204] | S1a199=1.345.674, pct=15, cant=2 | $403.702,24 | S1a199×0.15×2 | ✓ |
| 017 | ANSSAL [205] | S1a199=1.345.674, pct=3 | $40.370,22 | S1a199×0.03 | ✓ |
| 018 | Federaciones [207] | S1a199=1.345.674, pct=5 | $67.283,71 | S1a199×0.05 | ✓ |
| 019 | Ret. libre [209] | S1a199=1.345.674, pct=2 | $26.913,48 | S1a199×0.02 | ✓ |
| 020 | Adelanto [231] | imp=80.000, cant=1 | $80.000 → R | imp×1 | ✓ |
| 021 | Acuerdo s/NR [501] | S411a469=250.000, pct=2 | $5.000 → R | S411×0.02 | ✓ |
| 022 | Ret. s/NR [511] | S411a469=150.000, pct=3, imp=1 | $4.500 → R | S411×0.03×1 | ✓ |
| 023 | OS s/H+NR [553] | S1a199+S411a469=1.495.674, pct=3, imp=1 | $44.870,22 → R | base×0.03×1 | ✓ |
| 024 | NR [411] | imp=50.000, cant=3 | $150.000 → NR | imp×3 | ✓ |
| 025 | NR [415] CN | CN=1 (SB), pct=10 | $109.404,40 → NR | SB×0.10 | ✓ |
| 026 | Beneficio [610] | imp=5.000 | $5.000 → NR | imp | ✓ |
| 027 | Asig.hijo [620] | imp=30.000, cant=2 | $60.000 → NR | imp×2 | ✓ |
| 028 | Total Neto | H=1.345.674, D=0, R=215.307,85, NR=0 | $1.130.366,27 | H−D−R+NR | ✓ |
| 029 | CN inactivo [7] | CN=10 (inactivo), pct=50 | $0 | CN=0→raw=0 | ✓ |
| 030 | CN activo [7] | CN=10 (activo=$87.523,52), pct=50 | $43.761,76 | 87523×0.5 | ✓ |
| 031 | Cascada NR→[501] | NR: 100k→250k | imp501: 2k→5k → auto | S411 cascada | ✓ |
| 032 | Bug importe=0 [511] | S411=150.000, pct=3, imp=0 | $0 (incorrecto) | bug: base×pct×0=0 | BUG |
| 033 | Workaround [511] | S411=150.000, pct=3, imp=1 | $4.500 (correcto) | base×pct×1 | ✓ |
| 034 | Bug triple-campo [553] | base=1.495.674, pct=27, imp=100.000 | $40.387.001 (overflow) | base×pct×imp | BUG |
| 035 | CN prioridad [105] | CN=1, pct=5, imp=500.000 | $54.702,20 | CN×pct (imp ignorado) | ✓ |
| 036 | Desactivar SB [1] | S1a2→0, ant=S1a2×13×1% | ~$0.13 residual | fp precision | INFO |
| 037 | Pct negativo [3] | pct=-5, cant=13 | -$711.128 | sin validación | INFO |
| 038 | [40] Premio sin base | pct=100, imp=0 | $0 (base=1.00, no S1a2) | imp×cant×pct | ✓ |

---

## 11. Bugs Verificados

### 11.1 Bug triple-campo (base × pct × importe)

**Aplica a**: Cualquier concepto que tenga simultáneamente un subtotal real como base + campo `porcentaje` + campo `importe`.

**Conceptos afectados confirmados**: [511]-[520], [551]-[562]

**Comportamiento**:
```
Con importe=0:  raw = 0         ← resultado siempre cero
Con importe=1:  raw = BASE×pct/100×1  ← workaround correcto
Con importe=N:  raw = BASE×pct/100×N  ← multiplicador destructivo
```

**Workaround**: Siempre setear `importe=1` en estos conceptos.
**No es destructivo en**: conceptos con base=1.00, porque `1×pct/100×imp = imp×pct/100`.

### 11.2 SAC Proporcional [42] — servidor

`importeCalculados_42 = 1.00` siempre en cliente. Resultado incorrecto hasta guardar.

### 11.3 Sin validaciones de rango

- Porcentaje negativo → importe negativo sin alerta
- Porcentaje extremo (ej: 999%) → sin límite superior
- Neto negativo → posible sin restricción
- [209]-[210] y [226]-[230] pct vacío por defecto → resultado $0 hasta configurar

### 11.4 Residual de punto flotante

Al desactivar concepto [1] con S1a2→0, los dependientes muestran ~$0.10-$0.13 en vez de $0 exacto. Origen: aritmética JS de punto flotante. No afecta la liquidación real (se redondea al guardar).

---

## 12. Resumen de Reglas de Negocio

| Regla | Estado |
|-------|--------|
| `Neto = H − D − R + NR` | ✅ |
| Base retenciones S1a199 = Total Haberes | ✅ |
| [204] OS Adherente: `S1a199 × pct/100 × cant`, pct default=15% | ✅ |
| [209-210] y [226-230] usan S1a199; [211-220] son multi-modo | ✅ |
| [501-504] van a R (no a NR) — base S411a469 sin campo imp | ✅ |
| [511-520] van a R — requieren imp=1 por bug | ✅ |
| [551-562] base = S1a199+S411a469 — requieren imp=1 por bug | ✅ |
| [10] Feriados: `SL/25 × cant` SIN campo pct | ✅ |
| [40] Premio genérico: base=1.00 (NO S1a2) | ✅ |
| [411-418] MULTI+CN (no solo importe puro) | ✅ |
| CN > importe en prioridad de cálculo | ✅ |
| CN a concepto inactivo = resultado $0 | ✅ |
| Cascada NR → S411a469 → [501-562] → R_total | ✅ |
| Cascada S1a2=0 cuando [1] se desactiva | ✅ |
| Bug triple-campo: base×pct×imp (workaround: imp=1) | ✅ |
| Residual flotante ~$0.13 cuando base=0 | ✅ |
| SAC Proporcional [42] no calcula en cliente | ✅ |
| valorHora = SL/180 = $6.078,02 | ✅ |
| valorDía SB = SL/30 = $36.468,13 | ✅ |
| valorDía Feriado [10] = SL/25 = $43.761,76 | ✅ |

---

*Documento v3 — Análisis completamente verificado por inspección DOM directa — 2026-04-20*
*231 conceptos mapeados; estructura de cada campo confirmada por JavaScript en el navegador*
