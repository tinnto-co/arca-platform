import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  cliente,
  ivaDeclaracion,
  comprobante,
  comprobanteAlicuota,
  clienteMonotributo,
  comprobanteTipo,
  condicionIva,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
} from '@/actions/helpers';
import { calcularIva, type ComprobanteAlicuotaRow } from '@/lib/iva-calc';
import { and, eq, asc, desc, isNull, sql } from 'drizzle-orm';

export const FISCAL_CONDITIONS = condicionIva.enumValues;

/**
 * Los logins de AFIP del cliente, en una sola línea. Un cliente puede tener
 * más de uno (varios representantes declaran por él), así que se agregan.
 *
 * La correlación va como `"cliente"."id"` literal y no `${cliente.id}`:
 * cuando la consulta externa no tiene joins, Drizzle renderiza la columna sin
 * calificar («"id"») y dentro de la subconsulta choca con `credencial_afip.id`
 * — `column reference "id" is ambiguous`. Los dos fragmentos solo tienen
 * sentido en consultas cuyo FROM es `cliente`, así que el literal es seguro.
 */
const credencialesSql = sql<string | null>`(
  select string_agg(distinct coalesce(cr.nombre, cr.cuit), ', ')
  from cliente_credencial cc
  join credencial_afip cr on cr.id = cc.credencial_id
  where cc.cliente_id = "cliente"."id"
)`;

/**
 * El login de AFIP con el que se abre la ficha del cliente. La ruta de detalle
 * es `/clients/{credencialId}?empresa={clienteId}`, así que sin este id la fila
 * de la tabla no puede linkear a su propia ficha.
 */
const credencialPreferidaSql = sql<string | null>`(
  select cc.credencial_id::text
  from cliente_credencial cc
  where cc.cliente_id = "cliente"."id"
  order by cc.preferida desc, cc.created_at asc
  limit 1
)`;

/** "MM/YYYY" → primer día del mes, que es como se guarda el período. */
function periodoADate(periodo: string): string {
  const [mm, yyyy] = periodo.split('/');
  return `${yyyy}-${mm}-01`;
}

/** Posición de IVA de un cliente calculada desde sus propios comprobantes. */
interface PosicionCalculada {
  /** Débito de la DDJJ: Libro IVA Ventas + IVA de las NC recibidas (art. 11). */
  calcDebitoFiscal: number;
  /** Crédito de la DDJJ: Libro IVA Compras + IVA de las NC emitidas (art. 12). */
  calcCreditoFiscal: number;
  /** `calcDebitoFiscal − calcCreditoFiscal`: positivo es a pagar. */
  calcSaldoTecnico: number;
  /** Comprobantes del período. Distingue "no hay nada cargado" de "da cero". */
  comprobantes: number;
}

const POSICION_VACIA: PosicionCalculada = {
  calcDebitoFiscal: 0,
  calcCreditoFiscal: 0,
  calcSaldoTecnico: 0,
  comprobantes: 0,
};

/**
 * Calcula la posición de IVA del período para todos los clientes de la org, en
 * dos consultas, reusando `calcularIva` —el mismo cálculo que muestra la ficha
 * del cliente— para que la tabla y el detalle no puedan divergir.
 *
 * Las alícuotas se preagregan en SQL por (cliente, dirección, letra, NC,
 * alícuota) y ya convertidas a pesos: `calcularIva` sólo suma, así que sumar
 * antes o después da lo mismo y evita traer una fila por comprobante.
 */
async function calcularPosicionPorCliente(
  orgId: string,
  periodo: string
): Promise<Map<string, PosicionCalculada>> {
  const cotizacion = sql`case when upper(${comprobante.moneda}) = 'ARS' then 1
    else coalesce(nullif(${comprobante.cotizacion}, 0), 1) end`;
  const delPeriodo = and(
    eq(comprobante.orgId, orgId),
    eq(comprobante.periodo, periodo)
  );

  const [alicuotas, conteos] = await Promise.all([
    db
      .select({
        clienteId: comprobante.clienteId,
        direccion: comprobante.direccion,
        letra: comprobanteTipo.letra,
        esNc: comprobanteTipo.esNc,
        alicuota: comprobanteAlicuota.alicuota,
        neto: sql<string>`sum(${comprobanteAlicuota.neto} * ${cotizacion})::text`,
        iva: sql<string>`sum(${comprobanteAlicuota.iva} * ${cotizacion})::text`,
      })
      .from(comprobanteAlicuota)
      .innerJoin(
        comprobante,
        eq(comprobanteAlicuota.comprobanteId, comprobante.id)
      )
      .innerJoin(comprobanteTipo, eq(comprobante.tipo, comprobanteTipo.codigo))
      .where(delPeriodo)
      .groupBy(
        comprobante.clienteId,
        comprobante.direccion,
        comprobanteTipo.letra,
        comprobanteTipo.esNc,
        comprobanteAlicuota.alicuota
      ),
    db
      .select({
        clienteId: comprobante.clienteId,
        total: sql<number>`count(*)::int`,
      })
      .from(comprobante)
      .where(delPeriodo)
      .groupBy(comprobante.clienteId),
  ]);

  // Las filas ya vienen en pesos: se le pasan a `calcularIva` como ARS a 1.
  const porCliente = new Map<string, ComprobanteAlicuotaRow[]>();
  for (const a of alicuotas) {
    const filas = porCliente.get(a.clienteId) ?? [];
    filas.push({
      direccion: a.direccion,
      letra: a.letra,
      esNc: a.esNc,
      moneda: 'ARS',
      cotizacion: '1',
      alicuota: a.alicuota,
      neto: a.neto,
      iva: a.iva,
    });
    porCliente.set(a.clienteId, filas);
  }

  const resultado = new Map<string, PosicionCalculada>();
  for (const { clienteId, total } of conteos) {
    const b = calcularIva(porCliente.get(clienteId) ?? []);
    resultado.set(clienteId, {
      calcDebitoFiscal: b.debitoFiscal,
      calcCreditoFiscal: b.creditoFiscalCompras,
      calcSaldoTecnico: b.debitoFiscal - b.creditoFiscalCompras,
      comprobantes: total,
    });
  }
  return resultado;
}

/**
 * Resumen de posición IVA de todos los clientes Responsable Inscripto de la
 * organización, para un período fiscal dado ("MM/YYYY").
 *
 * Cada fila trae dos lecturas del mismo período: la calculada desde los
 * comprobantes cargados (`calc*`, lo que muestra la ficha del cliente) y la que
 * se scrapeó del F2051 (`debitoFiscal`, `creditoFiscal`, …), que puede no
 * existir. Las columnas de la tabla muestran la calculada; la declarada queda
 * para señalar diferencias. Saldo libre disponibilidad y retenciones sólo
 * existen del lado de AFIP: no se pueden derivar de comprobantes.
 */
export const getIvaResumenRI = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      periodo: z.string().regex(/^\d{2}\/\d{4}$/, 'Formato esperado: MM/YYYY'),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const periodo = periodoADate(ctx.data.periodo);

    const [filas, calculado] = await Promise.all([
      db
        .select({
          clienteId: cliente.id,
          razonSocial: cliente.razonSocial,
          cuit: cliente.cuit,
          credenciales: credencialesSql,
          credencialId: credencialPreferidaSql,
          condicionIva: cliente.condicionIva,
          declaracionId: ivaDeclaracion.id,
          presentadaAt: ivaDeclaracion.presentadaAt,
          debitoFiscal: ivaDeclaracion.debitoFiscal,
          creditoFiscal: ivaDeclaracion.creditoFiscal,
          saldoTecnicoFavor: ivaDeclaracion.saldoTecnicoFavor,
          saldoLibreDisponibilidadFavor:
            ivaDeclaracion.saldoLibreDisponibilidadFavor,
          retencionesPercepcionesPeriodo:
            ivaDeclaracion.retencionesPercepcionesPeriodo,
        })
        .from(cliente)
        .leftJoin(
          ivaDeclaracion,
          and(
            eq(ivaDeclaracion.clienteId, cliente.id),
            eq(ivaDeclaracion.periodo, periodo)
          )
        )
        .where(
          and(
            eq(cliente.orgId, orgId),
            eq(cliente.condicionIva, 'responsable_inscripto'),
            eq(cliente.estado, 'activo')
          )
        )
        .orderBy(asc(cliente.razonSocial)),
      calcularPosicionPorCliente(orgId, periodo),
    ]);

    return filas.map((f) => ({
      ...f,
      ...(calculado.get(f.clienteId) ?? POSICION_VACIA),
    }));
  });

/**
 * Clientes monotributistas con la facturación emitida acumulada de los últimos
 * 12 meses cerrados, para monitorear los límites de categoría. Las notas de
 * crédito restan: el catálogo `comprobante_tipo` dice cuáles lo son.
 */
export const getMonotributistasFacturacion = createServerFn({
  method: 'GET',
})
  .validator(
    z.object({
      /**
       * Mes final de la ventana (MM/YYYY). La facturación es la de los 12
       * meses calendario que TERMINAN en ese mes, inclusive. Sin período:
       * el mes anterior — los últimos 12 meses cerrados, que es contra lo
       * que se mira el tope de categoría.
       */
      periodo: z
        .string()
        .regex(/^\d{2}\/\d{4}$/)
        .optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const ahora = new Date();
    const [mesStr, anioStr] = ctx.data.periodo?.split('/') ?? [];
    const fin = ctx.data.periodo
      ? new Date(Number(anioStr), Number(mesStr), 1) // 1° del mes SIGUIENTE al elegido
      : new Date(ahora.getFullYear(), ahora.getMonth(), 1); // sin período: cierra en el mes anterior
    const inicio = new Date(fin.getFullYear() - 1, fin.getMonth(), 1);
    const aFecha = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

    const facturado = sql`coalesce(sum(
    case when ${comprobanteTipo.esNc} then -${comprobante.total} else ${comprobante.total} end
  ), 0)`;

    return await db
      .select({
        clienteId: cliente.id,
        razonSocial: cliente.razonSocial,
        cuit: cliente.cuit,
        credenciales: credencialesSql,
        condicionIva: cliente.condicionIva,
        // Vienen de AFIP por el scrapper: la categoría en la que el cliente
        // ESTÁ inscripto, que puede no ser la que le corresponde por lo que
        // facturó. Ver esa diferencia es el punto de la solapa.
        categoria: clienteMonotributo.categoria,
        cuotaMensual: clienteMonotributo.cuotaMensual,
        comprobanteCount: sql<number>`count(${comprobante.id})::int`,
        ultimoComprobante: sql<
          string | null
        >`max(${comprobante.fechaEmision})::text`,
        facturacion12m: sql<string>`${facturado}::text`,
      })
      .from(cliente)
      .leftJoin(
        comprobante,
        and(
          eq(comprobante.clienteId, cliente.id),
          eq(comprobante.direccion, 'emitido'),
          sql`${comprobante.fechaEmision} >= ${aFecha(inicio)}::date`,
          sql`${comprobante.fechaEmision} < ${aFecha(fin)}::date`
        )
      )
      .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
      .leftJoin(
        clienteMonotributo,
        eq(clienteMonotributo.clienteId, cliente.id)
      )
      .where(
        and(
          eq(cliente.orgId, orgId),
          eq(cliente.condicionIva, 'monotributista'),
          eq(cliente.estado, 'activo')
        )
      )
      .groupBy(
        cliente.id,
        cliente.razonSocial,
        cliente.cuit,
        cliente.condicionIva,
        clienteMonotributo.categoria,
        clienteMonotributo.cuotaMensual
      )
      .orderBy(desc(facturado));
  });

/** Clientes activos de la organización sin condición fiscal asignada. */
export const getClientesSinClasificar = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  return await db
    .select({
      clienteId: cliente.id,
      razonSocial: cliente.razonSocial,
      cuit: cliente.cuit,
      credenciales: credencialesSql,
      condicionIva: cliente.condicionIva,
    })
    .from(cliente)
    .where(
      and(
        eq(cliente.orgId, orgId),
        isNull(cliente.condicionIva),
        eq(cliente.estado, 'activo')
      )
    )
    .orderBy(asc(cliente.razonSocial));
});

export const updateClienteCondicionIva = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      condicionIva: z.enum(condicionIva.enumValues).nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const [updated] = await db
      .update(cliente)
      .set({ condicionIva: ctx.data.condicionIva, updatedAt: new Date() })
      .where(and(eq(cliente.id, ctx.data.clienteId), eq(cliente.orgId, orgId)))
      .returning({
        clienteId: cliente.id,
        condicionIva: cliente.condicionIva,
      });

    if (!updated) throw new Error('Cliente no encontrado o no autorizado');
    return updated;
  });
