import * as React from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { User, Mail, Phone, MapPin, Calendar } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getClient } from "@/actions/client";
import { CredentialsTable } from "./credentials-table";

interface ViewClientDialogProps {
  clientId: string;
  children: React.ReactNode;
}

export function ViewClientDialog({
  clientId,
  children,
}: ViewClientDialogProps) {
  const [open, setOpen] = useState(false);

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClient({ data: { id: clientId } }),
    enabled: open,
  });

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "individual":
        return "Individual";
      case "company":
        return "Empresa";
      default:
        return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default">Activo</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactivo</Badge>;
      case "pending":
        return <Badge variant="outline">Pendiente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Información del Cliente
          </DialogTitle>
          <DialogDescription>
            Detalles completos del cliente seleccionado.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Cargando...</div>
          </div>
        ) : client ? (
          <div className="space-y-6">
            {/* Client Header */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {client.image && (
                  <AvatarImage src={client.image} alt={client.name} />
                )}
                <AvatarFallback className="text-lg">
                  {client.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-xl font-semibold">{client.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  {getStatusBadge(client.status)}
                  <Badge variant="outline">{getTypeLabel(client.type)}</Badge>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Información de Contacto
              </h4>
              <div className="grid gap-3">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{client.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{client.phone}</span>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span className="text-sm">{client.address}</span>
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Información Adicional
              </h4>
              <div className="grid gap-3">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Registrado:
                    </span>
                    <span className="text-sm ml-2">
                      {new Date(client.registeredAt).toLocaleDateString(
                        "es-ES",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        }
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="text-sm text-muted-foreground">
                      Última actualización:
                    </span>
                    <span className="text-sm ml-2">
                      {new Date(client.updatedAt).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Credentials Section */}
            <div className="mt-8">
              <CredentialsTable clientId={clientId} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">
              Error al cargar el cliente
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
