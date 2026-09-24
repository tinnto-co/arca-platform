import { cn } from '@/lib/utils';

/**
 * Orbe del asistente.
 *
 * Es su firma visual y el ÚNICO degradado permitido en la UI: barra flotante,
 * FAB, avatar de las respuestas del agente e ícono de "Chats" en el sidebar.
 * No usarlo en ningún otro componente — en cuanto aparece en un botón o una
 * card deja de identificar al asistente.
 *
 * El degradado vive en `--arca-orb` (#1F7A86 → #7FD1CF), no acá: así un
 * cambio de marca no obliga a tocar cada punto de uso.
 */
export function OrbeAsistente({
  size = 16,
  pensando = false,
  className,
}: {
  /** Diámetro en px. 16 en la barra, 18 en el FAB, 14 en el nav. */
  size?: number;
  /** Late mientras el agente está resolviendo. El orbe ES el spinner: no
      hace falta meterle un ícono de carga al lado. */
  pensando?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'block shrink-0 rounded-full',
        pensando && 'motion-safe:animate-pulse',
        className
      )}
      style={{ width: size, height: size, background: 'var(--arca-orb)' }}
    />
  );
}
