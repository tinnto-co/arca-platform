# Plan de Acción — Módulo de Sueldos

Análisis de gaps entre SOS Contador y nuestro proyecto, con las tareas concretas para cerrarlos.

---

## Estado actual del módulo

Ya tenemos implementado:
- Estructura de Convenios → Categorías → Escalas salariales con vigencia
- Conceptos por cliente con motor de fórmulas configurable
- Empleados (importados desde LSD y creados manualmente)
- Novedades por período
- Motor de cálculo (`calcularUnaLiquidacion`) con evaluador de expresiones
- Simulador de liquidación y confirmación de recibos
- Tablas de importación de recibos históricos (LSD import)
- Tablas de configuración LSD (`lsdConceptoAfip`, `lsdPerfilConcepto`)
- Protección por organización y rol

---

## Prioridad 1 — Cambios de Schema (base para todo lo demás)

Todos los campos nuevos requieren `bun run db:push` al finalizar.

### 1.1 — Nuevos campos en `payrollLiquidacion`

| Campo | Tipo | Valores | Descripción |
|---|---|---|---|
| `tipo` | enum | ver lista abajo | Tipo de recibo |
| `situacionRevista` | enum | ver lista abajo | Estado laboral del empleado en el período |
| `formaDePago` | enum | `efectivo`, `acreditacion`, `cheque`, `otro` | Requerido para LSD |
| `quincena` | enum | `mes_completo`, `primera`, `segunda` | Período dentro del mes |
| `rem4y8Override` | numeric(14,2) nullable | — | Base imponible manual para Rem 4 y 8 (OS) |
| `rem9Override` | numeric(14,2) nullable | — | Base imponible manual para ART |
| `contribucionTareaDiferencial` | numeric(5,4) nullable | — | % adicional de contribución SS para tareas diferenciales |

**Enum `tipo`:**
`sueldo`, `anticipo`, `sac`, `vacaciones`, `liquidacion_final`, `comisiones`, `desempleo`, `varios`, `sueldo_sac`, `sueldo_vacaciones`, `sueldo_liq_final`, `sueldo_varios`, `sueldo_anticipo`, `sac_vacaciones`, `sac_liq_final`, `sac_anticipo`, `sac_varios`

**Enum `situacionRevista`:**
`activo`, `licencia_enfermedad`, `licencia_maternidad`, `licencia_sin_goce`, `suspendido_con_goce`, `suspendido_sin_goce`, `vacaciones`, `accidente_trabajo`, `otro`

### 1.2 — Nuevos campos en `payrollEmployee`

| Campo | Tipo | Descripción |
|---|---|---|
| `tipoEmpleador` | enum | `dec814_inc_a`, `dec814_inc_b`, `dec814_inc_c` — Requerido para LSD |
| `tarea` | varchar(100) nullable | Descripción del puesto. Para LSD debe ir sin tildes ni ñ |
| `horasMensualesNormales` | integer nullable | Para cálculo de horas extras s/sueldo |
| `diasMensualesNormales` | integer nullable | Para cálculo de proporcional de días. Default 30 |
| `porcentajeAporteAdicionalSS` | numeric(5,4) nullable | % adicional de Aporte de Seguridad Social |
| `valorHora` | numeric(12,2) nullable | Para empleados liquidados por hora (alternativa al básico del convenio) |
| `valorSueldo` | numeric(12,2) nullable | Override del básico del convenio para este empleado específico |

### 1.3 — Nuevo tipo en `payrollConcepto.tipo`

Agregar `retencion` al enum existente (`remunerativo`, `no_remunerativo`, `descuento`).

Las retenciones corresponden al rango 200-299 de SOS: SIPA, PAMI, Obra Social, Sindicato, etc. Se comportan igual que los descuentos en el neto pero se informan separado en el LSD.

---

## Prioridad 2 — Fórmulas de conceptos

### Cómo funciona el formuleo en SOS (relevado del DOM)

SOS usa un sistema de fórmulas **basado en columnas visuales**, no en texto libre. Cada concepto tiene una fila con estas columnas editables:

**Columnas de BASE (el usuario rellena solo UNA de estas):**

| Variable SOS | Descripción |
|---|---|
| `valHora` | Valor hora del legajo |
| `sueldoLegajo` | Sueldo del legajo (valor configurado, sin modificaciones del período) |
| `sueldo` | Sueldo calculado del recibo (resultado del concepto 1) |
| `sub1_9` | Sumatoria remunerativos 1–9 (básico + adicionales básicos) |
| `sub1_19` | Sumatoria remunerativos 1–19 |
| `sub1_26` | Sumatoria remunerativos 1–26 |
| `sub1_39` | Sumatoria remunerativos 1–39 |
| `sub1_199` | Sumatoria 1–199 menos descuentos = **total remunerativo neto**. Base de SIPA/PAMI/Sindicato |
| `sub411_469` | Sumatoria no remunerativos 411–469. Base para retenciones sobre no-rem |

**Columnas de OPERACIÓN:**

| Campo | Descripción |
|---|---|
| `divCantidad` | Divisor (ej: 30 para sueldo diario, 25 para feriados). Default 1 |
| `divHsNorm` | Divisor por horas normales del mes. Default 1 |
| `subCalc` | = `base ÷ divCantidad ÷ divHsNorm` (calculado automáticamente) |
| `cantidad` | Multiplicador: días trabajados, años de antigüedad, horas, etc. |
| `pct` | Porcentaje |
| `impConcepto` | Nro. de otro concepto para usar su resultado como base (alternativa a las columnas base) |
| `importe` | Valor fijo en pesos (alternativa a las columnas base) |
| `impMin` | Piso del resultado |
| `impMax` | Techo del resultado |

**Fórmula general:**
```
subCalc = base ÷ divCantidad ÷ divHsNorm
resultado = subCalc × cantidad × (pct / 100)
resultado = clamp(resultado, impMin, impMax)
```

**Hay además un checkbox activo/inactivo por concepto**, que permite al contador habilitar o deshabilitar conceptos específicos para cada recibo. El sistema muestra todos los conceptos del convenio pero solo calculan los marcados como activos.

**Ejemplos reales (empresa E-presis S.A., período 2026-02):**

| N | Nombre | Fórmula |
|---|---|---|
| 1 | Sueldo Básico | `sueldoLegajo ÷ 30 × diasTrabajados × pct%` → HAB |
| 3 | Antigüedad % | `sueldo × años × 1%` → HAB |
| 19 | Presentismo (s/conc.1a9) | `sub1_9 × 8.33%` → HAB |
| 201 | Jubilación SIPA | `sub1_199 × 11%` → RET |
| 202 | PAMI Ley 19032 | `sub1_199 × 3%` → RET |
| 203 | Obra Social | `sub1_199 × 3%` (o Rem4y8 si jornada parcial) → RET |
| 206 | Sindicato | `sub1_199 × 2%` → RET |
| 411 | No Rem. c/OS | `fijo × pct%` → NR |

---

### 2.1 — Ampliar el contexto de fórmulas (`PayrollFormulaContext`)

El contexto actual tiene: `basico`, `antiguedad`, `bruto`, `totalRemunerativo`, `totalNoRemunerativo`, `totalDescuentos`, `neto`, `horasExtra`, `presentismo`, `comisiones`, `bonos`, `valor`, `cantidad`.

**Agregar las variables que usa SOS:**

| Variable | Mapeo con SOS | Descripción |
|---|---|---|
| `valorHora` | `valHora` | Valor hora del legajo |
| `sueldoLegajo` | `sueldoLegajo` | Sueldo configurado en el legajo (antes de proporcional) |
| `diasMensualesNormales` | `divCantidad` del concepto 1 | Default 30 |
| `diasTrabajados` | `cantidad` del concepto 1 | Días efectivamente trabajados |
| `horasMensualesNormales` | `divHsNorm` | Para horas extras s/sueldo |
| `sub1_9` | `sub1_9` | Acumulador remunerativos 1–9 (se actualiza durante el loop) |
| `sub1_19` | `sub1_19` | Acumulador remunerativos 1–19 |
| `sub1_26` | `sub1_26` | Acumulador remunerativos 1–26 |
| `sub1_39` | `sub1_39` | Acumulador remunerativos 1–39 |
| `sub1_199` | `sub1_199` | Total remunerativo neto (base de retenciones) |
| `sub411_469` | `sub411_469` | Total no remunerativos 411–469 |
| `totalRetenciones` | suma de RET | Para calcular el neto final |

Los acumuladores `sub1_9`, `sub1_19`, etc. se recalculan después de cada concepto. El motor de cálculo necesita conocer el **número del concepto** para saber en qué acumuladores sumarlo.

### 2.2 — Actualizar la plantilla base de conceptos

La plantilla actual tiene 10 conceptos básicos con fórmulas genéricas. Completarla siguiendo la estructura de SOS:

**Remunerativos (1–99):**

| N SOS | Código ARCA | Nombre | Fórmula |
|---|---|---|---|
| 1 | 110000 | Sueldo Básico | `sueldoLegajo / diasMensualesNormales * diasTrabajados` |
| 2 | 110000 | Horas Normales | `valorHora * cantidad` |
| 3 | 160001 | Antigüedad % | `sueldo * antiguedad * pct / 100` |
| 4 | 160001 | Antigüedad Importe | `importe * cantidad` |
| 5 | 170000 | Premio | `sueldo * pct / 100` |
| 6 | 110005 | Licencias | `importe` |
| 9 | 170000 | Asig. Comp. s/sueldo | `sueldo * pct / 100` |
| 10 | 110007 | Feriados | `sueldoLegajo / 25 * cantidad` |
| 17 | 110003 | Horas extras 50% s/hora | `valorHora * 1.5 * cantidad` |
| 18 | 110003 | Horas extras 100% s/hora | `valorHora * 2 * cantidad` |
| 19 | 170000 | Asig. Comp. s/conc.1a9 | `sub1_9 * pct / 100` |
| 21 | 110003 | Horas extras 50% s/sueldo | `sueldo / horasMensualesNormales * 1.5 * cantidad` |
| 22 | 110003 | Horas extras 100% s/sueldo | `sueldo / horasMensualesNormales * 2 * cantidad` |
| 42 | 130000 | SAC Proporcional | `sub1_199 / 12` |

**Descuentos (100–199):**

| N SOS | Código ARCA | Nombre | Fórmula |
|---|---|---|---|
| 101 | 110000 | Descuento por ausencia | `sueldoLegajo / diasMensualesNormales * cantidad` |
| 105 | 110000 | Otros descuentos s/sueldo | `sueldo * pct / 100` |
| 111 | 160000 | Otros descuentos s/adicionales | `sub1_9 * pct / 100` |

**Retenciones (200–299):**

| N SOS | Código ARCA | Nombre | Fórmula |
|---|---|---|---|
| 201 | 810000 | Jubilación SIPA | `sub1_199 * 0.11` |
| 202 | 810001 | Ley 19032 PAMI | `sub1_199 * 0.03` |
| 203 | 810002 | Obra Social | `sub1_199 * 0.03` (o Rem4y8 si jornada parcial) |
| 204 | 810003 | ANSSAL | `sub1_199 * 0.005` |
| 206 | 810004 | Sindicato | `sub1_199 * pct / 100` |
| 209 | 821000 | Otras retenciones % | `sub1_199 * pct / 100` |
| 211 | 821000 | Otras retenciones fijas | `importe` |

**No Remunerativos (400–499):**

| N SOS | Código ARCA | Nombre | Bases | Rem. LSD |
|---|---|---|---|---|
| 411 | 540000 | No Rem. c/Ap y Cont. OS | `fijo * pct / 100` | Rem 4 y 8 |
| 412 | 541000 | No Rem. c/Ap y Cont. OS (var 2) | `fijo * pct / 100` | Rem 4 y 8 |
| 415 | 551000 | No Rem. sin Retenciones | `fijo` | — |
| 420 | 560000 | No Rem. c/Ret OS y ART | `fijo` | Rem 4, 8 y 9 |

**Retenciones s/No Remunerativos (500–599):**

| N SOS | Código ARCA | Nombre | Fórmula |
|---|---|---|---|
| 501 | 810002 | Ret OS s/No Rem | `sub411_469 * 0.03` |
| 502 | 810003 | Ret ANSSAL s/No Rem | `sub411_469 * 0.005` |

### 2.3 — Convención de numeración y estructura de `payrollConcepto`

Adoptar la convención de rangos de SOS:

| Rango | Tipo en nuestro sistema |
|---|---|
| 1 – 99 | `remunerativo` |
| 100 – 199 | `descuento` |
| 200 – 299 | `retencion` (nuevo tipo a agregar) |
| 400 – 499 | `no_remunerativo` |
| 500 – 599 | `retencion` (sobre no-rem) |

### 2.4 — Agregar campos de concepto para el sistema de fórmulas columnado

La tabla `payrollConcepto` actualmente usa `formula` (texto libre) y `baseCalculo` (enum). Para soportar el modelo de SOS correctamente, agregar:

| Campo nuevo | Tipo | Descripción |
|---|---|---|
| `baseColumna` | enum | `valHora`, `sueldoLegajo`, `sueldo`, `sub1_9`, `sub1_19`, `sub1_26`, `sub1_39`, `sub1_199`, `sub411_469`, `importe_fijo`, `ref_concepto` |
| `divCantidad` | numeric(8,4) | Divisor de cantidad (default 1) |
| `divHsNorm` | boolean | Si divide por horas normales del mes |
| `impMin` | numeric(12,2) | Importe mínimo (piso) |
| `impMax` | numeric(12,2) | Importe máximo (techo) |
| `refConceptoId` | FK nullable | Referencia a otro concepto para usar su resultado como base |
| `codigoArca` | varchar(10) | Código ARCA de 6 dígitos (ej: `810000`) |

### 2.5 — Agregar campos al detalle del recibo (`payrollLiquidacionDetalle`)

Actualmente solo guarda `conceptoId` y `monto`. Agregar:

| Campo nuevo | Tipo | Descripción |
|---|---|---|
| `activoEnRecibo` | boolean | Si el concepto estaba activo en este recibo (checkbox) |
| `memo` | varchar(200) nullable | Texto personalizado del concepto en este recibo |
| `cantidadUsada` | numeric(10,4) | Cantidad efectivamente usada en el cálculo |
| `pctUsado` | numeric(8,4) | Porcentaje efectivamente usado |
| `baseUsada` | numeric(14,2) | Valor de la base que se usó (para auditoría) |

---

## Prioridad 3 — Generación de archivos LSD

### 3.1 — Generar TXT de Conceptos (`conceptosLSD.txt`)

Server action: `generarConceptosLSDTxt(clientId, profileId)`

- Leer todos los conceptos activos del cliente desde `payrollConcepto`
- Leer el mapeo a conceptos ARCA desde `lsdPerfilConcepto`
- Generar el TXT en el formato requerido por ARCA
- Retornar como descarga

Este archivo se sube **una sola vez** (o cuando hay conceptos nuevos) al LSD de ARCA.

### 3.2 — Generar TXT de Liquidación (`liquidacionLSD.txt`)

Server action: `generarLiquidacionLSDTxt(clientId, profileId, periodo, quincena?)`

- Leer las liquidaciones confirmadas del período desde `payrollLiquidacion` + `payrollLiquidacionDetalle`
- Leer los datos del empleado: CUIL, legajo, `tipoEmpleador`, `tarea`, `situacionRevista`, `formaDePago`
- Leer los valores de Rem 4 y 8 (override o calculado), Rem 9
- Calcular las remuneraciones 1, 4, 5, 8, 9 según los conceptos y sus flags en `lsdPerfilConcepto`
- Generar el TXT en formato ARCA (encoding ANSI, sin tildes en campo Tarea)
- Retornar como descarga

**Validaciones previas a la generación:**
- Que todos los recibos tengan `formaDePago` asignada
- Que todos los empleados tengan `tipoEmpleador` configurado
- Que todos los CUILs estén presentes
- Que las bases imponibles no sean negativas

### 3.3 — Agregar botones en la UI

En `SueldosRecibo.tsx` o en una nueva pestaña "Exportación LSD":
- Botón **"Conceptos LSD"** → descarga `conceptosLSD.txt`
- Botón **"Liquidación LSD"** → descarga `liquidacionLSD.txt` del período seleccionado

---

## Prioridad 4 — Funcionalidades operativas

### 4.1 — Formulario de empleado con campos nuevos

Actualizar `EmpleadoFormDialog.tsx` para incluir:
- `tipoEmpleador` (select requerido para LSD)
- `tarea` (input texto, advertencia de no usar tildes)
- `horasMensualesNormales` (número)
- `diasMensualesNormales` (número, default 30)
- `porcentajeAporteAdicionalSS` (porcentaje)
- `valorHora` / `valorSueldo` (override del básico del convenio)

### 4.2 — Formulario de recibo con campos nuevos

Actualizar el formulario de creación/edición de liquidación para incluir:
- `tipo` de recibo (select con todos los tipos)
- `situacionRevista` (select)
- `formaDePago` (select, requerido para LSD)
- `quincena` (radio: mes completo / 1ra / 2da)
- `rem4y8Override` (campo numérico opcional)
- `rem9Override` (campo numérico opcional)
- `contribucionTareaDiferencial` (porcentaje opcional)

### 4.3 — Copia masiva de recibos entre períodos

Server action: `copiarRecibosEntrePeriodos(clientId, periodoOrigen, periodoDestino, quincena?)`

- Tomar todas las liquidaciones del período origen
- Crear copias en el período destino con los mismos conceptos y valores
- No copiar si ya existen liquidaciones en el destino para ese empleado/período
- Botón en `SueldosDashboard.tsx`

### 4.4 — Tipo de retención en `SueldosConceptos.tsx`

Actualizar la UI de conceptos para mostrar y permitir crear conceptos de tipo `retencion`, diferenciándolos visualmente de los descuentos.

---

## Prioridad 5 — Mejoras de UX del simulador

### 5.1 — Mostrar retenciones separadas en el simulador

Actualmente `SueldosSimulador.tsx` muestra columnas: `remunerativo`, `no_remunerativo`, `descuentos`.

Agregar columna `retenciones` separada (conceptos tipo `retencion`).

El resumen de totales debe mostrar:
- Total Haberes (remunerativos + no remunerativos)
- Total Descuentos
- Total Retenciones
- **Neto a cobrar** = Total Haberes - Descuentos - Retenciones

### 5.2 — Novedades: precargar `diasTrabajados`

Permitir cargar como novedad la cantidad de días trabajados del período, que luego el motor usa en la fórmula del Sueldo Básico proporcional.

---

## Prioridad 6 — Exportaciones adicionales (futuro)

| Funcionalidad | Descripción |
|---|---|
| F931 / SICOSS | TXT para la declaración jurada mensual |
| Libro de Sueldos PDF | Generación del libro ley imprimible |
| XLS con conceptos | Excel con detalle de todos los recibos del período |
| Acreditación bancaria | Archivo de acreditación por banco |

---

## Prioridad 7 — Formulario "Crear Nuevo Recibo": estructura real de SOS

Relevamiento del formulario real de alta de recibo en SOS Contador (sueldos_reciboam.asp?accion=alta). Toda esta información debe reflejarse en nuestro formulario de creación de liquidación.

### 7.1 — Estructura del formulario

El formulario se divide en dos secciones: selector de legajo, y "datos del recibo".

#### Sección: Legajo

| Campo | Tipo | Detalle |
|---|---|---|
| **Legajo** | select | Lista todos los empleados activos Y dados de baja (egresados). Los egresados aparecen con `(egreso: DD/MM/YYYY)` al inicio. También tiene opción "Crear nuevo Legajo" inline. |

**Importante:** Se muestran empleados con baja porque puede necesitarse crear una Liquidación Final u otro recibo post-egreso.

#### Sección: Datos del recibo

| Campo | Tipo | Opciones / Detalle |
|---|---|---|
| **Período (mes liquidado)** | 3 selects | Año (2010-2027) + Mes (01-12) + Quincena (`Mes completo`, `Primera quincena`, `Segunda quincena`) |
| **Tipo** | select | `Sueldo`, `Anticipo`, `SAC`, `Vacaciones`, `Liquidación Final`, `Comisiones`, `Fondo de Desempleo`, `Varios` |
| **Fecha de Liquidación** | date | Fecha en que se confecciona el recibo |
| **Obra Social** | select | Lista completa del SSS de ARCA (~400 opciones). Formato: `CÓDIGO NombreOS`. Default: `000000 Sin Obra Social`. |
| **Fecha de Pago** | date | Cuándo se paga al empleado |
| **Lugar de Pago** | text | Ciudad. Default: `CABA` |
| **Forma de Pago** | select | `Efectivo` (1), `Cheque` (2), `Acreditación en cuenta` (3) |
| **CBU** | text | Obligatorio solo si Forma de Pago = Acreditación |
| **Banco** | select | Lista de bancos de Argentina (~50 opciones, incluye MercadoPago) |
| **Período Cargas depositado** | select | YYYY/MM — el período al que corresponden las cargas sociales depositadas |
| **Fecha de Depósito Cargas** | date | Cuándo se depositan las cargas sociales |
| **Observación interna** | textarea | Nota visible solo para el contador, no aparece en el recibo impreso |
| **Obs. a imprimir en recibo** | textarea | Texto libre que aparece en el pie del recibo impreso |
| **Copiar conceptos otro recibo** | select | `Copiar último recibo de este legajo y tipo` (default) / `No copiar` |

### 7.2 — Campos nuevos detectados que faltan en nuestro modelo

Estos campos existen en SOS pero no están en `payrollLiquidacion` ni en `payrollEmployee`:

| Campo | Tabla sugerida | Tipo | Descripción |
|---|---|---|---|
| `obraSocialId` | `payrollLiquidacion` | FK / string | La OS puede cambiar por período. SOS la guarda por recibo, no solo por legajo. Usar el código ARCA (ej. `000000`). |
| `cbu` | `payrollEmployee` | varchar(22) nullable | CBU del empleado para acreditación bancaria |
| `banco` | `payrollEmployee` | varchar(50) nullable | Banco del empleado |
| `lugarDePago` | `payrollLiquidacion` | varchar(100) nullable | Ciudad de pago. Default del empleador. |
| `fechaDeLiquidacion` | `payrollLiquidacion` | date | Fecha de confección del recibo (distinta del período) |
| `fechaDePago` | `payrollLiquidacion` | date | Fecha de pago al empleado |
| `periodoCargas` | `payrollLiquidacion` | varchar(7) nullable | Período YYYY/MM de depósito de cargas |
| `fechaDepositoCargas` | `payrollLiquidacion` | date nullable | Fecha de depósito de cargas sociales |
| `observacionInterna` | `payrollLiquidacion` | text nullable | Nota interna del contador |
| `observacionRecibo` | `payrollLiquidacion` | text nullable | Texto que aparece impreso en el recibo |

### 7.3 — Comportamiento "Copiar conceptos otro recibo"

SOS ofrece al crear un nuevo recibo la opción de copiar automáticamente los conceptos del último recibo del mismo legajo y tipo. Esto evita tener que cargar los conceptos desde cero cada mes.

En nuestro sistema esto ya está parcialmente cubierto por `calcularLiquidacionMasiva`, pero para recibos creados manualmente deberíamos ofrecer la misma opción de prefill.

### 7.4 — Obra Social por recibo

La Obra Social en SOS **se guarda por recibo**, no solo por legajo. Esto es importante porque:
- El empleado puede cambiar de OS entre períodos
- Algunos conceptos de retención dependen de la OS del período
- El LSD valida la consistencia de aportes OS contra la OS informada en el recibo

La lista completa proviene del Superintendencia de Servicios de Salud (SSS) y tiene ~400 entradas con código numérico de 6 dígitos + nombre.

En nuestro proyecto deberíamos tener una tabla `obrasSociales` o usar directamente el código + nombre como string, y exponer el selector en el formulario de recibo.

### 7.5 — Lista de bancos

SOS tiene un listado fijo de bancos argentinos para el campo `banco`. Los más relevantes:

`BBVA Frances`, `GALICIA Y BS AS`, `NACION ARGENTINA`, `PROVINCIA DE BUENOS AIRES`, `SANTANDER RIO`, `CREDICOOP COOP`, `MACRO SA`, `SUPERVIELLE SA`, `CIUDAD DE BS AS`, `ICBC`, `PATAGONIA SA`, `ITAU ARGENTINA`, `MERCADOPAGO`, `HIPOTECARIO`, entre otros.

---

## Estado de implementación

### ✅ Ya implementado (previo a este plan)

**Schema:**
- `payrollConcepto`: id, clientId, codigo, nombre, tipo (3 valores), baseCalculo, formula, esPorcentaje, orden, activo, vigenciaDesde, vigenciaHasta
- `payrollEmployee`: id, clientId, nombre, apellido, cuilCuil, fechaIngreso, convenioId, categoriaId, tipoJornada, activo, legajo, importEmpleadoId
- `payrollLiquidacion`: id, empleadoId, periodo, basico, totalRemunerativo, totalNoRemunerativo, totalDescuentos, neto, tipoRecibo, quincena, fechaLiquidacion, obraSocialId, fechaPago, lugarPago, formaPago, cbu, banco, periodoCargas, fechaDepositoCargas, observacionInterna, observacionRecibo, reciboConfirmado, calculadoAt
- `payrollLiquidacionDetalle`: id, liquidacionId, conceptoId, monto, cantidad
- `payrollNovedad`, `payrollEmpleadoConcepto`, `payrollConvenio`, `payrollConvenioCategoria`, `payrollEscala` — completos

**Motor de fórmulas (`payroll-formula.ts`):**
Variables disponibles: basico, antiguedad, bruto, totalRemunerativo, totalNoRemunerativo, totalDescuentos, neto, horasExtra, presentismo, comisiones, bonos, cantidad, valor

**Actions (`src/actions/sueldos.ts`, ~2100 líneas):**
- CRUD completo: convenios, categorías, escalas, conceptos, empleados, novedades
- calcularLiquidacion, calcularLiquidacionMasiva
- confirmarReciboLiquidacion, listObrasSociales, createReciboHeader
- Integración AFIP para convenios (agregarConvenioDesdeAfipEmpleadores)

**Componentes UI:**
- EmpleadoFormDialog, SueldosConvenios, SueldosNovedades
- SueldosRecibo (visualización de recibos confirmados)
- Simulador de liquidación con totales básicos

---

### 🔨 Implementado en este paso (Paso 1 — Schema)

**Nuevos enums agregados:**
- `payrollBaseColumnaEnum`: valHora, sueldoLegajo, sueldo, sub1_9, sub1_19, sub1_26, sub1_39, sub1_199, sub411_469, importe_fijo, ref_concepto
- `payrollTipoEmpleadorEnum`: dec814_inc_a, dec814_inc_b, dec814_inc_c
- `payrollSituacionRevistaEnum`: activo, licencia_enfermedad, licencia_maternidad, licencia_sin_goce, suspendido_con_goce, suspendido_sin_goce, vacaciones, accidente_trabajo, baja_despido, baja_fallecimiento, baja_otras, ilt_primeros_10, ilt_once_o_mas, reserva_puesto, excedencia, otro

**`payrollConceptoTipoEnum`:** agregado valor `retencion`

**Nuevos campos en `payrollConcepto`:**
- numeroSos (integer) — número SOS 1-620
- codigoArca (text) — código ARCA 6 dígitos para LSD
- baseColumna (payrollBaseColumnaEnum) — columna base al estilo SOS
- divCantidad (numeric 8,4) — divisor de cantidad, default 1
- divHsNorm (boolean) — si divide por horas mensuales normales
- impMin / impMax (numeric 12,2) — piso y techo del resultado
- refConceptoId (uuid) — referencia a otro concepto como base

**Nuevos campos en `payrollEmployee`:**
- tipoEmpleador (payrollTipoEmpleadorEnum) — requerido para LSD
- tarea (text) — descripción del puesto, sin tildes para LSD
- horasMensualesNormales (integer)
- diasMensualesNormales (integer, default 30)
- porcentajeAporteAdicionalSS (numeric 5,4)
- valorHora (numeric 12,2) — override del básico por hora
- valorSueldo (numeric 12,2) — override del básico del convenio

**Nuevos campos en `payrollLiquidacion`:**
- situacionRevista (payrollSituacionRevistaEnum)
- rem4y8Override (numeric 14,2) — override base OS para LSD
- rem9Override (numeric 14,2) — override base ART para LSD
- contribucionTareaDiferencial (numeric 5,4)
- importeADetraerLey27430 (numeric 12,2) — Ley 27430
- contribucionAdicionalOS (numeric 12,2) — mínimo contribución OS

**Nuevos campos en `payrollLiquidacionDetalle`:**
- activoEnRecibo (boolean, default true)
- memo (text) — texto personalizado del concepto por recibo
- pctUsado (numeric 8,4) — porcentaje usado (auditoría)
- baseUsada (numeric 14,2) — base usada (auditoría)

**Ejecutar:** `bun run db:push`

---

## Orden de implementación — Pasos pendientes

```
✅ Paso 1 — Schema (HECHO)
   → bun run db:push pendiente

Paso 2 — Motor de fórmulas (payroll-formula.ts)
   - Agregar variables: valorHora, sueldoLegajo, diasTrabajados,
     diasMensualesNormales, horasMensualesNormales
   - Agregar acumuladores de rango: sub1_9, sub1_19, sub1_26,
     sub1_39, sub1_199, sub411_469, totalRetenciones
   - El motor debe: conocer el numeroSos de cada concepto para
     saber a qué acumuladores sumar su resultado tras calcularlo

Paso 3 — Formulario de empleado (EmpleadoFormDialog.tsx)
   - Agregar campos: tipoEmpleador, tarea, horasMensualesNormales,
     diasMensualesNormales, porcentajeAporteAdicionalSS,
     valorHora, valorSueldo
   - Actualizar action updateEmpleado con los campos nuevos

Paso 4 — Formulario de recibo
   - Agregar campos: situacionRevista (con selector de 3 slots),
     rem4y8Override, rem9Override, contribucionTareaDiferencial,
     importeADetraerLey27430, contribucionAdicionalOS
   - Actualizar createReciboHeader / updateLiquidacion

Paso 5 — Generación TXT LSD
   5a. generarConceptosLSDTxt(clientId) → conceptosLSD.txt
   5b. generarLiquidacionLSDTxt(clientId, periodo, quincena?)
       → liquidacionLSD.txt (encoding ANSI, validaciones previas)
   5c. Botones en SueldosRecibo.tsx

Paso 6 — Tipo retención en UI de conceptos
   - Mostrar y permitir crear conceptos tipo "retencion"
   - Diferenciarlo visualmente de "descuento"

Paso 7 — Mejoras del simulador
   - Columna "Retenciones" separada de Descuentos
   - Total Retenciones en el resumen
   - Neto = Haberes - Descuentos - Retenciones
   - Novedad diasTrabajados para proporcional del básico

Paso 8 — Copia entre períodos
   - Server action copiarRecibosEntrePeriodos
   - Prefill al crear recibo manual (último recibo del mismo legajo/tipo)

Paso 9 — Exportaciones adicionales (futuro)
   - F931 / SICOSS TXT
   - Libro de Sueldos PDF
   - Excel con detalle de recibos del período
   - Archivo de acreditación bancaria
```

---

## Notas técnicas

- **Encoding del TXT LSD**: Generar en ANSI con `iconv-lite`. Sanitizar campo `tarea` quitando tildes y ñ antes de escribirlo.
- **Validación de bases imponibles**: Al generar el TXT, calcular `rem4y8 - totalRemunerativo` (base diferencial). Si es negativo, alertar antes de descargar.
- **Vigencia de escalas**: El cálculo del básico usa `getBasicoVigente(categoriaId, periodo)`. Los campos `valorHora` y `valorSueldo` del empleado deben tener prioridad sobre el básico del convenio cuando están seteados.
- **Período + quincena**: El unique index de `payrollLiquidacion` debe incluir `quincena` y `tipoRecibo` para permitir múltiples recibos del mismo empleado en el mismo mes.
- **Acumuladores de rango**: Se recalculan después de cada concepto durante el loop de cálculo. El motor necesita el `numeroSos` del concepto para saber en qué acumuladores sumar (ej. si numeroSos es 1-9, suma a sub1_9 en adelante).
- **Mapeo situaciónRevista → código SOS**: Ver Apéndice B para la tabla de códigos numéricos SOS que van en el TXT LSD.

---

## Apéndice A — Catálogo completo de conceptos SOS (Mr Factory Couch, 2026-02)

Total: 231 conceptos. Formato: `N° | Código ARCA | Nombre | Tipo`
Tipos: HAB=Remunerativo, DESC=Descuento, RET=Retención, NR=No Remunerativo

### Remunerativos (HAB) — Rango 1–99

| N° | Código ARCA | Nombre |
|---|---|---|
| 1 | 110000 | Sueldo Basico |
| 3 | 160001 | Antiguedad (%) |
| 4 | 160001 | Antiguedad (Importe) |
| 5 | 170000 | Premio |
| 6 | 110005 | Licencias |
| 7 | 161000 | Otros Haberes Remunerativos |
| 8 | 161000 | Otros Haberes Remunerativos |
| 9 | 170000 | Asignacion Complementaria (s/sueldo) |
| 10 | 110007 | Feriados |
| 11 | 110000 | Otros Haberes Remunerativos |
| 12 | 110000 | Otros Haberes Remunerativos |
| 13 | 110000 | Otros Haberes Remunerativos |
| 14 | 110000 | Otros Haberes Remunerativos |
| 15 | 110000 | Otros Haberes Remunerativos |
| 16 | 140000 | Plus por Zona Desfavorable |
| 17 | 130001 | Horas extras 50% (s/valor hora) |
| 18 | 130002 | Horas extras 100% (s/valor hora) |
| 19 | 170000 | Asignacion Complementaria (s/conc. 1 a 9) |
| 20 | 170000 | Asignacion Complementaria (s/conc. 1 a 9) |
| 21 | 130001 | Horas extras 50% (s/sueldo) |
| 22 | 130002 | Horas extras 100% (s/sueldo) |
| 23 | 130001 | Horas extras 50% (s/conc. 1 a 9) |
| 24 | 130002 | Horas extras 100% (s/conc. 1 a 9) |
| 25 | 130001 | Horas extras 50% (s/conc. 1 a 19) |
| 26 | 130002 | Horas extras 100% (s/conc. 1 a 19) |
| 27 | 110000 | Otros Haberes Remunerativos |
| 28 | 110000 | Otros Haberes Remunerativos |
| 29 | 170000 | Asignacion Complementaria (s/conc. 1 a 19) |
| 30 | 170000 | Asignacion Complementaria (s/conc. 1 a 26) |
| 31 | 110000 | Ajustes de Haberes Remunerativos |
| 32 | 110000 | Otros Haberes Remunerativos |
| 33 | 110000 | Otros Haberes Remunerativos |
| 34 | 110000 | Otros Haberes Remunerativos |
| 35 | 110000 | Otros Haberes Remunerativos |
| 36 | 110000 | Otros Haberes Remunerativos |
| 37 | 110000 | Otros Haberes Remunerativos |
| 38 | 110011 | Incremento Solidario Dec.14/2020 |
| 39 | 110011 | Incr.Salarial Dto 14/2020 Rectif |
| 40 | 170000 | Premio |
| 41 | 120000 | Sueldo Anual Complementario |
| 42 | 120003 | Sueldo Anual Complementario Proporcional |
| 43 | 170000 | Asignacion Complementaria (s/conc. 1 a 39) |
| 51 | 151000 | Vacaciones Gozadas |
| 61 | 170003 | Comisiones |
| 62 | 170003 | Comisiones |
| 63 | 170005 | Viaticos |
| 64 | 110000 | Otros Haberes Remunerativos |
| 65 | 110000 | Otros Haberes Remunerativos |
| 71 | 110000 | Anticipo de Haberes |
| 72 | 110007 | Feriados |
| 81 | 110008 | Prest. Dineraria Ley 24577 (primeros 10d) |
| 82 | 110009 | Prest. Dineraria Ley 24577 (a cargo de la ART) |
| 90 | 180000 | Rectificativa por remuneración Ley 27.742 |

### Descuentos (DESC) — Rango 100–199

| N° | Código ARCA | Nombre |
|---|---|---|
| 101 | 110000 | Dias Enfermedad |
| 102 | 110008 | Dias Accidente |
| 103 | 110000 | Dias Faltas Injustificadas |
| 104 | 110007 | Dias Feriados |
| 105 | 110000 | Otros Descuentos de Haberes sobre sueldo |
| 106 | 110000 | Otros Descuentos de Haberes sobre sueldo |
| 107 | 110000 | Otros Descuentos de Haberes sobre sueldo |
| 108 | 110000 | Otros Descuentos de Haberes sobre sueldo |
| 109 | 110000 | Otros Descuentos de Haberes sobre sueldo |
| 110 | 110000 | Otros Descuentos de Haberes sobre sueldo |
| 111 | 160000 | Otros Descuentos de haberes sobre adicionales |
| 112 | 160000 | Otros Descuentos de haberes sobre adicionales |
| 113 | 160000 | Otros Descuentos de haberes sobre adicionales |
| 114 | 160000 | Otros Descuentos de haberes sobre adicionales |
| 115 | 160000 | Otros Descuentos de haberes sobre adicionales |
| 116 | 160000 | Otros Descuentos de haberes sobre adicionales |
| 117 | 160000 | Otros Descuentos de haberes sobre adicionales |
| 118 | 160000 | Otros Descuentos de haberes sobre adicionales |
| 119 | 160000 | Otros Descuentos de haberes sobre adicionales |
| 120 | 160000 | Otros Descuentos de haberes sobre adicionales |
| 121 | 170000 | Otros Descuentos de haberes sobre premios |
| 122 | 170000 | Otros Descuentos de haberes sobre premios |
| 123 | 170000 | Otros Descuentos de haberes sobre premios |
| 124 | 170000 | Otros Descuentos de haberes sobre premios |
| 125 | 170000 | Otros Descuentos de haberes sobre premios |
| 126 | 170000 | Otros Descuentos de haberes sobre premios |
| 127 | 170000 | Otros Descuentos de haberes sobre premios |
| 128 | 170000 | Otros Descuentos de haberes sobre premios |
| 129 | 170000 | Otros Descuentos de haberes sobre premios |
| 130 | 170000 | Otros Descuentos de haberes sobre premios |

### Retenciones (RET) — Rango 200–299 y 500–562

| N° | Código ARCA | Nombre |
|---|---|---|
| 201 | 810000 | Jubilacion |
| 202 | 810001 | Ley 19032 |
| 203 | 810002 | Obra Social |
| 204 | 810009 | Obra Social Adherente |
| 205 | 810003 | Anssal |
| 206 | 810004 | Sindicato |
| 207 | 821000 | Federaciones y Otros |
| 208 | 810008 | Impuesto a las Ganancias |
| 209 | 821000 | Otros Conceptos de Retenciones |
| 210 | 821000 | Otros Conceptos de Retenciones |
| 211 | 821000 | Otros Conceptos de Retenciones |
| 212 | 821000 | Otros Conceptos de Retenciones |
| 213 | 821000 | Otros Conceptos de Retenciones |
| 214 | 821000 | Otros Conceptos de Retenciones |
| 215 | 821000 | Otros Conceptos de Retenciones |
| 216 | 821000 | Otros Conceptos de Retenciones |
| 217 | 821000 | Otros Conceptos de Retenciones |
| 218 | 821000 | Otros Conceptos de Retenciones |
| 219 | 821000 | Otros Conceptos de Retenciones |
| 220 | 821000 | Otros Conceptos de Retenciones |
| 221 | 810002 | Aporte Adicional OS |
| 222 | 810002 | Aporte Adicional OS |
| 223 | 810012 | Salario Complementario Dec 332/2020 |
| 226 | 821000 | Otros Conceptos de Retenciones |
| 227 | 821000 | Otros Conceptos de Retenciones |
| 228 | 821000 | Otros Conceptos de Retenciones |
| 229 | 821000 | Otros Conceptos de Retenciones |
| 230 | 821000 | Otros Conceptos de Retenciones |
| 231 | 820000 | Adelantos de sueldo |
| 232 | 810006 | RENATEA |
| 233 | 810005 | Seguro de Vida |
| 234 | 810014 | Pago a cuenta Asignacion Puente al Empleo |
| 501 | 810004 | Acuerdo Sindicato |
| 502 | 810002 | Acuerdos Obra Social |
| 503 | 821001 | Acuerdos Federaciones y Otros |
| 504 | 810006 | RENATEA s/ no Rem |
| 511 | 821000 | Otros conceptos de retenciones s/cptos.no remuner. |
| 512 | 821000 | Otros conceptos de retenciones s/cptos.no remuner. |
| 513 | 821000 | Otros conceptos de retenciones s/cptos.no remuner. |
| 514 | 821000 | Otros conceptos de retenciones s/cptos.no remuner. |
| 515 | 821000 | Otros conceptos de retenciones s/cptos.no remuner. |
| 516 | 821000 | Otros conceptos de retenciones s/cptos.no remuner. |
| 517 | 821000 | Otros conceptos de retenciones s/cptos.no remuner. |
| 520 | 821000 | Ajuste SIPA Dec 792/2020 |
| 551 | 810000 | Jubilacion s/Rem |
| 552 | 810001 | Ley 19032 s/Rem |
| 553 | 810002 | Obra Social s/Rem |
| 554 | 810009 | Obra Social Adherente s/Rem |
| 555 | 810003 | Anssal s/Rem |
| 556 | 810004 | Sindicato s/Rem |
| 557 | 821000 | Federaciones y Otros s/Rem |
| 558 | 821000 | Otros conceptos de retenciones s/cptos.no remuner. |
| 559 | 810006 | RENATEA s/Rem |
| 560 | 821000 | Otros conceptos de retenciones s/Rem |
| 561 | 821000 | Otros conceptos de retenciones s/Rem |
| 562 | 821000 | Otros conceptos de retenciones s/Rem |

### No Remunerativos (NR) — Rango 400–620

| N° | Código ARCA | Nombre |
|---|---|---|
| 401 | 520012 | Vacaciones no Gozadas |
| 402 | 520018 | S.A.C. s/ Vacaciones no Gozadas |
| 403 | 520015 | Preaviso |
| 404 | 520011 | Indemnizacion |
| 405 | 520010 | Gratificacion |
| 406 | 520014 | Indemnizacion por despido |
| 407 | 520016 | Integracion Mes Despido |
| 408 | 520017 | SAC s/ Integracion o Preaviso |
| 411 | 540000 | Otros Conceptos no Remunerativos c/Ap y Cont. OS |
| 412 | 541000 | Otros Conceptos no Remunerativos c/Ap y Cont. OS |
| 413 | 540000 | Otros Conceptos no Remunerativos c/Ap y Cont. OS |
| 414 | 541000 | Otros Conceptos no Remunerativos c/Ap y Cont. OS |
| 415 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 416 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 417 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 418 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 419 | 550000 | Suspension perc. parc art 223 bis LCT / Res.397/20 |
| 420 | 110000 | Suspension art 223 bis LCT / Res. 397/20 MTEySS |
| 421 | 110000 | Rem. habitual Dec 792/2020 |
| 422 | 551002 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 |
| 423 | 551002 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 |
| 424 | 551002 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 |
| 425 | 551002 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 |
| 426 | 551002 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 |
| 427 | 551002 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 |
| 428 | 551002 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 |
| 429 | 551002 | Otros Conceptos No Remun c/Ap Rem 1, 4, 5, 8 y 9 |
| 430 | 560001B | SAC No Remunerativo (Rem 4 y 8) |
| 431 | 560002B | SAC No Remunerativo Prop. (Rem 4 y 8) |
| 432 | 560003B | Vacaciones No Remunerativo (Rem 4 y 8) |
| 433 | 560001C | SAC No Remunerativo (Rem 1, 4, 5, 8, 9) |
| 434 | 560002C | SAC No Remunerativo Prop. (Rem 1, 4, 5, 8 y 9) |
| 435 | 560003C | Vacaciones No Remunerativo (Rem 1, 4, 5, 8 y 9) |
| 436 | 560001D | SAC No Remunerativo (Rem 4, 8 y 9) |
| 437 | 560002D | SAC No Remunerativo Prop. (Rem 4, 8 y 9) |
| 438 | 560003D | Vacaciones No Remunerativo (Rem 4, 8 y 9) |
| 439 | 540000 | Otros Conceptos no Remunerativos c/Ap y Cont. OS |
| 440 | 540000 | Otros Conceptos no Remunerativos c/Ap y Cont. OS |
| 451 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 452 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 453 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 454 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 455 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 456 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 457 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 458 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 460 | 550000 | Otros Conceptos no Rem. c/Ret OS y ART |
| 461 | 550000 | Otros Conceptos no Rem. c/Ret OS y ART |
| 462 | 550000 | Otros Conceptos no Rem. c/Ret OS y ART |
| 463 | 550000 | Otros Conceptos no Rem. c/Ret OS y ART |
| 464 | 550000 | Otros Conceptos no Rem. c/Ret OS y ART |
| 465 | 550000 | Otros Conceptos no Rem. c/Ret OS y ART |
| 466 | 550000 | Otros Conceptos no Rem. c/Ret OS y ART |
| 467 | 550000 | Otros Conceptos no Rem. c/Ret OS y ART |
| 468 | 550000 | Otros Conceptos no Rem. c/Ret OS y ART |
| 469 | 550000 | Otros Conceptos no Rem. c/Ret OS y ART |
| 470 | 551001 | Otros Conceptos no Rem. c/Ret ART |
| 471 | 551001 | Otros Conceptos no Rem. c/Ret ART |
| 472 | 551001 | Otros Conceptos no Rem. c/Ret ART |
| 473 | 551001 | Otros Conceptos no Rem. c/Ret ART |
| 474 | 551001 | Otros Conceptos no Rem. c/Ret ART |
| 475 | 551001 | Otros Conceptos no Rem. c/Ret ART |
| 476 | 551001 | Otros Conceptos no Rem. c/Ret ART |
| 477 | 551001 | Otros Conceptos no Rem. c/Ret ART |
| 478 | 551001 | Otros Conceptos no Rem. c/Ret ART |
| 479 | 551001 | Otros Conceptos no Rem. c/Ret ART |
| 480 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 481 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 482 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 483 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 484 | 551000 | Otros Conceptos no Rem. sin Retenciones |
| 491 | 560001A | SAC No Remunerativo s/ retenciones |
| 492 | 560002A | SAC No Remunerativo Prop. s/ retenciones |
| 493 | 560003A | Vacaciones No Remunerativo s/ retenciones |
| 494 | 560001E | SAC No Remunerativo (Rem 9) |
| 495 | 560002E | SAC No Remunerativo Prop. (Rem 9) |
| 496 | 560003E | Vacaciones No Remunerativo (Rem 9) |
| 601 | 560005A | Asign. no remunerativa Dec 841/2022 |
| 602 | 560005B | Asign. no remunerativa Dec 841/2022 (con ART) |
| 603 | 560004 | Asign. din. - Dec. 551/2022 (con ART) |
| 604 | 560006A | Asignacion no Remunerativa Dcto 438/2023 |
| 605 | 560006B | Asignacion no Remunerativa Dcto 438/2023 (con ART) |
| 610 | 520000 | Beneficios Sociales |
| 611 | 520001 | Servicio de Comedor |
| 612 | 520002 | Gastos Médicos |
| 613 | 520003 | Provisión de ropa de trabajo |
| 614 | 520004 | Guardería |
| 615 | 520005 | Provisión de útiles escolares |
| 616 | 520006 | Gastos de sepelio |
| 617 | 520007 | Cursos de capacitación |
| 618 | 520008 | Becas |
| 620 | 510002 | ASIGNACIÓN POR HIJO/HIJO CON DISCAPACIDAD |

---

## Apéndice B — Situaciones de Revista (opciones reales de SOS)

Valores del select `cbsituacion` en el formulario de recibo:

| Código SOS | Nombre |
|---|---|
| 1070 | Activo |
| 10205 | Activo - LSD (sin remuneración) |
| 1072 | Activo Decreto N° 796/97 |
| 10110 | Activo - Funciones en el exterior |
| 1076 | Baja por despido |
| 1077 | Baja por despido Decreto N° 796/97 |
| 1069 | Baja por fallecimiento |
| 1071 | Bajas otras causales |
| 1073 | Bajas otras causales Decreto N° 796/97 |
| 10114 | Conservación del empleo por accidente |
| 10120 | Dto 792/20 - May/60 años, embarazadas, riesgo |
| 3260 | Empleado Eventual en Empresa Usuaria |
| 10113 | Empleado eventual en EU (ESE, mes incompleto) |
| 10187 | Licencia Ley 27.674 Art. 13 (Régimen De Protección Integral) |
| 1084 | E.S.E. Cese transitorio de servicios (Art. 6°) |
| 1088 | ILT (Incapacidad Laboral Transitoria) días ONCE o más |
| 1087 | ILT (Incapacidad Laboral Transitoria) primeros DIEZ días |
| 1079 | Licencia por excedencia |
| 1080 | Licencia por maternidad Down |
| 1081 | Licencia por vacaciones |
| 1082 | Licencia sin goce de haberes |
| 1085 | Personal Siniestrado de terceros |
| 1086 | Reingreso por disposición judicial |
| 1083 | Reserva de puesto |
| 1089 | Trabajador siniestrado en nómina de A.R.T. |

> Nuestro enum actual (`activo`, `licencia_enfermedad`, etc.) debe mapearse a estos códigos al generar el TXT LSD.

---

## Apéndice C — Bancos (lista completa SOS)

47 opciones en el select `txbanco`:

`_otro banco`, `ARGENTINA CFSA`, `BANCO BICA S.A.`, `BANCO INDUSTRIA`, `BANCO MUNICIPAL DE ROSARIO`, `BANCO ROELA S.A.`, `BBVA Frances`, `BICE SA`, `BNP PARIBAS`, `CITIBANK N.A.`, `CIUDAD DE BS AS`, `CMF`, `COLUMBIA SA`, `COMAFI SA`, `CORRESPONSABILIDAD GREMIAL`, `CORRIENTES S.A.`, `CREDICOOP COOP`, `DE FORMOSA SA`, `DEL TUCUMAN S.A`, `DEUTSCHE S.A.`, `GALICIA MAS`, `GALICIA Y BS AS`, `HIPOTECARIO`, `ICBC`, `ITAU ARGENTINA`, `LA PAMPA S.E.M.`, `MACRO SA`, `MARIVA SA`, `MERCADOPAGO`, `NACION ARGENTINA`, `NVO BCO CHACO`, `NVO ENTRE RIOS`, `NVO SANTA FE SA`, `PATAGONIA SA`, `PIANO SA`, `PROV DE CORDOBA`, `PROV DEL CHUBUT`, `PROVINCIA DE BUENOS AIRES`, `PROVINCIA DEL NEUQUEN`, `PROVINCIA TIERRA FUEGO`, `SAN JUAN SA`, `SANTA CRUZ S.A.`, `SANTANDER RIO`, `SGO.ESTERO SA`, `STANDARD BANK`, `SUPERVIELLE SA`, `VALORES`

---

## Apéndice D — Obras Sociales (lista completa SSS, 564 entradas)

Formato: `CÓDIGO_SSS NOMBRE`. El campo interno de SOS es distinto del código SSS.

```
905008 - ADMINISTRACIÓN RECURSOS PARA SALUD S.A.
905503 - AGRUPACION SANATORIAL SUR S.A.
905107 - AMSTERDAM SALUD S.A.
905800 - ANDESALUD SOCIEDAD ANÓNIMA
902801 - APRES SOCIEDAD ANONIMA
901600 - ASISTENCIA SANITARIA INTEGRAL S.A.
903002 - ASOCIACION CIVIL DE ESTUDIOS SUPERIORES ACES (HOSPITAL AUSTRAL)
905404 - ASOCIACION MUTUAL DE FARMACEUTICOS FLORENTINO AMEGHINO
901808 - ASOCIACION MUTUAL DE PARTICIPANTES DE ECONOMIA SOLIDARIAS
902306 - ASOCIACION MUTUAL DEL PERSONAL, ASESORES Y DIRECTIVOS DE GRUPO SAN NICOLAS S.R.L.
900300 - ASOCIACION MUTUAL RURALISTA
902108 - ASOCIACION MUTUAL SANCOR SALUD
903101 - AVALIAN SALUD Y BIENESTAR COOPERATIVA LIMITADA
905909 - BONMED SOCIEDAD ANÓNIMA
902603 - CENTRO DE EDUCACION MEDICA E INVESTIGACIONES CLINICAS NORBERTO QUIRNO - CEMIC
905206 - CIRCULO MEDICO DE LOMAS DE ZAMORA
900508 - CYNTHIOS SALUD S.A.
906001 - EMINENTE MEDICINAL S.A.
903606 - ENSALUD SA
901105 - GALENO ARGENTINA SOCIEDAD ANONIMA
904005 - GEA S.A.
903804 - GERMED S A
905305 - GILSA S.R.L.
903309 - GRUPO DDM SA
905701 - GRUPO MEDICO INCAS S.A.
901204 - HOSPITAL ALEMAN ASOCIACION CIVIL
902504 - HOSPITAL BRITANICO DE BUENOS AIRES ASOCIACION CIVIL
900409 - LA CASA DEL MEDICO MUTUAL
901501 - MEDICINA PREPAGA HOMINIS S.A.
901006 - MEDICUS SOCIEDAD ANONIMA DE ASISTENCIA MEDICA Y CIENTIFICA
901402 - MEDIFE ASOCIACION CIVIL
903903 - MET CORDOBA SA
905602 - MUTUAL DEL PERSONAL DEL CENTRO INDUSTRIAL ACINDAR
903200 - MUTUAL FEDERADA 25 DE JUNIO SOCIEDAD DE PROTECCION RECIPROCA
901709 - MUTUAL MEDICA CONCORDIA
902207 - NATIVUS SOCIEDAD DE RESPONSABILIDAD LIMITADA
902900 - OMINT SOCIEDAD ANONIMA DE SERVICIOS
902009 - PARQUE SALUD S.A.
902405 - PLENIMEDICAL S.A.
900706 - PRESTADORES SANATORIALES SA
903507 - PREVENCIÓN SALUD S.A.
904104 - PRIVAMED S.A.
903408 - ROI SA
900607 - SABER SOCIEDAD ANONIMA
903705 - SISTEMA INTEGRADO DE PRESTADORES DE SALUD S A
902702 - SOCIEDAD ITALIANA DE BENEFICENCIA EN BUENOS AIRES
901907 - SOREMER S.A.
900805 - SWISS MEDICAL SA
600705 ASOC. CORRENTINA DE OBRAS SOCIALES
600101 ASOC. DE OBRAS SOCIALES DE BAHIA BLANCA
600507 ASOC. DE OBRAS SOCIALES DE CONCORDIA
600804 ASOC. DE OBRAS SOCIALES DE CORONEL DORREGO
600606 ASOC. DE OBRAS SOCIALES DE CORONEL SUAREZ
601005 ASOC. DE OBRAS SOCIALES DE FIRMAT
602107 ASOC. DE OBRAS SOCIALES DE LA RIOJA
601401 ASOC. DE OBRAS SOCIALES DE MENDOZA
601500 ASOC. DE OBRAS SOCIALES DE MISIONES
601609 ASOC. DE OBRAS SOCIALES DE NEUQUEN
601906 ASOC. DE OBRAS SOCIALES DE PERGAMINO
603704 ASOC. DE OBRAS SOCIALES DE PERS. DE DIR.
602503 ASOC. DE OBRAS SOCIALES DE SALTO
602909 ASOC. DE OBRAS SOCIALES DE SANTA FE
603001 ASOC. DE OBRAS SOCIALES DE TUCUMAN
601708 ASOC. DE OBRAS SOCIALES DEL NORTE DE SANTA
401506 ASOC. DE PREST. SOCIALES PARA EMPRESARIOS Y
603506 ASOC. FEDERATIVA DE OBRAS SOCIALES
603308 ASOC. MENDOCINA DE OBRAS SOCIALES
900904 ASOC. MUTUAL DE SALUD CIUDADELA
601807 ASOC. NUEVEJULIENSE DE OBRAS SOCIALES
600200 ASOC. REGIONAL BARILOCHE DE OBRAS SOCIALES
602206 ASOC. RIONEGRINA DE OBRAS SOCIALES
600309 ASOCIACION DE OBRAS SOCIALES DE BELLA VISTA
600408 ASOCIACION DE OBRAS SOCIALES DE COMODORO RIVADAVIA
600903 ASOCIACION DE OBRAS SOCIALES DE ESPERANZA
601203 ASOCIACION DE OBRAS SOCIALES DE GUALEGUAY
601302 ASOCIACION DE OBRAS SOCIALES DE MAR DEL PLATA
602305 ASOCIACION DE OBRAS SOCIALES DE ROSARIO
603100 ASOCIACION DE OBRAS SOCIALES DE TRELEW
601104 ASOCIACION GUALEGUAYCHU DE OBRAS SOCIALES
904708 ASOCIACIÓN MUTUAL DEL CONTROL INTEGRAL
904609 ASOCIACIÓN MUTUAL FRANCO ANDINA REGIONAL MENDOZA
904401 ASOCIACIÓN MUTUAL MÉDICA DE VILLA MARÍA
904302 COBERTURA DE SALUD S.A.
201304 DIR. DE O.S. DE LA EMPRESA NACIONAL DE TELECOMUNICACIONES
201106 DIR. GENERAL DE O.S. DEL MINIST. DE RELACIONES EXTERIORES
200806 DIR. GENERAL DE OBRAS SOCIALES DEL MINISTERIO
302908 DIR. GENERAL DE SERV. ASIST. DE SERV. ELECTRICOS
510006 DIRECCION GENERAL DE ASISTENCIA MEDICA SOCIAL
603407 FED. DE O.S. DE TRABAJ. DE LOS MEDIOS DE COMUNICACION
603605 FEDERACION ARGENTINA DE OBRAS SOCIALES
500203 INST. DE O.S.
500708 INST. DE O.S. PARA EL PERS. DEL MINIST. DE EDUCACION
501503 INST. DE SERV. SOC. PARA EL PERS. DE LA IND.
105200 INST. DE SERV. SOC. PARA EL PERS. DE LA IND.
500302 INST. DE SERV. SOC. PARA EL PERS. DE LA IND.
501404 INST. DE SERV. SOC. PARA EL PERS. DEL TERRITORIO NACIONAL
501206 INST. DE SERVICIOS PARA EL PERS. DE SEGUROS
500609 INST. DE SERVICIOS PARA EL PERS. FERROVIARIO
602800 INST. SANRAFAELINO DE OBRAS SOCIALES
500807 INSTITUTO NACIONAL DE SERVICIOS SOCIALES PARA JUBILADOS (PAMI)
904500 MEDYCIN ARGENTINO S.A.
000001 MUTUAL DE LOS MEDICOS MUNICIPALES DE LA CIUDAD
001409 MUTUAL DEL PERSONAL DE AGUA Y ENERGIA ELECTRICA
000703 MUTUAL DEL PERSONAL DEL AGUA Y LA ENERGIA
904906 NOBIS S.A.
902001 O.S.P. BUENOS AIRES (IOMA)
903001 O.S.P. CATAMARCA (OSEP)
916001 O.S.P. CHACO (INSSSEP)
917001 O.S.P. CHUBUT (SEROS)
901001 O.S.P. CIUDAD AUT. DE BUENOS AIRES
904001 O.S.P. CORDOBA (APROSS)
905001 O.S.P. CORRIENTES (IOSCOR)
918002 O.S.P. FORMOSA (AMP)
918001 O.S.P. FORMOSA (IMPF)
907001 O.S.P. JUJUY (ISJ)
919001 O.S.P. LA PAMPA (SEMPRE)
908001 O.S.P. LA RIOJA
909001 O.S.P. MENDOZA
920001 O.S.P. MISIONES (IPS)
921001 O.S.P. NEUQUEN
922001 O.S.P. RIO NEGRO (IPROSS)
910001 O.S.P. SALTA (IPS)
911001 O.S.P. SAN JUAN
912001 O.S.P. SAN LUIS
923001 O.S.P. SANTA CRUZ
913001 O.S.P. SANTA FE (IAPOSS)
914001 O.S.P. SANTIAGO DEL ESTERO (IOSEP)
924001 O.S.P. TIERRA DEL FUEGO (IPAUSS)
915001 O.S.P. TUCUMAN (IPSST)
401704 OBRA SOCIAL DE EMPRESARIOS, PROFESIONALES
100908 OBRA SOCIAL EMPLEADOS DE AGENCIAS DE INFORMACION
400909 OBRA SOCIAL ACCION SOCIAL DE EMPRESARIOS
800501 OBRA SOCIAL ACEROS PARANA
300100 OBRA SOCIAL ANILSUD
303802 OBRA SOCIAL ARBITROS DE FUTBOL ARG.
101406 OBRA SOCIAL ARTES GRAFICAS DE SANTA FE
402608 OBRA SOCIAL ASOCIACION DE SERVICIOS SOCIALES
402103 OBRA SOCIAL ASOCIACION DEL PERSONAL DE DIRECCION
400503 OBRA SOCIAL ASOCIACION DEL PERSONAL DE DIRECCION
402301 OBRA SOCIAL ASOCIACION DEL PERSONAL SUPERIOR
401803 OBRA SOCIAL ASOCIACION MUTUAL DEL PERSONAL
002907 OBRA SOCIAL ASOCIACION MUTUAL METALURGICA
800105 OBRA SOCIAL ATANOR S.A
301608 OBRA SOCIAL AUTOLATINA ARGENTINA S.A.
102409 OBRA SOCIAL AZUCAR VILLA OCAMPO
300209 OBRA SOCIAL AZULEJOS DECORADOS
126304 OBRA SOCIAL BANCARIA ARGENTINA
303307 OBRA SOCIAL CABOT ARGENTINA
300803 OBRA SOCIAL CALILEGUA S.A.A.I.C.
400701 OBRA SOCIAL CAMARA DE LA INDUSTRIA CURTIDORA
125202 OBRA SOCIAL CAPITANES
200202 OBRA SOCIAL CENTRO REGIONAL DE AGUAS SUBTERRANEAS
300704 OBRA SOCIAL CERAS JOHNSON
105903 OBRA SOCIAL CHOFERES PARTICULARES
302304 OBRA SOCIAL COMPANIA MINERA AGUILAR S.A
302700 OBRA SOCIAL COMPAÑIA QUIMICA S.A.
121804 OBRA SOCIAL CONDUCTORES DE TAXIS DE CORDOBA
302601 OBRA SOCIAL COOPERATIVA DE ASISTENCIA MUTUA
400305 OBRA SOCIAL COOPERATIVA LTDA.
300506 OBRA SOCIAL CORPORACION CEMENTERA ARGENTINA
301707 OBRA SOCIAL DE ALLIED DOMECQ ARGENTINA S.A
122401 OBRA SOCIAL DE EMPLEADOS DE LA INDUSTRIA
127505 OBRA SOCIAL DE LAS ASOCIACIONES DE EMPLEADOS
100205 OBRA SOCIAL DE ACTORES
100809 OBRA SOCIAL DE AERONAVEGANTES
000604 OBRA SOCIAL DE AGENTES DE LOTERIAS Y AFINES
118200 OBRA SOCIAL DE AGENTES DE PROPAGANDA MEDICA
118309 OBRA SOCIAL DE AGENTES DE PROPAGANDA MEDICA
118408 OBRA SOCIAL DE AGENTES DE PROPAGANDA MEDICA
101505 OBRA SOCIAL DE ARTISTAS DE VARIEDADES
102805 OBRA SOCIAL DE BANCARIOS
123206 OBRA SOCIAL DE BAÑEROS Y AFINES DEL PARTIDO
124001 OBRA SOCIAL DE BOXEADORES AGREMIADOS
116105 OBRA SOCIAL DE CAPATACES ESTIBADORES PORTUARIOS
111506 OBRA SOCIAL DE CAPITANES BAQUEANOS FLUVIALES
111407 OBRA SOCIAL DE CAPITANES DE ULTRAMAR Y OFICIALES
000505 OBRA SOCIAL DE CAPITANES, PILOTOS Y PATRONES
104108 OBRA SOCIAL DE CERAMISTAS
105804 OBRA SOCIAL DE CHOFERES DE CAMIONES
104702 OBRA SOCIAL DE COLCHONEROS
104801 OBRA SOCIAL DE COLOCADORES DE AZULEJOS, MOSAICOS
113809 OBRA SOCIAL DE COMISARIOS NAVALES
103204 OBRA SOCIAL DE CONDUCTORES CAMIONEROS Y PERSONAL
126809 OBRA SOCIAL DE CONDUCTORES DE REMISES Y AUTOMOVILES
121606 OBRA SOCIAL DE CONDUCTORES DE TRANSPORTE COLECTIVO
105002 OBRA SOCIAL DE CONDUCTORES NAVALES
003504 OBRA SOCIAL DE CONDUCTORES TITULARES TAXIS
105101 OBRA SOCIAL DE CONSIGNATARIOS DEL MERCADO GANADERO
402707 OBRA SOCIAL DE DIRECCION
402806 OBRA SOCIAL DE DIRECCION DE LA ACTIVIDAD AEROCOMERCIAL
402905 OBRA SOCIAL DE DIRECCIÓN WITCE
106104 OBRA SOCIAL DE EMPLEADOS DE DESPACHANTES DE ADUANA
111605 OBRA SOCIAL DE EMPLEADOS DE LA MARINA MERCANTE
118002 OBRA SOCIAL DE EMPLEADOS DE PRENSA DE CORDOBA
120603 OBRA SOCIAL DE EMPLEADOS DEL TABACO
121101 OBRA SOCIAL DE EMPLEADOS TEXTILES Y AFINES
002204 OBRA SOCIAL DE EMPLEADOS Y PERSONAL JERARQUICO
303208 OBRA SOCIAL DE EMPRESA PRIVADA WITCEL S.A.
111704 OBRA SOCIAL DE ENCARGADOS APUNTADORES MARITIMOS
128508 OBRA SOCIAL DE FARMACEUTICOS Y BIOQUIMICOS
107701 OBRA SOCIAL DE FERROVIARIOS
303901 OBRA SOCIAL DE FORD ARGENTINA S.A.
108209 OBRA SOCIAL DE FOTOGRAFOS
108605 OBRA SOCIAL DE FUTBOLISTAS
109202 OBRA SOCIAL DE GUINCHEROS Y MAQUINISTAS
303604 OBRA SOCIAL DE IPAKO S.A.
110107 OBRA SOCIAL DE JARDINEROS, PARQUISTAS, VIVEROS
113304 OBRA SOCIAL DE JEFES Y OFICIALES MAQUINISTAS NAVALES
113205 OBRA SOCIAL DE JEFES Y OFICIALES NAVALES
000901 OBRA SOCIAL DE LA ACTIVIDAD DE SEGUROS, REASEGUROS
112400 OBRA SOCIAL DE LA ACTIVIDAD MINERA
001508 OBRA SOCIAL DE LA ASOCIACION CIVIL PROSINDI
125509 OBRA SOCIAL DE LA FEDERACION ARGENTINA DEL TRANSPORTE
001904 OBRA SOCIAL DE LA FEDERACION DE CAMARAS Y CENTROS
126007 OBRA SOCIAL DE LA FEDERACION GREMIAL
124902 OBRA SOCIAL DE LA FEDERACION NACIONAL DE SINDICATOS
107503 OBRA SOCIAL DE LA FERIA INFANTIL
119104 OBRA SOCIAL DE LA INDUSTRIA DE MATERIALES REFRACTARIOS
114208 OBRA SOCIAL DE LA INDUSTRIA DE PASTAS ALIMENTICIAS
121507 OBRA SOCIAL DE LA INDUSTRIA DEL TRANSPORTE
003801 OBRA SOCIAL DE LA PREVENCION Y LA SALUD
200103 OBRA SOCIAL DE LA SECRETARIA DE AGRICULTURA
128102 OBRA SOCIAL DE LA UNION DE TRABAJADORES DEL ESTADO
112103 OBRA SOCIAL DE LA UNION OBRERA METALURGICA
201403 OBRA SOCIAL DE LA UNIVERSIDAD DE BUENOS AIRES
510204 OBRA SOCIAL DE LA UNIVERSIDAD NACIONAL DEL LITORAL
200301 OBRA SOCIAL DE LAS SECRETARIAS DE INDUSTRIA
110602 OBRA SOCIAL DE LOCUTORES
001805 OBRA SOCIAL DE LOS LEGISLADORES DE LA REPUBLICA
112202 OBRA SOCIAL DE LOS SUPERVISORES DE LA INDUSTRIA
105507 OBRA SOCIAL DE LOS CORTADORES DE LA INDUMENTARIA
126205 OBRA SOCIAL DE LOS EMPLEADOS DE COMERCIO Y ACTIVIDADES CIVILES
002600 OBRA SOCIAL DE LOS TRABAJADORES DE LA CARNE
110800 OBRA SOCIAL DE LOS TRABAJADORES DE LAS EMPRESAS
127802 OBRA SOCIAL DE LUZ Y FUERZA DE LA PATAGONIA
127208 OBRA SOCIAL DE MANDOS MEDIOS DE TELECOMUNICACIONES
111308 OBRA SOCIAL DE MAQUINISTAS DE TEATRO Y TELEVISION
002501 OBRA SOCIAL DE MINISTROS, SECRETARIOS Y SUBSECRETARIOS
112806 OBRA SOCIAL DE MUSICOS
113007 OBRA SOCIAL DE MUSICOS DE MAR DEL PLATA
106708 OBRA SOCIAL DE OBREROS EMPACADORES DE FRUTA
127406 OBRA SOCIAL DE OBREROS Y EMPLEADOS TINTOREROS
114802 OBRA SOCIAL DE OFICIALES PELUQUEROS Y PEINADORES
114901 OBRA SOCIAL DE OFICIALES PELUQUEROS Y PEINADORES
104603 OBRA SOCIAL DE OPERADORES CINEMATOGRAFICOS
114000 OBRA SOCIAL DE PANADEROS, PASTELEROS Y FACTURAS
114505 OBRA SOCIAL DE PATRONES DE CABOTAJE DE RIOS
114604 OBRA SOCIAL DE PELETEROS
123701 OBRA SOCIAL DE PEONES DE TAXIS DE LA CAPITAL
115300 OBRA SOCIAL DE PETROLEROS
115508 OBRA SOCIAL DE PETROLEROS DE CORDOBA
127901 OBRA SOCIAL DE PETROLEROS PRIVADOS
116204 OBRA SOCIAL DE PORTUARIOS ARGENTINOS
301905 OBRA SOCIAL DE SERVICIOS ASISTENCIALES COMPLETOS
123107 OBRA SOCIAL DE TALLERISTAS A DOMICILIO
120108 OBRA SOCIAL DE TECNICOS
108704 OBRA SOCIAL DE TECNICOS DE FUTBOL
003900 OBRA SOCIAL DE TECNICOS DE VUELO DE LINEAS AEREAS
121200 OBRA SOCIAL DE TINTOREROS SOMBREREROS Y LAVADEROS
127000 OBRA SOCIAL DE TRABAJADORES DE ESTACIONES DE SERVICIO
124506 OBRA SOCIAL DE TRABAJADORES DE LA INDUSTRIA
124704 OBRA SOCIAL DE TRABAJADORES DE LA INDUSTRIA PLASTICA
120801 OBRA SOCIAL DE TRABAJADORES DE LAS COMUNICACIONES
123602 OBRA SOCIAL DE TRABAJADORES DE PERKINS ARGENTINA
115102 OBRA SOCIAL DE TRABAJADORES DE PRENSA DE BUENOS AIRES
128607 OBRA SOCIAL DE TRABAJADORES DEL PETROLEO Y GAS
701200 OBRA SOCIAL DE TRABAJADORES MUNICIPALES DE LOMAS DE ZAMORA
003207 OBRA SOCIAL DE TRABAJADORES SOCIOS DE LA ASOCIACION
127307 OBRA SOCIAL DE TRABAJADORES VIALES Y AFINES
121903 OBRA SOCIAL DE VAREADORES
123909 OBRA SOCIAL DE VENDEDORES AMBULANTES
122203 OBRA SOCIAL DE VIAJANTES DE COMERCIO
122104 OBRA SOCIAL DE VIAJANTES VENDEDORES
002006 OBRA SOCIAL DE VIALIDAD NACIONAL
200905 OBRA SOCIAL DEL MINISTERIO DE JUSTICIA
201205 OBRA SOCIAL DEL MINISTERIO DE OBRAS Y SERVICIOS
115904 OBRA SOCIAL DEL PERS. DE ACADEMIA PITMAN
101307 OBRA SOCIAL DEL PERS. DE ARTES GRAFICAS DEL INTERIOR
300605 OBRA SOCIAL DEL PERS. DE CERAMICA SAN LORENZO
401407 OBRA SOCIAL DEL PERS. DE DIR. DE LA ACT. MINERA
107602 OBRA SOCIAL DEL PERS. DE FERMOLAC
123800 OBRA SOCIAL DEL PERS. DE GUARDAVIDAS Y AFINES
301301 OBRA SOCIAL DEL PERS. DE LA COMPAÑIA EMBOTELLADORA
119401 OBRA SOCIAL DEL PERS. DE LA INDUSTRIA SALINERA
103303 OBRA SOCIAL DEL PERS. DE LA JUNTA NACIONAL DE GRANOS
117306 OBRA SOCIAL DEL PERS. DE PRENSA DE CAPITAL
117504 OBRA SOCIAL DEL PERS. DE PRENSA DE CORDOBA
117900 OBRA SOCIAL DEL PERS. DE PRENSA DE SANTIAGO
120207 OBRA SOCIAL DEL PERS. DE STANDARD ELECTRIC
103501 OBRA SOCIAL DEL PERS. DE SUPERVISION
122708 OBRA SOCIAL DEL PERS. DE VIALIDAD NACIONAL
101703 OBRA SOCIAL DEL PERS. DEL AZUCAR DE CALILEGUA
102003 OBRA SOCIAL DEL PERS. DEL AZUCAR DEL INGENIO
102201 OBRA SOCIAL DEL PERS. DEL AZUCAR DEL INGENIO
119807 OBRA SOCIAL DEL PERS. DEL SEGURO
120009 OBRA SOCIAL DEL PERS. DEL SURCO DE VILLA QUILINO
109103 OBRA SOCIAL DEL PERS. GRAFICO DE CORRIENTES
000109 OBRA SOCIAL DEL PERS. JERARQUICO DE LA INDUSTRIA
125806 OBRA SOCIAL DEL PERS. JERARQUICO DEL AGUA Y ENERGIA
700207 OBRA SOCIAL DEL PERS. MUNICIPAL DE COMODORO RIVADAVIA
700900 OBRA SOCIAL DEL PERS. MUNICIPAL DE GENERAL PUEYRREDON
700306 OBRA SOCIAL DEL PERS. MUNICIPAL DE LANUS
700405 OBRA SOCIAL DEL PERS. MUNICIPAL DE MERLO
700702 OBRA SOCIAL DEL PERS. MUNICIPAL DE PUERTO MADRYN
700603 OBRA SOCIAL DEL PERS. MUNICIPAL DE QUILMES
700504 OBRA SOCIAL DEL PERS. MUNICIPAL DE SAN ISIDRO
701101 OBRA SOCIAL DEL PERS. MUNICIPAL DE SANTIAGO DEL ESTERO
108902 OBRA SOCIAL DEL PERS. SUPERIOR DE GOOD-YEAR
105309 OBRA SOCIAL DEL PERSONAL ADMINISTRATIVO Y TECNICO
128805 OBRA SOCIAL DEL PERSONAL ADUANERO DE LA REPUBLICA
100502 OBRA SOCIAL DEL PERSONAL AERONAUTICO
003009 OBRA SOCIAL DEL PERSONAL ASOCIADO
103600 OBRA SOCIAL DEL PERSONAL AUXILIAR DE CASAS PARTICULARES
104405 OBRA SOCIAL DEL PERSONAL CINEMATOGRAFICO
112301 OBRA SOCIAL DEL PERSONAL DE CEMENTERIOS
104009 OBRA SOCIAL DEL PERSONAL DE CEMENTERIOS
109301 OBRA SOCIAL DEL PERSONAL DE CONSIGNATARIOS
401100 OBRA SOCIAL DEL PERSONAL DE DIRECCION ALFRED
401209 OBRA SOCIAL DEL PERSONAL DE DIRECCION DE LA ACTIVIDAD
401605 OBRA SOCIAL DEL PERSONAL DE DIRECCION DE LA INDUSTRIA
402004 OBRA SOCIAL DEL PERSONAL DE DIRECCION DE LA INDUSTRIA
400107 OBRA SOCIAL DEL PERSONAL DE DIRECCION DE LA INDUSTRIA
400206 OBRA SOCIAL DEL PERSONAL DE DIRECCION DE LA INDUSTRIA
401001 OBRA SOCIAL DEL PERSONAL DE DIRECCION DE LA INDUSTRIA
400404 OBRA SOCIAL DEL PERSONAL DE DIRECCION DE LA INDUSTRIA
120405 OBRA SOCIAL DEL PERSONAL DE DIRECCION DE LA INDUSTRIA
401902 OBRA SOCIAL DEL PERSONAL DE DIRECCION DE PETROLEO
106203 OBRA SOCIAL DEL PERSONAL DE DISTRIBUIDORAS
128706 OBRA SOCIAL DEL PERSONAL DE DRAGADO Y BALIZAMIENTO
106401 OBRA SOCIAL DEL PERSONAL DE EDIFICIOS DE RENTA Y HORIZONTAL
106500 OBRA SOCIAL DEL PERSONAL DE EDIFICIOS DE RENTA Y HORIZONTAL
900102 OBRA SOCIAL DEL PERSONAL DE EMPRESAS FIAT Y AGFA
106005 OBRA SOCIAL DEL PERSONAL DE ENTIDADES DEPORTIVAS
106906 OBRA SOCIAL DEL PERSONAL DE ESCRIBANIAS
126601 OBRA SOCIAL DEL PERSONAL DE INDUSTRIAS QUIMICAS
118705 OBRA SOCIAL DEL PERSONAL DE INDUSTRIAS QUIMICAS
119609 OBRA SOCIAL DEL PERSONAL DE INSTALACIONES SANITARIAS
110008 OBRA SOCIAL DEL PERSONAL DE JABONEROS
126700 OBRA SOCIAL DEL PERSONAL DE LA ACTIVIDAD AZUCARERA
104306 OBRA SOCIAL DEL PERSONAL DE LA ACTIVIDAD CERAMICA
121705 OBRA SOCIAL DEL PERSONAL DE LA ACTIVIDAD DEPORTIVA
108407 OBRA SOCIAL DEL PERSONAL DE LA ACTIVIDAD FRUTI-HORTICOLA
115003 OBRA SOCIAL DEL PERSONAL DE LA ACTIVIDAD PESQUERA
122302 OBRA SOCIAL DEL PERSONAL DE LA ACTIVIDAD VITIVINICOLA
122609 OBRA SOCIAL DEL PERSONAL DE LA ACTIVIDAD VITIVINICOLA
104207 OBRA SOCIAL DEL PERSONAL DE LA CERAMICA, SANITARIOS
105408 OBRA SOCIAL DEL PERSONAL DE LA CONSTRUCCION
200400 OBRA SOCIAL DEL PERSONAL DE LA EMPRESA NACIONAL DE CORREOS
106807 OBRA SOCIAL DEL PERSONAL DE LA ENSEÑANZA PRIVADA
128003 OBRA SOCIAL DEL PERSONAL DE LA FEDERACION
120504 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA DEL DULCE
102706 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA AZUCARERA
103006 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA BOVINA
103105 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA DE LA CARNE
103907 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA DE LA MADERA
103709 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA DE LA SEDA
101208 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA DEL CUERO
122500 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA DEL HELADO
122005 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA DEL PAPEL
121309 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA DEL TRANSPORTE
115201 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA METALURGICA
113601 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA NAVAL
116006 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA PLASTICA
107909 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA FILMOGRAFICA
108001 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA FORESTAL
000208 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA GRAFICA
110404 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA LACTEA
110503 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA LECHERA
111001 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA MADERERA
112608 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA MOLINERA
113700 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA NAVAL
115607 OBRA SOCIAL DEL PERSONAL DE LA INDUSTRIA PESQUERA
109509 OBRA SOCIAL DEL PERSONAL DE LOS HIPODROMOS
110909 OBRA SOCIAL DEL PERSONAL DE LUZ Y FUERZA
111209 OBRA SOCIAL DEL PERSONAL DE MAESTRANZA
108506 OBRA SOCIAL DEL PERSONAL DE MANIPULEO, EMPAQUES
113908 OBRA SOCIAL DEL PERSONAL DE PANADERIAS
303703 OBRA SOCIAL DEL PERSONAL DE PBBPOLISUR SA
114703 OBRA SOCIAL DEL PERSONAL DE PELUQUERIAS
117405 OBRA SOCIAL DEL PERSONAL DE PRENSA DE BAHIA BLANCA
117603 OBRA SOCIAL DEL PERSONAL DE PRENSA DE LA PROVINCIA
117207 OBRA SOCIAL DEL PERSONAL DE PRENSA DE LA REPUBLICA
117702 OBRA SOCIAL DEL PERSONAL DE PRENSA DE MAR DEL PLATA
117801 OBRA SOCIAL DEL PERSONAL DE PRENSA DE MENDOZA
123404 OBRA SOCIAL DEL PERSONAL DE PRENSA DE ROSARIO
123503 OBRA SOCIAL DEL PERSONAL DE PRENSA DE TUCUMAN
118903 OBRA SOCIAL DEL PERSONAL DE RECOLECCION Y BARRIDO
119005 OBRA SOCIAL DEL PERSONAL DE REFINERIAS DE MAIZ
119708 OBRA SOCIAL DEL PERSONAL DE SEGURIDAD COMERCIAL
123305 OBRA SOCIAL DEL PERSONAL DE SOCIEDADES DE AHORRO
120306 OBRA SOCIAL DEL PERSONAL DE SUPERVISION
127109 OBRA SOCIAL DEL PERSONAL DE TELECOMUNICACIONES
102300 OBRA SOCIAL DEL PERSONAL DEL AZUCAR DEL INGENIO TABACAL
102102 OBRA SOCIAL DEL PERSONAL DEL AZUCAR DEL INGENIO LEDESMA
103808 OBRA SOCIAL DEL PERSONAL DEL CAUCHO
107107 OBRA SOCIAL DEL PERSONAL DEL ESPECTACULO PUBLICO
110206 OBRA SOCIAL DEL PERSONAL DEL JOCKEY CLUB
000406 OBRA SOCIAL DEL PERSONAL DEL ORGANISMO DE CONTROL
114109 OBRA SOCIAL DEL PERSONAL DEL PAPEL, CARTON
108803 OBRA SOCIAL DEL PERSONAL DEL TURISMO, HOTELERIA
400602 OBRA SOCIAL DEL PERSONAL DIRECTIVO DE LA INDUSTRIA
109004 OBRA SOCIAL DEL PERSONAL GRAFICO
001706 OBRA SOCIAL DEL PERSONAL JERARQUICO DE LA REPUBLICA
002402 OBRA SOCIAL DEL PERSONAL JERARQUICO DEL TRANSPORTE
110305 OBRA SOCIAL DEL PERSONAL LADRILLERO
111803 OBRA SOCIAL DEL PERSONAL MARITIMO
109608 OBRA SOCIAL DEL PERSONAL MENSUALIZADO DEL JOCKEY
112707 OBRA SOCIAL DEL PERSONAL MOSAISTA
700108 OBRA SOCIAL DEL PERSONAL MUNICIPAL DE AVELLANEDA
700801 OBRA SOCIAL DEL PERSONAL MUNICIPAL DE LA MATANZA
113403 OBRA SOCIAL DEL PERSONAL NAVAL
119302 OBRA SOCIAL DEL PERSONAL RURAL Y ESTIBADORES
303406 OBRA SOCIAL DEL PERSONAL SHELL-CAP
111902 OBRA SOCIAL DEL SINDICATO DE MECANICOS Y AFINES
128409 OBRA SOCIAL DEL SINDICATO OBREROS Y EMPLEADOS
001607 OBRA SOCIAL DEL SINDICATO UNIDO DE TRABAJADORES
121408 OBRA SOCIAL DEL TRANSPORTE AUTOMOTOR DE ROSARIO
301004 OBRA SOCIAL DESTILERIAS SAN IGNACIO
201502 OBRA SOCIAL DIRECCION NACIONAL DE VIALIDAD
301103 OBRA SOCIAL DUNLOP ARGENTINA LIMITADA
301202 OBRA SOCIAL DUPERIAL ORBEA
106609 OBRA SOCIAL ELECTRICISTAS NAVALES
301400 OBRA SOCIAL ELECTROCLOR S.C.A.
201007 OBRA SOCIAL EMPRESAS LINEAS MARITIMAS ARGENTINAS
113106 OBRA SOCIAL ESTATAL NAVAL
125301 OBRA SOCIAL FEDERAL DE LA FEDERACION NACIONAL
001300 OBRA SOCIAL FERROVIARIA
200608 OBRA SOCIAL FLOTA FLUVIAL DEL ESTADO ARGENTINO
800204 OBRA SOCIAL FORJA ARGENTINA S.A.I.C.
200707 OBRA SOCIAL GAS DEL ESTADO
302007 OBRA SOCIAL INGENIO RIO GRANDE S.A.
201601 OBRA SOCIAL INST. NACIONAL DE VITIVINICULTURA
302205 OBRA SOCIAL LEDESMA S.A.A.I.
126403 OBRA SOCIAL MEDICA AVELLANEDA
112509 OBRA SOCIAL MODELOS ARGENTINOS
302403 OBRA SOCIAL MOLINOS RIO DE LA PLATA
402202 OBRA SOCIAL MUTUALIDAD INDUSTRIAL TEXTIL ARG.
900201 OBRA SOCIAL OLIVETTI S.A.C.
800303 OBRA SOCIAL PAPEL MISIONERO S.A.I.F. Y C.
302106 OBRA SOCIAL PARA DIRECTIVOS, TECNICOS Y EMPLEADOS
124407 OBRA SOCIAL PARA EL PERS. DE EMPRESAS DE LIMPIEZA
002303 OBRA SOCIAL PARA EL PERSONAL DE EMPRESAS
701002 OBRA SOCIAL PARA EL PERSONAL MUNICIPAL
012440 OBRA SOCIAL PARA EL PERS. DE EMPRESAS DE LIMPIEZA
100762 OBRA SOCIAL PARA EL PERS. DE ESCRIBANIAS
500906 OBRA SOCIAL PARA EL PERS. DE OBRAS SANITARIAS
001003 OBRA SOCIAL PARA EL PERS. DE OBRAS Y SERVICIOS
125400 OBRA SOCIAL PARA EL PERS. DE OBRAS Y SERVICIOS
402400 OBRA SOCIAL PARA EL PERSONAL DE DIRECCION
401308 OBRA SOCIAL PARA EL PERSONAL DE DIRECCION
123008 OBRA SOCIAL PARA EL PERSONAL DE ESTACIONES DE SERVICIO
100106 OBRA SOCIAL PARA EL PERSONAL DE LA INDUSTRIA
127604 OBRA SOCIAL PARA EL PERSONAL DE OBRAS Y SERVICIOS
001201 OBRA SOCIAL PARA EL PERSONAL DEL MINISTERIO DEL INTERIOR
004002 OBRA SOCIAL PARA EMPLEADOS Y PRODUCTORES DE SEGUROS
500500 OBRA SOCIAL PARA LA ACT. DOCENTE
001102 OBRA SOCIAL PARA LA ACTIVIDAD DOCENTE
124605 OBRA SOCIAL PARA LOS AGENTES DE PREVISION Y SEGURIDAD
126106 OBRA SOCIAL PARA LOS TRABAJADORES DE LA EDUCACION
115706 OBRA SOCIAL PARA PILOTOS DE LINEAS AEREAS COMERCIALES
302502 OBRA SOCIAL PASA PETROQUIMICA ARGENTINA S.A.
128300 OBRA SOCIAL PEONES DE TAXIS DE ROSARIO
125608 OBRA SOCIAL PERS. SUPERIOR DE LA INDUSTRIA
127703 OBRA SOCIAL PERSONAL ESTACIONES DE SERVICIO
800402 OBRA SOCIAL PETROQUIMICA GENERAL MOSCONI
000307 OBRA SOCIAL PORTUARIOS ARGENTINOS DE MAR DEL PLATA
116303 OBRA SOCIAL PORTUARIOS DE BAHIA BLANCA
116402 OBRA SOCIAL PORTUARIOS DE NECOCHEA Y QUEQUEN
116709 OBRA SOCIAL PORTUARIOS DE PUERTO SAN MARTIN
116501 OBRA SOCIAL PORTUARIOS DE ROSARIO
116600 OBRA SOCIAL PORTUARIOS DE SAN LORENZO
116808 OBRA SOCIAL PORTUARIOS DE SAN NICOLAS
116907 OBRA SOCIAL PORTUARIOS DE SAN PEDRO
117009 OBRA SOCIAL PORTUARIOS DE SANTA FE
117108 OBRA SOCIAL PORTUARIOS DE VILLA CONSTITUCION
002105 OBRA SOCIAL PROFESIONALES DEL TURF
003603 OBRA SOCIAL PROG MEDICOS SOC ARG CONS MUT
302809 OBRA SOCIAL REFINERIAS DE MAIZ S.A.I.C.F.
301806 OBRA SOCIAL SOCIEDAD MINERA HIERROS PATAGONICOS
303000 OBRA SOCIAL SULFACID S.A.I.F. Y C.
303109 OBRA SOCIAL SUPERCO
114307 OBRA SOCIAL TRABAJADORES PASTELEROS, CONFITEROS
125707 OBRA SOCIAL TRABAJADORES PASTEROS
201809 OBRA SOCIAL YACIMIENTOS PETROLEROS FISCALES
402509 OBRA SOCIAL YPF
128201 OS DEL SINDICATO UNICO DE REC. DE RESIDUOS
003405 OS MUTUAL OBREROS CATOLICOS PADRE GROTE
003306 OS TRABAJADORES VENDEDORES DE DIARIOS
904203 PREMEDICA S.A.
997001 PROGRAMA FEDERAL DE SALUD (PROFE)
904807 SCIS S.A.
000000 Sin Obra Social
```

---

## Apéndice E — Campos nuevos detectados en formulario de recibo (complemento Prioridad 1 y 7)

Dos campos adicionales encontrados en el formulario real que no estaban en el plan:

| Campo | Tabla | Tipo | Descripción |
|---|---|---|---|
| `importeADetraerLey27430` | `payrollLiquidacion` | numeric(12,2) nullable | Importe a detraer según Ley 27430 (reforma tributaria). Aparece en el formulario de recibo con valor default 0. |
| `contribucionAdicionalOS` | `payrollLiquidacion` | numeric(12,2) nullable | Contribución adicional OS para completar el mínimo de contribución. Mensaje: "ingrese el monto necesario para completar el mínimo de contribución OS". |

Estos deben sumarse a los campos de `payrollLiquidacion` del Paso 1 del orden de implementación.
