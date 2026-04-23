import { createFileRoute } from '@tanstack/react-router';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Building, LogOut } from 'lucide-react';

export const Route = createFileRoute('/no-organization')({
  component: NoOrganizationPage,
});

function NoOrganizationPage() {
  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = '/login';
        },
      },
    });
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-[#232c50] via-[#2e3a66] to-[#139ed9] p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-2 flex size-16 items-center justify-center rounded-full bg-muted">
            <Building className="size-8 text-muted-foreground" />
          </div>
          <CardTitle>Sin organización</CardTitle>
          <CardDescription>
            Tu cuenta no está asociada a ninguna organización. Contactá al
            administrador de tu estudio contable para que te envíe una
            invitación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="size-4" />
            Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
