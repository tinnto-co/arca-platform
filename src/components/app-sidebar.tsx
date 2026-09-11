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
  AlertTriangle,
  Landmark,
  BookOpen,
  Globe,
  Percent,
  Database,
  ClipboardList,
  ChevronRight,
} from 'lucide-react';

import { Sidebar, SidebarRail, useSidebar } from '@/components/ui/sidebar';
import { OrbeAsistente } from '@/components/agent/orbe';
import { useAtajo } from '@/lib/tecla-modificador';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PanelLeft } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { CreateRepresentativeDialog } from './create-client-dialog';
import { useOrgSwitch } from '@/contexts/org-switch-context';
import { useQueryClient } from '@tanstack/react-query';
import { userQuery } from '../lib/user-query';
import { getPendingNotificationsCount } from '@/actions/dashboard';
import { listAlerts } from '@/actions/alert';
import { listOrgModules } from '@/actions/admin';
import { getFuentesDatos } from '@/actions/job';
import { relativeTime } from '@/components/dashboard/shared';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useClienteSeleccionado } from '@/lib/cliente-seleccionado';
import { cn } from '@/lib/utils';

export { userQuery };

/**
 * `colapsado` sólo tiene sentido en escritorio: en mobile el sidebar se abre
 * como hoja a ancho completo y siempre muestra todo.
 */
function useShellSidebar() {
  const { state, isMobile, toggleSidebar } = useSidebar();
  return { colapsado: state === 'collapsed' && !isMobile, toggleSidebar };
}

/** Abre y cierra el panel. Visible en los dos estados. */
function BotonColapsar() {
  const { colapsado, toggleSidebar } = useShellSidebar();
  const atajo = useAtajo('B');

  const boton = (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={colapsado ? 'Abrir el menú' : 'Cerrar el menú'}
      className={cn(
        'grid place-items-center rounded-lg text-[var(--arca-sidebar-muted)] transition-colors duration-[150ms]',
        'hover:bg-[rgba(255,255,255,0.06)] hover:text-white',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--arca-accent-light)]',
        colapsado ? 'size-9 mx-auto' : 'size-7 shrink-0'
      )}
    >
      <PanelLeft className="size-4" />
    </button>
  );

  if (!colapsado) return boton;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{boton}</TooltipTrigger>
      <TooltipContent side="right" className="text-[12.5px]">
        Abrir el menú · {atajo}
      </TooltipContent>
    </Tooltip>
  );
}

interface ListedOrg {
  id: string;
  name: string;
  slug?: string | null;
  logo?: string | null;
}

/** El orbe hace de ícono de "Chats": es la firma del asistente. */
function IconoOrbe({ className }: { className?: string }) {
  return <OrbeAsistente size={13} className={className} />;
}

/* ─── Nav item ─── */

/**
 * Colapsado el sidebar mide 56px: entra el ícono y nada más. El label pasa al
 * tooltip y el badge se reduce a un punto —el número no se lee a ese tamaño,
 * pero "hay algo" sí se ve.
 */
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
  const { colapsado } = useShellSidebar();
  const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to);
  const hayUrgentes = urgentCount != null && urgentCount > 0;

  const enlace = (
    <Link
      to={to}
      aria-label={colapsado ? label : undefined}
      className={cn(
        'flex shrink-0 items-center rounded-lg relative text-[13px] font-medium cursor-pointer transition-colors duration-[120ms] select-none',
        colapsado ? 'justify-center size-9 mx-auto' : 'h-[34px] gap-2.5 px-2.5',
        isActive
          ? 'bg-[var(--arca-sidebar-active)] text-white'
          : 'text-[var(--arca-sidebar-fg)] hover:bg-[rgba(255,255,255,0.04)] hover:text-white'
      )}
    >
      {/* Riel izquierdo del activo: el detalle más distintivo del sistema.
          Colapsado no hay margen donde ponerlo. */}
      {isActive && !colapsado && (
        <span className="absolute left-[-12px] top-1.5 bottom-1.5 w-[3px] rounded-sm bg-[var(--arca-sidebar-active-rail)]" />
      )}

      <span className="relative shrink-0">
        <Icon
          className={cn(
            'w-[15px] h-[15px]',
            isActive && 'text-[var(--arca-sidebar-active-icon)]'
          )}
          strokeWidth={2}
        />
        {colapsado && hayUrgentes && (
          <span className="absolute -top-1 -right-1 size-2 rounded-full bg-[var(--arca-accent-neg)] ring-2 ring-[var(--arca-sidebar)]" />
        )}
      </span>

      {!colapsado && (
        <>
          <span className="flex-1 min-w-0 truncate">{label}</span>
          {hayUrgentes && (
            <span className="inline-flex h-[18px] items-center rounded-full bg-[var(--arca-accent-neg)] px-1.5 text-[10.5px] leading-none font-semibold tabular-nums text-white [font-family:var(--ff-mono)]">
              {urgentCount}
            </span>
          )}
          {count != null && !hayUrgentes && (
            <span className="text-[11px] tabular-nums text-[var(--arca-sidebar-muted)] [font-family:var(--ff-mono)]">
              {count}
            </span>
          )}
        </>
      )}
    </Link>
  );

  if (!colapsado) return enlace;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{enlace}</TooltipTrigger>
      <TooltipContent side="right" className="text-[12.5px]">
        {label}
        {hayUrgentes && ` · ${urgentCount}`}
      </TooltipContent>
    </Tooltip>
  );
}

/* ─── Fuentes de datos (panel) ─── */
function FuentesDatosItem() {
  const [open, setOpen] = React.useState(false);
  // El "ahora" contra el que se mide la antigüedad se toma al abrir, no en
  // cada render: `Date.now()` en render es impuro y el compilador lo marca.
  const [abiertoEn, setAbiertoEn] = React.useState(0);
  const { colapsado } = useShellSidebar();

  const { data: fuentes = [], isLoading } = useQuery({
    queryKey: ['fuentes-datos'],
    queryFn: () => getFuentesDatos(),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  // Semáforo por fuente: rojo = el último run falló; ámbar = nunca corrió o
  // el último OK tiene más de 7 días; verde = OK reciente.
  const estadoDe = (f: (typeof fuentes)[number]) => {
    if (f.ultimoErrorAt && (!f.ultimoOkAt || f.ultimoErrorAt > f.ultimoOkAt))
      return 'var(--arca-accent-neg)';
    if (
      !f.ultimoOkAt ||
      abiertoEn - new Date(f.ultimoOkAt).getTime() > 7 * 86_400_000
    )
      return 'var(--arca-accent-warn)';
    return 'var(--arca-accent-pos)';
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setAbiertoEn(Date.now());
      }}
    >
      <PopoverTrigger asChild>
        <button
          aria-label={colapsado ? 'Fuentes de datos' : undefined}
          title={colapsado ? 'Fuentes de datos' : undefined}
          className={cn(
            'flex shrink-0 items-center rounded-lg text-[13px] font-medium cursor-pointer transition-colors duration-[120ms] select-none text-left',
            colapsado
              ? 'justify-center size-9 mx-auto'
              : 'h-[34px] gap-2.5 px-2.5 w-full',
            open
              ? 'bg-[var(--arca-sidebar-active)] text-white'
              : 'text-[var(--arca-sidebar-fg)] hover:bg-[rgba(255,255,255,0.04)] hover:text-white'
          )}
        >
          <Database className="w-[15px] h-[15px] shrink-0" strokeWidth={2} />
          {!colapsado && (
            <span className="flex-1 min-w-0 truncate">Fuentes de datos</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80 p-3">
        <div className="text-[13px] font-semibold mb-2">Fuentes de datos</div>
        {isLoading ? (
          <div className="text-[12px] text-muted-foreground py-2">
            Cargando…
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {fuentes.map((f) => (
              <div key={f.id} className="flex items-start gap-2.5">
                <span
                  className="mt-[5px] w-2 h-2 rounded-full shrink-0"
                  style={{ background: estadoDe(f) }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium leading-tight">
                    {f.nombre}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground leading-snug">
                    {f.ultimoOkAt
                      ? `Actualizado ${relativeTime(f.ultimoOkAt)}`
                      : 'Sin corridas OK'}
                    {' · '}
                    {f.datosActualizadosAt
                      ? `datos ${relativeTime(f.datosActualizadosAt)}`
                      : 'sin datos'}
                  </div>
                  {f.ultimoErrorAt &&
                    (!f.ultimoOkAt || f.ultimoErrorAt > f.ultimoOkAt) && (
                      <div className="text-[11px] leading-snug text-[var(--arca-accent-neg-fg)]">
                        Último intento falló {relativeTime(f.ultimoErrorAt)}
                      </div>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ─── Grupos de navegación ─── */

/**
 * Qué grupos están abiertos se guarda por grupo en localStorage, no en la
 * sesión: la nav es memoria muscular y tiene que estar como uno la dejó.
 *
 * Se lee con `useSyncExternalStore` en vez de un `useEffect`: en SSR no hay
 * localStorage, y el snapshot de servidor devuelve el default sin provocar
 * un mismatch de hidratación.
 */
const CLAVE_GRUPO = 'arca-sidebar-grupo:';
const oyentes = new Set<() => void>();

function suscribirGrupos(cb: () => void) {
  oyentes.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    oyentes.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

function leerGrupo(id: string) {
  try {
    return window.localStorage.getItem(CLAVE_GRUPO + id) ?? '';
  } catch {
    return '';
  }
}

function guardarGrupo(id: string, abierto: boolean) {
  try {
    window.localStorage.setItem(CLAVE_GRUPO + id, abierto ? '1' : '0');
  } catch {
    /* modo privado: el grupo se abre igual, sólo no se recuerda */
  }
  oyentes.forEach((cb) => cb());
}

function useGrupoAbierto(id: string, porDefecto: boolean) {
  const guardado = React.useSyncExternalStore(
    suscribirGrupos,
    () => leerGrupo(id),
    () => ''
  );
  const abierto = guardado === '' ? porDefecto : guardado === '1';
  return [abierto, (v: boolean) => guardarGrupo(id, v)] as const;
}

/**
 * Grupo con encabezado plegable. Colapsado el sidebar no hay lugar para el
 * label ni sentido en plegar —los ítems son sólo íconos—, así que el grupo se
 * reduce a un divisor y su contenido queda siempre visible.
 */
function NavGroup({
  id,
  label,
  porDefecto = false,
  children,
}: {
  id: string;
  label: string;
  porDefecto?: boolean;
  children: React.ReactNode;
}) {
  const { colapsado } = useShellSidebar();
  const [abierto, setAbierto] = useGrupoAbierto(id, porDefecto);

  if (colapsado) {
    return (
      <>
        <div
          role="separator"
          aria-label={label}
          className="mx-auto my-2 h-px w-5 shrink-0 bg-[rgba(255,255,255,0.10)]"
        />
        {children}
      </>
    );
  }

  return (
    <Collapsible open={abierto} onOpenChange={setAbierto}>
      <CollapsibleTrigger className="flex w-full shrink-0 items-center gap-1.5 rounded-lg px-2.5 pt-3 pb-1 text-[10.5px] font-semibold tracking-[0.08em] text-[var(--arca-sidebar-label)] uppercase transition-colors duration-[120ms] hover:text-[var(--arca-sidebar-fg)]">
        <span className="flex-1 text-left">{label}</span>
        <ChevronRight
          className={cn(
            'size-3 shrink-0 transition-transform duration-150',
            abierto && 'rotate-90'
          )}
          strokeWidth={2.5}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex shrink-0 flex-col gap-0.5 overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ─── Main sidebar ─── */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isMobile } = useSidebar();
  const atajoBuscar = useAtajo('K');
  const { colapsado } = useShellSidebar();
  const { data: user } = useQuery(userQuery);
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: organizations } = authClient.useListOrganizations();
  const { runOrgSwitch } = useOrgSwitch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isOwner = user?.organizationRole === 'owner';
  const isViewer = user?.organizationRole === 'viewer';

  // El badge cuenta lo mismo que el usuario va a ver al entrar: la bandeja
  // reaplica la empresa elegida, así que un contador global prometía 11 y
  // mostraba 2.
  const [clienteGlobal] = useClienteSeleccionado();
  const { data: notifData } = useQuery({
    queryKey: ['pendingNotificationsCount', clienteGlobal ?? ''],
    queryFn: () =>
      getPendingNotificationsCount({ data: { clienteId: clienteGlobal } }),
  });
  const notifCount = notifData?.count ?? 0;

  const { data: openAlerts = [] } = useQuery({
    queryKey: ['alerts', 'open', '', '', ''],
    queryFn: () => listAlerts({ data: { estado: 'abierta', limit: 99 } }),
    staleTime: 60_000,
  });
  const openAlertsCount = openAlerts.length;

  const { data: orgModules = [] } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
    staleTime: 30_000,
  });
  const isEnabled = (mod: string) =>
    (orgModules as { module: string; enabled: boolean }[]).find(
      (m) => m.module === mod
    )?.enabled ?? false;
  const hayContabilidad =
    isEnabled('contabilidad') ||
    isEnabled('banco') ||
    isEnabled('analytics') ||
    isEnabled('ai_agent');

  const displayName = user?.organizationName ?? activeOrg?.name ?? 'Workspace';
  const displaySlug = user?.organizationSlug ?? activeOrg?.slug ?? '';
  const displayLogo = user?.organizationLogo ?? activeOrg?.logo ?? null;
  const [logoRoto, setLogoRoto] = React.useState(false);

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
    <Sidebar collapsible="icon" {...props}>
      {/* ─── Inner navy shell ─── */}
      <div
        className={cn(
          'flex flex-col h-full py-3.5 gap-1',
          colapsado ? 'px-2' : 'px-3'
        )}
        style={{
          background: 'var(--arca-sidebar)',
          color: 'var(--arca-sidebar-fg)',
        }}
      >
        {/* Workspace switcher + botón de colapsar */}
        <div
          className={cn(
            'flex items-center',
            colapsado ? 'flex-col gap-1' : 'gap-1'
          )}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={colapsado ? displayName : undefined}
                title={colapsado ? displayName : undefined}
                className={cn(
                  'flex items-center rounded-[10px] text-left hover:bg-[rgba(255,255,255,0.04)] transition-colors duration-[150ms] group',
                  colapsado
                    ? 'justify-center p-1'
                    : 'gap-2.5 px-2 py-2 flex-1 min-w-0'
                )}
              >
                {/* Logo tile */}
                <div
                  className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0 bg-[var(--arca-accent)] text-white"
                  style={{
                    letterSpacing: '-0.02em',
                    fontFamily: 'var(--ff-display)',
                  }}
                >
                  {displayLogo && !logoRoto ? (
                    <img
                      src={displayLogo}
                      alt=""
                      // Si la URL del logo no resuelve, el navegador dibuja su
                      // ícono de imagen rota en el rincón de la app. Mejor las
                      // iniciales.
                      onError={() => setLogoRoto(true)}
                      className="w-[30px] h-[30px] rounded-lg object-cover"
                    />
                  ) : (
                    initials || <Building className="w-4 h-4" />
                  )}
                </div>
                {!colapsado && (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-white tracking-[-0.01em] truncate">
                        {displayName}
                      </div>
                      <div
                        className="text-[11.5px] text-[var(--arca-sidebar-muted)] truncate"
                        style={{ fontFamily: 'var(--ff-mono)' }}
                      >
                        {displaySlug}
                      </div>
                    </div>
                    <ChevronsUpDown className="w-3.5 h-3.5 text-[var(--arca-sidebar-muted)] shrink-0" />
                  </>
                )}
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
          <BotonColapsar />
        </div>

        {/* Search */}
        <div
          className={cn(
            'flex items-center rounded-lg text-[12.5px] text-[var(--arca-sidebar-muted)] mt-2.5 mb-1.5 cursor-pointer hover:bg-[rgba(255,255,255,0.04)] transition-colors duration-[120ms]',
            colapsado ? 'justify-center size-9 mx-auto' : 'h-8 gap-2 px-2.5'
          )}
          title={colapsado ? `Buscar · ${atajoBuscar}` : undefined}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <Search className="w-[13px] h-[13px] shrink-0" strokeWidth={2} />
          {!colapsado && (
            <>
              <span className="flex-1">Buscar</span>
              <kbd
                className="text-[10.5px] text-[var(--arca-sidebar-muted)] rounded px-[5px] py-px"
                style={{
                  fontFamily: 'var(--ff-mono)',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {atajoBuscar}
              </kbd>
            </>
          )}
        </div>

        {/* CTA de alta. Abre el mismo diálogo que el "+" de Clientes. */}
        {!isViewer && (
          <CreateRepresentativeDialog>
            <button
              aria-label={colapsado ? 'Nuevo cliente' : undefined}
              title={colapsado ? 'Nuevo cliente' : undefined}
              className={cn(
                'flex items-center rounded-lg text-[13px] font-semibold mb-3 transition-colors duration-[120ms]',
                'bg-[var(--arca-accent)] text-white hover:bg-[var(--arca-accent-hover)]',
                colapsado
                  ? 'justify-center size-9 mx-auto'
                  : 'h-9 gap-2 px-3 w-full'
              )}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
              {!colapsado && 'Nuevo cliente'}
            </button>
          </CreateRepresentativeDialog>
        )}

        {/* ─── Nav ─── */}
        <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto overflow-x-visible min-h-0">
          <NavItem to="/" icon={Home} label="Inicio" />

          <NavGroup id="clientes" label="Clientes" porDefecto>
            <NavItem to="/clients" icon={Users} label="Clientes" />
            <NavItem
              to="/notifications"
              icon={Bell}
              label="Notificaciones"
              urgentCount={notifCount}
            />
            <NavItem to="/vencimientos" icon={Calendar} label="Vencimientos" />
            <NavItem to="/tareas" icon={ClipboardList} label="Tareas" />
            <NavItem to="/invoices" icon={FileText} label="Facturas" />
          </NavGroup>

          <NavGroup id="impuestos" label="Impuestos" porDefecto>
            <NavItem to="/iva" icon={Percent} label="IVA" />
            <NavItem to="/iibb" icon={Globe} label="IIBB" />
            <NavItem to="/sueldos" icon={DollarSign} label="Sueldos" />
          </NavGroup>

          {/* Todo el grupo depende de módulos: si no hay ninguno habilitado no
              se dibuja ni el encabezado. */}
          {hayContabilidad && (
            <NavGroup id="contabilidad" label="Contabilidad">
              {isEnabled('contabilidad') && (
                <NavItem
                  to="/accounting"
                  icon={BookOpen}
                  label="Contabilidad"
                />
              )}
              {isEnabled('banco') && (
                <NavItem to="/bank" icon={Landmark} label="Banco" />
              )}
              {isEnabled('analytics') && (
                <NavItem to="/analytics" icon={BarChart2} label="Analytics" />
              )}
              {isEnabled('ai_agent') && (
                <NavItem to="/chat" icon={IconoOrbe} label="Chats" />
              )}
            </NavGroup>
          )}

          {isOwner && (
            <NavGroup id="operaciones" label="Operaciones">
              <NavItem to="/jobs" icon={Clock} label="Jobs" />
              <FuentesDatosItem />
              <NavItem
                to="/alerts"
                icon={AlertTriangle}
                label="Alertas"
                urgentCount={openAlertsCount}
              />
              <NavItem to="/admin" icon={Settings} label="Administración" />
            </NavGroup>
          )}

          {/* Superadmin (rol de usuario, plugin admin): gestión de estudios. */}
          {(user as { role?: string | null } | undefined)?.role === 'admin' && (
            <NavGroup id="plataforma" label="Plataforma">
              <NavItem
                to="/organizaciones"
                icon={Building}
                label="Organizaciones"
              />
            </NavGroup>
          )}
        </nav>

        {/* ─── Footer: user card ─── */}
        <div
          className="mt-auto pt-2.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={colapsado ? (user?.name ?? 'Cuenta') : undefined}
                title={colapsado ? (user?.name ?? 'Cuenta') : undefined}
                className={cn(
                  'flex items-center rounded-[10px] hover:bg-[rgba(255,255,255,0.04)] transition-colors duration-[120ms] text-left',
                  colapsado
                    ? 'justify-center p-1 mx-auto'
                    : 'gap-2.5 w-full px-2 py-2'
                )}
              >
                {/* User avatar */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 text-white"
                  style={{
                    background: 'linear-gradient(135deg, #1F7A86, #4FB3BC)',
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
                {!colapsado && (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-white truncate">
                        {user?.name}
                      </div>
                      <div className="text-[11px] text-[var(--arca-sidebar-muted)] truncate">
                        {user?.email}
                      </div>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--arca-sidebar-muted)] shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-56 rounded-lg"
              side={isMobile ? 'bottom' : 'right'}
              align="end"
              sideOffset={4}
            >
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
