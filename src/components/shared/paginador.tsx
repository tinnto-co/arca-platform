/**
 * Paginador numerado, en castellano y con el mismo aspecto en toda la app.
 *
 * Reemplaza dos patrones que convivían: el "Cargar más" —que sólo iba hacia
 * adelante, no dejaba volver y no decía en qué página estabas— y los armados a
 * mano sobre las primitivas de shadcn, que quedaron con los textos "Next" y
 * "Previous" en inglés.
 *
 * La ventana de números se corre para que la página actual quede al medio
 * siempre que se pueda, y los extremos se muestran con elipsis: con 9.308
 * páginas, listarlas todas no es una opción.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Cuántos números se ven además de primera, última y la actual. */
const VENTANA = 5;

/**
 * Los números a dibujar. `null` es una elipsis.
 *
 * Con pocas páginas devuelve todas; con muchas, siempre la primera, la última
 * y una ventana centrada en la actual.
 */
export function paginasVisibles(
  actual: number,
  total: number
): (number | null)[] {
  if (total <= VENTANA + 2)
    return Array.from({ length: total }, (_, i) => i + 1);

  const lado = Math.floor(VENTANA / 2);
  let desde = Math.max(2, actual - lado);
  let hasta = Math.min(total - 1, actual + lado);

  // Cerca de un extremo, la ventana se corre hacia el otro lado en vez de
  // encogerse: así la cantidad de botones no baila al navegar.
  if (actual - lado < 2) hasta = Math.min(total - 1, VENTANA);
  if (actual + lado > total - 1) desde = Math.max(2, total - VENTANA + 1);

  const paginas: (number | null)[] = [1];
  if (desde > 2) paginas.push(null);
  for (let p = desde; p <= hasta; p++) paginas.push(p);
  if (hasta < total - 1) paginas.push(null);
  paginas.push(total);
  return paginas;
}

const BOTON =
  'inline-flex h-7 min-w-7 items-center justify-center rounded-[var(--arca-r-sm)] px-2 text-[12px] tabular-nums transition-colors duration-[120ms] disabled:pointer-events-none disabled:opacity-40';

export function Paginador({
  pagina,
  totalPaginas,
  onPagina,
  /** Total de elementos, para el "N de M" de la izquierda. */
  total,
  /** Cómo se llama lo que se pagina. Las dos formas: el plural en castellano
   *  no se arma agregando una "s" ("notificación" → "notificaciones"). */
  unidad = 'resultado',
  unidadPlural,
  className,
}: {
  pagina: number;
  totalPaginas: number;
  onPagina: (p: number) => void;
  total?: number;
  unidad?: string;
  unidadPlural?: string;
  className?: string;
}) {
  if (totalPaginas <= 1 && !total) return null;

  const ir = (p: number) => onPagina(Math.min(totalPaginas, Math.max(1, p)));

  return (
    // Container query y no breakpoint de pantalla: el mismo paginador va en el
    // pie de la lista de notificaciones (392px) y a lo ancho de una tabla. Lo
    // que manda es el espacio del contenedor, no el de la ventana.
    <div
      className={cn(
        // `w-full` no es decorativo: `container-type: inline-size` aplica
        // contención en el eje inline, así que el elemento deja de tomar su
        // ancho del contenido. Sin esto medía 0 dentro de un flex y la query
        // caía siempre en el modo angosto.
        '@container flex w-full flex-wrap items-center justify-between gap-3',
        className
      )}
    >
      <span className="text-[11.5px] text-[var(--arca-ink-3)]">
        {total !== undefined && (
          <>
            {total.toLocaleString('es-AR')}{' '}
            {total === 1 ? unidad : (unidadPlural ?? `${unidad}s`)}
            {totalPaginas > 1 ? ' · ' : ''}
          </>
        )}
        {totalPaginas > 1 && (
          <>
            {/* Angosto: "5 / 24" alcanza y deja lugar a las flechas. */}
            <span className="@min-[26rem]:hidden tabular-nums">
              {pagina} / {totalPaginas}
            </span>
            <span className="hidden @min-[26rem]:inline">
              Página <span className="tabular-nums">{pagina}</span> de{' '}
              <span className="tabular-nums">{totalPaginas}</span>
            </span>
          </>
        )}
      </span>

      {totalPaginas > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginación">
          <button
            type="button"
            onClick={() => ir(pagina - 1)}
            disabled={pagina <= 1}
            aria-label="Página anterior"
            className={cn(
              BOTON,
              'gap-1 text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]'
            )}
          >
            <ChevronLeft className="size-3.5" />
            <span className="hidden @min-[26rem]:inline">Anterior</span>
          </button>

          <span className="hidden items-center gap-1 @min-[26rem]:flex">
            {paginasVisibles(pagina, totalPaginas).map((p, i) =>
              p === null ? (
                <span
                  key={`gap-${i}`}
                  className="px-1 text-[12px] text-[var(--arca-ink-4)]"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => ir(p)}
                  aria-current={p === pagina ? 'page' : undefined}
                  className={cn(
                    BOTON,
                    p === pagina
                      ? 'bg-[var(--arca-ink)] font-semibold text-white'
                      : 'text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]'
                  )}
                >
                  {p}
                </button>
              )
            )}
          </span>

          <button
            type="button"
            onClick={() => ir(pagina + 1)}
            disabled={pagina >= totalPaginas}
            aria-label="Página siguiente"
            className={cn(
              BOTON,
              'gap-1 text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]'
            )}
          >
            <span className="hidden @min-[26rem]:inline">Siguiente</span>
            <ChevronRight className="size-3.5" />
          </button>
        </nav>
      )}
    </div>
  );
}
