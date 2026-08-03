/**
 * Seed del escenario de prueba para el cierre contable de sueldos (US 3.3.1).
 *
 * Prepara una empresa que ya tiene recibos confirmados para que se le pueda
 * generar el asiento automático: plan de cuentas base del estudio, ejercicio
 * contable con sus períodos, y reglas de mapeo `sourceModule='payroll'`.
 *
 * Idempotente: se puede correr varias veces. SOLO para desarrollo local —
 * pasar DATABASE_URL apuntando a la base local:
 *
 *   DATABASE_URL='postgres://postgres:postgres@localhost:5432/arca_local' \
 *     bun run src/scripts/seed-payroll-close-scenario.ts
 */
import { db } from '@/lib/db';
import {
  account,
  accountingPeriod,
  client,
  fiscalYear,
  ledgerMappingRule,
  ledgerMappingRuleLine,
  representative,
} from '@/drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { seedBaseChartForOrg } from '@/lib/accounting-seed';

/** Empresa objetivo: E-presis S.A., que tiene 9 recibos confirmados de 2026-02. */
const CLIENT_ID = '53adfe1f-7142-4af4-b9cd-e80ddf21e66f';
const PERIODO = '2026-02';

/** Cuentas del asiento de sueldos, por código del plan base del estudio. */
const CUENTAS = {
  sueldos: '5.2.001', // Sueldos y jornales administración
  sueldosAPagar: '2.1.03.001', // Sueldos a pagar
  cargasAPagar: '2.1.03.002', // Cargas sociales a pagar
} as const;

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    throw new Error(
      `Este script es solo para la base local. DATABASE_URL apunta a: ${url.replace(/:[^:@]+@/, ':***@')}`
    );
  }

  const [emp] = await db
    .select({
      id: client.id,
      name: client.name,
      orgId: representative.organizationId,
    })
    .from(client)
    .innerJoin(representative, eq(representative.id, client.representativeId))
    .where(eq(client.id, CLIENT_ID))
    .limit(1);
  if (!emp) throw new Error(`No existe la empresa ${CLIENT_ID}`);
  console.log(`Empresa: ${emp.name} (org ${emp.orgId})`);

  // 1. Plan de cuentas base del estudio (incluye la cuenta de sistema 0.001).
  const seeded = await seedBaseChartForOrg(emp.orgId);
  console.log(`Plan de cuentas: ${JSON.stringify(seeded)}`);

  // 2. Ejercicio 2026 + sus 12 períodos mensuales.
  const [fyExistente] = await db
    .select({ id: fiscalYear.id })
    .from(fiscalYear)
    .where(eq(fiscalYear.clientId, CLIENT_ID))
    .limit(1);

  if (fyExistente) {
    console.log('Ejercicio: ya existía');
  } else {
    const [fy] = await db
      .insert(fiscalYear)
      .values({
        clientId: CLIENT_ID,
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-12-31T00:00:00Z'),
        status: 'open',
        number: 1,
      })
      .returning();
    await db.insert(accountingPeriod).values(
      Array.from({ length: 12 }, (_, i) => ({
        fiscalYearId: fy.id,
        clientId: CLIENT_ID,
        year: 2026,
        month: i + 1,
        status: 'open' as const,
      }))
    );
    console.log('Ejercicio 2026 creado con 12 períodos');
  }

  // 3. Resolver los ids de las cuentas que usan las reglas.
  const codes = Object.values(CUENTAS);
  const accs = await db
    .select({ id: account.id, code: account.code, type: account.type })
    .from(account)
    .where(and(eq(account.organizationId, emp.orgId), eq(account.scope, 'base')));
  const byCode = new Map(accs.map((a) => [a.code, a]));
  const faltantes = codes.filter((c) => !byCode.has(c));
  if (faltantes.length)
    throw new Error(
      `Faltan cuentas en el plan base: ${faltantes.join(', ')}. Códigos disponibles: ${accs
        .map((a) => a.code)
        .sort()
        .join(', ')}`
    );
  const noImputables = codes.filter((c) => byCode.get(c)!.type !== 'imputable');
  if (noImputables.length)
    throw new Error(`Estas cuentas no son imputables: ${noImputables.join(', ')}`);

  const id = (code: string) => byCode.get(code)!.id;

  // 4. Reglas de mapeo de sueldos (borra las previas para ser idempotente).
  await db
    .delete(ledgerMappingRule)
    .where(
      and(
        eq(ledgerMappingRule.clientId, CLIENT_ID),
        eq(ledgerMappingRule.sourceModule, 'payroll')
      )
    );

  const reglas = [
    {
      name: 'Sueldos brutos (remunerativo)',
      priority: 10,
      condition: { tipo: ['remunerativo', 'no_remunerativo'] },
      lines: [
        {
          accountId: id(CUENTAS.sueldos),
          side: 'debit' as const,
          description: 'Sueldos y jornales',
        },
        {
          accountId: id(CUENTAS.sueldosAPagar),
          side: 'credit' as const,
          description: 'Sueldos a pagar',
        },
      ],
    },
    {
      name: 'Aportes y retenciones del trabajador',
      priority: 20,
      condition: { tipo: ['descuento', 'retencion'] },
      lines: [
        {
          accountId: id(CUENTAS.sueldosAPagar),
          side: 'debit' as const,
          description: 'Menor neto a pagar',
        },
        {
          accountId: id(CUENTAS.cargasAPagar),
          side: 'credit' as const,
          description: 'Aportes y retenciones a depositar',
        },
      ],
    },
  ];

  for (const r of reglas) {
    const [rule] = await db
      .insert(ledgerMappingRule)
      .values({
        clientId: CLIENT_ID,
        name: r.name,
        sourceModule: 'payroll',
        ruleType: 'conditional',
        condition: r.condition,
        priority: r.priority,
        isActive: true,
      })
      .returning();
    await db.insert(ledgerMappingRuleLine).values(
      r.lines.map((l, i) => ({
        ruleId: rule.id,
        accountId: l.accountId,
        side: l.side,
        amountBasis: 'concept_value' as const,
        lineOrder: i,
        description: l.description,
      }))
    );
    console.log(`Regla creada: ${r.name} (prioridad ${r.priority})`);
  }

  console.log(
    `\nListo. Probar el cierre de ${PERIODO} en /sueldos/${CLIENT_ID} (tab Dashboard).`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
