# Cargas Sociales — Generación del LSD (Libro de Sueldos Digital)

## Contexto

El **Libro de Sueldos Digital (LSD)** es el mecanismo que AFIP/ARCA utiliza para que los empleadores declaren mensualmente las remuneraciones y las cargas sociales de sus empleados. Reemplaza al libro de sueldos en papel y al formulario 931.

Cada mes, el estudio contable debe generar un archivo de texto de formato fijo por empresa empleadora y subirlo al sistema de **Simplificación Registral** de ARCA. Este archivo contiene cuatro tipos de registros (Records 01–04) que describen quiénes trabajan en la empresa, qué se les pagó y cuánto corresponde abonar en concepto de aportes y contribuciones patronales.

La solapa **"Cargas Sociales"** dentro del módulo de Sueldos de Arca Platform es la interfaz que permite previsualizar y descargar ese archivo para cualquier empresa (profile) y período seleccionado.

---

## Qué es el archivo LSD

Archivo de texto plano (`.txt`), una línea por registro, con campos de ancho fijo. Nombre de ejemplo: `30-71755486-4_2026-5_0__LSD.txt`.

### Records

| Record | Cantidad | Descripción |
|--------|----------|-------------|
| **01** | 1 por archivo | Encabezado: CUIT empleador, período AAAAMM, cantidad de empleados |
| **02** | 1 por empleado | Datos del trabajador: CUIL, legajo, situación de revista, fecha |
| **03** | N por empleado | Conceptos del recibo: SOS code, cantidad, importe, crédito/débito |
| **04** | 1 por empleado | Bases imponibles: base jubilación, PAMI, OS, ART aplicando tope RIPTE |

### SOS codes relevantes

Los **SOS codes** son códigos estandarizados de AFIP (1–620) que identifican cada concepto de liquidación. Ejemplos:

- `001` Sueldo básico (C)
- `003` Horas extra 50% (C)
- `019` ART (C)
- `201` Jubilación 11% (D)
- `202` PAMI 3% (D)
- `203` Obra Social 3% (D)
- `411` Asignación familiar SUAF mensual (C)
- `501` Contrib. patronal jubilación (D)
- `502` Contrib. patronal PAMI (D)
- `503` Contrib. patronal ART (D)

### Indicador C/D

- **C** (crédito): conceptos que suman al trabajador — remunerativos y no remunerativos
- **D** (débito): descuentos y retenciones — aportes personales

---

## Qué es el tope máximo imponible (RIPTE)

**RIPTE** = Remuneración Imponible Promedio de los Trabajadores Estables. Es un índice que ANSES publica mensualmente. A partir de ese índice se fija el **tope máximo imponible**: el techo sobre el cual se calculan aportes y contribuciones previsionales.

Ejemplo: si el tope es $1.357.033 y un empleado gana $2.000.000, los aportes de jubilación (11%), PAMI (3%) y OS (3%) se calculan sobre $1.357.033, no sobre $2.000.000.

Este valor **no viene en el recibo** — ANSES lo publica mensualmente y hay que cargarlo en la tabla `payroll_parametros_periodo`.

---

## Arquitectura técnica

### Archivos involucrados

| Archivo | Rol |
|---------|-----|
| `src/routes/_authed/sueldos/index.tsx` | Ruta principal del módulo. Agrega la tab "Cargas Sociales" |
| `src/components/sueldos/SueldosCargas.tsx` | Componente UI de la solapa |
| `src/actions/sueldos.ts` | Server functions `previewLsd` y `generarArchivoLsd` |
| `src/lib/payroll-cron.ts` | Cron mensual: actualiza escalas CCT + tope imponible |
| `drizzle/schema.ts` | Tabla `payroll_parametros_periodo` |

### Tablas de base de datos

| Tabla | Propósito en Cargas Sociales |
|-------|------------------------------|
| `liquidacion_import_recibo` | Recibos del período a declarar |
| `liquidacion_import_empleado` | Datos del trabajador (CUIL, legajo, modalidad, situación, obra social) |
| `liquidacion_import_concepto_valor` | Conceptos del recibo con SOS code e importe |
| `payroll_situacion` | Catálogo de situaciones de revista AFIP |
| `payroll_modalidad_contratacion` | Catálogo de modalidades de contratación AFIP |
| `payroll_parametros_periodo` | Tope imponible y SMVM por período (nuevo) |
| `payroll_tipo_empresa` | Tipo de empleador Dec. 814/01 (código que va en Record 01) |

### Server functions

```
previewLsd({ clientId, profileId, periodo })
  → employer: { nombre, cuit, codigoLsd, tipoEmpresaNombre }
  → empleados: [{ reciboId, cuil, legajo, nombre, situación, modalidad, diasTrabajados, cantidadConceptos, origen }]
  → conceptos: total de líneas Record 03

generarArchivoLsd({ clientId, profileId, periodo })
  → { filename, contenido, empleados, conceptos }
  → El contenido es el texto completo del archivo LSD (Records 01–04)
```

### Cron mensual (`payroll-cron.ts`)

Se ejecuta el **día 20 de cada mes** y hace dos cosas:

1. **`syncTopeImponible()`**: busca la página del mes en curso en `ignacioonline.com.ar` (fuente especializada que publica los valores de las resoluciones ANSES sin WAF), Gemini extrae el tope máximo imponible, upsert en `payroll_parametros_periodo` con `actualizadoPorCron = true`.
2. **Escalas CCT**: fetch + Gemini + upsert en `payrollEscala` (solo Empleados de Comercio CCT 130/75 por ahora).

**Por qué ignacioonline y no ANSES directamente:** `anses.gob.ar` está protegido por Incapsula WAF y devuelve solo el challenge HTML a cualquier fetch automatizado. `ignacioonline.com.ar` publica los mismos valores oficiales (reproduciendo las resoluciones ANSES) sin restricciones.

**Lógica de URL:** el cron genera varios candidatos para el mes en curso (`{mes}-{año}-aportes-...-actualizacion/`, `{mes}-{año}-aportes-.../`) y prueba cada uno hasta obtener una respuesta válida. Maneja el typo conocido "febero" (febrero) del sitio.

Si el fetch falla, el cron loguea el error pero no corta. El operador puede cargar el tope manualmente desde el widget en la solapa "Cargas Sociales".

### Script de backfill 2026 (`seed-topes-2026.ts`) ✅ EJECUTADO

Script one-shot con valores **hardcodeados** para todos los meses de 2026 ya cargados.
Se usó este enfoque porque la página de ANSES está protegida por Incapsula WAF y no es accesible mediante fetch automatizado.

```bash
bun run src/scripts/seed-topes-2026.ts
```

**Valores cargados (ejecutado 2026-06-08):**

| Período | Tope Máximo Imponible | Resolución |
|---------|----------------------|------------|
| 2026-01 | $3.823.373 | Res. ANSES 381/2025 (BO 24-12-2025) |
| 2026-02 | $3.932.339 | Res. ANSES (BO 06-02-2026) |
| 2026-03 | $4.045.590 | Res. ANSES (BO mar-2026) |
| 2026-04 | $4.162.913 | Res. ANSES (BO abr-2026) |
| 2026-05 | $4.303.619 | Res. ANSES 110/2026 (BO may-2026) |
| 2026-06 | $4.414.652 | Res. ANSES 139/2026 (BO jun-2026) |

**Para meses futuros:** agregar la entrada en el array `TOPES_2026` del script y volver a correr. El valor se publica cuando ANSES emite la resolución mensual (típicamente primeros días del mes).

**Script original (`seed-topes-historicos.ts`):** Intenta scrapear ANSES vía Gemini. Bloqueado por Incapsula WAF. Conservado como referencia histórica.

---

## Estado actual (junio 2026)

### Implementado

- [x] Solapa "Cargas Sociales" con selector de período (mes/año)
- [x] Cards de resumen: CUIT empresa, tipo empleador, cantidad de empleados, total de conceptos
- [x] Tabla de preview con datos LSD-relevantes: CUIL, situación de revista, modalidad de contratación, días trabajados, cantidad de conceptos (Record 03 lines), origen
- [x] Alertas inline por empleado si falta situación de revista o modalidad (campos obligatorios para Record 02)
- [x] Alerta si la empresa no tiene tipo de empleador configurado (bloquea la descarga)
- [x] Generación de Records 01, 02 y 03 en formato fijo AFIP
- [x] **Record 04** — bases imponibles por empleado, en formato fijo AFIP (370 chars). Ver detalle en "Notas de implementación".
- [x] Descarga del archivo `.txt` directamente desde el browser
- [x] Normalización de legajos: sin ceros a la izquierda en toda la app (DB + imports + edición)
- [x] Tabla `payroll_parametros_periodo` en schema con tope máximo imponible y SMVM por período
- [x] Cron extendido para sincronizar tope imponible mensualmente desde ANSES

### Implementado (continuación)

- [x] **Server functions del tope imponible**: `getParametrosPeriodo` y `upsertParametrosPeriodo` en `src/actions/sueldos.ts`. Permiten leer y guardar el tope/SMVM de un período con upsert (si ya existe lo pisa, si no lo crea). Marca `actualizadoPorCron = false` cuando se carga a mano.
- [x] **`validarLsd`** — server function que valida el período antes de descargar. Devuelve `{ puedeDescargar, issues[] }`. Ver detalle en "Notas de implementación — Validaciones LSD".
- [x] **Widget de tope imponible** (`TopeImponibleWidget` en `SueldosCargas.tsx`): muestra el tope del período con opción de editar. Si no está cargado, muestra una alerta con formulario inline para ingresarlo. Al guardar, invalida el cache de validación.
- [x] **Panel de validación pre-descarga** (`ValidacionPanel` en `SueldosCargas.tsx`): consume `validarLsd` y muestra errores/warnings antes de la tabla de empleados. Las filas con errores por empleado se marcan en rojo en la tabla. El botón de descarga se deshabilita si `puedeDescargar = false`.

### Pendiente — Alta prioridad

#### 1. Prueba end-to-end en browser

Verificar en el browser que la solapa "Cargas Sociales" para E-presis Mayo 2026:
- No muestra errores de validación (tope cargado, situación de revista resuelta vía COALESCE, modalidad OK).
- El LSD se descarga y el archivo generado coincide con el de referencia (`30-71755486-4_2026-5_0__LSD.txt`).

#### 2. Configurar CCT y escalas para las demás empresas

Sin convenios y escalas configurados, el motor de cálculo no puede generar recibos correctos para ninguna empresa más allá de E-presis. Ver sección "Setup de convenios pendiente" más abajo.

### Pendiente — Prioridad media

- [ ] **Situación de revista null en empleados importados**: los empleados importados desde SOS que no tenían situación configurada en AFIP aparecen con null. Agregar un flujo para completarla desde la UI de empleados o desde la misma solapa de Cargas Sociales (inline edit o alerta con link al legajo).
- [ ] **Múltiples situaciones de revista por período**: el LSD admite hasta 3 situaciones por mes (ej. empleado que cambió categoría a mitad de mes). Los campos `situacionRevista2Id`, `situacionRevista2DiaInicio`, etc. ya están en el schema y se usan en Record 04, pero faltan los campos de edición en la UI del recibo.

### Pendiente — Baja prioridad / Futuro

- [ ] **Soporte para más CCT en el cron**: hoy solo actualiza Empleados de Comercio (CCT 130/75). Agregar fuentes para Gastronómico, Construcción, etc. en `CCT_SOURCES` dentro de `payroll-cron.ts`.
- [ ] **Historial de archivos generados**: guardar registro de cada archivo LSD generado (fecha, período, usuario, hash del contenido) para auditoría.

---

## Notas de implementación

### Formato Record 03

Dos formatos según el SOS code:

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
- C/D según tipo: remunerativo/no-rem → C, descuento/retención → D

### Indicador C/D para registros importados

Para registros con `origen = 'import'`, el tipo no siempre se conoce por FK. Se deriva del SOS code:
- SOS 200–399: descuentos personales → D
- SOS >= 500: contribuciones patronales → D
- Resto: → C

### Campos legacy en empleados

`liquidacion_import_empleado` tiene tanto campos de texto legacy (`codigoModalidadContratacion`, `codigoSituacion`) como FKs a los catálogos UUID (`modalidadContratacionId`, `situacionId`). El código prioriza siempre los FK UUID para generar el LSD.

---

### Formato Record 04

Largo total: **370 caracteres** por línea. Fuente oficial: `LSDiseInterfazLiquidacion.pdf` (AFIP).

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
| 39–40 | 2 | Situación revista 2 | `recibo.situacionRevista2.codigo` o `'  '` |
| 41–42 | 2 | Día inicio situación 2 | `recibo.situacionRevista2DiaInicio` o `'  '` |
| 43–44 | 2 | Situación revista 3 | `recibo.situacionRevista3.codigo` o `'  '` |
| 45–46 | 2 | Día inicio situación 3 | `recibo.situacionRevista3DiaInicio` o `'  '` |
| 47–48 | 2 | Días trabajados | `recibo.diasTrabajados` (default `30`) |
| 49–51 | 3 | % aporte adicional SS | `'000'` (default) |
| 52–56 | 5 | % contrib tarea diferencial | `'00000'` (default) |
| 57–61 | 5 | Campo reservado | `'00000'` |
| 62–67 | 6 | Código obra social AFIP | `obraSocial.codigo` padEnd 6 |
| 68–69 | 2 | Adherentes | `empleado.adherentes` padStart 2 |

#### Sección monetaria (300 chars = 20 campos × 15 chars)

Cada campo es un entero en centavos (`Math.round(monto * 100)`), zero-padded a 15 dígitos.

**Definiciones de bases**:
- `total_rem` = suma de montos con SOS 001–399 e indicador C
- `total_nonrem` = suma de montos con SOS 400–499 e indicador C
- `bruta` = `total_rem + total_nonrem`
- `tope` = `payroll_parametros_periodo.topeMaximoImponible` para el período (en centavos)
- `rem4y8` = `recibo.rem4y8Override` si existe, sino `bruta`
- `rem9` = `recibo.rem9Override` si existe, sino `bruta`

| Pos (0-indexed) | Campo | Fórmula |
|-----------------|-------|---------|
| 70–84 | Aporte adicional OS | `0` |
| 85–99 | Contrib adicional OS | `recibo.contribucionAdicionalOS` |
| 100–114 | Base dif aporte OS | `max(0, min(rem4y8, tope) - bruta)` — exceso de base OS sobre bruta cuando hay override |
| 115–129 | Base dif contrib OS | `max(0, rem4y8 - bruta)` — exceso de base OS contrib sobre bruta |
| 130–144 | Base dif LRT | `max(0, bruta - min(total_rem, tope))` — parte de bruta que supera el tope (o suma no-rem si total_rem ≤ tope) |
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

> **Nota**: cuando `payroll_parametros_periodo` no tiene fila para el período, el tope no se aplica y las bases 1, 4 y 5 se calculan sin techo. Por eso es crítico tener la UI para cargar el tope manualmente.

---

### Validaciones LSD (`validarLsd`)

Server function en `src/actions/sueldos.ts`. Retorna `{ puedeDescargar: boolean, issues: LsdIssue[] }`.

| Código | Tipo | Condición que dispara el issue |
|--------|------|-------------------------------|
| `SIN_TIPO_EMPLEADOR` | error | `client.tipoEmpresaId` null → `codigoLsd` vacío |
| `SIN_TOPE_IMPONIBLE` | error | No hay fila en `payroll_parametros_periodo` para el período |
| `SIN_RECIBOS` | error | No hay ningún recibo para el período y empresa |
| `SIN_SITUACION_REVISTA` | error | `recibo.situacionRevista1Id` es null (por empleado) |
| `SIN_MODALIDAD_CONTRATACION` | error | `empleado.modalidadContratacionId` es null (por empleado) |
| `SIN_OBRA_SOCIAL` | warning | `empleado.obraSocialId` es null (por empleado) |

`puedeDescargar = true` solo si no hay ningún issue de tipo `'error'`. Los warnings se muestran pero no bloquean la descarga.

Los issues por empleado incluyen `empleadoCuil` y `empleadoNombre` para que la UI pueda mostrarlos identificados.

### Parámetros de período (`payroll_parametros_periodo`)

| Server function | Método | Descripción |
|----------------|--------|-------------|
| `getParametrosPeriodo({ periodo })` | GET | Trae la fila del período, o `null` si no existe |
| `upsertParametrosPeriodo({ periodo, topeMaximoImponible, salarioMinimo?, fuente? })` | POST | Crea o reemplaza los parámetros del período. Marca `actualizadoPorCron = false` |

El cron (`payroll-cron.ts`) también hace upsert pero con `actualizadoPorCron = true`. Así la UI puede distinguir si el valor fue cargado manualmente o por el cron automático.

---

## Setup de convenios pendiente (estado junio 2026)

Para generar el LSD de empresas que no sean E-presis, primero hay que configurar su CCT completo en la DB. El flujo es:

```
payrollConvenio → payrollConvenioCategoria → payrollEscala (salarios básicos vigentes)
                                                    ↓
liquidacionImportEmpleado.categoriaId ──────────────┘
                                                    ↓
                              motor de cálculo usa escala + payrollConcepto (fórmulas)
```

### Estado por empresa (junio 2026)

| Empresa | CCT | Estado en DB |
|---------|-----|-------------|
| **E-presis** | Comercio 130/75 | Completo — convenio, categorías, escalas y empleados asignados |
| **Brique** | Construcción 76/75 | payrollConvenio existe pero sin escalas cargadas |
| **Sabenumitubeja** | Pasteleros 167/91 + 272/96 | No configurado (CCT confirmado via scrapper DB) |
| **Admip SRL** | Sanidad 459/06 (probable) | No configurado — CCT no confirmado (scrapper fallido) |
| **Besorot Tovot** | Desconocido | CCT no confirmado — scrapper fallido (credenciales vencidas) |
| **PNR Trade** | Desconocido | CCT no confirmado — scrapper fallido (credenciales vencidas) |

### Credenciales vencidas en el scrapper

Los siguientes representantes tienen contraseñas de AFIP inválidas en la DB del arca-scrapper. Hasta que no se actualicen, no se puede descubrir el CCT de forma automática:

| Empresa | Representante | CUIT rep |
|---------|--------------|----------|
| Besorot Tovot | Alberto Uriel Jafif | 20-36171053-4 |
| PNR Trade | Pawan Mirpuri | 20-96206929-1 |
| Admip SRL | Admip Srl | 20-92401686-9 |

**Alternativa manual**: AFIP > Clave Fiscal > Simplificación Registral - Empleadores > Convenios.
