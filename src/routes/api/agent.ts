import { createFileRoute } from '@tanstack/react-router';
import {
  consumeStream,
  createAgentUIStreamResponse,
  createIdGenerator,
  stepCountIs,
  tool,
  ToolLoopAgent,
} from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db, dbReadonly } from '@/lib/db';
import { agentConversation, agentMessage, ivaScrape, client, invoice, representative, organization } from '@/drizzle/schema';
import { eq, and, sql, ilike, gte, lte } from 'drizzle-orm';
import {
  INVOICE_TYPES_A,
  INVOICE_TYPES_B,
  CREDIT_NOTE_TYPES,
  calcularIvaDesdeFacturas,
  type InvoiceIvaRow,
} from '@/lib/iva-calc';


// ─── MAPA DE SCHEMA ──────────────────────────────────────────────────────────
// Si cambia el schema de DB, solo tocá este bloque.
// El resto del archivo usa estas constantes — nunca referencias hardcodeadas.
//
// Jerarquía actual:
//   organization → representative (login AFIP) → client (entidad fiscal con CUIT)
//                                                    └── invoices, iva_scrape, empleados...
//
// Historia: antes existía una tabla "profile" que era la entidad fiscal.
// Ahora ese rol lo cumple "client". El viejo "client" (agrupador) pasó a llamarse "representative".

// Tabla "entidad fiscal" — empresa con CUIT, donde viven facturas, IVA, empleados
const T_ENTITY            = client
const COL_ENTITY_ID       = client.id
const COL_ENTITY_NAME     = client.name
const COL_ENTITY_CUIT     = client.identityNumber
// FK que conecta la entidad fiscal con su login AFIP (su "dueño")
const COL_ENTITY_OWNER_FK = client.representativeId

// Tabla "login AFIP" — la persona que entra a AFIP, dueña de varias entidades fiscales
const T_OWNER       = representative
const COL_OWNER_ID  = representative.id
// Esta columna es el filtro de seguridad multi-tenant: SIEMPRE filtrar por esto
const COL_OWNER_ORG = representative.organizationId

// FK a la entidad fiscal en otras tablas (antes apuntaban a "profile", ahora a "client")
const COL_IVA_ENTITY_FK     = ivaScrape.clientId   // antes: ivaScrape.profileId
const COL_INVOICE_ENTITY_FK = invoice.clientId     // antes: invoice.profileId (columna que ya no existe)
// ─────────────────────────────────────────────────────────────────────────────

// ─── HELPER DE FORMATEO ───────────────────────────────────────────────────────
// Función TypeScript normal — NO es un tool. Puede ser llamada directamente
// desde cualquier tool sin pasar por el modelo.
//
// Recibe:
//   headers → array con los nombres de columna a mostrar (deben coincidir con
//             las keys de los objetos en rows)
//   rows    → array de objetos con los datos
//
// Devuelve una tabla en formato Markdown que el modelo renderiza en el chat.
function formatAsMarkdownTable(
  headers: string[],
  rows: Record<string, unknown>[]
): string {
  if (rows.length === 0) return '_Sin resultados._';
  const headerRow = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows  = rows.map(
    (row) => `| ${headers.map((h) => String(row[h] ?? '')).join(' | ')} |`
  );
  return [headerRow, separator, ...dataRows].join('\n');
}
// ─────────────────────────────────────────────────────────────────────────────

const googleAI = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const buildSchema = (orgId: string) => `
═══════════════════════════════════════════════
SCHEMA DE BASE DE DATOS — organización '${orgId}'
═══════════════════════════════════════════════

SEGURIDAD — OBLIGATORIO EN TODA QUERY
  La jerarquía es: representative (login AFIP) → client (entidad fiscal con CUIT).
  El filtro de organización vive en representative.organization_id.
  Según la tabla, usá uno de estos dos patrones:

  Tablas con client_id (iva_scrape, debt, due_date, liquidacion_import_empleado):
    JOIN client c ON c.id = <tabla>.client_id
    JOIN representative r ON r.id = c.representative_id
    WHERE r.organization_id = '${orgId}'

  Tablas con representative_id directo (invoice, notification, job):
    JOIN representative r ON r.id = <tabla>.representative_id
    WHERE r.organization_id = '${orgId}'

  Para client directamente:
    JOIN representative r ON r.id = client.representative_id
    WHERE r.organization_id = '${orgId}'

  NUNCA ejecutes INSERT / UPDATE / DELETE / DROP.

───────────────────────────────────────────────
TABLAS PRINCIPALES
───────────────────────────────────────────────

## representative  [SQL table: "representative"]
Login AFIP del estudio. Contiene la clave fiscal y es el ancla de seguridad multi-tenant.
  id (uuid PK)
  organization_id (text) — filtro de seguridad, presente en TODAS las queries
  name (text) — nombre de la persona física
  cuit (text) — CUIT del login AFIP
  fiscal_condition (text) — 'responsable_inscripto' | 'monotributista' | etc.
  liquida_sueldos (boolean)
  registered_at (timestamp)
  ⚠ NUNCA selecciones ni muestres la columna "afip_password" (clave fiscal AFIP, dato sensible).

## client  [SQL table: "client"]
Entidad fiscal individual (empresa o persona con CUIT propio). Acá viven las facturas, IVA y empleados.
  id (uuid PK)
  representative_id (uuid → representative.id) — FK al login AFIP que la gestiona
  name (text) — razón social
  identity_number (text) — CUIT/CUIL
  identity_type (text)
  status (text) — 'active' | 'inactive'
  liquida_sueldos (boolean)
  scraped_at (timestamp) — último scrape exitoso de AFIP

## invoice  [SQL table: "invoice"]
Facturas emitidas y recibidas, scrapeadas de AFIP ("Mis Comprobantes").
  id (uuid PK)
  representative_id (uuid → representative.id)
  client_id (uuid → client.id)
  direction (text) — 'Outbound' = venta emitida | 'Inbound' = compra recibida
    SEMÁNTICA OBLIGATORIA:
      "facturó/vendió/emitió/facturación" → WHERE direction = 'Outbound'
      "gastó/compró/compras/proveedores"  → WHERE direction = 'Inbound'
      NUNCA sumes Outbound + Inbound salvo que se pida el total combinado explícitamente.
  emition_date (timestamp) — fecha de emisión
  type (text) — código AFIP del comprobante: '1'=Fact.A, '6'=Fact.B, '11'=Fact.C,
                '3'=NC A, '8'=NC B, '201'=Fact.Crédito MiPyME A, etc.
  sale_point (text) — punto de venta
  id_from, id_to (numeric) — rango de numeración
  authorization_number (text) — CAE/CAEA
  emitter_name (text), emitter_identity_number (text)
  recipient_name (text), recipient_identity_number (text)
  receipt_province (text) — provincia del receptor (IIBB)
  currency (text) — 'ARS' | 'USD'
  currency_rate (numeric) — tipo de cambio
  amount (numeric) — total del comprobante en la moneda original
  amount_taxed (numeric), imp_neto_no_gravado (numeric), amount_exempt (numeric)
  amount_iva_0, amount_iva_25, amount_iva_5, amount_iva_105, amount_iva_21, amount_iva_27 — base imponible por alícuota
  iva_25, iva_5, iva_105, iva_21, iva_27 — monto de IVA liquidado por alícuota
  total_iva (numeric), other_taxes (numeric)
  ► Convertir a ARS: CASE WHEN UPPER(currency)='USD' THEN amount::numeric * currency_rate::numeric ELSE amount::numeric END

## notification  [SQL table: "notification"]
Notificaciones del domicilio fiscal electrónico de AFIP.
  id (uuid PK)
  representative_id (uuid → representative.id)
  client_id (uuid → client.id, nullable)
  message (text), expiration_date (timestamp), publication_date (timestamp)
  opened (boolean) — true si el estudio la marcó como leída
  severity (text), category (text)

## debt  [SQL table: "debt"]
Deudas con AFIP del último scrape. Snapshot, no histórico.
  id (uuid PK)
  client_id (uuid → client.id)
  tax (text) — 'IVA' | 'Ganancias' | 'Monotributo' | 'IIBB' | 'Autónomos' | etc.
  concept (text) — 'Saldo DDJJ' | 'Anticipo' | 'Plan de pagos' | etc.
  sub_concept (text) — 'Capital' | 'Intereses Resarcitorios' | 'Intereses Punitorios' | 'Multas'
  period (text) — texto libre tal como viene de AFIP, sin formato garantizado
  quota_number (text), due_date (timestamp)
  balance (numeric), compensatory_interest (numeric), punitive_interest (numeric)
  ► Deuda total = balance + compensatory_interest + punitive_interest

## due_date  [SQL table: "due_date"]
Vencimientos fiscales próximos. Snapshot scrapeado periódicamente. No tiene montos.
  id (uuid PK)
  client_id (uuid → client.id)
  tax (text), concept (text), sub_concept (text)
  period (text) — texto libre, sin formato garantizado
  quota_number (text), due_date (timestamp)
  detail (text) — descripción adicional del vencimiento

## iva_scrape
Snapshot mensual de la DDJJ de IVA (F.2002) por entidad fiscal. Una fila por (client, período).
  id (uuid PK), client_id (uuid → client.id)
  periodo_fiscal (text) — formato 'MM/YYYY', ej: '03/2026'
  fecha_presentacion (text) — 'DD/MM/YYYY', nullable
  ok (boolean) — false = scrape incompleto, valores pueden estar vacíos
  debito_fiscal, credito_fiscal (numeric)
  saldo_mes_pasado (numeric) — saldo técnico arrastrado del período anterior
  saldo_arca_mes (numeric) — saldo a favor del fisco
  saldo_tecnico_favor_contribuyente (numeric) — saldo técnico a favor del contribuyente
  saldo_tecnico_favor_contribuyente_posicion_mensual (numeric)
  saldo_libre_disponibilidad_periodo_anterior_neto (numeric)
  total_retenciones_percepciones_periodo (numeric)
  saldo_libre_disponibilidad_favor_contribuyente_periodo (numeric)
  ► Para consultas de IVA usá SIEMPRE el tool getIvaPosition (más confiable que SQL directo)

## job
Tareas de scraping encoladas. Útil para saber cuándo fue la última actualización.
  id (uuid PK), representative_id (uuid → representative.id)
  type (text) — 'iva' | 'comprobantes' | 'comprobantes_full' | 'notificaciones' | 'deuda' | 'vencimientos'
  status (text) — 'pending' | 'running' | 'failed' | 'finished'
  started_at, finished_at, failed_at (timestamp)
  failed_reason (text)
  ► Para saber última actualización: WHERE type='X' AND status='finished' ORDER BY finished_at DESC LIMIT 1

## liquidacion_import_empleado
Empleados de nómina de cada entidad fiscal.
  id (uuid PK), client_id (uuid → client.id)
  cuil (text), legajo (text), nombre (text)
  activo (boolean), fecha_alta (date), fecha_baja (date, null = vigente)
  tipo_jornada (text) — 'full_time' | 'part_time' | 'reducida'
  categoria (text), convenio_id (uuid → payroll_convenio.id, nullable)

## liquidacion_import_recibo
Recibos de sueldo por empleado y período.
  id (uuid PK), empleado_id (uuid → liquidacion_import_empleado.id)
  periodo (text) — formato 'YYYY-MM', ej: '2026-03'  ⚠ distinto al formato de iva_scrape
  tipo (text) — 'sueldo' | 'anticipo' | 'SAC' | 'vacaciones' | 'despido' | 'comisiones' | 'varios'
  basico, haberes, no_remunerativo, descuentos, retenciones, neto (numeric)
  situacion_revista (text) — 'activo' | 'vacaciones' | 'licencia_enfermedad' | 'baja_despido' | etc.
  recibo_confirmado (boolean) — filtrar solo true para agregaciones oficiales
  fecha (date), forma_pago (text)
  ► Para sueldos del mes: WHERE periodo = 'YYYY-MM' AND tipo = 'sueldo' AND recibo_confirmado = true

## liquidacion_import_concepto_valor
Líneas de cada recibo (un concepto por fila).
  id (uuid PK), recibo_id (uuid → liquidacion_import_recibo.id)
  codigo (text) — código del concepto (ej: '810000')
  monto (numeric) — importe resultante
  tipo_liquidacion (text) — 'remunerativo' | 'no_remunerativo' | 'descuento' | 'retencion'

───────────────────────────────────────────────
FORMATOS DE PERÍODO — no comparar entre tablas sin parsear
───────────────────────────────────────────────
  iva_scrape.periodo_fiscal         → 'MM/YYYY'   ej: '03/2026'
  liquidacion_import_recibo.periodo → 'YYYY-MM'   ej: '2026-03'
  debt.period / due_date.period     → texto libre de AFIP, sin garantías
  Regla: siempre usá TO_DATE() antes de comparar períodos entre tablas distintas.

───────────────────────────────────────────────
TRAMPAS CONOCIDAS
───────────────────────────────────────────────
  • invoice.direction está en PascalCase en la DB ('Outbound'/'Inbound'). Filtrá con ILIKE o usá LOWER().
  • La columna de tipo de cambio se llama "currency_rate" en la DB. No uses "cureency_rate".
  • debt y due_date NO tienen representative_id. Filtrá SIEMPRE via client → representative.
  • NUNCA expongas representative.afip_password (clave fiscal AFIP).
  • recibo_confirmado = false son borradores, excluirlos de totales.
  • Períodos en debt/due_date son texto libre, no comparables con LIKE fijo.

───────────────────────────────────────────────
EJEMPLOS DE QUERIES FRECUENTES
───────────────────────────────────────────────

-- Deudas de un cliente (debt + compensatory_interest + punitive_interest = total real)
SELECT d.tax, d.concept, d.sub_concept, d.period,
  ROUND(COALESCE(d.balance::numeric,0) + COALESCE(d.compensatory_interest::numeric,0) + COALESCE(d.punitive_interest::numeric,0), 2) AS total
FROM debt d
JOIN client c ON c.id = d.client_id
JOIN representative r ON r.id = c.representative_id
WHERE r.organization_id = '${orgId}' AND LOWER(c.name) ILIKE '%nombre%'
ORDER BY total DESC LIMIT 50;

-- Vencimientos próximos 30 días de un cliente
SELECT c.name, dd.tax, dd.concept, dd.due_date::date, dd.detail
FROM due_date dd
JOIN client c ON c.id = dd.client_id
JOIN representative r ON r.id = c.representative_id
WHERE r.organization_id = '${orgId}' AND LOWER(c.name) ILIKE '%nombre%'
  AND dd.due_date >= NOW() AND dd.due_date <= NOW() + INTERVAL '30 days'
ORDER BY dd.due_date ASC LIMIT 20;

-- Notificaciones no leídas de un cliente (client_id puede ser NULL en notificaciones generales)
SELECT n.message, n.severity, n.category, n.publication_date::date, n.expiration_date::date
FROM notification n
JOIN representative r ON r.id = n.representative_id
WHERE r.organization_id = '${orgId}' AND n.client_id = '<uuid>'
  AND n.opened = false
ORDER BY n.publication_date DESC LIMIT 20;

-- Último scrape exitoso por tipo para un representante
SELECT j.type, MAX(j.finished_at) AS ultima_actualizacion
FROM job j
JOIN representative r ON r.id = j.representative_id
WHERE r.organization_id = '${orgId}' AND j.status = 'finished'
GROUP BY j.type ORDER BY j.type;
─────────────────────────────────────────────`;

export const Route = createFileRoute('/api/agent')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user?.id)
          return new Response('Unauthorized', { status: 401 });
        const orgId = (session.session as any).activeOrganizationId as
          | string
          | null;
        if (!orgId)
          return new Response('No active organization', { status: 403 });
        const userId = session.user.id;

        // Nombre del estudio/organización activa, para que el agente pueda
        // responder preguntas sobre la propia org sin tener que adivinar.
        const [orgRow] = await db
          .select({ name: organization.name })
          .from(organization)
          .where(eq(organization.id, orgId))
          .limit(1);
        const orgName = orgRow?.name ?? 'el estudio';

        const body = (await request.json()) as {
          message: {
            id: string;
            role: string;
            parts: { type: string; text: string }[];
          };
          conversationId: string;
        };
        const { message, conversationId } = body;
        if (!conversationId)
          return new Response('conversationId required', { status: 400 });

        const userText =
          message.parts?.find((p) => p.type === 'text')?.text ??
          String((message as any).content ?? '');

        console.info(`[agent] ▶ org=${orgId} conv=${conversationId} user="${userText.slice(0, 120)}"`);

        // Verificar / crear conversación scoped a org+user
        const [existingConv] = await db
          .select({ id: agentConversation.id })
          .from(agentConversation)
          .where(
            and(
              eq(agentConversation.id, conversationId),
              eq(agentConversation.organizationId, orgId),
              eq(agentConversation.userId, userId)
            )
          )
          .limit(1);

        if (!existingConv) {
          await db
            .insert(agentConversation)
            .values({
              id: conversationId,
              organizationId: orgId,
              userId,
              title:
                userText.length > 60
                  ? userText.slice(0, 60) + '…'
                  : userText || 'Nueva conversación',
            })
            .onConflictDoNothing();
        }

        // Guardar el mensaje del usuario ANTES de correr el agente.
        // Esto garantiza que si el usuario envía el siguiente mensaje rápido,
        // el historial ya incluye este turno y no se pierde contexto.
        await db
          .insert(agentMessage)
          .values({ conversationId, role: 'user', content: userText });

        // Historial de la conversación (ya incluye el mensaje que acabamos de guardar)
        const prevMessages = await db
          .select({
            id: agentMessage.id,
            role: agentMessage.role,
            content: agentMessage.content,
          })
          .from(agentMessage)
          .where(eq(agentMessage.conversationId, conversationId))
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          .orderBy(agentMessage.createdAt)
          .limit(20);

        // Excluir el último mensaje (el que acabamos de insertar — el user message actual)
        // porque ya viene en `message` y lo agregamos explícitamente al final.
        const historyUiMessages = prevMessages.slice(0, -1).map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          parts: [{ type: 'text' as const, text: m.content }],
          content: m.content,
        }));

        const agent = new ToolLoopAgent({
          model: googleAI('gemini-2.5-flash'),
          instructions: `Sos Arca, analista financiero virtual del estudio contable. Tenés acceso directo a la base de datos de la organización y podés ejecutar queries SQL para responder preguntas sobre clientes, facturas, deudas, vencimientos, nómina y posición IVA.

IDENTIDAD Y TONO
- Contexto de sesión: trabajás para el estudio contable "${orgName}". Usá este dato cuando la pregunta se refiera al propio estudio/organización; no hace falta consultarlo en la DB.
- Respondés siempre en español rioplatense, tono profesional.
- Sos directo: primero el dato, después el contexto si hace falta.
- Usás el nombre del cliente en la respuesta, nunca el UUID.

COMPORTAMIENTO — MUY IMPORTANTE
- NUNCA describas lo que vas a hacer antes de hacerlo. Ejecutá el tool directamente y respondé con el resultado.
- NUNCA digas "voy a consultar", "necesito ejecutar", "permití que busque", "déjame verificar" ni frases similares. Hacelo y listo.
- Si una query falla, corregí el SQL y reintentá una vez sin comentarlo. Si falla dos veces, reportá el error técnico brevemente.
- En preguntas de seguimiento sobre el mismo cliente (ej: "¿y cuántas deudas tiene?"), SIEMPRE incluí el filtro r.organization_id = '${orgId}' via JOIN con representative en la nueva query. Nunca omitas este filtro aunque el cliente ya haya sido identificado antes.

CONTEXTO DE CONVERSACIÓN — MUY IMPORTANTE
- Tenés acceso al historial completo de la conversación. Leelo antes de cada respuesta.
- Cuando el usuario use una referencia implícita a una empresa ("esa empresa", "la misma", "la anterior", "seguí con esa", o simplemente no la nombre), resolvé siempre a la empresa mencionada MÁS RECIENTEMENTE en la conversación — no a la primera.
- Para identificar la empresa más reciente: revisá los últimos mensajes del asistente, que siempre indican el nombre de la empresa sobre la que se respondió.
- NUNCA defaultees a la primera empresa del historial si hay una más reciente. Si no podés determinar la empresa por contexto, preguntá al usuario cuál quiere.

DATOS Y VERACIDAD
- Nunca inventás ni estimás datos. Si no tenés la info en la DB, lo decís explícitamente.
- Antes de responder cualquier cifra, ejecutá la query correspondiente.
- Citá números concretos: "Produsel facturó $1.234.567,89 en febrero" — nunca rangos vagos.
- Si una query no devuelve filas, respondé "No encontré registros para esa consulta" y sugerí verificar el filtro.

AMBIGÜEDAD
- NUNCA inventes opciones ni preguntes antes de ejecutar la query. Siempre consultá primero la DB.
- Si la query devuelve datos de un solo cliente, respondé con esos datos directamente.
- Solo si la query devuelve filas de múltiples clientes distintos, entonces mostrá la lista y pedí que confirmen cuál.
- Si la pregunta es ambigua en período (ej: "este mes"), usá la fecha actual (${new Date().toLocaleDateString('es-AR')}) para inferir el mes/año correcto sin preguntar.

FORMATO DE SALIDA
- Montos siempre en ARS con formato argentino: $1.234.567,89
- Fechas: DD/MM/YYYY
- Listas: bullet points limpios
- Para tablas grandes (>10 filas), mostrá un resumen y ofrecé detalle si lo piden

SEGURIDAD — CRÍTICO
- Nunca respondas preguntas sobre contraseñas, credenciales o datos sensibles que no sean contables.
- Toda query DEBE filtrar por organization_id = '${orgId}' via JOIN con representative. Si una query no incluye este filtro, es un error de seguridad — no la ejecutes.
- Solo queries SELECT. Nunca INSERT, UPDATE, DELETE, DROP, ni nada que modifique datos.

${buildSchema(orgId)}

REGLAS AL ESCRIBIR QUERIES
1. Solo SELECT. Siempre incluí LIMIT (máximo 200).
2. SIEMPRE filtrá por organization_id = '${orgId}' via JOIN con representative — en CADA query, incluso en follow-ups del mismo cliente.
3. Montos en ARS: CASE WHEN UPPER(currency)='USD' THEN amount::numeric * currency_rate::numeric ELSE amount::numeric END
4. Facturas — direction: "facturó/vendió" → WHERE LOWER(direction)='outbound' | "gastó/compró" → WHERE LOWER(direction)='inbound'
5. Notificaciones: para las atribuibles a una entidad fiscal, WHERE client_id IS NOT NULL
6. Búsquedas por nombre de cliente: ILIKE '%texto%'. IMPORTANTE: cuando el usuario nombra un "cliente" (ej: "Produsel S.A"), casi siempre se refiere a representative.name (la razón social que gestiona el estudio), NO a client.name. Resolvé el nombre contra representative.name. Para datos de actividad usá la FK directa al representante: invoice, debt, due_date, notification y job tienen representative_id, así que podés filtrar por r.id sin necesidad de pasar por client. Recién filtrá por client.name si el usuario nombra explícitamente una entidad fiscal específica dentro del representante.
7. No agregues el sufijo societario exacto al ILIKE: para "Produsel S.A" buscá ILIKE '%Produsel%' (sin "S.A."/"S.A"/puntos), porque la razón social guardada puede variar en el sufijo.
8. Si la pregunta no puede responderse con los datos disponibles, respondé: "No tengo información suficiente en la base de datos para responder eso."

HERRAMIENTAS DISPONIBLES
- executeQuery: para cualquier consulta SQL general. Usala para clientes, facturas, deudas, vencimientos, notificaciones, convenios, empleados (cantidad, filtros), empresas con sueldos, o cualquier consulta que no tenga tool dedicada.
- getIvaPosition: USÁ SIEMPRE ESTE TOOL para consultas sobre IVA, posición IVA, saldo IVA, crédito/débito fiscal. Tiene lógica interna que SQL solo no puede replicar.
- getMontosfacturacion: montos totales de ventas y compras en ARS. Acepta empresa y/o período opcionales. Maneja conversión USD→ARS internamente.
- getEmpleados: lista los empleados de una empresa con legajo, nombre, CUIT y si está activo, ya formateada como tabla. Usala cuando el usuario quiera ver el listado de empleados.
- getMontosNomina: montos de nómina (básico, bruto, no remunerativo, neto) de una empresa para un período. Solo recibos confirmados de tipo sueldo. Convierte MM/YYYY al formato interno automáticamente.
- getResumenCliente: USÁ ESTE TOOL cuando el usuario pida un resumen, panorama general o "cómo está" una empresa. Devuelve en una sola llamada: deuda AFIP total, vencimientos próximos, facturación del mes, notificaciones no leídas y última actualización de datos. Nunca uses múltiples tools para armar un resumen si podés usar este.
  - El parámetro displayMonth de getIvaPosition es el mes que el usuario quiere ver (ej: "Marzo 2026" → "03/2026"). El tool internamente usa el mes anterior para consultar iva_scrape.
  - NUNCA respondas "no hay datos para X mes" desde la memoria de la conversación. Siempre volvé a llamar al tool con el displayMonth específico que pide el usuario.
  - Devuelve los datos de IVA de la entidad fiscal encontrada.`,
          tools: {
            executeQuery: tool({
              description:
                'Ejecuta una query SQL SELECT sobre la base de datos. Usá el schema del system prompt para construir la query correcta con los JOINs y filtros necesarios.',
              inputSchema: z.object({
                query: z
                  .string()
                  .describe(
                    'Query SQL SELECT. Debe incluir LIMIT y filtrar por organization_id via JOIN con representative.'
                  ),
                description: z
                  .string()
                  .describe('Una línea explicando qué busca esta query'),
              }),
              execute: async ({ query, description }) => {
                const trimmed = query.trim();

                if (!/^SELECT\b/i.test(trimmed)) {
                  console.warn('[agent.executeQuery] rejected (not SELECT):', trimmed.slice(0, 200));
                  return { error: 'Solo se permiten queries SELECT.' };
                }

                if (!trimmed.includes(orgId)) {
                  console.warn('[agent.executeQuery] rejected (missing orgId):', trimmed.slice(0, 200));
                  return {
                    error: `La query debe filtrar por organization_id = '${orgId}'. Revisá el JOIN con representative (via client.representative_id o directamente desde la tabla).`,
                  };
                }

                // Forzar LIMIT si el modelo lo omitió
                const withLimit = /\bLIMIT\s+\d+/i.test(trimmed)
                  ? trimmed
                  : `${trimmed} LIMIT 200`;

                console.info('[agent.executeQuery]', description ?? '(no description)');
                console.info('[agent.executeQuery] SQL:', withLimit);

                try {
                  const result = await dbReadonly.execute(sql.raw(withLimit));
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                  const rows = Array.from(result as unknown[]);
                  console.info(`[agent.executeQuery] OK — ${rows.length} rows`);
                  return { rows, rowCount: rows.length };
                } catch (err: any) {
                  console.error('[agent.executeQuery] SQL error:', err?.message, '\nQuery:', withLimit);
                  return { error: `Error SQL: ${err.message}` };
                }
              },
            }),
            getIvaPosition: tool({
              description:
                'Obtiene la posición IVA completa de un cliente para un período dado. Devuelve datos de todos los perfiles del cliente con totales consolidados. Usá este tool para cualquier consulta sobre IVA, saldo IVA, débito/crédito fiscal.',
              inputSchema: z.object({
                clientName: z.string().describe('Nombre de la entidad fiscal (búsqueda parcial)'),
                displayMonth: z
                  .string()
                  .optional()
                  .describe(
                    'Mes que el usuario quiere ver, en formato MM/YYYY. Ej: "03/2026" para Marzo 2026. ' +
                    'Si no se especifica, usa el mes más reciente con datos disponibles. ' +
                    'IMPORTANTE: "marzo" → "03/2026", "febrero" → "02/2026", etc.'
                  ),
              }),
              execute: async ({ clientName, displayMonth }) => {
                console.info('[agent.getIvaPosition] llamado con:', { clientName, displayMonth });
               try {
                // 1. Buscar la entidad fiscal por nombre dentro de la organización.
                //    El filtro de org vive en representative, no en client — por eso el JOIN.
                const matchingClients = await dbReadonly
                  .select({ id: COL_ENTITY_ID, name: COL_ENTITY_NAME, identityNumber: COL_ENTITY_CUIT })
                  .from(T_ENTITY)
                  .innerJoin(T_OWNER, eq(COL_OWNER_ID, COL_ENTITY_OWNER_FK))
                  .where(and(eq(COL_OWNER_ORG, orgId), ilike(COL_ENTITY_NAME, `%${clientName}%`)));

                if (matchingClients.length === 0)
                  return { error: `No encontré clientes con nombre "${clientName}"` };
                if (matchingClients.length > 1)
                  return { error: 'Más de un cliente coincide', options: matchingClients.map((c) => c.name) };

                const foundClient = matchingClients[0];

                // "03/2026" → "02/2026"
                const prevMonthStr = (s: string): string => {
                  const [mm, yyyy] = s.split('/').map(Number);
                  const d = new Date(yyyy, mm - 2, 1);
                  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                };

                // "02/2026" → "03/2026"
                const nextMonthStr = (s: string): string => {
                  const [mm, yyyy] = s.split('/').map(Number);
                  const d = new Date(yyyy, mm, 1);
                  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                };

                const periodToDateRange = (p: string): { from: Date; to: Date } => {
                  const [mm, yyyy] = p.split('/').map(Number);
                  const from = new Date(yyyy, mm - 1, 1);
                  const to = new Date(yyyy, mm, 0, 23, 59, 59);
                  return { from, to };
                };

                /*
                 * CONVENCIÓN DE PERÍODOS — igual que la UI:
                 *   invoicePeriod   = el mes que el usuario quiere ver ("displayMonth")
                 *   ivaScrapeperiod = invoicePeriod - 1 mes  (el scrape de AFIP del mes anterior)
                 *
                 * Ejemplo: usuario pide "Marzo 2026" (03/2026)
                 *   → facturas: 01-mar al 31-mar 2026
                 *   → iva_scrape: "02/2026" (posición IVA de febrero, presentada en marzo)
                 */
                let invoicePeriod: string;
                let ivaScrapeperiod: string;

                if (displayMonth) {
                  invoicePeriod = displayMonth;
                  ivaScrapeperiod = prevMonthStr(displayMonth);
                } else {
                  // Sin período: buscar el último iva_scrape disponible para esta entidad
                  const rows = await dbReadonly.execute(sql.raw(
                    `SELECT periodo_fiscal FROM iva_scrape WHERE client_id = '${foundClient.id}' ORDER BY TO_DATE(periodo_fiscal, 'MM/YYYY') DESC LIMIT 1`
                  ));
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                  const arr = Array.from(rows) as Record<string, unknown>[];
                  if (arr.length === 0) return { error: `No hay datos de IVA disponibles para ${foundClient.name}.` };
                  ivaScrapeperiod = arr[0].periodo_fiscal as string; // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                  invoicePeriod = nextMonthStr(ivaScrapeperiod);
                }

                const { from: dateFrom, to: dateTo } = periodToDateRange(invoicePeriod);
                const n = (v: string | null | undefined) => parseFloat(v ?? '0') || 0;

                // 2. iva_scrape: período del mes ANTERIOR al que se muestra (convención AFIP)
                const [ivaRow] = await dbReadonly.select().from(ivaScrape)
                  .where(and(eq(COL_IVA_ENTITY_FK, foundClient.id), eq(ivaScrape.periodoFiscal, ivaScrapeperiod)))
                  .limit(1);

                // 3. Facturas del mes que el usuario quiere ver
                const invoices = await dbReadonly.select({
                  direction: invoice.direction,
                  type: invoice.type,
                  currency: invoice.currency,
                  currencyRate: invoice.cureencyRate,
                  amountIVA21: invoice.amountIVA21,
                  amountIVA105: invoice.amountIVA105,
                  amountIVA27: invoice.amountIVA27,
                  amountIVA5: invoice.amountIVA5,
                  amountIVA25: invoice.amountIVA25,
                  IVA21: invoice.IVA21,
                  IVA105: invoice.IVA105,
                  IVA27: invoice.IVA27,
                }).from(invoice)
                  .where(and(
                    eq(COL_INVOICE_ENTITY_FK, foundClient.id),
                    gte(invoice.emitionDate, dateFrom),
                    lte(invoice.emitionDate, dateTo),
                  ));

                // 4. Calcular débito/crédito fiscal usando lógica compartida con el módulo de clientes
                const ivaCalc = calcularIvaDesdeFacturas(invoices as InvoiceIvaRow[]);
                const debitoFiscalCalculado = ivaCalc.debitoFiscal;
                const creditoFiscalCalculado = ivaCalc.creditoFiscalCompras;
                const { netoA21, netoA105, totalAmountB21: totalB21, totalAmountB105: totalB105, totalAmountB27: totalB27,
                  netoInbound21: netoIn21, netoInbound105: netoIn105, netoInbound27: netoIn27 } = ivaCalc;

                // 5. Saldos de iva_scrape (AFIP)
                const saldoAFavor = n(ivaRow?.saldoTecnicoFavorContribuyente);
                const saldoLibreDisp = n(ivaRow?.saldoLibreDisponibilidadFavorContribuyentePeriodo);
                const totalRetenciones = n(ivaRow?.totalRetencionesPercepcionesPeriodo);
                const saldoTecnico = debitoFiscalCalculado - creditoFiscalCalculado - saldoAFavor;

                return {
                  cliente: foundClient.name,
                  cuit: foundClient.identityNumber,
                  periodoMostrado: invoicePeriod,
                  periodoIvaScrape: ivaScrapeperiod,
                  fechaPresentacion: ivaRow?.fechaPresentacion ?? 'No disponible',
                  ventas: {
                    netoA21: netoA21.toFixed(2),
                    netoA105: netoA105.toFixed(2),
                    totalB21: totalB21.toFixed(2),
                    totalB105: totalB105.toFixed(2),
                    totalB27: totalB27.toFixed(2),
                    debitoFiscal: debitoFiscalCalculado.toFixed(2),
                  },
                  compras: {
                    netoGravado21: netoIn21.toFixed(2),
                    netoGravado105: netoIn105.toFixed(2),
                    netoGravado27: netoIn27.toFixed(2),
                    creditoFiscal: creditoFiscalCalculado.toFixed(2),
                  },
                  saldosAFIP: {
                    saldoAFavorPeriodoAnterior: ivaRow?.saldoTecnicoFavorContribuyente ?? null,
                    saldoLibreDisponibilidad: ivaRow?.saldoLibreDisponibilidadFavorContribuyentePeriodo ?? null,
                    totalRetencionesPercepciones: ivaRow?.totalRetencionesPercepcionesPeriodo ?? null,
                  },
                  saldoTecnico: saldoTecnico.toFixed(2),
                  saldoLibreDisponibilidad: saldoLibreDisp.toFixed(2),
                  totalRetencionesPercepciones: totalRetenciones.toFixed(2),
                  tieneDatosAFIP: !!ivaRow,
                };
               } catch (err: any) {
                 console.error('[agent.getIvaPosition] error:', err?.message, err?.stack);
                 return { error: `Error al calcular posición IVA: ${err?.message ?? 'error desconocido'}` };
               }
              },
            }),
            getMontosfacturacion: tool({
              description:
                'Muestra los montos totales de ventas (Outbound) y compras (Inbound) en ARS. ' +
                'Puede filtrar por empresa y/o período. Si no se especifica empresa muestra todas; ' +
                'si no se especifica período muestra el acumulado total.',
              inputSchema: z.object({
                clientName: z.string().optional().describe('Nombre parcial de la empresa. Opcional.'),
                periodo: z.string().optional().describe('Período en formato MM/YYYY. Ej: "03/2026". Opcional.'),
              }),
              execute: async ({ clientName, periodo }) => {
                console.info('[agent.getMontosfacturacion]', { clientName, periodo });
                try {
                  let clientFilter = '';
                  if (clientName) {
                    const matches = await dbReadonly
                      .select({ id: COL_ENTITY_ID, name: COL_ENTITY_NAME })
                      .from(T_ENTITY)
                      .innerJoin(T_OWNER, eq(COL_OWNER_ID, COL_ENTITY_OWNER_FK))
                      .where(and(eq(COL_OWNER_ORG, orgId), ilike(COL_ENTITY_NAME, `%${clientName}%`)));
                    if (matches.length === 0) return { error: `No encontré empresas con nombre "${clientName}"` };
                    if (matches.length > 1) return { error: 'Más de una empresa coincide', opciones: matches.map((m) => m.name) };
                    clientFilter = `AND c.id = '${matches[0].id}'`;
                  }
                  let periodoFilter = '';
                  if (periodo) {
                    const [mm, yyyy] = periodo.split('/');
                    periodoFilter = `AND DATE_TRUNC('month', i.emition_date) = DATE_TRUNC('month', DATE '${yyyy}-${mm.padStart(2, '0')}-01')`;
                  }
                  const rows = Array.from(await dbReadonly.execute(sql.raw(`
                    SELECT c.name AS empresa,
                      ROUND(SUM(CASE WHEN LOWER(i.direction) = 'outbound' THEN
                        CASE WHEN UPPER(i.currency) = 'USD' THEN i.amount::numeric * i.currency_rate::numeric
                        ELSE i.amount::numeric END ELSE 0 END), 2) AS ventas_ars,
                      ROUND(SUM(CASE WHEN LOWER(i.direction) = 'inbound' THEN
                        CASE WHEN UPPER(i.currency) = 'USD' THEN i.amount::numeric * i.currency_rate::numeric
                        ELSE i.amount::numeric END ELSE 0 END), 2) AS compras_ars
                    FROM invoice i
                    JOIN representative r ON r.id = i.representative_id
                    JOIN client c ON c.id = i.client_id
                    WHERE r.organization_id = '${orgId}' ${clientFilter} ${periodoFilter}
                    GROUP BY c.id, c.name ORDER BY ventas_ars DESC
                  `))) as Record<string, unknown>[];
                  if (rows.length === 0) return { mensaje: 'No hay facturas para el criterio indicado.' };
                  const tabla = formatAsMarkdownTable(['empresa', 'ventas_ars', 'compras_ars'], rows);
                  return { tabla, totalEmpresas: rows.length };
                } catch (err: any) {
                  console.error('[agent.getMontosfacturacion] error:', err?.message);
                  return { error: `Error: ${err?.message}` };
                }
              },
            }),
            getEmpleados: tool({
              description:
                'Lista los empleados de una empresa con legajo, nombre, CUIT y si está activo. ' +
                'Usalo cuando el usuario quiera ver el listado de empleados de una empresa.',
              inputSchema: z.object({
                clientName: z.string().describe('Nombre parcial de la empresa.'),
              }),
              execute: async ({ clientName }) => {
                console.info('[agent.getEmpleados]', { clientName });
                try {
                  const matches = await dbReadonly
                    .select({ id: COL_ENTITY_ID, name: COL_ENTITY_NAME })
                    .from(T_ENTITY)
                    .innerJoin(T_OWNER, eq(COL_OWNER_ID, COL_ENTITY_OWNER_FK))
                    .where(and(eq(COL_OWNER_ORG, orgId), ilike(COL_ENTITY_NAME, `%${clientName}%`)));
                  if (matches.length === 0) return { error: `No encontré empresas con nombre "${clientName}"` };
                  if (matches.length > 1) return { error: 'Más de una empresa coincide', opciones: matches.map((m) => m.name) };
                  const rows = Array.from(await dbReadonly.execute(sql.raw(`
                    SELECT e.legajo, e.nombre, e.cuil AS cuit, e.activo
                    FROM liquidacion_import_empleado e
                    WHERE e.client_id = '${matches[0].id}'
                    ORDER BY e.activo DESC, e.nombre ASC
                  `))) as Record<string, unknown>[];
                  if (rows.length === 0) return { mensaje: `${matches[0].name} no tiene empleados registrados.` };
                  const tabla = formatAsMarkdownTable(['legajo', 'nombre', 'cuit', 'activo'], rows);
                  return { empresa: matches[0].name, tabla, total: rows.length };
                } catch (err: any) {
                  console.error('[agent.getEmpleados] error:', err?.message);
                  return { error: `Error: ${err?.message}` };
                }
              },
            }),
            getMontosNomina: tool({
              description:
                'Muestra los montos de nómina de una empresa para un período: básico, bruto, ' +
                'no remunerativo y neto a pagar. Solo incluye recibos confirmados de tipo sueldo.',
              inputSchema: z.object({
                clientName: z.string().describe('Nombre parcial de la empresa.'),
                periodo: z.string().describe('Período en formato MM/YYYY. Ej: "03/2026".'),
              }),
              execute: async ({ clientName, periodo }) => {
                console.info('[agent.getMontosNomina]', { clientName, periodo });
                try {
                  const matches = await dbReadonly
                    .select({ id: COL_ENTITY_ID, name: COL_ENTITY_NAME })
                    .from(T_ENTITY)
                    .innerJoin(T_OWNER, eq(COL_OWNER_ID, COL_ENTITY_OWNER_FK))
                    .where(and(eq(COL_OWNER_ORG, orgId), ilike(COL_ENTITY_NAME, `%${clientName}%`)));
                  if (matches.length === 0) return { error: `No encontré empresas con nombre "${clientName}"` };
                  if (matches.length > 1) return { error: 'Más de una empresa coincide', opciones: matches.map((m) => m.name) };
                  // Convertir MM/YYYY → YYYY-MM (formato interno de liquidacion_import_recibo.periodo)
                  const [mm, yyyy] = periodo.split('/');
                  const periodoRecibo = `${yyyy}-${mm.padStart(2, '0')}`;
                  const rows = Array.from(await dbReadonly.execute(sql.raw(`
                    SELECT COUNT(*)::int AS cantidad_recibos,
                      ROUND(SUM(r.basico::numeric), 2) AS total_basico,
                      ROUND(SUM(r.haberes::numeric), 2) AS total_bruto,
                      ROUND(SUM(r.no_remunerativo::numeric), 2) AS total_no_remunerativo,
                      ROUND(SUM(r.neto::numeric), 2) AS total_neto
                    FROM liquidacion_import_recibo r
                    JOIN liquidacion_import_empleado e ON e.id = r.empleado_id
                    WHERE e.client_id = '${matches[0].id}'
                      AND r.periodo = '${periodoRecibo}'
                      AND r.recibo_confirmado = true
                      AND r.tipo = 'sueldo'
                  `))) as Record<string, unknown>[];
                  const row = rows[0];
                  if (!row || row.cantidad_recibos === 0)
                    return { mensaje: `No hay recibos confirmados para ${matches[0].name} en ${periodo}.` };
                  return { empresa: matches[0].name, periodo, ...row };
                } catch (err: any) {
                  console.error('[agent.getMontosNomina] error:', err?.message);
                  return { error: `Error: ${err?.message}` };
                }
              },
            }),
            getResumenCliente: tool({
              description:
                'Devuelve un resumen consolidado de una empresa: deuda AFIP, vencimientos próximos 30 días, ' +
                'facturación del mes actual, notificaciones no leídas y última actualización de datos. ' +
                'Usalo cuando el usuario pida un resumen o panorama general de una empresa.',
              inputSchema: z.object({
                clientName: z.string().describe('Nombre parcial de la empresa.'),
              }),
              execute: async ({ clientName }) => {
                console.info('[agent.getResumenCliente]', { clientName });
                try {
                  const matches = await dbReadonly
                    .select({ id: COL_ENTITY_ID, name: COL_ENTITY_NAME, identityNumber: COL_ENTITY_CUIT })
                    .from(T_ENTITY)
                    .innerJoin(T_OWNER, eq(COL_OWNER_ID, COL_ENTITY_OWNER_FK))
                    .where(and(eq(COL_OWNER_ORG, orgId), ilike(COL_ENTITY_NAME, `%${clientName}%`)));

                  if (matches.length === 0) return { error: `No encontré empresas con nombre "${clientName}"` };
                  if (matches.length > 1) return { error: 'Más de una empresa coincide', opciones: matches.map((m) => m.name) };

                  const found = matches[0];
                  const now = new Date();
                  const mm = String(now.getMonth() + 1).padStart(2, '0');
                  const yyyy = String(now.getFullYear());
                  const periodoRecibo = `${yyyy}-${mm}`;

                  const [deudas, vencimientos, ultimosJobs, facturacion, notificaciones] = await Promise.all([
                    // Deudas AFIP
                    dbReadonly.execute(sql.raw(`
                      SELECT d.tax, d.concept, d.sub_concept, d.period,
                        ROUND(COALESCE(d.balance::numeric,0) + COALESCE(d.compensatory_interest::numeric,0) + COALESCE(d.punitive_interest::numeric,0), 2) AS total
                      FROM debt d
                      JOIN client c ON c.id = d.client_id
                      JOIN representative r ON r.id = c.representative_id
                      WHERE r.organization_id = '${orgId}' AND c.id = '${found.id}'
                      ORDER BY total DESC LIMIT 20
                    `)),
                    // Vencimientos próximos 30 días
                    dbReadonly.execute(sql.raw(`
                      SELECT dd.tax, dd.concept, dd.due_date::date AS due_date, dd.detail
                      FROM due_date dd
                      JOIN client c ON c.id = dd.client_id
                      JOIN representative r ON r.id = c.representative_id
                      WHERE r.organization_id = '${orgId}' AND c.id = '${found.id}'
                        AND dd.due_date >= NOW() AND dd.due_date <= NOW() + INTERVAL '30 days'
                      ORDER BY dd.due_date ASC LIMIT 10
                    `)),
                    // Último job exitoso por tipo (scoped al representative del cliente)
                    dbReadonly.execute(sql.raw(`
                      SELECT j.type, MAX(j.finished_at)::date AS ultima_actualizacion
                      FROM job j
                      JOIN representative r ON r.id = j.representative_id
                      JOIN client c ON c.representative_id = r.id
                      WHERE r.organization_id = '${orgId}' AND c.id = '${found.id}' AND j.status = 'finished'
                      GROUP BY j.type ORDER BY j.type
                    `)),
                    // Facturación del mes actual
                    dbReadonly.execute(sql.raw(`
                      SELECT
                        ROUND(SUM(CASE WHEN LOWER(i.direction) = 'outbound' THEN
                          CASE WHEN UPPER(i.currency) = 'USD' THEN i.amount::numeric * i.currency_rate::numeric
                          ELSE i.amount::numeric END ELSE 0 END), 2) AS ventas_ars,
                        ROUND(SUM(CASE WHEN LOWER(i.direction) = 'inbound' THEN
                          CASE WHEN UPPER(i.currency) = 'USD' THEN i.amount::numeric * i.currency_rate::numeric
                          ELSE i.amount::numeric END ELSE 0 END), 2) AS compras_ars,
                        COUNT(*)::int AS cantidad_comprobantes
                      FROM invoice i
                      JOIN representative r ON r.id = i.representative_id
                      WHERE r.organization_id = '${orgId}' AND i.client_id = '${found.id}'
                        AND DATE_TRUNC('month', i.emition_date) = DATE_TRUNC('month', DATE '${yyyy}-${mm}-01')
                    `)),
                    // Notificaciones no leídas
                    dbReadonly.execute(sql.raw(`
                      SELECT n.message, n.severity, n.category, n.publication_date::date AS publication_date
                      FROM notification n
                      JOIN representative r ON r.id = n.representative_id
                      WHERE r.organization_id = '${orgId}' AND n.client_id = '${found.id}'
                        AND n.opened = false
                      ORDER BY n.publication_date DESC LIMIT 5
                    `)),
                  ]);

                  const deudasRows = Array.from(deudas as unknown[]) as Record<string, unknown>[];
                  const deudaTotal = deudasRows.reduce((acc, r) => acc + (parseFloat(String(r.total ?? 0)) || 0), 0);

                  return {
                    empresa: found.name,
                    cuit: found.identityNumber,
                    mesConsultado: `${mm}/${yyyy}`,
                    deudaAFIP: {
                      totalARS: deudaTotal.toFixed(2),
                      items: deudasRows,
                    },
                    vencimientosProximos30Dias: Array.from(vencimientos as unknown[]),
                    facturacionMesActual: (Array.from(facturacion as unknown[]) as Record<string, unknown>[])[0] ?? null,
                    notificacionesNoLeidas: Array.from(notificaciones as unknown[]),
                    ultimaActualizacionDatos: Array.from(ultimosJobs as unknown[]),
                  };
                } catch (err: any) {
                  console.error('[agent.getResumenCliente] error:', err?.message);
                  return { error: `Error: ${err?.message}` };
                }
              },
            }),
          },
          stopWhen: stepCountIs(5),
        });

        return createAgentUIStreamResponse({
          agent,
          uiMessages: [...historyUiMessages, message as any],
          generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
          consumeSseStream({ stream }) {
            void consumeStream({
              stream,
              onError: (err) => console.error('[agent] stream error:', err),
            });
          },
          onFinish: async ({ messages: finishedMessages }) => {
            try {
              // El user message ya fue guardado ANTES de correr el agente (ver arriba).
              // Aquí solo guardamos la respuesta del asistente.

              // finishedMessages contiene el historial COMPLETO + los mensajes nuevos.
              // Nos quedamos solo con los nuevos (posteriores al user message que vino en este request),
              // así cada turno guarda su propia respuesta, no todo el chat acumulado.
              const newMessages = finishedMessages.slice(
                historyUiMessages.length + 1
              );

              const assistantText = newMessages
                .filter((m) => m.role === 'assistant')
                .flatMap((m) =>
                  (m.parts ?? [])
                    .filter((p: any) => p.type === 'text')
                    .map((p: any) => (p.text as string) ?? '')
                )
                .filter(Boolean)
                .join('\n\n');

              if (assistantText) {
                await db.insert(agentMessage).values({
                  conversationId,
                  role: 'assistant',
                  content: assistantText,
                });
              }
            } catch (err) {
              console.error('[agent] persist error:', err);
            }
          },
        });
      },
    },
  },
});
