/**
 * Designa (o revoca) un superadmin: user.role = 'admin' del plugin admin de
 * Better Auth. Es un rol de USUARIO, por encima de los roles por organización.
 * No hay UI de auto-promoción a propósito: el primer superadmin se designa
 * por acá, con acceso a la base.
 *
 * Uso:
 *   DATABASE_URL=... bun src/scripts/hacer-superadmin.ts <email> [--revocar] [--apply]
 *
 * Dry-run por defecto: muestra a quién tocaría y sale.
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const REVOCAR = process.argv.includes('--revocar');
const email = process.argv.find((a) => a.includes('@'));

if (!email) {
  console.error(
    'Uso: bun src/scripts/hacer-superadmin.ts <email> [--revocar] [--apply]'
  );
  process.exit(1);
}

const URL = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;
if (!URL) {
  console.error('Falta MIGRATION_URL (o DATABASE_URL).');
  process.exit(1);
}

const sql = postgres(URL, { max: 1 });

const [quien] = await sql`
  select current_user as usuario, current_database() as base`;
console.log(`\nBase: ${quien.base} — conectado como ${quien.usuario}`);
console.log(APPLY ? 'Modo: APLICAR' : 'Modo: dry-run');

const [usuario] = await sql`
  select id, name, email, role from "user" where email = ${email} limit 1`;

if (!usuario) {
  console.error(`\n✗ No hay usuario con email ${email}.\n`);
  await sql.end();
  process.exit(1);
}

const rolNuevo: string | null = REVOCAR ? null : 'admin';
console.log(
  `\n  ${usuario.name} <${usuario.email}> — rol actual: ${usuario.role ?? '(ninguno)'} → ${rolNuevo ?? '(ninguno)'}`
);

if (!APPLY) {
  console.log('\nCon --apply se aplica el cambio.\n');
  await sql.end();
  process.exit(0);
}

await sql`update "user" set role = ${rolNuevo} where id = ${String(usuario.id)}`;
console.log(
  REVOCAR
    ? '\n✓ Superadmin revocado. El cambio se ve al renovar la sesión (logout/login).\n'
    : '\n✓ Superadmin designado. El cambio se ve al renovar la sesión (logout/login).\n'
);
await sql.end();
