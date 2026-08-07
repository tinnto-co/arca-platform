import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  cliente,
  conceptoAfip,
  clienteConcepto,
  clienteEmpleadorConfig,
  concepto,
  convenio,
  convenioFuente,
  convenioCategoria,
  escalaSalarial,
  modalidadContratacion,
  situacionRevista,
  zona,
  condicionTrabajador,
  actividad,
  siniestrado,
  provincia,
  tipoEmpresa,
  clienteCct,
  cct,
  empleado,
  recibo,
  reciboConcepto,
  obraSocial,
  parametroPeriodo,
  localidad,
  lsdPresentacion,
  baseCalculo,
  baseCalculoConcepto,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import {
  eq,
  and,
  desc,
  asc,
  lte,
  or,
  isNull,
  isNotNull,
  gte,
  inArray,
  sql,
  ne,
  aliasedTable,
  max,
  getTableColumns,
} from 'drizzle-orm';
import {
  montoLiquidadoDesdeEditsSos,
  parseDecimalSos,
  totalesReciboSosDesdeMontos,
} from '@/lib/sos-recibo-totales';
import { normalizeLegajo } from '@/lib/legajo';
import { periodoADate, dateAPeriodo, rangoAnio } from '@/lib/periodo';

/** Alias: varias funciones reciben un parámetro llamado igual que la tabla. */
type Empleado = typeof empleado.$inferSelect;

/**
 * Verifica que el cliente pertenezca a la org. y tenga la liquidación de
 * sueldos habilitada.
 *
 * El modelo viejo tenía dos niveles (representante → perfil): `clientId` era el
 * login de AFIP y `profileId` la empresa. Ahora la empresa es `cliente` y es la
 * única unidad, así que `clientId` y `profileId` son el mismo id.
 */
async function ensureClientBelongsToOrg(
  clienteId: string,
  orgId: string
): Promise<void> {
  const [c] = await db
    .select({ id: cliente.id })
    .from(cliente)
    .innerJoin(
      clienteEmpleadorConfig,
      and(
        eq(clienteEmpleadorConfig.clienteId, cliente.id),
        eq(clienteEmpleadorConfig.liquidaSueldos, true)
      )
    )
    .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId)))
    .limit(1);
  if (!c) {
    throw new Error(
      'Cliente no encontrado, no autorizado o sin liquidación de sueldos habilitada'
    );
  }
}

/**
 * Códigos AFIP con los que se da de alta un empleado cuando la empresa no tiene
 * default configurado. Son los del caso normal: activo, servicios comunes mayor
 * de edad, sin siniestro. La actividad no tiene un "neutro" en el catálogo, así
 * que se usa la de servicios (la del 97% del padrón actual).
 */
const LSD_CODIGO_FALLBACK = {
  situacion: '01',
  condicion: '01',
  actividad: '049',
  siniestrado: '00',
} as const;

/**
 * Las FK de LSD en `empleado` son NOT NULL (el legajo no puede quedar sin
 * declarar). Se toman de la config del empleador y, si falta, del catálogo.
 */
async function resolverDefaultsLsd(clienteId: string): Promise<{
  situacionId: string;
  condicionId: string;
  actividadId: string;
  siniestradoId: string;
  modalidadContratacionId: string | null;
  zonaId: string | null;
  obraSocialId: string | null;
}> {
  const [cfg] = await db
    .select({
      situacionId: clienteEmpleadorConfig.situacionDefaultId,
      condicionId: clienteEmpleadorConfig.condicionDefaultId,
      actividadId: clienteEmpleadorConfig.actividadDefaultId,
      siniestradoId: clienteEmpleadorConfig.siniestradoDefaultId,
      modalidadContratacionId: clienteEmpleadorConfig.modalidadDefaultId,
      zonaId: clienteEmpleadorConfig.zonaDefaultId,
      obraSocialId: clienteEmpleadorConfig.obraSocialDefaultId,
    })
    .from(clienteEmpleadorConfig)
    .where(eq(clienteEmpleadorConfig.clienteId, clienteId))
    .limit(1);

  const exigir = (id: string | undefined, codigo: string): string => {
    if (!id) throw new Error(`Falta el código LSD "${codigo}" en el catálogo`);
    return id;
  };

  const [sit] = cfg?.situacionId
    ? []
    : await db
        .select({ id: situacionRevista.id })
        .from(situacionRevista)
        .where(eq(situacionRevista.codigo, LSD_CODIGO_FALLBACK.situacion))
        .limit(1);
  const [con] = cfg?.condicionId
    ? []
    : await db
        .select({ id: condicionTrabajador.id })
        .from(condicionTrabajador)
        .where(eq(condicionTrabajador.codigo, LSD_CODIGO_FALLBACK.condicion))
        .limit(1);
  const [act] = cfg?.actividadId
    ? []
    : await db
        .select({ id: actividad.id })
        .from(actividad)
        .where(eq(actividad.codigo, LSD_CODIGO_FALLBACK.actividad))
        .limit(1);
  const [sin] = cfg?.siniestradoId
    ? []
    : await db
        .select({ id: siniestrado.id })
        .from(siniestrado)
        .where(eq(siniestrado.codigo, LSD_CODIGO_FALLBACK.siniestrado))
        .limit(1);

  return {
    situacionId:
      cfg?.situacionId ?? exigir(sit?.id, LSD_CODIGO_FALLBACK.situacion),
    condicionId:
      cfg?.condicionId ?? exigir(con?.id, LSD_CODIGO_FALLBACK.condicion),
    actividadId:
      cfg?.actividadId ?? exigir(act?.id, LSD_CODIGO_FALLBACK.actividad),
    siniestradoId:
      cfg?.siniestradoId ?? exigir(sin?.id, LSD_CODIGO_FALLBACK.siniestrado),
    modalidadContratacionId: cfg?.modalidadContratacionId ?? null,
    zonaId: cfg?.zonaId ?? null,
    obraSocialId: cfg?.obraSocialId ?? null,
  };
}

/**
 * El UI identifica los conceptos por número SOS ("101"); en BD la línea del
 * recibo apunta al catálogo global por FK. Traduce números → ids de una.
 */
async function mapaConceptoIdPorNumero(
  codigos: string[]
): Promise<Map<string, string>> {
  const numeros = [
    ...new Set(codigos.map((c) => parseInt(c, 10)).filter((n) => !isNaN(n))),
  ];
  if (numeros.length === 0) return new Map();
  const rows = await db
    .select({ id: concepto.id, numero: concepto.numero })
    .from(concepto)
    .where(inArray(concepto.numero, numeros));
  return new Map(rows.map((r) => [String(r.numero), r.id]));
}

function conceptoIdRequerido(
  mapa: Map<string, string>,
  codigo: string
): string {
  const id = mapa.get(String(parseInt(codigo, 10)));
  if (!id) throw new Error(`Concepto ${codigo} inexistente en el catálogo`);
  return id;
}

/** `recibo_concepto.concepto_ref` es el número de otro concepto (1–620). */
function conceptoRefOrNull(raw: string | null | undefined): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isInteger(n) && n >= 1 && n <= 620 ? n : null;
}

/** Misma fila unificada (`empleado`) para importados y carga con convenio. */
async function upsertLiquidacionEmpleadoForPayrollRow(input: {
  orgId: string;
  profileId: string;
  cuil: string;
  nombreCompleto: string;
  legajo: string;
  /** Columna `date`: YYYY-MM-DD. */
  fechaAlta: string;
  origen: 'import' | 'manual';
  convenioId: string;
  categoriaId: string;
  tipoJornada: 'full_time' | 'part_time' | 'reducida';
  activo: boolean;
}): Promise<string> {
  const [existing] = await db
    .select({ id: empleado.id })
    .from(empleado)
    .where(
      and(
        eq(empleado.clienteId, input.profileId),
        eq(empleado.cuil, input.cuil)
      )
    )
    .limit(1);

  const campos = {
    nombre: input.nombreCompleto,
    legajo: normalizeLegajo(input.legajo),
    fechaAlta: input.fechaAlta,
    convenioId: input.convenioId,
    categoriaId: input.categoriaId,
    tipoJornada: input.tipoJornada,
    fuente:
      input.origen === 'import' ? ('import' as const) : ('manual' as const),
    activo: input.activo,
  };

  if (existing) {
    await db.update(empleado).set(campos).where(eq(empleado.id, existing.id));
    return existing.id;
  }

  const defaults = await resolverDefaultsLsd(input.profileId);
  const [inserted] = await db
    .insert(empleado)
    .values({
      orgId: input.orgId,
      clienteId: input.profileId,
      cuil: input.cuil,
      ...defaults,
      ...campos,
    })
    .returning({ id: empleado.id });

  if (!inserted) throw new Error('No se pudo crear el empleado unificado');
  return inserted.id;
}

function extractCctCodigo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/\b(\d{2,4})\/(\d{2,4})\b/);
  if (!match) return null;
  const izquierda = String(parseInt(match[1], 10));
  const derecha = String(parseInt(match[2], 10)).padStart(2, '0');
  return `${izquierda}/${derecha}`;
}

import { roundMoney } from '../lib/payroll-formula';
import { puedeLiquidarPeriodo } from '../lib/payroll-period-rules';
import * as r2 from '@/lib/r2';
import { parseISO } from 'date-fns';

// ---------- Convenios ----------

export const listConvenios = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const convenios = await db
      .select({
        id: convenio.id,
        clientId: convenio.clienteId,
        profileId: convenio.clienteId,
        nombre: convenio.nombre,
        cctCodigo: convenio.cctCodigo,
        activo: convenio.activo,
        createdAt: convenio.createdAt,
        updatedAt: convenio.updatedAt,
        signatarios: cct.signatarios,
      })
      .from(convenio)
      .leftJoin(
        cct,
        sql`${convenio.cctCodigo} = ${cct.codigo}
          OR ${convenio.cctCodigo} = REGEXP_REPLACE(${cct.codigo}, '^0+', '')
          OR '0' || ${convenio.cctCodigo} = ${cct.codigo}`
      )
      .where(eq(convenio.clienteId, ctx.data.clientId))
      .orderBy(convenio.nombre);

    if (ctx.data.clientId) {
    }

    // Si se pasa profileId, traer solo los CCTs de ese perfil; si no, traer todos del cliente.
    const afipRows = await db
      .select({
        cct: clienteCct.cctCodigo,
        updatedAt: clienteCct.updatedAt,
      })
      .from(clienteCct)
      .where(eq(clienteCct.clienteId, ctx.data.clientId));

    const afipByCct = new Map<string, Date>();
    for (const row of afipRows) {
      const cct = extractCctCodigo(row.cct);
      if (!cct) continue;
      const prev = afipByCct.get(cct);
      if (!prev || row.updatedAt > prev) {
        afipByCct.set(cct, row.updatedAt);
      }
    }

    const fuentesConvenioRows = await db
      .select({
        convenioId: convenioFuente.convenioId,
        fuente: convenioFuente.fuente,
      })
      .from(convenioFuente)
      .innerJoin(convenio, eq(convenioFuente.convenioId, convenio.id))
      .where(eq(convenio.clienteId, ctx.data.clientId));

    const fuentesEscalasRows = await db
      .select({
        convenioId: convenioCategoria.convenioId,
        fuente: escalaSalarial.fuente,
      })
      .from(escalaSalarial)
      .innerJoin(
        convenioCategoria,
        eq(escalaSalarial.categoriaId, convenioCategoria.id)
      )
      .innerJoin(convenio, eq(convenioCategoria.convenioId, convenio.id))
      .where(eq(convenio.clienteId, ctx.data.clientId));

    const fuentesByConvenio = new Map<string, Set<string>>();
    for (const row of fuentesConvenioRows) {
      const fuente = row.fuente?.trim();
      if (!fuente) continue;
      const list = fuentesByConvenio.get(row.convenioId) ?? new Set<string>();
      list.add(fuente);
      fuentesByConvenio.set(row.convenioId, list);
    }

    for (const row of fuentesEscalasRows) {
      const fuente = row.fuente?.trim();
      if (!fuente) continue;
      const list = fuentesByConvenio.get(row.convenioId) ?? new Set<string>();
      list.add(fuente);
      fuentesByConvenio.set(row.convenioId, list);
    }

    const mapped = convenios.map((convenio) => {
      const cct = convenio.cctCodigo ?? extractCctCodigo(convenio.nombre);
      const afipUpdatedAt = cct ? (afipByCct.get(cct) ?? null) : null;
      const fuentes = new Set<string>();
      if (afipUpdatedAt) fuentes.add('AFIP');
      for (const fuente of fuentesByConvenio.get(convenio.id) ?? []) {
        fuentes.add(fuente);
      }
      return {
        ...convenio,
        fuentes: Array.from(fuentes),
        afipUpdatedAt,
      };
    });

    // Cuando se filtra por perfil y el perfil tiene CCTs registrados en AFIP,
    // mostrar solo los convenios cuyo código CCT está en afip_empleadores_convenio
    // para ese perfil. Si el perfil no tiene ningún CCT en AFIP, mostrar todos
    // (estado inicial antes del primer scraping).
    if (ctx.data.clientId && afipRows.length > 0) {
      return mapped.filter((c) => c.afipUpdatedAt !== null);
    }

    return mapped;
  });

export const createConvenio = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      nombre: z.string().min(1),
      cctCodigo: z.string().optional(),
      descripcion: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .insert(convenio)
      .values({
        orgId,
        clienteId: ctx.data.clientId,
        nombre: ctx.data.nombre,
        cctCodigo:
          ctx.data.cctCodigo?.trim() || extractCctCodigo(ctx.data.nombre),
        descripcion: ctx.data.descripcion ?? null,
      })
      .returning();
    if (row) {
      await db
        .insert(convenioFuente)
        .values({
          convenioId: row.id,
          fuente: 'MANUAL',
          detalle: 'Creado manualmente desde la UI',
        })
        .onConflictDoNothing();
    }
    return row;
  });

export const updateConvenio = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      clientId: z.string().uuid(),
      nombre: z.string().min(1),
      cctCodigo: z.string().optional(),
      descripcion: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .update(convenio)
      .set({
        nombre: ctx.data.nombre,
        cctCodigo:
          ctx.data.cctCodigo?.trim() || extractCctCodigo(ctx.data.nombre),
        descripcion: ctx.data.descripcion ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(convenio.id, ctx.data.id),
          eq(convenio.clienteId, ctx.data.clientId)
        )
      )
      .returning();
    return row;
  });

export const deleteConvenio = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      clientId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [emp] = await db
      .select({ id: empleado.id })
      .from(empleado)
      .where(eq(empleado.convenioId, ctx.data.id))
      .limit(1);
    if (emp) {
      throw new Error(
        'No se puede eliminar el convenio: tiene empleados asignados. Reasigne o elimine los empleados primero.'
      );
    }
    await db
      .delete(convenio)
      .where(
        and(
          eq(convenio.id, ctx.data.id),
          eq(convenio.clienteId, ctx.data.clientId)
        )
      );
    return { ok: true };
  });

/** Convenios CCT scrapeados desde AFIP (Simplificación Registral - Empleadores). */
export const listConveniosAfipEmpleadores = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const rows = await db
      .select({
        id: clienteCct.id,
        profileId: clienteCct.clienteId,
        cct: cct.codigo,
        actividad: cct.nombre,
        signatarios: cct.signatarios,
        fechaNovedad: clienteCct.fechaNovedad,
        updatedAt: clienteCct.updatedAt,
      })
      .from(clienteCct)
      .innerJoin(cliente, eq(clienteCct.clienteId, cliente.id))
      .leftJoin(cct, eq(clienteCct.cctCodigo, cct.codigo))
      .where(eq(cliente.id, ctx.data.clientId))
      .orderBy(desc(clienteCct.updatedAt));

    // Unificamos por CCT a nivel cliente para no duplicar convenios
    // cuando existen varios perfiles del mismo cliente con el mismo CCT.
    const byCct = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const key = (row.cct ?? '').trim().replace(/\s+/g, ' ');
      if (!byCct.has(key)) byCct.set(key, row);
    }
    return Array.from(byCct.values());
  });

/** Lista conceptos unificados SOS + AFIP por perfil, incluyendo subsistemas. */
export const listConceptosByPerfil = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    // `cliente_concepto` fusiona lo que antes eran tres tablas
    // (lsd_perfil_concepto + concepto_sos_client + payroll_concepto): el perfil
    // LSD, la habilitación del concepto y la configuración propia del cliente.
    return db
      .select({
        afipCodigo: conceptoAfip.codigo,
        afipNombre: conceptoAfip.descripcion,
        codigoContribuyente: clienteConcepto.codigoPropio,
        descripcionContribuyente: clienteConcepto.nombrePropio,
        marcaRepetible: clienteConcepto.repetible,
        codigoSos: concepto.numero,
        nombreSos: concepto.nombre,
        sosVinculadoPerfil: clienteConcepto.habilitado,
        aportesSipa: clienteConcepto.aportesSipa,
        contribucionesSipa: clienteConcepto.contribucionesSipa,
        aportesInssjyp: clienteConcepto.aportesInssjyp,
        contribucionesInssjyp: clienteConcepto.contribucionesInssjyp,
        aportesObraSocial: clienteConcepto.aportesObraSocial,
        contribucionesObraSocial: clienteConcepto.contribucionesObraSocial,
        aportesFsr: clienteConcepto.aportesFsr,
        contribucionesFsr: clienteConcepto.contribucionesFsr,
        aportesRenatea: clienteConcepto.aportesRenatea,
        contribucionesRenatea: clienteConcepto.contribucionesRenatea,
        contribucionesAaff: clienteConcepto.contribucionesAaff,
        contribucionesFne: clienteConcepto.contribucionesFne,
        contribucionesLrt: clienteConcepto.contribucionesLrt,
        aportesDiferenciales: clienteConcepto.aportesDiferenciales,
        aportesEspeciales: clienteConcepto.aportesEspeciales,
        modo: concepto.modo,
        divCantidad: concepto.divCantidad,
        divHsNorm: concepto.divHsNorm,
        tieneCantidad: concepto.usaCantidad,
        tienePct: concepto.usaPct,
        tieneImpConceptoNro: concepto.usaConceptoRef,
        tieneImporte: concepto.usaImporte,
        tieneImpMin: concepto.usaImporteMin,
        tieneImpMax: concepto.usaImporteMax,
      })
      .from(clienteConcepto)
      .innerJoin(concepto, eq(clienteConcepto.conceptoId, concepto.id))
      .innerJoin(conceptoAfip, eq(concepto.codigoAfip, conceptoAfip.codigo))
      .where(eq(clienteConcepto.clienteId, ctx.data.clientId))
      .orderBy(concepto.numero);
  });

/** Lista todos los conceptos del catálogo SOS completo (sin filtrar por perfil). */
export const listTodosConceptosSos = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({
        ...getTableColumns(concepto),
        baseCodigo: baseCalculo.codigo,
      })
      .from(concepto)
      .leftJoin(baseCalculo, eq(concepto.baseCalculoId, baseCalculo.id))
      .where(and(gte(concepto.numero, 1), lte(concepto.numero, 699)))
      .orderBy(concepto.numero);
  }
);

/** Crea un `payroll_convenio` para el cliente a partir del CCT scrapeado desde AFIP. */
export const agregarConvenioDesdeAfipEmpleadores = createServerFn({
  method: 'POST',
})
  .validator(
    z.object({
      clientId: z.string().uuid(),
      afipConvenioId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const [afipRow] = await db
      .select({
        id: clienteCct.id,
        profileId: clienteCct.clienteId,
        cct: cct.codigo,
        actividad: cct.nombre,
        signatarios: cct.signatarios,
        fechaNovedad: clienteCct.fechaNovedad,
      })
      .from(clienteCct)
      .innerJoin(cliente, eq(clienteCct.clienteId, cliente.id))
      .leftJoin(cct, eq(clienteCct.cctCodigo, cct.codigo))
      .where(
        and(
          eq(cliente.id, ctx.data.clientId),
          eq(clienteCct.id, ctx.data.afipConvenioId)
        )
      )
      .limit(1);

    if (!afipRow)
      throw new Error('Convenio AFIP no encontrado o no autorizado');

    const cctCodigo = extractCctCodigo(afipRow.cct);
    const cctNormalizado = cctCodigo ?? afipRow.cct;
    const nombreConvenio = afipRow.actividad?.trim()
      ? afipRow.actividad.trim()
      : `CCT ${cctNormalizado}`;

    const [existing] = await db
      .select({ id: convenio.id })
      .from(convenio)
      .where(
        and(
          eq(convenio.clienteId, ctx.data.clientId),
          eq(convenio.clienteId, afipRow.profileId),
          or(
            afipRow.cct ? eq(convenio.nombre, afipRow.cct) : undefined,
            cctNormalizado ? eq(convenio.nombre, cctNormalizado) : undefined,
            cctCodigo
              ? eq(convenio.cctCodigo, cctCodigo)
              : isNull(convenio.cctCodigo)
          )
        )
      )
      .limit(1);

    if (existing) {
      await db
        .insert(convenioFuente)
        .values({
          convenioId: existing.id,
          fuente: 'AFIP',
          detalle: 'Asociado desde Simplificación Registral - Empleadores',
          lastSyncedAt: new Date(),
        })
        .onConflictDoNothing();
      return {
        ok: true,
        created: false,
        message: 'El cliente ya tiene este convenio (CCT).',
      };
    }

    const [inserted] = await db
      .insert(convenio)
      .values({
        orgId,
        clienteId: afipRow.profileId,
        nombre: nombreConvenio,
        cctCodigo,
      })
      .returning({ id: convenio.id });

    if (!inserted) throw new Error('Error al crear convenio');

    await db
      .insert(convenioFuente)
      .values({
        convenioId: inserted.id,
        fuente: 'AFIP',
        detalle: 'Asociado desde Simplificación Registral - Empleadores',
        lastSyncedAt: new Date(),
      })
      .onConflictDoNothing();

    // Las categorías y escalas deben cargarse manualmente o desde datos reales.
    // No se pre-cargan plantillas hardcodeadas.

    return {
      ok: true,
      created: true,
      convenioId: inserted.id,
    };
  });

// ---------- Categorías por convenio ----------

export const listCategoriasByConvenio = createServerFn({ method: 'GET' })
  .validator(
    z.object({ convenioId: z.string().uuid(), clientId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    return db
      .select()
      .from(convenioCategoria)
      .where(eq(convenioCategoria.convenioId, ctx.data.convenioId))
      .orderBy(convenioCategoria.orden, convenioCategoria.codigo);
  });

export const createCategoria = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      convenioId: z.string().uuid(),
      clientId: z.string().uuid(),
      codigo: z.string().min(1),
      nombre: z.string().min(1),
      orden: z.number().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .insert(convenioCategoria)
      .values({
        convenioId: ctx.data.convenioId,
        codigo: ctx.data.codigo,
        nombre: ctx.data.nombre,
        orden: ctx.data.orden ?? 0,
      })
      .returning();
    return row;
  });

export const updateCategoriaEsValorHora = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      categoriaId: z.string().uuid(),
      clientId: z.string().uuid(),
      esValorHora: z.boolean(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await db
      .update(convenioCategoria)
      .set({ esValorHora: ctx.data.esValorHora })
      .where(eq(convenioCategoria.id, ctx.data.categoriaId));
  });

// ---------- Escalas salariales ----------

export const listEscalasByCategoria = createServerFn({ method: 'GET' })
  .validator(
    z.object({ categoriaId: z.string().uuid(), clientId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    return db
      .select()
      .from(escalaSalarial)
      .where(eq(escalaSalarial.categoriaId, ctx.data.categoriaId))
      .orderBy(desc(escalaSalarial.vigenciaDesde));
  });

/** Elimina una escala salarial. Verifica que pertenezca al cliente vía categoría → convenio. */
export const deleteEscala = createServerFn({ method: 'POST' })
  .validator(
    z.object({ escalaId: z.string().uuid(), clientId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .select({ id: escalaSalarial.id })
      .from(escalaSalarial)
      .innerJoin(
        convenioCategoria,
        eq(escalaSalarial.categoriaId, convenioCategoria.id)
      )
      .innerJoin(convenio, eq(convenioCategoria.convenioId, convenio.id))
      .where(
        and(
          eq(escalaSalarial.id, ctx.data.escalaId),
          eq(convenio.clienteId, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!row) throw new Error('Escala no encontrada o no autorizada');
    await db
      .delete(escalaSalarial)
      .where(eq(escalaSalarial.id, ctx.data.escalaId));
    return { ok: true };
  });

export const upsertEscala = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      categoriaId: z.string().uuid(),
      clientId: z.string().uuid(),
      vigenciaDesde: z.string(), // ISO date
      vigenciaHasta: z.string().optional(),
      montoBasico: z.number().positive(),
      montoNoRemunerativo: z.number().min(0).optional(),
      periodoLabel: z.string().optional(),
      fuente: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .insert(escalaSalarial)
      .values({
        categoriaId: ctx.data.categoriaId,
        vigenciaDesde: ctx.data.vigenciaDesde.slice(0, 10),
        vigenciaHasta: ctx.data.vigenciaHasta?.slice(0, 10) ?? null,
        montoBasico: String(ctx.data.montoBasico),
        montoNoRemunerativo: String(ctx.data.montoNoRemunerativo ?? 0),
        periodoLabel: ctx.data.periodoLabel ?? null,
        fuente: ctx.data.fuente ?? null,
      })
      .returning();
    return row;
  });

/** Normaliza período a YYYY-MM (trim, mes con 2 dígitos). */
function normalizarPeriodoYYYYMM(fechaStr: string): string {
  const t = fechaStr.trim();
  const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(t);
  if (!m) return t;
  const y = m[1];
  const mo = String(m[2]).padStart(2, '0');
  return `${y}-${mo}`;
}

/**
 * `recibo.periodo` es una columna `date` (primer día del mes), así que alcanza
 * con normalizar el texto del UI. El modelo viejo guardaba texto libre y había
 * que buscar variantes ("2026-4" vs "2026-04"); eso ya no puede pasar.
 */
function condicionPeriodoRecibo(periodoCrudo: string) {
  return eq(
    recibo.periodo,
    periodoADate(normalizarPeriodoYYYYMM(periodoCrudo))
  );
}

function cabeceraCampoPagoVacio(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

/** Valores que no aportan dato útil (import LSD / celdas vacías) y deben ceder al legajo o plantilla. */
function cabeceraCampoPagoEfectivamenteVacio(v: unknown): boolean {
  if (cabeceraCampoPagoVacio(v)) return true;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '—' || t === '-' || t === '–') return true;
    const lower = t.toLowerCase();
    if (lower === 'n/a' || lower === 's/d' || lower === 's.d.') return true;
  }
  return false;
}

/**
 * Último recibo del mismo empleado con algún dato de lugar/banco/forma/CBU.
 * Sirve cuando el recibo actual quedó sin cabecera (p. ej. liquidación masiva sin createReciboHeader).
 */
async function obtenerCabeceraPagoPlantilla(
  empleadoId: string,
  excluirReciboId?: string
): Promise<Partial<typeof recibo.$inferSelect>> {
  const conditions = [
    eq(recibo.empleadoId, empleadoId),
    sql`(
      trim(coalesce(${recibo.lugarPago}, '')) <> ''
      or trim(coalesce(${recibo.formaPago}::text, '')) <> ''
      or trim(coalesce(${recibo.cbu}, '')) <> ''
      or trim(coalesce(${recibo.banco}, '')) <> ''
    )`,
  ];
  if (excluirReciboId) {
    conditions.push(ne(recibo.id, excluirReciboId));
  }
  const [row] = await db
    .select({
      fechaPago: recibo.fechaPago,
      lugarPago: recibo.lugarPago,
      formaPago: recibo.formaPago,
      cbu: recibo.cbu,
      banco: recibo.banco,
    })
    .from(recibo)
    .where(and(...conditions))
    .orderBy(desc(recibo.calculadoAt))
    .limit(1);
  return row ?? {};
}

function mergeCabeceraPagoLiquidacion(
  actual: typeof recibo.$inferSelect,
  plantilla: Partial<typeof recibo.$inferSelect>
): typeof recibo.$inferSelect {
  if (!plantilla || Object.keys(plantilla).length === 0) return actual;
  const out = { ...actual };
  if (
    cabeceraCampoPagoEfectivamenteVacio(out.lugarPago) &&
    !cabeceraCampoPagoEfectivamenteVacio(plantilla.lugarPago)
  ) {
    out.lugarPago = plantilla.lugarPago ?? null;
  }
  if (
    cabeceraCampoPagoEfectivamenteVacio(out.banco) &&
    !cabeceraCampoPagoEfectivamenteVacio(plantilla.banco)
  ) {
    out.banco = plantilla.banco ?? null;
  }
  if (
    cabeceraCampoPagoEfectivamenteVacio(out.formaPago) &&
    !cabeceraCampoPagoEfectivamenteVacio(plantilla.formaPago)
  ) {
    out.formaPago = plantilla.formaPago ?? null;
  }
  if (
    cabeceraCampoPagoEfectivamenteVacio(out.cbu) &&
    !cabeceraCampoPagoEfectivamenteVacio(plantilla.cbu)
  ) {
    out.cbu = plantilla.cbu ?? null;
  }
  if (out.fechaPago == null && plantilla.fechaPago != null) {
    out.fechaPago = plantilla.fechaPago;
  }
  return out;
}

type FormaPago = NonNullable<(typeof recibo.$inferSelect)['formaPago']>;

/**
 * Códigos SOS / import: 1=Efectivo, 2=Acreditación, 3=Cheque, 4=Otro → valores
 * del enum `forma_pago`. Lo no reconocido cae a null (la columna es tipada).
 */
function normalizarFormaPagoAlmacenada(
  raw: string | null | undefined
): FormaPago | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === '') return null;
  if (s === '1' || s === 'efectivo') return 'efectivo';
  if (
    s === '2' ||
    s === 'acreditacion' ||
    s === 'acreditación' ||
    s === 'deposito' ||
    s === 'depósito'
  ) {
    return 'deposito';
  }
  if (s === '3' || s === 'cheque') return 'cheque';
  if (s === 'transferencia') return 'transferencia';
  if (s === '4' || s === 'otro' || s === 'otros') return 'efectivo';
  return null;
}

/**
 * Campos de pago guardados en el legajo (`empleado`).
 * El lugar de pago no vive en el legajo: es propio de cada recibo.
 */
function cabeceraPagoDesdeEmpleado(
  empleado: Pick<Empleado, 'formaPago' | 'cbu' | 'banco'>
): Partial<typeof recibo.$inferSelect> {
  const out: Partial<typeof recibo.$inferSelect> = {};
  if (!cabeceraCampoPagoVacio(empleado.formaPago)) {
    out.formaPago = normalizarFormaPagoAlmacenada(empleado.formaPago);
  }
  if (!cabeceraCampoPagoVacio(empleado.cbu)) out.cbu = empleado.cbu;
  if (!cabeceraCampoPagoVacio(empleado.banco)) out.banco = empleado.banco;
  return out;
}

/** Prioridad al crear recibo generado: datos del legajo, luego último recibo con cabecera. */
function mergePagoEmpleadoSobreHistorial(
  empleado: Pick<Empleado, 'formaPago' | 'cbu' | 'banco'>,
  historial: Partial<typeof recibo.$inferSelect>
) {
  const lugarPago = historial.lugarPago ?? null;
  const formaPago = normalizarFormaPagoAlmacenada(
    !cabeceraCampoPagoVacio(empleado.formaPago)
      ? empleado.formaPago
      : historial.formaPago
  );
  const cbu = !cabeceraCampoPagoVacio(empleado.cbu)
    ? empleado.cbu
    : (historial.cbu ?? null);
  const banco = !cabeceraCampoPagoVacio(empleado.banco)
    ? empleado.banco
    : (historial.banco ?? null);
  return {
    fechaPago: historial.fechaPago ?? null,
    lugarPago,
    formaPago,
    cbu,
    banco,
  };
}

/**
 * Si el empleado no tiene categoria_id pero sí convenio y texto de categoría (import LSD),
 * intenta resolver la categoría del convenio por código o nombre.
 */
async function resolveCategoriaIdParaBasico(
  empleado: Pick<Empleado, 'categoriaId' | 'convenioId' | 'categoriaTexto'>
): Promise<string | null> {
  if (empleado.categoriaId) return empleado.categoriaId;
  const convId = empleado.convenioId;
  const texto = empleado.categoriaTexto?.trim();
  if (!convId || !texto) return null;

  const [byCodigo] = await db
    .select({ id: convenioCategoria.id })
    .from(convenioCategoria)
    .where(
      and(
        eq(convenioCategoria.convenioId, convId),
        eq(convenioCategoria.codigo, texto)
      )
    )
    .limit(1);
  if (byCodigo) return byCodigo.id;

  const [byNombre] = await db
    .select({ id: convenioCategoria.id })
    .from(convenioCategoria)
    .where(
      and(
        eq(convenioCategoria.convenioId, convId),
        sql`lower(trim(${convenioCategoria.nombre})) = lower(${texto})`
      )
    )
    .limit(1);
  return byNombre?.id ?? null;
}

/**
 * Si el empleado no tiene convenio asignado, intenta inferirlo desde los convenios del cliente.
 * Regla: si hay un solo convenio para el cliente, usar ese.
 */
async function resolveConvenioIdParaEmpleado(
  empleado: Pick<Empleado, 'convenioId'>,
  profileId: string
): Promise<string | null> {
  if (empleado.convenioId) return empleado.convenioId;
  const convenios = await db
    .select({ id: convenio.id })
    .from(convenio)
    .where(eq(convenio.clienteId, profileId));
  if (convenios.length === 1) return convenios[0]!.id;
  return null;
}

async function getBasicoVigenteInternal(
  categoriaId: string,
  fechaStr: string
): Promise<number> {
  const p = normalizarPeriodoYYYYMM(fechaStr);
  if (!p) return 0;
  const periodo = p.length === 7 ? p : p.substring(0, 7);
  // Comparar por rango de fechas del período (1er y último día del mes) evita
  // corrimientos por timezone al formatear timestamp -> YYYY-MM.
  const [escala] = await db
    .select()
    .from(escalaSalarial)
    .where(
      and(
        eq(escalaSalarial.categoriaId, categoriaId),
        sql`(${escalaSalarial.vigenciaDesde})::date <= (to_date(${periodo} || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date`,
        or(
          isNull(escalaSalarial.vigenciaHasta),
          sql`(${escalaSalarial.vigenciaHasta})::date >= to_date(${periodo} || '-01', 'YYYY-MM-DD')`
        )
      )
    )
    .orderBy(desc(escalaSalarial.vigenciaDesde))
    .limit(1);
  return escala ? Number(escala.montoBasico) : 0;
}

/**
 * Sueldo básico para mostrar en el recibo: override del legajo → escala por categoría
 * (incl. resolución por texto de categoría + convenio) → básico persistido en la liquidación.
 */
async function basicoParaRecibo(
  empleado: Empleado,
  liquidacion: typeof recibo.$inferSelect
): Promise<number> {
  const override =
    empleado.valorSueldo != null ? Number(empleado.valorSueldo) : 0;
  if (!Number.isNaN(override) && override > 0) return override;

  const periodoNorm = normalizarPeriodoYYYYMM(liquidacion.periodo);
  const categoriaId =
    empleado.categoriaId ?? (await resolveCategoriaIdParaBasico(empleado));

  if (categoriaId) {
    const deEscala = await getBasicoVigenteInternal(categoriaId, periodoNorm);
    if (!Number.isNaN(deEscala) && deEscala > 0) return deEscala;
  }

  const persistido =
    liquidacion.basico != null ? Number(liquidacion.basico) : 0;
  return Number.isNaN(persistido) ? 0 : persistido;
}

/** Obtiene el básico vigente para una categoría en una fecha */
export const getBasicoVigente = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      categoriaId: z.string().uuid(),
      fecha: z.string(), // YYYY-MM-DD o YYYY-MM
    })
  )
  .handler(async (ctx) =>
    getBasicoVigenteInternal(ctx.data.categoriaId, ctx.data.fecha)
  );

/**
 * Devuelve el básico de escala salarial vigente para un empleado en un período.
 * Resuelve la cadena: override en legajo → categoría directa → match por texto → 0.
 * No lanza error si no hay escala configurada.
 */
export const getBasicoParaEmpleadoPeriodo = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      importEmpleadoId: z.string().uuid(),
      periodo: z.string(), // YYYY-MM
      clientId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const [emp] = await db
      .select()
      .from(empleado)
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(
          eq(empleado.id, ctx.data.importEmpleadoId),
          eq(cliente.id, ctx.data.clientId)
        )
      )
      .limit(1);

    if (!emp)
      return {
        basico: 0,
        esValorHoraCat: false,
        tipoJornada: 'full_time' as const,
        fechaAlta: null as string | null,
        fechaIngreso: null as string | null,
      };

    const legajo = emp.empleado;

    // Resolver categoría para incluirla siempre en la respuesta
    const categoriaId =
      legajo.categoriaId ?? (await resolveCategoriaIdParaBasico(legajo));

    let categoriaNombre: string | null = null;
    let esExcluidoConvenio = false;
    let esValorHoraCat = false;
    if (categoriaId) {
      const [catRow] = await db
        .select({
          nombre: convenioCategoria.nombre,
          cctCodigo: convenio.cctCodigo,
          esValorHora: convenioCategoria.esValorHora,
        })
        .from(convenioCategoria)
        .leftJoin(convenio, eq(convenio.id, convenioCategoria.convenioId))
        .where(eq(convenioCategoria.id, categoriaId))
        .limit(1);
      categoriaNombre = catRow?.nombre ?? null;
      esExcluidoConvenio = catRow?.cctCodigo === '9999/99';
      esValorHoraCat = catRow?.esValorHora ?? false;
    }

    const periodoNorm = normalizarPeriodoYYYYMM(ctx.data.periodo);

    // 1° prioridad: override manual en el legajo (seteado explícitamente por el usuario)
    const override =
      legajo.valorSueldo != null ? Number(legajo.valorSueldo) : 0;
    if (!Number.isNaN(override) && override > 0) {
      const fechaAltaStr = legajo.fechaAlta ? legajo.fechaAlta : null;
      const fechaIngresoStr = legajo.fechaAlta ? legajo.fechaAlta : null;
      return {
        basico: override,
        categoriaNombre,
        esExcluidoConvenio,
        esValorHoraCat,
        tipoJornada: legajo.tipoJornada ?? 'full_time',
        sinEscalaParaPeriodo: false,
        fallbackPeriodoLabel: null,
        periodoEscalaLabel: null,
        fechaAlta: fechaAltaStr,
        fechaIngreso: fechaIngresoStr,
      };
    }

    // 2° prioridad: escala configurada para el período exacto
    let escalaPeriodo:
      | { monto: string; periodoLabel: string | null }
      | undefined;
    if (categoriaId) {
      const [row] = await db
        .select({
          monto: escalaSalarial.montoBasico,
          periodoLabel: escalaSalarial.periodoLabel,
        })
        .from(escalaSalarial)
        .where(
          and(
            eq(escalaSalarial.categoriaId, categoriaId),
            sql`(${escalaSalarial.vigenciaDesde})::date <= (to_date(${periodoNorm} || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date`,
            or(
              isNull(escalaSalarial.vigenciaHasta),
              sql`(${escalaSalarial.vigenciaHasta})::date >= to_date(${periodoNorm} || '-01', 'YYYY-MM-DD')`
            )
          )
        )
        .orderBy(desc(escalaSalarial.vigenciaDesde))
        .limit(1);
      escalaPeriodo = row;
    }

    const tipoJornada = legajo.tipoJornada ?? 'full_time';

    if (escalaPeriodo) {
      return {
        basico: Number(escalaPeriodo.monto),
        categoriaNombre,
        esExcluidoConvenio,
        esValorHoraCat,
        tipoJornada,
        sinEscalaParaPeriodo: false,
        fallbackPeriodoLabel: null,
        periodoEscalaLabel: escalaPeriodo.periodoLabel,
        fechaAlta: legajo.fechaAlta ? legajo.fechaAlta : null,
        fechaIngreso: legajo.fechaAlta ? legajo.fechaAlta : null,
      };
    }

    const fechaAltaStr2 = legajo.fechaAlta ? legajo.fechaAlta : null;
    const fechaIngresoStr2 = legajo.fechaAlta ? legajo.fechaAlta : null;
    if (!categoriaId)
      return {
        basico: 0,
        categoriaNombre: null,
        esExcluidoConvenio: false,
        esValorHoraCat: false,
        tipoJornada,
        fechaAlta: fechaAltaStr2,
        fechaIngreso: fechaIngresoStr2,
      };

    // 3° prioridad: escala más reciente anterior al período (fallback)
    let basico = 0;
    let sinEscalaParaPeriodo = false;
    let fallbackPeriodoLabel: string | null = null;
    let periodoEscalaLabel: string | null = null;

    const [masReciente] = await db
      .select({
        monto: escalaSalarial.montoBasico,
        periodoLabel: escalaSalarial.periodoLabel,
      })
      .from(escalaSalarial)
      .where(
        and(
          eq(escalaSalarial.categoriaId, categoriaId),
          sql`(${escalaSalarial.vigenciaDesde})::date <= (to_date(${periodoNorm} || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date`
        )
      )
      .orderBy(desc(escalaSalarial.vigenciaDesde))
      .limit(1);
    if (masReciente) {
      basico = Number(masReciente.monto);
      sinEscalaParaPeriodo = true;
      fallbackPeriodoLabel = masReciente.periodoLabel;
      periodoEscalaLabel = masReciente.periodoLabel;
    }

    return {
      basico: Number.isNaN(basico) ? 0 : basico,
      categoriaNombre,
      esExcluidoConvenio,
      esValorHoraCat,
      tipoJornada,
      sinEscalaParaPeriodo,
      fallbackPeriodoLabel,
      periodoEscalaLabel,
      fechaAlta: fechaAltaStr2,
      fechaIngreso: fechaIngresoStr2,
    };
  });

// ---------- Conceptos salariales ----------

export const listConceptos = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    // Los conceptos propios ya no son una tabla aparte: son filas de
    // `cliente_concepto` que configuran un concepto del catálogo global.
    return db
      .select({
        id: clienteConcepto.id,
        numeroSos: concepto.numero,
        codigo: clienteConcepto.codigoPropio,
        nombre: clienteConcepto.nombrePropio,
        tipo: clienteConcepto.tipo,
        modo: clienteConcepto.modo,
        baseCalculoId: clienteConcepto.baseCalculoId,
        importeFijo: clienteConcepto.importeFijo,
        orden: clienteConcepto.orden,
        activo: clienteConcepto.habilitado,
        createdAt: clienteConcepto.createdAt,
        updatedAt: clienteConcepto.updatedAt,
      })
      .from(clienteConcepto)
      .innerJoin(concepto, eq(clienteConcepto.conceptoId, concepto.id))
      .where(eq(clienteConcepto.clienteId, ctx.data.clientId))
      .orderBy(clienteConcepto.orden, concepto.numero);
  });

/** Resuelve el concepto del catálogo global por su número SOS. */
async function conceptoIdPorNumeroSos(numeroSos: number): Promise<string> {
  const [c] = await db
    .select({ id: concepto.id })
    .from(concepto)
    .where(eq(concepto.numero, numeroSos))
    .limit(1);
  if (!c)
    throw new Error(`El concepto SOS ${numeroSos} no está en el catálogo`);
  return c.id;
}

export const createConcepto = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      numeroSos: z.number().int(),
      codigo: z.string().min(1),
      nombre: z.string().min(1),
      tipo: z
        .enum(['remunerativo', 'no_remunerativo', 'descuento', 'retencion'])
        .optional(),
      // Overrides del modo del catálogo. Null/omitido = rigen las reglas del concepto global.
      modo: z
        .enum([
          'importe_manual',
          'pct_sobre_base',
          'pct_sobre_concepto',
          'sueldo_basico',
          'valor_hora',
          'sac',
          'sac_proporcional',
          'dia_vacaciones',
          'promedio_anual_concepto',
        ])
        .optional(),
      baseCalculoId: z.string().uuid().optional(),
      importeFijo: z.number().optional(),
      orden: z.number().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const conceptoId = await conceptoIdPorNumeroSos(ctx.data.numeroSos);
    const campos = {
      codigoPropio: ctx.data.codigo,
      nombrePropio: ctx.data.nombre,
      tipo: ctx.data.tipo ?? null,
      modo: ctx.data.modo ?? null,
      baseCalculoId: ctx.data.baseCalculoId ?? null,
      importeFijo:
        ctx.data.importeFijo != null ? String(ctx.data.importeFijo) : null,
      orden: ctx.data.orden ?? 0,
      habilitado: true,
    };
    const [row] = await db
      .insert(clienteConcepto)
      .values({ orgId, clienteId: ctx.data.clientId, conceptoId, ...campos })
      .onConflictDoUpdate({
        target: [clienteConcepto.clienteId, clienteConcepto.conceptoId],
        set: campos,
      })
      .returning();
    return row;
  });

export const updateConcepto = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      clientId: z.string().uuid(),
      codigo: z.string().min(1).optional(),
      nombre: z.string().min(1).optional(),
      tipo: z
        .enum(['remunerativo', 'no_remunerativo', 'descuento', 'retencion'])
        .nullable()
        .optional(),
      modo: z
        .enum([
          'importe_manual',
          'pct_sobre_base',
          'pct_sobre_concepto',
          'sueldo_basico',
          'valor_hora',
          'sac',
          'sac_proporcional',
          'dia_vacaciones',
          'promedio_anual_concepto',
        ])
        .nullable()
        .optional(),
      baseCalculoId: z.string().uuid().nullable().optional(),
      importeFijo: z.number().nullable().optional(),
      orden: z.number().optional(),
      activo: z.boolean().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const d = ctx.data;
    const [row] = await db
      .update(clienteConcepto)
      .set({
        ...(d.codigo !== undefined ? { codigoPropio: d.codigo } : {}),
        ...(d.nombre !== undefined ? { nombrePropio: d.nombre } : {}),
        ...(d.tipo !== undefined ? { tipo: d.tipo } : {}),
        ...(d.modo !== undefined ? { modo: d.modo } : {}),
        ...(d.baseCalculoId !== undefined
          ? { baseCalculoId: d.baseCalculoId }
          : {}),
        ...(d.importeFijo !== undefined
          ? {
              importeFijo: d.importeFijo != null ? String(d.importeFijo) : null,
            }
          : {}),
        ...(d.orden !== undefined ? { orden: d.orden } : {}),
        ...(d.activo !== undefined ? { habilitado: d.activo } : {}),
      })
      .where(
        and(
          eq(clienteConcepto.id, d.id),
          eq(clienteConcepto.clienteId, d.clientId)
        )
      )
      .returning();
    return row;
  });

export const deleteConcepto = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      clientId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await db
      .delete(clienteConcepto)
      .where(
        and(
          eq(clienteConcepto.id, ctx.data.id),
          eq(clienteConcepto.clienteId, ctx.data.clientId)
        )
      );
    return { ok: true };
  });

// ---------- Empleados ----------

export const listEmpleados = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({
        empleado: empleado,
        convenioNombre: convenio.nombre,
        categoriaNombre: convenioCategoria.nombre,
      })
      .from(empleado)
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .leftJoin(convenio, eq(empleado.convenioId, convenio.id))
      .leftJoin(
        convenioCategoria,
        eq(empleado.categoriaId, convenioCategoria.id)
      )
      .where(
        and(
          eq(cliente.id, ctx.data.clientId),
          eq(empleado.clienteId, ctx.data.clientId)
        )
      )
      .orderBy(empleado.nombre);
    return rows;
  });

/** Empleados importados desde Excel LSD (filtrados por perfil seleccionado). */
export const listImportEmpleados = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({
        empleado: empleado,
        profileName: cliente.razonSocial,
        profileIdentityNumber: cliente.cuit,
        convenioNombre: convenio.nombre,
        categoriaNombre: convenioCategoria.nombre,
        obraSocialNombre: obraSocial.nombre,
        obraSocialCodigo: obraSocial.codigo,
        modalidadNombre: modalidadContratacion.nombre,
        situacionNombre: situacionRevista.nombre,
        zonaNombre: zona.nombre,
        condicionNombre: condicionTrabajador.nombre,
        actividadNombre: actividad.nombre,
        siniestradoNombre: siniestrado.nombre,
        provinciaNombre: provincia.nombre,
      })
      .from(empleado)
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .leftJoin(convenio, eq(empleado.convenioId, convenio.id))
      .leftJoin(
        convenioCategoria,
        eq(empleado.categoriaId, convenioCategoria.id)
      )
      .leftJoin(obraSocial, eq(empleado.obraSocialId, obraSocial.id))
      .leftJoin(
        modalidadContratacion,
        eq(empleado.modalidadContratacionId, modalidadContratacion.id)
      )
      .leftJoin(situacionRevista, eq(empleado.situacionId, situacionRevista.id))
      .leftJoin(zona, eq(empleado.zonaId, zona.id))
      .leftJoin(
        condicionTrabajador,
        eq(empleado.condicionId, condicionTrabajador.id)
      )
      .leftJoin(actividad, eq(empleado.actividadId, actividad.id))
      .leftJoin(siniestrado, eq(empleado.siniestradoId, siniestrado.id))
      .leftJoin(provincia, eq(empleado.provinciaId, provincia.id))
      .where(
        and(
          eq(cliente.id, ctx.data.clientId),
          eq(empleado.clienteId, ctx.data.clientId)
        )
      )
      .orderBy(
        sql`(CASE WHEN ${empleado.legajo} ~ '^[0-9]+$' THEN (${empleado.legajo})::bigint END) NULLS LAST`,
        asc(empleado.nombre)
      );
    return rows;
  });

export const getProfileSueldosConfig = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .select({ usaLsdReferencia: clienteEmpleadorConfig.usaLsdReferencia })
      .from(cliente)
      .where(eq(cliente.id, ctx.data.clientId))
      .limit(1);
    return { usaLsdReferencia: row?.usaLsdReferencia ?? false };
  });

// ── Helpers de normalización (misma lógica que map-import-empleados-a-convenios.ts) ──

function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeCat(value: string): string {
  let t = normalizeText(value);
  t = t.replace(/\bvende?dora?\b/g, 'vendedores');
  t = t.replace(/\badministrativa\b/g, 'administrativo');
  t = t.replace(/\bgerebte\b/g, 'gerente');
  return t.replace(/\s+/g, ' ').trim();
}

function extractCct(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/\b(\d{2,4})\/(\d{2,4})\b/);
  if (!match) return null;
  return `${parseInt(match[1], 10)}/${String(parseInt(match[2], 10)).padStart(2, '0')}`;
}

function scoreCat(
  importCat: string,
  target: { codigo: string; nombre: string }
): number {
  const source = canonicalizeCat(importCat);
  const codigo = canonicalizeCat(target.codigo);
  const nombre = canonicalizeCat(target.nombre);
  if (!source) return 0;
  if (source === codigo || source === nombre) return 1000;
  if (source.includes(nombre)) return 700 + nombre.length;
  if (source.includes(codigo)) return 600 + codigo.length;
  if (nombre.includes(source)) return 500 + source.length;
  const tokens = source.split(' ').filter(Boolean);
  let hits = 0;
  for (const t of tokens) {
    if (t.length >= 3 && (nombre.includes(t) || codigo.includes(t))) hits++;
  }
  return hits * 10;
}

/** Vincula automáticamente convenio y categoría a los empleados del perfil,
 *  usando el CCT del perfil y el texto de categoría del LSD. */
export const sincronizarConveniosEmpleados = createServerFn({ method: 'POST' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    // 1. CCTs del perfil
    const afipRows = await db
      .select({ cct: clienteCct.cctCodigo })
      .from(clienteCct)
      .where(eq(clienteCct.clienteId, ctx.data.clientId));

    const cctSet = new Set(
      afipRows
        .map((r) => extractCct(r.cct))
        .filter((c): c is string => Boolean(c))
    );

    // 2. Convenios del cliente que coinciden con algún CCT del perfil
    const conveniosClient = await db
      .select()
      .from(convenio)
      .where(eq(convenio.clienteId, ctx.data.clientId));

    const conveniosFiltrados =
      cctSet.size > 0
        ? conveniosClient.filter((conv) => {
            const posibles = [conv.cctCodigo, extractCct(conv.nombre)].filter(
              (v): v is string => Boolean(v)
            );
            return posibles.some((c) => cctSet.has(c));
          })
        : conveniosClient; // si no hay CCT registrado, usar todos los del cliente

    if (conveniosFiltrados.length === 0) {
      return {
        actualizados: 0,
        sinMatch: 0,
        mensaje: 'No se encontraron convenios para el perfil',
      };
    }

    // 3. Categorías de cada convenio
    const catsByConvenio = new Map<
      string,
      Array<{ id: string; codigo: string; nombre: string }>
    >();
    for (const conv of conveniosFiltrados) {
      const cats = await db
        .select({
          id: convenioCategoria.id,
          codigo: convenioCategoria.codigo,
          nombre: convenioCategoria.nombre,
        })
        .from(convenioCategoria)
        .where(eq(convenioCategoria.convenioId, conv.id));
      catsByConvenio.set(conv.id, cats);
    }

    // 4. Empleados del perfil sin convenio asignado
    const empleados = await db
      .select()
      .from(empleado)
      .where(
        and(
          eq(empleado.clienteId, ctx.data.clientId),
          isNull(empleado.convenioId)
        )
      );

    let actualizados = 0;
    let sinMatch = 0;

    for (const emp of empleados) {
      const catText = emp.categoriaTexto ?? '';
      let best: {
        convenioId: string;
        categoriaId: string;
        score: number;
      } | null = null;

      for (const conv of conveniosFiltrados) {
        for (const cat of catsByConvenio.get(conv.id) ?? []) {
          const score = scoreCat(catText, cat);
          if (score > 0 && (!best || score > best.score)) {
            best = { convenioId: conv.id, categoriaId: cat.id, score };
          }
        }
      }

      // Fallback: si no hay match o es gerente/sin categoría, usar primera categoría del primer convenio
      if (!best || best.score < 20) {
        const convFallback = conveniosFiltrados[0];
        const catsFallback = catsByConvenio.get(convFallback.id) ?? [];
        const catGerente =
          catsFallback.find((c) => canonicalizeCat(c.nombre) === 'gerente') ??
          catsFallback[0];
        if (!catGerente) {
          sinMatch++;
          continue;
        }
        best = {
          convenioId: convFallback.id,
          categoriaId: catGerente.id,
          score: 0,
        };
      }

      await db
        .update(empleado)
        .set({
          convenioId: best.convenioId,
          categoriaId: best.categoriaId,
          updatedAt: new Date(),
        })
        .where(eq(empleado.id, emp.id));
      actualizados++;
    }

    return {
      actualizados,
      sinMatch,
      mensaje: `${actualizados} empleados vinculados, ${sinMatch} sin match.`,
    };
  });

/** Crea un empleado manualmente en la tabla unificada. */
export const createManualEmpleado = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      cuil: z.string().min(1),
      legajo: z.string().min(1),
      nombre: z.string().min(1),
      fechaAlta: z.string().optional(),
      fechaBaja: z.string().optional(),
      categoria: z.string().optional(),
      tipoJornada: z.enum(['full_time', 'part_time', 'reducida']).optional(),
      convenioId: z.string().uuid().optional(),
      categoriaId: z.string().uuid().optional(),
      formaPago: z
        .enum(['efectivo', 'deposito', 'transferencia', 'cheque'])
        .optional(),
      banco: z.string().optional(),
      cbu: z.string().optional(),
      domicilio: z.string().optional(),
      localidadId: z.string().uuid().optional(),
      codigoPostal: z.string().optional(),
      conyuge: z.number().int().optional(),
      hijos: z.number().int().optional(),
      obraSocialId: z.string().uuid().optional(),
      provinciaId: z.string().uuid().optional(),
      modalidadContratacionId: z.string().uuid().optional(),
      situacionId: z.string().uuid().optional(),
      zonaId: z.string().uuid().optional(),
      condicionId: z.string().uuid().optional(),
      actividadId: z.string().uuid().optional(),
      siniestradoId: z.string().uuid().optional(),
      observaciones: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const defaults = await resolverDefaultsLsd(ctx.data.clientId);
    const [row] = await db
      .insert(empleado)
      .values({
        orgId,
        clienteId: ctx.data.clientId,
        cuil: ctx.data.cuil,
        legajo: ctx.data.legajo,
        nombre: ctx.data.nombre,
        // `fecha_alta` es NOT NULL: sin dato se toma el alta de hoy.
        fechaAlta:
          ctx.data.fechaAlta?.slice(0, 10) ??
          new Date().toISOString().slice(0, 10),
        fechaBaja: ctx.data.fechaBaja?.slice(0, 10) ?? null,
        categoriaTexto: ctx.data.categoria ?? null,
        fuente: 'manual',
        tipoJornada: ctx.data.tipoJornada ?? 'full_time',
        convenioId: ctx.data.convenioId ?? null,
        categoriaId: ctx.data.categoriaId ?? null,
        formaPago: ctx.data.formaPago ?? null,
        banco: ctx.data.banco ?? null,
        cbu: ctx.data.cbu ?? null,
        domicilio: ctx.data.domicilio ?? null,
        localidadId: ctx.data.localidadId ?? null,
        codigoPostal: ctx.data.codigoPostal ?? null,
        conyuge: ctx.data.conyuge ?? 0,
        hijos: ctx.data.hijos ?? 0,
        provinciaId: ctx.data.provinciaId ?? null,
        observaciones: ctx.data.observaciones ?? null,
        situacionId: ctx.data.situacionId ?? defaults.situacionId,
        condicionId: ctx.data.condicionId ?? defaults.condicionId,
        actividadId: ctx.data.actividadId ?? defaults.actividadId,
        siniestradoId: ctx.data.siniestradoId ?? defaults.siniestradoId,
        modalidadContratacionId:
          ctx.data.modalidadContratacionId ?? defaults.modalidadContratacionId,
        zonaId: ctx.data.zonaId ?? defaults.zonaId,
        obraSocialId: ctx.data.obraSocialId ?? defaults.obraSocialId,
      })
      .returning();
    return row;
  });

/** Elimina un empleado creado manualmente (origen = 'manual'). */
export const deleteManualEmpleado = createServerFn({ method: 'POST' })
  .validator(
    z.object({ clientId: z.string().uuid(), empleadoId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const [row] = await db
      .delete(empleado)
      .where(
        and(eq(empleado.id, ctx.data.empleadoId), eq(empleado.fuente, 'manual'))
      )
      .returning();
    if (!row) throw new Error('Empleado no encontrado o no es manual');
    return { ok: true };
  });

/** Empleados del perfil con su configuración de liquidación (solo activos). */
export const listImportEmpleadosConConfig = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const rows = await db
      .select({
        empleado: empleado,
        obraSocialNombre: obraSocial.nombre,
        obraSocialCodigo: obraSocial.codigo,
      })
      .from(empleado)
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .leftJoin(obraSocial, eq(empleado.obraSocialId, obraSocial.id))
      .where(
        and(
          eq(cliente.id, ctx.data.clientId),
          eq(empleado.clienteId, ctx.data.clientId),
          eq(empleado.activo, true)
        )
      )
      .orderBy(
        sql`(CASE WHEN ${empleado.legajo} ~ '^[0-9]+$' THEN (${empleado.legajo})::bigint END) NULLS LAST`,
        asc(empleado.nombre)
      );

    return rows;
  });

/** Recibos importados por período (para selector en solapa Recibo). */
export const listImportRecibosByPeriodo = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({
        recibo: recibo,
        empleadoNombre: empleado.nombre,
        empleadoCuil: empleado.cuil,
        empleadoLegajo: empleado.legajo,
      })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(
          eq(cliente.id, ctx.data.clientId),
          eq(recibo.periodo, periodoADate(ctx.data.periodo))
        )
      )
      .orderBy(asc(empleado.nombre));
    return rows;
  });

/** Último recibo importado del empleado con todos sus conceptos (para la tabla estilo SOS). */
export const getUltimoReciboImportado = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      importEmpleadoId: z.string().uuid(),
      clientId: z.string().uuid(),
      /** Cuando se provee, carga ese recibo específico en lugar del último. */
      liquidacionId: z.string().uuid().optional(),
      /**
       * Período destino (YYYY-MM) para calcular el mejor sueldo del semestre.
       * Si no se provee, se usa el período del último recibo encontrado.
       * Necesario en modo "nuevo recibo" donde el recibo aún no existe.
       */
      periodoSemestre: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const rowQuery = ctx.data.liquidacionId
      ? await db
          .select({ recibo: recibo })
          .from(recibo)
          .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
          .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
          .where(
            and(
              eq(recibo.id, ctx.data.liquidacionId),
              eq(cliente.id, ctx.data.clientId)
            )
          )
          .limit(1)
      : await db
          .select({ recibo: recibo })
          .from(recibo)
          .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
          .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
          .where(
            and(
              eq(recibo.empleadoId, ctx.data.importEmpleadoId),
              eq(cliente.id, ctx.data.clientId)
            )
          )
          .orderBy(desc(recibo.periodo))
          .limit(1);

    const row = rowQuery[0];
    if (!row) return null;

    const conceptos = await db
      .select({
        id: reciboConcepto.id,
        codigo: sql<string>`${concepto.numero}::text`.as('codigo'),
        monto: reciboConcepto.monto,
        cantidad: reciboConcepto.cantidad,
        porcentaje: reciboConcepto.porcentaje,
        importeConceptoNumero: reciboConcepto.conceptoRef,
        importe: reciboConcepto.importe,
        importeMinimo: reciboConcepto.importeMin,
        importeMaximo: reciboConcepto.importeMax,
        memo: reciboConcepto.memo,
        nombre: concepto.nombre,
        codigoAfip: concepto.codigoAfip,
      })
      .from(reciboConcepto)
      .innerJoin(concepto, eq(reciboConcepto.conceptoId, concepto.id))
      .where(eq(reciboConcepto.reciboId, row.recibo.id))
      .orderBy(concepto.numero);

    // Mejor sueldo del semestre — usado por concepto 401 (vacaciones no gozadas) y conceptos 41/42 (SAC).
    // Usa periodoSemestre cuando se provee (modo nuevo recibo) o el período del recibo cargado.
    const periodoParaSemestre =
      ctx.data.periodoSemestre ?? dateAPeriodo(row.recibo.periodo);
    const [rYear, rMonthStr] = periodoParaSemestre.split('-');
    const rMonth = parseInt(rMonthStr, 10);
    const rSemesterStart = rMonth <= 6 ? 1 : 7;
    const rSemesterMonths: string[] = [];
    for (let m = rSemesterStart; m <= rMonth; m++) {
      rSemesterMonths.push(
        periodoADate(`${rYear}-${String(m).padStart(2, '0')}`)
      );
    }
    const rRecibosSemestre = await db
      .select({
        haberes: recibo.haberes,
        noRemunerativo: recibo.noRemunerativo,
      })
      .from(recibo)
      .where(
        and(
          eq(recibo.empleadoId, row.recibo.empleadoId),
          inArray(recibo.periodo, rSemesterMonths),
          eq(recibo.tipo, 'mensual')
        )
      );
    const mejorSueldoSemestre = rRecibosSemestre.reduce((max, r) => {
      const total = (Number(r.haberes) || 0) + (Number(r.noRemunerativo) || 0);
      return total > max ? total : max;
    }, 0);

    return { recibo: row.recibo, conceptos, mejorSueldoSemestre };
  });

/**
 * Todos los conceptos del catálogo SOS completo (conceptos_completos_sos, rangos 1–699),
 * para armar la grilla estilo recibo. Devuelve todos los conceptos sin filtrar por perfil,
 * de modo que cualquier empresa pueda trabajar con cualquier concepto SOS.
 */
export const listConceptosPlantillaManualSos = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      /** Si se pasa, usa el profileId para buscar el empleado de referencia de plantilla. */
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    // Cargar catálogo completo SOS (1-699)
    const rows = await db
      .select()
      .from(concepto)
      .where(and(gte(concepto.numero, 1), lte(concepto.numero, 699)))
      .orderBy(concepto.numero);

    // Buscar el empleado de referencia para la plantilla base (si el perfil tiene uno configurado)
    const refProfileId = ctx.data.clientId ?? ctx.data.clientId;
    const profileRow = await db
      .select({
        plantillaEmpleadoId: clienteEmpleadorConfig.plantillaEmpleadoId,
      })
      .from(clienteEmpleadorConfig)
      .where(eq(clienteEmpleadorConfig.clienteId, refProfileId))
      .then((r) => r[0] ?? null);

    // Mapa de código SOS → valores del empleado de referencia
    const plantillaMap = new Map<
      string,
      {
        cantidad: string | null;
        porcentaje: string | null;
        importeConceptoNumero: string | null;
        importe: string | null;
        importeMinimo: string | null;
        importeMaximo: string | null;
      }
    >();

    if (profileRow?.plantillaEmpleadoId) {
      // Buscar el último recibo del empleado de referencia
      const ultimoReciboRef = await db
        .select({ id: recibo.id })
        .from(recibo)
        .where(eq(recibo.empleadoId, profileRow.plantillaEmpleadoId))
        .orderBy(recibo.periodo)
        .then((r) => r.at(-1) ?? null);

      if (ultimoReciboRef) {
        const conceptosRef = await db
          .select({
            numeroSos: concepto.numero,
            cantidad: reciboConcepto.cantidad,
            porcentaje: reciboConcepto.porcentaje,
            importeConceptoNumero: reciboConcepto.conceptoRef,
            importe: reciboConcepto.importe,
            importeMinimo: reciboConcepto.importeMin,
            importeMaximo: reciboConcepto.importeMax,
          })
          .from(reciboConcepto)
          .innerJoin(concepto, eq(reciboConcepto.conceptoId, concepto.id))
          .where(eq(reciboConcepto.reciboId, ultimoReciboRef.id));

        for (const c of conceptosRef) {
          if (c.numeroSos >= 1 && c.numeroSos <= 699) {
            plantillaMap.set(String(c.numeroSos), {
              cantidad: c.cantidad ?? null,
              porcentaje: c.porcentaje ?? null,
              importeConceptoNumero:
                c.importeConceptoNumero != null
                  ? String(c.importeConceptoNumero)
                  : null,
              importe: c.importe ?? null,
              importeMinimo: c.importeMinimo ?? null,
              importeMaximo: c.importeMaximo ?? null,
            });
          }
        }
      }
    }

    // codigo de la base de cálculo (p.ej. 'sueldo_y_adicionales') para que la UI
    // pueda mostrar/replicar el cálculo sin conocer los uuid.
    const bases = await db
      .select({ id: baseCalculo.id, codigo: baseCalculo.codigo })
      .from(baseCalculo);
    const baseCodigoPorId = new Map(bases.map((b) => [b.id, b.codigo]));

    return rows.map((r) => {
      const codigo = String(r.numero);
      const ref = plantillaMap.get(codigo);
      return {
        id: r.id,
        codigo,
        monto: null as string | null,
        cantidad: ref?.cantidad ?? null,
        porcentaje:
          ref?.porcentaje ??
          ((r.pctFijo != null ? String(r.pctFijo) : null) as string | null),
        importeConceptoNumero: ref?.importeConceptoNumero ?? null,
        importe: ref?.importe ?? null,
        importeMinimo: ref?.importeMinimo ?? null,
        importeMaximo: ref?.importeMaximo ?? null,
        nombre: r.nombre,
        codigoAfip: r.codigoAfip,
        modo: r.modo,
        baseCodigo:
          r.baseCalculoId != null
            ? (baseCodigoPorId.get(r.baseCalculoId) ?? null)
            : null,
        divCantidad: r.divCantidad != null ? Number(r.divCantidad) : null,
        divHsNorm: r.divHsNorm != null ? r.divHsNorm > 0 : null,
        tieneCantidad: r.usaCantidad ?? null,
        tienePct: r.usaPct ?? null,
        tieneImpConceptoNro: r.usaConceptoRef ?? null,
        tieneImporte: r.usaImporte ?? null,
        tieneImpMin: r.usaImporteMin ?? null,
        tieneImpMax: r.usaImporteMax ?? null,
        tieneMemo: r.usaMemo ?? null,
        pctFijo: r.pctFijo != null ? Number(r.pctFijo) : null,
        /** true = concepto activo por defecto en la plantilla base */
        isPlantillaBase: plantillaMap.has(codigo),
      };
    });
  });

/** Detalle de un recibo importado + conceptos LSD. */
export const getImportReciboDetalle = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      reciboId: z.string().uuid(),
      clientId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .select({
        recibo: recibo,
        empleado: empleado,
      })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(eq(recibo.id, ctx.data.reciboId), eq(cliente.id, ctx.data.clientId))
      )
      .limit(1);
    if (!row) throw new Error('Recibo no encontrado o no autorizado');
    const conceptos = await db
      .select({
        ...getTableColumns(reciboConcepto),
        codigo: sql<string>`${concepto.numero}::text`.as('codigo'),
        nombre: concepto.nombre,
        codigoAfip: concepto.codigoAfip,
      })
      .from(reciboConcepto)
      .innerJoin(concepto, eq(reciboConcepto.conceptoId, concepto.id))
      .where(eq(reciboConcepto.reciboId, ctx.data.reciboId))
      .orderBy(concepto.numero);
    return { recibo: row.recibo, empleado: row.empleado, conceptos };
  });

export const listObrasSociales = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({
        id: obraSocial.id,
        codigo: obraSocial.codigo,
        nombre: obraSocial.nombre,
      })
      .from(obraSocial)
      .orderBy(asc(obraSocial.nombre));
  }
);

export const listModalidadesContratacion = createServerFn({
  method: 'GET',
}).handler(async () => {
  await getSessionWithOrg();
  return db
    .select({
      id: modalidadContratacion.id,
      codigo: modalidadContratacion.codigo,
      nombre: modalidadContratacion.nombre,
    })
    .from(modalidadContratacion)
    .orderBy(asc(modalidadContratacion.codigo));
});

export const listSituaciones = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({
        id: situacionRevista.id,
        codigo: situacionRevista.codigo,
        nombre: situacionRevista.nombre,
      })
      .from(situacionRevista)
      .orderBy(asc(situacionRevista.codigo));
  }
);

export const listZonas = createServerFn({ method: 'GET' }).handler(async () => {
  await getSessionWithOrg();
  return db
    .select({ id: zona.id, codigo: zona.codigo, nombre: zona.nombre })
    .from(zona)
    .orderBy(asc(zona.codigo));
});

export const listCondiciones = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({
        id: condicionTrabajador.id,
        codigo: condicionTrabajador.codigo,
        nombre: condicionTrabajador.nombre,
      })
      .from(condicionTrabajador)
      .orderBy(asc(condicionTrabajador.codigo));
  }
);

export const listActividades = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({
        id: actividad.id,
        codigo: actividad.codigo,
        nombre: actividad.nombre,
      })
      .from(actividad)
      .orderBy(asc(actividad.codigo));
  }
);

export const listSiniestrados = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({
        id: siniestrado.id,
        codigo: siniestrado.codigo,
        nombre: siniestrado.nombre,
      })
      .from(siniestrado)
      .orderBy(asc(siniestrado.codigo));
  }
);

export const listProvincias = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({
        id: provincia.id,
        codigo: provincia.codigo,
        nombre: provincia.nombre,
      })
      .from(provincia)
      .orderBy(asc(provincia.nombre));
  }
);

export const listTiposEmpresa = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({
        id: tipoEmpresa.id,
        codigoLsd: tipoEmpresa.codigo,
        nombre: tipoEmpresa.nombre,
      })
      .from(tipoEmpresa)
      .orderBy(asc(tipoEmpresa.codigo));
  }
);

export const getEmpleadorConfig = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .select({
        tipoEmpresaId: clienteEmpleadorConfig.tipoEmpresaId,
        seguroColectivo: clienteEmpleadorConfig.seguroColectivo,
        mipyme: clienteEmpleadorConfig.mipyme,
        ordenCLN: clienteEmpleadorConfig.ordenCln,
        situacionDefaultId: clienteEmpleadorConfig.situacionDefaultId,
        condicionDefaultId: clienteEmpleadorConfig.condicionDefaultId,
        actividadDefaultId: clienteEmpleadorConfig.actividadDefaultId,
        contratacionDefaultId: clienteEmpleadorConfig.modalidadDefaultId,
        siniestradoDefaultId: clienteEmpleadorConfig.siniestradoDefaultId,
        zonaDefaultId: clienteEmpleadorConfig.zonaDefaultId,
        obraSocialDefaultId: clienteEmpleadorConfig.obraSocialDefaultId,
      })
      .from(clienteEmpleadorConfig)
      .where(eq(clienteEmpleadorConfig.clienteId, ctx.data.clientId))
      .limit(1);
    if (!row) throw new Error('Empresa no encontrada');
    return row;
  });

const empleadorConfigSchema = z.object({
  clientId: z.string().uuid(),
  tipoEmpresaId: z.string().uuid().nullable(),
  seguroColectivo: z.boolean(),
  mipyme: z.boolean(),
  ordenCLN: z.enum(['C', 'L', 'N']).nullable(),
  situacionDefaultId: z.string().uuid().nullable(),
  condicionDefaultId: z.string().uuid().nullable(),
  actividadDefaultId: z.string().uuid().nullable(),
  contratacionDefaultId: z.string().uuid().nullable(),
  siniestradoDefaultId: z.string().uuid().nullable(),
  zonaDefaultId: z.string().uuid().nullable(),
  obraSocialDefaultId: z.string().uuid().nullable(),
});

export const updateEmpleadorConfig = createServerFn({ method: 'POST' })
  .validator(empleadorConfigSchema)
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await assertCanWrite(orgId);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const { clientId, ordenCLN, contratacionDefaultId, ...fields } = ctx.data;
    await db
      .update(clienteEmpleadorConfig)
      .set({
        ...fields,
        ordenCln: ordenCLN,
        modalidadDefaultId: contratacionDefaultId,
      })
      .where(eq(clienteEmpleadorConfig.clienteId, clientId));
  });

/** Valores del enum `recibo_tipo`. La UI ya no manda "sueldo"/"SAC"/"despido". */
const tipoReciboReciboSchema = z.enum([
  'mensual',
  'quincenal',
  'sac',
  'liquidacion_final',
  'vacaciones',
  'anticipo',
  'comisiones',
  'fondo_desempleo',
  'otros',
]);

const conceptoEditsSosSchema = z.object({
  codigo: z.string().min(1),
  monto: z.string(),
  cantidad: z.string().optional(),
  porcentaje: z.string().optional(),
  importeConceptoNumero: z.string().optional(),
  importe: z.string().optional(),
  importeMinimo: z.string().optional(),
  importeMaximo: z.string().optional(),
  memo: z.string().optional().nullable(),
});

function numericOrNullForSos(s: string | undefined): string | null {
  const n = parseDecimalSos(s);
  return n === null ? null : n.toFixed(2);
}

const MAX_SOS_PORCENTAJE = 500;

function validateConceptoEditSos(
  c: z.infer<typeof conceptoEditsSosSchema>
): void {
  const code = Number.parseInt(c.codigo, 10);
  if (Number.isNaN(code)) return;

  const pct = parseDecimalSos(c.porcentaje);
  const imp = parseDecimalSos(c.importe);
  const impMin = parseDecimalSos(c.importeMinimo);
  const impMax = parseDecimalSos(c.importeMaximo);

  if (pct != null && pct < 0) {
    throw new Error(`Concepto ${c.codigo}: porcentaje negativo no permitido.`);
  }
  if (pct != null && pct > MAX_SOS_PORCENTAJE) {
    throw new Error(
      `Concepto ${c.codigo}: porcentaje fuera de rango (máximo ${MAX_SOS_PORCENTAJE}%).`
    );
  }
  if (impMin != null && impMax != null && impMin > impMax) {
    throw new Error(
      `Concepto ${c.codigo}: importe mínimo no puede ser mayor a importe máximo.`
    );
  }

  const esRetencionSubBase =
    (code >= 511 && code <= 520) || (code >= 551 && code <= 562);
  if (esRetencionSubBase && (pct ?? 0) > 0) {
    if (imp == null || imp === 0) {
      throw new Error(
        `Concepto ${c.codigo}: para retenciones sobre base dinámica se debe informar importe=1.`
      );
    }
    if (imp > 1) {
      throw new Error(
        `Concepto ${c.codigo}: posible triple-campo (base × % × importe). Usar importe=1.`
      );
    }
  }
}

/**
 * Persiste cabecera y líneas del recibo en liquidacion_import_* a partir de la tabla estilo SOS.
 * Totales = suma de montos liquidados por rango de código (igual que TablaReciboSos).
 * Monto por línea: si hay valor en columna monto, se usa; si no, fórmula SOS (cantidad × %/100 × base) con piso por importe mínimo.
 */
export const guardarReciboDesdeTabla = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      importEmpleadoId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
      tipoRecibo: tipoReciboReciboSchema,
      conceptos: z.array(conceptoEditsSosSchema),
      // Metadata del recibo (opcionales: se usan al crear, se omiten al editar desde "Editar")
      quincena: z.enum(['0', '1', '2']).optional(),
      fechaLiquidacion: z.string().optional(),
      obraSocialId: z.string().uuid().optional().nullable(),
      fechaPago: z.string().optional(),
      lugarPago: z.string().optional().nullable(),
      formaPago: z
        .enum(['efectivo', 'deposito', 'transferencia', 'cheque'])
        .optional(),
      cbu: z.string().optional().nullable(),
      banco: z.string().optional().nullable(),
      periodoCargas: z.string().optional(),
      fechaDepositoCargas: z.string().optional().nullable(),
      observacionInterna: z.string().optional().nullable(),
      observacionRecibo: z.string().optional().nullable(),
      // Situaciones de revista LSD (hasta 3 por período)
      situacionRevista1Id: z.string().uuid().optional().nullable(),
      situacionRevista1DiaInicio: z
        .number()
        .int()
        .min(1)
        .max(31)
        .optional()
        .nullable(),
      situacionRevista2Id: z.string().uuid().optional().nullable(),
      situacionRevista2DiaInicio: z
        .number()
        .int()
        .min(1)
        .max(31)
        .optional()
        .nullable(),
      situacionRevista3Id: z.string().uuid().optional().nullable(),
      situacionRevista3DiaInicio: z
        .number()
        .int()
        .min(1)
        .max(31)
        .optional()
        .nullable(),
      // Datos complementarios LSD
      diasTrabajados: z.number().int().min(0).max(31).optional().nullable(),
      horasTrabajadas: z.number().int().min(0).optional().nullable(),
      importeMaternidadArt13: z.string().optional().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('No se puede liquidar períodos futuros.');
    }

    const [empRow] = await db
      .select({ id: empleado.id })
      .from(empleado)
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(
          eq(empleado.id, ctx.data.importEmpleadoId),
          eq(empleado.clienteId, ctx.data.clientId),
          eq(cliente.id, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!empRow) {
      throw new Error(
        'Empleado de importación no encontrado o no pertenece al perfil'
      );
    }

    const editsRow = (c: z.infer<typeof conceptoEditsSosSchema>) => ({
      monto: c.monto ?? '',
      cantidad: c.cantidad ?? '',
      porcentaje: c.porcentaje ?? '',
      importeConceptoNumero: c.importeConceptoNumero ?? '',
      importe: c.importe ?? '',
      importeMinimo: c.importeMinimo ?? '',
      importeMaximo: c.importeMaximo ?? '',
    });

    const montoByCodigo: Record<string, number> = {};
    for (const c of ctx.data.conceptos) {
      validateConceptoEditSos(c);
      montoByCodigo[c.codigo] = montoLiquidadoDesdeEditsSos(editsRow(c));
    }
    const t = totalesReciboSosDesdeMontos(montoByCodigo);
    const conceptoIds = await mapaConceptoIdPorNumero(
      ctx.data.conceptos.map((c) => c.codigo)
    );

    const haberesStr = t.haberes.toFixed(2);
    const noRemStr = t.noRemunerativo.toFixed(2);
    const descStr = t.descuentos.toFixed(2);
    const retStr = t.retenciones.toFixed(2);
    const netoStr = t.neto.toFixed(2);

    const reciboId = await db.transaction(async (tx) => {
      const lockKey = `sos-recibo:${ctx.data.importEmpleadoId}:${ctx.data.periodo}:${ctx.data.tipoRecibo}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

      // El filtro por fuente es obligatorio: sin él, liquidar un período que ya
      // tiene un recibo importado del SOS lo pisaba y le daba vuelta la fuente.
      const [existing] = await tx
        .select({ id: recibo.id })
        .from(recibo)
        .where(
          and(
            eq(recibo.empleadoId, ctx.data.importEmpleadoId),
            eq(recibo.periodo, periodoADate(ctx.data.periodo)),
            eq(recibo.tipo, ctx.data.tipoRecibo),
            eq(recibo.fuente, 'calculo')
          )
        )
        .limit(1);

      // Campos de metadata opcionales (presentes cuando viene del formulario nuevo,
      // ausentes cuando viene del flujo "Editar" — en ese caso no se sobreescriben).
      const hasMeta = !!ctx.data.fechaLiquidacion;
      const metaFields = hasMeta
        ? {
            quincena: Number(ctx.data.quincena ?? '0'),
            fecha: ctx.data.fechaLiquidacion!.slice(0, 10),
            obraSocialId: ctx.data.obraSocialId ?? null,
            fechaPago: ctx.data.fechaPago?.slice(0, 10) ?? null,
            lugarPago: ctx.data.lugarPago ?? null,
            formaPago: ctx.data.formaPago ?? 'efectivo',
            cbu: ctx.data.cbu ?? null,
            banco: ctx.data.banco ?? null,
            periodoCargas: ctx.data.periodoCargas
              ? periodoADate(ctx.data.periodoCargas)
              : null,
            fechaDepositoCargas:
              ctx.data.fechaDepositoCargas?.slice(0, 10) ?? null,
            observacionInterna: ctx.data.observacionInterna ?? null,
            observacionRecibo: ctx.data.observacionRecibo ?? null,
            situacionRevista1Id: ctx.data.situacionRevista1Id ?? null,
            situacionRevista1DiaInicio:
              ctx.data.situacionRevista1DiaInicio ?? null,
            situacionRevista2Id: ctx.data.situacionRevista2Id ?? null,
            situacionRevista2DiaInicio:
              ctx.data.situacionRevista2DiaInicio ?? null,
            situacionRevista3Id: ctx.data.situacionRevista3Id ?? null,
            situacionRevista3DiaInicio:
              ctx.data.situacionRevista3DiaInicio ?? null,
            diasTrabajados: ctx.data.diasTrabajados ?? null,
            horasTrabajadas: ctx.data.horasTrabajadas ?? null,
            importeMaternidadArt13: ctx.data.importeMaternidadArt13 ?? null,
            fuente: 'calculo' as const,
          }
        : {};

      let rid: string;
      if (existing) {
        await tx
          .update(recibo)
          .set({
            haberes: haberesStr,
            noRemunerativo: noRemStr,
            descuentos: descStr,
            retenciones: retStr,
            neto: netoStr,
            ...metaFields,
          })
          .where(eq(recibo.id, existing.id));
        rid = existing.id;
      } else {
        const [ins] = await tx
          .insert(recibo)
          .values({
            orgId,
            clienteId: ctx.data.clientId,
            empleadoId: ctx.data.importEmpleadoId,
            periodo: periodoADate(ctx.data.periodo),
            tipo: ctx.data.tipoRecibo,
            haberes: haberesStr,
            noRemunerativo: noRemStr,
            descuentos: descStr,
            retenciones: retStr,
            neto: netoStr,
            ...metaFields,
          })
          .returning({ id: recibo.id });
        if (!ins) throw new Error('No se pudo crear el recibo');
        rid = ins.id;
      }

      await tx.delete(reciboConcepto).where(eq(reciboConcepto.reciboId, rid));

      for (const c of ctx.data.conceptos) {
        const liq = montoLiquidadoDesdeEditsSos(editsRow(c));
        const pctUsado = parseDecimalSos(c.porcentaje);
        const baseUsada =
          parseDecimalSos(c.importeConceptoNumero) ??
          parseDecimalSos(c.importe);
        await tx.insert(reciboConcepto).values({
          reciboId: rid,
          conceptoId: conceptoIdRequerido(conceptoIds, c.codigo),
          monto: liq.toFixed(2),
          cantidad: numericOrNullForSos(c.cantidad),
          porcentaje: numericOrNullForSos(c.porcentaje),
          conceptoRef: conceptoRefOrNull(c.importeConceptoNumero),
          importe: numericOrNullForSos(c.importe),
          importeMin: numericOrNullForSos(c.importeMinimo),
          importeMax: numericOrNullForSos(c.importeMaximo),
          pctUsado: pctUsado != null ? String(pctUsado) : null,
          baseUsada: baseUsada != null ? String(baseUsada) : null,
          memo: c.memo?.trim() || null,
        });
      }

      return rid;
    });

    return { reciboId, periodo: ctx.data.periodo };
  });

/** Crea cabecera en payroll_liquidacion (metadata del recibo: fechas, obra social, pago). */
export const createReciboHeader = createServerFn({ method: 'POST' })
  .validator(
    z
      .object({
        clientId: z.string().uuid(),
        importEmpleadoId: z.string().uuid(),
        periodo: z.string().regex(/^\d{4}-\d{2}$/),
        tipoRecibo: tipoReciboReciboSchema,
        quincena: z.enum(['0', '1', '2']),
        fechaLiquidacion: z.string().min(1),
        obraSocialId: z.string().uuid().optional().nullable(),
        fechaPago: z.string().min(1),
        lugarPago: z.string().optional().nullable(),
        formaPago: z.enum(['efectivo', 'deposito', 'transferencia', 'cheque']),
        cbu: z.string().optional().nullable(),
        banco: z.string().optional().nullable(),
        periodoCargas: z.string().min(1),
        fechaDepositoCargas: z.string().optional().nullable(),
        observacionInterna: z.string().optional().nullable(),
        observacionRecibo: z.string().optional().nullable(),
        copiarUltimoRecibo: z.boolean(),
      })
      .superRefine((data, ctx) => {
        if (data.formaPago === 'deposito') {
          const c = (data.cbu ?? '').replace(/\D/g, '');
          if (c.length < 22) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                'CBU obligatorio (22 dígitos) si la forma de pago es acreditación',
              path: ['cbu'],
            });
          }
        }
      })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('No se puede liquidar períodos futuros.');
    }

    const [empConfig] = await db
      .select({ id: empleado.id, convenioId: empleado.convenioId })
      .from(empleado)
      .where(eq(empleado.id, ctx.data.importEmpleadoId))
      .limit(1);
    if (!empConfig?.convenioId) {
      throw new Error(
        'Este empleado no tiene configuración de liquidación. Asigná convenio y categoría primero.'
      );
    }

    const empleadoId = empConfig.id;

    await db
      .delete(recibo)
      .where(
        and(
          eq(recibo.empleadoId, empleadoId),
          eq(recibo.periodo, periodoADate(ctx.data.periodo))
        )
      );

    let basico = '0';
    let haberes = '0';
    let noRemunerativo = '0';
    let descuentos = '0';
    let neto = '0';

    let prevId: string | null = null;
    if (ctx.data.copiarUltimoRecibo) {
      const [prev] = await db
        .select()
        .from(recibo)
        .where(
          and(
            eq(recibo.empleadoId, empleadoId),
            eq(recibo.tipo, ctx.data.tipoRecibo)
          )
        )
        .orderBy(desc(recibo.calculadoAt))
        .limit(1);
      if (prev) {
        prevId = prev.id;
        basico = String(prev.basico ?? '0');
        haberes = String(prev.haberes);
        noRemunerativo = String(prev.noRemunerativo);
        descuentos = String(prev.descuentos);
        neto = String(prev.neto);
      }
    }

    const fechaLiq = ctx.data.fechaLiquidacion.slice(0, 10);
    const fechaPago = ctx.data.fechaPago.slice(0, 10);
    const fechaDep = ctx.data.fechaDepositoCargas?.slice(0, 10) ?? null;

    const [liq] = await db
      .insert(recibo)
      .values({
        orgId,
        clienteId: ctx.data.clientId,
        empleadoId,
        periodo: periodoADate(ctx.data.periodo),
        basico,
        haberes,
        noRemunerativo,
        descuentos,
        retenciones: '0',
        neto,
        tipo: ctx.data.tipoRecibo,
        quincena: Number(ctx.data.quincena),
        fecha: fechaLiq,
        obraSocialId: ctx.data.obraSocialId ?? null,
        fechaPago,
        lugarPago: ctx.data.lugarPago?.trim() || null,
        formaPago: ctx.data.formaPago,
        cbu: ctx.data.cbu?.trim() || null,
        banco: ctx.data.banco?.trim() || null,
        periodoCargas: periodoADate(ctx.data.periodoCargas),
        fechaDepositoCargas: fechaDep,
        observacionInterna: ctx.data.observacionInterna?.trim() || null,
        observacionRecibo: ctx.data.observacionRecibo?.trim() || null,
        confirmado: false,
        fuente: 'calculo',
      })
      .returning();

    if (!liq) throw new Error('No se pudo crear la cabecera del recibo');

    if (prevId) {
      const detallesPrev = await db
        .select()
        .from(reciboConcepto)
        .where(eq(reciboConcepto.reciboId, prevId));
      for (const d of detallesPrev) {
        await db.insert(reciboConcepto).values({
          reciboId: liq.id,
          conceptoId: d.conceptoId,
          tipo: d.tipo,
          monto: String(d.monto),
          cantidad: d.cantidad != null ? String(d.cantidad) : null,
          porcentaje: d.porcentaje,
          conceptoRef: d.conceptoRef,
          importe: d.importe,
          importeMin: d.importeMin,
          importeMax: d.importeMax,
          activo: d.activo,
          memo: d.memo,
        });
      }
    }

    return {
      liquidacionId: liq.id,
      importEmpleadoId: ctx.data.importEmpleadoId,
      periodo: ctx.data.periodo,
    };
  });

export const createEmpleado = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      nombre: z.string().min(1),
      apellido: z.string().min(1),
      cuilCuil: z.string().min(1),
      fechaIngreso: z.string(),
      convenioId: z.string().uuid(),
      categoriaId: z.string().uuid(),
      tipoJornada: z.enum(['full_time', 'part_time', 'reducida']).optional(),
      legajo: z.string().optional().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const profileId = ctx.data.clientId;
    const cuilNorm =
      String(ctx.data.cuilCuil).trim().replace(/\D/g, '').slice(-11) ||
      ctx.data.cuilCuil.trim();
    const nombreCompleto = `${ctx.data.nombre} ${ctx.data.apellido}`.trim();
    const legajo = normalizeLegajo(ctx.data.legajo);
    const tipoJornada = ctx.data.tipoJornada ?? 'full_time';
    const fechaIngreso = ctx.data.fechaIngreso.slice(0, 10);

    const importEmpleadoId = await upsertLiquidacionEmpleadoForPayrollRow({
      orgId,
      profileId,
      cuil: cuilNorm,
      nombreCompleto,
      legajo,
      fechaAlta: fechaIngreso,
      origen: 'manual',
      convenioId: ctx.data.convenioId,
      categoriaId: ctx.data.categoriaId,
      tipoJornada,
      activo: true,
    });

    const [row] = await db
      .select()
      .from(empleado)
      .where(eq(empleado.id, importEmpleadoId))
      .limit(1);
    return row;
  });

/** Carga masiva de empleados. convenioNombre y categoriaCodigo se resuelven a IDs del cliente. */
export const createEmpleadosMasivo = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      empleados: z.array(
        z.object({
          apellido: z.string().min(1),
          nombre: z.string().min(1),
          cuilCuil: z.string().min(1),
          fechaIngreso: z.string(),
          convenioNombre: z.string().min(1),
          categoriaCodigo: z.string().min(1),
          tipoJornada: z
            .enum(['full_time', 'part_time', 'reducida'])
            .optional(),
        })
      ),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const profileId = ctx.data.clientId;

    const convenios = await db
      .select()
      .from(convenio)
      .where(
        and(
          eq(convenio.clienteId, ctx.data.clientId),
          ctx.data.clientId
            ? eq(convenio.clienteId, ctx.data.clientId)
            : undefined
        )
      );
    const convenioByName = new Map(
      convenios.map((c) => [c.nombre.trim().toLowerCase(), c] as const)
    );
    const categoriasByConvenio = new Map<
      string,
      { id: string; codigo: string }[]
    >();
    for (const c of convenios) {
      const cats = await db
        .select({
          id: convenioCategoria.id,
          codigo: convenioCategoria.codigo,
        })
        .from(convenioCategoria)
        .where(eq(convenioCategoria.convenioId, c.id));
      categoriasByConvenio.set(c.id, cats);
    }

    const created: number[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < ctx.data.empleados.length; i++) {
      const e = ctx.data.empleados[i];
      const convenio = convenioByName.get(
        e.convenioNombre.trim().toLowerCase()
      );
      if (!convenio) {
        errors.push({
          row: i + 2,
          message: `Convenio no encontrado: "${e.convenioNombre}"`,
        });
        continue;
      }
      const categorias = categoriasByConvenio.get(convenio.id) ?? [];
      const categoria = categorias.find(
        (c) =>
          c.codigo.trim().toLowerCase() ===
          e.categoriaCodigo.trim().toLowerCase()
      );
      if (!categoria) {
        errors.push({
          row: i + 2,
          message: `Categoría no encontrada: "${e.categoriaCodigo}" en convenio ${convenio.nombre}`,
        });
        continue;
      }
      try {
        const cuilNorm =
          String(e.cuilCuil).trim().replace(/\D/g, '').slice(-11) ||
          e.cuilCuil.trim();
        const tipoJornada = e.tipoJornada ?? 'full_time';
        const fechaIngreso = e.fechaIngreso.slice(0, 10);
        const nombreCompleto = `${e.nombre.trim()} ${e.apellido.trim()}`.trim();

        await upsertLiquidacionEmpleadoForPayrollRow({
          orgId,
          profileId,
          cuil: cuilNorm,
          nombreCompleto,
          legajo: '',
          fechaAlta: fechaIngreso,
          origen: 'import',
          convenioId: convenio.id,
          categoriaId: categoria.id,
          tipoJornada,
          activo: true,
        });

        created.push(i + 2);
      } catch (err) {
        errors.push({
          row: i + 2,
          message: err instanceof Error ? err.message : 'Error al insertar',
        });
      }
    }

    return { created: created.length, errors };
  });

export const updateEmpleado = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      clientId: z.string().uuid(),
      nombre: z.string().min(1).optional(),
      apellido: z.string().min(1).optional(),
      cuilCuil: z.string().optional(),
      fechaAlta: z.string().optional(),
      fechaIngreso: z.string().optional(),
      convenioId: z.string().uuid().optional(),
      categoriaId: z.string().uuid().optional(),
      categoria: z.string().optional().nullable(),
      tipoJornada: z.enum(['full_time', 'part_time', 'reducida']).optional(),
      activo: z.boolean().optional(),
      legajo: z.string().optional().nullable(),
      lugarPago: z.string().optional().nullable(),
      formaPago: z.string().optional().nullable(),
      cbu: z.string().optional().nullable(),
      banco: z.string().optional().nullable(),
      // Domicilio y familia
      domicilio: z.string().optional().nullable(),
      localidad: z.string().optional().nullable(),
      codigoPostal: z.string().optional().nullable(),
      conyuge: z.number().int().optional().nullable(),
      hijos: z.number().int().optional().nullable(),
      adherentes: z.number().int().optional().nullable(),
      // Obra social
      obraSocialId: z.string().uuid().optional().nullable(),
      // Códigos auxiliares (texto legacy)
      codigoModalidadContratacion: z.string().optional().nullable(),
      codigoSituacion: z.string().optional().nullable(),
      codigoZona: z.string().optional().nullable(),
      codigoCondicion: z.string().optional().nullable(),
      codigoActividad: z.string().optional().nullable(),
      codigoSiniestrado: z.string().optional().nullable(),
      // FK a catálogos
      modalidadContratacionId: z.string().uuid().optional().nullable(),
      situacionId: z.string().uuid().optional().nullable(),
      zonaId: z.string().uuid().optional().nullable(),
      condicionId: z.string().uuid().optional().nullable(),
      actividadId: z.string().uuid().optional().nullable(),
      siniestradoId: z.string().uuid().optional().nullable(),
      provinciaId: z.string().uuid().optional().nullable(),
      observaciones: z.string().optional().nullable(),
      valorSueldo: z.string().optional().nullable(),
      fechaBaja: z.string().optional().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    // Verify employee belongs to cliente via profile
    const [empCheck] = await db
      .select({ id: empleado.id })
      .from(empleado)
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(eq(empleado.id, ctx.data.id), eq(cliente.id, ctx.data.clientId))
      )
      .limit(1);
    if (!empCheck) throw new Error('Empleado no encontrado o no autorizado');

    const set: Record<string, unknown> = { updatedAt: new Date() };
    const {
      nombre,
      apellido,
      cuilCuil,
      fechaAlta,
      fechaIngreso,
      convenioId,
      categoriaId,
      categoria,
      tipoJornada,
      activo,
      legajo,
      lugarPago,
      formaPago,
      cbu,
      banco,
      domicilio,
      localidad,
      codigoPostal,
      conyuge,
      hijos,
      adherentes,
      obraSocialId,
      codigoModalidadContratacion,
      codigoSituacion,
      codigoZona,
      codigoCondicion,
      codigoActividad,
      codigoSiniestrado,
      modalidadContratacionId,
      situacionId,
      zonaId,
      condicionId,
      actividadId,
      siniestradoId,
      provinciaId,
      observaciones,
      valorSueldo,
      fechaBaja,
    } = ctx.data;
    // Combine nombre + apellido into nombre field if both provided
    if (nombre && apellido) {
      set.nombre = `${nombre} ${apellido}`.trim();
    } else if (nombre) {
      set.nombre = nombre;
    }
    if (cuilCuil !== undefined) set.cuil = cuilCuil;
    if (fechaAlta) set.fechaAlta = parseISO(fechaAlta);
    if (fechaIngreso) set.fechaIngreso = parseISO(fechaIngreso);
    if (convenioId !== undefined) set.convenioId = convenioId;
    if (categoriaId !== undefined) set.categoriaId = categoriaId;
    if (categoria !== undefined) set.categoria = categoria?.trim() || null;
    if (tipoJornada !== undefined) set.tipoJornada = tipoJornada;
    if (activo !== undefined) set.activo = activo;
    if (legajo !== undefined) set.legajo = normalizeLegajo(legajo);
    if (lugarPago !== undefined) set.lugarPago = lugarPago?.trim() || null;
    if (formaPago !== undefined) set.formaPago = formaPago?.trim() || null;
    if (cbu !== undefined) set.cbu = cbu?.trim() || null;
    if (banco !== undefined) set.banco = banco?.trim() || null;
    if (domicilio !== undefined) set.domicilio = domicilio?.trim() || null;
    if (localidad !== undefined) set.localidad = localidad?.trim() || null;
    if (codigoPostal !== undefined)
      set.codigoPostal = codigoPostal?.trim() || null;
    if (conyuge !== undefined) set.conyuge = conyuge;
    if (hijos !== undefined) set.hijos = hijos;
    if (adherentes !== undefined) set.adherentes = adherentes;
    if (obraSocialId !== undefined) set.obraSocialId = obraSocialId;
    if (codigoModalidadContratacion !== undefined)
      set.codigoModalidadContratacion =
        codigoModalidadContratacion?.trim() || null;
    if (codigoSituacion !== undefined)
      set.codigoSituacion = codigoSituacion?.trim() || null;
    if (codigoZona !== undefined) set.codigoZona = codigoZona?.trim() || null;
    if (codigoCondicion !== undefined)
      set.codigoCondicion = codigoCondicion?.trim() || null;
    if (codigoActividad !== undefined)
      set.codigoActividad = codigoActividad?.trim() || null;
    if (codigoSiniestrado !== undefined)
      set.codigoSiniestrado = codigoSiniestrado?.trim() || null;
    if (modalidadContratacionId !== undefined)
      set.modalidadContratacionId = modalidadContratacionId;
    if (situacionId !== undefined) set.situacionId = situacionId;
    if (zonaId !== undefined) set.zonaId = zonaId;
    if (condicionId !== undefined) set.condicionId = condicionId;
    if (actividadId !== undefined) set.actividadId = actividadId;
    if (siniestradoId !== undefined) set.siniestradoId = siniestradoId;
    if (provinciaId !== undefined) set.provinciaId = provinciaId;
    if (observaciones !== undefined)
      set.observaciones = observaciones?.trim() || null;
    if (valorSueldo !== undefined)
      set.valorSueldo =
        valorSueldo != null && valorSueldo.trim() !== ''
          ? valorSueldo.trim()
          : null;
    if (fechaBaja !== undefined)
      set.fechaBaja = fechaBaja ? new Date(fechaBaja) : null;

    const [row] = await db
      .update(empleado)
      .set(set)
      .where(eq(empleado.id, ctx.data.id))
      .returning();
    return row;
  });

export const deleteEmpleado = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().uuid(),
      clientId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    // Verify employee belongs to cliente via profile
    const [empCheck] = await db
      .select({ id: empleado.id })
      .from(empleado)
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(eq(empleado.id, ctx.data.id), eq(cliente.id, ctx.data.clientId))
      )
      .limit(1);
    if (!empCheck) throw new Error('Empleado no encontrado o no autorizado');

    await db
      .update(empleado)
      .set({ activo: false, updatedAt: new Date() })
      .where(eq(empleado.id, ctx.data.id));
    return { ok: true };
  });

// ---------- Cálculo y liquidación ----------

type DetalleResult = {
  detalleId?: string;
  conceptoId: string;
  monto: number;
  cantidad?: number;
  pct?: number;
  importeOverride?: number;
  conceptoNombre: string;
  conceptoCodigo: string;
  conceptoTipo: 'remunerativo' | 'no_remunerativo' | 'descuento' | 'retencion';
  /** Cómo se determinó el importe (modo del catálogo o del override del cliente). */
  modo: (typeof concepto.modo.enumValues)[number];
  baseUsada?: number;
  pctUsado?: number;
  calcError?: string;
  montoSource: 'calculo' | 'importe_fijo' | 'override' | 'sos_override';
};

/** Lógica interna: calcula y persiste una liquidación (empleadoId + periodo, clientId ya autorizado) */
async function calcularUnaLiquidacion(
  empleadoId: string,
  periodo: string,
  clientId: string,
  opts?: {
    liquidacionId?: string;
    tipoRecibo?: z.infer<typeof tipoReciboReciboSchema>;
    /** Monto override por número SOS (key = número del concepto del catálogo, como string) */
    conceptoSosOverrides?: Record<string, number>;
  }
): Promise<{
  liquidacion: typeof recibo.$inferSelect;
  detalles: DetalleResult[];
  totalRemunerativo: number;
  totalNoRemunerativo: number;
  totalDescuentos: number;
  totalRetenciones: number;
  neto: number;
}> {
  const [emp] = await db
    .select({
      id: empleado.id,
      orgId: empleado.orgId,
      categoriaId: empleado.categoriaId,
      fechaAlta: empleado.fechaAlta,
      clientId: empleado.clienteId,
      convenioId: empleado.convenioId,
      categoriaTexto: empleado.categoriaTexto,
      formaPago: empleado.formaPago,
      cbu: empleado.cbu,
      banco: empleado.banco,
    })
    .from(empleado)
    .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
    .where(and(eq(empleado.id, empleadoId), eq(cliente.id, clientId)))
    .limit(1);
  if (!emp) throw new Error('Empleado no encontrado');

  const convenioIdResuelto = await resolveConvenioIdParaEmpleado(
    emp,
    emp.clientId
  );
  const categoriaIdResuelta = await resolveCategoriaIdParaBasico({
    ...emp,
    convenioId: convenioIdResuelto,
  });

  if (!convenioIdResuelto) {
    throw new Error(
      'No se pudo resolver el convenio del empleado. Verificá que la empresa tenga un único convenio activo o asigná convenio en el legajo.'
    );
  }
  if (!categoriaIdResuelta) {
    throw new Error(
      'No se pudo resolver la categoría del empleado para el convenio asignado. Revisá categoría del legajo y mapeo de categorías del convenio.'
    );
  }

  // Backfill para que próximos cálculos no dependan de inferencia.
  if (!emp.convenioId || !emp.categoriaId) {
    await db
      .update(empleado)
      .set({
        convenioId: convenioIdResuelto,
        categoriaId: categoriaIdResuelta,
      })
      .where(eq(empleado.id, empleadoId));
  }

  const basico = await getBasicoVigenteInternal(categoriaIdResuelta, periodo);

  // El catálogo de conceptos es global (`concepto`); lo que el cliente configura
  // (orden, importe fijo, mínimos, nombre propio) vive en `cliente_concepto`. Las
  // líneas del recibo apuntan al catálogo, así que `id` acá es el del concepto.
  // El modo/base del cliente pisa al del catálogo solo si no es null.
  const conceptos = await db
    .select({
      id: concepto.id,
      numeroSos: concepto.numero,
      nombre: sql<string>`coalesce(${clienteConcepto.nombrePropio}, ${concepto.nombre})`,
      codigo: sql<string>`coalesce(${clienteConcepto.codigoPropio}, ${concepto.numero}::text)`,
      tipo: sql<
        (typeof concepto.tipo.enumValues)[number]
      >`coalesce(${clienteConcepto.tipo}, ${concepto.tipo})`,
      modo: sql<
        (typeof concepto.modo.enumValues)[number]
      >`coalesce(${clienteConcepto.modo}, ${concepto.modo})`,
      baseCalculoId: sql<
        string | null
      >`coalesce(${clienteConcepto.baseCalculoId}, ${concepto.baseCalculoId})`,
      importeFijo: clienteConcepto.importeFijo,
      pctFijo: concepto.pctFijo,
      orden: clienteConcepto.orden,
      activo: clienteConcepto.habilitado,
      impMin: clienteConcepto.importeMin,
      impMax: clienteConcepto.importeMax,
    })
    .from(clienteConcepto)
    .innerJoin(concepto, eq(clienteConcepto.conceptoId, concepto.id))
    .where(eq(clienteConcepto.clienteId, clientId))
    .orderBy(clienteConcepto.orden, concepto.numero);

  // Qué conceptos integran cada base de cálculo (membership explícita, ex rangos SOS).
  const membershipRows = await db
    .select({
      baseId: baseCalculoConcepto.baseCalculoId,
      conceptoId: baseCalculoConcepto.conceptoId,
    })
    .from(baseCalculoConcepto);
  const basesDelConcepto = new Map<string, string[]>();
  for (const m of membershipRows) {
    const arr = basesDelConcepto.get(m.conceptoId);
    if (arr) arr.push(m.baseId);
    else basesDelConcepto.set(m.conceptoId, [m.baseId]);
  }

  // Leer inputs existentes del recibo (si ya fue calculado antes)
  type InputRow = {
    id: string;
    conceptoId: string;
    cantidad: string | null;
    porcentaje: string | null;
    conceptoRef: number | null;
    /** Importe forzado a mano para la línea (antes `importe_override`). */
    importe: string | null;
    importeMin: string | null;
    importeMax: string | null;
    activo: boolean;
    memo: string | null;
  };
  let inputsPrevios: InputRow[] = [];
  let liqExistente: typeof recibo.$inferSelect | null = null;

  if (opts?.liquidacionId) {
    const [existing] = await db
      .select()
      .from(recibo)
      .where(
        and(
          eq(recibo.id, opts.liquidacionId),
          eq(recibo.empleadoId, empleadoId),
          eq(recibo.periodo, periodoADate(periodo))
        )
      )
      .limit(1);
    if (!existing) {
      throw new Error(
        'Liquidación no encontrada o no coincide con empleado y período'
      );
    }
    liqExistente = existing;
    inputsPrevios = await db
      .select({
        id: reciboConcepto.id,
        conceptoId: reciboConcepto.conceptoId,
        cantidad: reciboConcepto.cantidad,
        porcentaje: reciboConcepto.porcentaje,
        conceptoRef: reciboConcepto.conceptoRef,
        importe: reciboConcepto.importe,
        importeMin: reciboConcepto.importeMin,
        importeMax: reciboConcepto.importeMax,
        activo: reciboConcepto.activo,
        memo: reciboConcepto.memo,
      })
      .from(reciboConcepto)
      .where(eq(reciboConcepto.reciboId, opts.liquidacionId));
  }

  const inputMap = new Map(inputsPrevios.map((r) => [r.conceptoId, r]));

  const detalles: DetalleResult[] = [];
  let totalRemunerativo = 0;
  let totalNoRemunerativo = 0;
  let totalDescuentos = 0;
  let totalRetenciones = 0;

  // Suma corriente de cada base de cálculo: cuando una línea se liquida, su
  // monto se agrega a todas las bases que ese concepto integra (membership
  // explícita en base_calculo_concepto). Un pct_sobre_base toma la suma
  // acumulada HASTA su posición en el orden del recibo — por eso el orden de
  // los conceptos importa igual que en el recibo impreso.
  const sumaPorBase = new Map<string, number>();
  // Monto liquidado por número de concepto, para pct_sobre_concepto / promedio_anual_concepto.
  const montoPorNumero = new Map<number, number>();

  // Datos históricos que piden los modos especiales (solo se consultan si hace falta).
  const modosActivos = new Set(
    conceptos.filter((c) => c.activo).map((c) => c.modo)
  );
  const [anioNum, mesNum] = periodo.split('-').map(Number);
  const inicioSemestre = mesNum <= 6 ? `${anioNum}-01` : `${anioNum}-07`;

  // SAC: mejor remuneración mensual del semestre (art. 121/122 LCT).
  let mejorRemSemestre = 0;
  if (modosActivos.has('sac') || modosActivos.has('sac_proporcional')) {
    const [row] = await db
      .select({ max: sql<string | null>`max(${recibo.haberes})` })
      .from(recibo)
      .where(
        and(
          eq(recibo.empleadoId, empleadoId),
          gte(recibo.periodo, periodoADate(inicioSemestre)),
          lte(recibo.periodo, periodoADate(periodo))
        )
      );
    mejorRemSemestre = row?.max != null ? Number(row.max) : 0;
  }

  // SAC proporcional: meses trabajados dentro del semestre (desde el alta si es posterior al inicio).
  let mesesSemestre = 6;
  if (modosActivos.has('sac_proporcional')) {
    const mesInicioSem = mesNum <= 6 ? 1 : 7;
    let desde = mesInicioSem;
    if (emp.fechaAlta) {
      const altaAnio = Number(emp.fechaAlta.slice(0, 4));
      const altaMes = Number(emp.fechaAlta.slice(5, 7));
      if (altaAnio === anioNum && altaMes > mesInicioSem) desde = altaMes;
      if (altaAnio > anioNum) desde = mesNum + 1; // alta futura: 0 meses
    }
    mesesSemestre = Math.min(6, Math.max(0, mesNum - desde + 1));
  }

  // Día de vacaciones: bruto del mes anterior / 25 (art. 155 LCT).
  let brutoMesAnterior = 0;
  if (modosActivos.has('dia_vacaciones')) {
    const periodoAnterior =
      mesNum === 1
        ? `${anioNum - 1}-12`
        : `${anioNum}-${String(mesNum - 1).padStart(2, '0')}`;
    const [row] = await db
      .select({ haberes: recibo.haberes, noRem: recibo.noRemunerativo })
      .from(recibo)
      .where(
        and(
          eq(recibo.empleadoId, empleadoId),
          eq(recibo.periodo, periodoADate(periodoAnterior)),
          eq(recibo.tipo, 'mensual')
        )
      )
      .orderBy(desc(recibo.neto))
      .limit(1);
    brutoMesAnterior = row
      ? Number(row.haberes ?? 0) + Number(row.noRem ?? 0)
      : 0;
  }

  const conceptosOrdenados = [...conceptos].sort(
    (a, b) => (a.orden ?? 0) - (b.orden ?? 0)
  );

  // Validación: conceptos 1 (Sueldo Básico mensual) y 2 (Horas Normales) son mutuamente excluyentes.
  const conceptosActivosEnRecibo = conceptosOrdenados.filter((c) => {
    if (!c.activo) return false;
    const input = inputMap.get(c.id);
    return !(input && !input.activo);
  });
  const tieneConcepto1 = conceptosActivosEnRecibo.some(
    (c) => c.numeroSos === 1
  );
  const tieneConcepto2 = conceptosActivosEnRecibo.some(
    (c) => c.numeroSos === 2
  );
  if (tieneConcepto1 && tieneConcepto2) {
    throw new Error(
      'Conflicto de conceptos: no se pueden usar "Sueldo Básico" (concepto 1) y "Horas Normales" (concepto 2) al mismo tiempo. Desactivá uno de los dos.'
    );
  }

  for (const con of conceptosOrdenados) {
    if (!con.activo) continue;
    const input = inputMap.get(con.id);

    if (input && !input.activo) continue;

    const cantidad =
      input?.cantidad != null ? Number(input.cantidad) : undefined;
    const importeConceptoN = input?.conceptoRef ?? 0;
    const rowImpMin =
      input?.importeMin != null
        ? Number(input.importeMin)
        : con.impMin != null
          ? Number(con.impMin)
          : null;
    const rowImpMax =
      input?.importeMax != null
        ? Number(input.importeMax)
        : con.impMax != null
          ? Number(con.impMax)
          : null;

    // % de la línea: el ingresado en el recibo pisa al fijo del catálogo.
    const porcentaje =
      input?.porcentaje != null
        ? Number(input.porcentaje)
        : con.pctFijo != null
          ? Number(con.pctFijo)
          : 0;

    let monto = 0;

    let calcError: string | undefined;
    let montoSource: DetalleResult['montoSource'] = 'calculo';
    if (input?.importe != null) {
      monto = Number(input.importe);
      montoSource = 'override';
    } else {
      switch (con.modo) {
        case 'importe_manual':
          // Sin importe en la línea ni default del cliente, la línea no aparece.
          if (con.importeFijo != null) {
            monto = roundMoney(Number(con.importeFijo));
            montoSource = 'importe_fijo';
          }
          break;
        case 'sueldo_basico':
          // Concepto 1: el sueldo mensual de la escala/legajo.
          monto = roundMoney(basico);
          break;
        case 'valor_hora':
          // Concepto 2 (Horas Normales): la escala de la categoría es valor/hora.
          monto = roundMoney(basico * (cantidad ?? 0));
          break;
        case 'pct_sobre_base': {
          if (con.baseCalculoId == null) {
            calcError = `Concepto ${con.numeroSos}: pct_sobre_base sin base de cálculo asignada`;
            break;
          }
          // La cantidad multiplica cuando la línea la trae (ej. antigüedad:
          // base × 1% × años). Sin cantidad, multiplicador 1.
          const baseMonto = sumaPorBase.get(con.baseCalculoId) ?? 0;
          monto = roundMoney((porcentaje / 100) * baseMonto * (cantidad ?? 1));
          break;
        }
        case 'pct_sobre_concepto': {
          if (!importeConceptoN) {
            calcError = `Concepto ${con.numeroSos}: falta el concepto de referencia`;
            break;
          }
          const refMonto = montoPorNumero.get(importeConceptoN) ?? 0;
          monto = roundMoney((porcentaje / 100) * refMonto * (cantidad ?? 1));
          break;
        }
        case 'sac': {
          // Mejor remuneración mensual del semestre / 2 (art. 121 LCT).
          const candidato = Math.max(mejorRemSemestre, totalRemunerativo);
          monto = roundMoney(candidato / 2);
          break;
        }
        case 'sac_proporcional': {
          const candidato = Math.max(mejorRemSemestre, totalRemunerativo);
          monto = roundMoney((candidato / 2) * (mesesSemestre / 6));
          break;
        }
        case 'dia_vacaciones': {
          // Bruto del mes anterior / 25 × días (art. 155 LCT). Sin recibo
          // anterior, usa lo remunerativo liquidado hasta acá en este recibo.
          const base =
            brutoMesAnterior > 0
              ? brutoMesAnterior
              : totalRemunerativo + totalNoRemunerativo;
          monto = roundMoney((base / 25) * (cantidad ?? 0));
          break;
        }
        case 'promedio_anual_concepto': {
          // Línea de referencia / 12 (ex concepto_401_div12: SAC s/vacaciones no gozadas).
          if (!importeConceptoN) {
            calcError = `Concepto ${con.numeroSos}: falta el concepto de referencia`;
            break;
          }
          const refMonto = montoPorNumero.get(importeConceptoN) ?? 0;
          monto = roundMoney(refMonto / 12);
          break;
        }
      }
    }

    if (
      opts?.conceptoSosOverrides &&
      con.numeroSos != null &&
      input?.importe == null
    ) {
      const key = String(con.numeroSos);
      const override = opts.conceptoSosOverrides[key];
      if (override != null && !isNaN(override)) {
        monto = roundMoney(override);
        montoSource = 'sos_override';
      }
    }

    if (rowImpMin != null && monto < rowImpMin) monto = rowImpMin;
    if (rowImpMax != null && monto > rowImpMax) monto = rowImpMax;

    if (monto === 0) continue;

    detalles.push({
      conceptoId: con.id,
      monto,
      cantidad,
      pct: porcentaje !== 0 ? porcentaje : undefined,
      importeOverride:
        input?.importe != null ? Number(input.importe) : undefined,
      conceptoNombre: con.nombre,
      conceptoCodigo: con.codigo,
      conceptoTipo: con.tipo,
      modo: con.modo,
      baseUsada: input?.conceptoRef ?? undefined,
      pctUsado: porcentaje !== 0 ? porcentaje : undefined,
      calcError,
      montoSource,
    });

    montoPorNumero.set(con.numeroSos, monto);
    // La línea integra sus bases de cálculo (solo rem/no-rem tienen membership).
    for (const baseId of basesDelConcepto.get(con.id) ?? []) {
      sumaPorBase.set(baseId, (sumaPorBase.get(baseId) ?? 0) + monto);
    }

    if (con.tipo === 'remunerativo') {
      totalRemunerativo += monto;
    } else if (con.tipo === 'no_remunerativo') {
      totalNoRemunerativo += monto;
    } else if (con.tipo === 'retencion') {
      totalRetenciones += monto;
    } else {
      totalDescuentos += monto;
    }
  }

  const bruto = totalRemunerativo + totalNoRemunerativo;
  const neto = roundMoney(bruto - totalDescuentos - totalRetenciones);

  // Persistir: borrar detalles viejos y reinsertar con inputs preservados
  const persistDetalles = async (reciboId: string) => {
    await db
      .delete(reciboConcepto)
      .where(eq(reciboConcepto.reciboId, reciboId));
    for (const d of detalles) {
      const input = inputMap.get(d.conceptoId);
      await db.insert(reciboConcepto).values({
        reciboId,
        conceptoId: d.conceptoId,
        tipo: d.conceptoTipo,
        monto: String(d.monto),
        cantidad: d.cantidad != null ? String(d.cantidad) : null,
        porcentaje: input?.porcentaje ?? null,
        conceptoRef: input?.conceptoRef ?? null,
        importe: input?.importe ?? null,
        importeMin: input?.importeMin ?? null,
        importeMax: input?.importeMax ?? null,
        activo: input?.activo ?? true,
        memo:
          d.calcError != null
            ? `${input?.memo ? `${input.memo} | ` : ''}calc_error=${d.calcError}`
            : (input?.memo ?? null),
        pctUsado: d.pctUsado != null ? String(d.pctUsado) : null,
        baseUsada: d.baseUsada != null ? String(d.baseUsada) : null,
      });
    }
  };

  if (liqExistente) {
    await db
      .update(recibo)
      .set({
        basico: String(basico),
        haberes: String(totalRemunerativo),
        noRemunerativo: String(totalNoRemunerativo),
        descuentos: String(totalDescuentos),
        retenciones: String(totalRetenciones),
        neto: String(neto),
        calculadoAt: new Date(),
      })
      .where(eq(recibo.id, liqExistente.id));

    await persistDetalles(liqExistente.id);

    const [liq] = await db
      .select()
      .from(recibo)
      .where(eq(recibo.id, liqExistente.id))
      .limit(1);

    return {
      liquidacion: liq!,
      detalles,
      totalRemunerativo,
      totalNoRemunerativo,
      totalDescuentos,
      totalRetenciones,
      neto,
    };
  }

  const tipoRecibo = opts?.tipoRecibo ?? 'mensual';

  /** Si ya hay un recibo generado (p. ej. cabecera de createReciboHeader), actualizar totales sin perder fecha/OS/CBU. */
  const [reciboGeneradoExistente] = await db
    .select()
    .from(recibo)
    .where(
      and(
        eq(recibo.empleadoId, empleadoId),
        eq(recibo.periodo, periodoADate(periodo)),
        eq(recibo.fuente, 'calculo'),
        eq(recibo.tipo, tipoRecibo)
      )
    )
    .limit(1);

  if (reciboGeneradoExistente) {
    await db
      .update(recibo)
      .set({
        basico: String(basico),
        haberes: String(totalRemunerativo),
        noRemunerativo: String(totalNoRemunerativo),
        descuentos: String(totalDescuentos),
        retenciones: String(totalRetenciones),
        neto: String(neto),
        calculadoAt: new Date(),
      })
      .where(eq(recibo.id, reciboGeneradoExistente.id));

    await persistDetalles(reciboGeneradoExistente.id);

    const [liq] = await db
      .select()
      .from(recibo)
      .where(eq(recibo.id, reciboGeneradoExistente.id))
      .limit(1);

    return {
      liquidacion: liq!,
      detalles,
      totalRemunerativo,
      totalNoRemunerativo,
      totalDescuentos,
      totalRetenciones,
      neto,
    };
  }

  await db
    .delete(recibo)
    .where(
      and(
        eq(recibo.empleadoId, empleadoId),
        eq(recibo.periodo, periodoADate(periodo)),
        eq(recibo.fuente, 'calculo'),
        eq(recibo.tipo, tipoRecibo)
      )
    );

  const plantillaHistorialRecibo =
    await obtenerCabeceraPagoPlantilla(empleadoId);
  const pagoNuevo = mergePagoEmpleadoSobreHistorial(
    emp,
    plantillaHistorialRecibo
  );

  const [liq] = await db
    .insert(recibo)
    .values({
      orgId: emp.orgId,
      clienteId: emp.clientId,
      empleadoId,
      periodo: periodoADate(periodo),
      basico: String(basico),
      haberes: String(totalRemunerativo),
      noRemunerativo: String(totalNoRemunerativo),
      descuentos: String(totalDescuentos),
      retenciones: String(totalRetenciones),
      neto: String(neto),
      tipo: tipoRecibo,
      fuente: 'calculo',
      fechaPago: pagoNuevo.fechaPago,
      lugarPago: pagoNuevo.lugarPago,
      formaPago: pagoNuevo.formaPago,
      cbu: pagoNuevo.cbu,
      banco: pagoNuevo.banco,
    })
    .returning();

  if (liq) await persistDetalles(liq.id);

  return {
    liquidacion: liq,
    detalles,
    totalRemunerativo,
    totalNoRemunerativo,
    totalDescuentos,
    totalRetenciones,
    neto,
  };
}

/** Calcula una liquidación para un empleado en un período */
export const calcularLiquidacion = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      importEmpleadoId: z.string().uuid(),
      periodo: z.string(), // YYYY-MM
      /** Si se creó cabecera con createReciboHeader, pasar para conservar metadata del recibo */
      liquidacionId: z.string().uuid().optional(),
      /** Debe coincidir con el recibo generado (mismo tipo que en createReciboHeader). */
      tipoRecibo: tipoReciboReciboSchema.optional(),
      /**
       * Overrides de monto por número SOS (key = numeroSos del payrollConcepto, como string).
       * Cuando se proporciona, el monto calculado por fórmula se reemplaza con el valor de este mapa.
       * Útil para último recibo importado o carga manual sobre la plantilla de conceptos del cliente.
       */
      conceptoSosOverrides: z.record(z.string(), z.number()).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('No se puede liquidar períodos futuros.');
    }
    const [empConfig] = await db
      .select({ id: empleado.id })
      .from(empleado)
      .where(eq(empleado.id, ctx.data.importEmpleadoId))
      .limit(1);
    if (!empConfig) throw new Error('Empleado no encontrado');
    return calcularUnaLiquidacion(
      empConfig.id,
      ctx.data.periodo,
      ctx.data.clientId,
      {
        ...(ctx.data.liquidacionId
          ? { liquidacionId: ctx.data.liquidacionId }
          : {}),
        ...(ctx.data.tipoRecibo ? { tipoRecibo: ctx.data.tipoRecibo } : {}),
        ...(ctx.data.conceptoSosOverrides
          ? { conceptoSosOverrides: ctx.data.conceptoSosOverrides }
          : {}),
      }
    );
  });

export type LiquidacionMasivaErrorCode =
  | 'NO_CONVENIO'
  | 'NO_CATEGORIA'
  | 'PERIODO_INVALIDO'
  | 'EMPLEADO_NO_ENCONTRADO'
  | 'YA_GENERADO'
  | 'OTRO';

function mapLiquidacionMasivaErrorCode(
  message: string
): LiquidacionMasivaErrorCode {
  const m = message.toLowerCase();
  if (
    m.includes('no se pudo resolver el convenio') ||
    m.includes('no tiene configuración de liquidación')
  ) {
    return 'NO_CONVENIO';
  }
  if (m.includes('no se pudo resolver la categoría')) {
    return 'NO_CATEGORIA';
  }
  if (m.includes('solo se puede liquidar el mes anterior')) {
    return 'PERIODO_INVALIDO';
  }
  if (m.includes('empleado no encontrado')) {
    return 'EMPLEADO_NO_ENCONTRADO';
  }
  return 'OTRO';
}

/** Liquidación masiva: calcula para todos los empleados activos del período del cliente */
export const calcularLiquidacionMasiva = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      periodo: z.string(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [profileCfg] = await db
      .select({ usaLsdReferencia: clienteEmpleadorConfig.usaLsdReferencia })
      .from(cliente)
      .where(eq(cliente.id, ctx.data.clientId))
      .limit(1);
    const usaLsdReferencia = profileCfg?.usaLsdReferencia ?? false;
    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('No se puede liquidar períodos futuros.');
    }
    const empleados = await db
      .select({
        id: empleado.id,
        nombre: empleado.nombre,
        legajo: empleado.legajo,
      })
      .from(empleado)
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(
          eq(cliente.id, ctx.data.clientId),
          eq(empleado.clienteId, ctx.data.clientId),
          eq(empleado.activo, true)
        )
      );
    const recibosGenerados = await db
      .select({
        empleadoId: recibo.empleadoId,
      })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(
          eq(cliente.id, ctx.data.clientId),
          eq(empleado.clienteId, ctx.data.clientId),
          eq(recibo.periodo, periodoADate(ctx.data.periodo)),
          eq(recibo.tipo, 'mensual'),
          ...(usaLsdReferencia ? [eq(recibo.fuente, 'calculo')] : [])
        )
      );
    const generadosSet = new Set(recibosGenerados.map((r) => r.empleadoId));
    const results: {
      empleadoId: string;
      empleadoNombre: string;
      legajo: string;
      ok: boolean;
      skipped?: boolean;
      errorCode?: LiquidacionMasivaErrorCode;
      error?: string;
    }[] = [];
    for (const e of empleados) {
      if (generadosSet.has(e.id)) {
        results.push({
          empleadoId: e.id,
          empleadoNombre: e.nombre,
          legajo: e.legajo,
          ok: true,
          skipped: true,
          errorCode: 'YA_GENERADO',
          error: 'Ya existe recibo generado para este período. Se omite.',
        });
        continue;
      }
      try {
        await calcularUnaLiquidacion(e.id, ctx.data.periodo, ctx.data.clientId);
        results.push({
          empleadoId: e.id,
          empleadoNombre: e.nombre,
          legajo: e.legajo,
          ok: true,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Error desconocido';
        results.push({
          empleadoId: e.id,
          empleadoNombre: e.nombre,
          legajo: e.legajo,
          ok: false,
          errorCode: mapLiquidacionMasivaErrorCode(message),
          error: message,
        });
      }
    }
    const ok = results.filter((r) => r.ok).length;
    const fail = results.length - ok;
    const skipped = results.filter((r) => r.skipped).length;
    return {
      summary: { total: results.length, ok, fail, skipped },
      results,
    };
  });

/** Elimina todas las liquidaciones generadas del período para el cliente. Los detalles se eliminan en cascada. */
export const eliminarLiquidacionesDelPeriodo = createServerFn({
  method: 'POST',
})
  .validator(z.object({ clientId: z.string().uuid(), periodo: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({ id: recibo.id })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(
          eq(cliente.id, ctx.data.clientId),
          eq(recibo.periodo, periodoADate(ctx.data.periodo)),
          eq(recibo.fuente, 'calculo')
        )
      );
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(recibo).where(inArray(recibo.id, ids));
    }
    return { deleted: ids.length };
  });

/** Elimina una liquidación puntual del cliente. */
export const eliminarLiquidacion = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      liquidacionId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const [row] = await db
      .select({ id: recibo.id })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(
          eq(recibo.id, ctx.data.liquidacionId),
          eq(cliente.id, ctx.data.clientId)
        )
      )
      .limit(1);

    if (!row) {
      throw new Error('Liquidación no encontrada para este cliente.');
    }

    await db.delete(recibo).where(eq(recibo.id, ctx.data.liquidacionId));

    return { ok: true };
  });

/** Actualiza los inputs editables de una fila de detalle (cantidad, pct, importeOverride, etc.) */
export const updateDetalleInputs = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      detalleId: z.string().uuid(),
      cantidad: z.number().nullable().optional(),
      pct: z.number().nullable().optional(),
      importeConceptoN: z.number().nullable().optional(),
      importeOverride: z.number().nullable().optional(),
      impMin: z.number().nullable().optional(),
      impMax: z.number().nullable().optional(),
      activoEnRecibo: z.boolean().optional(),
      memo: z.string().nullable().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Verificar que el detalle pertenece a un empleado del cliente autorizado
    const [row] = await db
      .select({ clientId: cliente.id })
      .from(reciboConcepto)
      .innerJoin(recibo, eq(reciboConcepto.reciboId, recibo.id))
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(eq(reciboConcepto.id, ctx.data.detalleId))
      .limit(1);
    const resolvedClientId = row?.clientId;
    if (!resolvedClientId) throw new Error('Detalle no encontrado');
    await ensureClientBelongsToOrg(resolvedClientId, orgId);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (ctx.data.cantidad !== undefined)
      update.cantidad =
        ctx.data.cantidad != null ? String(ctx.data.cantidad) : null;
    if (ctx.data.pct !== undefined)
      update.porcentaje = ctx.data.pct != null ? String(ctx.data.pct) : null;
    if (ctx.data.importeConceptoN !== undefined)
      update.importeConceptoNumero =
        ctx.data.importeConceptoN != null
          ? String(ctx.data.importeConceptoN)
          : null;
    if (ctx.data.importeOverride !== undefined)
      update.importeOverride =
        ctx.data.importeOverride != null
          ? String(ctx.data.importeOverride)
          : null;
    if (ctx.data.impMin !== undefined)
      update.importeMinimo =
        ctx.data.impMin != null ? String(ctx.data.impMin) : null;
    if (ctx.data.impMax !== undefined)
      update.importeMaximo =
        ctx.data.impMax != null ? String(ctx.data.impMax) : null;
    if (ctx.data.activoEnRecibo !== undefined)
      update.activoEnRecibo = ctx.data.activoEnRecibo;
    if (ctx.data.memo !== undefined) update.memo = ctx.data.memo;

    await db
      .update(reciboConcepto)
      .set(update)
      .where(eq(reciboConcepto.id, ctx.data.detalleId));

    return { ok: true };
  });

/**
 * Recibos del período para el cliente seleccionado.
 * Multi-tenant: solo empleados cuyo perfil pertenece a ese `clientId` (no mezcla empresas en la misma vista).
 * El período se normaliza a `YYYY-MM` y se buscan variantes guardadas en BD (p. ej. `2026-04` vs `2026-4`).
 */
export const listLiquidacionesByPeriodo = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      periodo: z.string(),
      clientId: z.string().uuid(),
      /** Si true, solo devuelve liquidaciones con recibo confirmado (para solapa Recibo) */
      soloRecibosConfirmados: z.boolean().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const conditions = [
      condicionPeriodoRecibo(ctx.data.periodo),
      eq(cliente.id, ctx.data.clientId),
      eq(empleado.clienteId, ctx.data.clientId),
      ...(ctx.data.soloRecibosConfirmados ? [eq(recibo.confirmado, true)] : []),
    ];
    return db
      .select({
        liquidacion: recibo,
        empleado: empleado,
      })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(and(...conditions))
      .orderBy(
        sql`(CASE WHEN ${empleado.legajo} ~ '^[0-9]+$' THEN (${empleado.legajo})::bigint END) NULLS LAST`,
        asc(empleado.nombre)
      );
  });

/**
 * Lista recibos confirmados con filtros opcionales de período y/o empleado.
 * Al menos uno de los dos debe estar presente.
 */
export const listLiquidacionesByFiltros = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        clientId: z.string().uuid(),
        /** Período en formato YYYY-MM (opcional). Mutuamente excluyente con ano+semestre. */
        periodo: z.string().optional(),
        /** ID de liquidacion_import_empleado (opcional). */
        importEmpleadoId: z.string().uuid().optional(),
        /** Año en formato YYYY — requerido cuando se filtra por semestre. */
        ano: z.string().optional(),
        /** 1 = enero–junio, 2 = julio–diciembre. Requiere `ano`. */
        semestre: z.number().int().min(1).max(2).optional(),
      })
      .refine((d) => d.periodo || d.importEmpleadoId || (d.ano && d.semestre), {
        message: 'Se requiere al menos período, empleado, o año + semestre',
      })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const conditions = [
      eq(cliente.id, ctx.data.clientId),
      eq(empleado.clienteId, ctx.data.clientId),
      eq(recibo.fuente, 'calculo'),
    ];
    if (ctx.data.periodo) {
      const cond = condicionPeriodoRecibo(ctx.data.periodo);
      if (cond) conditions.push(cond);
    } else if (ctx.data.ano && ctx.data.semestre) {
      const meses =
        ctx.data.semestre === 1
          ? ['01', '02', '03', '04', '05', '06']
          : ['07', '08', '09', '10', '11', '12'];
      conditions.push(
        inArray(
          recibo.periodo,
          meses.map((m) => periodoADate(`${ctx.data.ano}-${m}`))
        )
      );
    }
    if (ctx.data.importEmpleadoId) {
      conditions.push(eq(empleado.id, ctx.data.importEmpleadoId));
    }
    return db
      .select({
        liquidacion: recibo,
        empleado: empleado,
      })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(and(...conditions))
      .orderBy(
        desc(recibo.periodo),
        sql`(CASE WHEN ${empleado.legajo} ~ '^[0-9]+$' THEN (${empleado.legajo})::bigint END) NULLS LAST`,
        asc(empleado.nombre)
      )
      .limit(300);
  });

/** Marca la liquidación como recibo confirmado; así aparece en la solapa Recibo. */
export const confirmarReciboLiquidacion = createServerFn({ method: 'POST' })
  .validator(
    z.object({ liquidacionId: z.string().uuid(), clientId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .select({ id: recibo.id })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(
          eq(recibo.id, ctx.data.liquidacionId),
          eq(cliente.id, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!row) throw new Error('Liquidación no encontrada o no autorizada');
    await db
      .update(recibo)
      .set({ confirmado: true })
      .where(eq(recibo.id, ctx.data.liquidacionId));
    return { ok: true };
  });

/**
 * Borra un recibo generado por la app (fuente 'calculo') junto con sus
 * conceptos (FK cascade). Los recibos importados del SOS no se pueden borrar.
 */
export const deleteRecibo = createServerFn({ method: 'POST' })
  .validator(
    z.object({ reciboId: z.string().uuid(), clientId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .select({ id: recibo.id, fuente: recibo.fuente })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(eq(recibo.id, ctx.data.reciboId), eq(cliente.id, ctx.data.clientId))
      )
      .limit(1);
    if (!row) throw new Error('Recibo no encontrado o no autorizado');
    if (row.fuente !== 'calculo') {
      throw new Error('Solo se pueden eliminar recibos generados por la app');
    }
    await db.delete(recibo).where(eq(recibo.id, ctx.data.reciboId));
    return { ok: true };
  });

/** Configuración del empleador para el recibo (firma digital, redondeo). */
export const getPayrollEmployerConfig = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const row = await db
      .select({
        firmaEmpleadorKey: clienteEmpleadorConfig.firmaEmpleadorKey,
        plantillaEmpleadoId: clienteEmpleadorConfig.plantillaEmpleadoId,
      })
      .from(clienteEmpleadorConfig)
      .where(eq(clienteEmpleadorConfig.clienteId, ctx.data.clientId))
      .then((r) => r[0] ?? null);
    return {
      imprimirTotalRedondeado: false,
      // La firma vive en R2 (bucket privado): URL temporal para el <img> y el PDF.
      firmaEmpleadorUrl: row?.firmaEmpleadorKey
        ? r2.presign(row.firmaEmpleadorKey, 3600)
        : null,
      plantillaEmpleadoId: row?.plantillaEmpleadoId ?? null,
    };
  });

/** Establece el empleado de referencia para la plantilla base de nuevos recibos. */
export const setPlantillaEmpleado = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      empleadoId: z.string().uuid().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    // Verificar que el empleado pertenece al profile
    if (ctx.data.empleadoId) {
      const emp = await db
        .select({ id: empleado.id })
        .from(empleado)
        .where(
          and(
            eq(empleado.id, ctx.data.empleadoId),
            eq(empleado.clienteId, ctx.data.clientId)
          )
        )
        .then((r) => r[0] ?? null);
      if (!emp) throw new Error('Empleado no encontrado');
    }
    await db
      .update(clienteEmpleadorConfig)
      .set({ plantillaEmpleadoId: ctx.data.empleadoId })
      .where(eq(clienteEmpleadorConfig.clienteId, ctx.data.clientId));
    return { ok: true };
  });

/** Guarda (o elimina) la firma digital del empleador en el perfil. */
export const saveFirmaDigitalEmpleador = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      /** data URL de la imagen, o null para borrar la firma. */
      firmaDigitalEmpleador: z.string().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await assertCanWrite(orgId);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    // La imagen va a R2; en la DB queda la key, nunca el base64.
    let firmaEmpleadorKey: string | null = null;
    if (ctx.data.firmaDigitalEmpleador) {
      const dataUrl = ctx.data.firmaDigitalEmpleador;
      const mimeType = dataUrl.slice(5, dataUrl.indexOf(';'));
      firmaEmpleadorKey = r2.firmaEmpleadorKey(
        orgId,
        ctx.data.clientId,
        r2.extensionFor(null, mimeType)
      );
      await r2.upload(
        firmaEmpleadorKey,
        Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'),
        mimeType
      );
    }

    await db
      .update(clienteEmpleadorConfig)
      .set({ firmaEmpleadorKey })
      .where(eq(clienteEmpleadorConfig.clienteId, ctx.data.clientId));
    return { ok: true };
  });

/** Columna del recibo estilo SOS. */
type TipoColumnaRecibo =
  | 'remunerativo'
  | 'no_remunerativo'
  | 'descuento'
  | 'retencion';

function tipoConceptoParaColumnaRecibo(
  tipo: TipoColumnaRecibo | null | undefined
): TipoColumnaRecibo {
  if (tipo === 'remunerativo') return 'remunerativo';
  if (tipo === 'no_remunerativo') return 'no_remunerativo';
  if (tipo === 'retencion') return 'retencion';
  return 'descuento';
}

/**
 * Columna del recibo según SOS Contador (rango del n° de concepto 1–599).
 * Ver "Formuleo Sueldos SOS CONTADOR.md" §5.1 y §7.
 */
function tipoColumnaDesdeRangoSos(numero: number): TipoColumnaRecibo | null {
  if (numero >= 1 && numero <= 99) return 'remunerativo';
  if (numero >= 100 && numero <= 199) return 'descuento';
  if (numero >= 200 && numero <= 299) return 'retencion';
  if (numero >= 400 && numero <= 499) return 'no_remunerativo';
  if (numero >= 500 && numero <= 599) return 'retencion';
  /** Excepción documentada (no rem. Dec. 551/2022). */
  if (numero === 603) return 'no_remunerativo';
  return null;
}

/**
 * Códigos ARCA de aportes / retenciones (LSD 81xxxx / 82xxxx) → columna Retenciones.
 * El n° SOS suele ser 200–299; si el recibo guardó solo el código ARCA, igual ubicamos la columna.
 */
function tipoColumnaDesdeCodigoAfip(
  codigo: string | null | undefined
): TipoColumnaRecibo | null {
  if (!codigo) return null;
  const digits = codigo.replace(/\D/g, '');
  if (digits.length === 0) return null;
  const last6 =
    digits.length >= 6 ? parseInt(digits.slice(-6), 10) : parseInt(digits, 10);
  if (Number.isNaN(last6)) return null;
  if (last6 >= 810000 && last6 <= 829999) return 'retencion';
  return null;
}

/**
 * Fila cruda del detalle: `recibo_concepto` + el concepto del catálogo global
 * (FK real) + la configuración propia del cliente, si la tiene.
 */
type DetalleReciboRaw = {
  detalle: typeof reciboConcepto.$inferSelect;
  numeroSos: number;
  nombreSos: string;
  codigoAfipConcepto: string | null;
  tipoCatalogo: TipoColumnaRecibo | null;
  codigoPropio: string | null;
  nombrePropio: string | null;
  tipoPropio: TipoColumnaRecibo | null;
  conceptoAfip: typeof conceptoAfip.$inferSelect | null;
};

/**
 * Forma que consume el recibo (pantalla y PDF). Se mantiene el shape histórico
 * — `detalle.codigo` / `conceptoSos` — aunque ahora salga todo del catálogo
 * global vía la FK `recibo_concepto.concepto_id`.
 */
type DetalleReciboRow = {
  detalle: typeof reciboConcepto.$inferSelect & { codigo: string };
  concepto: {
    codigo: string | null;
    nombre: string | null;
    tipo: TipoColumnaRecibo | null;
  } | null;
  conceptoAfip: typeof conceptoAfip.$inferSelect | null;
  conceptoSos: { codigo: string; nombre: string } | null;
};

/**
 * Columna para el recibo: prioriza reglas SOS (n° concepto / ARCA); si no
 * alcanza, el tipo de la línea y por último el del concepto.
 */
function tipoColumnaSosContador(row: DetalleReciboRaw): TipoColumnaRecibo {
  const col = tipoColumnaDesdeRangoSos(row.numeroSos);
  if (col) return col;

  const colAfip = tipoColumnaDesdeCodigoAfip(row.codigoAfipConcepto);
  if (colAfip) return colAfip;

  const raw = row.detalle.tipo;
  if (
    raw === 'remunerativo' ||
    raw === 'no_remunerativo' ||
    raw === 'descuento' ||
    raw === 'retencion'
  ) {
    return raw;
  }
  return tipoConceptoParaColumnaRecibo(row.tipoPropio ?? row.tipoCatalogo);
}

/** Columnas del detalle del recibo (mismo select en la vista y en el PDF). */
const DETALLE_RECIBO_COLUMNS = {
  detalle: reciboConcepto,
  numeroSos: concepto.numero,
  nombreSos: concepto.nombre,
  codigoAfipConcepto: concepto.codigoAfip,
  tipoCatalogo: concepto.tipo,
  codigoPropio: clienteConcepto.codigoPropio,
  nombrePropio: clienteConcepto.nombrePropio,
  tipoPropio: clienteConcepto.tipo,
  conceptoAfip: conceptoAfip,
};

/** Traduce las filas crudas al shape que espera el recibo, ordenadas por n° SOS. */
function armarDetalleRecibo(
  rows: DetalleReciboRaw[]
): (DetalleReciboRow & { tipoColumna: TipoColumnaRecibo })[] {
  return [...rows]
    .sort((a, b) => a.numeroSos - b.numeroSos)
    .map((row) => ({
      detalle: { ...row.detalle, codigo: String(row.numeroSos) },
      concepto:
        row.codigoPropio || row.nombrePropio
          ? {
              codigo: row.codigoPropio,
              nombre: row.nombrePropio,
              tipo: row.tipoPropio,
            }
          : null,
      conceptoAfip: row.conceptoAfip,
      conceptoSos: { codigo: String(row.numeroSos), nombre: row.nombreSos },
      tipoColumna: tipoColumnaSosContador(row),
    }));
}

export const getReciboDetalle = createServerFn({ method: 'GET' })
  .validator(
    z.object({ liquidacionId: z.string().uuid(), clientId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [liq] = await db
      .select({
        liquidacion: recibo,
        empleado: empleado,
        convenio: convenio,
        categoria: convenioCategoria,
        obraSocial,
      })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .leftJoin(convenio, eq(empleado.convenioId, convenio.id))
      .leftJoin(
        convenioCategoria,
        eq(empleado.categoriaId, convenioCategoria.id)
      )
      .leftJoin(obraSocial, eq(recibo.obraSocialId, obraSocial.id))
      .where(
        and(
          eq(recibo.id, ctx.data.liquidacionId),
          eq(cliente.id, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!liq) return null;

    const basicoCalculado = await basicoParaRecibo(
      liq.empleado,
      liq.liquidacion
    );
    const categoriaIdBasicoEscala =
      liq.empleado.categoriaId ??
      (await resolveCategoriaIdParaBasico(liq.empleado));
    const basicoEscalaCategoria = categoriaIdBasicoEscala
      ? await getBasicoVigenteInternal(
          categoriaIdBasicoEscala,
          liq.liquidacion.periodo
        )
      : 0;

    const detallesRaw = await db
      .select(DETALLE_RECIBO_COLUMNS)
      .from(reciboConcepto)
      .innerJoin(concepto, eq(reciboConcepto.conceptoId, concepto.id))
      .leftJoin(conceptoAfip, eq(conceptoAfip.codigo, concepto.codigoAfip))
      .leftJoin(
        clienteConcepto,
        and(
          eq(clienteConcepto.conceptoId, concepto.id),
          eq(clienteConcepto.clienteId, ctx.data.clientId)
        )
      )
      .where(eq(reciboConcepto.reciboId, ctx.data.liquidacionId))
      .orderBy(concepto.numero);

    const detalles = armarDetalleRecibo(detallesRaw);

    // Mejor sueldo del semestre para concepto 401 (vacaciones no gozadas) — TIN-950
    const [periodoYear, periodoMonthStr] = liq.liquidacion.periodo.split('-');
    const periodoMonth = parseInt(periodoMonthStr, 10);
    const semesterStart = periodoMonth <= 6 ? 1 : 7;
    const semesterMonths: string[] = [];
    for (let m = semesterStart; m <= periodoMonth; m++) {
      semesterMonths.push(
        periodoADate(`${periodoYear}-${String(m).padStart(2, '0')}`)
      );
    }
    const recibosSemestre = await db
      .select({
        haberes: recibo.haberes,
        noRemunerativo: recibo.noRemunerativo,
      })
      .from(recibo)
      .where(
        and(
          eq(recibo.empleadoId, liq.empleado.id),
          inArray(recibo.periodo, semesterMonths),
          eq(recibo.tipo, 'mensual')
        )
      );
    const mejorSueldoSemestre = recibosSemestre.reduce((max, r) => {
      const total = (Number(r.haberes) || 0) + (Number(r.noRemunerativo) || 0);
      return total > max ? total : max;
    }, 0);

    const plantillaCabecera = await obtenerCabeceraPagoPlantilla(
      liq.empleado.id,
      liq.liquidacion.id
    );
    let liquidacionParaVista = mergeCabeceraPagoLiquidacion(
      liq.liquidacion,
      cabeceraPagoDesdeEmpleado(liq.empleado)
    );
    liquidacionParaVista = mergeCabeceraPagoLiquidacion(
      liquidacionParaVista,
      plantillaCabecera
    );
    liquidacionParaVista = {
      ...liquidacionParaVista,
      formaPago: normalizarFormaPagoAlmacenada(liquidacionParaVista.formaPago),
    };

    /** Objeto plano JSON-serializable (evita pérdida de campos con seroval/Drizzle en el cliente). */
    const payload = {
      ...liq,
      liquidacion: liquidacionParaVista,
      basicoCalculado,
      basicoEscalaCategoria,
      mejorSueldoSemestre,
      detalles,
    };
    return JSON.parse(JSON.stringify(payload)) as typeof payload;
  });

/**
 * Obtiene en batch todos los recibos generados con sus detalles completos,
 * agrupados por año (obligatorio) y opcionalmente por mes y/o empleados.
 * Diseñado para generación de PDFs: 2 consultas principales + cálculos en paralelo.
 */
export const listRecibosDetalleParaPDF = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      ano: z.string().regex(/^\d{4}$/, 'Año inválido'),
      mes: z
        .string()
        .regex(/^\d{2}$/)
        .optional(),
      empleadoIds: z.array(z.string().uuid()).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const { ano, mes, empleadoIds } = ctx.data;

    const conditions = [
      eq(cliente.id, ctx.data.clientId),
      eq(empleado.clienteId, ctx.data.clientId),
      eq(recibo.fuente, 'calculo'),
      eq(empleado.activo, true),
      mes
        ? condicionPeriodoRecibo(`${ano}-${mes}`)
        : and(
            gte(recibo.periodo, rangoAnio(ano).desde),
            lte(recibo.periodo, rangoAnio(ano).hasta)
          ),
    ];

    if (empleadoIds && empleadoIds.length > 0) {
      conditions.push(inArray(empleado.id, empleadoIds));
    }

    // ── 1. Headers en una sola query ───────────────────────────────────────────
    const recibos = await db
      .select({
        liquidacion: recibo,
        empleado: empleado,
        convenio: convenio,
        categoria: convenioCategoria,
        obraSocial,
      })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .leftJoin(convenio, eq(empleado.convenioId, convenio.id))
      .leftJoin(
        convenioCategoria,
        eq(empleado.categoriaId, convenioCategoria.id)
      )
      .leftJoin(obraSocial, eq(recibo.obraSocialId, obraSocial.id))
      .where(and(...conditions))
      .orderBy(asc(empleado.nombre), asc(recibo.periodo))
      .limit(500);

    if (recibos.length === 0) return [];

    const reciboIds = recibos.map((r) => r.liquidacion.id);

    // ── 2. Detalles de conceptos en una sola query ─────────────────────────────
    const allDetallesRaw = await db
      .select(DETALLE_RECIBO_COLUMNS)
      .from(reciboConcepto)
      .innerJoin(concepto, eq(reciboConcepto.conceptoId, concepto.id))
      .leftJoin(conceptoAfip, eq(conceptoAfip.codigo, concepto.codigoAfip))
      .leftJoin(
        clienteConcepto,
        and(
          eq(clienteConcepto.conceptoId, concepto.id),
          eq(clienteConcepto.clienteId, ctx.data.clientId)
        )
      )
      .where(inArray(reciboConcepto.reciboId, reciboIds))
      .orderBy(concepto.numero);

    const detallesByReciboId = new Map<string, DetalleReciboRaw[]>();
    for (const d of allDetallesRaw) {
      const key = d.detalle.reciboId;
      if (!detallesByReciboId.has(key)) detallesByReciboId.set(key, []);
      detallesByReciboId.get(key)!.push(d);
    }

    // ── 3. Resolver categoríaId para cada empleado único (en paralelo) ─────────
    const uniqueEmpleados = new Map<string, Empleado>();
    for (const r of recibos) {
      if (!uniqueEmpleados.has(r.empleado.id))
        uniqueEmpleados.set(r.empleado.id, r.empleado);
    }

    const categoriaIdByEmpleado = new Map<string, string | null>();
    await Promise.all(
      [...uniqueEmpleados.entries()].map(async ([id, emp]) => {
        categoriaIdByEmpleado.set(
          id,
          emp.categoriaId ?? (await resolveCategoriaIdParaBasico(emp))
        );
      })
    );

    // ── 4. Básico de escala por par catId+período único (en paralelo) ──────────
    const basicoEscalaCache = new Map<string, number>();
    const catPeriodoPairs = new Set<string>();
    for (const r of recibos) {
      const catId = categoriaIdByEmpleado.get(r.empleado.id);
      if (catId) {
        catPeriodoPairs.add(
          `${catId}|${normalizarPeriodoYYYYMM(r.liquidacion.periodo)}`
        );
      }
    }
    await Promise.all(
      [...catPeriodoPairs].map(async (key) => {
        const [catId, periodo] = key.split('|') as [string, string];
        basicoEscalaCache.set(
          key,
          await getBasicoVigenteInternal(catId, periodo)
        );
      })
    );

    // ── 5. Cabecera de pago por empleado único (en paralelo) ───────────────────
    const cabeceraByEmpleadoId = new Map<
      string,
      Partial<typeof recibo.$inferSelect>
    >();
    await Promise.all(
      [...uniqueEmpleados.keys()].map(async (id) => {
        cabeceraByEmpleadoId.set(id, await obtenerCabeceraPagoPlantilla(id));
      })
    );

    // ── 6. Armar payload completo por recibo ───────────────────────────────────
    const result = recibos.map((r) => {
      const detalles = armarDetalleRecibo(
        detallesByReciboId.get(r.liquidacion.id) ?? []
      );

      // basicoCalculado (replica la lógica de basicoParaRecibo sin async)
      const override =
        r.empleado.valorSueldo != null ? Number(r.empleado.valorSueldo) : 0;
      let basicoCalculado: number;
      if (!isNaN(override) && override > 0) {
        basicoCalculado = override;
      } else {
        const catId = categoriaIdByEmpleado.get(r.empleado.id);
        const periodoNorm = normalizarPeriodoYYYYMM(r.liquidacion.periodo);
        const deEscala = catId
          ? (basicoEscalaCache.get(`${catId}|${periodoNorm}`) ?? 0)
          : 0;
        if (!isNaN(deEscala) && deEscala > 0) {
          basicoCalculado = deEscala;
        } else {
          const persistido =
            r.liquidacion.basico != null ? Number(r.liquidacion.basico) : 0;
          basicoCalculado = isNaN(persistido) ? 0 : persistido;
        }
      }

      const catId = r.empleado.categoriaId;
      const periodoNorm = normalizarPeriodoYYYYMM(r.liquidacion.periodo);
      const basicoEscalaCategoria = catId
        ? (basicoEscalaCache.get(`${catId}|${periodoNorm}`) ?? 0)
        : 0;

      // Merge cabecera pago igual que en getReciboDetalle
      const plantillaCabecera = cabeceraByEmpleadoId.get(r.empleado.id) ?? {};
      let liqVista = mergeCabeceraPagoLiquidacion(
        r.liquidacion,
        cabeceraPagoDesdeEmpleado(r.empleado)
      );
      liqVista = mergeCabeceraPagoLiquidacion(liqVista, plantillaCabecera);
      liqVista = {
        ...liqVista,
        formaPago: normalizarFormaPagoAlmacenada(liqVista.formaPago),
      };

      return {
        ...r,
        liquidacion: liqVista,
        basicoCalculado,
        basicoEscalaCategoria,
        detalles,
      };
    });

    return JSON.parse(JSON.stringify(result)) as typeof result;
  });

/**
 * Resumen agregado de la liquidación de un cliente para un período.
 * Devuelve totales (haberes, no remunerativo, descuentos, retenciones, neto)
 * + cantidad de recibos por tipo + cantidad de empleados liquidados.
 * Diseñado para mostrar un overview en el agente IA sin abrir el dashboard.
 */
export const getResumenLiquidacionMes = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      periodo: z.string(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const rows = await db
      .select({
        liquidacion: recibo,
        empleadoId: empleado.id,
      })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(cliente, eq(empleado.clienteId, cliente.id))
      .where(
        and(
          condicionPeriodoRecibo(ctx.data.periodo),
          eq(cliente.id, ctx.data.clientId)
        )
      );

    const num = (v: unknown) => Number(v ?? 0);
    const empleadosUnicos = new Set<string>();
    const porTipo: Record<
      string,
      { count: number; haberes: number; neto: number }
    > = {};
    let totalHaberes = 0;
    let totalNoRemunerativo = 0;
    let totalDescuentos = 0;
    let totalRetenciones = 0;
    let totalNeto = 0;
    let confirmados = 0;
    let importados = 0;
    let generados = 0;

    for (const r of rows) {
      const l = r.liquidacion;
      empleadosUnicos.add(r.empleadoId);
      const haberes = num(l.haberes);
      const neto = num(l.neto);
      totalHaberes += haberes;
      totalNoRemunerativo += num(l.noRemunerativo);
      totalDescuentos += num(l.descuentos);
      totalRetenciones += num(l.retenciones);
      totalNeto += neto;
      if (l.confirmado) confirmados++;
      if (l.fuente === 'import') importados++;
      else if (l.fuente === 'calculo') generados++;
      const tipoKey = l.tipo || 'mensual';
      if (!porTipo[tipoKey])
        porTipo[tipoKey] = { count: 0, haberes: 0, neto: 0 };
      porTipo[tipoKey].count++;
      porTipo[tipoKey].haberes += haberes;
      porTipo[tipoKey].neto += neto;
    }

    return {
      clientId: ctx.data.clientId,
      periodo: ctx.data.periodo,
      totales: {
        recibos: rows.length,
        empleados: empleadosUnicos.size,
        confirmados,
        importados,
        generados,
        haberes: totalHaberes,
        noRemunerativo: totalNoRemunerativo,
        descuentos: totalDescuentos,
        retenciones: totalRetenciones,
        neto: totalNeto,
      },
      porTipo,
    };
  });

export type GetResumenLiquidacionMesResult = Awaited<
  ReturnType<typeof getResumenLiquidacionMes>
>;

// ─────────────────────────────────────────────────────────────────────────────
// Cargas Sociales — Generación de archivos LSD
// ─────────────────────────────────────────────────────────────────────────────

/** Previsualización de los datos que se exportarán en el LSD para un período. */
export const previewLsd = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const { clientId: profileId, periodo } = ctx.data;

    const [employer] = await db
      .select({
        nombre: cliente.razonSocial,
        cuit: cliente.cuit,
        codigoLsd: tipoEmpresa.codigo,
        tipoEmpresaNombre: tipoEmpresa.nombre,
      })
      .from(cliente)
      .leftJoin(
        clienteEmpleadorConfig,
        eq(clienteEmpleadorConfig.clienteId, cliente.id)
      )
      .leftJoin(
        tipoEmpresa,
        eq(clienteEmpleadorConfig.tipoEmpresaId, tipoEmpresa.id)
      )
      .where(eq(cliente.id, profileId))
      .limit(1);

    if (!employer) throw new Error('Empresa no encontrada');

    const rows = await db
      .select({
        reciboId: recibo.id,
        origen: recibo.fuente,
        empleadoNombre: empleado.nombre,
        empleadoCuil: empleado.cuil,
        empleadoLegajo: empleado.legajo,
        diasTrabajados: recibo.diasTrabajados,
        situacionCodigo: situacionRevista.codigo,
        situacionNombre: situacionRevista.nombre,
        modalidadCodigo: modalidadContratacion.codigo,
        modalidadNombre: modalidadContratacion.nombre,
        remuneracion4Y8Override: recibo.remuneracion4Y8Override,
        remuneracion9Override: recibo.remuneracion9Override,
        contribucionAdicionalOs: recibo.contribucionAdicionalOs,
        importeADetraerLey27430: recibo.importeADetraerLey27430,
        importeMaternidadArt13: recibo.importeMaternidadArt13,
        // Campos para pre-calcular rem4y8 y rem9 sugeridos (TIN-952)
        haberes: recibo.haberes,
        noRemunerativo: recibo.noRemunerativo,
        categoriaId: empleado.categoriaId,
      })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .leftJoin(
        situacionRevista,
        // Fallback: si el recibo no tiene situación seteada (recibos importados de Excel),
        // usar la situación del empleado.
        sql`${situacionRevista.id} = COALESCE(${recibo.situacionRevista1Id}, ${empleado.situacionId})`
      )
      .leftJoin(
        modalidadContratacion,
        eq(empleado.modalidadContratacionId, modalidadContratacion.id)
      )
      .where(
        and(
          eq(empleado.clienteId, profileId),
          eq(recibo.periodo, periodoADate(periodo))
        )
      )
      .orderBy(asc(empleado.legajo));

    // ── Escala del convenio para rem4y8Sugerido (TIN-952) ───────────────────
    // rem4y8 = basicoEscala del convenio (siempre, cuando hay categoría con escala vigente)
    // rem9   = haberes + noRemunerativo (bruto real liquidado)
    const catPeriodoPairs = new Set<string>();
    const periodoNormPreview = normalizarPeriodoYYYYMM(periodo);
    for (const r of rows) {
      if (r.categoriaId && periodoNormPreview) {
        catPeriodoPairs.add(`${r.categoriaId}|${periodoNormPreview}`);
      }
    }
    const escalaCache = new Map<string, number>();
    await Promise.all(
      [...catPeriodoPairs].map(async (key) => {
        const [catId, per] = key.split('|') as [string, string];
        escalaCache.set(key, await getBasicoVigenteInternal(catId, per));
      })
    );

    const reciboIds = rows.map((r) => r.reciboId);

    // Per-employee concept count (Record 03 lines)
    const conceptosPorRecibo: Record<string, number> =
      reciboIds.length > 0
        ? await db
            .select({
              reciboId: reciboConcepto.reciboId,
              cnt: sql<number>`count(*)::int`,
            })
            .from(reciboConcepto)
            .where(
              and(
                inArray(reciboConcepto.reciboId, reciboIds),
                eq(reciboConcepto.activo, true)
              )
            )
            .groupBy(reciboConcepto.reciboId)
            .then((r) => Object.fromEntries(r.map((x) => [x.reciboId, x.cnt])))
        : {};

    const totalConceptos = Object.values(conceptosPorRecibo).reduce(
      (a, b) => a + b,
      0
    );

    return {
      employer,
      empleados: rows.map((r) => {
        const rem9Sugerido =
          (Number(r.haberes) || 0) + (Number(r.noRemunerativo) || 0);
        const basicoEscala =
          r.categoriaId && periodoNormPreview
            ? (escalaCache.get(`${r.categoriaId}|${periodoNormPreview}`) ?? 0)
            : 0;
        // max(escala, bruto): para jornada reducida escala > bruto; para full-time bruto >= escala
        const rem4y8Sugerido = Math.max(basicoEscala, rem9Sugerido);
        return {
          ...r,
          cantidadConceptos: conceptosPorRecibo[r.reciboId] ?? 0,
          rem4y8Sugerido: rem4y8Sugerido > 0 ? rem4y8Sugerido.toFixed(2) : null,
          rem9Sugerido: rem9Sugerido > 0 ? rem9Sugerido.toFixed(2) : null,
        };
      }),
      conceptos: totalConceptos,
    };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Cargas Sociales — Parámetros de período (tope imponible)
// ─────────────────────────────────────────────────────────────────────────────

/** Obtiene los parámetros del período (tope imponible, SMVM) para la solapa Cargas Sociales. */
export const getParametrosPeriodo = createServerFn({ method: 'GET' })
  .validator(z.object({ periodo: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const [row] = await db
      .select()
      .from(parametroPeriodo)
      .where(eq(parametroPeriodo.periodo, periodoADate(ctx.data.periodo)))
      .limit(1);
    return row ?? null;
  });

/** Crea o actualiza el tope imponible y SMVM para un período. */
export const upsertParametrosPeriodo = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
      topeMaximoImponible: z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/, 'Debe ser un número con hasta 2 decimales'),
      salarioMinimo: z
        .string()
        .regex(/^\d+(\.\d{1,2})?$/)
        .optional(),
      fuente: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const { periodo, topeMaximoImponible, salarioMinimo, fuente } = ctx.data;
    await db
      .insert(parametroPeriodo)
      .values({
        periodo: periodoADate(periodo),
        topeMaximoImponible,
        salarioMinimo: salarioMinimo ?? null,
        fuente: fuente ?? null,
        actualizadoPorCron: false,
      })
      .onConflictDoUpdate({
        target: parametroPeriodo.periodo,
        set: {
          topeMaximoImponible,
          salarioMinimo: salarioMinimo ?? null,
          fuente: fuente ?? null,
          actualizadoPorCron: false,
        },
      });
    return { ok: true };
  });

/** Actualiza los campos de override LSD de un recibo (bases imponibles, aportes adicionales, etc.). */
export const updateReciboLsdOverrides = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      reciboId: z.string().uuid(),
      remuneracion4Y8Override: z.number().nullable().optional(),
      remuneracion9Override: z.number().nullable().optional(),
      contribucionAdicionalOs: z.number().nullable().optional(),
      importeADetraerLey27430: z.number().nullable().optional(),
      importeMaternidadArt13: z.number().nullable().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const [rec] = await db
      .select({ id: recibo.id })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .where(
        and(
          eq(recibo.id, ctx.data.reciboId),
          eq(empleado.clienteId, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!rec) throw new Error('Recibo no encontrado');

    const toStr = (v: number | null | undefined) =>
      v != null ? String(v) : null;
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (ctx.data.remuneracion4Y8Override !== undefined)
      update.remuneracion4Y8Override = toStr(ctx.data.remuneracion4Y8Override);
    if (ctx.data.remuneracion9Override !== undefined)
      update.remuneracion9Override = toStr(ctx.data.remuneracion9Override);
    if (ctx.data.contribucionAdicionalOs !== undefined)
      update.contribucionAdicionalOs = toStr(ctx.data.contribucionAdicionalOs);
    if (ctx.data.importeADetraerLey27430 !== undefined)
      update.importeADetraerLey27430 = toStr(ctx.data.importeADetraerLey27430);
    if (ctx.data.importeMaternidadArt13 !== undefined)
      update.importeMaternidadArt13 = toStr(ctx.data.importeMaternidadArt13);

    await db.update(recibo).set(update).where(eq(recibo.id, ctx.data.reciboId));

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Cargas Sociales — Validación pre-descarga
// ─────────────────────────────────────────────────────────────────────────────

type LsdIssue = {
  tipo: 'error' | 'warning';
  codigo: string;
  mensaje: string;
  empleadoCuil?: string;
  empleadoNombre?: string;
};

/**
 * Valida que el período esté listo para generar el LSD.
 * Devuelve la lista de errores (bloqueantes) y warnings, y si se puede descargar.
 */
export const validarLsd = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const { clientId: profileId, periodo } = ctx.data;
    const issues: LsdIssue[] = [];

    // 1. Tipo de empleador
    const [employer] = await db
      .select({ codigoLsd: tipoEmpresa.codigo })
      .from(cliente)
      .leftJoin(
        clienteEmpleadorConfig,
        eq(clienteEmpleadorConfig.clienteId, cliente.id)
      )
      .leftJoin(
        tipoEmpresa,
        eq(clienteEmpleadorConfig.tipoEmpresaId, tipoEmpresa.id)
      )
      .where(eq(cliente.id, profileId))
      .limit(1);

    if (!employer?.codigoLsd) {
      issues.push({
        tipo: 'error',
        codigo: 'SIN_TIPO_EMPLEADOR',
        mensaje:
          'La empresa no tiene tipo de empleador configurado. Es requerido para el Record 01 del LSD.',
      });
    }

    // 3. Recibos del período
    // La situación de revista se toma del recibo (situacionRevista1Id) con fallback al empleado
    // (situacionId) — misma lógica que previewLsd para recibos importados desde SOS.
    const recibos = await db
      .select({
        situacionRevista1Id: recibo.situacionRevista1Id,
        situacionIdEmpleado: empleado.situacionId,
        cuil: empleado.cuil,
        nombre: empleado.nombre,
        modalidadContratacionId: empleado.modalidadContratacionId,
        obraSocialId: empleado.obraSocialId,
      })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .where(
        and(
          eq(empleado.clienteId, profileId),
          eq(recibo.periodo, periodoADate(periodo))
        )
      );

    if (recibos.length === 0) {
      issues.push({
        tipo: 'error',
        codigo: 'SIN_RECIBOS',
        mensaje: `No hay recibos cargados para el período ${periodo}.`,
      });
    }

    for (const row of recibos) {
      // Error solo si AMBOS son null: ni el recibo ni el empleado tienen situación
      if (!row.situacionRevista1Id && !row.situacionIdEmpleado) {
        issues.push({
          tipo: 'error',
          codigo: 'SIN_SITUACION_REVISTA',
          mensaje:
            'Sin situación de revista. Es obligatoria para Records 02 y 04.',
          empleadoCuil: row.cuil,
          empleadoNombre: row.nombre,
        });
      }
      if (!row.modalidadContratacionId) {
        issues.push({
          tipo: 'error',
          codigo: 'SIN_MODALIDAD_CONTRATACION',
          mensaje:
            'Sin modalidad de contratación. Es obligatoria para Record 04.',
          empleadoCuil: row.cuil,
          empleadoNombre: row.nombre,
        });
      }
      if (!row.obraSocialId) {
        issues.push({
          tipo: 'warning',
          codigo: 'SIN_OBRA_SOCIAL',
          mensaje:
            'Sin obra social asignada. El código OS en Record 04 quedará vacío.',
          empleadoCuil: row.cuil,
          empleadoNombre: row.nombre,
        });
      }
    }

    const puedeDescargar = !issues.some((i) => i.tipo === 'error');
    return { puedeDescargar, issues };
  });

/** Convierte un monto en pesos (puede ser string decimal de Drizzle) a centavos enteros. */
function montoCentavos(value: string | number | null | undefined): number {
  if (value == null) return 0;
  return Math.round(Math.abs(parseFloat(String(value))) * 100);
}

/** Formatea un valor en centavos como campo monetario LSD (15 dígitos, cero-padding). */
function lsdMoney(centavos: number): string {
  return String(centavos).padStart(15, '0');
}

/** Genera el archivo LSD (Records 01-04) para un período. */
export const generarArchivoLsd = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
      /** Si se pasa, solo se incluyen los recibos de estos CUILs (para rectificativas parciales). */
      cuils: z.array(z.string()).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const { clientId: profileId, periodo, cuils } = ctx.data;

    // ── 1. Employer config ─────────────────────────────────────────────────
    const [employer] = await db
      .select({
        cuit: cliente.cuit,
        codigoLsd: tipoEmpresa.codigo,
        seguroColectivo: clienteEmpleadorConfig.seguroColectivo,
        mipyme: clienteEmpleadorConfig.mipyme,
      })
      .from(cliente)
      .leftJoin(
        clienteEmpleadorConfig,
        eq(clienteEmpleadorConfig.clienteId, cliente.id)
      )
      .leftJoin(
        tipoEmpresa,
        eq(clienteEmpleadorConfig.tipoEmpresaId, tipoEmpresa.id)
      )
      .where(eq(cliente.id, profileId))
      .limit(1);

    if (!employer) throw new Error('Empresa no encontrada');
    const cuit = employer.cuit.replace(/[-\s]/g, '').padStart(11, '0');
    // tipo_empleador: primer carácter del código LSD (ej. "1", "4", "7")
    const tipoEmpleadorCode = (employer.codigoLsd ?? '1').charAt(0);

    // ── 2. Tope máximo imponible del período ───────────────────────────────
    const [paramsPeriodo] = await db
      .select({ topeMaximoImponible: parametroPeriodo.topeMaximoImponible })
      .from(parametroPeriodo)
      .where(eq(parametroPeriodo.periodo, periodoADate(periodo)))
      .limit(1);
    // tope en centavos (null = no configurado → sin tope aplicado)
    const topeCentavos = paramsPeriodo
      ? montoCentavos(paramsPeriodo.topeMaximoImponible)
      : null;

    // ── 3. Recibos del período con catálogos para Record 04 ───────────────
    const sit1Alias = aliasedTable(situacionRevista, 'sit1');
    const sit2Alias = aliasedTable(situacionRevista, 'sit2');
    const sit3Alias = aliasedTable(situacionRevista, 'sit3');

    const recibos = await db
      .select({
        recibo: recibo,
        empleado: empleado,
        sit1Codigo: sit1Alias.codigo,
        sit2Codigo: sit2Alias.codigo,
        sit3Codigo: sit3Alias.codigo,
        condicionCodigo: condicionTrabajador.codigo,
        actividadCodigo: actividad.codigo,
        modalidadCodigo: modalidadContratacion.codigo,
        siniestradoCodigo: siniestrado.codigo,
        localidadCodigo: localidad.codigo,
        obraSocialCodigo: obraSocial.codigo,
      })
      .from(recibo)
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      // sit1: recibo.situacionRevista1Id con fallback a empleado.situacionId (recibos importados SOS)
      .leftJoin(
        sit1Alias,
        sql`${sit1Alias.id} = COALESCE(${recibo.situacionRevista1Id}, ${empleado.situacionId})`
      )
      .leftJoin(sit2Alias, eq(recibo.situacionRevista2Id, sit2Alias.id))
      .leftJoin(sit3Alias, eq(recibo.situacionRevista3Id, sit3Alias.id))
      .leftJoin(
        condicionTrabajador,
        eq(empleado.condicionId, condicionTrabajador.id)
      )
      .leftJoin(actividad, eq(empleado.actividadId, actividad.id))
      .leftJoin(
        modalidadContratacion,
        eq(empleado.modalidadContratacionId, modalidadContratacion.id)
      )
      .leftJoin(siniestrado, eq(empleado.siniestradoId, siniestrado.id))
      .leftJoin(localidad, eq(empleado.localidadId, localidad.id))
      .leftJoin(obraSocial, eq(empleado.obraSocialId, obraSocial.id))
      .where(
        and(
          eq(empleado.clienteId, profileId),
          eq(recibo.periodo, periodoADate(periodo)),
          cuils && cuils.length > 0 ? inArray(empleado.cuil, cuils) : undefined
        )
      )
      .orderBy(asc(empleado.legajo));

    // ── 4. Conceptos de todos los recibos ──────────────────────────────────
    const reciboIds = recibos.map((r) => r.recibo.id);
    const conceptoValores =
      reciboIds.length > 0
        ? await db
            .select({
              valor: reciboConcepto,
              numeroSos: concepto.numero,
            })
            .from(reciboConcepto)
            .innerJoin(concepto, eq(reciboConcepto.conceptoId, concepto.id))
            .where(
              and(
                inArray(reciboConcepto.reciboId, reciboIds),
                eq(reciboConcepto.activo, true)
              )
            )
            .orderBy(asc(concepto.numero))
        : [];

    const conceptosByRecibo = new Map<string, typeof conceptoValores>();
    for (const cv of conceptoValores) {
      const key = cv.valor.reciboId;
      if (!conceptosByRecibo.has(key)) conceptosByRecibo.set(key, []);
      conceptosByRecibo.get(key)!.push(cv);
    }

    // ── 4.5. Básico de escala del convenio para rem4y8 (bases OS 4 y 8 del LSD) ─
    // La base OS siempre es el básico del convenio al 100%, independientemente de
    // cuánto haya trabajado el empleado ese mes (el concepto 1 ya ajusta con su
    // porcentaje/cantidad lo que se liquida; OS se informa sobre la escala completa).
    const basicoEscalaCentavosByEmpleadoId = new Map<string, number>();
    {
      const periodoNorm = normalizarPeriodoYYYYMM(periodo);
      const catPeriodos = new Set<string>();
      for (const row of recibos) {
        if (row.empleado.categoriaId) {
          catPeriodos.add(`${row.empleado.categoriaId}|${periodoNorm}`);
        }
      }
      if (catPeriodos.size > 0) {
        const escalaCache = new Map<string, number>();
        await Promise.all(
          [...catPeriodos].map(async (key) => {
            const [catId, per] = key.split('|') as [string, string];
            escalaCache.set(key, await getBasicoVigenteInternal(catId, per));
          })
        );
        for (const row of recibos) {
          if (row.empleado.categoriaId) {
            const val =
              escalaCache.get(`${row.empleado.categoriaId}|${periodoNorm}`) ??
              0;
            if (val > 0)
              basicoEscalaCentavosByEmpleadoId.set(
                row.empleado.id,
                Math.round(val * 100)
              );
          }
        }
      }
    }

    // ── 5. Construir líneas LSD ────────────────────────────────────────────
    const [year, month] = periodo.split('-');
    const periodoLsd = `${year}${month}`;
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const fechaFin = `${year}${month}${String(lastDay).padStart(2, '0')}`;
    const numEmpleados = recibos.length;

    const r02Lines: string[] = [];
    const r03Lines: string[] = [];
    const r04Lines: string[] = [];

    for (const row of recibos) {
      const emp = row.empleado;
      const rec = row.recibo;
      const cuil = emp.cuil.replace(/[-\s]/g, '').padStart(11, '0');
      const legajo = emp.legajo;

      // ── Record 02 — Empleado ─────────────────────────────────────────────
      const r02prefix = `02${cuil}${legajo}`;
      r02Lines.push(r02prefix.padEnd(96) + `000${fechaFin}${' '.repeat(8)}1`);

      // ── Record 03 — Conceptos ─────────────────────────────────────────────
      const conceptos = conceptosByRecibo.get(rec.id) ?? [];
      for (const cv of conceptos) {
        const sosNum = cv.numeroSos;
        if (sosNum === 0) continue;

        const sosCode = String(sosNum).padStart(3, '0');
        const cantidadRaw =
          cv.valor.cantidad != null ? Number(cv.valor.cantidad) : 1;
        const centavos = Math.round(Math.abs(Number(cv.valor.monto)) * 100);

        let credDeb: 'C' | 'D';
        if (cv.valor.tipo === 'descuento' || cv.valor.tipo === 'retencion') {
          credDeb = 'D';
        } else if (cv.valor.tipo) {
          credDeb = 'C';
        } else {
          credDeb =
            (sosNum >= 200 && sosNum < 400) || sosNum >= 500 ? 'D' : 'C';
        }

        const amountStr = String(centavos).padStart(15, '0');

        if (sosNum >= 400) {
          const qty = String(Math.round(cantidadRaw * 100)).padStart(6, '0');
          r03Lines.push(
            `03${cuil}${'0'.repeat(9)}${sosCode}${qty}$${amountStr}${credDeb}`
          );
        } else {
          const qty = String(Math.round(cantidadRaw * 100)).padStart(5, '0');
          r03Lines.push(
            `03${cuil}${'0'.repeat(7)}${sosCode}${qty}$${amountStr}${credDeb}`
          );
        }
      }

      // ── Record 04 — Bases imponibles ─────────────────────────────────────

      // Calcular bases desde los conceptos del recibo
      // total_rem:    SOS 001-399 con indicador C (remunerativos)
      // total_nonrem: SOS 400-499 con indicador C (no remunerativos)
      let totalRemCentavos = 0;
      let totalNonRemCentavos = 0;
      for (const cv of conceptos) {
        const sosNum = cv.numeroSos;
        if (sosNum === 0) continue;

        let credDeb: 'C' | 'D';
        if (cv.valor.tipo === 'descuento' || cv.valor.tipo === 'retencion') {
          credDeb = 'D';
        } else if (cv.valor.tipo) {
          credDeb = 'C';
        } else {
          credDeb =
            (sosNum >= 200 && sosNum < 400) || sosNum >= 500 ? 'D' : 'C';
        }

        if (credDeb === 'C') {
          const c = Math.round(Math.abs(Number(cv.valor.monto)) * 100);
          if (sosNum >= 1 && sosNum <= 399) totalRemCentavos += c;
          else if (sosNum >= 400 && sosNum <= 499) totalNonRemCentavos += c;
        }
      }
      const brutaCentavos = totalRemCentavos + totalNonRemCentavos;

      // Aplicar tope (si está configurado)
      const applyTope = (val: number) =>
        topeCentavos != null ? Math.min(val, topeCentavos) : val;

      // Overrides manuales del recibo (remuneracion4Y8Override cubre OS; remuneracion9Override cubre ART).
      // rem4y8Base = max(basicoEscala, bruto): si el empleado liquida jornada reducida,
      // basicoEscala > bruto y se usa la escala completa; si es full-time, el bruto
      // ya incluye antigüedad/presentismo y supera al básico, por lo que se usa el bruto.
      const basicoEscalaFullTimeCentavos =
        basicoEscalaCentavosByEmpleadoId.get(emp.id) ?? 0;
      const rem4y8Base =
        rec.remuneracion4Y8Override != null
          ? montoCentavos(rec.remuneracion4Y8Override)
          : Math.max(basicoEscalaFullTimeCentavos, brutaCentavos);
      const rem9Base =
        rec.remuneracion9Override != null
          ? montoCentavos(rec.remuneracion9Override)
          : brutaCentavos;

      // 20 campos monetarios de 15 chars cada uno (= 300 chars de [70] a [370])
      // base dif LRT = parte de bruta que supera el tope (o la suma no-rem cuando totalRem ≤ tope)
      // = bruta - B1(jubApor) = brutaCentavos - applyTope(totalRemCentavos)
      const baseDifLRT = Math.max(
        0,
        brutaCentavos - applyTope(totalRemCentavos)
      );
      // base dif OS = exceso de la base OS sobre bruta (cuando rem4y8 override > bruta)
      const baseDifAporOS = Math.max(0, applyTope(rem4y8Base) - brutaCentavos);
      const baseDifContOS = Math.max(0, rem4y8Base - brutaCentavos);

      const moneyFields = [
        lsdMoney(0), // [70:85]  aporte adicional OS
        lsdMoney(montoCentavos(rec.contribucionAdicionalOs)), // [85:100] contrib adicional OS
        lsdMoney(baseDifAporOS), // [100:115] base dif aporte OS
        lsdMoney(baseDifContOS), // [115:130] base dif contrib OS
        lsdMoney(baseDifLRT), // [130:145] base dif LRT
        lsdMoney(montoCentavos(rec.importeMaternidadArt13)), // [145:160] remun maternidad
        lsdMoney(brutaCentavos), // [160:175] remuneración bruta
        lsdMoney(applyTope(totalRemCentavos)), // [175:190] base 1: jubilación aporte
        lsdMoney(totalRemCentavos), // [190:205] base 2: jubilación contrib
        lsdMoney(totalRemCentavos), // [205:220] base 3: PAMI
        lsdMoney(applyTope(rem4y8Base)), // [220:235] base 4: OS aportes
        lsdMoney(applyTope(totalRemCentavos)), // [235:250] base 5: FNE/AAFF
        lsdMoney(0), // [250:265] base 6 (regímenes especiales)
        lsdMoney(0), // [265:280] base 7 (regímenes especiales)
        lsdMoney(rem4y8Base), // [280:295] base 8: OS contrib
        lsdMoney(rem9Base), // [295:310] base 9: ART/LRT
        lsdMoney(0), // [310:325] base dif SS aportes
        lsdMoney(0), // [325:340] base dif SS contrib
        lsdMoney(0), // [340:355] base 10
        lsdMoney(montoCentavos(rec.importeADetraerLey27430)), // [355:370] importe a detraer
      ].join('');

      // Header del Record 04 (70 chars)
      const sit1 = row.sit1Codigo ?? '';
      const sit2 = row.sit2Codigo ?? '';
      const sit3 = row.sit3Codigo ?? '';

      const marcaConyuge = (emp.conyuge ?? 0) > 0 ? '1' : '0';
      const hijos = String(emp.hijos ?? 0).padStart(2, '0');
      const marcaCct = emp.convenioId ? '1' : '0';
      const marcaScvo = employer.seguroColectivo ? '1' : '0';
      // marca_reduccion: MiPyME con reducción de contribuciones
      const marcaReduccion = employer.mipyme ? '1' : '0';
      const tipoOp = '0'; // 0 = alta/modificación normal
      // Campos alfanuméricos LSD: sin cero a la izquierda, right-padded con espacio
      const lsdAlpha = (code: string | null | undefined, len: number) =>
        (parseInt(code ?? '0') || 0).toString().padEnd(len, ' ');
      const sitGeneral = lsdAlpha(sit1 || '1', 2);
      const condicion = lsdAlpha(row.condicionCodigo ?? '1', 2);
      const actividad = (row.actividadCodigo ?? '000').padStart(3, '0'); // numérico: zero-pad
      const modalidad = lsdAlpha(row.modalidadCodigo ?? '1', 3);
      const siniestrado = lsdAlpha(row.siniestradoCodigo ?? '0', 2);
      const localidad = (row.localidadCodigo ?? '00').padStart(2, '0'); // numérico: zero-pad
      // Situaciones 1/2/3 y sus días de inicio
      const sitRev1 = sit1 ? lsdAlpha(sit1, 2) : '  ';
      const diaInicio1 = sit1
        ? String(rec.situacionRevista1DiaInicio ?? 1).padStart(2, '0')
        : '  ';
      const sitRev2 = sit2 ? lsdAlpha(sit2, 2) : '  ';
      const diaInicio2 = sit2
        ? String(rec.situacionRevista2DiaInicio ?? 1).padStart(2, '0')
        : '00';
      const sitRev3 = sit3 ? lsdAlpha(sit3, 2) : '  ';
      const diaInicio3 = sit3
        ? String(rec.situacionRevista3DiaInicio ?? 1).padStart(2, '0')
        : '00';
      const diasTrabajados = String(rec.diasTrabajados ?? 30).padStart(2, '0');
      const pctAporteAdSS = '000'; // porcentaje aporte adicional SS (3 chars)
      const pctContribTarea = '00000'; // porcentaje contrib tarea diferencial (5 chars)
      const campoReservado = '00000'; // campo reservado (5 chars)
      // obra social: código AFIP 6 chars, right-padded with spaces if shorter
      const osCode = (row.obraSocialCodigo ?? '').padEnd(6, ' ');
      // Adherentes a la obra social: el legajo no los registra (nunca se cargaron).
      const adherentes = '00';

      const r04Header =
        `04${cuil}` +
        marcaConyuge +
        hijos +
        marcaCct +
        marcaScvo +
        marcaReduccion +
        tipoEmpleadorCode +
        tipoOp +
        sitGeneral +
        condicion +
        actividad +
        modalidad +
        siniestrado +
        localidad +
        sitRev1 +
        diaInicio1 +
        sitRev2 +
        diaInicio2 +
        sitRev3 +
        diaInicio3 +
        diasTrabajados +
        pctAporteAdSS +
        pctContribTarea +
        campoReservado +
        osCode +
        adherentes;

      r04Lines.push(r04Header + moneyFields);
    }

    // ── Record 01 — Encabezado ─────────────────────────────────────────────
    // Calcular el número de presentación secuencial para este período
    const [maxPres] = await db
      .select({ maxNro: max(lsdPresentacion.numero) })
      .from(lsdPresentacion)
      .where(
        and(
          eq(lsdPresentacion.clienteId, profileId),
          eq(lsdPresentacion.periodo, periodoADate(periodo))
        )
      );
    const nroPresentacion = (maxPres?.maxNro ?? 0) + 1;

    // R01: pos 23-27 = nroPresentacion (5 dígitos), pos 28 = '3' (tipo forma, fijo según referencia AFIP)
    const nroStr = String(nroPresentacion).padStart(5, '0');
    // Nota: posiciones 14-15 usan 'SJ' según archivo de referencia E-Presis.
    const r01 = `01${cuit}SJ${periodoLsd}M${nroStr}3${String(numEmpleados).padStart(7, '0')}`;

    const lines = [r01, ...r02Lines, ...r03Lines, ...r04Lines];
    const contenido = lines.join('\r\n') + '\r\n';
    const filename = `${cuit}_${year}_${month}_LSD.txt`;

    // Guardar la presentación en la base de datos
    await db.insert(lsdPresentacion).values({
      orgId,
      clienteId: profileId,
      periodo: periodoADate(periodo),
      numero: nroPresentacion,
      filename,
      empleados: numEmpleados,
      conceptos: r03Lines.length,
      contenido,
    });

    return {
      filename,
      contenido,
      empleados: numEmpleados,
      conceptos: r03Lines.length,
      nroPresentacion,
    };
  });

// Cargas Sociales — Historial de presentaciones

/** Lista todas las presentaciones LSD generadas para un período y empresa. */
export const listLsdPresentaciones = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    return db
      .select({
        id: lsdPresentacion.id,
        nroPresentacion: lsdPresentacion.numero,
        filename: lsdPresentacion.filename,
        empleados: lsdPresentacion.empleados,
        conceptos: lsdPresentacion.conceptos,
        generadoEn: lsdPresentacion.generadoAt,
      })
      .from(lsdPresentacion)
      .where(
        and(
          eq(lsdPresentacion.clienteId, ctx.data.clientId),
          eq(lsdPresentacion.periodo, periodoADate(ctx.data.periodo))
        )
      )
      .orderBy(asc(lsdPresentacion.numero));
  });

/** Devuelve el contenido de una presentación para re-descarga. */
export const getLsdPresentacionContenido = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      presentacionId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const [pres] = await db
      .select({
        filename: lsdPresentacion.filename,
        contenido: lsdPresentacion.contenido,
        nroPresentacion: lsdPresentacion.numero,
      })
      .from(lsdPresentacion)
      .where(
        and(
          eq(lsdPresentacion.id, ctx.data.presentacionId),
          eq(lsdPresentacion.clienteId, ctx.data.clientId)
        )
      )
      .limit(1);

    if (!pres) throw new Error('Presentación no encontrada');
    return pres;
  });

// Cargas Sociales — Archivo de conceptos LSD

/** Normaliza nombre para el archivo conceptosLSD: solo ASCII imprimible, sin tildes. */
function normalizarNombreLsd(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accent combining marks
    .replace(/[^\x20-\x7E]/g, ''); // keep only printable ASCII
}

/** Flags de 29 chars según el tipo AFIP. */
function flagsConceptoLsd(tipoPrefijo: string): string {
  if (tipoPrefijo === '81' || tipoPrefijo === '82') {
    return '10000000000 0 0 00 0         '; // descuentos / retenciones
  }
  if (
    tipoPrefijo === '54' ||
    tipoPrefijo === '52' ||
    tipoPrefijo === '55' ||
    tipoPrefijo === '56'
  ) {
    return '10000111100 0 0 00 0         '; // no remunerativos
  }
  return '11111111111 1 1 10 0         '; // remunerativos (default)
}

/**
 * Genera el archivo conceptosLSD a partir de los conceptos activos en los
 * recibos del período. El formato es el esperado por el aplicativo LSD de AFIP:
 * 195 chars/línea + CRLF — campos: codigoAfip(6) + 000000(6) + sos(4) + nombre(150) + flags(29).
 */
export const generarConceptosLsd = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const { clientId: profileId, periodo } = ctx.data;

    // Conceptos activos usados en los recibos del período — únicos por numero_sos
    const rows = await db
      .selectDistinctOn([concepto.numero], {
        numeroSos: concepto.numero,
        // El nombre que declara la empresa manda sobre el del catálogo.
        nombre: sql<string>`coalesce(${clienteConcepto.nombrePropio}, ${concepto.nombre})`,
        codigoAfip: concepto.codigoAfip,
      })
      .from(reciboConcepto)
      .innerJoin(recibo, eq(reciboConcepto.reciboId, recibo.id))
      .innerJoin(empleado, eq(recibo.empleadoId, empleado.id))
      .innerJoin(concepto, eq(reciboConcepto.conceptoId, concepto.id))
      .leftJoin(
        clienteConcepto,
        and(
          eq(clienteConcepto.conceptoId, concepto.id),
          eq(clienteConcepto.clienteId, profileId)
        )
      )
      .where(
        and(
          eq(empleado.clienteId, profileId),
          eq(recibo.periodo, periodoADate(periodo)),
          eq(reciboConcepto.activo, true)
        )
      )
      .orderBy(concepto.numero);

    if (rows.length === 0)
      throw new Error('Sin conceptos activos para el período');

    const lines = rows
      .filter((r) => r.codigoAfip && r.numeroSos != null)
      .map((r) => {
        const afip6 = r.codigoAfip!.padEnd(6, '0').slice(0, 6);
        const tipoPrefijo = afip6.slice(0, 2);
        const sosPadded = String(r.numeroSos).padStart(4, '0');
        const nombreNorm = normalizarNombreLsd(r.nombre)
          .slice(0, 150)
          .padEnd(150, ' ');
        const flags = flagsConceptoLsd(tipoPrefijo);
        return afip6 + '000000' + sosPadded + nombreNorm + flags;
      });

    const [year, month] = periodo.split('-');
    const filename = `conceptos_${year}_${month}_LSD.txt`;
    const contenido = lines.join('\r\n') + '\r\n';

    return { filename, contenido, conceptos: lines.length };
  });

// ─── SAC: Preview y generación masiva ────────────────────────────────────────

/**
 * Previsualiza los montos SAC de todos los empleados activos para un período dado.
 * Para cada empleado busca el mejor mes del semestre (máx. haberes + no-rem)
 * y devuelve SAC = mejor_mes / 2.
 */
export const getSacPreview = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const { periodo } = ctx.data;

    // Solo empleados que tienen un recibo de sueldo en el período SAC exacto (06 ó 12)
    // Empleados que egresaron antes del mes SAC ya liquidaron su SAC proporcional
    // en la liquidación final, por lo que no deben aparecer aquí.
    const recibosDelPeriodo = await db
      .select({
        empleadoId: recibo.empleadoId,
        haberes: recibo.haberes,
        noRemunerativo: recibo.noRemunerativo,
      })
      .from(recibo)
      .innerJoin(empleado, eq(empleado.id, recibo.empleadoId))
      .where(
        and(
          eq(empleado.clienteId, ctx.data.clientId),
          eq(empleado.activo, true),
          eq(recibo.periodo, periodoADate(periodo)),
          eq(recibo.tipo, 'mensual')
        )
      );

    if (recibosDelPeriodo.length === 0) return [];

    const empIdsConRecibo = [
      ...new Set(recibosDelPeriodo.map((r) => r.empleadoId)),
    ];

    // Datos del empleado para los que tienen recibo en el período SAC
    const empleados = await db
      .select({
        id: empleado.id,
        nombre: empleado.nombre,
        legajo: empleado.legajo,
        fechaIngreso: empleado.fechaAlta,
        fechaAlta: empleado.fechaAlta,
      })
      .from(empleado)
      .where(inArray(empleado.id, empIdsConRecibo));

    // SAC existentes en este período
    const sacExistentes = await db
      .select({ empleadoId: recibo.empleadoId })
      .from(recibo)
      .where(
        and(
          inArray(recibo.empleadoId, empIdsConRecibo),
          eq(recibo.periodo, periodoADate(periodo)),
          eq(recibo.tipo, 'sac')
        )
      );
    const sacExistenteIds = new Set(sacExistentes.map((s) => s.empleadoId));

    // Total haberes + no remunerativo por empleado en el período SAC
    // (suma quincenas si las hay)
    const totalByEmp = new Map<string, number>();
    for (const r of recibosDelPeriodo) {
      const total = Number(r.haberes) + Number(r.noRemunerativo);
      totalByEmp.set(r.empleadoId, (totalByEmp.get(r.empleadoId) ?? 0) + total);
    }

    const hoy = new Date();
    return empleados
      .map((emp) => {
        const total = totalByEmp.get(emp.id) ?? 0;
        const fechaAltaDate = emp.fechaAlta
          ? new Date(emp.fechaAlta as unknown as string)
          : null;
        const antiguedadAnios =
          fechaAltaDate && !isNaN(fechaAltaDate.getTime())
            ? Math.floor(
                (hoy.getTime() - fechaAltaDate.getTime()) /
                  (1000 * 60 * 60 * 24 * 365.25)
              )
            : null;
        return {
          empleadoId: emp.id,
          nombre: emp.nombre ?? '—',
          legajo: emp.legajo ?? '',
          fechaIngreso: emp.fechaIngreso ?? null,
          antiguedadAnios,
          mejorPeriodo: total > 0 ? periodo : null,
          mejorMonto: total,
          sacBase: total / 2,
          yaTieneSac: sacExistenteIds.has(emp.id),
        };
      })
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
  });

/**
 * Genera recibos SAC para los empleados indicados.
 * Solo inserta SOS 41 (importe fijo = SAC base). Las retenciones se calculan
 * cuando el usuario abre y guarda el recibo desde la UI.
 * Empleados que ya tienen SAC en el período son ignorados (no se sobreescribe).
 */
export const generarSacsMasivo = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
      items: z.array(
        z.object({
          empleadoId: z.string().uuid(),
          sacBase: z.number().positive(),
          /** Días trabajados en el semestre. 180 = semestre completo (usa SOS 41), < 180 = proporcional (usa SOS 42). */
          dias: z.number().int().min(1).max(180),
        })
      ),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('No se puede liquidar períodos futuros.');
    }

    const empIds = ctx.data.items.map((i) => i.empleadoId);

    // Verificar pertenencia de todos los empleados al perfil
    const empValidos = await db
      .select({ id: empleado.id })
      .from(empleado)
      .where(
        and(
          inArray(empleado.id, empIds),
          eq(empleado.clienteId, ctx.data.clientId)
        )
      );
    const empValidosSet = new Set(empValidos.map((e) => e.id));

    // SAC existentes (para omitirlos)
    const sacExistentes = await db
      .select({ empleadoId: recibo.empleadoId })
      .from(recibo)
      .where(
        and(
          inArray(recibo.empleadoId, empIds),
          eq(recibo.periodo, periodoADate(ctx.data.periodo)),
          eq(recibo.tipo, 'sac')
        )
      );
    const sacExistenteIds = new Set(sacExistentes.map((s) => s.empleadoId));

    const itemsACrear = ctx.data.items.filter(
      (i) =>
        empValidosSet.has(i.empleadoId) && !sacExistenteIds.has(i.empleadoId)
    );

    if (itemsACrear.length === 0) return { generados: 0 };

    // Cargar porcentajes de retenciones del último recibo de sueldo del semestre.
    // Permite pre-poblar 201/202/203/206/207 con los % reales del empleado.
    const RETENCION_CODES = ['201', '202', '203', '206', '207'] as const;
    const DEFAULT_PCTS: Record<string, number> = {
      '201': 11,
      '202': 3,
      '203': 3,
      '206': 2,
      '207': 0.5,
    };

    const [periodoYear, periodoMes] = ctx.data.periodo.split('-') as [
      string,
      string,
    ];
    const mes = parseInt(periodoMes, 10);
    const semStart = mes <= 6 ? 1 : 7;
    const semesterMonths = Array.from({ length: mes - semStart + 1 }, (_, i) =>
      periodoADate(`${periodoYear}-${String(semStart + i).padStart(2, '0')}`)
    );

    const saldoRecibos = await db
      .select({
        id: recibo.id,
        empleadoId: recibo.empleadoId,
        periodo: recibo.periodo,
      })
      .from(recibo)
      .where(
        and(
          inArray(recibo.empleadoId, empIds),
          inArray(recibo.periodo, semesterMonths),
          eq(recibo.tipo, 'mensual')
        )
      );

    // Recibo más reciente del semestre por empleado
    const bestReciboByEmp = new Map<string, string>();
    for (const r of [...saldoRecibos].sort((a, b) =>
      b.periodo.localeCompare(a.periodo)
    )) {
      if (!bestReciboByEmp.has(r.empleadoId))
        bestReciboByEmp.set(r.empleadoId, r.id);
    }

    // Porcentajes de retenciones desde esos recibos
    const reciboIdsRef = [...bestReciboByEmp.values()];
    const retencionRows =
      reciboIdsRef.length > 0
        ? await db
            .select({
              reciboId: reciboConcepto.reciboId,
              codigo: sql<string>`${concepto.numero}::text`,
              porcentaje: reciboConcepto.porcentaje,
            })
            .from(reciboConcepto)
            .innerJoin(concepto, eq(reciboConcepto.conceptoId, concepto.id))
            .where(
              and(
                inArray(reciboConcepto.reciboId, reciboIdsRef),
                inArray(concepto.numero, RETENCION_CODES.map(Number))
              )
            )
        : [];

    // Las líneas del recibo apuntan al catálogo por FK, no por código de texto.
    const conceptoIdPorNumero = await mapaConceptoIdPorNumero([
      '41',
      '42',
      ...RETENCION_CODES,
    ]);

    // Mapa empleadoId → { codigo → porcentaje }
    const empPcts = new Map<string, Map<string, number>>();
    for (const [empId, reciboId] of bestReciboByEmp) {
      const pcts = new Map<string, number>();
      for (const r of retencionRows.filter((x) => x.reciboId === reciboId)) {
        if (r.porcentaje !== null) pcts.set(r.codigo, Number(r.porcentaje));
      }
      empPcts.set(empId, pcts);
    }

    await db.transaction(async (tx) => {
      for (const item of itemsACrear) {
        const sacBaseStr = item.sacBase.toFixed(2);
        // SOS 41 = semestre completo, SOS 42 = proporcional
        const codigoSac = item.dias >= 180 ? '41' : '42';

        // Calcular retenciones con porcentajes del último recibo o defaults
        const pcts = empPcts.get(item.empleadoId) ?? new Map<string, number>();
        let totalRetenciones = 0;
        const retencionesAInsertar: {
          codigo: string;
          pct: number;
          monto: number;
        }[] = [];
        for (const code of RETENCION_CODES) {
          const pct = pcts.get(code) ?? DEFAULT_PCTS[code];
          const monto = Math.round(item.sacBase * (pct / 100) * 100) / 100;
          totalRetenciones += monto;
          retencionesAInsertar.push({ codigo: code, pct, monto });
        }
        const neto = Math.round((item.sacBase - totalRetenciones) * 100) / 100;

        const [ins] = await tx
          .insert(recibo)
          .values({
            orgId,
            clienteId: ctx.data.clientId,
            empleadoId: item.empleadoId,
            periodo: periodoADate(ctx.data.periodo),
            tipo: 'sac',
            haberes: sacBaseStr,
            noRemunerativo: '0',
            descuentos: '0',
            retenciones: totalRetenciones.toFixed(2),
            neto: neto.toFixed(2),
            fuente: 'calculo',
          })
          .returning({ id: recibo.id });
        if (!ins) continue;

        // Concepto principal SAC (41 o 42)
        await tx.insert(reciboConcepto).values({
          reciboId: ins.id,
          conceptoId: conceptoIdRequerido(conceptoIdPorNumero, codigoSac),
          monto: sacBaseStr,
          importe: sacBaseStr,
          cantidad: null,
          porcentaje: null,
          conceptoRef: null,
          importeMin: null,
          importeMax: null,
          pctUsado: null,
          baseUsada: sacBaseStr,
          memo: null,
        });

        // Retenciones pre-cargadas
        for (const ret of retencionesAInsertar) {
          await tx.insert(reciboConcepto).values({
            reciboId: ins.id,
            conceptoId: conceptoIdRequerido(conceptoIdPorNumero, ret.codigo),
            monto: ret.monto.toFixed(2),
            porcentaje: String(ret.pct),
            importe: null,
            cantidad: null,
            conceptoRef: null,
            importeMin: null,
            importeMax: null,
            pctUsado: String(ret.pct),
            baseUsada: sacBaseStr,
            memo: null,
          });
        }
      }
    });

    return { generados: itemsACrear.length };
  });

// ─── Liquidación Final masiva ─────────────────────────────────────────────────

export const getLiqFinalPreview = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const { periodo } = ctx.data;
    const [py, pm] = periodo.split('-') as [string, string];
    // `fecha_baja` es una columna `date`: se compara como texto YYYY-MM-DD.
    const periodoStart = periodoADate(periodo);
    const periodoEnd = new Date(parseInt(py), parseInt(pm), 0)
      .toISOString()
      .slice(0, 10);

    const empleados = await db
      .select({
        id: empleado.id,
        nombre: empleado.nombre,
        legajo: empleado.legajo,
        fechaBaja: empleado.fechaBaja,
      })
      .from(empleado)
      .where(
        and(
          eq(empleado.clienteId, ctx.data.clientId),
          or(
            eq(empleado.activo, true),
            and(
              eq(empleado.activo, false),
              isNotNull(empleado.fechaBaja),
              gte(empleado.fechaBaja, periodoStart),
              lte(empleado.fechaBaja, periodoEnd)
            )
          )
        )
      );

    if (empleados.length === 0) return [];

    const empIds = empleados.map((e) => e.id);

    const existentes = await db
      .select({ empleadoId: recibo.empleadoId })
      .from(recibo)
      .where(
        and(
          inArray(recibo.empleadoId, empIds),
          eq(recibo.periodo, periodoADate(periodo)),
          eq(recibo.tipo, 'liquidacion_final')
        )
      );
    const existentesIds = new Set(existentes.map((s) => s.empleadoId));

    return empleados
      .map((emp) => ({
        empleadoId: emp.id,
        nombre: emp.nombre ?? '—',
        legajo: emp.legajo ?? '',
        yaTiene: existentesIds.has(emp.id),
      }))
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));
  });

export const generarLiqFinalMasivo = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      clientId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
      items: z.array(
        z.object({
          empleadoId: z.string().uuid(),
          /** Fecha de baja en formato YYYY-MM-DD. */
          fechaBaja: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          /** Días trabajados en el mes (= día de la fecha de baja). */
          diasTrabajados: z.number().int().min(1).max(31),
        })
      ),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('No se puede liquidar períodos futuros.');
    }

    // Validar que ninguna fecha de baja supere el período de liquidación
    const [periodoY, periodoM] = ctx.data.periodo.split('-') as [
      string,
      string,
    ];
    const periodoMaxFecha = new Date(parseInt(periodoY), parseInt(periodoM), 0); // último día del mes
    for (const item of ctx.data.items) {
      const fechaBajaDate = new Date(item.fechaBaja + 'T00:00:00');
      if (fechaBajaDate > periodoMaxFecha) {
        throw new Error(
          `La fecha de baja ${item.fechaBaja} es posterior al período ${ctx.data.periodo}.`
        );
      }
    }

    const empIds = ctx.data.items.map((i) => i.empleadoId);

    const empValidos = await db
      .select({ id: empleado.id })
      .from(empleado)
      .where(
        and(
          inArray(empleado.id, empIds),
          eq(empleado.clienteId, ctx.data.clientId)
        )
      );
    const empValidosSet = new Set(empValidos.map((e) => e.id));

    const existentes = await db
      .select({ empleadoId: recibo.empleadoId })
      .from(recibo)
      .where(
        and(
          inArray(recibo.empleadoId, empIds),
          eq(recibo.periodo, periodoADate(ctx.data.periodo)),
          eq(recibo.tipo, 'liquidacion_final')
        )
      );
    const existentesIds = new Set(existentes.map((s) => s.empleadoId));

    const itemsACrear = ctx.data.items.filter(
      (i) => empValidosSet.has(i.empleadoId) && !existentesIds.has(i.empleadoId)
    );

    if (itemsACrear.length === 0) return { generados: 0 };

    await db.transaction(async (tx) => {
      for (const item of itemsACrear) {
        await tx.insert(recibo).values({
          orgId,
          clienteId: ctx.data.clientId,
          empleadoId: item.empleadoId,
          periodo: periodoADate(ctx.data.periodo),
          tipo: 'liquidacion_final',
          haberes: '0',
          noRemunerativo: '0',
          descuentos: '0',
          retenciones: '0',
          neto: '0',
          diasTrabajados: item.diasTrabajados,
          fecha: item.fechaBaja.slice(0, 10),
          fuente: 'calculo',
        });
        // Sincronizar fechaBaja y activo en el empleado si no estaba registrado aún
        await tx
          .update(empleado)
          .set({ fechaBaja: item.fechaBaja.slice(0, 10), activo: false })
          .where(
            and(eq(empleado.id, item.empleadoId), isNull(empleado.fechaBaja))
          );
      }
    });

    return { generados: itemsACrear.length };
  });
