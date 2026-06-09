/**
 * Migración: payroll_convenio.client_id → profile_id
 *
 * Pasos:
 * 1. Agrega columna profile_id (nullable) a payroll_convenio
 * 2. Para convenios con empleados de UN solo profile → asigna ese profile
 * 3. Para convenios ambiguos (empleados de 2+ profiles) → duplica el convenio
 *    y reasigna empleados al convenio correspondiente
 * 4. Para convenios sin empleados → asigna el profile con liquida_sueldos=true
 *    del cliente (si hay exactamente uno) o el primero disponible
 * 5. Hace NOT NULL la columna
 *
 * Uso: bun run src/scripts/migrate-convenio-client-to-profile.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  connect_timeout: 30,
  idle_timeout: 5,
});

async function main() {
  // ── Paso 1: Agregar columna profile_id si no existe ─────────────────────────
  await sql`
    ALTER TABLE payroll_convenio
    ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES profile(id) ON DELETE CASCADE
  `;
  console.log('[1/5] Columna profile_id agregada (nullable).');

  // ── Paso 2: Convenios con empleados de un solo profile ───────────────────────
  const conveniosUnProfile = await sql`
    SELECT pc.id as convenio_id, MIN(e.profile_id::text)::uuid as profile_id
    FROM payroll_convenio pc
    JOIN liquidacion_import_empleado e ON e.convenio_id = pc.id
    WHERE pc.profile_id IS NULL
    GROUP BY pc.id
    HAVING COUNT(DISTINCT e.profile_id) = 1
  `;

  for (const r of conveniosUnProfile) {
    await sql`
      UPDATE payroll_convenio SET profile_id = ${r.profile_id} WHERE id = ${r.convenio_id}
    `;
  }
  console.log(`[2/5] ${conveniosUnProfile.length} convenios (un profile) asignados.`);

  // ── Paso 3: Convenios ambiguos (empleados de 2+ profiles) → duplicar ─────────
  const conveniosAmbiguos = await sql`
    SELECT pc.id as convenio_id, pc.client_id, pc.nombre, pc.cct_codigo,
           pc.descripcion, pc.activo, e.profile_id
    FROM payroll_convenio pc
    JOIN liquidacion_import_empleado e ON e.convenio_id = pc.id
    WHERE pc.profile_id IS NULL
    GROUP BY pc.id, pc.client_id, pc.nombre, pc.cct_codigo, pc.descripcion, pc.activo, e.profile_id
    HAVING COUNT(DISTINCT e.profile_id) >= 1
    ORDER BY pc.id, e.profile_id
  `;

  // Agrupar por convenio_id
  const ambiguosMap = new Map<string, { convenio_id: string; client_id: string; nombre: string; cct_codigo: string; descripcion: string | null; activo: boolean; profiles: string[] }>();
  for (const r of conveniosAmbiguos) {
    if (!ambiguosMap.has(r.convenio_id)) {
      ambiguosMap.set(r.convenio_id, { ...r, profiles: [] });
    }
    ambiguosMap.get(r.convenio_id)!.profiles.push(r.profile_id);
  }

  let duplicados = 0;
  for (const [convenioId, conv] of ambiguosMap) {
    if (conv.profiles.length <= 1) continue;

    // El primer profile se queda con el convenio original
    const [primerProfile, ...restProfiles] = conv.profiles;
    await sql`UPDATE payroll_convenio SET profile_id = ${primerProfile} WHERE id = ${convenioId}`;

    // Los demás profiles reciben un nuevo convenio duplicado
    for (const profileId of restProfiles) {
      const [nuevoCon] = await sql`
        INSERT INTO payroll_convenio (client_id, profile_id, nombre, cct_codigo, descripcion, activo)
        VALUES (${conv.client_id}, ${profileId}, ${conv.nombre}, ${conv.cct_codigo}, ${conv.descripcion}, ${conv.activo})
        RETURNING id
      `;
      // Reasignar empleados de ese profile al nuevo convenio
      await sql`
        UPDATE liquidacion_import_empleado
        SET convenio_id = ${nuevoCon.id}
        WHERE convenio_id = ${convenioId} AND profile_id = ${profileId}
      `;

      // Copiar categorías y escalas al nuevo convenio
      const categorias = await sql`
        SELECT codigo, nombre, orden FROM payroll_convenio_categoria WHERE convenio_id = ${convenioId}
      `;
      for (const cat of categorias) {
        const [nuevaCat] = await sql`
          INSERT INTO payroll_convenio_categoria (convenio_id, codigo, nombre, orden)
          VALUES (${nuevoCon.id}, ${cat.codigo}, ${cat.nombre}, ${cat.orden})
          RETURNING id
        `;
        // Copiar escalas
        const escalasOrig = await sql`
          SELECT pe.vigencia_desde, pe.vigencia_hasta, pe.monto_basico,
                 pe.monto_no_remunerativo, pe.periodo_label, pe.fuente
          FROM payroll_escala pe
          JOIN payroll_convenio_categoria pcc ON pcc.id = pe.categoria_id
          WHERE pcc.convenio_id = ${convenioId} AND pcc.codigo = ${cat.codigo}
        `;
        for (const esc of escalasOrig) {
          await sql`
            INSERT INTO payroll_escala (categoria_id, vigencia_desde, vigencia_hasta,
              monto_basico, monto_no_remunerativo, periodo_label, fuente)
            VALUES (${nuevaCat.id}, ${esc.vigencia_desde}, ${esc.vigencia_hasta},
              ${esc.monto_basico}, ${esc.monto_no_remunerativo}, ${esc.periodo_label}, ${esc.fuente})
          `;
        }
      }
      duplicados++;
      console.log(`  Duplicado convenio ${conv.nombre} (${conv.cct_codigo}) para profile ${profileId}`);
    }
  }
  console.log(`[3/5] ${duplicados} convenios duplicados para profiles adicionales.`);

  // ── Paso 4: Convenios sin empleados → asignar profile con liquida_sueldos ────
  const sinProfile = await sql`
    SELECT pc.id as convenio_id, pc.client_id
    FROM payroll_convenio pc
    WHERE pc.profile_id IS NULL
  `;

  let asignados = 0;
  let sinAsignar = 0;
  for (const r of sinProfile) {
    // Buscar profiles del cliente, priorizando los que liquidan sueldos
    const profiles = await sql`
      SELECT id FROM profile
      WHERE client_id = ${r.client_id}
      ORDER BY liquida_sueldos DESC, created_at ASC
      LIMIT 1
    `;
    if (profiles.length > 0) {
      await sql`UPDATE payroll_convenio SET profile_id = ${profiles[0].id} WHERE id = ${r.convenio_id}`;
      asignados++;
    } else {
      sinAsignar++;
      console.log(`  ⚠️  Convenio ${r.convenio_id} sin profile en cliente ${r.client_id}`);
    }
  }
  console.log(`[4/5] ${asignados} convenios sin empleados asignados. Sin asignar: ${sinAsignar}`);

  // ── Paso 5: Hacer NOT NULL ────────────────────────────────────────────────────
  const pendientes = await sql`SELECT COUNT(*) as n FROM payroll_convenio WHERE profile_id IS NULL`;
  if (Number(pendientes[0].n) > 0) {
    console.log(`  ⚠️  Aún hay ${pendientes[0].n} convenios sin profile_id. No se aplica NOT NULL.`);
  } else {
    await sql`ALTER TABLE payroll_convenio ALTER COLUMN profile_id SET NOT NULL`;
    console.log('[5/5] profile_id marcado NOT NULL. ✓');
  }

  // ── Resumen final ─────────────────────────────────────────────────────────────
  const total = await sql`SELECT COUNT(*) as n FROM payroll_convenio`;
  console.log(`\n[ok] Migración completa. Total convenios: ${total[0].n}`);
}

main()
  .then(() => { sql.end(); process.exit(0); })
  .catch(e => { console.error(e); sql.end(); process.exit(1); });
