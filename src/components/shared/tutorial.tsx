/**
 * Tutorial paso a paso sobre la pantalla real.
 *
 * Cada paso resalta un elemento marcado con `data-tour="…"` y explica qué
 * hacer con él. No bloquea la pantalla: el usuario sigue las indicaciones
 * sobre la app de verdad (abre el formulario, completa campos, guarda) con el
 * tutorial abierto, y un paso puede avanzar solo cuando pasa lo que pedía.
 *
 * La primera vez se abre solo y la única forma de cerrarlo sin terminarlo es
 * «Omitir tutorial», que es una decisión explícita.
 *
 * Si el elemento de un paso no está en pantalla (un botón que el rol no ve, un
 * formulario que se cerró) el paso se muestra igual, centrado.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PasoTutorial {
  id: string;
  titulo: string;
  cuerpo: React.ReactNode;
  /** Valor de `data-tour` del elemento a resaltar. Sin él, va centrado. */
  objetivo?: string;
  /** Se corre al llegar al paso, por ejemplo para cambiar de solapa. */
  alEntrar?: () => void;
  /**
   * Se corre al tocar «Siguiente» en este paso: hace por el usuario lo que el
   * paso pedía (abrir el formulario) si todavía no lo hizo.
   */
  alSiguiente?: () => void;
  /**
   * El paso avanza solo cuando esto pasa de falso a verdadero mientras está a
   * la vista (el usuario hizo lo que se le pedía). Si ya era verdadero al
   * llegar, no avanza: así «Anterior» no rebota.
   */
  avanzarCuando?: () => boolean;
}

/** Marca del tutorial en el DOM: los diálogos la usan para no cerrarse. */
export const TUTORIAL_ATTR = 'data-tutorial';

/** Para `onInteractOutside` de un diálogo: un clic en el tutorial no lo cierra. */
export function esClicEnTutorial(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(`[${TUTORIAL_ATTR}]`);
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MARGEN = 6;
const GUTTER = 16;
const ANCHO_TARJETA = 360;

function buscarObjetivo(objetivo: string | undefined): HTMLElement | null {
  if (!objetivo) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${objetivo}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

function mismoRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

function esEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ||
    !!el.closest('[role="listbox"],[role="combobox"],[role="menu"]')
  );
}

export function Tutorial({
  pasos,
  onTerminar,
  onOmitir,
}: {
  pasos: PasoTutorial[];
  onTerminar: () => void;
  onOmitir: () => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [alto, setAlto] = useState(0);
  const tarjetaRef = useRef<HTMLDivElement>(null);
  const siguienteRef = useRef<HTMLButtonElement>(null);
  const paso = pasos[i];
  const ultimo = i === pasos.length - 1;

  const avanzar = useCallback(() => {
    if (ultimo) {
      onTerminar();
      return;
    }
    setRect(null);
    setI((n) => n + 1);
  }, [ultimo, onTerminar]);
  const retroceder = useCallback(() => {
    if (i === 0) return;
    setRect(null);
    setI(i - 1);
  }, [i]);

  // Mientras dura el paso: seguir al objetivo (aparece tarde, se mueve con la
  // animación de un diálogo, desaparece si lo cierran) y avanzar solo cuando
  // el usuario hizo lo que el paso pedía.
  useEffect(() => {
    paso.alEntrar?.();
    let desplazado = false;
    /** Último valor visto de la condición; se avanza cuando pasa de no a sí. */
    let antes: boolean | null = null;
    const revisar = () => {
      if (paso.avanzarCuando) {
        const ahora = paso.avanzarCuando();
        if (antes === false && ahora) {
          avanzar();
          return;
        }
        antes = ahora;
      }
      const el = buscarObjetivo(paso.objetivo);
      if (el && !desplazado) {
        desplazado = true;
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      const nuevo = el ? medir(el) : null;
      setRect((prev) => (mismoRect(prev, nuevo) ? prev : nuevo));
    };
    const raf = requestAnimationFrame(revisar);
    const id = window.setInterval(revisar, 200);
    window.addEventListener('resize', revisar);
    window.addEventListener('scroll', revisar, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(id);
      window.removeEventListener('resize', revisar);
      window.removeEventListener('scroll', revisar, true);
    };
    // `paso` cambia sólo con `i`: los pasos se arman una vez por apertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useLayoutEffect(() => {
    setAlto(tarjetaRef.current?.getBoundingClientRect().height ?? 0);
  }, [i, rect]);

  // El foco va al tutorial sólo al abrirlo: después el usuario está usando la
  // pantalla, y robarle el foco en cada paso le cortaría lo que escribe.
  useEffect(() => {
    siguienteRef.current?.focus();
  }, []);

  const siguiente = () => {
    paso.alSiguiente?.();
    avanzar();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (esEditable(e.target)) return;
      if (e.key === 'ArrowRight') {
        paso.alSiguiente?.();
        avanzar();
      } else if (e.key === 'ArrowLeft') retroceder();
    };
    // En captura: algunos componentes de la página frenan la propagación de
    // las flechas y el tutorial no se enteraba.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [paso, avanzar, retroceder]);

  if (typeof document === 'undefined') return null;
  const pos = posicionTarjeta(rect, alto);

  return createPortal(
    <div
      {...{ [TUTORIAL_ATTR]: '' }}
      className="pointer-events-none fixed inset-0 z-[1000]"
      role="dialog"
      aria-modal="false"
      aria-labelledby="tutorial-titulo"
      aria-describedby="tutorial-cuerpo"
    >
      {/* Capa que tapa la pantalla. Con objetivo, el hueco lo hace la sombra
        del recuadro; sin objetivo, un velo parejo. */}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-[var(--arca-accent)] shadow-[0_0_0_9999px_rgb(0_0_0/0.4)] transition-all duration-200"
          style={{
            top: rect.top - MARGEN,
            left: rect.left - MARGEN,
            width: rect.width + MARGEN * 2,
            height: rect.height + MARGEN * 2,
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/40" />
      )}

      <div
        ref={tarjetaRef}
        className={cn(
          'pointer-events-auto absolute rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)] p-4 shadow-xl',
          'w-[calc(100vw-32px)] sm:w-[360px]'
        )}
        style={pos}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium tabular-nums text-[var(--arca-ink-3)]">
            Paso {i + 1} de {pasos.length}
          </span>
          <button
            type="button"
            onClick={onOmitir}
            className="inline-flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[11.5px] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink)]"
          >
            <X className="size-3" strokeWidth={2} />
            Omitir tutorial
          </button>
        </div>
        <h2
          id="tutorial-titulo"
          className="text-[15px] font-semibold text-[var(--arca-ink)]"
        >
          {paso.titulo}
        </h2>
        <div
          id="tutorial-cuerpo"
          className="mt-1.5 space-y-2 text-[12.5px] leading-relaxed text-[var(--arca-ink-2)]"
        >
          {paso.cuerpo}
        </div>

        <div aria-hidden className="mt-3 flex gap-1">
          {pasos.map((p, n) => (
            <span
              key={p.id}
              className={cn(
                'h-1 flex-1 rounded-full',
                n <= i ? 'bg-[var(--arca-accent)]' : 'bg-[var(--arca-border)]'
              )}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={retroceder}
            disabled={i === 0}
            className="gap-1"
          >
            <ChevronLeft className="size-3.5" />
            Anterior
          </Button>
          <Button
            ref={siguienteRef}
            size="sm"
            onClick={siguiente}
            className="gap-1"
          >
            {ultimo ? 'Terminar' : 'Siguiente'}
            {!ultimo && <ChevronRight className="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function medir(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Dónde va la tarjeta: debajo del objetivo si entra, si no arriba, si no al
 * costado (derecha o izquierda). Un objetivo que ocupa casi toda la pantalla
 * deja la tarjeta en la esquina de abajo, donde tapa lo menos posible.
 * Sin objetivo, al centro.
 */
function posicionTarjeta(rect: Rect | null, alto: number): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ancho = Math.min(ANCHO_TARJETA, vw - GUTTER * 2);
  const sep = MARGEN + 10;
  if (!rect) {
    return {
      top: Math.max(GUTTER, (vh - alto) / 2),
      left: (vw - ancho) / 2,
    };
  }
  const clampLeft = (x: number) =>
    Math.min(Math.max(GUTTER, x), vw - ancho - GUTTER);
  const clampTop = (y: number) =>
    Math.min(Math.max(GUTTER, y), vh - alto - GUTTER);
  const centradoX = clampLeft(rect.left + rect.width / 2 - ancho / 2);

  const abajo = rect.top + rect.height + sep;
  if (abajo + alto <= vh - GUTTER) return { top: abajo, left: centradoX };
  const arriba = rect.top - sep - alto;
  if (arriba >= GUTTER) return { top: arriba, left: centradoX };

  const centradoY = clampTop(rect.top + rect.height / 2 - alto / 2);
  const derecha = rect.left + rect.width + sep;
  if (derecha + ancho <= vw - GUTTER) return { top: centradoY, left: derecha };
  const izquierda = rect.left - sep - ancho;
  if (izquierda >= GUTTER) return { top: centradoY, left: izquierda };

  return { top: vh - alto - GUTTER, left: vw - ancho - GUTTER };
}
