/**
 * Siglas societarias: clave = forma normalizada sin puntos (en mayúsculas),
 * valor = forma canónica con puntos que se mostrará siempre.
 */
const SIGLAS: Record<string, string> = {
  SA:   'S.A.',
  SRL:  'S.R.L.',
  SAS:  'S.A.S.',
  SAU:  'S.A.U.',
  SCA:  'S.C.A.',
  SCS:  'S.C.S.',
  SCP:  'S.C.P.',
  SCO:  'S.C.O.',
  SCE:  'S.C.E.',
  SH:   'S.H.',
  SE:   'S.E.',
  CIA:  'Cía.',
  LTDA: 'Ltda.',
};

/** Si la palabra es una sigla conocida devuelve su forma canónica; si no, null. */
function canonicaSigla(word: string): string | null {
  const key = word.replace(/\./g, '').toUpperCase();
  return SIGLAS[key] ?? null;
}

function titleCaseWords(segment: string): string {
  return segment
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length === 0) return word;
      const sigla = canonicaSigla(word);
      if (sigla) return sigla;
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Formatea un nombre propio con inicial mayúscula por palabra (title case).
 * Preserva segmentos separados por coma (ej. "GARCIA, JUAN" → "Garcia, Juan").
 * Retorna '' si el input es vacío/null.
 */
export function toTitleCase(str: string | null | undefined): string {
  if (!str || str.trim() === '') return '';
  return str
    .split(',')
    .map(titleCaseWords)
    .filter(Boolean)
    .join(', ');
}
