import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  client,
  profile,
  lsdConceptoAfip,
  lsdPerfilConcepto,
  conceptoSos,
  conceptoSosProfile,
  payrollConvenio,
  payrollConvenioCategoria,
  payrollEscala,
  payrollConcepto,
  afipEmpleadoresConvenio,
  liquidacionImportEmpleado,
  liquidacionImportRecibo,
  liquidacionImportConceptoValor,
  obraSocial,
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
  gte,
  inArray,
  sql,
} from 'drizzle-orm';

/** Verifica que el cliente pertenezca a la org. y tenga al menos un perfil con liquidación de sueldos habilitada. */
async function ensureClientBelongsToOrg(
  clientId: string,
  orgId: string
): Promise<void> {
  const [c] = await db
    .select({ id: client.id })
    .from(client)
    .innerJoin(
      profile,
      and(eq(profile.client, client.id), eq(profile.liquidaSueldos, true))
    )
    .where(and(eq(client.id, clientId), eq(client.organizationId, orgId)))
    .limit(1);
  if (!c) {
    throw new Error(
      'Cliente no encontrado, no autorizado o sin liquidación de sueldos habilitada'
    );
  }
}

async function ensureProfileBelongsToClient(
  profileId: string,
  clientId: string
): Promise<void> {
  const [p] = await db
    .select({ id: profile.id })
    .from(profile)
    .where(and(eq(profile.id, profileId), eq(profile.client, clientId)))
    .limit(1);
  if (!p) throw new Error('Perfil no encontrado o no autorizado');
}

/** Perfil que liquida sueldos para el cliente (preferido si viene informado). */
async function resolveSueldosProfileId(
  clientId: string,
  orgId: string,
  preferredProfileId?: string | null
): Promise<string> {
  if (preferredProfileId) {
    await ensureProfileBelongsToClient(preferredProfileId, clientId);
    const [p] = await db
      .select({ id: profile.id })
      .from(profile)
      .where(
        and(
          eq(profile.id, preferredProfileId),
          eq(profile.client, clientId),
          eq(profile.liquidaSueldos, true)
        )
      )
      .limit(1);
    if (!p) {
      throw new Error(
        'El perfil indicado no tiene liquidación de sueldos habilitada para este cliente'
      );
    }
    return p.id;
  }
  const [p] = await db
    .select({ id: profile.id })
    .from(profile)
    .innerJoin(client, eq(profile.client, client.id))
    .where(
      and(
        eq(client.id, clientId),
        eq(client.organizationId, orgId),
        eq(profile.liquidaSueldos, true)
      )
    )
    .orderBy(asc(profile.name))
    .limit(1);
  if (!p) {
    throw new Error(
      'No hay ningún perfil con liquidación de sueldos para este cliente'
    );
  }
  return p.id;
}

/** Misma fila unificada (`liquidacion_import_empleado`) para importados y carga con convenio. */
async function upsertLiquidacionEmpleadoForPayrollRow(input: {
  profileId: string;
  cuil: string;
  nombreCompleto: string;
  legajo: string;
  fechaAlta: Date;
  origen: 'import' | 'manual';
  convenioId: string;
  categoriaId: string;
  tipoJornada: 'full_time' | 'part_time' | 'reducida';
  activo: boolean;
}): Promise<string> {
  const [existing] = await db
    .select({ id: liquidacionImportEmpleado.id })
    .from(liquidacionImportEmpleado)
    .where(
      and(
        eq(liquidacionImportEmpleado.profileId, input.profileId),
        eq(liquidacionImportEmpleado.cuil, input.cuil)
      )
    )
    .limit(1);

  const campos = {
    nombre: input.nombreCompleto,
    legajo: input.legajo,
    fechaAlta: input.fechaAlta,
    convenioId: input.convenioId,
    categoriaId: input.categoriaId,
    tipoJornada: input.tipoJornada,
    origen: input.origen,
    activo: input.activo,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(liquidacionImportEmpleado)
      .set(campos)
      .where(eq(liquidacionImportEmpleado.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db
    .insert(liquidacionImportEmpleado)
    .values({
      profileId: input.profileId,
      cuil: input.cuil,
      ...campos,
    })
    .returning({ id: liquidacionImportEmpleado.id });

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

import {
  evaluatePayrollFormula,
  roundMoney,
  type PayrollFormulaContext,
} from '../lib/payroll-formula';
import { puedeLiquidarPeriodo } from '../lib/payroll-period-rules';
import { format, differenceInYears, parseISO } from 'date-fns';

function getPeriodKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

// ---------- Convenios ----------

export const listConvenios = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const convenios = await db
      .select()
      .from(payrollConvenio)
      .where(eq(payrollConvenio.clientId, ctx.data.clientId))
      .orderBy(payrollConvenio.nombre);

    if (!ctx.data.profileId) return convenios;

    await ensureProfileBelongsToClient(ctx.data.profileId, ctx.data.clientId);
    const conveniosAfip = await db
      .select({ cct: afipEmpleadoresConvenio.cct })
      .from(afipEmpleadoresConvenio)
      .where(eq(afipEmpleadoresConvenio.profileId, ctx.data.profileId));

    const cctSet = new Set(
      conveniosAfip
        .map((row) => extractCctCodigo(row.cct))
        .filter((value): value is string => Boolean(value))
    );
    if (cctSet.size === 0) return [];

    return convenios.filter((convenio) => {
      const candidates = [
        convenio.cctCodigo,
        extractCctCodigo(convenio.nombre),
        extractCctCodigo(convenio.descripcion),
      ].filter((v): v is string => Boolean(v));
      return candidates.some((cct) => cctSet.has(cct));
    });
  });

export const createConvenio = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      nombre: z.string().min(1),
      descripcion: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .insert(payrollConvenio)
      .values({
        clientId: ctx.data.clientId,
        nombre: ctx.data.nombre,
        cctCodigo: extractCctCodigo(ctx.data.nombre),
        descripcion: ctx.data.descripcion ?? null,
      })
      .returning();
    return row;
  });

export const updateConvenio = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      clientId: z.string().uuid(),
      nombre: z.string().min(1),
      descripcion: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .update(payrollConvenio)
      .set({
        nombre: ctx.data.nombre,
        cctCodigo: extractCctCodigo(ctx.data.nombre),
        descripcion: ctx.data.descripcion ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payrollConvenio.id, ctx.data.id),
          eq(payrollConvenio.clientId, ctx.data.clientId)
        )
      )
      .returning();
    return row;
  });

export const deleteConvenio = createServerFn({ method: 'POST' })
  .inputValidator(
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
      .select({ id: liquidacionImportEmpleado.id })
      .from(liquidacionImportEmpleado)
      .where(eq(liquidacionImportEmpleado.convenioId, ctx.data.id))
      .limit(1);
    if (emp) {
      throw new Error(
        'No se puede eliminar el convenio: tiene empleados asignados. Reasigne o elimine los empleados primero.'
      );
    }
    await db
      .delete(payrollConvenio)
      .where(
        and(
          eq(payrollConvenio.id, ctx.data.id),
          eq(payrollConvenio.clientId, ctx.data.clientId)
        )
      );
    return { ok: true };
  });

/** Convenios CCT scrapeados desde AFIP (Simplificación Registral - Empleadores). */
export const listConveniosAfipEmpleadores = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const rows = await db
      .select({
        id: afipEmpleadoresConvenio.id,
        profileId: afipEmpleadoresConvenio.profileId,
        cct: afipEmpleadoresConvenio.cct,
        actividad: afipEmpleadoresConvenio.actividad,
        signatarios: afipEmpleadoresConvenio.signatarios,
        fechaNovedad: afipEmpleadoresConvenio.fechaNovedad,
        updatedAt: afipEmpleadoresConvenio.updatedAt,
      })
      .from(afipEmpleadoresConvenio)
      .innerJoin(profile, eq(afipEmpleadoresConvenio.profileId, profile.id))
      .where(eq(profile.client, ctx.data.clientId))
      .orderBy(desc(afipEmpleadoresConvenio.updatedAt));

    // Unificamos por CCT a nivel cliente para no duplicar convenios
    // cuando existen varios perfiles del mismo cliente con el mismo CCT.
    const byCct = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const key = row.cct.trim().replace(/\s+/g, ' ');
      if (!byCct.has(key)) byCct.set(key, row);
    }
    return Array.from(byCct.values());
  });

/** Lista conceptos unificados SOS + AFIP por perfil, incluyendo subsistemas. */
export const listConceptosByPerfil = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureProfileBelongsToClient(ctx.data.profileId, ctx.data.clientId);

    return db
      .select({
        afipCodigo: lsdConceptoAfip.codigoAfip,
        afipNombre: lsdConceptoAfip.descripcion,
        codigoContribuyente: lsdPerfilConcepto.codigoContribuyente,
        descripcionContribuyente: lsdPerfilConcepto.descripcionContribuyente,
        marcaRepetible: lsdPerfilConcepto.marcaRepetible,
        codigoSos: conceptoSos.codigo,
        nombreSos: conceptoSos.nombre,
        sosVinculadoPerfil: sql<boolean>`${conceptoSosProfile.id} is not null`,
        aportesSipa: lsdPerfilConcepto.aportesSipa,
        contribucionesSipa: lsdPerfilConcepto.contribucionesSipa,
        aportesInssjyp: lsdPerfilConcepto.aportesInssjyp,
        contribucionesInssjyp: lsdPerfilConcepto.contribucionesInssjyp,
        aportesObraSocial: lsdPerfilConcepto.aportesObraSocial,
        contribucionesObraSocial: lsdPerfilConcepto.contribucionesObraSocial,
        aportesFsr: lsdPerfilConcepto.aportesFsr,
        contribucionesFsr: lsdPerfilConcepto.contribucionesFsr,
        aportesRenatea: lsdPerfilConcepto.aportesRenatea,
        contribucionesRenatea: lsdPerfilConcepto.contribucionesRenatea,
        contribucionesAaff: lsdPerfilConcepto.contribucionesAaff,
        contribucionesFne: lsdPerfilConcepto.contribucionesFne,
        contribucionesLrt: lsdPerfilConcepto.contribucionesLrt,
        aportesDiferenciales: lsdPerfilConcepto.aportesDiferenciales,
        aportesEspeciales: lsdPerfilConcepto.aportesEspeciales,
      })
      .from(lsdPerfilConcepto)
      .innerJoin(
        lsdConceptoAfip,
        eq(lsdPerfilConcepto.conceptoAfipId, lsdConceptoAfip.id)
      )
      .leftJoin(
        conceptoSos,
        and(
          eq(conceptoSos.conceptoAfipId, lsdPerfilConcepto.conceptoAfipId),
          eq(conceptoSos.codigo, lsdPerfilConcepto.codigoContribuyente)
        )
      )
      .leftJoin(
        conceptoSosProfile,
        and(
          eq(conceptoSosProfile.conceptoId, conceptoSos.id),
          eq(conceptoSosProfile.profileId, lsdPerfilConcepto.profileId)
        )
      )
      .where(eq(lsdPerfilConcepto.profileId, ctx.data.profileId))
      .orderBy(lsdPerfilConcepto.codigoContribuyente);
  });

/** Crea un `payroll_convenio` para el cliente a partir del CCT scrapeado desde AFIP. */
export const agregarConvenioDesdeAfipEmpleadores = createServerFn({
  method: 'POST',
})
  .inputValidator(
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
        id: afipEmpleadoresConvenio.id,
        profileId: afipEmpleadoresConvenio.profileId,
        cct: afipEmpleadoresConvenio.cct,
        actividad: afipEmpleadoresConvenio.actividad,
        signatarios: afipEmpleadoresConvenio.signatarios,
        fechaNovedad: afipEmpleadoresConvenio.fechaNovedad,
      })
      .from(afipEmpleadoresConvenio)
      .innerJoin(profile, eq(afipEmpleadoresConvenio.profileId, profile.id))
      .where(
        and(
          eq(profile.client, ctx.data.clientId),
          eq(afipEmpleadoresConvenio.id, ctx.data.afipConvenioId)
        )
      )
      .limit(1);

    if (!afipRow)
      throw new Error('Convenio AFIP no encontrado o no autorizado');

    const [existing] = await db
      .select({ id: payrollConvenio.id })
      .from(payrollConvenio)
      .where(
        and(
          eq(payrollConvenio.clientId, ctx.data.clientId),
          eq(payrollConvenio.nombre, afipRow.cct)
        )
      )
      .limit(1);

    if (existing) {
      return {
        ok: true,
        created: false,
        message: 'El cliente ya tiene este convenio (CCT).',
      };
    }

    const descripcion = [
      `AFIP CCT: ${afipRow.cct}`,
      `Actividad: ${afipRow.actividad}`,
      `Signatarios: ${afipRow.signatarios}`,
      `Fecha novedad: ${afipRow.fechaNovedad}`,
    ].join('\n');

    const [inserted] = await db
      .insert(payrollConvenio)
      .values({
        clientId: ctx.data.clientId,
        nombre: extractCctCodigo(afipRow.cct) ?? afipRow.cct,
        cctCodigo: extractCctCodigo(afipRow.cct),
        descripcion,
      })
      .returning({ id: payrollConvenio.id });

    if (!inserted) throw new Error('Error al crear convenio');

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
  .inputValidator(
    z.object({ convenioId: z.string().uuid(), clientId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    return db
      .select()
      .from(payrollConvenioCategoria)
      .where(eq(payrollConvenioCategoria.convenioId, ctx.data.convenioId))
      .orderBy(payrollConvenioCategoria.orden, payrollConvenioCategoria.codigo);
  });

export const createCategoria = createServerFn({ method: 'POST' })
  .inputValidator(
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
      .insert(payrollConvenioCategoria)
      .values({
        convenioId: ctx.data.convenioId,
        codigo: ctx.data.codigo,
        nombre: ctx.data.nombre,
        orden: ctx.data.orden ?? 0,
      })
      .returning();
    return row;
  });

// ---------- Escalas salariales ----------

export const listEscalasByCategoria = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ categoriaId: z.string().uuid(), clientId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    return db
      .select()
      .from(payrollEscala)
      .where(eq(payrollEscala.categoriaId, ctx.data.categoriaId))
      .orderBy(desc(payrollEscala.vigenciaDesde));
  });

/** Elimina una escala salarial. Verifica que pertenezca al cliente vía categoría → convenio. */
export const deleteEscala = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ escalaId: z.string().uuid(), clientId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .select({ id: payrollEscala.id })
      .from(payrollEscala)
      .innerJoin(
        payrollConvenioCategoria,
        eq(payrollEscala.categoriaId, payrollConvenioCategoria.id)
      )
      .innerJoin(
        payrollConvenio,
        eq(payrollConvenioCategoria.convenioId, payrollConvenio.id)
      )
      .where(
        and(
          eq(payrollEscala.id, ctx.data.escalaId),
          eq(payrollConvenio.clientId, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!row) throw new Error('Escala no encontrada o no autorizada');
    await db
      .delete(payrollEscala)
      .where(eq(payrollEscala.id, ctx.data.escalaId));
    return { ok: true };
  });

export const upsertEscala = createServerFn({ method: 'POST' })
  .inputValidator(
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
      .insert(payrollEscala)
      .values({
        categoriaId: ctx.data.categoriaId,
        vigenciaDesde: parseISO(ctx.data.vigenciaDesde),
        vigenciaHasta: ctx.data.vigenciaHasta
          ? parseISO(ctx.data.vigenciaHasta)
          : null,
        montoBasico: String(ctx.data.montoBasico),
        montoNoRemunerativo: String(ctx.data.montoNoRemunerativo ?? 0),
        periodoLabel: ctx.data.periodoLabel ?? null,
        fuente: ctx.data.fuente ?? null,
      })
      .returning();
    return row;
  });

async function getBasicoVigenteInternal(
  categoriaId: string,
  fechaStr: string
): Promise<number> {
  const fecha = parseISO(fechaStr.length === 7 ? fechaStr + '-01' : fechaStr);
  const [escala] = await db
    .select()
    .from(payrollEscala)
    .where(
      and(
        eq(payrollEscala.categoriaId, categoriaId),
        lte(payrollEscala.vigenciaDesde, fecha),
        or(
          isNull(payrollEscala.vigenciaHasta),
          gte(payrollEscala.vigenciaHasta, fecha)
        )
      )
    )
    .orderBy(desc(payrollEscala.vigenciaDesde))
    .limit(1);
  return escala ? Number(escala.montoBasico) : 0;
}

/** Obtiene el básico vigente para una categoría en una fecha */
export const getBasicoVigente = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      categoriaId: z.string().uuid(),
      fecha: z.string(), // YYYY-MM-DD o YYYY-MM
    })
  )
  .handler(async (ctx) =>
    getBasicoVigenteInternal(ctx.data.categoriaId, ctx.data.fecha)
  );

// ---------- Conceptos salariales ----------

export const listConceptos = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    return db
      .select()
      .from(payrollConcepto)
      .where(eq(payrollConcepto.clientId, ctx.data.clientId))
      .orderBy(payrollConcepto.orden, payrollConcepto.codigo);
  });

export const createConcepto = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      codigo: z.string().min(1),
      nombre: z.string().min(1),
      tipo: z.enum(['remunerativo', 'no_remunerativo', 'descuento']),
      baseCalculo: z.string().optional(),
      formula: z.string().min(1),
      esPorcentaje: z.boolean().optional(),
      orden: z.number().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .insert(payrollConcepto)
      .values({
        clientId: ctx.data.clientId,
        codigo: ctx.data.codigo,
        nombre: ctx.data.nombre,
        tipo: ctx.data.tipo,
        baseCalculo: (ctx.data.baseCalculo ?? 'basico') as
          | 'basico'
          | 'bruto'
          | 'total_remunerativo'
          | 'total_no_remunerativo'
          | 'total_descuentos'
          | 'neto'
          | 'fijo'
          | 'custom',
        formula: ctx.data.formula,
        esPorcentaje: ctx.data.esPorcentaje ?? true,
        orden: ctx.data.orden ?? 0,
      })
      .returning();
    return row;
  });

export const updateConcepto = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      clientId: z.string().uuid(),
      codigo: z.string().min(1).optional(),
      nombre: z.string().min(1).optional(),
      tipo: z.enum(['remunerativo', 'no_remunerativo', 'descuento']).optional(),
      baseCalculo: z.string().optional(),
      formula: z.string().min(1).optional(),
      esPorcentaje: z.boolean().optional(),
      orden: z.number().optional(),
      activo: z.boolean().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const { id, clientId, ...rest } = ctx.data;
    const set: Record<string, unknown> = { updatedAt: new Date(), ...rest };
    const [row] = await db
      .update(payrollConcepto)
      .set(set)
      .where(
        and(eq(payrollConcepto.id, id), eq(payrollConcepto.clientId, clientId))
      )
      .returning();
    return row;
  });

export const deleteConcepto = createServerFn({ method: 'POST' })
  .inputValidator(
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
      .delete(payrollConcepto)
      .where(
        and(
          eq(payrollConcepto.id, ctx.data.id),
          eq(payrollConcepto.clientId, ctx.data.clientId)
        )
      );
    return { ok: true };
  });

// ---------- Empleados ----------

export const listEmpleados = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({
        empleado: liquidacionImportEmpleado,
        convenioNombre: payrollConvenio.nombre,
        categoriaNombre: payrollConvenioCategoria.nombre,
      })
      .from(liquidacionImportEmpleado)
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .leftJoin(
        payrollConvenio,
        eq(liquidacionImportEmpleado.convenioId, payrollConvenio.id)
      )
      .leftJoin(
        payrollConvenioCategoria,
        eq(liquidacionImportEmpleado.categoriaId, payrollConvenioCategoria.id)
      )
      .where(eq(profile.client, ctx.data.clientId))
      .orderBy(liquidacionImportEmpleado.nombre);
    return rows;
  });

/** Empleados importados desde Excel LSD (filtrados por perfil seleccionado). */
export const listImportEmpleados = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ clientId: z.string().uuid(), profileId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({
        empleado: liquidacionImportEmpleado,
        profileName: profile.name,
        profileIdentityNumber: profile.identityNumber,
        convenioNombre: payrollConvenio.nombre,
        categoriaNombre: payrollConvenioCategoria.nombre,
      })
      .from(liquidacionImportEmpleado)
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .leftJoin(payrollConvenio, eq(liquidacionImportEmpleado.convenioId, payrollConvenio.id))
      .leftJoin(payrollConvenioCategoria, eq(liquidacionImportEmpleado.categoriaId, payrollConvenioCategoria.id))
      .where(
        and(
          eq(profile.client, ctx.data.clientId),
          eq(liquidacionImportEmpleado.profileId, ctx.data.profileId)
        )
      )
      .orderBy(
        sql`(CASE WHEN ${liquidacionImportEmpleado.legajo} ~ '^[0-9]+$' THEN (${liquidacionImportEmpleado.legajo})::bigint END) NULLS LAST`,
        asc(liquidacionImportEmpleado.nombre)
      );
    return rows;
  });

// ── Helpers de normalización (misma lógica que map-import-empleados-a-convenios.ts) ──

function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
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

function scoreCat(importCat: string, target: { codigo: string; nombre: string }): number {
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
  .inputValidator(z.object({ clientId: z.string().uuid(), profileId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureProfileBelongsToClient(ctx.data.profileId, ctx.data.clientId);

    // 1. CCTs del perfil
    const afipRows = await db
      .select({ cct: afipEmpleadoresConvenio.cct })
      .from(afipEmpleadoresConvenio)
      .where(eq(afipEmpleadoresConvenio.profileId, ctx.data.profileId));

    const cctSet = new Set(
      afipRows.map((r) => extractCct(r.cct)).filter((c): c is string => Boolean(c))
    );

    // 2. Convenios del cliente que coinciden con algún CCT del perfil
    const conveniosClient = await db
      .select()
      .from(payrollConvenio)
      .where(eq(payrollConvenio.clientId, ctx.data.clientId));

    const conveniosFiltrados = cctSet.size > 0
      ? conveniosClient.filter((conv) => {
          const posibles = [conv.cctCodigo, extractCct(conv.nombre), extractCct(conv.descripcion)]
            .filter((v): v is string => Boolean(v));
          return posibles.some((c) => cctSet.has(c));
        })
      : conveniosClient; // si no hay CCT registrado, usar todos los del cliente

    if (conveniosFiltrados.length === 0) {
      return { actualizados: 0, sinMatch: 0, mensaje: 'No se encontraron convenios para el perfil' };
    }

    // 3. Categorías de cada convenio
    const catsByConvenio = new Map<string, Array<{ id: string; codigo: string; nombre: string }>>();
    for (const conv of conveniosFiltrados) {
      const cats = await db
        .select({ id: payrollConvenioCategoria.id, codigo: payrollConvenioCategoria.codigo, nombre: payrollConvenioCategoria.nombre })
        .from(payrollConvenioCategoria)
        .where(eq(payrollConvenioCategoria.convenioId, conv.id));
      catsByConvenio.set(conv.id, cats);
    }

    // 4. Empleados del perfil sin convenio asignado
    const empleados = await db
      .select()
      .from(liquidacionImportEmpleado)
      .where(
        and(
          eq(liquidacionImportEmpleado.profileId, ctx.data.profileId),
          isNull(liquidacionImportEmpleado.convenioId)
        )
      );

    let actualizados = 0;
    let sinMatch = 0;

    for (const emp of empleados) {
      const catText = emp.categoria ?? '';
      let best: { convenioId: string; categoriaId: string; score: number } | null = null;

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
        const catGerente = catsFallback.find((c) => canonicalizeCat(c.nombre) === 'gerente') ?? catsFallback[0];
        if (!catGerente) { sinMatch++; continue; }
        best = { convenioId: convFallback.id, categoriaId: catGerente.id, score: 0 };
      }

      await db
        .update(liquidacionImportEmpleado)
        .set({ convenioId: best.convenioId, categoriaId: best.categoriaId, updatedAt: new Date() })
        .where(eq(liquidacionImportEmpleado.id, emp.id));
      actualizados++;
    }

    return { actualizados, sinMatch, mensaje: `${actualizados} empleados vinculados, ${sinMatch} sin match.` };
  });

/** Crea un empleado manualmente en la tabla unificada. */
export const createManualEmpleado = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      cuil: z.string().min(1),
      legajo: z.string().min(1),
      nombre: z.string().min(1),
      fechaAlta: z.string().optional(),
      fechaBaja: z.string().optional(),
      modoContrato: z.string().optional(),
      categoria: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureProfileBelongsToClient(ctx.data.profileId, ctx.data.clientId);

    const [row] = await db
      .insert(liquidacionImportEmpleado)
      .values({
        profileId: ctx.data.profileId,
        cuil: ctx.data.cuil,
        legajo: ctx.data.legajo,
        nombre: ctx.data.nombre,
        fechaAlta: ctx.data.fechaAlta ? new Date(ctx.data.fechaAlta) : null,
        fechaBaja: ctx.data.fechaBaja ? new Date(ctx.data.fechaBaja) : null,
        modoContrato: ctx.data.modoContrato ?? null,
        categoria: ctx.data.categoria ?? null,
        origen: 'manual',
      })
      .returning();
    return row;
  });

/** Elimina un empleado creado manualmente (origen = 'manual'). */
export const deleteManualEmpleado = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ clientId: z.string().uuid(), empleadoId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const [row] = await db
      .delete(liquidacionImportEmpleado)
      .where(
        and(
          eq(liquidacionImportEmpleado.id, ctx.data.empleadoId),
          eq(liquidacionImportEmpleado.origen, 'manual')
        )
      )
      .returning();
    if (!row) throw new Error('Empleado no encontrado o no es manual');
    return { ok: true };
  });

/** Empleados del perfil con su configuración de liquidación. */
export const listImportEmpleadosConConfig = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ clientId: z.string().uuid(), profileId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const rows = await db
      .select({
        empleado: liquidacionImportEmpleado,
      })
      .from(liquidacionImportEmpleado)
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(profile.client, ctx.data.clientId),
          eq(liquidacionImportEmpleado.profileId, ctx.data.profileId)
        )
      )
      .orderBy(
        sql`(CASE WHEN ${liquidacionImportEmpleado.legajo} ~ '^[0-9]+$' THEN (${liquidacionImportEmpleado.legajo})::bigint END) NULLS LAST`,
        asc(liquidacionImportEmpleado.nombre)
      );

    return rows;
  });

/** Recibos importados por período (para selector en solapa Recibo). */
export const listImportRecibosByPeriodo = createServerFn({ method: 'GET' })
  .inputValidator(
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
        recibo: liquidacionImportRecibo,
        empleadoNombre: liquidacionImportEmpleado.nombre,
        empleadoCuil: liquidacionImportEmpleado.cuil,
        empleadoLegajo: liquidacionImportEmpleado.legajo,
      })
      .from(liquidacionImportRecibo)
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
      )
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(profile.client, ctx.data.clientId),
          eq(liquidacionImportRecibo.periodo, ctx.data.periodo)
        )
      )
      .orderBy(asc(liquidacionImportEmpleado.nombre));
    return rows;
  });

/** Detalle de un recibo importado + conceptos LSD. */
export const getImportReciboDetalle = createServerFn({ method: 'GET' })
  .inputValidator(
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
        recibo: liquidacionImportRecibo,
        empleado: liquidacionImportEmpleado,
      })
      .from(liquidacionImportRecibo)
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
      )
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(liquidacionImportRecibo.id, ctx.data.reciboId),
          eq(profile.client, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!row) throw new Error('Recibo no encontrado o no autorizado');
    const conceptos = await db
      .select()
      .from(liquidacionImportConceptoValor)
      .where(eq(liquidacionImportConceptoValor.reciboId, ctx.data.reciboId))
      .orderBy(asc(liquidacionImportConceptoValor.codigo));
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

const tipoReciboReciboSchema = z.enum([
  'sueldo',
  'anticipo',
  'SAC',
  'vacaciones',
  'despido',
  'comisiones',
  'desempleo',
  'varios',
]);

/** Crea la cabecera de liquidación (paso previo al cálculo en el simulador). */
export const createReciboHeader = createServerFn({ method: 'POST' })
  .inputValidator(
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
        formaPago: z.enum(['efectivo', 'cheque', 'acreditacion']),
        cbu: z.string().optional().nullable(),
        banco: z.string().optional().nullable(),
        periodoCargas: z.string().min(1),
        fechaDepositoCargas: z.string().optional().nullable(),
        observacionInterna: z.string().optional().nullable(),
        observacionRecibo: z.string().optional().nullable(),
        copiarUltimoRecibo: z.boolean(),
      })
      .superRefine((data, ctx) => {
        if (data.formaPago === 'acreditacion') {
          const c = (data.cbu ?? '').replace(/\D/g, '');
          if (c.length < 22) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'CBU obligatorio (22 dígitos) si la forma de pago es acreditación',
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
      throw new Error('Solo se puede liquidar el mes anterior al en curso.');
    }

    const [empConfig] = await db
      .select({ id: liquidacionImportEmpleado.id, convenioId: liquidacionImportEmpleado.convenioId })
      .from(liquidacionImportEmpleado)
      .where(eq(liquidacionImportEmpleado.id, ctx.data.importEmpleadoId))
      .limit(1);
    if (!empConfig?.convenioId) {
      throw new Error(
        'Este empleado no tiene configuración de liquidación. Asigná convenio y categoría primero.'
      );
    }

    const empleadoId = empConfig.id;

    await db
      .delete(liquidacionImportRecibo)
      .where(
        and(
          eq(liquidacionImportRecibo.empleadoId, empleadoId),
          eq(liquidacionImportRecibo.periodo, ctx.data.periodo)
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
        .from(liquidacionImportRecibo)
        .where(
          and(
            eq(liquidacionImportRecibo.empleadoId, empleadoId),
            eq(liquidacionImportRecibo.tipo, ctx.data.tipoRecibo)
          )
        )
        .orderBy(desc(liquidacionImportRecibo.calculadoAt))
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

    const fechaLiq = parseISO(ctx.data.fechaLiquidacion.slice(0, 10));
    const fechaPago = parseISO(ctx.data.fechaPago.slice(0, 10));
    const fechaDep = ctx.data.fechaDepositoCargas
      ? parseISO(ctx.data.fechaDepositoCargas.slice(0, 10))
      : null;

    const [liq] = await db
      .insert(liquidacionImportRecibo)
      .values({
        empleadoId,
        periodo: ctx.data.periodo,
        basico,
        haberes,
        noRemunerativo,
        descuentos,
        retenciones: '0',
        neto,
        tipo: ctx.data.tipoRecibo,
        quincena: ctx.data.quincena,
        fecha: fechaLiq,
        obraSocialId: ctx.data.obraSocialId ?? null,
        fechaPago,
        lugarPago: ctx.data.lugarPago?.trim() || null,
        formaPago: ctx.data.formaPago,
        cbu: ctx.data.cbu?.trim() || null,
        banco: ctx.data.banco?.trim() || null,
        periodoCargas: ctx.data.periodoCargas,
        fechaDepositoCargas: fechaDep,
        observacionInterna: ctx.data.observacionInterna?.trim() || null,
        observacionRecibo: ctx.data.observacionRecibo?.trim() || null,
        reciboConfirmado: false,
        origen: 'generado',
      })
      .returning();

    if (!liq) throw new Error('No se pudo crear la cabecera del recibo');

    if (prevId) {
      const detallesPrev = await db
        .select()
        .from(liquidacionImportConceptoValor)
        .where(eq(liquidacionImportConceptoValor.reciboId, prevId));
      for (const d of detallesPrev) {
        await db.insert(liquidacionImportConceptoValor).values({
          reciboId: liq.id,
          codigo: d.codigo,
          conceptoId: d.conceptoId ?? null,
          monto: String(d.monto),
          cantidad: d.cantidad != null ? String(d.cantidad) : null,
          porcentaje: d.porcentaje ?? null,
          importeConceptoNumero: d.importeConceptoNumero ?? null,
          importeOverride: d.importeOverride ?? null,
          importeMinimo: d.importeMinimo ?? null,
          importeMaximo: d.importeMaximo ?? null,
          activoEnRecibo: d.activoEnRecibo ?? true,
          memo: d.memo ?? null,
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid().optional(),
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
    const profileId = await resolveSueldosProfileId(
      ctx.data.clientId,
      orgId,
      ctx.data.profileId
    );
    const cuilNorm =
      String(ctx.data.cuilCuil)
        .trim()
        .replace(/\D/g, '')
        .slice(-11) || ctx.data.cuilCuil.trim();
    const nombreCompleto =
      `${ctx.data.nombre} ${ctx.data.apellido}`.trim();
    const legajo = (ctx.data.legajo?.trim() || '').trim() || '';
    const tipoJornada = ctx.data.tipoJornada ?? 'full_time';
    const fechaIngreso = parseISO(ctx.data.fechaIngreso);

    const importEmpleadoId = await upsertLiquidacionEmpleadoForPayrollRow({
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
      .from(liquidacionImportEmpleado)
      .where(eq(liquidacionImportEmpleado.id, importEmpleadoId))
      .limit(1);
    return row;
  });

/** Carga masiva de empleados. convenioNombre y categoriaCodigo se resuelven a IDs del cliente. */
export const createEmpleadosMasivo = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid().optional(),
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
    const profileId = await resolveSueldosProfileId(
      ctx.data.clientId,
      orgId,
      ctx.data.profileId
    );

    const convenios = await db
      .select()
      .from(payrollConvenio)
      .where(eq(payrollConvenio.clientId, ctx.data.clientId));
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
          id: payrollConvenioCategoria.id,
          codigo: payrollConvenioCategoria.codigo,
        })
        .from(payrollConvenioCategoria)
        .where(eq(payrollConvenioCategoria.convenioId, c.id));
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
        const fechaIngreso = parseISO(e.fechaIngreso);
        const nombreCompleto = `${e.nombre.trim()} ${e.apellido.trim()}`.trim();

        await upsertLiquidacionEmpleadoForPayrollRow({
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
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      clientId: z.string().uuid(),
      nombre: z.string().min(1).optional(),
      apellido: z.string().min(1).optional(),
      cuilCuil: z.string().optional(),
      fechaIngreso: z.string().optional(),
      convenioId: z.string().uuid().optional(),
      categoriaId: z.string().uuid().optional(),
      tipoJornada: z.enum(['full_time', 'part_time', 'reducida']).optional(),
      activo: z.boolean().optional(),
      legajo: z.string().optional().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    // Verify employee belongs to client via profile
    const [empCheck] = await db
      .select({ id: liquidacionImportEmpleado.id })
      .from(liquidacionImportEmpleado)
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(liquidacionImportEmpleado.id, ctx.data.id),
          eq(profile.client, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!empCheck) throw new Error('Empleado no encontrado o no autorizado');

    const set: Record<string, unknown> = { updatedAt: new Date() };
    const { nombre, apellido, cuilCuil, fechaIngreso, convenioId, categoriaId, tipoJornada, activo, legajo } = ctx.data;
    // Combine nombre + apellido into nombre field if both provided
    if (nombre && apellido) {
      set.nombre = `${nombre} ${apellido}`.trim();
    } else if (nombre) {
      set.nombre = nombre;
    }
    if (cuilCuil !== undefined) set.cuil = cuilCuil;
    if (fechaIngreso) set.fechaAlta = parseISO(fechaIngreso);
    if (convenioId !== undefined) set.convenioId = convenioId;
    if (categoriaId !== undefined) set.categoriaId = categoriaId;
    if (tipoJornada !== undefined) set.tipoJornada = tipoJornada;
    if (activo !== undefined) set.activo = activo;
    if (legajo !== undefined) set.legajo = legajo;

    const [row] = await db
      .update(liquidacionImportEmpleado)
      .set(set)
      .where(eq(liquidacionImportEmpleado.id, ctx.data.id))
      .returning();
    return row;
  });

export const deleteEmpleado = createServerFn({ method: 'POST' })
  .inputValidator(
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

    // Verify employee belongs to client via profile
    const [empCheck] = await db
      .select({ id: liquidacionImportEmpleado.id })
      .from(liquidacionImportEmpleado)
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(liquidacionImportEmpleado.id, ctx.data.id),
          eq(profile.client, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!empCheck) throw new Error('Empleado no encontrado o no autorizado');

    await db
      .update(liquidacionImportEmpleado)
      .set({ activo: false, updatedAt: new Date() })
      .where(eq(liquidacionImportEmpleado.id, ctx.data.id));
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
  conceptoFormula: string;
};

/** Lógica interna: calcula y persiste una liquidación (empleadoId + periodo, clientId ya autorizado) */
async function calcularUnaLiquidacion(
  empleadoId: string,
  periodo: string,
  clientId: string,
  opts?: { liquidacionId?: string; tipoRecibo?: string }
): Promise<{
  liquidacion: typeof liquidacionImportRecibo.$inferSelect;
  detalles: DetalleResult[];
  totalRemunerativo: number;
  totalNoRemunerativo: number;
  totalDescuentos: number;
  totalRetenciones: number;
  neto: number;
}> {
  const [emp] = await db
    .select({
      id: liquidacionImportEmpleado.id,
      categoriaId: liquidacionImportEmpleado.categoriaId,
      fechaAlta: liquidacionImportEmpleado.fechaAlta,
      convenioId: liquidacionImportEmpleado.convenioId,
    })
    .from(liquidacionImportEmpleado)
    .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
    .where(
      and(
        eq(liquidacionImportEmpleado.id, empleadoId),
        eq(profile.client, clientId)
      )
    )
    .limit(1);
  if (!emp) throw new Error('Empleado no encontrado');

  const periodoDate = parseISO(periodo + '-01');
  const basico = await getBasicoVigenteInternal(emp.categoriaId!, periodo);
  const añosAntiguedad = differenceInYears(periodoDate, emp.fechaAlta ?? periodoDate);

  const conceptos = await db
    .select()
    .from(payrollConcepto)
    .where(eq(payrollConcepto.clientId, clientId))
    .orderBy(payrollConcepto.orden, payrollConcepto.codigo);

  // Leer inputs existentes del recibo (si ya fue calculado antes)
  type InputRow = {
    id: string;
    conceptoId: string | null;
    cantidad: string | null;
    porcentaje: string | null;
    importeConceptoNumero: string | null;
    importeOverride: string | null;
    importeMinimo: string | null;
    importeMaximo: string | null;
    activoEnRecibo: boolean | null;
    memo: string | null;
  };
  let inputsPrevios: InputRow[] = [];
  let liqExistente: typeof liquidacionImportRecibo.$inferSelect | null = null;

  if (opts?.liquidacionId) {
    const [existing] = await db
      .select()
      .from(liquidacionImportRecibo)
      .where(
        and(
          eq(liquidacionImportRecibo.id, opts.liquidacionId),
          eq(liquidacionImportRecibo.empleadoId, empleadoId),
          eq(liquidacionImportRecibo.periodo, periodo)
        )
      )
      .limit(1);
    if (!existing) {
      throw new Error('Liquidación no encontrada o no coincide con empleado y período');
    }
    liqExistente = existing;
    inputsPrevios = await db
      .select({
        id: liquidacionImportConceptoValor.id,
        conceptoId: liquidacionImportConceptoValor.conceptoId,
        cantidad: liquidacionImportConceptoValor.cantidad,
        porcentaje: liquidacionImportConceptoValor.porcentaje,
        importeConceptoNumero: liquidacionImportConceptoValor.importeConceptoNumero,
        importeOverride: liquidacionImportConceptoValor.importeOverride,
        importeMinimo: liquidacionImportConceptoValor.importeMinimo,
        importeMaximo: liquidacionImportConceptoValor.importeMaximo,
        activoEnRecibo: liquidacionImportConceptoValor.activoEnRecibo,
        memo: liquidacionImportConceptoValor.memo,
      })
      .from(liquidacionImportConceptoValor)
      .where(eq(liquidacionImportConceptoValor.reciboId, opts.liquidacionId));
  }

  const inputMap = new Map(inputsPrevios.map((r) => [r.conceptoId, r]));

  const detalles: DetalleResult[] = [];
  let totalRemunerativo = 0;
  let totalNoRemunerativo = 0;
  let totalDescuentos = 0;
  let totalRetenciones = 0;

  const context: PayrollFormulaContext = {
    basico,
    antiguedad: añosAntiguedad,
    bruto: basico,
    totalRemunerativo: 0,
    totalNoRemunerativo: 0,
    totalDescuentos: 0,
    neto: 0,
    horasExtra: 0,
    presentismo: 0,
    comisiones: 0,
    bonos: 0,
  };

  const conceptosOrdenados = [...conceptos].sort(
    (a, b) => (a.orden ?? 0) - (b.orden ?? 0)
  );

  for (const con of conceptosOrdenados) {
    if (!con.activo) continue;
    const input = inputMap.get(con.id);

    // Si el concepto fue desactivado en este recibo, saltear
    if (input && !input.activoEnRecibo) continue;

    const cantidad = input?.cantidad != null ? Number(input.cantidad) : undefined;
    const importeConceptoN = input?.importeConceptoNumero != null ? Number(input.importeConceptoNumero) : 0;
    const rowImpMin = input?.importeMinimo != null ? Number(input.importeMinimo) : con.impMin != null ? Number(con.impMin) : null;
    const rowImpMax = input?.importeMaximo != null ? Number(input.importeMaximo) : con.impMax != null ? Number(con.impMax) : null;

    context.valor = importeConceptoN;
    context.cantidad = cantidad ?? 0;

    let monto = 0;

    // Override manual: saltea el motor completamente
    if (input?.importeOverride != null) {
      monto = Number(input.importeOverride);
    } else {
      try {
        monto = evaluatePayrollFormula(con.formula, context);
      } catch {
        monto = 0;
      }
      monto = roundMoney(monto);
    }

    // Aplicar piso/techo
    if (rowImpMin != null && monto < rowImpMin) monto = rowImpMin;
    if (rowImpMax != null && monto > rowImpMax) monto = rowImpMax;

    if (monto === 0) continue;

    detalles.push({
      detalleId: input?.id,
      conceptoId: con.id,
      monto,
      cantidad,
      pct: input?.porcentaje != null ? Number(input.porcentaje) : undefined,
      importeOverride: input?.importeOverride != null ? Number(input.importeOverride) : undefined,
      conceptoNombre: con.nombre,
      conceptoCodigo: con.codigo,
      conceptoTipo: con.tipo,
      conceptoFormula: con.formula,
    });

    if (con.tipo === 'remunerativo') {
      totalRemunerativo += monto;
      context.totalRemunerativo = totalRemunerativo;
    } else if (con.tipo === 'no_remunerativo') {
      totalNoRemunerativo += monto;
      context.totalNoRemunerativo = totalNoRemunerativo;
    } else if (con.tipo === 'retencion') {
      totalRetenciones += monto;
    } else {
      totalDescuentos += monto;
      context.totalDescuentos = totalDescuentos;
    }
  }

  context.bruto = totalRemunerativo + totalNoRemunerativo;
  const neto = roundMoney(context.bruto - totalDescuentos - totalRetenciones);

  // Persistir: borrar detalles viejos y reinsertar con inputs preservados
  const persistDetalles = async (reciboId: string) => {
    await db
      .delete(liquidacionImportConceptoValor)
      .where(eq(liquidacionImportConceptoValor.reciboId, reciboId));
    for (const d of detalles) {
      const input = inputMap.get(d.conceptoId);
      await db.insert(liquidacionImportConceptoValor).values({
        reciboId,
        codigo: d.conceptoCodigo,
        conceptoId: d.conceptoId,
        monto: String(d.monto),
        cantidad: d.cantidad != null ? String(d.cantidad) : null,
        porcentaje: input?.porcentaje ?? null,
        importeConceptoNumero: input?.importeConceptoNumero ?? null,
        importeOverride: input?.importeOverride ?? null,
        importeMinimo: input?.importeMinimo ?? null,
        importeMaximo: input?.importeMaximo ?? null,
        activoEnRecibo: input?.activoEnRecibo ?? true,
        memo: input?.memo ?? null,
        pctUsado: null,
        baseUsada: null,
      });
    }
  };

  if (liqExistente) {
    await db
      .update(liquidacionImportRecibo)
      .set({
        basico: String(basico),
        haberes: String(totalRemunerativo),
        noRemunerativo: String(totalNoRemunerativo),
        descuentos: String(totalDescuentos),
        retenciones: String(totalRetenciones),
        neto: String(neto),
        calculadoAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(liquidacionImportRecibo.id, liqExistente.id));

    await persistDetalles(liqExistente.id);

    const [liq] = await db
      .select()
      .from(liquidacionImportRecibo)
      .where(eq(liquidacionImportRecibo.id, liqExistente.id))
      .limit(1);

    return { liquidacion: liq!, detalles, totalRemunerativo, totalNoRemunerativo, totalDescuentos, totalRetenciones, neto };
  }

  const tipoRecibo = opts?.tipoRecibo ?? 'sueldo';

  /** Si ya hay un recibo generado (p. ej. cabecera de createReciboHeader), actualizar totales sin perder fecha/OS/CBU. */
  const [reciboGeneradoExistente] = await db
    .select()
    .from(liquidacionImportRecibo)
    .where(
      and(
        eq(liquidacionImportRecibo.empleadoId, empleadoId),
        eq(liquidacionImportRecibo.periodo, periodo),
        eq(liquidacionImportRecibo.origen, 'generado'),
        eq(liquidacionImportRecibo.tipo, tipoRecibo)
      )
    )
    .limit(1);

  if (reciboGeneradoExistente) {
    await db
      .update(liquidacionImportRecibo)
      .set({
        basico: String(basico),
        haberes: String(totalRemunerativo),
        noRemunerativo: String(totalNoRemunerativo),
        descuentos: String(totalDescuentos),
        retenciones: String(totalRetenciones),
        neto: String(neto),
        calculadoAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(liquidacionImportRecibo.id, reciboGeneradoExistente.id));

    await persistDetalles(reciboGeneradoExistente.id);

    const [liq] = await db
      .select()
      .from(liquidacionImportRecibo)
      .where(eq(liquidacionImportRecibo.id, reciboGeneradoExistente.id))
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

  await db.delete(liquidacionImportRecibo).where(
    and(
      eq(liquidacionImportRecibo.empleadoId, empleadoId),
      eq(liquidacionImportRecibo.periodo, periodo),
      eq(liquidacionImportRecibo.origen, 'generado'),
      eq(liquidacionImportRecibo.tipo, tipoRecibo)
    )
  );

  const [liq] = await db
    .insert(liquidacionImportRecibo)
    .values({
      empleadoId,
      periodo,
      basico: String(basico),
      haberes: String(totalRemunerativo),
      noRemunerativo: String(totalNoRemunerativo),
      descuentos: String(totalDescuentos),
      retenciones: String(totalRetenciones),
      neto: String(neto),
      tipo: tipoRecibo,
      origen: 'generado',
    })
    .returning();

  if (liq) await persistDetalles(liq.id);

  return { liquidacion: liq, detalles, totalRemunerativo, totalNoRemunerativo, totalDescuentos, totalRetenciones, neto };
}

/** Calcula una liquidación para un empleado en un período */
export const calcularLiquidacion = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      importEmpleadoId: z.string().uuid(),
      periodo: z.string(), // YYYY-MM
      /** Si se creó cabecera con createReciboHeader, pasar para conservar metadata del recibo */
      liquidacionId: z.string().uuid().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('Solo se puede liquidar el mes anterior al en curso.');
    }
    const [empConfig] = await db
      .select({ id: liquidacionImportEmpleado.id, convenioId: liquidacionImportEmpleado.convenioId })
      .from(liquidacionImportEmpleado)
      .where(eq(liquidacionImportEmpleado.id, ctx.data.importEmpleadoId))
      .limit(1);
    if (!empConfig?.convenioId) {
      throw new Error(
        'Este empleado no tiene configuración de liquidación. Asigná convenio y categoría primero.'
      );
    }
    return calcularUnaLiquidacion(
      empConfig.id,
      ctx.data.periodo,
      ctx.data.clientId,
      ctx.data.liquidacionId
        ? { liquidacionId: ctx.data.liquidacionId }
        : undefined
    );
  });

/** Liquidación masiva: calcula para todos los empleados activos del período del cliente */
export const calcularLiquidacionMasiva = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ clientId: z.string().uuid(), periodo: z.string() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('Solo se puede liquidar el mes anterior al en curso.');
    }
    const empleados = await db
      .select({ id: liquidacionImportEmpleado.id })
      .from(liquidacionImportEmpleado)
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(profile.client, ctx.data.clientId),
          eq(liquidacionImportEmpleado.activo, true)
        )
      );
    const results: { empleadoId: string; ok: boolean; error?: string }[] = [];
    for (const e of empleados) {
      try {
        await calcularUnaLiquidacion(e.id, ctx.data.periodo, ctx.data.clientId);
        results.push({ empleadoId: e.id, ok: true });
      } catch (err) {
        results.push({
          empleadoId: e.id,
          ok: false,
          error: err instanceof Error ? err.message : 'Error desconocido',
        });
      }
    }
    return results;
  });

/** Elimina todas las liquidaciones generadas del período para el cliente. Los detalles se eliminan en cascada. */
export const eliminarLiquidacionesDelPeriodo = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({ clientId: z.string().uuid(), periodo: z.string() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({ id: liquidacionImportRecibo.id })
      .from(liquidacionImportRecibo)
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
      )
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(profile.client, ctx.data.clientId),
          eq(liquidacionImportRecibo.periodo, ctx.data.periodo),
          eq(liquidacionImportRecibo.origen, 'generado')
        )
      );
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await db
        .delete(liquidacionImportRecibo)
        .where(inArray(liquidacionImportRecibo.id, ids));
    }
    return { deleted: ids.length };
  });

/** Actualiza los inputs editables de una fila de detalle (cantidad, pct, importeOverride, etc.) */
export const updateDetalleInputs = createServerFn({ method: 'POST' })
  .inputValidator(
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
      .select({ clientId: profile.client })
      .from(liquidacionImportConceptoValor)
      .innerJoin(liquidacionImportRecibo, eq(liquidacionImportConceptoValor.reciboId, liquidacionImportRecibo.id))
      .innerJoin(liquidacionImportEmpleado, eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id))
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(eq(liquidacionImportConceptoValor.id, ctx.data.detalleId))
      .limit(1);
    if (!row) throw new Error('Detalle no encontrado');
    await ensureClientBelongsToOrg(row.clientId, orgId);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (ctx.data.cantidad !== undefined) update.cantidad = ctx.data.cantidad != null ? String(ctx.data.cantidad) : null;
    if (ctx.data.pct !== undefined) update.porcentaje = ctx.data.pct != null ? String(ctx.data.pct) : null;
    if (ctx.data.importeConceptoN !== undefined) update.importeConceptoNumero = ctx.data.importeConceptoN != null ? String(ctx.data.importeConceptoN) : null;
    if (ctx.data.importeOverride !== undefined) update.importeOverride = ctx.data.importeOverride != null ? String(ctx.data.importeOverride) : null;
    if (ctx.data.impMin !== undefined) update.importeMinimo = ctx.data.impMin != null ? String(ctx.data.impMin) : null;
    if (ctx.data.impMax !== undefined) update.importeMaximo = ctx.data.impMax != null ? String(ctx.data.impMax) : null;
    if (ctx.data.activoEnRecibo !== undefined) update.activoEnRecibo = ctx.data.activoEnRecibo;
    if (ctx.data.memo !== undefined) update.memo = ctx.data.memo;

    await db
      .update(liquidacionImportConceptoValor)
      .set(update)
      .where(eq(liquidacionImportConceptoValor.id, ctx.data.detalleId));

    return { ok: true };
  });

export const listLiquidacionesByPeriodo = createServerFn({ method: 'GET' })
  .inputValidator(
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
      eq(liquidacionImportRecibo.periodo, ctx.data.periodo),
      eq(profile.client, ctx.data.clientId),
      ...(ctx.data.soloRecibosConfirmados
        ? [eq(liquidacionImportRecibo.reciboConfirmado, true)]
        : []),
    ];
    return db
      .select({
        liquidacion: liquidacionImportRecibo,
        empleado: liquidacionImportEmpleado,
      })
      .from(liquidacionImportRecibo)
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
      )
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(and(...conditions))
      .orderBy(liquidacionImportEmpleado.nombre);
  });

/** Marca la liquidación como recibo confirmado; así aparece en la solapa Recibo. */
export const confirmarReciboLiquidacion = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ liquidacionId: z.string().uuid(), clientId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .select({ id: liquidacionImportRecibo.id })
      .from(liquidacionImportRecibo)
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
      )
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(liquidacionImportRecibo.id, ctx.data.liquidacionId),
          eq(profile.client, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!row) throw new Error('Liquidación no encontrada o no autorizada');
    await db
      .update(liquidacionImportRecibo)
      .set({ reciboConfirmado: true, updatedAt: new Date() })
      .where(eq(liquidacionImportRecibo.id, ctx.data.liquidacionId));
    return { ok: true };
  });

/** Configuración del empleador para el recibo (firma, redondeo). Por ahora valores por defecto. */
export const getPayrollEmployerConfig = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    return {
      imprimirTotalRedondeado: false,
      firmaEmpleadorUrl: null as string | null,
    };
  });

export const getReciboDetalle = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ liquidacionId: z.string().uuid(), clientId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [liq] = await db
      .select({
        liquidacion: liquidacionImportRecibo,
        empleado: liquidacionImportEmpleado,
        convenio: payrollConvenio,
        categoria: payrollConvenioCategoria,
        obraSocial,
      })
      .from(liquidacionImportRecibo)
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
      )
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .leftJoin(
        payrollConvenio,
        eq(liquidacionImportEmpleado.convenioId, payrollConvenio.id)
      )
      .leftJoin(
        payrollConvenioCategoria,
        eq(liquidacionImportEmpleado.categoriaId, payrollConvenioCategoria.id)
      )
      .leftJoin(obraSocial, eq(liquidacionImportRecibo.obraSocialId, obraSocial.id))
      .where(
        and(
          eq(liquidacionImportRecibo.id, ctx.data.liquidacionId),
          eq(profile.client, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!liq) return null;

    // Si el recibo no tiene básico, lo derivamos de la escala salarial del convenio
    const basicoCalculado =
      liq.liquidacion.basico != null
        ? Number(liq.liquidacion.basico)
        : liq.empleado.categoriaId
          ? await getBasicoVigenteInternal(liq.empleado.categoriaId, liq.liquidacion.periodo)
          : 0;

    const detalles = await db
      .select({
        detalle: liquidacionImportConceptoValor,
        concepto: payrollConcepto,
        conceptoAfip: lsdConceptoAfip,
        conceptoSos,
      })
      .from(liquidacionImportConceptoValor)
      .leftJoin(
        payrollConcepto,
        eq(liquidacionImportConceptoValor.conceptoId, payrollConcepto.id)
      )
      .leftJoin(
        lsdConceptoAfip,
        or(
          eq(liquidacionImportConceptoValor.codigo, lsdConceptoAfip.codigoAfip),
          eq(payrollConcepto.codigoArca, lsdConceptoAfip.codigoAfip)
        )
      )
      .leftJoin(
        conceptoSos,
        eq(liquidacionImportConceptoValor.codigo, conceptoSos.codigo)
      )
      .where(eq(liquidacionImportConceptoValor.reciboId, ctx.data.liquidacionId))
      .orderBy(asc(liquidacionImportConceptoValor.codigo));

    /** Objeto plano JSON-serializable (evita pérdida de campos con seroval/Drizzle en el cliente). */
    const payload = { ...liq, basicoCalculado, detalles };
    return JSON.parse(JSON.stringify(payload)) as typeof payload;
  });
