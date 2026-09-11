'use client';

import { Badge } from '@/components/ui/badge';
import { ChatCard, ChatCardHead } from './chat-card';

interface ItemCliente {
  nombre: string;
  cuit: string;
  sueldos: boolean;
}

/**
 * Las empresas que coincidieron con lo que buscó el usuario.
 *
 * Es también la salida de una búsqueda ambigua: cuando "bazarsale" son dos
 * empresas con CUIT distinto, el asistente las muestra acá y pregunta cuál,
 * en vez de elegir una en silencio. Por eso el CUIT va siempre visible y en
 * mono: es lo único que las distingue.
 */
export function ListaClientes({
  consulta,
  items,
}: {
  consulta?: string;
  items: ItemCliente[];
}) {
  const MAX = 12;
  const visibles = items.slice(0, MAX);
  const resto = items.length - visibles.length;

  return (
    <ChatCard>
      <ChatCardHead
        title={consulta ? `Clientes · "${consulta}"` : 'Cartera de clientes'}
        sub={
          items.length === 1
            ? '1 empresa'
            : `${items.length} empresas${resto > 0 ? ` · se listan ${MAX}` : ''}`
        }
      />
      <div className="divide-y divide-[var(--arca-border-row)]">
        {visibles.map((c) => (
          <div
            key={`${c.cuit}-${c.nombre}`}
            className="flex items-center gap-2 px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--arca-ink)]">
              {c.nombre}
            </span>
            {c.sueldos && (
              <Badge variant="secondary" size="xs">
                sueldos
              </Badge>
            )}
            <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--arca-ink-4)] [font-family:var(--ff-mono)]">
              {c.cuit}
            </span>
          </div>
        ))}
      </div>
      {resto > 0 && (
        <div className="border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-2 text-[11.5px] text-[var(--arca-ink-3)]">
          y {resto} más — afiná la búsqueda para verlas
        </div>
      )}
    </ChatCard>
  );
}
