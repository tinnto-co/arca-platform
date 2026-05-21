/**
 * Data migration: set liquida_sueldos = true on clients whose CUIT matches
 * the authorized payroll companies list.
 *
 * Run after `bun run db:push`:
 *   bun src/scripts/seed-liquida-sueldos.ts
 */
import { db } from '@/lib/db';
import { client } from '@/drizzle/schema';
import { inArray } from 'drizzle-orm';

// CUITs of companies that liquidate payroll, in both formats (with and without dashes).
const CUIL_LIST = [
  '30-70792005-6',
  '30707920056',
  '30-71915325-5',
  '30719153255',
  '30-71594402-9',
  '30715944029',
  '20-18095545-4',
  '20180955454',
  '20-34975861-0',
  '20349758610',
  '30-71816139-4',
  '30718161394',
  '30-71755486-4',
  '30717554864',
  '30-71807478-5',
  '30718074785',
  '30-71620640-4',
  '30716206404',
  '30-71613512-4',
  '30716135124',
  '30-71839468-2',
  '30718394682',
  '30-71768056-8',
  '30717680568',
  '30-71852455-1',
  '30718524551',
  '30-71754876-7',
  '30717548767',
  '30-71487108-7',
  '30714871087',
  '33-71800941-9',
  '33718009419',
  '30-71767913-6',
  '30717679136',
  '30-71778698-6',
  '30717786986',
  '30-71910505-6',
  '30719105056',
  '30-71675325-1',
  '30716753251',
  '30-71831051-9',
  '30718310519',
  '20-12757108-3',
  '20127571083',
  '30-71543349-0',
  '30715433490',
  '30-71814987-4',
  '30718149874',
  '30-71487150-8',
  '30714871508',
  '20-30886121-0',
  '20308861210',
  '30-71602575-2',
  '30716025752',
  '30-71678740-7',
  '30716787407',
  '33-71839979-9',
  '33718399799',
  '30-71808420-9',
  '30718084209',
];

async function main() {
  console.log('Setting liquida_sueldos = false for all clients...');
  await db.update(client).set({ liquidaSueldos: false });

  console.log('Setting liquida_sueldos = true for authorized clients...');
  const result = await db
    .update(client)
    .set({ liquidaSueldos: true })
    .where(inArray(client.identityNumber, CUIL_LIST))
    .returning({
      id: client.id,
      name: client.name,
      identityNumber: client.identityNumber,
    });

  console.log(`Updated ${result.length} client(s):`);
  for (const p of result) {
    console.log(`  - ${p.name} (${p.identityNumber})`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
