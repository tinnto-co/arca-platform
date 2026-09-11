'use client';

import { useEffect, useRef } from 'react';
import { useCopilotAction } from '@copilotkit/react-core';
import { CheckCircle2 } from 'lucide-react';
import {
  getIvaPositionForCopilot,
  getResumenSaludCliente,
  type GetIvaPositionForCopilotResult,
  type GetResumenSaludClienteResult,
} from '@/actions/copilot';
import { getDashboardStats, getUpcomingDueDates } from '@/actions/dashboard';
import { markNotificationOpened } from '@/actions/notification';
import {
  getResumenLiquidacionMes,
  type GetResumenLiquidacionMesResult,
} from '@/actions/sueldos';
import {
  MiniKpiCardsRow,
  type DashboardStats,
} from '@/components/dashboard/mini-kpi-cards';
import {
  VencimientosList,
  type VencimientoItem,
} from '@/components/dashboard/vencimientos-list';
import { getPeriodoMesAnterior } from '@/lib/payroll-period-rules';
import {
  ChatAviso,
  ChatCard,
  ChatCardHead,
  ChatCargando,
  ChatVacio,
} from './chat-card';
import { ConfirmationCard } from './ConfirmationCard';
import { CopilotIvaResume } from './CopilotIvaResume';
import { ListaClientes } from './ListaClientes';
import { ResumenLiquidacionMes } from './ResumenLiquidacionMes';
import { ResumenSaludCliente } from './ResumenSaludCliente';
import { ScanPdfConfirmation } from './ScanPdfConfirmation';
import { ScrapeConfirmation } from './ScrapeConfirmation';
import {
  mensajeDeFallo,
  resolverCliente,
  type ClienteCopilot,
} from './resolver-cliente';
import { useClientesCopilot } from './use-clientes-copilot';

/** Lo que devuelve una tool cuando el nombre no resolvió a una sola empresa. */
interface FalloResolucion {
  error: string;
}

function esFallo(v: unknown): v is FalloResolucion {
  return typeof v === 'object' && v !== null && 'error' in v;
}

/**
 * En qué quedó una acción que pedía confirmación, una vez terminada.
 *
 * El estado final se lee del `result` del turno, no del estado interno de la
 * card: cuando la acción se completa, CopilotKit vuelve a montar lo que
 * devuelve el render y ese estado se pierde. Antes eso dejaba a la vista una
 * card con los botones Cancelar/Confirmar todavía puestos sobre algo que ya
 * se había cancelado.
 */
function ResultadoAccion({
  titulo,
  sub,
  result,
}: {
  titulo: string;
  sub: string;
  result: unknown;
}) {
  const r = (result ?? {}) as {
    cancelled?: boolean;
    success?: boolean;
    error?: string;
  };

  if (r.cancelled) {
    return (
      <ChatCard className="my-1.5">
        <ChatCardHead title={titulo} sub={sub} />
        <div className="px-3 py-2.5 text-[12.5px] text-[var(--arca-ink-3)]">
          Cancelado. No se cambió nada.
        </div>
      </ChatCard>
    );
  }
  if (r.error ?? r.success === false) {
    return (
      <ChatAviso>{r.error ?? 'No se pudo completar la acción.'}</ChatAviso>
    );
  }
  return (
    <ChatCard className="my-1.5">
      <ChatCardHead title={titulo} sub={sub} />
      <div className="flex items-center gap-2 px-3 py-2.5 text-[12.5px] text-[var(--arca-accent-pos-fg)]">
        <CheckCircle2 className="size-3.5 shrink-0" />
        Listo.
      </div>
    </ChatCard>
  );
}

/**
 * El aviso de una acción que ni siquiera puede empezar —no se supo qué empresa
 * es—, que además cierra el turno.
 *
 * Las acciones con `renderAndWaitForResponse` dejan la conversación colgada
 * hasta que alguien llama a `respond`: si el fallo se muestra y nadie
 * responde, el asistente se queda esperando para siempre. Y `respond` va en un
 * efecto, no en el render, porque en el render React puede ejecutarlo dos
 * veces.
 */
function AvisoSinRespuesta({
  fallo,
  respond,
}: {
  fallo: FalloResolucion;
  respond: (result: unknown) => void;
}) {
  const respondidoRef = useRef(false);
  useEffect(() => {
    if (respondidoRef.current) return;
    respondidoRef.current = true;
    respond(fallo);
  }, [fallo, respond]);
  return <ChatAviso>{fallo.error}</ChatAviso>;
}

/** "2026-03", "03/2026", "marzo 2026" → "2026-03". */
function normalizarPeriodoIso(periodo: string | undefined): string | null {
  if (!periodo) return null;
  const limpio = periodo.trim();
  const iso = /^(\d{4})-(\d{1,2})$/.exec(limpio);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`;
  const barra = /^(\d{1,2})[/-](\d{4})$/.exec(limpio);
  if (barra) return `${barra[2]}-${barra[1].padStart(2, '0')}`;
  return null;
}

/** "2026-03" → "03/2026", que es como lo pide la posición IVA. */
function isoAMmYyyy(iso: string): string {
  const [yyyy, mm] = iso.split('-');
  return `${mm}/${yyyy}`;
}

/**
 * Las tools del asistente que pegan contra el servidor, más las que piden una
 * confirmación visual antes de ejecutar algo.
 *
 * Todas identifican la empresa por NOMBRE, no por id: el emparejamiento lo
 * hace `resolverCliente` contra la cartera en caché y recién ahí sale el
 * `clienteId` real. Cuando el UUID lo transportaba el modelo, un carácter
 * cambiado bastaba para consultar otra empresa —o ninguna— y la respuesta
 * salía igual de convencida.
 */
export function CopilotActions() {
  const clientes = useClientesCopilot();

  /**
   * El nombre que dijo el usuario → la empresa. Devuelve `{ error }` cuando no
   * hay una sola coincidencia, con el texto ya redactado para que el modelo lo
   * repita y le pregunte al usuario cuál quiso decir.
   */
  const resolver = (
    nombre: string | undefined,
    opciones: { soloSueldos?: boolean } = {}
  ): ClienteCopilot | FalloResolucion => {
    const consulta = String(nombre ?? '').trim();
    if (!consulta) {
      return { error: 'Falta el nombre de la empresa.' };
    }
    const resolucion = resolverCliente(clientes, consulta, opciones);
    if (resolucion.estado !== 'ok') {
      return { error: mensajeDeFallo(resolucion, consulta, opciones) };
    }
    return resolucion.cliente;
  };

  useCopilotAction({
    name: 'buscarClientes',
    description:
      'Buscá empresas de la cartera por nombre parcial o CUIT y mostrá las que coinciden. Usalo cuando el usuario pregunte "qué clientes tengo que…", cuando quiera ver la lista, o cuando otra tool te haya dicho que hay varias empresas parecidas y necesites mostrárselas para que elija. El resultado se dibuja solo en pantalla: NO lo repitas en texto ni lo transcribas a una lista. Contestá con una o dos líneas de lectura —qué conviene mirar, qué está fuera de lo normal— y nada más.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description:
          'Texto a buscar en la razón social o el CUIT. Dejalo vacío para listar toda la cartera.',
        required: false,
      },
    ],
    handler: ({ query }) => {
      const consulta = String(query ?? '').trim();
      if (!consulta) {
        return {
          total: clientes.length,
          clientes: clientes.map((c) => ({
            nombre: c.razonSocial,
            cuit: c.cuit,
            sueldos: c.liquidaSueldos,
          })),
        };
      }
      const resolucion = resolverCliente(clientes, consulta);
      const encontrados =
        resolucion.estado === 'ok'
          ? [resolucion.cliente]
          : resolucion.estado === 'ambiguo'
            ? resolucion.candidatos
            : [];
      return {
        consulta,
        total: encontrados.length,
        clientes: encontrados.map((c) => ({
          nombre: c.razonSocial,
          cuit: c.cuit,
          sueldos: c.liquidaSueldos,
        })),
      };
    },
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ChatCargando>Buscando en la cartera…</ChatCargando>;
      }
      const datos = result as
        | {
            consulta?: string;
            total: number;
            clientes: { nombre: string; cuit: string; sueldos: boolean }[];
          }
        | undefined;
      if (!datos || datos.total === 0) {
        return (
          <ChatVacio>
            No hay ninguna empresa que coincida
            {datos?.consulta ? ` con "${datos.consulta}"` : ''}.
          </ChatVacio>
        );
      }
      return <ListaClientes consulta={datos.consulta} items={datos.clientes} />;
    },
  });

  useCopilotAction({
    name: 'getIvaPosition',
    description:
      'Posición IVA de una empresa para un período: débito y crédito fiscal calculados desde los comprobantes, cruzados contra la DDJJ presentada en ARCA. Usalo para cualquier consulta sobre IVA, saldo IVA, débito o crédito fiscal. El resultado se dibuja solo en pantalla: NO lo repitas en texto ni lo transcribas a una lista. Contestá con una o dos líneas de lectura —qué conviene mirar, qué está fuera de lo normal— y nada más.',
    parameters: [
      {
        name: 'clientName',
        type: 'string',
        description: 'Razón social de la empresa, o su CUIT. Nunca un UUID.',
        required: true,
      },
      {
        name: 'periodo',
        type: 'string',
        description:
          'Período a consultar en formato MM/YYYY. Ej: "03/2026" para marzo 2026. Si no se especifica, se usa el último período declarado.',
        required: false,
      },
    ],
    handler: async ({ clientName, periodo }) => {
      const cliente = resolver(clientName);
      if (esFallo(cliente)) return cliente;
      const iso = normalizarPeriodoIso(periodo ?? undefined);
      return await getIvaPositionForCopilot({
        data: {
          clienteId: cliente.id,
          clientName: cliente.razonSocial,
          periodo: iso ? isoAMmYyyy(iso) : undefined,
        },
      });
    },
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ChatCargando>Calculando posición IVA…</ChatCargando>;
      }
      if (!result) return <ChatVacio>Sin datos.</ChatVacio>;
      if (esFallo(result)) return <ChatAviso>{result.error}</ChatAviso>;
      return (
        <CopilotIvaResume result={result as GetIvaPositionForCopilotResult} />
      );
    },
  });

  useCopilotAction({
    name: 'getVencimientos',
    description:
      'Próximos vencimientos fiscales del estudio, ordenados por fecha. Usalo para "qué vencimientos tengo", "qué vence esta semana", "vencimientos próximos". El resultado se dibuja solo en pantalla: NO lo repitas en texto ni lo transcribas a una lista. Contestá con una o dos líneas de lectura —qué conviene mirar, qué está fuera de lo normal— y nada más.',
    parameters: [
      {
        name: 'daysAhead',
        type: 'number',
        description:
          'Cantidad de días hacia adelante a consultar. Si no se especifica, 30.',
        required: false,
      },
    ],
    handler: async ({ daysAhead }) => {
      return await getUpcomingDueDates({
        data: { days: daysAhead ?? 30, limit: 20 },
      });
    },
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ChatCargando>Buscando vencimientos…</ChatCargando>;
      }
      const items = (result ?? []) as VencimientoItem[];
      if (items.length === 0) {
        return (
          <ChatVacio>No hay vencimientos en el período consultado.</ChatVacio>
        );
      }
      return <VencimientosList items={items} />;
    },
  });

  useCopilotAction({
    name: 'getDashboardKpis',
    description:
      'Resumen ejecutivo del estudio: KPIs del mes en curso (clientes activos, facturas del período, notificaciones pendientes, deudas vencidas). Usalo para "dame el resumen del estudio", "cuáles son los KPIs", "cómo va el estudio este mes". El resultado se dibuja solo en pantalla: NO lo repitas en texto ni lo transcribas a una lista. Contestá con una o dos líneas de lectura —qué conviene mirar, qué está fuera de lo normal— y nada más.',
    parameters: [],
    handler: async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return await getDashboardStats({
        data: { from: from.toISOString(), to: to.toISOString() },
      });
    },
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ChatCargando>Calculando los KPIs del estudio…</ChatCargando>;
      }
      if (!result) return <ChatVacio>Sin datos.</ChatVacio>;
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return (
        <MiniKpiCardsRow
          from={from}
          to={to}
          stats={result as DashboardStats}
          // El panel es angosto aunque la ventana sea ancha: sin fijar
          // también el breakpoint, `xl:grid-cols-4` gana y mete cuatro
          // tarjetas en 420px.
          className="mb-0 grid-cols-2 xl:grid-cols-2 gap-2"
        />
      );
    },
  });

  useCopilotAction({
    name: 'getResumenSaludCliente',
    description:
      'Resumen ejecutivo de una empresa: health score 0-100, facturación del mes, deudas vencidas y totales, notificaciones de ARCA sin leer, cuándo se actualizó cada tipo de dato, y qué requiere atención. Usalo cuando el usuario pregunte "cómo está el cliente X", "estado del cliente", "qué le pasa a X", o pida un panorama general. El resultado se dibuja solo en pantalla: NO lo repitas en texto ni lo transcribas a una lista. Contestá con una o dos líneas de lectura —qué conviene mirar, qué está fuera de lo normal— y nada más.',
    parameters: [
      {
        name: 'clientName',
        type: 'string',
        description:
          'Razón social de la empresa, o su CUIT. Nunca un UUID. Si el usuario está mirando una empresa en pantalla y no nombra otra, usá esa.',
        required: true,
      },
    ],
    handler: async ({ clientName }) => {
      const cliente = resolver(clientName);
      if (esFallo(cliente)) return cliente;
      return await getResumenSaludCliente({
        data: { clienteId: cliente.id, clientName: cliente.razonSocial },
      });
    },
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ChatCargando>Calculando el estado del cliente…</ChatCargando>;
      }
      if (!result) return <ChatVacio>Sin datos.</ChatVacio>;
      if (esFallo(result)) return <ChatAviso>{result.error}</ChatAviso>;
      return (
        <ResumenSaludCliente result={result as GetResumenSaludClienteResult} />
      );
    },
  });

  useCopilotAction({
    name: 'getResumenLiquidacionMes',
    description:
      'Resumen de la liquidación de sueldos de una empresa para un período: totales (haberes, descuentos, retenciones, neto), empleados liquidados, recibos por tipo y cuántos están confirmados. Usalo para "cómo quedó la liquidación", "totales del mes", "resumen de sueldos". El resultado se dibuja solo en pantalla: NO lo repitas en texto ni lo transcribas a una lista. Contestá con una o dos líneas de lectura —qué conviene mirar, qué está fuera de lo normal— y nada más.',
    parameters: [
      {
        name: 'clientName',
        type: 'string',
        description:
          'Razón social de la empresa, o su CUIT. Nunca un UUID. Tiene que ser una empresa que liquide sueldos.',
        required: true,
      },
      {
        name: 'periodo',
        type: 'string',
        description:
          'Período en formato YYYY-MM. Si el usuario no lo dice, dejalo vacío: se usa el mes liquidable (el anterior al actual).',
        required: false,
      },
    ],
    handler: async ({ clientName, periodo }) => {
      const cliente = resolver(clientName, { soloSueldos: true });
      if (esFallo(cliente)) return cliente;
      const iso = normalizarPeriodoIso(periodo ?? undefined);
      if (periodo && !iso) {
        return {
          error: `No entendí el período "${periodo}". Pasalo como YYYY-MM, por ejemplo "2026-03".`,
        };
      }
      return await getResumenLiquidacionMes({
        data: {
          clientId: cliente.id,
          periodo: iso ?? getPeriodoMesAnterior(),
        },
      });
    },
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return <ChatCargando>Calculando la liquidación…</ChatCargando>;
      }
      if (!result) return <ChatVacio>Sin datos.</ChatVacio>;
      if (esFallo(result)) return <ChatAviso>{result.error}</ChatAviso>;
      return (
        <ResumenLiquidacionMes
          result={result as GetResumenLiquidacionMesResult}
        />
      );
    },
  });

  useCopilotAction({
    name: 'dispararScrape',
    description:
      'Dispara una actualización de datos desde ARCA para una empresa. INVOCALA DIRECTAMENTE en cuanto el usuario lo pida: la card muestra los botones Cancelar/Confirmar antes de ejecutar nada, así que no pidas confirmación por texto. Tipos: iva (posición IVA), comprobantes (facturas), notificaciones, deuda, vencimientos.',
    parameters: [
      {
        name: 'clientName',
        type: 'string',
        description: 'Razón social de la empresa, o su CUIT. Nunca un UUID.',
        required: true,
      },
      {
        name: 'jobType',
        type: 'string',
        enum: [
          'iva',
          'comprobantes',
          'notificaciones',
          'deuda',
          'vencimientos',
        ],
        description: 'Tipo de job a disparar.',
        required: true,
      },
    ],
    renderAndWaitForResponse: ({ args, status, respond, result }) => {
      if (status === 'inProgress') {
        return <ChatCargando>Preparando la confirmación…</ChatCargando>;
      }
      const { clientName, jobType } = args;
      if (!respond) {
        return (
          <ResultadoAccion
            titulo="Actualizar datos de ARCA"
            sub={String(clientName ?? '')}
            result={result}
          />
        );
      }
      if (!jobType) {
        return (
          <ChatAviso>Falta el tipo de actualización a disparar.</ChatAviso>
        );
      }
      const cliente = resolver(clientName);
      if (esFallo(cliente)) {
        return <AvisoSinRespuesta fallo={cliente} respond={respond} />;
      }
      return (
        <ScrapeConfirmation
          clienteId={cliente.id}
          clienteNombre={cliente.razonSocial}
          jobType={jobType}
          respond={respond}
        />
      );
    },
  });

  useCopilotAction({
    name: 'marcarNotificacionLeida',
    description:
      'Marca una notificación de ARCA como leída. INVOCALA DIRECTAMENTE en cuanto el usuario lo pida: la card muestra los botones Cancelar/Confirmar antes de aplicar el cambio, así que no pidas confirmación por texto. El id de la notificación está en el contexto cuando el usuario está en /notifications.',
    parameters: [
      {
        name: 'notificationId',
        type: 'string',
        description:
          'UUID de la notificación, tomado tal cual del contexto de notificaciones visibles en pantalla.',
        required: true,
      },
    ],
    renderAndWaitForResponse: ({ args, status, respond, result }) => {
      if (status === 'inProgress') {
        return <ChatCargando>Preparando la confirmación…</ChatCargando>;
      }
      if (!respond) {
        return (
          <ResultadoAccion
            titulo="Marcar notificación como leída"
            sub="Bandeja de ARCA"
            result={result}
          />
        );
      }
      const { notificationId } = args;
      if (!notificationId) {
        return <ChatAviso>Falta el id de la notificación.</ChatAviso>;
      }
      return (
        <ConfirmationCard
          title="Marcar notificación como leída"
          description="La notificación queda marcada como leída en la bandeja de ARCA."
          confirmLabel="Marcar como leída"
          submittingLabel="Marcando…"
          successText="Notificación marcada como leída."
          respond={respond}
          onConfirm={async () => {
            return await markNotificationOpened({
              data: { id: notificationId },
            });
          }}
        />
      );
    },
  });

  useCopilotAction({
    name: 'escanearExtractoBancario',
    description:
      'Escanea el PDF adjunto en la barra del asistente (un extracto bancario), muestra los movimientos detectados para revisarlos y, con la confirmación del usuario, los guarda como movimientos de la empresa. INVOCALA DIRECTAMENTE en cuanto el usuario lo pida: la card muestra la previsualización y los botones antes de guardar nada. Requiere un PDF adjunto; si no hay, la card misma se lo pide al usuario.',
    parameters: [
      {
        name: 'clientName',
        type: 'string',
        description: 'Razón social de la empresa, o su CUIT. Nunca un UUID.',
        required: true,
      },
    ],
    renderAndWaitForResponse: ({ args, status, respond, result }) => {
      if (status === 'inProgress') {
        return <ChatCargando>Preparando el escaneo…</ChatCargando>;
      }
      if (!respond) {
        return (
          <ResultadoAccion
            titulo="Escanear extracto bancario"
            sub={String(args.clientName ?? '')}
            result={result}
          />
        );
      }
      const cliente = resolver(args.clientName);
      if (esFallo(cliente)) {
        return <AvisoSinRespuesta fallo={cliente} respond={respond} />;
      }
      return (
        <ScanPdfConfirmation
          clientId={cliente.id}
          clientName={cliente.razonSocial}
          respond={respond}
        />
      );
    },
  });

  return null;
}
