'use client';

/**
 * Piezas del patrón de edición en línea del modal de tareas: el valor que se
 * muestra ES el control. No hay modo "editar" ni formulario aparte.
 *
 * Todo sale de los tokens `--arca-*` de `src/styles/app.css`, que son los
 * mismos que nombra el handoff.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { iniciales } from './utils';

/** Etiqueta chica en mayúsculas que encabeza cada zona del modal. */
export function MicroLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'text-[10.5px] font-semibold tracking-[0.08em] text-[var(--arca-ink-3)] uppercase',
        className
      )}
    >
      {children}
    </span>
  );
}

/** Una fila de la grilla de campos: label de ancho fijo + control. */
export function CampoInline({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[78px] shrink-0 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * La caja del control editable. Es el patrón base de toda la grilla: fondo
 * hundido en reposo, superficie y borde más marcado al pasar por encima.
 */
export const controlBase = cn(
  'flex w-full items-center gap-1.5 rounded-[var(--arca-r-md)] border border-[var(--arca-border)]',
  'bg-[var(--arca-surface-2)] px-[9px] py-[5px] text-left text-[12.5px] text-[var(--arca-ink)]',
  'transition-colors duration-[120ms] ease-[ease]',
  'hover:border-[var(--arca-border-strong)] hover:bg-[var(--arca-surface)]',
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--arca-navy-600)]',
  'disabled:cursor-not-allowed disabled:opacity-60'
);

export function Chevron() {
  return (
    <ChevronDown className="ml-auto size-3 shrink-0 text-[var(--arca-ink-4)]" />
  );
}

/**
 * Avatares generados: el sistema no usa imágenes. La empresa es un tile con
 * esquinas, la persona un círculo — para poder distinguirlos de un vistazo.
 */
export function Avatar({
  nombre,
  variante = 'usuario',
  size = 18,
}: {
  nombre: string | null | undefined;
  variante?: 'usuario' | 'empresa' | 'propio';
  size?: number;
}) {
  const txt = iniciales(nombre, variante === 'empresa' ? 2 : 2);
  const estilo: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(8, Math.round(size * 0.47)),
    borderRadius:
      variante === 'empresa' ? Math.max(4, Math.round(size * 0.28)) : '50%',
  };
  if (variante === 'propio') {
    estilo.background =
      'linear-gradient(135deg, var(--arca-navy-700), var(--arca-chart-3))';
  } else if (variante === 'empresa') {
    estilo.background = 'var(--arca-chart-1)';
  } else {
    estilo.background = 'var(--arca-navy-700)';
  }

  return (
    <span
      style={estilo}
      className="inline-flex shrink-0 items-center justify-center font-semibold text-white select-none"
      aria-hidden="true"
    >
      {txt}
    </span>
  );
}

/** Círculo punteado que ocupa el lugar del avatar cuando no hay asignado. */
export function AvatarVacio({ size = 18 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--arca-border-strong)] text-[var(--arca-ink-4)]"
      aria-hidden="true"
    >
      <span style={{ fontSize: Math.round(size * 0.6), lineHeight: 1 }}>+</span>
    </span>
  );
}

/**
 * Indicador discreto de guardado. Aparece cuando algo se guardó y cuenta el
 * tiempo desde entonces; se va solo a los 90 segundos para no quedar
 * contradiciendo a la pantalla.
 */
export function useGuardado() {
  const [texto, setTexto] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const frenar = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => frenar, []);

  const marcar = () => {
    const desde = Date.now();
    setTexto('Guardado');
    frenar();
    timer.current = setInterval(() => {
      const seg = Math.round((Date.now() - desde) / 1000);
      if (seg > 90) {
        setTexto(null);
        frenar();
      } else {
        setTexto(`Guardado hace ${seg} s`);
      }
    }, 5000);
  };

  return { marcar, texto };
}

/**
 * Texto editable en el lugar. Un click entra en edición, Enter o salir del
 * campo guarda, Esc revierte.
 */
export function TextoEditable({
  valor,
  onGuardar,
  className,
  inputClassName,
  placeholder,
  multilinea = false,
  ariaLabel,
}: {
  valor: string;
  onGuardar: (v: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  multilinea?: boolean;
  ariaLabel: string;
}) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(valor);

  // El borrador se siembra al entrar en edición, no se sincroniza con `valor`
  // por efecto: mientras no se está editando nadie lo mira, y sincronizarlo
  // pisaba lo tipeado cuando llegaba un refetch del tablero.
  const empezar = () => {
    setBorrador(valor);
    setEditando(true);
  };

  const confirmar = () => {
    setEditando(false);
    const limpio = borrador.trim();
    if (limpio && limpio !== valor) onGuardar(limpio);
    else setBorrador(valor);
  };

  const revertir = () => {
    setBorrador(valor);
    setEditando(false);
  };

  if (!editando) {
    return (
      <button
        type="button"
        onClick={empezar}
        aria-label={`${ariaLabel}. Click para editar`}
        className={cn(
          'w-full cursor-text text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--arca-navy-600)]',
          className
        )}
      >
        {valor || (
          <span className="text-[var(--arca-ink-4)]">{placeholder}</span>
        )}
      </button>
    );
  }

  const comunes = {
    autoFocus: true,
    value: borrador,
    'aria-label': ariaLabel,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setBorrador(e.target.value),
    onBlur: confirmar,
    className: cn(
      'w-full resize-none bg-transparent outline-none',
      className,
      inputClassName
    ),
  };

  if (multilinea) {
    return (
      <textarea
        {...comunes}
        rows={3}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            revertir();
          }
        }}
      />
    );
  }

  return (
    <input
      {...comunes}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmar();
        }
        if (e.key === 'Escape') {
          // Sin esto, Esc cierra el modal entero en vez de revertir el campo.
          e.stopPropagation();
          revertir();
        }
      }}
    />
  );
}
