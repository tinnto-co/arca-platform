/** Chip de estado del autoguardado (vista Nuevo recibo y drawer de conceptos). */

export type AutosaveEstado =
  | 'inicial'
  | 'guardando'
  | 'guardado'
  | 'bloqueado'
  | 'error';

export function AutosaveChip({
  estado,
  savedAt,
}: {
  estado: AutosaveEstado;
  savedAt: Date | null;
}) {
  const base =
    'inline-flex items-center text-[11px] font-medium px-[9px] py-[2px] rounded-[20px] whitespace-nowrap';
  if (estado === 'guardando') {
    return (
      <span
        className={base}
        style={{
          color: 'var(--arca-accent-warn-fg)',
          background: 'var(--arca-accent-warn-bg)',
        }}
      >
        Guardando…
      </span>
    );
  }
  if (estado === 'bloqueado') {
    return (
      <span
        className={base}
        style={{
          color: 'var(--arca-accent-warn-fg)',
          background: 'var(--arca-accent-warn-bg)',
        }}
      >
        Período no liquidable — no se guarda
      </span>
    );
  }
  if (estado === 'error') {
    return (
      <span
        className={base}
        style={{
          color: 'var(--arca-accent-neg-fg)',
          background: 'var(--arca-accent-neg-bg)',
        }}
      >
        Error al guardar
      </span>
    );
  }
  const label =
    estado === 'guardado' && savedAt
      ? `Guardado ${savedAt.toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        })}`
      : 'Guardado automáticamente';
  return (
    <span
      className={base}
      style={{
        color: 'var(--arca-accent-pos-fg)',
        background: 'var(--arca-accent-pos-bg)',
      }}
    >
      {label}
    </span>
  );
}
