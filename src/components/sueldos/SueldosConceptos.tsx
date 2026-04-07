"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listConceptosByPerfil } from "@/actions/sueldos";
import { getClientProfiles } from "@/actions/client";

interface SueldosConceptosProps {
  clientId: string;
}

type ConceptoRow = Awaited<ReturnType<typeof listConceptosByPerfil>>[number];

function subsistemasAportes(row: ConceptoRow): string[] {
  const out: string[] = [];
  if (row.aportesSipa) out.push("SIPA");
  if (row.aportesInssjyp) out.push("INSSJYP");
  if (row.aportesObraSocial) out.push("Obra Social");
  if (row.aportesFsr) out.push("FSR");
  if (row.aportesRenatea) out.push("RENATEA");
  if (row.aportesDiferenciales) out.push("Diferenciales");
  if (row.aportesEspeciales) out.push("Especiales");
  return out;
}

function subsistemasContribuciones(row: ConceptoRow): string[] {
  const out: string[] = [];
  if (row.contribucionesSipa) out.push("SIPA");
  if (row.contribucionesInssjyp) out.push("INSSJYP");
  if (row.contribucionesObraSocial) out.push("Obra Social");
  if (row.contribucionesFsr) out.push("FSR");
  if (row.contribucionesRenatea) out.push("RENATEA");
  if (row.contribucionesAaff) out.push("AAFF");
  if (row.contribucionesFne) out.push("FNE");
  if (row.contribucionesLrt) out.push("LRT");
  return out;
}

export function SueldosConceptos({ clientId }: SueldosConceptosProps) {
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: perfiles = [] } = useQuery({
    queryKey: ["profiles", clientId],
    queryFn: () => getClientProfiles({ data: { clientId } }),
    enabled: !!clientId,
  });

  useEffect(() => {
    if (!selectedProfileId && perfiles.length > 0) {
      setSelectedProfileId(perfiles[0]!.id);
    }
  }, [perfiles, selectedProfileId]);

  const { data: conceptos = [], isLoading } = useQuery({
    queryKey: ["conceptos-by-perfil", clientId, selectedProfileId],
    queryFn: () =>
      listConceptosByPerfil({
        data: { clientId, profileId: selectedProfileId! },
      }),
    enabled: !!clientId && !!selectedProfileId,
  });

  const rowsWithKey = useMemo(
    () =>
      conceptos.map((row) => ({
        ...row,
        __key: `${row.codigoContribuyente}-${row.afipCodigo}`,
      })),
    [conceptos]
  );

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Perfil:</span>
        <Select
          value={selectedProfileId ?? ""}
          onValueChange={(v) => setSelectedProfileId(v)}
          disabled={!perfiles.length}
        >
          <SelectTrigger className="w-[320px]">
            <SelectValue placeholder="Seleccione un perfil" />
          </SelectTrigger>
          <SelectContent>
            {perfiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} {p.identityNumber ? `(${p.identityNumber})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Cód. SOS</TableHead>
              <TableHead>Concepto SOS</TableHead>
              <TableHead>Cód. AFIP</TableHead>
              <TableHead>Concepto AFIP</TableHead>
              <TableHead>Cód. Contribuyente</TableHead>
              <TableHead className="text-center">Repetible</TableHead>
              <TableHead className="text-center">Vinculado perfil</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : rowsWithKey.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No hay conceptos para este perfil.
                </TableCell>
              </TableRow>
            ) : (
              rowsWithKey.map((row) => {
                const expanded = expandedRows.has(row.__key);
                const aportes = subsistemasAportes(row);
                const contribuciones = subsistemasContribuciones(row);

                return (
                  <Fragment key={row.__key}>
                    <TableRow>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => toggleRow(row.__key)}
                          title={expanded ? "Ocultar subsistemas" : "Ver subsistemas"}
                        >
                          {expanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{row.codigoSos ?? "-"}</TableCell>
                      <TableCell>{row.nombreSos ?? "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{row.afipCodigo}</TableCell>
                      <TableCell>{row.afipNombre}</TableCell>
                      <TableCell className="font-mono text-sm">{row.codigoContribuyente}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={row.marcaRepetible ? "default" : "secondary"}>
                          {row.marcaRepetible ? "Sí" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={row.sosVinculadoPerfil ? "default" : "secondary"}>
                          {row.sosVinculadoPerfil ? "Sí" : "No"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {expanded ? (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/40">
                          <div className="grid gap-4 py-2 md:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                Aportes
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {aportes.length > 0 ? (
                                  aportes.map((item) => (
                                    <Badge key={`a-${row.__key}-${item}`} variant="outline">
                                      {item}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-sm text-muted-foreground">Sin aportes activos</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                                Contribuciones
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {contribuciones.length > 0 ? (
                                  contribuciones.map((item) => (
                                    <Badge key={`c-${row.__key}-${item}`} variant="outline">
                                      {item}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-sm text-muted-foreground">Sin contribuciones activas</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
