import * as React from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Eye, EyeOff, Check, Search, Building2, User, Plus, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { createRepresentativeWithClients } from '@/actions/client';

const SCRAPPER_URL =
  process.env.SCRAPPER_JOBS_URL ||
  process.env.BACKEND_API_URL ||
  'http://localhost:3002';

const credentialsSchema = z.object({
  cuit: z.string().min(11, 'El CUIT debe tener al menos 11 dígitos'),
  password: z.string().min(1, 'La contraseña de ARCA es requerida'),
  email: z.string().email('Email inválido').or(z.literal('')).optional(),
  phone: z.string().optional(),
});

type CredentialsValues = z.infer<typeof credentialsSchema>;

const manualClientSchema = z.object({
  cuit: z.string().min(11, 'El CUIT debe tener al menos 11 dígitos'),
  name: z.string().min(1, 'El nombre es requerido'),
});

type ManualClientValues = z.infer<typeof manualClientSchema>;

interface DiscoveredProfile {
  cuit: string;
  name: string;
}

function friendlyError(msg: string): string {
  const technical = [
    'detached Frame',
    'Target closed',
    'Session closed',
    'Protocol error',
    'Navigation timeout',
    'Execution context was destroyed',
    'net::ERR_',
  ];
  if (technical.some((t) => msg.includes(t))) {
    return 'Hubo un problema de conexión con AFIP. Por favor intentá de nuevo en unos minutos.';
  }
  return msg;
}

interface CreateRepresentativeDialogProps {
  children: React.ReactNode;
}

export function CreateRepresentativeDialog({ children }: CreateRepresentativeDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'credentials' | 'select-clients'>('credentials');
  const [discovering, setDiscovering] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [showManualAdd, setShowManualAdd] = useState(false);

  // Discovery results
  const [representativeName, setRepresentativeName] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<DiscoveredProfile[]>([]);
  const [selectedCuits, setSelectedCuits] = useState<Set<string>>(new Set());
  const [credentials, setCredentials] = useState<{ cuit: string; password: string; email?: string; phone?: string } | null>(null);

  const queryClient = useQueryClient();

  const form = useForm<CredentialsValues>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { cuit: '', password: '', email: '', phone: '' },
  });

  const manualForm = useForm<ManualClientValues>({
    resolver: zodResolver(manualClientSchema),
    defaultValues: { cuit: '', name: '' },
  });

  const reset = () => {
    setStep('credentials');
    setDiscovering(false);
    setCreating(false);
    setShowPassword(false);
    setError(null);
    setProgressMessage(null);
    setShowManualAdd(false);
    setRepresentativeName(null);
    setProfiles([]);
    setSelectedCuits(new Set());
    setCredentials(null);
    form.reset();
    manualForm.reset();
  };

  const onDiscover = async (values: CredentialsValues) => {
    setDiscovering(true);
    setError(null);
    setProgressMessage('Conectando...');

    try {
      const response = await fetch(`${SCRAPPER_URL}/api/discovery/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuit: values.cuit, password: values.password }),
      });

      if (!response.ok && !response.headers.get('content-type')?.includes('text/event-stream')) {
        const json = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(json.error || `Error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No se pudo leer la respuesta');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ') && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              if (eventType === 'progress') {
                setProgressMessage(data.message);
              } else if (eventType === 'result') {
                setRepresentativeName(data.representativeName || null);
                setProfiles(data.profiles || []);
                setSelectedCuits(new Set((data.profiles || []).map((p: DiscoveredProfile) => p.cuit)));
                setCredentials({ cuit: values.cuit, password: values.password, email: values.email, phone: values.phone });
                setStep('select-clients');
                setOpen(true);
              } else if (eventType === 'error') {
                setOpen(true);
                setError(friendlyError(data.error));
              }
            } catch {}
            eventType = '';
          }
        }
      }
    } catch (err: any) {
      setError(friendlyError(err?.message || 'Error al descubrir perfiles'));
    } finally {
      setDiscovering(false);
      setProgressMessage(null);
    }
  };

  const goToManualMode = () => {
    // Skip discovery, go to select-clients with empty profiles
    const values = form.getValues();
    if (!values.cuit || !values.password) {
      setError('Completá CUIT y contraseña antes de continuar');
      return;
    }
    setCredentials({ cuit: values.cuit, password: values.password, email: values.email, phone: values.phone });
    setProfiles([]);
    setSelectedCuits(new Set());
    setStep('select-clients');
    setError(null);
  };

  const addManualClient = (values: ManualClientValues) => {
    if (profiles.some((p) => p.cuit === values.cuit)) {
      toast.error('Ese CUIT ya está en la lista');
      return;
    }
    setProfiles((prev) => [...prev, { cuit: values.cuit, name: values.name }]);
    setSelectedCuits((prev) => new Set([...prev, values.cuit]));
    manualForm.reset();
    setShowManualAdd(false);
  };

  const toggleCuit = (cuit: string) => {
    setSelectedCuits((prev) => {
      const next = new Set(prev);
      if (next.has(cuit)) next.delete(cuit);
      else next.add(cuit);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedCuits.size === profiles.length) {
      setSelectedCuits(new Set());
    } else {
      setSelectedCuits(new Set(profiles.map((p) => p.cuit)));
    }
  };

  const onCreate = async () => {
    if (!credentials || selectedCuits.size === 0) return;
    setCreating(true);
    setError(null);

    try {
      await createRepresentativeWithClients({
        data: {
          cuit: credentials.cuit,
          password: credentials.password,
          name: representativeName || undefined,
          email: credentials.email || undefined,
          phone: credentials.phone || undefined,
          clients: profiles
            .filter((p) => selectedCuits.has(p.cuit))
            .map((p) => ({ cuit: p.cuit, name: p.name })),
        },
      });

      queryClient.invalidateQueries({ queryKey: ['representativesWithClients'] });
      toast.success('Representante y clientes creados exitosamente');
      reset();
      setOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Error al crear');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v && !discovering) reset();
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        {step === 'credentials' ? (
          <>
            <div className="space-y-1 pb-2">
              <h2 className="text-lg font-semibold">Agregar representante AFIP</h2>
              <p className="text-sm text-muted-foreground">
                Ingresá las credenciales de la persona física que se loguea en AFIP.
                Vamos a verificar el acceso y descubrir los clientes asociados.
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onDiscover)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="cuit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CUIT del representante</FormLabel>
                      <FormControl>
                        <Input placeholder="20123456789" {...field} disabled={discovering} />
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
                      <FormLabel>Clave fiscal AFIP</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Contraseña de ARCA"
                            {...field}
                            disabled={discovering}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                        <FormControl>
                          <Input placeholder="email@ejemplo.com" {...field} disabled={discovering} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                        <FormControl>
                          <Input placeholder="11 1234-5678" {...field} disabled={discovering} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={discovering}>
                  {discovering ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      <span className="truncate">{progressMessage || 'Conectando...'}</span>
                    </span>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Verificar y descubrir clientes
                    </>
                  )}
                </Button>

                {!discovering && (
                  <button
                    type="button"
                    onClick={goToManualMode}
                    className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <PenLine className="inline h-3 w-3 mr-1" />
                    Agregar clientes manualmente (sin verificar AFIP)
                  </button>
                )}
              </form>
            </Form>
          </>
        ) : (
          <>
            <div className="space-y-1 pb-2">
              <h2 className="text-lg font-semibold">Seleccionar clientes</h2>
              {representativeName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  Representante: <span className="font-medium text-foreground">{representativeName}</span>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {profiles.length > 0
                  ? 'Seleccioná cuáles de los perfiles descubiertos son clientes de tu estudio.'
                  : 'Agregá manualmente los clientes de este representante.'}
              </p>
            </div>

            <div className="space-y-2">
              {profiles.length > 1 && (
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs text-primary hover:underline"
                >
                  {selectedCuits.size === profiles.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
              )}

              <div className="max-h-[250px] overflow-y-auto space-y-2">
                {profiles.map((p) => (
                  <label
                    key={p.cuit}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedCuits.has(p.cuit)
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <Checkbox
                      checked={selectedCuits.has(p.cuit)}
                      onCheckedChange={() => toggleCuit(p.cuit)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm truncate">{p.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">{p.cuit}</span>
                    </div>
                  </label>
                ))}
              </div>

              {profiles.length === 0 && !showManualAdd && (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  No hay clientes todavía. Agregá uno manualmente.
                </div>
              )}

              {/* Manual add form */}
              {showManualAdd ? (
                <Form {...manualForm}>
                  <form onSubmit={manualForm.handleSubmit(addManualClient)} className="rounded-lg border border-dashed p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={manualForm.control}
                        name="cuit"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">CUIT</FormLabel>
                            <FormControl>
                              <Input placeholder="30123456789" className="h-8 text-sm" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={manualForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Nombre / Razón social</FormLabel>
                            <FormControl>
                              <Input placeholder="Empresa SRL" className="h-8 text-sm" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" className="flex-1">
                        <Plus className="mr-1 h-3 w-3" /> Agregar
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setShowManualAdd(false); manualForm.reset(); }}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowManualAdd(true)}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed p-2.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar cliente manualmente
                </button>
              )}
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => { setStep('credentials'); setError(null); }}
                disabled={creating}
                className="flex-1"
              >
                Volver
              </Button>
              <Button
                onClick={onCreate}
                disabled={creating || selectedCuits.size === 0}
                className="flex-1"
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Crear ({selectedCuits.size} {selectedCuits.size === 1 ? 'cliente' : 'clientes'})
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
