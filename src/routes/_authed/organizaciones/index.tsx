/**
 * Módulo del superadmin: listado de todas las organizaciones (estudios) con
 * «Entrar a esta cuenta» y alta de nuevas. Solo visible con user.role='admin'
 * (rol de usuario del plugin admin, por encima de owner/member/viewer).
 */
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Loader2,
  LogOut,
  Plus,
  Users,
} from 'lucide-react';
import {
  crearOrganizacion,
  entrarOrganizacion,
  listOrganizaciones,
  salirOrganizacion,
} from '@/actions/superadmin';
import { getUser } from '@/actions/user';
import { PageHeader } from '@/components/shared/page-header';
import { PageShell } from '@/components/shared/page-shell';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/_authed/organizaciones/')({
  beforeLoad: async () => {
    const user = await getUser();
    if ((user as { role?: string | null } | null)?.role !== 'admin') {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- redirect() es el mecanismo del router
      throw redirect({ to: '/' });
    }
  },
  component: OrganizacionesPage,
});

function NuevaOrganizacionDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerNombre, setOwnerNombre] = useState('');
  const [ownerApellido, setOwnerApellido] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');

  const limpiar = () => {
    setName('');
    setSlug('');
    setOwnerNombre('');
    setOwnerApellido('');
    setOwnerEmail('');
  };

  const crear = useMutation({
    mutationFn: () =>
      crearOrganizacion({
        data: { name, slug, ownerNombre, ownerApellido, ownerEmail },
      }),
    onSuccess: (org) => {
      void queryClient.invalidateQueries({ queryKey: ['organizaciones'] });
      setOpen(false);
      limpiar();
      if (org.emailEnviado) {
        toast.success(`${org.name} dada de alta`, {
          description: `Le mandamos el acceso a ${org.ownerEmail}.`,
        });
        return;
      }
      // Sin correo configurado el estudio existe pero su dueño no se entera.
      toast.warning(`${org.name} dada de alta, pero no salió el correo`, {
        description: `Pasale este link a ${org.ownerEmail} para que entre.`,
        duration: 12000,
        action: {
          label: 'Copiar link',
          onClick: () => {
            void navigator.clipboard
              .writeText(org.link)
              .then(() => toast.success('Link copiado'))
              .catch(() => toast.error('No se pudo copiar'));
          },
        },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-3.5" strokeWidth={2.2} />
          Nueva organización
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Nueva organización</DialogTitle>
          <DialogDescription>
            El estudio queda a nombre de su responsable, que recibe el acceso
            por correo.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="org-nueva-nombre">Nombre</Label>
            <Input
              id="org-nueva-nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Estudio Pérez y Asociados"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-nueva-slug">Identificador</Label>
            <Input
              id="org-nueva-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="estudio-perez"
            />
            <p className="text-[11.5px] text-[var(--arca-ink-4)]">
              Minúsculas, números y guiones. Identifica al estudio en URLs e
              invitaciones.
            </p>
          </div>

          <div className="space-y-3 rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-bg)] p-3">
            <p className="text-[12px] font-semibold text-[var(--arca-ink-2)]">
              Responsable del estudio
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="org-owner-nombre">Nombre</Label>
                <Input
                  id="org-owner-nombre"
                  value={ownerNombre}
                  onChange={(e) => setOwnerNombre(e.target.value)}
                  placeholder="María"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-owner-apellido">Apellido</Label>
                <Input
                  id="org-owner-apellido"
                  value={ownerApellido}
                  onChange={(e) => setOwnerApellido(e.target.value)}
                  placeholder="Pérez"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-owner-email">Correo</Label>
              <Input
                id="org-owner-email"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="maria@estudioperez.com"
              />
              <p className="text-[11.5px] text-[var(--arca-ink-4)]">
                Le llega una invitación para crear su cuenta y entrar como
                administrador del estudio.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={crear.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                crear.isPending ||
                !name.trim() ||
                !slug.trim() ||
                !ownerNombre.trim() ||
                !ownerApellido.trim() ||
                !ownerEmail.trim()
              }
            >
              {crear.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrganizacionesPage() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => getUser(),
  });
  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['organizaciones'],
    queryFn: () => listOrganizaciones(),
  });

  const [entrandoA, setEntrandoA] = useState<string | null>(null);

  const entrar = useMutation({
    mutationFn: (organizationId: string) => {
      setEntrandoA(organizationId);
      return entrarOrganizacion({ data: { organizationId } });
    },
    onSuccess: () => {
      // Cambió la organización activa: recarga completa para que TODO
      // (queries, contexto RLS, sidebar) arranque parado en la cuenta nueva.
      window.location.href = '/';
    },
    onError: (e: Error) => {
      setEntrandoA(null);
      toast.error(e.message);
    },
  });

  const [saliendoDe, setSaliendoDe] = useState<string | null>(null);

  const salir = useMutation({
    mutationFn: (organizationId: string) => {
      setSaliendoDe(organizationId);
      return salirOrganizacion({ data: { organizationId } });
    },
    onSuccess: () => {
      // Igual que al entrar: cambió la organización activa, así que conviene
      // que todo el árbol vuelva a arrancar en vez de invalidar a mano.
      window.location.href = '/organizaciones';
    },
    onError: (e: Error) => {
      setSaliendoDe(null);
      toast.error(e.message);
    },
  });

  const activa = user?.activeOrganizationId ?? null;

  return (
    <PageShell>
      <PageHeader
        title="Organizaciones"
        subtitle={`${orgs.length} ${orgs.length === 1 ? 'estudio' : 'estudios'} · elegí dónde entrar`}
        actions={<NuevaOrganizacionDialog />}
      />
      {isLoading ? (
        <p className="text-[var(--arca-ink-3)]">Cargando...</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orgs.map((org) => {
            const esActiva = org.id === activa;
            return (
              <div
                key={org.id}
                className="flex flex-col rounded-[14px] border border-[var(--arca-border)] bg-[var(--arca-surface)] shadow-[var(--arca-shadow-sm)]"
              >
                <div className="flex items-center gap-3 px-5 pt-5">
                  <Avatar className="size-11 rounded-full border border-[var(--arca-border)]">
                    <AvatarImage src={org.logo ?? ''} />
                    <AvatarFallback className="rounded-full bg-[var(--arca-surface-2)]">
                      <Building2 className="size-4 text-[var(--arca-ink-3)]" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14.5px] font-semibold text-[var(--arca-ink)]">
                        {org.name}
                      </span>
                      {esActiva && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10.5px]"
                        >
                          Cuenta actual
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--arca-ink-4)] [font-family:var(--ff-mono)]">
                      {org.slug}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 px-5 pb-4 pt-3 text-[12px] text-[var(--arca-ink-3)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-3.5 text-[var(--arca-ink-4)]" />
                    <span className="tabular-nums font-medium text-[var(--arca-ink-2)]">
                      {org.miembros}
                    </span>
                    {Number(org.miembros) === 1 ? 'miembro' : 'miembros'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5 text-[var(--arca-ink-4)]" />
                    desde{' '}
                    <span className="font-medium text-[var(--arca-ink-2)]">
                      {org.createdAt
                        ? new Date(org.createdAt).toLocaleDateString('es-AR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </span>
                  </span>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-[var(--arca-border)] px-5 py-3">
                  <span className="text-[12px] text-[var(--arca-ink-4)]">
                    {org.accesoAbierto
                      ? 'Acceso de soporte abierto'
                      : org.esPropia
                        ? 'Es tu estudio'
                        : esActiva
                          ? 'Estás en esta cuenta'
                          : 'Entrar a esta cuenta'}
                  </span>
                  <div className="flex items-center gap-3">
                    {/* Salir sólo tiene sentido si hay un acceso de soporte que
                        cerrar: en un estudio propio no hay nada que revocar. */}
                    {org.accesoAbierto && (
                      <button
                        type="button"
                        disabled={salir.isPending}
                        onClick={() => salir.mutate(org.id)}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] hover:underline disabled:opacity-50 cursor-pointer"
                      >
                        {saliendoDe === org.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <LogOut className="size-3.5" />
                        )}
                        Salir
                      </button>
                    )}
                    {!esActiva && (
                      <button
                        type="button"
                        disabled={entrar.isPending}
                        onClick={() => entrar.mutate(org.id)}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--arca-ink)] hover:underline disabled:opacity-50 cursor-pointer"
                      >
                        {entrandoA === org.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : null}
                        Entrar
                        <ArrowRight className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
