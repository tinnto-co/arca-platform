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

/** Si este rol es un acceso de soporte de la plataforma. */
export function esAccesoDeSoporte(rol: string | null | undefined) {
  return rol === ROL_SOPORTE;
}

/**
 * Manda en el estudio: el dueño, o alguien de Orddo entrando como soporte.
 *
 * Existe para que la pregunta se haga en un solo lugar. Comparar contra
 * `'owner'` a mano dejó al acceso de soporte a mitad de camino —podía
 * administrar el estudio y borrar clientes, pero no tocar el plan de cuentas—
 * porque cada pantalla se acordó del rol nuevo por su cuenta, o no.
 *
 * El soporte vale lo mismo que el dueño a propósito: entra a configurar un
 * estudio nuevo o a destrabar algo, y un acceso que mira sin poder tocar no
 * sirve para ninguna de las dos cosas. Lo que lo hace aceptable no es
 * limitarlo, sino que quede registrado: ver `superadmin_acceso`.
 */
export function mandaEnElEstudio(rol: string | null | undefined) {
  return rol === 'owner' || rol === ROL_SOPORTE;
}

export { ac, owner, member, viewer };
