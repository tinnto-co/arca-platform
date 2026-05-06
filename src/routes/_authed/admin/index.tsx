import { createFileRoute, redirect } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import z from 'zod';
import {
  getOrgMembers,
  getOrgDetails,
  updateOrg,
  inviteMember,
  removeMember,
  updateMemberRole,
  getOrgInvitations,
  cancelInvitation,
  listOrgModules,
  setModuleEnabled,
} from '@/actions/admin';
import { getUser } from '@/actions/user';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import {
  Building,
  Layers,
  Loader2,
  Mail,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { userQuery } from '../../../lib/user-query';
import { PageHeader } from '@/components/shared/page-header';

const logoUrlSchema = z.union([z.string().url(), z.literal('')]);

export const Route = createFileRoute('/_authed/admin/')({
  beforeLoad: async () => {
    const user = await getUser();
    if (!user?.organizationRole || user.organizationRole !== 'owner') {
      throw redirect({ to: '/' });
    }
  },
  component: AdminPanel,
});

const ROLE_LABELS: Record<string, string> = {
  owner: 'Administrador',
  member: 'Miembro',
  viewer: 'Solo lectura',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-[var(--arca-accent-warn)]/10 text-[var(--arca-accent-warn)]',
  member: 'bg-[var(--arca-navy-700)]/10 text-[var(--arca-navy-700)]',
  viewer: 'bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]',
};

function AdminPanel() {
  const { data: org, isLoading } = useQuery({
    queryKey: ['admin', 'org'],
    queryFn: () => getOrgDetails(),
  });

  return (
    <div className="p-[28px_36px_60px] max-w-[1440px] space-y-6">
      <PageHeader
        icon={Building}
        title={isLoading ? 'Administración' : (org?.name ?? 'Administración')}
        subtitle={
          isLoading
            ? ''
            : (org?.slug ?? 'Miembros e invitaciones de la organización')
        }
      />
      <Tabs defaultValue="members" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="members">
            <Users className="size-4 mr-2" />
            Miembros
          </TabsTrigger>
          <TabsTrigger value="invitations">
            <Mail className="size-4 mr-2" />
            Invitaciones
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Building className="size-4 mr-2" />
            Configuración
          </TabsTrigger>
          <TabsTrigger value="modules">
            <Layers className="size-4 mr-2" />
            Módulos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <MembersTab />
        </TabsContent>
        <TabsContent value="invitations">
          <InvitationsTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="modules">
          <ModulesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MembersTab() {
  const queryClient = useQueryClient();
  const { data: members, isLoading } = useQuery({
    queryKey: ['admin', 'members'],
    queryFn: () => getOrgMembers(),
  });

  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);

  const rolesMutation = useMutation({
    mutationFn: (data: {
      memberId: string;
      role: 'owner' | 'member' | 'viewer';
    }) => updateMemberRole({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'members'] });
      toast.success('Rol actualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (memberIdOrEmail: string) =>
      removeMember({ data: { memberIdOrEmail } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'members'] });
      setRemoveMemberId(null);
      toast.success('Miembro removido');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removingMember = members?.find((m) => m.memberId === removeMemberId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Miembros</CardTitle>
          <CardDescription>
            {members?.length ?? 0} miembros en la organización
          </CardDescription>
        </div>
        <InviteDialog />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-[var(--arca-ink-3)]">Cargando...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members?.map((m) => (
                <TableRow key={m.memberId}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarImage src={m.image ?? ''} />
                        <AvatarFallback>
                          {m.name?.charAt(0)?.toUpperCase() ?? '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{m.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[var(--arca-ink-3)]">
                    {m.email}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={m.role}
                      onValueChange={(role: 'owner' | 'member' | 'viewer') =>
                        rolesMutation.mutate({ memberId: m.memberId, role })
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">
                          <div className="flex items-center gap-2">
                            <Shield className="size-3" />
                            Administrador
                          </div>
                        </SelectItem>
                        <SelectItem value="member">Miembro</SelectItem>
                        <SelectItem value="viewer">Solo lectura</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRemoveMemberId(m.memberId)}
                    >
                      <Trash2 className="size-4 text-[var(--arca-accent-neg)]" />
                    </Button>
                    <AlertDialog
                      open={removeMemberId === m.memberId}
                      onOpenChange={(open) =>
                        !open &&
                        !removeMutation.isPending &&
                        setRemoveMemberId(null)
                      }
                    >
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            ¿Remover a {removingMember?.name ?? m.name}?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta persona perderá acceso a la organización. Podrá
                            ser invitada nuevamente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            disabled={removeMutation.isPending}
                          >
                            Cancelar
                          </AlertDialogCancel>
                          <Button
                            variant="destructive"
                            disabled={removeMutation.isPending}
                            onClick={() => removeMutation.mutate(m.memberId)}
                          >
                            {removeMutation.isPending ? (
                              <>
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                Removiendo...
                              </>
                            ) : (
                              'Remover'
                            )}
                          </Button>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function InvitationsTab() {
  const queryClient = useQueryClient();
  const { data: invitations, isLoading } = useQuery({
    queryKey: ['admin', 'invitations'],
    queryFn: () => getOrgInvitations(),
  });

  const [cancelInviteId, setCancelInviteId] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: (invitationId: string) =>
      cancelInvitation({ data: { invitationId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      setCancelInviteId(null);
      toast.success('Invitación cancelada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = Array.isArray(invitations)
    ? invitations.filter((i: { status: string }) => i.status === 'pending')
    : [];

  const inviteToCancel = pending.find(
    (i: { id: string }) => i.id === cancelInviteId
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Invitaciones</CardTitle>
          <CardDescription>
            {pending.length} invitaciones pendientes
          </CardDescription>
        </div>
        <InviteDialog />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-[var(--arca-ink-3)]">Cargando...</p>
        ) : pending.length === 0 ? (
          <p className="text-[var(--arca-ink-3)] text-center py-8">
            No hay invitaciones pendientes
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map(
                (inv: { id: string; email: string; role: string }) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>
                      <Badge
                        className={ROLE_COLORS[inv.role] ?? ''}
                        variant="secondary"
                      >
                        {ROLE_LABELS[inv.role] ?? inv.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Pendiente</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setCancelInviteId(inv.id)}
                      >
                        <X className="size-4 text-[var(--arca-accent-neg)]" />
                      </Button>
                      <AlertDialog
                        open={cancelInviteId === inv.id}
                        onOpenChange={(open) =>
                          !open &&
                          !cancelMutation.isPending &&
                          setCancelInviteId(null)
                        }
                      >
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              ¿Cancelar invitación?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Se anulará la invitación enviada a{' '}
                              <span className="font-medium">
                                {inviteToCancel?.email ?? inv.email}
                              </span>
                              . Podrás volver a invitar a esa dirección más
                              tarde.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel
                              disabled={cancelMutation.isPending}
                            >
                              Volver
                            </AlertDialogCancel>
                            <Button
                              variant="destructive"
                              disabled={cancelMutation.isPending}
                              onClick={() => cancelMutation.mutate(inv.id)}
                            >
                              {cancelMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                  Cancelando...
                                </>
                              ) : (
                                'Cancelar invitación'
                              )}
                            </Button>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsTab() {
  const queryClient = useQueryClient();
  const { data: org, isLoading } = useQuery({
    queryKey: ['admin', 'org'],
    queryFn: () => getOrgDetails(),
  });

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
    if (org) {
      setLogoUrl(org.logo ?? '');
    }
  }, [org?.id, org?.logo]);

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; slug?: string; logo?: string }) =>
      updateOrg({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'org'] });
      queryClient.invalidateQueries({ queryKey: userQuery.queryKey });
      toast.success('Organización actualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;

    const parsedLogo = logoUrlSchema.safeParse(logoUrl.trim());
    if (!parsedLogo.success) {
      toast.error('La URL del logo no es válida');
      return;
    }

    const updates: { name?: string; slug?: string; logo?: string } = {};
    if (name && name !== org.name) updates.name = name;
    if (slug && slug !== org.slug) updates.slug = slug;
    const trimmedLogo = parsedLogo.data;
    const currentLogo = org.logo ?? '';
    if (trimmedLogo !== currentLogo) {
      updates.logo = trimmedLogo;
    }

    if (Object.keys(updates).length > 0) {
      updateMutation.mutate(updates);
    }
  };

  if (isLoading) return <p className="text-[var(--arca-ink-3)]">Cargando...</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración de la organización</CardTitle>
        <CardDescription>
          Edita el nombre, identificador y logo de tu organización
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div className="space-y-2">
            <Label>Logo (URL)</Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[var(--arca-surface-2)]">
                {logoUrl.trim() ? (
                  <Avatar className="size-20 rounded-lg">
                    <AvatarImage
                      src={logoUrl.trim()}
                      alt="Vista previa"
                      className="object-cover"
                    />
                    <AvatarFallback className="rounded-lg text-xs">
                      ?
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Building className="size-8 text-[var(--arca-ink-3)]" />
                )}
              </div>
              <Input
                id="org-logo"
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…"
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-name">Nombre</Label>
            <Input
              id="org-name"
              defaultValue={org?.name ?? ''}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la organización"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              defaultValue={org?.slug ?? ''}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="identificador-unico"
            />
          </div>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const MODULE_LABELS: Record<string, string> = {
  sueldos: 'Sueldos',
  banco: 'Banco',
  contabilidad: 'Contabilidad',
  analytics: 'Analytics',
  portal_cliente: 'Portal del cliente',
  ai_agent: 'Asistente IA',
};

const MODULE_DESCRIPTIONS: Record<string, string> = {
  sueldos: 'Liquidación de sueldos, convenios y recibos de sueldo',
  banco: 'Conciliación bancaria y matching de transacciones',
  contabilidad: 'Plan de cuentas, asientos y mayor contable',
  analytics: 'Proyecciones IVA, ratios y ranking de riesgo',
  portal_cliente: 'Acceso del cliente a su información fiscal',
  ai_agent: 'Asistente inteligente con acceso a datos fiscales',
};

function ModulesTab() {
  const queryClient = useQueryClient();
  const { data: modules, isLoading } = useQuery({
    queryKey: ['admin', 'modules'],
    queryFn: () => listOrgModules(),
  });

  const toggleMutation = useMutation({
    mutationFn: (data: { module: string; enabled: boolean }) =>
      setModuleEnabled({
        data: { module: data.module as Parameters<typeof setModuleEnabled>[0]['data']['module'], enabled: data.enabled },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'modules'] });
      void queryClient.invalidateQueries({ queryKey: ['orgModules'] });
      toast.success('Módulo actualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Módulos habilitados</CardTitle>
        <CardDescription>
          Activá o desactivá módulos para tu organización. Los módulos
          desactivados no aparecen en la barra lateral y sus rutas quedan
          bloqueadas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-[var(--arca-ink-3)]">Cargando...</p>
        ) : (
          <div className="space-y-3">
            {(modules ?? []).map((mod) => (
              <div
                key={mod.module}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-sm">
                    {MODULE_LABELS[mod.module] ?? mod.module}
                  </p>
                  <p className="text-[var(--arca-ink-3)] text-xs">
                    {MODULE_DESCRIPTIONS[mod.module] ?? ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={mod.enabled ? 'default' : 'secondary'}>
                    {mod.enabled ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <Button
                    variant={mod.enabled ? 'outline' : 'default'}
                    size="sm"
                    disabled={toggleMutation.isPending}
                    onClick={() =>
                      toggleMutation.mutate({
                        module: mod.module,
                        enabled: !mod.enabled,
                      })
                    }
                  >
                    {mod.enabled ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InviteDialog() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'member' | 'viewer'>('member');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');

  const mutation = useMutation({
    mutationFn: () => inviteMember({ data: { email, role } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invitations'] });
      toast.success(`Invitación enviada a ${email}`);
      setEmail('');
      setRole('member');
      setStep('edit');
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setStep('edit');
    }
  };

  const emailOk = z.string().email().safeParse(email.trim()).success;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="size-4 mr-2" />
          Invitar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
          <DialogDescription>
            {step === 'edit'
              ? 'Ingresá el email y el rol. Luego confirmá el envío.'
              : 'Revisá los datos antes de enviar la invitación.'}
          </DialogDescription>
        </DialogHeader>
        {step === 'edit' ? (
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Rol</Label>
                <Select
                  value={role}
                  onValueChange={(v: 'owner' | 'member' | 'viewer') =>
                    setRole(v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Administrador</SelectItem>
                    <SelectItem value="member">Miembro</SelectItem>
                    <SelectItem value="viewer">Solo lectura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                onClick={() => setStep('confirm')}
                disabled={!emailOk}
              >
                Continuar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-3 rounded-lg border p-4 py-4 text-sm">
              <div>
                <span className="text-[var(--arca-ink-3)]">Email</span>
                <p className="font-medium">{email.trim()}</p>
              </div>
              <div>
                <span className="text-[var(--arca-ink-3)]">Rol</span>
                <p className="font-medium">{ROLE_LABELS[role] ?? role}</p>
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => setStep('edit')}
              >
                Volver
              </Button>
              <Button
                type="button"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Confirmar y enviar'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
