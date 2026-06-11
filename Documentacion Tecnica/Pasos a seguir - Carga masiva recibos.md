# Pasos a seguir — Carga masiva de recibos (período 05-2026)

**Última actualización:** 2026-06-10
**Estado general:** Solo E-presis S.A. tiene recibos confirmados para 05-2026. El resto de las empresas no tiene recibos cargados.

---

## Contexto

Los recibos de E-presis fueron cargados manualmente con los montos finales directamente (sin motor de fórmulas). Cada concepto en `liquidacion_import_concepto_valor` tiene el importe final almacenado, sin FK a `payroll_concepto`. Este es el modelo que hay que replicar para el resto.

Los montos varían por empleado (básico, antigüedad %, NR acuerdo). Solo el XLS exportado desde SOS Contador tiene esos datos — **no es posible derivarlos automáticamente desde la escala** sin el XLS.

---

## Estado actual por empresa (Comercio 130/75 y Gastronómica 389/04)

### Comercio 130/75 — listos para importar (todos los empleados tienen categoría)

| Empresa | CUIT | Empleados |
|---------|------|-----------|
| Gastrotecno S.A. | 30718074785 | 3 |
| KASUR LIPAT | 30719184835 | 3 |
| Artzeinu x2 S.A. | 30719153255 | 3 |
| Chirin | 30718161394 | 2 |
| Pahue Technologies SA | 30719105056 | 2 |
| Green Safety | 30718394682 | 1 |
| Rojot S.A. | 30716753251 | 1 |
| Carballo Fabian Alberto | 20180955454 | 1 |

### Comercio 130/75 — parciales (algunos empleados sin categoría asignada)

| Empresa | CUIT | Con cat | Sin cat |
|---------|------|---------|---------|
| Master Kids S.A. | 30718524551 | 7 | 4 |
| Termomecanica Valtri S.A. | 30716025752 | 8 | 16 |
| Messenger & Consulting SA | 30717548767 | 6 | 3 |
| Gb Metal SA | 30716135124 | 5 | 4 |
| Salem, Jose Edgardo | 20127571083 | 4 | 1 |
| Mr Almohada Factory S.A. | 33718009419 | 3 | 1 |
| Khiro S.A. | 30717680568 | 3 | 2 |
| Semeca Ingenieria SRL | 30715433490 | 1 | 1 |
| CARNICERIA BROTHERS X2 S.A | 33717904309 | 1 | 2 |
| Ureshi Group S.A. | 33718399799 | 1 | 3 |
| Sigana S.A. | 30718149874 | 1 | 1 |
| Momel S.r.l | 30714871087 | 2 | 1 |
| Ngvs | 30717786986 | 2 | 49 |

### Comercio 130/75 — bloqueados (ningún empleado tiene categoría)

| Empresa | CUIT | Empleados |
|---------|------|-----------|
| Smart Solution SRL | 30714871508 | 4 |
| Mr Factory Couch SA | 30717679136 | 3 |

### Gastronómica 389/04 — todos bloqueados (ningún empleado tiene categoría)

| Empresa | CUIT | Empleados |
|---------|------|-----------|
| FLOR DE AZAR S.A. | 33719196239 | 8 |
| Zahrah S.A. | 30718084209 | 8 |

> Nota: Ngvs y Pahue Technologies tienen empleados en ambos convenios (Comercio y Gastronómica). Solo los que tienen `categoria_id` asignada a una categoría de Gastronómica se pueden liquidar por ese CCT.

---

## Pasos a seguir

### Paso 1 — Asignar categorías a empleados sin categoría

Para los empleados que aparecen como "sin categoría", hay que entrar a la UI de Empleados de cada empresa y asignar la categoría de convenio correspondiente (campo "Categoría" en la solapa Laboral del legajo).

**Prioridad alta:** las empresas con más empleados sin categoría son Termomecanica (16), Ngvs (49), Master Kids (4), Messenger (3). Ngvs con 49 sin categoría es el caso más crítico.

Para las empresas que usan Gastronómica (FLOR DE AZAR, Zahrah), hay que asignar la categoría del CCT 389/04, no del 130/75.

---

### Paso 2 — Elegir el método de carga de recibos

Hay dos opciones:

#### Opción A — Re-importar desde XLS de SOS (recomendada para exactitud)

Re-descargar los XLS desde SOS Contador (Sueldos > Recibos > "XLS c/conceptos") para cada empresa y correr el script:

```bash
bun run src/scripts/load-conceptos-from-sos-xls.ts \
    --xls "C:/ruta/al/archivo.xls"
```

El script ya tiene `reciboConfirmado: true` en el path de update y de insert. El resultado son recibos con los montos exactos de SOS, igual que E-presis.

**Ventaja:** Montos 100% exactos (antigüedad, presentismo, NR variables correctos por empleado).
**Requisito:** Tener los XLS disponibles. Las empresas deben tener el módulo V2 habilitado en SOS y recibos generados para 05-2026.

#### Opción B — Generar desde escala con fórmulas estándar

Escribir un script que para cada empleado con `categoriaId` asignada:
1. Lee `payrollEscala.monto_basico` para el período 05-2026.
2. Genera el recibo con el conjunto estándar de conceptos (básico, jubilación 11%, PAMI 3%, OS 3%, SEC 2%, FAECYS 0.5%, NR acuerdo fijo).
3. Crea el recibo con `reciboConfirmado = false` para que el contador lo revise.

**Ventaja:** No necesita XLS, funciona con los datos ya en DB.
**Limitación:** La antigüedad, presentismo y NR variables no van a coincidir con SOS sin el XLS. El contador tiene que completar/corregir manualmente.

#### Opción C — Combinada

Usar la Opción B para generar el esqueleto (básico + aportes estándar), y luego importar el XLS encima con la Opción A para pisar los montos con los valores reales de SOS.

---

### Paso 3 — Verificar categorías de Gastronómica

Para FLOR DE AZAR y Zahrah (389/04), antes de cualquier carga:
1. Verificar qué categorías existen en `payroll_convenio_categoria` para el CCT 389/04 del cliente correspondiente.
2. Entrar a la UI de Empleados de cada empresa y asignar la categoría de gastronomía que corresponde a cada empleado.
3. Luego continuar con el Paso 2.

---

### Paso 4 — Verificar recibos cargados

Después de cargar, verificar que:
- `recibo_confirmado = true` para todos los recibos.
- Los totales de haberes, descuentos y neto coinciden con lo que muestra SOS.
- En la solapa "Cargas Sociales" no aparecen errores de validación (situación de revista, modalidad de contratación).

---

## Otros pendientes relacionados (no bloquean la carga de recibos)

### CCT sin escalas cargadas

Estos CCT existen en la DB pero no tienen escalas salariales, por lo que no pueden usarse en el motor de liquidación:

| CCT | Empresas | Qué falta |
|-----|----------|-----------|
| Construcción 76/75 | Brique, Constructora Ark-Fa, Gonzalez Gustavo | Cargar escalas (el convenio y categorías no existen aún) |
| Pasteleros 167/91 + 272/96 | Sabenumitubeja | Crear convenio + categorías + escalas |
| Sanidad 459/06 | Admip SRL | Categorías + escalas (convenio existe) |

### CCT desconocido (scrapper falló)

Para estas empresas no se pudo obtener el CCT porque las credenciales de AFIP de sus representantes están vencidas en la DB del arca-scrapper:

| Empresa | Representante | CUIT rep |
|---------|--------------|----------|
| Besorot Tovot S.A. | Alberto Uriel Jafif | 20-36171053-4 |
| PNR Trade S.A. | Pawan Mirpuri | 20-96206929-1 |
| Admip SRL | Admip Srl | 20-92401686-9 |

**Para desbloquear:** Actualizar la contraseña de AFIP de cada representante en el sistema, o consultar manualmente el CCT en AFIP (Clave Fiscal > Simplificación Registral - Empleadores > Convenios).

---

## Referencia rápida de conceptos estándar Comercio 130/75

Los conceptos que usa E-presis como base (SOS codes):

| Cód | Nombre | Tipo | Cálculo |
|-----|--------|------|---------|
| 1 | Sueldo básico | Haber | `monto_basico` de escala |
| 3 | Antigüedad | Haber | `(años * 1%) * básico` — varía por empleado |
| 19 | Presentismo | Haber | ~8.33% del básico — varía |
| 51 | Horas extra | Haber | varía |
| 201 | Jubilación | Descuento | 11% del bruto remunerativo |
| 202 | PAMI | Descuento | 3% del bruto remunerativo |
| 203 | Obra Social | Descuento | 3% del bruto remunerativo |
| 206 | SEC | Descuento | 2% del bruto remunerativo |
| 209 | FAECYS | Descuento | 0.5% del bruto remunerativo |
| 211 | Aporte solidario OSECAC | Descuento | $100 fijo |
| 411 | NR Acuerdo | No rem | varía ($75K–$120K según acuerdo) |
| 412 | Antigüedad No Rem | No rem | varía |
| 413 | Antigüedad - No Rem | No rem | varía |
| 414 | Presentismo No Rem | No rem | varía |
| 501 | Acuerdo Sindicato | Descuento | varía |
| 502 | Acuerdos Obra Social | Descuento | varía |
| 503 | Acuerdos Federaciones | Descuento | varía |
