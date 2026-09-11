/**
 * Resolución de "el cliente que nombró el usuario" → la fila real.
 *
 * El modelo NO transporta UUIDs. Antes sí: el readable global mandaba los
 * `clienteId` y cada tool los recibía como parámetro, y Gemini —que tiene que
 * copiar 36 caracteres sin equivocarse en ninguno— devolvía ids de otra
 * empresa o directamente inventados. El nombre, en cambio, es lo único que el
 * modelo maneja bien, así que las tools reciben nombres y el emparejamiento
 * se hace acá, en código, contra la lista que ya está en caché.
 *
 * El match es por escalones: cuanto más específico coincide, menos candidatos
 * devuelve. Recién si ninguno resuelve a una sola empresa se le pide al
 * usuario que elija.
 */

/** Sufijos societarios: "Produsel S.A." y "produsel" son la misma empresa. */
const SUFIJOS_SOCIETARIOS = new Set([
  'sa',
  'srl',
  'sas',
  'sh',
  'sca',
  'scs',
  'sc',
  'sre',
  'ltda',
  'saic',
  'sacif',
  'saci',
  'scop',
  'coop',
]);

/** Sin acentos, sin mayúsculas, sin puntuación: sólo letras, números y espacios. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Las palabras del nombre, ya sin el sufijo societario. */
function nucleo(texto: string): string[] {
  const tokens = normalizar(texto)
    .split(' ')
    .filter((t) => t.length > 0);

  // "S.A." pierde los puntos al normalizar y llega como dos letras sueltas,
  // así que el sufijo no se reconoce comparando token por token. Se juntan las
  // letras sueltas del final y recién ahí se pregunta si eso es un sufijo:
  // sin esto, "PRODUSEL S.A." no encontraba al cliente llamado "PRODUSEL".
  let corte = tokens.length;
  let cola = '';
  while (corte > 0 && tokens[corte - 1].length === 1) {
    cola = tokens[corte - 1] + cola;
    corte -= 1;
  }
  // `corte > 0` deja afuera el caso de un nombre que es sólo iniciales: ahí no
  // hay sufijo que sacar, es el nombre entero.
  const base =
    corte > 0 && SUFIJOS_SOCIETARIOS.has(cola)
      ? tokens.slice(0, corte)
      : tokens;

  return base.filter((t) => !SUFIJOS_SOCIETARIOS.has(t));
}

/** El núcleo pegado: "e-presis s.a." y "epresis" caen en la misma cadena. */
function compacto(texto: string): string {
  return nucleo(texto).join('');
}

/** Sólo los dígitos: sirve para comparar CUITs escritos con o sin guiones. */
function digitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

export interface ClienteCopilot {
  /** `cliente.id` — la empresa con CUIT propio. */
  id: string;
  razonSocial: string;
  cuit: string;
  /**
   * `credencial_afip.id` del login preferido. Es el parámetro de ruta de
   * `/clients/$clientId`: sin él la ficha no se puede abrir.
   */
  credencialId: string | null;
  /** Nombres de los logins de ARCA por los que se scrapea esta empresa. */
  credenciales: string[];
  /** Si está habilitada para liquidar sueldos. */
  liquidaSueldos: boolean;
}

export type ResolucionCliente =
  | { estado: 'ok'; cliente: ClienteCopilot }
  | { estado: 'ambiguo'; candidatos: ClienteCopilot[] }
  | { estado: 'ninguno' };

/**
 * Busca `consulta` entre `clientes`. Devuelve una empresa sola cuando el
 * escalón que coincidió deja una sola; si deja varias, las devuelve todas
 * para que el asistente pregunte.
 */
export function resolverCliente(
  clientes: ClienteCopilot[],
  consulta: string,
  opciones: { soloSueldos?: boolean } = {}
): ResolucionCliente {
  const universo = opciones.soloSueldos
    ? clientes.filter((c) => c.liquidaSueldos)
    : clientes;
  if (universo.length === 0) return { estado: 'ninguno' };

  const q = normalizar(consulta);
  if (q.length === 0) return { estado: 'ninguno' };

  const qCompacto = compacto(consulta);
  const qDigitos = digitos(consulta);
  const qTokens = nucleo(consulta);

  // 1. CUIT. Es un identificador, no un nombre: si coincide, no hay ambigüedad.
  if (qDigitos.length >= 8) {
    const porCuit = universo.filter((c) => digitos(c.cuit).includes(qDigitos));
    if (porCuit.length === 1) return { estado: 'ok', cliente: porCuit[0] };
    if (porCuit.length > 1) return { estado: 'ambiguo', candidatos: porCuit };
  }

  // 2..4 — el nombre de la empresa, del match más estricto al más laxo.
  const escalones: ((c: ClienteCopilot) => boolean)[] = [
    (c) => compacto(c.razonSocial) === qCompacto,
    (c) => compacto(c.razonSocial).startsWith(qCompacto),
    (c) => compacto(c.razonSocial).includes(qCompacto),
    // Todas las palabras de la consulta aparecen en el nombre, en cualquier
    // orden: "alderete oscar" encuentra "ALDERETE OSCAR SALVADOR".
    (c) => {
      const tokens = nucleo(c.razonSocial);
      return qTokens.every((qt) => tokens.some((t) => t.startsWith(qt)));
    },
  ];

  for (const coincide of escalones) {
    const hallados = universo.filter(coincide);
    if (hallados.length === 1) return { estado: 'ok', cliente: hallados[0] };
    if (hallados.length > 1) return { estado: 'ambiguo', candidatos: hallados };
  }

  // 5. El login de ARCA. El estudio suele llamar al grupo de empresas por el
  //    nombre del titular del login, que no es la razón social de ninguna.
  const porLogin = universo.filter((c) =>
    c.credenciales.some((nombre) => compacto(nombre).includes(qCompacto))
  );
  if (porLogin.length === 1) return { estado: 'ok', cliente: porLogin[0] };
  if (porLogin.length > 1) return { estado: 'ambiguo', candidatos: porLogin };

  return { estado: 'ninguno' };
}

/** "No encontré…" / "Hay varias…", ya redactado para que el modelo lo repita. */
export function mensajeDeFallo(
  resolucion: Exclude<ResolucionCliente, { estado: 'ok' }>,
  consulta: string,
  opciones: { soloSueldos?: boolean } = {}
): string {
  if (resolucion.estado === 'ninguno') {
    return opciones.soloSueldos
      ? `No hay ningún cliente habilitado para sueldos que coincida con "${consulta}". Pedile al usuario el nombre exacto o el CUIT.`
      : `No encontré ningún cliente que coincida con "${consulta}". Pedile al usuario el nombre exacto o el CUIT.`;
  }
  const nombres = resolucion.candidatos
    .slice(0, 8)
    .map((c) => `${c.razonSocial} (CUIT ${c.cuit})`)
    .join(', ');
  const resto =
    resolucion.candidatos.length > 8
      ? ` y ${resolucion.candidatos.length - 8} más`
      : '';
  return `Hay ${resolucion.candidatos.length} clientes que coinciden con "${consulta}": ${nombres}${resto}. Preguntale al usuario cuál de estos quiere y volvé a llamar a la tool con la razón social exacta.`;
}
