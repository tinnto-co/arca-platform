import * as React from 'react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MoreHorizontal, Plus, Edit, Trash2, Eye, EyeOff } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { getCredentials, deleteCredential } from '@/actions/credential';
import { CreateCredentialDialog } from './create-credential-dialog';
import { EditCredentialDialog } from './edit-credential-dialog';

interface CredentialsTableProps {
  clientId: string;
}

export function CredentialsTable({ clientId }: CredentialsTableProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [credentialToDelete, setCredentialToDelete] = useState<string | null>(
    null
  );
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>(
    {}
  );

  const queryClient = useQueryClient();

  const { data: credentials, isLoading } = useQuery({
    queryKey: ['credentials', clientId],
    queryFn: () => getCredentials({ data: { clientId } }),
  });

  const deleteCredentialMutation = useMutation({
    mutationFn: deleteCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials', clientId] });
      setDeleteDialogOpen(false);
      setCredentialToDelete(null);
    },
  });

  const handleDelete = (credentialId: string) => {
    setCredentialToDelete(credentialId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (credentialToDelete) {
      deleteCredentialMutation.mutate({ data: { id: credentialToDelete } });
    }
  };

  const togglePasswordVisibility = (credentialId: string) => {
    setShowPasswords((prev) => ({
      ...prev,
      [credentialId]: !prev[credentialId],
    }));
  };

  const getProviderLabel = (provider: string) => {
    switch (provider) {
      case 'arca':
        return 'Arca';
      default:
        return provider;
    }
  };

  const getProviderBadge = (provider: string) => {
    switch (provider) {
      case 'arca':
        return <Badge variant="default">Arca</Badge>;
      default:
        return <Badge variant="outline">{provider}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credenciales</CardTitle>
          <CardDescription>
            Gestiona las credenciales de acceso del cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">
              Cargando credenciales...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Credenciales</CardTitle>
            <CardDescription>
              Gestiona las credenciales de acceso del cliente.
            </CardDescription>
          </div>
          <CreateCredentialDialog clientId={clientId}>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Agregar Credencial
            </Button>
          </CreateCredentialDialog>
        </CardHeader>
        <CardContent>
          {!credentials || credentials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="text-muted-foreground mb-4">
                No hay credenciales registradas
              </div>
              <CreateCredentialDialog clientId={clientId}>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Primera Credencial
                </Button>
              </CreateCredentialDialog>
            </div>
          ) : (
            <div className="rounded-xl border border-[#efeeef] bg-white shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>CUIT</TableHead>
                    <TableHead>Contraseña</TableHead>
                    <TableHead>Creada</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credentials.map((credential) => (
                    <TableRow key={credential.id}>
                      <TableCell>
                        {getProviderBadge(credential.provider)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {credential.data.cuit}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <span>
                            {showPasswords[credential.id]
                              ? credential.data.password
                              : '••••••••'}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() =>
                              togglePasswordVisibility(credential.id)
                            }
                          >
                            {showPasswords[credential.id] ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(credential.createdAt), 'dd/MM/yyyy', {
                          locale: es,
                        })}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <EditCredentialDialog
                              credentialId={credential.id}
                              clientId={clientId}
                            >
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                            </EditCredentialDialog>
                            <DropdownMenuItem
                              className="text-destructive"
                              onSelect={() => handleDelete(credential.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la
              credencial seleccionada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
