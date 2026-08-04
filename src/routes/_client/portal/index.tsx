import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getClientePortalDashboard } from '@/actions/client-portal';
import { Activity, Bell, Check, Upload } from 'lucide-react';

export const Route = createFileRoute('/_client/portal/')({
  component: PortalDashboard,
});

type Dashboard = Awaited<ReturnType<typeof getClientePortalDashboard>>;
type DeudaFila = NonNullable<Dashboard['deudasAbiertas']>[number];
type Actividad = Dashboard['actividad'][number];

/** Filas de deuda visibles antes de tocar "Ver N más". */
const DEUDAS_VISIBLES = 4;

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Las columnas `date` llegan como 'YYYY-MM-DD': partirlas evita el
 * corrimiento de un día que produce `new Date(...)` al interpretarlas en UTC.
 */
function fechaLocal(valor: string): Date {
  const [anio, mes, dia] = valor.slice(0, 10).split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

function fechaCorta(valor: string): string {
  const d = fechaLocal(valor);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function diasHasta(valor: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((fechaLocal(valor).getTime() - hoy.getTime()) / 86_400_000);
}

function pesos(valor: string | number | null): string {
  const n = typeof valor === 'string' ? parseFloat(valor) : (valor ?? 0);
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buen día';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function primerNombre(usuario: string, razonSocial: string): string {
  const base = usuario.trim() || razonSocial.trim();
  return base.split(/\s+/)[0] ?? base;
}

/** "351 - CONTRIBUCIONES SEG. SOCIAL" → código y texto en sentence case. */
function partirCodigo(valor: string): { codigo: string | null; texto: string } {
  const m = valor.trim().match(/^(\d+)\s*-\s*(.+)$/);
  const texto = (m?.[2] ?? valor).trim().toLowerCase();
  return {
    codigo: m?.[1] ?? null,
    texto: texto.charAt(0).toUpperCase() + texto.slice(1),
  };
}

/** Minúscula y en es-AR, como pide el diseño: "hoy, 11:30" · "hace 3 d". */
function tiempoRelativo(iso: string): string {
  const fecha = iso.length <= 10 ? fechaLocal(iso) : new Date(iso);
  const hoy = new Date();
  const dias = Math.round(
    (new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime() -
      new Date(
        fecha.getFullYear(),
        fecha.getMonth(),
        fecha.getDate()
      ).getTime()) /
      86_400_000
  );
  const hora = `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;

  if (iso.length <= 10) {
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'ayer';
    return dias < 30 ? `hace ${dias} d` : fechaCorta(iso);
  }
  if (dias === 0) return `hoy, ${hora}`;
  if (dias === 1) return `ayer, ${hora}`;
  return dias < 30 ? `hace ${dias} d` : fechaCorta(iso);
}

function periodoLegible(periodo: string): string {
  const d = fechaLocal(periodo);
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function PortalDashboard() {
  const { clienteId, estudio } = Route.useRouteContext();
  const [verTodas, setVerTodas] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['portalDashboard', clienteId],
    queryFn: () => getClientePortalDashboard({ data: { clienteId } }),
    enabled: !!clienteId,
    staleTime: 60_000,
  });

  if (isLoading) return <Esqueleto />;
  if (!data) return null;

  const {
    cliente,
    usuario,
    contador,
    proximosVencimientos,
    deudasAbiertas,
    deudaAbiertaTotal,
    deudasAbiertasCantidad,
    deudasVencidas,
    notificacionesSinLeer,
    solicitudesAbiertas,
    actividad,
    ultimaPresentacion,
    datosAfipAt,
    permisos,
  } = data;

  const deudas = deudasAbiertas ?? [];
  const visibles = verTodas ? deudas : deudas.slice(0, DEUDAS_VISIBLES);
  const ocultas = deudas.length - DEUDAS_VISIBLES;
  const proximo = proximosVencimientos[0];
  const conDeuda = permisos.puedeVerDeudas && deudasAbiertasCantidad > 0;

  return (
    <>
      <div className="mb-6">
        <h1 className="font-[family-name:var(--ff-display)] text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-[var(--arca-ink)]">
          {saludo()}, {primerNombre(usuario, cliente.razonSocial)}
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--arca-ink-3)]">
          {permisos.puedeVerDeudas && (
            <>
              {deudasAbiertasCantidad > 0 ? (
                <>
                  Tenés{' '}
                  <Dato>{deudasAbiertasCantidad} obligaciones impagas</Dato>
                </>
              ) : (
                <>No tenés obligaciones impagas</>
              )}{' '}
            </>
          )}
          {proximo ? (
            <>
              {permisos.puedeVerDeudas
                ? 'y el próximo vencimiento es el '
                : 'Tu próximo vencimiento es el '}
              <Dato>{fechaCorta(proximo.venceAt)}</Dato>
            </>
          ) : (
            <>
              {permisos.puedeVerDeudas ? 'y ' : 'No tenés '}
              ningún vencimiento próximo
            </>
          )}
          {solicitudesAbiertas.length > 0 && (
            <>
              {' · '}
              <Link
                to="/portal/solicitudes"
                className="text-[var(--arca-accent-info-fg)] hover:underline"
              >
                {solicitudesAbiertas.length}{' '}
                {solicitudesAbiertas.length === 1
                  ? 'pedido pendiente'
                  : 'pedidos pendientes'}
              </Link>
            </>
          )}
          {datosAfipAt && (
            <>
              {' · datos de AFIP al '}
              <span className="font-[family-name:var(--ff-mono)] tabular-nums">
                {fechaCorta(datosAfipAt.slice(0, 10))}
              </span>
            </>
          )}
        </p>
      </div>

      {/* Situación */}
      <section className="mb-3.5 overflow-hidden rounded-[14px] border border-[var(--arca-border)] bg-[var(--arca-surface)]">
        <div className="flex flex-wrap justify-between gap-4 gap-y-3.5 px-6 pt-5 pb-[18px]">
          <div>
            <MicroLabel>
              {permisos.puedeVerDeudas ? 'Deuda abierta' : 'Situación'}
            </MicroLabel>
            {permisos.puedeVerDeudas ? (
              <p
                className="font-[family-name:var(--ff-display)] text-[34px] font-semibold leading-[1.05] tracking-[-0.025em] tabular-nums"
                style={{
                  color: conDeuda
                    ? 'var(--arca-accent-neg-fg)'
                    : 'var(--arca-ink)',
                }}
              >
                {conDeuda ? pesos(deudaAbiertaTotal) : 'Sin deuda abierta'}
              </p>
            ) : (
              <p className="font-[family-name:var(--ff-display)] text-[34px] font-semibold leading-[1.05] tracking-[-0.025em] text-[var(--arca-ink)]">
                Al día
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {conDeuda ? (
                <>
                  {deudasVencidas > 0 && (
                    <Pildora tono="neg">{deudasVencidas} vencidas</Pildora>
                  )}
                  <span className="text-xs text-[var(--arca-ink-3)]">
                    saldo consolidado AFIP
                  </span>
                </>
              ) : (
                permisos.puedeVerDeudas && <Pildora tono="pos">Al día</Pildora>
              )}
            </div>
          </div>

          <div className="flex flex-none flex-wrap gap-x-[22px] gap-y-3">
            <DatoSecundario
              label="Próximo vencimiento"
              valor={proximo ? fechaCorta(proximo.venceAt) : 'Sin vencimientos'}
              nota={
                proximo
                  ? partirCodigo(proximo.impuesto).texto
                  : 'ninguno pendiente'
              }
            />
            <DatoSecundario
              label="Novedades"
              valor={
                notificacionesSinLeer > 0
                  ? `${notificacionesSinLeer} sin leer`
                  : 'Sin novedades'
              }
              nota={
                notificacionesSinLeer > 0
                  ? 'notificaciones de AFIP'
                  : 'leídas hasta hoy'
              }
            />
          </div>
        </div>

        {conDeuda && (
          <>
            <ul className="border-t border-[var(--arca-border)]">
              {visibles.map((d) => (
                <FilaDeuda key={d.id} deuda={d} />
              ))}
            </ul>
            {ocultas > 0 && (
              <button
                onClick={() => setVerTodas((v) => !v)}
                className="w-full border-b border-[var(--arca-border)] bg-[var(--arca-surface)] px-6 py-[11px] text-center text-[12.5px] font-medium text-[var(--arca-ink-2)] transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)]"
              >
                {verTodas ? 'Ver menos' : `Ver ${ocultas} más`}
              </button>
            )}
          </>
        )}

        <div className="flex flex-wrap justify-between gap-y-1.5 border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-6 py-3">
          <span className="text-[11.5px] text-[var(--arca-ink-3)]">
            {ultimaPresentacion ? (
              <>
                Última presentación:{' '}
                <span className="font-[family-name:var(--ff-mono)] tabular-nums">
                  {fechaCorta(ultimaPresentacion)}
                </span>
              </>
            ) : (
              'Sin presentaciones registradas'
            )}
          </span>
          {permisos.puedeVerDeudas && (
            <Link
              to="/portal/deudas"
              className="text-[12.5px] font-medium text-[var(--arca-ink-2)] transition-colors duration-[120ms] hover:text-[var(--arca-ink)]"
            >
              {deudasAbiertasCantidad > deudas.length
                ? `Ver las ${deudasAbiertasCantidad} deudas →`
                : 'Ver detalle de deudas →'}
            </Link>
          )}
        </div>
      </section>

      <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(330px,1fr))]">
        <section className="overflow-hidden rounded-[14px] border border-[var(--arca-border)] bg-[var(--arca-surface)]">
          <div className="flex flex-wrap items-center justify-between gap-y-1.5 px-5 pt-4 pb-3.5">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-[var(--arca-ink-3)]" />
              <h2 className="font-[family-name:var(--ff-display)] text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]">
                Actividad reciente
              </h2>
            </div>
            <Link
              to="/portal/notificaciones"
              className="text-[12.5px] font-medium text-[var(--arca-ink-2)] transition-colors duration-[120ms] hover:text-[var(--arca-ink)]"
            >
              Ver todo →
            </Link>
          </div>
          {actividad.length === 0 ? (
            <p className="px-5 pb-5 text-[13px] text-[var(--arca-ink-3)]">
              Todavía no hay movimientos para mostrar.
            </p>
          ) : (
            <ul>
              {actividad.map((a, i) => (
                <FilaActividad
                  key={`${a.tipo}-${a.at}-${i}`}
                  item={a}
                  ultima={i === actividad.length - 1}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[14px] bg-[var(--arca-navy-900)] px-[22px] pt-5 pb-[18px] text-[var(--arca-bg)]">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[rgba(247,246,242,0.45)]">
            Tu contador
          </p>
          <div className="mt-3 flex items-center gap-[11px]">
            <span
              className="size-[38px] shrink-0 rounded-full"
              style={{
                background: 'linear-gradient(140deg, #1E3460, #C2A878)',
              }}
            />
            <div className="min-w-0">
              <p className="font-[family-name:var(--ff-display)] text-base font-semibold tracking-[-0.015em]">
                {contador?.nombre ?? estudio ?? 'Tu estudio'}
              </p>
              <p className="text-xs text-[rgba(247,246,242,0.55)]">
                {contador?.estudio ?? estudio} · responde en el día
              </p>
            </div>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[rgba(247,246,242,0.7)] text-pretty">
            ¿Dudas con alguna deuda o querés un plan de pago? Escribile directo,
            sin formularios.
          </p>
          <div className="mt-3.5 flex flex-col gap-2">
            <a
              href={
                contador?.email
                  ? `mailto:${contador.email}?subject=${encodeURIComponent(`Consulta — ${cliente.razonSocial} (${cliente.cuit})`)}`
                  : '#'
              }
              className="flex h-9 items-center justify-center rounded-[10px] bg-[var(--arca-bg)] text-[13px] font-semibold text-[var(--arca-ink)] transition-colors duration-[120ms] hover:bg-white"
            >
              Enviar consulta
            </a>
            <Link
              to="/portal/solicitudes"
              className="flex h-[34px] items-center justify-center rounded-[10px] border border-white/[0.14] text-[12.5px] font-medium text-[var(--arca-bg)] transition-colors duration-[120ms] hover:bg-white/[0.06]"
            >
              Pedir un comprobante
            </Link>
          </div>
          {contador?.email && (
            <div className="mt-3.5 border-t border-white/[0.08] pt-3">
              <span className="font-[family-name:var(--ff-mono)] text-[11.5px] text-[rgba(247,246,242,0.5)]">
                {contador.email}
              </span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Dato({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-[var(--arca-ink)]">{children}</span>;
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-3)]">
      {children}
    </p>
  );
}

function Pildora({
  tono,
  children,
}: {
  tono: 'neg' | 'warn' | 'pos' | 'info';
  children: React.ReactNode;
}) {
  return (
    <span
      className="rounded-[20px] px-[9px] py-0.5 text-[11px] font-medium"
      style={{
        color: `var(--arca-accent-${tono}-fg)`,
        background: `var(--arca-accent-${tono}-bg)`,
      }}
    >
      {children}
    </span>
  );
}

function DatoSecundario({
  label,
  valor,
  nota,
}: {
  label: string;
  valor: string;
  nota: string;
}) {
  return (
    <div>
      <MicroLabel>{label}</MicroLabel>
      <p className="font-[family-name:var(--ff-display)] text-[17px] font-semibold tracking-[-0.015em] text-[var(--arca-ink)] tabular-nums">
        {valor}
      </p>
      <p className="text-[11.5px] text-[var(--arca-ink-4)]">{nota}</p>
    </div>
  );
}

function FilaDeuda({ deuda }: { deuda: DeudaFila }) {
  const impuesto = partirCodigo(deuda.impuesto);
  const concepto = partirCodigo(deuda.concepto);
  const dias = deuda.venceAt ? diasHasta(deuda.venceAt) : null;

  const etiqueta =
    dias === null
      ? null
      : dias < 0
        ? { tono: 'neg' as const, texto: 'Vencida' }
        : { tono: 'warn' as const, texto: `Vence en ${dias} d` };

  return (
    <li className="grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-[var(--arca-border)] px-6 py-[13px] transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)]">
      <span className="font-[family-name:var(--ff-mono)] text-[11.5px] text-[#C9C7BF] tabular-nums">
        {impuesto.codigo ?? '—'}
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-[var(--arca-ink)] text-pretty">
          {impuesto.texto}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] text-[var(--arca-ink-3)]">
            {concepto.codigo
              ? `${concepto.codigo} — ${concepto.texto}`
              : concepto.texto}
            {deuda.periodo && ` · ${periodoLegible(deuda.periodo)}`}
          </span>
          {etiqueta && (
            <span
              className="rounded-[20px] px-2 py-px text-[10.5px] font-medium"
              style={{
                color: `var(--arca-accent-${etiqueta.tono}-fg)`,
                background: `var(--arca-accent-${etiqueta.tono}-bg)`,
              }}
            >
              {etiqueta.texto}
            </span>
          )}
          {deuda.intimada && (
            <span
              className="rounded-[20px] px-2 py-px text-[10.5px] font-medium"
              style={{
                color: 'var(--arca-accent-info-fg)',
                background: 'var(--arca-accent-info-bg)',
              }}
            >
              Intimada
            </span>
          )}
        </div>
      </div>
      <span className="whitespace-nowrap text-sm font-semibold text-[var(--arca-ink)] tabular-nums">
        {pesos(deuda.saldo)}
      </span>
    </li>
  );
}

const ACTIVIDAD_ESTILO = {
  presentacion: { tono: 'pos', Icono: Check },
  comprobantes: { tono: 'info', Icono: Upload },
  notificacion: { tono: 'warn', Icono: Bell },
} as const;

function FilaActividad({ item, ultima }: { item: Actividad; ultima: boolean }) {
  const { tono, Icono } = ACTIVIDAD_ESTILO[item.tipo];

  // Redactado desde el estudio y en lo que el cliente gana, no en jerga.
  const texto =
    item.tipo === 'presentacion'
      ? {
          titulo:
            `Presentamos tu DDJJ de IVA de ${item.periodo ? periodoLegible(item.periodo) : ''}`.trim(),
          sub: 'F. 2002 · acuse recibido',
        }
      : item.tipo === 'comprobantes'
        ? {
            titulo: `Cargamos ${item.cantidad} comprobantes nuevos`,
            sub: 'sincronizados con AFIP',
          }
        : {
            titulo: 'Te llegó una notificación de AFIP',
            sub: item.detalle ?? '',
          };

  return (
    <li
      className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 ${ultima ? '' : 'border-b border-[var(--arca-border)]'}`}
    >
      <span
        className="flex size-7 items-center justify-center rounded-[7px]"
        style={{ background: `var(--arca-accent-${tono}-bg)` }}
      >
        <Icono size={14} style={{ color: `var(--arca-accent-${tono}-fg)` }} />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] text-[var(--arca-ink)] text-pretty">
          {texto.titulo}
        </p>
        {texto.sub && (
          <p className="truncate text-[11.5px] text-[var(--arca-ink-4)]">
            {texto.sub}
          </p>
        )}
      </div>
      <span className="whitespace-nowrap text-[11.5px] text-[var(--arca-ink-4)]">
        {tiempoRelativo(item.at)}
      </span>
    </li>
  );
}

/** Mantiene la altura de la tarjeta principal para que el número no salte. */
function Esqueleto() {
  return (
    <div className="animate-pulse">
      <div className="mb-6">
        <div className="h-[34px] w-72 rounded-md bg-[var(--arca-border)]" />
        <div className="mt-2 h-4 w-96 rounded-md bg-[var(--arca-border)]" />
      </div>
      <div className="mb-3.5 h-[340px] rounded-[14px] border border-[var(--arca-border)] bg-[var(--arca-surface)]" />
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(330px,1fr))]">
        <div className="h-[220px] rounded-[14px] border border-[var(--arca-border)] bg-[var(--arca-surface)]" />
        <div className="h-[220px] rounded-[14px] bg-[var(--arca-navy-900)]" />
      </div>
    </div>
  );
}
