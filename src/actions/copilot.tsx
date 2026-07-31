/**
 * Funciones que el copiloto expone como herramientas al LLM.
 *
 * El nombre que tipea el usuario puede ser el de una empresa (`cliente`) o el
 * de un login de AFIP (`credencial_afip`), que suele agrupar varias empresas:
 * por eso la resolución prueba primero por cliente y después por credencial, y
 * devuelve una lista de clientes con sus totales.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { db, dbReadonly } from '@/lib/db';
import {
  cliente,
  clienteCredencial,
  credencialAfip,
  ivaDeclaracion,
  comprobante,
  comprobanteAlicuota,
  comprobanteTipo,
  cuentaBancaria,
  movimientoBancario,
  deuda,
  notificacion,
  job,
} from '@/drizzle/schema';
import { and, desc, eq, gte, ilike, inArray, lte, sql } from 'drizzle-orm';
import { calcularIva, type ComprobanteAlicuotaRow } from '@/lib/iva-calc';
import { assertCanWrite, getMemberRole, getSessionWithOrg } from './helpers';

/** `YYYY-MM-DD` en hora local: las columnas `date` de la BD son strings. */
function aFecha(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** "MM/YYYY" → primer día del mes, que es como se guarda el período. */
function periodoADate(periodo: string): string {
  const [mm, yyyy] = periodo.split('/');
  return `${yyyy}-${mm}-01`;
}

const n = (v: string | number | null | undefined) => Number(v ?? 0) || 0;

/**
 * Los clientes que el usuario quiso nombrar. Busca por razón social y, si no
 * encuentra nada, por el nombre del login de AFIP (que agrupa varias empresas).
 */
async function resolverClientes(orgId: string, nombre: string) {
  const porRazonSocial = await dbReadonly
    .select({
      id: cliente.id,
      razonSocial: cliente.razonSocial,
      cuit: cliente.cuit,
    })
    .from(cliente)
    .where(
      and(eq(cliente.orgId, orgId), ilike(cliente.razonSocial, `%${nombre}%`))
    );

  if (porRazonSocial.length > 0) return porRazonSocial;

  return await dbReadonly
    .select({
      id: cliente.id,
      razonSocial: cliente.razonSocial,
      cuit: cliente.cuit,
    })
    .from(cliente)
    .innerJoin(clienteCredencial, eq(clienteCredencial.clienteId, cliente.id))
    .innerJoin(
      credencialAfip,
      eq(clienteCredencial.credencialId, credencialAfip.id)
    )
    .where(
      and(eq(cliente.orgId, orgId), ilike(credencialAfip.nombre, `%${nombre}%`))
    );
}

const getIvaPositionInput = z.object({
  clientName: z.string(),
  /** Período fiscal "MM/YYYY". Por defecto, el último declarado. */
  periodo: z.string().optional(),
});

export type GetIvaPositionForCopilotResult =
  | {
      error: string;
      options?: string[];
    }
  | {
      periodo: string;
      clientes: {
        clienteId: string;
        razonSocial: string;
        cuit: string;
        presentadaAt: string | null;
        ventas: {
          netoA21: string;
          netoA105: string;
          totalB21: string;
          totalB105: string;
          totalB27: string;
          debitoFiscal: string;
        };
        compras: {
          netoGravado21: string;
          netoGravado105: string;
          netoGravado27: string;
          creditoFiscal: string;
        };
        saldoTecnico: string;
        saldoLibreDisponibilidad: string;
        totalRetencionesPercepciones: string;
        tieneDatosAFIP: boolean;
        declaracionAfip: {
          debitoFiscal: string | null;
          creditoFiscal: string | null;
          saldoMesAnterior: string | null;
          saldoAfipMes: string | null;
          saldoTecnicoFavor: string | null;
          saldoTecnicoFavorMensual: string | null;
          saldoLibreDisponibilidadAnteriorNeto: string | null;
          retencionesPercepcionesPeriodo: string | null;
          saldoLibreDisponibilidadFavor: string | null;
        } | null;
      }[];
      totales: {
        debitoFiscal: string;
        creditoFiscal: string;
        saldoTecnico: string;
        saldoLibreDisponibilidad: string;
      } | null;
    };

export const getIvaPositionForCopilot = createServerFn({ method: 'POST' })
  .inputValidator(getIvaPositionInput)
  .handler(async (ctx): Promise<GetIvaPositionForCopilotResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clientName } = ctx.data;

    const clientes = await resolverClientes(orgId, clientName);
    if (clientes.length === 0) {
      return { error: `No encontré clientes con nombre "${clientName}"` };
    }

    const clienteIds = clientes.map((c) => c.id);

    // Sin período explícito se usa el último declarado por alguno de ellos.
    let periodo: string;
    if (ctx.data.periodo) {
      periodo = periodoADate(ctx.data.periodo);
    } else {
      const [ultima] = await dbReadonly
        .select({ periodo: ivaDeclaracion.periodo })
        .from(ivaDeclaracion)
        .where(inArray(ivaDeclaracion.clienteId, clienteIds))
        .orderBy(desc(ivaDeclaracion.periodo))
        .limit(1);
      if (!ultima) {
        return { error: `No hay declaraciones de IVA para "${clientName}".` };
      }
      periodo = ultima.periodo;
    }

    // Primer y último día del período, para acotar los comprobantes.
    const [anio, mes] = periodo.split('-').map(Number);
    const desde = aFecha(new Date(anio, mes - 1, 1));
    const hasta = aFecha(new Date(anio, mes, 0));

    const results: Extract<
      GetIvaPositionForCopilotResult,
      { clientes: unknown }
    >['clientes'] = [];

    for (const c of clientes) {
      const [declaracion] = await dbReadonly
        .select()
        .from(ivaDeclaracion)
        .where(
          and(
            eq(ivaDeclaracion.clienteId, c.id),
            eq(ivaDeclaracion.periodo, periodo)
          )
        )
        .limit(1);

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
        .innerJoin(comprobanteTipo, eq(comprobante.tipo, comprobanteTipo.codigo))
        .where(
          and(
            eq(comprobante.clienteId, c.id),
            gte(comprobante.fechaEmision, desde),
            lte(comprobante.fechaEmision, hasta)
          )
        );

      const iva = calcularIva(alicuotas);
      const saldoAFavor = n(declaracion?.saldoTecnicoFavor);
      const saldoLibreDisp = n(declaracion?.saldoLibreDisponibilidadFavor);
      const retenciones = n(declaracion?.retencionesPercepcionesPeriodo);

      results.push({
        clienteId: c.id,
        razonSocial: c.razonSocial,
        cuit: c.cuit,
        presentadaAt: declaracion?.presentadaAt ?? null,
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
        saldoTecnico: (
          iva.debitoFiscal -
          iva.creditoFiscalCompras -
          saldoAFavor
        ).toFixed(2),
        saldoLibreDisponibilidad: saldoLibreDisp.toFixed(2),
        totalRetencionesPercepciones: retenciones.toFixed(2),
        tieneDatosAFIP: !!declaracion,
        declaracionAfip: declaracion
          ? {
              debitoFiscal: declaracion.debitoFiscal,
              creditoFiscal: declaracion.creditoFiscal,
              saldoMesAnterior: declaracion.saldoMesAnterior,
              saldoAfipMes: declaracion.saldoAfipMes,
              saldoTecnicoFavor: declaracion.saldoTecnicoFavor,
              saldoTecnicoFavorMensual: declaracion.saldoTecnicoFavorMensual,
              saldoLibreDisponibilidadAnteriorNeto:
                declaracion.saldoLibreDisponibilidadAnteriorNeto,
              retencionesPercepcionesPeriodo:
                declaracion.retencionesPercepcionesPeriodo,
              saldoLibreDisponibilidadFavor:
                declaracion.saldoLibreDisponibilidadFavor,
            }
          : null,
      });
    }

    const totales =
      results.length > 1
        ? {
            debitoFiscal: results
              .reduce((s, r) => s + n(r.ventas.debitoFiscal), 0)
              .toFixed(2),
            creditoFiscal: results
              .reduce((s, r) => s + n(r.compras.creditoFiscal), 0)
              .toFixed(2),
            saldoTecnico: results
              .reduce((s, r) => s + n(r.saldoTecnico), 0)
              .toFixed(2),
            saldoLibreDisponibilidad: results
              .reduce((s, r) => s + n(r.saldoLibreDisponibilidad), 0)
              .toFixed(2),
          }
        : null;

    return { periodo, clientes: results, totales };
  });

/* =========================================================================
   Resolución de cliente por nombre o id, acotada al estudio.
   Usada por el escáner de extractos para que el LLM pueda pasar un nombre.
   ========================================================================= */
const resolveClientInput = z
  .object({
    clienteId: z.string().optional(),
    clientName: z.string().optional(),
  })
  .refine((v) => Boolean(v.clienteId ?? v.clientName), {
    message: 'Se requiere clienteId o clientName',
  });

export type ResolveClientResult =
  | { id: string; name: string }
  | { error: string; options?: string[] };

export const resolveClientForCopilot = createServerFn({ method: 'POST' })
  .inputValidator(resolveClientInput)
  .handler(async (ctx): Promise<ResolveClientResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clienteId, clientName } = ctx.data;

    if (clienteId) {
      const [row] = await dbReadonly
        .select({ id: cliente.id, razonSocial: cliente.razonSocial })
        .from(cliente)
        .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId)))
        .limit(1);
      if (!row) return { error: 'Cliente no encontrado o fuera del estudio.' };
      return { id: row.id, name: row.razonSocial };
    }

    const matches = await resolverClientes(orgId, clientName!);
    if (matches.length === 0) {
      return { error: `No encontré clientes con nombre "${clientName!}"` };
    }
    if (matches.length > 1) {
      return {
        error: 'Más de un cliente coincide',
        options: matches.map((c) => c.razonSocial),
      };
    }
    return { id: matches[0].id, name: matches[0].razonSocial };
  });

/* =========================================================================
   Persistir los movimientos que el escáner extrajo de un extracto bancario.
   Van a `movimiento_bancario`, que cuelga de una cuenta del cliente: si esa
   cuenta no existe todavía se crea con el banco que informó el extracto.
   El importe se guarda siempre positivo — el signo lo lleva `direccion`.
   ========================================================================= */
const movementInputSchema = z.object({
  fecha: z.string().min(1),
  tipo: z.enum(['ingreso', 'egreso']),
  monto: z.string().min(1),
  infoExtra: z.string().optional().default(''),
  tipoGasto: z.string().optional(),
});

const persistMovementsInput = z.object({
  clienteId: z.string().min(1),
  banco: z.string().optional().default(''),
  ingresos: z.array(movementInputSchema),
  egresos: z.array(movementInputSchema),
});

export interface PersistMovementsResult {
  inserted: number;
  skipped: number;
  clienteId: string;
  clienteNombre: string;
  cuentaBancariaId: string;
  banco: string;
}

const ARG_MONTO_RE = /^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+(,\d{1,2})?$/;
const FECHA_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/;
const NON_NUMERIC_RE = /[^0-9.-]/g;

function parseArgMonto(raw: string): number | null {
  const trimmed = raw.trim().replace(/^\$\s*/, '');
  // Acepta formato argentino "1.234.567,89" o "1234567,89" o "1234567.89".
  if (ARG_MONTO_RE.test(trimmed)) {
    const normalized = trimmed.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  // Fallback permisivo: quita separadores y prueba.
  const fallback = Number(
    trimmed.replace(/\./g, '').replace(',', '.').replace(NON_NUMERIC_RE, '')
  );
  return Number.isFinite(fallback) ? fallback : null;
}

function parseArgFecha(raw: string): string | null {
  const m = FECHA_RE.exec(raw.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const persistBankStatementMovements = createServerFn({ method: 'POST' })
  .inputValidator(persistMovementsInput)
  .handler(async (ctx): Promise<PersistMovementsResult> => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const { clienteId, banco, ingresos, egresos } = ctx.data;

    const [target] = await db
      .select({ id: cliente.id, razonSocial: cliente.razonSocial })
      .from(cliente)
      .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId)))
      .limit(1);
    if (!target) {
      throw new Error('Cliente no encontrado o fuera del estudio.');
    }

    const nombreBanco = banco.trim() || 'Sin identificar';
    const [existente] = await db
      .select({ id: cuentaBancaria.id })
      .from(cuentaBancaria)
      .where(
        and(
          eq(cuentaBancaria.clienteId, target.id),
          eq(cuentaBancaria.banco, nombreBanco)
        )
      )
      .limit(1);

    const cuentaBancariaId =
      existente?.id ??
      (
        await db
          .insert(cuentaBancaria)
          .values({ orgId, clienteId: target.id, banco: nombreBanco })
          .returning({ id: cuentaBancaria.id })
      )[0].id;

    const todos = [
      ...ingresos.map((m) => ({ direccion: 'ingreso' as const, m })),
      ...egresos.map((m) => ({ direccion: 'egreso' as const, m })),
    ];

    const rows: (typeof movimientoBancario.$inferInsert)[] = [];
    let skipped = 0;
    for (const { direccion, m } of todos) {
      const fecha = parseArgFecha(m.fecha);
      const monto = parseArgMonto(m.monto);
      if (!fecha || monto == null) {
        skipped += 1;
        continue;
      }
      rows.push({
        cuentaBancariaId,
        fecha,
        direccion,
        importe: Math.abs(monto).toFixed(2),
        descripcion: (m.infoExtra ?? '').trim() || direccion,
        fuente: 'import',
        // El tipo de gasto que sugirió el escáner no tiene columna propia:
        // se conserva crudo hasta que se impute a una cuenta contable.
        datosCrudos: m.tipoGasto ? { tipoGasto: m.tipoGasto } : null,
      });
    }

    if (rows.length > 0) {
      await db.insert(movimientoBancario).values(rows);
    }

    return {
      inserted: rows.length,
      skipped,
      clienteId: target.id,
      clienteNombre: target.razonSocial,
      cuentaBancariaId,
      banco: nombreBanco,
    };
  });

/**
 * Resumen de salud de un cliente.
 *
 * Combina varias tablas para responder "cómo está el cliente X" sin abrir 7
 * pestañas: health score 0-100, facturación del mes, deudas, notificaciones sin
 * leer y estado del último scrape de cada tipo.
 *
 * Acepta `clienteId` y/o `clientName`. Si el id no resuelve (los LLMs suelen
 * "regenerar" UUIDs cambiándole un dígito), cae por búsqueda de nombre.
 */
const getResumenSaludClienteInput = z.object({
  clienteId: z.string().optional(),
  clientName: z.string().optional(),
});

export type GetResumenSaludClienteResult =
  | { error: string }
  | {
      cliente: { id: string; razonSocial: string; cuit: string };
      healthScore: number;
      facturacionMesActual: {
        ventas: number;
        compras: number;
        cantidad: number;
      };
      deudas: {
        vencidas: number;
        vencidasMonto: number;
        total: number;
        totalMonto: number;
      };
      notificaciones: { noLeidas: number };
      ultimoScrapePorTipo: {
        tipo: string;
        status: string | null;
        finishedAt: string | null;
        diasDesde: number | null;
        failedReason: string | null;
      }[];
      observaciones: { severidad: 'info' | 'warn' | 'error'; mensaje: string }[];
    };

export const getResumenSaludCliente = createServerFn({ method: 'POST' })
  .inputValidator(getResumenSaludClienteInput)
  .handler(async (ctx): Promise<GetResumenSaludClienteResult> => {
    const { orgId } = await getSessionWithOrg();
    const { clienteId, clientName } = ctx.data;

    if (!clienteId && !clientName) {
      return { error: 'Se requiere clienteId o clientName.' };
    }

    let target: { id: string; razonSocial: string; cuit: string } | null = null;
    if (clienteId) {
      const [byId] = await dbReadonly
        .select({
          id: cliente.id,
          razonSocial: cliente.razonSocial,
          cuit: cliente.cuit,
        })
        .from(cliente)
        .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId)))
        .limit(1);
      if (byId) target = byId;
    }

    if (!target && clientName) {
      const matches = await resolverClientes(orgId, clientName);
      if (matches.length === 1) {
        target = matches[0];
      } else if (matches.length > 1) {
        return {
          error: `Encontré varios clientes con nombre similar a "${clientName}". Especificá cuál: ${matches
            .map((m) => m.razonSocial)
            .join(', ')}`,
        };
      }
    }

    if (!target) {
      return {
        error: clientName
          ? `No encontré ningún cliente con nombre "${clientName}" en el estudio.`
          : 'Cliente no encontrado o fuera del estudio.',
      };
    }

    const now = new Date();
    const desde = aFecha(new Date(now.getFullYear(), now.getMonth(), 1));
    const hasta = aFecha(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    // Los jobs cuelgan del login de AFIP, no del cliente.
    const credenciales = await dbReadonly
      .select({ id: clienteCredencial.credencialId })
      .from(clienteCredencial)
      .where(eq(clienteCredencial.clienteId, target.id));
    const credencialIds = credenciales.map((c) => c.id);

    const [deudas, sinLeer, jobs, facturacion] = await Promise.all([
      dbReadonly.select().from(deuda).where(eq(deuda.clienteId, target.id)),
      dbReadonly
        .select({ count: sql<number>`count(*)` })
        .from(notificacion)
        .where(
          and(
            eq(notificacion.clienteId, target.id),
            eq(notificacion.leida, false)
          )
        ),
      credencialIds.length === 0
        ? []
        : dbReadonly
            .select({
              type: job.type,
              status: job.status,
              finishedAt: job.finishedAt,
              createdAt: job.createdAt,
              failedReason: job.failedReason,
            })
            .from(job)
            .where(inArray(job.credencialId, credencialIds))
            .orderBy(desc(job.createdAt))
            .limit(50),
      dbReadonly
        .select({
          direccion: comprobante.direccion,
          total: sql<string>`COALESCE(SUM(${comprobante.total} * ${comprobante.cotizacion}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(comprobante)
        .where(
          and(
            eq(comprobante.clienteId, target.id),
            gte(comprobante.fechaEmision, desde),
            lte(comprobante.fechaEmision, hasta)
          )
        )
        .groupBy(comprobante.direccion),
    ]);

    let ventas = 0;
    let compras = 0;
    let cantidad = 0;
    for (const row of facturacion) {
      cantidad += Number(row.count);
      if (row.direccion === 'emitido') ventas += n(row.total);
      else compras += n(row.total);
    }

    const hoy = aFecha(now);
    const vencidas = deudas.filter((d) => d.venceAt && d.venceAt < hoy);
    const vencidasMonto = vencidas.reduce((s, d) => s + n(d.saldo), 0);
    const totalMonto = deudas.reduce((s, d) => s + n(d.saldo), 0);
    const noLeidas = Number(sinLeer[0]?.count ?? 0);

    const tipos = [
      'iva',
      'comprobantes',
      'notificaciones',
      'deuda',
      'vencimientos',
    ] as const;
    const ultimoScrapePorTipo = tipos.map((tipo) => {
      const ultimo = jobs.find((j) => j.type === tipo);
      const fin = ultimo?.finishedAt ? new Date(ultimo.finishedAt) : null;
      return {
        tipo,
        status: ultimo?.status ?? null,
        finishedAt: fin ? fin.toISOString() : null,
        diasDesde: fin
          ? Math.floor((now.getTime() - fin.getTime()) / 86400000)
          : null,
        failedReason: ultimo?.failedReason ?? null,
      };
    });

    let score = 0;
    const observaciones: {
      severidad: 'info' | 'warn' | 'error';
      mensaje: string;
    }[] = [];

    // 25 pts: sin deudas vencidas
    if (vencidas.length === 0) score += 25;
    else
      observaciones.push({
        severidad: 'error',
        mensaje: `${vencidas.length} deudas vencidas por $${vencidasMonto.toFixed(0)}`,
      });

    // 20 pts: scrape reciente (cualquier tipo, <7 días)
    const scrapeReciente = ultimoScrapePorTipo.some(
      (s) => s.diasDesde !== null && s.diasDesde <= 7 && s.status === 'finished'
    );
    if (scrapeReciente) score += 20;
    else
      observaciones.push({
        severidad: 'warn',
        mensaje: 'No hay scrapes exitosos en los últimos 7 días',
      });

    // 20 pts: ningún job recientemente fallido
    const algunFallido = ultimoScrapePorTipo.some((s) => s.status === 'failed');
    if (!algunFallido) score += 20;
    else
      observaciones.push({
        severidad: 'error',
        mensaje: 'Hay jobs fallidos recientes — revisar credenciales',
      });

    // 15 pts: notificaciones sin leer < 5
    if (noLeidas < 5) score += 15;
    else
      observaciones.push({
        severidad: 'warn',
        mensaje: `${noLeidas} notificaciones AFIP sin leer`,
      });

    // 20 pts: tiene facturación reciente
    if (cantidad > 0) score += 20;
    else
      observaciones.push({
        severidad: 'info',
        mensaje: 'Sin facturación registrada este mes',
      });

    return {
      cliente: target,
      healthScore: score,
      facturacionMesActual: { ventas, compras, cantidad },
      deudas: {
        vencidas: vencidas.length,
        vencidasMonto,
        total: deudas.length,
        totalMonto,
      },
      notificaciones: { noLeidas },
      ultimoScrapePorTipo,
      observaciones,
    };
  });
