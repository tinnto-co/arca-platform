# Configuración de Agentes y Tools (AI)

Este documento explica cómo funciona el sistema de agente de IA en Arca Platform, qué es cada parte, y cómo agregar nuevas tools. Está orientado a alguien que no escribió el código original.

---

## ¿Qué es un agente de IA?

Un agente de IA es un modelo de lenguaje (en este caso Gemini) al que le damos:
1. **Instrucciones** de cómo comportarse (quién es, qué puede y no puede hacer).
2. **Herramientas (tools)** que puede ejecutar para obtener datos reales.
3. **Historial** de la conversación para tener contexto.

El modelo no accede a la base de datos directamente. Cuando necesita un dato, llama a una tool, espera el resultado, y con eso arma su respuesta. Vos como desarrollador definís las tools — el modelo decide cuándo y cómo usarlas.

---

## Dónde vive el código

```
src/routes/api/agent.ts   ← todo el agente vive acá
```

Este archivo es una ruta HTTP (`POST /api/agent`). Cuando el usuario manda un mensaje en el chat, el frontend hace un POST a esta ruta, y el servidor responde con un stream de texto en tiempo real.

---

## Estructura general del archivo

```
agent.ts
│
├── IMPORTS
│   └── tablas de DB, librerías de AI, Drizzle, etc.
│
├── MAPA DE SCHEMA (bloque de constantes)
│   └── alias de tablas y columnas — si cambia el schema, solo se toca acá
│
├── buildSchema(orgId)
│   └── función que genera el texto descriptivo del schema para el modelo
│       (el modelo lee esto para saber cómo escribir sus queries SQL)
│
└── Route handler (POST)
    ├── Autenticación y validación de sesión
    ├── Gestión de conversación (crear/leer historial)
    ├── Configuración del agente
    │   ├── model         → qué modelo usar
    │   ├── instructions  → system prompt (personalidad, reglas, herramientas disponibles)
    │   ├── tools         → las herramientas que puede llamar
    │   └── stopWhen      → cuántos pasos máximo antes de detenerse
    └── Respuesta en stream + guardado del historial
```

---

## El System Prompt (`instructions`)

El system prompt es el texto que le dice al modelo cómo comportarse. En Arca tiene varias secciones:

```
IDENTIDAD Y TONO         → quién es el agente, cómo habla
COMPORTAMIENTO           → reglas de conducta (no anunciar lo que va a hacer, etc.)
DATOS Y VERACIDAD        → nunca inventar datos, siempre ejecutar queries
AMBIGÜEDAD               → cómo manejar preguntas poco claras
FORMATO DE SALIDA        → cómo formatear montos, fechas, listas
SEGURIDAD                → no exponer passwords, siempre filtrar por orgId
SCHEMA DE BASE DE DATOS  → descripción de tablas, columnas y JOINs (generado por buildSchema)
REGLAS AL ESCRIBIR QUERIES → reglas SQL específicas
HERRAMIENTAS DISPONIBLES → lista de tools con cuándo usarlas
```

> **Importante**: el modelo NO tiene acceso directo a la DB. Todo lo que sabe sobre la estructura
> de la base de datos es lo que le describimos en el system prompt. Por eso `buildSchema()` es crítica
> — si está desactualizada, el modelo genera queries incorrectas.

---

## El Mapa de Schema (bloque de constantes)

Al principio del archivo hay un bloque de constantes que mapea nombres semánticos a columnas reales de Drizzle:

```typescript
// Tabla "entidad fiscal"
const T_ENTITY            = client
const COL_ENTITY_ID       = client.id
const COL_ENTITY_NAME     = client.name
const COL_ENTITY_CUIT     = client.identityNumber
const COL_ENTITY_OWNER_FK = client.representativeId

// Tabla "login AFIP"
const T_OWNER       = representative
const COL_OWNER_ID  = representative.id
const COL_OWNER_ORG = representative.organizationId   // filtro de seguridad

// FKs en otras tablas
const COL_IVA_ENTITY_FK     = ivaScrape.clientId
const COL_INVOICE_ENTITY_FK = invoice.clientId
```

**¿Para qué sirve esto?** En las tools, usamos estas constantes en vez de referencias directas.
Si mañana `ivaScrape.clientId` pasa a llamarse `ivaScrape.entityId`, el único cambio necesario es
una sola línea en este bloque — el resto del archivo no se toca.

---

## Anatomía de una Tool

Una tool tiene exactamente tres partes:

```typescript
nombreDeLaTool: tool({

  // 1. DESCRIPTION — para el modelo, no para vos
  //    El modelo lee esto para decidir CUÁNDO usar esta tool.
  //    Tiene que ser claro y específico.
  description: 'Qué hace este tool y cuándo usarlo.',

  // 2. INPUT SCHEMA — los parámetros que el modelo puede pasarte
  //    Usa Zod para definir tipos y validaciones.
  //    El modelo ve los .describe() para entender qué mandar en cada campo.
  inputSchema: z.object({
    campo1: z.string().describe('Qué representa este parámetro'),
    campo2: z.string().optional().describe('Parámetro opcional'),
  }),

  // 3. EXECUTE — la función real que se ejecuta
  //    Recibe los parámetros validados del inputSchema.
  //    Puede consultar la DB, llamar APIs, calcular lo que sea.
  //    Devuelve cualquier objeto — el modelo lo usa para redactar su respuesta.
  execute: async ({ campo1, campo2 }) => {
    const datos = await dbReadonly.select(...).from(...).where(...);
    return { datos, total: datos.length };
  },

}),
```

---

## Flujo completo de una conversación

```
Usuario escribe: "¿cuáles son los representantes?"
        │
        ▼
Frontend hace POST /api/agent con el mensaje
        │
        ▼
agent.ts autentica la sesión y obtiene orgId
        │
        ▼
Se carga el historial previo de la conversación (últimos 12 mensajes)
        │
        ▼
Se crea el agente con model + instructions + tools
        │
        ▼
El modelo recibe: historial + mensaje nuevo + system prompt
        │
        ▼
El modelo decide: "necesito llamar a listRepresentative"
        │
        ▼
Se ejecuta execute() → consulta la DB → devuelve { representantes: [...], total: 3 }
        │
        ▼
El modelo recibe el resultado y redacta:
"El estudio tiene 3 representantes: Juan Pérez (CUIT 20-111-1)..."
        │
        ▼
La respuesta se hace stream al frontend (se va mostrando letra a letra)
        │
        ▼
onFinish: se guarda el mensaje del usuario y la respuesta en agent_message
```

---

## Las tools actuales

### `executeQuery`
La más genérica. Le permite al modelo ejecutar cualquier query SQL SELECT contra la DB.

**Input:** `query` (el SQL) + `description` (una línea explicando qué busca).

**Seguridad:** antes de ejecutar, valida que:
- Sea un `SELECT` (bloquea cualquier otra cosa).
- Contenga el `orgId` en la query (evita que acceda a datos de otras organizaciones).
- Si no tiene `LIMIT`, le agrega `LIMIT 200` automáticamente.

**Cuándo la usa el modelo:** para cualquier consulta general — buscar clientes, facturas, deudas, empleados, vencimientos.

---

### `getIvaPosition`
Tool especializada para calcular la posición IVA de un cliente.

**Por qué existe si ya está `executeQuery`?** Porque la lógica de IVA es compleja: involucra cruzar facturas del mes con el scrape de AFIP del mes anterior, y aplicar fórmulas de débito/crédito fiscal. Sería muy difícil que el modelo genere esa lógica correctamente cada vez con SQL crudo. Esta tool encapsula toda esa lógica y devuelve un resultado listo para mostrar.

**Input:** `clientName` (búsqueda parcial) + `displayMonth` (mes en formato MM/YYYY, opcional).

**Qué hace internamente:**
1. Busca la entidad fiscal por nombre dentro de la organización.
2. Determina el período: el mes que el usuario quiere ver (facturas) y el mes anterior (iva_scrape).
3. Consulta `iva_scrape` para los saldos AFIP.
4. Consulta `invoice` para las facturas del mes.
5. Calcula débito/crédito fiscal con la función `calcularIvaDesdeFacturas`.
6. Devuelve el resultado completo.

---

### `listRepresentative`
La más simple, pensada también como ejemplo de referencia.

**Input:** ninguno (sin parámetros — solo necesita el `orgId` del contexto de sesión).

**Qué hace:** consulta todos los representantes de la organización y los devuelve.

**Por qué no tiene parámetros:** porque el `orgId` ya está disponible en el scope de la función
(viene de la sesión autenticada al principio del handler). No hace falta que el modelo lo pase.

---

## Cómo agregar una nueva tool

### Paso 1 — Definila en el objeto `tools`

Buscá el bloque `tools: {` dentro de `new ToolLoopAgent({...})` y agregá tu tool al final,
antes del cierre `},`:

```typescript
tools: {
  executeQuery: tool({ ... }),
  getIvaPosition: tool({ ... }),
  listRepresentative: tool({ ... }),

  // TU NUEVA TOOL ACÁ:
  miNuevaTool: tool({
    description: '...',
    inputSchema: z.object({ ... }),
    execute: async ({ ... }) => {
      // lógica
      return { ... };
    },
  }),
},
```

### Paso 2 — Registrala en el system prompt

En las `instructions`, buscá la sección `HERRAMIENTAS DISPONIBLES` y agregá una línea:

```
- miNuevaTool: descripción breve de cuándo el modelo debe usarla.
```

Si no lo hacés, el modelo no sabe que la tool existe aunque esté definida.

### Paso 3 — Usá las constantes del mapa de schema

Si tu tool consulta la DB, usá las constantes del bloque superior en vez de referencias directas:

```typescript
// Bien:
.from(T_ENTITY)
.where(eq(COL_ENTITY_ID, someId))

// Evitar:
.from(client)
.where(eq(client.id, someId))
```

---

## Seguridad: multi-tenancy

Arca es una plataforma multi-tenant: múltiples estudios contables usan el mismo sistema,
y cada uno solo puede ver sus propios datos. El mecanismo es el `orgId`.

**Cómo funciona:**
- Al inicio del handler, se obtiene `orgId` de la sesión autenticada.
- Toda consulta a la DB debe filtrar por este `orgId`.
- En el schema actual, el `orgId` vive en `representative.organization_id`.
- El join necesario para llegar a él desde otras tablas es siempre:
  ```sql
  JOIN representative r ON r.id = <tabla>.representative_id
  WHERE r.organization_id = 'orgId'
  -- o para tablas con client_id:
  JOIN client c ON c.id = <tabla>.client_id
  JOIN representative r ON r.id = c.representative_id
  WHERE r.organization_id = 'orgId'
  ```

**En las tools tipadas (Drizzle):** usás `COL_OWNER_ORG` y el JOIN a `T_OWNER`.

**En `executeQuery` (SQL crudo):** el handler valida que la query contenga el `orgId` como string
antes de ejecutarla. Si no está, la rechaza con error.

---

## Tabla de referencia rápida

| Concepto | Qué es | Dónde se configura |
|---|---|---|
| `description` de la tool | Le dice al modelo cuándo usarla | Dentro de cada `tool({...})` |
| `inputSchema` | Parámetros que el modelo puede pasar | `z.object({...})` con Zod |
| `execute` | La función real que corre | `async ({params}) => {...}` |
| System prompt | Personalidad y reglas del agente | `instructions:` en `ToolLoopAgent` |
| `buildSchema()` | Descripción del schema para el modelo | Función al principio del archivo |
| Mapa de schema | Alias de columnas para el código | Bloque de constantes al principio |
| `stopWhen: stepCountIs(5)` | Límite de pasos del agente | Parámetro de `ToolLoopAgent` |
| `dbReadonly` | Conexión de solo lectura a la DB | Importado de `@/lib/db` |
