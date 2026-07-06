import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  representative,
  client,
  lsdConceptoAfip,
  lsdPerfilConcepto,
  conceptoSos,
  conceptoSosClient,
  conceptosCompletosSos,
  payrollConvenio,
  payrollConvenioFuente,
  payrollConvenioCategoria,
  payrollEscala,
  payrollConcepto,
  payrollModalidadContratacion,
  payrollSituacion,
  payrollZona,
  payrollCondicion,
  payrollActividad,
  payrollSiniestrado,
  payrollProvincia,
  payrollTipoEmpresa,
  afipEmpleadoresConvenio,
  conveniosDeTrabajo,
  liquidacionImportEmpleado,
  liquidacionImportRecibo,
  liquidacionImportConceptoValor,
  obraSocial,
  payrollParametrosPeriodo,
  payrollLocalidad,
  payrollLsdPresentacion,
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
  like,
  aliasedTable,
  max,
} from 'drizzle-orm';
import {
  montoLiquidadoDesdeEditsSos,
  parseDecimalSos,
  totalesReciboSosDesdeMontos,
} from '@/lib/sos-recibo-totales';
import { normalizeLegajo } from '@/lib/legajo';

/** Verifica que el cliente pertenezca a la org. y tenga al menos un perfil con liquidación de sueldos habilitada. */
async function ensureClientBelongsToOrg(
  clientId: string,
  orgId: string
): Promise<void> {
  const [c] = await db
    .select({ id: representative.id })
    .from(representative)
    .innerJoin(
      client,
      and(eq(client.representativeId, representative.id), eq(client.liquidaSueldos, true))
    )
    .where(and(eq(representative.id, clientId), eq(representative.organizationId, orgId)))
    .limit(1);
  if (!c) {
    throw new Error(
      'Cliente no encontrado, no autorizado o sin liquidación de sueldos habilitada'
    );
  }
}

async function ensureClientBelongsToRepresentative(
  clientId: string,
  representativeId: string
): Promise<void> {
  const [p] = await db
    .select({ id: client.id })
    .from(client)
    .where(and(eq(client.id, clientId), eq(client.representativeId, representativeId)))
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
    await ensureClientBelongsToRepresentative(preferredProfileId, clientId);
    const [p] = await db
      .select({ id: client.id })
      .from(client)
      .where(
        and(
          eq(client.id, preferredProfileId),
          eq(client.representativeId, clientId),
          eq(client.liquidaSueldos, true)
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
    .select({ id: client.id })
    .from(client)
    .innerJoin(representative, eq(client.representativeId, representative.id))
    .where(
      and(
        eq(representative.id, clientId),
        eq(representative.organizationId, orgId),
        eq(client.liquidaSueldos, true)
      )
    )
    .orderBy(asc(client.name))
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
        eq(liquidacionImportEmpleado.clientId, input.profileId),
        eq(liquidacionImportEmpleado.cuil, input.cuil)
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
      clientId: input.profileId,
      cuil: input.cuil,
      // fechaIngreso = misma que fechaAlta al crear; se puede editar luego si cambia la empresa
      fechaIngreso: input.fechaAlta,
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
      profileId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const convenios = await db
      .select({
        id: payrollConvenio.id,
        clientId: payrollConvenio.representativeId,
        profileId: payrollConvenio.clientId,
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
      .where(
        and(
          eq(payrollConvenio.representativeId, ctx.data.clientId),
          eq(payrollConvenio.clientId, ctx.data.profileId)
        )
      )
      .orderBy(payrollConvenio.nombre);

    if (ctx.data.profileId) {
      await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);
    }

    // Si se pasa profileId, traer solo los CCTs de ese perfil; si no, traer todos del cliente.
    const afipRows = await db
      .select({
        cct: afipEmpleadoresConvenio.cct,
        updatedAt: afipEmpleadoresConvenio.updatedAt,
      })
      .from(afipEmpleadoresConvenio)
      .where(eq(afipEmpleadoresConvenio.clientId, ctx.data.profileId));

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
      .where(
        and(
          eq(payrollConvenio.representativeId, ctx.data.clientId),
          eq(payrollConvenio.clientId, ctx.data.profileId)
        )
      );

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
      .where(
        and(
          eq(payrollConvenio.representativeId, ctx.data.clientId),
          eq(payrollConvenio.clientId, ctx.data.profileId)
        )
      );

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

    // Cuando se filtra por perfil y el perfil tiene CCTs registrados en AFIP,
    // mostrar solo los convenios cuyo código CCT está en afip_empleadores_convenio
    // para ese perfil. Si el perfil no tiene ningún CCT en AFIP, mostrar todos
    // (estado inicial antes del primer scraping).
    if (ctx.data.profileId && afipRows.length > 0) {
      return mapped.filter((c) => c.afipUpdatedAt !== null);
    }

    return mapped;
  });

export const createConvenio = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
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
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);
    const [row] = await db
      .insert(payrollConvenio)
      .values({
        representativeId: ctx.data.clientId,
        clientId: ctx.data.profileId,
        nombre: ctx.data.nombre,
        cctCodigo: ctx.data.cctCodigo?.trim() || extractCctCodigo(ctx.data.nombre),
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
      profileId: z.string().uuid(),
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
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);
    const [row] = await db
      .update(payrollConvenio)
      .set({
        nombre: ctx.data.nombre,
        cctCodigo: ctx.data.cctCodigo?.trim() || extractCctCodigo(ctx.data.nombre),
        descripcion: ctx.data.descripcion ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payrollConvenio.id, ctx.data.id),
          eq(payrollConvenio.representativeId, ctx.data.clientId),
          eq(payrollConvenio.clientId, ctx.data.profileId)
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
      profileId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);
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
          eq(payrollConvenio.representativeId, ctx.data.clientId),
          eq(payrollConvenio.clientId, ctx.data.profileId)
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
        profileId: afipEmpleadoresConvenio.clientId,
        cct: conveniosDeTrabajo.cct,
        actividad: conveniosDeTrabajo.nombre,
        signatarios: conveniosDeTrabajo.signatarios,
        fechaNovedad: afipEmpleadoresConvenio.fechaNovedad,
        updatedAt: afipEmpleadoresConvenio.updatedAt,
      })
      .from(afipEmpleadoresConvenio)
      .innerJoin(client, eq(afipEmpleadoresConvenio.clientId, client.id))
      .leftJoin(conveniosDeTrabajo, eq(afipEmpleadoresConvenio.convenioId, conveniosDeTrabajo.id))
      .where(eq(client.representativeId, ctx.data.clientId))
      .orderBy(desc(afipEmpleadoresConvenio.updatedAt));

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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    return db
      .select({
        afipCodigo: lsdConceptoAfip.codigoAfip,
        afipNombre: lsdConceptoAfip.descripcion,
        codigoContribuyente: lsdPerfilConcepto.codigoContribuyente,
        descripcionContribuyente: lsdPerfilConcepto.descripcionContribuyente,
        marcaRepetible: lsdPerfilConcepto.marcaRepetible,
        codigoSos: conceptoSos.codigo,
        nombreSos: conceptoSos.nombre,
        sosVinculadoPerfil: sql<boolean>`${conceptoSosClient.id} is not null`,
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
        conceptoSosClient,
        and(
          eq(conceptoSosClient.conceptoId, conceptoSos.id),
          eq(conceptoSosClient.clientId, lsdPerfilConcepto.clientId)
        )
      )
      .leftJoin(
        conceptosCompletosSos,
        sql`${conceptosCompletosSos.numeroSos} = cast(${lsdPerfilConcepto.codigoContribuyente} as integer)`
      )
      .where(eq(lsdPerfilConcepto.clientId, ctx.data.profileId))
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
        profileId: afipEmpleadoresConvenio.clientId,
        cct: conveniosDeTrabajo.cct,
        actividad: conveniosDeTrabajo.nombre,
        signatarios: conveniosDeTrabajo.signatarios,
        fechaNovedad: afipEmpleadoresConvenio.fechaNovedad,
      })
      .from(afipEmpleadoresConvenio)
      .innerJoin(client, eq(afipEmpleadoresConvenio.clientId, client.id))
      .leftJoin(conveniosDeTrabajo, eq(afipEmpleadoresConvenio.convenioId, conveniosDeTrabajo.id))
      .where(
        and(
          eq(client.representativeId, ctx.data.clientId),
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
          eq(payrollConvenio.representativeId, ctx.data.clientId),
          eq(payrollConvenio.clientId, afipRow.profileId),
          or(
            afipRow.cct ? eq(payrollConvenio.nombre, afipRow.cct) : undefined,
            cctNormalizado ? eq(payrollConvenio.nombre, cctNormalizado) : undefined,
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
        representativeId: ctx.data.clientId,
        clientId: afipRow.profileId,
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
          eq(payrollConvenio.representativeId, ctx.data.clientId)
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
  profileId: string
): Promise<string | null> {
  if (empleado.convenioId) return empleado.convenioId;
  const convenios = await db
    .select({ id: payrollConvenio.id })
    .from(payrollConvenio)
    .where(eq(payrollConvenio.clientId, profileId));
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
    .from(payrollEscala)
    .where(
      and(
        eq(payrollEscala.categoriaId, categoriaId),
        sql`(${payrollEscala.vigenciaDesde})::date <= (to_date(${periodo} || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date`,
        or(
          isNull(payrollEscala.vigenciaHasta),
          sql`(${payrollEscala.vigenciaHasta})::date >= to_date(${periodo} || '-01', 'YYYY-MM-DD')`
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(
        and(
          eq(liquidacionImportEmpleado.id, ctx.data.importEmpleadoId),
          eq(client.representativeId, ctx.data.clientId)
        )
      )
      .limit(1);

    if (!emp) return { basico: 0, tipoJornada: 'full_time' as const, fechaAlta: null as string | null, fechaIngreso: null as string | null };

    const empleado = emp.liquidacion_import_empleado;

    // Resolver categoría para incluirla siempre en la respuesta
    const categoriaId =
      empleado.categoriaId ?? (await resolveCategoriaIdParaBasico(empleado));

    let categoriaNombre: string | null = null;
    let esExcluidoConvenio = false;
    if (categoriaId) {
      const [catRow] = await db
        .select({
          nombre: payrollConvenioCategoria.nombre,
          cctCodigo: payrollConvenio.cctCodigo,
        })
        .from(payrollConvenioCategoria)
        .leftJoin(payrollConvenio, eq(payrollConvenio.id, payrollConvenioCategoria.convenioId))
        .where(eq(payrollConvenioCategoria.id, categoriaId))
        .limit(1);
      categoriaNombre = catRow?.nombre ?? null;
      esExcluidoConvenio = catRow?.cctCodigo === '9999/99';
    }

    const periodoNorm = normalizarPeriodoYYYYMM(ctx.data.periodo);

    // 1° prioridad: override manual en el legajo (seteado explícitamente por el usuario)
    const override = empleado.valorSueldo != null ? Number(empleado.valorSueldo) : 0;
    if (!Number.isNaN(override) && override > 0) {
      const fechaAltaStr = empleado.fechaAlta ? empleado.fechaAlta.toISOString().slice(0, 10) : null;
      const fechaIngresoStr = empleado.fechaIngreso ? empleado.fechaIngreso.toISOString().slice(0, 10) : null;
      return { basico: override, categoriaNombre, esExcluidoConvenio, tipoJornada: empleado.tipoJornada ?? 'full_time', sinEscalaParaPeriodo: false, fallbackPeriodoLabel: null, periodoEscalaLabel: null, fechaAlta: fechaAltaStr, fechaIngreso: fechaIngresoStr };
    }

    // 2° prioridad: escala configurada para el período exacto
    let escalaPeriodo: { monto: string; periodoLabel: string | null } | undefined;
    if (categoriaId) {
      const [row] = await db
        .select({
          monto: payrollEscala.montoBasico,
          periodoLabel: payrollEscala.periodoLabel,
        })
        .from(payrollEscala)
        .where(
          and(
            eq(payrollEscala.categoriaId, categoriaId),
            sql`(${payrollEscala.vigenciaDesde})::date <= (to_date(${periodoNorm} || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date`,
            or(
              isNull(payrollEscala.vigenciaHasta),
              sql`(${payrollEscala.vigenciaHasta})::date >= to_date(${periodoNorm} || '-01', 'YYYY-MM-DD')`
            )
          )
        )
        .orderBy(desc(payrollEscala.vigenciaDesde))
        .limit(1);
      escalaPeriodo = row;
    }

    const tipoJornada = empleado.tipoJornada ?? 'full_time';

    if (escalaPeriodo) {
      return {
        basico: Number(escalaPeriodo.monto),
        categoriaNombre,
        esExcluidoConvenio,
        tipoJornada,
        sinEscalaParaPeriodo: false,
        fallbackPeriodoLabel: null,
        periodoEscalaLabel: escalaPeriodo.periodoLabel,
        fechaAlta: empleado.fechaAlta ? empleado.fechaAlta.toISOString().slice(0, 10) : null,
        fechaIngreso: empleado.fechaIngreso ? empleado.fechaIngreso.toISOString().slice(0, 10) : null,
      };
    }

    const fechaAltaStr2 = empleado.fechaAlta ? empleado.fechaAlta.toISOString().slice(0, 10) : null;
    const fechaIngresoStr2 = empleado.fechaIngreso ? empleado.fechaIngreso.toISOString().slice(0, 10) : null;
    if (!categoriaId) return { basico: 0, categoriaNombre: null, esExcluidoConvenio: false, tipoJornada, fechaAlta: fechaAltaStr2, fechaIngreso: fechaIngresoStr2 };

    // 3° prioridad: escala más reciente anterior al período (fallback)
    let basico = 0;
    let sinEscalaParaPeriodo = false;
    let fallbackPeriodoLabel: string | null = null;
    let periodoEscalaLabel: string | null = null;

    const [masReciente] = await db
      .select({ monto: payrollEscala.montoBasico, periodoLabel: payrollEscala.periodoLabel })
      .from(payrollEscala)
      .where(
        and(
          eq(payrollEscala.categoriaId, categoriaId),
          sql`(${payrollEscala.vigenciaDesde})::date <= (to_date(${periodoNorm} || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date`
        )
      )
      .orderBy(desc(payrollEscala.vigenciaDesde))
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
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    return db
      .select()
      .from(payrollConcepto)
      .where(eq(payrollConcepto.representativeId, ctx.data.clientId))
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
        // `clientId` del contrato es el representante; conceptos se scopean por representativeId.
        representativeId: ctx.data.clientId,
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
        and(eq(payrollConcepto.id, id), eq(payrollConcepto.representativeId, clientId))
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
          eq(payrollConcepto.representativeId, ctx.data.clientId)
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
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);
    const rows = await db
      .select({
        empleado: liquidacionImportEmpleado,
        convenioNombre: payrollConvenio.nombre,
        categoriaNombre: payrollConvenioCategoria.nombre,
      })
      .from(liquidacionImportEmpleado)
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
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
          eq(client.representativeId, ctx.data.clientId),
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId)
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
        profileName: client.name,
        profileIdentityNumber: client.identityNumber,
        convenioNombre: payrollConvenio.nombre,
        categoriaNombre: payrollConvenioCategoria.nombre,
        obraSocialNombre: obraSocial.nombre,
        obraSocialCodigo: obraSocial.codigo,
        modalidadNombre: payrollModalidadContratacion.nombre,
        situacionNombre: payrollSituacion.nombre,
        zonaNombre: payrollZona.nombre,
        condicionNombre: payrollCondicion.nombre,
        actividadNombre: payrollActividad.nombre,
        siniestradoNombre: payrollSiniestrado.nombre,
        provinciaNombre: payrollProvincia.nombre,
      })
      .from(liquidacionImportEmpleado)
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .leftJoin(payrollConvenio, eq(liquidacionImportEmpleado.convenioId, payrollConvenio.id))
      .leftJoin(payrollConvenioCategoria, eq(liquidacionImportEmpleado.categoriaId, payrollConvenioCategoria.id))
      .leftJoin(obraSocial, eq(liquidacionImportEmpleado.obraSocialId, obraSocial.id))
      .leftJoin(payrollModalidadContratacion, eq(liquidacionImportEmpleado.modalidadContratacionId, payrollModalidadContratacion.id))
      .leftJoin(payrollSituacion, eq(liquidacionImportEmpleado.situacionId, payrollSituacion.id))
      .leftJoin(payrollZona, eq(liquidacionImportEmpleado.zonaId, payrollZona.id))
      .leftJoin(payrollCondicion, eq(liquidacionImportEmpleado.condicionId, payrollCondicion.id))
      .leftJoin(payrollActividad, eq(liquidacionImportEmpleado.actividadId, payrollActividad.id))
      .leftJoin(payrollSiniestrado, eq(liquidacionImportEmpleado.siniestradoId, payrollSiniestrado.id))
      .leftJoin(payrollProvincia, eq(liquidacionImportEmpleado.provinciaId, payrollProvincia.id))
      .where(
        and(
          eq(client.representativeId, ctx.data.clientId),
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId)
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
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);
    const [row] = await db
      .select({ usaLsdReferencia: client.usaLsdReferencia })
      .from(client)
      .where(eq(client.id, ctx.data.profileId))
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
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    // 1. CCTs del perfil
    const afipRows = await db
      .select({ cct: afipEmpleadoresConvenio.cct })
      .from(afipEmpleadoresConvenio)
      .where(eq(afipEmpleadoresConvenio.clientId, ctx.data.profileId));

    const cctSet = new Set(
      afipRows.map((r) => extractCct(r.cct)).filter((c): c is string => Boolean(c))
    );

    // 2. Convenios del cliente que coinciden con algún CCT del perfil
    const conveniosClient = await db
      .select()
      .from(payrollConvenio)
      .where(
        and(
          eq(payrollConvenio.representativeId, ctx.data.clientId),
          eq(payrollConvenio.clientId, ctx.data.profileId)
        )
      );

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
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId),
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
      tipoJornada: z.enum(['full_time', 'part_time', 'reducida']).optional(),
      convenioId: z.string().uuid().optional(),
      categoriaId: z.string().uuid().optional(),
      formaPago: z.string().optional(),
      banco: z.string().optional(),
      cbu: z.string().optional(),
      lugarPago: z.string().optional(),
      domicilio: z.string().optional(),
      localidad: z.string().optional(),
      codigoPostal: z.string().optional(),
      conyuge: z.number().int().optional(),
      hijos: z.number().int().optional(),
      adherentes: z.number().int().optional(),
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
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    const [row] = await db
      .insert(liquidacionImportEmpleado)
      .values({
        clientId: ctx.data.profileId,
        cuil: ctx.data.cuil,
        legajo: ctx.data.legajo,
        nombre: ctx.data.nombre,
        fechaAlta: ctx.data.fechaAlta ? new Date(ctx.data.fechaAlta) : null,
        fechaIngreso: ctx.data.fechaAlta ? new Date(ctx.data.fechaAlta) : null,
        fechaBaja: ctx.data.fechaBaja ? new Date(ctx.data.fechaBaja) : null,
        modoContrato: ctx.data.modoContrato ?? null,
        categoria: ctx.data.categoria ?? null,
        origen: 'manual',
        tipoJornada: ctx.data.tipoJornada ?? null,
        convenioId: ctx.data.convenioId ?? null,
        categoriaId: ctx.data.categoriaId ?? null,
        formaPago: ctx.data.formaPago ?? null,
        banco: ctx.data.banco ?? null,
        cbu: ctx.data.cbu ?? null,
        lugarPago: ctx.data.lugarPago ?? null,
        domicilio: ctx.data.domicilio ?? null,
        localidad: ctx.data.localidad ?? null,
        codigoPostal: ctx.data.codigoPostal ?? null,
        conyuge: ctx.data.conyuge ?? null,
        hijos: ctx.data.hijos ?? null,
        adherentes: ctx.data.adherentes ?? null,
        obraSocialId: ctx.data.obraSocialId ?? null,
        provinciaId: ctx.data.provinciaId ?? null,
        modalidadContratacionId: ctx.data.modalidadContratacionId ?? null,
        situacionId: ctx.data.situacionId ?? null,
        zonaId: ctx.data.zonaId ?? null,
        condicionId: ctx.data.condicionId ?? null,
        actividadId: ctx.data.actividadId ?? null,
        siniestradoId: ctx.data.siniestradoId ?? null,
        observaciones: ctx.data.observaciones ?? null,
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .leftJoin(obraSocial, eq(liquidacionImportEmpleado.obraSocialId, obraSocial.id))
      .where(
        and(
          eq(client.representativeId, ctx.data.clientId),
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId),
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(
        and(
          eq(client.representativeId, ctx.data.clientId),
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
      /** Cuando se provee, carga ese recibo específico en lugar del último. */
      liquidacionId: z.string().uuid().optional(),
      /**
       * Período destino (YYYY-MM) para calcular el mejor sueldo del semestre.
       * Si no se provee, se usa el período del último recibo encontrado.
       * Necesario en modo "nuevo recibo" donde el recibo aún no existe.
       */
      periodoSemestre: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const rowQuery = ctx.data.liquidacionId
      ? await db
          .select({ recibo: liquidacionImportRecibo })
          .from(liquidacionImportRecibo)
          .innerJoin(
            liquidacionImportEmpleado,
            eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
          )
          .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
          .where(
            and(
              eq(liquidacionImportRecibo.id, ctx.data.liquidacionId),
              eq(client.representativeId, ctx.data.clientId)
            )
          )
          .limit(1)
      : await db
          .select({ recibo: liquidacionImportRecibo })
          .from(liquidacionImportRecibo)
          .innerJoin(
            liquidacionImportEmpleado,
            eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
          )
          .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
          .where(
            and(
              eq(liquidacionImportRecibo.empleadoId, ctx.data.importEmpleadoId),
              eq(client.representativeId, ctx.data.clientId)
            )
          )
          .orderBy(desc(liquidacionImportRecibo.periodo))
          .limit(1);

    const row = rowQuery[0];
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
        memo: liquidacionImportConceptoValor.memo,
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

    // Mejor sueldo del semestre — usado por concepto 401 (vacaciones no gozadas) y conceptos 41/42 (SAC).
    // Usa periodoSemestre cuando se provee (modo nuevo recibo) o el período del recibo cargado.
    const periodoParaSemestre = ctx.data.periodoSemestre ?? row.recibo.periodo;
    const [rYear, rMonthStr] = periodoParaSemestre.split('-');
    const rMonth = parseInt(rMonthStr, 10);
    const rSemesterStart = rMonth <= 6 ? 1 : 7;
    const rSemesterMonths: string[] = [];
    for (let m = rSemesterStart; m <= rMonth; m++) {
      rSemesterMonths.push(`${rYear}-${String(m).padStart(2, '0')}`);
    }
    const rRecibosSemestre = await db
      .select({
        haberes: liquidacionImportRecibo.haberes,
        noRemunerativo: liquidacionImportRecibo.noRemunerativo,
      })
      .from(liquidacionImportRecibo)
      .where(
        and(
          eq(liquidacionImportRecibo.empleadoId, row.recibo.empleadoId),
          inArray(liquidacionImportRecibo.periodo, rSemesterMonths),
          eq(liquidacionImportRecibo.tipo, 'sueldo')
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      /** Si se pasa, usa el profileId para buscar el empleado de referencia de plantilla. */
      profileId: z.string().uuid().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    // Cargar catálogo completo SOS (1-699)
    const rows = await db
      .select()
      .from(conceptosCompletosSos)
      .where(and(
        gte(conceptosCompletosSos.numeroSos, 1),
        lte(conceptosCompletosSos.numeroSos, 699)
      ))
      .orderBy(conceptosCompletosSos.numeroSos);

    // Buscar el empleado de referencia para la plantilla base (si el perfil tiene uno configurado)
    const refProfileId = ctx.data.profileId ?? ctx.data.clientId;
    const profileRow = await db
      .select({ plantillaEmpleadoId: client.payrollPlantillaEmpleadoId })
      .from(client)
      .where(eq(client.id, refProfileId))
      .then((r) => r[0] ?? null);

    // Mapa de código SOS → valores del empleado de referencia
    const plantillaMap = new Map<string, {
      cantidad: string | null;
      porcentaje: string | null;
      importeConceptoNumero: string | null;
      importe: string | null;
      importeMinimo: string | null;
      importeMaximo: string | null;
    }>();

    if (profileRow?.plantillaEmpleadoId) {
      // Buscar el último recibo del empleado de referencia
      const ultimoReciboRef = await db
        .select({ id: liquidacionImportRecibo.id })
        .from(liquidacionImportRecibo)
        .where(eq(liquidacionImportRecibo.empleadoId, profileRow.plantillaEmpleadoId))
        .orderBy(liquidacionImportRecibo.periodo)
        .then((r) => r.at(-1) ?? null);

      if (ultimoReciboRef) {
        const conceptosRef = await db
          .select({
            codigo: liquidacionImportConceptoValor.codigo,
            cantidad: liquidacionImportConceptoValor.cantidad,
            porcentaje: liquidacionImportConceptoValor.porcentaje,
            importeConceptoNumero: liquidacionImportConceptoValor.importeConceptoNumero,
            importe: liquidacionImportConceptoValor.importe,
            importeMinimo: liquidacionImportConceptoValor.importeMinimo,
            importeMaximo: liquidacionImportConceptoValor.importeMaximo,
          })
          .from(liquidacionImportConceptoValor)
          .where(eq(liquidacionImportConceptoValor.reciboId, ultimoReciboRef.id));

        for (const c of conceptosRef) {
          const num = parseInt(c.codigo, 10);
          if (num >= 1 && num <= 699) {
            plantillaMap.set(c.codigo, {
              cantidad: c.cantidad ?? null,
              porcentaje: c.porcentaje ?? null,
              importeConceptoNumero: c.importeConceptoNumero ?? null,
              importe: c.importe ?? null,
              importeMinimo: c.importeMinimo ?? null,
              importeMaximo: c.importeMaximo ?? null,
            });
          }
        }
      }
    }

    return rows.map((r) => {
      const codigo = String(r.numeroSos);
      const ref = plantillaMap.get(codigo);
      return {
        id: r.id,
        codigo,
        monto: null as string | null,
        cantidad: ref?.cantidad ?? null,
        porcentaje: ref?.porcentaje ?? (r.pctFijo != null ? String(r.pctFijo) : null) as string | null,
        importeConceptoNumero: ref?.importeConceptoNumero ?? null,
        importe: ref?.importe ?? null,
        importeMinimo: ref?.importeMinimo ?? null,
        importeMaximo: ref?.importeMaximo ?? null,
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
        tieneMemo: r.tieneMemo ?? null,
        pctFijo: r.pctFijo != null ? Number(r.pctFijo) : null,
        /** true = concepto activo por defecto en la plantilla base */
        isPlantillaBase: plantillaMap.has(codigo),
      };
    });
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(
        and(
          eq(liquidacionImportRecibo.id, ctx.data.reciboId),
          eq(client.representativeId, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!row) throw new Error('Recibo no encontrado o no autorizado');
    const conceptos = await db
      .select()
      .from(liquidacionImportConceptoValor)
      .where(eq(liquidacionImportConceptoValor.reciboId, ctx.data.reciboId))
      .orderBy(sql`${liquidacionImportConceptoValor.codigo}::int`);
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

export const listModalidadesContratacion = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({ id: payrollModalidadContratacion.id, codigo: payrollModalidadContratacion.codigo, nombre: payrollModalidadContratacion.nombre })
      .from(payrollModalidadContratacion)
      .orderBy(asc(payrollModalidadContratacion.codigo));
  }
);

export const listSituaciones = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({ id: payrollSituacion.id, codigo: payrollSituacion.codigo, nombre: payrollSituacion.nombre })
      .from(payrollSituacion)
      .orderBy(asc(payrollSituacion.codigo));
  }
);

export const listZonas = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({ id: payrollZona.id, codigo: payrollZona.codigo, nombre: payrollZona.nombre })
      .from(payrollZona)
      .orderBy(asc(payrollZona.codigo));
  }
);

export const listCondiciones = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({ id: payrollCondicion.id, codigo: payrollCondicion.codigo, nombre: payrollCondicion.nombre })
      .from(payrollCondicion)
      .orderBy(asc(payrollCondicion.codigo));
  }
);

export const listActividades = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({ id: payrollActividad.id, codigo: payrollActividad.codigo, nombre: payrollActividad.nombre })
      .from(payrollActividad)
      .orderBy(asc(payrollActividad.codigo));
  }
);

export const listSiniestrados = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({ id: payrollSiniestrado.id, codigo: payrollSiniestrado.codigo, nombre: payrollSiniestrado.nombre })
      .from(payrollSiniestrado)
      .orderBy(asc(payrollSiniestrado.codigo));
  }
);

export const listProvincias = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({ id: payrollProvincia.id, codigo: payrollProvincia.codigo, nombre: payrollProvincia.nombre })
      .from(payrollProvincia)
      .orderBy(asc(payrollProvincia.nombre));
  }
);

export const listTiposEmpresa = createServerFn({ method: 'GET' }).handler(
  async () => {
    await getSessionWithOrg();
    return db
      .select({ id: payrollTipoEmpresa.id, codigoLsd: payrollTipoEmpresa.codigoLsd, nombre: payrollTipoEmpresa.nombre })
      .from(payrollTipoEmpresa)
      .orderBy(asc(payrollTipoEmpresa.codigoLsd));
  }
);

export const getEmpleadorConfig = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .select({
        tipoEmpresaId: client.tipoEmpresaId,
        seguroColectivo: client.seguroColectivo,
        mipyme: client.mipyme,
        ordenCLN: client.ordenCLN,
        situacionDefaultId: client.situacionDefaultId,
        condicionDefaultId: client.condicionDefaultId,
        actividadDefaultId: client.actividadDefaultId,
        contratacionDefaultId: client.contratacionDefaultId,
        siniestradoDefaultId: client.siniestradoDefaultId,
        zonaDefaultId: client.zonaDefaultId,
        obraSocialDefaultId: client.obraSocialDefaultId,
      })
      .from(client)
      .where(eq(client.id, ctx.data.clientId))
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
  .inputValidator(empleadorConfigSchema)
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await assertCanWrite(orgId);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const { clientId, ...fields } = ctx.data;
    await db.update(client).set(fields).where(eq(client.id, clientId));
  });

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
  memo: z.string().optional().nullable(),
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
      // Metadata del recibo (opcionales: se usan al crear, se omiten al editar desde "Editar")
      quincena: z.enum(['0', '1', '2']).optional(),
      fechaLiquidacion: z.string().optional(),
      obraSocialId: z.string().uuid().optional().nullable(),
      fechaPago: z.string().optional(),
      lugarPago: z.string().optional().nullable(),
      formaPago: z.enum(['efectivo', 'cheque', 'acreditacion']).optional(),
      cbu: z.string().optional().nullable(),
      banco: z.string().optional().nullable(),
      periodoCargas: z.string().optional(),
      fechaDepositoCargas: z.string().optional().nullable(),
      observacionInterna: z.string().optional().nullable(),
      observacionRecibo: z.string().optional().nullable(),
      // Situaciones de revista LSD (hasta 3 por período)
      situacionRevista1Id: z.string().uuid().optional().nullable(),
      situacionRevista1DiaInicio: z.number().int().min(1).max(31).optional().nullable(),
      situacionRevista2Id: z.string().uuid().optional().nullable(),
      situacionRevista2DiaInicio: z.number().int().min(1).max(31).optional().nullable(),
      situacionRevista3Id: z.string().uuid().optional().nullable(),
      situacionRevista3DiaInicio: z.number().int().min(1).max(31).optional().nullable(),
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
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);
    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('No se puede liquidar períodos futuros.');
    }

    const [empRow] = await db
      .select({ id: liquidacionImportEmpleado.id })
      .from(liquidacionImportEmpleado)
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(
        and(
          eq(liquidacionImportEmpleado.id, ctx.data.importEmpleadoId),
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId),
          eq(client.representativeId, ctx.data.clientId)
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

      // Campos de metadata opcionales (presentes cuando viene del formulario nuevo,
      // ausentes cuando viene del flujo "Editar" — en ese caso no se sobreescriben).
      const hasMeta = !!ctx.data.fechaLiquidacion;
      const metaFields = hasMeta
        ? {
            quincena: ctx.data.quincena ?? '0',
            fecha: parseISO(ctx.data.fechaLiquidacion!.slice(0, 10)),
            obraSocialId: ctx.data.obraSocialId ?? null,
            fechaPago: ctx.data.fechaPago
              ? parseISO(ctx.data.fechaPago.slice(0, 10))
              : null,
            lugarPago: ctx.data.lugarPago ?? null,
            formaPago: ctx.data.formaPago ?? 'efectivo',
            cbu: ctx.data.cbu ?? null,
            banco: ctx.data.banco ?? null,
            periodoCargas: ctx.data.periodoCargas ?? '',
            fechaDepositoCargas: ctx.data.fechaDepositoCargas
              ? parseISO(ctx.data.fechaDepositoCargas.slice(0, 10))
              : null,
            observacionInterna: ctx.data.observacionInterna ?? null,
            observacionRecibo: ctx.data.observacionRecibo ?? null,
            situacionRevista1Id: ctx.data.situacionRevista1Id ?? null,
            situacionRevista1DiaInicio: ctx.data.situacionRevista1DiaInicio ?? null,
            situacionRevista2Id: ctx.data.situacionRevista2Id ?? null,
            situacionRevista2DiaInicio: ctx.data.situacionRevista2DiaInicio ?? null,
            situacionRevista3Id: ctx.data.situacionRevista3Id ?? null,
            situacionRevista3DiaInicio: ctx.data.situacionRevista3DiaInicio ?? null,
            diasTrabajados: ctx.data.diasTrabajados ?? null,
            horasTrabajadas: ctx.data.horasTrabajadas ?? null,
            importeMaternidadArt13: ctx.data.importeMaternidadArt13 ?? null,
            origen: 'generado' as const,
          }
        : {};

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
            updatedAt: new Date(),
            ...metaFields,
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
            haberes: haberesStr,
            noRemunerativo: noRemStr,
            descuentos: descStr,
            retenciones: retStr,
            neto: netoStr,
            ...metaFields,
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
          memo: c.memo?.trim() || null,
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
    const legajo = normalizeLegajo(ctx.data.legajo);
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
      .where(
        and(
          eq(payrollConvenio.representativeId, ctx.data.clientId),
          ctx.data.profileId
            ? eq(payrollConvenio.clientId, ctx.data.profileId)
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

    // Verify employee belongs to client via profile
    const [empCheck] = await db
      .select({ id: liquidacionImportEmpleado.id })
      .from(liquidacionImportEmpleado)
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(
        and(
          eq(liquidacionImportEmpleado.id, ctx.data.id),
          eq(client.representativeId, ctx.data.clientId)
        )
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
    if (modalidadContratacionId !== undefined) set.modalidadContratacionId = modalidadContratacionId;
    if (situacionId !== undefined) set.situacionId = situacionId;
    if (zonaId !== undefined) set.zonaId = zonaId;
    if (condicionId !== undefined) set.condicionId = condicionId;
    if (actividadId !== undefined) set.actividadId = actividadId;
    if (siniestradoId !== undefined) set.siniestradoId = siniestradoId;
    if (provinciaId !== undefined) set.provinciaId = provinciaId;
    if (observaciones !== undefined) set.observaciones = observaciones?.trim() || null;
    if (valorSueldo !== undefined) set.valorSueldo = valorSueldo != null && valorSueldo.trim() !== '' ? valorSueldo.trim() : null;
    if (fechaBaja !== undefined) set.fechaBaja = fechaBaja ? new Date(fechaBaja) : null;

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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(
        and(
          eq(liquidacionImportEmpleado.id, ctx.data.id),
          eq(client.representativeId, ctx.data.clientId)
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
      clientId: liquidacionImportEmpleado.clientId,
      convenioId: liquidacionImportEmpleado.convenioId,
      lugarPago: liquidacionImportEmpleado.lugarPago,
      formaPago: liquidacionImportEmpleado.formaPago,
      cbu: liquidacionImportEmpleado.cbu,
      banco: liquidacionImportEmpleado.banco,
    })
    .from(liquidacionImportEmpleado)
    .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
    .where(
      and(
        eq(liquidacionImportEmpleado.id, empleadoId),
        eq(client.representativeId, clientId)
      )
    )
    .limit(1);
  if (!emp) throw new Error('Empleado no encontrado');

  const periodoDate = parseISO(periodo + '-01');
  const convenioIdResuelto = await resolveConvenioIdParaEmpleado(emp, emp.clientId);
  const categoriaIdResuelta = await resolveCategoriaIdParaBasico(
    { ...emp, convenioId: convenioIdResuelto } as typeof liquidacionImportEmpleado.$inferSelect
  );

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
    .where(eq(payrollConcepto.representativeId, clientId))
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
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);
    const [profileCfg] = await db
      .select({ usaLsdReferencia: client.usaLsdReferencia })
      .from(client)
      .where(eq(client.id, ctx.data.profileId))
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(
        and(
          eq(client.representativeId, ctx.data.clientId),
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId),
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(
        and(
          eq(client.representativeId, ctx.data.clientId),
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId),
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(
        and(
          eq(client.representativeId, ctx.data.clientId),
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(
        and(
          eq(liquidacionImportRecibo.id, ctx.data.liquidacionId),
          eq(client.representativeId, ctx.data.clientId)
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
      .select({ clientId: client.representativeId })
      .from(liquidacionImportConceptoValor)
      .innerJoin(liquidacionImportRecibo, eq(liquidacionImportConceptoValor.reciboId, liquidacionImportRecibo.id))
      .innerJoin(liquidacionImportEmpleado, eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id))
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
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
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);
    const conditions = [
      condicionPeriodoRecibo(ctx.data.periodo),
      eq(client.representativeId, ctx.data.clientId),
      eq(liquidacionImportEmpleado.clientId, ctx.data.profileId),
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(and(...conditions))
      .orderBy(
        sql`(CASE WHEN ${liquidacionImportEmpleado.legajo} ~ '^[0-9]+$' THEN (${liquidacionImportEmpleado.legajo})::bigint END) NULLS LAST`,
        asc(liquidacionImportEmpleado.nombre)
      );
  });

/**
 * Lista recibos confirmados con filtros opcionales de período y/o empleado.
 * Al menos uno de los dos debe estar presente.
 */
export const listLiquidacionesByFiltros = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        clientId: z.string().uuid(),
        profileId: z.string().uuid(),
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
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);
    const conditions = [
      eq(client.representativeId, ctx.data.clientId),
      eq(liquidacionImportEmpleado.clientId, ctx.data.profileId),
      eq(liquidacionImportRecibo.origen, 'generado'),
    ];
    if (ctx.data.periodo) {
      const cond = condicionPeriodoRecibo(ctx.data.periodo);
      if (cond) conditions.push(cond);
    } else if (ctx.data.ano && ctx.data.semestre) {
      const meses = ctx.data.semestre === 1
        ? ['01', '02', '03', '04', '05', '06']
        : ['07', '08', '09', '10', '11', '12'];
      conditions.push(inArray(liquidacionImportRecibo.periodo, meses.map((m) => `${ctx.data.ano}-${m}`)));
    }
    if (ctx.data.importEmpleadoId) {
      conditions.push(eq(liquidacionImportEmpleado.id, ctx.data.importEmpleadoId));
    }
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(and(...conditions))
      .orderBy(
        desc(liquidacionImportRecibo.periodo),
        sql`(CASE WHEN ${liquidacionImportEmpleado.legajo} ~ '^[0-9]+$' THEN (${liquidacionImportEmpleado.legajo})::bigint END) NULLS LAST`,
        asc(liquidacionImportEmpleado.nombre)
      )
      .limit(300);
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(
        and(
          eq(liquidacionImportRecibo.id, ctx.data.liquidacionId),
          eq(client.representativeId, ctx.data.clientId)
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
      .select({
        firmaDigitalEmpleador: client.firmaDigitalEmpleador,
        plantillaEmpleadoId: client.payrollPlantillaEmpleadoId,
      })
      .from(client)
      .where(eq(client.id, ctx.data.profileId))
      .then((r) => r[0] ?? null);
    return {
      imprimirTotalRedondeado: false,
      firmaEmpleadorUrl: row?.firmaDigitalEmpleador ?? null,
      plantillaEmpleadoId: row?.plantillaEmpleadoId ?? null,
    };
  });

/** Establece el empleado de referencia para la plantilla base de nuevos recibos. */
export const setPlantillaEmpleado = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    clientId: z.string().uuid(),
    profileId: z.string().uuid(),
    empleadoId: z.string().uuid().nullable(),
  }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    // Verificar que el empleado pertenece al profile
    if (ctx.data.empleadoId) {
      const emp = await db
        .select({ id: liquidacionImportEmpleado.id })
        .from(liquidacionImportEmpleado)
        .where(and(
          eq(liquidacionImportEmpleado.id, ctx.data.empleadoId),
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId),
        ))
        .then((r) => r[0] ?? null);
      if (!emp) throw new Error('Empleado no encontrado');
    }
    await db
      .update(client)
      .set({ payrollPlantillaEmpleadoId: ctx.data.empleadoId })
      .where(eq(client.id, ctx.data.profileId));
    return { ok: true };
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
      .update(client)
      .set({ firmaDigitalEmpleador: ctx.data.firmaDigitalEmpleador, updatedAt: new Date() })
      .where(eq(client.id, ctx.data.profileId));
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
  conceptoSosRow: typeof conceptoSos.$inferSelect | null
): number | null {
  if (concepto?.numeroSos != null && concepto.numeroSos > 0) {
    return concepto.numeroSos;
  }
  if (conceptoSosRow?.codigo) {
    const t = conceptoSosRow.codigo.trim();
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
  conceptoSosRow: typeof conceptoSos.$inferSelect | null
): TipoColumnaRecibo {
  const n = extraerNumeroSos(detalle, concepto, conceptoSosRow);
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

/**
 * Para filas donde `conceptoSos` no resolvió (código no está en concepto_sos),
 * busca el nombre en conceptos_completos_sos como fallback.
 */
async function enrichConceptosSosFaltantes(
  rows: DetalleReciboRow[]
): Promise<DetalleReciboRow[]> {
  const codigosFaltantes = [
    ...new Set(
      rows
        .filter((r) => !r.conceptoSos)
        .map((r) => r.detalle.codigo)
        .filter((c) => c && !isNaN(Number(c)))
    ),
  ];
  if (codigosFaltantes.length === 0) return rows;

  const numeros = codigosFaltantes.map(Number);
  const extras = await db
    .select({
      numeroSos: conceptosCompletosSos.numeroSos,
      nombre: conceptosCompletosSos.nombre,
      codigoAfip: conceptosCompletosSos.codigoAfip,
    })
    .from(conceptosCompletosSos)
    .where(inArray(conceptosCompletosSos.numeroSos, numeros));

  const byNum = new Map(extras.map((e) => [String(e.numeroSos), e]));

  return rows.map((r) => {
    if (r.conceptoSos) return r;
    const extra = byNum.get(r.detalle.codigo);
    if (!extra) return r;
    return {
      ...r,
      conceptoSos: {
        id: r.detalle.codigo,
        codigo: String(extra.numeroSos),
        nombre: extra.nombre,
        codigoAfip: extra.codigoAfip ?? '',
        conceptoAfipId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as typeof conceptoSos.$inferSelect,
    };
  });
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
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
          eq(client.representativeId, ctx.data.clientId)
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
      .orderBy(sql`${liquidacionImportConceptoValor.codigo}::int`);

    let merged = mergeDetalleFilasDuplicadas(detallesRaw);
    merged = await enrichConceptosFaltantes(merged);
    merged = await enrichConceptosSosFaltantes(merged);
    merged = merged.sort((a, b) => Number(a.detalle.codigo) - Number(b.detalle.codigo));

    const detalles = merged.map((row) => ({
      ...row,
      tipoColumna: tipoColumnaSosContador(
        row.detalle,
        row.concepto,
        row.conceptoSos
      ),
    }));

    // Mejor sueldo del semestre para concepto 401 (vacaciones no gozadas) — TIN-950
    const [periodoYear, periodoMonthStr] = liq.liquidacion.periodo.split('-');
    const periodoMonth = parseInt(periodoMonthStr, 10);
    const semesterStart = periodoMonth <= 6 ? 1 : 7;
    const semesterMonths: string[] = [];
    for (let m = semesterStart; m <= periodoMonth; m++) {
      semesterMonths.push(`${periodoYear}-${String(m).padStart(2, '0')}`);
    }
    const recibosSemestre = await db
      .select({
        haberes: liquidacionImportRecibo.haberes,
        noRemunerativo: liquidacionImportRecibo.noRemunerativo,
      })
      .from(liquidacionImportRecibo)
      .where(
        and(
          eq(liquidacionImportRecibo.empleadoId, liq.empleado.id),
          inArray(liquidacionImportRecibo.periodo, semesterMonths),
          eq(liquidacionImportRecibo.tipo, 'sueldo')
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      ano: z.string().regex(/^\d{4}$/, 'Año inválido'),
      mes: z.string().regex(/^\d{2}$/).optional(),
      empleadoIds: z.array(z.string().uuid()).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    const { ano, mes, empleadoIds } = ctx.data;

    const conditions = [
      eq(client.representativeId, ctx.data.clientId),
      eq(liquidacionImportEmpleado.clientId, ctx.data.profileId),
      eq(liquidacionImportRecibo.origen, 'generado'),
      eq(liquidacionImportEmpleado.activo, true),
      mes
        ? condicionPeriodoRecibo(`${ano}-${mes}`)
        : like(liquidacionImportRecibo.periodo, `${ano}-%`),
    ];

    if (empleadoIds && empleadoIds.length > 0) {
      conditions.push(inArray(liquidacionImportEmpleado.id, empleadoIds));
    }

    // ── 1. Headers en una sola query ───────────────────────────────────────────
    const recibos = await db
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
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .leftJoin(payrollConvenio, eq(liquidacionImportEmpleado.convenioId, payrollConvenio.id))
      .leftJoin(
        payrollConvenioCategoria,
        eq(liquidacionImportEmpleado.categoriaId, payrollConvenioCategoria.id)
      )
      .leftJoin(obraSocial, eq(liquidacionImportRecibo.obraSocialId, obraSocial.id))
      .where(and(...conditions))
      .orderBy(asc(liquidacionImportEmpleado.nombre), asc(liquidacionImportRecibo.periodo))
      .limit(500);

    if (recibos.length === 0) return [];

    const reciboIds = recibos.map((r) => r.liquidacion.id);

    // ── 2. Detalles de conceptos en una sola query ─────────────────────────────
    const allDetallesRaw = await db
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
      .where(inArray(liquidacionImportConceptoValor.reciboId, reciboIds))
      .orderBy(sql`${liquidacionImportConceptoValor.codigo}::int`);

    let allDetallesEnriched = await enrichConceptosFaltantes(
      allDetallesRaw as DetalleReciboRow[]
    );
    allDetallesEnriched = await enrichConceptosSosFaltantes(allDetallesEnriched);
    allDetallesEnriched = allDetallesEnriched.sort(
      (a, b) => Number(a.detalle.codigo) - Number(b.detalle.codigo)
    );

    const detallesByReciboId = new Map<string, DetalleReciboRow[]>();
    for (const d of allDetallesEnriched) {
      const key = d.detalle.reciboId;
      if (!detallesByReciboId.has(key)) detallesByReciboId.set(key, []);
      detallesByReciboId.get(key)!.push(d);
    }

    // ── 3. Resolver categoríaId para cada empleado único (en paralelo) ─────────
    const uniqueEmpleados = new Map<
      string,
      typeof liquidacionImportEmpleado.$inferSelect
    >();
    for (const r of recibos) {
      if (!uniqueEmpleados.has(r.empleado.id)) uniqueEmpleados.set(r.empleado.id, r.empleado);
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
        catPeriodoPairs.add(`${catId}|${normalizarPeriodoYYYYMM(r.liquidacion.periodo)}`);
      }
    }
    await Promise.all(
      [...catPeriodoPairs].map(async (key) => {
        const [catId, periodo] = key.split('|') as [string, string];
        basicoEscalaCache.set(key, await getBasicoVigenteInternal(catId, periodo));
      })
    );

    // ── 5. Cabecera de pago por empleado único (en paralelo) ───────────────────
    const cabeceraByEmpleadoId = new Map<
      string,
      Partial<typeof liquidacionImportRecibo.$inferSelect>
    >();
    await Promise.all(
      [...uniqueEmpleados.keys()].map(async (id) => {
        cabeceraByEmpleadoId.set(id, await obtenerCabeceraPagoPlantilla(id));
      })
    );

    // ── 6. Armar payload completo por recibo ───────────────────────────────────
    const result = recibos.map((r) => {
      const rawDetalles = detallesByReciboId.get(r.liquidacion.id) ?? [];
      let merged = mergeDetalleFilasDuplicadas(rawDetalles);
      merged = merged.sort((a, b) => Number(a.detalle.codigo) - Number(b.detalle.codigo));
      const detalles = merged.map((row) => ({
        ...row,
        tipoColumna: tipoColumnaSosContador(row.detalle, row.concepto, row.conceptoSos),
      }));

      // basicoCalculado (replica la lógica de basicoParaRecibo sin async)
      const override = r.empleado.valorSueldo != null ? Number(r.empleado.valorSueldo) : 0;
      let basicoCalculado: number;
      if (!isNaN(override) && override > 0) {
        basicoCalculado = override;
      } else {
        const catId = categoriaIdByEmpleado.get(r.empleado.id);
        const periodoNorm = normalizarPeriodoYYYYMM(r.liquidacion.periodo);
        const deEscala = catId ? (basicoEscalaCache.get(`${catId}|${periodoNorm}`) ?? 0) : 0;
        if (!isNaN(deEscala) && deEscala > 0) {
          basicoCalculado = deEscala;
        } else {
          const persistido = r.liquidacion.basico != null ? Number(r.liquidacion.basico) : 0;
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
  .inputValidator(
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
        liquidacion: liquidacionImportRecibo,
        empleadoId: liquidacionImportEmpleado.id,
      })
      .from(liquidacionImportRecibo)
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
      )
      .innerJoin(client, eq(liquidacionImportEmpleado.clientId, client.id))
      .where(
        and(
          condicionPeriodoRecibo(ctx.data.periodo),
          eq(client.representativeId, ctx.data.clientId)
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
      if (l.reciboConfirmado) confirmados++;
      if (l.origen === 'import') importados++;
      else if (l.origen === 'generado') generados++;
      const tipoKey = l.tipo || 'sueldo';
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    const { profileId, periodo } = ctx.data;

    const [employer] = await db
      .select({
        nombre: client.name,
        cuit: client.identityNumber,
        codigoLsd: payrollTipoEmpresa.codigoLsd,
        tipoEmpresaNombre: payrollTipoEmpresa.nombre,
      })
      .from(client)
      .leftJoin(payrollTipoEmpresa, eq(client.tipoEmpresaId, payrollTipoEmpresa.id))
      .where(eq(client.id, profileId))
      .limit(1);

    if (!employer) throw new Error('Empresa no encontrada');

    const rows = await db
      .select({
        reciboId: liquidacionImportRecibo.id,
        origen: liquidacionImportRecibo.origen,
        empleadoNombre: liquidacionImportEmpleado.nombre,
        empleadoCuil: liquidacionImportEmpleado.cuil,
        empleadoLegajo: liquidacionImportEmpleado.legajo,
        diasTrabajados: liquidacionImportRecibo.diasTrabajados,
        situacionCodigo: payrollSituacion.codigo,
        situacionNombre: payrollSituacion.nombre,
        modalidadCodigo: payrollModalidadContratacion.codigo,
        modalidadNombre: payrollModalidadContratacion.nombre,
        rem4y8Override: liquidacionImportRecibo.rem4y8Override,
        rem9Override: liquidacionImportRecibo.rem9Override,
        contribucionAdicionalOS: liquidacionImportRecibo.contribucionAdicionalOS,
        importeADetraerLey27430: liquidacionImportRecibo.importeADetraerLey27430,
        importeMaternidadArt13: liquidacionImportRecibo.importeMaternidadArt13,
        // Campos para pre-calcular rem4y8 y rem9 sugeridos (TIN-952)
        haberes: liquidacionImportRecibo.haberes,
        noRemunerativo: liquidacionImportRecibo.noRemunerativo,
        categoriaId: liquidacionImportEmpleado.categoriaId,
      })
      .from(liquidacionImportRecibo)
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
      )
      .leftJoin(
        payrollSituacion,
        // Fallback: si el recibo no tiene situación seteada (recibos importados de Excel),
        // usar la situación del empleado.
        sql`${payrollSituacion.id} = COALESCE(${liquidacionImportRecibo.situacionRevista1Id}, ${liquidacionImportEmpleado.situacionId})`
      )
      .leftJoin(payrollModalidadContratacion, eq(liquidacionImportEmpleado.modalidadContratacionId, payrollModalidadContratacion.id))
      .where(
        and(
          eq(liquidacionImportEmpleado.clientId, profileId),
          eq(liquidacionImportRecibo.periodo, periodo),
        )
      )
      .orderBy(asc(liquidacionImportEmpleado.legajo));

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
              reciboId: liquidacionImportConceptoValor.reciboId,
              cnt: sql<number>`count(*)::int`,
            })
            .from(liquidacionImportConceptoValor)
            .where(
              and(
                inArray(liquidacionImportConceptoValor.reciboId, reciboIds),
                eq(liquidacionImportConceptoValor.activoEnRecibo, true)
              )
            )
            .groupBy(liquidacionImportConceptoValor.reciboId)
            .then((r) => Object.fromEntries(r.map((x) => [x.reciboId, x.cnt])))
        : {};

    const totalConceptos = Object.values(conceptosPorRecibo).reduce((a, b) => a + b, 0);

    return {
      employer,
      empleados: rows.map((r) => {
        const rem9Sugerido = (Number(r.haberes) || 0) + (Number(r.noRemunerativo) || 0);
        const basicoEscala = r.categoriaId && periodoNormPreview
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
  .inputValidator(z.object({ periodo: z.string().regex(/^\d{4}-\d{2}$/) }))
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const [row] = await db
      .select()
      .from(payrollParametrosPeriodo)
      .where(eq(payrollParametrosPeriodo.periodo, ctx.data.periodo))
      .limit(1);
    return row ?? null;
  });

/** Crea o actualiza el tope imponible y SMVM para un período. */
export const upsertParametrosPeriodo = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
      topeMaximoImponible: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Debe ser un número con hasta 2 decimales'),
      salarioMinimo: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      fuente: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    await getSessionWithOrg();
    const { periodo, topeMaximoImponible, salarioMinimo, fuente } = ctx.data;
    await db
      .insert(payrollParametrosPeriodo)
      .values({
        periodo,
        topeMaximoImponible,
        salarioMinimo: salarioMinimo ?? null,
        fuente: fuente ?? null,
        actualizadoPorCron: false,
      })
      .onConflictDoUpdate({
        target: payrollParametrosPeriodo.periodo,
        set: {
          topeMaximoImponible,
          salarioMinimo: salarioMinimo ?? null,
          fuente: fuente ?? null,
          actualizadoPorCron: false,
          updatedAt: new Date(),
        },
      });
    return { ok: true };
  });

/** Actualiza los campos de override LSD de un recibo (bases imponibles, aportes adicionales, etc.). */
export const updateReciboLsdOverrides = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      reciboId: z.string().uuid(),
      rem4y8Override: z.number().nullable().optional(),
      rem9Override: z.number().nullable().optional(),
      contribucionAdicionalOS: z.number().nullable().optional(),
      importeADetraerLey27430: z.number().nullable().optional(),
      importeMaternidadArt13: z.number().nullable().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    const [rec] = await db
      .select({ id: liquidacionImportRecibo.id })
      .from(liquidacionImportRecibo)
      .innerJoin(liquidacionImportEmpleado, eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id))
      .where(
        and(
          eq(liquidacionImportRecibo.id, ctx.data.reciboId),
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId)
        )
      )
      .limit(1);
    if (!rec) throw new Error('Recibo no encontrado');

    const toStr = (v: number | null | undefined) => (v != null ? String(v) : null);
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (ctx.data.rem4y8Override !== undefined) update.rem4y8Override = toStr(ctx.data.rem4y8Override);
    if (ctx.data.rem9Override !== undefined) update.rem9Override = toStr(ctx.data.rem9Override);
    if (ctx.data.contribucionAdicionalOS !== undefined) update.contribucionAdicionalOS = toStr(ctx.data.contribucionAdicionalOS);
    if (ctx.data.importeADetraerLey27430 !== undefined) update.importeADetraerLey27430 = toStr(ctx.data.importeADetraerLey27430);
    if (ctx.data.importeMaternidadArt13 !== undefined) update.importeMaternidadArt13 = toStr(ctx.data.importeMaternidadArt13);

    await db
      .update(liquidacionImportRecibo)
      .set(update)
      .where(eq(liquidacionImportRecibo.id, ctx.data.reciboId));

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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    const { profileId, periodo } = ctx.data;
    const issues: LsdIssue[] = [];

    // 1. Tipo de empleador
    const [employer] = await db
      .select({ codigoLsd: payrollTipoEmpresa.codigoLsd })
      .from(client)
      .leftJoin(payrollTipoEmpresa, eq(client.tipoEmpresaId, payrollTipoEmpresa.id))
      .where(eq(client.id, profileId))
      .limit(1);

    if (!employer?.codigoLsd) {
      issues.push({
        tipo: 'error',
        codigo: 'SIN_TIPO_EMPLEADOR',
        mensaje: 'La empresa no tiene tipo de empleador configurado. Es requerido para el Record 01 del LSD.',
      });
    }

    // 2. Tope máximo imponible del período
    const [params] = await db
      .select({ topeMaximoImponible: payrollParametrosPeriodo.topeMaximoImponible })
      .from(payrollParametrosPeriodo)
      .where(eq(payrollParametrosPeriodo.periodo, periodo))
      .limit(1);

    if (!params) {
      issues.push({
        tipo: 'error',
        codigo: 'SIN_TOPE_IMPONIBLE',
        mensaje: `No hay tope máximo imponible cargado para ${periodo}. Sin este dato las bases imponibles del Record 04 se calculan incorrectamente.`,
      });
    }

    // 3. Recibos del período
    // La situación de revista se toma del recibo (situacionRevista1Id) con fallback al empleado
    // (situacionId) — misma lógica que previewLsd para recibos importados desde SOS.
    const recibos = await db
      .select({
        situacionRevista1Id: liquidacionImportRecibo.situacionRevista1Id,
        situacionIdEmpleado: liquidacionImportEmpleado.situacionId,
        cuil: liquidacionImportEmpleado.cuil,
        nombre: liquidacionImportEmpleado.nombre,
        modalidadContratacionId: liquidacionImportEmpleado.modalidadContratacionId,
        obraSocialId: liquidacionImportEmpleado.obraSocialId,
      })
      .from(liquidacionImportRecibo)
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
      )
      .where(
        and(
          eq(liquidacionImportEmpleado.clientId, profileId),
          eq(liquidacionImportRecibo.periodo, periodo),
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
          mensaje: 'Sin situación de revista. Es obligatoria para Records 02 y 04.',
          empleadoCuil: row.cuil,
          empleadoNombre: row.nombre,
        });
      }
      if (!row.modalidadContratacionId) {
        issues.push({
          tipo: 'error',
          codigo: 'SIN_MODALIDAD_CONTRATACION',
          mensaje: 'Sin modalidad de contratación. Es obligatoria para Record 04.',
          empleadoCuil: row.cuil,
          empleadoNombre: row.nombre,
        });
      }
      if (!row.obraSocialId) {
        issues.push({
          tipo: 'warning',
          codigo: 'SIN_OBRA_SOCIAL',
          mensaje: 'Sin obra social asignada. El código OS en Record 04 quedará vacío.',
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
      /** Si se pasa, solo se incluyen los recibos de estos CUILs (para rectificativas parciales). */
      cuils: z.array(z.string()).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    const { profileId, periodo, cuils } = ctx.data;

    // ── 1. Employer config ─────────────────────────────────────────────────
    const [employer] = await db
      .select({
        cuit: client.identityNumber,
        codigoLsd: payrollTipoEmpresa.codigoLsd,
        seguroColectivo: client.seguroColectivo,
        mipyme: client.mipyme,
      })
      .from(client)
      .leftJoin(payrollTipoEmpresa, eq(client.tipoEmpresaId, payrollTipoEmpresa.id))
      .where(eq(client.id, profileId))
      .limit(1);

    if (!employer) throw new Error('Empresa no encontrada');
    const cuit = employer.cuit.replace(/[-\s]/g, '').padStart(11, '0');
    // tipo_empleador: primer carácter del código LSD (ej. "1", "4", "7")
    const tipoEmpleadorCode = (employer.codigoLsd ?? '1').charAt(0);

    // ── 2. Tope máximo imponible del período ───────────────────────────────
    const [paramsPeriodo] = await db
      .select({ topeMaximoImponible: payrollParametrosPeriodo.topeMaximoImponible })
      .from(payrollParametrosPeriodo)
      .where(eq(payrollParametrosPeriodo.periodo, periodo))
      .limit(1);
    // tope en centavos (null = no configurado → sin tope aplicado)
    const topeCentavos = paramsPeriodo
      ? montoCentavos(paramsPeriodo.topeMaximoImponible)
      : null;

    // ── 3. Recibos del período con catálogos para Record 04 ───────────────
    const sit1Alias = aliasedTable(payrollSituacion, 'sit1');
    const sit2Alias = aliasedTable(payrollSituacion, 'sit2');
    const sit3Alias = aliasedTable(payrollSituacion, 'sit3');

    const recibos = await db
      .select({
        recibo: liquidacionImportRecibo,
        empleado: liquidacionImportEmpleado,
        sit1Codigo: sit1Alias.codigo,
        sit2Codigo: sit2Alias.codigo,
        sit3Codigo: sit3Alias.codigo,
        condicionCodigo: payrollCondicion.codigo,
        actividadCodigo: payrollActividad.codigo,
        modalidadCodigo: payrollModalidadContratacion.codigo,
        siniestradoCodigo: payrollSiniestrado.codigo,
        localidadCodigo: payrollLocalidad.codigo,
        obraSocialCodigo: obraSocial.codigo,
      })
      .from(liquidacionImportRecibo)
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
      )
      // sit1: recibo.situacionRevista1Id con fallback a empleado.situacionId (recibos importados SOS)
      .leftJoin(sit1Alias, sql`${sit1Alias.id} = COALESCE(${liquidacionImportRecibo.situacionRevista1Id}, ${liquidacionImportEmpleado.situacionId})`)
      .leftJoin(sit2Alias, eq(liquidacionImportRecibo.situacionRevista2Id, sit2Alias.id))
      .leftJoin(sit3Alias, eq(liquidacionImportRecibo.situacionRevista3Id, sit3Alias.id))
      .leftJoin(payrollCondicion, eq(liquidacionImportEmpleado.condicionId, payrollCondicion.id))
      .leftJoin(payrollActividad, eq(liquidacionImportEmpleado.actividadId, payrollActividad.id))
      .leftJoin(payrollModalidadContratacion, eq(liquidacionImportEmpleado.modalidadContratacionId, payrollModalidadContratacion.id))
      .leftJoin(payrollSiniestrado, eq(liquidacionImportEmpleado.siniestradoId, payrollSiniestrado.id))
      .leftJoin(payrollLocalidad, eq(liquidacionImportEmpleado.localidadId, payrollLocalidad.id))
      .leftJoin(obraSocial, eq(liquidacionImportEmpleado.obraSocialId, obraSocial.id))
      .where(
        and(
          eq(liquidacionImportEmpleado.clientId, profileId),
          eq(liquidacionImportRecibo.periodo, periodo),
          cuils && cuils.length > 0
            ? inArray(liquidacionImportEmpleado.cuil, cuils)
            : undefined,
        )
      )
      .orderBy(asc(liquidacionImportEmpleado.legajo));

    // ── 4. Conceptos de todos los recibos ──────────────────────────────────
    const reciboIds = recibos.map((r) => r.recibo.id);
    const conceptoValores =
      reciboIds.length > 0
        ? await db
            .select({
              valor: liquidacionImportConceptoValor,
              numeroSos: payrollConcepto.numeroSos,
            })
            .from(liquidacionImportConceptoValor)
            .leftJoin(
              payrollConcepto,
              eq(liquidacionImportConceptoValor.conceptoId, payrollConcepto.id)
            )
            .where(
              and(
                inArray(liquidacionImportConceptoValor.reciboId, reciboIds),
                eq(liquidacionImportConceptoValor.activoEnRecibo, true)
              )
            )
            .orderBy(sql`${liquidacionImportConceptoValor.codigo}::int`)
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
            const val = escalaCache.get(`${row.empleado.categoriaId}|${periodoNorm}`) ?? 0;
            if (val > 0) basicoEscalaCentavosByEmpleadoId.set(row.empleado.id, Math.round(val * 100));
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
        const sosNum =
          cv.numeroSos != null ? cv.numeroSos : parseInt(cv.valor.codigo) || 0;
        if (sosNum === 0) continue;

        const sosCode = String(sosNum).padStart(3, '0');
        const cantidadRaw = cv.valor.cantidad != null ? Number(cv.valor.cantidad) : 1;
        const centavos = Math.round(Math.abs(Number(cv.valor.monto)) * 100);

        let credDeb: 'C' | 'D';
        if (cv.valor.tipoLiquidacion === 'descuento' || cv.valor.tipoLiquidacion === 'retencion') {
          credDeb = 'D';
        } else if (cv.valor.tipoLiquidacion) {
          credDeb = 'C';
        } else {
          credDeb = (sosNum >= 200 && sosNum < 400) || sosNum >= 500 ? 'D' : 'C';
        }

        const amountStr = String(centavos).padStart(15, '0');

        if (sosNum >= 400) {
          const qty = String(Math.round(cantidadRaw * 100)).padStart(6, '0');
          r03Lines.push(`03${cuil}${'0'.repeat(9)}${sosCode}${qty}$${amountStr}${credDeb}`);
        } else {
          const qty = String(Math.round(cantidadRaw * 100)).padStart(5, '0');
          r03Lines.push(`03${cuil}${'0'.repeat(7)}${sosCode}${qty}$${amountStr}${credDeb}`);
        }
      }

      // ── Record 04 — Bases imponibles ─────────────────────────────────────

      // Calcular bases desde los conceptos del recibo
      // total_rem:    SOS 001-399 con indicador C (remunerativos)
      // total_nonrem: SOS 400-499 con indicador C (no remunerativos)
      let totalRemCentavos = 0;
      let totalNonRemCentavos = 0;
      for (const cv of conceptos) {
        const sosNum =
          cv.numeroSos != null ? cv.numeroSos : parseInt(cv.valor.codigo) || 0;
        if (sosNum === 0) continue;

        let credDeb: 'C' | 'D';
        if (cv.valor.tipoLiquidacion === 'descuento' || cv.valor.tipoLiquidacion === 'retencion') {
          credDeb = 'D';
        } else if (cv.valor.tipoLiquidacion) {
          credDeb = 'C';
        } else {
          credDeb = (sosNum >= 200 && sosNum < 400) || sosNum >= 500 ? 'D' : 'C';
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

      // Overrides manuales del recibo (rem4y8Override cubre OS; rem9Override cubre ART).
      // rem4y8Base = max(basicoEscala, bruto): si el empleado liquida jornada reducida,
      // basicoEscala > bruto y se usa la escala completa; si es full-time, el bruto
      // ya incluye antigüedad/presentismo y supera al básico, por lo que se usa el bruto.
      const basicoEscalaFullTimeCentavos = basicoEscalaCentavosByEmpleadoId.get(emp.id) ?? 0;
      const rem4y8Base = rec.rem4y8Override != null
        ? montoCentavos(rec.rem4y8Override)
        : Math.max(basicoEscalaFullTimeCentavos, brutaCentavos);
      const rem9Base = rec.rem9Override != null
        ? montoCentavos(rec.rem9Override)
        : brutaCentavos;

      // 20 campos monetarios de 15 chars cada uno (= 300 chars de [70] a [370])
      // base dif LRT = parte de bruta que supera el tope (o la suma no-rem cuando totalRem ≤ tope)
      // = bruta - B1(jubApor) = brutaCentavos - applyTope(totalRemCentavos)
      const baseDifLRT = Math.max(0, brutaCentavos - applyTope(totalRemCentavos));
      // base dif OS = exceso de la base OS sobre bruta (cuando rem4y8 override > bruta)
      const baseDifAporOS = Math.max(0, applyTope(rem4y8Base) - brutaCentavos);
      const baseDifContOS = Math.max(0, rem4y8Base - brutaCentavos);

      const moneyFields = [
        lsdMoney(0),                                          // [70:85]  aporte adicional OS
        lsdMoney(montoCentavos(rec.contribucionAdicionalOS)), // [85:100] contrib adicional OS
        lsdMoney(baseDifAporOS),                              // [100:115] base dif aporte OS
        lsdMoney(baseDifContOS),                              // [115:130] base dif contrib OS
        lsdMoney(baseDifLRT),                                 // [130:145] base dif LRT
        lsdMoney(montoCentavos(rec.importeMaternidadArt13)), // [145:160] remun maternidad
        lsdMoney(brutaCentavos),                             // [160:175] remuneración bruta
        lsdMoney(applyTope(totalRemCentavos)),               // [175:190] base 1: jubilación aporte
        lsdMoney(totalRemCentavos),                          // [190:205] base 2: jubilación contrib
        lsdMoney(totalRemCentavos),                          // [205:220] base 3: PAMI
        lsdMoney(applyTope(rem4y8Base)),                     // [220:235] base 4: OS aportes
        lsdMoney(applyTope(totalRemCentavos)),               // [235:250] base 5: FNE/AAFF
        lsdMoney(0),                                          // [250:265] base 6 (regímenes especiales)
        lsdMoney(0),                                          // [265:280] base 7 (regímenes especiales)
        lsdMoney(rem4y8Base),                                // [280:295] base 8: OS contrib
        lsdMoney(rem9Base),                                  // [295:310] base 9: ART/LRT
        lsdMoney(0),                                          // [310:325] base dif SS aportes
        lsdMoney(0),                                          // [325:340] base dif SS contrib
        lsdMoney(0),                                          // [340:355] base 10
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
      const pctAporteAdSS = '000';   // porcentaje aporte adicional SS (3 chars)
      const pctContribTarea = '00000'; // porcentaje contrib tarea diferencial (5 chars)
      const campoReservado = '00000'; // campo reservado (5 chars)
      // obra social: código AFIP 6 chars, right-padded with spaces if shorter
      const osCode = (row.obraSocialCodigo ?? '').padEnd(6, ' ');
      const adherentes = String(emp.adherentes ?? 0).padStart(2, '0');

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
      .select({ maxNro: max(payrollLsdPresentacion.nroPresentacion) })
      .from(payrollLsdPresentacion)
      .where(
        and(
          eq(payrollLsdPresentacion.profileId, profileId),
          eq(payrollLsdPresentacion.periodo, periodo)
        )
      );
    const nroPresentacion = (maxPres?.maxNro ?? 0) + 1;

    // R01: pos 23-27 = nroPresentacion (5 dígitos), pos 28 = '3' (tipo forma, fijo según referencia AFIP)
    const nroStr = String(nroPresentacion).padStart(5, '0');
    // Nota: posiciones 14-15 usan 'SJ' según archivo de referencia E-Presis.
    const r01 = `01${cuit}SJ${periodoLsd}M${nroStr}3${String(numEmpleados).padStart(7, '0')}`;

    const lines = [r01, ...r02Lines, ...r03Lines, ...r04Lines];
    const contenido = lines.join('\n');
    const filename = `${cuit}_${year}_${month}_LSD.txt`;

    // Guardar la presentación en la base de datos
    await db.insert(payrollLsdPresentacion).values({
      profileId,
      periodo,
      nroPresentacion,
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    return db
      .select({
        id: payrollLsdPresentacion.id,
        nroPresentacion: payrollLsdPresentacion.nroPresentacion,
        filename: payrollLsdPresentacion.filename,
        empleados: payrollLsdPresentacion.empleados,
        conceptos: payrollLsdPresentacion.conceptos,
        generadoEn: payrollLsdPresentacion.generadoEn,
      })
      .from(payrollLsdPresentacion)
      .where(
        and(
          eq(payrollLsdPresentacion.profileId, ctx.data.profileId),
          eq(payrollLsdPresentacion.periodo, ctx.data.periodo)
        )
      )
      .orderBy(asc(payrollLsdPresentacion.nroPresentacion));
  });

/** Devuelve el contenido de una presentación para re-descarga. */
export const getLsdPresentacionContenido = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      presentacionId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    const [pres] = await db
      .select({
        filename: payrollLsdPresentacion.filename,
        contenido: payrollLsdPresentacion.contenido,
        nroPresentacion: payrollLsdPresentacion.nroPresentacion,
      })
      .from(payrollLsdPresentacion)
      .where(
        and(
          eq(payrollLsdPresentacion.id, ctx.data.presentacionId),
          eq(payrollLsdPresentacion.profileId, ctx.data.profileId)
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
    .replace(/[^\x20-\x7E]/g, '');   // keep only printable ASCII
}

/** Flags de 29 chars según el tipo AFIP. */
function flagsConceptoLsd(tipoPrefijo: string): string {
  if (tipoPrefijo === '81' || tipoPrefijo === '82') {
    return '10000000000 0 0 00 0         '; // descuentos / retenciones
  }
  if (tipoPrefijo === '54' || tipoPrefijo === '52' || tipoPrefijo === '55' || tipoPrefijo === '56') {
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    const { profileId, periodo } = ctx.data;

    // Conceptos activos usados en los recibos del período — únicos por numero_sos
    const rows = await db
      .selectDistinctOn([payrollConcepto.numeroSos], {
        numeroSos: payrollConcepto.numeroSos,
        nombre: payrollConcepto.nombre,
        codigoAfip: lsdConceptoAfip.codigoAfip,
      })
      .from(liquidacionImportConceptoValor)
      .innerJoin(
        liquidacionImportRecibo,
        eq(liquidacionImportConceptoValor.reciboId, liquidacionImportRecibo.id)
      )
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
      )
      .innerJoin(
        payrollConcepto,
        eq(liquidacionImportConceptoValor.conceptoId, payrollConcepto.id)
      )
      .leftJoin(
        conceptoSos,
        sql`${conceptoSos.codigo}::int = ${payrollConcepto.numeroSos}`
      )
      .leftJoin(lsdConceptoAfip, eq(conceptoSos.conceptoAfipId, lsdConceptoAfip.id))
      .where(
        and(
          eq(liquidacionImportEmpleado.clientId, profileId),
          eq(liquidacionImportRecibo.periodo, periodo),
          eq(liquidacionImportConceptoValor.activoEnRecibo, true),
          isNotNull(payrollConcepto.numeroSos)
        )
      )
      .orderBy(payrollConcepto.numeroSos);

    if (rows.length === 0) throw new Error('Sin conceptos activos para el período');

    const lines = rows
      .filter((r) => r.codigoAfip && r.numeroSos != null)
      .map((r) => {
        const afip6 = r.codigoAfip!.padEnd(6, '0').slice(0, 6);
        const tipoPrefijo = afip6.slice(0, 2);
        const sosPadded = String(r.numeroSos).padStart(4, '0');
        const nombreNorm = normalizarNombreLsd(r.nombre).slice(0, 150).padEnd(150, ' ');
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    const { periodo } = ctx.data;

    // Solo empleados que tienen un recibo de sueldo en el período SAC exacto (06 ó 12)
    // Empleados que egresaron antes del mes SAC ya liquidaron su SAC proporcional
    // en la liquidación final, por lo que no deben aparecer aquí.
    const recibosDelPeriodo = await db
      .select({
        empleadoId: liquidacionImportRecibo.empleadoId,
        haberes: liquidacionImportRecibo.haberes,
        noRemunerativo: liquidacionImportRecibo.noRemunerativo,
      })
      .from(liquidacionImportRecibo)
      .innerJoin(
        liquidacionImportEmpleado,
        eq(liquidacionImportEmpleado.id, liquidacionImportRecibo.empleadoId)
      )
      .where(
        and(
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId),
          eq(liquidacionImportEmpleado.activo, true),
          eq(liquidacionImportRecibo.periodo, periodo),
          eq(liquidacionImportRecibo.tipo, 'sueldo')
        )
      );

    if (recibosDelPeriodo.length === 0) return [];

    const empIdsConRecibo = [...new Set(recibosDelPeriodo.map((r) => r.empleadoId))];

    // Datos del empleado para los que tienen recibo en el período SAC
    const empleados = await db
      .select({
        id: liquidacionImportEmpleado.id,
        nombre: liquidacionImportEmpleado.nombre,
        legajo: liquidacionImportEmpleado.legajo,
        fechaIngreso: liquidacionImportEmpleado.fechaIngreso,
        fechaAlta: liquidacionImportEmpleado.fechaAlta,
      })
      .from(liquidacionImportEmpleado)
      .where(inArray(liquidacionImportEmpleado.id, empIdsConRecibo));

    // SAC existentes en este período
    const sacExistentes = await db
      .select({ empleadoId: liquidacionImportRecibo.empleadoId })
      .from(liquidacionImportRecibo)
      .where(
        and(
          inArray(liquidacionImportRecibo.empleadoId, empIdsConRecibo),
          eq(liquidacionImportRecibo.periodo, periodo),
          eq(liquidacionImportRecibo.tipo, 'SAC')
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
        const fechaAltaDate = emp.fechaAlta ? new Date(emp.fechaAlta as unknown as string) : null;
        const antiguedadAnios = fechaAltaDate && !isNaN(fechaAltaDate.getTime())
          ? Math.floor((hoy.getTime() - fechaAltaDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
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
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('No se puede liquidar períodos futuros.');
    }

    const empIds = ctx.data.items.map((i) => i.empleadoId);

    // Verificar pertenencia de todos los empleados al perfil
    const empValidos = await db
      .select({ id: liquidacionImportEmpleado.id })
      .from(liquidacionImportEmpleado)
      .where(
        and(
          inArray(liquidacionImportEmpleado.id, empIds),
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId)
        )
      );
    const empValidosSet = new Set(empValidos.map((e) => e.id));

    // SAC existentes (para omitirlos)
    const sacExistentes = await db
      .select({ empleadoId: liquidacionImportRecibo.empleadoId })
      .from(liquidacionImportRecibo)
      .where(
        and(
          inArray(liquidacionImportRecibo.empleadoId, empIds),
          eq(liquidacionImportRecibo.periodo, ctx.data.periodo),
          eq(liquidacionImportRecibo.tipo, 'SAC')
        )
      );
    const sacExistenteIds = new Set(sacExistentes.map((s) => s.empleadoId));

    const itemsACrear = ctx.data.items.filter(
      (i) => empValidosSet.has(i.empleadoId) && !sacExistenteIds.has(i.empleadoId)
    );

    if (itemsACrear.length === 0) return { generados: 0 };

    // Cargar porcentajes de retenciones del último recibo de sueldo del semestre.
    // Permite pre-poblar 201/202/203/206/207 con los % reales del empleado.
    const RETENCION_CODES = ['201', '202', '203', '206', '207'] as const;
    const DEFAULT_PCTS: Record<string, number> = {
      '201': 11, '202': 3, '203': 3, '206': 2, '207': 0.5,
    };

    const [periodoYear, periodoMes] = ctx.data.periodo.split('-') as [string, string];
    const mes = parseInt(periodoMes, 10);
    const semStart = mes <= 6 ? 1 : 7;
    const semesterMonths = Array.from({ length: mes - semStart + 1 }, (_, i) =>
      `${periodoYear}-${String(semStart + i).padStart(2, '0')}`
    );

    const saldoRecibos = await db
      .select({
        id: liquidacionImportRecibo.id,
        empleadoId: liquidacionImportRecibo.empleadoId,
        periodo: liquidacionImportRecibo.periodo,
      })
      .from(liquidacionImportRecibo)
      .where(
        and(
          inArray(liquidacionImportRecibo.empleadoId, empIds),
          inArray(liquidacionImportRecibo.periodo, semesterMonths),
          eq(liquidacionImportRecibo.tipo, 'sueldo')
        )
      );

    // Recibo más reciente del semestre por empleado
    const bestReciboByEmp = new Map<string, string>();
    for (const r of [...saldoRecibos].sort((a, b) => b.periodo.localeCompare(a.periodo))) {
      if (!bestReciboByEmp.has(r.empleadoId)) bestReciboByEmp.set(r.empleadoId, r.id);
    }

    // Porcentajes de retenciones desde esos recibos
    const reciboIdsRef = [...bestReciboByEmp.values()];
    const retencionRows = reciboIdsRef.length > 0
      ? await db
          .select({
            reciboId: liquidacionImportConceptoValor.reciboId,
            codigo: liquidacionImportConceptoValor.codigo,
            porcentaje: liquidacionImportConceptoValor.porcentaje,
          })
          .from(liquidacionImportConceptoValor)
          .where(
            and(
              inArray(liquidacionImportConceptoValor.reciboId, reciboIdsRef),
              inArray(liquidacionImportConceptoValor.codigo, [...RETENCION_CODES])
            )
          )
      : [];

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
        const retencionesAInsertar: { codigo: string; pct: number; monto: number }[] = [];
        for (const code of RETENCION_CODES) {
          const pct = pcts.get(code) ?? DEFAULT_PCTS[code];
          const monto = Math.round(item.sacBase * (pct / 100) * 100) / 100;
          totalRetenciones += monto;
          retencionesAInsertar.push({ codigo: code, pct, monto });
        }
        const neto = Math.round((item.sacBase - totalRetenciones) * 100) / 100;

        const [ins] = await tx
          .insert(liquidacionImportRecibo)
          .values({
            empleadoId: item.empleadoId,
            periodo: ctx.data.periodo,
            tipo: 'SAC',
            haberes: sacBaseStr,
            noRemunerativo: '0',
            descuentos: '0',
            retenciones: totalRetenciones.toFixed(2),
            neto: neto.toFixed(2),
            origen: 'generado',
          })
          .returning({ id: liquidacionImportRecibo.id });
        if (!ins) continue;

        // Concepto principal SAC (41 o 42)
        await tx.insert(liquidacionImportConceptoValor).values({
          reciboId: ins.id,
          codigo: codigoSac,
          monto: sacBaseStr,
          importe: sacBaseStr,
          cantidad: null,
          porcentaje: null,
          importeConceptoNumero: null,
          importeMinimo: null,
          importeMaximo: null,
          pctUsado: null,
          baseUsada: sacBaseStr,
          memo: null,
        });

        // Retenciones pre-cargadas
        for (const ret of retencionesAInsertar) {
          await tx.insert(liquidacionImportConceptoValor).values({
            reciboId: ins.id,
            codigo: ret.codigo,
            monto: ret.monto.toFixed(2),
            porcentaje: String(ret.pct),
            importe: null,
            cantidad: null,
            importeConceptoNumero: null,
            importeMinimo: null,
            importeMaximo: null,
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    const { periodo } = ctx.data;

    const empleados = await db
      .select({
        id: liquidacionImportEmpleado.id,
        nombre: liquidacionImportEmpleado.nombre,
        legajo: liquidacionImportEmpleado.legajo,
      })
      .from(liquidacionImportEmpleado)
      .where(
        and(
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId),
          eq(liquidacionImportEmpleado.activo, true)
        )
      );

    if (empleados.length === 0) return [];

    const empIds = empleados.map((e) => e.id);

    const existentes = await db
      .select({ empleadoId: liquidacionImportRecibo.empleadoId })
      .from(liquidacionImportRecibo)
      .where(
        and(
          inArray(liquidacionImportRecibo.empleadoId, empIds),
          eq(liquidacionImportRecibo.periodo, periodo),
          eq(liquidacionImportRecibo.tipo, 'despido')
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
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      profileId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
      items: z.array(z.object({
        empleadoId: z.string().uuid(),
        /** Fecha de baja en formato YYYY-MM-DD. */
        fechaBaja: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        /** Días trabajados en el mes (= día de la fecha de baja). */
        diasTrabajados: z.number().int().min(1).max(31),
      })),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    await ensureClientBelongsToRepresentative(ctx.data.profileId, ctx.data.clientId);

    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error('No se puede liquidar períodos futuros.');
    }

    // Validar que ninguna fecha de baja supere el período de liquidación
    const [periodoY, periodoM] = ctx.data.periodo.split('-') as [string, string];
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
      .select({ id: liquidacionImportEmpleado.id })
      .from(liquidacionImportEmpleado)
      .where(
        and(
          inArray(liquidacionImportEmpleado.id, empIds),
          eq(liquidacionImportEmpleado.clientId, ctx.data.profileId)
        )
      );
    const empValidosSet = new Set(empValidos.map((e) => e.id));

    const existentes = await db
      .select({ empleadoId: liquidacionImportRecibo.empleadoId })
      .from(liquidacionImportRecibo)
      .where(
        and(
          inArray(liquidacionImportRecibo.empleadoId, empIds),
          eq(liquidacionImportRecibo.periodo, ctx.data.periodo),
          eq(liquidacionImportRecibo.tipo, 'despido')
        )
      );
    const existentesIds = new Set(existentes.map((s) => s.empleadoId));

    const itemsACrear = ctx.data.items.filter(
      (i) => empValidosSet.has(i.empleadoId) && !existentesIds.has(i.empleadoId)
    );

    if (itemsACrear.length === 0) return { generados: 0 };

    await db.transaction(async (tx) => {
      for (const item of itemsACrear) {
        await tx.insert(liquidacionImportRecibo).values({
          empleadoId: item.empleadoId,
          periodo: ctx.data.periodo,
          tipo: 'despido',
          haberes: '0',
          noRemunerativo: '0',
          descuentos: '0',
          retenciones: '0',
          neto: '0',
          diasTrabajados: item.diasTrabajados,
          fecha: new Date(item.fechaBaja + 'T00:00:00'),
          origen: 'generado',
        });
      }
    });

    return { generados: itemsACrear.length };
  });
