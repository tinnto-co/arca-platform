import { createFileRoute } from "@tanstack/react-router";
import { LoginForm } from "@/components/login-form";
import z from "zod";

export const Route = createFileRoute("/login")({
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
      <div className="bg-muted relative hidden lg:block">
        <div className="absolute inset-0 h-full w-full z-10 bg-black/40"></div>
        <p className="text-white text-2xl font-bold absolute  tracking-wider top-1/2 uppercase left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 p-4  ">
          <span className="text-sm block font-semibold">Bienvenido a</span>
          Family Capital Funds
        </p>
        <img
          src="/fc-login.jpg"
          alt="Image"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  );
}
