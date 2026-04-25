import * as React from 'react';
import {
  Home,
  LogOut,
  Search,
  Plus,
  Users,
  Bell,
  Clock,
  FileText,
  DollarSign,
  Calendar,
  BarChart2,
  Settings,
  ChevronDown,
  ChevronsUpDown,
  Check,
  Building,
  User,
  Bot,
  AlertTriangle,
  Landmark,
  BookOpen,
} from 'lucide-react';

import { Sidebar, SidebarRail, useSidebar } from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { CreateClientDialog } from './create-client-dialog';
import { useOrgSwitch } from '@/contexts/org-switch-context';
import { useQueryClient } from '@tanstack/react-query';
import { userQuery } from '../lib/user-query';
import { getPendingNotificationsCount } from '@/actions/dashboard';
import { listAlerts } from '@/actions/alert';
import { cn } from '@/lib/utils';

export { userQuery };

interface ListedOrg {
  id: string;
  name: string;
  slug?: string | null;
  logo?: string | null;
}

/* ─── Nav item ─── */
function NavItem({
  to,
  icon: Icon,
  label,
  count,
  urgentCount,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  count?: number | string;
  urgentCount?: number;
}) {
  const { pathname } = useLocation();
  const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to);

  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-[7px] rounded-[10px] relative text-[13px] font-medium cursor-pointer transition-colors duration-[120ms] select-none',
        isActive
          ? 'bg-[rgba(255,255,255,0.06)] text-white'
          : 'text-[#C6C9D3] hover:bg-[rgba(255,255,255,0.04)] hover:text-[#F2F3F7]'
      )}
    >
      {/* Active left rail */}
      {isActive && (
        <span className="absolute left-[-12px] top-2 bottom-2 w-0.5 rounded-sm bg-[#F7F6F2]" />
      )}
      <Icon className="w-[15px] h-[15px] shrink-0" strokeWidth={2} />
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {urgentCount != null && urgentCount > 0 && (
        <span
          className="inline-flex items-center h-4 px-1.5 rounded-lg text-white text-[10px] font-semibold leading-none"
          style={{ background: 'oklch(0.60 0.15 25)' }}
        >
          {urgentCount}
        </span>
      )}
      {count != null && !urgentCount && (
        <span className="font-mono text-[11px] text-[#8A8F9E]">{count}</span>
      )}
    </Link>
  );
}

/* ─── Nav group label ─── */
function NavGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-semibold text-[#6E7283] uppercase tracking-[0.08em] px-2.5 pt-3.5 pb-1.5">
      {children}
    </div>
  );
}

/* ─── Main sidebar ─── */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isMobile } = useSidebar();
  const { data: user } = useQuery(userQuery);
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: organizations } = authClient.useListOrganizations();
  const { runOrgSwitch } = useOrgSwitch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isOwner = user?.organizationRole === 'owner';
  const isViewer = user?.organizationRole === 'viewer';

  const { data: notifData } = useQuery({
    queryKey: ['pendingNotificationsCount'],
    queryFn: () => getPendingNotificationsCount(),
  });
  const notifCount = notifData?.count ?? 0;

  const { data: openAlerts = [] } = useQuery({
    queryKey: ['alerts', 'open', '', '', ''],
    queryFn: () => listAlerts({ data: { status: 'open', limit: 99 } }),
    staleTime: 60_000,
  });
  const openAlertsCount = (openAlerts as unknown[]).length;

  const displayName = user?.organizationName ?? activeOrg?.name ?? 'Workspace';
  const displaySlug = user?.organizationSlug ?? activeOrg?.slug ?? '';
  const displayLogo = user?.organizationLogo ?? activeOrg?.logo ?? null;

  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase();

  const userInitials = (user?.name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase();

  const handleSwitchOrg = async (orgId: string) => {
    const currentId = user?.activeOrganizationId ?? activeOrg?.id;
    if (orgId === currentId) return;
    const target = (organizations as ListedOrg[] | undefined)?.find(
      (o) => o.id === orgId
    );
    if (!target) return;
    await runOrgSwitch(
      {
        fromName: user?.organizationName ?? activeOrg?.name ?? '',
        fromLogo: user?.organizationLogo ?? activeOrg?.logo ?? null,
        toName: target.name,
        toLogo: target.logo ?? null,
      },
      async () => {
        await authClient.organization.setActive({ organizationId: orgId });
        await queryClient.invalidateQueries();
        await navigate({ to: '/' });
      }
    );
  };

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      {/* ─── Inner navy shell ─── */}
      <div
        className="flex flex-col h-full px-3 py-3.5 gap-1"
        style={{ background: 'var(--arca-navy-900)', color: '#E8E9EE' }}
      >
        {/* Workspace switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 px-2 py-2 rounded-[10px] w-full text-left hover:bg-[rgba(255,255,255,0.04)] transition-colors duration-[150ms] group">
              {/* Logo tile */}
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-bold shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #F7F6F2, #E8E4D6)',
                  color: 'var(--arca-navy-900)',
                  letterSpacing: '-0.02em',
                  fontFamily: 'var(--ff-display)',
                }}
              >
                {displayLogo ? (
                  <img
                    src={displayLogo}
                    alt=""
                    className="w-8 h-8 rounded-lg object-cover"
                  />
                ) : (
                  initials || <Building className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[#F2F3F7] tracking-[-0.01em] truncate">
                  {displayName}
                </div>
                <div
                  className="text-[11.5px] text-[#8A8F9E] truncate"
                  style={{ fontFamily: 'var(--ff-mono)' }}
                >
                  {displaySlug}
                </div>
              </div>
              <ChevronsUpDown className="w-3.5 h-3.5 text-[#8A8F9E] shrink-0" />
            </button>
          </DropdownMenuTrigger>
          {organizations && (organizations as ListedOrg[]).length > 1 && (
            <DropdownMenuContent
              className="min-w-56 rounded-lg"
              align="start"
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Organizaciones
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(organizations as ListedOrg[]).map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleSwitchOrg(org.id)}
                  className="gap-2"
                >
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-sm border overflow-hidden">
                    {org.logo ? (
                      <img
                        src={org.logo}
                        alt=""
                        className="size-6 object-cover"
                      />
                    ) : (
                      <Building className="size-4" />
                    )}
                  </div>
                  <span className="truncate">{org.name}</span>
                  {(org.id === user?.activeOrganizationId ||
                    org.id === activeOrg?.id) && (
                    <Check className="ml-auto size-4" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>

        {/* Search */}
        <div
          className="flex items-center gap-2 px-2.5 py-[7px] rounded-[10px] text-[12.5px] text-[#8A8F9E] mt-2.5 mb-1.5 cursor-pointer hover:bg-[rgba(255,255,255,0.04)] transition-colors duration-[120ms]"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <Search className="w-[13px] h-[13px] shrink-0" strokeWidth={2} />
          <span className="flex-1">Buscar</span>
          <kbd
            className="text-[10.5px] text-[#B3B7C2] rounded px-[5px] py-px"
            style={{
              fontFamily: 'var(--ff-mono)',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            ⌘K
          </kbd>
        </div>

        {/* Crear nuevo CTA */}
        {!isViewer && (
          <CreateClientDialog>
            <button
              className="flex items-center gap-2 px-3 py-[9px] rounded-[10px] w-full text-[13px] font-semibold mb-3 transition-colors duration-[120ms]"
              style={{ background: '#F7F6F2', color: 'var(--arca-navy-900)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#fff')}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = '#F7F6F2')
              }
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.2} />
              Crear nuevo
            </button>
          </CreateClientDialog>
        )}

        {/* ─── Nav ─── */}
        <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto overflow-x-visible min-h-0">
          <NavItem to="/" icon={Home} label="Inicio" />

          <NavGroupLabel>Plataforma</NavGroupLabel>

          <NavItem to="/clients" icon={Users} label="Clientes" />
          <NavItem
            to="/notifications"
            icon={Bell}
            label="Notificaciones"
            urgentCount={notifCount}
          />
          <NavItem to="/jobs" icon={Clock} label="Trabajos" />
          <NavItem to="/invoices" icon={FileText} label="Facturas" />
          <NavItem to="/sueldos" icon={DollarSign} label="Sueldos" />
          <NavItem to="/vencimientos" icon={Calendar} label="Vencimientos" />
          <NavItem
            to="/alerts"
            icon={AlertTriangle}
            label="Alertas"
            urgentCount={openAlertsCount}
          />
          <NavItem to="/bank" icon={Landmark} label="Banco" />
          <NavItem to="/accounting" icon={BookOpen} label="Contabilidad" />
          <NavItem to="/analytics" icon={BarChart2} label="Analytics" />
          <NavItem to="/chat" icon={Bot} label="Chats" />

          <NavGroupLabel>Cuenta</NavGroupLabel>

          {isOwner && (
            <NavItem to="/admin" icon={Settings} label="Administración" />
          )}
        </nav>

        {/* ─── Footer: user card ─── */}
        <div
          className="mt-auto pt-2.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 w-full px-2 py-2 rounded-[10px] hover:bg-[rgba(255,255,255,0.04)] transition-colors duration-[120ms] text-left">
                {/* User avatar */}
                <div
                  className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #2A4680, #C2A878)',
                    color: '#F7F6F2',
                  }}
                >
                  {user?.image ? (
                    <img
                      src={user.image}
                      alt=""
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    userInitials
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-[#F2F3F7] truncate">
                    {user?.name}
                  </div>
                  <div className="text-[11px] text-[#8A8F9E] truncate">
                    {user?.email}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[#8A8F9E] shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56 rounded-lg"
              side={isMobile ? 'bottom' : 'right'}
              align="end"
              sideOffset={4}
            >
              <Link to="/profile">
                <DropdownMenuItem className="gap-2">
                  <User className="size-4" />
                  Perfil
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-destructive"
                onClick={async () => {
                  await authClient.signOut();
                  await navigate({ to: '/login' });
                }}
              >
                <LogOut className="size-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <SidebarRail />
    </Sidebar>
  );
}
