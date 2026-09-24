# Modelo de datos ideal — ARCA Platform desde cero

**Fecha:** 30/07/2026
**Mentalidad:** si hoy empezáramos el proyecto de cero, ¿cómo modelaríamos los datos?
Sin heredar ninguna decisión del schema actual. Después de acordar este modelo, se hace el
mapa actual → ideal y el plan de migración.

**Estado:** borrador para revisar juntos, dominio por dominio.
Leyenda de decisiones: ✅ acordado · 🟡 a discutir · (vacío) sin revisar aún.

---

## 1. El dominio en una frase

Una plataforma **AI-FIRST** para que un **estudio contable** gestione su día a día: la vida
fiscal, laboral y contable de sus **clientes** (empresas y personas físicas) ante AFIP/ARCA — comprobantes, IVA,
deudas, vencimientos, notificaciones, sueldos (LSD) y balances. Los datos entran por
**scraping con credenciales AFIP**, por carga manual, por importación… y cada vez más, **por
agentes de IA**.

Actores: el estudio (tenant), sus usuarios (contadores), **los agentes de IA** (que leen,
cruzan, alertan y escriben datos), los clientes del estudio, los empleados de esos clientes, y
las contrapartes (CUITs que aparecen en comprobantes).

**AI-FIRST implica que la base de datos es la interfaz principal de los agentes.** Hoy el
SQL-agent (`src/routes/api/agent.ts`) necesita un prompt con "TRAMPAS CONOCIDAS"
(direction capitalizado, períodos text en 6 formatos, importes sin signo, joins no obvios).
El modelo ideal se diseña para que ese prompt casi no haga falta: un agente que solo lee el
schema tiene que poder escribir la query correcta.

## 2. Principios de diseño

1. **Castellano para el negocio, inglés para infraestructura** (auth, jobs, logs). Nunca
   mezclado dentro de una tabla.
2. **snake_case físico, camelCase en TS** (Drizzle mapea).
3. Toda tabla: `id uuid`, `created_at`, `updated_at` (trigger). Toda FK con índice.
4. **Multi-tenant explícito**: toda tabla de negocio tiene `org_id` directo o está a 1 FK
   de una que lo tenga, y **el aislamiento lo hace Postgres con RLS**, no el código (ver
   más abajo).
5. **Estados y tipos como enum**, nunca text libre.
6. **Períodos como `date`** (día 1 del mes; anual = 1 de enero + flag si hace falta).
7. **Montos como `numeric(15,2)`** (cotizaciones `(15,4)`).
8. **Catálogos globales inmutables + overrides por tenant/cliente** — una sola fuente de
   verdad por concepto.
9. **Configuración modular en tablas satélite**, no columnas en la entidad central: una
   un cliente que no liquida sueldos no necesita 15 columnas de payroll en null.
10. `ON DELETE`: `cascade` solo en hijos puros (líneas, logs, adjuntos); `restrict` en
    todo lo demás.

### Principios AI-FIRST (transversales a todos los dominios)

11. **Schema auto-descriptivo**: nombres que dicen lo que son (`comprobante`, no
    `liquidacion_import_concepto_valor`), enums en vez de códigos mágicos, y `COMMENT ON
    TABLE/COLUMN` en la BD para todo lo no obvio (los agentes leen los comments vía
    information_schema — el conocimiento tribal vive en la BD, no en un prompt).
12. **Procedencia en todo dato de hecho**: `fuente enum('scraper','manual','import','ai')`
    en cada tabla de hechos, + `ai_confidence numeric` y `ai_run_id` cuando escribe un
    agente. Un dato escrito por IA siempre es auditable y distinguible de uno humano.
13. **Trazabilidad como núcleo, no accesorio**: todo cambio relevante deja evento
    (`data_source_event` generalizado a `evento`): qué cambió, quién/qué lo cambió
    (user, job, agente), cuándo. Es la memoria que los agentes consultan ("¿esto ya se
    avisó?", "¿desde cuándo está esta deuda?").
14. **Cero parsing defensivo**: nada de `LOWER()`, `TO_DATE()` sobre text, ni signos
    implícitos. Si un agente necesita normalizar antes de comparar, el modelo está mal.
15. **Semántica en el dato, no en el código**: reglas como "NC suma al otro lado del IVA"
    se apoyan en atributos del catálogo (`es_nc`, `discrimina_iva`), no en listas
    hardcodeadas de tipos en TS que el agente no puede ver.
16. **Las tablas de agentes son dominio de primera clase** (conversaciones, runs, acciones
    propuestas/aprobadas), no un apéndice de infra: el flujo humano-aprueba-IA-ejecuta es
    parte del producto.

### Aislamiento por organización: RLS ✅ (decidido y aplicado 31/07)

El filtro por `org_id` no puede depender de que cada query se acuerde de ponerlo. En un
producto AI-first la SQL la escribe también un agente, en runtime, y nadie la revisa en un
PR: olvidarse el `where org_id` no da error, da datos de otro estudio.

**Cómo funciona** (`src/scripts/ideal/schema-rls.sql`, se aplica después de los 7 dominios):

- La conexión declara de qué org es: `set local app.org_id = '<org>'` dentro de la
  transacción. Postgres filtra solo.
- **Falla cerrado**: si nadie lo setea, `current_setting('app.org_id', true)` es null,
  ninguna política da true y se ven **cero filas**. Nunca "todas".
- Tres roles: `arca_app` (lectura/escritura), `arca_agent` (solo lectura) y `arca`
  (dueño/superusuario, **bypassea** RLS — es el rol de los ETL y las migraciones, que por
  definición cruzan organizaciones). El `DATABASE_URL` de la app no puede volver a ser `arca`.
- 52 tablas con política, en tres niveles: `org_id` propio (31), a un salto por `cliente`
  (9), hijas que heredan del padre (12, todas con FK NOT NULL).
- **24 sin política, a propósito**: 17 catálogos globales (códigos AFIP y `contraparte` —
  que dos estudios compartan un proveedor no revela nada; quién le factura a quién vive en
  `comprobante`, que sí está aislado) y 7 tablas de auth, que Better Auth necesita leer
  antes de que exista un `org_id` de sesión.

**Consecuencia para la app**: toda query pasa por una transacción con el `set local`. Se
decide ahora y no después porque cambia cómo se conecta la app (`lib/db.ts`) y retrofitearlo
con 60 server functions ya migradas es carísimo.

**Segundo eje: el portal del cliente** (`src/scripts/ideal/schema-rls-portal.sql`). Un usuario
del portal se loguea con una sesión que pertenece al org del **estudio**: con la sola coordenada
`org_id` vería los 97 clientes. Por eso hay un cuarto rol, `arca_portal`, que filtra por
`set local app.cliente_id` (no necesita `org_id`: el uuid del cliente ya es inequívoco).

- Las políticas de org son `to arca_app, arca_agent` y **no** `to public`, a propósito: las
  políticas permisivas se suman con **OR**, así que una política de org abierta a todos los
  roles le habría dado al portal acceso a todo el estudio.
- `schema-rls-portal.sql` **enumera** las 13 tablas que un cliente puede ver de sí mismo, más
  4 catálogos. Lo que no está enumerado no tiene ni `grant`: `credencial_afip` (la clave
  fiscal), `cliente_credencial`, `job`, `evento`, `alerta`, `firmante` y toda la contabilidad
  del estudio dan `permission denied`, no "0 filas". Agregar una tabla al portal es un acto
  explícito y revisable en un diff.
- El portal solo escribe dos cosas: `insert` en `documento` (subir lo que le piden) y `update`
  en `solicitud` (marcarla completada).
- `acceso_usuario_cliente` queda **fuera** del alcance del portal: la lee la app con `arca_app`
  al armar la sesión, y de ahí sale el `cliente_id`. El portal no puede descubrir a qué otros
  clientes accede nadie.
- Los flags (`puede_ver_iva`, `puede_ver_sueldos`…) son capa de **producto** encima de esto. Si
  falla un flag, el cliente ve un menú de más; si fallara el RLS, vería otra empresa. Riesgos
  de distinto orden, capas distintas.

## 3. Mapa de dominios

```
AUTH (Better Auth, no se toca)
 └─ organization ─┬─ user / member / invitation
                  │
IDENTIDAD FISCAL  │
 ├─ cliente ◄─────┘        el cliente del estudio (CUIT propio)
 ├─ credencial_afip        login AFIP (CUIT + clave cifrada)
 ├─ cliente_credencial     N:M cliente ↔ credencial (la "relación" de AFIP)
 └─ contraparte            catálogo de CUITs vistos en comprobantes (ex fiscal_entity)

FISCAL (todo cuelga de cliente)
 ├─ comprobante ── comprobante_alicuota      (+ catálogo global comprobante_tipo)
 ├─ iva_declaracion                          (F2051 scrapeada, por período)
 ├─ iibb_liquidacion
 ├─ deuda / vencimiento
 ├─ notificacion ── notificacion_adjunto
 └─ proyeccion_impuesto / riesgo_snapshot

SUELDOS (cuelga de cliente; catálogos LSD globales)
 ├─ empleado ── empleado_afiliacion ── empleado_lsd
 ├─ recibo ── recibo_concepto
 ├─ concepto (catálogo global) ── cliente_concepto (override/fórmula)
 ├─ convenio ── convenio_categoria ── escala_salarial
 ├─ cliente_empleador_config                 (satélite de cliente)
 └─ catálogos: situacion, condicion, modalidad, actividad, zona, provincia,
    localidad, nacionalidad, siniestrado, tipo_empresa, obra_social, parametros_periodo

CONTABILIDAD (cuelga de cliente)
 ├─ ejercicio ── periodo_contable
 ├─ cuenta (plan global) ── cliente_cuenta (override)
 ├─ asiento ── asiento_linea (origen tipado)
 ├─ eecc (estados contables) / anexo_cmv / bien_de_uso
 └─ regla_mapeo ── regla_mapeo_linea

BANCOS (cuelga de cliente)
 └─ cuenta_bancaria ── movimiento_bancario ── conciliacion_comprobante

PORTAL / GESTIÓN
 ├─ documento
 ├─ solicitud (estudio → cliente)
 ├─ alerta
 └─ acceso_usuario_cliente (permisos finos por usuario)

AGENTES / IA (primera clase, no infra)
 ├─ agent_conversation ── agent_message
 ├─ agent_run                 (ejecución con costo/modelo/resultado; FK de datos escritos por IA)
 ├─ agent_action              (acción propuesta por IA → aprobada/rechazada por humano)
 └─ evento                    (trail generalizado: qué cambió, quién/qué, cuándo)

INFRA (inglés)
 ├─ job ── job_log            (scraper)
 └─ organization_module       (feature flags por tenant)
```

---

## 4. Dominio 1: Identidad fiscal (el corazón) ✅ (revisado 30/07)

### El error conceptual del modelo actual

Hoy `representative` (login AFIP) es el **padre** de `client` (la empresa cliente). Eso invierte la
realidad: el login es un **medio de acceso**, no una entidad de negocio. Consecuencias
conocidas: clientes "espejo" autocreados, clientes que dependen de qué clave los scrapea,
y redundancia de campos entre ambas tablas ("¿cuál vale?").

### Modelo ideal

```sql
cliente (
  id, org_id (idx),
  cuit              text unique per org,
  razon_social      text,
  tipo_persona      enum('fisica','juridica'),
  condicion_iva     enum('responsable_inscripto','monotributista','exento','no_alcanzado'),
  estado            enum('activo','pausado','baja'),      -- relación con el estudio
  baja_motivo       text, baja_at timestamptz,
  email, telefono, domicilio,                              -- contacto simple inline
  notas             text
)

credencial_afip (
  id, org_id (idx),
  cuit              text,            -- CUIT que loguea (persona física o jurídica)
  clave             text,            -- cifrada AES-256-GCM
  nombre, email, telefono text,      -- ✅ contacto opcional de la persona del login
                                     --    (para avisarle si tiene que presentar algo,
                                     --     sin crear un "cliente fantasma")
  estado            enum('activa','clave_invalida','bloqueada'),
  ultimo_login_ok   timestamptz,
  verificada_at     timestamptz      -- última vez que la clave funcionó
)

cliente_credencial (                  -- espejo de las "relaciones de clave fiscal" de AFIP
  id, cliente_id (idx), credencial_id (idx),
  fuente            enum('discovery','manual'),
  afip_contribuyente_id int,          -- id interno de AFIP FES
  preferida         boolean,          -- cuál usar para scrapear si hay varias
  unique(cliente_id, credencial_id)
)
```

### Decisiones cerradas (30/07)

- ✅ La persona física del login NO es entidad: contacto opcional (`nombre`, `email`,
  `telefono`) inline en `credencial_afip`. Solo se crea `cliente` si el estudio lo da de
  alta.
- ✅ **Discovery NO guarda relaciones no-cliente** como filas de cliente: solo matchea
  contra clientes ya cargados. Los CUITs desconocidos se registran en `evento`
  (tipo `deteccion`, actor job, detalle jsonb con los CUITs vistos) — trazable y
  consultable por agentes ("apareció este CUIT nuevo, ¿lo damos de alta?"), sin filas
  basura. El alta de cliente es siempre decisión del contador.
- ✅ Estados: `cliente` = activo/pausado/baja (relación comercial); `credencial_afip` =
  activa/clave_invalida/bloqueada (operativo). No hacen falta más.
- ✅ `contraparte` es **global** (no tenant-scoped): un CUIT es el mismo para todos.
- ✅ **Nombre de la entidad central: `cliente`** (no `empresa` — un monotributista persona
  física también es cliente del estudio; `tipo_persona` lo distingue). Renombre en cascada:
  `cliente_credencial`, `cliente_empleador_config`, `cliente_eecc_config`,
  `cliente_concepto`, `cliente_cuenta`, `cliente_id` en todo el modelo.

### Por qué así

- **N:M refleja AFIP**: una clave fiscal accede a varios clientes, y un cliente puede
  estar delegado a más de una clave. Hoy es 1:N forzado — si el contador cambia la
  delegación en AFIP, en el sistema hay que "mover" el cliente de representante.
- **Los espejos desaparecen por diseño**: la persona física del login solo existe como
  `cliente` si el estudio la da de alta. El discovery de relaciones puebla
  `cliente_credencial`, no crea clientes.
- **La clave se puede rotar sin tocar clientes**; el estado de la credencial
  (`clave_invalida`) es información operativa clave que hoy no existe (se descubre cuando
  el job falla).
- `cliente` queda **delgado** (~12 columnas): identidad + relación con el estudio. Todo lo
  demás es configuración modular (satélites en sus dominios).
- **`contraparte`** (ex `fiscal_entity`): catálogo global de CUITs vistos en comprobantes,
  con provincia y fuente (padrón/nosis/manual). No es tenant-scoped: un CUIT es el mismo
  para todos. Igual que hoy, con nombre honesto.

### Config modular (satélites de cliente, cada uno en su dominio)

```sql
cliente_empleador_config (   -- SUELDOS: solo existe si liquida sueldos
  cliente_id pk/fk,
  tipo_empresa_id, mipyme, seguro_colectivo, orden_cln,
  situacion_default_id, condicion_default_id, actividad_default_id,
  modalidad_default_id, siniestrado_default_id, zona_default_id, obra_social_default_id,
  firma_empleador, plantilla_empleado_id, usa_lsd_referencia
)
cliente_eecc_config (        -- CONTABILIDAD: membrete de estados contables
  cliente_id pk/fk,
  actividad_principal, fecha_inscripcion_rpc, numero_igj, cierre_ejercicio_mes,
  firmante_id → firmante     -- quién firma los balances de este cliente
)

firmante (                   -- contadores que firman EECC (N por estudio)
  id, org_id (idx),
  nombre, titulo, universidad, consejo, tomo, folio,
  firma_imagen_key text      -- archivo en R2, no base64 en BD
)
```

> La existencia de la fila **es** el flag: `liquida_sueldos` = existe
> `cliente_empleador_config`. Adiós booleans duplicados en dos tablas.

---

## 5. Dominio 2: Fiscal / comprobantes ✅ (revisado 30/07)

(Diseño F3 del plan anterior, integrado acá.)

### Decisiones cerradas (30/07)

- ✅ Factura en dos tablas: `comprobante` (cabecera) + `comprobante_alicuota` (una fila
  por alícuota real). Adiós a las 10 columnas fijas de IVA.
- ✅ `direccion enum('emitido','recibido')` — reemplaza el `direction` text
  `Inbound`/`Outbound` (fuente de bugs por capitalización).
- ✅ Catálogo global `comprobante_tipo` con `es_nc` / `discrimina_iva` — la semántica de
  NC sale del dato, no de listas hardcodeadas.
- ✅ Sin columnas especulativas (cobro/pago, link NC→factura): se agregan el día que
  exista la feature.
- ✅ La clave única incluye `contraparte_id`: en los comprobantes recibidos el número lo
  pone el emisor, así que dos proveedores mandan el mismo punto de venta + número
  (304 casos reales). Con contraparte, las 73.431 filas son únicas.
- ✅ `contraparte` pasa a `(doc_tipo, doc_nro)` — no todo es CUIT: 31.116 DNIs distintos
  de consumidor final. `invoice.receipt_province` desaparece: la provincia vive solo en
  contraparte.
- ✅ `deuda`, `vencimiento` y `notificacion` cuelgan de un CUIT, no de un cliente:
  `cuit` + `credencial_id` (de qué login salió) + `cliente_id` nullable. AFIP también
  devuelve las obligaciones del titular del login, y el CSV de vencimientos ni siquiera
  trae CUIT por fila (hoy 963/963 vencimientos son del login).

```sql
comprobante (
  id, cliente_id (idx), org_id (idx),
  direccion         enum('emitido','recibido'),
  tipo_afip         smallint → comprobante_tipo,     -- catálogo global: letra, es_nc, discrimina_iva
  punto_venta int, numero bigint,
  fecha_emision     date (idx),
  periodo_fiscal    date,                            -- generada: date_trunc('month', fecha_emision)
  contraparte_id    → contraparte,
  moneda char(3), cotizacion numeric(15,4),
  neto_gravado, neto_no_gravado, exento, otros_tributos, total   numeric(15,2),
  cae text, cae_vencimiento date,
  fuente            enum('scraper','manual','import','ai'),   -- + ai_run_id si fuente='ai'
  unique(cliente_id, direccion, tipo_afip, punto_venta, numero)
)
comprobante_alicuota (
  id, comprobante_id (fk cascade, idx),
  alicuota numeric(5,2),        -- 21.00, 10.50, 27.00, 5.00, 2.50, 0.00
  neto numeric(15,2), iva numeric(15,2)
)
```

- Los importes **siempre positivos** + `es_nc` en el catálogo; el signo lo pone el cálculo
  según arts. 11/12 Ley IVA (regla ya validada en `iva-calc.ts`).
- `iva_declaracion` (ex iva_scrape): por `(cliente_id, periodo date)`, campos del F2051.
  Es el dato de contraste, nunca se calcula.
- `deuda` y `vencimiento`: como hoy pero con `periodo date`, montos numeric y enums.
- `notificacion` + `notificacion_adjunto` (hoy el adjunto se llama `invoice_attachment` —
  nombre heredado de un uso anterior).

## 6. Dominio 3: Sueldos ✅ (revisado 30/07)

### Decisiones cerradas (30/07)

- ✅ `empleado` se parte en 3: identidad / `empleado_afiliacion` / `empleado_lsd`.
- ✅ Conceptos unificados: `concepto` (catálogo global inmutable, códigos SOS/AFIP) +
  `cliente_concepto` (habilitación + fórmula por cliente). Desaparecen las 3 tablas
  paralelas.
- ✅ Nombres cortos sin apego a los `liquidacion_import_*`: `empleado`, `recibo`,
  `recibo_concepto`.
- ✅ Criterio de idioma ratificado (principio 1): si la tabla la entiende un contador →
  castellano; si solo la entiende un programador (infra) → inglés.

### Ajustes al construir el schema/ETL (30/07, a validar con Gastón)

- ⚠️ **`empleado` quedó en UNA tabla, no en 3.** El split se había decidido sobre 53
  columnas, pero 6 están 100% vacías (`porcentaje_aporte_adicional_ss`, `lugar_pago`,
  `cbu`, `adherentes`, `zona_id`, `fecha_antiguedad_reconocida`), 6 son códigos LSD
  guardados por duplicado en texto (`codigo_zona`, `codigo_situacion`, …) además de la FK,
  y `modo_contrato`/`fecha_ingreso` son redundantes. Quedan ~32 columnas de la misma
  granularidad; `empleado_afiliacion` habría tenido una sola columna (obra social) y
  `empleado_lsd` seis FKs. Partirlo agregaba 2 joins sin separar nada.
- ⚠️ **`payroll_concepto` colgaba del representante, no del cliente.** 15 de 37 filas son
  de reps con más de un cliente. El ETL **replica** el concepto a todos los clientes del
  rep y avisa (todos son "Asignación no remunerativa acuerdo 03/2026", el mismo concepto
  de convenio). Alternativa si el estudio lo prefiere: fallar y cargarlo a mano.
- ⚠️ **La clave única de `recibo` incluye `fuente`.** Hay 5 casos de un mismo
  empleado/período con un recibo `import` (del SOS) y otro `calculo` (de la app) con netos
  distintos — no son duplicados, son justamente la diferencia a revisar.
- ⚠️ **Se conservan las columnas LSD/F931 vacías** del recibo (situación de revista 2 y 3,
  `importe_a_detraer_ley27430`, `importe_maternidad_art13`,
  `contribucion_tarea_diferencial`, `contribucion_adicional_os`): están 0/175 porque la
  app todavía no las liquida, pero son legalmente obligatorias.
- ⚠️ **`empleado.zona_id` queda null en los 241.** `codigo_zona` = "1" es del sistema SOS y
  el catálogo AFIP usa códigos de 4-5 dígitos; no hay tabla de equivalencia. Pendiente:
  mapear zona SOS → zona AFIP (hoy el LSD no puede declarar reducción de zona).
- `concepto.numero` (número SOS) es la PK natural del catálogo y además define el orden del
  recibo y los subtotales (`sub1_199` = suma de conceptos 1 a 199).
- `lsd_perfil_concepto.codigo_contribuyente` matchea `numero_sos` en 346/349 filas → el
  espacio de códigos ES la numeración SOS, pero `codigo_propio` se mantiene texto libre.
- `recibo_concepto` ahora apunta al concepto por FK: en el modelo viejo era un `codigo`
  texto y `concepto_id` estaba vacío en 2218 de 2233 filas.

El dominio mejor modelado hoy; cambios de forma y una unificación:

- **`empleado`** (ex `liquidacion_import_empleado`, 53 cols) se parte en:
  - `empleado`: identidad + datos laborales estables (~20 cols)
  - `empleado_afiliacion`: obra social, sindicato, ART
  - `empleado_lsd`: códigos AFIP (situación, condición, modalidad, actividad, zona)
- **`recibo`** (ex `liquidacion_import_recibo`) + **`recibo_concepto`** (ex
  `liquidacion_import_concepto_valor`), `periodo date`, origen enum('import','manual').
- **Conceptos: una sola fuente de verdad.** `concepto` = catálogo global inmutable
  (códigos SOS/AFIP 1–620); `cliente_concepto` = habilitación + fórmula + base por cliente.
  Desaparecen `concepto_sos` y `conceptos_completos_sos` como tablas paralelas.
- Catálogos LSD: forma única `(id, codigo, descripcion, vigente bool)`.
- `convenio` / `convenio_categoria` / `escala_salarial` (+ `convenio_fuente` para el cron).

## 7. Dominio 4: Contabilidad ✅ (revisado 30/07)

### Decisiones cerradas (30/07)

- ✅ `movements` desaparece: lo absorbe `asiento` con `origen_tipo='manual'`.
- ✅ Origen tipado en asiento (`origen_tipo` + `origen_id`) en lugar del `source_id` pelado.
- ✅ **Módulo de bajo riesgo por ahora**: solo renombres y el origen tipado — no
  rediseñar más allá de eso hasta que el módulo tenga más uso real.

- `ejercicio` (ex fiscal_year) → `periodo_contable` (ex accounting_period).
- `cuenta`: plan de cuentas global + `cliente_cuenta` overrides (estructura actual, ok).
- `asiento` / `asiento_linea`: **origen tipado** — `origen_tipo enum('comprobante',
  'recibo','movimiento_bancario','manual') + origen_id uuid` con CHECK, en lugar del
  `source_id` uuid pelado de hoy.
- `eecc`, `anexo_cmv`, `bien_de_uso` (ex financial_statement, cmv_annex, fixed_asset).
- `regla_mapeo` / `regla_mapeo_linea` (ex ledger_mapping_rule).
- 🟡 `movements` (mayor manual actual): ¿sigue existiendo o lo absorbe `asiento`?

### Ajustes al construir el schema/ETL (30/07, a validar con Gastón)

- ⚠️ **Todo el módulo está vacío salvo el plan de cuentas.** 133 filas en
  `accounting_account` y **0 filas** en las otras 11 tablas (ejercicios, períodos, asientos,
  reglas, EECC, CMV, bienes de uso, firmas). Es diseño puro: barato de rehacer cuando el
  módulo se use de verdad.
- ⚠️ **`movements` NO se migra** (el ETL lo cuenta y avisa). Cuelga de `user_id`, no tiene
  cliente, ni cuenta contable, ni contrapartida: no se puede convertir en un asiento
  balanceado sin inventar datos. Si el estudio quiere conservarlas, hay que decidir a qué
  cliente y a qué cuenta van.
- ⚠️ **`accounting_log` tampoco se migra**: es trail de auditoría y en el modelo ideal eso
  vive en `evento` (Dominio 7). Se cuenta y se avisa.
- ⚠️ **Asientos automáticos sin `source_id` degradan a `origen_tipo='manual'`.** El CHECK
  exige que todo origen distinto de `manual` tenga `origen_id`; en vez de inventar un
  puntero, el ETL los pasa a manual y los cuenta.
- ⚠️ **`asiento_linea` pierde `client_id` y `period_id`** (estaban duplicados del asiento
  padre) y gana un CHECK que obliga a un solo lado: `(debe=0 y haber>0) o (debe>0 y haber=0)`.
- ⚠️ **`periodo_contable.periodo` es `date`** (1 del mes) en lugar del par `(year, month)`,
  coherente con el resto del modelo ideal.
- ⚠️ **`firmante` (ex `accountant_signature`) pasa a ser N por estudio**, con
  `firma_imagen_key` (R2) en vez de base64, y recién acá se crea la FK diferida
  `cliente_eecc_config.firmante_id → firmante.id` que quedó pendiente del Dominio 1.
- ⚠️ **`eecc.pdf_key` reemplaza `pdf_url`** (mismo criterio: los binarios van a R2, la BD
  guarda la key).
- `cuenta` tiene CHECK de coherencia: `alcance='base'` ⇒ `cliente_id is null`;
  `alcance='propia'` ⇒ `cliente_id not null`. Las 133 cuentas actuales son todas `base`.
- `account_override` → `cliente_cuenta` (0 filas hoy).
- Enums traducidos a castellano (`deudor/acreedor/ambos`, `administracion/comercializacion/
  financiero/otro`, `operativa/inversion/financiacion`, …); el ETL falla ruidoso ante un
  valor no mapeado.

## 8. Dominio 5: Bancos ✅ (revisado 30/07)

- ✅ **Entra al modelo ideal** (decisión 30/07).
- `cuenta_bancaria` / `movimiento_bancario` / `conciliacion_comprobante` — modelo actual
  renombrado, con `cliente_id` (hoy cuelga de representative, error del modelo viejo).

### Ajustes al construir el schema/ETL (30/07, a validar con Gastón)

- ⚠️ **Las 3 tablas están en 0 filas.** Como el Dominio 4, esto es diseño puro: el ETL está
  escrito y probado pero no mueve nada todavía.
- ⚠️ **`cuenta_bancaria.cliente_id` pasa a NOT NULL** (hoy es `representative_id` NOT NULL +
  `client_id` opcional). El ETL resuelve el cliente cuando el login tiene uno solo; si tiene
  varios, **no migra la cuenta y avisa** — es un dato que hay que decidir a mano, no adivinar.
- ⚠️ **`movimiento_bancario.importe` es siempre positivo** con CHECK, y el signo lo da
  `direccion enum('ingreso','egreso')` **visto desde el cliente** (ingreso = entró plata a su
  cuenta). No se usa el criterio del banco, que lo ve al revés. Mismo criterio que ya usamos
  en comprobantes.
- ⚠️ **La contraparte del movimiento sale del catálogo global** (`contraparte_id`, dominio 1)
  en vez de los dos textos sueltos `counterparty_name`/`counterparty_identity_number`. Se
  conserva `contraparte_texto` con lo que dice el extracto cuando no se logra identificar el
  CUIT.
- ⚠️ **`conciliacion_comprobante` gana `importe_conciliado`.** El modelo viejo unía
  movimiento ↔ factura sin decir por cuánto, así que no podía representar un pago que cancela
  3 facturas ni una factura pagada en cuotas. Con el importe, la relación N:N funciona de
  verdad. El ETL, al migrar, asume el total del movimiento (el dato viejo no existe).
- ⚠️ **`match_type` (texto libre) se parte en dos**: `fuente dato_fuente` (quién lo hizo:
  manual / ai / import) y `estado enum('sugerida','confirmada','rechazada')`. Las rechazadas
  se guardan justamente para no volver a proponerlas.
- `cuenta_bancaria.cuenta_contable_id` → cuenta del plan de cuentas (dominio 4). Sin ese
  enlace no se puede generar el asiento automático del movimiento.
- Deduplicación de importaciones: índice único `(cuenta_bancaria_id, id_externo)` + se
  conserva `datos_crudos jsonb` con la fila original del extracto.
- `saldo_posterior` (el saldo que informa el extracto) sirve para detectar movimientos
  faltantes en una importación.
- El asiento NO se apunta desde el movimiento: ya lo apunta
  `asiento.origen_tipo='movimiento_bancario' + origen_id` (dominio 4).

## 9. Dominio 6: Portal / gestión ✅ (revisado 30/07)

### Decisiones cerradas (30/07)

- ✅ Permisos por **cliente** (no por credencial): `acceso_usuario_cliente`.
- ✅ El módulo se usa hoy → entra completo al modelo ideal.

- `documento` (por cliente), `solicitud` (ex representative_request → por cliente),
  `alerta`, `acceso_usuario_cliente` (ex representative_user_access — pasa a granularidad
  cliente, coherente con el modelo nuevo).
- `riesgo_snapshot`, `proyeccion_impuesto` (hoy client_risk_snapshot, tax_projection).

### Ajustes al construir el schema/ETL (30/07, a validar con Gastón)

- ⚠️ **Los 531 documentos son base64 dentro de la BD** (24,6 MB en la columna `url`), y las
  columnas que existían para R2 (`storage_key`, `mime_type`, `size_bytes`, `checksum`) están
  **todas vacías**. En el ideal `documento` guarda solo la referencia: el ETL migra los
  metadatos (calcula tamaño y SHA-256 reales) y deja `storage_key` null. **La subida a R2 es
  un paso aparte que todavía no se hizo** — el binario sigue únicamente en NEW_DB.
- ⚠️ **El `type` del documento era la extensión que dijo quien lo subió, y en 70 casos estaba
  mal** (había un "traba igb" que en realidad es un PDF). El ETL deduce el `mime_type` del
  contenido (magic bytes), no del nombre.
- ⚠️ **`alert.source_entity_id` NO es el id del job**: es una clave de deduplicación
  `"<representante>:<tipo de job>:<categoría de error>"` (183 valores distintos en 207
  alertas). El job real estaba escondido en `metadata.jobId` — el ETL lo usa como `origen_id`
  (207/207 resueltos, todos existen en `job`). La FK a `job` se agrega en el dominio de infra.
- ⚠️ **`documento` cuelga de la credencial, no del cliente** (mismo criterio que deuda /
  vencimiento / notificación: AFIP los entrega por login). `cliente_id` se completa desde la
  notificación que adjunta el documento: quedan **26 sin cliente** de 531.
- ⚠️ **Las 207 alertas son todas `scraper_error` de un job y ninguna tiene cliente.** El enum
  `alerta_tipo` arranca con un solo valor a propósito (no inventamos tipos que no existen);
  agregar valores después es barato.
- ⚠️ **83 alertas están `resolved` sin `resolved_at`** (147 resueltas, 64 con fecha). Se
  migran tal cual — es un dato roto de origen, no algo que arregle el ETL. El CHECK del ideal
  lo permite, pero conviene que la app empiece a escribir la fecha.
- ⚠️ **`invoice_attachment` → `notificacion_adjunto`**: el nombre viejo no tenía nada que ver
  con facturas, son los adjuntos de las notificaciones de AFIP (494 filas, 100% con
  notificación y documento válidos).
- ⚠️ **`acceso_usuario_cliente` cambia de granularidad**: el acceso viejo era al login entero.
  El ETL abre un acceso por cada cliente de ese login y avisa cuando son varios (hoy 0 filas,
  así que no afecta a nadie).
- ⚠️ **`solicitud.cliente_id` pasa a NOT NULL** (antes `representative_id` NOT NULL +
  `client_id` opcional): se le pide algo a un cliente, no a un login.
- `riesgo_snapshot` / `proyeccion_impuesto` usan `periodo date` y enums en castellano
  (`bajo/medio/alto/critico`, `baja/media/alta`). El impuesto pasa a enum: hoy la app solo
  proyecta IVA.
- 6 documentos tienen contenido duplicado (mismo SHA-256) — con el checksum en la BD eso se
  puede detectar y desduplicar al subir a R2.

## 10. Dominio 7: Agentes / IA (primera clase) ✅ (revisado 30/07)

### Decisiones cerradas (30/07)

- ✅ Flujo `agent_action` (IA propone → humano aprueba → se ejecuta) confirmado como el
  modelo de producto.
- ✅ Auditadas las 24 tablas con 0 filas en NEW_DB: 18 pertenecen a módulos ya decididos
  (contabilidad, bancos, portal, IA) y quedan; `verification` es de Better Auth.
- ✅ Afuera del modelo ideal: `account_override` (lo cubre `cliente_cuenta`),
  `accounting_log` (lo cubre `evento`), `representative_balance_config` (su contenido va
  a `cliente_eecc_config`).
- ✅ `accountant_signature` NO desaparece: se rediseña como **`firmante`** (N por estudio,
  datos de matrícula, `firma_imagen_key` en R2 en vez de base64 en BD) +
  `cliente_eecc_config.firmante_id` (quién firma los balances de cada cliente).

El corazón del producto AI-FIRST. No es "infra": es el dominio donde vive la interacción
humano ↔ agente.

```sql
agent_conversation ── agent_message      -- como hoy, tenant-scoped
agent_run (
  id, org_id, conversation_id?,
  tipo enum('chat','alerta','clasificacion','proyeccion','revision', ...),
  modelo text, costo numeric, resultado enum('ok','error','cancelado'),
  input/output jsonb
)
agent_action (                            -- humano-aprueba-IA-ejecuta
  id, agent_run_id, org_id, cliente_id?,
  tipo text, payload jsonb,
  estado enum('propuesta','aprobada','rechazada','ejecutada'),
  decidido_por → user, decidido_at
)
evento (                                  -- ex data_source_event, generalizado
  id, org_id, cliente_id?,
  entidad text, entidad_id uuid,          -- qué fila cambió
  tipo enum('alta','cambio','baja','deteccion'),
  actor_tipo enum('user','job','agent'), actor_id,
  detalle jsonb, at timestamptz
)
```

- Todo dato de hechos escrito por IA lleva `fuente='ai'` + `ai_run_id → agent_run`
  (y `ai_confidence` donde tenga sentido, ej. clasificación de movimientos).
- `evento` es la memoria consultable de los agentes: "¿ya avisamos esta deuda?",
  "¿cuándo apareció esta notificación?" — hoy eso no se puede responder.

## 11. Infra (inglés, casi igual que hoy)

- `job` / `job_log`: el job pasa a referenciar `credencial_afip` (la unidad de scrapeo es
  el login) y opcionalmente `cliente_id` cuando aplica.
- `organization_module`: feature flags por tenant, estructura actual.
- ✅ Auditoría de tablas 0-filas cerrada (ver decisiones en §10).

### Ajustes al construir el schema/ETL (30/07, a validar con Gastón)

- ⚠️ **`ai_run_id` se agrega a las 8 tablas de hechos** (`comprobante`, `iva_declaracion`,
  `asiento`, `movimiento_bancario`, `conciliacion_comprobante`, `documento`, `recibo`,
  `empleado`) con un CHECK que lo hace obligatorio: `(fuente = 'ai') = (ai_run_id is not
  null)`. O sea: **la BD no deja escribir un dato marcado como hecho por IA sin decir qué
  corrida lo hizo** — el principio AI-FIRST deja de ser una convención y pasa a ser una regla.
- ⚠️ **`agent_run` se rediseñó según §10**: `tipo` tipado (chat / alerta / clasificacion /
  proyeccion / revision) en lugar del `intent` texto libre, + `modelo` y `costo` (para poder
  cortar el gasto de IA por cliente o por tipo), y `resultado` null = todavía corriendo.
  `user_id` pasa a nullable: una corrida disparada por un cron no tiene persona detrás.
- ⚠️ **`agent_action` es tabla nueva** (no existe en el modelo viejo) con dos CHECKs que
  hacen cumplir el flujo: sin decisión no hay `decidido_at`, y sin `ejecutado_at` no está
  ejecutada. El agente nunca escribe directo sobre los datos del estudio.
- ⚠️ **`job.cliente_id` queda null en los 17.743.** El modelo viejo nunca guardó de qué
  empresa era el job y en `params` tampoco está: la unidad de scrapeo es el login. La columna
  queda para los jobs de una empresa puntual que se hagan de acá en adelante.
- ⚠️ **`job_log` y `agent_message` quedan sin `updated_at`**: son append-only. Un log que se
  puede editar no es un log.
- ⚠️ **`agent_message.confidence` desaparece** (0/205 usados, y la confianza real es de la
  corrida, no del mensaje). Se conservan `tool_calls` y `citas`: sin citas una respuesta
  contable no es verificable.
- ⚠️ **El ETL 7 NO puede usar `truncate cascade`.** `alerta` referencia `job` y **todos los
  hechos referencian `agent_run` vía `ai_run_id`**: un truncate cascade vacía media BD (pasó
  en la primera corrida). Usa `delete` y deja que las FKs `on delete set null` desenganchen.
- ⚠️ **Orden de los ETL**: D6 carga `alerta` antes de que exista `job`, así que deja
  `origen_id` en null y **D7 religa las 207** cuando el job ya está. Los dos scripts son
  re-ejecutables en ese orden.
- ⚠️ **Gap encontrado al cerrar: `iibb_liquidacion` (1 fila) no estaba en ningún dominio.**
  Se agregó como `liquidacion_iibb` al Dominio 2, con `periodo date` y `cliente_id` (su
  `profile_id` era en realidad el client — nombre heredado de un rediseño que nunca pasó).
- ✅ **Cobertura final: las 77 tablas de NEW_DB están resueltas.** Solo quedan sin migrar,
  a propósito: `concepto_sos` (37, subconjunto 100% de `conceptos_completos_sos`),
  `empleados_categorias` (54, semilla de scraping sin FK) y `movements` / `accounting_log` /
  `account_override` / `representative_balance_config` / `data_source_event` — **todas con 0
  filas**, así que no se pierde ningún dato.

---

## 12. Qué desaparece en el modelo ideal

| Hoy | Destino ideal |
|---|---|
| `representative` | se parte en `credencial_afip` (acceso) + eventual `cliente` (si el estudio lo da de alta) |
| clientes "espejo" | no existen — `cliente_credencial` modela la relación |
| `concepto_sos` + `conceptos_completos_sos` + `payroll_concepto` | `concepto` global + `cliente_concepto` |
| 10 columnas IVA de `invoice` | `comprobante_alicuota` |
| campos duplicados rep/client (`fiscal_condition`, `liquida_sueldos`...) | viven solo en `cliente` / satélites |
| períodos text (6 formatos) | `date` en todos lados |
| `movements` | lo absorbe `asiento` (`origen_tipo='manual'`) |
| `account_override` | lo cubre `cliente_cuenta` |
| `accounting_log` | lo cubre `evento` |
| `representative_balance_config` | contenido a `cliente_eecc_config` |
| `accountant_signature` | rediseñada como `firmante` (N por estudio, imagen en R2) |
| prompt "TRAMPAS CONOCIDAS" del SQL-agent | casi vacío — la semántica vive en el schema |

## 13. Próximos pasos

1. Revisar juntos dominio por dominio (empezando por Identidad fiscal, §4 — es la
   decisión que condiciona todo lo demás).
2. Cerrada la revisión: mapa actual → ideal tabla por tabla y columna por columna.
3. Plan de migración incremental (las fases F3-F5 del plan anterior se rehacen en
   función de este modelo).

> Lo ya aplicado (F1 índices/timestamps, F2 limpieza/org_id/períodos date generados) es
> compatible con cualquier destino: era higiene, no modelado.
