/**
 * CUITs escritos en la descripción de un movimiento bancario.
 *
 * Muchos bancos ponen el CUIT del ordenante o del destinatario en el texto
 * ("TRANSFERENCIA 30697293287", "TRANSFERENCIA INMEDIATA COE 30718075099").
 * Es la forma más confiable que tenemos de saber con quién fue el movimiento:
 * la extracción del PDF no trae la contraparte como dato aparte.
 *
 * Solo lectura de texto, sin base de datos: quien llama decide qué hacer con
 * cada CUIT (buscarlo en el padrón, descartar el de la propia empresa).
 */

/** Prefijos de CUIT/CUIL: personas (20, 23, 24, 27) y empresas (30, 33, 34). */
const PREFIJOS = new Set(['20', '23', '24', '27', '30', '33', '34']);
const PREFIJOS_PERSONA = new Set(['20', '23', '24', '27']);
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Prefijo conocido y dígito verificador (módulo 11) correcto. */
export function cuitValido(cuit: string): boolean {
  if (!/^\d{11}$/.test(cuit) || !PREFIJOS.has(cuit.slice(0, 2))) return false;
  const suma = PESOS.reduce((acc, p, i) => acc + p * Number(cuit[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv === Number(cuit[10]);
}

export interface CuitEncontrado {
  cuit: string;
  /**
   * `true` si el CUIT está solo (11 dígitos entre separadores). `false` si son
   * los primeros 11 dígitos de un número más largo ("30714292141035453609"):
   * ahí puede ser casualidad, así que quien llama debe pedir más evidencia.
   */
  suelto: boolean;
}

/**
 * Los CUITs válidos de la descripción, en orden de aparición y sin repetir.
 * Primero los sueltos, que son los confiables.
 */
export function cuitsEnDescripcion(
  descripcion: string | null | undefined
): CuitEncontrado[] {
  if (!descripcion) return [];
  const sueltos: CuitEncontrado[] = [];
  const pegados: CuitEncontrado[] = [];
  const vistos = new Set<string>();

  for (const [corrida] of descripcion.matchAll(/\d+/g)) {
    if (corrida.length < 11) continue;
    const cuit = corrida.slice(0, 11);
    if (vistos.has(cuit) || !cuitValido(cuit)) continue;
    vistos.add(cuit);
    (corrida.length === 11 ? sueltos : pegados).push({
      cuit,
      suelto: corrida.length === 11,
    });
  }
  return [...sueltos, ...pegados];
}

/**
 * El DNI dentro de un CUIT de persona (los 8 dígitos del medio), o null si es
 * de empresa. Las ventas a consumidor final suelen identificar al comprador
 * por DNI, así que es la forma de encontrarlo en el padrón.
 */
export function dniDeCuit(cuit: string): string | null {
  if (!PREFIJOS_PERSONA.has(cuit.slice(0, 2))) return null;
  return String(Number(cuit.slice(2, 10)));
}

/** 30697293287 → 30-69729328-7 */
export function formatearCuit(cuit: string): string {
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}
