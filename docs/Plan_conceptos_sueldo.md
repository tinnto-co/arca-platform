# Plan: Rediseño del módulo de Sueldos — Conceptos, Convenios, Puestos y Recibo

**Fecha:** 19/03/2026
**Rama:** feature/restyling
**Contexto:** Análisis de archivos ARCA exportados para dos CUITs distintos, instructivo LS_Instructivo_Conceptos_Subsistemas.pdf, manual SOS Contador, y clarificaciones de lógica de negocio del equipo.

---

## 1. Lógica del sistema ARCA — Cómo funciona realmente

### 1.1 Conceptos AFIP (fijos, nacionales)

Son **116 códigos** definidos por ARCA a nivel nacional. Son invariables y aplican igual para todas las empresas. Se agrupan en rangos:

| Rango | Tipo | Descripción |
|---|---|---|
| 110000–119999 | Remunerativo | Sueldo, avisos, comidas, vivienda, licencias, etc. |
| 120000–129999 | Remunerativo | SAC (Sueldo Anual Complementario) |
| 130000–139999 | Remunerativo | Horas extras (50%, 100%, 200%) |
| 140000–149999 | Remunerativo | Zona desfavorable |
| 150000–159999 | Remunerativo | Vacaciones anticipadas |
| 160000–169999 | Remunerativo | Adicionales (antigüedad, título, tarea, desarraigo) |
| 170000–179999 | Remunerativo | Gratificaciones y premios (presentismo, comisiones, propinas) |
| 180000 | Remunerativo | Remuneración rectificativa (Ley 27.742) |
| 510000–519999 | No remunerativo | Asignaciones familiares |
| 520000–529999 | No remunerativo puro | Beneficios sociales, indemnizaciones, despido |
| 530000–539999 | No remunerativo | Incrementos NR (con aportes OS) |
| 540000–549999 | No remunerativo | Incrementos NR (con aportes y contribuciones OS) |
| 550000–559999 | No remunerativo especial | Montos especiales configurables |
| 560000–570003 | No remunerativo | Pagos especiales no contributivos |
| 799999 | No remunerativo | Redondeo |
| 810000–820000 | Descuento | Retenciones al trabajador (SIPA, OS, sindicato, PAMI, LRT, etc.) |
| 821000 | Descuento | Aportes sindicales adicionales |

### 1.2 Conceptos del Empleador (variables, por empresa/convenio)

Son los conceptos que **cada empresa carga en ARCA**, vinculados a un código AFIP. Un mismo código AFIP puede tener **múltiples conceptos del empleador** según cómo la empresa desglose su información.

Ejemplos reales de los archivos analizados:

**CUIT 30717554864 — Convenio Comercio (FAECYS):**
- Código AFIP `110000` (Sueldo) → 6 conceptos del empleador: Sueldo mensual, Presentismo, Dia empleado de comercio, Dias Faltas Injustificadas, Faltas Injustificadas, Falta Injustificada
- Código AFIP `540000` → Aumento no Rem, Antigüedad NR, Decreto 841/2022, Presentismo NR
- Código AFIP `821000` → FAECYS (x3) + Aporte Solidario OSECAC

**CUIT 30716135124 — Convenio diferente (estructura más simple):**
- Código AFIP `110000` (Sueldo) → solo `Sueldo Basico`
- Código AFIP `160001` → solo `Antigüedad (%)`

**Conclusión:** La estructura de conceptos del empleador varía completamente según el convenio y la empresa. El sistema debe soportar esta variabilidad y **múltiples convenios por cliente**, cada uno con su propio conjunto de conceptos.

### 1.2.1 El codigoContribuyente NO es global — es relativo a cada CUIT

Este es un punto crítico que afecta cómo se diseña el sistema:

El `codigoContribuyente` es un número que **cada empleador asignó libremente** cuando cargó sus conceptos en ARCA. No existe ningún estándar nacional para estos códigos. El mismo número puede significar cosas completamente distintas en dos empresas diferentes:

| CUIT A | CUIT B |
|---|---|
| Código `20` → "Presentismo" | Código `20` → "Horas Extra 100%" |
| Código `1` → "Sueldo Básico" | Código `1` → "Jornal Diario" |

Por lo tanto:
- El `codigoContribuyente` **solo tiene significado dentro del contexto de un mismo CUIT**.
- En nuestra base de datos, el concepto está siempre ligado a un `clientId`, lo que garantiza el aislamiento correcto.
- Las plantillas predefinidas en el sistema usan los códigos reales de los CUITs analizados (`30717554864` y `30716135124`) como punto de partida, pero **cada cliente deberá verificar y ajustar sus propios códigos** contra su archivo ARCA exportado.
- El identificador real de un concepto dentro del sistema es el `id` UUID de la tabla `payroll_concepto`. El `codigoContribuyente` es solo un campo de referencia para cotejo con ARCA.

### 1.3 Relación entre conceptos del empleador y el recibo de sueldo

Este es el punto central de la lógica:

1. El cliente activa/desactiva conceptos del empleador para cada período (mes).
2. El motor de liquidación calcula **cada concepto del empleador individualmente**.
3. Para generar el **recibo**, se agrupan todos los conceptos del empleador por su `codigoAfip`.
4. En el recibo aparece **el nombre del concepto ARCA** (no el del empleador) con la suma de todos los conceptos del empleador que comparten ese código.

**Ejemplo práctico:**

El cliente tiene activos para el mes de marzo:
- `0000000001` Sueldo mensual → $500.000 (codigoAfip: `110000`)
- `0000000011` Presentismo → $41.650 (codigoAfip: `110000`)
- `0000000027` Dia empleado de comercio → $16.667 (codigoAfip: `110000`)
- `0000000003` Antigüedad % → $55.000 (codigoAfip: `160001`)

**Recibo impreso:**
```
Remuneración (Sueldo)    $558.317   ← suma de los tres conceptos con codigoAfip 110000
Antigüedad               $55.000    ← concepto con codigoAfip 160001
```

**Vista interna (detalle para el sistema):**
```
Sueldo mensual           $500.000
Presentismo              $41.650
Dia empleado de comercio $16.667
Antigüedad %             $55.000
```

El recibo siempre muestra la **vista agrupada por ARCA**. La vista interna (para el contador) puede mostrar el detalle completo.

### 1.4 Activación de conceptos por período

Los conceptos del empleador se activan o desactivan según el mes, dependiendo de la reglamentación vigente en ese momento (decretos, acuerdos, actualizaciones de convenios). El sistema debe permitir gestionar esto.

**Mecanismo:** Los conceptos tienen fechas de vigencia (`vigenciaDesde` / `vigenciaHasta`). Al liquidar un período, el motor filtra conceptos cuya vigencia cubra ese período. El usuario gestiona la activación cambiando estas fechas, o mediante un flag de activación explícito por período.

**Ejemplo:** Un decreto de incremento no remunerativo vigente de enero a junio: el concepto tiene `vigenciaDesde = 2026-01` y `vigenciaHasta = 2026-06`. A partir de julio se desactiva automáticamente.

### 1.5 Subsistemas de Aportes y Contribuciones (Bases Imponibles)

El instructivo define **9 Bases Imponibles (BI)** que determinan qué retenciones aplican:

| BI | Subsistema |
|---|---|
| BI 1 | Aportes provisionales (SIPA, RENATEA aportes) |
| BI 2 | Aportes INSSJyP (PAMI) |
| BI 3 | Contribuciones FNE, AAFF, RENATEA |
| BI 4 | Aportes OS + FSR |
| BI 5 | Contribuciones INSSJyP |
| BI 6 | Aportes diferenciales |
| BI 7 | Aportes especiales |
| BI 8 | Contribuciones OS + FSR |
| BI 9 | Contribuciones LRT |

**Matriz de grupos y BI activos (valores fijos en código):**

| Grupo | BI1 | BI2 | BI3 | BI4 | BI5 | BI6 | BI7 | BI8 | BI9 |
|---|---|---|---|---|---|---|---|---|---|
| `remunerativo_defecto` | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 |
| `no_remunerativo_puro` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `no_remunerativo_os` | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 |
| `no_remunerativo_os_full` | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1 | 0 |
| `no_remunerativo_especial` | conf. | conf. | conf. | conf. | conf. | conf. | conf. | conf. | conf. |
| `descuento` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**Regla de pares:** Activar BI 4 (aportes OS) requiere activar FSR. Activar BI 8 (contribuciones OS) requiere BI 4.

### 1.6 Convenios y Puestos de Trabajo

Cada convenio colectivo de trabajo (CCT) define:
- **Puestos de trabajo** (o categorías): cajero, administrativo A, vendedor, maestro pastelero, oficial albañil, etc.
- **Escala salarial**: el básico de cada puesto, con fechas de vigencia (se actualiza por paritarias).
- **Tabla de vacaciones**: días de vacaciones según antigüedad (varía por convenio).
- **Conceptos específicos**: algunos conceptos solo aplican a ciertos puestos o categorías.

Esta información surge de fuentes externas oficiales de cada CCT (publicaciones del Ministerio de Trabajo, sindicatos). El sistema debe permitir cargar y mantener actualizada esta información.

Un cliente puede tener **más de un convenio activo** (ej: empresa con empleados de comercio y empleados de administración bajo diferentes CCT). Cada empleado se asigna a un convenio y un puesto dentro de ese convenio.

### 1.7 SOS Contador — Referencia de la información ya cargada

SOS Contador es el sistema donde el cliente ya tiene cargados a sus empleados. Usa rangos de conceptos propios (1-99 remunerativos, 200-299 retenciones, 400-499 no remunerativos, etc.). Esta información sirve como fuente de referencia para importar la estructura inicial del cliente.

La dificultad es que SOS Contador tiene su **propia numeración interna** que no coincide ni con los códigos AFIP ni con los `codigoContribuyente` de ARCA. Por eso el proceso de cruce es complejo y requiere una estrategia específica de matching. Ver sección 10 para el procedimiento detallado.

---

## 2. Diagnóstico del sistema actual

### 2.1 Problemas en el schema

| Elemento | Problema |
|---|---|
| `tipo` enum (`remunerativo`, `no_remunerativo`, `descuento`) | Solo 3 categorías; ARCA tiene 6 grupos con comportamientos distintos. |
| `baseCalculo` enum libre (8 opciones) | La base está determinada por el grupo del concepto, no es elección libre. |
| `esPorcentaje` boolean | Redundante con la fórmula. |
| Sin `codigoAfip` | No hay vínculo con los códigos ARCA para F931/LSD ni para agrupar en el recibo. |
| Sin `codigoContribuyente` | No se puede identificar el concepto del empleador ante ARCA. |
| Sin subsistemas | El sistema no sabe qué aportes/contribuciones afecta cada concepto. |
| Conceptos ligados solo a `clientId` | Sin vínculo con convenio: distintos convenios requieren estructuras completamente distintas. |
| `payroll_liquidacion_detalle` sin `codigoAfip` | No es posible agrupar el recibo por concepto ARCA. |
| `payroll_convenio_categoria` muy básica | No incluye tabla de vacaciones, horas de jornada, ni fuente de referencia externa. |

### 2.2 Problemas en la plantilla base actual

La plantilla `CONCEPTOS_PLANTILLA` (10 conceptos genéricos) no refleja la realidad:
- Sin `codigoAfip` ni `codigoContribuyente`.
- Sin distinción entre convenios.
- Falta la estructura completa de no-remunerativos y liquidación final.

### 2.3 Lo que NO cambia

- **Engine de fórmulas** (`src/lib/payroll-formula.ts`) — el parser y las variables siguen igual.
- **Lógica de períodos** (`src/lib/payroll-period-rules.ts`) — sin cambios.
- **Tabla** `payroll_novedad` — sin cambios estructurales.
- **Tabla** `payroll_liquidacion` — sin cambios estructurales.
- **Tabla** `payroll_employee` — sin cambios (ya tiene `convenioId` y `categoriaId`).
- **Jerarquía** `payroll_convenio` → `payroll_convenio_categoria` → `payroll_escala` — se amplía pero no se reemplaza.

---

## 3. Nuevo modelo de datos

### 3.1 Modificaciones a `payroll_concepto`

**Columnas a eliminar:**
- `baseCalculo`
- `esPorcentaje`

**Columnas a modificar:**
- `tipo` → reemplazar por `grupo` (nuevo enum)

**Columnas a agregar:**
```typescript
codigoAfip:           text (nullable)  // ej: "110000" — código ARCA fijo nacional
codigoContribuyente:  text (nullable)  // ej: "0000000001" — código del empleador en ARCA
grupo:                payroll_concepto_grupo (nuevo enum)
convenioId:           uuid FK → payroll_convenio (nullable)
                      // null = concepto global del cliente (aplica a todos los convenios)
                      // con valor = exclusivo de ese convenio
```

**Nuevo enum `payroll_concepto_grupo`:**
```
remunerativo_defecto     — rangos < 500000, todos los BI activos
no_remunerativo_puro     — 520000–529999, sin retenciones (indemnizaciones)
no_remunerativo_os       — 530000–539999, solo aportes OS + FSR
no_remunerativo_os_full  — 540000–549999, aportes + contribuciones OS + FSR
no_remunerativo_especial — 550000–559999, BI configurables individualmente
descuento                — 810000–821999, retenciones al trabajador
```

### 3.2 Modificaciones a `payroll_liquidacion_detalle`

Agregar columnas para permitir la agrupación por ARCA en el recibo:

```typescript
codigoAfip:      text (nullable)  // copia del codigoAfip del concepto al momento de la liquidación
nombreAfip:      text (nullable)  // nombre del concepto ARCA (ej: "Remuneración (sueldo, jornal)")
grupo:           text (nullable)  // copia del grupo al momento de la liquidación
```

Guardar la copia en el momento de la liquidación evita que cambios posteriores al concepto afecten recibos ya liquidados. Esta es la fuente de verdad para el recibo.

### 3.3 Nueva tabla: `payroll_concepto_subsistema`

Solo para conceptos del grupo `no_remunerativo_especial`, cuya matriz de BI es configurable:

```typescript
payrollConceptoSubsistema: {
  id:         uuid PK
  conceptoId: uuid FK → payroll_concepto (unique)
  bi1:        boolean  // Aportes SIPA/RENATEA
  bi2:        boolean  // Aportes INSSJyP
  bi3:        boolean  // Contribuciones FNE/AAFF/RENATEA
  bi4:        boolean  // Aportes OS + FSR
  bi5:        boolean  // Contribuciones INSSJyP
  bi6:        boolean  // Aportes diferenciales
  bi7:        boolean  // Aportes especiales
  bi8:        boolean  // Contribuciones OS + FSR
  bi9:        boolean  // Contribuciones LRT
}
```

Para los demás grupos la matriz es fija y se resuelve en código (no requiere DB).

### 3.4 Ampliación de `payroll_convenio`

Agregar:
```typescript
tipoConvenio:   text (nullable)  // ej: "comercio_faecys", "gastronomia", "plasticos", "construccion"
                                 // usado para vincular a la plantilla predefinida
fuenteEscala:   text (nullable)  // URL o referencia al sitio oficial de la escala salarial
descripcion:    text (nullable)  // descripcion extendida del CCT
```

### 3.5 Ampliación de `payroll_convenio_categoria` → Puestos de trabajo

Renombrar/extender para representar correctamente los puestos:

**Columnas a agregar:**
```typescript
horasMensuales:    integer (nullable)  // horas de jornada mensual para este puesto
                                       // usado para calcular valor hora
descripcion:       text (nullable)     // descripción del puesto según el CCT
```

**Nueva tabla relacionada: `payroll_puesto_vacaciones`**

Cada puesto tiene una tabla de días de vacaciones según antigüedad (varía por convenio y puesto):

```typescript
payrollPuestoVacaciones: {
  id:              uuid PK
  categoriaId:     uuid FK → payroll_convenio_categoria
  antiguedadDesde: integer  // años de antigüedad (inclusive)
  antiguedadHasta: integer (nullable)  // null = sin límite superior
  diasVacaciones:  integer  // días de vacaciones que corresponden
}
```

**Ejemplo para Convenio Comercio:**
| antiguedadDesde | antiguedadHasta | diasVacaciones |
|---|---|---|
| 0 | 4 | 14 |
| 5 | 9 | 21 |
| 10 | 19 | 28 |
| 20 | null | 35 |

**Ejemplo para Convenio Gastronomía (puede diferir):**
| antiguedadDesde | antiguedadHasta | diasVacaciones |
|---|---|---|
| 0 | 4 | 12 |
| 5 | 9 | 18 |
| 10 | null | 30 |

Esto elimina la necesidad de hardcodear las vacaciones en las fórmulas y permite que cada convenio tenga su propia regla.

### 3.6 Relación conceptos ↔ convenio

`convenioId` nullable en `payroll_concepto` define dos tipos de conceptos:
- **Globales** (`convenioId = null`): aplican a cualquier empleado del cliente independientemente de su convenio.
- **Por convenio** (`convenioId = X`): aplican solo a empleados asignados a ese convenio.

Al liquidar, el motor toma: **conceptos globales del cliente** + **conceptos del convenio del empleado**.

Esto permite que un mismo cliente con empleados en distintos convenios tenga conceptos correctamente separados sin duplicar la configuración global.

---

## 4. Flujo completo de liquidación y recibo

### 4.1 Motor de cálculo (interno)

```
Para cada empleado activo del período:
  1. Obtener basicoVigente(categoriaId, periodo)
  2. Calcular antiguedad = diferencia en años desde fechaIngreso
  3. Obtener diasVacaciones = lookup en payroll_puesto_vacaciones por (categoriaId, antiguedad)
  4. Seleccionar conceptos activos para ese período:
       - conceptos globales del cliente (convenioId IS NULL, activo=true, vigencia cubre el período)
       - conceptos del convenio del empleado (convenioId = empleado.convenioId, misma condición)
       - ordenados por el campo `orden`
  5. Para cada concepto, evaluar la fórmula con el contexto:
       { basico, antiguedad, diasVacaciones, totalRemunerativo, totalNoRemunerativo,
         totalDescuentos, neto, cantidad, valor, ... }
  6. Clasificar el monto según `grupo`:
       - remunerativo_defecto → acumular en totalRemunerativo
       - no_remunerativo_* → acumular en totalNoRemunerativo
       - descuento → acumular en totalDescuentos
  7. Guardar en payroll_liquidacion_detalle:
       - conceptoId, monto, cantidad
       - codigoAfip (copia), nombreAfip (copia del nombre ARCA), grupo (copia)
  8. Guardar en payroll_liquidacion:
       - basico, totalRemunerativo, totalNoRemunerativo, totalDescuentos, neto
```

### 4.2 Generación del recibo (vista agrupada)

El recibo **no muestra conceptos del empleador directamente**. Agrupa por `codigoAfip` y calcula el valor/porcentaje representativo para mostrarlo junto al monto.

**Query base:**
```sql
SELECT codigoAfip, nombreAfip, SUM(monto) as total, grupo
FROM payroll_liquidacion_detalle
WHERE liquidacionId = :id
GROUP BY codigoAfip, nombreAfip, grupo
ORDER BY grupo, codigoAfip
```

**Columnas que muestra el recibo por cada línea agrupada:**

| Campo | Descripción | Ejemplo |
|---|---|---|
| Código ARCA | El `codigoAfip` de la línea | `110000` |
| Nombre | El `nombreAfip` del concepto ARCA | `Remuneración (sueldo, jornal...)` |
| Valor/Porcentaje | Expresión del concepto: `%` si es porcentual, monto fijo si es importe | `11%` / `$50.000` |
| Categoría | Sección a la que pertenece | `Remunerativo` |
| Monto | Suma de todos los conceptos del empleador con ese `codigoAfip` | `$558.317` |

El **valor/porcentaje** se deriva de la fórmula del concepto:
- Si la fórmula es `totalRemunerativo * 0.11` → mostrar `11%`
- Si la fórmula es `basico * 0.01 * antiguedad` → mostrar `X%` calculado sobre el básico
- Si la fórmula es `valor` (importe fijo ingresado como novedad) → mostrar el monto directamente
- Si un `codigoAfip` agrupa varios conceptos del empleador con distintas tasas, mostrar el monto total sin porcentaje único (ya que no hay una tasa representativa unificada)

**Vista del recibo impreso:**
```
────────────────────────────────────────────────────────────
REMUNERATIVOS
  Cód.    Concepto                      Valor       Monto
  110000  Remuneración (sueldo)         —           $558.317
  120000  SAC                           1/12        $46.526
  160001  Antigüedad                    3%          $16.750
  170000  Gratificaciones               8,33%       $46.526
                              TOTAL REMUNERATIVO:   $668.119
────────────────────────────────────────────────────────────
NO REMUNERATIVOS
  Cód.    Concepto                      Valor       Monto
  540000  Incremento no remunerativo    —           $25.000
                          TOTAL NO REMUNERATIVO:    $25.000
────────────────────────────────────────────────────────────
DESCUENTOS
  Cód.    Concepto                      Valor       Monto
  810000  Sistema previsional           11%         -$73.493
  810001  INSSJyP (PAMI)                3%          -$20.043
  810002  Obra social                   3%          -$20.043
  821000  Aportes sindicales            1,5%        -$10.022
                              TOTAL DESCUENTOS:     -$123.601
────────────────────────────────────────────────────────────
                                    NETO A COBRAR:  $569.518
────────────────────────────────────────────────────────────
```

### 4.3 Vista de detalle (para el contador)

Disponible en una sección expandible del recibo o en una pestaña separada. Muestra cada concepto del empleador individualmente con:
- `codigoContribuyente` (código del empleador en ARCA)
- Nombre del concepto del empleador
- Fórmula aplicada
- Monto individual calculado

### 4.4 Gestión de activación de conceptos por período

El sistema debe permitir al contador, para cada cliente y período:
1. Ver el listado de conceptos disponibles (activos, por convenio).
2. Marcar cuáles aplican a ese período (toggle de `activo` o ajustar `vigenciaHasta`).
3. El motor de liquidación usa la vigencia para filtrar qué conceptos aplican.

**Mecanismo recomendado:** Usar `vigenciaDesde` / `vigenciaHasta` como control de activación:
- Concepto activo indefinidamente: `vigenciaDesde = fecha inicial`, `vigenciaHasta = null`.
- Concepto con vigencia limitada: `vigenciaHasta = último período vigente`.
- El sistema filtra: `vigenciaDesde <= periodo AND (vigenciaHasta IS NULL OR vigenciaHasta >= periodo)`.

Esto es más robusto que un flag `activo` simple porque preserva el histórico.

---

## 5. Plantillas reales por convenio

Reemplazar la plantilla genérica de 10 conceptos por plantillas específicas con datos reales de ARCA.

### 5.1 Plantilla: Convenio Comercio — FAECYS

#### Grupo: `remunerativo_defecto`
| codigoAfip | codigoContribuyente | Nombre | Fórmula sugerida |
|---|---|---|---|
| 110000 | 0000000001 | Sueldo mensual | `basico` |
| 110000 | 0000000027 | Dia empleado de comercio | `basico / 30` |
| 110000 | 0000000011 | Presentismo | `basico * 0.0833` |
| 110000 | 0000000103 | Dias Faltas Injustificadas | `basico / 30 * cantidad` |
| 110000 | 0000000105 | Faltas Injustificadas | `basico / 30 * cantidad` |
| 110000 | 0000000106 | Falta Injustificada | `basico / 30 * cantidad` |
| 120000 | 0000000041 | Sueldo Anual Complementario | `basico / 12` |
| 120003 | 0000000042 | SAC Proporcional | `basico / 12` |
| 130001 | 0000000017 | Horas extras 50% (s/valor hora) | `(basico / horasMensuales) * 1.5 * cantidad` |
| 130001 | 0000000021 | Horas extras 50% (s/sueldo) | `(basico / horasMensuales) * 1.5 * cantidad` |
| 130002 | 0000000022 | Horas extras 100% (s/sueldo) | `(basico / horasMensuales) * 2 * cantidad` |
| 151000 | 0000000051 | Vacaciones Gozadas | `basico / 25 * diasVacaciones` |
| 160001 | 0000000003 | Antigüedad (%) | `basico * 0.01 * antiguedad` |
| 160001 | 0000000004 | Antigüedad (Importe) | `valor` |
| 161000 | 0000000007 | Falta Justificada | `basico / 30 * cantidad` |
| 170000 | 0000000009 | Presentismo | `basico * 0.0833` |
| 170000 | 0000000019 | Presentismo | `basico * 0.0833` |

#### Grupo: `no_remunerativo_os_full`
| codigoAfip | codigoContribuyente | Nombre | Fórmula sugerida |
|---|---|---|---|
| 540000 | 0000000411 | Aumento no Rem | `valor` |
| 540000 | 0000000413 | Antigüedad - No Remunerativo | `valor` |
| 541000 | 0000000412 | Decreto 841/2022 | `valor` |
| 541000 | 0000000414 | Presentismo - No Remunerativo | `valor` |

#### Grupo: `no_remunerativo_especial`
| codigoAfip | codigoContribuyente | Nombre | Fórmula sugerida |
|---|---|---|---|
| 551000 | 0000000415 | Premio Adicional | `valor` |

#### Grupo: `no_remunerativo_puro`
| codigoAfip | codigoContribuyente | Nombre | Fórmula sugerida |
|---|---|---|---|
| 520012 | 0000000401 | Vacaciones no Gozadas | `basico / 25 * diasVacaciones` |
| 520014 | 0000000406 | Indemnizacion por despido | `valor` |
| 520015 | 0000000403 | Preaviso | `basico * cantidad` |
| 520016 | 0000000407 | Integracion Mes Despido | `valor` |
| 520017 | 0000000408 | SAC s/ Integracion o Preaviso | `valor / 12` |
| 520018 | 0000000402 | SAC s/ Vacaciones no Gozadas | `valor / 12` |

#### Grupo: `descuento`
| codigoAfip | codigoContribuyente | Nombre | Fórmula sugerida |
|---|---|---|---|
| 810000 | 0000000201 | Jubilacion | `totalRemunerativo * 0.11` |
| 810001 | 0000000202 | Ley 19032 (PAMI) | `totalRemunerativo * 0.03` |
| 810002 | 0000000203 | Obra Social | `totalRemunerativo * 0.03` |
| 810002 | 0000000502 | Acuerdos Obra Social | `valor` |
| 810004 | 0000000206 | SEC | `totalRemunerativo * 0.005` |
| 810004 | 0000000501 | Acuerdo Sindicato | `valor` |
| 821000 | 0000000207 | FAECYS | `totalRemunerativo * 0.015` |
| 821000 | 0000000209 | FAECYS | `valor` |
| 821000 | 0000000210 | FAECYS | `valor` |
| 821000 | 0000000211 | Aporte Solidario OSECAC | `totalRemunerativo * 0.005` |
| 821000 | 0000000511 | Obra social (liquidación final) | `valor` |
| 821000 | 0000000512 | FAECYS (liquidación final) | `valor` |
| 821000 | 0000000513 | SEC (liquidación final) | `valor` |
| 821001 | 0000000503 | Acuerdos Federaciones y Otros | `valor` |

#### Tabla de vacaciones Comercio (por defecto):
| Desde | Hasta | Días |
|---|---|---|
| 0 | 4 | 14 |
| 5 | 9 | 21 |
| 10 | 19 | 28 |
| 20 | — | 35 |

### 5.2 Plantilla: Convenio Genérico (basada en CUIT 30716135124)

Para empresas con estructuras más simples. Se completa con los conceptos mínimos y sirve como base para convenios sin plantilla específica.

#### Grupo: `remunerativo_defecto`
| codigoAfip | codigoContribuyente | Nombre | Fórmula sugerida |
|---|---|---|---|
| 110000 | 0000000001 | Sueldo Basico | `basico` |
| 120000 | 0000000041 | Sueldo Anual Complementario | `basico / 12` |
| 130001 | 0000000017 | Horas Extras 50% | `(basico / horasMensuales) * 1.5 * cantidad` |
| 151000 | 0000000051 | Vacaciones Gozadas | `basico / 25 * diasVacaciones` |
| 160001 | 0000000003 | Antigüedad (%) | `basico * 0.01 * antiguedad` |
| 170000 | 0000000019 | Presentismo | `basico * 0.0833` |

#### Grupo: `no_remunerativo_puro`
| codigoAfip | codigoContribuyente | Nombre | Fórmula sugerida |
|---|---|---|---|
| 520012 | 0000000401 | Vacaciones no Gozadas | `basico / 25 * diasVacaciones` |
| 520014 | 0000000406 | Indemnizacion por despido | `valor` |
| 520015 | 0000000403 | Preaviso | `basico * cantidad` |

#### Grupo: `descuento`
| codigoAfip | codigoContribuyente | Nombre | Fórmula sugerida |
|---|---|---|---|
| 810000 | 0000000201 | Jubilacion | `totalRemunerativo * 0.11` |
| 810001 | 0000000202 | Ley 19032 (PAMI) | `totalRemunerativo * 0.03` |
| 810002 | 0000000203 | Obra Social | `totalRemunerativo * 0.03` |
| 810002 | 0000000502 | Acuerdos Obra Social | `valor` |

### 5.3 Plantillas a desarrollar (con datos pendientes)

| Convenio | Estado | Fuente de datos |
|---|---|---|
| Gastronomía | Pendiente | Archivos ARCA del cliente correspondiente |
| Pasteleros | Pendiente | Archivos ARCA del cliente correspondiente |
| Plásticos | Pendiente | Archivos ARCA del cliente correspondiente |
| Construcción | Pendiente | Archivos ARCA del cliente correspondiente |

La estructura de cada plantilla sigue el mismo formato. Solo cambian los `codigoContribuyente`, nombres, fórmulas y tabla de vacaciones.

---

## 6. Puestos de trabajo: carga y mantenimiento

### 6.1 Origen de los datos

Los puestos de trabajo y las escalas salariales son información **pública** que surge de:
- Resoluciones del Ministerio de Trabajo de la Nación.
- Publicaciones de los sindicatos de cada CCT.
- Sitios web oficiales de cada federación (ej: FAECYS para Comercio, UTHGRA para Gastronomía).

**Esta información cambia** con cada ronda de paritarias (generalmente anual o semestral).

### 6.2 Proceso de carga inicial

Para cada convenio nuevo que se configure:
1. Ingresar a la fuente oficial del CCT.
2. Cargar los puestos de trabajo de ese convenio en `payroll_convenio_categoria`.
3. Cargar la escala salarial vigente en `payroll_escala` con su `vigenciaDesde`.
4. Cargar la tabla de vacaciones en `payroll_puesto_vacaciones`.
5. Aplicar la plantilla de conceptos del convenio.

### 6.3 Proceso de actualización (paritarias)

Cuando se actualiza la escala salarial por paritarias:
1. No se modifica la escala existente.
2. Se agrega un nuevo registro en `payroll_escala` con la nueva `vigenciaDesde`.
3. El motor usa automáticamente el valor vigente para cada período.

Cuando se modifica algún concepto por decreto (ej: decreto de incremento NR):
1. Se crea el nuevo concepto con `vigenciaDesde = primer período de aplicación`.
2. Si el decreto tiene fecha de vencimiento, se pone `vigenciaHasta`.
3. No se modifica el concepto anterior.

### 6.4 Revisión semanal de portales de convenios

Los convenios colectivos no se actualizan con alta frecuencia, pero sus cambios dependen de decisiones del gobierno y de las paritarias, que pueden ocurrir en cualquier momento. Para no quedar desactualizados, se establece una **revisión manual semanal** de las fuentes oficiales habilitadas.

#### Cadencia y proceso

- **Frecuencia**: una vez por semana (por ahora; ajustar según la actividad paritaria del momento).
- **Responsable**: el estudio contable o un operador designado.
- **Acción**: ingresar a los portales de referencia de cada convenio activo, verificar si hay nuevas escalas, resoluciones o novedades, y cargar las actualizaciones en el sistema.

#### Portales de referencia habilitados por convenio

| Convenio | Portal principal | Fuente alternativa |
|---|---|---|
| Comercio (FAECYS) | faecys.org.ar | Boletín Oficial (boletinoficial.gob.ar) |
| Gastronomía (UTHGRA) | uthgra.org.ar | Ministerio de Trabajo (trabajo.gob.ar) |
| Pasteleros | pasteleros.org.ar | Boletín Oficial |
| Plásticos | aplastic.com.ar / sindicato correspondiente | Boletín Oficial |
| Construcción (UOCRA) | uocra.org | Boletín Oficial |
| Genérico / Sin sindicato | trabajo.gob.ar | Boletín Oficial |

> **Nota**: Estos portales deben verificarse y actualizarse cuando se incorporen nuevos convenios. Algunos sindicatos publican las escalas con demora respecto al BOE (Boletín Oficial del Estado).

#### Formato de la información

La información puede presentarse en distintos formatos según el portal:

- **Tabla HTML** en el sitio del sindicato: se pueden copiar los valores directamente al sistema.
- **PDF** de resolución o acuerdo: requiere lectura manual del documento para extraer los valores.
- **Resolución en Boletín Oficial**: generalmente en PDF; incluye fecha de vigencia, categorías y montos.

El sistema debe facilitar la carga en ambos casos:
- Para tablas: formulario de carga directa de escala con múltiples filas (una por categoría/puesto).
- Para PDFs: en el futuro, se puede incorporar el parser de Gemini AI (ya disponible en el proyecto mediante `GEMINI_API_KEY`) para extraer automáticamente los valores del PDF y pre-cargarlos en el formulario para revisión.

#### Registro de la última revisión

Agregar en `payroll_convenio` un campo `ultimaRevision: timestamp (nullable)` que se actualiza cada vez que el operador revisa la información, aunque no haya cambios. Esto permite auditar si la revisión se está realizando y cuándo fue la última vez que se verificó cada convenio.

```typescript
// En payroll_convenio:
ultimaRevision: timestamp (nullable)  // fecha de la última revisión manual del portal
notasRevision:  text (nullable)       // observaciones de la revisión (ej: "sin cambios", "nueva escala marzo 2026")
```

En la UI de convenios, mostrar un indicador de estado de revisión:
- 🟢 Revisado hace menos de 7 días
- 🟡 Revisado hace más de 7 días
- 🔴 Sin revisión registrada o hace más de 14 días

### 6.5 Futura automatización (scraping)

A futuro, la actualización de escalas podría automatizarse mediante un job de scraping similar al del scrapper de ARCA, complementado con el parser de Gemini para PDFs. Por ahora la carga es manual y el sistema debe facilitar la comparación de valores vigentes vs. los nuevos antes de confirmar la actualización.

---

## 7. Cambios en Server Functions (`src/actions/sueldos.ts`)

### 7.1 `createConcepto` / `updateConcepto`
- Reemplazar `tipo`, `baseCalculo`, `esPorcentaje` por `grupo`, `codigoAfip`, `codigoContribuyente`, `convenioId`.
- Si `grupo = no_remunerativo_especial`: crear/actualizar registro en `payroll_concepto_subsistema`.

### 7.2 `listConceptos`
- Agregar filtros: `convenioId` (incluyendo opción de traer globales), `grupo`.
- Incluir en la respuesta si el concepto es global o de convenio.
- Incluir el `nombreAfip` derivado del catálogo estático.

### 7.3 `aplicarPlantillaBaseSueldos`
- Recibir `tipoConvenio` para seleccionar la plantilla correcta.
- Incluir en cada concepto: `codigoAfip`, `codigoContribuyente`, `grupo`, `convenioId`.
- Insertar también la tabla de vacaciones inicial para cada categoría del convenio.

### 7.4 `calcularUnaLiquidacion` (cambios clave)
- Consultar `diasVacaciones` desde `payroll_puesto_vacaciones` según categoría y antigüedad del empleado.
- Agregar `diasVacaciones` al contexto de evaluación de fórmulas.
- Agregar `horasMensuales` al contexto (desde `payroll_convenio_categoria`).
- Filtrar conceptos por vigencia del período, no solo por `activo`.
- Seleccionar: conceptos globales + conceptos del convenio del empleado.
- Al guardar `payroll_liquidacion_detalle`: incluir `codigoAfip`, `nombreAfip`, `grupo` (copias).

### 7.5 `getReciboDetalle` (cambio de comportamiento)
- Nuevo modo `agrupado`: retorna conceptos agrupados por `codigoAfip` con suma de montos → para el recibo impreso.
- Modo `detalle` (existente): retorna cada línea individualmente → para la vista del contador.

### 7.6 `getSubsistemasForConcepto` (nueva)
- Dado un `conceptoId`: retorna la matriz de BI activos.
- Si `grupo != no_remunerativo_especial`: retorna la matriz fija del código.
- Si `grupo = no_remunerativo_especial`: consulta `payroll_concepto_subsistema`.

### 7.7 Nuevas funciones para puestos
- `listPuestosByConvenio(convenioId)`: lista puestos con horas mensuales.
- `upsertPuestoVacaciones(categoriaId, tabla[])`: carga/actualiza la tabla de vacaciones.
- `getDiasVacacionesByPuesto(categoriaId, antiguedad)`: retorna días para un empleado.
- `getFuenteEscala(convenioId)`: retorna la URL/referencia de la fuente oficial.

---

## 8. Cambios en la UI

### 8.1 `SueldosConceptos.tsx`

**Formulario:**
- Selector "Grupo ARCA" (6 opciones con descripción).
- Campo "Código AFIP" con autocomplete desde el catálogo estático.
- Campo "Código Contribuyente".
- Selector "Convenio" (o "Todos / Global").
- Tabla de solo lectura de subsistemas activos para el grupo elegido.
- Para `no_remunerativo_especial`: checkboxes editables de BI 1-9 con validación de pares.
- Campos `vigenciaDesde` / `vigenciaHasta` con descripción clara: "Período de aplicación".

**Listado:**
- Filtro por Grupo ARCA.
- Filtro por Convenio.
- Indicador visual: "Global" vs nombre del convenio.
- Columna mostrando el nombre ARCA correspondiente al `codigoAfip`.
- Badge de vigencia: activo / con vencimiento / vencido.

**Explicador de fórmula:**

Cada concepto debe mostrar, además de la fórmula técnica, una **descripción en lenguaje natural** que explique qué calcula. El objetivo es que el contador entienda de un vistazo la lógica sin tener que interpretar la fórmula.

La descripción se genera automáticamente a partir de la fórmula reconociendo patrones, o puede ser escrita manualmente por el usuario. Si existe una descripción manual, tiene prioridad.

Ejemplos de traducción automática:

| Fórmula | Descripción legible |
|---|---|
| `basico` | Sueldo básico del puesto según escala vigente |
| `basico * 0.01 * antiguedad` | 1% del básico por cada año de antigüedad |
| `basico * 0.0833` | 8,33% del básico (equivale a 1/12) |
| `totalRemunerativo * 0.11` | 11% sobre el total remunerativo acumulado |
| `totalRemunerativo * 0.03` | 3% sobre el total remunerativo acumulado |
| `(basico / horasMensuales) * 1.5 * cantidad` | Valor hora × 1,5 × cantidad de horas extra al 50% |
| `basico / 25 * diasVacaciones` | Básico ÷ 25 × días de vacaciones por antigüedad |
| `valor` | Importe fijo ingresado como novedad del período |
| `valor / 12` | Importe fijo dividido en 12 (proporcional mensual) |

En la vista de detalle de cada concepto se incluye una **tabla de referencia de variables** disponibles en las fórmulas:

| Variable | Qué representa |
|---|---|
| `basico` | Sueldo básico del puesto según escala vigente |
| `antiguedad` | Años completos de antigüedad del empleado |
| `diasVacaciones` | Días que corresponden según tabla del puesto y antigüedad |
| `horasMensuales` | Horas mensuales de jornada del puesto |
| `totalRemunerativo` | Suma de conceptos remunerativos calculados hasta ese punto |
| `totalNoRemunerativo` | Suma de conceptos no remunerativos calculados hasta ese punto |
| `totalDescuentos` | Suma de descuentos calculados hasta ese punto |
| `cantidad` | Valor numérico de la novedad del período (ej: horas extra, días) |
| `valor` | Importe monetario de la novedad del período |

Esta tabla se muestra como tooltip o panel de ayuda en el campo de fórmula del formulario.

### 8.2 `SueldosConvenios.tsx`

**Vista del convenio:**
- Pestaña "Puestos" mostrando categorías con horas mensuales y fuente de referencia.
- Pestaña "Conceptos" mostrando los conceptos vinculados a ese convenio.
- Pestaña "Vacaciones" mostrando la tabla de días por antigüedad, editable.
- Botón "Aplicar plantilla" para cargar los conceptos predefinidos del tipo de convenio.
- Campo `fuenteEscala` (URL) editable para registrar la fuente oficial de la escala.

### 8.3 `SueldosRecibo.tsx`

**Modo agrupado (recibo impreso — vista ARCA):**
- Secciones separadas: Remunerativos / No Remunerativos / Descuentos.
- Cada línea: nombre del concepto ARCA + total agrupado.
- Expandible: al hacer clic en una línea, muestra el detalle de conceptos del empleador que la componen.

**Modo detalle (vista interna del contador):**
- Listado de todos los conceptos del empleador individualmente.
- Incluye: código contribuyente, nombre, monto, codigoAfip de referencia.

### 8.4 `SueldosSimulador.tsx`

- Prevista del recibo en modo agrupado (igual que el recibo final).
- Panel lateral colapsable con el detalle de conceptos individuales.
- Indicador de vigencia de cada concepto para el período simulado.

### 8.5 Filtros generales

Toda vista del módulo de sueldos debe filtrar siempre por:
1. **Empresa** (cliente) — ya existe.
2. **Convenio** — agregar en Conceptos, Empleados, Simulador.
3. **Período** — ya existe.

---

## 9. Catálogo AFIP estático

Los 116 códigos AFIP se definen como constante en `src/lib/payroll-afip-codes.ts`. Este catálogo:
- Se usa como referencia/autocomplete al cargar conceptos.
- Provee el `nombreAfip` que se copia en `payroll_liquidacion_detalle`.
- No va a base de datos (es inmutable a nivel nacional).

```typescript
export const CONCEPTOS_AFIP: Record<string, string> = {
  "110000": "Remuneración (sueldo, jornal, etc.)",
  "120000": "SAC primer cuota",
  "120003": "SAC proporcional",
  "130001": "Horas extras 50%",
  "130002": "Horas extras 100%",
  "130003": "Horas extras 200%",
  "151000": "Vacaciones",
  "160001": "Antigüedad",
  "170000": "Gratificaciones",
  "520012": "Vacaciones no gozadas",
  "520014": "Indemnización por despido",
  "520015": "Preaviso",
  "520016": "Integración mes de despido",
  "520017": "SAC sobre preaviso / integración",
  "520018": "SAC sobre vacaciones no gozadas",
  "530000": "Incremento no remunerativo (con aportes OS)",
  "540000": "Incremento no remunerativo (con aportes y contrib. OS)",
  "541000": "Incremento no remunerativo especial",
  "551000": "Monto especial no remunerativo",
  "810000": "Sistema previsional (SIPA)",
  "810001": "INSSJyP (PAMI / Ley 19.032)",
  "810002": "Obra social",
  "810004": "Cuota sindical",
  "821000": "Aportes sindicales adicionales",
  "821001": "Acuerdos federaciones y otros",
  // ... completar con los 116 códigos
};
```

---

## 10. Importación desde archivo ARCA (`Conceptos_Contribuyente`)

### 10.1 Por qué es necesaria

Las plantillas del sistema son puntos de partida basados en los CUITs analizados. Pero cada cliente tiene su propio archivo `Conceptos_Contribuyente_{CUIT}_*.txt` exportado de ARCA, que contiene **sus códigos reales** (`codigoContribuyente`) con sus nombres y el vínculo al `codigoAfip` correspondiente.

Sin importar ese archivo, el cliente tendría que cargar manualmente cada concepto y asignar sus códigos a mano — propenso a errores y muy lento.

### 10.2 Formato del archivo ARCA

El archivo tiene el siguiente formato CSV con punto y coma:

```
Código AFIP;Descripción AFIP;Código contribuyente;Descripción contribuyente;Marca repetible;Aportes SIPA;Contribuciones SIPA;Aportes INSSJyP;...
110000;Remuneración (sueldo, jornal...);0000000001;Sueldo Basico;N;S;S;S;...
110000;Remuneración (sueldo, jornal...);0000000011;Presentismo;N;S;S;S;...
160001;Antigüedad;0000000003;Antigüedad %;N;S;S;S;...
810000;Sistema previsional;0000000201;Jubilacion;N;N;N;N;...
```

Contiene toda la información necesaria para pre-cargar los conceptos del empleador: código AFIP, nombre ARCA, código contribuyente, nombre del concepto y la matriz de subsistemas.

### 10.3 Procedimiento de importación

El sistema debe ofrecer una funcionalidad de **importación desde archivo** en la configuración del cliente:

1. **Subir el archivo** `Conceptos_Contribuyente_{CUIT}.txt` mediante un input de archivo en la UI.
2. **Parsear el CSV**: separar por `;`, leer columnas por posición.
3. **Determinar el grupo** de cada concepto a partir del rango del `codigoAfip`:
   - < 500000 → `remunerativo_defecto`
   - 520000–529999 → `no_remunerativo_puro`
   - 530000–539999 → `no_remunerativo_os`
   - 540000–549999 → `no_remunerativo_os_full`
   - 550000–559999 → `no_remunerativo_especial`
   - 810000–821999 → `descuento`
4. **Detectar duplicados**: si ya existe un concepto con el mismo `codigoContribuyente` para ese cliente, preguntar si actualizar o saltar.
5. **Previsualización**: mostrar una tabla con los conceptos a importar antes de confirmar.
6. **Confirmar**: insertar en `payroll_concepto` con `clientId`, `codigoAfip`, `codigoContribuyente`, `grupo`, nombre, y el `convenioId` correspondiente (si el usuario lo especifica antes de importar).
7. **Resultado**: mostrar cuántos se importaron, cuántos se omitieron (duplicados) y cuántos fallaron.

### 10.4 Importancia de la vinculación al convenio

Al importar, el usuario debe indicar a qué convenio pertenecen los conceptos del archivo (o "global"). El mismo archivo puede corresponder a una empresa con un solo convenio o con varios. Si hay varios convenios, el proceso se repite con el archivo de cada CUIT/convenio por separado.

### 10.5 Server function recomendada

```typescript
export const importarConceptosDesdeArca = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    clientId:   z.string().uuid(),
    convenioId: z.string().uuid().nullable(),
    contenido:  z.string(),  // contenido del archivo txt como string
    modo:       z.enum(["omitir_duplicados", "actualizar_duplicados"]),
  }))
  .handler(async (ctx) => {
    // 1. Parsear CSV
    // 2. Por cada fila: determinar grupo, crear/actualizar concepto
    // 3. Retornar { importados, omitidos, errores }
  });
```

---

## 11. Migración desde SOS Contador — proceso único

### 11.1 Contexto y alcance

SOS Contador es el sistema que usa actualmente el estudio contable para gestionar las liquidaciones de sus clientes. Toda la información relevante (empleados, convenios, conceptos, escalas) ya está cargada allí.

**El objetivo es una migración única**: extraer esa información e ingresarla en nuestro sistema. Una vez completada la migración, SOS Contador deja de ser referencia activa — no se requiere sincronización continua, trabajo periódico de recopilación ni integración en curso.

El desafío es que SOS Contador tiene su propia numeración interna (códigos del 1 al ~600) que **no corresponde** ni a los códigos AFIP ni a los `codigoContribuyente` de ARCA. Los mismos conceptos pueden tener:

| Concepto | Código SOS | Código AFIP | codigoContribuyente ARCA |
|---|---|---|---|
| Sueldo básico | `1` | `110000` | `0000000001` (empresa A) / `20` (empresa B) |
| Presentismo | `11` | `110000` o `170000` | `0000000011` (empresa A) / `5` (empresa B) |
| Jubilación | `201` | `810000` | `0000000201` (empresa A) / `100` (empresa B) |

SOS tiene su lógica de clasificación propia:
- Conceptos 1–99: remunerativos
- Conceptos 100–199: descuentos por ausencias / ajustes
- Conceptos 200–299: retenciones (jubilación, OS, sindicato)
- Conceptos 400–499: no remunerativos
- Conceptos 500–599: retenciones sobre no remunerativos

Esto es análogo a la clasificación ARCA (grupos), pero los números son diferentes y la granularidad también.

### 11.2 Estrategia de matching

El objetivo es: para cada concepto de SOS Contador del cliente, encontrar su equivalente en `payroll_concepto` (ya importado desde ARCA) y vincularlos. De esta forma, cuando se migra información de SOS al sistema, cada concepto queda correctamente mapeado.

**Pasos del proceso:**

**Paso 1 — Clasificación por rango SOS → grupo ARCA**

Como primer filtro, usar el rango del código SOS para acotar el grupo probable:

| Rango SOS | Grupo ARCA probable |
|---|---|
| 1–99 | `remunerativo_defecto` |
| 100–199 | `remunerativo_defecto` (ajustes negativos) o `descuento` |
| 200–299 | `descuento` |
| 400–499 | `no_remunerativo_puro` o `no_remunerativo_os_full` |
| 500–599 | `descuento` (sobre no remunerativo) |

Esto reduce el universo de candidatos para el match.

**Paso 2 — Matching por nombre (similitud)**

Comparar el nombre del concepto SOS con los nombres de los conceptos del empleador ya cargados desde ARCA:

- Match exacto (insensible a mayúsculas/tildes): vincular automáticamente.
- Match parcial (ej: "Presentismo" ↔ "Presentismo - No Remunerativo"): marcar como sugerencia, requiere confirmación del usuario.
- Sin match: marcar como "sin equivalente", el usuario lo resuelve manualmente.

**Paso 3 — Confirmación manual**

El sistema presenta al usuario una tabla de tres columnas:

| Concepto SOS | Candidato ARCA sugerido | Acción |
|---|---|---|
| `11 - Presentismo` | `Presentismo (170000 / 0000000011)` ✓ match exacto | Vincular |
| `201 - Jubilación` | `Jubilacion (810000 / 0000000201)` ✓ match exacto | Vincular |
| `15 - Premio producción` | — sin match — | Crear nuevo concepto |
| `3 - Antigüedad %` | `Antigüedad (%) (160001 / 0000000003)` ~ similitud | Confirmar / Cambiar |

El usuario puede aceptar sugerencias, cambiarlas o decidir crear un concepto nuevo.

**Paso 4 — Guardar el vínculo**

Agregar en `payroll_concepto` una columna opcional `codigoSos: text (nullable)` que guarda el código interno de SOS Contador. Esto permite:
- Migrar datos históricos de SOS al sistema.
- Comparar liquidaciones entre ambos sistemas.
- Identificar si un concepto ya fue importado desde SOS en futuras actualizaciones.

### 11.3 Modificación del schema para el vínculo SOS

```typescript
// En payroll_concepto:
codigoSos: text (nullable)  // código interno de SOS Contador (ej: "11", "201")
                             // solo para referencia/migración, no se usa en cálculos
```

### 11.4 UI del proceso de migración

Una pantalla/wizard de **uso único** para la migración inicial, accesible desde la configuración del cliente:

1. **Paso 1**: Ingresar la lista de conceptos de SOS Contador (subir archivo si hay export, o completar la tabla manualmente desde las pantallas del sistema).
2. **Paso 2**: El sistema ejecuta el matching automático y muestra la tabla de resultados.
3. **Paso 3**: El usuario revisa, confirma o corrige cada vínculo.
4. **Paso 4**: Confirmar → guarda los `codigoSos` en los registros correspondientes y marca la migración como completada.

Una vez confirmada la migración, el wizard no vuelve a mostrarse a menos que se reinicie manualmente.

### 11.5 Limitaciones del matching automático

- SOS Contador **no exporta un archivo estándar** de conceptos (a diferencia de ARCA). La lista de conceptos se obtiene del manual o de pantallas del sistema.
- El matching por nombre tiene una tasa de éxito alta en conceptos genéricos (jubilación, obra social, presentismo) pero baja en conceptos específicos de cada empresa.
- La migración se ejecuta **una sola vez**. No es un proceso periódico ni requiere mantenimiento posterior.

---

## 12. Orden de ejecución

```
Fase 1 — Catálogo AFIP estático
  → src/lib/payroll-afip-codes.ts (nueva constante con los 116 códigos)

Fase 2 — Schema de base de datos
  → drizzle/schema.ts:
      · Nuevo enum payroll_concepto_grupo
      · Modificar payroll_concepto: nuevo grupo, codigoAfip, codigoContribuyente, convenioId, codigoSos
                                     eliminar baseCalculo, esPorcentaje
      · Modificar payroll_liquidacion_detalle: agregar codigoAfip, nombreAfip, grupo
      · Nueva tabla payroll_concepto_subsistema
      · Ampliar payroll_convenio: tipoConvenio, fuenteEscala, descripcion
      · Ampliar payroll_convenio_categoria: horasMensuales, descripcion
      · Nueva tabla payroll_puesto_vacaciones
  → bun run db:push

Fase 3 — Plantillas por convenio
  → src/actions/sueldos.ts: reemplazar CONCEPTOS_PLANTILLA por plantillas con datos reales
  → Incluir tabla de vacaciones por convenio

Fase 4 — Server functions (backend puro)
  → Actualizar createConcepto, updateConcepto, listConceptos
  → Actualizar aplicarPlantillaBaseSueldos
  → Agregar getSubsistemasForConcepto
  → Agregar funciones de puestos y vacaciones
  → Agregar importarConceptosDesdeArca (parseo del archivo Conceptos_Contribuyente)
  → Agregar matchConceptosSos (matching SOS ↔ codigoContribuyente)
  → Actualizar calcularUnaLiquidacion (diasVacaciones, horasMensuales, copiado de codigoAfip)
  → Actualizar getReciboDetalle (modo agrupado + modo detalle)

Fase 5 — UI: Formulario de conceptos
  → SueldosConceptos.tsx: nuevo formulario, filtros, badges, campo vigencia

Fase 6 — UI: Convenios y puestos
  → SueldosConvenios.tsx: pestañas de puestos, conceptos y vacaciones

Fase 7 — UI: Recibo agrupado
  → SueldosRecibo.tsx: vista agrupada por ARCA + expandible con detalle
  → SueldosSimulador.tsx: previsualización consistente con el recibo

Fase 8 — UI: Importación desde ARCA
  → Dialog de importación del archivo Conceptos_Contribuyente (subir archivo, previsualizar, confirmar)

Fase 9 — UI: Migración desde SOS Contador (ejecución única)
  → Wizard de migración (ingresar conceptos SOS, tabla de sugerencias automáticas, confirmar/corregir, marcar como completado)

Fase 10 — Variables de fórmula
  → src/lib/payroll-formula.ts: agregar diasVacaciones y horasMensuales al contexto
```

Las fases 1–4 son backend puro y pueden desarrollarse en paralelo a las UI. Las fases 8–9 son flujos de onboarding y pueden implementarse después del core del sistema.

---

## 13. Resumen de cambios por archivo

| Archivo | Tipo | Descripción |
|---|---|---|
| `drizzle/schema.ts` | Modificar | Nuevo enum, modificar payroll_concepto (+ codigoSos, descripcion) y payroll_liquidacion_detalle, nuevas tablas subsistema y puesto_vacaciones, ampliar convenio (+ ultimaRevision, notasRevision) y categoria |
| `src/actions/sueldos.ts` | Modificar | Plantillas por convenio, server functions actualizadas, importarConceptosDesdeArca, matchConceptosSos, motor de liquidación y recibo agrupado |
| `src/lib/payroll-afip-codes.ts` | Crear | Catálogo estático de 116 códigos AFIP |
| `src/lib/payroll-formula.ts` | Modificar (menor) | Agregar `diasVacaciones` y `horasMensuales` al contexto de variables |
| `src/components/sueldos/SueldosConceptos.tsx` | Modificar | Formulario rediseñado, filtros, vigencia, nombre ARCA, badge de codigoSos vinculado |
| `src/components/sueldos/SueldosConvenios.tsx` | Modificar | Pestañas de puestos, vacaciones y conceptos del convenio |
| `src/components/sueldos/SueldosRecibo.tsx` | Modificar | Vista agrupada por ARCA + expandible con detalle del empleador |
| `src/components/sueldos/SueldosSimulador.tsx` | Modificar | Previsualización agrupada + panel de detalle |
| `src/components/sueldos/ImportarConceptosDialog.tsx` | Crear | Dialog de importación del archivo Conceptos_Contribuyente de ARCA |
| `src/components/sueldos/MigracionSosWizard.tsx` | Crear | Wizard de migración única desde SOS Contador: matching de conceptos, confirmación y cierre del proceso |
