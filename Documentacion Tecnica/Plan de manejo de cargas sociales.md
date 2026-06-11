# Plan de Manejo de Cargas Sociales

**Fecha:** 2026-05-14 (última actualización: 2026-06-08)
**Estado:** Implementado y validado contra archivo de referencia — pendiente envío a AFIP

---

## 1. Qué se hizo

Se realizó una investigación comparativa entre el sistema SOS Contador y la plataforma Arca para entender cómo se generan los archivos TXT de cargas sociales (LSD — Libro de Sueldos Digital) que se presentan ante AFIP.

### 1.1 Fuente de referencia

Se trabajó con la empresa **E-presis S.A. (CUIT 30717554864)** cargada en SOS Contador. Se descargaron dos archivos del módulo Sueldos → Recibos, período Abril 2026:

- **`conceptosLSD.txt`** — generado con el botón "Conceptos LSD"
- **`30-71755486-4_2026-4_0_.txt`** — generado con el botón "Liquidación LSD"

Ambos archivos fueron analizados en detalle para mapear su formato y contrastar con los datos disponibles en nuestra base de datos.

---

## 2. A qué apunta esto

### 2.1 Objetivo funcional

Que el contador pueda generar los dos archivos TXT requeridos por AFIP (conceptos y liquidación) directamente desde Arca, con **un solo botón**, sin necesidad de abrir SOS Contador.

Estos archivos son los que se importan en el aplicativo LSD de AFIP para liquidar las cargas sociales (aportes y contribuciones) de los empleados de cada período.

### 2.2 Impacto

- Eliminar la dependencia de SOS Contador para el paso de exportación LSD
- Mantener todo el flujo de liquidación de sueldos dentro de Arca
- Reducir errores de doble carga de datos entre sistemas

---

## 3. Investigación: formato de los archivos

### 3.1 Archivo `conceptosLSD.txt`

Catálogo de los conceptos salariales que usa la empresa, con sus configuraciones de cargas.

#### Formato de cada línea

```
[NRO 6 chars]→[CODIGO_AFIP 16 chars][DESCRIPCION padded ~150 chars][FLAGS ~20 chars]
```

**Ejemplo real:**
```
     1→1100000000000001Sueldo Basico                             11111111111 1 1 10 0
     5→5400000000000411No Rem Acuerdo                            10000111100 0 0 00 0
     9→8100000000000201Jubilacion                                10000000000 0 0 00 0
```

#### Código AFIP (16 chars después de `→`)

Estructura del bloque de 16 caracteres:
- **Posiciones 1-2:** Tipo de concepto AFIP

| Código | Tipo |
|---|---|
| `11` | Haber remunerativo habitual (básico, hs extra, etc.) |
| `15` | Vacaciones |
| `16` | Antigüedad |
| `17` | Presentismo / otros rem |
| `54` | No remunerativo |
| `81` | Descuento del trabajador (aportes empleado) |
| `82` | Retención / descuento de terceros |

- **Posiciones 3-12:** Código interno (subcategoría dentro del tipo, valores como `0000000000`, `1000000000`, `0001000000`). Semántica exacta a confirmar con spec AFIP. Parecen ser un índice de orden dentro del tipo.
- **Posiciones 13-16:** Código SOS zero-padded a 4 dígitos (ej: SOS `001` → `0001`, SOS `201` → `0201`)

#### Descripción

Nombre del concepto paddeado con espacios hasta ~150 chars. Debe ir en ASCII sin tildes ni ñ (SOS escapa las tildes como entidades HTML).

#### Flags de cargas sociales (bloque final)

El bloque de flags codifica los booleanos de cargas en formato de bits separados por espacios:

```
AAAAAAAAAAA B C DE F
```

| Posición | Flag | Campo en BD (`lsdPerfilConcepto`) |
|---|---|---|
| 1 | Aportes SIPA | `aportesSipa` |
| 2 | Contribuciones SIPA | `contribucionesSipa` |
| 3 | Aportes INSSJyP | `aportesInssjyp` |
| 4 | Contribuciones INSSJyP | `contribucionesInssjyp` |
| 5 | Aportes Obra Social | `aportesObraSocial` |
| 6 | Contribuciones Obra Social | `contribucionesObraSocial` |
| 7 | Aportes FSR | `aportesFsr` |
| 8 | Contribuciones FSR | `contribucionesFsr` |
| 9 | Aportes RENATEA | `aportesRenatea` |
| 10 | Contribuciones RENATEA | `contribucionesRenatea` |
| 11 | Contribuciones AAFF | `contribucionesAaff` |
| 13 (sep.) | Contribuciones FNE | `contribucionesFne` |
| 15 (sep.) | Contribuciones LRT | `contribucionesLrt` |
| 17 (sep.) | Aportes Diferenciales | `aportesDiferenciales` |
| 18 (sep.) | Aportes Especiales | `aportesEspeciales` |
| 20 (sep.) | Marca Repetible | `marcaRepetible` |

**Validación con datos reales de E-presis:**

| Concepto | Flags generados | Lógica |
|---|---|---|
| Sueldo Básico | `11111111111 1 1 10 0` | Todos los aportes y contrib. activos |
| No Rem Acuerdo | `10000111100 0 0 00 0` | Solo aportesSipa + OS + FSR |
| Jubilación | `10000000000 0 0 00 0` | Solo aportesSipa (ya es el aporte en sí) |

#### Conceptos de E-presis observados

| Nro | Tipo AFIP | Código SOS | Descripción |
|---|---|---|---|
| 1 | 11 (rem) | 001 | Sueldo Basico |
| 2 | 15 (vac) | 051 | Vacaciones Gozadas |
| 3 | 16 (antig) | 003 | Antiguedad (%) |
| 4 | 17 (pres) | 019 | Presentismo |
| 5 | 54 (no rem) | 411 | No Rem Acuerdo |
| 6 | 54 (no rem) | 413 | Antiguedad - No Remunerativo |
| 7 | 54 (no rem) | 412 | Recomposicion No Rem Acuerdo Abril 2026 |
| 8 | 54 (no rem) | 414 | Presentismo - No Remunerativo |
| 9 | 81 (desc) | 201 | Jubilacion |
| 10 | 81 (desc) | 202 | Ley 19032 |
| 11 | 81 (desc) | 203 | Obra Social |
| 12 | 81 (desc) | 502 | Acuerdos Obra Social |
| 13 | 81 (desc) | 206 | SEC |
| 14 | 81 (desc) | 501 | Acuerdo Sindicato |
| 15 | 82 (reten) | 207 | FAECYS |
| 16 | 82 (reten) | 209 | FAECYS |
| 17 | 82 (reten) | 211 | Aporte Solidario Osecac |
| 18 | 82 (reten) | 503 | Acuerdos Federaciones y Otros |

---

### 3.2 Archivo Liquidación LSD (`{CUIT}_{AÑO}_{MES}_{QUINCENA}_.txt`)

Registro con una línea por empleado por período. Contiene los datos identificatorios del empleado y todos los importes de haberes, aportes y contribuciones del mes.

#### Nombre del archivo

Formato: `{CUIT_con_guiones}_{AÑO}-{MES}_{QUINCENA}_.txt`

Ejemplo: `30-71755486-4_2026-4_0_.txt`
- CUIT `30717554864` → `30-71755486-4`
- Año `2026`, Mes `4` (Abril), Quincena `0` (mes completo)

#### Campos identificados en el formato de línea

Formato fijo, ~350-400 caracteres por empleado.

| Campo | Ancho | Ejemplo (Gonzalez) | Fuente en BD |
|---|---|---|---|
| CUIL | 11 | `27295946356` | `liquidacionImportEmpleado.cuil` |
| Apellido y Nombres | 30 | `GONZALEZ SILVANA ISABEL       ` | `.nombre` (padded, sin tildes) |
| Tipo trabajador | 1 | `F` | constante `F` (relación de dependencia) |
| Legajo | 4 | `0001` | `.legajo` (zero-padded) |
| Situación de revista | 2 | `01` | código de `payrollSituacion.codigo` |
| Período (mes) | 2 | `04` | mes del período |
| Código actividad | 2 | `90` | código de `payrollActividad.codigo` |
| % trabajado | 7 | `100,000` | calculado (días trabajados / 30 × 100) |
| Antigüedad (años) | 2 | `01` | calculado desde `fechaAntiguedadReconocida` o `fechaAlta` |
| Fecha de alta (DDMMAAAA) | 8 | (por confirmar) | `.fechaAlta` |
| Haberes remunerativos | 12 | `001253458,11` | `liquidacionImportRecibo.haberes` |
| No remunerativos | 12 | `000132595,92` | `.noRemunerativo` |
| Total (rem + no rem) | 12 | `001386054,03` | `.haberes + .noRemunerativo` |
| Neto | 12 | `001134236,93` | `.neto` |
| ... otros campos | ... | ... | ... |

#### Campos monetarios de cargas sociales

Los importes de aportes y contribuciones **se calculan como porcentaje sobre las bases remunerativas** (no vienen de los conceptos individuales del recibo):

| Concepto | Cód. SOS | % Aporte empleado | % Contrib. empleador (Dec 814 inc. a) |
|---|---|---|---|
| Jubilación SIPA | 201 | 11% | 16% |
| INSSJyP (Ley 19032) | 202 | 3% | 2% |
| Obra Social | 203 | 3% | 6% |
| FSR | 204 | 2% | 1% |
| AAFF | — | — | 7.5% |
| FNE | — | — | 0.5% |
| LRT (ART) | — | — | variable |

Para empleadores bajo **Decreto 814/01 inc. b o c**, los porcentajes de contribución son reducidos. El campo `liquidacionImportEmpleado.tipoEmpleador` almacena esto.

Las bases de cálculo ya están en la BD:
- **Base general (Rem 1-9):** `liquidacionImportRecibo.haberes`
- **Base OS (Rem 4-8):** `.rem4y8Override` si hay override, si no = haberes rem
- **Base ART (Rem 9):** `.rem9Override` si hay override, si no = haberes rem

#### Empleados del período Abril 2026 (E-presis)

| Legajo | Nombre | CUIL | Haberes | Retenciones | No Rem | Neto |
|---|---|---|---|---|---|---|
| 0001 | Gonzalez, Silvana Isabel | 27295946356 | $1.253.458,11 | $251.817,10 | $132.595,92 | $1.134.236,93 |
| 0002 | Azuaje Rojas, Edward Alejandro | 23960132769 | $1.247.376,25 | $250.702,66 | $133.895,88 | $1.130.569,47 |
| 0003 | Gigio, Giuliana Romina | 23400741824 | $1.124.986,82 | $230.989,35 | $100.421,91 | $994.419,38 |
| 0004 | Romano, Bahia Sol | 23391679754 | $1.247.376,25 | $254.719,53 | $133.895,88 | $1.126.552,60 |
| 0007 | Prott Brill, Tomas | 20437184675 | $1.247.376,25 | $250.702,66 | $133.895,88 | $1.130.569,47 |
| 0009 | Sanchez, Gonzalo Daniel | 20316043780 | $1.247.376,25 | $275.248,28 | $580.179,90 | $1.552.307,87 |
| 0010 | Piccini, Matias Jorge | 20266207175 | $1.715.306,40 | $346.113,48 | $209.613,30 | $1.578.806,22 |
| 0011 | Lerman, Gabriel Eduardo | 23222352339 | $1.000.000,00 | $0,00 | $0,00 | $1.000.000,00 |
| 0012 | Tasso, Joaquin Lucas | 20359471336 | $1.278.385,84 | $256.606,53 | $131.295,96 | $1.153.075,27 |

---

## 4. Comparativa: SOS Contador vs Arca

### 4.1 Datos disponibles

| Dato necesario para LSD | Disponible en Arca | Observaciones |
|---|---|---|
| CUIL del empleado | ✅ | `liquidacionImportEmpleado.cuil` |
| Nombre del empleado | ✅ | `.nombre` — verificar sin tildes |
| Sexo | ✅ | `.sexo` |
| Legajo | ✅ | `.legajo` |
| Situación de revista (código) | ✅ | vía FK `payrollSituacion.codigo` |
| Código de actividad | ✅ | vía FK `payrollActividad.codigo` |
| Modalidad de contratación | ✅ | vía FK `payrollModalidadContratacion.codigo` |
| Fecha de alta | ✅ | `.fechaAlta` |
| Fecha antigüedad reconocida | ✅ | `.fechaAntiguedadReconocida` |
| Tipo empleador (Dec 814) | ✅ | `.tipoEmpleador` |
| Haberes remunerativos | ✅ | `liquidacionImportRecibo.haberes` |
| No remunerativos | ✅ | `.noRemunerativo` |
| Descuentos / Retenciones | ✅ | `.descuentos`, `.retenciones` |
| Neto | ✅ | `.neto` |
| Base OS (Rem 4-8) | ✅ | `.rem4y8Override` |
| Base ART (Rem 9) | ✅ | `.rem9Override` |
| CUIT del perfil (empresa) | ✅ | `profile.identity_number` |
| Conceptos LSD con flags de cargas | ✅ | `lsdPerfilConcepto` JOIN `lsdConceptoAfip` |
| Internal code posiciones 3-12 (conceptos) | ❓ | No mapeado — requiere confirmar lógica |
| Layout exacto byte a byte (liquidación) | ❓ | Requiere spec AFIP RG 3396/2012 o ingeniería inversa |

### 4.2 Brechas a resolver

**Brecha 1 — Internal code en conceptosLSD.txt**

Las posiciones 3-12 del bloque de código de cada concepto tienen un patrón que aparenta ser un índice de orden dentro del tipo AFIP (`0000000000`, `1000000000`, `0001000000`, etc.). Hay dos opciones:
- Derivarlo automáticamente del tipo + SOS code (lógica determinista)
- Agregarlo como campo `internalCode` en `lsdPerfilConcepto` y seedearlo

**Brecha 2 — Layout exacto del archivo Liquidación LSD**

El formato es fijo y estandarizado por la RG 3396/2012 de AFIP. Los campos identificados cubren lo conocido, pero el byte-layout completo requiere:
- Bajar la especificación oficial del sitio AFIP
- O terminar la ingeniería inversa cruzando los 9 registros de E-presis con la BD

---

## 5. Plan de implementación

### Paso 1 — Resolver el internal code del conceptosLSD (Bajo)

Estudiar los 18 conceptos de E-presis y determinar si el internal code es derivable automáticamente. Si no, agregar el campo a la BD.

**Archivos:** `drizzle/schema.ts`, script de seed

### Paso 2 — Mapear el layout completo de la Liquidación LSD (Crítico)

Hacer ingeniería inversa byte a byte sobre los 9 registros del archivo de E-presis de Abril 2026, cruzando cada campo con los datos conocidos en la BD.

**Output:** Especificación de campo/posición/ancho para cada dato, documentada en este archivo.

### Paso 3 — Implementar funciones puras de generación (Medio)

Crear `src/lib/lsd-generator.ts` con dos funciones puras:

```typescript
// Genera el contenido de conceptosLSD.txt
function generateConceptosTxt(conceptos: ConceptoLsdRow[]): string

// Genera el contenido del archivo de liquidación
function generateLiquidacionTxt(
  perfil: PerfilData,
  empleados: EmpleadoConRecibo[],
  periodo: { anio: number; mes: number; quincena: '0' | '1' | '2' }
): string
```

### Paso 4 — Server function `generateLsdExport` (Medio)

```typescript
// src/actions/sueldos.ts
export const generateLsdExport = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    clientId: z.string().uuid(),
    profileId: z.string().uuid(),
    anio: z.number(),
    mes: z.number(),
    quincena: z.enum(['0', '1', '2']).default('0'),
  }))
  .handler(async ({ data }) => {
    const { orgId } = await getSessionWithOrg();
    // 1. Validar ownership (client + profile pertenecen a orgId)
    // 2. Cargar conceptos LSD del perfil
    // 3. Cargar recibos + empleados del período
    // 4. Llamar generateConceptosTxt() y generateLiquidacionTxt()
    // 5. Retornar { conceptosTxt, liquidacionTxt, liquidacionFilename }
  });
```

### Paso 5 — UI: botón "Exportar LSD" (Bajo)

En la solapa de Recibos de `src/routes/_authed/sueldos/index.tsx`, agregar un botón que:
1. Llame a `generateLsdExport`
2. Dispare la descarga de ambos TXT desde el cliente (dos `<a download>` en secuencia o un ZIP)

---

## 6. Decisiones técnicas a tomar

| Decisión | Opciones | Recomendación |
|---|---|---|
| ¿Cómo entregar los dos archivos? | ZIP único / dos descargas secuenciales | ZIP único (mejor UX) |
| ¿Dónde calcular aportes/contrib? | En la server function / en el cliente | Server function (acceso a BD) |
| ¿Cómo manejar tildes en nombres? | Strip al generar / guardar ya sin tildes | Strip al generar (no modificar datos en BD) |
| ¿Internal code es derivable? | Sí (automático) / No (campo en BD) | Confirmar con más casos antes de decidir |

---

---

## 8. Estado de implementación al 2026-06-08

### 8.1 Qué está implementado y funcionando

El LSD ya se genera desde Arca (solapa Cargas Sociales) y fue validado contra el archivo de referencia de SOS Contador para **E-presis Mayo 2026**.

**Resultado de la comparación (`src/scripts/comparar-lsd.ts`):**

| Registro | Resultado |
|---|---|
| R01 (cabecera empresa) | Difiere en pos 26-27 — investigación pendiente |
| R03 (conceptos por empleado) | **9/9 OK** — mismos SOS codes y montos |
| R04 monetario (bases de cargas) | **9/9 OK** |
| R04 header (metadatos empleado) | Diffs en pos 16-17 (`marcaCct`, `marcaScvo`) — no bloqueantes |

**Correcciones aplicadas durante el proceso de validación:**
- `rem4y8Override`: se almacena en pesos (no centavos) — `montoCentavos()` ya multiplica por 100.
- Padding alfanumérico: función `lsdAlpha(code, len)` — sin cero a la izquierda, space-padded a derecha. Aplica a `sitGeneral`, `condicion`, `modalidad`, `siniestrado`, `sitRev1/2/3`.
- `diaInicio2/3`: cuando no hay situación 2/3, el campo va `'00'` (no `'  '`).
- `sit1`: se resuelve por COALESCE del recibo y del empleado.
- Códigos de OS corregidos en BD para 3 empleados de E-presis (→ OSECAC 126205).

### 8.2 Pasos del plan original — estado actual

| Paso | Descripción | Estado |
|---|---|---|
| Paso 1 | Internal code conceptosLSD | Pendiente (baja prioridad — archivo conceptos no es urgente) |
| Paso 2 | Mapear layout Liquidación LSD byte a byte | ✅ Completado (ingeniería inversa + spec RG 3396/2012) |
| Paso 3 | Funciones puras de generación | ✅ Implementado en `src/actions/sueldos.ts` (inline en server function) |
| Paso 4 | Server function `generateLsdExport` | ✅ Implementado como `generarArchivoLsd` en `src/actions/sueldos.ts` |
| Paso 5 | UI: botón "Descargar LSD" | ✅ Implementado en la solapa Cargas Sociales |

### 8.3 Pendiente

1. **Enviar a AFIP** el LSD generado por Arca y verificar que sea aceptado sin errores por el aplicativo Simplificación Registral.
2. **R01 pos 26-27**: campo desconocido que en la referencia vale `13` y en el generado `00` — posiblemente número de presentación consecutivo. No bloqueante por ahora.
3. **Conceptos LSD (`conceptosLSD.txt`)**: el segundo archivo (catálogo de conceptos) no está implementado todavía — es de menor urgencia dado que AFIP lo acepta junto con el LSD de liquidación en dos pasos.

---

## 7. Referencias

- Archivos descargados de SOS Contador, empresa E-presis S.A., período Abril 2026
- Módulo DB: `lsdPerfilConcepto`, `lsdConceptoAfip`, `liquidacionImportEmpleado`, `liquidacionImportRecibo`
- Spec AFIP: Resolución General 3396/2012 — Simplificación Registral (LSD)
- Documento relacionado: `Documentacion Tecnica/Plan de generacion TXT cargas sociales.md` (notas técnicas del análisis inicial)
