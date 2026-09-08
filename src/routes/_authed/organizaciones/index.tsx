/**
 * Módulo del superadmin: listado de todas las organizaciones (estudios) con
 * «Entrar a esta cuenta» y alta de nuevas. Solo visible con user.role='admin'
 * (rol de usuario del plugin admin, por encima de owner/member/viewer).
 */
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Building2, Loader2, LogIn, Plus } from 'lucide-react';
import {
  crearOrganizacion,
  entrarOrganizacion,
  listOrganizaciones,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

  const crear = useMutation({
    mutationFn: () => crearOrganizacion({ data: { name, slug } }),
    onSuccess: (org) => {
      toast.success(`${org.name} dada de alta`);
      void queryClient.invalidateQueries({ queryKey: ['organizaciones'] });
      setOpen(false);
      setName('');
      setSlug('');
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
            Da de alta un estudio contable. Quedás como administrador y podés
            invitar a su gente desde Administración.
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
              disabled={crear.isPending || !name.trim() || !slug.trim()}
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

  const activa = user?.activeOrganizationId ?? null;

  return (
    <PageShell>
      <PageHeader
        title="Organizaciones"
        subtitle="Todos los estudios de la plataforma"
        actions={<NuevaOrganizacionDialog />}
      />
      {isLoading ? (
        <p className="text-[var(--arca-ink-3)]">Cargando...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Organización</TableHead>
              <TableHead>Identificador</TableHead>
              <TableHead className="text-right">Miembros</TableHead>
              <TableHead>Alta</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((org) => (
              <TableRow key={org.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8 rounded-lg">
                      <AvatarImage src={org.logo ?? ''} />
                      <AvatarFallback className="rounded-lg">
                        <Building2 className="size-4 text-[var(--arca-ink-3)]" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{org.name}</span>
                    {org.id === activa && (
                      <Badge variant="outline" className="text-[10.5px]">
                        Cuenta actual
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-[var(--arca-ink-3)] font-mono text-[12.5px]">
                  {org.slug}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {org.miembros}
                </TableCell>
                <TableCell className="text-[var(--arca-ink-3)]">
                  {org.createdAt
                    ? new Date(org.createdAt).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {org.id === activa ? null : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={entrar.isPending}
                      onClick={() => entrar.mutate(org.id)}
                    >
                      {entrandoA === org.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <LogIn className="size-3.5" />
                      )}
                      Entrar a esta cuenta
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PageShell>
  );
}
