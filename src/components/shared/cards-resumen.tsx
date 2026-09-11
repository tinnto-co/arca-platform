import { cn } from '@/lib/utils';

/**
 * Banda de resumen de una pestaña: una card por cifra, con una barra de
 * acento a la izquierda que dice de qué estado habla.
 *
 * Nació en la pestaña de Deudas y vive acá para que las demás no la vuelvan
 * a inventar: Vencimientos usaba `Card` de shadcn con `text-2xl font-bold`,
 * que es otro tamaño, otro peso y otra tipografía para lo mismo.
 *
 * La cifra va en mono tabular —es una cifra— y el rótulo en micro-label. El
 * acento lo elige cada pantalla según lo que signifique el número: rojo para
 * lo vencido, ámbar para lo que está por vencer, acento para lo informativo.
 */

export type TonoResumen =
  | 'neutro'
  | 'acento'
  | 'positivo'
  | 'atencion'
  | 'urgente';

const BARRA: Record<TonoResumen, string> = {
  neutro: 'var(--arca-border-strong)',
  acento: 'var(--arca-accent)',
  positivo: 'var(--arca-accent-pos)',
  atencion: 'var(--arca-accent-warn)',
  urgente: 'var(--arca-accent-neg)',
};

/** Color de la línea de apoyo, cuando dice algo (una variación, un atraso). */
export type TonoSub = 'neutro' | 'positivo' | 'urgente';

const SUB_COLOR: Record<TonoSub, string> = {
  neutro: 'var(--arca-ink-4)',
  positivo: 'var(--arca-accent-pos-fg)',
  urgente: 'var(--arca-accent-neg-fg)',
};

export interface CardResumen {
  label: string;
  /** Ya formateado: la card no sabe si es plata, una cuenta o una fecha. */
  valor: string;
  /** Línea de apoyo bajo la cifra. */
  sub?: string | null;
  /** Tono de esa línea: gris por defecto, verde o rojo si compara. */
  subTono?: TonoSub;
  tono?: TonoResumen;
}

export function CardsResumen({
  cards,
  className,
}: {
  cards: CardResumen[];
  className?: string;
}) {
  return (
    <div
      className={cn('grid grid-cols-2 gap-[14px] md:grid-cols-4', className)}
    >
      {cards.map((c) => (
        <div
          key={c.label}
          className="relative overflow-hidden rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-[14px] py-[12px] shadow-[var(--arca-shadow-card)]"
        >
          <div
            aria-hidden
            className="absolute top-[14px] bottom-[14px] left-0 w-[2px] rounded-[0_2px_2px_0]"
            style={{ background: BARRA[c.tono ?? 'neutro'] }}
          />
          <span className="block pl-[6px] text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-4)] uppercase">
            {c.label}
          </span>
          <div className="pl-[6px] text-[22px] leading-none font-semibold tabular-nums text-[var(--arca-ink)] [font-family:var(--ff-mono)]">
            {c.valor}
          </div>
          {c.sub && (
            <div
              className="pl-[6px] text-[11.5px]"
              style={{ color: SUB_COLOR[c.subTono ?? 'neutro'] }}
            >
              {c.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
