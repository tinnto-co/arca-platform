'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { listConceptosByPerfil } from '@/actions/sueldos';

interface SueldosConceptosProps {
  clientId: string;
  profileId: string;
}

type ConceptoRow = Awaited<ReturnType<typeof listConceptosByPerfil>>[number];

const SUBSISTEMAS: {
  label: string;
  aporte: keyof ConceptoRow | null;
  contribucion: keyof ConceptoRow | null;
}[] = [
  { label: 'SIPA', aporte: 'aportesSipa', contribucion: 'contribucionesSipa' },
  {
    label: 'INSSJYP',
    aporte: 'aportesInssjyp',
    contribucion: 'contribucionesInssjyp',
  },
  {
    label: 'Obra Social',
    aporte: 'aportesObraSocial',
    contribucion: 'contribucionesObraSocial',
  },
  { label: 'FSR', aporte: 'aportesFsr', contribucion: 'contribucionesFsr' },
  {
    label: 'RENATEA',
    aporte: 'aportesRenatea',
    contribucion: 'contribucionesRenatea',
  },
  { label: 'Dif.', aporte: 'aportesDiferenciales', contribucion: null },
  { label: 'Esp.', aporte: 'aportesEspeciales', contribucion: null },
  { label: 'AAFF', aporte: null, contribucion: 'contribucionesAaff' },
  { label: 'FNE', aporte: null, contribucion: 'contribucionesFne' },
  { label: 'LRT', aporte: null, contribucion: 'contribucionesLrt' },
];

function Check({ value }: { value: boolean | null }) {
  if (value === null)
    return <span className="text-muted-foreground text-xs">—</span>;
  return value ? (
    <span className="text-green-600 font-bold">✓</span>
  ) : (
    <span className="text-muted-foreground">✗</span>
  );
}

function ConceptoDialog({ row }: { row: ConceptoRow }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            <span className="font-mono text-muted-foreground mr-2">
              {row.afipCodigo}
            </span>
            {row.afipNombre}
          </DialogTitle>
        </DialogHeader>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-28 text-xs" />
              {SUBSISTEMAS.map((s) => (
                <TableHead
                  key={s.label}
                  className="text-center text-xs px-1 whitespace-nowrap"
                >
                  {s.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium text-xs">Aportes</TableCell>
              {SUBSISTEMAS.map((s) => (
                <TableCell key={s.label} className="text-center px-1 py-2">
                  <Check value={s.aporte ? (row[s.aporte] as boolean) : null} />
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className="font-medium text-xs">
                Contribuciones
              </TableCell>
              {SUBSISTEMAS.map((s) => (
                <TableCell key={s.label} className="text-center px-1 py-2">
                  <Check
                    value={
                      s.contribucion ? (row[s.contribucion] as boolean) : null
                    }
                  />
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}

export function SueldosConceptos({
  clientId,
  profileId,
}: SueldosConceptosProps) {
  const { data: conceptos = [], isLoading } = useQuery({
    queryKey: ['conceptos-by-perfil', clientId, profileId],
    queryFn: () => listConceptosByPerfil({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });

  const rows = useMemo(
    () =>
      conceptos.map((row) => ({
        ...row,
        __key: `${row.codigoContribuyente}-${row.afipCodigo}`,
      })),
    [conceptos]
  );

  return (
    <div className="w-full min-w-0 max-w-full">
      <div className="rounded-md border overflow-hidden">
        <Table className="w-full text-sm">
          <colgroup>
            <col className="w-20" />
            <col className="w-20" />
            <col />
            <col className="w-10" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>Cód. AFIP</TableHead>
              <TableHead>Cód. Contribuyente</TableHead>
              <TableHead>Concepto AFIP</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  Cargando...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  No hay conceptos para este perfil.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.__key}>
                  <TableCell className="font-mono">{row.afipCodigo}</TableCell>
                  <TableCell className="font-mono">{row.codigoContribuyente}</TableCell>
                  <TableCell className="min-w-0 break-words">
                    <div className="space-y-0.5">
                      <p>{row.afipNombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.descripcionContribuyente}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <ConceptoDialog row={row} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
