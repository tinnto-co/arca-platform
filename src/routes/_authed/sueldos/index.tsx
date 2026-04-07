import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  LayoutDashboard,
  Users,
  Building2,
  Calculator,
  Sliders,
  FileText,
  UserCircle,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { SueldosDashboard } from "@/components/sueldos/SueldosDashboard";
import { SueldosEmpleados } from "@/components/sueldos/SueldosEmpleados";
import { SueldosConvenios } from "@/components/sueldos/SueldosConvenios";
import { SueldosConceptos } from "@/components/sueldos/SueldosConceptos";
import { SueldosSimulador } from "@/components/sueldos/SueldosSimulador";
import { SueldosRecibo } from "@/components/sueldos/SueldosRecibo";
import { getClients } from "@/actions/client";

export const Route = createFileRoute("/_authed/sueldos/")({
  component: RouteComponent,
});

function RouteComponent() {
  const [clientId, setClientId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("dashboard");

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => getClients(),
  });

  return (
    <div className="space-y-4 p-4 md:space-y-6 md:p-0 md:m-[3rem] overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-[#139ed9]" />
          <h1 className="text-2xl font-bold text-[#232c50]">Liquidación de sueldos</h1>
        </div>
        <div className="flex items-center gap-2">
          <UserCircle className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Cliente:</span>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Seleccione un cliente" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!clientId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <UserCircle className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Seleccione un cliente</h2>
            <p className="text-muted-foreground max-w-md">
              Elija un cliente en el selector superior para gestionar convenios, empleados,
              conceptos y liquidaciones de sueldos de ese cliente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0 max-w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="empleados" className="gap-2">
              <Users className="h-4 w-4" />
              Empleados
            </TabsTrigger>
            <TabsTrigger value="convenios" className="gap-2">
              <Building2 className="h-4 w-4" />
              Convenios
            </TabsTrigger>
            <TabsTrigger value="conceptos" className="gap-2">
              <Calculator className="h-4 w-4" />
              Conceptos
            </TabsTrigger>
            <TabsTrigger value="simulador" className="gap-2">
              <Sliders className="h-4 w-4" />
              Simulador
            </TabsTrigger>
            <TabsTrigger value="recibo" className="gap-2">
              <FileText className="h-4 w-4" />
              Recibo
            </TabsTrigger>
          </TabsList>
          <div className="mt-4 min-w-0 max-w-full">
            <TabsContent value="dashboard">
              <SueldosDashboard clientId={clientId} />
            </TabsContent>
            <TabsContent value="empleados">
              <SueldosEmpleados clientId={clientId} />
            </TabsContent>
            <TabsContent value="convenios">
              <SueldosConvenios clientId={clientId} />
            </TabsContent>
            <TabsContent value="conceptos">
              <SueldosConceptos clientId={clientId} />
            </TabsContent>
            <TabsContent value="simulador">
              <SueldosSimulador clientId={clientId} />
            </TabsContent>
            <TabsContent value="recibo">
              <SueldosRecibo clientId={clientId} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
}
