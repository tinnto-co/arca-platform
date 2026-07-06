import { cn } from '@/lib/utils';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { getPortalSession } from '@/actions/client-portal';

export function LoginForm({ className }: React.ComponentProps<'div'>) {
  const searchParams = useSearch({ from: '/login' });
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const canSubmit = email.trim() !== '' && password.trim() !== '' && !loading;

  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        rememberMe: remember,
        callbackURL: searchParams.redirect ?? '/',
      });
      if (result.error) {
        throw new Error(
          result.error.message ?? 'Hubo un error al iniciar sesión'
        );
      }

      // Detect portal users (no org membership) and redirect to their portal
      const portalSession = await getPortalSession().catch(() => null);
      if (portalSession) {
        void navigate({ to: '/portal' });
        return;
      }

      void navigate({
        to: searchParams.redirect ?? '/',
      });
    } catch (err) {
      const errorMessage =
        (err as Error).message || 'Hubo un error al iniciar sesión';

      if (
        errorMessage.toLowerCase().includes('invalid') ||
        errorMessage.toLowerCase().includes('incorrect')
      ) {
        setError('El email o la contraseña no son correctos.');
      } else if (errorMessage.toLowerCase().includes('not found')) {
        setError('No se encontró una cuenta con este email.');
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

  const inputClasses =
    'h-[46px] w-full rounded-[10px] border border-[var(--arca-border-strong)] bg-white pr-3.5 pl-10 font-sans text-sm text-[var(--arca-ink)] outline-none transition-[border-color,box-shadow] duration-150 ease-linear placeholder:text-[var(--arca-ink-4)] focus:border-[var(--arca-navy-600)] focus:shadow-[0_0_0_3px_rgba(42,70,128,0.14)]';

  return (
    <div className={cn('w-full max-w-[380px]', className)}>
      <h1 className="mb-2 text-[27px] leading-[1.15] font-semibold tracking-[-0.025em] text-[var(--arca-ink)] [font-family:var(--ff-display)]">
        Iniciar sesión en tu cuenta
      </h1>
      <p className="mb-[30px] text-sm leading-normal text-[var(--arca-ink-3)]">
        Ingresá tu email y contraseña para acceder al panel de tu estudio.
      </p>

      <form onSubmit={onSubmit}>
        {/* Email */}
        <label
          htmlFor="login-email"
          className="mb-[7px] block text-[13px] font-medium text-[var(--arca-ink)]"
        >
          Email
        </label>
        <div className="group relative mb-[18px]">
          <Mail
            className="pointer-events-none absolute top-1/2 left-[13px] size-4 -translate-y-1/2 text-[var(--arca-ink-4)] transition-colors duration-150 group-focus-within:text-[var(--arca-navy-600)]"
            aria-hidden="true"
          />
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="nombre@estudio.com"
            autoComplete="email"
            className={inputClasses}
          />
        </div>

        {/* Password */}
        <div className="mb-[7px] flex items-center justify-between">
          <label
            htmlFor="login-password"
            className="text-[13px] font-medium text-[var(--arca-ink)]"
          >
            Contraseña
          </label>
          <a
            href="#"
            className="text-[12.5px] font-medium text-[var(--arca-navy-600)] hover:text-[var(--arca-navy-800)]"
          >
            ¿Olvidaste tu contraseña?
          </a>
        </div>
        <div className="group relative mb-[18px]">
          <Lock
            className="pointer-events-none absolute top-1/2 left-[13px] size-4 -translate-y-1/2 text-[var(--arca-ink-4)] transition-colors duration-150 group-focus-within:text-[var(--arca-navy-600)]"
            aria-hidden="true"
          />
          <input
            id="login-password"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="••••••••"
            autoComplete="current-password"
            className={cn(inputClasses, 'pr-11')}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute top-1/2 right-2 flex size-[30px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-[7px] text-[var(--arca-ink-4)] transition-colors duration-150 hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink-2)]"
          >
            {showPw ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>

        {/* Remember */}
        <label className="mb-[22px] flex cursor-pointer items-center gap-[9px] select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className={cn(
              'flex size-[18px] flex-none items-center justify-center rounded-[5px] border transition-all duration-[120ms] ease-linear',
              remember
                ? 'border-[var(--arca-ink)] bg-[var(--arca-ink)]'
                : 'border-[var(--arca-border-strong)] bg-white'
            )}
          >
            {remember && (
              <Check className="size-3 text-white" strokeWidth={3.2} />
            )}
          </span>
          <span className="text-[13px] text-[var(--arca-ink-2)]">
            Mantener sesión iniciada
          </span>
        </label>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-[10px] bg-[var(--arca-accent-neg-bg)] px-3 py-[9px] text-[12.5px] font-medium text-[var(--arca-accent-neg-fg)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
          >
            <AlertTriangle className="size-[15px] flex-none" />
            <span>{error}</span>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex h-[46px] w-full items-center justify-center gap-[9px] rounded-[10px] bg-[var(--arca-ink)] text-sm font-semibold text-white transition-[background,opacity] duration-150 hover:bg-black disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[var(--arca-ink)]"
        >
          {loading && (
            <span
              aria-hidden="true"
              className="size-[15px] rounded-full border-2 border-white/35 border-t-white motion-safe:animate-spin"
            />
          )}
          {loading ? 'Ingresando…' : 'Iniciar sesión'}
        </button>

        {/* Secondary */}
        <p className="mt-[22px] text-center text-[13px] text-[var(--arca-ink-3)]">
          ¿No tenés acceso?{' '}
          <a
            href="#"
            className="font-medium text-[var(--arca-navy-600)] hover:text-[var(--arca-navy-800)]"
          >
            Contactá a tu estudio
          </a>
        </p>
      </form>
    </div>
  );
}
