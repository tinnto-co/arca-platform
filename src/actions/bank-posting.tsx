/**
 * Asientos automáticos del banco (TIN-1689).
 *
 * Dos server functions: una que muestra qué se va a generar y otra que lo
 * genera. La vista previa no escribe nada y usa exactamente el mismo motor,
 * así lo que se ve es lo que queda.
 *
 * El asiento agrupa mes + concepto + cuenta bancaria. Qué movimientos lo
 * componen se guarda en `movimiento_bancario.asiento_id`, no en
 * `asiento.origen_id`: son muchos movimientos apuntando a un asiento.
 */
import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  asiento,
  cuenta,
  cuentaBancaria,
  movimientoBancario,
} from '@/drizzle/schema';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import {
  agruparMovimientos,
  armarLineasBanco,
  type AsientoBancarioArmado,
} from '@/lib/accounting-bank-posting';
import {
  insertarAsientoConLineas,
  loadActiveMappingRules,
  loadPendingReviewAccountId,
  resolvePeriodForDate,
} from '@/lib/accounting-posting-db';
import { CATEGORIA_MOVIMIENTO_LABEL } from '@/lib/clasificar-movimiento';

/** Último día del mes: el asiento del período se fecha ahí, como en sueldos. */
function fechaDelPeriodo(periodo: string): string {
  const [y, m] = periodo.split('-').map((x) => parseInt(x, 10));
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${periodo}-${String(ultimo).padStart(2, '0')}`;
}

const parametros = z.object({
  clienteId: z.string().uuid(),
  /** Mes a contabilizar, 'YYYY-MM'. */
  periodo: z.string().regex(/^\d{4}-\d{2}$/),
  /** Sin esto, todas las cuentas bancarias activas de la empresa. */
  cuentaBancariaId: z.string().uuid().optional(),
});

/**
 * Lo que hay para contabilizar, con su asiento ya resuelto.
 *
 * Deja afuera lo excluido, lo marcado "no contabilizar" y lo que ya tiene
 * asiento: así correrlo dos veces no duplica nada y, después de generar, la
 * vista previa queda vacía.
 */
async function armarPropuesta(
  clienteId: string,
  orgId: string,
  periodo: string,
  cuentaBancariaId?: string
) {
  const desde = `${periodo}-01`;

  const movimientos = await db
    .select({
      id: movimientoBancario.id,
      cuentaBancariaId: movimientoBancario.cuentaBancariaId,
      fecha: movimientoBancario.fecha,
      direccion: movimientoBancario.direccion,
      importe: movimientoBancario.importe,
      categoria: movimientoBancario.categoria,
    })
    .from(movimientoBancario)
    .innerJoin(
      cuentaBancaria,
      eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
    )
    .where(
      and(
        eq(cuentaBancaria.orgId, orgId),
        eq(cuentaBancaria.clienteId, clienteId),
        eq(cuentaBancaria.activa, true),
        cuentaBancariaId
          ? eq(movimientoBancario.cuentaBancariaId, cuentaBancariaId)
          : undefined,
        eq(movimientoBancario.excluido, false),
        eq(movimientoBancario.noContabilizar, false),
        isNull(movimientoBancario.asientoId),
        sql`${movimientoBancario.fecha} >= ${desde}::date`,
        sql`${movimientoBancario.fecha} < (${desde}::date + interval '1 month')`
      )
    )
    .orderBy(asc(movimientoBancario.fecha));

  const grupos = agruparMovimientos(movimientos);
  if (grupos.length === 0) return { grupos: [], asientos: [], cuentas: [] };

  const [reglas, pendienteId, cuentasBanco] = await Promise.all([
    loadActiveMappingRules(clienteId, 'movimiento_bancario'),
    loadPendingReviewAccountId(orgId),
    db
      .select({
        id: cuentaBancaria.id,
        banco: cuentaBancaria.banco,
        numero: cuentaBancaria.numero,
        cuentaContableId: cuentaBancaria.cuentaContableId,
      })
      .from(cuentaBancaria)
      .where(
        and(
          eq(cuentaBancaria.orgId, orgId),
          eq(cuentaBancaria.clienteId, clienteId)
        )
      ),
  ]);

  const porCuenta = new Map(cuentasBanco.map((c) => [c.id, c]));
  const asientos = grupos.map((g) =>
    armarLineasBanco(
      g,
      reglas,
      pendienteId,
      porCuenta.get(g.cuentaBancariaId)?.cuentaContableId ?? null
    )
  );

  // Los nombres de cuenta, para que la vista previa se lea sin ir al plan.
  const ids = [
    ...new Set(asientos.flatMap((a) => a.lineas.map((l) => l.cuentaId))),
  ];
  const cuentas = ids.length
    ? await db
        .select({ id: cuenta.id, codigo: cuenta.codigo, nombre: cuenta.nombre })
        .from(cuenta)
        .where(inArray(cuenta.id, ids))
    : [];

  return { grupos, asientos, cuentas, porCuenta };
}

/** Qué asientos saldrían del mes, sin escribir nada. */
export const previsualizarAsientosBanco = createServerFn({ method: 'GET' })
  .validator(parametros)
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clienteId, periodo, cuentaBancariaId } = ctx.data;

    const { asientos, cuentas, porCuenta } = await armarPropuesta(
      clienteId,
      orgId,
      periodo,
      cuentaBancariaId
    );

    const nombreCuenta = new Map(
      (cuentas ?? []).map((c) => [c.id, `${c.codigo} · ${c.nombre}`])
    );

    return {
      periodo,
      asientos: asientos.map((a) => ({
        cuentaBancariaId: a.grupo.cuentaBancariaId,
        cuentaBancaria: (() => {
          const c = porCuenta?.get(a.grupo.cuentaBancariaId);
          return c ? `${c.banco} ${c.numero ?? ''}`.trim() : 'Cuenta';
        })(),
        categoria: a.grupo.categoria,
        concepto:
          CATEGORIA_MOVIMIENTO_LABEL[
            a.grupo.categoria as keyof typeof CATEGORIA_MOVIMIENTO_LABEL
          ] ?? a.grupo.categoria,
        direccion: a.grupo.direccion,
        total: a.grupo.total,
        movimientos: a.grupo.movimientos,
        aRevisar: a.usoPendienteRevision,
        motivo: a.motivo,
        bloqueo: a.bloqueo,
        lineas: a.lineas.map((l) => ({
          cuenta: nombreCuenta.get(l.cuentaId) ?? 'Cuenta',
          debe: l.debe,
          haber: l.haber,
          descripcion: l.descripcion,
        })),
      })),
    };
  });

/**
 * Genera los asientos del mes.
 *
 * No hay control de duplicados aparte: los movimientos ya contabilizados no
 * entran, así que correrlo de nuevo no genera nada. Para rehacer un mes hay
 * que deshacerlo primero.
 */
export const generarAsientosBanco = createServerFn({ method: 'POST' })
  .validator(parametros)
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    const { clienteId, periodo, cuentaBancariaId } = ctx.data;

    const { asientos } = await armarPropuesta(
      clienteId,
      orgId,
      periodo,
      cuentaBancariaId
    );
    // Lo bloqueado no se genera: se muestra en la vista previa con lo que
    // falta para poder hacerlo.
    const generables = (asientos as AsientoBancarioArmado[]).filter(
      (a) => !a.bloqueo
    );
    if (generables.length === 0)
      return {
        generados: 0,
        aRevisar: 0,
        movimientos: 0,
        bloqueados: asientos.length,
      };

    const fecha = fechaDelPeriodo(periodo);
    const resuelto = await resolvePeriodForDate(clienteId, fecha).catch(
      (e: Error) => {
        if (e.message === 'no_fy')
          throw new Error(
            `No hay ejercicio que contenga ${fecha}: creálo en Contabilidad antes de generar`
          );
        if (e.message === 'no_period')
          throw new Error(`No hay período contable abierto para ${fecha}`);
        throw e;
      }
    );

    let generados = 0;
    let movimientos = 0;

    await db.transaction(async (tx) => {
      for (const a of generables) {
        const je = await insertarAsientoConLineas(tx, {
          orgId,
          clienteId,
          ejercicioId: resuelto.fy.id,
          periodoId: resuelto.period.id,
          fecha,
          descripcion: `Banco · ${
            CATEGORIA_MOVIMIENTO_LABEL[
              a.grupo.categoria as keyof typeof CATEGORIA_MOVIMIENTO_LABEL
            ] ?? a.grupo.categoria
          } ${a.grupo.direccion === 'ingreso' ? '(entró)' : '(salió)'} · ${periodo}`,
          origenTipo: 'movimiento_bancario',
          // El asiento no sale de UN movimiento: la vuelta se guarda en cada
          // movimiento, con `asiento_id`.
          origenId: null,
          reglaId: a.reglaId,
          lineas: a.lineas,
          fuente: 'calculo',
          creadoPor: userId,
        });

        await tx
          .update(movimientoBancario)
          .set({ asientoId: je.id })
          .where(inArray(movimientoBancario.id, a.grupo.movimientoIds));

        generados += 1;
        movimientos += a.grupo.movimientos;
      }
    });

    return {
      generados,
      aRevisar: generables.filter((a) => a.usoPendienteRevision).length,
      movimientos,
      bloqueados: asientos.length - generables.length,
    };
  });

/**
 * Deshace los asientos del mes: los anula y suelta los movimientos, que
 * vuelven a quedar disponibles para generar.
 */
export const deshacerAsientosBanco = createServerFn({ method: 'POST' })
  .validator(parametros)
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    const { clienteId, periodo, cuentaBancariaId } = ctx.data;
    const desde = `${periodo}-01`;

    const contabilizados = await db
      .select({
        id: movimientoBancario.id,
        asientoId: movimientoBancario.asientoId,
      })
      .from(movimientoBancario)
      .innerJoin(
        cuentaBancaria,
        eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
      )
      .where(
        and(
          eq(cuentaBancaria.orgId, orgId),
          eq(cuentaBancaria.clienteId, clienteId),
          cuentaBancariaId
            ? eq(movimientoBancario.cuentaBancariaId, cuentaBancariaId)
            : undefined,
          sql`${movimientoBancario.asientoId} is not null`,
          sql`${movimientoBancario.fecha} >= ${desde}::date`,
          sql`${movimientoBancario.fecha} < (${desde}::date + interval '1 month')`
        )
      );

    const asientoIds = [
      ...new Set(contabilizados.map((m) => m.asientoId).filter(Boolean)),
    ] as string[];
    if (asientoIds.length === 0) return { anulados: 0, movimientos: 0 };

    await db.transaction(async (tx) => {
      await tx
        .update(movimientoBancario)
        .set({ asientoId: null })
        .where(
          inArray(
            movimientoBancario.id,
            contabilizados.map((m) => m.id)
          )
        );
      // Anular y no borrar: el libro diario no pierde su historia.
      await tx
        .update(asiento)
        .set({ anulado: true })
        .where(inArray(asiento.id, asientoIds));
    });

    return { anulados: asientoIds.length, movimientos: contabilizados.length };
  });
