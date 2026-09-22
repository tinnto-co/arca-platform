/**
 * Letras que se ven latinas pero no lo son.
 *
 * La lectura del PDF con IA a veces devuelve letras cirílicas o griegas que se
 * ven idénticas a las latinas: "TRANSFERENCIA INMEDIATA СОЕ" con С, О y Е
 * cirílicas. A la vista es igual, pero una búsqueda por "COE" no lo encuentra
 * y ninguna regla de texto lo reconoce. Acá se cambian por su gemela latina.
 *
 * Solo las que se confunden a simple vista: una palabra realmente escrita en
 * otro alfabeto no aparece en un extracto argentino.
 */
const GEMELAS: Record<string, string> = {
  // Cirílico, mayúsculas
  А: 'A',
  В: 'B',
  С: 'C',
  Е: 'E',
  Н: 'H',
  І: 'I',
  Ј: 'J',
  К: 'K',
  М: 'M',
  О: 'O',
  Р: 'P',
  Ѕ: 'S',
  Т: 'T',
  Х: 'X',
  У: 'Y',
  // Cirílico, minúsculas
  а: 'a',
  с: 'c',
  е: 'e',
  і: 'i',
  ј: 'j',
  о: 'o',
  р: 'p',
  ѕ: 's',
  х: 'x',
  у: 'y',
  // Griego, mayúsculas
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Ζ: 'Z',
  Η: 'H',
  Ι: 'I',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'P',
  Τ: 'T',
  Υ: 'Y',
  Χ: 'X',
  // Griego, minúsculas
  ο: 'o',
};

const PATRON = new RegExp(`[${Object.keys(GEMELAS).join('')}]`, 'g');

/** El mismo texto, con las gemelas cirílicas y griegas pasadas a latinas. */
export function aLatino(texto: string): string {
  return texto.replace(PATRON, (letra) => GEMELAS[letra] ?? letra);
}
