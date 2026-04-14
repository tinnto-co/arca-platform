# Liquidación de Sueldos — SOS Contador

> Documento unificado basado en relevamiento directo del sistema (scraping del DOM) y documentación oficial del módulo.
> **Empresa de referencia:** E-presis S.A. — CUIT 30717554864
> **Empleados de ejemplo:** AZUAJE ROJAS, EDWARD ALEJANDRO (Leg. 00000000002) y GONZALEZ, SILVANA ISABEL (Leg. 00000000001) — Período Marzo 2026

---

## 1. Descripción general del módulo

El módulo de Sueldos de SOS Contador permite liquidar sueldos y generar los archivos requeridos por ARCA.

**Limitaciones declaradas:**
- No maneja convenios colectivos
- No genera asientos contables de sueldos

**Funcionalidades:**

| Funcionalidad | Descripción |
|---|---|
| Carga manual de recibos | Ingreso de recibos con detalle de conceptos |
| Copia de recibos entre períodos | Copiar todos los recibos de un mes al siguiente |
| Impresión de recibos | 1 o 2 recibos por hoja, con firma digitalizada |
| Libro de Sueldos | Generación del libro en formato PDF |
| Archivo F931 / SICOSS | Exportación para Formulario 931 |
| LSD (ARCA) | Generación del Libro de Sueldos Digital |

---

## 2. Configuración inicial — Datos del Empleador

Configuración global que aplica a todos los empleados por defecto. Se accede desde **Sueldos → Datos del Empleador**.

**Libro de Sueldos:**
- Título del libro (encabezado "HABILITACION DEL REGISTRO DE HOJAS MOVILES")
- Posibilidad de asignar títulos distintos por empleado (para empleadores con varios libros)
- Exclusión de campos como nacionalidad o fecha de nacimiento

**Impresión de Recibos:**
- Cantidad de recibos por página (1 o 2)
- Omitir "período cargas" en el impreso
- Activar redondeo (SOS siempre redondea internamente; esta opción controla si se muestra en el impreso)
- Firma digitalizada del empleador

---

## 3. Legajos

Cada legajo representa un empleado. Sus campos clave son:

| Campo | Descripción |
|---|---|
| **Valor Sueldo** | Sueldo mensual del empleado. Se actualiza con cada escala salarial |
| **Valor Hora** | Para empleados liquidados por hora. Alternativa al Valor Sueldo |
| **Días Mensuales Normales** | Denominador para calcular proporcional de días (normalmente 30) |
| **Horas Mensuales Normales** | Horas normales del mes (ej: 240). Base para calcular valor de hora extra |
| **% Ap Adicional SS** | Porcentaje adicional de Aporte de Seguridad Social para empleados con aportes diferenciales |
| **Título para Libro Sueldos** | Encabezado especial si el empleado pertenece a un libro diferente al del empleador |

Los valores del legajo se heredan al crear un recibo nuevo, pero pueden sobreescribirse en el recibo sin modificar el legajo.

---

## 4. Recibos

### Tipos de recibo disponibles

| Tipo | Descripción |
|---|---|
| Sueldo | Liquidación mensual estándar |
| Anticipo SAC | Adelanto del SAC |
| SAC | Sueldo Anual Complementario |
| Vacaciones | Liquidación de vacaciones |
| Liquidación Final | Liquidación por desvinculación |
| Comisiones | Liquidación de comisiones |
| Fondo de Desempleo | Fondo de desempleo |
| Varios | Conceptos varios |
| Combinados | Sueldo+SAC, Sueldo+Vacaciones, Sueldo+Liq Final, SAC+Vacaciones, etc. |

### Campos del encabezado del recibo

| Campo | Campo interno | Descripción |
|---|---|---|
| **Empleado** | `cblegajo` | Legajo seleccionado |
| **Tarea desempeñada** | — | Descripción libre de la tarea (aparece en el recibo impreso) |
| **Categoría** | — | Categoría laboral (viene del legajo) |
| **Sueldo (Recibo)** | `txhorasueldorecibo` | **Valor de la escala salarial para el puesto y período.** Punto de partida de toda la liquidación. Puede editarse sin modificar el legajo |
| **Sueldo (Legajo)** | `txhorasueldolegajo` | Sueldo registrado en el legajo al momento de crear el recibo |
| **Antigüedad** | `txantiguedad` | Años de antigüedad (determina el % de antigüedad) |
| **Hs. mens.** | `txhorasnormales` | Horas normales mensuales |
| **Período** | `cbanio` / `cbmes` / `cbquincena` | Año / Mes / Tipo (Mes completo, 1ra quincena, 2da quincena) |
| **Tipo** | `txtipo` | Tipo de liquidación |
| **Situación de revista 1/2/3** | `cbsituacion1/2/3` | Estado laboral del empleado y desde qué día rige (Activo, ILT, Licencia, Baja, etc.) |
| **Remuneración 4 y 8** | `txremuneracionimponible4_8` | Base imponible para OS y cargas diferenciales. Si se deja vacío se calcula automáticamente para LSD |
| **Remuneración 9** | `txremuneracionimponible9` | Base imponible para ART. Si se deja vacío se calcula automáticamente |
| **Contrib. Tarea Diferencial** | `txcontribuciontareadiferencial` | % adicional de contribución patronal por actividad riesgosa (en %) |
| **Importe a detraer Ley 27430** | `tximporteadetraer27430` | Monto a descontar de la base imponible |
| **Contrib. Adicional OS** | `txcontribucionadicionalOS` | Aporte adicional cuando el calculado no alcanza el mínimo de la obra social |
| **Fecha de Liquidación** | `txfecha` | Fecha en que se procesa la liquidación |
| **Obra Social** | `cbobrasocial` | Obra social del empleado |
| **Fecha de Pago** | `txfechapago` | Fecha en que se efectúa el pago |
| **Lugar de Pago** | `txlugarpago` | Ciudad/lugar de pago (ej: CABA) |
| **Forma de Pago** | `cbformapago` | 1=Efectivo, 2=Acreditación, 3=Cheque, 4=Otro |
| **CBU / Banco** | `txCBU` / `txbanco` | Datos bancarios (obligatorio si Forma de Pago = Acreditación) |
| **Período Cargas depositado** | `txperiodo` | Período en que se depositan las cargas ante ARCA (puede diferir del período liquidado) |
| **Observación interna** | `txmemo` | Nota interna (no aparece en el recibo impreso) |
| **Obs. a imprimir en recibo** | `txmemo_recibo` | Nota que sí aparece en el recibo impreso |

---

## 5. Tabla de conceptos — "detalle del recibo"

Esta tabla contiene todas las líneas que componen el recibo. Cada fila es un concepto (remunerativo, descuento, retención o no remunerativo).

### 5.1 Columnas de la tabla

#### Columnas visibles al usuario

| # | Columna | Campo interno | Descripción |
|---|---|---|---|
| 0 | — | `incluir_N` | **Checkbox activo/inactivo.** El contador puede habilitar o deshabilitar cada concepto para ese recibo en particular. El sistema muestra todos los conceptos disponibles; solo los marcados suman al recibo |
| 1 | Nro. | — | Número SOS del concepto (1–599) |
| 2 | Nombre | `memo_N` | Nombre del concepto + código ARCA asociado. Campo memo editable para personalizar el texto en ese recibo |
| 15 | Cantidad | `cantidad_N` | Multiplicador: días trabajados, años de antigüedad, horas extra, unidades, etc. |
| 16 | % | `porcentaje_N` | Porcentaje a aplicar. Ej: 100% para sueldo, 11% para jubilación |
| 17 | Importe del concepto nro. | `conceptoNumero_N` | Referencia a otro concepto por número. Usa el resultado de ese concepto como base de cálculo |
| 18 | Importe | `importe_N` | Monto fijo en pesos. Se usa para conceptos de importe manual (no calculado) |
| 19 | Importe mínimo | `importeMinimo_N` | Piso: si el cálculo da menos, se usa este valor |
| 20 | Importe máximo | `importeMaximo_N` | Techo: si el cálculo supera este valor, se usa este máximo |
| 21 | **Haberes** | — | Resultado si el concepto es remunerativo (rango 1–99) |
| 22 | **Desc.** | — | Resultado si el concepto es descuento (rango 100–199) |
| 23 | **Reten.** | — | Resultado si el concepto es retención (rango 200–299) |
| 24 | **No Rem.** | — | Resultado si el concepto es no remunerativo (rango 400–499) |

> Las columnas **Haberes / Desc. / Reten. / No Rem.** son de solo lectura. La asignación es automática según el rango del número de concepto.

#### Columnas ocultas (usadas para cálculo interno)

Estas columnas están presentes en la tabla (clase CSS `ocultos`) y contienen los valores intermedios que el sistema usa para calcular los importes:

| # | Columna | Campo interno | Descripción |
|---|---|---|---|
| 3 | Val.Hora | — | Valor hora del legajo |
| 4 | Sueldo Legajo | `txhorasueldolegajo` | Sueldo registrado en el legajo |
| 5 | Sueldo | `txhorasueldorecibo` | Sueldo del recibo (resultado del concepto 1). Base más usada para adicionales |
| 6 | Subtot. 1/9 | `subtotal_1a9_N` | Suma de los conceptos remunerativos 1 a 9 |
| 7 | Subtot. 1/19 | `subtotal_1a19_N` | Suma de los conceptos remunerativos 1 a 19 |
| 8 | Subtot. 1/26 | `subtotal_1a26_N` | Suma de los conceptos remunerativos 1 a 26 |
| 9 | Subtot. 1/39 | `subtotal_1a39_N` | Suma de los conceptos remunerativos 1 a 39 |
| 10 | Subtot. 1/199 | `subtotal_1a199_N` | Suma de todos los remunerativos menos descuentos (conceptos 1–199). **Base para calcular retenciones** |
| 11 | Subtot. 411/469 | — | Suma de conceptos no remunerativos 411–469. Base para retenciones sobre no-rem |
| 12 | Dividido hs.norm. | `divididoHoras_N` | Divisor por horas normales del mes. Default `1` (no divide). Para horas extras se usa el valor del legajo |
| 13 | Dividido cantidad | `divididoCantidad_N` | Divisor por días u otras unidades. Ej: 30 para tarifa diaria, 25 para feriados |
| 14 | Subtotal Calculados | `importeCalculados_N` | **BASE de cálculo** = `valorBase ÷ divHsNorm ÷ divCantidad`. Es la tarifa unitaria que luego se multiplica por cantidad y % |

---

## 6. Lógica de cálculo — partiendo de la escala salarial

### 6.1 Punto de partida: la escala salarial

Todo el recibo se deriva de un único valor raíz: el **Sueldo pactado en la escala salarial** para el puesto y el período.

```
ESCALA SALARIAL (puesto + mes)
        ↓
  campo "Sueldo" (txhorasueldorecibo) = valor pactado
        ↓
  todos los conceptos se calculan a partir de este valor
```

La escala salarial define cuánto cobra un empleado de determinada categoría en determinado mes. Ese valor se carga en el legajo y se hereda al crear el recibo. Es el origen de la cadena completa de cálculos.

### 6.2 Flujo causal completo

```
ESCALA SALARIAL → Sueldo = $1.094.041
        │
        ├─► Tarifa diaria = Sueldo / 30 = $36.468,03
        │       │                (= importeCalculados_1)
        │       └─► Sueldo Básico = $36.468,03 × 30 días × 100% = $1.094.041  → HABERES
        │
        ├─► Antigüedad = Sueldo × (años × 1%) = $1.094.041 × 3% = $32.821     → HABERES
        │
        ├─► Asig. Complementaria = Subtotal_1a9 × % configurado               → HABERES
        │
        │   ... (otros haberes) ...
        │
        └─► TOTAL HABERES = $1.220.729,85  ← base imponible (subtotal_1a199)
                │
                ├─► Jubilación SIPA  = $1.220.729,85 × 11% = $134.280,28      → RETENCIONES
                ├─► PAMI             = $1.220.729,85 × 3%  = $36.621,90       → RETENCIONES
                ├─► Obra Social      = $1.220.729,85 × 3%  = $36.621,90       → RETENCIONES
                └─► Sindicato        = $1.220.729,85 × 2%  = variable         → RETENCIONES

No Remunerativos = montos fijos (acuerdos, tickets alimentarios, etc.)
                   NO derivan del sueldo — NO integran la base imponible       → NO REM.

NETO = Haberes + No Remunerativos − Retenciones − Descuentos
```

### 6.3 Fórmula de cálculo por concepto

```
Paso 1 — Subtotal Calculados (BASE unitaria):
  importeCalculados_N = valorBase ÷ divididoHoras_N ÷ divididoCantidad_N

Paso 2 — Importe del concepto:
  importeConcepto_N = importeCalculados_N × cantidad_N × (porcentaje_N / 100)

Paso 3 — Clamping (si tiene piso/techo):
  Si importeConcepto_N < importeMinimo_N → usar importeMinimo_N
  Si importeConcepto_N > importeMaximo_N → usar importeMaximo_N

Paso 4 — Acumulación:
  El resultado se vuelca en Haberes / Desc. / Reten. / No Rem.
  según el rango del número de concepto
```

**`valorBase`** (columna oculta que se usa como divisor) depende del tipo de concepto:

| Tipo de concepto | valorBase |
|---|---|
| Haberes basados en sueldo | `txhorasueldorecibo` (el sueldo del recibo). La tarifa diaria resulta de dividirlo por `divididoCantidad` (30) |
| Retenciones legales | `subtotal_1a199` = suma de todos los haberes (base imponible) |
| Haberes basados en horas | `txvalorHora` (valor hora del legajo) |
| Subtotal parcial | `subtotal_1a9`, `subtotal_1a19`, `subtotal_1a26`, `subtotal_1a39` según config del concepto |
| Monto fijo | campo `importe_N` ingresado manualmente |
| Referencia a otro concepto | `importeConcepto_N` del concepto indicado en `conceptoNumero_N` |

---

## 7. Catálogo de conceptos predefinidos

Los conceptos se identifican por rangos numéricos que determinan automáticamente su tipo:

| Rango | Tipo | Columna destino |
|---|---|---|
| **1 – 99** | Remunerativos | Haberes |
| **100 – 199** | Descuentos | Desc. |
| **200 – 299** | Retenciones sobre remunerativos | Reten. |
| **400 – 499** | No Remunerativos | No Rem. |
| **500 – 599** | Retenciones sobre no remunerativos | Reten. |

### 7.1 Conceptos remunerativos (1–99) → Haberes

| Código SOS | Nombre | valorBase | Fórmula |
|---|---|---|---|
| **1** | Sueldo Básico | Sueldo | `(sueldo ÷ 30) × díasTrabajados × 100%` |
| **2** | Horas Normales | Val.Hora | `valorHora × cantidadHoras` |
| **3** | Antigüedad (%) | Sueldo (resultado conc. 1) | `sueldo × años × 1%` |
| **5** | Premio | Sueldo | `sueldo × %` |
| **9** | Asig. Complementaria s/sueldo | Sueldo | `sueldo × %` |
| **10** | Feriados | Sueldo | `sueldo ÷ 25` |
| **17** | Horas extras 50% s/valor hora | Val.Hora | `valorHora × cantidad` |
| **18** | Horas extras 100% s/valor hora | Val.Hora | `valorHora × cantidad` |
| **19** | Asig. Comp. s/conc. 1 a 9 | Subtot. 1/9 | `sub1_9 × %` |
| **20** | Asig. Comp. s/conc. 1 a 9 (alt.) | Subtot. 1/9 | `sub1_9 × %` |
| **21** | Horas extras 50% s/sueldo | Sueldo | `(sueldo ÷ hsMensuales) × cantidad` |
| **22** | Horas extras 100% s/sueldo | Sueldo | `(sueldo ÷ hsMensuales) × cantidad` |
| **23** | Horas extras 50% s/conc. 1 a 9 | Subtot. 1/9 | `(sub1_9 ÷ hsMensuales) × cantidad` |
| **24** | Horas extras 100% s/conc. 1 a 9 | Subtot. 1/9 | `(sub1_9 ÷ hsMensuales) × cantidad` |
| **25** | Horas extras 50% s/conc. 1 a 19 | Subtot. 1/19 | `(sub1_19 ÷ hsMensuales) × cantidad` |
| **26** | Horas extras 100% s/conc. 1 a 19 | Subtot. 1/19 | `(sub1_19 ÷ hsMensuales) × cantidad` |
| **29** | Asig. Comp. s/conc. 1 a 19 | Subtot. 1/19 | `sub1_19 × %` |
| **30** | Asig. Comp. s/conc. 1 a 26 | Subtot. 1/26 | `sub1_26 × %` |
| **43** | Asig. Comp. s/conc. 1 a 39 | Subtot. 1/39 | `sub1_39 × %` |

### 7.2 Conceptos de descuento (100–199) → Desc.

| Código SOS | Descripción |
|---|---|
| **101 – 104** | Descuentos proporcionales sobre sueldo: `sueldo ÷ díasMensualesNormales` |

Otros descuentos de esta categoría: embargos judiciales, anticipos de sueldo, cuotas de préstamos.

### 7.3 Conceptos de retención (200–299) → Reten.

Se calculan sobre `subtotal_1a199` (total remunerativo neto).

| Código SOS | Código ARCA | Nombre | Base | % |
|---|---|---|---|---|
| **201** | `810000` | Jubilación SIPA | sub1_199 | 11% |
| **202** | `810001` | Ley 19032 (PAMI) | sub1_199 | 3% |
| **203** | `810002` | Obra Social (aporte empleado) | sub1_199 (o Rem 4 y 8) | 3% |
| **204** | `810003` | ANSSAL | sub1_199 | — |
| **206** | `810004` | Cuota Sindical | sub1_199 | % según convenio |
| **207** | `810006` | RENATEA (UATRE) | sub1_199 | 1,5% |
| **208** | `810009` | OS Adherente | sub1_199 | — |
| **209** | `821000` | Otros conceptos de retenciones | sub1_199 | variable |
| **210** | `821000` | Otros conceptos de retenciones | sub1_199 | variable |
| **221** | — | Aporte adicional OS (empleado) | — | — |
| **222** | — | Contribución adicional OS (empleador) | — | — |
| **226 – 230** | — | Retenciones adicionales sobre base total | sub1_199 | — |
| **234** | — | Pago a cuenta Asignación Puente al Empleo | — | — |

> **Nota sobre Obra Social (203/810002):** el cálculo usa `sub1_199` como base en la tabla de conceptos, pero para LSD/F931 se puede sobreescribir usando el campo **Remuneración 4 y 8** del encabezado del recibo. Esto es necesario cuando el empleado tiene no remunerativos con aporte a OS que no están en `sub1_199`.

### 7.4 Conceptos no remunerativos (400–499) → No Rem.

| Código SOS | Descripción | Incluye en LSD |
|---|---|---|
| **411** | Otros No Rem. c/Ap y Cont. OS | Rem. 4 y 8 |
| **412** | Otros No Rem. c/Ret OS y ART | Rem. 4, 8 y 9 |
| **413** | Otros No Rem. c/Ap y Cont. OS (línea 2) | Rem. 4 y 8 |
| **414** | Otros No Rem. sin retenciones | No se incluye en ninguna base |
| **419** | Suspensión parcial art. 223 bis Resol. 397/20 | — |
| **420** | Suspensión art. 223 bis mes completo (se informa como remunerativo) | — |
| **421** | Rem. Habitual Dec. 792/20 | — |
| **603** | Asign. din. – Dec. 551/2022 (con ART) | Rem. 9 |

La diferencia clave entre los subtipos de no remunerativos es en qué **bases imponibles del LSD** se incluyen:

| Subtipo | Rem 1 | Rem 4 y 8 | Rem 9 |
|---|---|---|---|
| Sin retenciones | ✗ | ✗ | ✗ |
| c/Ap y Cont. OS | ✗ | ✓ | ✗ |
| c/Ret OS y ART | ✗ | ✓ | ✓ |
| c/Ret ART | ✗ | ✗ | ✓ |
| c/Ap Rem 1, 4, 5, 8 y 9 | ✓ | ✓ | ✓ |

### 7.5 Retenciones sobre no remunerativos (500–599)

| Rango | Base de cálculo |
|---|---|
| **501 – 504** | `subtotal_411a469` |
| **511 – 515** | `subtotal_411a469` (requiere completar valor `1` en el campo importe) |
| **551 – 557, 559** | `subtotal_1a199 + subtotal_411a469` |

---

## 8. Campos Remuneración 4, 8 y 9 (para LSD / F931)

Estos campos del encabezado del recibo permiten informar manualmente las bases imponibles para los archivos de exportación.

**Comportamiento por defecto:**
- Si están **vacíos**: el LSD y el F931 calculan automáticamente las bases a partir de los conceptos liquidados.
- Si tienen **valor**: ese valor sobreescribe el cálculo automático para esa base en particular.

**Cuándo se usan manualmente:**
- Empleados a jornada parcial que no alcanzan la base mínima de OS → se completa la base mínima en Rem 4 y 8.
- Cuando los no remunerativos con aporte OS deben sumar a la base de OS pero no están en `sub1_199`.

**Dos métodos para empleados part-time:**
1. Usar conceptos 221 y 222 + campo Remuneración 4 y 8 con la base mínima *(método recomendado)*
2. Usar conceptos adicionales de OS + campo Contrib. Adicional OS en el encabezado

---

## 9. Ejemplos reales de conceptos liquidados

**Empresa:** E-presis S.A. — **Empleado:** AZUAJE ROJAS, EDWARD ALEJANDRO
**Categoría:** Auxiliar Especializado B — **Sueldo de escala:** $1.094.041 — **Antigüedad:** 3 años

| N° | Nombre | valorBase | Cálculo | Resultado | Columna |
|---|---|---|---|---|---|
| 1 | Sueldo Básico | $1.094.041 ÷ 30 = $36.468,03/día | $36.468,03 × 30 × 100% | **$1.094.041** | Haberes |
| 3 | Antigüedad (3%) | $1.094.041 | $1.094.041 × 3 años × 1% | **$32.821** | Haberes |
| 19 | Asig. Comp. (Presentismo) | Subtot. 1/9 | subtot_1a9 × % | **variable** | Haberes |
| — | **TOTAL HABERES** | | | **$1.220.729,85** | |
| 201 | Jubilación SIPA | $1.220.729,85 | × 11% | **$134.280,28** | Retenciones |
| 202 | PAMI | $1.220.729,85 | × 3% | **$36.621,90** | Retenciones |
| 203 | Obra Social | $1.220.729,85 | × 3% | **$36.621,90** | Retenciones |
| 206 | Sindicato | $1.220.729,85 | × % convenio | **variable** | Retenciones |
| — | **TOTAL RETENCIONES** | | | **$244.279,23** | |
| 411 | No Rem. c/Ap OS | Monto fijo | $100.000 × 1 × 100% | **$100.000** | No Rem. |
| — | **NETO** | | Haberes + No Rem. − Retenciones − Desc. | **calculado** | |

---

## 10. Flujo completo de liquidación mensual

```
1. ESCALA SALARIAL define el sueldo pactado para el puesto y el mes
        ↓
2. El sueldo se carga en el Legajo del empleado (o se actualiza masivamente)
        ↓
3. Se crea el recibo: el sistema hereda sueldo, categoría, antigüedad y obra social del legajo
        ↓
4. Se define período, tipo de liquidación y situación de revista
        ↓
5. El sistema pre-carga todos los conceptos disponibles (activos e inactivos)
   El contador marca los que aplican para ese empleado en ese período
        ↓
6. Para cada concepto habilitado (en orden de número de concepto):
   a. Se determina el valorBase (sueldo, val.hora, subtotal previo, importe fijo, o referencia)
   b. importeCalculados = valorBase ÷ divHsNorm ÷ divCantidad  (tarifa unitaria)
   c. importeConcepto   = importeCalculados × cantidad × (% / 100)
   d. Se aplican mínimo y máximo si están configurados
   e. El resultado se acumula en Haberes / Desc. / Reten. / No Rem. según el rango
        ↓
7. Totales del recibo:
   Total Haberes          = Σ conceptos 1–99
   Total Descuentos       = Σ conceptos 100–199
   Total Retenciones      = Σ conceptos 200–299 + 500–599
   Total No Remunerativos = Σ conceptos 400–499
        ↓
8. Neto = Haberes + No Remunerativos − Descuentos − Retenciones
        ↓
9. Se guarda el recibo → disponible para imprimir, copiar y exportar
```

---

## 11. Copia masiva de recibos entre períodos

Desde el listado de Recibos se pueden copiar todos los recibos de un período origen a un período destino. Se crea una copia exacta de todos los recibos (conceptos y valores).

**Pasos:**
1. Seleccionar año, mes y quincena del período destino
2. Presionar "Copiar todos los recibos de otro período"
3. Elegir el período origen
4. Confirmar → se copian todos los recibos

Luego se ajustan manualmente las novedades del nuevo período (horas extras, ausencias, bonos variables).

---

## 12. Exportaciones disponibles

| Botón | Formato | Descripción |
|---|---|---|
| Imprimir todos los Recibos | PDF | Recibos de todos los empleados del período |
| Libro Sueldos | PDF | Libro de sueldos ley |
| Libro (sólo encab.) | PDF | Solo encabezados del libro |
| F931 SICOSS V42 | TXT | Archivo para declaración jurada mensual (SICOSS) |
| Conceptos LSD | TXT | Configuración de conceptos para ARCA (se sube una vez o cuando hay conceptos nuevos) |
| Liquidación LSD | TXT | Liquidación mensual para importar en ARCA/LSD |
| XLS c/conceptos | XLSX | Excel con detalle de conceptos por empleado |
| XLS agrupado por legajo | XLSX | Excel agrupado por legajo |
| Acredit. Macro | TXT | Archivo de acreditación bancaria |

---

## 13. Integración con el Libro de Sueldos Digital (LSD — ARCA)

### Proceso completo

**Parte A — Configuración inicial de conceptos** *(una sola vez, o al agregar conceptos nuevos)*

1. En SOS: **Sueldos → Recibos → "Conceptos LSD"** → descarga `conceptosLSD.txt`
2. En ARCA / LSD: **Conceptos → Carga masiva por importación** → subir el archivo

> Los códigos ARCA se ingresan con ceros hasta completar 10 dígitos (ej. `0001700000`).

**Parte B — Carga mensual** *(cada mes)*

1. En SOS: **Sueldos → Recibos → "Liquidación LSD"** → descarga TXT del período
2. En ARCA / LSD: crear o seleccionar el período → nueva liquidación → importar TXT

**Validaciones que realiza ARCA al importar:**

| Validación | Descripción |
|---|---|
| CUIL en relaciones laborales | Cada CUIL debe estar en las relaciones laborales vigentes |
| Consistencia tipo empresa | El tipo de empleador del empleado debe coincidir con el del empleador |
| Consistencia de bases imponibles | Rem 1, 4, 5, 8 y 9 deben ser coherentes entre sí |
| Aporte OS | 3% de Rem 4 debe coincidir con la suma de los conceptos 810002 liquidados |
| SIPA/Jubilación | 11% (+ % adicional si aplica) de Rem 1 debe coincidir con los conceptos 810000 |
| PAMI | 3% de Rem 1 debe coincidir con los conceptos 810001 |
| RENATEA | 1,5% de Rem 1 debe coincidir con los conceptos 810006 |

Una liquidación que pasa todas las validaciones aparece en **verde** en ARCA.

---

## 14. Errores frecuentes en la validación LSD

### Tipo de empresa inconsistente
**Causa:** El tipo de empresa configurado en el legajo del empleado no coincide con el del empleador.
**Solución:** Corregir el tipo de empresa en el legajo. El más común es `Dec 814/01, art. 2, inc. a o b`.

### SAC proporcional (concepto 42) sin situación de revista
**Causa:** Se usó el concepto 42 sin completar la situación de revista.
**Solución:** Completar la situación de revista en los datos del recibo.

### Bases de cálculo diferencial negativas
**Error:** `Base calc. dif. ap. OS y FSR / LRT inválido`
**Causa:** El campo "Remuneración 4 y 8" fue completado con un valor menor al total de remunerativos del recibo, generando una base diferencial negativa.
**Solución:** Corregir el campo Remuneración 4 y 8 a un valor no negativo (puede ser 0).

### Diferencia en aportes SIPA/PAMI/OS
**Error:** `El aporte SIPA/PAMI/Obra Social calculado por ARCA es $XXX y Ud. informa $YYY`
**Causa:** Los conceptos de aporte (810000, 810001, 810002) no coinciden con los % esperados aplicados sobre las bases informadas.
**Solución:** Verificar que se usaron los conceptos correctos y que las bases imponibles son consistentes.

### Error de codificación del archivo TXT
**Error:** `Verifique que la codificación del archivo txt sea ANSI`
**Causa:** El TXT contiene tildes, ñ u otros caracteres especiales.
**Solución:** Abrir el TXT → Archivo → Guardar como → cambiar codificación a **ANSI**. O bien, eliminar tildes y ñ del campo "Tarea" en los legajos.

### Forma de pago inválida
**Error:** `Forma de pago inválida, es distinta de 1, 2, 3 y 4`
**Causa:** Hay recibos del período sin forma de pago seleccionada.
**Solución:** Editar cada recibo afectado y seleccionar forma de pago: 1=Efectivo, 2=Acreditación, 3=Cheque, 4=Otro.
