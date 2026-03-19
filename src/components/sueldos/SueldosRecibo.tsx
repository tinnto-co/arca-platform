"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FileText, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listLiquidacionesByPeriodo, getReciboDetalle, getPayrollEmployerConfig } from "@/actions/sueldos";
import { montoEnLetras } from "@/lib/numero-a-letras";
import { Button } from "@/components/ui/button";
import {
  getPeriodoMesAnterior,
  getPeriodoMesActual,
} from "@/lib/payroll-period-rules";

const now = new Date();
const ANOS = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, "0"),
  label: format(new Date(2000, i, 1), "MMMM", { locale: es }),
}));

interface SueldosReciboProps {
  clientId: string;
  reciboPreload?: { periodo: string; liquidacionId: string } | null;
  onPreloadApplied?: () => void;
}

const periodoActual = getPeriodoMesActual();
const [PERIODO_INICIAL_ANO, PERIODO_INICIAL_MES] = getPeriodoMesAnterior().split("-");

export function SueldosRecibo({
  clientId,
  reciboPreload,
  onPreloadApplied,
}: SueldosReciboProps) {
  const [ano, setAno] = useState(PERIODO_INICIAL_ANO);
  const [mes, setMes] = useState(PERIODO_INICIAL_MES);
  const periodo = useMemo(() => `${ano}-${mes}`, [ano, mes]);
  const [liquidacionId, setLiquidacionId] = useState("");

  /** Solo meses anteriores al en curso: para el año seleccionado, filtrar meses */
  const mesesDisponibles = useMemo(() => {
    const anoActual = now.getFullYear();
    const mesEnCurso = now.getMonth() + 1; // 1-indexed
    if (Number(ano) === anoActual) {
      return MESES.slice(0, mesEnCurso - 1);
    }
    return MESES;
  }, [ano]);

  useEffect(() => {
    if (!reciboPreload) return;
    const periodoPreload = reciboPreload.periodo;
    if (periodoPreload >= periodoActual) return;
    const [a, m] = periodoPreload.split("-");
    setAno(a);
    setMes(m);
    setLiquidacionId(reciboPreload.liquidacionId);
    onPreloadApplied?.();
  }, [reciboPreload, onPreloadApplied]);

  useEffect(() => {
    if (periodo >= periodoActual) {
      const [a, m] = getPeriodoMesAnterior().split("-");
      setAno(a);
      setMes(m);
      setLiquidacionId("");
    }
  }, [periodo, periodoActual]);

  const { data: liquidaciones = [] } = useQuery({
    queryKey: ["liquidaciones", clientId, periodo, "recibo"],
    queryFn: () =>
      listLiquidacionesByPeriodo({
        data: { clientId, periodo, soloRecibosConfirmados: true },
      }),
    enabled: !!clientId,
  });

  const { data: recibo, isLoading } = useQuery({
    queryKey: ["recibo", liquidacionId],
    queryFn: () => getReciboDetalle({ data: { liquidacionId, clientId } }),
    enabled: !!liquidacionId && !!clientId,
  });

  const { data: employerConfig } = useQuery({
    queryKey: ["payroll-employer-config", clientId],
    queryFn: () => getPayrollEmployerConfig({ data: { clientId } }),
    enabled: !!clientId,
  });

  const options = liquidaciones.map((l) => ({
    id: l.liquidacion.id,
    label: `${l.empleado.apellido}, ${l.empleado.nombre}`,
  }));

  const handleImprimirPdf = () => {
    const cleanup = () => {
      document.body.classList.remove("recibo-print-mode");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    document.body.classList.add("recibo-print-mode");
    window.print();
  };

  return (
    <div className="space-y-6">
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Recibo de sueldo</CardTitle>
          <p className="text-sm text-muted-foreground">
            Seleccione período y empleado para ver el recibo.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <p className="text-xs text-muted-foreground w-full">
            Solo se muestran meses anteriores al en curso.
          </p>
          <div>
            <label className="mb-2 block text-sm font-medium">Año</label>
            <Select
              value={ano}
              onValueChange={(v) => {
                setAno(v);
                setLiquidacionId("");
                const mesEnCurso = now.getMonth() + 1;
                const anoActual = now.getFullYear();
                if (Number(v) === anoActual && Number(mes) >= mesEnCurso) {
                  setMes(String(mesEnCurso - 1).padStart(2, "0"));
                }
              }}
            >
              <SelectTrigger className="w-[100px]">
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
            <Select value={mes} onValueChange={(v) => { setMes(v); setLiquidacionId(""); }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mesesDisponibles.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">Empleado</label>
            <Select value={liquidacionId} onValueChange={setLiquidacionId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Seleccione liquidación" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {liquidacionId && (
            <Button
              type="button"
              variant="outline"
              onClick={handleImprimirPdf}
              className="print:hidden"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Imprimir PDF
            </Button>
          )}
        </CardContent>
      </Card>

      {liquidacionId && (
        <div className="space-y-6">
          {isLoading ? (
            <Card className="min-w-[420px] max-w-2xl">
              <CardContent className="py-8">
                <p className="text-muted-foreground">Cargando…</p>
              </CardContent>
            </Card>
          ) : !recibo ? (
            <Card className="min-w-[420px] max-w-2xl">
              <CardContent className="py-8">
                <p className="text-muted-foreground">No se encontró el recibo.</p>
              </CardContent>
            </Card>
          ) : (
            <div
              id="recibo-print-area"
              className="recibo-print-area grid gap-8 w-full grid-cols-1 md:grid-cols-[minmax(420px,1fr)_minmax(420px,1fr)] overflow-x-auto print:grid-cols-1 print:gap-0 print:overflow-visible"
            >
              <ReciboContent
                recibo={recibo}
                periodo={periodo}
                tituloEjemplar="Ejemplar empleado"
                imprimirTotalRedondeado={employerConfig?.imprimirTotalRedondeado ?? false}
                firmaEmpleadorUrl={employerConfig?.firmaEmpleadorUrl ?? null}
              />
              <ReciboContent
                recibo={recibo}
                periodo={periodo}
                tituloEjemplar="Ejemplar empleador"
                imprimirTotalRedondeado={employerConfig?.imprimirTotalRedondeado ?? false}
                firmaEmpleadorUrl={employerConfig?.firmaEmpleadorUrl ?? null}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReciboContent({
  recibo,
  periodo,
  tituloEjemplar,
  imprimirTotalRedondeado = false,
  firmaEmpleadorUrl = null,
}: {
  recibo: {
    liquidacion: {
      totalRemunerativo: string;
      totalNoRemunerativo: string | null;
      totalDescuentos: string;
      neto: string;
    };
    empleado: { apellido: string; nombre: string; cuilCuil: string };
    convenio: { nombre: string };
    categoria: { nombre: string };
    detalles: {
      detalle: { id: string; monto: string; cantidad: string | null };
      concepto: {
        codigo: string;
        nombre: string;
        tipo: "remunerativo" | "no_remunerativo" | "descuento";
        formula?: string;
      };
    }[];
  };
  periodo: string;
  tituloEjemplar: "Ejemplar empleado" | "Ejemplar empleador";
  imprimirTotalRedondeado?: boolean;
  firmaEmpleadorUrl?: string | null;
}) {
  const liq = recibo.liquidacion;
  const netoNum = Number(liq.neto);
  const netoDisplay = imprimirTotalRedondeado ? Math.round(netoNum) : netoNum;
  const emp = recibo.empleado;
  const isEjemplarEmpleador = tituloEjemplar === "Ejemplar empleador";
  // periodo viene del filtro como "YYYY-MM"
  const [anio, mes] = periodo.split("-");
  const periodoLabel = format(
    new Date(parseInt(anio, 10), parseInt(mes, 10) - 1, 1),
    "MMMM yyyy",
    { locale: es }
  );

  /** Devuelve el texto para la columna Cantidad: días (básico), % presentismo, % descuentos, o cantidad de novedad */
  function cantidadLabel(
    d: (typeof recibo.detalles)[number]
  ): string {
    const codigo = d.concepto.codigo?.toUpperCase() ?? "";
    const formula = d.concepto.formula ?? "";
    const cant = d.detalle.cantidad != null ? Number(d.detalle.cantidad) : null;

    if (codigo === "BASICO") return "30"; // días trabajados del mes
    if (codigo === "PRES") return "8,33%";
    if (d.concepto.tipo === "descuento" && formula) {
      const match = formula.match(/0\.\d+/);
      if (match) {
        const pct = parseFloat(match[0]) * 100;
        return pct % 1 === 0 ? `${Math.round(pct)}%` : `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
      }
    }
    if (cant != null && !Number.isNaN(cant) && cant !== 0)
      return String(cant);
    return "";
  }

  /** Quita del nombre del concepto la parte entre paréntesis con porcentaje (ej. "Jubilación (11%)" → "Jubilación") */
  const nombreSinParentesis = (nombre: string) =>
    nombre.replace(/\s*\([^)]*%[^)]*\)\s*$/, "").trim();

  const filas = recibo.detalles.map((d) => {
    const monto = Number(d.detalle.monto);
    const tipo = d.concepto.tipo;
    return {
      id: d.detalle.id,
      nombre: nombreSinParentesis(d.concepto.nombre),
      cantidadTexto: cantidadLabel(d),
      remunerativo: tipo === "remunerativo" ? monto : 0,
      noRemunerativo: tipo === "no_remunerativo" ? monto : 0,
      descuentos: tipo === "descuento" ? monto : 0,
    };
  });

  const totalRemunerativo = filas.reduce((acc, f) => acc + f.remunerativo, 0);
  const totalNoRemunerativo = filas.reduce((acc, f) => acc + f.noRemunerativo, 0);
  const totalDescuentos = filas.reduce((acc, f) => acc + f.descuentos, 0);

  return (
    <Card className="recibo-sheet min-w-[420px] max-w-2xl w-full print:max-w-none print:min-w-0 print:break-inside-avoid flex-shrink-0 print:overflow-visible">
      <CardContent className="p-6 font-sans print:shadow-none print:overflow-visible">
        <div className="space-y-6">
          <div className="border-b pb-4">
            <h2 className="text-lg font-bold">Recibo de haberes</h2>
            <p className="text-muted-foreground capitalize">{periodoLabel}</p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {tituloEjemplar}
            </p>
          </div>
      <div className="grid gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Empleado</span>
          <span>{emp.apellido}, {emp.nombre}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">CUIT/CUIL</span>
          <span>{emp.cuilCuil}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Convenio</span>
          <span>{recibo.convenio.nombre}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Categoría</span>
          <span>{recibo.categoria.nombre}</span>
        </div>
      </div>

      <div className="space-y-2 border-t pt-4">
        <h3 className="font-semibold">Detalle de conceptos</h3>
        <div className="overflow-x-auto rounded-md border print:overflow-visible">
          <table className="w-full text-xs md:text-sm print:text-sm table-fixed">
            <colgroup>
              <col className="w-[30%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead className="bg-muted/60">
              <tr className="border-b text-muted-foreground">
                <th className="px-2 py-1 text-left whitespace-nowrap">Concepto</th>
                <th className="px-2 py-1 text-center whitespace-nowrap">Cantidad</th>
                <th className="px-2 py-1 text-right whitespace-nowrap">Remunerativo</th>
                <th className="px-2 py-1 text-right whitespace-nowrap">No remunerativo</th>
                <th className="px-2 py-1 text-right whitespace-nowrap">Descuentos</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b last:border-b-0">
                  <td className="px-2 py-1 whitespace-nowrap">{f.nombre}</td>
                  <td className="px-2 py-1 text-center whitespace-nowrap">{f.cantidadTexto}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {f.remunerativo !== 0
                      ? `$${f.remunerativo.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                      : ""}
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {f.noRemunerativo !== 0
                      ? `$${f.noRemunerativo.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                      : ""}
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {f.descuentos !== 0
                      ? `- $${f.descuentos.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold">
                <td className="px-2 py-1 text-left whitespace-nowrap">Totales</td>
                <td className="px-2 py-1" />
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {`$${totalRemunerativo.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {`$${totalNoRemunerativo.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">
                  {`- $${totalDescuentos.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`}
                </td>
              </tr>
              <tr className="border-t-2 border-foreground/20 font-bold">
                <td className="px-2 py-2 text-left whitespace-nowrap" colSpan={4}>
                  Neto a cobrar
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  ${netoDisplay.toLocaleString("es-AR", { minimumFractionDigits: imprimirTotalRedondeado ? 0 : 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

        <div className="mt-16 pt-10">
          <div className="flex flex-col items-end gap-2">
            {isEjemplarEmpleador && firmaEmpleadorUrl ? (
              <img
                src={firmaEmpleadorUrl}
                alt="Firma del empleador"
                className="h-[3rem] w-56 object-contain object-right border-b-2 border-foreground"
              />
            ) : (
              <div className="min-h-[3rem] w-56 border-b-2 border-foreground" aria-hidden />
            )}
            <span className="text-xs text-muted-foreground">
              Firma {isEjemplarEmpleador ? "del empleador" : "del empleado"}
            </span>
          </div>
          <p className="mt-6 text-sm break-words">
            <span className="text-muted-foreground">Son: </span>
            <span className="font-medium">{montoEnLetras(netoDisplay)}</span>
          </p>
        </div>
        </div>
      </CardContent>
    </Card>
  );
}
