'use client';

import { Badge } from '@/components/ui/badge';
import type { GetResumenLiquidacionMesResult } from '@/actions/sueldos';
import {
  ChatCard,
  ChatCardHead,
  ChatCardLabel,
  ChatKpi,
  ChatKpiGrid,
  ChatRow,
  ChatRows,
  ChatVacio,
  formatArs,
} from './chat-card';

const TIPO_LABEL: Record<string, string> = {
  mensual: 'Mensual',
  quincenal: 'Quincenal',
  sac: 'SAC',
  liquidacion_final: 'Liquidación final',
  vacaciones: 'Vacaciones',
};

/** "2026-03" → "marzo 2026". */
function periodoLargo(periodo: string): string {
  const [yyyy, mm] = periodo.split('-').map(Number);
  if (!yyyy || !mm) return periodo;
  const mes = new Date(yyyy, mm - 1, 1).toLocaleDateString('es-AR', {
    month: 'long',
  });
  return `${mes} ${yyyy}`;
}

/**
 * Cómo quedó la liquidación de un mes: los tres números que se miran primero
 * —haberes, descuentos, neto— y después el desglose por tipo de recibo.
 *
 * El badge del encabezado dice cuántos recibos están confirmados, porque un
 * total que incluye borradores no es un total: es un adelanto.
 */
export function ResumenLiquidacionMes({
  result,
}: {
  result: GetResumenLiquidacionMesResult;
}) {
  const { periodo, totales, porTipo } = result;

  if (totales.recibos === 0) {
    return (
      <ChatVacio>
        No hay liquidaciones registradas para {periodoLargo(periodo)}.
      </ChatVacio>
    );
  }

  const tipos = Object.entries(porTipo).sort((a, b) => b[1].count - a[1].count);
  const todosConfirmados = totales.confirmados === totales.recibos;

  return (
    <div className="space-y-2.5">
      <ChatCard>
        <ChatCardHead
          title={`Liquidación · ${periodoLargo(periodo)}`}
          sub={`${totales.empleados} ${totales.empleados === 1 ? 'empleado' : 'empleados'} · ${totales.recibos} ${totales.recibos === 1 ? 'recibo' : 'recibos'}`}
          trailing={
            <Badge variant={todosConfirmados ? 'success' : 'warning'} size="sm">
              {todosConfirmados
                ? 'Confirmada'
                : `${totales.confirmados}/${totales.recibos} confirmados`}
            </Badge>
          }
        />
      </ChatCard>

      <ChatKpiGrid>
        <ChatKpi label="Haberes" value={formatArs(totales.haberes)} />
        <ChatKpi
          label="Descuentos y retenciones"
          value={formatArs(totales.descuentos + totales.retenciones)}
          tone="neg"
        />
      </ChatKpiGrid>

      <ChatCard>
        <ChatRows>
          <ChatRow label="Neto a pagar" value={formatArs(totales.neto)} />
          {totales.noRemunerativo > 0 && (
            <ChatRow
              label="No remunerativo"
              value={formatArs(totales.noRemunerativo)}
            />
          )}
        </ChatRows>
      </ChatCard>

      {tipos.length > 1 && (
        <ChatCard>
          <ChatCardLabel>Recibos por tipo</ChatCardLabel>
          <ChatRows>
            {tipos.map(([tipo, agg]) => (
              <ChatRow
                key={tipo}
                label={`${TIPO_LABEL[tipo] ?? tipo} · ${agg.count}`}
                value={formatArs(agg.neto)}
              />
            ))}
          </ChatRows>
        </ChatCard>
      )}
    </div>
  );
}
