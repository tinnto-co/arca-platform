# Migración a la nueva base de datos

**Fecha:** 30/07/2026 · **Estado:** BD nueva construida y cargada, pendiente el corte en producción.
**Para:** equipo de ARCA (desarrollo + estudio).

Documentos relacionados:
- `tasks/modelo-ideal-db.md` — el diseño completo dominio por dominio (el "por qué" largo).
- `tasks/mapa-actual-ideal.md` — mapa tabla a tabla resumido.
- `src/scripts/ideal/` — el DDL (`schema-dominioN.sql`) y los ETLs (`etl-dominioN.ts`).

---

## 1. Resumen en 10 líneas

Hoy tenemos una base que creció por acumulación: 77 tablas con nombres en tres idiomas,
columnas duplicadas entre entidades, períodos guardados como texto, montos como texto,
tablas muertas y significado escondido en el código de la app en vez de en la base.

Construimos **una base nueva desde cero** (BD_IDEAL) con el modelo que queremos, y un
conjunto de **7 scripts de migración (ETL)** que copian todo lo que hay hoy al modelo nuevo.
No es una reforma "in situ": es una base paralela que se llena, se verifica y recién después
reemplaza a la actual.

**Ya está hecho y funcionando:** 76 tablas, 317.827 filas, los 7 ETLs corren de punta a punta
sin errores y con verificación de conteos contra el origen.

**Falta:** subir a R2 los 531 documentos que hoy viven como base64 dentro de la base,
adaptar la app y el scrapper al modelo nuevo, y hacer el corte.

---

## 2. Por qué migramos

No es una migración estética. Cada punto de abajo es un problema que ya nos costó tiempo o
que ya produjo un dato mal.

### 2.1 El significado no está en la base, está en el código

Ejemplo real: para saber si un comprobante es una nota de crédito, la app tiene una lista
de números de tipo hardcodeada en TypeScript. Si esa lista está mal, el IVA sale mal —
y salió mal (bug TIN-1226). En el modelo nuevo hay una tabla `comprobante_tipo` con la
columna `es_nc`: la base sabe qué es una nota de crédito, y cualquiera que consulte la base
(la app, un script, un agente de IA, un contador con SQL) obtiene la misma respuesta.

### 2.2 Períodos y montos como texto

`"2025-03"`, `"202503"`, `"03/2025"` conviviendo en la misma columna. Ordenar por período
requería trucos, y comparar rangos era imposible sin parsear. En el modelo nuevo todo
período es una columna `date` (el primer día del mes). Los montos son `numeric(15,2)`,
no texto.

### 2.3 Columnas duplicadas entre entidades

La condición frente al IVA estaba tanto en `representative` como en `client`. Encontramos
**15 casos donde no coincidían**. Cuando el mismo dato vive en dos lugares, tarde o
temprano divergen y nadie sabe cuál es el bueno. En el modelo nuevo vive en un solo lugar:
`cliente.condicion_iva`.

### 2.4 Una tabla haciendo de dos cosas distintas

`invoice` guardaba la cabecera del comprobante **y** las 10 columnas de alícuotas de IVA
(`amount_iva_21`, `iva_21`, `amount_iva_105`, `iva_105`, …). Agregar una alícuota nueva
implicaba agregar columnas. Peor: los nombres mentían — `amount_iva_21` era el **neto**
gravado al 21%, no el IVA. En el modelo nuevo hay `comprobante` (cabecera) y
`comprobante_alicuota` (una fila por alícuota, con `neto` e `iva` bien nombrados).

### 2.5 Archivos binarios adentro de la base

531 documentos guardados como base64 dentro de una columna de texto (24,6 MB). Cada
consulta que hacía `select *` sobre esa tabla se traía los archivos enteros. Además, el
tipo declarado estaba **mal en 70 casos** (archivos que decían ser una cosa y eran otra).
En el modelo nuevo el archivo va a R2 y la base guarda la key, el mime real, el tamaño y
el checksum.

### 2.6 Relaciones que no eran lo que parecían

`alert.source_entity_id` parecía apuntar al job que generó la alerta. No: era una clave de
deduplicación (`"<representante>:<tipo de job>:<error>"`). El job real estaba escondido en
un campo JSON. Nadie lo sabía hasta que fuimos a migrarlo.

### 2.7 Tablas muertas y datos huérfanos

4 tablas ya se borraron por estar vacías y sin uso. Otras 5 no se migran por la misma razón.
`payroll_concepto` colgaba del *representante* (el login de AFIP) en vez del *cliente*, lo
que significa que la configuración de conceptos de un cliente se le aplicaba a todos los
clientes que compartían login.

---

## 3. Cómo se hace

### 3.1 Base nueva, no reforma in situ

Se evaluaron las dos opciones. Ir cambiando la base actual con migraciones (renombrar,
partir, mover) es 40+ migraciones encadenadas, cada una con riesgo de dejar la producción
a medio camino, y sin forma de probar el resultado final hasta el final.

La opción elegida: **base nueva + ETL re-ejecutable**. Ventajas concretas:
- Se puede correr el ETL las veces que haga falta; siempre da el mismo resultado.
- El modelo nuevo se puede probar con datos reales antes de tocar producción.
- Si algo sale mal, no pasó nada: la base vieja está intacta.
- El ETL es el documento vivo del mapeo (está en el código, no en un Excel).

### 3.2 Reglas que sigue el ETL

1. **Los IDs se conservan.** La PK vieja es la PK nueva. Así las FKs de las tablas hijas
   sobreviven sin remapear nada. (Única excepción: `comprobante`, porque nace de partir
   `invoice` en dos tablas.)
2. **Falla ruidosamente.** Si aparece un valor de enum que no está mapeado, el ETL se
   detiene y lo dice. Nunca aplica un default silencioso.
3. **No arregla datos malos.** Si el dato en AFIP viene descuadrado, el ETL lo migra
   descuadrado y lo reporta. Los descuadres que se ven en la BD nueva son exactamente los
   que ya existían.
4. **Verifica al final.** Cada ETL compara conteos destino vs origen tabla por tabla.
5. **Es re-ejecutable.** Vacía sus tablas destino y recarga.

### 3.3 Cómo correrlo

La base nueva corre local en Docker:

```bash
docker compose -f docker-compose.ideal.yml up -d   # postgres:17 en localhost:5460

# aplicar el schema (DESTRUCTIVO sobre la base local, no toca nada remoto)
bun src/scripts/ideal/apply-schema.ts

# cargar los datos (el orden importa)
set -a && source .env && set +a
for n in 1 2 3 4 5 6 7; do bun src/scripts/ideal/etl-dominio$n.ts; done
```

**El orden 1→7 es obligatorio**, por dos motivos: el dominio 1 crea clientes y credenciales
que todos los demás necesitan, y el dominio 6 carga alertas cuyo puntero al job recién puede
completarse en el dominio 7 (que es el que carga los jobs).

### 3.4 Secuencia hasta producción

| Paso | Estado |
|---|---|
| 1. Migrar producción al servidor nuevo (NEW_DB) | hecho, falta el corte en Coolify |
| 2. Construir BD_IDEAL + los 7 ETLs | **hecho** |
| 3. Subir los documentos a R2 | pendiente |
| 4. Adaptar app y scrapper al modelo nuevo (rama paralela) | pendiente |
| 5. Freeze + ETL final + corte | pendiente |

---

## 4. Los 7 principios del modelo nuevo

**1. La base se explica sola.** Cada tabla y cada columna tiene `COMMENT ON` en castellano.
No hace falta leer el código de la app para entender qué guarda una columna.

**2. Castellano donde lo entiende un contador.** `comprobante`, `deuda`, `vencimiento`,
`recibo`, `asiento`. Inglés solo en infraestructura (`job`, `agent_run`, tablas de login).
Motivo: el negocio es contable argentino; traducir "nota de crédito" a inglés y de vuelta
solo agrega errores.

**3. El cliente es el centro.** No "empresa": un monotributista persona física también es
cliente. `cliente` es una tabla delgada (quién es) y la configuración cuelga en satélites
(`cliente_empleador_config`, `cliente_eecc_config`), así el 60% de los clientes que no
liquidan sueldos no arrastra 15 columnas vacías.

**4. Las credenciales de AFIP son N:M con los clientes.** Un login de AFIP puede manejar
varios clientes y un cliente puede tener varios logins. Antes era 1:N y eso obligaba a
crear "clientes espejo" falsos.

**5. Todo hecho dice de dónde salió.** Cada tabla de hechos tiene `fuente`
(`scraper` / `manual` / `import` / `calculo` / `ai`). Si dice `ai`, la base **exige** que
apunte a la corrida del agente que la escribió (`ai_run_id`), con un CHECK que lo garantiza.

**6. Catálogos, no listas en el código.** Tipos de comprobante, conceptos de sueldos,
códigos LSD: todos son tablas consultables.

**7. Nada especulativo.** Si una columna hoy está 100% vacía y nadie sabe para qué era,
no entra al modelo nuevo. Se puede agregar el día que haga falta.

---

## 5. El modelo nuevo, dominio por dominio

### Dominio 1 — Identidad (quién es quién)

| Tabla | Qué guarda |
|---|---|
| `cliente` | el contribuyente: CUIT, razón social, si es persona física o jurídica, condición IVA, estado |
| `credencial_afip` | un login de AFIP (CUIT + clave) |
| `cliente_credencial` | qué login se usa para entrar a qué cliente (N:M) |
| `cliente_empleador_config` | los datos de sueldos del cliente — la fila existe solo si liquida sueldos |
| `cliente_eecc_config` | los datos para estados contables |
| `contraparte` | catálogo global de con quién facturamos (proveedores, clientes, consumidores finales) |
| `evento` | rastro de qué pasó (quién cambió qué, qué detectó el scraper) |

**Por qué así:** antes `representative` (el login) y `client` (el contribuyente) tenían los
mismos campos fiscales duplicados, y la relación era 1:N. Separar "el login" de "el
contribuyente" y unirlos con una tabla N:M refleja la realidad de AFIP y elimina los
clientes espejo.

`contraparte` reemplaza a `fiscal_entity` y suma `(doc_tipo, doc_nro)`: la tabla vieja
mezclaba CUITs con 31.116 DNIs de consumidor final y con basura de 1 a 6 dígitos, todo en
la misma columna.

### Dominio 2 — Fiscal (lo que se declara)

| Tabla | Qué guarda |
|---|---|
| `comprobante` | cabecera de la factura/NC/ND: quién, cuándo, cuánto, contra quién |
| `comprobante_alicuota` | una fila por alícuota de IVA del comprobante |
| `comprobante_tipo` | catálogo AFIP: letra, si es nota de crédito, si discrimina IVA |
| `iva_declaracion` | el F2051 mensual scrapeado de AFIP |
| `deuda` / `vencimiento` | lo que AFIP dice que se debe y lo que vence |
| `notificacion` | notificaciones del domicilio fiscal electrónico |
| `notificacion_adjunto` | los archivos de esas notificaciones |
| `liquidacion_iibb` | liquidación de Ingresos Brutos por provincia |

**Por qué así:** partir `invoice` mata las 10 columnas de alícuota y arregla los nombres
mentirosos. `direccion` pasa a ser `emitido`/`recibido` (antes `Inbound`/`Outbound`
capitalizado, que había que comparar en minúsculas en toda la app).

**Detalle importante:** `deuda`, `vencimiento` y `notificacion` **no cuelgan del cliente**,
cuelgan del CUIT y de la credencial de origen. Es la verdad: AFIP los devuelve por CUIT de
login, y hay filas que no son de ningún cliente sino del propio CUIT del login —
**963 de 963 vencimientos, 124 de 519 deudas y 35 de 796 notificaciones**. En el modelo
viejo esas filas vivían colgadas de los "clientes espejo" (clientes falsos creados
automáticamente con el CUIT del representante), que ya se borraron.

### Dominio 3 — Sueldos

| Tabla | Qué guarda |
|---|---|
| `empleado` | el legajo completo |
| `recibo` / `recibo_concepto` | el recibo de sueldo y sus líneas |
| `concepto` | catálogo global de conceptos (numeración SOS 1–620) |
| `cliente_concepto` | cómo usa cada cliente cada concepto (fórmula, código propio, vigencia) |
| `cct` / `convenio` / `convenio_categoria` / `escala_salarial` | convenios colectivos y escalas |
| `cliente_cct` | qué convenio le detectó AFIP a cada cliente |
| 11 catálogos LSD | situación de revista, condición, modalidad, actividad, zona, provincia, localidad, nacionalidad, siniestrado, tipo de empresa, obra social |

**Por qué así:** hoy hay **5 tablas distintas de conceptos** (`concepto_sos`,
`conceptos_completos_sos`, `concepto_sos_client`, `payroll_concepto`, `lsd_perfil_concepto`)
con solapamientos. Se reducen a 2: un catálogo global y la configuración por cliente.

Los 11 catálogos LSD tenían formas distintas cada uno (`codigo`, `codigo_lsd`, `descripcion`,
`nombre`…). Ahora todos tienen la misma forma: `(id, codigo, nombre, codigo_sos)`.

`recibo_concepto` apuntaba al concepto por un **código de texto**, con la FK real en null en
2.218 de 2.233 filas. Ahora es una FK de verdad.

### Dominio 4 — Contabilidad

| Tabla | Qué guarda |
|---|---|
| `cuenta` | plan de cuentas (jerárquico) |
| `cliente_cuenta` | ajustes del plan por cliente |
| `ejercicio` / `periodo_contable` | ejercicio contable y sus períodos |
| `asiento` / `asiento_linea` | asientos y sus líneas |
| `regla_mapeo` / `regla_mapeo_linea` | reglas para generar asientos automáticos |
| `eecc` / `anexo_cmv` / `bien_de_uso` | estados contables, anexo CMV, bienes de uso |
| `firmante` | el contador que firma (con la imagen de firma en R2) |

**Por qué así:** el módulo está prácticamente vacío en producción (solo el plan de cuentas,
133 filas), así que se rediseñó libremente sin costo de migración. El cambio principal:
`asiento` lleva `origen_tipo` + `origen_id`, o sea, un asiento automático **sabe de qué
comprobante o recibo salió**. Antes eso no se podía reconstruir.

### Dominio 5 — Bancos

| Tabla | Qué guarda |
|---|---|
| `cuenta_bancaria` | la cuenta del cliente en un banco |
| `movimiento_bancario` | cada movimiento del extracto |
| `conciliacion_comprobante` | qué movimiento paga qué comprobante |

**Por qué así:** también vacío hoy, diseño libre. Dos decisiones que importan:
`movimiento_bancario.importe` es **siempre positivo** y el sentido lo da
`direccion` (`ingreso`/`egreso`) visto **desde el cliente**, no desde el banco (el extracto
del banco está invertido y eso confunde a todo el mundo). Y `conciliacion_comprobante` lleva
`importe_conciliado`, lo que permite que un pago cubra 3 facturas o que una factura se pague
en 2 veces — algo que el modelo viejo no podía representar.

### Dominio 6 — Portal y gestión

| Tabla | Qué guarda |
|---|---|
| `documento` | archivos (la key de R2, no el archivo) |
| `alerta` | alertas operativas (hoy: errores de scraping) |
| `solicitud` | pedidos del estudio al cliente |
| `acceso_usuario_cliente` | qué usuario del portal ve qué cliente y con qué permisos |
| `riesgo_snapshot` / `proyeccion_impuesto` | scoring y proyecciones |

**Por qué así:** el acceso del portal pasa de granularidad "login de AFIP" a granularidad
"cliente": si un login maneja 5 empresas, hoy dar acceso a una daba acceso a las cinco.

### Dominio 7 — Agentes / IA e infraestructura

| Tabla | Qué guarda |
|---|---|
| `job` / `job_log` | trabajos del scrapper y su log |
| `agent_conversation` / `agent_message` | el chat con el agente |
| `agent_run` | cada corrida del agente: qué modelo, cuánto costó, cómo terminó |
| `agent_action` | **nueva**: la IA propone una acción, un humano la aprueba, se ejecuta |
| `organization_module` | qué módulos tiene habilitados cada estudio |

**Por qué así:** este dominio es el que hace que el modelo sea AI-first de verdad.
`agent_action` es el contrato del producto: el agente **nunca escribe directo**, propone;
queda registrado quién aprobó y cuándo se ejecutó. Y las 8 tablas de hechos tienen
`ai_run_id` con un CHECK: si una fila dice `fuente = 'ai'`, la base obliga a saber qué
corrida la escribió. La trazabilidad no depende de que el programador se acuerde.

---

## 6. Mapa tabla a tabla

Acciones: **IGUAL** (copia) · **RENOMBRA** · **PARTE** (1→N) · **FUSIONA** (N→1) ·
**REDISEÑA** · **NUEVA** · **NO MIGRA**.

| Tabla actual | Filas | Acción | Tabla nueva |
|---|---|---|---|
| user, account, session, verification, organization, member, invitation | — | IGUAL | idem |
| `representative` | 63 | RENOMBRA + adelgaza | `credencial_afip` |
| `client` | 98 | PARTE | `cliente` + `cliente_credencial` + `cliente_empleador_config` + `cliente_eecc_config` |
| `fiscal_entity` | 16.158 | REDISEÑA | `contraparte` |
| `invoice` | 73.431 | PARTE | `comprobante` + `comprobante_alicuota` |
| — | — | NUEVA | `comprobante_tipo` (catálogo AFIP, 43 filas) |
| `iva_scrape` | 297 | RENOMBRA | `iva_declaracion` |
| `debt` | 519 | RENOMBRA | `deuda` |
| `due_date` | 963 | RENOMBRA | `vencimiento` |
| `notification` | 796 | RENOMBRA | `notificacion` |
| `invoice_attachment` | 494 | RENOMBRA | `notificacion_adjunto` |
| `iibb_liquidacion` | 1 | RENOMBRA | `liquidacion_iibb` |
| `liquidacion_import_empleado` | 241 | RENOMBRA | `empleado` |
| `liquidacion_import_recibo` | 175 | RENOMBRA | `recibo` |
| `liquidacion_import_concepto_valor` | 2.233 | RENOMBRA | `recibo_concepto` |
| `conceptos_completos_sos` | 233 | RENOMBRA | `concepto` |
| `lsd_concepto_afip` | 35 | RENOMBRA | `concepto_afip` |
| `concepto_sos_client` + `payroll_concepto` + `lsd_perfil_concepto` | 324+37+349 | FUSIONA | `cliente_concepto` (564) |
| `concepto_sos` | 37 | NO MIGRA | es subconjunto 100% de `conceptos_completos_sos` |
| `convenios_de_trabajo` | 10 | RENOMBRA | `cct` |
| `payroll_convenio` | 59 | RENOMBRA | `convenio` |
| `afip_empleadores_convenio` | 59 | RENOMBRA | `cliente_cct` |
| `payroll_convenio_categoria` | 1.714 | RENOMBRA | `convenio_categoria` |
| `payroll_escala` | 6.550 | RENOMBRA | `escala_salarial` |
| `payroll_convenio_fuente` | 44 | RENOMBRA | `convenio_fuente` |
| `payroll_lsd_presentacion` | 3 | RENOMBRA | `lsd_presentacion` |
| `payroll_parametros_periodo` | 6 | RENOMBRA | `parametro_periodo` |
| `payroll_situacion` | 26 | RENOMBRA | `situacion_revista` |
| `payroll_condicion` | 12 | RENOMBRA | `condicion_trabajador` |
| `payroll_modalidad_contratacion` | 78 | RENOMBRA | `modalidad_contratacion` |
| `payroll_actividad` / `_zona` / `_provincia` / `_localidad` / `_nacionalidad` / `_siniestrado` / `_tipo_empresa` | ~890 | RENOMBRA | sin prefijo `payroll_` |
| `obra_social` | 563 | IGUAL | idem |
| `empleados_categorias` | 54 | NO MIGRA | semilla de scraping, sin FK, fuera del schema |
| `accounting_account` | 133 | RENOMBRA | `cuenta` |
| `account_override` | 0 | RENOMBRA | `cliente_cuenta` |
| `fiscal_year` | 0 | RENOMBRA | `ejercicio` |
| `accounting_period` | 0 | RENOMBRA | `periodo_contable` |
| `journal_entry` / `_line` | 0 | REDISEÑA | `asiento` / `asiento_linea` |
| `ledger_mapping_rule` / `_line` | 0 | RENOMBRA | `regla_mapeo` / `regla_mapeo_linea` |
| `financial_statement` | 0 | RENOMBRA | `eecc` |
| `cmv_annex` | 0 | RENOMBRA | `anexo_cmv` |
| `fixed_asset` | 0 | RENOMBRA | `bien_de_uso` |
| `accountant_signature` | 0 | REDISEÑA | `firmante` |
| `movements` | 0 | NO MIGRA | lo cubre `asiento` con `origen_tipo='manual'` |
| `accounting_log` | 0 | NO MIGRA | lo cubre `evento` |
| `representative_balance_config` | 0 | NO MIGRA | contenido a `cliente_eecc_config` |
| `bank_account` | 0 | RENOMBRA | `cuenta_bancaria` |
| `bank_transaction` | 0 | RENOMBRA | `movimiento_bancario` |
| `bank_invoice_match` | 0 | REDISEÑA | `conciliacion_comprobante` |
| `document` | 531 | REDISEÑA | `documento` |
| `alert` | 207 | RENOMBRA | `alerta` |
| `representative_request` | 0 | RENOMBRA | `solicitud` |
| `representative_user_access` | 0 | REDISEÑA | `acceso_usuario_cliente` |
| `client_risk_snapshot` | 0 | RENOMBRA | `riesgo_snapshot` |
| `tax_projection` | 0 | RENOMBRA | `proyeccion_impuesto` |
| `job` | 17.743 | REDISEÑA | `job` |
| `job_log` | 97.470 | IGUAL | idem |
| `organization_module` | 2 | IGUAL | idem |
| `agent_conversation` / `agent_message` | 59 / 205 | RENOMBRA cols | idem |
| `agent_run` | 0 | REDISEÑA | idem |
| `data_source_event` | 0 | REDISEÑA | `evento` |
| — | — | NUEVA | `agent_action` |

---

## 7. Mapeo columna a columna

Convención: se listan las columnas de la tabla **nueva** y de dónde sale cada una.
**Las columnas de la tabla vieja que no aparecen acá se descartan** (se indica el motivo
cuando es relevante).

### 7.1 Dominio 1 — Identidad

#### `representative` → `credencial_afip`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id | `id` | se conserva el uuid → las FKs de `job` no se rompen |
| org_id | `organization_id` | |
| cuit | `cuit` | |
| clave | `afip_password` | |
| nombre / email / telefono | `name` / `email` / `phone` | contacto opcional |
| estado | `status` | `active` → `activa` |
| ultimo_login_ok | — | nueva, arranca en null |
| verificada_at | — | nueva, arranca en null |
| created_at | `registered_at` ?? `created_at` | se conserva la fecha más vieja |
| updated_at | `updated_at` | |

**Se descartan:** `user_id` (quién lo creó → es un `evento`), `address`, `image` (sin uso),
`convenio_multilateral`, `regimen_local`, `fiscal_condition`, `liquida_sueldos` (duplicados
del cliente; el ETL verifica divergencias antes de descartar y reporta las 15 que hay).

#### `client` → `cliente`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id | `id` | se conserva → todas las FKs hijas sobreviven |
| org_id | `organization_id` | |
| cuit | `identity_number` | |
| razon_social | `name` | |
| tipo_persona | derivado del CUIT | prefijo 20/23/24/27 → física; 30/33/34 → jurídica |
| condicion_iva | `fiscal_condition` | |
| estado | `disabled_at` | con fecha → `baja`, sin fecha → `activo` |
| baja_motivo / baja_at | `disabled_reason` / `disabled_at` | |
| email / telefono / domicilio | `email` / `phone` / `address` | |
| notas | — | nueva |
| created_at / updated_at | idem | |

**Se descartan:** `identity_type` (siempre CUIT, el ETL lo valida), `status` (siempre
`active`), `scraped_at` (operativo, vive en `job`), `managed_by_study` (a revisar).

#### `client` → `cliente_credencial`

| Columna nueva | Viene de |
|---|---|
| cliente_id | `client.id` |
| credencial_id | `client.representative_id` |
| afip_contribuyente_id | `client.afip_contribuyente_id` |
| fuente | fijo `'discovery'` |
| preferida | fijo `true` |

#### `client` → `cliente_empleador_config` *(la fila existe solo si el cliente liquida sueldos)*

| Columna nueva | Viene de |
|---|---|
| cliente_id | `client.id` |
| tipo_empresa_id | `tipo_empresa_id` |
| seguro_colectivo / mipyme / orden_cln | idem |
| situacion_default_id / condicion_default_id / actividad_default_id | idem |
| modalidad_default_id | `contratacion_default_id` |
| siniestrado_default_id / zona_default_id / obra_social_default_id | idem |
| plantilla_empleado_id | `payroll_plantilla_empleado_id` |
| usa_lsd_referencia | idem |
| firma_empleador_key | `firma_digital_empleador` → **pendiente subir a R2** |

`liquida_sueldos` desaparece como columna: **la existencia de la fila es el flag**.

#### `client` → `cliente_eecc_config`

| Columna nueva | Viene de |
|---|---|
| cliente_id | `client.id` |
| actividad_principal | idem |
| fecha_inscripcion_rpc | `fecha_inscripcion` |
| numero_igj | `numero_inscripcion` |
| cierre_ejercicio_mes / firmante_id | nuevas |

#### `fiscal_entity` → `contraparte`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id | `id` | |
| doc_tipo / doc_nro | derivado de `cuil_cuit` | 11 dígitos → CUIT, si no → DNI; la columna vieja mezclaba todo |
| nombre | `name` | |
| provincia | `province` | |
| provincia_fuente | `province_source` | `padron` / `nosis` / `manual` |
| provincia_actualizada_at | `province_fetched_at` | |
| direccion / cod_postal | idem | |

El ETL además **crea 23.843 contrapartes nuevas** que aparecían en `invoice` pero no
estaban en `fiscal_entity` (la tabla vieja solo cubría 13.374 de 37.217 CUITs).

### 7.2 Dominio 2 — Fiscal

#### `invoice` → `comprobante` (cabecera)

| Columna nueva | Viene de | Nota |
|---|---|---|
| id | **uuid nuevo** | única excepción a "los IDs se conservan" (se parte en 2 tablas) |
| org_id / cliente_id | `client_id` → org del cliente | |
| direccion | `direction` | `Inbound` → `recibido`, `Outbound` → `emitido` |
| tipo | `type` | FK a `comprobante_tipo` |
| punto_venta | `sale_point` | pasa a entero |
| numero | `id_from` | pasa a entero |
| fecha_emision | `emition_date` | |
| contraparte_id | `emitter_identity_number` (si es recibido) o `recipient_identity_number` (si es emitido) | resuelto contra `contraparte` |
| moneda / cotizacion | `currency` / `currency_rate` | |
| neto_gravado | `amount_taxed` | |
| neto_no_gravado | `imp_neto_no_gravado` | |
| exento | `amount_exempt` | |
| otros_tributos | `other_taxes` | |
| iva_total | `total_iva` | |
| total | `amount` | |
| cae | `authorization_number` | |
| fuente | fijo `'scraper'` | |

**Se descartan:** `emitter_name` / `recipient_name` / `receipt_province` (viven en
`contraparte`), y las 10 columnas de alícuotas (pasan a la tabla de abajo).

#### `invoice` → `comprobante_alicuota` (una fila por alícuota ≠ 0)

| Columna nueva | Viene de |
|---|---|
| comprobante_id | el comprobante padre |
| alicuota = 21 | neto ← `amount_iva_21`, iva ← `iva_21` |
| alicuota = 10.5 | neto ← `amount_iva_105`, iva ← `iva_105` |
| alicuota = 27 | neto ← `amount_iva_27`, iva ← `iva_27` |
| alicuota = 5 | neto ← `amount_iva_5`, iva ← `iva_5` |
| alicuota = 2.5 | neto ← `amount_iva_25`, iva ← `iva_25` |
| alicuota = 0 | neto ← `amount_iva_0`, iva = 0 |

Ojo con los nombres viejos: `amount_iva_XX` era el **neto**, `iva_XX` era el **IVA**.

#### `iva_scrape` → `iva_declaracion`

| Columna nueva | Viene de |
|---|---|
| id / cliente_id | `id` / `client_id` |
| periodo | columna `date` derivada de `periodo_fiscal` |
| presentada_at | `fecha_presentacion` (texto `dd/mm/aaaa` → date) |
| debito_fiscal / credito_fiscal | idem |
| saldo_mes_anterior | `saldo_mes_pasado` |
| saldo_afip_mes | `saldo_arca_mes` |
| saldo_tecnico_favor | `saldo_tecnico_favor_contribuyente` |
| saldo_tecnico_favor_mensual | `saldo_tecnico_favor_contribuyente_posicion_mensual` |
| saldo_libre_disponibilidad_anterior_neto | `saldo_libre_disponibilidad_periodo_anterior_neto` |
| retenciones_percepciones_periodo | `total_retenciones_percepciones_periodo` |
| saldo_libre_disponibilidad_favor | `saldo_libre_disponibilidad_favor_contribuyente_periodo` |
| fuente | `imported_manually` → `manual` / `scraper` |

#### `debt` → `deuda`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id | `id` | |
| cuit | del cliente o de la credencial | **nuevo**: el sujeto real de la deuda |
| cliente_id | `client_id` | null si la deuda es del CUIT del login |
| credencial_id | `representative_id` | de qué login salió |
| impuesto / concepto | `tax` / `concept` | |
| sub_concepto | `sub_concept` | |
| periodo | columna `date` derivada de `period` | |
| cuota | `quota_number` | |
| vence_at | `due_date` | |
| establecimiento | `establishment` | |
| saldo | `balance` | |
| interes_resarcitorio / interes_punitorio | `compensatory_interest` / `punitive_interest` | |
| estado | `status` | `open`→`abierta`, `paid`→`pagada`, `payment_plan`→`plan_pago`, `prescribed`→`prescripta` |
| intimada | `is_intimated` | |
| detectada_at | `detected_at` | |

#### `due_date` → `vencimiento`

Mismo esquema que `deuda` (cuit / cliente_id / credencial_id / impuesto / concepto /
sub_concepto / periodo / cuota / vence_at), más:

| Columna nueva | Viene de |
|---|---|
| detalle | `detail` |
| completado_at | `completed_at` |
| completado_por | `completed_by_user_id` |

#### `notification` → `notificacion`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id / cliente_id / credencial_id | `id` / `client_id` / `representative_id` | |
| external_id | idem | |
| mensaje | `message` | |
| publicada_at / vence_at | `publication_date` / `expiration_date` | |
| leida | `opened` | |
| severidad | `severity` | `unclassified`→`sin_clasificar`, `info`→`informativa`, `action_required`→`accion_requerida`, `urgent`→`urgente` |
| categoria | `category` | |
| ai_resumen / ai_clasificada_at | `ai_summary` / `ai_classified_at` | |
| asignada_a / resuelta_at / resuelta_por | `assigned_to_user_id` / `resolved_at` / `resolved_by_user_id` | |

#### `iibb_liquidacion` → `liquidacion_iibb`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id / org_id | idem | |
| cliente_id | `profile_id` | el nombre viejo mentía: era el client |
| periodo | columna `date` derivada de `periodo` | |
| provincia / alicuota / saldo_a_favor | idem | |
| percepciones_agentes / percepciones_aduaneras | idem | |
| retenciones_agentes / retenciones_bancarias | idem | |

### 7.3 Dominio 3 — Sueldos

#### Los 11 catálogos LSD → forma uniforme `(id, codigo, nombre, codigo_sos)`

| Tabla vieja | Tabla nueva | Nota |
|---|---|---|
| `payroll_situacion` | `situacion_revista` | |
| `payroll_condicion` | `condicion_trabajador` | |
| `payroll_modalidad_contratacion` | `modalidad_contratacion` | |
| `payroll_actividad` | `actividad` | |
| `payroll_zona` | `zona` | |
| `payroll_provincia` | `provincia` | sin `codigo_sos` |
| `payroll_localidad` | `localidad` | sin `codigo_sos` |
| `payroll_nacionalidad` | `nacionalidad` | sin `codigo_sos` |
| `payroll_siniestrado` | `siniestrado` | |
| `payroll_tipo_empresa` | `tipo_empresa` | `codigo` ← `codigo_lsd` |
| `obra_social` | `obra_social` | |

#### `conceptos_completos_sos` → `concepto` (catálogo global)

| Columna nueva | Viene de |
|---|---|
| id | `id` |
| numero | `numero_sos` |
| nombre / codigo_afip / base_columna / pct_fijo | idem |
| div_hs_norm / div_cantidad | idem (default 1) |
| usa_memo | `tiene_memo` |
| usa_cantidad | `tiene_cantidad` |
| usa_pct | `tiene_pct` |
| usa_concepto_ref | `tiene_imp_concepto_nro` |
| usa_importe | `tiene_importe` |
| usa_importe_min / usa_importe_max | `tiene_imp_min` / `tiene_imp_max` |

#### `lsd_concepto_afip` → `concepto_afip`

`id` → `id`, `codigo_afip` → `codigo`, `descripcion` → `descripcion`.
El ETL además **crea las filas que faltaban**: el catálogo global referenciaba códigos AFIP
que `lsd_concepto_afip` no tenía (35 originales + 43 creadas = 78).

#### 3 tablas → `cliente_concepto` (fusión)

| Origen | Qué aporta |
|---|---|
| `concepto_sos_client` | la habilitación (`habilitado = true`) |
| `payroll_concepto` | `codigo_propio` ← `codigo`, `nombre_propio` ← `nombre`, `tipo`, `base_calculo`, `base_columna`, `formula`, `orden`, `importe_min` ← `imp_min`, `importe_max` ← `imp_max`, `div_cantidad`, `div_hs_norm`, `vigencia_desde`, `vigencia_hasta`, `habilitado` ← `activo` |
| `lsd_perfil_concepto` | `codigo_propio` ← `codigo_contribuyente`, `nombre_propio` ← `descripcion_contribuyente`, `concepto_afip_id`, `repetible` ← `marca_repetible`, y las 15 banderas de aportes/contribuciones (`aportes_sipa`, `contribuciones_sipa`, `aportes_inssjyp`, …) |

La clave es `(cliente_id, concepto_id)`. **Atención:** `payroll_concepto` colgaba del
representante; 15 de 37 filas son de logins con varios clientes, así que el ETL las replica
a cada cliente de ese login y lo avisa. Hay que revisar esos casos con el estudio.

#### `convenios_de_trabajo` → `cct`

`id`, `codigo` ← `cct`, `nombre`, `signatarios`, `descripcion`, `activo`.

#### `payroll_convenio` → `convenio`

`id`, `org_id` (derivado del cliente), `cliente_id` ← `client_id`, `cct_codigo`, `nombre`,
`descripcion`, `activo`.

#### `afip_empleadores_convenio` → `cliente_cct`

`id`, `org_id`, `cliente_id` ← `client_id`, `cct_codigo` ← `cct`, `actividad`,
`signatarios`, `fecha_novedad`.

#### `payroll_convenio_categoria` → `convenio_categoria`

`id`, `convenio_id`, `codigo`, `nombre`, `orden`, `es_valor_hora`.

#### `payroll_escala` → `escala_salarial`

`id`, `categoria_id`, `vigencia_desde`, `vigencia_hasta` (texto → date), `monto_basico`,
`monto_no_remunerativo`, `periodo_label`, `fuente`.

#### `payroll_convenio_fuente` → `convenio_fuente`

`id`, `convenio_id`, `fuente`, `detalle`, `last_synced_at`.

#### `liquidacion_import_empleado` → `empleado`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id / cliente_id | `id` / `client_id` | |
| cuil / legajo / nombre | idem | |
| sexo | `sexo` | `M`→`masculino`, `F`→`femenino` |
| fecha_nacimiento / fecha_alta / fecha_baja | idem | texto → date |
| nacionalidad_id / localidad_id / provincia_id | idem | |
| domicilio / codigo_postal | idem | |
| activo | idem | |
| convenio_id / categoria_id | idem | se ponen en null si el id no existe |
| categoria_texto | `categoria` | el texto libre que venía además del id |
| tarea / tipo_jornada | idem | |
| horas_mensuales_normales / dias_mensuales_normales | idem | |
| valor_hora / valor_sueldo | idem | |
| obra_social_id / conyuge / hijos | idem | |
| forma_pago / banco / cbu | idem | |
| situacion_id / condicion_id / actividad_id / modalidad_contratacion_id / siniestrado_id / zona_id | idem | |
| observaciones | idem | |
| fuente | fijo `'import'` | |

**Se descartan:** 6 columnas 100% vacías y 6 columnas que repetían en texto el código LSD
que ya está en la FK (`codigo_situacion`, `codigo_zona`, etc.).
**Pendiente:** `zona_id` queda null en los 241 empleados porque el `codigo_zona` del sistema
SOS (1 dígito) no tiene equivalencia con el catálogo AFIP (4-5 dígitos). Falta esa tabla de
equivalencia.

#### `liquidacion_import_recibo` → `recibo`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id / cliente_id / empleado_id | idem | |
| periodo | `periodo` (texto) → date | |
| tipo | `tipo` | `sueldo`→`mensual`, `liq.final`→`liquidacion_final`, `vacaciones`→`vacaciones` |
| quincena | idem | null → 0 |
| fecha / fecha_pago / lugar_pago | idem | |
| forma_pago / banco / cbu | idem | |
| basico / haberes / no_remunerativo / descuentos / retenciones / neto | idem | |
| obra_social_id | idem | |
| periodo_cargas | `periodo_cargas` (texto) → date | |
| fecha_deposito_cargas | idem | |
| situacion_revista_1_id … _3_id + dia_inicio | `situacion_revista1_id` … | solo se separa el nombre con guión bajo |
| dias_trabajados / horas_trabajadas | idem | |
| importe_a_detraer_ley27430 / importe_maternidad_art13 | idem | |
| contribucion_tarea_diferencial / contribucion_adicional_os | idem | |
| remuneracion_4y8_override / remuneracion_9_override | `rem4y8_override` / `rem9_override` | |
| observacion_recibo / observacion_interna | idem | |
| confirmado | `recibo_confirmado` | |
| calculado_at | idem | |
| fuente | `origen` | `import`→`import`, `generado`→`calculo` |

#### `liquidacion_import_concepto_valor` → `recibo_concepto`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id / recibo_id | idem | |
| concepto_id | resuelto desde `codigo` | **antes era texto con la FK en null en 2.218 de 2.233 filas**; ahora es FK real |
| tipo | `tipo_liquidacion` | |
| monto / cantidad / porcentaje / importe | idem | |
| importe_min / importe_max | `importe_minimo` / `importe_maximo` | |
| concepto_ref | `importe_concepto_numero` | |
| memo / pct_usado / base_usada | idem | |
| activo | `activo_en_recibo` | |

#### `payroll_lsd_presentacion` → `lsd_presentacion`

`id`, `cliente_id` ← `profile_id`, `periodo` (texto → date), `numero` ← `nro_presentacion`,
`filename`, `empleados`, `conceptos`, `contenido`, `generado_at` ← `generado_en`.

#### `payroll_parametros_periodo` → `parametro_periodo`

`periodo` (texto → date), `tope_maximo_imponible`, `salario_minimo`, `fuente`,
`actualizado_por_cron`.

### 7.4 Dominio 4 — Contabilidad

#### `accounting_account` → `cuenta`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id / org_id | `id` / `organization_id` | |
| codigo / nombre | `code` / `name` | |
| tipo | `type` | traducido a enum castellano |
| alcance | `scope` | `base` / `cliente`, con CHECK contra `cliente_id` |
| cliente_id / padre_id | `client_id` / `parent_id` | |
| descripcion | `description` | |
| rubro | `account_group` | |
| saldo_esperado | `expected_balance` | |
| funcion_gasto | `expense_function` | `administration`→`administracion`, `sales`→`comercializacion`, `financial`→`financiero`, `other`→`otro` |
| naturaleza_inflacion | `inflation_nature` | |
| flujo_efectivo | `cash_flow_activity` | |
| es_cuenta_sistema | `is_system_account` | |
| activa | `is_active` | |

#### `account_override` → `cliente_cuenta`

`id`, `cliente_id` ← `client_id`, `cuenta_id` ← `account_id`, `activa` ← `is_active`,
`nombre_propio` ← `custom_name`.

#### `fiscal_year` → `ejercicio`

`id`, `cliente_id` ← `client_id`, `numero` ← `number`, `fecha_desde` ← `start_date`,
`fecha_hasta` ← `end_date`, `estado` ← `status`, `cerrado_at/por` ← `closed_at/by`,
`reabierto_at/por` ← `reopened_at/by`, `motivo_reapertura` ← `reopen_reason`.

#### `accounting_period` → `periodo_contable`

`id`, `cliente_id`, `ejercicio_id` ← `fiscal_year_id`, **`periodo` (date) ← `year` + `month`**,
`estado` ← `status`, `cerrado_at/por`.

#### `journal_entry` → `asiento`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id / cliente_id / ejercicio_id / periodo_id | idem | |
| numero / fecha / descripcion | `number` / `entry_date` / `description` | |
| origen_tipo | `source_type` | `manual`, `auto_invoice`→`comprobante`, `auto_payroll`→`recibo`, `auto_closing`→`cierre`, `auto_opening`→`apertura`, `import_excel`→`import` |
| origen_id | `source_id` | si un asiento automático no tiene `source_id`, degrada a `manual` |
| regla_id | `mapping_rule_id` | |
| anulado / anulado_at / anulado_por / motivo_anulacion | `is_voided` / `voided_at` / `voided_by` / `void_reason` | |
| editado_post_generacion | `is_edited_post_generation` | |
| fuente | derivado de `origen_tipo` | |
| creado_por | `created_by` | |

#### `journal_entry_line` → `asiento_linea`

`id`, `asiento_id` ← `journal_entry_id`, `cuenta_id` ← `account_id`, `debe` ← `debit`,
`haber` ← `credit`, `descripcion`, `orden` ← `line_order`.
**Se descartan** `client_id` y `period_id` (ya están en el asiento padre). Se agrega un
CHECK: una línea tiene debe **o** haber, nunca los dos.

#### `ledger_mapping_rule` → `regla_mapeo`

`id`, `cliente_id`, `nombre` ← `name`, `modulo` ← `source_module`, `tipo` ← `rule_type`,
`condicion` ← `condition`, `prioridad` ← `priority`, `activa` ← `is_active`.

#### `ledger_mapping_rule_line` → `regla_mapeo_linea`

`id`, `regla_id` ← `rule_id`, `cuenta_id` ← `account_id`, `lado` ← `side`,
`base` ← `amount_basis` (`total`→`total`, `net`→`neto`, `vat`→`iva`,
`other_taxes`→`otros_tributos`, `concept_value`→`valor_concepto`, `fixed`→`fijo`),
`importe_fijo` ← `fixed_amount`, `orden` ← `line_order`, `descripcion`.

#### `accountant_signature` → `firmante`

`id`, `org_id`, `nombre`, `titulo`, `universidad`, `consejo`, `tomo`, `folio`,
**`firma_imagen_key`** ← `firma_imagen` (base64 → R2, pendiente).

#### `financial_statement` → `eecc`

`id`, `org_id`, `cliente_id`, `ejercicio_id`, `estado` ← `status`, `notas` ← `notes`,
`aprobado_at/por`, **`pdf_key`** (era `pdf_url`), `pdf_bytes` ← `pdf_size_bytes`,
`pdf_generado_at/por`.

#### `cmv_annex` → `anexo_cmv`

`id`, `org_id`, `cliente_id`, `ejercicio_id`, `existencia_inicial`, `compras_gastos`,
`existencia_final`.

#### `fixed_asset` → `bien_de_uso`

`id`, `cliente_id`, `nombre` ← `name`, `categoria` ← `category`,
`cuenta_bien_id` ← `asset_account_id`,
`cuenta_amortizacion_acumulada_id` ← `accum_depr_account_id`,
`cuenta_amortizacion_gasto_id` ← `depr_expense_account_id`,
`fecha_alta` ← `acquisition_date`, `valor_origen` ← `original_value`,
`vida_util_anios` ← `useful_life_years`, `valor_residual` ← `residual_value`,
`estado` ← `status`, `fecha_baja` ← `disposal_date`, `motivo_baja` ← `disposal_reason`.

### 7.5 Dominio 5 — Bancos

#### `bank_account` → `cuenta_bancaria`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id | `id` | |
| cliente_id | derivado de `representative_id` | **cambia de dueño**: antes colgaba del login |
| banco | `bank_name` | |
| tipo | — | nuevo enum (`caja_ahorro`/`cuenta_corriente`/`otra`) |
| numero | `account_number` | |
| cbu / alias | idem | CBU único |
| moneda | `currency` | |
| cuenta_contable_id | — | nueva, enlaza con el plan de cuentas |
| activa | `active` | |

#### `bank_transaction` → `movimiento_bancario`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id / cuenta_bancaria_id | `id` / `bank_account_id` | |
| fecha | `transaction_date` | |
| periodo | generado desde `fecha` | |
| direccion | `direction` | `ingreso`/`egreso` **visto desde el cliente** |
| importe | `amount` | **siempre positivo**, con CHECK |
| descripcion | `description` | |
| saldo_posterior | — | nueva |
| contraparte_id | resuelto desde el CUIT | contra el catálogo global |
| contraparte_texto | `counterparty_name` | lo que no se pudo resolver |
| id_externo | `external_id` | índice único con la cuenta → dedupe |
| datos_crudos | `raw_data` | |

#### `bank_invoice_match` → `conciliacion_comprobante`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id | `id` | |
| movimiento_bancario_id | `bank_transaction_id` | |
| comprobante_id | `invoice_id` | |
| importe_conciliado | — | **nueva**: permite pagos parciales y 1 pago → N facturas |
| estado | `reviewed_at` | con fecha → `confirmada`, sin fecha → `sugerida` |
| fuente | `match_type` | se parte en dos columnas: quién lo propuso… |
| confianza | `confidence` | |
| revisado_por / revisado_at | `reviewed_by_user_id` / `reviewed_at` | |

### 7.6 Dominio 6 — Portal y gestión

#### `document` → `documento`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id | `id` | |
| credencial_id | `representative_id` | |
| cliente_id | de la notificación asociada, o el único cliente del login | 26 quedan sin cliente |
| nombre | `name` | |
| storage_key | **null** | pendiente: subir el archivo a R2 |
| mime_type | detectado del contenido | **el `type` declarado estaba mal en 70 casos** |
| tamano_bytes | calculado | |
| checksum | SHA256 calculado | 6 documentos resultan duplicados exactos |
| fuente | fijo `'scraper'` | |

**Se descarta:** `url` (era el base64 del archivo).

#### `invoice_attachment` → `notificacion_adjunto`

`id`, `notificacion_id` ← `notification_id`, `documento_id` ← `document_id`, `external_id`.
El nombre viejo era heredado: no tienen nada que ver con facturas.

#### `alert` → `alerta`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id / org_id | idem | |
| credencial_id | `representative_id` | |
| cliente_id | `client_id` | ninguna alerta tiene hoy |
| tipo | `type` | `scraper_error` → `error_scraping` |
| severidad | `severity` | `baja`/`media`/`alta`/`critica` |
| titulo / descripcion | `title` / `description` | |
| origen_tipo | `source_entity_type` | `job` |
| origen_id | **`metadata.jobId`** | `source_entity_id` NO era el job: era una clave de deduplicación |
| estado | `status` | `open`→`abierta`, `resolved`→`resuelta` |
| asignada_a / resuelta_at / resuelta_por | `assigned_to_user_id` / `resolved_at` / `resolved_by_user_id` | 83 alertas resueltas no tienen fecha (dato roto de origen) |
| detalle | `metadata` | |

#### `representative_request` → `solicitud`

`id`, `org_id`, `cliente_id` (antes era por login), `tipo` ← `type`, `titulo`, `descripcion`,
`estado` ← `status`, `pedida_por` ← `requested_by_user_id`, `vence_at` ← `due_at`,
`completada_at` ← `completed_at`, `detalle` ← `metadata`.

#### `representative_user_access` → `acceso_usuario_cliente`

`user_id`, **`cliente_id`** (antes `representative_id` — cambia la granularidad),
`rol` ← `role`, `puede_subir_documentos` ← `can_upload_documents`,
`puede_ver_deudas` ← `can_view_debts`, `puede_ver_iva` ← `can_view_iva`,
`puede_ver_sueldos` ← `can_view_payroll`, `puede_chatear_ia` ← `can_chat_ai`.

#### `client_risk_snapshot` → `riesgo_snapshot`

`cliente_id`, `periodo` (date), `score`, `nivel` ← `risk_level`, `factores` ← `factors`.

#### `tax_projection` → `proyeccion_impuesto`

`cliente_id`, `periodo` (date), `impuesto` ← `tax` (enum: `iva`, `ganancias`,
`ingresos_brutos`, `cargas_sociales`), `monto_proyectado` ← `projected_amount`,
`confianza` ← `confidence`, `factores` ← `factors`, `generada_at` ← `generated_at`.

### 7.7 Dominio 7 — Agentes e infraestructura

#### `job` → `job`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id / org_id | idem | |
| credencial_id | `representative_id` | |
| cliente_id | `params.clientId` si existe | **queda null en los 17.743**: el modelo viejo nunca lo guardó |
| type / status / params / result | idem | |
| failed_reason / attempts / progress / bull_job_id | idem | |
| started_at / finished_at / failed_at | idem | |

#### `job_log` → `job_log`

`id`, `job_id`, `level` (enum), `message`, `context`, `created_at`.
**Sin `updated_at`**: un log no se edita.

#### `agent_conversation` / `agent_message`

`agent_conversation`: `titulo` ← `title`, más `cliente_id` (nuevo).
`agent_message`: `contenido` ← `content`, `citas` ← `citations`, `role` pasa a enum.
**Se descarta** `confidence` (0 de 205 filas lo usaban). Sin `updated_at`.

#### `agent_run` → `agent_run`

| Columna nueva | Viene de | Nota |
|---|---|---|
| id / org_id / conversation_id | idem | |
| cliente_id | `client_id` | |
| user_id | idem | ahora nullable (corridas de cron) |
| tipo | `intent` → fijo `'chat'` | el viejo era texto libre; el nuevo es enum |
| modelo / costo | — | nuevas |
| resultado | `status` | **null = todavía corriendo** |
| input / output | idem | pasan a jsonb |
| tool_trace / error | idem | |

#### `agent_action` — tabla nueva

No existe hoy. Guarda: qué propuso la IA, sobre qué entidad, con qué payload, quién lo
aprobó o rechazó y cuándo se ejecutó. Dos CHECKs impiden estados imposibles (aprobada sin
quién decidió, ejecutada sin fecha de ejecución).

#### `ai_run_id` en las 8 tablas de hechos

Se agrega por ALTER a `comprobante`, `iva_declaracion`, `asiento`, `movimiento_bancario`,
`conciliacion_comprobante`, `documento`, `recibo` y `empleado`, con este CHECK:

```sql
check ((fuente = 'ai') = (ai_run_id is not null))
```

Traducido: si la fila la escribió la IA, es obligatorio saber qué corrida la escribió; si no
la escribió la IA, es obligatorio que no apunte a ninguna.

---

## 8. Qué NO se migra, y por qué

| Tabla | Filas | Motivo |
|---|---|---|
| `concepto_sos` | 37 | es subconjunto 100% de `conceptos_completos_sos` — se migra la de arriba |
| `empleados_categorias` | 54 | semilla de scraping, sin FK, fuera del schema de la app |
| `movements` | 0 | colgaba del usuario, sin cliente ni cuenta ni contrapartida — lo cubre `asiento` |
| `accounting_log` | 0 | lo cubre `evento` |
| `account_override` | 0 | lo cubre `cliente_cuenta` |
| `representative_balance_config` | 0 | su contenido va a `cliente_eecc_config` |
| `data_source_event` | 0 | lo reemplaza `evento` |

**Todas menos las dos primeras están en 0 filas: no se pierde ningún dato.**
Las 77 tablas de la base actual están resueltas.

---

## 9. Estado actual y pendientes

### Lo que ya funciona

BD_IDEAL cargada: **76 tablas, 317.827 filas**. Las tablas con más volumen:

| Tabla | Filas |
|---|---|
| job_log | 97.470 |
| comprobante | 73.431 |
| comprobante_alicuota | 70.994 |
| contraparte | 40.001 |
| job | 17.743 |
| escala_salarial | 6.549 |
| recibo_concepto | 2.233 |
| convenio_categoria | 1.714 |
| vencimiento | 963 |
| notificacion | 796 |

### Pendientes

1. **Subir 531 documentos a R2** (24,6 MB en base64) y completar `documento.storage_key`.
   Lo mismo con las firmas (`firma_digital_empleador`, `firma_imagen`).
2. **Adaptar la app y el scrapper** al modelo nuevo (rama paralela contra BD_IDEAL).
3. **Cortar a producción**: freeze, ETL final, apuntar los servicios.
4. **Seed de `comprobante_tipo`** con la tabla oficial completa de AFIP (hoy 43 tipos).

### Cosas para revisar con el estudio

- **MUGIWARAS SA** no tiene CUIT cargado → el ETL la saltea. Hay que decidir qué es.
- **`payroll_concepto` de logins con varios clientes** (15 de 37 filas): el ETL replica la
  configuración a todos los clientes del login. Hay que confirmar si corresponde.
- **Falta la tabla de equivalencia de zonas SOS ↔ AFIP**: sin ella, los 241 empleados quedan
  sin zona y el LSD no puede declarar reducción por zona.
- **22 clientes** que están en la base pero no en la planilla del estudio.
- **83 alertas** marcadas como resueltas sin fecha de resolución (dato roto de origen; el
  ETL lo migra tal cual en vez de inventar una fecha).
