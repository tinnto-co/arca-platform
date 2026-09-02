/**
 * Inicio: la pantalla administrativa del estudio.
 *
 * Regla de la pantalla — franja de arriba: infraestructura (lo que impide
 * ver); izquierda: tiempo (franja de días + agenda); derecha: riesgo fiscal
 * y equipo. Nada nuevo entra si no cae en una de esas cajas.
 */
import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getInicio } from '@/actions/inicio';
import { FranjaInfra } from '@/components/inicio/franja-infra';
import { FranjaDias, type CeldaDia } from '@/components/inicio/franja-dias';
import { AgendaCard } from '@/components/inicio/agenda-card';
import { RiesgosCard } from '@/components/inicio/riesgos-card';
import { EquipoCard } from '@/components/inicio/equipo-card';
import {
  MESES_CORTOS,
  MESES_LARGOS,
  aFechaStr,
  diaCorto,
  fechaLocal,
} from '@/components/inicio/compartido';

export const Route = createFileRoute('/_authed/')({
  component: InicioPage,
});

type Periodo = '14d' | 'mes' | 'trimestre';

const PERIODOS: { clave: Periodo; label: string }[] = [
  { clave: '14d', label: '14 días' },
  { clave: 'mes', label: 'Mes' },
  { clave: 'trimestre', label: 'Trimestre' },
];

function sumarDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function rangoDe(periodo: Periodo, hoy: Date): [string, string] {
  if (periodo === 'mes') {
    return [
      aFechaStr(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
      aFechaStr(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
    ];
  }
  const dias = periodo === '14d' ? 13 : 89;
  return [aFechaStr(hoy), aFechaStr(sumarDias(hoy, dias))];
}

function tituloDe(periodo: Periodo, hoy: Date, hasta: string): string {
  if (periodo !== 'trimestre')
    return `${MESES_LARGOS[hoy.getMonth()]} ${hoy.getFullYear()}`;
  const fin = fechaLocal(hasta);
  const a = MESES_CORTOS[hoy.getMonth()];
  const b = MESES_CORTOS[fin.getMonth()];
  return `${a.charAt(0).toUpperCase()}${a.slice(1)} – ${b.charAt(0).toUpperCase()}${b.slice(1)} ${fin.getFullYear()}`;
}

function celdasDe(
  periodo: Periodo,
  hoy: Date,
  desde: string,
  hasta: string,
  porDia: Map<string, number>
): CeldaDia[] {
  const hoyStr = aFechaStr(hoy);
  const celdas: CeldaDia[] = [];

  if (periodo === 'trimestre') {
    // 13 semanas: la barra mide la carga de la semana entera.
    for (
      let d = fechaLocal(desde);
      aFechaStr(d) <= hasta;
      d = sumarDias(d, 7)
    ) {
      const ini = aFechaStr(d);
      const fin = aFechaStr(sumarDias(d, 6));
      let cantidad = 0;
      for (const [f, n] of porDia) if (f >= ini && f <= fin) cantidad += n;
      celdas.push({
        clave: ini,
        labelArriba: MESES_CORTOS[d.getMonth()],
        labelNumero: String(d.getDate()),
        cantidad,
        esHoy: hoyStr >= ini && hoyStr <= fin,
        esFinde: false,
        rango: [ini, fin],
      });
    }
    return celdas;
  }

  for (let d = fechaLocal(desde); aFechaStr(d) <= hasta; d = sumarDias(d, 1)) {
    const f = aFechaStr(d);
    celdas.push({
      clave: f,
      labelArriba: diaCorto(d),
      labelNumero: String(d.getDate()),
      cantidad: porDia.get(f) ?? 0,
      esHoy: f === hoyStr,
      esFinde: d.getDay() === 0 || d.getDay() === 6,
      rango: [f, f],
    });
  }
  return celdas;
}

function Esqueleto({ alto }: { alto: number }) {
  return (
    <div
      className="bg-white border rounded-[14px] animate-pulse"
      style={{ borderColor: 'var(--arca-border)', height: alto }}
    />
  );
}

function InicioPage() {
  const [periodo, setPeriodo] = useState<Periodo>('14d');
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const hoy = useMemo(() => new Date(), []);
  const [desde, hasta] = useMemo(() => rangoDe(periodo, hoy), [periodo, hoy]);

  const { data, isLoading } = useQuery({
    queryKey: ['inicio', desde, hasta],
    queryFn: () => getInicio({ data: { desde, hasta } }),
    staleTime: 60_000,
  });

  const porDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of data?.vencimientos ?? [])
      m.set(v.venceAt, (m.get(v.venceAt) ?? 0) + 1);
    return m;
  }, [data?.vencimientos]);

  const celdas = useMemo(
    () => celdasDe(periodo, hoy, desde, hasta, porDia),
    [periodo, hoy, desde, hasta, porDia]
  );

  const filtro = useMemo(
    () => celdas.find((c) => c.clave === seleccion)?.rango ?? null,
    [celdas, seleccion]
  );

  const sub = data
    ? [
        `${data.resumen.delMes} vencimiento${data.resumen.delMes !== 1 ? 's' : ''} en el mes`,
        data.resumen.vencidos > 0
          ? `${data.resumen.vencidos} vencido${data.resumen.vencidos !== 1 ? 's' : ''}`
          : null,
        `${data.resumen.empresasMes} empresa${data.resumen.empresasMes !== 1 ? 's' : ''}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <>
      <FranjaInfra />
      <div className="max-w-[1440px]" style={{ padding: '28px 36px 60px' }}>
        {/* Header */}
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h1
              className="text-[30px] font-semibold"
              style={{
                fontFamily: 'var(--ff-display)',
                letterSpacing: '-0.025em',
                color: 'var(--arca-ink)',
              }}
            >
              {tituloDe(periodo, hoy, hasta)}
            </h1>
            <p
              className="text-[12px] mt-0.5"
              style={{ color: 'var(--arca-ink-3)' }}
            >
              {sub || ' '}
            </p>
          </div>
          <div
            className="flex bg-white border rounded-[10px] shrink-0"
            style={{ borderColor: 'var(--arca-border-strong)', padding: 3 }}
          >
            {PERIODOS.map((p) => (
              <button
                key={p.clave}
                type="button"
                onClick={() => {
                  setPeriodo(p.clave);
                  setSeleccion(null);
                }}
                aria-pressed={periodo === p.clave}
                className="text-[12px] font-medium rounded-[7px] cursor-pointer transition-colors duration-150"
                style={{
                  padding: '6px 12px',
                  background:
                    periodo === p.clave ? 'var(--arca-ink)' : undefined,
                  color: periodo === p.clave ? '#fff' : 'var(--arca-ink-3)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Franja de días */}
        <div className="mb-[14px]">
          {isLoading ? (
            <Esqueleto alto={104} />
          ) : (
            <FranjaDias
              celdas={celdas}
              seleccion={seleccion}
              onSeleccionar={setSeleccion}
            />
          )}
        </div>

        {/* Agenda | Riesgos + Equipo */}
        <div
          className="grid items-start"
          style={{ gridTemplateColumns: '1.5fr 1fr', gap: 14 }}
        >
          {isLoading || !data ? (
            <>
              <Esqueleto alto={420} />
              <div className="flex flex-col" style={{ gap: 14 }}>
                <Esqueleto alto={300} />
                <Esqueleto alto={160} />
              </div>
            </>
          ) : (
            <>
              <AgendaCard datos={data} hoy={hoy} filtro={filtro} />
              <div className="flex flex-col" style={{ gap: 14 }}>
                <RiesgosCard datos={data} ahora={hoy} />
                <EquipoCard datos={data} />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
