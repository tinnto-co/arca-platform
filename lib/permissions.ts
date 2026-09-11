import { createAccessControl } from 'better-auth/plugins/access';
import {
  defaultStatements,
  ownerAc,
} from 'better-auth/plugins/organization/access';

const statement = {
  ...defaultStatements,
  client: ['create', 'read', 'update', 'delete'],
  job: ['create', 'read'],
  invoice: ['read'],
  notification: ['read', 'update'],
} as const;

const ac = createAccessControl(statement);

const owner = ac.newRole({
  client: ['create', 'read', 'update', 'delete'],
  job: ['create', 'read'],
  invoice: ['read'],
  notification: ['read', 'update'],
  ...ownerAc.statements,
});

const member = ac.newRole({
  client: ['create', 'read', 'update', 'delete'],
  job: ['create', 'read'],
  invoice: ['read'],
  notification: ['read', 'update'],
});

const viewer = ac.newRole({
  client: ['read'],
  job: ['read'],
  invoice: ['read'],
  notification: ['read'],
});

/**
 * Rol con el que el superadmin entra a un estudio que no es suyo.
 *
 * No es un rol de la organización: es una marca de acceso de soporte. Se usa
 * para que el estudio no lo vea entre sus miembros ni lo cuente en su total,
 * y para poder revocarlo de un saque al salir. Better Auth exige una fila en
 * `member` antes de dejar fijar la organización activa —y la sesión vive en
 * una cookie firmada que sólo su endpoint sabe refrescar—, así que el acceso
 * tiene que pasar por ahí; lo que sí está en nuestras manos es que no se
 * confunda con una membresía real.
 */
export const ROL_SOPORTE = 'superadmin';

/** Puede hacer lo que un owner: es la superadmin dando de alta o asistiendo. */
export function esAccesoDeSoporte(rol: string | null | undefined) {
  return rol === ROL_SOPORTE;
}

export { ac, owner, member, viewer };
