import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
// import { authClient } from '@/lib/auth-client'
import { Loader2, AlertCircle } from 'lucide-react';
// import { IconBrandGoogle } from '@tabler/icons-react'
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function LoginForm({ className }: React.ComponentProps<'div'>) {
  const searchParams = useSearch({ from: '/login' });
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Validation functions
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isFormValid = (): boolean => {
    return (
      email.trim() !== '' && password.trim() !== '' && validateEmail(email)
    );
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    setError(null); // Clear general error when user starts typing
    // if (value.trim() !== "" && !validateEmail(value)) {
    //   setEmailError("Por favor ingresa un email válido");
    // } else {
    //   setEmailError(null);
    // }
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    setError(null); // Clear general error when user starts typing
  };

  const onSubmit = async () => {
    // Clear previous errors
    setError(null);
    setEmailError(null);

    // Validate form before submission
    if (!email.trim()) {
      setError('El email es requerido');
      return;
    }
    if (!password.trim()) {
      setError('La contraseña es requerida');
      return;
    }
    if (!validateEmail(email)) {
      setEmailError('Por favor ingresa un email válido');
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        callbackURL: searchParams.redirect || '/',
      });
      if (result.error) {
        throw new Error(
          result.error.message || 'Hubo un error al iniciar sesion'
        );
      }

      navigate({
        to: searchParams.redirect || '/',
      });
    } catch (err) {
      console.log(err);
      const errorMessage =
        (err as Error).message || 'Hubo un error al iniciar sesión';

      // Set specific error messages based on the error
      if (
        errorMessage.includes('Invalid credentials') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('incorrect')
      ) {
        setError('Email o contraseña incorrectos');
      } else if (
        errorMessage.includes('user not found') ||
        errorMessage.includes('not found')
      ) {
        setError('No se encontró una cuenta con este email');
      } else {
        setError(errorMessage);
      }

      toast.error('Error al iniciar sesión', {
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]">
          Iniciar sesion en tu cuenta
        </h1>
        <p className="text-muted-foreground text-sm text-balance">
          Ingresa tu email para ingresar a tu cuenta
        </p>
      </div>

      <div className="grid gap-6">
        {/* Error Alert */}

        <div className="flex flex-col gap-2">
          <Label>Email</Label>
          <Input
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            type="email"
            placeholder="john@example.com"
            required
            className={emailError ? 'border-[var(--arca-accent-neg)]' : ''}
          />
          {emailError && <p className="text-sm text-[var(--arca-accent-neg)]">{emailError}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <Label>Contraseña</Label>
          <Input
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            type="password"
            placeholder="••••••••"
            required
          />
        </div>
        <a
          href="#"
          className="ml-auto text-sm underline-offset-4 hover:underline"
        >
          Olvidaste tu contraseña?
        </a>

        <Button
          onClick={onSubmit}
          className="w-full"
          disabled={loading || !isFormValid()}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Iniciar sesion
        </Button>
        {error && (
          <Alert
            variant="destructive"
            className="flex items-center justify-center"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
