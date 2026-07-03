/**
 * Inserta las categorías de Gastronómicos (CCT 389/04) en la tabla empleados_categorias.
 * Idempotente: ON CONFLICT DO UPDATE.
 *
 * Uso:
 *   bun run src/scripts/seed-empleados-categorias-gastronomico.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  connect_timeout: 30,
  idle_timeout: 5,
});

const FUENTE = 'https://estudiovilaplana.com.ar/sueldos-gastronomicos/';

const CATEGORIAS = [
  { codigo: 'CAT1_1EST_D_Cadete',                 nombre: 'Cadete'                 },
  { codigo: 'CAT1_2EST_C_Cadete',                 nombre: 'Cadete'                 },
  { codigo: 'CAT1_3EST_B_Cadete',                 nombre: 'Cadete'                 },
  { codigo: 'CAT1_4EST_A_Cadete',                 nombre: 'Cadete'                 },
  { codigo: 'CAT1_5EST_Cadete',                   nombre: 'Cadete'                 },
  { codigo: 'CAT2_1EST_D_Montaplatos',            nombre: 'Montaplatos'            },
  { codigo: 'CAT2_2EST_C_Montaplatos',            nombre: 'Montaplatos'            },
  { codigo: 'CAT2_3EST_B_Montaplatos',            nombre: 'Montaplatos'            },
  { codigo: 'CAT2_4EST_A_Montaplatos',            nombre: 'Montaplatos'            },
  { codigo: 'CAT2_5EST_Montaplatos',              nombre: 'Montaplatos'            },
  { codigo: 'CAT3_1EST_D_Ayudante_panadero',      nombre: 'Ayudante panadero'      },
  { codigo: 'CAT3_2EST_C_Ayudante_panadero',      nombre: 'Ayudante panadero'      },
  { codigo: 'CAT3_3EST_B_Ayudante_panadero',      nombre: 'Ayudante panadero'      },
  { codigo: 'CAT3_4EST_A_Ayudante_panadero',      nombre: 'Ayudante panadero'      },
  { codigo: 'CAT3_5EST_Ayudante_panadero',        nombre: 'Ayudante panadero'      },
  { codigo: 'CAT4_1EST_D_Medio_oficial_panadero', nombre: 'Medio oficial panadero' },
  { codigo: 'CAT4_2EST_C_Medio_oficial_panadero', nombre: 'Medio oficial panadero' },
  { codigo: 'CAT4_3EST_B_Medio_oficial_panadero', nombre: 'Medio oficial panadero' },
  { codigo: 'CAT4_4EST_A_Medio_oficial_panadero', nombre: 'Medio oficial panadero' },
  { codigo: 'CAT4_5EST_Medio_oficial_panadero',   nombre: 'Medio oficial panadero' },
  { codigo: 'CAT5_1EST_D_Comis_de_Cocina',        nombre: 'Comis de Cocina'        },
  { codigo: 'CAT5_2EST_C_Comis_de_Cocina',        nombre: 'Comis de Cocina'        },
  { codigo: 'CAT5_3EST_B_Comis_de_Cocina',        nombre: 'Comis de Cocina'        },
  { codigo: 'CAT5_4EST_A_Comis_de_Cocina',        nombre: 'Comis de Cocina'        },
  { codigo: 'CAT5_5EST_Comis_de_Cocina',          nombre: 'Comis de Cocina'        },
  { codigo: 'CAT6_1EST_D_Jefe_de_Partida',        nombre: 'Jefe de Partida'        },
  { codigo: 'CAT6_2EST_C_Jefe_de_Partida',        nombre: 'Jefe de Partida'        },
  { codigo: 'CAT6_3EST_B_Jefe_de_Partida',        nombre: 'Jefe de Partida'        },
  { codigo: 'CAT6_4EST_A_Jefe_de_Partida',        nombre: 'Jefe de Partida'        },
  { codigo: 'CAT6_5EST_Jefe_de_Partida',          nombre: 'Jefe de Partida'        },
  { codigo: 'CAT7_3EST_B_Jefe_de_brigada',        nombre: 'Jefe de brigada'        },
  { codigo: 'CAT7_4EST_A_Jefe_de_brigada',        nombre: 'Jefe de brigada'        },
  { codigo: 'CAT7_5EST_Jefe_de_brigada',          nombre: 'Jefe de brigada'        },
];

async function main() {
  for (const c of CATEGORIAS) {
    await sql`
      INSERT INTO empleados_categorias (codigo, nombre, cct_codigo, fuente)
      VALUES (${c.codigo}, ${c.nombre}, '389/04', ${FUENTE})
      ON CONFLICT (codigo, cct_codigo) DO UPDATE
        SET nombre = EXCLUDED.nombre, fuente = EXCLUDED.fuente
    `;
  }
  console.log(`[ok] ${CATEGORIAS.length} categorías Gastronómicos 389/04 insertadas en empleados_categorias.`);
}

main()
  .then(() => { sql.end(); process.exit(0); })
  .catch(e => { console.error(e); sql.end(); process.exit(1); });
