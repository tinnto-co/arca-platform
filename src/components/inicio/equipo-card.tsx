/**
 * Equipo: quién sostiene el tablero y qué queda sin dueño.
 * Abiertas = en el tablero (sin archivar ni verificar); vencidas además
 * pasaron su fecha.
 */
import { Link } from '@tanstack/react-router';
import type { getInicio } from '@/actions/inicio';
import { colorAvatar, iniciales } from './compartido';

type Datos = Awaited<ReturnType<typeof getInicio>>;

export function EquipoCard({ datos }: { datos: Datos }) {
  const conNombre = datos.equipo.filter((e) => e.asignadoA && e.nombre);
  const sinAsignar = datos.equipo.find((e) => !e.asignadoA)?.abiertas ?? 0;

  if (conNombre.length === 0 && sinAsignar === 0) return null;

  return (
    <div
      className="bg-white border rounded-[14px] overflow-hidden"
      style={{ borderColor: 'var(--arca-border)' }}
    >
      <div
        className="flex items-center justify-between border-b"
        style={{ padding: '16px 20px 14px', borderColor: 'var(--arca-border)' }}
      >
        <h2
          className="text-[15px] font-semibold"
          style={{ fontFamily: 'var(--ff-display)', color: 'var(--arca-ink)' }}
        >
          Equipo
        </h2>
        {sinAsignar > 0 && (
          <Link
            to="/tareas"
            className="text-[11.5px] tabular-nums hover:underline"
            style={{ color: 'var(--arca-ink-4)' }}
          >
            {sinAsignar} sin asignar
          </Link>
        )}
      </div>

      <div
        className="grid items-center"
        style={{
          gridTemplateColumns: '1fr 60px 64px',
          gap: '0 10px',
          padding: '10px 20px 0',
        }}
      >
        <span
          className="text-[10.5px] font-semibold uppercase pb-2"
          style={{ letterSpacing: '0.08em', color: 'var(--arca-ink-4)' }}
        >
          Persona
        </span>
        <span
          className="text-[10.5px] font-semibold uppercase pb-2 justify-self-end"
          style={{ letterSpacing: '0.08em', color: 'var(--arca-ink-4)' }}
        >
          Abiertas
        </span>
        <span
          className="text-[10.5px] font-semibold uppercase pb-2 justify-self-end"
          style={{ letterSpacing: '0.08em', color: 'var(--arca-ink-4)' }}
        >
          Vencidas
        </span>
      </div>

      {conNombre.map((e, i) => (
        <Link
          key={e.asignadoA}
          to="/tareas"
          className="grid items-center transition-colors duration-150 hover:bg-[var(--arca-surface-2)]"
          style={{
            gridTemplateColumns: '1fr 60px 64px',
            gap: '0 10px',
            padding: '11px 20px',
            borderBottom:
              i < conNombre.length - 1
                ? '1px solid var(--arca-border)'
                : undefined,
          }}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <span
              className="size-[22px] rounded-full text-white text-[9px] font-semibold flex items-center justify-center shrink-0"
              style={{ background: colorAvatar(e.nombre!) }}
            >
              {iniciales(e.nombre!)}
            </span>
            <span
              className="text-[13px] truncate"
              style={{ color: 'var(--arca-ink)' }}
            >
              {e.nombre}
            </span>
          </span>
          <span
            className="text-[13px] tabular-nums justify-self-end"
            style={{ color: 'var(--arca-ink-2)' }}
          >
            {e.abiertas}
          </span>
          <span
            className="text-[13px] tabular-nums justify-self-end"
            style={{
              color:
                e.vencidas > 0
                  ? 'var(--arca-accent-neg-fg)'
                  : 'var(--arca-ink-3)',
              fontWeight: e.vencidas > 0 ? 600 : 400,
            }}
          >
            {e.vencidas}
          </span>
        </Link>
      ))}
    </div>
  );
}
