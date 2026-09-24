'use client';

/**
 * Paleta global (⌘K): busca un cliente por razón social o CUIT y salta a su
 * ficha, o lleva directo a una sección.
 *
 * El buscador del sidebar la abre con el mouse; el atajo, con el teclado.
 * Hasta acá ese buscador era decorativo: ni el click ni ⌘K hacían nada
 * fuera del tablero de Tareas, que tiene su propia paleta.
 *
 * Busca sobre los clientes ya cargados (`['clientes']`, la misma query que
 * el selector de empresa del header), así que no pega de más contra el
 * servidor y comparte caché con el resto de la app.
 */

import { useEffect, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  BookOpen,
  Calendar,
  ClipboardList,
  DollarSign,
  FileText,
  Globe,
  Home,
  Percent,
  Users,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { getClientes } from '@/actions/client';
import {
  cerrarBuscador,
  abrirBuscador,
  setBuscadorAbierto,
  useBuscadorAbierto,
} from '@/lib/buscador-global';

const SECCIONES = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/clients', label: 'Clientes', icon: Users },
  { to: '/notifications', label: 'Notificaciones', icon: Bell },
  { to: '/vencimientos', label: 'Vencimientos', icon: Calendar },
  { to: '/tareas', label: 'Tareas', icon: ClipboardList },
  { to: '/invoices', label: 'Facturas', icon: FileText },
  { to: '/iva', label: 'IVA', icon: Percent },
  { to: '/iibb', label: 'IIBB', icon: Globe },
  { to: '/sueldos', label: 'Sueldos', icon: DollarSign },
  { to: '/accounting', label: 'Contabilidad', icon: BookOpen },
] as const;

export function BuscadorGlobal() {
  const abierto = useBuscadorAbierto();
  const navigate = useNavigate();

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getClientes(),
    staleTime: 60_000,
    // Sin esto la paleta dispararía la consulta al montar el layout, para
    // algo que quizás no se abra nunca en toda la sesión.
    enabled: abierto,
  });

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return;
      // El tablero de Tareas tiene su propia paleta ⌘K, que busca dentro del
      // recorte que estás viendo. Ahí manda esa.
      if (window.location.pathname.startsWith('/tareas')) return;
      e.preventDefault();
      abrirBuscador();
    };
    window.addEventListener('keydown', atajo);
    return () => window.removeEventListener('keydown', atajo);
  }, []);

  // Un cliente sin credencial no tiene ficha a donde ir: se muestra igual
  // —existe— pero lleva a la lista, no a una ruta rota.
  const items = useMemo(
    () =>
      clientes.map((c) => ({
        id: c.id,
        razonSocial: c.razonSocial,
        cuit: c.cuit,
        credencialId: c.credenciales[0]?.id ?? null,
      })),
    [clientes]
  );

  return (
    <CommandDialog
      open={abierto}
      onOpenChange={setBuscadorAbierto}
      title="Buscar"
      description="Buscá un cliente por razón social o CUIT, o saltá a una sección."
    >
      <CommandInput placeholder="Buscar cliente, CUIT o sección…" />
      <CommandList>
        <CommandEmpty className="py-6 text-center text-[12.5px] text-[var(--arca-ink-3)]">
          Sin resultados
        </CommandEmpty>

        {items.length > 0 && (
          <CommandGroup heading="Clientes">
            {items.map((c) => (
              <CommandItem
                key={c.id}
                // El CUIT entra en el valor para que se pueda buscar por él,
                // no sólo por nombre.
                value={`${c.razonSocial} ${c.cuit}`}
                onSelect={() => {
                  cerrarBuscador();
                  if (c.credencialId) {
                    void navigate({
                      to: '/clients/$clientId',
                      params: { clientId: c.credencialId },
                      search: { empresa: c.id },
                    });
                  } else {
                    void navigate({ to: '/clients' });
                  }
                }}
              >
                <Users className="size-3.5 shrink-0" />
                <span className="flex-1 truncate">{c.razonSocial}</span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--arca-ink-4)] [font-family:var(--ff-mono)]">
                  {c.cuit}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Ir a">
          {SECCIONES.map((s) => (
            <CommandItem
              key={s.to}
              value={s.label}
              onSelect={() => {
                cerrarBuscador();
                void navigate({ to: s.to });
              }}
            >
              <s.icon className="size-3.5 shrink-0" />
              {s.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
