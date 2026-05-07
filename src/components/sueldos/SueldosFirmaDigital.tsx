'use client';

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, X, Loader2, PenLine } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  getPayrollEmployerConfig,
  saveFirmaDigitalEmpleador,
} from '@/actions/sueldos';

interface SueldosFirmaDigitalProps {
  clientId: string;
  profileId: string;
}

export function SueldosFirmaDigital({
  clientId,
  profileId,
}: SueldosFirmaDigitalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['payroll-employer-config', clientId, profileId],
    queryFn: () => getPayrollEmployerConfig({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });

  const firmaUrl = config?.firmaEmpleadorUrl ?? null;

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('El archivo debe ser una imagen.');
      return;
    }
    setSaving(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await saveFirmaDigitalEmpleador({
        data: { clientId, profileId, firmaDigitalEmpleador: dataUrl },
      });
      await queryClient.invalidateQueries({
        queryKey: ['payroll-employer-config', clientId, profileId],
      });
      toast.success('Firma guardada.');
    } catch {
      toast.error('Error al guardar la firma.');
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      await saveFirmaDigitalEmpleador({
        data: { clientId, profileId, firmaDigitalEmpleador: null },
      });
      await queryClient.invalidateQueries({
        queryKey: ['payroll-employer-config', clientId, profileId],
      });
      toast.success('Firma eliminada.');
    } catch {
      toast.error('Error al eliminar la firma.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5" />
            Firma digital del empleador
          </CardTitle>
          <p className="text-sm text-[var(--arca-ink-3)]">
            La imagen se imprimirá sobre la línea &quot;Firma y sello del
            empleador&quot; en todos los recibos de esta empresa.
          </p>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          {firmaUrl ? (
            <>
              <div className="flex h-24 w-56 items-center justify-center rounded border border-border bg-[var(--arca-surface-2)] p-2">
                <img
                  src={firmaUrl}
                  alt="Firma del empleador"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Cambiar imagen
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRemove}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <X className="mr-2 h-4 w-4" />
                  )}
                  Eliminar firma
                </Button>
              </div>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Adjuntar imagen de firma
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
