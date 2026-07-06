/**
 * Seed vencimientos (due dates) for Admip SRL (CUIT 30707920056).
 * Creates ~25 mock upcoming/past vencimientos across common Argentine taxes.
 *
 * Usage: bun run src/scripts/seed-vencimientos-admip.ts
 */
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { prepare: false });

async function main() {
  // Find the client (profile) with CUIT 30707920056 and its representative
  const rows = await sql`
    SELECT c.id AS client_id, c.name AS client_name, c.representative_id
    FROM client c
    WHERE c.identity_number = '30707920056'
    LIMIT 1
  `;

  if (!rows.length) {
    console.error('No client found with CUIT 30707920056');
    process.exit(1);
  }

  const { client_id: clientId, client_name, representative_id } = rows[0];
  const profile_name = client_name;
  console.log(`Found: ${profile_name} → representative_id: ${representative_id}, client_id: ${clientId}`);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Helper to create a date offset from today
  const dateOffset = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d;
  };

  // Mock vencimientos data — a mix of past (overdue), upcoming, and future
  const vencimientos = [
    // Overdue (past)
    { tax: 'IVA', concept: 'Declaración Jurada', subConcept: 'F.2002', period: '05/2026', dueDate: dateOffset(-15), detail: 'Vencimiento DJ IVA mayo 2026' },
    { tax: 'Ganancias', concept: 'Anticipo', subConcept: 'Anticipo 5/10', period: '2026', dueDate: dateOffset(-10), detail: 'Anticipo de Ganancias - cuota 5' },
    { tax: 'IIBB', concept: 'Declaración Jurada', subConcept: 'CM05', period: '05/2026', dueDate: dateOffset(-8), detail: 'DDJJ Ingresos Brutos Convenio Multilateral mayo' },
    { tax: 'Cargas Sociales', concept: 'F.931', subConcept: 'Contribuciones patronales', period: '05/2026', dueDate: dateOffset(-5), detail: 'Presentación F.931 - mayo 2026' },
    { tax: 'IVA', concept: 'Retenciones', subConcept: 'SICORE', period: '05/2026 - 2da quincena', dueDate: dateOffset(-3), detail: 'SICORE IVA retenciones 2da quincena mayo' },

    // This week
    { tax: 'Monotributo', concept: 'Cuota mensual', subConcept: '', period: '06/2026', dueDate: dateOffset(0), detail: 'Vencimiento cuota Monotributo junio (empleados monotributistas)' },
    { tax: 'IVA', concept: 'Retenciones', subConcept: 'SICORE', period: '06/2026 - 1ra quincena', dueDate: dateOffset(1), detail: 'SICORE IVA retenciones 1ra quincena junio' },
    { tax: 'IIBB', concept: 'Retenciones', subConcept: 'SIFERE', period: '05/2026', dueDate: dateOffset(2), detail: 'SIFERE - retenciones IIBB mayo' },

    // Next week
    { tax: 'IVA', concept: 'Declaración Jurada', subConcept: 'F.2002', period: '06/2026', dueDate: dateOffset(5), detail: 'Vencimiento DJ IVA junio 2026' },
    { tax: 'Ganancias', concept: 'Anticipo', subConcept: 'Anticipo 6/10', period: '2026', dueDate: dateOffset(7), detail: 'Anticipo de Ganancias - cuota 6' },
    { tax: 'Autónomos', concept: 'Cuota mensual', subConcept: '', period: '06/2026', dueDate: dateOffset(8), detail: 'Aporte autónomos junio 2026' },
    { tax: 'IIBB', concept: 'Declaración Jurada', subConcept: 'CM05', period: '06/2026', dueDate: dateOffset(9), detail: 'DDJJ Ingresos Brutos Convenio Multilateral junio' },

    // This month
    { tax: 'Cargas Sociales', concept: 'F.931', subConcept: 'Contribuciones patronales', period: '06/2026', dueDate: dateOffset(12), detail: 'Presentación F.931 - junio 2026' },
    { tax: 'Bienes Personales', concept: 'Anticipo', subConcept: 'Anticipo 3/5', period: '2026', dueDate: dateOffset(14), detail: 'Anticipo Bienes Personales cuota 3' },
    { tax: 'IVA', concept: 'Percepciones', subConcept: 'Aduana', period: '06/2026', dueDate: dateOffset(15), detail: 'Percepciones IVA Aduana junio' },
    { tax: 'Ganancias', concept: 'Retenciones', subConcept: 'SICORE', period: '06/2026 - 1ra quincena', dueDate: dateOffset(16), detail: 'SICORE Ganancias retenciones 1ra quincena' },
    { tax: 'IVA', concept: 'Retenciones', subConcept: 'SICORE', period: '06/2026 - 2da quincena', dueDate: dateOffset(18), detail: 'SICORE IVA retenciones 2da quincena junio' },

    // Next month
    { tax: 'IVA', concept: 'Declaración Jurada', subConcept: 'F.2002', period: '07/2026', dueDate: dateOffset(25), detail: 'Vencimiento DJ IVA julio 2026' },
    { tax: 'Ganancias', concept: 'Anticipo', subConcept: 'Anticipo 7/10', period: '2026', dueDate: dateOffset(28), detail: 'Anticipo de Ganancias - cuota 7' },
    { tax: 'IIBB', concept: 'Declaración Jurada', subConcept: 'CM05', period: '07/2026', dueDate: dateOffset(30), detail: 'DDJJ Ingresos Brutos Convenio Multilateral julio' },
    { tax: 'Cargas Sociales', concept: 'F.931', subConcept: 'Contribuciones patronales', period: '07/2026', dueDate: dateOffset(35), detail: 'Presentación F.931 - julio 2026' },
    { tax: 'Autónomos', concept: 'Cuota mensual', subConcept: '', period: '07/2026', dueDate: dateOffset(38), detail: 'Aporte autónomos julio 2026' },
    { tax: 'Bienes Personales', concept: 'Anticipo', subConcept: 'Anticipo 4/5', period: '2026', dueDate: dateOffset(42), detail: 'Anticipo Bienes Personales cuota 4' },
    { tax: 'Ganancias', concept: 'Retenciones', subConcept: 'SICORE', period: '07/2026 - 1ra quincena', dueDate: dateOffset(45), detail: 'SICORE Ganancias retenciones 1ra quincena julio' },
    { tax: 'IVA', concept: 'Declaración Jurada', subConcept: 'F.2002', period: '08/2026', dueDate: dateOffset(55), detail: 'Vencimiento DJ IVA agosto 2026' },
  ];

  console.log(`Inserting ${vencimientos.length} vencimientos...`);

  for (const v of vencimientos) {
    await sql`
      INSERT INTO due_date (representative_id, client_id, tax, concept, sub_concept, period, quota_number, due_date, detail, created_at, updated_at)
      VALUES (
        ${representative_id},
        ${clientId},
        ${v.tax},
        ${v.concept},
        ${v.subConcept},
        ${v.period},
        '0',
        ${v.dueDate},
        ${v.detail},
        NOW(),
        NOW()
      )
    `;
  }

  console.log(`Done! Inserted ${vencimientos.length} vencimientos for ${profile_name}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
