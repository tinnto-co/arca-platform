/**
 * Las búsquedas de `resolverContrapartes` contra la base, desde el servidor.
 *
 * Corre dentro de un handler que ya llamó a `getSessionWithOrg()`: el padrón
 * de contrapartes es global, pero los comprobantes van por RLS de la
 * organización. El script que completa los movimientos ya importados tiene
 * su propia versión con SQL directo.
 */
import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cliente, comprobante, contraparte } from '@/drizzle/schema';
import {
  resolverContrapartes,
  type BusquedasContraparte,
  type ContraparteResuelta,
  type MovimientoAResolver,
} from '@/lib/contraparte-movimiento';

function busquedasDeCliente(clienteId: string): BusquedasContraparte {
  return {
    porDocumento: async (cuits, dnis) =>
      await db
        .select({
          id: contraparte.id,
          docTipo: contraparte.docTipo,
          docNro: contraparte.docNro,
          nombre: contraparte.nombre,
        })
        .from(contraparte)
        .where(
          or(
            and(
              eq(contraparte.docTipo, 'cuit'),
              inArray(contraparte.docNro, cuits)
            ),
            dnis.length > 0
              ? and(
                  eq(contraparte.docTipo, 'dni'),
                  inArray(contraparte.docNro, dnis)
                )
              : undefined
          )
        ),

    queOperanConLaEmpresa: async (ids) => {
      const filas = await db
        .selectDistinct({ id: comprobante.contraparteId })
        .from(comprobante)
        .where(
          and(
            eq(comprobante.clienteId, clienteId),
            inArray(comprobante.contraparteId, ids)
          )
        );
      return new Set(filas.map((f) => f.id).filter((id) => id !== null));
    },

    comprobantesPorImporte: async (importes, desde, hasta) => {
      const filas = await db
        .select({
          id: comprobante.id,
          total: comprobante.total,
          fechaEmision: comprobante.fechaEmision,
          direccion: comprobante.direccion,
          contraparteId: comprobante.contraparteId,
          contraparteNombre: contraparte.nombre,
        })
        .from(comprobante)
        .leftJoin(contraparte, eq(contraparte.id, comprobante.contraparteId))
        .where(
          and(
            eq(comprobante.clienteId, clienteId),
            gte(comprobante.fechaEmision, desde),
            lte(comprobante.fechaEmision, hasta),
            // Redondeado a centavos: el total es numeric y el importe viene
            // del PDF como número.
            inArray(
              sql`round(${comprobante.total}, 2)`,
              importes.map((i) => i.toFixed(2))
            )
          )
        );
      return filas.map((f) => ({ ...f, total: Number(f.total) }));
    },
  };
}

/** Resuelve la contraparte de movimientos de una cuenta de `clienteId`. */
export async function resolverContrapartesDeCliente(
  clienteId: string,
  movimientos: MovimientoAResolver[]
): Promise<ContraparteResuelta[]> {
  if (movimientos.length === 0) return [];
  const [empresa] = await db
    .select({ cuit: cliente.cuit })
    .from(cliente)
    .where(eq(cliente.id, clienteId))
    .limit(1);
  return await resolverContrapartes(
    movimientos,
    empresa?.cuit ?? null,
    busquedasDeCliente(clienteId)
  );
}
