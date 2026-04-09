'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  listImportRecibosByPeriodo,
  getImportReciboDetalle,
} from '@/actions/sueldos';

const now = new Date();
const ANOS = Array.from({ length: 8 }, (_, i) => now.getFullYear() - i);
const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: format(new Date(2000, i, 1), 'MMMM', { locale: es }),
}));

interface SueldosReciboProps {
  clientId: string;
}

function moneyLabel(v: string | number): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return '—';
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SueldosRecibo({ clientId }: SueldosReciboProps) {
  const [ano, setAno] = useState(String(now.getFullYear()));
  const [mes, setMes] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const periodo = useMemo(() => `${ano}-${mes}`, [ano, mes]);
  const [reciboId, setReciboId] = useState('');

  const { data: recibosPeriodo = [], isLoading: loadingList } = useQuery({
    queryKey: ['import-recibos', clientId, periodo],
    queryFn: () =>
      listImportRecibosByPeriodo({
        data: { clientId, periodo },
      }),
    enabled: !!clientId,
  });

  const { data: detalle, isLoading: loadingDetalle } = useQuery({
    queryKey: ['import-recibo-detalle', reciboId, clientId],
    queryFn: () =>
      getImportReciboDetalle({
        data: { reciboId, clientId },
      }),
    enabled: !!reciboId && !!clientId,
  });

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Recibos importados (LSD)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Seleccioná período y empleado para ver totales y conceptos del
            recibo importado desde Excel.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Año</label>
            <Select
              value={ano}
              onValueChange={(v) => {
                setAno(v);
                setReciboId('');
              }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANOS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Mes</label>
            <Select
              value={mes}
              onValueChange={(v) => {
                setMes(v);
                setReciboId('');
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Empleado</label>
            <Select value={reciboId} onValueChange={setReciboId}>
              <SelectTrigger className="w-[min(100%,320px)] max-w-[320px]">
                <SelectValue
                  placeholder={
                    loadingList ? 'Cargando…' : 'Seleccioná un recibo'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {recibosPeriodo.map((r) => (
                  <SelectItem key={r.recibo.id} value={r.recibo.id}>
                    {`${r.empleadoNombre} · ${r.recibo.tipo}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {reciboId && (
        <div className="space-y-4">
          {loadingDetalle ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-muted-foreground">Cargando…</p>
              </CardContent>
            </Card>
          ) : !detalle ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-muted-foreground">
                  No se encontró el recibo.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="w-full max-w-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Datos del empleado
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <dl className="grid grid-cols-[minmax(4.5rem,auto)_1fr] gap-x-3 gap-y-2 text-sm">
                    <dt className="text-muted-foreground shrink-0">Nombre</dt>
                    <dd className="min-w-0 break-words font-medium">
                      {detalle.empleado.nombre}
                    </dd>
                    <dt className="text-muted-foreground">CUIL</dt>
                    <dd className="min-w-0 tabular-nums">
                      {detalle.empleado.cuil}
                    </dd>
                    <dt className="text-muted-foreground">Legajo</dt>
                    <dd className="min-w-0 tabular-nums">
                      {detalle.empleado.legajo}
                    </dd>
                    <dt className="text-muted-foreground">Período</dt>
                    <dd className="min-w-0">{detalle.recibo.periodo}</dd>
                    <dt className="text-muted-foreground">Tipo</dt>
                    <dd className="min-w-0 capitalize">
                      {detalle.recibo.tipo}
                    </dd>
                  </dl>
                </CardContent>
              </Card>

              <Card className="w-full min-w-0 max-w-full">
                <CardHeader>
                  <CardTitle className="text-base">Totales</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0">
                  <div className="max-w-full overflow-x-auto rounded-md border">
                    <Table className="w-full min-w-0 table-fixed">
                      <colgroup>
                        <col className="w-[55%]" />
                        <col className="w-[45%]" />
                      </colgroup>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Concepto</TableHead>
                          <TableHead className="text-right">Importe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell>Haberes</TableCell>
                          <TableCell className="text-right font-medium">
                            {moneyLabel(detalle.recibo.haberes)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>No remunerativo</TableCell>
                          <TableCell className="text-right">
                            {moneyLabel(detalle.recibo.noRemunerativo)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Descuentos</TableCell>
                          <TableCell className="text-right">
                            {moneyLabel(detalle.recibo.descuentos)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>Retenciones</TableCell>
                          <TableCell className="text-right">
                            {moneyLabel(detalle.recibo.retenciones)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-semibold">Neto</TableCell>
                          <TableCell className="text-right font-semibold">
                            {moneyLabel(detalle.recibo.neto)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card className="w-full min-w-0 max-w-full">
                <CardHeader>
                  <CardTitle className="text-base">
                    Conceptos LSD (código)
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Solo conceptos con importe distinto de cero en el archivo
                    importado.
                  </p>
                </CardHeader>
                <CardContent className="min-w-0">
                  {detalle.conceptos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay líneas de concepto para este recibo.
                    </p>
                  ) : (
                    <div className="max-w-full overflow-x-auto rounded-md border">
                      <Table className="w-full min-w-0 table-fixed">
                        <colgroup>
                          <col className="w-[35%]" />
                          <col className="w-[65%]" />
                        </colgroup>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detalle.conceptos.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-mono">
                                {c.codigo}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {moneyLabel(c.monto)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
