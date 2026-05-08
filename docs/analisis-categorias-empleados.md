# Análisis de Categorías de Empleados
**Fecha:** 2026-04-24

## Resumen ejecutivo

| Situación | Empleados |
|-----------|----------:|
| Ya tienen `categoria_id` asignado (OK) | 16 |
| Match automático posible desde Excel | 61 |
| Sin match (requieren revisión) | 132 |
| Sin categoría en Excel ("Sin Categoria") | 8 |
| Sin convenio cargado en BD | 24 |
| **Total** | **241** |

---

## 1. Matches automáticos (47 empleados)

Casos donde el texto del Excel coincide con una categoría en `payroll_convenio_categoria` luego de normalizar mayúsculas y tildes. Se pueden asignar sin intervención manual.

| Texto en Excel | Categoría en BD | Empleados |
|----------------|-----------------|----------:|
| Administrativo A | Administrativo A | 24 |
| Auxiliar Especializado B | Auxiliar Especializado B | 8 |
| Auxiliar B | Personal Auxiliar B | 5 |
| Auxiliar A | Personal Auxiliar A | 3 |
| Maestranza A | Maestranza A | 3 |
| Maestranza A (Cadete) | Maestranza A | 1 |
| Gerente | Gerente | 1 |
| Auxiliar Especializado | Auxiliar Especializado A | 1 |
| Cajero | Cajeros A | 1 |
| AUX ESPECIALIZADO B | Auxiliar Especializado B | 14 |

---

## 2. Sin match — Problema de convenio incorrecto

La mayoría de los 146 sin match **no fallan por diferencia de texto**, sino porque el empleado tiene asignado un `convenio_id` que apunta al convenio equivocado. Las categorías "disponibles" que muestra el sistema son las del convenio asignado, no las del convenio real del empleado.

### 2.1 Empleados con categorías de Construcción asignados a convenio Comercio/Gastronomía

**Clientes afectados:** Ngvs SA, Brique Construcciones Srl

| Texto en Excel | Empleados | Convenio correcto |
|----------------|----------:|-------------------|
| AYUDANTE / Ayudante / ayudante | 53 | Construcción 76/75 |
| OFICIAL / Oficial | 9 | Construcción 76/75 |
| MEDIO OFICIAL / Medio Oficial | 5 | Construcción 76/75 |
| OFICIAL ESPECIALIZADO | 1 | Construcción 76/75 |
| OFICAL (typo de OFICIAL) | 1 | Construcción 76/75 |
| Jefe | 2 | Construcción 76/75 |

> **Causa:** El scraper de AFIP no tiene CCT registrado para estos clientes (aparecen en la lista de "sin CCT scrapeado"). Sus empleados quedaron con `convenio_id` = Comercio o sin convenio, en lugar de Construcción. Cuando se asigne el convenio correcto, la mayoría de estos matchearán automáticamente.

### 2.2 E-Presis SA — abreviatura no reconocida

| Texto en Excel | Empleados | Observación |
|----------------|----------:|-------------|
| AUX ESPECIALIZADO B | 14 | Abreviatura de "Auxiliar Especializado B" (Comercio 130/75) |

> **Causa:** Todos los empleados de E-Presis tienen `convenio_id` = Comercio 130/75 (correcto). El problema es únicamente de texto: SOS usa la abreviatura "AUX ESPECIALIZADO B" en lugar del nombre completo "Auxiliar Especializado B". Se resuelve con un mapeo de equivalencias.

> **Nota — Termomecanica Valtri:** También tiene Comercio 130/75 asignado correctamente, pero todos sus empleados tienen el campo `categoria` vacío en el Excel. No hay información disponible para asignar automáticamente.

> **Nota general — clientes con múltiples convenios:** E-Presis tiene registros de Comercio, Gastronomía y Excluido de Convenio en `payroll_convenio`. Esto anticipa un escenario real: una empresa puede tener empleados bajo distintos CCTs. La lógica de asignación de categoría debe buscar las categorías del convenio específico del empleado (`convenio_id`), no todas las categorías del cliente. Esto aplica a futuro cuando se implemente la asignación por empleado de forma masiva.

### 2.3 Casos con texto no estandarizado que requieren mapeo manual

Estos textos del Excel no tienen equivalente directo en la tabla de categorías. Requieren decidir a qué categoría de la BD corresponden.

#### Clientes de Gastronomía (Zahrarh SA, GB Bazar SA, Flor de azar)

| Texto en Excel | Empleados | Clientes | Posible categoría BD |
|----------------|----------:|----------|----------------------|
| VENDEDOR B / Vendedor B / Vendedores B | 16 | Rojot SA, Mr Almohada, Sigana, Master Kids, Mugiwaras, KASUR LIPAT, Khiro SA | Vendedores B (Comercio) |
| SANDWICHERO | 4 | GB Bazar SA | — categoría gastronómica, no existe en BD |
| DEPENDIENTE DE SALON | 3 | GB Bazar SA | — no existe en BD |
| PEON GENERAL (CAT B | 2 | Zahrarh SA | — categoría gastronómica |
| AYUDANTE DE COCINA (CAT B | 2 | Zahrarh SA | — categoría gastronómica |
| MOZO DE SALON (CAT B | 1 | Zahrarh SA | — categoría gastronómica |
| AYUDANTE PARRILLERRO (CAT B | 1 | Zahrarh SA | typo de AYUDANTE PARRILLERO |
| AYUDANTE PARRILLERO (CAT B | 1 | Zahrarh SA | — categoría gastronómica |
| LAVACOPAS (CAT B | 1 | Zahrarh SA | — categoría gastronómica |
| COCINERO | 1 | GB Bazar SA | — categoría gastronómica |
| DEPENDIENTE DE MOSTRADOR | 1 | GB Bazar SA | — no existe en BD |
| EMPANADERO | 1 | GB Bazar SA | — no existe en BD |

> **Nota:** Zahrarh SA y GB Bazar SA tienen empleados con categorías típicas de Gastronomía (mozos, cocineros, ayudantes de cocina). Estas categorías existen en el convenio Gastronomía 389/04 de estudiovilaplana pero con nombres distintos (ej. "Categoría 1 - 1★ / 1 tenedor D / 1 copa"). Hay que mapear los nombres propios del empleador a las categorías oficiales del CCT.

#### Clientes de Pasteleros (Minhashamaim SA)

| Texto en Excel | Empleados | Posible categoría BD |
|----------------|----------:|----------------------|
| OFICIAL DE SECCION | 2 | — no existe en BD (Pasteleros) |
| AYUDANTE PASTELERO | 1 | — no existe en BD (Pasteleros) |
| AYUDANTE SANGUCHERO | 1 | — no existe en BD (Pasteleros) |
| PEON LIMPIEZA | 1 | — no existe en BD (Pasteleros) |

> Las categorías de Pasteleros (CCT 0021/88, 0167/91, 0272/96) **no tienen escalas cargadas** aún en la BD. Cuando se incorporen las fuentes de esos CCTs, estos empleados podrán ser asignados.

#### Otros casos puntuales

| Texto en Excel | Empleados | Clientes | Observación |
|----------------|----------:|----------|-------------|
| GERENTE / Gerente | 6 | GB Bazar SA, Brique, Pahue, KASUR LIPAT | "Gerente" existe en BD solo para E-Presis SA. Para los otros clientes no existe esa categoría. |
| GEREBTE | 2 | GB Metal | Typo de "GERENTE" |
| ADMINISTRATIVA A (mayúsculas) | 3 | GB Metal, Melman Pablo, E-Presis SA | Mismo texto que "Administrativo A" pero con typo/variante. Posible match manual. |
| REPARTIDOS AUXILIAR B | 2 | Artzeinu | Categoría no estándar. Artzeinu tiene convenio Comercio. |
| VENDEDOR CATEGORIA A | 1 | Chirin Srl | Posible "Vendedores A" en Comercio |
| VENDEDORA CAT B | 1 | Khiro SA | Posible "Vendedores B" en Comercio, pero Khiro tiene Gastronomía asignado |
| Vendedor a | 1 | Khiro SA | Ídem anterior |
| ADMINISTRATIVA B | 1 | Melman Pablo | Posible "Administrativo B" — Melman tiene Gastronomía asignado |
| director / DIRECTOR | 2 | Sigana SA, Mugiwaras | Categoría no existe en BD |
| Sin categorias | 2 | KASUR LIPAT | Variante de "Sin Categoria" |

---

## 3. Sin categoría en Excel (8 empleados)

El Excel de SOS tiene el campo `categoria` vacío o con el valor literal "Sin Categoria". No hay información para asignar.

| Cliente | Empleados |
|---------|----------:|
| GB Metal | 2 |
| Admip Srl | 2 |
| Metagame SA | 2 |
| Khiro SA | 1 |
| Ngvs SA | 1 |

---

## 4. Sin convenio cargado en BD (24 empleados)

Empleados cuyo cliente no tiene `payroll_convenio_categoria` cargadas todavía (convenio existe pero sin categorías), o cuyo perfil no tiene `convenio_id` asignado.

| Cliente | Empleados | Categorías en Excel | Observación |
|---------|----------:|---------------------|-------------|
| Alberto Uriel Jafif | 9 | OFICIAL DE PRIMERA, MEDIO OFICIAL, EMPLEADO PRIMERA/SEGUNDA CATEGORIA | Sin convenio ni categorías en BD |
| Flor de azar S.A. | 9 | AYUDANTE PARRILLERRO, PEON GENERAL, MOZO DE SALON, LAVACOPAS, etc. | Convenio Gastronomía 389/04 existe pero sin categorías cargadas |
| Selem Javier | 3 | Auxiliar A, Administrativo A | Sin convenio cargado |
| Mazal Dream SA | 2 | Gerente | Convenio existe pero sin categorías |
| Pawan Mirpuri | 1 | VENDEDOR CAT. B | Sin convenio cargado |

---

## 5. Problemas a resolver (ordenados por impacto)

### Prioridad 1 — Corregir convenio incorrecto (desbloquea ~70 empleados)
Los empleados de construcción (Ngvs SA, Brique Construcciones Srl) tienen convenio equivocado. Cuando se scrapeé el CCT de AFIP para esos clientes y se asigne Construcción 76/75, la mayoría de las categorías (AYUDANTE, OFICIAL, MEDIO OFICIAL) matchearán solas.

### Prioridad 2 — Cargar categorías faltantes (desbloquea ~33 empleados)
Los convenios de Pasteleros (21/88, 167/91, 272/96), Flor de azar (389/04) y clientes sin categorías (Alberto Uriel Jafif, Selem Javier) no tienen `payroll_convenio_categoria` cargadas. Requiere incorporar las fuentes de esos CCTs.

### Prioridad 3 — Mapeo manual de textos no estándar (~43 empleados)
Textos propios del empleador que no coinciden con la nomenclatura oficial del CCT:
- Categorías gastronómicas de Zahrarh/GB Bazar → mapear a nomenclatura de CCT 389/04
- "VENDEDOR B" y variantes → mapear a "Vendedores B" de Comercio
- Typos ("GEREBTE", "OFICAL", "ADMINISTRATIVA A") → corregir y reasignar

### Prioridad 4 — Sin información (8 empleados)
Empleados que SOS registra como "Sin Categoria". No se puede asignar categoría automáticamente; requiere consulta con el cliente.

---

## 6. Acciones recomendadas

1. **Scrapear CCTs de Ngvs SA y Brique Construcciones Srl** para corregir `convenio_id` de sus empleados.
2. **Incorporar fuentes de Pasteleros y Gastronomía** (escalas y categorías) para los CCTs 0021/88, 0167/91, 0272/96 y 0389/04.
3. **Definir tabla de equivalencias** para los textos no estándar del Excel (ej. "SANDWICHERO" → categoría gastronómica oficial).
4. **Ejecutar asignación automática** para los 47 matches ya confirmados.
5. **Consultar con clientes** los 8 empleados sin categoría en SOS.
