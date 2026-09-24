/**
 * Re-aplica sobre BD_IDEAL las correcciones manuales que viven SOLO en NEW_DB.
 *
 * Contexto (plan de cutover, paso 15/27): el 30/07 se desarmaron los clientes
 * "espejo" y se cargaron a mano en NEW_DB altas que nunca llegaron a
 * producción. Como el ETL final lee de producción, esas altas se pierden — y
 * este script las trae de vuelta desde NEW_DB, traducidas al modelo ideal con
 * el mismo mapeo del ETL D1/D3.
 *
 * Qué trae (detectado dinámicamente por CUIT, no hardcodeado):
 *  - clientes de NEW_DB cuyo CUIT no existe en `cliente` del destino
 *  - las credenciales de AFIP que esos clientes referencian y falten
 *  - sus vínculos `cliente_credencial`
 *  - presentaciones de LSD de NEW_DB que falten (por id) y cuyo cliente exista
 *
 * Idempotente: detecta por CUIT/id, correrlo dos veces no duplica.
 * Solo INSERTA — nunca pisa una fila existente en el destino.
 *
 * Uso:
 *   DATABASE_URL="$STAGING_DATABASE_URL" \
 *   IDEAL_DATABASE_URL="postgres://...destino local..." \
 *     bun src/scripts/ideal/aplicar-correcciones-newdb.ts [--apply]
 *
 * Sin --apply es dry-run: lista lo que haría y no escribe nada.
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');

const SRC_URL = process.env.DATABASE_URL;
if (!SRC_URL) throw new Error('Falta DATABASE_URL (la fuente: NEW_DB)');
if (SRC_URL.includes('5.78.132.83')) throw new Error('ORIGINAL_DB prohibida');
if (SRC_URL.includes('localhost') || SRC_URL.includes('127.0.0.1'))
  throw new Error(
    'DATABASE_URL debe ser NEW_DB (la fuente de las correcciones), no una base local'
  );

const IDEAL_URL =
  process.env.IDEAL_DATABASE_URL ??
  'postgres://arca:arca@localhost:5460/arca_ideal';
if (!IDEAL_URL.includes('localhost') && !IDEAL_URL.includes('127.0.0.1')) {
  throw new Error('BD_IDEAL debe ser local');
}

const src = postgres(SRC_URL, { max: 1, prepare: false });
const dst = postgres(IDEAL_URL, { max: 1 });

type Row = Record<string, any>;
const norm = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const CUIT_RE = /^(20|23|24|27|30|33|34)\d{9}$/;

/** Mismo criterio que el ETL D1. */
const tipoPersonaFromCuit = (cuit: string): string =>
  /^(30|33|34)/.test(norm(cuit)) ? 'juridica' : 'fisica';

// ── 1. Diagnóstico: qué falta en el destino ──────────────────────────────

const dstClientes = await dst`select cuit from cliente`;
const dstCredsRows = await dst`select id, cuit from credencial_afip`;
const dstCuits = new Set(dstClientes.map((c) => norm(c.cuit)));
const dstCredByCuit = new Map(dstCredsRows.map((c) => [norm(c.cuit), c.id]));

const srcClients = (await src.unsafe(
  `select c.*, r.cuit rep_cuit, r.convenio_multilateral, r.regimen_local
   from client c left join representative r on r.id = c.representative_id`
)) as unknown as Row[];

const faltantes = srcClients.filter(
  (c) => CUIT_RE.test(norm(c.identity_number)) && !dstCuits.has(norm(c.identity_number))
);

console.log(`clientes de NEW_DB ausentes en el destino: ${faltantes.length}`);
for (const c of faltantes) console.log(`  · ${c.name} (${c.identity_number})`);

// Credenciales que esos clientes referencian y el destino no tiene.
const repIds = [...new Set(faltantes.map((c) => c.representative_id).filter(Boolean))];
const srcReps = repIds.length
  ? ((await src.unsafe(`select * from representative where id = any($1)`, [repIds])) as unknown as Row[])
  : [];
const repsFaltantes = srcReps.filter((r) => !dstCredByCuit.has(norm(r.cuit)));

console.log(`credenciales a crear: ${repsFaltantes.length}`);
for (const r of repsFaltantes) console.log(`  · ${r.name ?? '(sin nombre)'} (${r.cuit})`);

// LSD que falten por id, con cliente presente en destino (o entre los que vamos a crear).
const dstLsd = await dst`select id from lsd_presentacion`;
const dstLsdIds = new Set(dstLsd.map((x) => x.id));
const dstClienteIds = new Set(
  (await dst`select id from cliente`).map((x) => x.id as string)
);
const nuevosClienteIds = new Set(faltantes.map((c) => c.id as string));
const srcLsd = (await src.unsafe(`select * from payroll_lsd_presentacion`)) as unknown as Row[];
const lsdFaltantes = srcLsd.filter(
  (x) =>
    !dstLsdIds.has(x.id) &&
    (dstClienteIds.has(x.profile_id) || nuevosClienteIds.has(x.profile_id))
);
console.log(`presentaciones LSD a crear: ${lsdFaltantes.length}`);
for (const x of lsdFaltantes)
  console.log(`  · ${x.filename} (periodo ${x.periodo}, ${x.empleados} empleados)`);

if (!APPLY) {
  console.log('\nDRY-RUN: no se escribió nada. Correr con --apply.');
  await Promise.all([src.end(), dst.end()]);
  process.exit(0);
}

if (faltantes.length === 0 && repsFaltantes.length === 0 && lsdFaltantes.length === 0) {
  console.log('\nNada que aplicar: el destino ya tiene todo.');
  await Promise.all([src.end(), dst.end()]);
  process.exit(0);
}

// ── 2. Aplicar, en una transacción ───────────────────────────────────────

const CONDICION_IVA = ['responsable_inscripto', 'monotributista', 'exento', 'no_alcanzado'];

await dst.begin(async (tx) => {
  // 2a. credenciales (mapeo idéntico al ETL D1)
  for (const r of repsFaltantes) {
    if (r.status !== 'active')
      throw new Error(`representative.status no mapeado: ${r.status} (${r.cuit})`);
    await tx`insert into credencial_afip ${tx({
      id: r.id,
      org_id: r.organization_id,
      cuit: r.cuit,
      clave: r.afip_password,
      nombre: r.name || null,
      email: r.email || null,
      telefono: r.phone || null,
      estado: 'activa',
      ultimo_login_ok: null,
      verificada_at: null,
      created_at: r.registered_at ?? r.created_at,
      updated_at: r.updated_at,
    })}`;
    dstCredByCuit.set(norm(r.cuit), r.id);
  }

  // 2b. clientes (mapeo idéntico al ETL D1)
  for (const c of faltantes) {
    const condicion = (c.fiscal_condition as string | null) ?? null;
    if (condicion !== null && !CONDICION_IVA.includes(condicion))
      throw new Error(`client.fiscal_condition no mapeada: ${condicion}`);
    const iibb = c.convenio_multilateral
      ? 'convenio_multilateral'
      : c.regimen_local
        ? 'local'
        : null;
    await tx`insert into cliente ${tx({
      id: c.id,
      org_id: c.organization_id ?? 'org_estudio_blakg',
      cuit: c.identity_number,
      razon_social: c.name,
      tipo_persona: tipoPersonaFromCuit(c.identity_number),
      condicion_iva: condicion,
      iibb_regimen: iibb,
      estado: c.disabled_at ? 'baja' : 'activo',
      baja_motivo: c.disabled_reason ?? null,
      baja_at: c.disabled_at ?? null,
      email: c.email || null,
      telefono: c.phone || null,
      domicilio: c.address || null,
      notas: null,
      created_at: c.created_at,
      updated_at: c.updated_at,
    })}`;

    // 2c. vínculo con su credencial. Se resuelve por CUIT contra el destino:
    // la credencial puede haber llegado por el ETL con otra procedencia.
    const repCuit = norm(c.rep_cuit);
    const credencialId = dstCredByCuit.get(repCuit);
    if (!credencialId) {
      throw new Error(
        `cliente ${c.name}: su credencial (${c.rep_cuit}) no está en el destino ni entre las nuevas`
      );
    }
    await tx`insert into cliente_credencial ${tx({
      cliente_id: c.id,
      credencial_id: credencialId,
      fuente: 'discovery',
      afip_contribuyente_id: c.afip_contribuyente_id ?? null,
      preferida: true,
    })}`;
  }

  // 2d. LSD (mapeo idéntico al ETL D3)
  for (const x of lsdFaltantes) {
    const [org] = await tx`select org_id from cliente where id = ${x.profile_id}`;
    if (!org) throw new Error(`lsd ${x.id}: cliente ${x.profile_id} no está en destino`);
    const periodoDate = `${x.periodo}-01`;
    await tx`insert into lsd_presentacion ${tx({
      id: x.id,
      org_id: org.org_id,
      cliente_id: x.profile_id,
      periodo: periodoDate,
      numero: x.nro_presentacion,
      filename: x.filename,
      empleados: x.empleados,
      conceptos: x.conceptos,
      contenido: x.contenido,
      generado_at: x.generado_en,
      created_at: x.created_at,
      updated_at: x.updated_at,
    })}`;
  }
});

console.log(
  `\n✓ Aplicado: ${repsFaltantes.length} credenciales, ${faltantes.length} clientes, ${lsdFaltantes.length} LSD.`
);
await Promise.all([src.end(), dst.end()]);
