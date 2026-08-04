import { getPortalSession } from '@/actions/client-portal';
import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useLocation,
  useNavigate,
} from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/_client')({
  component: ClientPortalLayout,
  beforeLoad: async () => {
    try {
      const portalSession = await getPortalSession();
      return {
        clienteId: portalSession.clienteId,
        access: portalSession.access,
        usuario: portalSession.usuario,
        estudio: portalSession.estudio,
        cliente: portalSession.cliente,
      };
    } catch {
      throw redirect({ to: '/login' });
    }
  },
});

/** El logo del estudio todavía no existe como archivo: se arma con sus iniciales. */
function iniciales(nombre: string): string {
  return nombre
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function ClientPortalLayout() {
  const { estudio, cliente } = Route.useRouteContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const enInicio = pathname === '/portal';

  async function handleLogout() {
    await authClient.signOut();
    navigate({ to: '/login' });
  }

  return (
    <div className="min-h-svh bg-[var(--arca-bg)]">
      <header className="sticky top-0 z-[5] bg-[var(--arca-bg)] border-b border-[var(--arca-border)]">
        <div className="mx-auto max-w-[1080px] px-8 min-h-[60px] flex items-center justify-between flex-wrap gap-x-4 gap-y-3">
          <div className="flex items-center gap-2.5">
            {enInicio ? (
              <span
                className="size-[26px] rounded-[7px] flex items-center justify-center text-[10px] font-semibold text-white"
                style={{
                  background:
                    'linear-gradient(140deg, var(--arca-navy-700), #C2A878)',
                }}
              >
                {iniciales(estudio ?? 'Estudio')}
              </span>
            ) : (
              <Link
                to="/portal"
                className="size-[26px] rounded-[7px] flex items-center justify-center text-[var(--arca-ink-3)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)]"
                aria-label="Volver al inicio"
              >
                <ArrowLeft size={14} />
              </Link>
            )}
            <span className="font-[family-name:var(--ff-display)] text-sm font-semibold tracking-[-0.01em] text-[var(--arca-ink)]">
              Portal del cliente
            </span>
            {estudio && (
              <>
                <span className="text-[var(--arca-ink-4)]">·</span>
                <span className="text-xs text-[var(--arca-ink-3)]">
                  {estudio}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="h-8 px-3 flex items-center gap-2 rounded-[10px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[12.5px] font-medium text-[var(--arca-ink)]">
              <span className="truncate max-w-[220px]">
                {cliente.razonSocial}
              </span>
              <span className="font-[family-name:var(--ff-mono)] text-[11px] text-[var(--arca-ink-4)] tabular-nums">
                {cliente.cuit}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="h-8 px-3 rounded-[10px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[12.5px] font-medium text-[var(--arca-ink)] transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)]"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-8 pt-8 pb-[60px]">
        <Outlet />
      </main>
    </div>
  );
}
