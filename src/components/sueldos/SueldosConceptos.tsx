'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { listTodosConceptosSos } from '@/actions/sueldos';
import {
  formulaLegibleSos,
  leyendaRelacionadaFormulaSos,
} from '@/lib/sos-formula-display';

interface SueldosConceptosProps {
  clientId: string;
  profileId: string;
}

type ConceptoRow = Awaited<ReturnType<typeof listTodosConceptosSos>>[number];

function ConceptoDialog({ row }: { row: ConceptoRow }) {
  const meta = {
    baseColumna: row.baseColumna,
    divCantidad: row.divCantidad,
    divHsNorm: row.divHsNorm != null ? (row.divHsNorm ? 1 : 0) : null,
    tieneCantidad: row.tieneCantidad,
    tienePct: row.tienePct,
    tieneImporte: row.tieneImporte,
    tieneImpConceptoNro: row.tieneImpConceptoNro,
    tieneImpMin: row.tieneImpMin,
    tieneImpMax: row.tieneImpMax,
  };
  const formula = formulaLegibleSos(meta);
  const leyenda = leyendaRelacionadaFormulaSos(meta);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-[8px] hover:bg-[#F1EFE8] transition-colors"
        >
          <Info style={{ width: 15, height: 15, color: '#B7B8BD' }} />
        </button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            <span className="font-mono text-muted-foreground mr-2">
              {row.numeroSos}
            </span>
            {row.nombre}
            {row.codigoAfip && (
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                AFIP: {row.codigoAfip}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-3">
          <div>
            <p className="text-muted-foreground">Fórmula del concepto</p>
            <p className="mt-1 font-mono leading-relaxed text-foreground break-words">
              {formula}
            </p>
          </div>
          {leyenda.length > 0 && (
            <div className="border-t border-border/60 pt-2">
              <p className="text-muted-foreground mb-1.5">
                Significado de las abreviaturas
              </p>
              <ul className="max-h-[min(40vh,14rem)] space-y-1 overflow-y-auto pr-1 text-[11px] leading-snug text-muted-foreground">
                {leyenda.map((item) => (
                  <li key={item.sigla} className="flex gap-2">
                    <span className="shrink-0 font-mono font-medium text-foreground">
                      {item.sigla}
                    </span>
                    <span>{item.texto}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const PAGE_SIZE = 10;

export function SueldosConceptos({
  clientId,
}: SueldosConceptosProps) {
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);

  const { data: conceptos = [], isLoading } = useQuery({
    queryKey: ['todos-conceptos-sos'],
    queryFn: () => listTodosConceptosSos(),
    staleTime: 10 * 60 * 1000,
    enabled: !!clientId,
  });

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return conceptos;
    return conceptos.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.codigoAfip ?? '').toLowerCase().includes(q)
    );
  }, [conceptos, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const inicio = (paginaActual - 1) * PAGE_SIZE;
  const pagina_rows = filtrados.slice(inicio, inicio + PAGE_SIZE);

  const handleBusqueda = (v: string) => {
    setBusqueda(v);
    setPagina(1);
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      {/* Intro text */}
      <p className="text-[13.5px] max-w-[760px]" style={{ color: '#6E7079' }}>
        Catálogo completo de conceptos SOS (códigos 1–699). Todos los conceptos están disponibles
        para usar en cualquier recibo.
      </p>

      {/* Search pill */}
      <div
        className="flex items-center gap-[9px] w-[380px] bg-white rounded-[10px] px-[13px] py-[8px]"
        style={{ border: '1px solid #DFDCD3' }}
      >
        <Search style={{ width: 15, height: 15, color: '#9B9CA3', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Buscar por nombre o código AFIP…"
          value={busqueda}
          onChange={(e) => handleBusqueda(e.target.value)}
          className="flex-1 bg-transparent outline-none text-[13.5px] placeholder:text-[#9B9CA3]"
          style={{ color: '#12131A' }}
        />
      </div>

      {/* Table */}
      <div className="w-full overflow-hidden rounded-[10px]" style={{ border: '1px solid #ECEAE3' }}>
        {/* Navy header */}
        <div
          className="grid h-[44px] items-center px-5 rounded-t-[10px] text-[10.5px] font-semibold tracking-[0.06em] uppercase"
          style={{
            background: '#0B1730',
            color: '#E7EAF2',
            gridTemplateColumns: '120px 140px 1fr 60px',
          }}
        >
          <span>Cód. SOS</span>
          <span>Cód. AFIP</span>
          <span>Nombre</span>
          <span />
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="px-5 py-[14px] text-[13.5px] text-center" style={{ color: '#9B9CA3' }}>
            Cargando...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="px-5 py-[14px] text-[13.5px] text-center" style={{ color: '#9B9CA3' }}>
            {busqueda ? 'Sin resultados para la búsqueda.' : 'No hay conceptos en el catálogo.'}
          </div>
        ) : (
          pagina_rows.map((row) => (
            <div
              key={row.id}
              className="grid items-center px-5 py-[14px] transition-[background] duration-[120ms] hover:bg-[#FBFAF6]"
              style={{
                gridTemplateColumns: '120px 140px 1fr 60px',
                borderBottom: '1px solid #ECEAE3',
              }}
            >
              {/* CÓD. SOS */}
              <span
                className="text-[13.5px] font-semibold tabular-nums"
                style={{ color: '#12131A' }}
              >
                {row.numeroSos}
              </span>
              {/* CÓD. AFIP */}
              <span
                className="font-[family-name:var(--ff-mono)] text-[12.5px]"
                style={{ color: '#9B9CA3' }}
              >
                {row.codigoAfip ?? '—'}
              </span>
              {/* NOMBRE */}
              <span className="text-[13.5px] min-w-0 break-words" style={{ color: '#3E404A' }}>
                {row.nombre}
              </span>
              {/* INFO */}
              <div className="flex justify-end">
                <ConceptoDialog row={row} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {!isLoading && filtrados.length > 0 && (
        <div className="flex items-center justify-between py-4 px-[2px]">
          <span className="text-[12.5px]" style={{ color: '#9B9CA3' }}>
            {filtrados.length === conceptos.length
              ? `${conceptos.length} de ${conceptos.length} conceptos`
              : `${filtrados.length} de ${conceptos.length} conceptos`}
            {' · '}página {paginaActual} de {totalPaginas}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaActual === 1}
              className="bg-white border border-[#DFDCD3] rounded-[10px] text-[13.5px] font-semibold px-[17px] py-[10px] hover:bg-[#FBFAF6] disabled:opacity-40 transition-colors flex items-center gap-1"
              style={{ color: '#3E404A' }}
            >
              <ChevronLeft style={{ width: 14, height: 14 }} />
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaActual === totalPaginas}
              className="bg-white border border-[#DFDCD3] rounded-[10px] text-[13.5px] font-semibold px-[17px] py-[10px] hover:bg-[#FBFAF6] disabled:opacity-40 transition-colors flex items-center gap-1"
              style={{ color: '#3E404A' }}
            >
              Siguiente
              <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
