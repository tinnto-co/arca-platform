import { createFileRoute } from '@tanstack/react-router';
import { DragDrop } from '@/components/drag-drop';
import { ScanText } from 'lucide-react';
import { useState } from 'react';
import { scanBankStatement } from '@/actions/scannerAi';
import { Button } from '@/components/ui/button';
import { RenderPdfInfo } from '@/components/render-pdf-info';
import { getRepresentatives } from '@/actions/client';
import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { Check, ChevronsUpDown, FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authed/scan_pdf/')({
  component: RouteComponent,
});

function RouteComponent() {
  const [file, setFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getRepresentatives(),
  });

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleScan = async () => {
    if (!file) return;

    setIsScanning(true);

    try {
      const base64 = await fileToBase64(file);

      const response = await scanBankStatement({
        data: {
          fileBase64: base64,
        },
      });

      setResult(response);
    } catch (err) {
      console.error(err);
      alert('Error al escanear el PDF');
    } finally {
      setIsScanning(false);
    }
  };

  const handleNuevoEscaneo = () => {
    setResult(null);
    setFile(null);
  };

  return (
    <div className="flex flex-col space-y-4 p-4 md:space-y-6 md:p-0 md:m-[3rem] max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ScanText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Escanear PDF</h1>
        </div>
        <p className="text-muted-foreground">
          Subí un PDF bancario para importar automáticamente los movimientos.
        </p>
      </div>

      {/* Flujo pre-escaneo: Drag & Drop + Botón */}
      {!result && (
        <div className="space-y-4">
          <DragDrop onFileSelected={setFile} />
          <Button onClick={handleScan} disabled={!file || isScanning} size="lg">
            {isScanning ? 'Escaneando...' : 'Escanear PDF'}
          </Button>
        </div>
      )}

      {/* Post-escaneo: Cliente + Resultado */}
      {result && (
        <div className="space-y-6">
          {/* Barra: Cliente + Escanear otro */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1 max-w-sm space-y-2">
              <Label>Cliente</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                  >
                    {selectedClientId
                      ? clients.find((c: any) => c.id === selectedClientId)
                          ?.name
                      : 'Seleccionar cliente'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>

                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Buscar cliente..." />
                    <CommandEmpty>No se encontró ningún cliente.</CommandEmpty>

                    <CommandGroup>
                      {clients.map((client: any) => (
                        <CommandItem
                          key={client.id}
                          value={client.name}
                          onSelect={() => {
                            setSelectedClientId(client.id);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              selectedClientId === client.id
                                ? 'opacity-100'
                                : 'opacity-0'
                            )}
                          />
                          {client.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleNuevoEscaneo}
              className="shrink-0"
            >
              <FileUp className="h-4 w-4 mr-2" />
              Escanear otro PDF
            </Button>
          </div>

          {/* Preview PDF */}
          <RenderPdfInfo data={result} clientId={selectedClientId} />
        </div>
      )}
    </div>
  );
}
