import * as React from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Edit } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getClient, updateClient } from "@/actions/client";

const clientSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  email: z
    .string()
    .optional()
    .refine(
      (val) => !val || val === "" || z.string().email().safeParse(val).success,
      { message: "Email inválido" }
    )
    .or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  image: z.string().optional(),
});

type ClientFormValues = z.infer<typeof clientSchema>;

interface EditClientDialogProps {
  clientId: string;
  children: React.ReactNode;
}

export function EditClientDialog({
  clientId,
  children,
}: EditClientDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const { data: client, isLoading: loadingClient } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClient({ data: { id: clientId } }),
    enabled: open,
  });

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      address: "",
      type: "",
      image: "",
    },
  });

  // Update form when client data loads
  React.useEffect(() => {
    if (client) {
      form.reset({
        name: client.name,
        email: client.email || "",
        phone: client.phone || "",
        address: client.address || "",
        image: client.image || "",
      });
    }
  }, [client, form]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateClient({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      toast.success("Cliente actualizado exitosamente");
      setOpen(false);
    },
    onError: (error) => {
      console.error("Error updating client:", error);
      toast.error("Error al actualizar el cliente");
    },
  });

  const onSubmit = async (values: ClientFormValues) => {
    setLoading(true);
    try {
      await updateMutation.mutateAsync({
        id: clientId,
        ...values,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Editar Cliente
          </DialogTitle>
          <DialogDescription>
            Modifica la información del cliente seleccionado.
          </DialogDescription>
        </DialogHeader>

        {loadingClient ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Cargando...</div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input placeholder="Nombre del cliente" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (opcional)</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="cliente@ejemplo.com"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono (opcional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="+54 9 11 1234-5678" 
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección (opcional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Dirección completa" 
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="image"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Imagen (URL)</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://ejemplo.com/imagen.jpg"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Actualizar Cliente
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
