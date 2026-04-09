import { and, eq, sql } from 'drizzle-orm';
import { parseISO, format } from 'date-fns';
import { db } from '@/lib/db';
import { profile, payrollConvenio, payrollConvenioCategoria, payrollEscala } from '@/drizzle/schema';
import { CONVENIOS_REFERENCIA } from '../lib/payroll-convenios-referencia';

const SOURCE_URL = 'https://estudiovilaplana.com.ar/';

function dateKey(date: Date | null | undefined): string {
  if (!date) return '';
  return format(date, 'yyyy-MM-dd');
}

async function ensurePayrollEscalaColumns() {
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
}

async function main() {
  console.log('== Sync convenios referencia ==');
  await db.execute(sql`SET lock_timeout TO '5s'`);
  await db.execute(sql`SET statement_timeout TO '60s'`);
  await ensurePayrollEscalaColumns();
  console.log('Columnas de payroll_escala verificadas');

  console.log('Buscando clientes con liquidaSueldos...');
  const profilesConSueldos = await db
    .select({ clientId: profile.client })
    .from(profile)
    .where(eq(profile.liquidaSueldos, true));
  const clientIds = Array.from(new Set(profilesConSueldos.map((row) => row.clientId).filter(Boolean)));
  const clients = clientIds.map((id) => ({ id: id as string }));
  console.log(`Clientes detectados: ${clients.length}`);

  let conveniosCreated = 0;
  let conveniosUpdated = 0;
  let categoriasCreated = 0;
  let escalasCreated = 0;
  let escalasUpdated = 0;

  for (const c of clients) {
    console.log(`Procesando cliente ${c.id}...`);
    for (const convenioTpl of CONVENIOS_REFERENCIA) {
      const [existingConvenio] = await db
        .select()
        .from(payrollConvenio)
        .where(
          and(
            eq(payrollConvenio.clientId, c.id),
            eq(payrollConvenio.nombre, convenioTpl.nombre)
          )
        )
        .limit(1);

      let convenioId = existingConvenio?.id;
      if (!convenioId) {
        const [created] = await db
          .insert(payrollConvenio)
          .values({
            clientId: c.id,
            nombre: convenioTpl.nombre,
            descripcion: convenioTpl.descripcion,
          })
          .returning({ id: payrollConvenio.id });
        convenioId = created.id;
        conveniosCreated++;
      } else if (existingConvenio.descripcion !== convenioTpl.descripcion) {
        await db
          .update(payrollConvenio)
          .set({ descripcion: convenioTpl.descripcion, updatedAt: new Date() })
          .where(eq(payrollConvenio.id, convenioId));
        conveniosUpdated++;
      }

      const existingCategorias = await db
        .select()
        .from(payrollConvenioCategoria)
        .where(eq(payrollConvenioCategoria.convenioId, convenioId));
      const categoriaByCodigo = new Map(
        existingCategorias.map((row) => [row.codigo, row] as const)
      );

      for (const categoriaTpl of convenioTpl.categorias) {
        let categoriaId = categoriaByCodigo.get(categoriaTpl.codigo)?.id;
        if (!categoriaId) {
          const [createdCat] = await db
            .insert(payrollConvenioCategoria)
            .values({
              convenioId,
              codigo: categoriaTpl.codigo,
              nombre: categoriaTpl.nombre,
              orden: categoriaTpl.orden,
            })
            .returning({ id: payrollConvenioCategoria.id });
          categoriaId = createdCat.id;
          categoriasCreated++;
        }

        const existingEscalas = await db
          .select()
          .from(payrollEscala)
          .where(eq(payrollEscala.categoriaId, categoriaId));

        for (const escalaTpl of categoriaTpl.escalas) {
          const vigDesde = parseISO(escalaTpl.vigenciaDesde);
          const vigHasta = escalaTpl.vigenciaHasta
            ? parseISO(escalaTpl.vigenciaHasta)
            : null;

          const found = existingEscalas.find((escalaDb) => {
            return (
              dateKey(escalaDb.vigenciaDesde) === dateKey(vigDesde) &&
              dateKey(escalaDb.vigenciaHasta) === dateKey(vigHasta) &&
              (escalaDb.periodoLabel ?? '') === escalaTpl.periodo
            );
          });

          if (!found) {
            await db.insert(payrollEscala).values({
              categoriaId,
              vigenciaDesde: vigDesde,
              vigenciaHasta: vigHasta,
              montoBasico: escalaTpl.montoBasico,
              montoNoRemunerativo: escalaTpl.montoNoRemunerativo,
              periodoLabel: escalaTpl.periodo,
              fuente: SOURCE_URL,
            });
            escalasCreated++;
            continue;
          }

          const shouldUpdate =
            String(found.montoBasico) !== escalaTpl.montoBasico ||
            String(found.montoNoRemunerativo ?? '0') !==
              escalaTpl.montoNoRemunerativo ||
            (found.fuente ?? '') !== SOURCE_URL;

          if (shouldUpdate) {
            await db
              .update(payrollEscala)
              .set({
                montoBasico: escalaTpl.montoBasico,
                montoNoRemunerativo: escalaTpl.montoNoRemunerativo,
                periodoLabel: escalaTpl.periodo,
                fuente: SOURCE_URL,
                updatedAt: new Date(),
              })
              .where(eq(payrollEscala.id, found.id));
            escalasUpdated++;
          }
        }
      }
    }
  }

  console.log(`Clientes procesados: ${clients.length}`);
  console.log(`Convenios creados: ${conveniosCreated}`);
  console.log(`Convenios actualizados: ${conveniosUpdated}`);
  console.log(`Categorías creadas: ${categoriasCreated}`);
  console.log(`Escalas creadas: ${escalasCreated}`);
  console.log(`Escalas actualizadas: ${escalasUpdated}`);
}

main()
  .then(() => {
    console.log('Sync finalizado.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error en sync:', err);
    process.exit(1);
  });

