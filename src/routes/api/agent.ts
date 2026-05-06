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
import { agentConversation, agentMessage, ivaScrape, profile, client, invoice } from '@/drizzle/schema';
import { eq, and, sql, ilike, gte, lte } from 'drizzle-orm';
import {
  INVOICE_TYPES_A,
  INVOICE_TYPES_B,
  CREDIT_NOTE_TYPES,
  calcularIvaDesdeFacturas,
  type InvoiceIvaRow,
} from '@/lib/iva-calc';


const googleAI = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
});

const buildSchema = (orgId: string) => `
═══════════════════════════════════════════════
SCHEMA DE BASE DE DATOS — organización '${orgId}'
═══════════════════════════════════════════════

SEGURIDAD — OBLIGATORIO EN TODA QUERY
  Toda tabla fiscal cuelga de client. Siempre filtrá:
    JOIN client c ON c.id = <tabla>.client_id
    WHERE c.organization_id = '${orgId}'
  Join chains — la FK se llama client_id en TODAS las tablas:
    profile             → JOIN client c ON c.id = profile.client_id
    iva_scrape          → JOIN profile p ON p.id = iva_scrape.profile_id JOIN client c ON c.id = p.client_id
    invoice             → JOIN client c ON c.id = invoice.client_id
    notification        → JOIN client c ON c.id = notification.client_id
    debt                → JOIN client c ON c.id = debt.client_id
    due_date            → JOIN client c ON c.id = due_date.client_id
    job                 → JOIN client c ON c.id = job.client_id
    liquidacion_import_empleado → JOIN profile p ON p.id = liquidacion_import_empleado.profile_id JOIN client c ON c.id = p.client_id
    liquidacion_import_recibo   → JOIN liquidacion_import_empleado e ON e.id = liquidacion_import_recibo.empleado_id JOIN profile p ON p.id = e.profile_id JOIN client c ON c.id = p.client_id
  NUNCA ejecutes INSERT / UPDATE / DELETE / DROP.

───────────────────────────────────────────────
TABLAS PRINCIPALES
───────────────────────────────────────────────

## client  [SQL table: "client"]
Razón social o persona física que el estudio gestiona. Raíz de toda la jerarquía.
  id (uuid PK), organization_id (text) — filtro de seguridad
  name (text) — razón social
  identity_number (text) — CUIT/CUIL del cliente
  fiscal_condition (text) — valores: 'responsable_inscripto' | 'monotributista' | 'exento' | 'consumidor_final'
  status (text) — 'active' | 'inactive'
  liquida_sueldos (boolean)
  convenio_multilateral (boolean), regimen_local (boolean)
  has_errors (boolean), error_message (text)
  registered_at (timestamp) — fecha de alta fiscal en AFIP
  ⚠ NUNCA selecciones ni muestres la columna "password" (es la clave fiscal AFIP, dato sensible).

## profile  [SQL table: "profile"]
Identidad fiscal scrapeada de AFIP. Un client puede tener varios profiles.
Todo dato de actividad (facturas, IVA, empleados) cuelga de profile, no de client.
  id (uuid PK)
  client_id (uuid → client.id)
  name (text), identity_number (text) — CUIT/CUIL del perfil (puede diferir del client)
  status (text), liquida_sueldos (boolean)
  scraped_at (timestamp) — último scrape exitoso

## invoice  [SQL table: "invoice"]
Facturas emitidas y recibidas, scrapeadas de AFIP ("Mis Comprobantes").
  id (uuid PK)
  client_id (uuid → client.id), profile_id (uuid → profile.id)
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
  currency_rate (numeric) — tipo de cambio (columna DB correcta; el typo "cureencyRate" existe solo en el código Drizzle, NO en la DB)
  amount (numeric) — total del comprobante en la moneda original
  amount_taxed (numeric), amount_no_taxed (numeric), amount_exempt (numeric)
  amount_iva0, amount_iva25, amount_iva5, amount_iva105, amount_iva21, amount_iva27 — base imponible por alícuota
  iva25, iva5, iva105, iva21, iva27 — monto de IVA liquidado por alícuota
  total_iva (numeric), other_taxes (numeric)
  ► Convertir a ARS: CASE WHEN UPPER(currency)='USD' THEN amount::numeric * currency_rate::numeric ELSE amount::numeric END

## notification  [SQL table: "notification"]
Notificaciones del domicilio fiscal electrónico de AFIP.
  id (uuid PK)
  client_id (uuid → client.id), profile_id (uuid → profile.id, nullable)
  message (text), expiration_date (timestamp), publication_date (timestamp)
  opened (boolean) — true si el estudio la marcó como leída (no refleja estado en AFIP)
  ► SIEMPRE filtrar WHERE profile_id IS NOT NULL (NULL = perfil de otro estudio, no es del cliente)

## debt  [SQL table: "debt"]
Deudas con AFIP del último scrape. Snapshot, no histórico.
  id (uuid PK)
  client_id (uuid → client.id) — ⚠ NO tiene profile_id
  tax (text) — 'IVA' | 'Ganancias' | 'Monotributo' | 'IIBB' | 'Autónomos' | etc.
  concept (text) — 'Saldo DDJJ' | 'Anticipo' | 'Plan de pagos' | etc.
  sub_concept (text) — 'Capital' | 'Intereses Resarcitorios' | 'Intereses Punitorios' | 'Multas'
  establishment (text) — '0' para la mayoría; valor distinto solo en IIBB con múltiples domicilios
  period (text) — texto libre tal como viene de AFIP, sin formato garantizado
  quota_number (text), due_date (timestamp)
  balance (numeric) — capital adeudado
  compensatory_interest (numeric) — intereses compensatorios
  punitive_interest (numeric) — intereses punitorios
  ► Deuda total = balance + compensatory_interest + punitive_interest
  ► ⚠ Agregar SIEMPRE por client, NUNCA por profile (no hay profile_id). Si hacés JOIN a profile, agrupás por profile.id, vas a multiplicar la deuda × cantidad de perfiles.

## due_date  [SQL table: "due_date"]
Vencimientos fiscales próximos. Snapshot scrapeado periódicamente. No tiene montos.
  id (uuid PK)
  client_id (uuid → client.id) — ⚠ NO tiene profile_id (misma lógica que debt)
  tax (text), concept (text), sub_concept (text)
  period (text) — texto libre, sin formato garantizado
  quota_number (text), due_date (timestamp)
  detail (text) — descripción adicional del vencimiento

## iva_scrape
Snapshot mensual de la DDJJ de IVA (F.2002) por perfil. Una fila por (profile, período).
  id (uuid PK), profile_id (uuid → profile.id)
  periodo_fiscal (text) — formato 'MM/YYYY', ej: '03/2026'
  fecha_presentacion (text) — 'DD/MM/YYYY', nullable
  ok (boolean) — false = scrape incompleto, valores pueden estar vacíos
  debito_fiscal, credito_fiscal (numeric)
  saldo_mes_pasado (numeric) — saldo técnico arrastrado del período anterior
  saldo_arca_mes (numeric) — saldo a favor del fisco (cuando el fisco es acreedor)
  saldo_tecnico_favor_contribuyente (numeric) — saldo técnico a favor del contribuyente
  saldo_tecnico_favor_contribuyente_posicion_mensual (numeric)
  saldo_libre_disponibilidad_periodo_anterior_neto (numeric)
  total_retenciones_percepciones_periodo (numeric)
  saldo_libre_disponibilidad_favor_contribuyente_periodo (numeric)
  ► Para consultas de IVA usá SIEMPRE el tool getIvaPosition (más confiable que SQL directo)

## job
Tareas de scraping encoladas. Útil para saber cuándo fue la última actualización.
  id (uuid PK), client_id (uuid → client.id)
  type (text) — 'iva' | 'comprobantes' | 'comprobantes_full' | 'notificaciones' | 'deuda' | 'vencimientos'
  status (text) — 'pending' | 'running' | 'failed' | 'finished'
  started_at, finished_at, failed_at (timestamp)
  failed_reason (text)
  ► Para saber última actualización de un cliente: WHERE type='X' AND status='finished' ORDER BY finished_at DESC LIMIT 1

## liquidacion_import_empleado
Empleados de nómina de cada perfil.
  id (uuid PK), profile_id (uuid → profile.id)
  cuil (text), legajo (text), nombre (text)
  activo (boolean), fecha_alta (date), fecha_baja (date, null = vigente)
  tipo_jornada (text) — 'full_time' | 'part_time' | 'reducida'
  categoria (text), convenio_id (uuid → payroll_convenio.id, nullable)
  obra_social_id (uuid → obra_social.id, nullable)

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
  • La columna de tipo de cambio se llama "currency_rate" (bien escrita). No uses "cureency_rate" — esa es solo la propiedad JS de Drizzle con typo heredado.
  • debt y due_date NO tienen profile_id. Agregar SIEMPRE por client_id para no duplicar filas.
  • NUNCA expongas client.password (clave fiscal AFIP).
  • notification: siempre WHERE profile_id IS NOT NULL.
  • recibo_confirmado = false son borradores, excluirlos de totales.
  • Períodos en debt/due_date son texto libre, no comparables con LIKE fijo.
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

        // Historial de la conversación
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
          .limit(12);

        const historyUiMessages = prevMessages.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          parts: [{ type: 'text' as const, text: m.content }],
          content: m.content,
        }));

        const agent = new ToolLoopAgent({
          model: googleAI('gemini-2.5-flash'),
          instructions: `Sos Arca, analista financiero virtual del estudio contable. Tenés acceso directo a la base de datos de la organización y podés ejecutar queries SQL para responder preguntas sobre clientes, facturas, deudas, vencimientos, nómina y posición IVA.

IDENTIDAD Y TONO
- Respondés siempre en español rioplatense, tono profesional.
- Sos directo: primero el dato, después el contexto si hace falta.
- Usás el nombre del cliente en la respuesta, nunca el UUID.

COMPORTAMIENTO — MUY IMPORTANTE
- NUNCA describas lo que vas a hacer antes de hacerlo. Ejecutá el tool directamente y respondé con el resultado.
- NUNCA digas "voy a consultar", "necesito ejecutar", "permití que busque", "déjame verificar" ni frases similares. Hacelo y listo.
- Si una query falla, corregí el SQL y reintentá una vez sin comentarlo. Si falla dos veces, reportá el error técnico brevemente.
- En preguntas de seguimiento sobre el mismo cliente (ej: "¿y cuántas deudas tiene?"), SIEMPRE incluí el filtro organization_id = '${orgId}' en la nueva query. Nunca omitas este filtro aunque el cliente ya haya sido identificado antes.

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
- Toda query DEBE filtrar por organization_id = '${orgId}' via JOIN con client. Si una query no incluye este filtro, es un error de seguridad — no la ejecutes.
- Solo queries SELECT. Nunca INSERT, UPDATE, DELETE, DROP, ni nada que modifique datos.

${buildSchema(orgId)}

REGLAS AL ESCRIBIR QUERIES
1. Solo SELECT. Siempre incluí LIMIT (máximo 200).
2. SIEMPRE filtrá por organization_id = '${orgId}' via JOIN con client — en CADA query, incluso en follow-ups del mismo cliente.
3. Montos en ARS: CASE WHEN UPPER(currency)='USD' THEN amount::numeric * currency_rate::numeric ELSE amount::numeric END
4. Facturas — direction: "facturó/vendió" → WHERE LOWER(direction)='outbound' | "gastó/compró" → WHERE LOWER(direction)='inbound'
5. Notificaciones: siempre WHERE profile_id IS NOT NULL
6. Búsquedas por nombre de cliente: ILIKE '%texto%'
7. Si la pregunta no puede responderse con los datos disponibles, respondé: "No tengo información suficiente en la base de datos para responder eso."

HERRAMIENTAS DISPONIBLES
- executeQuery: para cualquier consulta SQL general (clientes, facturas, deudas, vencimientos, nómina).
- getIvaPosition: USÁ SIEMPRE ESTE TOOL para consultas sobre IVA, posición IVA, saldo IVA, crédito/débito fiscal.
  - El parámetro displayMonth es el mes que el usuario quiere ver (ej: "Marzo 2026" → "03/2026"). El tool internamente usa el mes anterior para consultar iva_scrape.
  - NUNCA respondas "no hay datos para X mes" desde la memoria de la conversación. Siempre volvé a llamar al tool con el displayMonth específico que pide el usuario.
  - Devuelve datos de todos los perfiles con totales al final. Para filtrar a uno específico, pasá profileName.`,
          tools: {
            executeQuery: tool({
              description:
                'Ejecuta una query SQL SELECT sobre la base de datos. Usá el schema del system prompt para construir la query correcta con los JOINs y filtros necesarios.',
              inputSchema: z.object({
                query: z
                  .string()
                  .describe(
                    'Query SQL SELECT. Debe incluir LIMIT y filtrar por organization_id via JOIN con client.'
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
                    error: `La query debe filtrar por organization_id = '${orgId}'. Revisá el JOIN con la tabla client.`,
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
                clientName: z.string().describe('Nombre del cliente (búsqueda parcial)'),
                displayMonth: z
                  .string()
                  .optional()
                  .describe(
                    'Mes que el usuario quiere ver, en formato MM/YYYY. Ej: "03/2026" para Marzo 2026. ' +
                    'Si no se especifica, usa el mes más reciente con datos disponibles. ' +
                    'IMPORTANTE: "marzo" → "03/2026", "febrero" → "02/2026", etc.'
                  ),
                profileName: z
                  .string()
                  .optional()
                  .describe('Nombre del perfil si querés filtrar a uno en particular'),
              }),
              execute: async ({ clientName, displayMonth, profileName }) => {
                const matchingClients = await dbReadonly
                  .select({ id: client.id, name: client.name })
                  .from(client)
                  .where(and(eq(client.organizationId, orgId), ilike(client.name, `%${clientName}%`)));

                if (matchingClients.length === 0)
                  return { error: `No encontré clientes con nombre "${clientName}"` };
                if (matchingClients.length > 1)
                  return { error: 'Más de un cliente coincide', options: matchingClients.map((c) => c.name) };

                const foundClient = matchingClients[0];

                const profileWhere = profileName
                  ? and(eq(profile.client, foundClient.id), ilike(profile.name, `%${profileName}%`))
                  : eq(profile.client, foundClient.id);

                const profiles = await dbReadonly
                  .select({ id: profile.id, name: profile.name, identityNumber: profile.identityNumber })
                  .from(profile)
                  .where(profileWhere);

                if (profiles.length === 0)
                  return { error: `No se encontraron perfiles para ${foundClient.name}` };

                const profileIds = profiles.map((p) => p.id);

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
                 *   invoicePeriod  = el mes que el usuario quiere ver ("displayMonth")
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
                  // Sin período: buscar el último iva_scrape disponible y derivar el mes de facturas
                  const rows = await dbReadonly.execute(sql.raw(
                    `SELECT periodo_fiscal FROM iva_scrape
                     WHERE profile_id = ANY(ARRAY[${profileIds.map((id) => `'${id}'`).join(',')}]::uuid[])
                     ORDER BY TO_DATE(periodo_fiscal, 'MM/YYYY') DESC LIMIT 1`
                  ));
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                  const arr = Array.from(rows) as Record<string, unknown>[];
                  if (arr.length === 0) return { error: `No hay datos de IVA disponibles para ${foundClient.name}.` };
                  ivaScrapeperiod = arr[0].periodo_fiscal as string; // eslint-disable-line @typescript-eslint/no-unsafe-assignment
                  invoicePeriod = nextMonthStr(ivaScrapeperiod);
                }

                const { from: dateFrom, to: dateTo } = periodToDateRange(invoicePeriod);
                const n = (v: string | null | undefined) => parseFloat(v ?? '0') || 0;

                const results = [];
                for (const p of profiles) {
                  // 1. iva_scrape: período del mes ANTERIOR al que se muestra (convención AFIP)
                  const [ivaRow] = await dbReadonly.select().from(ivaScrape)
                    .where(and(eq(ivaScrape.profileId, p.id), eq(ivaScrape.periodoFiscal, ivaScrapeperiod))).limit(1);

                  // 2. Facturas del mes que el usuario quiere ver (mismo para todos los perfiles)

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
                      eq(invoice.profile, p.id),
                      gte(invoice.emitionDate, dateFrom),
                      lte(invoice.emitionDate, dateTo),
                    ));

                  // 3. Calcular débito/crédito fiscal usando lógica compartida con el módulo de clientes
                  const ivaCalc = calcularIvaDesdeFacturas(invoices as InvoiceIvaRow[]);
                  const debitoFiscalCalculado = ivaCalc.debitoFiscal;
                  const creditoFiscalCalculado = ivaCalc.creditoFiscalCompras;
                  const { netoA21, netoA105, totalAmountB21: totalB21, totalAmountB105: totalB105, totalAmountB27: totalB27,
                    netoInbound21: netoIn21, netoInbound105: netoIn105, netoInbound27: netoIn27, netoInbound5: netoIn5, netoInbound25: netoIn25 } = ivaCalc;

                  // 4. Saldos de iva_scrape (AFIP)
                  const saldoAFavor = n(ivaRow?.saldoTecnicoFavorContribuyente);
                  const saldoLibreDisp = n(ivaRow?.saldoLibreDisponibilidadFavorContribuyentePeriodo);
                  const totalRetenciones = n(ivaRow?.totalRetencionesPercepcionesPeriodo);

                  const saldoTecnico = debitoFiscalCalculado - creditoFiscalCalculado - saldoAFavor;

                  results.push({
                    perfil: p.name,
                    cuit: p.identityNumber,
                    periodo: invoicePeriod,
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
                  });
                }

                if (results.length === 0)
                  return { error: `No hay datos para ${foundClient.name} en el período ${invoicePeriod}.` };

                const totales = results.length > 1 ? {
                  debitoFiscal: results.reduce((s, r) => s + n(r.ventas.debitoFiscal), 0).toFixed(2),
                  creditoFiscal: results.reduce((s, r) => s + n(r.compras.creditoFiscal), 0).toFixed(2),
                  saldoTecnico: results.reduce((s, r) => s + n(r.saldoTecnico), 0).toFixed(2),
                  saldoLibreDisponibilidad: results.reduce((s, r) => s + n(r.saldoLibreDisponibilidad), 0).toFixed(2),
                } : null;

                return {
                  cliente: foundClient.name,
                  periodoMostrado: invoicePeriod,       // el mes que el usuario ve (facturas)
                  periodoIvaScrape: ivaScrapeperiod,    // el mes de iva_scrape (mes anterior)
                  perfiles: results,
                  totales,
                };
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
              await db
                .insert(agentMessage)
                .values({ conversationId, role: 'user', content: userText });

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
