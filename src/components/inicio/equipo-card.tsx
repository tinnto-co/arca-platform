/**
 * Equipo: quién sostiene el tablero y qué queda sin dueño.
 * Abiertas = en el tablero (sin archivar ni verificar); vencidas además
 * pasaron su fecha.
 *
 * "Sin asignar" es una fila más y no una nota al margen: en un estudio recién
 * puesto en marcha suele ser el número más grande de la card, y esconderlo en
 * el encabezado deja la tabla vacía sin explicar por qué.
 */
import { Link } from '@tanstack/react-router';
import type { getInicio } from '@/actions/inicio';
import { colorAvatar, iniciales } from './compartido';

type Datos = Awaited<ReturnType<typeof getInicio>>;

const COLUMNAS = '1fr 44px 56px 60px';

function Encabezado() {
  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: COLUMNAS,
        gap: '0 10px',
        padding: '9px 20px',
        background: 'var(--arca-surface-2)',
        borderBottom: '1px solid var(--arca-border)',
      }}
    >
      {['Persona', '', 'Abiertas', 'Vencidas'].map((t, i) => (
        <span
          key={i}
          className={`text-[10.5px] font-semibold uppercase ${i > 0 ? 'justify-self-end' : ''}`}
          style={{ letterSpacing: '0.08em', color: 'var(--arca-ink-4)' }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

/** Barra de proporción: cuánto del tablero sostiene esta persona. */
function Proporcion({ parte, tono }: { parte: number; tono: string }) {
  return (
    <span
      className="block h-1.5 w-full rounded-[3px] overflow-hidden"
      style={{ background: 'var(--arca-border)' }}
      aria-hidden
    >
      <span
        className="block h-full rounded-[3px]"
        style={{ width: `${Math.max(4, parte * 100)}%`, background: tono }}
      />
    </span>
  );
}

function Fila({
  children,
  asignado,
  abiertas,
  vencidas,
  parte,
  tono,
  ultima,
  destacada,
}: {
  children: React.ReactNode;
  /** Id del miembro, o `sin_asignar` — el filtro que entiende `listTareas`. */
  asignado: string;
  abiertas: number;
  vencidas: number;
  parte: number;
  tono: string;
  ultima: boolean;
  destacada?: boolean;
}) {
  return (
    <Link
      to="/tareas"
      search={{ asignado }}
      className="grid items-center transition-colors duration-150 hover:bg-[var(--arca-surface-2)]"
      style={{
        gridTemplateColumns: COLUMNAS,
        gap: '0 10px',
        padding: '11px 20px',
        borderBottom: ultima ? undefined : '1px solid var(--arca-border)',
        background: destacada ? 'var(--arca-surface-2)' : undefined,
      }}
    >
      {children}
      <Proporcion parte={parte} tono={tono} />
      <span
        className="text-[15px] font-semibold tabular-nums justify-self-end"
        style={{
          fontFamily: 'var(--ff-display)',
          color: abiertas > 0 ? 'var(--arca-ink)' : 'var(--arca-ink-4)',
        }}
      >
        {abiertas}
      </span>
      <span
        className="text-[13px] tabular-nums justify-self-end"
        style={{
          color:
            vencidas > 0 ? 'var(--arca-accent-neg-fg)' : 'var(--arca-ink-4)',
          fontWeight: vencidas > 0 ? 600 : 400,
        }}
      >
        {vencidas > 0 ? vencidas : '—'}
      </span>
    </Link>
  );
}

export function EquipoCard({ datos }: { datos: Datos }) {
  const conNombre = datos.equipo.filter((e) => e.asignadoA && e.nombre);
  const filaSinAsignar = datos.equipo.find((e) => !e.asignadoA);
  const sinAsignar = filaSinAsignar?.abiertas ?? 0;

  if (conNombre.length === 0 && sinAsignar === 0) return null;

  const total = conNombre.reduce((s, e) => s + e.abiertas, 0) + sinAsignar;
  // El pico manda la escala de las barras, así que la comparación entre
  // personas se lee aunque "sin asignar" se lleve casi todo.
  const pico = Math.max(1, ...datos.equipo.map((e) => e.abiertas));

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
        <span
          className="text-[11.5px] tabular-nums"
          style={{ color: 'var(--arca-ink-4)' }}
        >
          {total} tarea{total !== 1 ? 's' : ''} abierta
          {total !== 1 ? 's' : ''}
        </span>
      </div>

      {conNombre.length === 0 ? (
        <p
          className="text-[12.5px]"
          style={{ color: 'var(--arca-ink-3)', padding: '14px 20px 16px' }}
        >
          Nadie tiene tareas asignadas todavía: las {sinAsignar} están sin
          dueño.
        </p>
      ) : (
        <>
          <Encabezado />
          {conNombre.map((e, i) => (
            <Fila
              key={e.asignadoA}
              asignado={e.asignadoA!}
              abiertas={e.abiertas}
              vencidas={e.vencidas}
              parte={e.abiertas / pico}
              tono="var(--arca-navy-700)"
              ultima={i === conNombre.length - 1 && sinAsignar === 0}
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
            </Fila>
          ))}
        </>
      )}

      {sinAsignar > 0 && (
        <Fila
          asignado="sin_asignar"
          abiertas={sinAsignar}
          vencidas={filaSinAsignar?.vencidas ?? 0}
          parte={sinAsignar / pico}
          tono="var(--arca-chart-3)"
          ultima
          destacada
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <span
              className="size-[22px] rounded-full flex items-center justify-center shrink-0"
              style={{
                border: '1px dashed var(--arca-border-strong)',
                color: 'var(--arca-ink-4)',
                fontSize: 11,
              }}
            >
              ?
            </span>
            <span
              className="text-[13px] truncate"
              style={{ color: 'var(--arca-ink-2)' }}
            >
              Sin asignar
            </span>
          </span>
        </Fila>
      )}
    </div>
  );
}
