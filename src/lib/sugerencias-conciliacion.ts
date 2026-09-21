/**
 * Genera (o recalcula) las sugerencias de conciliación de un conjunto de
 * cuentas de una empresa. Es el corazón de «Auto-conciliar», y lo usa también
 * la importación de extractos para que los movimientos lleguen con
 * sugerencias sin que nadie apriete el botón.
 *
 * Solo propone: todo queda `sugerida`. Cada vez recalcula las sugerencias
 * pendientes de esas cuentas —si apareció un movimiento que le corresponde
 * mejor a una factura, la sugerencia pasa a ese—, sin tocar lo confirmado ni
 * lo descartado. Qué factura va con qué movimiento lo decide `asignarCruces`.
 *
 * Solo servidor. Quien llama ya validó la organización y los permisos, y
 * corre con el contexto de la organización activo (RLS).
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  comprobante,
  comprobanteTipo,
  conciliacionComprobante,
  contraparte,
  cuentaBancaria,
  movimientoBancario,
} from '@/drizzle/schema';
import { asignarCruces } from '@/lib/cruce-conciliacion';

/** Las cuentas activas de una empresa. */
export async function cuentasActivasDeCliente(
  orgId: string,
  clienteId: string
): Promise<string[]> {
  return (
    await db
      .select({ id: cuentaBancaria.id })
      .from(cuentaBancaria)
      .where(
        and(
          eq(cuentaBancaria.orgId, orgId),
          eq(cuentaBancaria.clienteId, clienteId),
          eq(cuentaBancaria.activa, true)
        )
      )
  ).map((c) => c.id);
}

export async function generarSugerencias(
  clienteId: string,
  cuentaIds: string[]
): Promise<{ sugeridos: number; reasignados: number }> {
  if (cuentaIds.length === 0) return { sugeridos: 0, reasignados: 0 };

  const movimientos = await db
    .select({
      id: movimientoBancario.id,
      fecha: movimientoBancario.fecha,
      importe: movimientoBancario.importe,
      direccion: movimientoBancario.direccion,
      contraparteId: movimientoBancario.contraparteId,
      descripcion: movimientoBancario.descripcion,
      categoria: movimientoBancario.categoria,
    })
    .from(movimientoBancario)
    .where(
      and(
        inArray(movimientoBancario.cuentaBancariaId, cuentaIds),
        eq(movimientoBancario.excluido, false)
      )
    );
  if (movimientos.length === 0) return { sugeridos: 0, reasignados: 0 };

  const previas = await db
    .select({
      movimientoId: conciliacionComprobante.movimientoBancarioId,
      comprobanteId: conciliacionComprobante.comprobanteId,
      estado: conciliacionComprobante.estado,
      confianza: conciliacionComprobante.confianza,
    })
    .from(conciliacionComprobante)
    .where(
      inArray(
        conciliacionComprobante.movimientoBancarioId,
        movimientos.map((m) => m.id)
      )
    );
  const confirmados = new Set(
    previas.filter((p) => p.estado === 'confirmada').map((p) => p.movimientoId)
  );
  const descartados = new Set(
    previas
      .filter((p) => p.estado === 'rechazada')
      .map((p) => `${p.movimientoId}|${p.comprobanteId}`)
  );
  const antes = new Map(
    previas
      .filter((p) => p.estado === 'sugerida')
      .map((p) => [p.movimientoId, p.comprobanteId])
  );
  const pendientes = movimientos.filter((m) => !confirmados.has(m.id));

  const facturas = await db
    .select({
      id: comprobante.id,
      total: comprobante.total,
      fechaEmision: comprobante.fechaEmision,
      direccion: comprobante.direccion,
      contraparteId: comprobante.contraparteId,
      contraparteNombre: contraparte.nombre,
    })
    .from(comprobante)
    .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
    .leftJoin(contraparte, eq(contraparte.id, comprobante.contraparteId))
    .where(
      and(
        eq(comprobante.clienteId, clienteId),
        // Una nota de crédito no se cobra ni se paga.
        sql`coalesce(${comprobanteTipo.esNc}, false) = false`,
        // Ni una factura ya conciliada, ni una sugerida para un movimiento
        // de FUERA de este alcance (otra cuenta): esas no se recalculan
        // acá. Las sugeridas de este alcance sí vuelven a competir.
        sql`not exists (
            select 1 from ${conciliacionComprobante} cc
            join ${movimientoBancario} mb on mb.id = cc.movimiento_bancario_id
            where cc.comprobante_id = ${comprobante.id}
              and (
                cc.estado = 'confirmada'
                or (cc.estado = 'sugerida'
                    and mb.cuenta_bancaria_id not in (${sql.join(
                      cuentaIds.map((id) => sql`${id}`),
                      sql`, `
                    )}))
              )
          )`
      )
    );

  const cruces = asignarCruces(
    pendientes.map((m) => ({
      id: m.id,
      fecha: m.fecha,
      importe: Number(m.importe),
      direccion: m.direccion,
      contraparteId: m.contraparteId,
      descripcion: m.descripcion,
      categoria: m.categoria,
    })),
    facturas.map((f) => ({
      id: f.id,
      fechaEmision: f.fechaEmision,
      total: Number(f.total),
      direccion: f.direccion,
      contraparteId: f.contraparteId,
      contraparteNombre: f.contraparteNombre,
    })),
    descartados
  );

  const importePorMov = new Map(movimientos.map((m) => [m.id, m.importe]));
  // Reemplazar las sugerencias pendientes del alcance por las nuevas, todo
  // junto: nunca queda un momento con sugerencias viejas y nuevas mezcladas.
  await db.transaction(async (tx) => {
    if (antes.size > 0) {
      await tx
        .delete(conciliacionComprobante)
        .where(
          and(
            inArray(conciliacionComprobante.movimientoBancarioId, [
              ...antes.keys(),
            ]),
            eq(conciliacionComprobante.estado, 'sugerida')
          )
        );
    }
    if (cruces.length > 0) {
      await tx.insert(conciliacionComprobante).values(
        cruces.map((c) => ({
          movimientoBancarioId: c.movimientoId,
          comprobanteId: c.comprobanteId,
          importeConciliado: importePorMov.get(c.movimientoId)!,
          estado: 'sugerida' as const,
          fuente: 'calculo' as const,
          confianza: c.confianza.toFixed(4),
        }))
      );
    }
  });

  // Cuántas facturas pasaron a un movimiento que les corresponde MEJOR
  // (más seguridad). Un intercambio entre opciones equivalentes —dos
  // facturas iguales del mismo día, dos cobros iguales— no cuenta.
  const sugeridaAntes = new Map(
    previas
      .filter((p) => p.estado === 'sugerida')
      .map((p) => [
        p.comprobanteId,
        { movimientoId: p.movimientoId, confianza: Number(p.confianza) },
      ])
  );
  const reasignados = cruces.filter((c) => {
    const previa = sugeridaAntes.get(c.comprobanteId);
    return (
      previa !== undefined &&
      previa.movimientoId !== c.movimientoId &&
      c.confianza > previa.confianza + 1e-6
    );
  }).length;

  return { sugeridos: cruces.length, reasignados };
}
