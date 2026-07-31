/**
 * Escenario de validación del ajuste por inflación (RT 6).
 *
 * Reproduce el ejercicio 4 de E-PRESIS SA (01/04/2025 – 31/03/2026) tal como
 * figura en el papel de trabajo del estudio (`Planilla Modelo PRESIS 2026.xls`,
 * hoja AXI), para poder comparar contra los EECC publicados:
 *
 *   RECPAM esperado ............ −32.401.776,77
 *   PN inicial ajustado ........ 155.573.877,49
 *   Ajuste de capital final ....   6.191.687,35
 *
 * Es el método de validación que propuso el propio estudio: armar el balance a
 * mano y el mismo desde el sistema, y comparar los importes finales.
 *
 * Crea una empresa aparte (`E-PRESIS SA (demo AXI)`) para no pisar datos reales,
 * con su ejercicio, sus 12 períodos, el asiento de apertura con el patrimonio
 * neto y un asiento por mes con las operaciones históricas.
 *
 * Idempotente: se puede correr varias veces (borra y rehace el ejercicio demo).
 * SOLO para desarrollo local.
 *
 *   bun run db:seed-axi-epresis
 */
import { db } from '@/lib/db';
import {
  account,
  accountingPeriod,
  client,
  fiscalYear,
  journalEntry,
  journalEntryLine,
  representative,
} from '@/drizzle/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { seedBaseChartForOrg } from '@/lib/accounting-seed';

const DEMO_CUIT = '30999999991';
const DEMO_NAME = 'E-PRESIS SA (demo AXI)';
const FY_NUMBER = 4;

/** Cuentas del plan base usadas por el escenario. */
const C = {
  banco: '1.1.01.002',
  deudores: '1.1.03.001',
  proveedores: '2.1.01.001',
  capital: '3.1.001',
  ajusteCapital: '3.1.002',
  rna: '3.5.001',
  ventas: '4.1.001',
  cmv: '5.1.001',
  sueldos: '5.2.001',
  cargas: '5.2.002',
  // En el balance real los ingresos brutos van a comercialización; acá se usa
  // "Impuestos y tasas" del plan base. No cambia el ajuste: lo único que importa
  // es que sea una cuenta de resultado no monetaria a costo.
  iibb: '5.2.008',
} as const;

/** Meses del ejercicio, en orden. */
const MESES: [number, number][] = [
  [2025, 4],
  [2025, 5],
  [2025, 6],
  [2025, 7],
  [2025, 8],
  [2025, 9],
  [2025, 10],
  [2025, 11],
  [2025, 12],
  [2026, 1],
  [2026, 2],
  [2026, 3],
];

/** Importes históricos mensuales, hoja AXI del papel de trabajo. */
const VENTAS = [
  69284248.1, 82053674.91, 70128665.47, 11428824.64, 81370055.25, 85526108.98,
  81037068.52, 96800526.79, 98906976.49, 106609637.3, 106476092.5, 97625445.08,
];
const COMPRAS = [
  64216563.18, 47844372.6, 78603867.59, 79042214.41, 70637049.88, 79335190.79,
  3900460.45, 35303220.23, 38506786.2, 26141486.74, 47701301.57, 45409295.72,
];
const SUELDOS = [
  8760355.47, 9086665.97, 13608648.91, 10063946.56, 9687963.31, 10535447.84,
  9936278.73, 10571682.99, 14462577.49, 10536011.69, 10552301.08, 10815987.5,
];
const CARGAS = [
  3468165.29, 3589220.21, 5487192.36, 3982099.92, 3956219.54, 4142010.13,
  3949528.35, 4203472.49, 5996966.77, 4276498.43, 4263797.34, 4349518.56,
];
const IIBB = [
  2231260.97, 4714253.18, 4016220.78, 2731236.83, 4701414.07, 2752674.19,
  4084276.55, 5939078.9, 3147674.52, 3407447.63, 3160771.58, 0,
];

/** Saldos de apertura del patrimonio neto (acreedores). */
const APERTURA = {
  capital: 500000,
  ajusteCapital: 4546140.83,
  rna: 112270711.21,
};

const money = (n: number) => n.toFixed(2);

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    throw new Error(
      'Este script es solo para desarrollo local. Apuntá DATABASE_URL a la base local.'
    );
  }

  const [rep] = await db
    .select({
      id: representative.id,
      organizationId: representative.organizationId,
    })
    .from(representative)
    .limit(1);
  if (!rep?.organizationId) throw new Error('No hay representantes cargados.');
  const orgId = rep.organizationId;

  await seedBaseChartForOrg(orgId);

  // 1. Empresa demo
  // Se seleccionan columnas puntuales a propósito: `select()` trae todas las del
  // schema y falla si la base local quedó desincronizada de las migraciones.
  let [demo] = await db
    .select({ id: client.id, name: client.name })
    .from(client)
    .where(eq(client.identityNumber, DEMO_CUIT))
    .limit(1);

  if (!demo) {
    [demo] = await db
      .insert(client)
      .values({
        representativeId: rep.id,
        name: DEMO_NAME,
        identityNumber: DEMO_CUIT,
        identityType: 'CUIT',
        address: 'Vallese Felipe 761 Dpto 4 T2 (1405) - CABA',
        phone: '',
        email: '',
        status: 'active',
        fiscalCondition: 'responsable_inscripto',
      })
      .returning({ id: client.id, name: client.name });
    console.log(`Empresa demo creada: ${DEMO_NAME}`);
  } else {
    console.log(`Empresa demo ya existía: ${demo.name}`);
  }

  // 2. Ejercicio limpio (borrar el anterior arrastra asientos y períodos)
  const previous = await db
    .select()
    .from(fiscalYear)
    .where(
      and(eq(fiscalYear.clientId, demo.id), eq(fiscalYear.number, FY_NUMBER))
    );
  if (previous.length > 0) {
    // Los asientos van primero: `journal_entry_line.period_id` es RESTRICT, así
    // que bloquearía el borrado en cascada de los períodos.
    await db
      .delete(journalEntry)
      .where(eq(journalEntry.fiscalYearId, previous[0].id));
    await db.delete(fiscalYear).where(eq(fiscalYear.id, previous[0].id));
    console.log('Ejercicio demo anterior eliminado.');
  }

  const [fy] = await db
    .insert(fiscalYear)
    .values({
      clientId: demo.id,
      number: FY_NUMBER,
      startDate: new Date('2025-04-01T00:00:00Z'),
      endDate: new Date('2026-03-31T00:00:00Z'),
      status: 'open',
    })
    .returning();

  const periods = await db
    .insert(accountingPeriod)
    .values(
      MESES.map(([year, month]) => ({
        fiscalYearId: fy.id,
        clientId: demo.id,
        year,
        month,
        status: 'open' as const,
      }))
    )
    .returning();
  const periodOf = (year: number, month: number) =>
    periods.find((p) => p.year === year && p.month === month)!;

  // 3. Cuentas del plan base del estudio
  const codes = Object.values(C);
  const accounts = await db
    .select()
    .from(account)
    .where(
      and(
        eq(account.organizationId, orgId),
        eq(account.scope, 'base'),
        inArray(account.code, [...codes])
      )
    );
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  for (const code of codes) {
    if (!byCode.has(code)) throw new Error(`Falta la cuenta base ${code}`);
  }
  const id = (code: string) => byCode.get(code)!;

  // 4. Asiento de apertura: el patrimonio neto contra bancos.
  const pnTotal = APERTURA.capital + APERTURA.ajusteCapital + APERTURA.rna;
  const [opening] = await db
    .insert(journalEntry)
    .values({
      clientId: demo.id,
      fiscalYearId: fy.id,
      periodId: periodOf(2025, 4).id,
      number: 1,
      entryDate: new Date('2025-04-01T00:00:00Z'),
      description: 'Asiento de apertura del ejercicio',
      origin: 'auto_opening',
    })
    .returning();

  await db.insert(journalEntryLine).values([
    {
      journalEntryId: opening.id,
      accountId: id(C.banco),
      clientId: demo.id,
      periodId: periodOf(2025, 4).id,
      debit: money(pnTotal),
      credit: '0',
      description: 'Saldo inicial de bancos',
      lineOrder: 0,
    },
    {
      journalEntryId: opening.id,
      accountId: id(C.capital),
      clientId: demo.id,
      periodId: periodOf(2025, 4).id,
      debit: '0',
      credit: money(APERTURA.capital),
      description: 'Capital social',
      lineOrder: 1,
    },
    {
      journalEntryId: opening.id,
      accountId: id(C.ajusteCapital),
      clientId: demo.id,
      periodId: periodOf(2025, 4).id,
      debit: '0',
      credit: money(APERTURA.ajusteCapital),
      description: 'Ajuste de capital',
      lineOrder: 2,
    },
    {
      journalEntryId: opening.id,
      accountId: id(C.rna),
      clientId: demo.id,
      periodId: periodOf(2025, 4).id,
      debit: '0',
      credit: money(APERTURA.rna),
      description: 'Resultados no asignados',
      lineOrder: 3,
    },
  ]);

  // 5. Un asiento por mes con las operaciones del período.
  let number = 2;
  for (let i = 0; i < MESES.length; i++) {
    const [year, month] = MESES[i];
    const period = periodOf(year, month);
    const lastDay = new Date(Date.UTC(year, month, 0));

    const [entry] = await db
      .insert(journalEntry)
      .values({
        clientId: demo.id,
        fiscalYearId: fy.id,
        periodId: period.id,
        number: number++,
        entryDate: lastDay,
        description: `Operaciones ${String(month).padStart(2, '0')}/${year}`,
        origin: 'manual',
      })
      .returning();

    const line = (
      code: string,
      debit: number,
      credit: number,
      description: string,
      order: number
    ) => ({
      journalEntryId: entry.id,
      accountId: id(code),
      clientId: demo.id,
      periodId: period.id,
      debit: money(debit),
      credit: money(credit),
      description,
      lineOrder: order,
    });

    const gastos = SUELDOS[i] + CARGAS[i] + IIBB[i];
    // Se cobran las ventas y se pagan las compras dentro del mismo mes: son
    // movimientos entre cuentas monetarias, así que no alteran el ajuste, pero
    // dejan el ESP con saldos razonables (bancos positivo, sin deudas al cierre).
    await db
      .insert(journalEntryLine)
      .values([
        line(C.deudores, VENTAS[i], 0, 'Ventas del mes', 0),
        line(C.ventas, 0, VENTAS[i], 'Ventas del mes', 1),
        line(C.cmv, COMPRAS[i], 0, 'Compras del mes', 2),
        line(C.proveedores, 0, COMPRAS[i], 'Compras del mes', 3),
        line(C.sueldos, SUELDOS[i], 0, 'Sueldos y jornales', 4),
        line(C.cargas, CARGAS[i], 0, 'Cargas sociales', 5),
        line(C.iibb, IIBB[i], 0, 'Ingresos brutos', 6),
        line(C.banco, 0, gastos, 'Pago de gastos del mes', 7),
        line(C.banco, VENTAS[i], 0, 'Cobranza de ventas', 8),
        line(C.deudores, 0, VENTAS[i], 'Cobranza de ventas', 9),
        line(C.proveedores, COMPRAS[i], 0, 'Pago a proveedores', 10),
        line(C.banco, 0, COMPRAS[i], 'Pago a proveedores', 11),
      ]);
  }

  console.log(
    `Escenario listo: ${DEMO_NAME} · ejercicio ${FY_NUMBER} (01/04/2025 – 31/03/2026) · ${number - 1} asientos.`
  );
  console.log('Verificá en Contabilidad → Ajuste por inflación:');
  console.log('  RECPAM esperado ................ -32.401.776,77');
  console.log('  PN inicial ajustado ............ 155.573.877,49');
  console.log('  Ajuste de capital final ........   6.191.687,35');
  console.log('  Resultado del ejercicio ajustado 111.179.623,09');
  console.log('  PN al cierre (hist. = ajustado)  266.753.500,58');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
