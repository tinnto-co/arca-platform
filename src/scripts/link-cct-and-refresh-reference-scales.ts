import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  afipEmpleadoresConvenio,
  liquidacionImportEmpleado,
  payrollConvenio,
  payrollConvenioCategoria,
  payrollEmployee,
  payrollEscala,
  profile,
} from '@/drizzle/schema';
import { CONVENIOS_REFERENCIA } from '../lib/payroll-convenios-referencia';
import { parseISO } from 'date-fns';

const SOURCE_URL = 'https://estudiovilaplana.com.ar/';

function extractCctCodigo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/\b(\d{2,4})\/(\d{2,4})\b/);
  if (!match) return null;
  const izquierda = String(parseInt(match[1], 10));
  const derecha = String(parseInt(match[2], 10)).padStart(2, '0');
  return `${izquierda}/${derecha}`;
}

function normalize(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function pickTemplateByCct(cct: string): (typeof CONVENIOS_REFERENCIA)[number] | null {
  if (cct === '130/75') {
    return CONVENIOS_REFERENCIA.find((c) => c.nombre === 'Comercio') ?? null;
  }
  if (cct === '389/04') {
    return CONVENIOS_REFERENCIA.find((c) => c.nombre === 'Gastronomía') ?? null;
  }
  return null;
}

function matchCategoriaId(
  targetCats: Array<{ id: string; codigo: string; nombre: string }>,
  sourceText: string | null | undefined
): string | null {
  const n = normalize(sourceText);
  if (!n) return null;
  for (const cat of targetCats) {
    if (normalize(cat.codigo) === n || normalize(cat.nombre) === n) return cat.id;
  }
  for (const cat of targetCats) {
    if (n.includes(normalize(cat.codigo)) || n.includes(normalize(cat.nombre))) {
      return cat.id;
    }
  }
  return null;
}

async function main() {
  console.log('== Link CCT + refresh scales ==');
  await db.execute(sql`SET lock_timeout TO '5s'`);
  await db.execute(sql`SET statement_timeout TO '60s'`);
  await db.execute(sql`
    ALTER TABLE "payroll_convenio"
    ADD COLUMN IF NOT EXISTS "cct_codigo" text;
  `);
  await db.execute(sql`
    ALTER TABLE "payroll_escala"
    ADD COLUMN IF NOT EXISTS "monto_no_remunerativo" numeric(12, 2) DEFAULT '0' NOT NULL;
  `);
  await db.execute(sql`
    ALTER TABLE "payroll_escala"
    ADD COLUMN IF NOT EXISTS "periodo_label" text;
  `);
  await db.execute(sql`
    ALTER TABLE "payroll_escala"
    ADD COLUMN IF NOT EXISTS "fuente" text;
  `);

  const profilesConSueldos = await db
    .select({ id: profile.id, clientId: profile.client })
    .from(profile)
    .where(eq(profile.liquidaSueldos, true));

  let conveniosLinked = 0;
  let conveniosCreated = 0;
  let categoriasDeleted = 0;
  let escalasDeleted = 0;
  let categoriasCreated = 0;
  let escalasCreated = 0;
  let employeesRemapped = 0;

  for (const p of profilesConSueldos) {
    console.log(`Perfil ${p.id} (cliente ${p.clientId})`);
    const afipRows = await db
      .select()
      .from(afipEmpleadoresConvenio)
      .where(eq(afipEmpleadoresConvenio.profileId, p.id));

    const afipByCct = new Map<string, (typeof afipRows)[number]>();
    for (const row of afipRows) {
      const cct = extractCctCodigo(row.cct);
      if (!cct) continue;
      if (!afipByCct.has(cct)) afipByCct.set(cct, row);
    }

    for (const [cct, afip] of afipByCct.entries()) {
      const template = pickTemplateByCct(cct);
      if (!template) continue;

      let convenio = (
        await db
          .select()
          .from(payrollConvenio)
          .where(
            and(
              eq(payrollConvenio.clientId, p.clientId),
              eq(payrollConvenio.cctCodigo, cct)
            )
          )
          .limit(1)
      )[0];

      if (!convenio) {
        const allConvenios = await db
          .select()
          .from(payrollConvenio)
          .where(eq(payrollConvenio.clientId, p.clientId));
        convenio = allConvenios.find((c) => {
          const cand = [
            extractCctCodigo(c.nombre),
            extractCctCodigo(c.descripcion),
          ].filter((v): v is string => Boolean(v));
          return cand.includes(cct);
        });
      }

      if (!convenio) {
        const [created] = await db
          .insert(payrollConvenio)
          .values({
            clientId: p.clientId,
            nombre: cct,
            cctCodigo: cct,
            descripcion: `AFIP CCT ${afip.cct} - ${afip.actividad}`,
          })
          .returning();
        convenio = created;
        conveniosCreated++;
      } else {
        await db
          .update(payrollConvenio)
          .set({
            cctCodigo: cct,
            nombre: cct,
            updatedAt: new Date(),
          })
          .where(eq(payrollConvenio.id, convenio.id));
        conveniosLinked++;
      }

      const existingCats = await db
        .select()
        .from(payrollConvenioCategoria)
        .where(eq(payrollConvenioCategoria.convenioId, convenio.id));
      const existingCatsById = new Map(existingCats.map((c) => [c.id, c] as const));
      const existingByCodigo = new Map(existingCats.map((c) => [c.codigo, c] as const));

      const targetCats: Array<{ id: string; codigo: string; nombre: string }> = [];
      for (const catTpl of template.categorias) {
        const existing = existingByCodigo.get(catTpl.codigo);
        if (existing) {
          if (
            existing.nombre !== catTpl.nombre ||
            (existing.orden ?? 0) !== catTpl.orden
          ) {
            await db
              .update(payrollConvenioCategoria)
              .set({
                nombre: catTpl.nombre,
                orden: catTpl.orden,
                updatedAt: new Date(),
              })
              .where(eq(payrollConvenioCategoria.id, existing.id));
          }
          targetCats.push({
            id: existing.id,
            codigo: catTpl.codigo,
            nombre: catTpl.nombre,
          });
        } else {
          const [createdCat] = await db
            .insert(payrollConvenioCategoria)
            .values({
              convenioId: convenio.id,
              codigo: catTpl.codigo,
              nombre: catTpl.nombre,
              orden: catTpl.orden,
            })
            .returning({ id: payrollConvenioCategoria.id });
          categoriasCreated++;
          targetCats.push({
            id: createdCat.id,
            codigo: catTpl.codigo,
            nombre: catTpl.nombre,
          });
        }
      }

      const employees = await db
        .select({
          id: payrollEmployee.id,
          categoriaId: payrollEmployee.categoriaId,
          importEmpleadoId: payrollEmployee.importEmpleadoId,
        })
        .from(payrollEmployee)
        .where(eq(payrollEmployee.convenioId, convenio.id));

      for (const employee of employees) {
        const oldCategoria = existingCatsById.get(employee.categoriaId);
        const importEmpleado = employee.importEmpleadoId
          ? (
              await db
                .select({ categoria: liquidacionImportEmpleado.categoria })
                .from(liquidacionImportEmpleado)
                .where(eq(liquidacionImportEmpleado.id, employee.importEmpleadoId))
                .limit(1)
            )[0]
          : null;

        const targetCategoriaId =
          matchCategoriaId(targetCats, importEmpleado?.categoria) ??
          matchCategoriaId(targetCats, oldCategoria?.nombre) ??
          matchCategoriaId(targetCats, oldCategoria?.codigo) ??
          targetCats[0]?.id;

        if (!targetCategoriaId) continue;

        if (targetCategoriaId !== employee.categoriaId) {
          await db
            .update(payrollEmployee)
            .set({ categoriaId: targetCategoriaId, updatedAt: new Date() })
            .where(eq(payrollEmployee.id, employee.id));
          employeesRemapped++;
        }
      }

      for (const cat of existingCats) {
        const deletedEsc = await db
          .delete(payrollEscala)
          .where(eq(payrollEscala.categoriaId, cat.id))
          .returning({ id: payrollEscala.id });
        escalasDeleted += deletedEsc.length;
      }
      const targetCatIds = new Set(targetCats.map((cat) => cat.id));
      for (const oldCat of existingCats) {
        if (targetCatIds.has(oldCat.id)) continue;
        const linkedEmployee = await db
          .select({ id: payrollEmployee.id })
          .from(payrollEmployee)
          .where(eq(payrollEmployee.categoriaId, oldCat.id))
          .limit(1);
        if (linkedEmployee.length > 0) continue;
        await db
          .delete(payrollConvenioCategoria)
          .where(eq(payrollConvenioCategoria.id, oldCat.id));
        categoriasDeleted++;
      }

      for (let i = 0; i < targetCats.length; i++) {
        const cat = targetCats[i];
        const tpl = template.categorias[i];
        for (const escala of tpl.escalas) {
          await db.insert(payrollEscala).values({
            categoriaId: cat.id,
            vigenciaDesde: parseISO(escala.vigenciaDesde),
            vigenciaHasta: escala.vigenciaHasta
              ? parseISO(escala.vigenciaHasta)
              : null,
            montoBasico: escala.montoBasico,
            montoNoRemunerativo: escala.montoNoRemunerativo,
            periodoLabel: escala.periodo,
            fuente: SOURCE_URL,
          });
          escalasCreated++;
        }
      }
    }
  }

  console.log(`Convenios enlazados: ${conveniosLinked}`);
  console.log(`Convenios creados: ${conveniosCreated}`);
  console.log(`Categorias borradas: ${categoriasDeleted}`);
  console.log(`Escalas borradas: ${escalasDeleted}`);
  console.log(`Categorias creadas: ${categoriasCreated}`);
  console.log(`Escalas creadas: ${escalasCreated}`);
  console.log(`Empleados remapeados: ${employeesRemapped}`);
  console.log('Proceso finalizado.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });

