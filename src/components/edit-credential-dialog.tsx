import * as React from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Edit } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

import { getCredential, updateCredential } from "@/actions/credential";

const credentialSchema = z.object({
  provider: z.string().min(1, "El proveedor es requerido"),
  cuit: z.string().min(1, "El CUIT es requerido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

type CredentialFormValues = z.infer<typeof credentialSchema>;

interface EditCredentialDialogProps {
  credentialId: string;
  clientId: string;
  children: React.ReactNode;
}

export function EditCredentialDialog({
  credentialId,
  clientId,
  children,
}: EditCredentialDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: credential, isLoading } = useQuery({
    queryKey: ["credential", credentialId],
    queryFn: () => getCredential({ data: { id: credentialId } }),
    enabled: open,
  });

  const form = useForm<CredentialFormValues>({
    resolver: zodResolver(credentialSchema),
    defaultValues: {
      provider: "arca",
      cuit: "",
      password: "",
    },
  });

  // Update form when credential data is loaded
  React.useEffect(() => {
    if (credential) {
      form.reset({
        provider: credential.provider,
        cuit: credential.data.cuit || "",
        password: "", // Don't pre-fill password for security
      });
    }
  }, [credential, form]);

  const updateCredentialMutation = useMutation({
    mutationFn: updateCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials", clientId] });
      queryClient.invalidateQueries({ queryKey: ["credential", credentialId] });
      form.reset();
      setOpen(false);
      toast({
        title: "Credencial actualizada",
        description: "La credencial se ha actualizado exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al actualizar la credencial",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: CredentialFormValues) => {
    const { provider, cuit, password } = values;

    updateCredentialMutation.mutate({
      data: {
        id: credentialId,
        provider,
        data: { cuit, password },
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Editar Credencial
          </DialogTitle>
          <DialogDescription>
            Modifica los datos de la credencial seleccionada.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Cargando...</div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proveedor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un proveedor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="arca">Arca</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cuit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CUIT</FormLabel>
                    <FormControl>
                      <Input placeholder="20-12345678-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Ingresa la nueva contraseña"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={updateCredentialMutation.isPending}
                >
                  {updateCredentialMutation.isPending
                    ? "Actualizando..."
                    : "Actualizar"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
