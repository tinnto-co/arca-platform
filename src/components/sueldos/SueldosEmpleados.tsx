"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listImportEmpleados } from "@/actions/sueldos";

interface SueldosEmpleadosProps {
  clientId: string;
}

function formatDate(d: Date | string | null | undefined): string {
  if (d == null) return "—";
  try {
    const dt = typeof d === "string" ? parseISO(d) : d;
    return format(dt, "dd/MM/yyyy");
  } catch {
    return "—";
  }
}

export function SueldosEmpleados({ clientId }: SueldosEmpleadosProps) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["import-empleados", clientId],
    queryFn: () => listImportEmpleados({ data: { clientId } }),
    enabled: !!clientId,
  });

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      <p className="text-sm text-muted-foreground break-words">
        Datos importados desde liquidaciones LSD (histórico por perfil fiscal del cliente). Solo
        lectura.
      </p>

      {/* Contiene el scroll horizontal solo acá si hiciera falta en pantallas muy chicas */}
      <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-md border">
        <Table className="w-full min-w-0 table-fixed text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[9%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
            <col className="w-[13%]" />
            <col className="w-[15%]" />
            <col className="w-[9%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-normal">Nombre</TableHead>
              <TableHead>CUIL</TableHead>
              <TableHead>Legajo</TableHead>
              <TableHead className="whitespace-normal">Fecha alta</TableHead>
              <TableHead className="whitespace-normal">Fecha baja</TableHead>
              <TableHead className="whitespace-normal">Modo</TableHead>
              <TableHead className="whitespace-normal">Categoría</TableHead>
              <TableHead className="whitespace-normal">Perfil</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  No hay empleados importados para este cliente. Ejecutá el import de Excel en el
                  scrapper o verificá que los perfiles estén vinculados al cliente.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const e = r.empleado;
                const baja = e.fechaBaja != null;
                return (
                  <TableRow key={e.id}>
                    <TableCell className="min-w-0 break-words font-medium align-top py-2">
                      {e.nombre}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top py-2 tabular-nums">
                      {e.cuil}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top py-2 tabular-nums">
                      {e.legajo}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top py-2">
                      {formatDate(e.fechaAlta ?? undefined)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top py-2">
                      {formatDate(e.fechaBaja ?? undefined)}
                    </TableCell>
                    <TableCell className="min-w-0 break-words align-top py-2">
                      {e.modoContrato ?? "—"}
                    </TableCell>
                    <TableCell className="min-w-0 break-words align-top py-2">
                      {e.categoria ?? "—"}
                    </TableCell>
                    <TableCell className="min-w-0 break-words align-top py-2 text-muted-foreground">
                      {r.profileName}
                      {r.profileIdentityNumber ? ` (${r.profileIdentityNumber})` : ""}
                    </TableCell>
                    <TableCell className="align-top py-2">
                      {baja ? (
                        <Badge variant="secondary" className="whitespace-nowrap">
                          Baja
                        </Badge>
                      ) : (
                        <Badge variant="default" className="whitespace-nowrap">
                          Activo
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
