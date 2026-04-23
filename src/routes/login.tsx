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
      <div className="bg-gradient-to-br from-[#232c50] via-[#2e3a66] to-[#139ed9] relative hidden lg:flex lg:items-center lg:justify-center">
        <p className="text-white w-full text-center text-2xl font-bold tracking-wider uppercase p-4">
          <span className="text-sm block font-semibold mb-1">Bienvenido a</span>
          Control Integrado de Arca
        </p>
      </div>
    </div>
  );
}
