/**
 * Crea el usuario de PostgreSQL de solo lectura para el agente AI.
 * Solo necesita ejecutarse una vez por entorno (dev, staging, prod).
 *
 * Uso:
 *   bun run src/scripts/setup-readonly-user.ts
 *
 * Requiere:
 *   DATABASE_URL     — conexión con usuario admin (para crear el usuario)
 *   READONLY_PASSWORD — contraseña para el nuevo usuario arca_readonly
 */
import 'dotenv/config';
import postgres from 'postgres';

const READONLY_USER = 'arca_readonly';
const password = process.env.READONLY_PASSWORD;

if (!password) {
  console.error('❌  Falta la variable de entorno READONLY_PASSWORD');
  console.error('    Ejemplo: READONLY_PASSWORD=mi_password bun run src/scripts/setup-readonly-user.ts');
  process.exit(1);
}

// Extraer el nombre de la DB de DATABASE_URL
const dbUrl = process.env.DATABASE_URL!;
const dbName = new URL(dbUrl).pathname.replace('/', '');

const sql = postgres(dbUrl, { prepare: false });

async function main() {
  console.log(`📋 Configurando usuario readonly en base de datos: ${dbName}`);

  // 1. Crear usuario (si ya existe, no falla)
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${READONLY_USER}') THEN
        CREATE USER ${READONLY_USER} WITH PASSWORD '${password}';
        RAISE NOTICE 'Usuario ${READONLY_USER} creado.';
      ELSE
        ALTER USER ${READONLY_USER} WITH PASSWORD '${password}';
        RAISE NOTICE 'Usuario ${READONLY_USER} ya existía — se actualizó la contraseña.';
      END IF;
    END
    $$;
  `);
  console.log('✅  Usuario creado / contraseña actualizada');

  // 2. Permisos de conexión y schema
  await sql.unsafe(`GRANT CONNECT ON DATABASE "${dbName}" TO ${READONLY_USER};`);
  await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${READONLY_USER};`);
  console.log('✅  Permisos de conexión y schema otorgados');

  // 3. SELECT sobre todas las tablas existentes
  await sql.unsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${READONLY_USER};`);
  console.log('✅  SELECT otorgado en tablas existentes');

  // 4. SELECT automático en tablas futuras (migraciones nuevas)
  await sql.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${READONLY_USER};`);
  console.log('✅  Privilegios por defecto configurados para tablas futuras');

  // 5. Construir y mostrar la DATABASE_READONLY_URL
  const parsed = new URL(dbUrl);
  parsed.username = READONLY_USER;
  parsed.password = password!;
  const readonlyUrl = parsed.toString();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Agregá esta variable a tu .env y a las variables de entorno de producción:');
  console.log('');
  console.log(`DATABASE_READONLY_URL=${readonlyUrl}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await sql.end();
}

main().catch((err) => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});
