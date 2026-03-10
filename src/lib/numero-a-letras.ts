/**
 * Convierte un monto numérico a texto en español (Argentina).
 * Ej: 350000.5 → "trescientos cincuenta mil pesos con 50/100"
 */

const UNIDADES = [
  "",
  "un",
  "dos",
  "tres",
  "cuatro",
  "cinco",
  "seis",
  "siete",
  "ocho",
  "nueve",
];
const DECENAS_ESPECIALES = [
  "diez",
  "once",
  "doce",
  "trece",
  "catorce",
  "quince",
  "dieciséis",
  "diecisiete",
  "dieciocho",
  "diecinueve",
];
const DECENAS = [
  "",
  "",
  "veinte",
  "treinta",
  "cuarenta",
  "cincuenta",
  "sesenta",
  "setenta",
  "ochenta",
  "noventa",
];
const CENTENAS = [
  "",
  "ciento",
  "doscientos",
  "trescientos",
  "cuatrocientos",
  "quinientos",
  "seiscientos",
  "setecientos",
  "ochocientos",
  "novecientos",
];

function convertirGrupo(n: number): string {
  if (n === 0) return "";
  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;
  let s = CENTENAS[c];
  if (d === 1) {
    s += (s ? " " : "") + DECENAS_ESPECIALES[u];
    return s.trim();
  }
  if (d >= 2) {
    if (d === 2 && u > 0) {
      s += (s ? " " : "") + "veinti" + (u === 1 ? "ún" : UNIDADES[u]);
    } else {
      s += (s ? " " : "") + DECENAS[d];
      if (u > 0) s += " y " + (u === 1 ? "uno" : UNIDADES[u]);
    }
  } else if (u > 0) {
    s += (s ? " " : "") + (u === 1 ? "uno" : UNIDADES[u]);
  }
  return s.trim();
}

/**
 * Convierte la parte entera del monto (0 a 999.999.999) a letras.
 */
function parteEnteraALetras(n: number): string {
  if (n === 0) return "cero";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const unidades = n % 1000;
  const partes: string[] = [];
  if (millones > 0) {
    partes.push(
      millones === 1 ? "un millón" : `${convertirGrupo(millones)} millones`
    );
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "mil" : `${convertirGrupo(miles)} mil`);
  }
  if (unidades > 0 || partes.length === 0) {
    partes.push(convertirGrupo(unidades));
  }
  return partes.join(" ");
}

/**
 * Devuelve el monto en lenguaje coloquial para Argentina.
 * Ej: montoEnLetras(350000.5) → "Trescientos cincuenta mil pesos con 50/100"
 */
export function montoEnLetras(monto: number): string {
  const entero = Math.floor(monto);
  const centavos = Math.round((monto - entero) * 100) % 100;
  const letrasEntero = parteEnteraALetras(entero);
  const capitalizado =
    letrasEntero.charAt(0).toUpperCase() + letrasEntero.slice(1);
  const sufijo =
    centavos === 0
      ? "pesos con 00/100"
      : `pesos con ${String(centavos).padStart(2, "0")}/100`;
  return `${capitalizado} ${sufijo}`;
}
