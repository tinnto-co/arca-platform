import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/lib/db";
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
  payrollEmployee,
  payrollNovedad,
  payrollLiquidacion,
  payrollLiquidacionDetalle,
  afipEmpleadoresConvenio,
  liquidacionImportEmpleado,
  liquidacionImportRecibo,
  liquidacionImportConceptoValor,
} from "@/drizzle/schema";
import { getSessionWithOrg, assertCanWrite, getMemberRole } from "@/actions/helpers";
import { eq, and, desc, asc, lte, or, isNull, gte, inArray, sql } from "drizzle-orm";

/** Verifica que el cliente pertenezca a la org. y tenga al menos un perfil con liquidación de sueldos habilitada. */
async function ensureClientBelongsToOrg(clientId: string, orgId: string): Promise<void> {
  const [c] = await db
    .select({ id: client.id })
    .from(client)
    .innerJoin(
      profile,
      and(eq(profile.client, client.id), eq(profile.liquidaSueldos, true))
    )
    .where(
      and(
        eq(client.id, clientId),
        eq(client.organizationId, orgId),
      )
    )
    .limit(1);
  if (!c) {
    throw new Error(
      "Cliente no encontrado, no autorizado o sin liquidación de sueldos habilitada"
    );
  }
}

async function ensureProfileBelongsToClient(profileId: string, clientId: string): Promise<void> {
  const [p] = await db
    .select({ id: profile.id })
    .from(profile)
    .where(and(eq(profile.id, profileId), eq(profile.client, clientId)))
    .limit(1);
  if (!p) throw new Error("Perfil no encontrado o no autorizado");
}

import {
  evaluatePayrollFormula,
  roundMoney,
  type PayrollFormulaContext,
} from "../lib/payroll-formula";
import {
  puedeLiquidarPeriodo,
  puedeIngresarDatosPeriodo,
} from "../lib/payroll-period-rules";
import { format, differenceInYears, parseISO } from "date-fns";

function getPeriodKey(date: Date): string {
  return format(date, "yyyy-MM");
}

// ---------- Convenios ----------

export const listConvenios = createServerFn({ method: "GET" })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    return db
      .select()
      .from(payrollConvenio)
      .where(eq(payrollConvenio.clientId, ctx.data.clientId))
      .orderBy(payrollConvenio.nombre);
  });

export const createConvenio = createServerFn({ method: "POST" })
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
        descripcion: ctx.data.descripcion ?? null,
      })
      .returning();
    return row;
  });

export const updateConvenio = createServerFn({ method: "POST" })
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

export const deleteConvenio = createServerFn({ method: "POST" })
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
      .select({ id: payrollEmployee.id })
      .from(payrollEmployee)
      .where(eq(payrollEmployee.convenioId, ctx.data.id))
      .limit(1);
    if (emp) {
      throw new Error(
        "No se puede eliminar el convenio: tiene empleados asignados. Reasigne o elimine los empleados primero."
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
export const listConveniosAfipEmpleadores = createServerFn({ method: "GET" })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    return db
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
  });

/** Lista conceptos unificados SOS + AFIP por perfil, incluyendo subsistemas. */
export const listConceptosByPerfil = createServerFn({ method: "GET" })
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
      .innerJoin(lsdConceptoAfip, eq(lsdPerfilConcepto.conceptoAfipId, lsdConceptoAfip.id))
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

/** Convenios y categorías base por convenio (plantilla). */
const CONVENIOS_PLANTILLA = [
  { nombre: "Comercio", descripcion: "Convenio Colectivo de Trabajo para el sector Comercio (plantilla base).", categorias: [{ codigo: "1", nombre: "Empleado de comercio", orden: 10, montoBasico: "350000" }, { codigo: "2", nombre: "Encargado", orden: 20, montoBasico: "400000" }, { codigo: "3", nombre: "Jefe de sector", orden: 30, montoBasico: "450000" }] },
  { nombre: "Gastronomía", descripcion: "Convenio Colectivo de Trabajo para Gastronomía (plantilla base).", categorias: [{ codigo: "1", nombre: "Ayudante de cocina", orden: 10, montoBasico: "350000" }, { codigo: "2", nombre: "Cocinero", orden: 20, montoBasico: "400000" }, { codigo: "3", nombre: "Jefe de cocina", orden: 30, montoBasico: "450000" }] },
  { nombre: "Pasteleros", descripcion: "Convenio Colectivo de Trabajo para Pasteleros (plantilla base).", categorias: [{ codigo: "1", nombre: "Ayudante pastelero", orden: 10, montoBasico: "350000" }, { codigo: "2", nombre: "Pastelero", orden: 20, montoBasico: "400000" }, { codigo: "3", nombre: "Pastelero especializado", orden: 30, montoBasico: "450000" }] },
  { nombre: "Plásticos", descripcion: "Convenio Colectivo de Trabajo para la industria del Plástico (plantilla base).", categorias: [{ codigo: "1", nombre: "Operario", orden: 10, montoBasico: "350000" }, { codigo: "2", nombre: "Operario calificado", orden: 20, montoBasico: "400000" }, { codigo: "3", nombre: "Supervisor", orden: 30, montoBasico: "450000" }] },
  { nombre: "Construcción", descripcion: "Convenio Colectivo de Trabajo para la Construcción (plantilla base).", categorias: [{ codigo: "1", nombre: "Oficial", orden: 10, montoBasico: "350000" }, { codigo: "2", nombre: "Oficial especializado", orden: 20, montoBasico: "400000" }, { codigo: "3", nombre: "Encargado / Capataz", orden: 30, montoBasico: "450000" }] },
];

function getPlantillaPorActividad(actividad: string) {
  const a = (actividad ?? "").toLowerCase();

  // Heurística simple para mapear `actividad` (AFIP) a una de las 5 plantillas existentes.
  if (a.includes("comercio")) return CONVENIOS_PLANTILLA.find((c) => c.nombre === "Comercio") ?? null;
  if (a.includes("gastron")) return CONVENIOS_PLANTILLA.find((c) => c.nombre === "Gastronomía") ?? null;
  if (a.includes("pastel")) return CONVENIOS_PLANTILLA.find((c) => c.nombre === "Pasteleros") ?? null;
  if (a.includes("plasti")) return CONVENIOS_PLANTILLA.find((c) => c.nombre === "Plásticos") ?? null;
  if (a.includes("constru")) return CONVENIOS_PLANTILLA.find((c) => c.nombre === "Construcción") ?? null;

  return null;
}

/** Crea un `payroll_convenio` para el cliente a partir del CCT scrapeado desde AFIP. */
export const agregarConvenioDesdeAfipEmpleadores = createServerFn({ method: "POST" })
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

    if (!afipRow) throw new Error("Convenio AFIP no encontrado o no autorizado");

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
      return { ok: true, created: false, message: "El cliente ya tiene este convenio (CCT)." };
    }

    const plantillaDetectada = getPlantillaPorActividad(afipRow.actividad);
    const plantilla = plantillaDetectada ?? CONVENIOS_PLANTILLA[0];
    const usandoFallback = !plantillaDetectada;
    const inicioVigencia = new Date(new Date().getFullYear(), 0, 1);

    const descripcion = [
      `AFIP CCT: ${afipRow.cct}`,
      `Actividad: ${afipRow.actividad}`,
      `Signatarios: ${afipRow.signatarios}`,
      `Fecha novedad: ${afipRow.fechaNovedad}`,
    ].join("\n");

    const [inserted] = await db
      .insert(payrollConvenio)
      .values({
        clientId: ctx.data.clientId,
        nombre: afipRow.cct,
        descripcion,
      })
      .returning({ id: payrollConvenio.id });

    if (!inserted) throw new Error("Error al crear convenio");

    const categoriasInsert = await db
      .insert(payrollConvenioCategoria)
      .values(
        plantilla.categorias.map((c) => ({
          convenioId: inserted.id,
          codigo: c.codigo,
          nombre: c.nombre,
          orden: c.orden,
        }))
      )
      .returning({ id: payrollConvenioCategoria.id, codigo: payrollConvenioCategoria.codigo });

    const montoBasicoByCodigo = new Map(plantilla.categorias.map((c) => [c.codigo, c.montoBasico]));
    for (const cat of categoriasInsert) {
      await db.insert(payrollEscala).values({
        categoriaId: cat.id,
        vigenciaDesde: inicioVigencia,
        vigenciaHasta: null,
        montoBasico: montoBasicoByCodigo.get(cat.codigo) ?? "0",
      });
    }

    return {
      ok: true,
      created: true,
      convenioId: inserted.id,
      plantillaUsada: plantilla.nombre,
      usandoFallback,
    };
  });

const CONCEPTOS_PLANTILLA = [
  { codigo: "BASICO", nombre: "Sueldo básico", tipo: "remunerativo" as const, baseCalculo: "basico" as const, formula: "basico", esPorcentaje: false, orden: 10 },
  { codigo: "ANTIG", nombre: "Antigüedad", tipo: "remunerativo" as const, baseCalculo: "basico" as const, formula: "0.01 * basico * antiguedad", esPorcentaje: false, orden: 20 },
  { codigo: "PRES", nombre: "Presentismo", tipo: "remunerativo" as const, baseCalculo: "basico" as const, formula: "0.0833 * basico", esPorcentaje: false, orden: 30 },
  { codigo: "HE", nombre: "Horas extra", tipo: "remunerativo" as const, baseCalculo: "custom" as const, formula: "valor", esPorcentaje: false, orden: 40 },
  { codigo: "COM", nombre: "Comisiones", tipo: "remunerativo" as const, baseCalculo: "custom" as const, formula: "valor", esPorcentaje: false, orden: 50 },
  { codigo: "BONO", nombre: "Bonos", tipo: "remunerativo" as const, baseCalculo: "custom" as const, formula: "valor", esPorcentaje: false, orden: 60 },
  { codigo: "JUB", nombre: "Jubilación (11%)", tipo: "descuento" as const, baseCalculo: "total_remunerativo" as const, formula: "0.11 * totalRemunerativo", esPorcentaje: false, orden: 100 },
  { codigo: "OS", nombre: "Obra social (3%)", tipo: "descuento" as const, baseCalculo: "total_remunerativo" as const, formula: "0.03 * totalRemunerativo", esPorcentaje: false, orden: 110 },
  { codigo: "PAMI", nombre: "PAMI / Ley 19032 (3%)", tipo: "descuento" as const, baseCalculo: "total_remunerativo" as const, formula: "0.03 * totalRemunerativo", esPorcentaje: false, orden: 120 },
  { codigo: "SIND", nombre: "Sindicato (2%)", tipo: "descuento" as const, baseCalculo: "total_remunerativo" as const, formula: "0.02 * totalRemunerativo", esPorcentaje: false, orden: 130 },
];

/** Aplica la plantilla base solo de conceptos (no crea convenios; los convenios se seleccionan en la solapa Convenios). */
export const aplicarPlantillaBaseSueldos = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const clientId = ctx.data.clientId;
    const conceptosExistentes = await db
      .select({ id: payrollConcepto.id, codigo: payrollConcepto.codigo })
      .from(payrollConcepto)
      .where(eq(payrollConcepto.clientId, clientId));

    let conceptosCreated = 0;
    let conceptosUpdated = 0;

    for (const c of CONCEPTOS_PLANTILLA) {
      const existingConcept = conceptosExistentes.find((x) => x.codigo === c.codigo);
      if (!existingConcept) {
        await db.insert(payrollConcepto).values({
          clientId,
          codigo: c.codigo,
          nombre: c.nombre,
          tipo: c.tipo,
          baseCalculo: c.baseCalculo,
          formula: c.formula,
          esPorcentaje: c.esPorcentaje,
          orden: c.orden,
        });
        conceptosCreated++;
      } else {
        await db
          .update(payrollConcepto)
          .set({
            nombre: c.nombre,
            tipo: c.tipo,
            baseCalculo: c.baseCalculo,
            formula: c.formula,
            esPorcentaje: c.esPorcentaje,
            orden: c.orden,
            updatedAt: new Date(),
          })
          .where(eq(payrollConcepto.id, existingConcept.id));
        conceptosUpdated++;
      }
    }

    return {
      ok: true,
      conveniosCreated: 0,
      conveniosUpdated: 0,
      categoriasCreated: 0,
      categoriasUpdated: 0,
      conceptosCreated,
      conceptosUpdated,
    };
  });

/** Lista los convenios disponibles en la plantilla para que el cliente seleccione el que le corresponde. */
export const listConveniosPlantilla = createServerFn({ method: "GET" })
  .handler(async () => {
    await getSessionWithOrg();
    return CONVENIOS_PLANTILLA.map((c) => ({
      nombre: c.nombre,
      descripcion: c.descripcion,
    }));
  });

/** Agrega al cliente el convenio elegido desde la plantilla (con sus categorías y escalas). Si ya tiene ese convenio por nombre, no duplica. */
export const agregarConvenioDesdePlantilla = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ clientId: z.string().uuid(), nombreConvenio: z.string().min(1) })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const conv = CONVENIOS_PLANTILLA.find(
      (c) => c.nombre.toLowerCase() === ctx.data.nombreConvenio.toLowerCase()
    );
    if (!conv) throw new Error("Convenio no encontrado en la plantilla");

    const [existing] = await db
      .select({ id: payrollConvenio.id })
      .from(payrollConvenio)
      .where(
        and(
          eq(payrollConvenio.clientId, ctx.data.clientId),
          eq(payrollConvenio.nombre, conv.nombre)
        )
      )
      .limit(1);
    if (existing) {
      return { ok: true, created: false, message: "El cliente ya tiene este convenio" };
    }

    const inicioVigencia = new Date(new Date().getFullYear(), 0, 1);
    const [inserted] = await db
      .insert(payrollConvenio)
      .values({
        clientId: ctx.data.clientId,
        nombre: conv.nombre,
        descripcion: conv.descripcion,
      })
      .returning({ id: payrollConvenio.id });
    if (!inserted) throw new Error(`Error al crear convenio ${conv.nombre}`);

    const categoriasInsert = await db
      .insert(payrollConvenioCategoria)
      .values(
        conv.categorias.map((c) => ({
          convenioId: inserted.id,
          codigo: c.codigo,
          nombre: c.nombre,
          orden: c.orden,
        }))
      )
      .returning({ id: payrollConvenioCategoria.id });

    for (let i = 0; i < categoriasInsert.length; i++) {
      await db.insert(payrollEscala).values({
        categoriaId: categoriasInsert[i].id,
        vigenciaDesde: inicioVigencia,
        vigenciaHasta: null,
        montoBasico: conv.categorias[i].montoBasico,
      });
    }

    return { ok: true, created: true, convenioId: inserted.id };
  });

// ---------- Categorías por convenio ----------

export const listCategoriasByConvenio = createServerFn({ method: "GET" })
  .inputValidator(z.object({ convenioId: z.string().uuid(), clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    return db
      .select()
      .from(payrollConvenioCategoria)
      .where(eq(payrollConvenioCategoria.convenioId, ctx.data.convenioId))
      .orderBy(payrollConvenioCategoria.orden, payrollConvenioCategoria.codigo);
  });

export const createCategoria = createServerFn({ method: "POST" })
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

export const listEscalasByCategoria = createServerFn({ method: "GET" })
  .inputValidator(z.object({ categoriaId: z.string().uuid(), clientId: z.string().uuid() }))
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
export const deleteEscala = createServerFn({ method: "POST" })
  .inputValidator(z.object({ escalaId: z.string().uuid(), clientId: z.string().uuid() }))
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
    if (!row) throw new Error("Escala no encontrada o no autorizada");
    await db.delete(payrollEscala).where(eq(payrollEscala.id, ctx.data.escalaId));
    return { ok: true };
  });

export const upsertEscala = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      categoriaId: z.string().uuid(),
      clientId: z.string().uuid(),
      vigenciaDesde: z.string(), // ISO date
      vigenciaHasta: z.string().optional(),
      montoBasico: z.number().positive(),
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
      })
      .returning();
    return row;
  });

async function getBasicoVigenteInternal(
  categoriaId: string,
  fechaStr: string
): Promise<number> {
  const fecha = parseISO(
    fechaStr.length === 7 ? fechaStr + "-01" : fechaStr
  );
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
export const getBasicoVigente = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      categoriaId: z.string().uuid(),
      fecha: z.string(), // YYYY-MM-DD o YYYY-MM
    })
  )
  .handler(async (ctx) => getBasicoVigenteInternal(ctx.data.categoriaId, ctx.data.fecha));

// ---------- Conceptos salariales ----------

export const listConceptos = createServerFn({ method: "GET" })
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

export const createConcepto = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      codigo: z.string().min(1),
      nombre: z.string().min(1),
      tipo: z.enum(["remunerativo", "no_remunerativo", "descuento"]),
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
        tipo: ctx.data.tipo as "remunerativo" | "no_remunerativo" | "descuento",
        baseCalculo: (ctx.data.baseCalculo ?? "basico") as
        | "basico"
        | "bruto"
        | "total_remunerativo"
        | "total_no_remunerativo"
        | "total_descuentos"
        | "neto"
        | "fijo"
        | "custom",
        formula: ctx.data.formula,
        esPorcentaje: ctx.data.esPorcentaje ?? true,
        orden: ctx.data.orden ?? 0,
      })
      .returning();
    return row;
  });

export const updateConcepto = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      clientId: z.string().uuid(),
      codigo: z.string().min(1).optional(),
      nombre: z.string().min(1).optional(),
      tipo: z.enum(["remunerativo", "no_remunerativo", "descuento"]).optional(),
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
        and(
          eq(payrollConcepto.id, id),
          eq(payrollConcepto.clientId, clientId)
        )
      )
      .returning();
    return row;
  });

export const deleteConcepto = createServerFn({ method: "POST" })
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

export const listEmpleados = createServerFn({ method: "GET" })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({
        empleado: payrollEmployee,
        convenioNombre: payrollConvenio.nombre,
        categoriaNombre: payrollConvenioCategoria.nombre,
      })
      .from(payrollEmployee)
      .innerJoin(payrollConvenio, eq(payrollEmployee.convenioId, payrollConvenio.id))
      .innerJoin(
        payrollConvenioCategoria,
        eq(payrollEmployee.categoriaId, payrollConvenioCategoria.id)
      )
      .where(eq(payrollEmployee.clientId, ctx.data.clientId))
      .orderBy(payrollEmployee.apellido, payrollEmployee.nombre);
    return rows;
  });

/** Empleados importados desde Excel LSD (filtrados por perfil seleccionado). */
export const listImportEmpleados = createServerFn({ method: "GET" })
  .inputValidator(z.object({ clientId: z.string().uuid(), profileId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({
        empleado: liquidacionImportEmpleado,
        profileName: profile.name,
        profileIdentityNumber: profile.identityNumber,
      })
      .from(liquidacionImportEmpleado)
      .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
      .where(
        and(
          eq(profile.client, ctx.data.clientId),
          eq(liquidacionImportEmpleado.profileId, ctx.data.profileId)
        )
      )
      .orderBy(sql`${liquidacionImportEmpleado.legajo}::int asc`);
    return rows;
  });

/** Recibos importados por período (para selector en solapa Recibo). */
export const listImportRecibosByPeriodo = createServerFn({ method: "GET" })
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
export const getImportReciboDetalle = createServerFn({ method: "GET" })
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
    if (!row) throw new Error("Recibo no encontrado o no autorizado");
    const conceptos = await db
      .select()
      .from(liquidacionImportConceptoValor)
      .where(eq(liquidacionImportConceptoValor.reciboId, ctx.data.reciboId))
      .orderBy(asc(liquidacionImportConceptoValor.codigo));
    return { recibo: row.recibo, empleado: row.empleado, conceptos };
  });

export const createEmpleado = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      nombre: z.string().min(1),
      apellido: z.string().min(1),
      cuilCuil: z.string().min(1),
      fechaIngreso: z.string(),
      convenioId: z.string().uuid(),
      categoriaId: z.string().uuid(),
      tipoJornada: z.enum(["full_time", "part_time", "reducida"]).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .insert(payrollEmployee)
      .values({
        clientId: ctx.data.clientId,
        nombre: ctx.data.nombre,
        apellido: ctx.data.apellido,
        cuilCuil: ctx.data.cuilCuil,
        fechaIngreso: parseISO(ctx.data.fechaIngreso),
        convenioId: ctx.data.convenioId,
        categoriaId: ctx.data.categoriaId,
        tipoJornada: (ctx.data.tipoJornada as "full_time" | "part_time" | "reducida") ?? "full_time",
      })
      .returning();
    return row;
  });

/** Carga masiva de empleados. convenioNombre y categoriaCodigo se resuelven a IDs del cliente. */
export const createEmpleadosMasivo = createServerFn({ method: "POST" })
  .inputValidator(
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
          tipoJornada: z.enum(["full_time", "part_time", "reducida"]).optional(),
        })
      ),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);

    const convenios = await db
      .select()
      .from(payrollConvenio)
      .where(eq(payrollConvenio.clientId, ctx.data.clientId));
    const convenioByName = new Map(
      convenios.map((c) => [c.nombre.trim().toLowerCase(), c] as const)
    );
    const categoriasByConvenio = new Map<string, { id: string; codigo: string }[]>();
    for (const c of convenios) {
      const cats = await db
        .select({ id: payrollConvenioCategoria.id, codigo: payrollConvenioCategoria.codigo })
        .from(payrollConvenioCategoria)
        .where(eq(payrollConvenioCategoria.convenioId, c.id));
      categoriasByConvenio.set(c.id, cats);
    }

    const created: number[] = [];
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < ctx.data.empleados.length; i++) {
      const e = ctx.data.empleados[i];
      const convenio = convenioByName.get(e.convenioNombre.trim().toLowerCase());
      if (!convenio) {
        errors.push({ row: i + 2, message: `Convenio no encontrado: "${e.convenioNombre}"` });
        continue;
      }
      const categorias = categoriasByConvenio.get(convenio.id) ?? [];
      const categoria = categorias.find(
        (c) => c.codigo.trim().toLowerCase() === e.categoriaCodigo.trim().toLowerCase()
      );
      if (!categoria) {
        errors.push({ row: i + 2, message: `Categoría no encontrada: "${e.categoriaCodigo}" en convenio ${convenio.nombre}` });
        continue;
      }
      try {
        const [row] = await db
          .insert(payrollEmployee)
          .values({
            clientId: ctx.data.clientId,
            nombre: e.nombre.trim(),
            apellido: e.apellido.trim(),
            cuilCuil: String(e.cuilCuil).trim().replace(/\D/g, "").slice(-11) || e.cuilCuil.trim(),
            fechaIngreso: parseISO(e.fechaIngreso),
            convenioId: convenio.id,
            categoriaId: categoria.id,
            tipoJornada: (e.tipoJornada as "full_time" | "part_time" | "reducida") ?? "full_time",
          })
          .returning();
        if (row) created.push(i + 2);
      } catch (err) {
        errors.push({
          row: i + 2,
          message: err instanceof Error ? err.message : "Error al insertar",
        });
      }
    }

    return { created: created.length, errors };
  });

export const updateEmpleado = createServerFn({ method: "POST" })
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
      tipoJornada: z.enum(["full_time", "part_time", "reducida"]).optional(),
      activo: z.boolean().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const { id, clientId, fechaIngreso, ...rest } = ctx.data;
    const set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (fechaIngreso) set.fechaIngreso = parseISO(fechaIngreso);
    const [row] = await db
      .update(payrollEmployee)
      .set(set)
      .where(
        and(
          eq(payrollEmployee.id, id),
          eq(payrollEmployee.clientId, clientId)
        )
      )
      .returning();
    return row;
  });

export const deleteEmpleado = createServerFn({ method: "POST" })
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
      .delete(payrollEmployee)
      .where(
        and(
          eq(payrollEmployee.id, ctx.data.id),
          eq(payrollEmployee.clientId, ctx.data.clientId)
        )
      );
    return { ok: true };
  });

// ---------- Novedades ----------

export const listNovedadesByPeriodo = createServerFn({ method: "GET" })
  .inputValidator(z.object({ periodo: z.string(), clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const novedades = await db
      .select({
        novedad: payrollNovedad,
        empleadoNombre: sql<string>`${payrollEmployee.nombre} || ' ' || ${payrollEmployee.apellido}`,
        conceptoNombre: payrollConcepto.nombre,
      })
      .from(payrollNovedad)
      .innerJoin(payrollEmployee, eq(payrollNovedad.empleadoId, payrollEmployee.id))
      .innerJoin(payrollConcepto, eq(payrollNovedad.conceptoId, payrollConcepto.id))
      .where(
        and(
          eq(payrollNovedad.periodo, ctx.data.periodo),
          eq(payrollEmployee.clientId, ctx.data.clientId)
        )
      );
    return novedades;
  });

export const upsertNovedad = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      empleadoId: z.string().uuid(),
      conceptoId: z.string().uuid(),
      periodo: z.string(),
      valor: z.number(),
      cantidad: z.number().optional(),
      detalle: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    const [emp] = await db
      .select({ clientId: payrollEmployee.clientId })
      .from(payrollEmployee)
      .where(eq(payrollEmployee.id, ctx.data.empleadoId))
      .limit(1);
    if (!emp) throw new Error("Empleado no encontrado");
    await ensureClientBelongsToOrg(emp.clientId, orgId);
    if (!puedeIngresarDatosPeriodo(ctx.data.periodo)) {
      throw new Error(
        "Solo se puede cargar información de meses anteriores al en curso."
      );
    }
    const [row] = await db
      .insert(payrollNovedad)
      .values({
        empleadoId: ctx.data.empleadoId,
        conceptoId: ctx.data.conceptoId,
        periodo: ctx.data.periodo,
        valor: String(ctx.data.valor),
        cantidad: ctx.data.cantidad != null ? String(ctx.data.cantidad) : null,
        detalle: ctx.data.detalle ?? null,
      })
      .returning();
    return row;
  });

// ---------- Cálculo y liquidación ----------

/** Lógica interna: calcula y persiste una liquidación (empleadoId + periodo, clientId ya autorizado) */
async function calcularUnaLiquidacion(
  empleadoId: string,
  periodo: string,
  clientId: string
): Promise<{
  liquidacion: typeof payrollLiquidacion.$inferSelect;
  detalles: { conceptoId: string; monto: number; cantidad?: number }[];
  totalRemunerativo: number;
  totalNoRemunerativo: number;
  totalDescuentos: number;
  neto: number;
}> {
  const [emp] = await db
    .select()
    .from(payrollEmployee)
    .where(
      and(
        eq(payrollEmployee.id, empleadoId),
        eq(payrollEmployee.clientId, clientId)
      )
    )
    .limit(1);
  if (!emp) throw new Error("Empleado no encontrado");

  const periodoDate = parseISO(periodo + "-01");
  const basico = await getBasicoVigenteInternal(emp.categoriaId, periodo);

  const añosAntiguedad = differenceInYears(periodoDate, emp.fechaIngreso);
  const conceptos = await db
    .select()
    .from(payrollConcepto)
    .where(eq(payrollConcepto.clientId, clientId))
    .orderBy(payrollConcepto.orden, payrollConcepto.codigo);
  const novedades = await db
    .select()
    .from(payrollNovedad)
    .where(
      and(
        eq(payrollNovedad.empleadoId, empleadoId),
        eq(payrollNovedad.periodo, periodo)
      )
    );

  const detalles: {
    conceptoId: string;
    monto: number;
    cantidad?: number;
    conceptoNombre: string;
    conceptoCodigo: string;
    conceptoTipo: "remunerativo" | "no_remunerativo" | "descuento";
    conceptoFormula: string;
  }[] = [];
  let totalRemunerativo = 0;
  let totalNoRemunerativo = 0;
  let totalDescuentos = 0;

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
    const novedad = novedades.find((n) => n.conceptoId === con.id);
    const valorNovedad = novedad ? Number(novedad.valor) : 0;
    const cantidadNovedad = novedad && novedad.cantidad ? Number(novedad.cantidad) : undefined;
    context.valor = valorNovedad;
    context.cantidad = cantidadNovedad ?? 0;

    let monto = 0;
    try {
      monto = evaluatePayrollFormula(con.formula, context);
    } catch {
      monto = 0;
    }
    monto = roundMoney(monto);
    if (monto === 0 && valorNovedad !== 0) monto = valorNovedad;
    if (monto === 0) continue;

    detalles.push({
      conceptoId: con.id,
      monto,
      cantidad: cantidadNovedad,
      conceptoNombre: con.nombre,
      conceptoCodigo: con.codigo,
      conceptoTipo: con.tipo,
      conceptoFormula: con.formula,
    });

    if (con.tipo === "remunerativo") {
      totalRemunerativo += monto;
      context.totalRemunerativo = totalRemunerativo;
    } else if (con.tipo === "no_remunerativo") {
      totalNoRemunerativo += monto;
      context.totalNoRemunerativo = totalNoRemunerativo;
    } else {
      totalDescuentos += monto;
      context.totalDescuentos = totalDescuentos;
    }
  }

  context.bruto = totalRemunerativo + totalNoRemunerativo;
  const neto = roundMoney(context.bruto - totalDescuentos);

  await db
    .delete(payrollLiquidacion)
    .where(
      and(
        eq(payrollLiquidacion.empleadoId, empleadoId),
        eq(payrollLiquidacion.periodo, periodo)
      )
    );

  const [liq] = await db
    .insert(payrollLiquidacion)
    .values({
      empleadoId,
      periodo,
      basico: String(basico),
      totalRemunerativo: String(totalRemunerativo),
      totalNoRemunerativo: String(totalNoRemunerativo),
      totalDescuentos: String(totalDescuentos),
      neto: String(neto),
    })
    .returning();

  if (liq) {
    for (const d of detalles) {
      await db.insert(payrollLiquidacionDetalle).values({
        liquidacionId: liq.id,
        conceptoId: d.conceptoId,
        monto: String(d.monto),
        cantidad: d.cantidad != null ? String(d.cantidad) : null,
      });
    }
  }

  return {
    liquidacion: liq!,
    detalles,
    totalRemunerativo,
    totalNoRemunerativo,
    totalDescuentos,
    neto,
  };
}

/** Calcula una liquidación para un empleado en un período */
export const calcularLiquidacion = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      empleadoId: z.string().uuid(),
      periodo: z.string(), // YYYY-MM
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error("Solo se puede liquidar el mes anterior al en curso.");
    }
    return calcularUnaLiquidacion(ctx.data.empleadoId, ctx.data.periodo, ctx.data.clientId);
  });

/** Liquidación masiva: calcula para todos los empleados activos del período del cliente */
export const calcularLiquidacionMasiva = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: z.string().uuid(), periodo: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    if (!puedeLiquidarPeriodo(ctx.data.periodo)) {
      throw new Error("Solo se puede liquidar el mes anterior al en curso.");
    }
    const empleados = await db
      .select({ id: payrollEmployee.id })
      .from(payrollEmployee)
      .where(
        and(
          eq(payrollEmployee.clientId, ctx.data.clientId),
          eq(payrollEmployee.activo, true)
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
          error: err instanceof Error ? err.message : "Error desconocido",
        });
      }
    }
    return results;
  });

/** Elimina todas las liquidaciones del período para el cliente. Los detalles se eliminan en cascada. */
export const eliminarLiquidacionesDelPeriodo = createServerFn({ method: "POST" })
  .inputValidator(z.object({ clientId: z.string().uuid(), periodo: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({ id: payrollLiquidacion.id })
      .from(payrollLiquidacion)
      .innerJoin(payrollEmployee, eq(payrollLiquidacion.empleadoId, payrollEmployee.id))
      .where(
        and(
          eq(payrollEmployee.clientId, ctx.data.clientId),
          eq(payrollLiquidacion.periodo, ctx.data.periodo)
        )
      );
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(payrollLiquidacion).where(inArray(payrollLiquidacion.id, ids));
    }
    return { deleted: ids.length };
  });

export const listLiquidacionesByPeriodo = createServerFn({ method: "GET" })
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
      eq(payrollLiquidacion.periodo, ctx.data.periodo),
      eq(payrollEmployee.clientId, ctx.data.clientId),
      ...(ctx.data.soloRecibosConfirmados
        ? [eq(payrollLiquidacion.reciboConfirmado, true)]
        : []),
    ];
    return db
      .select({
        liquidacion: payrollLiquidacion,
        empleado: payrollEmployee,
      })
      .from(payrollLiquidacion)
      .innerJoin(payrollEmployee, eq(payrollLiquidacion.empleadoId, payrollEmployee.id))
      .where(and(...conditions))
      .orderBy(payrollEmployee.apellido, payrollEmployee.nombre);
  });

/** Marca la liquidación como recibo confirmado; así aparece en la solapa Recibo. */
export const confirmarReciboLiquidacion = createServerFn({ method: "POST" })
  .inputValidator(z.object({ liquidacionId: z.string().uuid(), clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [row] = await db
      .select({ id: payrollLiquidacion.id })
      .from(payrollLiquidacion)
      .innerJoin(payrollEmployee, eq(payrollLiquidacion.empleadoId, payrollEmployee.id))
      .where(
        and(
          eq(payrollLiquidacion.id, ctx.data.liquidacionId),
          eq(payrollEmployee.clientId, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!row) throw new Error("Liquidación no encontrada o no autorizada");
    await db
      .update(payrollLiquidacion)
      .set({ reciboConfirmado: true, updatedAt: new Date() })
      .where(eq(payrollLiquidacion.id, ctx.data.liquidacionId));
    return { ok: true };
  });

/** Configuración del empleador para el recibo (firma, redondeo). Por ahora valores por defecto. */
export const getPayrollEmployerConfig = createServerFn({ method: "GET" })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    return {
      imprimirTotalRedondeado: false,
      firmaEmpleadorUrl: null as string | null,
    };
  });

export const getReciboDetalle = createServerFn({ method: "GET" })
  .inputValidator(z.object({ liquidacionId: z.string().uuid(), clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const [liq] = await db
      .select({
        liquidacion: payrollLiquidacion,
        empleado: payrollEmployee,
        convenio: payrollConvenio,
        categoria: payrollConvenioCategoria,
      })
      .from(payrollLiquidacion)
      .innerJoin(payrollEmployee, eq(payrollLiquidacion.empleadoId, payrollEmployee.id))
      .innerJoin(payrollConvenio, eq(payrollEmployee.convenioId, payrollConvenio.id))
      .innerJoin(
        payrollConvenioCategoria,
        eq(payrollEmployee.categoriaId, payrollConvenioCategoria.id)
      )
      .where(
        and(
          eq(payrollLiquidacion.id, ctx.data.liquidacionId),
          eq(payrollEmployee.clientId, ctx.data.clientId)
        )
      )
      .limit(1);
    if (!liq) return null;
    const detalles = await db
      .select({
        detalle: payrollLiquidacionDetalle,
        concepto: payrollConcepto,
      })
      .from(payrollLiquidacionDetalle)
      .innerJoin(
        payrollConcepto,
        eq(payrollLiquidacionDetalle.conceptoId, payrollConcepto.id)
      )
      .where(eq(payrollLiquidacionDetalle.liquidacionId, ctx.data.liquidacionId));
    return { ...liq, detalles };
  });
