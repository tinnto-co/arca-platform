# Changelog — Agente AI
**Período:** 27 y 28 de Mayo 2026
**Archivo principal:** `src/routes/api/agent.ts`

---

## Contexto: por qué se hicieron estos cambios

La base de datos fue migrada. La tabla `profile` (que representaba la entidad fiscal individual con CUIT propio) fue eliminada. Sus responsabilidades se dividieron entre dos tablas:

- **`representative`** — el login AFIP (persona física que entra con usuario y clave a AFIP). Tiene la columna `organization_id` que se usa para el filtro de seguridad multi-tenant.
- **`client`** — ahora es la entidad fiscal individual (lo que antes era `profile`). Tiene CUIT propio, facturas, IVA, empleados.

La jerarquía cambió de:
```
organization → client → profile → (facturas, IVA, empleados...)
```
a:
```
organization → representative → client → (facturas, IVA, empleados...)
```

El código del agente seguía referenciando `profile` y `client.organizationId`, por lo que era necesario actualizarlo.

---

## Cambios del 27 de Mayo

### 1. Bloque de constantes de schema (nuevo)

Se agregó un bloque de constantes al principio del archivo, antes de la definición del agente. El objetivo es que si cambia el schema de la DB (renombrar una columna, cambiar una FK), solo haya que tocar ese bloque y no cada línea del código.

```typescript
const T_ENTITY            = client           // tabla "entidad fiscal"
const COL_ENTITY_ID       = client.id
const COL_ENTITY_NAME     = client.name
const COL_ENTITY_CUIT     = client.identityNumber
const COL_ENTITY_OWNER_FK = client.representativeId  // FK al login AFIP

const T_OWNER       = representative         // tabla "login AFIP"
const COL_OWNER_ID  = representative.id
const COL_OWNER_ORG = representative.organizationId  // filtro multi-tenant

const COL_IVA_ENTITY_FK     = ivaScrape.clientId    // antes: ivaScrape.profileId
const COL_INVOICE_ENTITY_FK = invoice.clientId      // antes: no existía como profileId
```

### 2. Helper `formatAsMarkdownTable` (nuevo)

Función TypeScript normal (no un tool) que convierte un array de objetos en una tabla Markdown. Puede ser llamada desde cualquier tool directamente sin pasar por el modelo.

```typescript
function formatAsMarkdownTable(headers: string[], rows: Record<string, unknown>[]): string
```

### 3. Corrección del filtro de seguridad multi-tenant

**Antes (incorrecto):**
```sql
WHERE client.organization_id = 'orgId'   -- client ya no tiene esta columna
```

**Después (correcto):**
```sql
JOIN representative r ON r.id = client.representative_id
WHERE r.organization_id = 'orgId'
```

Este cambio se aplicó en:
- El texto de `buildSchema()` (descripción del schema para el modelo)
- El system prompt del agente
- El error message del validador de `executeQuery`

### 4. Reescritura completa de `buildSchema()`

La función que genera la descripción del schema para el LLM fue reescrita de cero:
- Eliminada la tabla `profile` (ya no existe)
- Agregada la tabla `representative` con su descripción
- Actualizada la descripción de `client` (ahora es la entidad fiscal final)
- Corregidos todos los join chains
- Actualizado `iva_scrape`: ahora tiene `client_id` (antes `profile_id`)
- Actualizado `liquidacion_import_empleado`: ahora tiene `client_id` (antes `profile_id`)
- Eliminada la instrucción `WHERE profile_id IS NOT NULL` de `notification` (ya no tiene ese campo)
- Actualizadas las "Trampas conocidas"

### 5. Corrección de `getIvaPosition`

El tool tenía referencias rotas a la tabla `profile`:
- `profile.client` → eliminado, ahora busca directamente en `client`
- `ivaScrape.profileId` → reemplazado por `COL_IVA_ENTITY_FK` (`ivaScrape.clientId`)
- `invoice.profile` → reemplazado por `COL_INVOICE_ENTITY_FK` (`invoice.clientId`)
- El loop sobre "profiles" fue eliminado — ahora trabaja directamente con la entidad fiscal encontrada
- Se eliminó el parámetro `profileName` del inputSchema (el concepto de perfil ya no existe)
- Se agregó `try-catch` completo + logging (`console.info` al inicio, `console.error` en el catch)

### 6. Corrección del import

Se agregó `representative` al import de `@/drizzle/schema`, que faltaba y era necesario para el bloque de constantes.

---

## Cambios del 28 de Mayo

### 7. Tool `listRepresentative` (nueva)

Lista todos los representantes (logins AFIP) de la organización.

- **Input:** ninguno (usa `orgId` del contexto de sesión)
- **Output:** nombre, CUIT, condición fiscal, estado, fecha de alta AFIP
- **Propósito adicional:** sirve como ejemplo de referencia de cómo estructurar una tool simple

### 8. Tool `listClients` (nueva)

Lista todas las entidades fiscales (empresas) de la organización.

- **Input:** ninguno
- **Output:** tabla ya formateada con representante, CUIT del representante, empresa, CUIT de la empresa, estado
- **Orden:** por representante primero, luego por nombre de empresa
- **Patrón:** usa `formatAsMarkdownTable` directamente en el execute (no pasa por el modelo para formatear)

### 9. Tool `tableGenerator` — creada y eliminada

Se creó un tool `tableGenerator` para que el modelo pudiera formatear datos como tabla. Fue eliminado inmediatamente al identificar que no tiene sentido: el modelo ya sabe escribir tablas Markdown de forma nativa. Tenerlo como tool solo desperdiciaría pasos del ciclo del agente (`stopWhen: stepCountIs(5)`).

La lógica de formateo quedó correctamente en `formatAsMarkdownTable` como función helper.

### 10. Corrección silenciosa del stream (`getIvaPosition`)

Se detectó que el agente no respondía nada al consultar posición IVA. La causa: `getIvaPosition.execute` no tenía `try-catch`, entonces cualquier excepción mataba el stream HTTP silenciosamente devolviendo un 500 sin cuerpo.

Se agregó:
- `console.info` al inicio del execute para confirmar que se llama
- `try-catch` completo que captura el error, lo loguea en el servidor y lo devuelve al modelo como `{ error: "..." }` en lugar de matar el stream

### 11. Siete tools nuevas de consulta

Todas siguen el mismo patrón:
1. Buscar el cliente con Drizzle ORM (query tipada y segura)
2. Ejecutar la consulta de agregación con SQL crudo (`dbReadonly.execute(sql.raw(...))`)
3. Formatear el resultado con `formatAsMarkdownTable` cuando corresponde
4. `try-catch` con logging en todas

| Tool | Qué hace | Input |
|---|---|---|
| `getNotificaciones` | Total y sin leer por empresa | `clientName?` |
| `getMontosfacturacion` | Ventas y compras en ARS | `clientName?`, `periodo?` |
| `getFacturasPorTipo` | Facturas agrupadas por tipo AFIP | `clientName`, `periodo` |
| `getEmpresasConSueldos` | Empresas con liquidación de sueldos activa | — |
| `getEmpleados` | Total, activos e inactivos de una empresa | `clientName` |
| `getMontosNomina` | Básico, bruto, no rem., neto de nómina | `clientName`, `periodo` |
| `getConvenios` | CCT/convenios configurados para una empresa | `clientName` |

**Nota sobre períodos:**
- La mayoría de tools aceptan período en formato `MM/YYYY` (consistente con el estilo del usuario)
- `getMontosNomina` convierte internamente a `YYYY-MM` que es el formato de `liquidacion_import_recibo.periodo`

---

## Estado actual de tools en el agente

| Tool | Descripción resumida |
|---|---|
| `executeQuery` | SQL SELECT genérico con validación de seguridad |
| `getIvaPosition` | Posición IVA completa de una empresa para un período |
| `listRepresentative` | Lista logins AFIP de la organización |
| `listClients` | Lista empresas con representante y estado |
| `getNotificaciones` | Notificaciones por empresa |
| `getMontosfacturacion` | Montos de ventas y compras |
| `getFacturasPorTipo` | Facturas por tipo en un período |
| `getEmpresasConSueldos` | Empresas con sueldos activos |
| `getEmpleados` | Cantidad de empleados por empresa |
| `getMontosNomina` | Montos de nómina por empresa y período |
| `getConvenios` | CCT/convenios de una empresa |
