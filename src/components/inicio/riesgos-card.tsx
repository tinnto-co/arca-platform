/**
 * Riesgos: lo que AFIP le dice al estudio, con la regla a la vista.
 * Dos secciones: intimaciones/requerimientos sin resolver y monotributistas
 * cerca del tope. El sub siempre lleva el dato temporal, nunca solo el
 * recuento.
 */
import { Link } from '@tanstack/react-router';
import type { getInicio } from '@/actions/inicio';
import { usoDelTope } from '@/lib/monotributo-escala';
import { fechaCorta, haceDias, pesos } from './compartido';

type Datos = Awaited<ReturnType<typeof getInicio>>;

/** Umbral de la card de monotributo. Configuración de estudio a futuro. */
export const UMBRAL_MONOTRIBUTO = 0.8;
const UMBRAL_CRITICO = 0.95;
/** Una intimación sin responder más vieja que esto es crítica. */
const DIAS_CRITICO = 7;

const CATEGORIAS: {
  clave: string;
  titulo: string;
  punto: string;
  conteo: string;
}[] = [
  {
    clave: 'intimacion',
    titulo: 'Intimaciones',
    punto: 'var(--arca-accent-neg)',
    conteo: 'var(--arca-accent-neg-fg)',
  },
  {
    clave: 'inspeccion',
    titulo: 'Fiscalización / inspección',
    punto: 'var(--arca-accent-warn)',
    conteo: 'var(--arca-ink)',
  },
  {
    clave: 'requerimiento',
    titulo: 'Requerimientos de DDJJ',
    punto: 'var(--arca-ink-4)',
    conteo: 'var(--arca-ink-3)',
  },
];

function colorBarra(uso: number): string {
  if (uso >= UMBRAL_CRITICO) return 'var(--arca-accent-neg)';
  if (uso >= 0.85) return 'var(--arca-accent-warn)';
  return 'var(--arca-chart-3)';
}

function EncabezadoSeccion({
  label,
  derecha,
}: {
  label: string;
  derecha: string;
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: '9px 20px', background: 'var(--arca-surface-2)' }}
    >
      <span
        className="text-[10.5px] font-semibold uppercase"
        style={{ letterSpacing: '0.08em', color: 'var(--arca-ink-3)' }}
      >
        {label}
      </span>
      <span
        className="text-[11px] tabular-nums"
        style={{ color: 'var(--arca-ink-4)' }}
      >
        {derecha}
      </span>
    </div>
  );
}

export function RiesgosCard({ datos, ahora }: { datos: Datos; ahora: Date }) {
  const filas = CATEGORIAS.map((c) => ({
    ...c,
    datos: datos.notificaciones.find((n) => n.categoria === c.clave),
  })).filter((c) => c.datos && c.datos.total > 0);

  const sinLeer = filas.reduce((s, f) => s + (f.datos?.sinLeer ?? 0), 0);
  const criticasNotif = filas.reduce((s, f) => s + (f.datos?.criticas ?? 0), 0);

  const monos = datos.monotributo
    .map((m) => ({
      ...m,
      ...usoDelTope(Number(m.facturacion12m), m.categoria),
    }))
    .filter((m) => m.uso !== null && m.uso >= UMBRAL_MONOTRIBUTO)
    .sort((a, b) => (b.uso ?? 0) - (a.uso ?? 0));

  const criticos =
    criticasNotif + monos.filter((m) => (m.uso ?? 0) >= UMBRAL_CRITICO).length;

  if (filas.length === 0 && monos.length === 0) {
    return (
      <div
        className="bg-white border rounded-[14px]"
        style={{ borderColor: 'var(--arca-border)' }}
      >
        <div style={{ padding: '16px 20px 14px' }}>
          <h2
            className="text-[15px] font-semibold"
            style={{
              fontFamily: 'var(--ff-display)',
              color: 'var(--arca-ink)',
            }}
          >
            Riesgos
          </h2>
        </div>
        <p
          className="text-[12.5px]"
          style={{ color: 'var(--arca-ink-4)', padding: '0 20px 20px' }}
        >
          Sin intimaciones abiertas ni monotributistas cerca del tope.
        </p>
      </div>
    );
  }

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
          Riesgos
        </h2>
        {criticos > 0 && (
          <span
            className="text-[11px] font-medium rounded-[20px] tabular-nums"
            style={{
              background: 'var(--arca-accent-neg-bg)',
              color: 'var(--arca-accent-neg-fg)',
              padding: '4px 10px',
            }}
          >
            {criticos} crítico{criticos !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* La regla que hace verificable el número de arriba. */}
      <p
        className="text-[11.5px] border-b"
        style={{
          padding: '9px 20px',
          background: 'var(--arca-surface-2)',
          color: 'var(--arca-ink-3)',
          borderColor: 'var(--arca-border)',
        }}
      >
        Crítico: intimación del mes pasado en adelante (o sin leer) sin
        responder hace +{DIAS_CRITICO} d, o monotributo sobre el{' '}
        {UMBRAL_CRITICO * 100}% del tope
      </p>

      {filas.length > 0 && (
        <>
          <EncabezadoSeccion
            label="Intimaciones AFIP"
            derecha={`${sinLeer} sin leer${criticasNotif > 0 ? ` · ${criticasNotif} crítica${criticasNotif !== 1 ? 's' : ''}` : ''}`}
          />
          {filas.map((f) => {
            const d = f.datos!;
            const partes = [
              `${d.empresas} empresa${d.empresas !== 1 ? 's' : ''}`,
              d.proximoVenceAt
                ? `vence ${fechaCorta(d.proximoVenceAt)}`
                : d.masViejaAt
                  ? `la más vieja ${haceDias(d.masViejaAt, ahora)}`
                  : null,
            ].filter(Boolean);
            return (
              <Link
                key={f.clave}
                to="/notifications"
                search={{ categoria: f.clave }}
                className="flex items-center gap-[11px] border-b transition-colors duration-150 hover:bg-[var(--arca-surface-2)]"
                style={{
                  padding: '13px 20px',
                  borderColor: 'var(--arca-border)',
                }}
              >
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ background: f.punto }}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[13px] font-semibold"
                    style={{ color: 'var(--arca-ink)' }}
                  >
                    {f.titulo}
                  </div>
                  <div
                    className="text-[11.5px] truncate"
                    style={{ color: 'var(--arca-ink-3)' }}
                  >
                    {partes.join(' · ')}
                  </div>
                </div>
                <span
                  className="text-[17px] font-bold tabular-nums shrink-0"
                  style={{ fontFamily: 'var(--ff-display)', color: f.conteo }}
                >
                  {d.total}
                </span>
              </Link>
            );
          })}
        </>
      )}

      {monos.length > 0 && (
        <>
          <EncabezadoSeccion
            label="Monotributo · cerca del tope"
            derecha={`${monos.length} de ${datos.monotributo.length}`}
          />
          {monos.slice(0, 3).map((m) => (
            <Link
              key={m.clienteId}
              to="/iva"
              className="flex flex-col gap-[7px] border-b transition-colors duration-150 hover:bg-[var(--arca-surface-2)]"
              style={{
                padding: '13px 20px',
                borderColor: 'var(--arca-border)',
              }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className="text-[13px] font-semibold truncate"
                  style={{ color: 'var(--arca-ink)' }}
                >
                  {m.razonSocial}
                </span>
                <span
                  className="text-[12px] font-semibold tabular-nums shrink-0"
                  style={{ color: colorBarra(m.uso!) }}
                >
                  {Math.round(m.uso! * 100)}%
                </span>
              </div>
              <div
                className="h-1.5 rounded-[3px] overflow-hidden"
                style={{ background: '#F7F6F2' }}
              >
                <div
                  className="h-full rounded-[3px]"
                  style={{
                    width: `${Math.min(100, m.uso! * 100)}%`,
                    background: colorBarra(m.uso!),
                  }}
                />
              </div>
              <span
                className="text-[11.5px] tabular-nums"
                style={{ color: 'var(--arca-ink-3)' }}
              >
                Cat. {m.categoria}
                {m.esEstimada ? ' (estimada)' : ''} ·{' '}
                {pesos(Number(m.facturacion12m))} de {pesos(m.tope!)} · 12 meses
              </span>
            </Link>
          ))}
          <div
            className="flex items-center justify-between"
            style={{
              padding: '12px 20px',
              background: 'var(--arca-surface-2)',
            }}
          >
            <span
              className="text-[11.5px]"
              style={{ color: 'var(--arca-ink-3)' }}
            >
              Umbral de alerta: {UMBRAL_MONOTRIBUTO * 100}%
            </span>
            <Link
              to="/iva"
              className="text-[12px] font-medium hover:underline"
              style={{ color: 'var(--arca-ink)' }}
            >
              Ver todos →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
