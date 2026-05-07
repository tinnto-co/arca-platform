'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Info className="h-4 w-4" />
        </Button>
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
    <div className="w-full min-w-0 max-w-full space-y-3">
      <p className="text-sm text-muted-foreground">
        Catálogo completo de conceptos SOS (códigos 1–699). Todos los conceptos están disponibles
        para usar en cualquier recibo.
      </p>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o código AFIP…"
          value={busqueda}
          onChange={(e) => handleBusqueda(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table className="w-full text-sm">
          <colgroup>
            <col className="w-16" />
            <col className="w-24" />
            <col />
            <col className="w-10" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Cód. SOS</TableHead>
              <TableHead>Cód. AFIP</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  {busqueda ? 'Sin resultados para la búsqueda.' : 'No hay conceptos en el catálogo.'}
                </TableCell>
              </TableRow>
            ) : (
              pagina_rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono">{row.numeroSos}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {row.codigoAfip ?? '—'}
                  </TableCell>
                  <TableCell className="min-w-0 break-words">{row.nombre}</TableCell>
                  <TableCell className="text-center">
                    <ConceptoDialog row={row} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!isLoading && filtrados.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {filtrados.length === conceptos.length
              ? `${conceptos.length} conceptos`
              : `${filtrados.length} de ${conceptos.length} conceptos`}
            {' · '}página {paginaActual} de {totalPaginas}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaActual === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaActual === totalPaginas}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
