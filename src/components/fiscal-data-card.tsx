import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getMembreteData, updateClientFiscalData } from '@/actions/accounting';

/**
 * Datos fiscales de la empresa usados por el módulo de Balances: la norma del
 * ajuste por inflación (RT 54 / RT 6), la actividad principal y los datos de
 * inscripción que van al membrete de los EECC.
 *
 * Vive en la ficha del cliente y no en Contabilidad porque es identidad de la
 * empresa: la carga quien da de alta al cliente, no quien arma el balance.
 * (Es el reemplazo de la FiscalDataCard del modelo viejo.)
 */
export function FiscalDataCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { data: membrete } = useQuery({
    queryKey: ['accounting', 'membrete', clientId],
    queryFn: () => getMembreteData({ data: { clientId } }),
  });

  const [form, setForm] = useState({
    actividadPrincipal: '',
    fechaConstitucion: '',
    fechaInscripcion: '',
    numeroInscripcion: '',
    accountingFramework: 'rt54' as 'rt54' | 'rt6',
  });
  useEffect(() => {
    if (!membrete) return;
    setForm({
      actividadPrincipal: membrete.actividadPrincipal ?? '',
      fechaConstitucion: membrete.fechaConstitucion ?? '',
      fechaInscripcion: membrete.fechaInscripcion ?? '',
      numeroInscripcion: membrete.numeroInscripcion ?? '',
      accountingFramework: membrete.accountingFramework ?? 'rt54',
    });
  }, [membrete]);

  const mut = useMutation({
    mutationFn: () =>
      updateClientFiscalData({
        data: {
          clientId,
          actividadPrincipal: form.actividadPrincipal || null,
          fechaConstitucion: form.fechaConstitucion || null,
          fechaInscripcion: form.fechaInscripcion || null,
          numeroInscripcion: form.numeroInscripcion || null,
          accountingFramework: form.accountingFramework,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['accounting', 'membrete', clientId],
      });
      toast.success('Datos fiscales guardados');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Landmark className="h-4 w-4 text-[var(--arca-ink)]" />
          Datos fiscales y norma contable
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="fd-norma" className="text-xs">
              Norma contable aplicada
            </Label>
            <Select
              value={form.accountingFramework}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  accountingFramework: v as 'rt54' | 'rt6',
                }))
              }
            >
              <SelectTrigger id="fd-norma" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rt54">
                  RT 54 (T.O. RT 59) — entes pequeños
                </SelectItem>
                <SelectItem value="rt6">RT 6 — norma general</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Define cómo se cita el ajuste por inflación en los Estados
              Contables. El cálculo es el mismo en las dos.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fd-actividad" className="text-xs">
              Actividad principal
            </Label>
            <Input
              id="fd-actividad"
              value={form.actividadPrincipal}
              onChange={(e) =>
                setForm((f) => ({ ...f, actividadPrincipal: e.target.value }))
              }
              placeholder="Venta al por menor de…"
            />
          </div>
          {/* Tres columnas: los datos registrales van juntos y en orden
              cronológico — primero se constituye, después se inscribe. */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fd-constitucion" className="text-xs">
                Fecha de constitución
              </Label>
              <Input
                id="fd-constitucion"
                type="date"
                value={form.fechaConstitucion}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fechaConstitucion: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fd-fecha" className="text-xs">
                Fecha de inscripción (RPC)
              </Label>
              <Input
                id="fd-fecha"
                type="date"
                value={form.fechaInscripcion}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fechaInscripcion: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fd-numero" className="text-xs">
                N° de inscripción (IGJ)
              </Label>
              <Input
                id="fd-numero"
                value={form.numeroInscripcion}
                onChange={(e) =>
                  setForm((f) => ({ ...f, numeroInscripcion: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={mut.isPending}>
              {mut.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
