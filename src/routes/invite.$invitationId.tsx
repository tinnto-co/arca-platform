import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import { getSession } from '@/actions/user';
import { getPublicInvitationPreview } from '@/actions/invitation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Building, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/invite/$invitationId')({
  component: InvitePage,
});

function InvitePage() {
  const { invitationId } = Route.useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invitation, setInvitation] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const [showSignUp, setShowSignUp] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [signUpError, setSignUpError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const preview = await getPublicInvitationPreview({
          data: { invitationId },
        });

        if (!preview) {
          setError('Invitación no encontrada o expirada');
          return;
        }

        setInvitation(preview);

        const session = await getSession();
        setIsLoggedIn(!!session?.user);
        setSessionEmail(session?.user?.email ?? null);
      } catch {
        setError('Error al cargar la invitación');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [invitationId]);

  const recipientMismatch =
    isLoggedIn &&
    invitation &&
    sessionEmail &&
    sessionEmail.toLowerCase() !== invitation.email.toLowerCase();

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const result = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (result.error) {
        throw new Error(result.error.message || 'Error al aceptar');
      }
      setAccepted(true);
      toast.success('Invitación aceptada');
      setTimeout(() => navigate({ to: '/' }), 1500);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAccepting(false);
    }
  };

  const handleSignUpAndAccept = async () => {
    setSignUpError(null);
    if (!name.trim() || !password.trim()) {
      setSignUpError('Nombre y contraseña son requeridos');
      return;
    }
    if (password.length < 8) {
      setSignUpError('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setAccepting(true);
    try {
      const signUpResult = await authClient.signUp.email({
        email: invitation.email,
        name,
        password,
      });
      if (signUpResult.error) {
        throw new Error(
          signUpResult.error.message || 'Error al crear la cuenta'
        );
      }

      const acceptResult = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (acceptResult.error) {
        throw new Error(
          acceptResult.error.message || 'Error al aceptar la invitación'
        );
      }

      setAccepted(true);
      toast.success('Cuenta creada e invitación aceptada');
      setTimeout(() => navigate({ to: '/' }), 1500);
    } catch (e: any) {
      setSignUpError(e.message);
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-[#232c50] via-[#2e3a66] to-[#139ed9]">
        <Loader2 className="size-8 animate-spin text-white" />
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-[#232c50] via-[#2e3a66] to-[#139ed9] p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="mx-auto size-12 text-destructive mb-2" />
            <CardTitle>Invitación inválida</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={() => navigate({ to: '/login' })}>
              Ir al inicio de sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-[#232c50] via-[#2e3a66] to-[#139ed9] p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="mx-auto size-12 text-green-500 mb-2" />
            <CardTitle>¡Bienvenido!</CardTitle>
            <CardDescription>
              Te uniste a {invitation?.organizationName ?? 'la organización'}.
              Redirigiendo...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-[#232c50] via-[#2e3a66] to-[#139ed9] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Building className="size-6 text-primary" />
          </div>
          <CardTitle>Invitación a organización</CardTitle>
          <CardDescription>
            Has sido invitado a unirte a{' '}
            <strong>
              {invitation?.organizationName ?? 'una organización'}
            </strong>{' '}
            como{' '}
            <strong>
              {invitation?.role === 'owner'
                ? 'Administrador'
                : invitation?.role === 'viewer'
                  ? 'Solo lectura'
                  : 'Miembro'}
            </strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isLoggedIn ? (
            recipientMismatch ? (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>
                    Esta invitación fue enviada a{' '}
                    <strong>{invitation?.email}</strong>. Cerrá sesión e iniciá
                    con ese correo para aceptarla.
                  </AlertDescription>
                </Alert>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={async () => {
                    await authClient.signOut({
                      fetchOptions: {
                        onSuccess: () => {
                          window.location.href = `/invite/${invitationId}`;
                        },
                      },
                    });
                  }}
                >
                  Cerrar sesión
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Ya tenés una cuenta. ¿Aceptás la invitación?
                </p>
                <Button
                  className="w-full"
                  onClick={handleAccept}
                  disabled={accepting}
                >
                  {accepting && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Aceptar invitación
                </Button>
              </div>
            )
          ) : showSignUp ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Creá tu cuenta para unirte
              </p>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={invitation?.email ?? ''} disabled />
              </div>
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                />
              </div>
              <div className="space-y-2">
                <Label>Contraseña</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              {signUpError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{signUpError}</AlertDescription>
                </Alert>
              )}
              <Button
                className="w-full"
                onClick={handleSignUpAndAccept}
                disabled={accepting}
              >
                {accepting && <Loader2 className="mr-2 size-4 animate-spin" />}
                Crear cuenta y aceptar
              </Button>
              <Button
                variant="link"
                className="w-full"
                onClick={() => setShowSignUp(false)}
              >
                Ya tengo cuenta
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                className="w-full"
                onClick={() =>
                  navigate({
                    to: '/login',
                    search: { redirect: `/invite/${invitationId}` },
                  })
                }
              >
                Iniciar sesión y aceptar
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowSignUp(true)}
              >
                No tengo cuenta - Registrarme
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
