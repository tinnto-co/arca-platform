/**
 * Encabezado de tabla de la plataforma.
 *
 * Es el mismo que aplica `ui/table` en `TableHead`: navy con texto blanco.
 * Existe acá para las tablas que se arman con `<table>` a mano —hay muchas,
 * sobre todo donde las columnas se generan o el layout no entra en el
 * componente— y que antes cada una resolvía por su cuenta: gris claro,
 * mayúsculas en gris, o el navy copiado con el color escrito a mano.
 *
 * Si podés usar `ui/table`, usá `ui/table`. Esto es para cuando no.
 */
export const THEAD_TR = 'bg-[var(--arca-navy-900)] text-white';

/** Celda de encabezado. Agregá `text-right` donde la columna sea numérica. */
export const TH =
  'px-3 py-2.5 text-left text-[11px] font-semibold whitespace-nowrap';

/** Igual que `TH`, alineada a la derecha. */
export const TH_NUM =
  'px-3 py-2.5 text-right text-[11px] font-semibold whitespace-nowrap';
