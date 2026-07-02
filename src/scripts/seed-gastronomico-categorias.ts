/**
 * Crea/asegura las categorías de Gastronómicos (CCT 389/04) para todos los convenios.
 * Idempotente: upsert por (convenioId, codigo).
 *
 * Formato de codigo: {cat}_{stars}_{letra}_{puesto_normalizado}
 *   Ejemplo: CAT1_1EST_D_Cadete, CAT3_3EST_B_Ayudante_panadero, CAT7_5EST_Jefe_de_brigada
 *   Nota: Cat 7 solo aplica para establecimientos 3★, 4★ y 5★.
 *         Para 5★ no hay letra (ej: 1_5EST_Cadete en lugar de 1_5EST__Cadete).
 *
 * Uso:
 *   bun run src/scripts/seed-gastronomico-categorias.ts
 */
import 'dotenv/config';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payrollConvenio, payrollConvenioCategoria } from '@/drizzle/schema';

const CATEGORIAS = [
  // ── CATEGORÍA 1 — Cadete / Groom / Peón general / Lavacopas / Portería ───────
  { codigo: 'CAT1_1EST_D_Cadete',                 nombre: 'Cadete',                 orden:  1 },
  { codigo: 'CAT1_2EST_C_Cadete',                 nombre: 'Cadete',                 orden:  2 },
  { codigo: 'CAT1_3EST_B_Cadete',                 nombre: 'Cadete',                 orden:  3 },
  { codigo: 'CAT1_4EST_A_Cadete',                 nombre: 'Cadete',                 orden:  4 },
  { codigo: 'CAT1_5EST_Cadete',                   nombre: 'Cadete',                 orden:  5 },

  // ── CATEGORÍA 2 — Montaplatos / Ascensorista / Sereno / Mensajero / Delivery ─
  { codigo: 'CAT2_1EST_D_Montaplatos',            nombre: 'Montaplatos',            orden:  6 },
  { codigo: 'CAT2_2EST_C_Montaplatos',            nombre: 'Montaplatos',            orden:  7 },
  { codigo: 'CAT2_3EST_B_Montaplatos',            nombre: 'Montaplatos',            orden:  8 },
  { codigo: 'CAT2_4EST_A_Montaplatos',            nombre: 'Montaplatos',            orden:  9 },
  { codigo: 'CAT2_5EST_Montaplatos',              nombre: 'Montaplatos',            orden: 10 },

  // ── CATEGORÍA 3 — Ayudante panadero / Barman / Planchadora / Cafetero ────────
  { codigo: 'CAT3_1EST_D_Ayudante_panadero',      nombre: 'Ayudante panadero',      orden: 11 },
  { codigo: 'CAT3_2EST_C_Ayudante_panadero',      nombre: 'Ayudante panadero',      orden: 12 },
  { codigo: 'CAT3_3EST_B_Ayudante_panadero',      nombre: 'Ayudante panadero',      orden: 13 },
  { codigo: 'CAT3_4EST_A_Ayudante_panadero',      nombre: 'Ayudante panadero',      orden: 14 },
  { codigo: 'CAT3_5EST_Ayudante_panadero',        nombre: 'Ayudante panadero',      orden: 15 },

  // ── CATEGORÍA 4 — Medio oficial panadero / Mucama / Valet / Chofer ───────────
  { codigo: 'CAT4_1EST_D_Medio_oficial_panadero', nombre: 'Medio oficial panadero', orden: 16 },
  { codigo: 'CAT4_2EST_C_Medio_oficial_panadero', nombre: 'Medio oficial panadero', orden: 17 },
  { codigo: 'CAT4_3EST_B_Medio_oficial_panadero', nombre: 'Medio oficial panadero', orden: 18 },
  { codigo: 'CAT4_4EST_A_Medio_oficial_panadero', nombre: 'Medio oficial panadero', orden: 19 },
  { codigo: 'CAT4_5EST_Medio_oficial_panadero',   nombre: 'Medio oficial panadero', orden: 20 },

  // ── CATEGORÍA 5 — Comis de Cocina / Cajero / Pastelero / Sandwichero ─────────
  { codigo: 'CAT5_1EST_D_Comis_de_Cocina',        nombre: 'Comis de Cocina',        orden: 21 },
  { codigo: 'CAT5_2EST_C_Comis_de_Cocina',        nombre: 'Comis de Cocina',        orden: 22 },
  { codigo: 'CAT5_3EST_B_Comis_de_Cocina',        nombre: 'Comis de Cocina',        orden: 23 },
  { codigo: 'CAT5_4EST_A_Comis_de_Cocina',        nombre: 'Comis de Cocina',        orden: 24 },
  { codigo: 'CAT5_5EST_Comis_de_Cocina',          nombre: 'Comis de Cocina',        orden: 25 },

  // ── CATEGORÍA 6 — Jefe de Partida / Cocinero / Mozo / Recepcionista ──────────
  { codigo: 'CAT6_1EST_D_Jefe_de_Partida',        nombre: 'Jefe de Partida',        orden: 26 },
  { codigo: 'CAT6_2EST_C_Jefe_de_Partida',        nombre: 'Jefe de Partida',        orden: 27 },
  { codigo: 'CAT6_3EST_B_Jefe_de_Partida',        nombre: 'Jefe de Partida',        orden: 28 },
  { codigo: 'CAT6_4EST_A_Jefe_de_Partida',        nombre: 'Jefe de Partida',        orden: 29 },
  { codigo: 'CAT6_5EST_Jefe_de_Partida',          nombre: 'Jefe de Partida',        orden: 30 },

  // ── CATEGORÍA 7 — Solo 3★/4★/5★ — Jefe de brigada / Maitre / Gobernanta ─────
  { codigo: 'CAT7_3EST_B_Jefe_de_brigada',        nombre: 'Jefe de brigada',        orden: 31 },
  { codigo: 'CAT7_4EST_A_Jefe_de_brigada',        nombre: 'Jefe de brigada',        orden: 32 },
  { codigo: 'CAT7_5EST_Jefe_de_brigada',          nombre: 'Jefe de brigada',        orden: 33 },
];

async function main() {
  const convenios = await db
    .select({ id: payrollConvenio.id })
    .from(payrollConvenio)
    .where(eq(payrollConvenio.cctCodigo, '389/04'));

  if (convenios.length === 0) {
    console.log('No hay convenios CCT 389/04.');
    return;
  }

  const convenioIds = convenios.map((c) => c.id);

  const existentes = await db
    .select({
      convenioId: payrollConvenioCategoria.convenioId,
      codigo: payrollConvenioCategoria.codigo,
    })
    .from(payrollConvenioCategoria)
    .where(inArray(payrollConvenioCategoria.convenioId, convenioIds));

  const existenteSet = new Set(existentes.map((e) => `${e.convenioId}:${e.codigo}`));

  const toInsert = [];
  for (const conv of convenios) {
    for (const cat of CATEGORIAS) {
      if (existenteSet.has(`${conv.id}:${cat.codigo}`)) continue;
      toInsert.push({
        convenioId: conv.id,
        codigo: cat.codigo,
        nombre: cat.nombre,
        orden: cat.orden,
      });
    }
  }

  let insertadas = 0;
  if (toInsert.length > 0) {
    await db.insert(payrollConvenioCategoria).values(toInsert);
    insertadas = toInsert.length;
  }

  console.log(
    `[ok] Convenios: ${convenios.length} | Categorías insertadas: ${insertadas} | Ya existían: ${existentes.length}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
