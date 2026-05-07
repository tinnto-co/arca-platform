import { createFileRoute } from '@tanstack/react-router';
import { LoginForm } from '@/components/login-form';
import z from 'zod';

export const Route = createFileRoute('/login')({
  component: LoginPage,
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
});

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="#" className="flex items-center gap-2 font-medium"></a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm />
          </div>
        </div>
      </div>
      <div
        className="relative hidden lg:flex lg:items-center lg:justify-center"
        style={{
          background:
            'linear-gradient(145deg, var(--arca-navy-900) 0%, var(--arca-navy-800) 60%, var(--arca-navy-700) 100%)',
        }}
      >
        <div className="text-center px-8">
          <p className="text-[var(--arca-surface-2)] text-[11px] font-semibold uppercase tracking-[0.12em] mb-3">
            Bienvenido a
          </p>
          <h2 className="font-display text-[28px] font-semibold text-white tracking-[-0.02em]">
            Control Integrado
            <br />
            <span style={{ color: '#C2A878' }}>de Arca</span>
          </h2>
        </div>
      </div>
    </div>
  );
}
