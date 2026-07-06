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
    <div className="flex min-h-svh w-full bg-[var(--arca-bg)] font-sans text-[var(--arca-ink)]">
      {/* Left — form */}
      <div className="flex min-w-0 flex-1 flex-col px-6 py-8 md:px-12 md:py-10 lg:basis-1/2">
        {/* Brand */}
        <div className="flex items-center">
          <img
            src="/inline-logo.svg"
            alt="tinnto"
            className="block h-[30px] w-auto"
          />
        </div>

        {/* Centered form block */}
        <div className="flex flex-1 flex-col items-center justify-center">
          <LoginForm />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[11.5px] text-[var(--arca-ink-4)]">
          <span>© 2026 Arca · Control contable integrado</span>
          <span className="text-[11px] [font-family:var(--ff-mono)]">
            contable.tinnto.co
          </span>
        </div>
      </div>

      {/* Right — full-bleed image */}
      <div className="relative hidden min-w-0 flex-1 overflow-hidden bg-[var(--arca-navy-900)] lg:block lg:basis-1/2">
        <img
          src="/login-hero.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    </div>
  );
}
