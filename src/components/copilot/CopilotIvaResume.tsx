'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { GetIvaPositionForCopilotResult } from '@/actions/copilot';
import {
  ChatAviso,
  ChatCard,
  ChatCardHead,
  ChatCardLabel,
  ChatKpi,
  ChatKpiGrid,
  ChatRow,
  ChatRows,
  formatArs,
} from './chat-card';

/** El período llega como `YYYY-MM-DD` (día 1 del mes) desde la base. */
function periodoLargo(periodo: string): string {
  const [yyyy, mm] = periodo.split('-').map(Number);
  if (!yyyy || !mm) return periodo;
  const mes = new Date(yyyy, mm - 1, 1).toLocaleDateString('es-AR', {
    month: 'long',
  });
  return `${mes} ${yyyy}`;
}

function fechaCorta(fecha: string): string {
  const d = new Date(fecha);
  return Number.isNaN(d.getTime())
    ? fecha
    : d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
}

const num = (v: string | null | undefined) => Number(v ?? 0) || 0;

/**
 * La posición IVA de un mes, en el ancho del panel.
 *
 * Antes acá se montaba `RenderIvaResume`, que es la sección entera de la ficha
 * del cliente: pensada para 900 px, con sus acordeones, su botón de agregar
 * ajuste y su llamada a sincronizar con ARCA. Metida en un panel de 420 px
 * ocupaba varias pantallas de scroll y ofrecía acciones que no tienen sentido
 * dentro de una conversación. Esto es sólo la lectura: lo calculado desde los
 * comprobantes arriba, y debajo lo que ARCA tiene declarado, para poder
 * compararlos de un vistazo.
 *
 * Cuando el nombre buscado agrupa varias empresas —un login de ARCA suele
 * tener más de una— se muestran los totales del grupo y se puede pasar de una
 * a otra sin volver a preguntar.
 */
export function CopilotIvaResume({
  result,
}: {
  result: GetIvaPositionForCopilotResult;
}) {
  const esError = 'error' in result;
  const clientes = esError ? [] : result.clientes;
  const [seleccionado, setSeleccionado] = React.useState(0);

  if (esError) {
    return (
      <ChatAviso>
        {result.error}
        {result.options && result.options.length > 0 && (
          <span> Coinciden: {result.options.join(', ')}.</span>
        )}
      </ChatAviso>
    );
  }

  const c = clientes[seleccionado] ?? clientes[0];
  if (!c) return <ChatAviso>No hay empresas para mostrar.</ChatAviso>;

  const periodo = periodoLargo(result.periodo);
  const ddjj = c.declaracionAfip;
  const totales = result.totales;

  return (
    <div className="space-y-2.5">
      {clientes.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {clientes.map((cli, i) => (
            <button
              key={cli.clienteId}
              type="button"
              onClick={() => setSeleccionado(i)}
              className={cn(
                'max-w-full truncate rounded-[var(--arca-r-sm)] border px-2 py-1 text-[11.5px] font-medium transition-colors duration-[120ms]',
                i === seleccionado
                  ? 'border-transparent bg-[var(--arca-accent-bg)] text-[var(--arca-accent-hover)]'
                  : 'border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]'
              )}
            >
              {cli.razonSocial}
            </button>
          ))}
        </div>
      )}

      <ChatCard>
        <ChatCardHead
          title={c.razonSocial}
          sub={`IVA · ${periodo} · CUIT ${c.cuit}`}
          trailing={
            c.tieneDatosAFIP ? (
              <Badge variant="success" size="sm">
                Presentada
              </Badge>
            ) : (
              <Badge variant="warning" size="sm">
                Sin DDJJ
              </Badge>
            )
          }
        />
      </ChatCard>

      <ChatKpiGrid>
        <ChatKpi
          label="Débito fiscal"
          value={formatArs(num(c.ventas.debitoFiscal))}
          sub="ventas"
        />
        <ChatKpi
          label="Crédito fiscal"
          value={formatArs(num(c.compras.creditoFiscal))}
          sub="compras"
        />
      </ChatKpiGrid>

      <ChatCard>
        <ChatRows>
          <ChatRow
            label="Saldo técnico"
            value={formatArs(num(c.saldoTecnico))}
            tone={num(c.saldoTecnico) > 0 ? 'neg' : 'pos'}
          />
          <ChatRow
            label="Libre disponibilidad"
            value={formatArs(num(c.saldoLibreDisponibilidad))}
          />
          <ChatRow
            label="Retenciones y percepciones"
            value={formatArs(num(c.totalRetencionesPercepciones))}
          />
        </ChatRows>
      </ChatCard>

      <ChatCard>
        <ChatCardLabel>Neto gravado por alícuota</ChatCardLabel>
        <ChatRows>
          <ChatRow
            label="Ventas · 21%"
            value={formatArs(num(c.ventas.netoA21))}
          />
          <ChatRow
            label="Ventas · 10,5%"
            value={formatArs(num(c.ventas.netoA105))}
          />
          <ChatRow
            label="Compras · 21%"
            value={formatArs(num(c.compras.netoGravado21))}
          />
          <ChatRow
            label="Compras · 10,5%"
            value={formatArs(num(c.compras.netoGravado105))}
          />
          {num(c.compras.netoGravado27) !== 0 && (
            <ChatRow
              label="Compras · 27%"
              value={formatArs(num(c.compras.netoGravado27))}
            />
          )}
        </ChatRows>
      </ChatCard>

      {ddjj ? (
        <ChatCard>
          <ChatCardLabel>
            Declarado en ARCA
            {c.presentadaAt ? ` · ${fechaCorta(c.presentadaAt)}` : ''}
          </ChatCardLabel>
          <ChatRows>
            <ChatRow
              label="Débito fiscal"
              value={formatArs(num(ddjj.debitoFiscal))}
            />
            <ChatRow
              label="Crédito fiscal"
              value={formatArs(num(ddjj.creditoFiscal))}
            />
            <ChatRow
              label="Saldo del mes"
              value={formatArs(num(ddjj.saldoAfipMes))}
            />
            <ChatRow
              label="Saldo a favor (técnico)"
              value={formatArs(num(ddjj.saldoTecnicoFavor))}
            />
          </ChatRows>
        </ChatCard>
      ) : (
        <ChatAviso>
          No hay DDJJ de ARCA para {periodo}: los totales salen sólo de los
          comprobantes cargados.
        </ChatAviso>
      )}

      {totales && (
        <ChatCard>
          <ChatCardLabel>
            Total del grupo · {clientes.length} empresas
          </ChatCardLabel>
          <ChatRows>
            <ChatRow
              label="Débito fiscal"
              value={formatArs(num(totales.debitoFiscal))}
            />
            <ChatRow
              label="Crédito fiscal"
              value={formatArs(num(totales.creditoFiscal))}
            />
            <ChatRow
              label="Saldo técnico"
              value={formatArs(num(totales.saldoTecnico))}
            />
          </ChatRows>
        </ChatCard>
      )}
    </div>
  );
}
