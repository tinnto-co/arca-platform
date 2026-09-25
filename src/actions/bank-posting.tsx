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
  reglaMapeo,
  reglaMapeoLinea,
  saldoBancario,
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
        // Un asiento anulado desde el Libro Diario no deja al movimiento
        // contabilizado: si solo miráramos `asiento_id is not null`, esa
        // plata no volvía nunca a la propuesta y el control de saldos
        // mostraba la diferencia diciendo "0 sin contabilizar".
        sql`(${movimientoBancario.asientoId} is null
             or exists (select 1 from asiento a
                        where a.id = ${movimientoBancario.asientoId}
                          and a.anulado = true))`,
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
          throw new Error(`No hay período contable para ${fecha}`);
        throw e;
      }
    );
    // Facturas y Sueldos ya lo chequean; acá faltaba, así que se podían
    // insertar asientos en un mes cerrado y el balance de ese período
    // cambiaba después de darlo por terminado.
    if (resuelto.period.estado === 'cerrado')
      throw new Error(
        `El período ${periodo} está cerrado: reabrilo en Contabilidad para poder generar sus asientos`
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

    // Deshacer un mes cerrado le cambia el balance a un período que alguien
    // ya dio por terminado. Igual que para generar: primero se reabre.
    const resuelto = await resolvePeriodForDate(
      clienteId,
      fechaDelPeriodo(periodo)
    ).catch(() => null);
    if (resuelto?.period.estado === 'cerrado')
      throw new Error(
        `El período ${periodo} está cerrado: reabrilo en Contabilidad para poder deshacer sus asientos`
      );

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

/**
 * El control que cierra el circuito: lo que el banco dice que hay contra lo
 * que dice el mayor.
 *
 * El saldo contable se calcula sobre la cuenta del plan de cada cuenta
 * bancaria, sumando todo lo asentado hasta el último día del mes. Si no
 * coinciden, o falta contabilizar algo o hay un asiento de más; la diferencia
 * queda a la vista para resolverla a mano.
 *
 * Sin saldo del extracto no hay nada que comparar: se devuelve igual, con
 * `saldoBanco` en null, para que la pantalla lo diga en vez de callar.
 */
export const getControlDeSaldos = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clienteId, periodo } = ctx.data;
    const desde = `${periodo}-01`;

    const cuentas = await db
      .select({
        id: cuentaBancaria.id,
        banco: cuentaBancaria.banco,
        numero: cuentaBancaria.numero,
        cuentaContableId: cuentaBancaria.cuentaContableId,
        cuentaContable: sql<
          string | null
        >`(select c.codigo || ' · ' || c.nombre from ${cuenta} c where c.id = ${cuentaBancaria.cuentaContableId})`,
        // Todo lo asentado en esa cuenta del plan hasta el cierre del mes, sin
        // los asientos anulados. El signo sale del Debe menos el Haber: en una
        // cuenta de banco, deudora, eso es el saldo.
        saldoContable: sql<string>`coalesce((
          select sum(al.debe - al.haber)
          from asiento_linea al
          join asiento a on a.id = al.asiento_id
          where al.cuenta_id = ${cuentaBancaria.cuentaContableId}
            and a.cliente_id = ${clienteId}
            and a.anulado = false
            and a.fecha < (${desde}::date + interval '1 month')
        ), 0)::text`,
        sinContabilizar: sql<number>`(
          select count(*) from movimiento_bancario mb
          where mb.cuenta_bancaria_id = ${cuentaBancaria.id}
            -- Mismo criterio que la propuesta: un asiento anulado no cuenta
            -- como contabilizado. Si no, la fila mostraba una diferencia y
            -- al lado "0 sin contabilizar", que no hay forma de entender.
            and (mb.asiento_id is null
                 or exists (select 1 from asiento a2
                            where a2.id = mb.asiento_id and a2.anulado = true))
            and mb.no_contabilizar = false
            and mb.excluido = false
            and mb.fecha >= ${desde}::date
            and mb.fecha < (${desde}::date + interval '1 month')
        )::int`,
      })
      .from(cuentaBancaria)
      .where(
        and(
          eq(cuentaBancaria.orgId, orgId),
          eq(cuentaBancaria.clienteId, clienteId),
          eq(cuentaBancaria.activa, true)
        )
      )
      .orderBy(asc(cuentaBancaria.createdAt));

    // Los saldos del mes, en su propia consulta: como subconsulta dentro del
    // select de cuentas no devolvía nada y no hacía falta complicarlo.
    // Se traen los dos meses: el del período y el anterior. Con el anterior
    // se verifica la continuidad —el saldo con el que cierra un mes tiene que
    // ser el mismo con el que abre el siguiente—, que es como se detecta que
    // falta un extracto en el medio.
    const mesAnterior = (() => {
      const [y, m] = periodo.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 2, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
    })();

    const saldos = await db
      .select({
        cuentaBancariaId: saldoBancario.cuentaBancariaId,
        periodo: saldoBancario.periodo,
        saldoInicial: saldoBancario.saldoInicial,
        saldoFinal: saldoBancario.saldoFinal,
      })
      .from(saldoBancario)
      .where(inArray(saldoBancario.periodo, [desde, mesAnterior]));

    // Con qué saldo arrancó la cuenta la primera vez que se importó un
    // extracto. Es la plata que ya estaba y que el sistema nunca asentó: si
    // la diferencia es justo eso, lo que falta es el asiento de apertura y no
    // hay nada mal contabilizado.
    const aperturas = await db
      .select({
        cuentaBancariaId: saldoBancario.cuentaBancariaId,
        saldoInicial: sql<string>`(array_agg(${saldoBancario.saldoInicial} order by ${saldoBancario.periodo}))[1]`,
      })
      .from(saldoBancario)
      .groupBy(saldoBancario.cuentaBancariaId);
    const aperturaPorCuenta = new Map(
      aperturas.map((a) => [a.cuentaBancariaId, Number(a.saldoInicial)])
    );

    const delMes = new Map(
      saldos
        .filter((s) => s.periodo === desde)
        .map((s) => [
          s.cuentaBancariaId,
          { inicial: Number(s.saldoInicial), final: Number(s.saldoFinal) },
        ])
    );
    const cierreAnterior = new Map(
      saldos
        .filter((s) => s.periodo === mesAnterior)
        .map((s) => [s.cuentaBancariaId, Number(s.saldoFinal)])
    );

    return cuentas.map((c) => {
      const mes = delMes.get(c.id);
      const banco = mes?.final ?? null;
      const contable = Number(c.saldoContable);
      const anterior = cierreAnterior.get(c.id);

      // El mes abre con un saldo distinto al que cerró el anterior: entre los
      // dos extractos falta uno, o uno de los dos se leyó mal.
      const salto =
        mes && anterior != null
          ? Math.round((mes.inicial - anterior) * 100) / 100
          : null;

      // Menos de un centavo es redondeo, no una diferencia.
      const diferencia =
        banco == null ? null : Math.round((banco - contable) * 100) / 100;

      // La diferencia es exactamente lo que había antes de empezar: falta la
      // apertura, no hay nada mal asentado. Decirlo evita que alguien salga a
      // buscar un error que no existe.
      const apertura = aperturaPorCuenta.get(c.id) ?? 0;
      const faltaApertura =
        diferencia != null &&
        Math.abs(apertura) >= 0.01 &&
        Math.abs(diferencia - apertura) < 0.01;

      return {
        cuentaBancariaId: c.id,
        cuentaBancaria: `${c.banco} ${c.numero ?? ''}`.trim(),
        cuentaContable: c.cuentaContable,
        saldoBanco: banco,
        saldoContable: contable,
        diferencia,
        sinContabilizar: c.sinContabilizar,
        /** Diferencia entre el cierre del mes anterior y la apertura de este. */
        saltoDeSaldo: salto != null && Math.abs(salto) >= 0.01 ? salto : null,
        /** El saldo con el que la cuenta venía antes del primer extracto. */
        saldoDeApertura: faltaApertura ? apertura : null,
      };
    });
  });
