/**
 * Selector global de empresa, para el header de las vistas con contexto de
 * cliente (contabilidad, sueldos, banco, IIBB).
 *
 * La elección vive en el store compartido de `lib/cliente-seleccionado`
 * (TIN-1425): elegir una empresa acá se replica en las demás vistas — estar
 * haciendo el balance de Charm Home y pasar a Sueldos abre Sueldos ya parado
 * en Charm Home. Limitación conocida y aceptada: si la empresa elegida no
 * aplica en una vista (un monotributista en contabilidad, una empresa sin
 * sueldos habilitados), esa vista muestra su estado vacío.
 *
 * El look es el del selector de contabilidad, que es la referencia de diseño:
 * ícono de edificio + combobox con buscador, «Razón social · CUIT».
 */
import { Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { getClientes } from '@/actions/client';
import { useClienteSeleccionado } from '@/lib/cliente-seleccionado';

export function SelectorClienteGlobal({ width = 300 }: { width?: number }) {
  const [seleccionado, setSeleccionado] = useClienteSeleccionado();

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getClientes(),
    staleTime: 60_000,
  });

  const opciones = clientes.map((c) => ({
    value: c.id,
    label: `${c.razonSocial} · ${c.cuit}`,
  }));

  // Un cliente dado de baja (o de otra cuenta) no debe resucitar del store.
  const valor =
    seleccionado && clientes.some((c) => c.id === seleccionado)
      ? seleccionado
      : '';

  return (
    <div className="flex items-center gap-2">
      <Building2
        className="w-4 h-4 text-[var(--arca-ink-3)]"
        strokeWidth={1.8}
      />
      <SearchableSelect
        options={opciones}
        value={valor}
        onValueChange={(v) => setSeleccionado(v || null)}
        placeholder="Elegir empresa…"
        searchPlaceholder="Buscar empresa…"
        emptyMessage="No se encontraron empresas"
        width={width}
      />
    </div>
  );
}
