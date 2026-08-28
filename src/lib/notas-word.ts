/**
 * Importar Notas desde un `.docx` (TIN-1442).
 *
 * El estudio ya tiene años de notas escritas en Word. Sin importación, pasarlas
 * al sistema es copiar y pegar nota por nota, y eso es exactamente lo que hace
 * que nadie las pase.
 *
 * El parser reconoce el formato que produce nuestro propio export —un
 * encabezado «Nota 3. Bienes de cambio» por nota y párrafos debajo— pero no
 * depende de él: cualquier documento con encabezados sirve, y uno sin ninguno
 * entra como una sola nota en vez de fallar.
 *
 * No usa `DOMParser` a propósito. La salida de mammoth es HTML simple y
 * predecible —encabezados, párrafos y listas—, así que recorrerla con una
 * expresión regular alcanza, y deja el parser probable en Node y reutilizable
 * del lado del servidor si algún día hace falta.
 */

export interface NotaImportada {
  titulo: string;
  contenido: string;
}

/** «Nota 3. Bienes de cambio», «NOTA 12 - Deudas», «3) Caja y bancos». */
const ENCABEZADO_NOTA = /^\s*(?:nota\s+)?(\d+)\s*[.)\-–—:]\s+(.+)$/i;

/** Quita la numeración del título: el sistema la calcula por posición. */
export function limpiarTitulo(texto: string): string {
  const m = ENCABEZADO_NOTA.exec(texto);
  return (m ? m[2] : texto).trim();
}

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Texto plano de un fragmento HTML: sin etiquetas y con las entidades resueltas. */
function aTexto(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&([a-z]+);/gi, (m, e: string) => ENTIDADES[e.toLowerCase()] ?? m)
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Bloques que mammoth emite: encabezados, párrafos y elementos de lista. */
const BLOQUE = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;

/**
 * Parte el HTML de mammoth en notas.
 *
 * Se corta por los encabezados, que es donde Word deja los títulos. Los
 * párrafos anteriores al primero no se tiran: suelen ser el título del
 * documento o una introducción, y perderlos en silencio sería peor que
 * mostrarlos.
 */
export function parsearNotasDeHtml(html: string): NotaImportada[] {
  const notas: NotaImportada[] = [];
  let actual: NotaImportada | null = null;
  const suelto: string[] = [];

  for (const m of html.matchAll(BLOQUE)) {
    const etiqueta = m[1].toLowerCase();
    const texto = aTexto(m[2]);
    const esEncabezado = /^h[1-6]$/.test(etiqueta);

    if (esEncabezado) {
      // Un encabezado vacío no abre una nota fantasma.
      if (!texto) continue;
      actual = { titulo: limpiarTitulo(texto), contenido: '' };
      notas.push(actual);
      continue;
    }
    // Un párrafo vacío separa bloques dentro de la nota; no abre una nueva.
    if (!texto) continue;
    if (actual) {
      actual.contenido += (actual.contenido ? '\n' : '') + texto;
    } else {
      suelto.push(texto);
    }
  }

  // Un documento sin encabezados entra como una nota sola: es preferible a
  // decirle al usuario que su archivo no sirve.
  if (notas.length === 0) {
    return suelto.length > 0
      ? [{ titulo: 'Nota importada', contenido: suelto.join('\n') }]
      : [];
  }
  if (suelto.length > 0) {
    notas[0].contenido = [suelto.join('\n'), notas[0].contenido]
      .filter(Boolean)
      .join('\n');
  }
  return notas.map((n) => ({
    titulo: n.titulo,
    contenido: n.contenido.trim(),
  }));
}

/** Lee un `.docx` y devuelve las notas que contiene. */
export async function leerNotasDeWord(
  archivo: File | Blob
): Promise<NotaImportada[]> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await archivo.arrayBuffer();
  const { value } = await mammoth.convertToHtml({ arrayBuffer });
  return parsearNotasDeHtml(value);
}
