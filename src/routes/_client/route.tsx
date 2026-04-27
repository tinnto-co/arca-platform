import { getPortalSession } from '@/actions/client-portal';
import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useLocation,
} from '@tanstack/react-router';
import {
  Home,
  Calendar,
  Bell,
  FileText,
  ClipboardList,
  LogOut,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useNavigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_client')({
  component: ClientPortalLayout,
  beforeLoad: async () => {
    try {
      const portalSession = await getPortalSession();
      return { clientId: portalSession.clientId, access: portalSession.access };
    } catch {
      throw redirect({ to: '/login' });
    }
  },
});

function NavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
}) {
  const { pathname } = useLocation();
  const isActive =
    to === '/portal' ? pathname === '/portal' : pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-white/10 text-white'
          : 'text-white/70 hover:bg-white/5 hover:text-white'
      )}
    >
      <Icon size={16} />
      <span>{label}</span>
    </Link>
  );
}

function ClientPortalLayout() {
  const navigate = useNavigate();

  async function handleLogout() {
    await authClient.signOut();
    navigate({ to: '/login' });
  }

  return (
    <div className="flex h-svh bg-[var(--arca-bg)]">
      {/* Simplified sidebar */}
      <aside className="w-56 shrink-0 flex flex-col bg-[var(--arca-sidebar-bg)] border-r border-white/5 py-4 px-3 gap-1">
        <div className="px-2 mb-4">
          <span className="text-white font-semibold text-sm tracking-tight">
            Portal del Cliente
          </span>
        </div>

        <nav className="flex flex-col gap-0.5 flex-1">
          <NavItem to="/portal" icon={Home} label="Inicio" />
          <NavItem
            to="/portal/vencimientos"
            icon={Calendar}
            label="Vencimientos"
          />
          <NavItem to="/portal/deudas" icon={FileText} label="Deudas" />
          <NavItem
            to="/portal/notificaciones"
            icon={Bell}
            label="Notificaciones"
          />
          <NavItem
            to="/portal/solicitudes"
            icon={ClipboardList}
            label="Solicitudes"
          />
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors mt-auto"
        >
          <LogOut size={16} />
          <span>Salir</span>
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
