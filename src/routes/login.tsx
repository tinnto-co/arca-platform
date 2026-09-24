import { createFileRoute, redirect } from '@tanstack/react-router';
import { LoginForm } from '@/components/login-form';
import { getSession } from '@/actions/user';
import z from 'zod';

export const Route = createFileRoute('/login')({
  component: LoginPage,
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
  // Con sesión abierta, /login no tiene nada que ofrecer: se vuelve al lugar
  // del que venía el usuario, o al inicio.
  beforeLoad: async ({ search }) => {
    const session = await getSession();
    if (session) {
      throw redirect({ to: search.redirect ?? '/' });
    }
  },
});

export default function LoginPage() {
  return (
    <div className="flex min-h-svh w-full bg-[var(--arca-bg)] font-sans text-[var(--arca-ink)]">
      {/* Left — form */}
      <div className="flex min-w-0 flex-1 flex-col px-6 py-8 md:px-12 md:py-10 lg:basis-1/2">
        {/* Brand.
            El wordmark va inline y no como <img>: dentro de un <img> el SVG es
            un documento aparte que no ve la webfont de la página, así que
            "Ordo" y el descriptor caían a system-ui. Es el mismo dibujo que
            public/brand/ordo-wordmark-descriptor.svg. */}
        <div className="flex items-center">
          <svg
            role="img"
            aria-label="Ordo Suite Contable"
            viewBox="0 0 200 72"
            fill="none"
            className="block h-[44px] w-auto [font-family:var(--ff-display)]"
          >
            <path
              d="M20 10a14 14 0 1 0 14 14"
              stroke="#101720"
              strokeWidth="4.4"
              strokeLinecap="round"
            />
            <circle cx="34" cy="13.5" r="4.4" fill="#4FB3BC" />
            <text
              x="46"
              y="36"
              fontWeight="600"
              fontSize="34"
              letterSpacing="-1"
              fill="#101720"
            >
              Ordo
            </text>
            <text
              x="46"
              y="60"
              fontWeight="500"
              fontSize="10.5"
              letterSpacing="2.3"
              fill="#1F7A86"
            >
              SUITE CONTABLE
            </text>
          </svg>
        </div>

        {/* Centered form block */}
        <div className="flex flex-1 flex-col items-center justify-center">
          <LoginForm />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[11.5px] text-[var(--arca-ink-4)]">
          <span>© 2026 Ordo Suite Contable</span>
          <span className="text-[11px] [font-family:var(--ff-mono)]">
            contable.tinnto.co
          </span>
        </div>
      </div>

      {/* Right — full-bleed image.
          La foto es cálida (madera, lámpara) y choca con el petróleo de la
          marca: se la lleva a la paleta fría con una capa de color sobre el
          navy del sidebar, y el símbolo queda de filigrana. */}
      <div className="relative isolate hidden min-w-0 flex-1 overflow-hidden bg-[var(--arca-sidebar)] lg:block lg:basis-1/2">
        <img
          src="/login-hero.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-90 saturate-[0.35]"
        />

        {/* Vira el matiz de toda la foto al navy de marca */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[#0E1A2B] mix-blend-color"
        />

        {/* Profundidad: oscurece abajo-izquierda y deja un respiro turquesa */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-tr from-[#0E1A2B]/90 via-[#0E1A2B]/60 to-[#1F7A86]/30"
        />

        {/* El símbolo, a color pleno sobre la foto ya enfriada */}
        <svg
          aria-hidden
          viewBox="0 0 48 48"
          fill="none"
          className="absolute top-1/2 left-1/2 w-[52%] -translate-x-1/2 -translate-y-1/2"
        >
          <path
            d="M24 8a16 16 0 1 0 16 16"
            stroke="#FFFFFF"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx="40" cy="12" r="5" fill="#4FB3BC" />
        </svg>
      </div>
    </div>
  );
}
