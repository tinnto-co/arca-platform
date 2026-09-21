/**
 * Tutorial para armar las reglas de mapeo de facturas. Acompaña la creación
 * de una regla de verdad: resalta el botón, cada campo del formulario y el
 * guardar, y avanza solo cuando el usuario abre o guarda el formulario.
 *
 * Nació de un contador que armó una regla de compras y otra de ventas sin
 * elegir la dirección, y terminó con las compras contabilizadas como ventas.
 *
 * Se abre solo la primera vez que alguien entra a la solapa Reglas y se puede
 * volver a ver desde el botón «Tutorial» de esa misma barra.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { useState } from 'react';
import { getTutorialState, setTutorialState } from '@/actions/tutoriales';
import { Button } from '@/components/ui/button';
import { Tutorial, type PasoTutorial } from '@/components/shared/tutorial';

const TUTORIAL = 'reglas-mapeo' as const;

/** Tabla chica de ejemplo dentro de un paso. */
function Ejemplo({ filas }: { filas: [string, string, string][] }) {
  return (
    <table className="w-full text-[11.5px]">
      <tbody>
        {filas.map(([a, b, c]) => (
          <tr
            key={`${a}${b}${c}`}
            className="border-t border-[var(--arca-border)] first:border-0"
          >
            <td className="py-1 pr-2 font-medium text-[var(--arca-ink)]">
              {a}
            </td>
            <td className="py-1 pr-2 whitespace-nowrap">{b}</td>
            <td className="py-1">{c}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const hay = (tour: string) => !!document.querySelector(`[data-tour="${tour}"]`);
const tocar = (tour: string) =>
  document.querySelector<HTMLElement>(`[data-tour="${tour}"]`)?.click();

/** Los pasos del formulario lo necesitan abierto (por si se volvió atrás). */
const abrirEditor = () => {
  if (!hay('regla-editor')) tocar('reglas-nueva');
};
/**
 * Los pasos de la lista lo necesitan cerrado: si el usuario siguió sin
 * guardar, el formulario tapaba lo que el paso resalta.
 */
const cerrarEditor = () => {
  if (hay('regla-editor')) tocar('regla-cancelar');
};

const PASOS: PasoTutorial[] = [
  {
    id: 'bienvenida',
    titulo: 'Cómo armar las reglas',
    cuerpo: (
      <>
        <p>
          Las reglas le dicen al sistema qué asiento armar para cada factura de
          esta empresa. Se configuran una vez y sirven para todas las facturas
          que vengan después.
        </p>
        <p>
          Vamos a crear una juntos. Podés usar la pantalla normalmente mientras
          seguís los pasos.
        </p>
      </>
    ),
  },
  {
    id: 'nueva-regla',
    titulo: 'Una regla por cada grupo de facturas',
    objetivo: 'reglas-nueva',
    alSiguiente: abrirEditor,
    avanzarCuando: () => hay('regla-editor'),
    cuerpo: (
      <>
        <p>
          Se crea una regla por cada grupo de facturas que se contabiliza
          distinto. Por ejemplo, para un responsable inscripto:
        </p>
        <Ejemplo
          filas={[
            ['Ventas A', 'Ventas · A', 'Deudores / Ventas + IVA DF'],
            ['Ventas B', 'Ventas · B', 'Deudores / Ventas + IVA DF'],
            ['Compras A', 'Compras · A', 'Mercaderías + IVA CF / Proveedores'],
            ['Compras C', 'Compras · C', 'Gastos / Proveedores'],
          ]}
        />
        <p>
          Tocá <strong>Nueva regla</strong> para empezar.
        </p>
      </>
    ),
  },
  {
    id: 'nombre',
    alEntrar: abrirEditor,
    titulo: 'Ponele un nombre',
    objetivo: 'regla-nombre',
    cuerpo: (
      <p>
        Uno que diga qué facturas toma, por ejemplo <strong>Compras A</strong> o{' '}
        <strong>Ventas B</strong>. Es para reconocerla en la lista: el nombre no
        filtra ninguna factura.
      </p>
    ),
  },
  {
    id: 'direccion',
    alEntrar: abrirEditor,
    titulo: '¿Ventas o compras?',
    objetivo: 'regla-direccion',
    cuerpo: (
      <>
        <p>
          Esto sí filtra, y es obligatorio: la regla sólo toma facturas{' '}
          <strong>emitidas</strong> (ventas) o <strong>recibidas</strong>{' '}
          (compras).
        </p>
        <p>
          Si el nombre dice «compra» o «venta», viene sugerido. Revisá que sea
          el correcto.
        </p>
      </>
    ),
  },
  {
    id: 'tipo-letras',
    alEntrar: abrirEditor,
    titulo: 'Qué letras toma',
    objetivo: 'regla-tipo',
    cuerpo: (
      <>
        <p>
          Elegí <strong>Condicional</strong> y marcá las letras que abajo
          aparecen (A, B, C, M, E). Sin letras marcadas, toma todas las de esa
          dirección.
        </p>
        <p>
          <strong>Default</strong> es la regla de respaldo: toma las ventas (o
          las compras) que ninguna otra regla tomó.
        </p>
      </>
    ),
  },
  {
    id: 'lineas',
    alEntrar: abrirEditor,
    titulo: 'Las líneas del asiento',
    objetivo: 'regla-lineas',
    cuerpo: (
      <>
        <p>
          Cada línea es una cuenta, su lado y de qué importe sale. El{' '}
          <strong>Total</strong> ya incluye Neto + IVA + Otros tributos: los dos
          lados tienen que sumar lo mismo. Una compra A:
        </p>
        <Ejemplo
          filas={[
            ['Mercaderías', 'Debe', 'Neto'],
            ['IVA crédito fiscal', 'Debe', 'IVA'],
            ['Percepciones', 'Debe', 'Otros impuestos'],
            ['Proveedores', 'Haber', 'Total'],
          ]}
        />
        <p>Si no cuadra, abajo aparece un aviso en rojo.</p>
      </>
    ),
  },
  {
    id: 'guardar',
    alEntrar: abrirEditor,
    titulo: 'Guardala',
    objetivo: 'regla-guardar',
    avanzarCuando: () => !hay('regla-editor'),
    cuerpo: (
      <p>
        Con el nombre, ventas o compras y las líneas completas, tocá{' '}
        <strong>Guardar regla</strong>. Repetí lo mismo para cada grupo de
        facturas. Si sólo estás mirando, «Siguiente» cierra el formulario sin
        guardar.
      </p>
    ),
  },
  {
    id: 'orden',
    alEntrar: cerrarEditor,
    titulo: 'El orden importa',
    objetivo: 'reglas-lista',
    cuerpo: (
      <>
        <p>
          Cada factura se prueba contra las reglas de arriba hacia abajo y se
          queda con <strong>la primera que le sirve</strong>. Arrastrá desde la
          manija para ordenar: las más específicas arriba, las Default al final.
        </p>
        <p>Debajo de cada regla puede aparecer un aviso:</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>
            <strong>Sin ventas/compras</strong>: editala y elegí una.
          </li>
          <li>
            <strong>Nunca se aplica</strong>: una regla de más arriba ya se
            lleva todas sus facturas.
          </li>
          <li>
            <strong>No cuadra</strong>: revisá las bases de las líneas.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'volver',
    alEntrar: cerrarEditor,
    titulo: 'Listo',
    objetivo: 'reglas-tutorial',
    cuerpo: (
      <p>
        Con las reglas armadas, los asientos se generan desde{' '}
        <strong>Contabilizar</strong>. Podés volver a ver este tutorial cuando
        quieras desde este botón.
      </p>
    ),
  },
];

/** Botón «Tutorial» de la solapa Reglas + apertura automática la primera vez. */
export function TutorialReglas() {
  const qc = useQueryClient();
  /** Lo que eligió el usuario en esta visita; null = todavía nada. */
  const [elegido, setElegido] = useState<boolean | null>(null);
  const { data } = useQuery({
    queryKey: ['tutorial', TUTORIAL],
    queryFn: () => getTutorialState({ data: { tutorial: TUTORIAL } }),
    staleTime: Infinity,
  });

  // La primera vez se abre solo. Si la consulta falla no se abre: mejor no
  // mostrarlo que mostrarlo en cada visita.
  const abierto = elegido ?? data?.estado === null;

  const guardar = useMutation({
    mutationFn: (estado: 'completado' | 'omitido') =>
      setTutorialState({ data: { tutorial: TUTORIAL, estado } }),
    onSuccess: (_r, estado) => {
      qc.setQueryData(['tutorial', TUTORIAL], { estado });
    },
  });

  const cerrar = (estado: 'completado' | 'omitido') => {
    setElegido(false);
    guardar.mutate(estado);
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => setElegido(true)}
        data-tour="reglas-tutorial"
      >
        <GraduationCap className="size-3.5" strokeWidth={2} />
        Tutorial
      </Button>
      {abierto && (
        <Tutorial
          pasos={PASOS}
          onTerminar={() => cerrar('completado')}
          onOmitir={() => cerrar('omitido')}
        />
      )}
    </>
  );
}
