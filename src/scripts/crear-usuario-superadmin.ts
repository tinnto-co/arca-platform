/**
 * Alta de un usuario por línea de comandos (vía Better Auth, password bien
 * hasheada) y designación como superadmin. Para bootstrap de cuentas del
 * equipo — no reemplaza al registro normal.
 *
 * Uso: bun src/scripts/crear-usuario-superadmin.ts <email> <nombre>
 * Imprime una contraseña generada — cambiarla al primer login.
 */
import { randomBytes } from 'node:crypto';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { user } from '@/drizzle/auth';
import { eq } from 'drizzle-orm';

const email = process.argv[2];
const nombre = process.argv.slice(3).join(' ') || 'Superadmin';
if (!email?.includes('@')) {
  console.error('Uso: bun src/scripts/crear-usuario-superadmin.ts <email> <nombre>');
  process.exit(1);
}

const password = randomBytes(9).toString('base64url');

const res = await auth.api.signUpEmail({
  body: { email, password, name: nombre },
});
if (!res?.user?.id) {
  console.error('No se pudo crear el usuario (¿ya existe?)');
  process.exit(1);
}

await db.update(user).set({ role: 'admin' }).where(eq(user.id, res.user.id));

console.log(`✓ Usuario creado y designado superadmin`);
console.log(`  email:    ${email}`);
console.log(`  password: ${password}  ← cambiala al entrar`);
