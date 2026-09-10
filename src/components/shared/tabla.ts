/**
 * Encabezado de tabla de la plataforma.
 *
 * Es el mismo que aplica `ui/table` en `TableHead`: fondo claro y micro-label
 * en gris. `uppercase` y `letter-spacing` se heredan, así que van en el `<tr>`
 * y alcanzan a cada `<th>` sin repetirlos.
 * Existe acá para las tablas que se arman con `<table>` a mano —hay muchas,
 * sobre todo donde las columnas se generan o el layout no entra en el
 * componente— y que antes cada una resolvía por su cuenta: gris claro,
 * mayúsculas en gris, o el navy copiado con el color escrito a mano.
 *
 * Si podés usar `ui/table`, usá `ui/table`. Esto es para cuando no.
 */
export const THEAD_TR =
  'bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em] border-b border-[var(--arca-border)]';

/** Celda de encabezado. Agregá `text-right` donde la columna sea numérica. */
export const TH =
  'h-[38px] px-3 text-left text-[10.5px] font-semibold whitespace-nowrap';

/** Igual que `TH`, alineada a la derecha. */
export const TH_NUM =
  'h-[38px] px-3 text-right text-[10.5px] font-semibold whitespace-nowrap';
