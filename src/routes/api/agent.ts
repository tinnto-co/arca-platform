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
import { setDbContext } from '@/lib/db-context';
import {
  agentConversation,
  agentMessage,
  cliente,
  clienteCredencial,
  comprobante,
  comprobanteAlicuota,
  comprobanteTipo,
  credencialAfip,
  ivaDeclaracion,
} from '@/drizzle/schema';
import { organization } from '@/drizzle/auth';
import { eq, and, sql, ilike, gte, lte, desc } from 'drizzle-orm';
import { calcularIva, type ComprobanteAlicuotaRow } from '@/lib/iva-calc';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Tabla en Markdown para que el modelo la renderice tal cual en el chat.
 * `headers` son las keys de los objetos de `rows`.
 */
function formatAsMarkdownTable(
  headers: string[],
  rows: Record<string, unknown>[]
): string {
  if (rows.length === 0) return '_Sin resultados._';
  const headerRow = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows = rows.map(
    (row) => `| ${headers.map((h) => String(row[h] ?? '')).join(' | ')} |`
  );
  return [headerRow, separator, ...dataRows].join('\n');
}

/** "MM/YYYY" → 'YYYY-MM-01', que es como se guardan los períodos mensuales. */
function periodoADate(periodo: string): string {
  const [mm, yyyy] = periodo.split('/');
  return `${yyyy}-${mm.padStart(2, '0')}-01`;
}

/** "MM/YYYY" → rango de fechas del mes, en 'YYYY-MM-DD' (columnas `date`). */
function rangoDelMes(periodo: string): { desde: string; hasta: string } {
  const [mm, yyyy] = periodo.split('/').map(Number);
  const ultimoDia = new Date(yyyy, mm, 0).getDate();
  const m = String(mm).padStart(2, '0');
  return {
    desde: `${yyyy}-${m}-01`,
    hasta: `${yyyy}-${m}-${String(ultimoDia).padStart(2, '0')}`,
  };
}

/** 'YYYY-MM-DD' → "MM/YYYY", para mostrarle el período al usuario. */
function dateAPeriodo(fecha: string): string {
  const [yyyy, mm] = fecha.split('-');
  return `${mm}/${yyyy}`;
}

const googleAI = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

const buildSchema = (orgId: string) => `
═══════════════════════════════════════════════
SCHEMA DE BASE DE DATOS — organización '${orgId}'
═══════════════════════════════════════════════

SEGURIDAD — OBLIGATORIO EN TODA QUERY
  La entidad central es "cliente" (la empresa con CUIT). Casi todas las tablas de
  hechos llevan org_id propio, así que el filtro es directo:

    WHERE <tabla>.org_id = '${orgId}'

  Tablas CON org_id: cliente, credencial_afip, comprobante, deuda, vencimiento,
  notificacion, job, empleado, recibo, alerta, documento, evento.

  Tablas SIN org_id — filtrá por el padre que sí lo tiene:
    iva_declaracion      → JOIN cliente c ON c.id = iva_declaracion.cliente_id
    comprobante_alicuota → JOIN comprobante cp ON cp.id = comprobante_alicuota.comprobante_id
    recibo_concepto      → JOIN recibo r ON r.id = recibo_concepto.recibo_id
    cliente_credencial   → JOIN cliente c ON c.id = cliente_credencial.cliente_id
  Catálogos globales sin org (no requieren filtro, pero nunca los uses como
  punto de entrada): comprobante_tipo, contraparte, concepto.

  NUNCA ejecutes INSERT / UPDATE / DELETE / DROP.

───────────────────────────────────────────────
TABLAS PRINCIPALES
───────────────────────────────────────────────

## cliente  [SQL table: "cliente"]
La empresa / contribuyente. Es el centro del modelo: facturas, IVA, deudas y
empleados cuelgan de acá.
  id (uuid PK)
  org_id (text) — filtro de seguridad
  cuit (text)
  razon_social (text) — el nombre que usa el usuario al hablar de "un cliente"
  tipo_persona — 'fisica' | 'juridica'
  condicion_iva — 'responsable_inscripto' | 'monotributista' | 'exento' | 'no_alcanzado'
  estado — 'activo' | 'pausado' | 'baja'
  email, telefono, domicilio, notas (text)

## credencial_afip  [SQL table: "credencial_afip"]
Login de AFIP del estudio. Un login puede administrar varias empresas.
  id (uuid PK), org_id (text)
  cuit (text) — CUIT del login
  nombre (text) — nombre de la persona que figura como titular del login
  estado — 'activa' | 'invalida' | 'bloqueada'
  ultimo_login_ok (timestamp)
  ⚠ NUNCA selecciones ni muestres la columna "clave" (clave fiscal AFIP, dato sensible).

## cliente_credencial  [SQL table: "cliente_credencial"]
Puente N:M entre empresa y login: qué credencial scrapea a qué cliente.
  cliente_id (uuid → cliente.id), credencial_id (uuid → credencial_afip.id)

## comprobante  [SQL table: "comprobante"]
Facturas emitidas y recibidas, scrapeadas de "Mis Comprobantes".
  id (uuid PK), org_id (text), cliente_id (uuid → cliente.id)
  direccion — 'emitido' = venta | 'recibido' = compra
    SEMÁNTICA OBLIGATORIA:
      "facturó/vendió/emitió/facturación" → WHERE direccion = 'emitido'
      "gastó/compró/compras/proveedores"  → WHERE direccion = 'recibido'
      NUNCA sumes emitido + recibido salvo que se pida el total combinado explícitamente.
  tipo (smallint) — código AFIP del comprobante (1=Fact.A, 6=Fact.B, 11=Fact.C, 3=NC A…).
    Para la letra o saber si es nota de crédito, JOIN comprobante_tipo (NO hardcodees códigos).
  punto_venta (int), numero (bigint), cae (text)
  fecha_emision (date), periodo (date, generada = día 1 del mes de fecha_emision)
  contraparte_id (uuid → contraparte.id) — el otro lado de la operación
  moneda (char(3)), cotizacion (numeric, 1 si es ARS)
  neto_gravado, neto_no_gravado, exento, otros_tributos, iva_total, total (numeric)
  ► Convertir a ARS: total::numeric * cotizacion::numeric  (cotizacion ya vale 1 en ARS)

## comprobante_tipo  [SQL table: "comprobante_tipo"]
Catálogo de tipos de comprobante AFIP.
  codigo (smallint PK) — se une con comprobante.tipo
  descripcion (text), letra (char) — 'A' | 'B' | 'C' | 'M' | 'E' | NULL
  clase — 'factura' | 'nota_credito' | 'nota_debito' | 'recibo' | 'tique'
  es_nc (boolean) — true si es nota de crédito
  discrimina_iva (boolean)

## comprobante_alicuota  [SQL table: "comprobante_alicuota"]
Una fila por alícuota de cada comprobante. Acá vive el IVA discriminado.
  comprobante_id (uuid → comprobante.id)
  alicuota (numeric) — puntos porcentuales: 21.00, 10.50, 27.00, 5.00, 2.50
  neto (numeric), iva (numeric)
  ► Para posición IVA usá SIEMPRE el tool getIvaPosition, no SQL directo.

## contraparte  [SQL table: "contraparte"]
Catálogo global de emisores/receptores vistos en comprobantes.
  id (uuid PK), doc_tipo — 'cuit' | 'dni' | 'otro', doc_nro (text)
  nombre (text), provincia (text) — provincia del receptor para IIBB

## iva_declaracion  [SQL table: "iva_declaracion"]
DDJJ mensual de IVA (F.2002) scrapeada de AFIP. Una fila por (cliente, período).
  id (uuid PK), cliente_id (uuid → cliente.id)
  periodo (date) — día 1 del mes declarado. Ej: marzo 2026 → DATE '2026-03-01'
  presentada_at (date, nullable)
  debito_fiscal, credito_fiscal (numeric)
  saldo_mes_anterior, saldo_afip_mes (numeric)
  saldo_tecnico_favor, saldo_tecnico_favor_mensual (numeric)
  saldo_libre_disponibilidad_anterior_neto (numeric)
  retenciones_percepciones_periodo (numeric)
  saldo_libre_disponibilidad_favor (numeric)
  ⚠ debito_fiscal NULL = el scrape quedó incompleto.

## deuda  [SQL table: "deuda"]
Deudas con AFIP del último scrape. Snapshot, no histórico.
  id (uuid PK), org_id (text)
  credencial_id (uuid → credencial_afip.id) — el login que la reportó
  cliente_id (uuid → cliente.id, NULLABLE) — AFIP publica la deuda por CUIT del
    login, así que puede no estar atribuida a ninguna empresa
  cuit (text) — CUIT al que AFIP le imputa la deuda
  impuesto (text) — 'IVA' | 'Ganancias' | 'Monotributo' | 'Autónomos' | …
  concepto (text), sub_concepto (text)
  periodo (date, nullable), cuota (numeric), vence_at (date)
  saldo, interes_resarcitorio, interes_punitorio (numeric)
  estado — 'abierta' | 'pagada' | 'plan_pago' | 'prescripta'
  ► Deuda total = saldo + interes_resarcitorio + interes_punitorio

## vencimiento  [SQL table: "vencimiento"]
Vencimientos fiscales próximos. Snapshot scrapeado. No tiene montos.
  id (uuid PK), org_id (text), credencial_id (uuid), cliente_id (uuid, NULLABLE)
  cuit (text), impuesto (text), concepto (text), sub_concepto (text)
  periodo (date, nullable), cuota (numeric), vence_at (date NOT NULL)
  detalle (text), completado_at (timestamp, NULL = pendiente)

## notificacion  [SQL table: "notificacion"]
Notificaciones del domicilio fiscal electrónico de AFIP.
  id (uuid PK), org_id (text), credencial_id (uuid), cliente_id (uuid, NULLABLE)
  mensaje (text), publicada_at (timestamp), vence_at (timestamp)
  leida (boolean) — true si el estudio la marcó como leída
  severidad — 'sin_clasificar' | 'informativa' | 'accion_requerida' | 'urgente'
  categoria (text), resuelta_at (timestamp)

## job  [SQL table: "job"]
Tareas de scraping encoladas. Sirve para saber cuándo se actualizó cada dato.
  id (uuid PK), org_id (text), credencial_id (uuid), cliente_id (uuid, NULLABLE)
  type — 'iva' | 'comprobantes' | 'comprobantes_full' | 'notificaciones' | 'deuda' | 'vencimientos' | 'batch'
  status — 'pending' | 'running' | 'failed' | 'finished'
  started_at, finished_at, failed_at (timestamp), failed_reason (text)
  ► Última actualización: WHERE type='X' AND status='finished' ORDER BY finished_at DESC LIMIT 1

## empleado  [SQL table: "empleado"]
Empleados de nómina de cada empresa.
  id (uuid PK), org_id (text), cliente_id (uuid → cliente.id)
  cuil (text), legajo (text), nombre (text)
  activo (boolean), fecha_alta (date), fecha_baja (date, NULL = vigente)
  tipo_jornada — 'full_time' | 'part_time' | 'reducida'
  convenio_id (uuid → convenio.id), categoria_id (uuid → convenio_categoria.id)

## recibo  [SQL table: "recibo"]
Recibos de sueldo por empleado y período. Cuelga de cliente Y de empleado.
  id (uuid PK), org_id (text), cliente_id (uuid), empleado_id (uuid → empleado.id)
  periodo (date) — día 1 del mes liquidado. Ej: marzo 2026 → DATE '2026-03-01'
  tipo — 'mensual' | 'quincenal' | 'sac' | 'liquidacion_final' | 'vacaciones'
  basico, haberes, no_remunerativo, descuentos, retenciones, neto (numeric)
  confirmado (boolean) — false son borradores, excluilos de los totales
  fecha, fecha_pago (date), forma_pago (text)
  ► Sueldos del mes: WHERE periodo = DATE 'YYYY-MM-01' AND tipo='mensual' AND confirmado = true

## recibo_concepto  [SQL table: "recibo_concepto"]
Líneas de cada recibo (un concepto por fila).
  id (uuid PK), recibo_id (uuid → recibo.id), concepto_id (uuid → concepto.id)
  tipo — 'remunerativo' | 'no_remunerativo' | 'descuento' | 'retencion'
  monto (numeric)

## concepto  [SQL table: "concepto"]
Catálogo global de conceptos de liquidación.
  id (uuid PK), numero (smallint) — número SOS, nombre (text), codigo_afip (text)

───────────────────────────────────────────────
PERÍODOS
───────────────────────────────────────────────
  Todos los períodos mensuales son columnas DATE con el día 1 del mes:
    iva_declaracion.periodo, recibo.periodo, deuda.periodo, vencimiento.periodo,
    comprobante.periodo (generada desde fecha_emision)
  Comparalos directo entre tablas: WHERE periodo = DATE '2026-03-01'.
  No hay strings 'MM/YYYY' ni 'YYYY-MM' en la base: no uses TO_DATE().

───────────────────────────────────────────────
TRAMPAS CONOCIDAS
───────────────────────────────────────────────
  • comprobante.direccion es un enum en minúscula: 'emitido' / 'recibido'. Sin ILIKE.
  • El IVA no está en comprobante: vive en comprobante_alicuota (una fila por alícuota).
  • deuda / vencimiento / notificacion pueden tener cliente_id NULL: AFIP los publica
    por CUIT del login. Si el usuario pregunta por una empresa, filtrá por cliente_id;
    si pregunta "todo lo del login", filtrá por credencial_id.
  • NUNCA expongas credencial_afip.clave (clave fiscal AFIP).
  • recibo.confirmado = false son borradores, excluirlos de totales.
  • Para saber si un comprobante es nota de crédito usá comprobante_tipo.es_nc,
    nunca una lista de códigos escrita a mano.

───────────────────────────────────────────────
EJEMPLOS DE QUERIES FRECUENTES
───────────────────────────────────────────────

-- Deudas de un cliente (saldo + intereses = total real)
SELECT d.impuesto, d.concepto, d.sub_concepto, d.periodo,
  ROUND(d.saldo::numeric + d.interes_resarcitorio::numeric + d.interes_punitorio::numeric, 2) AS total
FROM deuda d
JOIN cliente c ON c.id = d.cliente_id
WHERE d.org_id = '${orgId}' AND c.razon_social ILIKE '%nombre%' AND d.estado = 'abierta'
ORDER BY total DESC LIMIT 50;

-- Vencimientos próximos 30 días de un cliente
SELECT c.razon_social, v.impuesto, v.concepto, v.vence_at, v.detalle
FROM vencimiento v
JOIN cliente c ON c.id = v.cliente_id
WHERE v.org_id = '${orgId}' AND c.razon_social ILIKE '%nombre%'
  AND v.completado_at IS NULL
  AND v.vence_at BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
ORDER BY v.vence_at ASC LIMIT 20;

-- Notificaciones no leídas de un cliente
SELECT n.mensaje, n.severidad, n.categoria, n.publicada_at::date
FROM notificacion n
WHERE n.org_id = '${orgId}' AND n.cliente_id = '<uuid>' AND n.leida = false
ORDER BY n.publicada_at DESC LIMIT 20;

-- Facturación de un mes por empresa
SELECT c.razon_social,
  ROUND(SUM(cp.total::numeric * cp.cotizacion::numeric), 2) AS ventas_ars
FROM comprobante cp
JOIN cliente c ON c.id = cp.cliente_id
WHERE cp.org_id = '${orgId}' AND cp.direccion = 'emitido'
  AND cp.periodo = DATE '2026-03-01'
GROUP BY c.id, c.razon_social ORDER BY ventas_ars DESC LIMIT 50;

-- Último scrape exitoso por tipo
SELECT j.type, MAX(j.finished_at) AS ultima_actualizacion
FROM job j
WHERE j.org_id = '${orgId}' AND j.status = 'finished'
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
        setDbContext({ orgId });
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
              eq(agentConversation.orgId, orgId),
              eq(agentConversation.userId, userId)
            )
          )
          .limit(1);

        if (!existingConv) {
          await db
            .insert(agentConversation)
            .values({
              id: conversationId,
              orgId,
              userId,
              titulo:
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
          .values({ conversationId, role: 'user', contenido: userText });

        // Historial de la conversación (ya incluye el mensaje que acabamos de guardar)
        const prevMessages = await db
          .select({
            id: agentMessage.id,
            role: agentMessage.role,
            contenido: agentMessage.contenido,
          })
          .from(agentMessage)
          .where(eq(agentMessage.conversationId, conversationId))
          .orderBy(agentMessage.createdAt)
          .limit(20);

        // Excluir el último mensaje (el que acabamos de insertar — el user message actual)
        // porque ya viene en `message` y lo agregamos explícitamente al final.
        const historyUiMessages = prevMessages.slice(0, -1).map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          parts: [{ type: 'text' as const, text: m.contenido }],
          content: m.contenido,
        }));

        /**
         * Resuelve el nombre que tipeó el usuario a una única empresa de la org.
         * Busca primero por razón social y, si no hay match, por el nombre del
         * login de AFIP (que agrupa varias empresas y es como el estudio suele
         * referirse a "el cliente").
         */
        const resolverCliente = async (nombre: string) => {
          const porRazonSocial = await dbReadonly
            .select({
              id: cliente.id,
              razonSocial: cliente.razonSocial,
              cuit: cliente.cuit,
            })
            .from(cliente)
            .where(
              and(
                eq(cliente.orgId, orgId),
                ilike(cliente.razonSocial, `%${nombre}%`)
              )
            );

          if (porRazonSocial.length > 0) return porRazonSocial;

          return await dbReadonly
            .select({
              id: cliente.id,
              razonSocial: cliente.razonSocial,
              cuit: cliente.cuit,
            })
            .from(cliente)
            .innerJoin(
              clienteCredencial,
              eq(clienteCredencial.clienteId, cliente.id)
            )
            .innerJoin(
              credencialAfip,
              eq(clienteCredencial.credencialId, credencialAfip.id)
            )
            .where(
              and(
                eq(cliente.orgId, orgId),
                ilike(credencialAfip.nombre, `%${nombre}%`)
              )
            );
        };

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
- En preguntas de seguimiento sobre el mismo cliente (ej: "¿y cuántas deudas tiene?"), SIEMPRE volvé a incluir el filtro org_id = '${orgId}' en la nueva query. Nunca lo omitas aunque el cliente ya haya sido identificado antes.

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
- Toda query DEBE filtrar por org_id = '${orgId}'. Si una query no incluye este filtro, es un error de seguridad — no la ejecutes.
- Solo queries SELECT. Nunca INSERT, UPDATE, DELETE, DROP, ni nada que modifique datos.

${buildSchema(orgId)}

REGLAS AL ESCRIBIR QUERIES
1. Solo SELECT. Siempre incluí LIMIT (máximo 200).
2. SIEMPRE filtrá por org_id = '${orgId}' — en CADA query, incluso en follow-ups del mismo cliente. Si la tabla no tiene org_id, joineá con la que sí lo tiene.
3. Montos en ARS: total::numeric * cotizacion::numeric (cotizacion vale 1 cuando la moneda es ARS).
4. Comprobantes — direccion: "facturó/vendió" → WHERE direccion = 'emitido' | "gastó/compró" → WHERE direccion = 'recibido'
5. Deudas, vencimientos y notificaciones pueden tener cliente_id NULL (AFIP los publica por CUIT del login). Para preguntas sobre una empresa, filtrá por cliente_id.
6. Búsquedas por nombre de cliente: cliente.razon_social ILIKE '%texto%'. Si no encontrás nada, probá contra credencial_afip.nombre (el nombre del login de AFIP) y bajá a sus clientes vía cliente_credencial.
7. No agregues el sufijo societario exacto al ILIKE: para "Produsel S.A" buscá ILIKE '%Produsel%' (sin "S.A."/"S.A"/puntos), porque la razón social guardada puede variar en el sufijo.
8. Si la pregunta no puede responderse con los datos disponibles, respondé: "No tengo información suficiente en la base de datos para responder eso."

HERRAMIENTAS DISPONIBLES
- executeQuery: para cualquier consulta SQL general. Usala para clientes, comprobantes, deudas, vencimientos, notificaciones, convenios, empleados (cantidad, filtros), empresas con sueldos, o cualquier consulta que no tenga tool dedicada.
- getIvaPosition: USÁ SIEMPRE ESTE TOOL para consultas sobre IVA, posición IVA, saldo IVA, crédito/débito fiscal. Tiene lógica interna que SQL solo no puede replicar.
- getMontosfacturacion: montos totales de ventas y compras en ARS. Acepta empresa y/o período opcionales.
- getEmpleados: lista los empleados de una empresa con legajo, nombre, CUIL y si está activo, ya formateada como tabla.
- getMontosNomina: montos de nómina (básico, bruto, no remunerativo, neto) de una empresa para un período. Solo recibos confirmados de tipo mensual.
- getResumenCliente: USÁ ESTE TOOL cuando el usuario pida un resumen, panorama general o "cómo está" una empresa. Devuelve en una sola llamada: deuda AFIP total, vencimientos próximos, facturación del mes, notificaciones no leídas y última actualización de datos. Nunca uses múltiples tools para armar un resumen si podés usar este.
  - El parámetro periodo de getIvaPosition es el mes que se declara, en formato MM/YYYY (ej: "Marzo 2026" → "03/2026"). Es el mismo mes de los comprobantes: no hay desfasaje.
  - NUNCA respondas "no hay datos para X mes" desde la memoria de la conversación. Siempre volvé a llamar al tool con el período específico que pide el usuario.`,
          tools: {
            executeQuery: tool({
              description:
                'Ejecuta una query SQL SELECT sobre la base de datos. Usá el schema del system prompt para construir la query correcta con los JOINs y filtros necesarios.',
              inputSchema: z.object({
                query: z
                  .string()
                  .describe(
                    'Query SQL SELECT. Debe incluir LIMIT y filtrar por org_id.'
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
                    error: `La query debe filtrar por org_id = '${orgId}'. Si la tabla no tiene org_id, joineá con la que sí lo tiene (cliente, comprobante, recibo…).`,
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
                'Obtiene la posición IVA completa de una empresa para un período. Cruza los comprobantes del mes con la DDJJ presentada en AFIP. Usá este tool para cualquier consulta sobre IVA, saldo IVA, débito/crédito fiscal.',
              inputSchema: z.object({
                clientName: z.string().describe('Nombre de la empresa (búsqueda parcial)'),
                periodo: z
                  .string()
                  .optional()
                  .describe(
                    'Período a consultar en formato MM/YYYY. Ej: "03/2026" para Marzo 2026. ' +
                    'Si no se especifica, usa el período más reciente con DDJJ disponible.'
                  ),
              }),
              execute: async ({ clientName, periodo }) => {
                console.info('[agent.getIvaPosition] llamado con:', { clientName, periodo });
                try {
                  const matches = await resolverCliente(clientName);
                  if (matches.length === 0)
                    return { error: `No encontré empresas con nombre "${clientName}"` };
                  if (matches.length > 1)
                    return {
                      error: 'Más de una empresa coincide',
                      opciones: matches.map((c) => c.razonSocial),
                    };

                  const found = matches[0];

                  // Los comprobantes del mes y la DDJJ de AFIP son del MISMO
                  // período: no hay desfasaje entre ambos.
                  let periodoDate: string;
                  if (periodo) {
                    periodoDate = periodoADate(periodo);
                  } else {
                    const [ultima] = await dbReadonly
                      .select({ periodo: ivaDeclaracion.periodo })
                      .from(ivaDeclaracion)
                      .where(eq(ivaDeclaracion.clienteId, found.id))
                      .orderBy(desc(ivaDeclaracion.periodo))
                      .limit(1);
                    if (!ultima)
                      return { error: `No hay datos de IVA disponibles para ${found.razonSocial}.` };
                    periodoDate = ultima.periodo;
                  }

                  const periodoLabel = dateAPeriodo(periodoDate);
                  const { desde, hasta } = rangoDelMes(periodoLabel);
                  const n = (v: string | null | undefined) => parseFloat(v ?? '0') || 0;

                  const [declaracion] = await dbReadonly
                    .select()
                    .from(ivaDeclaracion)
                    .where(
                      and(
                        eq(ivaDeclaracion.clienteId, found.id),
                        eq(ivaDeclaracion.periodo, periodoDate)
                      )
                    )
                    .limit(1);

                  // El IVA se calcula desde las alícuotas discriminadas, no desde
                  // el total del comprobante.
                  const alicuotas: ComprobanteAlicuotaRow[] = await dbReadonly
                    .select({
                      direccion: comprobante.direccion,
                      letra: comprobanteTipo.letra,
                      esNc: comprobanteTipo.esNc,
                      moneda: comprobante.moneda,
                      cotizacion: comprobante.cotizacion,
                      alicuota: comprobanteAlicuota.alicuota,
                      neto: comprobanteAlicuota.neto,
                      iva: comprobanteAlicuota.iva,
                    })
                    .from(comprobanteAlicuota)
                    .innerJoin(
                      comprobante,
                      eq(comprobanteAlicuota.comprobanteId, comprobante.id)
                    )
                    .innerJoin(
                      comprobanteTipo,
                      eq(comprobante.tipo, comprobanteTipo.codigo)
                    )
                    .where(
                      and(
                        eq(comprobante.clienteId, found.id),
                        gte(comprobante.fechaEmision, desde),
                        lte(comprobante.fechaEmision, hasta)
                      )
                    );

                  const iva = calcularIva(alicuotas);
                  const saldoAFavor = n(declaracion?.saldoTecnicoFavor);
                  const saldoLibreDisp = n(declaracion?.saldoLibreDisponibilidadFavor);
                  const retenciones = n(declaracion?.retencionesPercepcionesPeriodo);

                  return {
                    cliente: found.razonSocial,
                    cuit: found.cuit,
                    periodo: periodoLabel,
                    presentadaAt: declaracion?.presentadaAt ?? 'No disponible',
                    ventas: {
                      netoA21: iva.netoA21.toFixed(2),
                      netoA105: iva.netoA105.toFixed(2),
                      totalB21: iva.totalAmountB21.toFixed(2),
                      totalB105: iva.totalAmountB105.toFixed(2),
                      totalB27: iva.totalAmountB27.toFixed(2),
                      debitoFiscal: iva.debitoFiscal.toFixed(2),
                    },
                    compras: {
                      netoGravado21: iva.netoInbound21.toFixed(2),
                      netoGravado105: iva.netoInbound105.toFixed(2),
                      netoGravado27: iva.netoInbound27.toFixed(2),
                      creditoFiscal: iva.creditoFiscalCompras.toFixed(2),
                    },
                    saldosAFIP: {
                      debitoFiscalDeclarado: declaracion?.debitoFiscal ?? null,
                      creditoFiscalDeclarado: declaracion?.creditoFiscal ?? null,
                      saldoTecnicoFavor: declaracion?.saldoTecnicoFavor ?? null,
                      saldoLibreDisponibilidad: declaracion?.saldoLibreDisponibilidadFavor ?? null,
                      retencionesPercepciones: declaracion?.retencionesPercepcionesPeriodo ?? null,
                    },
                    saldoTecnico: (
                      iva.debitoFiscal -
                      iva.creditoFiscalCompras -
                      saldoAFavor
                    ).toFixed(2),
                    saldoLibreDisponibilidad: saldoLibreDisp.toFixed(2),
                    totalRetencionesPercepciones: retenciones.toFixed(2),
                    tieneDatosAFIP: !!declaracion,
                  };
                } catch (err: any) {
                  console.error('[agent.getIvaPosition] error:', err?.message, err?.stack);
                  return { error: `Error al calcular posición IVA: ${err?.message ?? 'error desconocido'}` };
                }
              },
            }),
            getMontosfacturacion: tool({
              description:
                'Muestra los montos totales de ventas (emitidos) y compras (recibidos) en ARS. ' +
                'Puede filtrar por empresa y/o período. Si no se especifica empresa muestra todas; ' +
                'si no se especifica período muestra el acumulado total.',
              inputSchema: z.object({
                clientName: z.string().optional().describe('Nombre parcial de la empresa. Opcional.'),
                periodo: z.string().optional().describe('Período en formato MM/YYYY. Ej: "03/2026". Opcional.'),
              }),
              execute: async ({ clientName, periodo }) => {
                console.info('[agent.getMontosfacturacion]', { clientName, periodo });
                try {
                  let clienteFilter = '';
                  if (clientName) {
                    const matches = await resolverCliente(clientName);
                    if (matches.length === 0)
                      return { error: `No encontré empresas con nombre "${clientName}"` };
                    if (matches.length > 1)
                      return { error: 'Más de una empresa coincide', opciones: matches.map((m) => m.razonSocial) };
                    clienteFilter = `AND cp.cliente_id = '${matches[0].id}'`;
                  }
                  const periodoFilter = periodo
                    ? `AND cp.periodo = DATE '${periodoADate(periodo)}'`
                    : '';
                  const rows = Array.from(await dbReadonly.execute(sql.raw(`
                    SELECT c.razon_social AS empresa,
                      ROUND(SUM(CASE WHEN cp.direccion = 'emitido'
                        THEN cp.total::numeric * cp.cotizacion::numeric ELSE 0 END), 2) AS ventas_ars,
                      ROUND(SUM(CASE WHEN cp.direccion = 'recibido'
                        THEN cp.total::numeric * cp.cotizacion::numeric ELSE 0 END), 2) AS compras_ars
                    FROM comprobante cp
                    JOIN cliente c ON c.id = cp.cliente_id
                    WHERE cp.org_id = '${orgId}' ${clienteFilter} ${periodoFilter}
                    GROUP BY c.id, c.razon_social ORDER BY ventas_ars DESC
                  `))) as Record<string, unknown>[];
                  if (rows.length === 0) return { mensaje: 'No hay comprobantes para el criterio indicado.' };
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
                'Lista los empleados de una empresa con legajo, nombre, CUIL y si está activo. ' +
                'Usalo cuando el usuario quiera ver el listado de empleados de una empresa.',
              inputSchema: z.object({
                clientName: z.string().describe('Nombre parcial de la empresa.'),
              }),
              execute: async ({ clientName }) => {
                console.info('[agent.getEmpleados]', { clientName });
                try {
                  const matches = await resolverCliente(clientName);
                  if (matches.length === 0)
                    return { error: `No encontré empresas con nombre "${clientName}"` };
                  if (matches.length > 1)
                    return { error: 'Más de una empresa coincide', opciones: matches.map((m) => m.razonSocial) };
                  const rows = Array.from(await dbReadonly.execute(sql.raw(`
                    SELECT e.legajo, e.nombre, e.cuil, e.activo
                    FROM empleado e
                    WHERE e.org_id = '${orgId}' AND e.cliente_id = '${matches[0].id}'
                    ORDER BY e.activo DESC, e.nombre ASC
                  `))) as Record<string, unknown>[];
                  if (rows.length === 0)
                    return { mensaje: `${matches[0].razonSocial} no tiene empleados registrados.` };
                  const tabla = formatAsMarkdownTable(['legajo', 'nombre', 'cuil', 'activo'], rows);
                  return { empresa: matches[0].razonSocial, tabla, total: rows.length };
                } catch (err: any) {
                  console.error('[agent.getEmpleados] error:', err?.message);
                  return { error: `Error: ${err?.message}` };
                }
              },
            }),
            getMontosNomina: tool({
              description:
                'Muestra los montos de nómina de una empresa para un período: básico, bruto, ' +
                'no remunerativo y neto a pagar. Solo incluye recibos confirmados de tipo mensual.',
              inputSchema: z.object({
                clientName: z.string().describe('Nombre parcial de la empresa.'),
                periodo: z.string().describe('Período en formato MM/YYYY. Ej: "03/2026".'),
              }),
              execute: async ({ clientName, periodo }) => {
                console.info('[agent.getMontosNomina]', { clientName, periodo });
                try {
                  const matches = await resolverCliente(clientName);
                  if (matches.length === 0)
                    return { error: `No encontré empresas con nombre "${clientName}"` };
                  if (matches.length > 1)
                    return { error: 'Más de una empresa coincide', opciones: matches.map((m) => m.razonSocial) };
                  const rows = Array.from(await dbReadonly.execute(sql.raw(`
                    SELECT COUNT(*)::int AS cantidad_recibos,
                      ROUND(SUM(r.basico::numeric), 2) AS total_basico,
                      ROUND(SUM(r.haberes::numeric), 2) AS total_bruto,
                      ROUND(SUM(r.no_remunerativo::numeric), 2) AS total_no_remunerativo,
                      ROUND(SUM(r.neto::numeric), 2) AS total_neto
                    FROM recibo r
                    WHERE r.org_id = '${orgId}'
                      AND r.cliente_id = '${matches[0].id}'
                      AND r.periodo = DATE '${periodoADate(periodo)}'
                      AND r.confirmado = true
                      AND r.tipo = 'mensual'
                  `))) as Record<string, unknown>[];
                  const row = rows[0];
                  if (!row || row.cantidad_recibos === 0)
                    return { mensaje: `No hay recibos confirmados para ${matches[0].razonSocial} en ${periodo}.` };
                  return { empresa: matches[0].razonSocial, periodo, ...row };
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
                  const matches = await resolverCliente(clientName);
                  if (matches.length === 0)
                    return { error: `No encontré empresas con nombre "${clientName}"` };
                  if (matches.length > 1)
                    return { error: 'Más de una empresa coincide', opciones: matches.map((m) => m.razonSocial) };

                  const found = matches[0];
                  const now = new Date();
                  const mm = String(now.getMonth() + 1).padStart(2, '0');
                  const yyyy = String(now.getFullYear());

                  const [deudas, vencimientos, ultimosJobs, facturacion, notificaciones] = await Promise.all([
                    // Deudas AFIP abiertas
                    dbReadonly.execute(sql.raw(`
                      SELECT d.impuesto, d.concepto, d.sub_concepto, d.periodo,
                        ROUND(d.saldo::numeric + d.interes_resarcitorio::numeric + d.interes_punitorio::numeric, 2) AS total
                      FROM deuda d
                      WHERE d.org_id = '${orgId}' AND d.cliente_id = '${found.id}'
                        AND d.estado = 'abierta'
                      ORDER BY total DESC LIMIT 20
                    `)),
                    // Vencimientos pendientes en los próximos 30 días
                    dbReadonly.execute(sql.raw(`
                      SELECT v.impuesto, v.concepto, v.vence_at, v.detalle
                      FROM vencimiento v
                      WHERE v.org_id = '${orgId}' AND v.cliente_id = '${found.id}'
                        AND v.completado_at IS NULL
                        AND v.vence_at BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
                      ORDER BY v.vence_at ASC LIMIT 10
                    `)),
                    // Último job exitoso por tipo, de los logins que scrapean a esta empresa
                    dbReadonly.execute(sql.raw(`
                      SELECT j.type, MAX(j.finished_at)::date AS ultima_actualizacion
                      FROM job j
                      JOIN cliente_credencial cc ON cc.credencial_id = j.credencial_id
                      WHERE j.org_id = '${orgId}' AND cc.cliente_id = '${found.id}'
                        AND j.status = 'finished'
                      GROUP BY j.type ORDER BY j.type
                    `)),
                    // Facturación del mes actual
                    dbReadonly.execute(sql.raw(`
                      SELECT
                        ROUND(SUM(CASE WHEN cp.direccion = 'emitido'
                          THEN cp.total::numeric * cp.cotizacion::numeric ELSE 0 END), 2) AS ventas_ars,
                        ROUND(SUM(CASE WHEN cp.direccion = 'recibido'
                          THEN cp.total::numeric * cp.cotizacion::numeric ELSE 0 END), 2) AS compras_ars,
                        COUNT(*)::int AS cantidad_comprobantes
                      FROM comprobante cp
                      WHERE cp.org_id = '${orgId}' AND cp.cliente_id = '${found.id}'
                        AND cp.periodo = DATE '${yyyy}-${mm}-01'
                    `)),
                    // Notificaciones no leídas
                    dbReadonly.execute(sql.raw(`
                      SELECT n.mensaje, n.severidad, n.categoria, n.publicada_at::date AS publicada_at
                      FROM notificacion n
                      WHERE n.org_id = '${orgId}' AND n.cliente_id = '${found.id}'
                        AND n.leida = false
                      ORDER BY n.publicada_at DESC LIMIT 5
                    `)),
                  ]);

                  const deudasRows = Array.from(deudas as unknown[]) as Record<string, unknown>[];
                  const deudaTotal = deudasRows.reduce((acc, r) => acc + (parseFloat(String(r.total ?? 0)) || 0), 0);

                  return {
                    empresa: found.razonSocial,
                    cuit: found.cuit,
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
                  contenido: assistantText,
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
