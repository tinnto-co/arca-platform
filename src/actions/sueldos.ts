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
  conceptosCompletosSos,
  payrollConvenio,
  payrollConvenioFuente,
  payrollConvenioCategoria,
  payrollEscala,
  payrollConcepto,
  afipEmpleadoresConvenio,
  conveniosDeTrabajo,
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
  isNotNull,
  gte,
  inArray,
  sql,
  ne,
} from 'drizzle-orm';
import {
  montoLiquidadoDesdeEditsSos,
  parseDecimalSos,
  totalesReciboSosDesdeMontos,
} from '@/lib/sos-recibo-totales';

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
  evaluatePayrollFormulaStrict,
  roundMoney,
  type PayrollFormulaContext,
} from '../lib/payroll-formula';
import { puedeLiquidarPeriodo } from '../lib/payroll-period-rules';
import { differenceInYears, parseISO } from 'date-fns';

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
      .select({
        id: payrollConvenio.id,
        clientId: payrollConvenio.clientId,
        nombre: payrollConvenio.nombre,
        cctCodigo: payrollConvenio.cctCodigo,
        activo: payrollConvenio.activo,
        createdAt: payrollConvenio.createdAt,
        updatedAt: payrollConvenio.updatedAt,
        signatarios: conveniosDeTrabajo.signatarios,
      })
      .from(payrollConvenio)
      .leftJoin(
        conveniosDeTrabajo,
        sql`${payrollConvenio.cctCodigo} = ${conveniosDeTrabajo.cct}
          OR ${payrollConvenio.cctCodigo} = REGEXP_REPLACE(${conveniosDeTrabajo.cct}, '^0+', '')
          OR '0' || ${payrollConvenio.cctCodigo} = ${conveniosDeTrabajo.cct}`
      )
      .where(eq(payrollConvenio.clientId, ctx.data.clientId))
      .orderBy(payrollConvenio.nombre);

    if (ctx.data.profileId) {
      await ensureProfileBelongsToClient(ctx.data.profileId, ctx.data.clientId);
    }

    const afipRows = await db
      .select({
        cct: afipEmpleadoresConvenio.cct,
        updatedAt: afipEmpleadoresConvenio.updatedAt,
      })
      .from(afipEmpleadoresConvenio)
      .innerJoin(profile, eq(afipEmpleadoresConvenio.profileId, profile.id))
      .where(eq(profile.client, ctx.data.clientId));

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
        convenioId: payrollConvenioFuente.convenioId,
        fuente: payrollConvenioFuente.fuente,
      })
      .from(payrollConvenioFuente)
      .innerJoin(
        payrollConvenio,
        eq(payrollConvenioFuente.convenioId, payrollConvenio.id)
      )
      .where(eq(payrollConvenio.clientId, ctx.data.clientId));

    const fuentesEscalasRows = await db
      .select({
        convenioId: payrollConvenioCategoria.convenioId,
        fuente: payrollEscala.fuente,
      })
      .from(payrollEscala)
      .innerJoin(
        payrollConvenioCategoria,
        eq(payrollEscala.categoriaId, payrollConvenioCategoria.id)
      )
      .innerJoin(
        payrollConvenio,
        eq(payrollConvenioCategoria.convenioId, payrollConvenio.id)
      )
      .where(eq(payrollConvenio.clientId, ctx.data.clientId));

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

    // Los convenios se gestionan a nivel cliente (no por perfil).
    // Si filtramos por CCT del perfil activo, los convenios cargados manualmente
    // pueden quedar ocultos en la solapa de Convenios.
    return convenios.map((convenio) => {
      const cct =
        convenio.cctCodigo ??
        extractCctCodigo(convenio.nombre);
      const afipUpdatedAt = cct ? afipByCct.get(cct) ?? null : null;
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
    if (row) {
      await db
        .insert(payrollConvenioFuente)
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
        cct: conveniosDeTrabajo.cct,
        actividad: conveniosDeTrabajo.nombre,
        signatarios: conveniosDeTrabajo.signatarios,
        fechaNovedad: afipEmpleadoresConvenio.fechaNovedad,
        updatedAt: afipEmpleadoresConvenio.updatedAt,
      })
      .from(afipEmpleadoresConvenio)
      .innerJoin(profile, eq(afipEmpleadoresConvenio.profileId, profile.id))
      .leftJoin(conveniosDeTrabajo, eq(afipEmpleadoresConvenio.convenioId, conveniosDeTrabajo.id))
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
        baseColumna: conceptosCompletosSos.baseColumna,
        divCantidad: conceptosCompletosSos.divCantidad,
        divHsNorm: conceptosCompletosSos.divHsNorm,
        tieneCantidad: conceptosCompletosSos.tieneCantidad,
        tienePct: conceptosCompletosSos.tienePct,
        tieneImpConceptoNro: conceptosCompletosSos.tieneImpConceptoNro,
        tieneImporte: conceptosCompletosSos.tieneImporte,
        tieneImpMin: conceptosCompletosSos.tieneImpMin,
        tieneImpMax: conceptosCompletosSos.tieneImpMax,
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
      .leftJoin(
        conceptosCompletosSos,
        sql`${conceptosCompletosSos.numeroSos} = cast(${lsdPerfilConcepto.codigoContribuyente} as integer)`
      )
      .where(eq(lsdPerfilConcepto.profileId, ctx.data.profileId))
      .orderBy(lsdPerfilConcepto.codigoContribuyente);
  });

/** Lista todos los conceptos del catálogo SOS completo (sin filtrar por perfil). */
export const listTodosConceptosSos = createServerFn({ method: 'GET' })
  .handler(async () => {
    await getSessionWithOrg();
    return db
      .select()
      .from(conceptosCompletosSos)
      .where(and(
        gte(conceptosCompletosSos.numeroSos, 1),
        lte(conceptosCompletosSos.numeroSos, 699)
      ))
      .orderBy(conceptosCompletosSos.numeroSos);
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
        cct: conveniosDeTrabajo.cct,
        actividad: conveniosDeTrabajo.nombre,
        signatarios: conveniosDeTrabajo.signatarios,
        fechaNovedad: afipEmpleadoresConvenio.fechaNovedad,
      })
      .from(afipEmpleadoresConvenio)
      .innerJoin(profile, eq(afipEmpleadoresConvenio.profileId, profile.id))
      .leftJoin(conveniosDeTrabajo, eq(afipEmpleadoresConvenio.convenioId, conveniosDeTrabajo.id))
      .where(
        and(
          eq(profile.client, ctx.data.clientId),
          eq(afipEmpleadoresConvenio.id, ctx.data.afipConvenioId)
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
      .select({ id: payrollConvenio.id })
      .from(payrollConvenio)
      .where(
        and(
          eq(payrollConvenio.clientId, ctx.data.clientId),
          or(
            eq(payrollConvenio.nombre, afipRow.cct),
            eq(payrollConvenio.nombre, cctNormalizado),
            cctCodigo
              ? eq(payrollConvenio.cctCodigo, cctCodigo)
              : isNull(payrollConvenio.cctCodigo)
          )
        )
      )
      .limit(1);

    if (existing) {
      await db
        .insert(payrollConvenioFuente)
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
      .insert(payrollConvenio)
      .values({
        clientId: ctx.data.clientId,
        nombre: nombreConvenio,
        cctCodigo,
      })
      .returning({ id: payrollConvenio.id });

    if (!inserted) throw new Error('Error al crear convenio');

    await db
      .insert(payrollConvenioFuente)
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
 * Variantes de período que pueden estar en la BD (p. ej. 2026-04 vs 2026-4),
 * para que el listado de recibos coincida con importados y con el valor crudo del UI.
 * Incluye `periodoCrudo` para no perder coincidencias si la normalización difiere del texto guardado.
 */
function variantesPeriodoParaBusqueda(
  periodoNorm: string,
  periodoCrudo: string
): string[] {
  const cands = new Set<string>();
  const raw = periodoCrudo.trim();
  const norm = periodoNorm.trim();
  if (raw.length > 0) cands.add(raw);
  if (norm.length > 0) cands.add(norm);

  for (const s of [norm, raw]) {
    const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(s);
    if (m) {
      const y = m[1];
      const mo = String(m[2]).padStart(2, '0');
      cands.add(`${y}-${mo}`);
      cands.add(`${y}-${parseInt(m[2], 10)}`);
    }
  }
  return [...cands].filter((x) => x.length > 0);
}

function condicionPeriodoRecibo(periodoCrudo: string) {
  const periodoNorm = normalizarPeriodoYYYYMM(periodoCrudo);
  const variantes = variantesPeriodoParaBusqueda(periodoNorm, periodoCrudo);
  if (variantes.length === 0) {
    return eq(liquidacionImportRecibo.periodo, periodoNorm);
  }
  if (variantes.length === 1) {
    return eq(liquidacionImportRecibo.periodo, variantes[0]!);
  }
  return or(...variantes.map((v) => eq(liquidacionImportRecibo.periodo, v)));
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
): Promise<Partial<typeof liquidacionImportRecibo.$inferSelect>> {
  const conditions = [
    eq(liquidacionImportRecibo.empleadoId, empleadoId),
    sql`(
      trim(coalesce(${liquidacionImportRecibo.lugarPago}, '')) <> ''
      or trim(coalesce(${liquidacionImportRecibo.formaPago}, '')) <> ''
      or trim(coalesce(${liquidacionImportRecibo.cbu}, '')) <> ''
      or trim(coalesce(${liquidacionImportRecibo.banco}, '')) <> ''
    )`,
  ];
  if (excluirReciboId) {
    conditions.push(ne(liquidacionImportRecibo.id, excluirReciboId));
  }
  const [row] = await db
    .select({
      fechaPago: liquidacionImportRecibo.fechaPago,
      lugarPago: liquidacionImportRecibo.lugarPago,
      formaPago: liquidacionImportRecibo.formaPago,
      cbu: liquidacionImportRecibo.cbu,
      banco: liquidacionImportRecibo.banco,
    })
    .from(liquidacionImportRecibo)
    .where(and(...conditions))
    .orderBy(desc(liquidacionImportRecibo.calculadoAt))
    .limit(1);
  return row ?? {};
}

function mergeCabeceraPagoLiquidacion(
  actual: typeof liquidacionImportRecibo.$inferSelect,
  plantilla: Partial<typeof liquidacionImportRecibo.$inferSelect>
): typeof liquidacionImportRecibo.$inferSelect {
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

/**
 * Códigos SOS / import: 1=Efectivo, 2=Acreditación, 3=Cheque, 4=Otro → valores de la app.
 */
function normalizarFormaPagoAlmacenada(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === '') return null;
  if (s === '1' || s === 'efectivo') return 'efectivo';
  if (s === '2' || s === 'acreditacion' || s === 'acreditación') {
    return 'acreditacion';
  }
  if (s === '3' || s === 'cheque') return 'cheque';
  if (s === '4' || s === 'otro' || s === 'otros') return 'efectivo';
  return String(raw).trim();
}

/** Campos de pago guardados en el legajo (`liquidacion_import_empleado`). */
function cabeceraPagoDesdeEmpleado(
  empleado: Pick<
    typeof liquidacionImportEmpleado.$inferSelect,
    'lugarPago' | 'formaPago' | 'cbu' | 'banco'
  >
): Partial<typeof liquidacionImportRecibo.$inferSelect> {
  const out: Partial<typeof liquidacionImportRecibo.$inferSelect> = {};
  if (!cabeceraCampoPagoVacio(empleado.lugarPago)) out.lugarPago = empleado.lugarPago;
  if (!cabeceraCampoPagoVacio(empleado.formaPago)) {
    out.formaPago = normalizarFormaPagoAlmacenada(empleado.formaPago);
  }
  if (!cabeceraCampoPagoVacio(empleado.cbu)) out.cbu = empleado.cbu;
  if (!cabeceraCampoPagoVacio(empleado.banco)) out.banco = empleado.banco;
  return out;
}

/** Prioridad al crear recibo generado: datos del legajo, luego último recibo con cabecera. */
function mergePagoEmpleadoSobreHistorial(
  empleado: Pick<
    typeof liquidacionImportEmpleado.$inferSelect,
    'lugarPago' | 'formaPago' | 'cbu' | 'banco'
  >,
  historial: Partial<typeof liquidacionImportRecibo.$inferSelect>
) {
  const lugarPago = !cabeceraCampoPagoVacio(empleado.lugarPago)
    ? empleado.lugarPago
    : historial.lugarPago ?? null;
  const formaPago = normalizarFormaPagoAlmacenada(
    !cabeceraCampoPagoVacio(empleado.formaPago)
      ? empleado.formaPago
      : historial.formaPago
  );
  const cbu = !cabeceraCampoPagoVacio(empleado.cbu)
    ? empleado.cbu
    : historial.cbu ?? null;
  const banco = !cabeceraCampoPagoVacio(empleado.banco)
    ? empleado.banco
    : historial.banco ?? null;
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
  empleado: typeof liquidacionImportEmpleado.$inferSelect
): Promise<string | null> {
  if (empleado.categoriaId) return empleado.categoriaId;
  const convId = empleado.convenioId;
  const texto = empleado.categoria?.trim();
  if (!convId || !texto) return null;

  const [byCodigo] = await db
    .select({ id: payrollConvenioCategoria.id })
    .from(payrollConvenioCategoria)
    .where(
      and(
        eq(payrollConvenioCategoria.convenioId, convId),
        eq(payrollConvenioCategoria.codigo, texto)
      )
    )
    .limit(1);
  if (byCodigo) return byCodigo.id;

  const [byNombre] = await db
    .select({ id: payrollConvenioCategoria.id })
    .from(payrollConvenioCategoria)
    .where(
      and(
        eq(payrollConvenioCategoria.convenioId, convId),
        sql`lower(trim(${payrollConvenioCategoria.nombre})) = lower(${texto})`
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
  empleado: Pick<typeof liquidacionImportEmpleado.$inferSelect, 'convenioId'>,
  clientId: string
): Promise<string | null> {
  if (empleado.convenioId) return empleado.convenioId;
  const convenios = await db
    .select({ id: payrollConvenio.id })
    .from(payrollConvenio)
    .where(eq(payrollConvenio.clientId, clientId));
  if (convenios.length === 1) return convenios[0]!.id;
  return null;
}

async function getBasicoVigenteInternal(
  categoriaId: string,
  fechaStr: string
): Promise<number> {
  const p = normalizarPeriodoYYYYMM(fechaStr);
  const fechaIso = p.length === 7 ? `${p}-01` : p;
  const fecha = parseISO(fechaIso);
  if (Number.isNaN(fecha.getTime())) return 0;
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

/**
 * Sueldo básico para mostrar en el recibo: override del legajo → escala por categoría
 * (incl. resolución por texto de categoría + convenio) → básico persistido en la liquidación.
 */
async function basicoParaRecibo(
  empleado: typeof liquidacionImportEmpleado.$inferSelect,
  liquidacion: typeof liquidacionImportRecibo.$inferSelect
): Promise<number> {
  const override = empleado.valorSueldo != null ? Number(empleado.valorSueldo) : 0;
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
  .inputValidator(
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
  .inputValidator(
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
      .from(liquidacionImportEmpleado)
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(liquidacionImportEmpleado.id, ctx.data.importEmpleadoId),
          eq(profile.client, ctx.data.clientId)
        )
      )
      .limit(1);

    if (!emp) return { basico: 0 };

    const empleado = emp.liquidacion_import_empleado;

    // Override manual en el legajo tiene prioridad
    const override = empleado.valorSueldo != null ? Number(empleado.valorSueldo) : 0;
    if (!Number.isNaN(override) && override > 0) return { basico: override };

    const categoriaId =
      empleado.categoriaId ?? (await resolveCategoriaIdParaBasico(empleado));

    if (!categoriaId) return { basico: 0 };

    // Busca la escala exacta para el período
    let basico = await getBasicoVigenteInternal(categoriaId, ctx.data.periodo);

    // Fallback: si no hay escala para el período exacto, usa la más reciente disponible.
    // Útil cuando la escala fue cargada después de la fecha de inicio del período.
    if ((!basico || Number.isNaN(basico)) && categoriaId) {
      const [masReciente] = await db
        .select({ monto: payrollEscala.montoBasico })
        .from(payrollEscala)
        .where(eq(payrollEscala.categoriaId, categoriaId))
        .orderBy(desc(payrollEscala.vigenciaDesde))
        .limit(1);
      if (masReciente) basico = Number(masReciente.monto);
    }

    return { basico: Number.isNaN(basico) ? 0 : basico };
  });

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
  .inputValidator(
    z.object({ clientId: z.string().uuid(), profileId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureProfileBelongsToClient(ctx.data.profileId, ctx.data.clientId);
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
      .where(
        and(
          eq(profile.client, ctx.data.clientId),
          eq(liquidacionImportEmpleado.profileId, ctx.data.profileId)
        )
      )
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
        obraSocialNombre: obraSocial.nombre,
        obraSocialCodigo: obraSocial.codigo,
      })
      .from(liquidacionImportEmpleado)
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .leftJoin(payrollConvenio, eq(liquidacionImportEmpleado.convenioId, payrollConvenio.id))
      .leftJoin(payrollConvenioCategoria, eq(liquidacionImportEmpleado.categoriaId, payrollConvenioCategoria.id))
      .leftJoin(obraSocial, eq(liquidacionImportEmpleado.obraSocialId, obraSocial.id))
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

export const getProfileSueldosConfig = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ clientId: z.string().uuid(), profileId: z.string().uuid() })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureProfileBelongsToClient(ctx.data.profileId, ctx.data.clientId);
    const [row] = await db
      .select({ usaLsdReferencia: profile.usaLsdReferencia })
      .from(profile)
      .where(eq(profile.id, ctx.data.profileId))
      .limit(1);
    return { usaLsdReferencia: row?.usaLsdReferencia ?? false };
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
          const posibles = [conv.cctCodigo, extractCct(conv.nombre)]
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

/** Empleados del perfil con su configuración de liquidación (solo activos). */
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
        obraSocialNombre: obraSocial.nombre,
        obraSocialCodigo: obraSocial.codigo,
      })
      .from(liquidacionImportEmpleado)
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .leftJoin(obraSocial, eq(liquidacionImportEmpleado.obraSocialId, obraSocial.id))
      .where(
        and(
          eq(profile.client, ctx.data.clientId),
          eq(liquidacionImportEmpleado.profileId, ctx.data.profileId),
          eq(liquidacionImportEmpleado.activo, true)
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

/** Último recibo importado del empleado con todos sus conceptos (para la tabla estilo SOS). */
export const getUltimoReciboImportado = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      importEmpleadoId: z.string().uuid(),
      clientId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const [row] = await db
      .select({ recibo: liquidacionImportRecibo })
      .from(liquidacionImportRecibo)
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
      )
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(liquidacionImportRecibo.empleadoId, ctx.data.importEmpleadoId),
          eq(profile.client, ctx.data.clientId)
        )
      )
      .orderBy(desc(liquidacionImportRecibo.periodo))
      .limit(1);

    if (!row) return null;

    const conceptos = await db
      .select({
        id: liquidacionImportConceptoValor.id,
        codigo: liquidacionImportConceptoValor.codigo,
        monto: liquidacionImportConceptoValor.monto,
        cantidad: liquidacionImportConceptoValor.cantidad,
        porcentaje: liquidacionImportConceptoValor.porcentaje,
        importeConceptoNumero: liquidacionImportConceptoValor.importeConceptoNumero,
        importe: liquidacionImportConceptoValor.importe,
        importeMinimo: liquidacionImportConceptoValor.importeMinimo,
        importeMaximo: liquidacionImportConceptoValor.importeMaximo,
        nombre: conceptoSos.nombre,
        codigoAfip: conceptoSos.codigoAfip,
      })
      .from(liquidacionImportConceptoValor)
      .leftJoin(
        conceptoSos,
        eq(liquidacionImportConceptoValor.codigo, conceptoSos.codigo)
      )
      .where(eq(liquidacionImportConceptoValor.reciboId, row.recibo.id))
      .orderBy(sql`${liquidacionImportConceptoValor.codigo}::int`);

    return { recibo: row.recibo, conceptos };
  });

/**
 * Todos los conceptos del catálogo SOS completo (conceptos_completos_sos, rangos 1–699),
 * para armar la grilla estilo recibo. Devuelve todos los conceptos sin filtrar por perfil,
 * de modo que cualquier empresa pueda trabajar con cualquier concepto SOS.
 */
export const listConceptosPlantillaManualSos = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const rows = await db
      .select()
      .from(conceptosCompletosSos)
      .where(and(
        gte(conceptosCompletosSos.numeroSos, 1),
        lte(conceptosCompletosSos.numeroSos, 699)
      ))
      .orderBy(conceptosCompletosSos.numeroSos);

    return rows.map((r) => ({
      id: r.id,
      codigo: String(r.numeroSos),
      monto: null as string | null,
      cantidad: null as string | null,
      porcentaje: null as string | null,
      importeConceptoNumero: null as string | null,
      importe: null as string | null,
      importeMinimo: null as string | null,
      importeMaximo: null as string | null,
      nombre: r.nombre,
      codigoAfip: r.codigoAfip,
      baseColumna: r.baseColumna ?? null,
      divCantidad: r.divCantidad != null ? Number(r.divCantidad) : null,
      divHsNorm: r.divHsNorm != null ? r.divHsNorm > 0 : null,
      tieneCantidad: r.tieneCantidad ?? null,
      tienePct: r.tienePct ?? null,
      tieneImpConceptoNro: r.tieneImpConceptoNro ?? null,
      tieneImporte: r.tieneImporte ?? null,
      tieneImpMin: r.tieneImpMin ?? null,
      tieneImpMax: r.tieneImpMax ?? null,
    }));
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

const conceptoEditsSosSchema = z.object({
  codigo: z.string().min(1),
  monto: z.string(),
  cantidad: z.string().optional(),
  porcentaje: z.string().optional(),
  importeConceptoNumero: z.string().optional(),
  importe: z.string().optional(),
  importeMinimo: z.string().optional(),
  importeMaximo: z.string().optional(),
});

function numericOrNullForSos(s: string | undefined): string | null {
  const n = parseDecimalSos(s);
  return n === null ? null : n.toFixed(2);
}

const MAX_SOS_PORCENTAJE = 500;

function validateConceptoEditSos(c: z.infer<typeof conceptoEditsSosSchema>): void {
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      importEmpleadoId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
      tipoRecibo: tipoReciboReciboSchema,
      conceptos: z.array(conceptoEditsSosSchema),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureProfileBelongsToClient(ctx.data.profileId, ctx.data.clientId);
    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('No se puede liquidar períodos futuros.');
    }

    const [empRow] = await db
      .select({ id: liquidacionImportEmpleado.id })
      .from(liquidacionImportEmpleado)
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(liquidacionImportEmpleado.id, ctx.data.importEmpleadoId),
          eq(liquidacionImportEmpleado.profileId, ctx.data.profileId),
          eq(profile.client, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!empRow) {
      throw new Error('Empleado de importación no encontrado o no pertenece al perfil');
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

    const haberesStr = t.haberes.toFixed(2);
    const noRemStr = t.noRemunerativo.toFixed(2);
    const descStr = t.descuentos.toFixed(2);
    const retStr = t.retenciones.toFixed(2);
    const netoStr = t.neto.toFixed(2);

    const reciboId = await db.transaction(async (tx) => {
      const lockKey = `sos-recibo:${ctx.data.importEmpleadoId}:${ctx.data.periodo}:${ctx.data.tipoRecibo}`;
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`
      );

      const [existing] = await tx
        .select({ id: liquidacionImportRecibo.id })
        .from(liquidacionImportRecibo)
        .where(
          and(
            eq(liquidacionImportRecibo.empleadoId, ctx.data.importEmpleadoId),
            eq(liquidacionImportRecibo.periodo, ctx.data.periodo),
            eq(liquidacionImportRecibo.tipo, ctx.data.tipoRecibo)
          )
        )
        .limit(1);

      let rid: string;
      if (existing) {
        await tx
          .update(liquidacionImportRecibo)
          .set({
            haberes: haberesStr,
            noRemunerativo: noRemStr,
            descuentos: descStr,
            retenciones: retStr,
            neto: netoStr,
            fecha: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(liquidacionImportRecibo.id, existing.id));
        rid = existing.id;
      } else {
        const [ins] = await tx
          .insert(liquidacionImportRecibo)
          .values({
            empleadoId: ctx.data.importEmpleadoId,
            periodo: ctx.data.periodo,
            tipo: ctx.data.tipoRecibo,
            fecha: new Date(),
            haberes: haberesStr,
            noRemunerativo: noRemStr,
            descuentos: descStr,
            retenciones: retStr,
            neto: netoStr,
          })
          .returning({ id: liquidacionImportRecibo.id });
        if (!ins) throw new Error('No se pudo crear el recibo');
        rid = ins.id;
      }

      await tx
        .delete(liquidacionImportConceptoValor)
        .where(eq(liquidacionImportConceptoValor.reciboId, rid));

      for (const c of ctx.data.conceptos) {
        const liq = montoLiquidadoDesdeEditsSos(editsRow(c));
        const pctUsado = parseDecimalSos(c.porcentaje);
        const baseUsada =
          parseDecimalSos(c.importeConceptoNumero) ?? parseDecimalSos(c.importe);
        await tx.insert(liquidacionImportConceptoValor).values({
          reciboId: rid,
          codigo: c.codigo,
          monto: liq.toFixed(2),
          cantidad: numericOrNullForSos(c.cantidad),
          porcentaje: numericOrNullForSos(c.porcentaje),
          importeConceptoNumero: numericOrNullForSos(c.importeConceptoNumero),
          importe: numericOrNullForSos(c.importe),
          importeMinimo: numericOrNullForSos(c.importeMinimo),
          importeMaximo: numericOrNullForSos(c.importeMaximo),
          pctUsado: pctUsado != null ? String(pctUsado) : null,
          baseUsada: baseUsada != null ? String(baseUsada) : null,
          memo: 'source=manual_sos',
        });
      }

      return rid;
    });

    return { reciboId, periodo: ctx.data.periodo };
  });

/** Crea cabecera en payroll_liquidacion (metadata del recibo: fechas, obra social, pago). */
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
      throw new Error('No se puede liquidar períodos futuros.');
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
          tipoLiquidacion: d.tipoLiquidacion ?? null,
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
      // Códigos auxiliares
      codigoModalidadContratacion: z.string().optional().nullable(),
      codigoSituacion: z.string().optional().nullable(),
      codigoZona: z.string().optional().nullable(),
      codigoCondicion: z.string().optional().nullable(),
      codigoActividad: z.string().optional().nullable(),
      codigoSiniestrado: z.string().optional().nullable(),
      observaciones: z.string().optional().nullable(),
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
    const {
      nombre,
      apellido,
      cuilCuil,
      fechaIngreso,
      convenioId,
      categoriaId,
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
      observaciones,
    } = ctx.data;
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
    if (lugarPago !== undefined) set.lugarPago = lugarPago?.trim() || null;
    if (formaPago !== undefined) set.formaPago = formaPago?.trim() || null;
    if (cbu !== undefined) set.cbu = cbu?.trim() || null;
    if (banco !== undefined) set.banco = banco?.trim() || null;
    if (domicilio !== undefined) set.domicilio = domicilio?.trim() || null;
    if (localidad !== undefined) set.localidad = localidad?.trim() || null;
    if (codigoPostal !== undefined) set.codigoPostal = codigoPostal?.trim() || null;
    if (conyuge !== undefined) set.conyuge = conyuge;
    if (hijos !== undefined) set.hijos = hijos;
    if (adherentes !== undefined) set.adherentes = adherentes;
    if (obraSocialId !== undefined) set.obraSocialId = obraSocialId;
    if (codigoModalidadContratacion !== undefined) set.codigoModalidadContratacion = codigoModalidadContratacion?.trim() || null;
    if (codigoSituacion !== undefined) set.codigoSituacion = codigoSituacion?.trim() || null;
    if (codigoZona !== undefined) set.codigoZona = codigoZona?.trim() || null;
    if (codigoCondicion !== undefined) set.codigoCondicion = codigoCondicion?.trim() || null;
    if (codigoActividad !== undefined) set.codigoActividad = codigoActividad?.trim() || null;
    if (codigoSiniestrado !== undefined) set.codigoSiniestrado = codigoSiniestrado?.trim() || null;
    if (observaciones !== undefined) set.observaciones = observaciones?.trim() || null;

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
  baseUsada?: number;
  pctUsado?: number;
  calcError?: string;
  montoSource: 'formula' | 'override' | 'sos_override';
};

/** Lógica interna: calcula y persiste una liquidación (empleadoId + periodo, clientId ya autorizado) */
async function calcularUnaLiquidacion(
  empleadoId: string,
  periodo: string,
  clientId: string,
  opts?: {
    liquidacionId?: string;
    tipoRecibo?: string;
    /** Monto override por número SOS (key = numeroSos del payrollConcepto, como string) */
    conceptoSosOverrides?: Record<string, number>;
  }
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
      lugarPago: liquidacionImportEmpleado.lugarPago,
      formaPago: liquidacionImportEmpleado.formaPago,
      cbu: liquidacionImportEmpleado.cbu,
      banco: liquidacionImportEmpleado.banco,
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
  const convenioIdResuelto = await resolveConvenioIdParaEmpleado(emp, clientId);
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
      .update(liquidacionImportEmpleado)
      .set({
        convenioId: convenioIdResuelto,
        categoriaId: categoriaIdResuelta,
        updatedAt: new Date(),
      })
      .where(eq(liquidacionImportEmpleado.id, empleadoId));
  }

  const basico = await getBasicoVigenteInternal(categoriaIdResuelta, periodo);
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

    if (input && !input.activoEnRecibo) continue;

    const cantidad =
      input?.cantidad != null ? Number(input.cantidad) : undefined;
    const importeConceptoN =
      input?.importeConceptoNumero != null
        ? Number(input.importeConceptoNumero)
        : 0;
    const rowImpMin =
      input?.importeMinimo != null
        ? Number(input.importeMinimo)
        : con.impMin != null
          ? Number(con.impMin)
          : null;
    const rowImpMax =
      input?.importeMaximo != null
        ? Number(input.importeMaximo)
        : con.impMax != null
          ? Number(con.impMax)
          : null;

    const porcentaje =
      input?.porcentaje != null ? Number(input.porcentaje) : 0;
    context.valor = importeConceptoN;
    context.cantidad = cantidad ?? 0;
    context.porcentaje = porcentaje;

    let monto = 0;

    let calcError: string | undefined;
    let montoSource: DetalleResult['montoSource'] = 'formula';
    if (input?.importeOverride != null) {
      monto = Number(input.importeOverride);
      montoSource = 'override';
    } else {
      const evalResult = evaluatePayrollFormulaStrict(con.formula, context);
      monto = evalResult.value;
      calcError = evalResult.ok ? undefined : evalResult.error;
      monto = roundMoney(monto);
    }

    if (
      opts?.conceptoSosOverrides &&
      con.numeroSos != null &&
      input?.importeOverride == null
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
      pct:
        input?.porcentaje != null ? Number(input.porcentaje) : undefined,
      importeOverride:
        input?.importeOverride != null
          ? Number(input.importeOverride)
          : undefined,
      conceptoNombre: con.nombre,
      conceptoCodigo: con.codigo,
      conceptoTipo: con.tipo,
      conceptoFormula: con.formula,
      baseUsada: input?.importeConceptoNumero != null ? Number(input.importeConceptoNumero) : undefined,
      pctUsado:
        input?.porcentaje != null ? Number(input.porcentaje) : undefined,
      calcError,
      montoSource,
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
        tipoLiquidacion: d.conceptoTipo,
        monto: String(d.monto),
        cantidad: d.cantidad != null ? String(d.cantidad) : null,
        porcentaje: input?.porcentaje ?? null,
        importeConceptoNumero: input?.importeConceptoNumero ?? null,
        importeOverride: input?.importeOverride ?? null,
        importeMinimo: input?.importeMinimo ?? null,
        importeMaximo: input?.importeMaximo ?? null,
        activoEnRecibo: input?.activoEnRecibo ?? true,
        memo:
          d.calcError != null
            ? `${input?.memo ? `${input.memo} | ` : ''}calc_error=${d.calcError}`
            : input?.memo ?? null,
        pctUsado: d.pctUsado != null ? String(d.pctUsado) : null,
        baseUsada: d.baseUsada != null ? String(d.baseUsada) : null,
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

  const plantillaHistorialRecibo = await obtenerCabeceraPagoPlantilla(empleadoId);
  const pagoNuevo = mergePagoEmpleadoSobreHistorial(emp, plantillaHistorialRecibo);

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
      fechaPago: pagoNuevo.fechaPago,
      lugarPago: pagoNuevo.lugarPago,
      formaPago: pagoNuevo.formaPago,
      cbu: pagoNuevo.cbu,
      banco: pagoNuevo.banco,
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
      /** Debe coincidir con el recibo generado (mismo tipo que en createReciboHeader). */
      tipoRecibo: z.string().optional(),
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
      .select({ id: liquidacionImportEmpleado.id })
      .from(liquidacionImportEmpleado)
      .where(eq(liquidacionImportEmpleado.id, ctx.data.importEmpleadoId))
      .limit(1);
    if (!empConfig) throw new Error('Empleado no encontrado');
    return calcularUnaLiquidacion(
      empConfig.id,
      ctx.data.periodo,
      ctx.data.clientId,
      {
        ...(ctx.data.liquidacionId ? { liquidacionId: ctx.data.liquidacionId } : {}),
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

function mapLiquidacionMasivaErrorCode(message: string): LiquidacionMasivaErrorCode {
  const m = message.toLowerCase();
  if (m.includes('no se pudo resolver el convenio') || m.includes('no tiene configuración de liquidación')) {
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      periodo: z.string(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureProfileBelongsToClient(ctx.data.profileId, ctx.data.clientId);
    const [profileCfg] = await db
      .select({ usaLsdReferencia: profile.usaLsdReferencia })
      .from(profile)
      .where(eq(profile.id, ctx.data.profileId))
      .limit(1);
    const usaLsdReferencia = profileCfg?.usaLsdReferencia ?? false;
    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('No se puede liquidar períodos futuros.');
    }
    const empleados = await db
      .select({
        id: liquidacionImportEmpleado.id,
        nombre: liquidacionImportEmpleado.nombre,
        legajo: liquidacionImportEmpleado.legajo,
      })
      .from(liquidacionImportEmpleado)
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(profile.client, ctx.data.clientId),
          eq(liquidacionImportEmpleado.profileId, ctx.data.profileId),
          eq(liquidacionImportEmpleado.activo, true)
        )
      );
    const recibosGenerados = await db
      .select({
        empleadoId: liquidacionImportRecibo.empleadoId,
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
          eq(liquidacionImportEmpleado.profileId, ctx.data.profileId),
          eq(liquidacionImportRecibo.periodo, ctx.data.periodo),
          eq(liquidacionImportRecibo.tipo, 'sueldo'),
          ...(usaLsdReferencia
            ? [eq(liquidacionImportRecibo.origen, 'generado')]
            : [])
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
        const message = err instanceof Error ? err.message : 'Error desconocido';
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

/** Elimina una liquidación puntual del cliente. */
export const eliminarLiquidacion = createServerFn({ method: 'POST' })
  .inputValidator(
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

    if (!row) {
      throw new Error('Liquidación no encontrada para este cliente.');
    }

    await db
      .delete(liquidacionImportRecibo)
      .where(eq(liquidacionImportRecibo.id, ctx.data.liquidacionId));

    return { ok: true };
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
    const resolvedClientId = row?.clientId;
    if (!resolvedClientId) throw new Error('Detalle no encontrado');
    await ensureClientBelongsToOrg(resolvedClientId, orgId);

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

/**
 * Recibos del período para el cliente seleccionado.
 * Multi-tenant: solo empleados cuyo perfil pertenece a ese `clientId` (no mezcla empresas en la misma vista).
 * El período se normaliza a `YYYY-MM` y se buscan variantes guardadas en BD (p. ej. `2026-04` vs `2026-4`).
 */
export const listLiquidacionesByPeriodo = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      periodo: z.string(),
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      /** Si true, solo devuelve liquidaciones con recibo confirmado (para solapa Recibo) */
      soloRecibosConfirmados: z.boolean().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureProfileBelongsToClient(ctx.data.profileId, ctx.data.clientId);
    const conditions = [
      condicionPeriodoRecibo(ctx.data.periodo),
      eq(profile.client, ctx.data.clientId),
      eq(liquidacionImportEmpleado.profileId, ctx.data.profileId),
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
      .orderBy(
        sql`(CASE WHEN ${liquidacionImportEmpleado.legajo} ~ '^[0-9]+$' THEN (${liquidacionImportEmpleado.legajo})::bigint END) NULLS LAST`,
        asc(liquidacionImportEmpleado.nombre)
      );
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

/** Configuración del empleador para el recibo (firma digital, redondeo). */
export const getPayrollEmployerConfig = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid(), profileId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const row = await db
      .select({ firmaDigitalEmpleador: profile.firmaDigitalEmpleador })
      .from(profile)
      .where(eq(profile.id, ctx.data.profileId))
      .then((r) => r[0] ?? null);
    return {
      imprimirTotalRedondeado: false,
      firmaEmpleadorUrl: row?.firmaDigitalEmpleador ?? null,
    };
  });

/** Guarda (o elimina) la firma digital del empleador en el perfil. */
export const saveFirmaDigitalEmpleador = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      firmaDigitalEmpleador: z.string().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await assertCanWrite(orgId);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await db
      .update(profile)
      .set({ firmaDigitalEmpleador: ctx.data.firmaDigitalEmpleador, updatedAt: new Date() })
      .where(eq(profile.id, ctx.data.profileId));
    return { ok: true };
  });

/** Columna del recibo estilo SOS. */
type TipoColumnaRecibo =
  | 'remunerativo'
  | 'no_remunerativo'
  | 'descuento'
  | 'retencion';

function tipoConceptoParaColumnaRecibo(
  concepto: typeof payrollConcepto.$inferSelect | null
): TipoColumnaRecibo {
  const t = concepto?.tipo;
  if (t === 'remunerativo') return 'remunerativo';
  if (t === 'no_remunerativo') return 'no_remunerativo';
  if (t === 'retencion') return 'retencion';
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

/** Si el código de línea es solo dígitos y cae en el catálogo SOS, devuelve ese número. */
function parseNumeroSosDesdeCodigoLinea(codigo: string): number | null {
  const t = codigo.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  if (tipoColumnaDesdeRangoSos(n)) return n;
  return null;
}

/**
 * Códigos ARCA de aportes / retenciones (LSD 81xxxx / 82xxxx) → columna Retenciones.
 * El n° SOS suele ser 200–299; si el recibo guardó solo el código ARCA, igual ubicamos la columna.
 */
function tipoColumnaDesdeCodigoAfip(codigo: string | null | undefined): TipoColumnaRecibo | null {
  if (!codigo) return null;
  const digits = codigo.replace(/\D/g, '');
  if (digits.length === 0) return null;
  const last6 =
    digits.length >= 6 ? parseInt(digits.slice(-6), 10) : parseInt(digits, 10);
  if (Number.isNaN(last6)) return null;
  if (last6 >= 810000 && last6 <= 829999) return 'retencion';
  return null;
}

function extraerNumeroSos(
  detalle: typeof liquidacionImportConceptoValor.$inferSelect,
  concepto: typeof payrollConcepto.$inferSelect | null,
  conceptoSos: typeof conceptoSos.$inferSelect | null
): number | null {
  if (concepto?.numeroSos != null && concepto.numeroSos > 0) {
    return concepto.numeroSos;
  }
  if (conceptoSos?.codigo) {
    const t = conceptoSos.codigo.trim();
    if (/^\d+$/.test(t)) {
      const n = parseInt(t, 10);
      if (tipoColumnaDesdeRangoSos(n)) return n;
    }
  }
  const desdeLinea = parseNumeroSosDesdeCodigoLinea(detalle.codigo);
  if (desdeLinea != null) return desdeLinea;
  return null;
}

/**
 * Columna para el recibo: prioriza reglas SOS (n° concepto / ARCA); si no alcanza, motor + catálogo.
 */
function tipoColumnaSosContador(
  detalle: typeof liquidacionImportConceptoValor.$inferSelect,
  concepto: typeof payrollConcepto.$inferSelect | null,
  conceptoSos: typeof conceptoSos.$inferSelect | null
): TipoColumnaRecibo {
  const n = extraerNumeroSos(detalle, concepto, conceptoSos);
  if (n != null) {
    const col = tipoColumnaDesdeRangoSos(n);
    if (col) return col;
  }
  const colAfip = tipoColumnaDesdeCodigoAfip(
    concepto?.codigoArca ?? detalle.codigo
  );
  if (colAfip) return colAfip;

  const raw = detalle.tipoLiquidacion;
  if (
    raw === 'remunerativo' ||
    raw === 'no_remunerativo' ||
    raw === 'descuento' ||
    raw === 'retencion'
  ) {
    return raw;
  }
  return tipoConceptoParaColumnaRecibo(concepto);
}

type DetalleReciboRow = {
  detalle: typeof liquidacionImportConceptoValor.$inferSelect;
  concepto: typeof payrollConcepto.$inferSelect | null;
  conceptoAfip: typeof lsdConceptoAfip.$inferSelect | null;
  conceptoSos: typeof conceptoSos.$inferSelect | null;
};

/** El OR en el join a AFIP puede duplicar filas; nos quedamos con una y priorizamos la que trae `concepto`. */
function mergeDetalleFilasDuplicadas(rows: DetalleReciboRow[]): DetalleReciboRow[] {
  const map = new Map<string, DetalleReciboRow>();
  for (const row of rows) {
    const id = row.detalle.id;
    const prev = map.get(id);
    if (!prev) {
      map.set(id, row);
      continue;
    }
    const prefer = !prev.concepto && row.concepto ? row : prev;
    const otro = prefer === row ? prev : row;
    map.set(id, {
      detalle: prefer.detalle,
      concepto: prefer.concepto ?? otro.concepto,
      conceptoAfip: prefer.conceptoAfip ?? otro.conceptoAfip,
      conceptoSos: prefer.conceptoSos ?? otro.conceptoSos,
    });
  }
  return Array.from(map.values());
}

async function enrichConceptosFaltantes(
  rows: DetalleReciboRow[]
): Promise<DetalleReciboRow[]> {
  const ids = [
    ...new Set(
      rows
        .filter((r) => r.detalle.conceptoId && !r.concepto)
        .map((r) => r.detalle.conceptoId!)
    ),
  ];
  if (ids.length === 0) return rows;
  const extra = await db
    .select()
    .from(payrollConcepto)
    .where(inArray(payrollConcepto.id, ids));
  const byId = new Map(extra.map((c) => [c.id, c]));
  return rows.map((r) =>
    r.concepto || !r.detalle.conceptoId
      ? r
      : { ...r, concepto: byId.get(r.detalle.conceptoId) ?? null }
  );
}

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

    const basicoCalculado = await basicoParaRecibo(
      liq.empleado,
      liq.liquidacion
    );
    const categoriaIdBasicoEscala =
      liq.empleado.categoriaId ?? (await resolveCategoriaIdParaBasico(liq.empleado));
    const basicoEscalaCategoria =
      categoriaIdBasicoEscala
        ? await getBasicoVigenteInternal(
            categoriaIdBasicoEscala,
            liq.liquidacion.periodo
          )
        : 0;

    const detallesRaw = await db
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
        eq(
          lsdConceptoAfip.codigoAfip,
          sql`coalesce(${payrollConcepto.codigoArca}, ${liquidacionImportConceptoValor.codigo})`
        )
      )
      .leftJoin(
        conceptoSos,
        or(
          eq(liquidacionImportConceptoValor.codigo, conceptoSos.codigo),
          and(
            isNotNull(payrollConcepto.numeroSos),
            eq(
              conceptoSos.codigo,
              sql`cast(${payrollConcepto.numeroSos} as text)`
            )
          )
        )
      )
      .where(eq(liquidacionImportConceptoValor.reciboId, ctx.data.liquidacionId))
      .orderBy(asc(liquidacionImportConceptoValor.codigo));

    let merged = mergeDetalleFilasDuplicadas(detallesRaw);
    merged = await enrichConceptosFaltantes(merged);

    const detalles = merged.map((row) => ({
      ...row,
      tipoColumna: tipoColumnaSosContador(
        row.detalle,
        row.concepto,
        row.conceptoSos
      ),
    }));

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
      detalles,
    };
    return JSON.parse(JSON.stringify(payload)) as typeof payload;
  });
